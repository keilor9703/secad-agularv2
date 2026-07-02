import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { FooterComponent } from '../footer/footer.component';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { AccessibilityMenuComponent } from '../../../shared/components/accessibility-menu/accessibility-menu.component';
import { SocialDockGroup } from '../../../shared/interfaces/social-dock.interface';
import { SidebarService } from '../../services/sidebar.service';

@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    TopbarComponent,
    FooterComponent,
    BreadcrumbComponent,
    AccessibilityMenuComponent
  ],
})
export class MainLayoutComponent {
  socialGroups: SocialDockGroup[] = [];

  constructor(private sidebarService: SidebarService) {
    this.socialGroups = this.getFallbackSocialGroups();
  }

  isMenuOpen(): boolean {
    return this.sidebarService.isOpen();
  }

  closeMenu(): void {
    this.sidebarService.closeSidebar();
  }

  private getFallbackSocialGroups(): SocialDockGroup[] {
    return [
      {
        networkName: 'Facebook',
        icon: 'fa-facebook-f',
        color: '#1877F2',
        accounts: [{
          id: 1,
          networkName: 'Facebook',
          accountName: 'Policia Colombia',
          icon: 'fa-facebook-f',
          url: 'https://www.facebook.com/PoliciaColombia',
          color: '#1877F2'
        }]
      },
      {
        networkName: 'X',
        icon: 'fa-x-twitter',
        color: '#000000',
        accounts: [{
          id: 2,
          networkName: 'X',
          accountName: 'Policia Colombia',
          icon: 'fa-x-twitter',
          url: 'https://twitter.com/PoliciaColombia',
          color: '#000000'
        }]
      },
      {
        networkName: 'Instagram',
        icon: 'fa-instagram',
        color: '#E4405F',
        accounts: [{
          id: 3,
          networkName: 'Instagram',
          accountName: 'Policia Colombia',
          icon: 'fa-instagram',
          url: 'https://www.instagram.com/policiacolombia',
          color: '#E4405F'
        }]
      },
      {
        networkName: 'YouTube',
        icon: 'fa-youtube',
        color: '#FF0000',
        accounts: [{
          id: 4,
          networkName: 'YouTube',
          accountName: 'Policia Nacional Colombia',
          icon: 'fa-youtube',
          url: 'https://www.youtube.com/@PoliciaNacionalCol',
          color: '#FF0000'
        }]
      }
    ];
  }
}

