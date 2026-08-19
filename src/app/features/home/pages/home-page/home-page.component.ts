import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { BannerItem } from '../../../../core/interfaces/banner.interface';
import { RadioPlayerComponent } from '../../../../core/layout/footer/radio-player/radio-player.component';
import { BannerService } from '../../../../core/services/banner.service';
import { DtoLineaMando, LineaMandoService } from '../../../../core/services/linea-mando.service';
import { NoticiaService } from '../../../../core/services/noticia.service';
import { VideoInstitucionalService } from '../../../../core/services/video-institucional.service';
import { VideoUnidadService } from '../../../../core/services/video-unidad.service';
import { HomeBannerSliderComponent } from '../../components/home-banner-slider/home-banner-slider.component';
import { HomeCommandLineComponent } from '../../components/home-command-line/home-command-line.component';
import { HomeMediaPanelComponent } from '../../components/home-media-panel/home-media-panel.component';
import { HomeNewsFeedComponent } from '../../components/home-news-feed/home-news-feed.component';
import { HomeStatsComponent } from '../../components/home-stats/home-stats.component';
import { NewsItem, NewsTag } from '../../interfaces/home-page.interface';
import { HomeService, HomeStats } from '../../services/home.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RadioPlayerComponent,
    HomeBannerSliderComponent,
    HomeStatsComponent,
    HomeNewsFeedComponent,
    HomeCommandLineComponent,
    HomeMediaPanelComponent,
  ],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent implements OnInit, OnDestroy {
  private static readonly DEFAULT_BANNER_ASPECT_RATIO = 3.78;
  private static readonly MIN_BANNER_ASPECT_RATIO = 1.5;
  private static readonly MAX_BANNER_ASPECT_RATIO = 5;

  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly bannerService = inject(BannerService);
  private readonly authService = inject(AuthService);
  private readonly homeService = inject(HomeService);
  private readonly videoUnidadService = inject(VideoUnidadService);
  private readonly videoInstitucionalService = inject(VideoInstitucionalService);
  private readonly lineaMandoService = inject(LineaMandoService);
  private readonly noticiaService = inject(NoticiaService);

  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 768px)').pipe(map(({ matches }) => matches)),
    { initialValue: this.breakpointObserver.isMatched('(max-width: 768px)') },
  );

  readonly banners = signal<BannerItem[]>([]);
  readonly currentBannerIndex = signal(0);
  readonly bannerAspectRatios = signal<ReadonlyMap<number, number>>(new Map<number, number>());
  readonly stats = signal<HomeStats>({
    usuariosActivos: 0,
    reportesGenerados: 0,
    alertasSistema: 0,
  });
  readonly unitVideoUrl = signal('');
  readonly institutionalVideoUrl = signal('');
  readonly commandLine = signal<readonly DtoLineaMando[]>([]);
  readonly news = signal<readonly NewsItem[]>([]);
  readonly likedNewsIds = signal<ReadonlySet<number>>(this.readLikedNews());

  private bannerTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.loadBanners();
    this.loadStats();
    this.loadUnitVideo();
    this.loadInstitutionalVideo();
    this.loadCommandLine();
    this.loadNews();
  }

  ngOnDestroy(): void {
    this.stopBannerRotation();
  }

  /** Conserva la rotación automática y el orden configurado desde administración. */
  private loadBanners(): void {
    this.bannerService.getPublicos(this.authService.getIdentificacion()).subscribe({
      next: (items) => {
        const now = new Date();
        const visibleItems = (items ?? [])
          .filter((item) => this.isBannerCurrent(item, now))
          .slice()
          .sort((left, right) => left.orden - right.orden);

        this.banners.set(visibleItems.length > 0 ? visibleItems : this.getFallbackBanners());
        this.setCurrentBanner(0, false);
        this.startBannerRotation();
      },
      error: () => {
        this.banners.set(this.getFallbackBanners());
        this.setCurrentBanner(0, false);
        this.startBannerRotation();
      },
    });
  }

  private loadStats(): void {
    this.homeService.getStats().subscribe({
      next: (data) =>
        this.stats.set({
          usuariosActivos: Number(data?.usuariosActivos ?? 0),
          reportesGenerados: Number(data?.reportesGenerados ?? 0),
          alertasSistema: Number(data?.alertasSistema ?? 0),
        }),
      error: () => this.stats.set({ usuariosActivos: 0, reportesGenerados: 0, alertasSistema: 0 }),
    });
  }

  private loadUnitVideo(): void {
    this.videoUnidadService.getCurrent().subscribe({
      next: (data) => this.unitVideoUrl.set(data?.hasVideo ? data.url : ''),
      error: () => this.unitVideoUrl.set(''),
    });
  }

  private loadInstitutionalVideo(): void {
    this.videoInstitucionalService.getCurrent().subscribe({
      next: (data) =>
        this.institutionalVideoUrl.set(
          data?.hasVideo && data.data?.embedUrl ? data.data.embedUrl : '',
        ),
      error: () => this.institutionalVideoUrl.set(''),
    });
  }

  private loadCommandLine(): void {
    this.lineaMandoService.getAll().subscribe({
      next: (items) =>
        this.commandLine.set(
          (items ?? [])
            .filter((item) => Number(item?.vigente ?? 1) === 1)
            .sort((left, right) => Number(left?.orden ?? 0) - Number(right?.orden ?? 0)),
        ),
      error: () => this.commandLine.set([]),
    });
  }

  private loadNews(): void {
    this.noticiaService.getActivas().subscribe({
      next: (items) => {
        const orderedItems = (items ?? [])
          .slice()
          .sort(
            (left, right) =>
              new Date(right.fechaCreacion).getTime() - new Date(left.fechaCreacion).getTime(),
          );

        this.news.set(
          orderedItems.map((item) => ({
            id: item.idNoticia,
            date: new Date(item.fechaCreacion).toLocaleDateString('es-CO', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }),
            tag: this.mapSectionToTag(item.seccion),
            title: item.titulo,
            lead: item.subtitulo || '',
            content: item.contenido || '',
            image: this.noticiaService.resolveImageUrl(item.imagenNoticia),
            megusta: item.megusta || 0,
          })),
        );
      },
      error: () => this.news.set([]),
    });
  }

  /** Registra el me gusta una sola vez por sesión y actualiza el feed sin recargarlo. */
  likeNews(item: NewsItem): void {
    if (this.likedNewsIds().has(item.id)) {
      return;
    }

    this.noticiaService.darLike(item.id).subscribe({
      next: () => {
        this.news.update((items) =>
          items.map((current) =>
            current.id === item.id ? { ...current, megusta: current.megusta + 1 } : current,
          ),
        );
        this.likedNewsIds.update((current) => new Set([...current, item.id]));
        this.persistLikedNews();
      },
      error: (error) => console.error('No fue posible registrar la reacción.', error),
    });
  }

  goToBanner(index: number): void {
    if (index >= 0 && index < this.banners().length) {
      this.setCurrentBanner(index);
    }
  }

  showPreviousBanner(): void {
    this.moveBanner(-1);
  }

  showNextBanner(): void {
    this.moveBanner(1);
  }

  getActiveBannerAspectRatio(): string {
    const ratio =
      this.bannerAspectRatios().get(this.currentBannerIndex()) ??
      HomePageComponent.DEFAULT_BANNER_ASPECT_RATIO;
    return `${ratio} / 1`;
  }

  onBannerImageLoad(index: number, event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return;
    }

    const naturalRatio = image.naturalWidth / image.naturalHeight;
    const safeRatio = Math.min(
      HomePageComponent.MAX_BANNER_ASPECT_RATIO,
      Math.max(HomePageComponent.MIN_BANNER_ASPECT_RATIO, naturalRatio),
    );
    this.bannerAspectRatios.update((current) => {
      const next = new Map(current);
      next.set(index, Number(safeRatio.toFixed(4)));
      return next;
    });
  }

  private isBannerCurrent(item: BannerItem, now: Date): boolean {
    if (Number(item?.vigente ?? 0) !== 1) {
      return false;
    }
    const start = this.parseDate(item?.fechaInicio);
    const end = this.parseDate(item?.fechaFin);
    return !(start && start > now) && !(end && end < now);
  }

  private parseDate(value?: string | null): Date | null {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
      return null;
    }
    const date = new Date(rawValue);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private mapSectionToTag(section: string): NewsTag {
    switch (section.toLocaleLowerCase('es-CO')) {
      case 'servicio':
        return 'Servicio';
      case 'importante':
        return 'Importante';
      default:
        return 'Comunicado';
    }
  }

  private readLikedNews(): ReadonlySet<number> {
    try {
      const storedValue = sessionStorage.getItem('likedNews');
      const parsedValue: unknown = storedValue ? JSON.parse(storedValue) : [];
      return new Set(Array.isArray(parsedValue) ? parsedValue.filter(Number.isFinite) : []);
    } catch {
      return new Set<number>();
    }
  }

  private persistLikedNews(): void {
    sessionStorage.setItem('likedNews', JSON.stringify([...this.likedNewsIds()]));
  }

  private startBannerRotation(): void {
    this.stopBannerRotation();
    if (this.banners().length <= 1) {
      return;
    }
    this.bannerTimer = window.setInterval(() => this.moveBanner(1, false), 5000);
  }

  private moveBanner(offset: -1 | 1, restart = true): void {
    const total = this.banners().length;
    if (total <= 1) {
      return;
    }
    this.setCurrentBanner((this.currentBannerIndex() + offset + total) % total, restart);
  }

  private setCurrentBanner(index: number, restart = true): void {
    if (index < 0 || index >= this.banners().length) {
      return;
    }
    this.currentBannerIndex.set(index);
    if (restart) {
      this.startBannerRotation();
    }
  }

  private stopBannerRotation(): void {
    if (this.bannerTimer) {
      window.clearInterval(this.bannerTimer);
      this.bannerTimer = null;
    }
  }

  private getFallbackBanners(): BannerItem[] {
    return [
      {
        idBanner: 1,
        titulo: 'SISGE',
        subtitulo: 'Banner informativo',
        urlImagen: 'banner/banner1.jpg',
        urlDestino: '',
        orden: 1,
        vigente: 1,
      },
      {
        idBanner: 2,
        titulo: 'SISGE',
        subtitulo: 'Banner informativo',
        urlImagen: 'banner/banner2.jpg',
        urlDestino: '',
        orden: 2,
        vigente: 1,
      },
      {
        idBanner: 3,
        titulo: 'SISGE',
        subtitulo: 'Banner informativo',
        urlImagen: 'banner/banner3.jpg',
        urlDestino: '',
        orden: 3,
        vigente: 1,
      },
    ];
  }
}
