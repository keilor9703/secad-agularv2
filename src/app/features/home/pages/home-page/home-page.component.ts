import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/auth/auth.service';
import { BannerItem } from '../../../../core/interfaces/banner.interface';
import { RadioPlayerComponent } from '../../../../core/layout/footer/radio-player/radio-player.component';
import { BannerService } from '../../../../core/services/banner.service';
import { DtoLineaMando, LineaMandoService } from '../../../../core/services/linea-mando.service';
import { NoticiaService } from '../../../../core/services/noticia.service';
import { VideoInstitucionalService } from '../../../../core/services/video-institucional.service';
import { VideoUnidadService } from '../../../../core/services/video-unidad.service';
import { SafeUrlPipe } from '../../../../shared/pipes/safe-url.pipe';
import { HomeBannerSliderComponent } from '../../components/home-banner-slider/home-banner-slider.component';
import { HomeStatsComponent } from '../../components/home-stats/home-stats.component';
import { NewsItem, NewsTag, SocialLink } from '../../interfaces/home-page.interface';
import { HomeService, HomeStats } from '../../services/home.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    SafeUrlPipe,
    RouterLink,
    RadioPlayerComponent,
    HomeBannerSliderComponent,
    HomeStatsComponent,
  ],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
})
export class HomePageComponent implements OnInit, OnDestroy {
  private static readonly DEFAULT_BANNER_ASPECT_RATIO = 3.78;
  private static readonly MIN_BANNER_ASPECT_RATIO = 1.5;
  private static readonly MAX_BANNER_ASPECT_RATIO = 5;

  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly bannerAspectRatios = new Map<number, number>();

  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 768px)').pipe(map(({ matches }) => matches)),
    { initialValue: this.breakpointObserver.isMatched('(max-width: 768px)') },
  );

  banners: BannerItem[] = [];
  stats: HomeStats = {
    usuariosActivos: 0,
    reportesGenerados: 0,
    alertasSistema: 0,
  };
  currentBannerIndex = 0;
  private bannerTimer: ReturnType<typeof setInterval> | null = null;
  videoUnidadUrl = '';
  videoInstitucionalUrl = '';
  lineaMando: DtoLineaMando[] = [];
  lineaMandoLightboxOpen = false;
  lineaMandoLightboxItem: DtoLineaMando | null = null;
  news: NewsItem[] = [];
  newsModalOpen = false;
  selectedNews: NewsItem | null = null;

  socialLinks: SocialLink[] = [
    {
      name: 'Facebook',
      icon: 'fa-facebook-f',
      url: 'https://www.facebook.com/PoliciaColombia',
      color: '#1877F2',
    },
    {
      name: 'X',
      icon: 'fa-x-twitter',
      url: 'https://twitter.com/PoliciaColombia',
      color: '#000000',
    },
    {
      name: 'Instagram',
      icon: 'fa-instagram',
      url: 'https://www.instagram.com/policiacolombia',
      color: '#E4405F',
    },
    {
      name: 'YouTube',
      icon: 'fa-youtube',
      url: 'https://www.youtube.com/@PoliciaNacionalCol',
      color: '#FF0000',
    },
  ];

  constructor(
    private bannerService: BannerService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private homeService: HomeService,
    private videoUnidadService: VideoUnidadService,
    private videoInstitucionalService: VideoInstitucionalService,
    private lineaMandoService: LineaMandoService,
    private noticiaService: NoticiaService,
  ) {}

  ngOnInit(): void {
    this.loadBanners();
    this.loadStats();
    this.loadVideoUnidad();
    this.loadVideoInstitucional();
    this.loadLineaMando();
    this.loadNoticias();
  }

  ngOnDestroy(): void {
    this.stopBannerRotation();
    document.body.classList.remove('ui-modal-open');
  }

  loadNoticias(): void {
    this.noticiaService.getActivas().subscribe({
      next: (noticias) => {
        const sorted = noticias
          .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime())
          .slice(0, 5);

        this.news = sorted.map((n) => ({
          id: n.idNoticia,
          date: new Date(n.fechaCreacion).toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          tag: this.mapSeccionToTag(n.seccion),
          title: n.titulo,
          lead: n.subtitulo || '',
          content: n.contenido || '',
          image: this.getNoticiaImageUrl(n.imagenNoticia),
          megusta: n.megusta || 0,
        }));
      },
      error: (err) => {
        console.error('Error cargando noticias:', err);
        this.news = [];
      },
    });
  }

  private getNoticiaImageUrl(imagenNoticia: string | null | undefined): string {
    const raw = (imagenNoticia ?? '').trim();
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
      return raw;
    }

    if (raw.startsWith('/api/')) {
      return `${this.getMediaBaseUrl()}${raw}`;
    }

    const fileName = raw.split('/').filter(Boolean).pop() ?? '';
    return fileName
      ? `${this.getMediaBaseUrl()}/api/NoticiaUpload/Imagen/${encodeURIComponent(fileName)}`
      : '';
  }

  private mapSeccionToTag(seccion: string): NewsTag {
    switch (seccion.toLowerCase()) {
      case 'comunicado':
        return 'Comunicado';
      case 'servicio':
        return 'Servicio';
      case 'importante':
        return 'Importante';
      default:
        return 'Comunicado';
    }
  }

  private loadBanners(): void {
    this.bannerService.getPublicos(this.authService.getIdentificacion()).subscribe({
      next: (items) => {
        const now = new Date();
        const ordered = (items ?? [])
          .filter((x) => this.isBannerVigenteNow(x, now))
          .slice()
          .sort((a, b) => a.orden - b.orden);
        this.banners = ordered.length > 0 ? ordered : this.getFallbackBanners();
        this.setCurrentBanner(0, false);
        this.startBannerRotation();
      },
      error: () => {
        this.banners = this.getFallbackBanners();
        this.setCurrentBanner(0, false);
        this.startBannerRotation();
      },
    });
  }

  private isBannerVigenteNow(item: BannerItem, now: Date): boolean {
    if (Number(item?.vigente ?? 0) !== 1) {
      return false;
    }

    const inicio = this.parseSliderDate(item?.fechaInicio);
    const fin = this.parseSliderDate(item?.fechaFin);

    if (inicio && inicio.getTime() > now.getTime()) {
      return false;
    }

    if (fin && fin.getTime() < now.getTime()) {
      return false;
    }

    return true;
  }

  private parseSliderDate(value?: string | null): Date | null {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private loadStats(): void {
    this.homeService.getStats().subscribe({
      next: (data) => {
        this.stats = {
          usuariosActivos: Number(data?.usuariosActivos ?? 0),
          reportesGenerados: Number(data?.reportesGenerados ?? 0),
          alertasSistema: Number(data?.alertasSistema ?? 0),
        };
      },
      error: () => {
        this.stats = {
          usuariosActivos: 0,
          reportesGenerados: 0,
          alertasSistema: 0,
        };
      },
    });
  }

  private loadVideoUnidad(): void {
    this.videoUnidadService.getCurrent().subscribe({
      next: (data) => {
        this.videoUnidadUrl = data?.hasVideo ? data.url : '';
      },
      error: () => {
        this.videoUnidadUrl = '';
      },
    });
  }

  private loadVideoInstitucional(): void {
    this.videoInstitucionalService.getCurrent().subscribe({
      next: (data) => {
        this.videoInstitucionalUrl =
          data?.hasVideo && data.data?.embedUrl ? data.data.embedUrl : '';
      },
      error: () => {
        this.videoInstitucionalUrl = '';
      },
    });
  }

  private loadLineaMando(): void {
    this.lineaMandoService.getAll().subscribe({
      next: (items) => {
        this.lineaMando = (items ?? [])
          .filter((x) => Number(x?.vigente ?? 1) === 1)
          .sort((a, b) => Number(a?.orden ?? 0) - Number(b?.orden ?? 0));
      },
      error: () => {
        this.lineaMando = [];
      },
    });
  }

  getLineaMandoFotoUrl(item: DtoLineaMando): string {
    const fotoBase64 = item?.fotoBase64?.trim();
    if (!fotoBase64) {
      return 'imagenes/policia.jpg';
    }

    if (fotoBase64.startsWith('data:')) {
      return fotoBase64;
    }

    return `data:image/jpeg;base64,${fotoBase64}`;
  }

  getLineaMandoNombre(item: DtoLineaMando): string {
    return `${item?.nombre ?? ''} ${item?.apellidos ?? ''}`.trim();
  }

  getLineaMandoCargoDisplay(item: DtoLineaMando): string {
    const rawCargo = (item?.cargo ?? '').trim();
    return rawCargo ? this.toTitleCase(rawCargo) : 'Sin cargo';
  }

  private toTitleCase(value: string): string {
    return value
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  openLineaMandoLightbox(item: DtoLineaMando): void {
    this.lineaMandoLightboxItem = item;
    this.lineaMandoLightboxOpen = true;
    this.syncBodyModalClass();
  }

  closeLineaMandoLightbox(): void {
    this.lineaMandoLightboxOpen = false;
    this.lineaMandoLightboxItem = null;
    this.syncBodyModalClass();
  }

  private syncBodyModalClass(): void {
    if (this.newsModalOpen || this.lineaMandoLightboxOpen) {
      document.body.classList.add('ui-modal-open');
      return;
    }

    document.body.classList.remove('ui-modal-open');
  }

  goToBanner(index: number): void {
    if (index < 0 || index >= this.banners.length) {
      return;
    }

    this.setCurrentBanner(index);
  }

  showPreviousBanner(): void {
    this.moveBanner(-1);
  }

  showNextBanner(): void {
    this.moveBanner(1);
  }

  getActiveBannerAspectRatio(): string {
    const ratio =
      this.bannerAspectRatios.get(this.currentBannerIndex) ??
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

    this.bannerAspectRatios.set(index, Number(safeRatio.toFixed(4)));
    this.cdr.markForCheck();
  }

  getBannerImageUrl(item: BannerItem): string {
    const raw = (item.urlImagen ?? '').trim();
    if (!raw) {
      return '';
    }

    if (raw.startsWith('data:')) {
      return raw;
    }

    if (raw.startsWith('/api/Slider/Image/')) {
      return `${this.getMediaBaseUrl()}${raw}`;
    }

    const uploadPathIndex = raw.toLowerCase().indexOf('/uploads/sliders/');
    if (uploadPathIndex >= 0) {
      const fileName = raw.substring(uploadPathIndex).split('/').filter(Boolean).pop() ?? '';
      return fileName ? `${this.getApiBaseUrl()}/Slider/Image/${encodeURIComponent(fileName)}` : '';
    }

    const normalized = raw.replace(/\\/g, '/');
    if (normalized.toLowerCase().startsWith('uploads/sliders/')) {
      const fileName = normalized.split('/').filter(Boolean).pop() ?? '';
      return fileName ? `${this.getApiBaseUrl()}/Slider/Image/${encodeURIComponent(fileName)}` : '';
    }

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw;
    }

    if (raw.startsWith('/')) {
      return `${this.getApiOrigin()}${raw}`;
    }

    if (/^[^/]+\.(jpg|jpeg|png|webp)$/i.test(normalized)) {
      return `${this.getApiBaseUrl()}/Slider/Image/${encodeURIComponent(normalized)}`;
    }

    return `/${raw}`;
  }

  private getMediaBaseUrl(): string {
    return (environment.mediaBaseUrl || environment.sliderMediaBaseUrl || '')
      .trim()
      .replace(/\/+$/, '');
  }

  private getApiBaseUrl(): string {
    const base = (environment.apiBaseUrl ?? '/api').trim().replace(/\/+$/, '');
    return base || '/api';
  }

  private getApiOrigin(): string {
    const base = this.getApiBaseUrl();
    if (!/^https?:\/\//i.test(base)) {
      return '';
    }

    try {
      const url = new URL(base);
      return `${url.protocol}//${url.host}`;
    } catch {
      return '';
    }
  }

  private startBannerRotation(): void {
    this.stopBannerRotation();
    if (this.banners.length <= 1) {
      return;
    }

    this.bannerTimer = window.setInterval(() => {
      this.moveBanner(1, false);
    }, 5000);
  }

  private moveBanner(offset: -1 | 1, restart = true): void {
    const total = this.banners.length;
    if (total <= 1) {
      return;
    }

    const nextIndex = (this.currentBannerIndex + offset + total) % total;
    this.setCurrentBanner(nextIndex, restart);
  }

  private setCurrentBanner(index: number, restart = true): void {
    if (index < 0 || index >= this.banners.length) {
      return;
    }

    this.currentBannerIndex = index;
    this.cdr.markForCheck();

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

  openNews(item: NewsItem): void {
    this.selectedNews = item;
    this.newsModalOpen = true;
    this.syncBodyModalClass();
  }

  closeNews(): void {
    this.newsModalOpen = false;
    this.selectedNews = null;
    this.syncBodyModalClass();
  }

  likeNoticia(item: NewsItem, event: Event): void {
    event.stopPropagation();

    const likedNews = this.getLikedNews();
    if (likedNews.includes(item.id)) {
      return;
    }

    this.noticiaService.darLike(item.id).subscribe({
      next: () => {
        item.megusta = (item.megusta || 0) + 1;
        this.saveLikedNews(item.id);
      },
      error: (err) => {
        console.error('Error dando like:', err);
      },
    });
  }

  hasLiked(noticiaId: number): boolean {
    const likedNews = this.getLikedNews();
    return likedNews.includes(noticiaId);
  }

  private getLikedNews(): number[] {
    const stored = sessionStorage.getItem('likedNews');
    return stored ? JSON.parse(stored) : [];
  }

  private saveLikedNews(noticiaId: number): void {
    const liked = this.getLikedNews();
    if (!liked.includes(noticiaId)) {
      liked.push(noticiaId);
      sessionStorage.setItem('likedNews', JSON.stringify(liked));
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.lineaMandoLightboxOpen) {
      this.closeLineaMandoLightbox();
      return;
    }

    if (this.newsModalOpen) {
      this.closeNews();
    }
  }
}
