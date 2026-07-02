import { CommonModule } from '@angular/common';
import { booleanAttribute, Component, EventEmitter, Input, numberAttribute, Output } from '@angular/core';

@Component({
  selector: 'app-ui-pagination',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-pagination.component.html',
  styleUrls: ['./ui-pagination.component.scss']
})
export class UiPaginationComponent {
  @Input({ transform: numberAttribute }) total = 0;
  @Input({ transform: numberAttribute }) page = 1;
  @Input({ transform: numberAttribute }) pageSize = 10;
  @Input({ transform: booleanAttribute }) showSummary = true;

  @Output() pageChange = new EventEmitter<number>();

  goToPage(nextPage: number): void {
    const targetPage = Math.min(Math.max(nextPage, 1), this.totalPages);
    if (targetPage !== this.page) {
      this.pageChange.emit(targetPage);
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / Math.max(this.pageSize, 1)));
  }

  get startItem(): number {
    if (this.total === 0) {
      return 0;
    }

    return (this.page - 1) * this.pageSize + 1;
  }

  get endItem(): number {
    return Math.min(this.page * this.pageSize, this.total);
  }
}
