import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  DtoLineaMando,
  DtoLineaMandoRequest,
  LineaMandoService,
} from '../../../../core/services/linea-mando.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { LineaMandoFormComponent } from '../../components/linea-mando-form/linea-mando-form.component';
import { LineaMandoListComponent } from '../../components/linea-mando-list/linea-mando-list.component';
import { UsuarioAdminService } from '../../services/usuario-admin.service';

@Component({
  selector: 'app-linea-mando',
  standalone: true,
  imports: [
    LineaMandoFormComponent,
    LineaMandoListComponent,
    UiChipComponent,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
  ],
  templateUrl: './linea-mando-page.component.html',
  styleUrl: './linea-mando-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineaMandoPageComponent implements OnInit {
  private readonly documentRef = inject(DOCUMENT);
  private readonly lineaMandoService = inject(LineaMandoService);
  private readonly usuarioAdminService = inject(UsuarioAdminService);
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);

  readonly records = signal<readonly DtoLineaMando[]>([]);
  readonly editorValue = signal<DtoLineaMandoRequest | null>(null);
  readonly editingId = signal<number | null>(null);
  readonly previewOrder = signal<number | null>(null);
  readonly loading = signal(false);
  readonly searching = signal(false);
  readonly saving = signal(false);
  readonly processingId = signal<number | null>(null);
  readonly headerMinimized = signal(false);

  readonly isEditing = computed(() => this.editingId() !== null);
  readonly activeCount = computed(() => this.records().filter((item) => item.vigente === 1).length);
  readonly inactiveCount = computed(() => this.records().length - this.activeCount());
  // Los retirados conservan su último ORDEN histórico; no deben ampliar el
  // rango disponible al preparar un integrante nuevo.
  readonly nextOrder = computed(() => this.activeCount() + 1);

  ngOnInit(): void {
    void this.loadCommandLine();
  }

  /** Obtiene la estructura completa y mantiene el estado de carga en un único lugar. */
  async loadCommandLine(): Promise<void> {
    this.loading.set(true);

    try {
      const response = await firstValueFrom(this.lineaMandoService.getAll());
      this.records.set(response ?? []);
    } catch {
      this.toast.error('Línea de mando', 'No fue posible cargar la estructura configurada.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Consulta los datos institucionales y prepara un borrador nuevo para el editor. */
  async searchEmployee(identification: string): Promise<void> {
    this.searching.set(true);

    try {
      const response = await firstValueFrom(
        this.usuarioAdminService.consultarUsuarioPorIdentificacion(identification, 'LINEA_MANDO'),
      );
      const employee = response.funcionario;

      if (!employee?.nombres) {
        this.toast.warning('Consulta', 'No se encontró un funcionario con esa identificación.');
        return;
      }

      if (employee.activo === false) {
        this.toast.warning('Consulta', 'El funcionario se encuentra inactivo en el sistema.');
        return;
      }

      this.editingId.set(null);
      this.previewOrder.set(null);
      this.editorValue.set({
        identificacion: identification.trim(),
        nombre: employee.nombres ?? '',
        apellidos: employee.apellidos ?? '',
        grado: employee.nombreGrado ?? '',
        cargo: employee.cargo ?? '',
        peso: '',
        unidad: employee.dependencia ?? '',
        fotoBase64: response.fotoBase64 ?? null,
        orden: this.nextOrder(),
      });
      this.toast.success('Funcionario encontrado', 'Los datos institucionales fueron cargados.');
    } catch {
      this.toast.error('Consulta', 'No fue posible consultar la información del funcionario.');
    } finally {
      this.searching.set(false);
    }
  }

  /** Abre una copia del registro en el editor sin mutar la colección visible. */
  editRecord(item: DtoLineaMando): void {
    this.editingId.set(item.idLineaMando);
    this.previewOrder.set(item.orden);
    this.editorValue.set(this.toRequest(item));

    this.documentRef.defaultView?.requestAnimationFrame(() => {
      this.documentRef
        .getElementById('linea-mando-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /** Delega el reordenamiento atómico al backend para no desactivar integrantes por coincidencia de cargo. */
  async saveRecord(request: DtoLineaMandoRequest): Promise<void> {
    await this.persistRecord(request);
  }

  /** Solicita confirmación antes de retirar un integrante activo. */
  async removeRecord(item: DtoLineaMando): Promise<void> {
    const confirmed = await this.alert.confirmDelete(
      'Retirar integrante',
      `${this.fullName(item)} dejará de aparecer como integrante activo de la línea de mando.`,
      'Sí, retirar',
    );

    if (!confirmed) {
      return;
    }

    this.processingId.set(item.idLineaMando);

    try {
      const response = await firstValueFrom(this.lineaMandoService.delete(item.idLineaMando));

      if (!response.success) {
        this.toast.warning('Retirar integrante', response.message);
        return;
      }

      if (this.editingId() === item.idLineaMando) {
        this.closeEditor();
      }

      this.toast.success('Integrante retirado', response.message);
      await this.loadCommandLine();
    } catch {
      this.toast.error('Retirar integrante', 'No fue posible actualizar el estado del registro.');
    } finally {
      this.processingId.set(null);
    }
  }

  /** Reactiva un registro histórico y deja que el backend recalcule su posición válida. */
  async activateRecord(item: DtoLineaMando): Promise<void> {
    const confirmed = await this.alert.confirm({
      title: 'Reactivar integrante',
      message: `${this.fullName(item)} volverá a la estructura visible de la línea de mando.`,
      confirmText: 'Sí, reactivar',
      icon: 'question',
      intent: 'primary',
    });

    if (!confirmed) {
      return;
    }

    this.processingId.set(item.idLineaMando);

    try {
      const response = await firstValueFrom(
        this.lineaMandoService.setVigente(item.idLineaMando, 1),
      );

      if (!response.success) {
        this.toast.warning('Reactivar integrante', response.message);
        return;
      }

      this.toast.success('Integrante reactivado', response.message);
      await this.loadCommandLine();
    } catch {
      this.toast.error('Reactivar integrante', 'No fue posible reactivar el registro.');
    } finally {
      this.processingId.set(null);
    }
  }

  /** Elimina definitivamente solo un registro ya retirado, después de una confirmación explícita. */
  async permanentlyDeleteRecord(item: DtoLineaMando): Promise<void> {
    const confirmed = await this.alert.confirmDelete(
      'Eliminar definitivamente',
      `${this.fullName(item)} se eliminará de la tabla. Esta acción no se puede deshacer y su auditoría permanecerá disponible.`,
      'Sí, eliminar definitivamente',
    );

    if (!confirmed) {
      return;
    }

    this.processingId.set(item.idLineaMando);

    try {
      const response = await firstValueFrom(
        this.lineaMandoService.deletePermanently(item.idLineaMando),
      );

      if (!response.success) {
        this.toast.warning('Eliminar definitivamente', response.message);
        return;
      }

      if (this.editingId() === item.idLineaMando) {
        this.closeEditor();
      }

      this.toast.success('Registro eliminado', response.message);
      await this.loadCommandLine();
    } catch {
      this.toast.error('Eliminar definitivamente', 'No fue posible eliminar el registro.');
    } finally {
      this.processingId.set(null);
    }
  }

  /** Limpia el borrador y devuelve el editor al modo de consulta. */
  closeEditor(): void {
    this.editorValue.set(null);
    this.editingId.set(null);
    this.previewOrder.set(null);
  }

  /** Mueve solo la representación seleccionada; la persistencia ocurre al guardar. */
  previewPosition(order: number | null): void {
    this.previewOrder.set(order);
  }

  /** Presenta las validaciones locales con el canal global ya usado por la plantilla. */
  showFormWarning(message: string): void {
    this.toast.warning('Formulario', message);
  }

  private async persistRecord(request: DtoLineaMandoRequest): Promise<void> {
    this.saving.set(true);

    try {
      const editingId = this.editingId();
      const response = await firstValueFrom(
        editingId === null
          ? this.lineaMandoService.create(request)
          : this.lineaMandoService.update(editingId, request),
      );

      if (!response.success) {
        this.toast.warning('Guardar integrante', response.message);
        return;
      }

      this.toast.success(
        editingId === null ? 'Integrante agregado' : 'Integrante actualizado',
        response.message,
      );
      this.closeEditor();
      await this.loadCommandLine();
    } catch {
      this.toast.error('Guardar integrante', 'No fue posible guardar los cambios realizados.');
    } finally {
      this.saving.set(false);
    }
  }

  private toRequest(item: DtoLineaMando): DtoLineaMandoRequest {
    return {
      identificacion: item.identificacion,
      nombre: item.nombre,
      apellidos: item.apellidos,
      grado: item.grado,
      cargo: item.cargo,
      peso: item.peso,
      unidad: item.unidad,
      fotoBase64: item.fotoBase64,
      orden: item.orden,
    };
  }

  private fullName(item: DtoLineaMando): string {
    return [item.grado, item.nombre, item.apellidos].filter(Boolean).join(' ');
  }
}
