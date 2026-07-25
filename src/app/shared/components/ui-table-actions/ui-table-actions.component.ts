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

import { UiTableAction, UiTableActionEvent } from '../../interfaces/ui-table.interface';

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

  readonly actionClick = output<UiTableActionEvent<T>>();

  readonly isOpen = signal(false);
  readonly visibleActions = computed(() =>
    this.actions().filter((action) => this.isActionVisible(action)),
  );

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

    this.actionClick.emit({ actionId: action.id, row: this.row() });
    this.close();
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
