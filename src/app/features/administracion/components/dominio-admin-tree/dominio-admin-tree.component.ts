import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';

import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { DtoDominio, DtoDominioRequest } from '../../services/dominio.service';
import { DominioAdminFormComponent } from '../dominio-admin-form/dominio-admin-form.component';

interface DominioTreeRow {
  readonly item: DtoDominio;
  readonly depth: number;
  readonly indent: number;
  readonly mobileIndent: number;
  readonly hasChildren: boolean;
  readonly showsChildren: boolean;
  readonly childrenCount: number;
  readonly isLastSibling: boolean;
  readonly ancestorContinuationLevels: readonly number[];
}

@Component({
  selector: 'app-dominio-admin-tree',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiChipComponent,
    UiSearchInputComponent,
    UiSpinnerComponent,
    DominioAdminFormComponent,
  ],
  templateUrl: './dominio-admin-tree.component.html',
  styleUrl: './dominio-admin-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DominioAdminTreeComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private expansionInitialized = false;

  readonly items = input<readonly DtoDominio[]>([]);
  readonly loading = input(false);
  readonly processingId = input<number | null>(null);
  readonly selectedId = input<number | null>(null);
  readonly focusedId = input<number | null>(null);
  readonly inlineCreateParent = input<DtoDominio | null>(null);
  readonly inlineCreateResetVersion = input(0);
  readonly savingChild = input(false);

  readonly createChildRequested = output<DtoDominio>();
  readonly editRequested = output<DtoDominio>();
  readonly stateRequested = output<DtoDominio>();
  readonly deleteRequested = output<DtoDominio>();
  readonly saveChildRequested = output<DtoDominioRequest>();
  readonly closeChildRequested = output<void>();

  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchTerm = toSignal(
    this.searchControl.valueChanges.pipe(startWith(this.searchControl.getRawValue())),
    { initialValue: '' },
  );
  private readonly expandedIds = signal<ReadonlySet<number>>(new Set<number>());

  readonly totalItems = computed(() => this.items().filter((item) => item.idDominio > 0).length);
  readonly visibleRows = computed<readonly DominioTreeRow[]>(() => this.buildVisibleRows());

  constructor() {
    effect(() => {
      const items = this.items().filter((item) => item.idDominio > 0);
      const validIds = new Set(items.map((item) => item.idDominio));
      const current = this.expandedIds();
      const normalized = new Set([...current].filter((id) => validIds.has(id)));

      if (!this.expansionInitialized && items.length > 0) {
        const itemIds = new Set(items.map((item) => item.idDominio));
        const parentIds = new Set(items.map((item) => item.idPadre));

        for (const item of items) {
          const isRoot = item.idPadre === 0 || !itemIds.has(item.idPadre);
          if (isRoot && parentIds.has(item.idDominio)) {
            normalized.add(item.idDominio);
          }
        }

        this.expansionInitialized = true;
      }

      if (normalized.size !== current.size || [...normalized].some((id) => !current.has(id))) {
        this.expandedIds.set(normalized);
      }
    });

    effect(() => {
      const focusedId = this.focusedId();
      const items = this.items();

      if (focusedId === null || !items.some((item) => item.idDominio === focusedId)) {
        return;
      }

      this.expandAncestors(focusedId, items);
      this.scheduleReveal(focusedId);
    });

    /*
     * El formulario conserva su propia responsabilidad, pero se compone
     * visualmente debajo del padre elegido y se mantiene visible en móvil.
     */
    effect(() => {
      const parentId = this.inlineCreateParent()?.idDominio;

      if (parentId === undefined) {
        return;
      }

      queueMicrotask(() => this.revealInlineCreateForm(parentId));
    });
  }

  toggle(itemId: number): void {
    this.expandedIds.update((current) => {
      const next = new Set(current);

      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }

      return next;
    });
  }

  isExpanded(itemId: number): boolean {
    return this.expandedIds().has(itemId);
  }

  isProcessing(itemId: number): boolean {
    return this.processingId() === itemId;
  }

  private buildVisibleRows(): readonly DominioTreeRow[] {
    const source = this.items().filter((item) => item.idDominio > 0);
    const itemIds = new Set(source.map((item) => item.idDominio));
    const childrenByParent = new Map<number, DtoDominio[]>();

    for (const item of source) {
      const siblings = childrenByParent.get(item.idPadre) ?? [];
      siblings.push(item);
      childrenByParent.set(item.idPadre, siblings);
    }

    for (const siblings of childrenByParent.values()) {
      siblings.sort((a, b) =>
        a.descripcion.localeCompare(b.descripcion, 'es', { sensitivity: 'base' }),
      );
    }

    const roots = source
      .filter((item) => item.idPadre === 0 || !itemIds.has(item.idPadre))
      .sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es', { sensitivity: 'base' }));
    const term = this.normalize(this.searchTerm());
    const branchMatchCache = new Map<number, boolean>();

    const branchMatches = (item: DtoDominio, trail = new Set<number>()): boolean => {
      const cached = branchMatchCache.get(item.idDominio);
      if (cached !== undefined) {
        return cached;
      }

      if (trail.has(item.idDominio)) {
        return false;
      }

      const ownMatch = this.searchableText(item).includes(term);
      const nextTrail = new Set(trail).add(item.idDominio);
      const childMatch = (childrenByParent.get(item.idDominio) ?? []).some((child) =>
        branchMatches(child, nextTrail),
      );
      const matches = !term || ownMatch || childMatch;
      branchMatchCache.set(item.idDominio, matches);
      return matches;
    };

    const rows: DominioTreeRow[] = [];
    const visited = new Set<number>();

    const append = (
      item: DtoDominio,
      depth: number,
      isLastSibling: boolean,
      ancestorContinuationLevels: readonly number[],
    ): void => {
      if (visited.has(item.idDominio) || !branchMatches(item)) {
        return;
      }

      visited.add(item.idDominio);
      const children = childrenByParent.get(item.idDominio) ?? [];
      const visibleChildren = children.filter((child) => branchMatches(child));
      const showsChildren =
        visibleChildren.length > 0 && (term.length > 0 || this.expandedIds().has(item.idDominio));
      rows.push({
        item,
        depth,
        indent: Math.min(depth, 7) * 25,
        mobileIndent: Math.min(depth, 7) * 17,
        hasChildren: children.length > 0,
        showsChildren,
        childrenCount: children.length,
        isLastSibling,
        ancestorContinuationLevels,
      });

      if (showsChildren) {
        const childContinuationLevels = [...ancestorContinuationLevels];

        /*
         * Si este nodo tiene un hermano posterior, su guía vertical debe
         * atravesar todo el subárbol actual hasta llegar al siguiente hermano.
         */
        if (depth > 0 && !isLastSibling) {
          childContinuationLevels.push(depth - 1);
        }

        for (const [index, child] of visibleChildren.entries()) {
          append(child, depth + 1, index === visibleChildren.length - 1, childContinuationLevels);
        }
      }
    };

    const visibleRoots = roots.filter((root) => branchMatches(root));
    for (const [index, root] of visibleRoots.entries()) {
      append(root, 0, index === visibleRoots.length - 1, []);
    }

    return rows;
  }

  private searchableText(item: DtoDominio): string {
    return this.normalize(
      [
        item.idDominio,
        item.descripcion,
        item.abreviatura,
        item.observacion,
        item.vigente === 1 ? 'activo vigente' : 'inactivo',
      ].join(' '),
    );
  }

  private normalize(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim();
  }

  private expandAncestors(focusedId: number, items: readonly DtoDominio[]): void {
    const byId = new Map(items.map((item) => [item.idDominio, item]));
    const next = new Set(this.expandedIds());
    const visited = new Set<number>();
    let current = byId.get(focusedId);
    let changed = false;

    while (current && !visited.has(current.idDominio)) {
      visited.add(current.idDominio);
      const parent = byId.get(current.idPadre);

      if (!parent) {
        break;
      }

      if (!next.has(parent.idDominio)) {
        next.add(parent.idDominio);
        changed = true;
      }

      current = parent;
    }

    if (changed) {
      this.expandedIds.set(next);
    }
  }

  private scheduleReveal(itemId: number): void {
    if (typeof window === 'undefined') {
      queueMicrotask(() => this.reveal(itemId));
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => this.reveal(itemId));
    });
  }

  private reveal(itemId: number): void {
    const host = this.elementRef.nativeElement;
    const container = host.querySelector<HTMLElement>('.domain-tree-card__body');
    const item = host.querySelector<HTMLElement>(`[data-domain-id="${itemId}"]`);

    if (!container || !item) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const topOverflow = itemRect.top - containerRect.top;
    const bottomOverflow = itemRect.bottom - this.visibleBottom(containerRect);
    let nextScrollTop = container.scrollTop;

    if (bottomOverflow > 0) {
      nextScrollTop += bottomOverflow + 14;
    } else if (topOverflow < 0) {
      nextScrollTop += topOverflow - 14;
    }

    container.scrollTo({
      top: Math.max(0, nextScrollTop),
      behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
    });
    item.focus({ preventScroll: true });
  }

  private revealInlineCreateForm(parentId: number): void {
    const host = this.elementRef.nativeElement;
    const container = host.querySelector<HTMLElement>('.domain-tree-card__body');
    const formPanel = host.querySelector<HTMLElement>(
      `[data-domain-child-parent-id="${parentId}"]`,
    );

    if (!container || !formPanel) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const panelRect = formPanel.getBoundingClientRect();
    const topOverflow = panelRect.top - containerRect.top;
    const bottomOverflow = panelRect.bottom - this.visibleBottom(containerRect);
    let nextScrollTop = container.scrollTop;

    if (bottomOverflow > 0) {
      nextScrollTop += bottomOverflow + 12;
    } else if (topOverflow < 0) {
      nextScrollTop += topOverflow - 12;
    } else {
      return;
    }

    container.scrollTo({
      top: Math.max(0, nextScrollTop),
      behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  private visibleBottom(containerRect: DOMRect): number {
    if (typeof window === 'undefined' || window.innerWidth > 760) {
      return containerRect.bottom;
    }

    const configuredHeight = Number.parseFloat(
      window.getComputedStyle(this.document.documentElement).getPropertyValue('--footer-height'),
    );
    const footerHeight = Number.isFinite(configuredHeight) ? configuredHeight : 78;

    return Math.min(containerRect.bottom, window.innerHeight - footerHeight);
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
