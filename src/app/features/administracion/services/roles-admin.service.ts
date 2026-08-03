import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

export interface RolAdminItem {
  id: number;
  nombre?: string | null;
  vigente: number;
}

export interface SaveRolAdminRequest {
  id?: number | null;
  nombre: string;
  vigente: number;
}

export interface SetRolEstadoRequest {
  vigente: number;
}

export interface RolAdminApiResponse {
  success: boolean;
  idRol?: number;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class RolesAdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/Usuario/Roles/Admin`;

  /** Consulta el catálogo administrativo completo de roles. */
  getAll(): Observable<RolAdminItem[]> {
    return this.http.get<RolAdminItem[]>(this.baseUrl);
  }

  /** Crea o actualiza un rol según la presencia de su identificador. */
  save(payload: SaveRolAdminRequest): Observable<RolAdminApiResponse> {
    return this.http.post<RolAdminApiResponse>(this.baseUrl, payload);
  }

  /** Modifica únicamente la disponibilidad sin reenviar el resto del registro. */
  setEstado(idRol: number, payload: SetRolEstadoRequest): Observable<RolAdminApiResponse> {
    return this.http.patch<RolAdminApiResponse>(`${this.baseUrl}/${idRol}/Estado`, payload);
  }
}
