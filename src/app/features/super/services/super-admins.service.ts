import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

/**
 * Los superadministradores del SISTEMA, que viven en la base maestra y no en
 * ningún CAD. Ver docs/sql/master/V66__master_super_admins.sql.
 */
export interface DtoSuperAdmin {
  readonly username: string;
  readonly nombre?: string | null;
  readonly codDaneOrigen?: string | null;
  readonly nombreCadOrigen?: string | null;
  readonly activo: boolean;
  readonly observacion?: string | null;
  readonly fechaCreacion?: string | null;
  readonly fechaModifica?: string | null;
}

export interface DtoSuperAdminRequest {
  username: string;
  nombre?: string | null;
  codDaneOrigen?: string | null;
  activo: boolean;
  observacion?: string | null;
}

export interface SuperAdminResult {
  readonly success: boolean;
  readonly message?: string;
}

@Injectable({ providedIn: 'root' })
export class SuperAdminsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/super/super-admins`;

  listar(): Observable<DtoSuperAdmin[]> {
    return this.http.get<DtoSuperAdmin[]>(this.base);
  }

  guardar(payload: DtoSuperAdminRequest): Observable<SuperAdminResult> {
    return this.http.post<SuperAdminResult>(this.base, payload);
  }

  quitar(username: string): Observable<SuperAdminResult> {
    return this.http.delete<SuperAdminResult>(`${this.base}/${encodeURIComponent(username)}`);
  }
}
