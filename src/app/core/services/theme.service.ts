import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'sisge-theme';
  
  private darkModeSubject = new BehaviorSubject<boolean>(false);
  darkMode$ = this.darkModeSubject.asObservable();

  constructor() {
    this.loadTheme();
  }

  private loadTheme(): void {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      this.darkModeSubject.next(saved === 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.darkModeSubject.next(prefersDark);
    }
    this.applyTheme();
  }

  toggle(): void {
    this.darkModeSubject.next(!this.darkModeSubject.value);
    this.applyTheme();
    this.saveTheme();
  }

  private applyTheme(): void {
    const isDark = this.darkModeSubject.value;
    document.documentElement.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('dark-mode', isDark);
  }

  private saveTheme(): void {
    localStorage.setItem(this.STORAGE_KEY, this.darkModeSubject.value ? 'dark' : 'light');
  }

  get isDarkMode(): boolean {
    return this.darkModeSubject.value;
  }
}
