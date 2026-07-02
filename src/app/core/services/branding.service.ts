import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BrandingPublicConfig {
  sistema?: string;
  nombreSistema?: string;
  systemName: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
}

export interface BrandingAdminConfig extends BrandingPublicConfig {
  logoFileName?: string | null;
  faviconFileName?: string | null;
}

export interface BrandingUploadResponse {
  success: boolean;
  fileName: string;
  logoUrl: string;
  faviconUrl?: string;
  message: string;
  detail?: string;
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Branding`;

  constructor(private http: HttpClient) {}

  getPublicConfig(): Observable<BrandingPublicConfig> {
    return this.http.get<BrandingPublicConfig>(`${this.baseUrl}/config`);
  }

  getAdminConfig(): Observable<BrandingAdminConfig> {
    return this.http.get<BrandingAdminConfig>(`${this.baseUrl}/admin-config`);
  }

  uploadLogo(file: File): Observable<BrandingUploadResponse> {
    const formData = new FormData();
    formData.append('File', file);
    return this.http.post<BrandingUploadResponse>(`${this.baseUrl}/upload-logo`, formData);
  }

  uploadFavicon(file: File): Observable<BrandingUploadResponse> {
    const formData = new FormData();
    formData.append('File', file);
    return this.http.post<BrandingUploadResponse>(`${this.baseUrl}/upload-favicon`, formData);
  }

  saveConfig(payload: { sistema: string; nombreSistema: string; logoFileName?: string | null; faviconFileName?: string | null }): Observable<{ success: boolean; message: string; detail?: string }> {
    return this.http.post<{ success: boolean; message: string; detail?: string }>(`${this.baseUrl}/save-config`, payload);
  }
}

