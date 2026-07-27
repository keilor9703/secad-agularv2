import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';
import { MiPerfilDto } from '../../../interfaces/topbar.interface';
import { BrandingService } from '../../../services/branding.service';

@Component({
  selector: 'app-topbar-user-menu',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './topbar-user-menu.component.html',
  styleUrl: './topbar-user-menu.component.scss',
})
export class TopbarUserMenuComponent implements OnInit {
  userName = 'Usuario';
  userRole = 'OFTIC';
  userPhotoUrl: string | null = null;
  perfil: MiPerfilDto | null = null;
  profileModalOpen = false;
  profileLoading = false;
  dropdownOpen = false;

  private brandingRole = 'OFTIC';

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router,
    private brandingService: BrandingService,
  ) {}

  ngOnInit(): void {
    this.userName = this.authService.getUsuario();
    this.loadBranding();
    this.loadMyPhoto();
    this.loadMyProfile(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('app-topbar-user-menu')) {
      this.dropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.dropdownOpen = false;
    this.closeProfileModal();
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
  }

  openProfileModal(): void {
    this.profileModalOpen = true;
    this.dropdownOpen = false;

    if (!this.perfil && !this.profileLoading) {
      this.loadMyProfile(true);
    }
  }

  closeProfileModal(): void {
    this.profileModalOpen = false;
  }

  onLogout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  private loadBranding(): void {
    this.brandingService.getPublicConfig().subscribe({
      next: (cfg) => {
        const sigla = (cfg?.sistema ?? cfg?.systemName ?? '').trim();
        this.brandingRole = sigla || 'OFTIC';
        this.applyProfileSummary();
      },
      error: () => {
        this.brandingRole = 'OFTIC';
        this.applyProfileSummary();
      },
    });
  }

  private loadMyPhoto(): void {
    this.http.get(`${environment.apiBaseUrl}/Usuario/MiFoto`, { responseType: 'text' }).subscribe({
      next: (raw) => {
        this.userPhotoUrl = this.normalizePhoto(raw);
      },
      error: () => {
        this.userPhotoUrl = null;
      },
    });
  }

  private loadMyProfile(showLoading: boolean): void {
    this.profileLoading = showLoading;

    this.http.get<MiPerfilDto>(`${environment.apiBaseUrl}/Usuario/MiPerfil`).subscribe({
      next: (data) => {
        this.perfil = data ?? {};
        this.profileLoading = false;
        this.applyProfileSummary();
      },
      error: () => {
        this.profileLoading = false;
        this.applyProfileSummary();
      },
    });
  }

  private applyProfileSummary(): void {
    const name = (this.perfil?.nombreCompleto ?? '').trim();
    const grade = (this.perfil?.grado ?? '').trim();
    const cargo = (this.perfil?.cargo ?? '').trim();

    this.userName = name ? [grade, name].filter(Boolean).join(' ') : this.authService.getUsuario();
    this.userRole = cargo || this.brandingRole;
  }

  private normalizePhoto(raw: string | null): string | null {
    if (!raw) {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    let decoded = trimmed;
    try {
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        decoded = JSON.parse(trimmed);
      }
    } catch {
      decoded = trimmed;
    }

    if (!decoded || decoded.length < 20) {
      return null;
    }

    if (decoded.startsWith('data:image/')) {
      return decoded;
    }

    return `data:image/jpeg;base64,${decoded}`;
  }
}
