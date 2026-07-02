import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TextToSpeechService {
  private synthesis = window.speechSynthesis;
  private isSpeaking = false;
  private speakingSubject = new BehaviorSubject<boolean>(false);
  public speaking$ = this.speakingSubject.asObservable();

  private hoverModeSubject = new BehaviorSubject<boolean>(false);
  public hoverMode$ = this.hoverModeSubject.asObservable();

  private hoverListener: ((e: MouseEvent) => void) | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private currentTarget: HTMLElement | null = null;

  private lastHoverText = '';
  private lastHoverElement: Element | null = null;
  private speakSession = 0;

  constructor() {}

  speak(text?: string, target?: HTMLElement): void {
    if (!this.synthesis) return;
    const raw = text || this.getPageContent();
    if (!raw) return;
    const normalized = this.normalizeText(raw);
    if (!normalized) return;

    const wasSpeaking = this.isSpeaking || this.synthesis.speaking || this.synthesis.pending;
    const session = ++this.speakSession;

    this.synthesis.cancel();
    this.clearHighlight();
    this.isSpeaking = false;
    this.speakingSubject.next(false);

    this.currentTarget = null;

    const chunks = this.splitIntoChunks(normalized);
    let chunkIndex = 0;

    const speakNext = () => {
      if (session !== this.speakSession) return;
      if (chunkIndex >= chunks.length) { this.finishSpeaking(session); return; }

      const chunk = chunks[chunkIndex++];

      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = 'es-ES';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => {
        if (session !== this.speakSession) return;
        this.isSpeaking = true;
        this.speakingSubject.next(true);
      };

      utterance.onend = () => { if (session !== this.speakSession) return; speakNext(); };

      utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
        if (session !== this.speakSession) return;
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.error('TTS error:', e.error);
        this.finishSpeaking(session);
      };

      this.synthesis.speak(utterance);
    };

    setTimeout(() => { if (session !== this.speakSession) return; speakNext(); }, wasSpeaking ? 120 : 0);
  }

  stop(): void {
    ++this.speakSession;
    this.synthesis?.cancel();
    this.isSpeaking = false;
    this.speakingSubject.next(false);
    this.clearHighlight();
  }

  toggleSpeaking(text?: string): void {
    if (this.isSpeaking) this.stop(); else this.speak(text);
  }

  isAvailable(): boolean { return !!this.synthesis; }
  isSpeakingNow(): boolean { return this.isSpeaking; }

  enableHoverMode(): void {
    if (this.hoverModeSubject.value) return;
    this.hoverModeSubject.next(true);

    this.hoverListener = (e: MouseEvent) => {
      const rawTarget = e.target as Element;
      if (rawTarget.closest('app-accessibility-menu') || rawTarget.closest('.accessibility-menu-host')) return;

      const { text, element: resolvedEl } = this.extractHoverData(rawTarget);
      if (!text || !resolvedEl) return;
      if (text === this.lastHoverText) return;
      if (this.lastHoverElement && resolvedEl.contains(this.lastHoverElement)) return;

      this.lastHoverText    = text;
      this.lastHoverElement = resolvedEl;
      if (this.hoverTimer) clearTimeout(this.hoverTimer);

      const capturedText = text;
      const capturedEl   = resolvedEl;
      this.hoverTimer = setTimeout(() => {
        if (capturedEl instanceof HTMLElement) this.speak(capturedText, capturedEl);
      }, 400);
    };

    document.addEventListener('mouseover', this.hoverListener);
  }

  disableHoverMode(): void {
    if (!this.hoverModeSubject.value) return;
    this.hoverModeSubject.next(false);
    if (this.hoverListener) { document.removeEventListener('mouseover', this.hoverListener); this.hoverListener = null; }
    if (this.hoverTimer) { clearTimeout(this.hoverTimer); this.hoverTimer = null; }
    this.lastHoverText    = '';
    this.lastHoverElement = null;
    this.stop();
  }

  private extractHoverData(el: Element): { text: string; element: Element | null } {
    const SVG_TAGS      = new Set(['SVG','PATH','G','CIRCLE','LINE','POLYGON','POLYLINE','RECT','DEFS','USE','SYMBOL','ELLIPSE','TEXT']);
    const SKIP_TAGS     = new Set(['SCRIPT','STYLE','HEAD','HTML','BODY']);
    const LEAF_TAGS     = new Set(['BUTTON','A','P','H1','H2','H3','H4','H5','H6','LABEL','LI','TD','TH','FIGCAPTION','BLOCKQUOTE','DT','DD','CAPTION','SUMMARY']);
    const BLOCK_SEL     = 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,dl,ol,ul,table';
    const CONTAINER_TAGS = new Set(['DIV','ARTICLE','SECTION','MAIN','ASIDE','HEADER','FOOTER','NAV']);

    if (el instanceof HTMLImageElement && el.alt.trim()) return { text: el.alt.trim(), element: el };

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const text = this.extractFormElementText(el);
      return { text, element: text ? el : null };
    }

    const ceHost = el.closest('[contenteditable="true"]');
    if (ceHost) {
      const blockEl = el.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote') as HTMLElement | null;
      if (blockEl) {
        const text = this.extractFromHereToEnd(blockEl, ceHost as HTMLElement);
        return { text, element: text ? blockEl : null };
      }
      const text = this.extractBlockText(ceHost as HTMLElement);
      return { text, element: text ? ceHost as HTMLElement : null };
    }

    let current: Element | null = el;
    while (current && current !== document.body) {
      const tag = current.tagName.toUpperCase();
      if (SKIP_TAGS.has(tag)) return { text: '', element: null };
      if (!SVG_TAGS.has(tag)) {
        const label = (current.getAttribute('aria-label') || current.getAttribute('title'))?.trim();
        if (label) return { text: label, element: current };
        if (LEAF_TAGS.has(tag)) {
          const parent = current.parentElement;
          const text = parent
            ? this.extractFromHereToEnd(current as HTMLElement, parent)
            : this.extractBlockText(current as HTMLElement);
          if (text.length > 1) return { text, element: current };
        }
        if (CONTAINER_TAGS.has(tag)) {
          if (!(current as HTMLElement).querySelector(BLOCK_SEL)) {
            const text = this.extractBlockText(current as HTMLElement);
            if (text.length > 1) return { text, element: current };
          }
        }
      }
      current = current.parentElement;
    }
    return { text: '', element: null };
  }

  private extractFormElementText(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
    const ariaLabel = el.getAttribute('aria-label')?.trim();
    if (ariaLabel) return ariaLabel;
    let labelText = '';
    if (el.id) labelText = document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`)?.innerText?.trim() ?? '';
    if (!labelText) {
      const wrap = el.closest('label');
      if (wrap) {
        const clone = wrap.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input,textarea,select').forEach(n => n.remove());
        labelText = clone.innerText?.trim() ?? '';
      }
    }
    const placeholder = (el as HTMLInputElement).placeholder?.trim() ?? '';
    const value = el instanceof HTMLSelectElement
      ? (el.options[el.selectedIndex]?.text ?? '').trim()
      : (el as HTMLInputElement | HTMLTextAreaElement).value?.trim() ?? '';
    const parts: string[] = [];
    if (labelText)             parts.push(labelText);
    if (placeholder && !value) parts.push(`marcador: ${placeholder}`);
    if (value)                  parts.push(`valor: ${value}`);
    return parts.join('. ');
  }

  private extractFromHereToEnd(startEl: HTMLElement, container: HTMLElement): string {
    const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote';
    const allBlocks = Array.from(container.querySelectorAll<HTMLElement>(`:scope > ${BLOCK_SEL}`));
    if (allBlocks.length === 0) return this.normalizeText(startEl.innerText ?? '');
    const startIndex = allBlocks.indexOf(startEl);
    if (startIndex === -1) return this.normalizeText(startEl.innerText ?? '');
    return allBlocks
      .slice(startIndex)
      .map(b => this.normalizeText(b.innerText ?? ''))
      .filter(t => t.length > 0)
      .join(' ');
  }

  private extractBlockText(el: HTMLElement): string {
    const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote';
    const directBlocks = Array.from(el.querySelectorAll<HTMLElement>(`:scope > ${BLOCK_SEL}`));
    if (directBlocks.length > 0) {
      return directBlocks.map(c => this.normalizeText(c.innerText ?? '')).filter(t => t.length > 0).join('. ');
    }
    return this.normalizeText(el.innerText ?? '');
  }

  private normalizeText(raw: string): string {
    return raw
      .replace(/\u00A0/g, ' ')
      // Eliminar puntos de abreviatura antes de caracteres especiales: N.° → N°, Sr.º → Srº
      .replace(/\.(?=[^\w\s\n])/g, '')
      .replace(/([^.!?;])\n+/g, '$1. ')
      .replace(/[.!?;]\n+/g, m => m[0] + ' ')
      .replace(/[\r\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private splitIntoChunks(text: string, maxLen = 600): string[] {
    if (text.length <= maxLen) return [text];

    const result: string[] = [];
    let remaining = text;

    while (remaining.length > maxLen) {
      // Tomar un poco más del máximo para encontrar el mejor punto de corte
      const slice = remaining.slice(0, maxLen);
      let cutAt = -1;

      // 1. Último fin de oración real dentro del slice: [.!?] seguido de espacio
      const sentenceRe = /[.!?]\s+/g;
      let m: RegExpExecArray | null;
      let lastSentenceEnd = -1;
      while ((m = sentenceRe.exec(slice)) !== null) {
        lastSentenceEnd = m.index + m[0].length;
      }
      if (lastSentenceEnd > 30) cutAt = lastSentenceEnd;

      // 2. Último punto y coma
      if (cutAt === -1) {
        const idx = slice.lastIndexOf('; ');
        if (idx > 30) cutAt = idx + 2;
      }

      // 3. Última coma (como fallback razonable)
      if (cutAt === -1) {
        const idx = slice.lastIndexOf(', ');
        if (idx > 30) cutAt = idx + 2;
      }

      // 4. Último espacio (emergencia)
      if (cutAt === -1) {
        const idx = slice.lastIndexOf(' ');
        cutAt = idx > 30 ? idx + 1 : maxLen;
      }

      const chunk = remaining.slice(0, cutAt).trim();
      if (chunk.length > 0) result.push(chunk);
      remaining = remaining.slice(cutAt).trim();
    }

    if (remaining.length > 0) result.push(remaining.trim());
    return result.filter(c => c.length > 0);
  }

  private clearHighlight(): void {
    this.currentTarget = null;
  }

  private finishSpeaking(session: number): void {
    if (session !== this.speakSession) return;
    this.isSpeaking = false;
    this.speakingSubject.next(false);
    this.clearHighlight();
  }

  private getPageContent(): string {
    const main = document.querySelector('.content') || document.querySelector('main');
    return (main ?? document.body).textContent ?? '';
  }
}
