import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AccessibilityService } from '../../../core/services/accessibility.service';
import { SpeechToTextService } from '../../../core/services/speech-to-text.service';
import { TextToSpeechService } from '../../../core/services/text-to-speech.service';
import { SocialDockAccount, SocialDockGroup } from '../../interfaces/social-dock.interface';

interface FabPosition {
  x: number;
  y: number;
}

interface FabViewport {
  width: number;
  height: number;
}

interface StoredFabPosition {
  xRatio: number;
  yRatio: number;
}

interface DragOrigin {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  fabX: number;
  fabY: number;
}

interface FabActionOffset {
  x: number;
  y: number;
}

type HorizontalDirection = 'left' | 'right';
type VerticalDirection = 'up' | 'down';

const FAB_SIZE = 52;
const FAB_MARGIN = 12;
const DEFAULT_RIGHT_OFFSET = 22;
const DEFAULT_BOTTOM_OFFSET = 76;
const DRAG_THRESHOLD = 6;
const POSITION_STORAGE_KEY = 'accessibility-fab-position-v1';

/**
 * Curva base del flower speed dial.
 * En la posición predeterminada las acciones crecen hacia arriba y a la izquierda.
 * La distancia entre centros permanece entre 62 px y 68 px para conservar ritmo visual.
 */
const ACTION_OFFSETS: readonly FabActionOffset[] = [
  { x: -68, y: -4 },
  { x: -116, y: -48 },
  { x: -108, y: -110 },
  { x: -58, y: -156 },
  { x: 0, y: -184 },
];

@Component({
  selector: 'app-accessibility-menu',
  standalone: true,
  imports: [A11yModule],
  templateUrl: './accessibility-menu.component.html',
  styleUrl: './accessibility-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'accessibility-menu-host',
  },
})
export class AccessibilityMenuComponent implements OnDestroy {
  readonly socialGroups = input<SocialDockGroup[]>([]);
  readonly fabMain = viewChild<ElementRef<HTMLButtonElement>>('fabMain');

  private readonly accessibilityService = inject(AccessibilityService);
  private readonly speechToTextService = inject(SpeechToTextService);
  private readonly textToSpeechService = inject(TextToSpeechService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  readonly accessibility = toSignal(this.accessibilityService.accessibility$, {
    initialValue: this.accessibilityService.getState(),
  });
  readonly isListening = toSignal(this.speechToTextService.listening$, {
    initialValue: false,
  });
  readonly isSpeaking = toSignal(this.textToSpeechService.speaking$, {
    initialValue: false,
  });
  readonly isHoverMode = toSignal(this.textToSpeechService.hoverMode$, {
    initialValue: false,
  });

  readonly speechToTextAvailable = this.speechToTextService.isAvailable();
  readonly textToSpeechAvailable = this.textToSpeechService.isAvailable();

  readonly dialOpen = signal(false);
  readonly fontPanelOpen = signal(false);
  readonly socialPanelOpen = signal(false);
  readonly drawerOpen = signal(false);
  readonly selectedGroup = signal<SocialDockGroup | null>(null);
  readonly speechError = signal<string | null>(null);
  readonly dragging = signal(false);
  readonly position = signal<FabPosition | null>(null);
  readonly viewport = signal<FabViewport>({ width: 0, height: 0 });

  readonly isDarkMode = computed(() => this.accessibility().darkMode);
  readonly isFontSizeDefault = computed(() => this.accessibility().fontSize === 2);
  readonly isFontSizeSmall = computed(() => this.accessibility().fontSize === 0);
  readonly isFontSizeLarge = computed(() => this.accessibility().fontSize === 6);
  readonly currentFontLevel = computed(() => `${this.accessibility().fontSize + 1}/7`);
  readonly fontSizeLabel = computed(() => {
    const labels = [
      'Muy pequeña',
      'Pequeña',
      'Normal',
      'Mediana',
      'Grande',
      'Muy grande',
      'Extra grande',
    ];

    return labels[this.accessibility().fontSize] ?? 'Normal';
  });
  readonly hasSubpanel = computed(() => this.fontPanelOpen() || this.socialPanelOpen());
  readonly actionsInteractive = computed(
    () => this.dialOpen() && !this.hasSubpanel() && !this.dragging(),
  );
  readonly horizontalDirection = computed<HorizontalDirection>(() => {
    const position = this.position();
    const viewport = this.viewport();

    if (!position || !viewport.width) {
      return 'left';
    }

    return position.x + FAB_SIZE / 2 > viewport.width / 2 ? 'left' : 'right';
  });
  readonly verticalDirection = computed<VerticalDirection>(() => {
    const position = this.position();
    const viewport = this.viewport();

    if (!position || !viewport.height) {
      return 'up';
    }

    return position.y + FAB_SIZE / 2 > viewport.height / 2 ? 'up' : 'down';
  });

  private dragOrigin: DragOrigin | null = null;
  private suppressNextClick = false;
  private speechErrorTimer: number | null = null;

  constructor() {
    this.speechToTextService.error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => this.handleSpeechError(error));

    afterNextRender(() => this.initializePosition());
  }

  ngOnDestroy(): void {
    const browserWindow = this.document.defaultView;

    if (browserWindow && this.speechErrorTimer !== null) {
      browserWindow.clearTimeout(this.speechErrorTimer);
    }

    this.document.body.classList.remove('ui-modal-open');
    this.speechToTextService.stopListening();
    this.textToSpeechService.disableHoverMode();
  }

  toggleDial(): void {
    if (this.suppressNextClick) {
      return;
    }

    this.dialOpen.update((open) => !open);

    if (!this.dialOpen()) {
      this.closeSubpanels();
    }
  }

  closeDial(): void {
    this.dialOpen.set(false);
    this.closeSubpanels();
  }

  toggleDarkMode(): void {
    this.accessibilityService.toggleDarkMode();
    this.closeDial();
  }

  openFontPanel(): void {
    this.socialPanelOpen.set(false);
    this.fontPanelOpen.set(true);
  }

  increaseFontSize(): void {
    this.accessibilityService.increaseFontSize();
  }

  decreaseFontSize(): void {
    this.accessibilityService.decreaseFontSize();
  }

  resetFontSize(): void {
    this.accessibilityService.resetFontSize();
  }

  toggleSpeechToText(): void {
    this.speechToTextService.toggleListening();
    this.closeDial();
  }

  toggleTextToSpeech(): void {
    if (this.isHoverMode()) {
      this.textToSpeechService.disableHoverMode();
    } else {
      this.textToSpeechService.enableHoverMode();
    }

    this.closeDial();
  }

  openSocialPanel(): void {
    if (!this.socialGroups().length) {
      return;
    }

    this.fontPanelOpen.set(false);
    this.socialPanelOpen.set(true);
  }

  returnToActions(): void {
    this.closeSubpanels();
  }

  openSocialGroup(group: SocialDockGroup): void {
    this.selectedGroup.set(group);
    this.drawerOpen.set(true);
    this.closeDial();
    this.document.body.classList.add('ui-modal-open');
  }

  closeSocialDrawer(): void {
    this.drawerOpen.set(false);
    this.selectedGroup.set(null);
    this.document.body.classList.remove('ui-modal-open');
    this.document.defaultView?.setTimeout(() => this.fabMain()?.nativeElement.focus());
  }

  getHandle(account: SocialDockAccount): string {
    const raw = (account.handle ?? account.accountName ?? '').trim();

    if (!raw) {
      return '@cuenta';
    }

    return raw.startsWith('@') ? raw : `@${raw.replace(/\s+/g, '').toLowerCase()}`;
  }

  actionX(index: number): number {
    const multiplier = this.horizontalDirection() === 'left' ? 1 : -1;
    return (ACTION_OFFSETS[index]?.x ?? 0) * multiplier * this.actionScale();
  }

  actionY(index: number): number {
    const multiplier = this.verticalDirection() === 'up' ? 1 : -1;
    return (ACTION_OFFSETS[index]?.y ?? 0) * multiplier * this.actionScale();
  }

  actionDelay(index: number): string {
    return `${index * 38}ms`;
  }

  onFabPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const currentPosition = this.ensurePosition();
    this.dragOrigin = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      fabX: currentPosition.x,
      fabY: currentPosition.y,
    };

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentPointerMove(event: PointerEvent): void {
    const origin = this.dragOrigin;

    if (!origin || origin.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - origin.pointerX;
    const deltaY = event.clientY - origin.pointerY;

    if (!this.dragging() && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) {
      return;
    }

    if (!this.dragging()) {
      this.dragging.set(true);
      this.closeDial();
    }

    event.preventDefault();
    this.position.set(this.clampPosition(origin.fabX + deltaX, origin.fabY + deltaY));
  }

  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  onDocumentPointerUp(event: PointerEvent): void {
    const origin = this.dragOrigin;

    if (!origin || origin.pointerId !== event.pointerId) {
      return;
    }

    const target = event.target as HTMLElement | null;

    if (target?.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    if (this.dragging()) {
      this.persistPosition();
      this.suppressNextClick = true;
      this.document.defaultView?.setTimeout(() => {
        this.suppressNextClick = false;
      });
    }

    this.dragging.set(false);
    this.dragOrigin = null;
  }

  resetPosition(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.position.set(this.defaultPosition());
    this.persistPosition();
    this.closeDial();
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.dialOpen()) {
      return;
    }

    const target = event.target as Node | null;

    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.closeDial();
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const browserWindow = this.document.defaultView;

    if (!browserWindow) {
      return;
    }

    this.viewport.set({
      width: browserWindow.innerWidth,
      height: browserWindow.innerHeight,
    });

    const currentPosition = this.position();

    if (currentPosition) {
      this.position.set(this.clampPosition(currentPosition.x, currentPosition.y));
      this.persistPosition();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.drawerOpen()) {
      this.closeSocialDrawer();
      return;
    }

    if (this.hasSubpanel()) {
      this.returnToActions();
      return;
    }

    this.closeDial();
  }

  private initializePosition(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const browserWindow = this.document.defaultView;

    if (!browserWindow) {
      return;
    }

    this.viewport.set({
      width: browserWindow.innerWidth,
      height: browserWindow.innerHeight,
    });
    this.position.set(this.restorePosition() ?? this.defaultPosition());
  }

  private ensurePosition(): FabPosition {
    const currentPosition = this.position();

    if (currentPosition) {
      return currentPosition;
    }

    const fallback = this.defaultPosition();
    this.position.set(fallback);
    return fallback;
  }

  private defaultPosition(): FabPosition {
    const viewport = this.viewport();

    return this.clampPosition(
      viewport.width - FAB_SIZE - DEFAULT_RIGHT_OFFSET,
      viewport.height - FAB_SIZE - DEFAULT_BOTTOM_OFFSET,
    );
  }

  private clampPosition(x: number, y: number): FabPosition {
    const viewport = this.viewport();
    const maxX = Math.max(FAB_MARGIN, viewport.width - FAB_SIZE - FAB_MARGIN);
    const maxY = Math.max(FAB_MARGIN, viewport.height - FAB_SIZE - FAB_MARGIN);

    return {
      x: Math.min(Math.max(x, FAB_MARGIN), maxX),
      y: Math.min(Math.max(y, FAB_MARGIN), maxY),
    };
  }

  private persistPosition(): void {
    const browserWindow = this.document.defaultView;
    const currentPosition = this.position();

    if (!browserWindow || !currentPosition) {
      return;
    }

    const viewport = this.viewport();
    const availableX = Math.max(1, viewport.width - FAB_SIZE - FAB_MARGIN * 2);
    const availableY = Math.max(1, viewport.height - FAB_SIZE - FAB_MARGIN * 2);
    const storedPosition: StoredFabPosition = {
      xRatio: (currentPosition.x - FAB_MARGIN) / availableX,
      yRatio: (currentPosition.y - FAB_MARGIN) / availableY,
    };

    try {
      browserWindow.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(storedPosition));
    } catch {
      // El movimiento sigue funcionando aunque el navegador bloquee localStorage.
    }
  }

  private restorePosition(): FabPosition | null {
    const browserWindow = this.document.defaultView;

    if (!browserWindow) {
      return null;
    }

    try {
      const rawPosition = browserWindow.localStorage.getItem(POSITION_STORAGE_KEY);

      if (!rawPosition) {
        return null;
      }

      const storedPosition = JSON.parse(rawPosition) as Partial<StoredFabPosition>;

      if (
        typeof storedPosition.xRatio !== 'number' ||
        typeof storedPosition.yRatio !== 'number' ||
        !Number.isFinite(storedPosition.xRatio) ||
        !Number.isFinite(storedPosition.yRatio)
      ) {
        return null;
      }

      const viewport = this.viewport();
      const availableX = Math.max(1, viewport.width - FAB_SIZE - FAB_MARGIN * 2);
      const availableY = Math.max(1, viewport.height - FAB_SIZE - FAB_MARGIN * 2);

      return this.clampPosition(
        FAB_MARGIN + Math.min(Math.max(storedPosition.xRatio, 0), 1) * availableX,
        FAB_MARGIN + Math.min(Math.max(storedPosition.yRatio, 0), 1) * availableY,
      );
    } catch {
      return null;
    }
  }

  private closeSubpanels(): void {
    this.fontPanelOpen.set(false);
    this.socialPanelOpen.set(false);
  }

  /**
   * Reduce la curva en móvil y orientación horizontal para evitar desbordes.
   */
  private actionScale(): number {
    const viewport = this.viewport();

    if (viewport.height < 420) {
      return 0.68;
    }

    if (viewport.width < 480) {
      return 0.82;
    }

    return 1;
  }

  private handleSpeechError(error: string | null): void {
    const browserWindow = this.document.defaultView;

    this.speechError.set(error);

    if (!browserWindow) {
      return;
    }

    if (this.speechErrorTimer !== null) {
      browserWindow.clearTimeout(this.speechErrorTimer);
      this.speechErrorTimer = null;
    }

    if (error) {
      this.speechErrorTimer = browserWindow.setTimeout(() => {
        this.speechError.set(null);
        this.speechErrorTimer = null;
      }, 5000);
    }
  }
}
