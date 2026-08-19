import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  afterNextRender,
  computed,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

import { DtoLineaMando } from '../../../../core/services/linea-mando.service';

@Component({
  selector: 'app-home-command-line',
  standalone: true,
  templateUrl: './home-command-line.component.html',
  styleUrl: './home-command-line.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeCommandLineComponent implements OnDestroy {
  private readonly autoplayDelay = 5600;
  private readonly viewport = viewChild<ElementRef<HTMLDivElement>>('viewport');
  private readonly memberCards = viewChildren<ElementRef<HTMLButtonElement>>('memberCard');

  readonly members = input.required<readonly DtoLineaMando[]>();
  readonly visibleMembers = computed(() => this.members().slice(0, 4));
  readonly activeIndex = signal(0);
  readonly selectedMember = signal<DtoLineaMando | null>(null);
  readonly failedPhotos = signal<ReadonlySet<number>>(new Set<number>());

  private autoplayTimer?: ReturnType<typeof setInterval>;
  private scrollFrame?: number;

  constructor() {
    // El movimiento inicia cuando Angular ya terminó de proyectar las tarjetas.
    afterNextRender(() => this.startAutoplay());
  }

  previousSlide(): void {
    this.moveByCard(-1, true);
  }

  nextSlide(): void {
    this.moveByCard(1, true);
  }

  selectSlide(index: number): void {
    this.moveTo(index, true);
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

  syncActiveCard(): void {
    const viewport = this.viewport()?.nativeElement;
    const cards = this.memberCards();
    if (!viewport || cards.length === 0 || typeof window === 'undefined') {
      return;
    }

    if (this.scrollFrame !== undefined) {
      window.cancelAnimationFrame(this.scrollFrame);
    }

    this.scrollFrame = window.requestAnimationFrame(() => {
      const currentLeft = viewport.scrollLeft;
      const closestIndex = cards.reduce((closest, card, index) => {
        const currentDistance = Math.abs(card.nativeElement.offsetLeft - currentLeft);
        const closestDistance = Math.abs(cards[closest].nativeElement.offsetLeft - currentLeft);
        return currentDistance < closestDistance ? index : closest;
      }, 0);

      this.activeIndex.set(closestIndex);
    });
  }

  getFullName(member: DtoLineaMando): string {
    return `${member.nombre ?? ''} ${member.apellidos ?? ''}`.trim() || 'Nombre no disponible';
  }

  getPosition(member: DtoLineaMando): string {
    const position = member.cargo?.trim();
    return position ? this.toTitleCase(position) : 'Cargo no disponible';
  }

  getInitials(member: DtoLineaMando): string {
    return (
      `${member.nombre?.charAt(0) ?? ''}${member.apellidos?.charAt(0) ?? ''}`.toUpperCase() || 'LM'
    );
  }

  getPhoto(member: DtoLineaMando): string {
    const source = member.fotoBase64?.trim() ?? '';
    if (!source) {
      return '';
    }
    return source.startsWith('data:') ? source : `data:image/jpeg;base64,${source}`;
  }

  hasPhoto(member: DtoLineaMando): boolean {
    return Boolean(member.fotoBase64?.trim()) && !this.failedPhotos().has(member.idLineaMando);
  }

  markPhotoAsFailed(memberId: number): void {
    this.failedPhotos.update((current) => new Set([...current, memberId]));
  }

  openProfile(member: DtoLineaMando): void {
    this.pauseAutoplay();
    this.selectedMember.set(member);
    document.body.classList.add('ui-modal-open');
  }

  closeProfile(): void {
    this.selectedMember.set(null);
    document.body.classList.remove('ui-modal-open');
    this.resumeAutoplay();
  }

  ngOnDestroy(): void {
    this.pauseAutoplay();
    if (this.scrollFrame !== undefined && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.scrollFrame);
    }
    document.body.classList.remove('ui-modal-open');
  }

  @HostListener('document:visibilitychange')
  handleVisibilityChange(): void {
    if (document.hidden) {
      this.pauseAutoplay();
      return;
    }
    this.resumeAutoplay();
  }

  @HostListener('document:keydown.escape')
  closeWithEscape(): void {
    if (this.selectedMember()) {
      this.closeProfile();
    }
  }

  private toTitleCase(value: string): string {
    return value
      .toLocaleLowerCase('es-CO')
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toLocaleUpperCase('es-CO') + word.slice(1))
      .join(' ');
  }

  private moveTo(index: number, restartTimer = false): void {
    const total = this.visibleMembers().length;
    if (total === 0) {
      return;
    }

    const normalizedIndex = ((index % total) + total) % total;
    this.activeIndex.set(normalizedIndex);
    this.scrollToCard(normalizedIndex);

    if (restartTimer) {
      this.pauseAutoplay();
      this.startAutoplay();
    }
  }

  private scrollToCard(index: number): void {
    const viewport = this.viewport()?.nativeElement;
    const card = this.memberCards()[index]?.nativeElement;
    if (!viewport || !card || typeof window === 'undefined') {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTo({ left: card.offsetLeft, behavior: 'smooth' });
    });
  }

  private startAutoplay(): void {
    if (
      this.autoplayTimer ||
      this.visibleMembers().length < 2 ||
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    this.autoplayTimer = window.setInterval(() => {
      this.moveByCard(1);
    }, this.autoplayDelay);
  }

  private moveByCard(direction: -1 | 1, restartTimer = false): void {
    const viewport = this.viewport()?.nativeElement;
    const cards = this.memberCards();
    if (!viewport || cards.length < 2) {
      return;
    }

    const firstCard = cards[0].nativeElement;
    const secondCard = cards[1].nativeElement;
    const step = Math.max(1, secondCard.offsetLeft - firstCard.offsetLeft);
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
}
