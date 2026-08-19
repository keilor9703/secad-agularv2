import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { NewsItem } from '../../interfaces/home-page.interface';
import { parseNewsParagraphs } from './home-news-content.util';

@Component({
  selector: 'app-home-news-detail-modal',
  standalone: true,
  templateUrl: './home-news-detail-modal.component.html',
  styleUrl: './home-news-detail-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeNewsDetailModalComponent {
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  readonly news = input.required<NewsItem>();
  readonly liked = input(false);
  readonly imageVisible = input(true);

  readonly closed = output<void>();
  readonly likeRequested = output<NewsItem>();
  readonly imageFailed = output<number>();

  readonly localImageFailed = signal(false);
  readonly paragraphs = computed(() => parseNewsParagraphs(this.news().content));

  constructor() {
    // Mantiene bloqueado el desplazamiento de la página únicamente mientras existe el modal.
    effect((onCleanup) => {
      this.news();
      this.localImageFailed.set(false);
      document.body.classList.add('ui-modal-open');
      onCleanup(() => document.body.classList.remove('ui-modal-open'));
    });

    // El foco inicia en una acción predecible para usuarios de teclado.
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  close(): void {
    this.closed.emit();
  }

  requestLike(): void {
    if (!this.liked()) {
      this.likeRequested.emit(this.news());
    }
  }

  handleImageError(): void {
    this.localImageFailed.set(true);
    this.imageFailed.emit(this.news().id);
  }

  @HostListener('document:keydown.escape')
  closeWithEscape(): void {
    this.close();
  }
}
