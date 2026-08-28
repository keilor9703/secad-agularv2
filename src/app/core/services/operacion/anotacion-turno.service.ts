import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface AnotacionTurno {
  /** Snowflake ID — el backend lo serializa como string para evitar pérdida de precisión en JS. */
  id: string;
  tipo: string;
  titulo?: string;
  descripcion: string;
  canalCodigo?: number;
  canalDesc?: string;
  fuerzaId?: number;
  fuerzaDesc?: string;
  sitioGraba?: number;
  usernameCreacion?: string;
  nombreCompleto?: string;
  fechaCreacion?: string;
  fechaModifica?: string;
  usuarioModifica?: string;
}

export interface AnotacionTurnoRequest {
  tipo: string;
  titulo?: string;
  descripcion: string;
  canalCodigo?: number;
  fuerzaId?: number;
  sitioGraba?: number;
}

export const TIPOS_ANOTACION = [
  { valor: 'COMUNICADO',       label: 'Comunicado',         icono: 'fa-bullhorn',          color: '#3b82f6' },
  { valor: 'REVISTA',          label: 'Revista',             icono: 'fa-clipboard-check',   color: '#8b5cf6' },
  { valor: 'OPERATIVA',        label: 'Actividad Operativa', icono: 'fa-shield-halved',     color: '#f59e0b' },
  { valor: 'PREVENTIVA',       label: 'Actividad Preventiva',icono: 'fa-eye',               color: '#10b981' },
  { valor: 'NOVEDAD_PERSONAL', label: 'Novedad Personal',    icono: 'fa-user-clock',        color: '#ef4444' },
  { valor: 'GENERAL',          label: 'General',             icono: 'fa-note-sticky',       color: '#6b7280' },
];

@Injectable({ providedIn: 'root' })
export class AnotacionTurnoService {
  private readonly base = `${environment.apiBaseUrl}/AnotacionTurno`;

  constructor(private http: HttpClient) {}

  getList(filters: {
    canal?: number;
    sitio?: number;
    tipo?: string;
    desde?: string;
    hasta?: string;
    /** Obligatorio salvo para super-admin — sin esto el backend restringe a la fuerza del JWT. */
    fuerza?: number;
  }): Observable<{ success: boolean; data: AnotacionTurno[] }> {
    let params = new HttpParams();
    if (filters.canal)  params = params.set('canal',  filters.canal);
    if (filters.sitio)  params = params.set('sitio',  filters.sitio);
    if (filters.tipo)   params = params.set('tipo',   filters.tipo);
    if (filters.desde)  params = params.set('desde',  filters.desde);
    if (filters.hasta)  params = params.set('hasta',  filters.hasta);
    if (filters.fuerza) params = params.set('fuerza', filters.fuerza);
    return this.http.get<{ success: boolean; data: AnotacionTurno[] }>(this.base, { params });
  }

  create(req: AnotacionTurnoRequest): Observable<{ success: boolean; data: AnotacionTurno; message: string }> {
    return this.http.post<{ success: boolean; data: AnotacionTurno; message: string }>(this.base, req);
  }

  update(id: string, req: AnotacionTurnoRequest): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(`${this.base}/${id}`, req);
  }

  delete(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.base}/${id}`);
  }

  getTipoInfo(tipo: string) {
    return TIPOS_ANOTACION.find(t => t.valor === tipo)
        ?? { valor: tipo, label: tipo, icono: 'fa-note-sticky', color: '#6b7280' };
  }
}
