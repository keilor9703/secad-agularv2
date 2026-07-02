import {Injectable} from '@angular/core';
import { Subject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  type: ToastType;
  title: string;
  message: string;
  duration?: number; // in milliseconds
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
    private toastSubject = new Subject<ToastMessage>(); 
    toast$ = this.toastSubject.asObservable();
    show(type: ToastType, title: string, message: string, duration = 3500): void {
    this.toastSubject.next({ type, title, message, duration });
  }

  success(title: string, message: string, duration = 3500): void {
    this.show('success', title, message, duration);
  }

  info(title: string, message: string, duration = 3500): void {
    this.show('info', title, message, duration);
  }

  warning(title: string, message: string, duration = 4000): void {
    this.show('warning', title, message, duration);
  }

  error(title: string, message: string, duration = 4500): void {
    this.show('error', title, message, duration);
  }
}