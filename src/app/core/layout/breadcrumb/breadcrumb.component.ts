import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { BreadcrumbItem } from '../../interfaces/breadcrumb-item.interface';
import { BrandIdentityService } from '../../services/brand-identity.service';
import { SidebarService } from '../../services/sidebar.service';

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './breadcrumb.component.html',
  styleUrl: './breadcrumb.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreadcrumbComponent {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly brandIdentity = inject(BrandIdentityService);

  readonly sidebarOpen = inject(SidebarService).isOpen;
  readonly identity = this.brandIdentity.identity;

  private readonly navigationUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly items = computed<readonly BreadcrumbItem[]>(() => {
    // La lectura de la URL hace que la miga se reconstruya tras cada navegación.
    this.navigationUrl();
    return this.buildBreadcrumb();
  });

  constructor() {
    this.brandIdentity.load();
  }

  private buildBreadcrumb(): readonly BreadcrumbItem[] {
    const breadcrumbs: BreadcrumbItem[] = [{ label: 'Inicio', route: '/home' }];
    this.collectBreadcrumbs(this.activatedRoute.root, '', breadcrumbs);

    const normalized = this.removeDuplicateHome(breadcrumbs);
    const lastIndex = normalized.length - 1;

    return normalized.map((item, index) =>
      index === lastIndex ? { ...item, route: undefined } : item,
    );
  }

  private collectBreadcrumbs(
    route: ActivatedRoute | null | undefined,
    parentUrl: string,
    breadcrumbs: BreadcrumbItem[],
  ): void {
    if (!route) {
      return;
    }

    for (const child of route.children ?? []) {
      const snapshot = child.snapshot;
      const routeUrl = (snapshot.url ?? []).map((segment) => segment.path).join('/');
      const nextUrl = routeUrl ? `${parentUrl}/${routeUrl}` : parentUrl;
      const label = snapshot.data?.['breadcrumb'] as string | undefined;

      if (label) {
        breadcrumbs.push({ label, route: nextUrl || undefined });
      }

      this.collectBreadcrumbs(child, nextUrl, breadcrumbs);
    }
  }

  private removeDuplicateHome(items: BreadcrumbItem[]): BreadcrumbItem[] {
    return items.filter((item, index) => item.label !== 'Inicio' || index === 0);
  }
}
