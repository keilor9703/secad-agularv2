import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SidebarService {
  private readonly document = inject(DOCUMENT);
  private readonly openState = signal(false);
  private readonly closeTickSignal = signal(0);

  readonly isOpen = this.openState.asReadonly();
  readonly closeTick = this.closeTickSignal.asReadonly();

  openSidebar(): void {
    this.openState.set(true);
    this.setDocumentScrollLocked(true);
  }

  closeSidebar(): void {
    if (!this.openState()) {
      return;
    }

    this.openState.set(false);
    this.closeTickSignal.update((value) => value + 1);
    this.setDocumentScrollLocked(false);
  }

  toggleSidebar(): void {
    this.isOpen() ? this.closeSidebar() : this.openSidebar();
  }

  private setDocumentScrollLocked(locked: boolean): void {
    const action = locked ? 'add' : 'remove';
    this.document.documentElement.classList[action]('no-scroll');
    this.document.body?.classList[action]('no-scroll');
  }
}
