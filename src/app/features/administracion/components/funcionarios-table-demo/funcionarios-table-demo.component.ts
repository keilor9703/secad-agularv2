import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ToastService } from '../../../../core/services/toast.service';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableBadge,
  UiTableColumn,
  UiTableFilter,
  UiTableSortEvent,
} from '../../../../shared/interfaces/ui-table.interface';
import {
  FuncionarioEstado,
  FuncionarioListado,
} from '../../interfaces/funcionario-listado.interface';
import { FuncionariosDemoTableService } from '../../services/funcionarios-demo-table.service';

@Component({
  selector: 'app-funcionarios-table-demo',
  standalone: true,
  imports: [UiTableComponent],
  templateUrl: './funcionarios-table-demo.component.html',
  styleUrl: './funcionarios-table-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuncionariosTableDemoComponent {
  private readonly toast = inject(ToastService);
  private readonly funcionariosDemoTableService = inject(FuncionariosDemoTableService);
  private readonly funcionarios = signal(this.funcionariosDemoTableService.getFuncionarios());

  readonly currentPage = signal(1);
  readonly pageSize = signal(5);
  readonly pageSizeOptions = [5, 10, 20];
  readonly filterValues = signal<Record<string, string>>({});
  readonly sortState = signal<UiTableSortEvent<FuncionarioListado> | null>(null);

  readonly columns: UiTableColumn<FuncionarioListado>[] = [
    { key: 'identificacion', label: 'Identificación', sortable: true, width: '12%' },
    { key: 'nombres', label: 'Nombres y apellidos', sortable: true, width: '20%' },
    { key: 'correo', label: 'Correo institucional', sortable: true, width: '22%' },
    { key: 'cargo', label: 'Cargo', sortable: true, width: '18%' },
    { key: 'dependencia', label: 'Dependencia', sortable: true, width: '18%' },
    {
      key: 'estado',
      label: 'Estado',
      align: 'center',
      sortable: true,
      width: '10%',
      badge: (row) => this.getEstadoBadge(row.estado),
    },
  ];

  readonly filters: UiTableFilter[] = [
    { key: 'especialidad', label: 'Especialidad', placeholder: 'Filtrar especialidad...' },
    { key: 'identificacion', label: 'Identificación', placeholder: 'Filtrar identificación...' },
    { key: 'nombres', label: 'Nombres / Apellidos', placeholder: 'Filtrar nombres...' },
  ];

  readonly actions: UiTableAction<FuncionarioListado>[] = [
    {
      id: 'view',
      label: 'Ver detalle',
      icon: 'fa-solid fa-eye',
      variant: 'info',
    },
    {
      id: 'edit',
      label: 'Editar funcionario',
      icon: 'fa-solid fa-pen-to-square',
      variant: 'secondary',
    },
    {
      id: 'change-status',
      label: 'Cambiar estado',
      icon: 'fa-solid fa-toggle-on',
      variant: 'warning',
      disabled: (row) => row.estado === 'Inactivo',
    },
    {
      id: 'delete',
      label: 'Eliminar',
      icon: 'fa-solid fa-trash-can',
      variant: 'danger',
    },
  ];

  readonly filteredFuncionarios = computed(() => {
    const filterValues = this.filterValues();

    return this.funcionarios().filter((funcionario) =>
      this.filters.every((filter) => {
        const filterValue = this.normalize(filterValues[filter.key]);

        if (!filterValue) {
          return true;
        }

        return this.normalize(funcionario[filter.key as keyof FuncionarioListado]).includes(
          filterValue,
        );
      }),
    );
  });

  readonly sortedFuncionarios = computed(() => {
    const sortState = this.sortState();
    const rows = [...this.filteredFuncionarios()];

    if (!sortState) {
      return rows;
    }

    return rows.sort((left, right) => {
      const leftValue = this.normalize(left[sortState.key]);
      const rightValue = this.normalize(right[sortState.key]);
      const result = leftValue.localeCompare(rightValue, 'es');

      return sortState.direction === 'asc' ? result : -result;
    });
  });

  readonly totalFuncionarios = computed(() => this.sortedFuncionarios().length);

  readonly funcionariosPaginados = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();

    return this.sortedFuncionarios().slice(start, start + this.pageSize());
  });

  onFiltersChange(values: Record<string, string>): void {
    this.filterValues.set(values);
    this.currentPage.set(1);
  }

  onSortChange(sort: UiTableSortEvent<FuncionarioListado>): void {
    this.sortState.set(sort);
    this.currentPage.set(1);
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.currentPage.set(1);
  }

  onActionClick(event: UiTableActionEvent<FuncionarioListado>): void {
    const action = this.actions.find((item) => item.id === event.actionId);
    const message = `${action?.label ?? 'Acción'}: ${event.row.nombres}`;

    if (event.actionId === 'delete') {
      this.toast.warning('Acción de tabla', message);
      return;
    }

    this.toast.info('Acción de tabla', message);
  }

  private getEstadoBadge(estado: FuncionarioEstado): UiTableBadge {
    if (estado === 'Activo') {
      return { text: estado, variant: 'success', icon: 'fa-solid fa-check' };
    }

    if (estado === 'Pendiente') {
      return { text: estado, variant: 'warning', icon: 'fa-solid fa-clock' };
    }

    return { text: estado, variant: 'danger', icon: 'fa-solid fa-xmark' };
  }

  private normalize(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
