import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { NewsItem } from '../../interfaces/home-page.interface';
import { HomeNewsDetailModalComponent } from '../home-news-detail-modal/home-news-detail-modal.component';

@Component({
  selector: 'app-home-news-feed',
  standalone: true,
  imports: [RouterLink, HomeNewsDetailModalComponent],
  templateUrl: './home-news-feed.component.html',
  styleUrl: './home-news-feed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeNewsFeedComponent implements OnDestroy {
  private readonly autoplayDelay = 6800;
  private readonly viewport = viewChild<ElementRef<HTMLDivElement>>('newsViewport');
  private readonly newsCards = viewChildren<ElementRef<HTMLElement>>('newsCard');

  readonly items = input.required<readonly NewsItem[]>();
  readonly likedIds = input<ReadonlySet<number>>(new Set<number>());
  readonly likeRequested = output<NewsItem>();

  readonly selectedNews = signal<NewsItem | null>(null);
  readonly failedImages = signal<ReadonlySet<number>>(new Set<number>());
  readonly visibleItems = computed(() => this.items());

  private autoplayTimer?: ReturnType<typeof setInterval>;

  constructor() {
    // Reactiva el carrusel cuando la consulta HTTP entrega las noticias.
    effect(() => {
      const total = this.visibleItems().length;
      if (total < 2) {
        this.pauseAutoplay();
        return;
      }

      queueMicrotask(() => this.startAutoplay());
    });
  }

  previousNews(): void {
    this.moveByCard(-1, true);
  }

  nextNews(): void {
    this.moveByCard(1, true);
  }

  pauseAutoplay(): void {
    if (this.autoplayTimer) {
      clearInterval(this.autoplayTimer);
      this.autoplayTimer = undefined;
    }
  }

  resumeAutoplay(): void {
    this.startAutoplay();
  }

  /** Abre el detalle sin delegar estado visual al componente contenedor. */
  openNews(item: NewsItem): void {
    this.pauseAutoplay();
    this.selectedNews.set(item);
  }

  /** Cierra el detalle y devuelve el foco visual a la publicación. */
  closeNews(): void {
    this.selectedNews.set(null);
    this.resumeAutoplay();
  }

  requestLike(item: NewsItem, event?: Event): void {
    event?.stopPropagation();
    if (!this.likedIds().has(item.id)) {
      this.likeRequested.emit(item);
    }
  }

  markImageAsFailed(itemId: number): void {
    this.failedImages.update((current) => new Set([...current, itemId]));
  }

  hasVisibleImage(item: NewsItem): boolean {
    return Boolean(item.image?.trim()) && !this.failedImages().has(item.id);
  }

  ngOnDestroy(): void {
    this.pauseAutoplay();
  }

  @HostListener('document:visibilitychange')
  handleVisibilityChange(): void {
    if (document.hidden) {
      this.pauseAutoplay();
      return;
    }

    this.resumeAutoplay();
  }

  private moveByCard(direction: -1 | 1, restartTimer = false): void {
    const viewport = this.viewport()?.nativeElement;
    const cards = this.newsCards();
    if (!viewport || cards.length < 2) {
      return;
    }

    const step = Math.max(1, cards[1].nativeElement.offsetLeft - cards[0].nativeElement.offsetLeft);
    const maximumLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const edgeTolerance = 5;
    let targetLeft = viewport.scrollLeft + direction * step;

    if (direction === 1 && viewport.scrollLeft >= maximumLeft - edgeTolerance) {
      targetLeft = 0;
    } else if (direction === -1 && viewport.scrollLeft <= edgeTolerance) {
      targetLeft = maximumLeft;
    }

    viewport.scrollTo({
      left: Math.min(maximumLeft, Math.max(0, targetLeft)),
      behavior: 'smooth',
    });

    if (restartTimer) {
      this.pauseAutoplay();
      this.startAutoplay();
    }
  }

  private startAutoplay(): void {
    if (
      this.autoplayTimer ||
      this.visibleItems().length < 2 ||
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    this.autoplayTimer = window.setInterval(() => this.moveByCard(1), this.autoplayDelay);
  }
}
