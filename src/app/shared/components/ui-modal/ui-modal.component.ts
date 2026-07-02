import { CommonModule } from '@angular/common';
import { booleanAttribute, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-ui-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-modal.component.html',
  styleUrls: ['./ui-modal.component.scss']
})
export class UiModalComponent {
  @Input({ transform: booleanAttribute }) open = false;
  @Input({ transform: booleanAttribute }) closeOnBackdrop = true;
  @Input() title = '';
  @Input() icon = '';
  @Input() dialogClass = '';

  @Output() closeRequested = new EventEmitter<void>();

  requestClose(): void {
    this.closeRequested.emit();
  }

  handleBackdropClick(): void {
    if (this.closeOnBackdrop) {
      this.requestClose();
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.open) {
      this.requestClose();
    }
  }
}
