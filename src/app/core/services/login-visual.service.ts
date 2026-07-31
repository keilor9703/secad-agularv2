import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LoginVisualItem {
  file: string;
  active: boolean;
  order: number;
  title?: string | null;
  subtitle?: string | null;
  url?: string | null;
}

export interface LoginVisualAdminConfig {
  intervalMs: number;
  items: LoginVisualItem[];
}

export interface LoginVisualPublicItem {
  fileName: string;
  url: string;
  order: number;
  title?: string | null;
  subtitle?: string | null;
}

export interface LoginVisualPublicConfig {
  intervalMs: number;
  items: LoginVisualPublicItem[];
}

export interface LoginVisualUploadResponse {
  success: boolean;
  fileName: string;
  url: string;
  message: string;
  detail?: string;
}

@Injectable({ providedIn: 'root' })
export class LoginVisualService {
  private readonly baseUrl = `${environment.apiBaseUrl}/LoginVisual`;

  constructor(private http: HttpClient) {}

  getPublicConfig(): Observable<LoginVisualPublicConfig> {
    return this.http.get<LoginVisualPublicConfig>(`${this.baseUrl}/config`);
  }

  getAdminConfig(): Observable<LoginVisualAdminConfig> {
    return this.http.get<LoginVisualAdminConfig>(`${this.baseUrl}/admin-config`);
  }

  getImageUrl(fileName: string): string {
    return `${this.baseUrl}/image/${encodeURIComponent(fileName)}`;
  }

  upload(file: File): Observable<LoginVisualUploadResponse> {
    const formData = new FormData();
    formData.append('File', file);
    return this.http.post<LoginVisualUploadResponse>(`${this.baseUrl}/upload`, formData);
  }

  saveConfig(
    payload: LoginVisualAdminConfig,
  ): Observable<{ success: boolean; message: string; detail?: string }> {
    return this.http.post<{ success: boolean; message: string; detail?: string }>(
      `${this.baseUrl}/save-config`,
      payload,
    );
  }

  delete(fileName: string): Observable<{ success: boolean; message: string; detail?: string }> {
    return this.http.delete<{ success: boolean; message: string; detail?: string }>(
      `${this.baseUrl}/${encodeURIComponent(fileName)}`,
    );
  }
}
