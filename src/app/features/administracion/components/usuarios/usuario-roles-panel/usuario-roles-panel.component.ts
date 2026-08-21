import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  signal,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../../shared/components/ui-chip/ui-chip.component';
import { UiDateTimePickerComponent } from '../../../../../shared/components/ui-date-time-picker/ui-date-time-picker.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiModalComponent } from '../../../../../shared/components/ui-modal/ui-modal.component';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiTableComponent } from '../../../../../shared/components/ui-table/ui-table.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import {
  UiTableAction,
  UiTableActionDisplay,
  UiTableActionEvent,
  UiTableActionsPosition,
  UiTableBadge,
  UiTableColumn,
  UiTableVariant,
} from '../../../../../shared/interfaces/ui-table.interface';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';
import {
  RemoveRoleCommand,
  RolEstado,
  UserRole,
} from '../../../interfaces/usuario-admin-view.interface';
import { DtoRolCatalogo } from '../../../services/usuario-admin.service';
import { UsuarioRoleRemovalModalComponent } from '../usuario-role-removal-modal/usuario-role-removal-modal.component';

@Component({
  selector: 'app-usuario-roles-panel',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiChipComponent,
    UiDateTimePickerComponent,
    UiInputComponent,
    UiModalComponent,
    UiSectionHeaderComponent,
    UiSelectComponent,
    UiTableComponent,
    UsuarioRoleRemovalModalComponent,
  ],
  templateUrl: './usuario-roles-panel.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./usuario-roles-panel.component.scss'],
})
export class UsuarioRolesPanelComponent implements OnChanges {
  @Input() roles: UserRole[] = [];
  @Input() rolesCatalogo: DtoRolCatalogo[] = [];
  @Input() rolForm!: FormGroup;
  @Input() showAddRoleForm = false;
  @Input() editingRole: UserRole | null = null;
  @Input() savingRole = false;
  @Input() deletingRoleId: number | null = null;
  @Input() roleDeleteRevision = 0;
  @Input() superAdministradorRolId = 1;

  @Output() agregarRol = new EventEmitter<void>();
  @Output() guardarRol = new EventEmitter<void>();
  @Output() cancelarRol = new EventEmitter<void>();
  @Output() editarRol = new EventEmitter<UserRole>();
  @Output() eliminarRol = new EventEmitter<RemoveRoleCommand>();

  readonly rolePendingRemoval = signal<UserRole | null>(null);

  /**
   * Configuración visual de esta tabla:
   * - plain: encabezado limpio, sin relleno institucional.
   * - row-hover: botones flotantes al pasar o enfocar la fila.
   * - left: acciones fijas en el extremo izquierdo.
   */
  readonly roleTableVariant = signal<UiTableVariant>('plain');
  readonly roleActionDisplay = signal<UiTableActionDisplay>('row-hover');
  readonly roleActionsPosition = signal<UiTableActionsPosition>('right');

  /**
   * Límite estable que recibe el picker. Se actualiza al abrir el modal para no
   * reutilizar la fecha con la que se creó originalmente la página.
   */
  readonly minimumRoleEndDate = signal(this.toStableLocalDate(new Date()));

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['roleDeleteRevision'] &&
      !changes['roleDeleteRevision'].firstChange &&
      changes['roleDeleteRevision'].currentValue > changes['roleDeleteRevision'].previousValue
    ) {
      this.rolePendingRemoval.set(null);
    }

    if (
      changes['showAddRoleForm']?.currentValue === true ||
      (this.showAddRoleForm && changes['editingRole'])
    ) {
      this.minimumRoleEndDate.set(this.resolveMinimumRoleEndDate());
      this.restoreEditingEndDateAfterRender();
    }
  }

  readonly roleColumns: UiTableColumn<UserRole>[] = [
    {
      key: 'nombre',
      label: 'Rol',
      sortable: true,
      width: '20%',
      fontWeight: 'semibold',
    },
    {
      key: 'estado',
      label: 'Estado',
      align: 'center',
      width: '20%',
      badge: (role) => this.statusBadge(role.estado),
    },
    {
      key: 'fechaExpiracion',
      label: 'Fecha expiración',
      width: '20%',
      value: (role) => role.fechaExpiracion || 'Sin fecha',
    },
    {
      key: 'justificacion',
      label: 'Justificación',
      value: (role) => role.justificacion || 'Sin justificación',
    },
  ];

  private statusBadge(status: RolEstado): UiTableBadge {
    if (status === 'Vigente') {
      return {
        text: status,
        variant: 'success',
        appearance: 'outline',
        size: 'xs',
        icon: 'fa-solid fa-check',
        uppercase: true,
      };
    }

    if (status === 'Vencido') {
      return {
        text: status,
        variant: 'primary',
        appearance: 'outline',
        size: 'xs',
        icon: 'fa-solid fa-triangle-exclamation',
        uppercase: true,
      };
    }

    return {
      text: status,
      variant: 'secondary',
      appearance: 'outline',
      size: 'xs',
      icon: 'fa-solid fa-ban',
      uppercase: true,
    };
  }

  readonly roleActions: UiTableAction<UserRole>[] = [
    {
      id: 'edit',
      label: 'Editar',
      icon: 'fa-solid fa-pen-to-square',
      description: 'Actualizar vigencia y justificación',
      variant: 'info',
    },
    {
      id: 'delete',
      label: 'Retirar rol',
      icon: 'fa-solid fa-trash',
      description: 'Retirar el rol asignado',
      variant: 'danger',
      disabled: (role) => this.deletingRoleId === role.id,
    },
  ];

  get rolOptions(): UiSelectOption<number>[] {
    return this.rolesCatalogo.map((role) => ({
      label: role.nombre || `Rol ${role.id}`,
      value: role.id,
    }));
  }

  get roleModalTitle(): string {
    return this.editingRole ? 'Editar rol asignado' : 'Asignar rol';
  }

  get roleModalSubtitle(): string {
    return this.editingRole
      ? 'Actualiza la vigencia y la justificación del rol seleccionado.'
      : 'Selecciona el rol, define su vigencia y registra la justificación.';
  }

  handleRoleAction(event: UiTableActionEvent<UserRole>): void {
    if (event.actionId === 'edit') {
      this.editarRol.emit(event.row);
      return;
    }

    if (event.actionId === 'delete') {
      this.rolePendingRemoval.set(event.row);
    }
  }

  closeRemovalModal(): void {
    if (this.deletingRoleId === null) {
      this.rolePendingRemoval.set(null);
    }
  }

  confirmRoleRemoval(observacion: string): void {
    const role = this.rolePendingRemoval();
    if (!role || this.deletingRoleId !== null) {
      return;
    }

    this.eliminarRol.emit({ role, observacion });
  }

  getRoleError(fieldName: string): string {
    const control = this.rolForm?.get(fieldName) ?? null;

    if (fieldName === 'fechaFin' && control?.errors?.['minDate']) {
      return 'Seleccione una fecha igual o posterior al día actual.';
    }

    return getFormErrorMessage(control);
  }

  /** Genera YYYY-MM-DD con calendario local y evita desplazamientos por UTC. */
  private toStableLocalDate(date: Date): string {
    const pad = (value: number): string => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  /**
   * Al crear exige desde hoy. Al editar conserva como límite la fecha ya
   * almacenada cuando es anterior, para que Flatpickr pueda representarla.
   */
  private resolveMinimumRoleEndDate(): string {
    const today = this.toStableLocalDate(new Date());
    const persistedDate = this.normalizeModelDate(this.editingRole?.fechaExpiracion ?? '');

    if (!persistedDate) {
      return today;
    }

    return persistedDate < today ? persistedDate : today;
  }

  /**
   * El contenido del modal se crea con @if. La reposición en microtarea ocurre
   * después de proyectar el CVA y evita que su primer writeValue vacío gane la
   * carrera al reset efectuado por el formulario padre.
   */
  private restoreEditingEndDateAfterRender(): void {
    const roleBeingEdited = this.editingRole;
    const persistedDate = this.normalizeModelDate(roleBeingEdited?.fechaExpiracion ?? '');

    if (!roleBeingEdited || !persistedDate) {
      return;
    }

    queueMicrotask(() => {
      if (!this.showAddRoleForm || this.editingRole?.id !== roleBeingEdited.id) {
        return;
      }

      const dateControl = this.rolForm?.get('fechaFin');
      if (!dateControl || dateControl.value === persistedDate) {
        return;
      }

      dateControl.setValue(persistedDate, { emitEvent: false });
      dateControl.updateValueAndValidity({ emitEvent: false });
    });
  }

  /** Convierte las presentaciones habituales del API al modelo YYYY-MM-DD. */
  private normalizeModelDate(raw: string): string {
    const value = String(raw ?? '').trim();
    if (!value) {
      return '';
    }

    const onlyDate = value.includes('T') ? value.split('T')[0] : value.split(' ')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(onlyDate)) {
      return onlyDate;
    }

    const dayFirstMatch = onlyDate.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (!dayFirstMatch) {
      return '';
    }

    const [, day, month, year] = dayFirstMatch;
    return `${year}-${month}-${day}`;
  }
}
