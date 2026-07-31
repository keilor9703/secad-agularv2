import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  numberAttribute,
  output,
} from '@angular/core';

export type UiPaginationVariant = 'standard' | 'numbered' | 'minimal';

interface UiPaginationPageItem {
  id: string;
  kind: 'page' | 'ellipsis';
  page?: number;
}

@Component({
  selector: 'app-ui-pagination',
  standalone: true,
  templateUrl: './ui-pagination.component.html',
  styleUrl: './ui-pagination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiPaginationComponent {
  readonly total = input(0, { transform: numberAttribute });
  readonly page = input(1, { transform: numberAttribute });
  readonly pageSize = input(10, { transform: numberAttribute });
  readonly pageSizeOptions = input<readonly number[]>([5, 10, 20, 50]);
  readonly variant = input<UiPaginationVariant>('standard');
  readonly showSummary = input(true, { transform: booleanAttribute });
  /**
   * null conserva el comportamiento recomendado de cada variante:
   * standard lo muestra; numbered y minimal lo ocultan.
   */
  readonly showPageSize = input<boolean | null>(null);
  readonly maxVisiblePages = input(5, { transform: numberAttribute });
  readonly ariaLabel = input('Paginación');

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly normalizedPageSize = computed(() => Math.max(Number(this.pageSize()) || 1, 1));
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(Math.max(this.total(), 0) / this.normalizedPageSize())),
  );
  readonly currentPage = computed(() =>
    Math.min(Math.max(Number(this.page()) || 1, 1), this.totalPages()),
  );
  readonly startItem = computed(() =>
    this.total() <= 0 ? 0 : (this.currentPage() - 1) * this.normalizedPageSize() + 1,
  );
  readonly endItem = computed(() =>
    Math.min(this.currentPage() * this.normalizedPageSize(), Math.max(this.total(), 0)),
  );
  readonly isFirstPage = computed(() => this.currentPage() <= 1);
  readonly isLastPage = computed(() => this.currentPage() >= this.totalPages());
  readonly showPageSizeResolved = computed(
    () => this.showPageSize() ?? this.variant() === 'standard',
  );
  readonly pageSizeOptionsList = computed(() =>
    [...new Set([...this.pageSizeOptions(), this.normalizedPageSize()])]
      .filter((size) => Number.isFinite(size) && size > 0)
      .sort((left, right) => left - right),
  );
  readonly pageItems = computed<UiPaginationPageItem[]>(() => {
    const totalPages = this.totalPages();
    const currentPage = this.currentPage();
    const visibleLimit = Math.max(3, Math.floor(this.maxVisiblePages()) || 5);

    if (totalPages <= visibleLimit) {
      return Array.from({ length: totalPages }, (_, index) => ({
        id: `page-${index + 1}`,
        kind: 'page' as const,
        page: index + 1,
      }));
    }

    const pages = new Set<number>([1, totalPages, currentPage]);
    let offset = 1;

    while (pages.size < visibleLimit && offset < totalPages) {
      const previousPage = currentPage - offset;
      const nextPage = currentPage + offset;

      if (previousPage > 1 && pages.size < visibleLimit) {
        pages.add(previousPage);
      }

      if (nextPage < totalPages && pages.size < visibleLimit) {
        pages.add(nextPage);
      }

      offset += 1;
    }

    while (pages.size < visibleLimit) {
      const ordered = [...pages].sort((left, right) => left - right);
      const first = ordered[0];
      const last = ordered[ordered.length - 1];

      if (last < totalPages - 1) {
        pages.add(last + 1);
      } else if (first > 2) {
        pages.add(first - 1);
      } else {
        break;
      }
    }

    const orderedPages = [...pages].sort((left, right) => left - right);
    const items: UiPaginationPageItem[] = [];

    orderedPages.forEach((page, index) => {
      const previousPage = orderedPages[index - 1];

      if (previousPage && page - previousPage > 1) {
        items.push({ id: `ellipsis-${previousPage}-${page}`, kind: 'ellipsis' });
      }

      items.push({ id: `page-${page}`, kind: 'page', page });
    });

    return items;
  });

  goToPage(nextPage: number): void {
    const targetPage = Math.min(Math.max(nextPage, 1), this.totalPages());

    if (targetPage !== this.currentPage()) {
      this.pageChange.emit(targetPage);
    }
  }

  changePageSize(event: Event): void {
    const nextSize = Number((event.target as HTMLSelectElement).value);

    if (Number.isFinite(nextSize) && nextSize > 0 && nextSize !== this.normalizedPageSize()) {
      this.pageSizeChange.emit(nextSize);
    }
  }
}
