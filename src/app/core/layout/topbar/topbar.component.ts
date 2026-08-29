import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TopbarNotificationsComponent } from './topbar-notifications/topbar-notifications.component';
import { TopbarTenantSwitcherComponent } from './topbar-tenant-switcher/topbar-tenant-switcher.component';
import { TopbarUserMenuComponent } from './topbar-user-menu/topbar-user-menu.component';
import { SidebarService } from '../../services/sidebar.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [
    FormsModule,
    TopbarTenantSwitcherComponent,
    TopbarNotificationsComponent,
    TopbarUserMenuComponent,
  ],
  templateUrl: './topbar.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./topbar.component.scss'],
})
export class TopbarComponent {
  private readonly sidebarService = inject(SidebarService);

  readonly sidebarOpen = this.sidebarService.isOpen;
  searchQuery = '';

  toggleMobileMenu(): void {
    this.sidebarService.toggleSidebar();
  }

  onSearch(): void {}
}
