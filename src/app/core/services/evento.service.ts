import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DtoEvento {
  idEvento: number;
  nombreEvento: string;
  unidad: string;
  departamento: string;
  ciudad: string;
  direccionEvento: string;
  cedulaResponsable: string;
  nombreResponsable: string;
  correoResponsable?: string | null;
  telefonoResponsable?: string | null;
  imagenEvento?: string | null;
  fechaInicio: string;
  fechaFin: string;
  vigente: number;
}

@Injectable({ providedIn: 'root' })
export class EventoService {
  private readonly baseUrl = environment.eventoApiUrl;

  constructor(private http: HttpClient) {}

  getAll(): Observable<DtoEvento[]> {
    return this.http.get<DtoEvento[]>(this.baseUrl);
  }

  getActivos(fecha?: string): Observable<DtoEvento[]> {
    let params = new HttpParams();
    if (fecha?.trim()) {
      params = params.set('fecha', fecha.trim());
    }
    return this.http.get<DtoEvento[]>(`${this.baseUrl}/activos`, { params });
  }

  getById(id: number): Observable<DtoEvento> {
    return this.http.get<DtoEvento>(`${this.baseUrl}/${id}`);
  }
}
