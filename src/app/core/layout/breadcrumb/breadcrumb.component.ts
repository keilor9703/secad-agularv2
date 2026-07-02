import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';

import { BreadcrumbItem } from '../../interfaces/breadcrumb-item.interface';

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss']
})
export class BreadcrumbComponent implements OnDestroy {
  items: BreadcrumbItem[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly router: Router,
    private readonly activatedRoute: ActivatedRoute
  ) {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.buildBreadcrumb());

    this.buildBreadcrumb();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildBreadcrumb(): void {
    const breadcrumbs: BreadcrumbItem[] = [{ label: 'Inicio', route: '/home' }];
    this.collectBreadcrumbs(this.activatedRoute.root, '', breadcrumbs);

    const normalized = this.removeDuplicateHome(breadcrumbs);
    if (normalized.length > 0) {
      normalized[normalized.length - 1] = {
        ...normalized[normalized.length - 1],
        route: undefined
      };
    }

    this.items = normalized;
  }

  private collectBreadcrumbs(
    route: ActivatedRoute | null | undefined,
    parentUrl: string,
    breadcrumbs: BreadcrumbItem[]
  ): void {
    if (!route) {
      return;
    }

    for (const child of route.children ?? []) {
      const snapshot = child?.snapshot;
      if (!snapshot) {
        continue;
      }

      const routeUrl = (snapshot.url ?? []).map((segment) => segment.path).join('/');
      const nextUrl = routeUrl ? `${parentUrl}/${routeUrl}` : parentUrl;
      const label = snapshot.data?.['breadcrumb'] as string | undefined;

      if (label) {
        breadcrumbs.push({
          label,
          route: nextUrl || undefined
        });
      }

      this.collectBreadcrumbs(child, nextUrl, breadcrumbs);
    }
  }

  private removeDuplicateHome(items: BreadcrumbItem[]): BreadcrumbItem[] {
    return items.filter((item, index) => {
      if (item.label !== 'Inicio') {
        return true;
      }
      return index === 0;
    });
  }
}
