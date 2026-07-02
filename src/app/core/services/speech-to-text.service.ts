import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

@Injectable({
  providedIn: 'root'
})
export class SpeechToTextService {
  private recognition: SpeechRecognitionLike | null = null;
  private isListening = false;
  /** true mientras recognition está en proceso de terminar (entre onerror/onend) */
  private isEnding = false;
  private listeningSubject = new BehaviorSubject<boolean>(false);
  public listening$ = this.listeningSubject.asObservable();

  private transcriptSubject = new BehaviorSubject<string>('');
  public transcript$ = this.transcriptSubject.asObservable();

  /** Emite mensajes de error legibles para el usuario */
  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  private readonly SpeechRecognitionCtor =
    (window as SpeechRecognitionWindow).SpeechRecognition ||
    (window as SpeechRecognitionWindow).webkitSpeechRecognition;

  constructor() {
    this.initializeRecognition();
  }

  private initializeRecognition(): void {
    if (!this.SpeechRecognitionCtor) {
      console.warn('Speech Recognition API no disponible en este navegador');
      return;
    }

    this.recognition = new this.SpeechRecognitionCtor();
    this.recognition.lang = 'es-ES';
    this.recognition.interimResults = true;
    this.recognition.continuous = false;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.isEnding = false;
      this.listeningSubject.next(true);
      this.transcriptSubject.next('');
      this.errorSubject.next(null);
    };

    this.recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      this.transcriptSubject.next(transcript);
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      this.isListening = false;
      this.isEnding = true;

      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          this.errorSubject.next(
            window.isSecureContext
              ? 'Permiso de micrófono denegado. Haz clic en el candado del navegador y permite el micrófono.'
              : 'Se requiere HTTPS. Accede vía localhost:4200 para usar esta función.'
          );
          break;
        case 'no-speech':
          this.errorSubject.next('No se detectó voz. Intenta de nuevo.');
          break;
        case 'network':
          this.errorSubject.next('Error de red en el reconocimiento de voz.');
          break;
        case 'audio-capture':
          this.errorSubject.next('No se encontró micrófono. Verifica que esté conectado.');
          break;
        default:
          this.errorSubject.next(`Error de reconocimiento: ${event.error}`);
      }

      console.error('Error en reconocimiento de voz:', event.error);
      this.listeningSubject.next(false);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.isEnding = false;
      this.listeningSubject.next(false);
      // Re-crear instancia para evitar InvalidStateError en llamadas posteriores
      this.initializeRecognition();
    };
  }

  startListening(): void {
    if (!this.SpeechRecognitionCtor) {
      this.errorSubject.next('Tu navegador no soporta reconocimiento de voz.');
      return;
    }

    if (!window.isSecureContext) {
      this.errorSubject.next('El reconocimiento de voz requiere HTTPS o localhost. Accede al sitio por localhost:4200.');
      return;
    }

    if (this.isListening || this.isEnding) {
      return;
    }

    try {
      this.errorSubject.next(null);
      this.recognition?.start();
    } catch (err: unknown) {
      console.error('No se pudo iniciar el reconocimiento:', err);
      this.errorSubject.next('No se pudo iniciar el micrófono. Intenta de nuevo.');
      this.isListening = false;
      this.listeningSubject.next(false);
      this.initializeRecognition();
    }
  }

  stopListening(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  toggleListening(): void {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  isAvailable(): boolean {
    return !!this.SpeechRecognitionCtor;
  }
}
