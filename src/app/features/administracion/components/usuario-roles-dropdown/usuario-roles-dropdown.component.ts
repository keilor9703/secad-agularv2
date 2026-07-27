import { CommonModule } from '@angular/common';
import { Component, HostListener, Input } from '@angular/core';

interface UsuarioRolDetalle {
  nombre: string;
  vencimiento: string;
}

@Component({
  selector: 'app-usuario-roles-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './usuario-roles-dropdown.component.html',
  styleUrls: ['./usuario-roles-dropdown.component.scss'],
})
export class UsuarioRolesDropdownComponent {
  @Input() roles = '';
  @Input() vencimientos = '';

  open = false;

  @HostListener('document:click')
  closeOnOutsideClick(): void {
    this.open = false;
  }

  get items(): UsuarioRolDetalle[] {
    const roles = this.splitList(this.roles);
    const vencimientos = this.splitList(this.vencimientos);

    if (roles.length === 0) {
      return [{ nombre: 'Sin rol', vencimiento: 'Sin fecha' }];
    }

    return roles.map((nombre, index) => ({
      nombre,
      vencimiento: vencimientos[index] || 'Sin fecha',
    }));
  }

  get hasMultipleRoles(): boolean {
    return this.items.length > 1;
  }

  get selectedLabel(): string {
    const first = this.items[0]?.nombre ?? 'Sin rol';

    return this.hasMultipleRoles ? `${this.items.length} roles asignados` : first;
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.open = !this.open;
  }

  private splitList(value: string): string[] {
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
