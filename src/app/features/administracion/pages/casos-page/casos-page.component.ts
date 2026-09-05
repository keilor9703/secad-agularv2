import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  CasoService,
  DtoCaso,
} from '../../services/caso.service';
import {
  AsistenteService,
  AsistenteCategoria,
} from '../../../../core/services/operacion/asistente.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiTableColumn } from '../../../../shared/interfaces/ui-table.interface';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';

/** Contexto que ui-table pasa a cada cellTemplate. */
interface CeldaCtx {
  $implicit: DtoCaso;
  row: DtoCaso;
  column: UiTableColumn<DtoCaso>;
}

@Component({
  selector: 'app-casos-page',
  standalone: true,
  imports: [
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiSearchInputComponent,
    UiBadgeComponent,
    UiTableComponent,
    UiSelectComponent,
  ],
  templateUrl: './casos-page.component.html',
  styleUrls: ['./casos-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CasosPageComponent implements OnInit {
  private readonly service   = inject(CasoService);
  private readonly asistente = inject(AsistenteService);
  private readonly auth      = inject(AuthService);
  private readonly router    = inject(Router);
  private readonly toast     = inject(ToastService);

  readonly casos      = signal<DtoCaso[]>([]);
  readonly categorias = signal<AsistenteCategoria[]>([]);
  readonly loading    = signal(false);
  readonly busqueda   = signal('');
  readonly filtroCat  = signal('');

  readonly esSuperAdmin = computed(() => !!this.auth.getJwtClaims().esSuperAdmin);

  readonly casosFiltrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const cat = this.filtroCat();

    return this.casos().filter((c) => {
      if (q) {
        const cod = (c.codigo || '').toLowerCase();
        const desc = (c.descripcion || '').toLowerCase();
        if (!cod.includes(q) && !desc.includes(q)) return false;
      }
      if (cat && c.idCategoriaAsistente !== cat) return false;
      return true;
    });
  });

  readonly opcionesCategoria = computed<UiSelectOption<string>[]>(() => [
    { label: 'Todas las categorías', value: '' },
    ...this.categorias().map((c) => ({ label: c.descripcion, value: c.id })),
  ]);

  @ViewChild('celdaCodigo', { static: true }) celdaCodigo!: TemplateRef<CeldaCtx>;
  @ViewChild('celdaAmbito', { static: true }) celdaAmbito!: TemplateRef<CeldaCtx>;

  columns: UiTableColumn<DtoCaso>[] = [];

  ngOnInit(): void {
    this.columns = [
      { key: 'codigo', label: 'Código', cellTemplate: this.celdaCodigo, align: 'left' },
      { key: 'descripcion', label: 'Descripción del incidente', align: 'left' },
      { key: 'codDane', label: 'Ámbito de aplicación', cellTemplate: this.celdaAmbito, align: 'center' },
      {
        key: 'categoriaDescripcion',
        label: 'Categoría del asistente',
        value: (c) => c.categoriaDescripcion || '—',
      },
      {
        key: 'vigente',
        label: 'Estado',
        align: 'center',
        badge: (c) =>
          c.vigente
            ? { text: 'Vigente', variant: 'success' }
            : { text: 'Inactivo', variant: 'danger' },
      },
    ];

    this.cargar();

    this.asistente.getCategorias(false).subscribe({
      next: (r) => this.categorias.set(r.data ?? []),
      error: () => this.categorias.set([]),
    });
  }

  cargar(): void {
    this.loading.set(true);
    this.service.getAll().subscribe({
      next: (r) => {
        this.casos.set(r.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Códigos de caso', 'No se pudo cargar el catálogo.');
      },
    });
  }

  buscar(termino: string): void {
    this.busqueda.set(termino);
  }

  irASuperAdmin(): void {
    this.router.navigate(['/super/casos']);
  }
}
