import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { LoginVisualPublicItem, LoginVisualService } from '../../../../core/services/login-visual.service';
import { BrandingService } from '../../../../core/services/branding.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './login-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent implements OnInit, OnDestroy {
  systemName = 'OFTIC';
  logoUrl = '/escudo.png';
  usuario = '';
  contrasena = '';
  showPassword = false;
  isLoading = false;
  errorMessage = '';
  slides: LoginVisualPublicItem[] = [];
  currentSlideIndex = 0;
  private loginTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private slideTimerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private loginVisualService: LoginVisualService,
    private brandingService: BrandingService
  ) {}

  ngOnInit(): void {
    this.loadBranding();
    this.loadLoginBackgrounds();
  }

  ngOnDestroy(): void {
    if (this.loginTimeoutHandle) {
      clearTimeout(this.loginTimeoutHandle);
    }
    if (this.slideTimerHandle) {
      clearInterval(this.slideTimerHandle);
    }
  }

  loadLoginBackgrounds(): void {
    this.loginVisualService.getPublicConfig().subscribe({
      next: (config) => {
        const items = (config?.items ?? [])
          .filter((x) => !!x?.url)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        if (items.length === 0) {
          this.applyFallbackSlides();
          return;
        }

        this.slides = items;
        this.currentSlideIndex = 0;
        this.startSlideRotation(Number(config?.intervalMs ?? 6000));
      },
      error: () => {
        this.applyFallbackSlides();
      }
    });
  }

  private loadBranding(): void {
    this.brandingService.getPublicConfig().subscribe({
      next: (cfg) => {
        const sigla = (cfg?.sistema ?? cfg?.systemName ?? '').trim();
        this.systemName = sigla || 'SISGE';
        this.logoUrl = (cfg?.logoUrl ?? '').trim() || '/escudo.png';
      },
      error: () => {
        this.systemName = 'SISGE';
        this.logoUrl = '/escudo.png';
      }
    });
  }

  private applyFallbackSlides(): void {
    this.slides = [
      { fileName: 'banner1.jpg', url: '/background/banner1.jpg', order: 1 },
      { fileName: 'banner2.jpg', url: '/background/banner2.jpg', order: 2 },
      { fileName: 'banner3.jpg', url: '/background/banner3.jpg', order: 3 }
    ];
    this.currentSlideIndex = 0;
    this.startSlideRotation(6000);
  }

  private startSlideRotation(intervalMs: number): void {
    if (this.slideTimerHandle) {
      clearInterval(this.slideTimerHandle);
      this.slideTimerHandle = null;
    }

    if (!this.slides || this.slides.length <= 1) {
      return;
    }

    const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 1500 ? intervalMs : 6000;
    this.slideTimerHandle = setInterval(() => {
      this.currentSlideIndex = (this.currentSlideIndex + 1) % this.slides.length;
    }, safeInterval);
  }

  onSubmit(): void {
    this.errorMessage = '';

    if (!this.usuario?.trim() || !this.contrasena?.trim()) {
      this.errorMessage = 'Debe diligenciar usuario y contraseña.';
      return;
    }

    this.isLoading = true;

    this.loginTimeoutHandle = setTimeout(() => {
      if (this.isLoading) {
        this.isLoading = false;
        this.errorMessage = 'La autenticación está tardando demasiado. Intente nuevamente.';
      }
    }, 35000);

    this.authService.login(this.usuario.trim(), this.contrasena).subscribe({
      next: (resp) => {
        this.clearLoginTimeout();
        this.isLoading = false;

        if (this.authService.isLoginSuccessful(resp)) {
          this.router.navigate(['/home']);
          return;
        }

        this.errorMessage = resp?.mensaje ?? resp?.message ?? 'No fue posible iniciar sesión.';
      },
      error: (err) => {
        this.clearLoginTimeout();
        this.isLoading = false;
        this.errorMessage = err?.error?.mensaje ?? err?.error?.message ?? 'Error de conexión con el servicio de autenticación.';
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  private clearLoginTimeout(): void {
    if (this.loginTimeoutHandle !== null) {
      clearTimeout(this.loginTimeoutHandle);
      this.loginTimeoutHandle = null;
    }
  }
}

