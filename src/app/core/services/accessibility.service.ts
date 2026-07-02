import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Estado de configuración de accesibilidad
 * 
 * SISTEMA DE ESCALADO DE FUENTES:
 * ================================
 * fontSize: Nivel numérico de 0 a 6
 *   - 0: Muy pequeño (0.75x)
 *   - 1: Pequeño (0.85x)
 *   - 2: Normal/Default (1.0x) ← DEFECTO
 *   - 3: Mediano (1.15x)
 *   - 4: Grande (1.3x)
 *   - 5: Muy grande (1.5x)
 *   - 6: Extra grande (1.75x)
 * 
 * INTEGRACIÓN AUTOMÁTICA:
 * =======================
 * Este servicio modifica la variable CSS --font-size-scale en :root
 * Cualquier componente que use calc(Npx * var(--font-size-scale))
 * responderá automáticamente a los cambios de accesibilidad.
 * 
 * PARA COMPONENTES NUEVOS:
 * ========================
 * 1. Usa calc() en tus estilos SCSS:
 *    font-size: calc(14px * var(--font-size-scale));
 * 
 * 2. O simplemente hereda del body si no necesitas tamaño específico:
 *    (el body ya tiene font-size con calc aplicado)
 * 
 * 3. NUNCA uses !important en font-size (bloqueará la accesibilidad)
 */
export interface AccessibilityState {
  darkMode: boolean;
  fontSize: number; // 0-6, donde 0=más pequeño, 2=normal, 6=más grande
}

// Constantes para los niveles de escala de fuente
const FONT_SIZE_SCALES = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75];
const DEFAULT_FONT_LEVEL = 2; // nivel normal (escala 1.0)
const MIN_FONT_LEVEL = 0;
const MAX_FONT_LEVEL = 6;

@Injectable({
  providedIn: 'root'
})
export class AccessibilityService {
  private readonly STORAGE_KEY = 'accessibility-settings';
  
  private defaultState: AccessibilityState = {
    darkMode: false,
    fontSize: DEFAULT_FONT_LEVEL
  };

  private accessibilitySubject = new BehaviorSubject<AccessibilityState>(this.loadSettings());
  public accessibility$ = this.accessibilitySubject.asObservable();

  constructor() {
    this.applySettings(this.accessibilitySubject.value);
  }

  private loadSettings(): AccessibilityState {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) {
        return this.defaultState;
      }
      
      const parsed = JSON.parse(saved);
      
      // Migración: convertir valores antiguos string a numéricos
      if (typeof parsed.fontSize === 'string') {
        const oldToNew: Record<string, number> = {
          'small': 1,
          'normal': 2,
          'large': 3
        };
        parsed.fontSize = oldToNew[parsed.fontSize] ?? DEFAULT_FONT_LEVEL;
      }
      
      // Validar que fontSize sea un número válido entre 0-6
      if (typeof parsed.fontSize !== 'number' || 
          parsed.fontSize < MIN_FONT_LEVEL || 
          parsed.fontSize > MAX_FONT_LEVEL) {
        parsed.fontSize = DEFAULT_FONT_LEVEL;
      }
      
      // Garantizar que darkMode sea booleano
      if (typeof parsed.darkMode !== 'boolean') {
        parsed.darkMode = false;
      }
      
      return parsed;
    } catch (error) {
      console.warn('Error al cargar configuración de accesibilidad, usando defaults:', error);
      return this.defaultState;
    }
  }

  private saveSettings(state: AccessibilityState): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch {
      console.warn('No se pudo guardar configuración de accesibilidad');
    }
  }

  private applySettings(state: AccessibilityState): void {
    const htmlElement = document.documentElement;
    
    // Aplicar tema oscuro
    if (state.darkMode) {
      htmlElement.classList.add('dark-mode');
    } else {
      htmlElement.classList.remove('dark-mode');
    }

    // Aplicar tamaño de fuente
    htmlElement.style.setProperty('--font-size-scale', this.getFontSizeScale(state.fontSize));
  }

  private getFontSizeScale(fontSize: number): string {
    // Validar que el nivel esté en rango
    const level = Math.max(MIN_FONT_LEVEL, Math.min(MAX_FONT_LEVEL, Math.floor(fontSize)));
    return FONT_SIZE_SCALES[level].toString();
  }

  toggleDarkMode(): void {
    const currentState = this.accessibilitySubject.value;
    const newState = {
      ...currentState,
      darkMode: !currentState.darkMode
    };
    this.updateSettings(newState);
  }

  increaseFontSize(): void {
    const currentState = this.accessibilitySubject.value;
    if (currentState.fontSize < MAX_FONT_LEVEL) {
      const newState = {
        ...currentState,
        fontSize: currentState.fontSize + 1
      };
      this.updateSettings(newState);
    }
  }

  decreaseFontSize(): void {
    const currentState = this.accessibilitySubject.value;
    if (currentState.fontSize > MIN_FONT_LEVEL) {
      const newState = {
        ...currentState,
        fontSize: currentState.fontSize - 1
      };
      this.updateSettings(newState);
    }
  }

  resetFontSize(): void {
    const currentState = this.accessibilitySubject.value;
    if (currentState.fontSize !== DEFAULT_FONT_LEVEL) {
      this.updateSettings({ ...currentState, fontSize: DEFAULT_FONT_LEVEL });
    }
  }

  setFontSize(level: number): void {
    if (level >= MIN_FONT_LEVEL && level <= MAX_FONT_LEVEL) {
      const currentState = this.accessibilitySubject.value;
      const newState = {
        ...currentState,
        fontSize: level
      };
      this.updateSettings(newState);
    }
  }

  private updateSettings(newState: AccessibilityState): void {
    this.saveSettings(newState);
    this.applySettings(newState);
    this.accessibilitySubject.next(newState);
  }

  getState(): AccessibilityState {
    return this.accessibilitySubject.value;
  }
}
