import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { UiSearchInputComponent } from '../../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiTableComponent } from '../../../../../shared/components/ui-table/ui-table.component';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableBadge,
  UiTableColumn,
  UiTableRowAppearanceResolver,
} from '../../../../../shared/interfaces/ui-table.interface';
import { UiFormControlSize } from '../../../../../shared/models/ui-form-control-size.model';
import { RolAdminItem } from '../../../services/roles-admin.service';

@Component({
  selector: 'app-role-admin-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiSearchInputComponent,
    UiSectionHeaderComponent,
    UiTableComponent,
  ],
  templateUrl: './role-admin-list.component.html',
  styleUrl: './role-admin-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleAdminListComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly roles = input<readonly RolAdminItem[]>([]);
  readonly loading = input(false);
  readonly selectedRoleId = input<number | null>(null);
  readonly editingRoleId = input<number | null>(null);
  readonly processingRoleId = input<number | null>(null);

  readonly editRequested = output<RolAdminItem>();
  readonly permissionsRequested = output<RolAdminItem>();
  readonly stateRequested = output<RolAdminItem>();

  private readonly searchTerm = signal('');
  readonly searchForm = this.fb.group({ search: [''] });
  readonly tableRows = computed<RolAdminItem[]>(() => {
    const term = this.normalize(this.searchTerm());
    if (!term) {
      return [...this.roles()];
    }

    return this.roles().filter((role) => {
      const name = this.normalize(role.nombre ?? '');
      return name.includes(term) || String(role.id).includes(term);
    });
  });

  /** El buscador usa la misma escala compacta del listado de Usuarios. */
  readonly compactSearchSize: UiFormControlSize = {
    height: '36px',
    minHeight: '34px',
    maxHeight: '40px',
    width: '280px',
    minWidth: '190px',
    maxWidth: '100%',
    mobile: {
      height: '38px',
      minHeight: '36px',
      maxHeight: '42px',
      width: '100%',
      minWidth: '0px',
      maxWidth: '100%',
    },
  };

  readonly columns: UiTableColumn<RolAdminItem>[] = [
    {
      key: 'id',
      label: 'ID',
      sortable: true,
      align: 'center',
      width: '58px',
      fontWeight: 'bold',
    },
    {
      key: 'nombre',
      label: 'Nombre del rol',
      sortable: true,
      fontWeight: 'semibold',
      value: (role) => role.nombre?.trim() || `Rol ${role.id}`,
    },
    {
      key: 'vigente',
      label: 'Estado',
      align: 'center',
      width: '104px',
      badge: (role) => this.statusBadge(role),
    },
  ];

  readonly actions: UiTableAction<RolAdminItem>[] = [
    {
      id: 'permissions',
      label: 'Administrar permisos',
      title: 'Administrar permisos',
      description: 'Consultar y modificar los menús asignados',
      icon: 'fa-solid fa-key',
      variant: 'info',
    },
    {
      id: 'edit',
      label: 'Editar rol',
      title: 'Editar rol',
      description: 'Actualizar nombre y disponibilidad',
      icon: 'fa-solid fa-pen-to-square',
      variant: 'secondary',
    },
    {
      id: 'activate',
      label: 'Activar rol',
      title: 'Activar rol',
      icon: 'fa-solid fa-play',
      variant: 'primary',
      visible: (role) => role.vigente !== 1,
      disabled: (role) => this.processingRoleId() === role.id,
    },
    {
      id: 'deactivate',
      label: 'Desactivar rol',
      title: 'Desactivar rol',
      icon: 'fa-solid fa-ban',
      variant: 'danger',
      visible: (role) => role.vigente === 1,
      disabled: (role) => this.processingRoleId() === role.id,
    },
  ];

  /** Refuerza visualmente el rol que alimenta el panel de permisos o el editor. */
  readonly rowAppearance: UiTableRowAppearanceResolver<RolAdminItem> = (role) => {
    if (role.id === this.editingRoleId()) {
      return {
        selected: true,
        textColor: '#003b73',
        darkTextColor: '#d9f5ff',
        backgroundColor: '#eff9fc',
        darkBackgroundColor: '#20394a',
        accentColor: '#c8ff00',
        fontWeight: 'bold',
      };
    }

    if (role.id === this.selectedRoleId()) {
      return {
        selected: true,
        textColor: '#174f77',
        darkTextColor: '#b9e7f3',
        backgroundColor: '#eaf7fb',
        darkBackgroundColor: '#22384a',
        accentColor: '#08a6cb',
        fontWeight: 'semibold',
      };
    }

    return null;
  };

  ngOnInit(): void {
    this.searchForm.controls.search.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.searchTerm.set(term));
  }

  /** Traduce las acciones genéricas de ui-table a eventos propios del módulo. */
  handleAction(event: UiTableActionEvent<RolAdminItem>): void {
    switch (event.actionId) {
      case 'permissions':
        this.permissionsRequested.emit(event.row);
        break;
      case 'edit':
        this.editRequested.emit(event.row);
        break;
      case 'activate':
      case 'deactivate':
        this.stateRequested.emit(event.row);
        break;
    }
  }

  /** Presenta el estado con el componente de badge integrado en ui-table. */
  private statusBadge(role: RolAdminItem): UiTableBadge {
    return role.vigente === 1
      ? {
          text: 'Activo',
          variant: 'success',
          appearance: 'outline',
          size: 'xs',
          icon: 'fa-solid fa-check',
          uppercase: true,
        }
      : {
          text: 'Inactivo',
          variant: 'secondary',
          appearance: 'outline',
          size: 'xs',
          icon: 'fa-solid fa-ban',
          uppercase: true,
        };
  }

  /** Elimina diferencias de mayúsculas y tildes durante el filtrado local. */
  private normalize(value: string): string {
    return value
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
