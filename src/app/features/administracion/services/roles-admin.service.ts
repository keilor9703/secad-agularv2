import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  private readonly baseUrl = `${environment.apiBaseUrl}/Usuario/Roles/Admin`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<RolAdminItem[]> {
    return this.http.get<RolAdminItem[]>(this.baseUrl);
  }

  save(payload: SaveRolAdminRequest): Observable<RolAdminApiResponse> {
    return this.http.post<RolAdminApiResponse>(this.baseUrl, payload);
  }

  setEstado(idRol: number, payload: SetRolEstadoRequest): Observable<RolAdminApiResponse> {
    return this.http.patch<RolAdminApiResponse>(`${this.baseUrl}/${idRol}/Estado`, payload);
  }
}

