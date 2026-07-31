import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
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

interface DtoDominioApi extends Partial<DtoDominio> {
  IdDominio?: number;
  id_dominio?: number;
  ID_DOMINIO?: number;
  Descripcion?: string;
  IdPadre?: number;
  id_padre?: number;
  ID_PADRE?: number;
  Vigente?: number;
  Abreviatura?: string;
  Observacion?: string;
}

@Injectable({ providedIn: 'root' })
export class DominioService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/Dominio`;

  getAll(): Observable<DtoDominio[]> {
    return this.http
      .get<DtoDominioApi[]>(this.baseUrl)
      .pipe(map((items) => (items ?? []).map((item) => this.normalize(item))));
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

  private normalize(item: DtoDominioApi): DtoDominio {
    return {
      idDominio: Number(
        item.idDominio ?? item.IdDominio ?? item.id_dominio ?? item.ID_DOMINIO ?? 0,
      ),
      descripcion: String(item.descripcion ?? item.Descripcion ?? ''),
      idPadre: Number(item.idPadre ?? item.IdPadre ?? item.id_padre ?? item.ID_PADRE ?? 0),
      vigente: Number(item.vigente ?? item.Vigente ?? 0),
      abreviatura: String(item.abreviatura ?? item.Abreviatura ?? ''),
      observacion: String(item.observacion ?? item.Observacion ?? ''),
    };
  }
}
