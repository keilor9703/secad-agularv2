import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DtoModalActivo {
  idModal: number;
  titulo: string;
  descripcion: string;
  tipoRecurso: string;
  rutaRecurso: string;
  tipoAccion: string;
  fechaInicio: string;
  fechaFin: string;
  unidad: string;
  orden: number;
}

export interface DtoInteraccionRequest {
  IdModal: number;
  TipoAccion: string;
}

export interface DtoModalResult {
  id: number;
  success: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  private readonly baseUrl = environment.modalApiUrl;

  constructor(private http: HttpClient) {}

  getActivos(): Observable<DtoModalActivo[]> {
    return this.http.get<DtoModalActivo[]>(`${this.baseUrl}/activos`);
  }

  registrarInteraccion(request: DtoInteraccionRequest): Observable<DtoModalResult> {
    return this.http.post<DtoModalResult>(`${this.baseUrl}/interaccion`, request);
  }
}
