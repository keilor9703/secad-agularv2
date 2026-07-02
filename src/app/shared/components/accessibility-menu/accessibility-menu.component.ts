import { Component, OnInit, OnDestroy, Input, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccessibilityService, AccessibilityState } from '../../../core/services/accessibility.service';
import { SpeechToTextService } from '../../../core/services/speech-to-text.service';
import { TextToSpeechService } from '../../../core/services/text-to-speech.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SocialDockAccount, SocialDockGroup } from '../../interfaces/social-dock.interface';

@Component({
  selector: 'app-accessibility-menu',
  templateUrl: './accessibility-menu.component.html',
  styleUrls: ['./accessibility-menu.component.scss'],
  standalone: true,
  imports: [CommonModule],
  host: {
    'class': 'accessibility-menu-host'
  }
})
export class AccessibilityMenuComponent implements OnInit, OnDestroy {
  @Input() socialGroups: SocialDockGroup[] = [];

  accessibility: AccessibilityState = {
    darkMode: false,
    fontSize: 2 // nivel por defecto (normal)
  };

  isListening = false;
  isSpeaking = false;
  isHoverMode = false;
  speechError: string | null = null;
  speechToTextAvailable = false;
  textToSpeechAvailable = false;
  socialExpanded = false;
  panelOpen = false;
  selectedGroup: SocialDockGroup | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private accessibilityService: AccessibilityService,
    private speechToTextService: SpeechToTextService,
    private textToSpeechService: TextToSpeechService
  ) {
    this.speechToTextAvailable = this.speechToTextService.isAvailable();
    this.textToSpeechAvailable = this.textToSpeechService.isAvailable();
  }

  ngOnInit(): void {
    // Suscribirse a cambios de accesibilidad
    this.accessibilityService.accessibility$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.accessibility = state;
      });

    // Suscribirse al estado de escucha
    this.speechToTextService.listening$
      .pipe(takeUntil(this.destroy$))
      .subscribe((listening) => {
        this.isListening = listening;
      });

    // Suscribirse al estado de síntesis
    this.textToSpeechService.speaking$
      .pipe(takeUntil(this.destroy$))
      .subscribe((speaking) => {
        this.isSpeaking = speaking;
      });

    // Suscribirse al modo hover
    this.textToSpeechService.hoverMode$
      .pipe(takeUntil(this.destroy$))
      .subscribe((active) => {
        this.isHoverMode = active;
      });

    // Suscribirse a errores de voz a texto
    this.speechToTextService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe((error) => {
        this.speechError = error;
        if (error) {
          // Limpiar el mensaje después de 5 segundos
          setTimeout(() => { this.speechError = null; }, 5000);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Detener cualquier proceso de voz pendiente
    this.speechToTextService.stopListening();
    this.textToSpeechService.disableHoverMode();
  }

  toggleDarkMode(): void {
    this.accessibilityService.toggleDarkMode();
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

  get isFontSizeDefault(): boolean {
    return this.accessibility.fontSize === 2;
  }

  toggleSpeechToText(): void {
    this.speechToTextService.toggleListening();
  }

  toggleTextToSpeech(): void {
    if (this.isHoverMode) {
      this.textToSpeechService.disableHoverMode();
    } else {
      this.textToSpeechService.enableHoverMode();
    }
  }

  get isDarkMode(): boolean {
    return this.accessibility.darkMode;
  }

  get isFontSizeSmall(): boolean {
    return this.accessibility.fontSize === 0;
  }

  get isFontSizeLarge(): boolean {
    return this.accessibility.fontSize === 6;
  }

  get currentFontLevel(): string {
    return `${this.accessibility.fontSize + 1}/7`;
  }

  get fontSizeLabel(): string {
    const labels = ['Muy pequeña', 'Pequeña', 'Normal', 'Mediana', 'Grande', 'Muy grande', 'Extra grande'];
    return labels[this.accessibility.fontSize] || 'Normal';
  }

  toggleSocial(): void {
    this.socialExpanded = !this.socialExpanded;
  }

  openSocialGroup(group: SocialDockGroup): void {
    this.selectedGroup = group;
    this.panelOpen = true;
    document.body.classList.add('ui-modal-open');
  }

  closeSocialPanel(): void {
    this.panelOpen = false;
    this.selectedGroup = null;
    document.body.classList.remove('ui-modal-open');
  }

  getHandle(account: SocialDockAccount): string {
    const raw = (account.handle ?? account.accountName ?? '').trim();
    if (!raw) {
      return '@cuenta';
    }

    if (raw.startsWith('@')) {
      return raw;
    }

    return `@${raw.replace(/\s+/g, '').toLowerCase()}`;
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.panelOpen) {
      this.closeSocialPanel();
    }
  }
}
