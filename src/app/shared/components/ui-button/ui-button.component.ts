import { CommonModule } from '@angular/common';
import { booleanAttribute, Component, EventEmitter, Input, Output } from '@angular/core';

export type UiButtonVariant = 'primary' | 'secondary' | 'info' | 'outline' | 'ghost' | 'warning' | 'danger';
export type UiButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-ui-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-button.component.html',
  styleUrls: ['./ui-button.component.scss']
})
export class UiButtonComponent {
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() variant: UiButtonVariant = 'secondary';
  @Input() size: UiButtonSize = 'md';
  @Input() icon = '';
  @Input() title = '';
  @Input() ariaLabel = '';
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) loading = false;
  @Input({ transform: booleanAttribute }) block = false;

  @Output() buttonClick = new EventEmitter<MouseEvent>();

  handleClick(event: MouseEvent): void {
    if (this.disabled || this.loading) {
      event.preventDefault();
      return;
    }

    this.buttonClick.emit(event);
  }

  get classes(): string[] {
    return [
      this.variant,
      this.size === 'md' ? '' : this.size,
      this.block ? 'block' : ''
    ].filter(Boolean);
  }
}
