import { CdkTrapFocus } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

export type UiModalSize = 'sm' | 'md' | 'lg' | 'xl';
export type UiModalCloseReason = 'close-button' | 'backdrop' | 'escape';

export interface UiModalCloseEvent {
  readonly reason: UiModalCloseReason;
}

let nextModalId = 0;
let activeModalCount = 0;

@Component({
  selector: 'app-ui-modal',
  standalone: true,
  imports: [CdkTrapFocus],
  templateUrl: './ui-modal.component.html',
  styleUrl: './ui-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiModalComponent implements OnDestroy {
  readonly open = input(false, { transform: booleanAttribute });
  readonly closeOnBackdrop = input(true, { transform: booleanAttribute });
  readonly closeOnEscape = input(true, { transform: booleanAttribute });
  readonly showCloseButton = input(true, { transform: booleanAttribute });
  readonly title = input('');
  readonly subtitle = input('');
  readonly icon = input('');
  readonly ariaLabel = input('Ventana de diálogo');
  readonly dialogClass = input('');
  readonly size = input<UiModalSize>('md');

  readonly closeRequested = output<UiModalCloseEvent>();

  private readonly document = inject(DOCUMENT);
  private readonly modalId = `ui-modal-${++nextModalId}`;
  private ownsBodyLock = false;

  readonly titleId = `${this.modalId}-title`;
  readonly subtitleId = `${this.modalId}-subtitle`;
  readonly dialogClasses = computed(() => {
    const customClass = this.dialogClass().trim();

    return ['ui-modal__dialog', `ui-modal__dialog--${this.size()}`, customClass]
      .filter(Boolean)
      .join(' ');
  });

  constructor() {
    effect(() => this.syncOpenState(this.open()));
  }

  /**
   * Solicita al consumidor el cierre sin apropiarse de su estado.
   */
  requestClose(reason: UiModalCloseReason = 'close-button'): void {
    if (!this.open()) {
      return;
    }

    this.closeRequested.emit({ reason });
  }

  /**
   * Solo cierra cuando el clic ocurrió directamente sobre el fondo.
   */
  handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.closeOnBackdrop()) {
      this.requestClose('backdrop');
    }
  }

  /**
   * Permite cerrar con Escape mientras el foco permanece atrapado en el modal.
   */
  handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.closeOnEscape()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.requestClose('escape');
  }

  ngOnDestroy(): void {
    this.releaseBodyLock();
  }

  /**
   * Sincroniza foco y scroll con el estado controlado por el componente padre.
   */
  private syncOpenState(isOpen: boolean): void {
    if (isOpen) {
      this.acquireBodyLock();
      return;
    }

    this.releaseBodyLock();
  }

  /**
   * Mantiene un contador para soportar más de un modal sin liberar el body antes de tiempo.
   */
  private acquireBodyLock(): void {
    if (this.ownsBodyLock) {
      return;
    }

    this.ownsBodyLock = true;
    activeModalCount += 1;

    if (activeModalCount === 1) {
      this.document.body.classList.add('ui-modal-open');
    }
  }

  private releaseBodyLock(): void {
    if (!this.ownsBodyLock) {
      return;
    }

    this.ownsBodyLock = false;
    activeModalCount = Math.max(0, activeModalCount - 1);

    if (activeModalCount === 0) {
      this.document.body.classList.remove('ui-modal-open');
    }
  }
}
