import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type AlertType = 'success' | 'warning' | 'error' | 'info';

export interface AlertMessage {
  type: AlertType;
  title: string;
  message: string;
  okText?: string;
}

@Injectable({ providedIn: 'root' })
export class AlertService {
  private subject = new Subject<AlertMessage>();
  alert$ = this.subject.asObservable();

  show(type: AlertType, title: string, message: string, okText = 'OK'): void {
    this.subject.next({ type, title, message, okText });
  }

  warning(title: string, message: string, okText = 'OK'): void {
    this.show('warning', title, message, okText);
  }

  error(title: string, message: string, okText = 'OK'): void {
    this.show('error', title, message, okText);
  }

  info(title: string, message: string, okText = 'OK'): void {
    this.show('info', title, message, okText);
  }

  success(title: string, message: string, okText = 'OK'): void {
    this.show('success', title, message, okText);
  }
}
