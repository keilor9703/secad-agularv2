import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { SuperAdminService, TenantPublico } from '../../../services/super-admin.service';
import { ToastService } from '../../../services/toast.service';
import { fixMojibake } from '../../../../shared/utils/string-encoding.util';

/**
 * Selector de CAD (tenant) para el superadministrador.
 *
 * El backend elige la base de datos a partir del claim `cod_dane` del JWT, así
 * que cambiar de CAD es pedir un token nuevo: /super/switch-context devuelve
 * uno emitido para el CAD destino. Por eso al final se recarga la página —
 * cualquier dato ya cargado pertenece al CAD anterior.
 *
 * Para el resto de usuarios el componente no pinta nada.
 */
@Component({
  selector: 'app-topbar-tenant-switcher',
  standalone: true,
  imports: [],
  templateUrl: './topbar-tenant-switcher.component.html',
  styleUrl: './topbar-tenant-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopbarTenantSwitcherComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly superAdmin = inject(SuperAdminService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  // takeUntilDestroyed() sólo puede resolver el DestroyRef dentro de un
  // contexto de inyección; capturarlo aquí permite usarlo en ngOnInit y en los
  // manejadores de eventos.
  private readonly destroyRef = inject(DestroyRef);

  readonly esSuperAdmin = signal(false);
  readonly contextoCambiado = signal(false);
  readonly nombreCad = signal('');
  readonly codDaneActivo = signal('');
  readonly tenants = signal<TenantPublico[]>([]);
  readonly abierto = signal(false);
  readonly cambiando = signal(false);
  readonly filtro = signal('');

  /** Sólo se usa para volver al CAD de origen; nunca se pinta. */
  private codDaneOrigen = '';

  readonly tenantsFiltrados = computed(() => {
    const texto = this.filtro().trim().toLowerCase();
    if (!texto) {
      return this.tenants();
    }
    return this.tenants().filter(
      (t) => t.nombre.toLowerCase().includes(texto) || t.codDane.includes(texto),
    );
  });

  ngOnInit(): void {
    const claims = this.auth.getJwtClaims();
    this.esSuperAdmin.set(claims.esSuperAdmin);

    if (!this.esSuperAdmin()) {
      return;
    }

    this.contextoCambiado.set(this.auth.isContextSwitched());
    this.nombreCad.set(fixMojibake(claims.nombreCad));
    this.codDaneActivo.set(claims.codDane);
    this.codDaneOrigen = claims.homeCodDane;

    this.superAdmin
      .getTenants()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Sin la lista el selector queda sin opciones, pero el botón sigue
        // mostrando en qué CAD se está: eso no debe perderse por un fallo.
        next: (lista) =>
          this.tenants.set(
            lista.filter((t) => t.activo).map((t) => ({ ...t, nombre: fixMojibake(t.nombre) })),
          ),
        error: () => this.tenants.set([]),
      });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const objetivo = event.target as HTMLElement;
    if (!objetivo.closest('app-topbar-tenant-switcher')) {
      this.abierto.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.abierto.set(false);
  }

  alternar(event: Event): void {
    event.stopPropagation();
    this.abierto.update((v) => !v);
    if (!this.abierto()) {
      this.filtro.set('');
    }
  }

  onFiltro(event: Event): void {
    this.filtro.set((event.target as HTMLInputElement).value);
  }

  cambiarA(codDane: string): void {
    if (codDane === this.codDaneActivo() || this.cambiando()) {
      return;
    }

    this.cambiando.set(true);
    this.abierto.set(false);

    this.superAdmin
      .switchContext(codDane)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resultado) => {
          this.auth.setToken(resultado.token);
          this.toast.info('Contexto cambiado', `Administrando: ${resultado.nombreCad}`);
          // Recarga completa: los datos en memoria son del CAD anterior y no
          // hay forma fiable de invalidarlos servicio por servicio.
          this.router
            .navigateByUrl('/home')
            .then(() => window.location.reload())
            .catch(() => window.location.reload());
        },
        error: () => {
          this.cambiando.set(false);
          this.toast.error('Error', 'No se pudo cambiar de CAD.');
        },
      });
  }

  volverAMiCad(): void {
    this.cambiarA(this.codDaneOrigen);
  }
}
