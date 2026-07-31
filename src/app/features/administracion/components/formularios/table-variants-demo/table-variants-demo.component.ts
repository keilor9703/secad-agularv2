import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ToastService } from '../../../../../core/services/toast.service';
import { UiBadgeComponent } from '../../../../../shared/components/ui-badge/ui-badge.component';
import { UiTableComponent } from '../../../../../shared/components/ui-table/ui-table.component';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableBadge,
  UiTableColumn,
} from '../../../../../shared/interfaces/ui-table.interface';

type DemoOrderStatus = 'Completado' | 'Procesando' | 'Pendiente' | 'En espera';

interface DemoOrder {
  id: number;
  order: string;
  customer: string;
  date: string;
  shipTo: string;
  deliveryType: string;
  status: DemoOrderStatus;
  amount: string;
}

@Component({
  selector: 'app-table-variants-demo',
  standalone: true,
  imports: [UiBadgeComponent, UiTableComponent],
  templateUrl: './table-variants-demo.component.html',
  styleUrl: './table-variants-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableVariantsDemoComponent {
  private readonly toast = inject(ToastService);

  readonly page = signal(1);
  readonly pageSize = signal(5);
  readonly pageSizeOptions = [5, 10];

  readonly orders: DemoOrder[] = [
    {
      id: 2181,
      order: '#2181',
      customer: 'Carolina Andrade',
      date: '10/03/2026',
      shipTo: 'Bogotá D. C. · Dirección Administrativa',
      deliveryType: 'Entrega institucional',
      status: 'Completado',
      amount: '$99',
    },
    {
      id: 2182,
      order: '#2182',
      customer: 'Miguel Quintero',
      date: '10/03/2026',
      shipTo: 'Medellín · Talento Humano',
      deliveryType: 'Mensajería interna',
      status: 'Procesando',
      amount: '$120',
    },
    {
      id: 2183,
      order: '#2183',
      customer: 'Sandra Jiménez',
      date: '09/03/2026',
      shipTo: 'Cali · Grupo de Tecnología',
      deliveryType: 'Recogida programada',
      status: 'En espera',
      amount: '$70',
    },
    {
      id: 2184,
      order: '#2184',
      customer: 'Roberto Méndez',
      date: '09/03/2026',
      shipTo: 'Pereira · Secretaría General',
      deliveryType: 'Entrega institucional',
      status: 'Pendiente',
      amount: '$92',
    },
    {
      id: 2185,
      order: '#2185',
      customer: 'Josefina Martínez',
      date: '08/03/2026',
      shipTo: 'Barranquilla · Gestión Documental',
      deliveryType: 'Mensajería interna',
      status: 'En espera',
      amount: '$120',
    },
    {
      id: 2186,
      order: '#2186',
      customer: 'Íngrid Torres',
      date: '08/03/2026',
      shipTo: 'Manizales · Contratación',
      deliveryType: 'Recogida programada',
      status: 'Procesando',
      amount: '$145',
    },
    {
      id: 2187,
      order: '#2187',
      customer: 'Catalina Karenin',
      date: '07/03/2026',
      shipTo: 'Bogotá D. C. · Planeación',
      deliveryType: 'Entrega institucional',
      status: 'Completado',
      amount: '$55',
    },
    {
      id: 2188,
      order: '#2188',
      customer: 'Roy Anderson',
      date: '07/03/2026',
      shipTo: 'Tunja · Bienestar',
      deliveryType: 'Mensajería interna',
      status: 'En espera',
      amount: '$90',
    },
    {
      id: 2189,
      order: '#2189',
      customer: 'Tomás Stevenson',
      date: '06/03/2026',
      shipTo: 'Ibagué · Comunicaciones',
      deliveryType: 'Entrega institucional',
      status: 'Procesando',
      amount: '$52',
    },
    {
      id: 2190,
      order: '#2190',
      customer: 'Eva Singh',
      date: '06/03/2026',
      shipTo: 'Neiva · Asuntos Jurídicos',
      deliveryType: 'Recogida programada',
      status: 'Completado',
      amount: '$90',
    },
  ];

  readonly columns: UiTableColumn<DemoOrder>[] = [
    {
      key: 'order',
      label: 'Orden',
      sortable: true,
      width: '8%',
      textColor: '#2563eb',
      fontWeight: 'semibold',
    },
    { key: 'customer', label: 'Funcionario', sortable: true, width: '15%' },
    { key: 'date', label: 'Fecha', sortable: true, width: '10%' },
    { key: 'shipTo', label: 'Destino', sortable: true, width: '27%' },
    { key: 'deliveryType', label: 'Tipo de entrega', sortable: true, width: '16%' },
    {
      key: 'status',
      label: 'Estado',
      align: 'center',
      sortable: true,
      width: '13%',
      badge: (row) => this.statusBadge(row.status),
    },
    {
      key: 'amount',
      label: 'Valor',
      align: 'right',
      sortable: true,
      width: '8%',
      fontSize: 14,
      fontWeight: 'medium',
    },
  ];

  readonly actions: UiTableAction<DemoOrder>[] = [
    {
      id: 'approve',
      label: 'Aprobar',
      icon: 'fa-solid fa-check',
      variant: 'primary',
    },
    {
      id: 'delete',
      label: 'Eliminar',
      icon: 'fa-solid fa-trash-can',
      variant: 'danger',
    },
    {
      id: 'more',
      label: 'Más opciones',
      icon: 'fa-solid fa-ellipsis',
      variant: 'secondary',
    },
  ];

  readonly pagedOrders = computed(() => {
    const start = (this.page() - 1) * this.pageSize();

    return this.orders.slice(start, start + this.pageSize());
  });

  readonly usageExample = `<!-- Tabla limpia, paginación numerada y acciones al pasar por la fila. -->
<app-ui-table
  variant="plain"
  paginationVariant="numbered"
  actionDisplay="row-hover"
  actionsPosition="right"
  [paginationShowSummary]="false"
  [paginationShowPageSize]="false"
  [columns]="columns"
  [rows]="rows()"
  [actions]="actions"
  [total]="total()"
  [page]="page()"
  [pageSize]="5"
  [bodyFontSize]="12"
  bodyFontWeight="normal"
  [rowPadding]="10"
  headerTextColor="#263247"
  (pageChange)="page.set($event)"
/>`;

  onPageChange(page: number): void {
    this.page.set(page);
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
  }

  onActionClick(event: UiTableActionEvent<DemoOrder>): void {
    const action = this.actions.find((item) => item.id === event.actionId);
    this.toast.info('Tabla limpia', `${action?.label ?? 'Acción'} · ${event.row.order}`);
  }

  private statusBadge(status: DemoOrderStatus): UiTableBadge {
    if (status === 'Completado') {
      return {
        text: status,
        variant: 'success',
        appearance: 'outline',
        size: 'xs',
        icon: 'fa-solid fa-check',
        uppercase: true,
      };
    }

    if (status === 'Procesando') {
      return {
        text: status,
        variant: 'primary',
        appearance: 'outline',
        size: 'xs',
        icon: 'fa-solid fa-rotate',
        uppercase: true,
      };
    }

    if (status === 'Pendiente') {
      return {
        text: status,
        variant: 'warning',
        appearance: 'outline',
        size: 'xs',
        icon: 'fa-regular fa-clock',
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
}
