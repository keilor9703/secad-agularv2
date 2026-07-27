import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';

interface UsuarioRolDetalle {
  readonly nombre: string;
  readonly vencimiento: string;
}

const MOBILE_VIEWPORT_MAX_WIDTH = 768;

const DESKTOP_OVERLAY_POSITIONS: ConnectedPosition[] = [
  {
    originX: 'start',
    originY: 'bottom',
    overlayX: 'start',
    overlayY: 'top',
    offsetY: 5,
  },
  {
    originX: 'end',
    originY: 'bottom',
    overlayX: 'end',
    overlayY: 'top',
    offsetY: 5,
  },
  {
    originX: 'start',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'bottom',
    offsetY: -5,
  },
  {
    originX: 'end',
    originY: 'top',
    overlayX: 'end',
    overlayY: 'bottom',
    offsetY: -5,
  },
];

/*
 * En móvil el panel solo puede ubicarse sobre el control.
 * Así nunca invade la navegación fija de la parte inferior.
 */
const MOBILE_OVERLAY_POSITIONS: ConnectedPosition[] = [
  {
    originX: 'start',
    originY: 'top',
    overlayX: 'start',
    overlayY: 'bottom',
    offsetY: -5,
  },
  {
    originX: 'end',
    originY: 'top',
    overlayX: 'end',
    overlayY: 'bottom',
    offsetY: -5,
  },
];

let nextRolesDropdownId = 0;

@Component({
  selector: 'app-usuario-roles-dropdown',
  standalone: true,
  imports: [OverlayModule],
  templateUrl: './usuario-roles-dropdown.component.html',
  styleUrl: './usuario-roles-dropdown.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuarioRolesDropdownComponent {
  readonly roles = input('');
  readonly vencimientos = input('');

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly generatedId = `usuario-roles-${++nextRolesDropdownId}`;

  readonly opened = signal(false);
  readonly panelWidth = signal(320);
  readonly positions = signal<ConnectedPosition[]>(DESKTOP_OVERLAY_POSITIONS);

  readonly items = computed<UsuarioRolDetalle[]>(() => {
    const roles = this.splitList(this.roles());
    const vencimientos = this.splitList(this.vencimientos());

    if (roles.length === 0) {
      return [{ nombre: 'Sin rol', vencimiento: 'Sin fecha' }];
    }

    return roles.map((nombre, index) => ({
      nombre,
      vencimiento: vencimientos[index] || 'Sin fecha',
    }));
  });

  readonly selectedLabel = computed(() => {
    const items = this.items();
    const firstRole = items.at(0)?.nombre ?? 'Sin rol';

    return items.length > 1 ? `${items.length} roles asignados` : firstRole;
  });

  readonly triggerId = `${this.generatedId}-trigger`;
  readonly panelId = `${this.generatedId}-panel`;
  readonly panelTitleId = `${this.generatedId}-title`;

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.close(true);
  }

  @HostListener('window:resize')
  updateOverlayOnResize(): void {
    if (this.opened()) {
      this.updateOverlayConfiguration();
    }
  }

  toggle(): void {
    if (this.opened()) {
      this.close();
      return;
    }

    this.open();
  }

  open(): void {
    this.updateOverlayConfiguration();
    this.opened.set(true);
  }

  private updateOverlayConfiguration(): void {
    const triggerWidth = this.trigger().nativeElement.getBoundingClientRect().width;
    const viewportWidth = typeof window === 'undefined' ? 440 : window.innerWidth;
    const maximumWidth = Math.min(440, Math.max(viewportWidth - 16, 0));
    const minimumWidth = Math.min(300, maximumWidth);

    this.panelWidth.set(Math.max(minimumWidth, Math.min(triggerWidth, maximumWidth)));
    this.positions.set(
      viewportWidth <= MOBILE_VIEWPORT_MAX_WIDTH
        ? MOBILE_OVERLAY_POSITIONS
        : DESKTOP_OVERLAY_POSITIONS,
    );
  }

  close(restoreFocus = false): void {
    if (!this.opened()) {
      return;
    }

    this.opened.set(false);

    if (restoreFocus) {
      queueMicrotask(() => this.trigger().nativeElement.focus());
    }
  }

  onOverlayAttached(): void {
    queueMicrotask(() => this.panel()?.nativeElement.focus({ preventScroll: true }));
  }

  private splitList(value: string): string[] {
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
