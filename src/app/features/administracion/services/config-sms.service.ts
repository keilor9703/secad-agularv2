import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type ProveedorSms = 'INFOBIP' | 'INALAMBRIA_EXPRESS';

export interface DtoConfigSms {
  proveedor: ProveedorSms;
  baseUrl?: string | null;
  sender?: string | null;
  tieneApiKey: boolean;
  apiKeyMascara?: string | null;
  usuarioModifica?: string | null;
  fechaModifica?: string | null;
}

export interface DtoConfigSmsRequest {
  proveedor: ProveedorSms;
  baseUrl?: string | null;
  /** Vacío = mantener el api_key ya guardado. */
  apiKey?: string | null;
  sender?: string | null;
}

export interface DtoConfigSmsResult {
  success: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ConfigSmsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/ConfigSms`;

  get(): Observable<{ success: boolean; data: DtoConfigSms }> {
    return this.http.get<{ success: boolean; data: DtoConfigSms }>(this.baseUrl);
  }

  actualizar(request: DtoConfigSmsRequest): Observable<DtoConfigSmsResult> {
    return this.http.put<DtoConfigSmsResult>(this.baseUrl, request);
  }

  probar(numeroTelefono: string): Observable<DtoConfigSmsResult> {
    return this.http.post<DtoConfigSmsResult>(`${this.baseUrl}/probar`, { numeroTelefono });
  }
}
