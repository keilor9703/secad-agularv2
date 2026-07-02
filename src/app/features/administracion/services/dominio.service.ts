import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface DtoDominio {
  idDominio: number;
  descripcion: string;
  idPadre: number;
  vigente: number;
  abreviatura: string;
  observacion: string;
}

export interface DtoDominioRequest {
  Identificacion?: string;
  Nombre?: string;
  Cargo?: string;
  Descripcion: string;
  IdPadre: number;
  Vigente: number;
  Abreviatura: string;
  Observacion: string;
}

export interface DtoDominioResult {
  success: boolean;
  id: number;
  message: string;
}
 
@Injectable({ providedIn: 'root' })
export class DominioService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Dominio`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<DtoDominio[]> {
    return this.http.get<DtoDominio[]>(this.baseUrl);
  }
 
  create(request: DtoDominioRequest): Observable<DtoDominioResult> {
    return this.http.post<DtoDominioResult>(this.baseUrl, request);
  }

  update(id: number, request: DtoDominioRequest): Observable<DtoDominioResult> {
    return this.http.put<DtoDominioResult>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: number): Observable<DtoDominioResult> {
    return this.http.delete<DtoDominioResult>(`${this.baseUrl}/${id}`);
  }
 
}
