import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { AlertService } from '../../../../shared/services/alert.service';
import { getApiErrorMessage } from '../../../../shared/utils/api-error-message.util';
import {
  DominioAdminFormComponent,
  DominioEditorMode,
} from '../../components/dominio-admin-form/dominio-admin-form.component';
import { DominioAdminTreeComponent } from '../../components/dominio-admin-tree/dominio-admin-tree.component';
import { DominioService, DtoDominio, DtoDominioRequest } from '../../services/dominio.service';

@Component({
  selector: 'app-dominio',
  standalone: true,
  imports: [UiButtonComponent, DominioAdminFormComponent, DominioAdminTreeComponent],
  templateUrl: './dominio-page.component.html',
  styleUrl: './dominio-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DominioPageComponent implements OnInit {
  private readonly dominioService = inject(DominioService);
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);
  private readonly destroyRef = inject(DestroyRef);
  private focusResetTimer: ReturnType<typeof setTimeout> | null = null;

  readonly minimized = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly processingDomainId = signal<number | null>(null);

  readonly items = signal<readonly DtoDominio[]>([]);
  readonly editorMode = signal<DominioEditorMode | null>(null);
  readonly editingItem = signal<DtoDominio | null>(null);
  readonly createParent = signal<DtoDominio | null>(null);
  readonly formResetVersion = signal(0);
  readonly focusedDomainId = signal<number | null>(null);

  readonly domainItems = computed(() => this.items().filter((item) => item.idDominio > 0));
  readonly totalCount = computed(() => this.domainItems().length);
  readonly activeCount = computed(
    () => this.domainItems().filter((item) => item.vigente === 1).length,
  );
  readonly rootCount = computed(
    () => this.domainItems().filter((item) => item.idPadre === 0).length,
  );
  readonly inlineChildEditorVisible = computed(
    () => this.editorMode() === 'create' && this.createParent() !== null,
  );
  readonly sideEditorVisible = computed(
    () => this.editorMode() !== null && !this.inlineChildEditorVisible(),
  );
  readonly selectedDomainId = computed(() => {
    if (this.editorMode() === 'edit') {
      return this.editingItem()?.idDominio ?? null;
    }

    return this.createParent()?.idDominio ?? null;
  });

  readonly parentOptions = computed<UiSelectOption<number>[]>(() => {
    const editing = this.editingItem();
    const excludedIds = editing
      ? this.collectDescendantIds(editing.idDominio, this.domainItems())
      : new Set<number>();

    if (editing) {
      excludedIds.add(editing.idDominio);
    }

    return [
      { value: 0, label: 'Dominio principal · sin padre' },
      ...this.domainItems()
        .filter((item) => !excludedIds.has(item.idDominio))
        .slice()
        .sort((a, b) =>
          this.domainPath(a).localeCompare(this.domainPath(b), 'es', {
            sensitivity: 'base',
          }),
        )
        .map((item) => ({
          value: item.idDominio,
          label: `${this.domainPath(item)} · ID ${item.idDominio}`,
        })),
    ];
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      if (this.focusResetTimer !== null) {
        clearTimeout(this.focusResetTimer);
      }
    });

    this.loadDomains();
  }

  toggleMinimize(): void {
    this.minimized.update((value) => !value);
  }

  startCreateRoot(): void {
    this.editingItem.set(null);
    this.createParent.set(null);
    this.editorMode.set('create');
    this.formResetVersion.update((version) => version + 1);
  }

  startCreateChild(parent: DtoDominio): void {
    this.editingItem.set(null);
    this.createParent.set({ ...parent });
    this.editorMode.set('create');
    this.formResetVersion.update((version) => version + 1);
  }

  edit(item: DtoDominio): void {
    this.createParent.set(null);
    this.editingItem.set({ ...item });
    this.editorMode.set('edit');
    this.formResetVersion.update((version) => version + 1);
  }

  closeEditor(): void {
    this.editorMode.set(null);
    this.editingItem.set(null);
    this.createParent.set(null);
    this.formResetVersion.update((version) => version + 1);
  }

  save(request: DtoDominioRequest): void {
    if (this.saving()) {
      return;
    }

    const editing = this.editingItem();
    const creating = this.editorMode() === 'create';
    const operation = editing
      ? this.dominioService.update(editing.idDominio, request)
      : this.dominioService.create(request);

    this.saving.set(true);
    operation
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              creating ? 'Crear dominio' : 'Editar dominio',
              response?.message || 'No fue posible guardar el dominio.',
            );
            return;
          }

          this.toast.success(
            creating ? 'Crear dominio' : 'Editar dominio',
            response.message ||
              (creating ? 'Dominio creado correctamente.' : 'Dominio actualizado correctamente.'),
          );

          const focusId = response.id > 0 ? response.id : (editing?.idDominio ?? null);
          this.closeEditor();
          this.loadDomains(focusId, creating ? request : null);
        },
        error: (error: unknown) => {
          this.toast.error(
            creating ? 'Crear dominio' : 'Editar dominio',
            getApiErrorMessage(error, 'Se presentó un error guardando el dominio.'),
          );
        },
      });
  }

  async changeState(item: DtoDominio): Promise<void> {
    if (this.processingDomainId() !== null) {
      return;
    }

    const activating = item.vigente !== 1;
    const confirmed = await this.alert.confirm({
      title: activating ? 'Activar dominio' : 'Desactivar dominio',
      message: `¿Desea ${activating ? 'activar' : 'desactivar'} “${item.descripcion}”?`,
      confirmText: activating ? 'Sí, activar' : 'Sí, desactivar',
      cancelText: 'No, cancelar',
      icon: 'question',
      intent: activating ? 'primary' : 'danger',
      focusCancel: true,
    });

    if (!confirmed) {
      return;
    }

    const nextState = activating ? 1 : 0;
    const request = this.toRequest(item, nextState);
    this.processingDomainId.set(item.idDominio);

    this.dominioService
      .update(item.idDominio, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.processingDomainId.set(null)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              'Estado del dominio',
              response?.message || 'No fue posible actualizar el estado.',
            );
            return;
          }

          this.items.update((items) =>
            items.map((current) =>
              current.idDominio === item.idDominio ? { ...current, vigente: nextState } : current,
            ),
          );
          this.toast.success(
            'Estado del dominio',
            response.message || 'Estado actualizado correctamente.',
          );
        },
        error: (error: unknown) => {
          this.toast.error(
            'Estado del dominio',
            getApiErrorMessage(error, 'Se presentó un error actualizando el estado.'),
          );
        },
      });
  }

  async delete(item: DtoDominio): Promise<void> {
    if (this.processingDomainId() !== null) {
      return;
    }

    const descendantCount = this.collectDescendantIds(item.idDominio, this.domainItems()).size;
    const relationshipWarning =
      descendantCount > 0
        ? ` Este dominio contiene ${descendantCount} ${
            descendantCount === 1 ? 'descendiente' : 'descendientes'
          }.`
        : '';
    const confirmed = await this.alert.confirmDelete(
      'Eliminar dominio',
      `¿Desea eliminar “${item.descripcion}”?${relationshipWarning} Esta acción no se puede deshacer.`,
      'Sí, eliminar',
    );

    if (!confirmed) {
      return;
    }

    this.processingDomainId.set(item.idDominio);
    this.dominioService
      .delete(item.idDominio)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.processingDomainId.set(null)),
      )
      .subscribe({
        next: (response) => {
          if (!response?.success) {
            this.toast.warning(
              'Eliminar dominio',
              response?.message || 'No fue posible eliminar el dominio.',
            );
            return;
          }

          if (
            this.editingItem()?.idDominio === item.idDominio ||
            this.createParent()?.idDominio === item.idDominio
          ) {
            this.closeEditor();
          }

          this.toast.success(
            'Eliminar dominio',
            response.message || 'Dominio eliminado correctamente.',
          );
          this.loadDomains();
        },
        error: (error: unknown) => {
          this.toast.error(
            'Eliminar dominio',
            getApiErrorMessage(error, 'Se presentó un error eliminando el dominio.'),
          );
        },
      });
  }

  private loadDomains(
    focusId: number | null = null,
    focusFallback: DtoDominioRequest | null = null,
  ): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.dominioService
      .getAll()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => {
          const normalized = [...(items ?? [])].sort(
            (a, b) =>
              a.idPadre - b.idPadre ||
              a.descripcion.localeCompare(b.descripcion, 'es', {
                sensitivity: 'base',
              }) ||
              a.idDominio - b.idDominio,
          );

          this.items.set(normalized);
          this.reconcileEditor(normalized);

          if (focusId !== null || focusFallback !== null) {
            this.scheduleFocus(this.resolveFocusId(normalized, focusId, focusFallback));
          }
        },
        error: (error: unknown) => {
          this.toast.error(
            'Administración de dominios',
            getApiErrorMessage(error, 'No fue posible cargar los dominios.'),
          );
        },
      });
  }

  private toRequest(item: DtoDominio, vigente = item.vigente): DtoDominioRequest {
    return {
      Descripcion: item.descripcion,
      IdPadre: item.idPadre,
      Vigente: vigente,
      Abreviatura: item.abreviatura || '',
      Observacion: item.observacion || '',
    };
  }

  private reconcileEditor(items: readonly DtoDominio[]): void {
    const editing = this.editingItem();
    if (editing) {
      const updated = items.find((item) => item.idDominio === editing.idDominio) ?? null;
      this.editingItem.set(updated);

      if (!updated) {
        this.closeEditor();
      }
    }

    const parent = this.createParent();
    if (parent) {
      const updated = items.find((item) => item.idDominio === parent.idDominio) ?? null;
      this.createParent.set(updated);

      if (!updated) {
        this.closeEditor();
      }
    }
  }

  private domainPath(item: DtoDominio): string {
    const byId = new Map(this.domainItems().map((domain) => [domain.idDominio, domain]));
    const path = [item.descripcion];
    const visited = new Set<number>([item.idDominio]);
    let parent = byId.get(item.idPadre);

    while (parent && !visited.has(parent.idDominio) && path.length < 8) {
      visited.add(parent.idDominio);
      path.unshift(parent.descripcion);
      parent = byId.get(parent.idPadre);
    }

    return path.join(' / ');
  }

  private collectDescendantIds(parentId: number, items: readonly DtoDominio[]): Set<number> {
    const descendants = new Set<number>();
    const pending = [parentId];

    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) {
        continue;
      }

      for (const item of items) {
        if (item.idPadre === current && !descendants.has(item.idDominio)) {
          descendants.add(item.idDominio);
          pending.push(item.idDominio);
        }
      }
    }

    return descendants;
  }

  private resolveFocusId(
    items: readonly DtoDominio[],
    requestedId: number | null,
    fallback: DtoDominioRequest | null,
  ): number | null {
    if (requestedId !== null && items.some((item) => item.idDominio === requestedId)) {
      return requestedId;
    }

    if (!fallback) {
      return null;
    }

    return (
      items
        .filter(
          (item) =>
            item.idPadre === fallback.IdPadre &&
            item.descripcion.trim() === fallback.Descripcion.trim(),
        )
        .sort((a, b) => b.idDominio - a.idDominio)[0]?.idDominio ?? null
    );
  }

  private scheduleFocus(domainId: number | null): void {
    if (this.focusResetTimer !== null) {
      clearTimeout(this.focusResetTimer);
      this.focusResetTimer = null;
    }

    this.focusedDomainId.set(null);

    if (domainId === null) {
      return;
    }

    queueMicrotask(() => {
      this.focusedDomainId.set(domainId);
      this.focusResetTimer = setTimeout(() => {
        if (this.focusedDomainId() === domainId) {
          this.focusedDomainId.set(null);
        }

        this.focusResetTimer = null;
      }, 1400);
    });
  }
}
