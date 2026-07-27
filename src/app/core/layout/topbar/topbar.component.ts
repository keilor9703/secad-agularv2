import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TopbarNotificationsComponent } from './topbar-notifications/topbar-notifications.component';
import { TopbarUserMenuComponent } from './topbar-user-menu/topbar-user-menu.component';
import { SidebarService } from '../../services/sidebar.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [FormsModule, TopbarNotificationsComponent, TopbarUserMenuComponent],
  templateUrl: './topbar.component.html',
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
