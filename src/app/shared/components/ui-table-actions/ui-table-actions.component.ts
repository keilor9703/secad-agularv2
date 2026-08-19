import { CdkMenuModule } from '@angular/cdk/menu';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import {
  UiTableAction,
  UiTableActionDisplay,
  UiTableActionEvent,
  UiTableActionsPosition,
} from '../../interfaces/ui-table.interface';

let nextMenuId = 0;

@Component({
  selector: 'app-ui-table-actions',
  standalone: true,
  imports: [CdkMenuModule, OverlayModule],
  templateUrl: './ui-table-actions.component.html',
  styleUrl: './ui-table-actions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiTableActionsComponent<
  T extends object = Record<string, unknown>,
> implements OnDestroy {
  readonly actions = input.required<UiTableAction<T>[]>();
  readonly row = input.required<T>();
  readonly ariaLabel = input('Acciones disponibles');
  readonly displayMode = input<UiTableActionDisplay>('menu');
  /** Extremo de la tabla donde vive la columna de acciones. */
  readonly position = input<UiTableActionsPosition>('left');

  readonly actionClick = output<UiTableActionEvent<T>>();

  readonly isOpen = signal(false);
  readonly inlineActionsOpen = signal(false);
  /** Evita que :hover vuelva a mostrar acciones después de ejecutar una opción. */
  readonly inlineHoverSuppressed = signal(false);
  readonly visibleActions = computed(() =>
    this.actions().filter((action) => this.isActionVisible(action)),
  );
  readonly resolvedPosition = computed<'left' | 'right'>(() => {
    const position = this.position();

    return position === 'right' || position === 'end' ? 'right' : 'left';
  });

  readonly menuId = `ui-table-actions-menu-${nextMenuId++}`;
  readonly positions: ConnectedPosition[] = [
    // Principal: al lado derecho del botón.
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'top',
      offsetX: 4,
    },

    // Alternativa cuando falta espacio vertical.
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetX: 4,
    },

    // Respaldo: al lado izquierdo si no cabe a la derecha.
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'top',
      offsetX: -4,
    },

    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetX: -4,
    },
  ];
  /**
   * El menú también abre hacia el interior: desde la izquierda se proyecta
   * a la derecha y desde la derecha se proyecta a la izquierda.
   */
  readonly overlayPositions = computed<ConnectedPosition[]>(() =>
    this.resolvedPosition() === 'right'
      ? [this.positions[2], this.positions[3], this.positions[0], this.positions[1]]
      : this.positions,
  );

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menuItems = viewChildren<ElementRef<HTMLButtonElement>>('menuItem');

  private readonly isPinned = signal(false);
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private focusFirstItemOnAttach = false;

  ngOnDestroy(): void {
    this.cancelClose();
  }

  openFromPointer(): void {
    this.cancelClose();
    this.isOpen.set(true);
  }

  toggleFromTrigger(): void {
    this.cancelClose();

    if (this.isOpen() && this.isPinned()) {
      this.close();
      return;
    }

    this.isPinned.set(true);
    this.isOpen.set(true);
  }

  openFromKeyboard(event: Event): void {
    event.preventDefault();
    this.cancelClose();
    this.focusFirstItemOnAttach = true;
    this.isPinned.set(true);

    if (this.isOpen()) {
      this.focusFirstEnabledItem();
      return;
    }

    this.isOpen.set(true);
  }

  onOverlayAttached(): void {
    if (!this.focusFirstItemOnAttach) {
      return;
    }

    this.focusFirstItemOnAttach = false;
    this.focusFirstEnabledItem();
  }

  onOutsidePointer(event: MouseEvent): void {
    const target = event.target as Node | null;

    if (target && this.trigger()?.nativeElement.contains(target)) {
      return;
    }

    this.close();
  }

  onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
      return;
    }

    if (event.key === 'Tab') {
      this.close();
    }
  }

  scheduleClose(): void {
    if (this.isPinned()) {
      return;
    }

    this.cancelClose();
    this.closeTimer = setTimeout(() => this.close(), 160);
  }

  cancelClose(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  selectAction(action: UiTableAction<T>): void {
    if (this.isActionDisabled(action)) {
      return;
    }

    /*
     * Cerramos antes de emitir. El consumidor puede abrir un modal o cambiar
     * la fila de forma síncrona y no debe dejar controles flotando debajo.
     */
    this.inlineActionsOpen.set(false);
    this.inlineHoverSuppressed.set(this.displayMode() === 'row-hover');
    this.close();
    this.actionClick.emit({ actionId: action.id, row: this.row() });
  }

  toggleInlineActions(event: Event): void {
    event.stopPropagation();
    this.inlineHoverSuppressed.set(false);
    this.inlineActionsOpen.update((open) => !open);
  }

  releaseInlineHover(): void {
    this.inlineHoverSuppressed.set(false);
  }

  closeInlineActions(event: FocusEvent): void {
    const currentTarget = event.currentTarget as HTMLElement;
    const nextTarget = event.relatedTarget as Node | null;

    if (!nextTarget || !currentTarget.contains(nextTarget)) {
      this.inlineActionsOpen.set(false);
    }
  }

  close(restoreFocus = false): void {
    this.cancelClose();
    this.focusFirstItemOnAttach = false;
    this.isPinned.set(false);
    this.isOpen.set(false);

    if (restoreFocus) {
      queueMicrotask(() => this.trigger()?.nativeElement.focus());
    }
  }

  isActionDisabled(action: UiTableAction<T>): boolean {
    return action.disabled ? action.disabled(this.row()) : false;
  }

  getActionClass(action: UiTableAction<T>): string {
    return `ui-table-action-menu__item ui-table-action-menu__item--${
      action.variant ?? 'secondary'
    }`;
  }

  getInlineActionClass(action: UiTableAction<T>): string {
    return `ui-table-inline-action ui-table-inline-action--${action.variant ?? 'secondary'}`;
  }

  private isActionVisible(action: UiTableAction<T>): boolean {
    return action.visible ? action.visible(this.row()) : true;
  }

  private focusFirstEnabledItem(): void {
    queueMicrotask(() => {
      this.menuItems()
        .find((item) => !item.nativeElement.disabled)
        ?.nativeElement.focus();
    });
  }
}
