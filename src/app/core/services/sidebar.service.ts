import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SidebarService {
  private readonly open = signal(false);
  private readonly closeTickSignal = signal(0);

  isOpen(): boolean {
    return this.open();
  }

  closeTick(): number {
    return this.closeTickSignal();
  }

  openSidebar(): void {
    this.open.set(true);
    document.documentElement.classList.add('no-scroll');
    document.body.classList.add('no-scroll');
  }

  closeSidebar(): void {
    this.open.set(false);
    this.closeTickSignal.update((value) => value + 1);
    document.documentElement.classList.remove('no-scroll');
    document.body.classList.remove('no-scroll');
  }

  toggleSidebar(): void {
    this.isOpen() ? this.closeSidebar() : this.openSidebar();
  }
}

