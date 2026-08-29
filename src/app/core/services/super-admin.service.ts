import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TenantPublico {
  id: number;
  codDane: string;
  codUnidad?: string;
  nombre: string;
  departamento?: string;
  municipio?: string;
  categoria?: string;
  activo: boolean;
  suspendido: boolean;
  /** Sitio de grabación principal (cad_sitios_grabacion.consecutivo) */
  sitioGraba?: number | null;
  fechaCreacion?: string;
  fechaModificacion?: string;
  // Salud CAD (V23)
  nivelOperacion: number;   // 1=Normal, 2=Degradado, 3=Offline
  latenciaMs?: number;
  ultimaSincro?: string;
  incidentesActivos: number;
  observaciones?: string;
}

export interface TenantRequest {
  codDane: string;
  codUnidad?: string;
  nombre: string;
  departamento?: string;
  municipio?: string;
  categoria: string;
  /** Sitio de grabación principal del CAD (consecutivo en cad_sitios_grabacion) */
  sitioGraba?: number | null;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUsername: string;
  dbPassword?: string;
  activo: boolean;
}

export interface SaludHistorial {
  id: string;
  codDane: string;
  nivelOperacion: number;
  latenciaMs?: number;
  observacion?: string;
  registradoEn: string;
}

export interface ContextSwitchResult {
  success: boolean;
  token: string;
  codDane: string;
  nombreCad: string;
  homeCodDane: string;
}

@Injectable({ providedIn: 'root' })
export class SuperAdminService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/super`;

  // ── Tenant management ──────────────────────────────────────────────────────

  getTenants(): Observable<TenantPublico[]> {
    return this.http.get<TenantPublico[]>(`${this.base}/tenants`);
  }

  createTenant(request: TenantRequest): Observable<{ success: boolean; message: string; codDane?: string }> {
    return this.http.post<{ success: boolean; message: string; codDane?: string }>(
      `${this.base}/tenants`, request
    );
  }

  updateTenant(id: number, request: TenantRequest): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.base}/tenants/${id}`, request
    );
  }

  toggleTenant(id: number): Observable<{ success: boolean; message: string }> {
    return this.http.patch<{ success: boolean; message: string }>(
      `${this.base}/tenants/${id}/toggle`, {}
    );
  }

  // ── Context switching ───────────────────────────────────────────────────────

  switchContext(codDane: string): Observable<ContextSwitchResult> {
    return this.http.post<ContextSwitchResult>(
      `${this.base}/switch-context`, { codDane }
    );
  }

  // ── Salud CADs ───────────────────────────────────────────────────────────────

  getSaludCads(): Observable<TenantPublico[]> {
    return this.http.get<TenantPublico[]>(`${this.base}/salud`);
  }

  getHistorial(codDane: string, limit = 48): Observable<SaludHistorial[]> {
    return this.http.get<SaludHistorial[]>(
      `${this.base}/salud/${codDane}/historial?limit=${limit}`
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  nivelLabel(nivel: number): string {
    return nivel === 1 ? 'Normal' : nivel === 2 ? 'Degradado' : 'Offline';
  }

  nivelClass(nivel: number): string {
    return nivel === 1 ? 'success' : nivel === 2 ? 'warning' : 'danger';
  }

  nivelIcon(nivel: number): string {
    return nivel === 1 ? 'fa-circle-check' : nivel === 2 ? 'fa-triangle-exclamation' : 'fa-circle-xmark';
  }
}
