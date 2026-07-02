import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-ui-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-table.component.html',
  styleUrls: ['./ui-table.component.scss']
})
export class UiTableComponent {
  @Input() labelledBy: string | null = null;
}
