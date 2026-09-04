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

export interface DepartamentoItem {
  departamento: string;
  codigoDepartamento?: number;
  totalMunicipios: number;
}

export interface MunicipioItem {
  consecutivo: number;
  municipio: string;
  departamento: string;
  codigoDane: string;
  siglaFisica?: string;
  descripcionDependencia?: string;
  descRegional?: string;
}

export interface UnidadItem {
  consecutivo: number;
  fuerza?: number;
  descripcionDependencia: string;
  vigente: string;
  siglaFisica?: string;
  siglaPapa?: string;
  siglaDepende?: string;
  departamento?: string;
  codigoDepartamento?: number;
  municipio?: string;
  codigoDane?: string;
  descRegional?: string;
  codRegional?: number;
  direccion?: string;
  telefono?: string;
  telefonoIp?: string;
  email?: string;
  zona?: string;
  tipo?: string;
  tipoDescripcion?: string;
  fechaCreacion?: string;
  fechaActualiza?: string;
}

export interface UnidadSaveRequest {
  consecutivo?: number;
  fuerza?: number;
  descripcionDependencia: string;
  vigente?: string;
  siglaFisica?: string;
  siglaPapa?: string;
  departamento: string;
  codigoDepartamento?: number;
  municipio: string;
  codigoDane: string;
  descRegional?: string;
  codRegional?: number;
  direccion?: string;
  telefono?: string;
  telefonoIp?: string;
  email?: string;
  zona?: string;
  tipo?: string;
  tipoDescripcion?: string;
}

export interface UnidadesPaginadas {
  items: UnidadItem[];
  totalCount: number;
  page: number;
  pageSize: number;
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

  // ── Unidades y Municipios Institucionales ───────────────────────────────────

  getDepartamentos(): Observable<DepartamentoItem[]> {
    return this.http.get<DepartamentoItem[]>(`${this.base}/unidades/departamentos`);
  }

  getMunicipios(departamento: string): Observable<MunicipioItem[]> {
    return this.http.get<MunicipioItem[]>(`${this.base}/unidades/municipios`, {
      params: { departamento },
    });
  }

  getUnidades(params?: {
    filtro?: string;
    departamento?: string;
    page?: number;
    pageSize?: number;
  }): Observable<UnidadesPaginadas> {
    let httpParams: Record<string, string> = {};
    if (params?.filtro) httpParams['filtro'] = params.filtro;
    if (params?.departamento) httpParams['departamento'] = params.departamento;
    if (params?.page) httpParams['page'] = String(params.page);
    if (params?.pageSize) httpParams['pageSize'] = String(params.pageSize);

    return this.http.get<UnidadesPaginadas>(`${this.base}/unidades`, { params: httpParams });
  }

  createUnidad(request: UnidadSaveRequest): Observable<{ success: boolean; message: string; consecutivo?: number }> {
    return this.http.post<{ success: boolean; message: string; consecutivo?: number }>(
      `${this.base}/unidades`, request
    );
  }

  updateUnidad(consecutivo: number, request: UnidadSaveRequest): Observable<{ success: boolean; message: string; consecutivo?: number }> {
    return this.http.put<{ success: boolean; message: string; consecutivo?: number }>(
      `${this.base}/unidades/${consecutivo}`, request
    );
  }

  toggleUnidad(consecutivo: number): Observable<{ success: boolean; message: string }> {
    return this.http.patch<{ success: boolean; message: string }>(
      `${this.base}/unidades/${consecutivo}/toggle`, {}
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
