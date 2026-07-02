import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface DtoCuentaEmail {
  idCuenta: number;
  idDominioGrupo: number;
  nombreCuenta: string;
  email: string;
  servidorSmtp: string;
  puerto: number;
  usuarioSmtp: string;
  claveSmtp: string;
  usarSsl: number;
  vigente: number;
  nombreGrupo?: string;
  firmaHtml?: string | null;
  imagenEncabezado?: string | null;
}

export interface DtoCuentaEmailRequest {
  IdDominioGrupo: number;
  NombreCuenta: string;
  Email: string;
  ServidorSmtp: string;
  Puerto: number;
  UsuarioSmtp: string;
  ClaveSmtp: string;
  UsarSsl: number;
  Vigente: number;
  FirmaHtml?: string | null;
  ImagenEncabezado?: string | null;
}

export interface DtoCuentaEmailUsuario {
  idCuentaUsuario: number;
  idCuenta: number;
  nombreCuenta: string;
  email: string;
  idUsuario: number;
  usuarioLogin: string;
  nombreCompleto: string;
  identificacion: string;
  vigente: number;
}

export interface DtoCuentaEmailUsuarioRequest {
  idCuenta: number;
  idUsuario: number;
}

export interface DtoCuentaEmailUsuarioEstadoRequest {
  vigente: number;
}

export interface CuentaEmailApiResponse {
  success?: boolean;
  id?: number;
  message?: string;
  detail?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CuentaEmailService {
  private baseUrl = `${environment.apiBaseUrl}/CuentaEmail`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<DtoCuentaEmail[]> {
    return this.http.get<DtoCuentaEmail[]>(this.baseUrl);
  }

  getById(id: number): Observable<DtoCuentaEmail> {
    return this.http.get<DtoCuentaEmail>(`${this.baseUrl}/${id}`);
  }

  create(request: DtoCuentaEmailRequest): Observable<CuentaEmailApiResponse> {
    return this.http.post<CuentaEmailApiResponse>(this.baseUrl, request);
  }

  update(id: number, request: DtoCuentaEmailRequest): Observable<CuentaEmailApiResponse> {
    return this.http.put<CuentaEmailApiResponse>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: number): Observable<CuentaEmailApiResponse> {
    return this.http.delete<CuentaEmailApiResponse>(`${this.baseUrl}/${id}`);
  }

  getMisCuentas(): Observable<DtoCuentaEmail[]> {
    return this.http.get<DtoCuentaEmail[]>(`${this.baseUrl}/mis-cuentas`);
  }

  getAutorizaciones(idCuenta?: number, idUsuario?: number, vigente?: number): Observable<DtoCuentaEmailUsuario[]> {
    const params: Record<string, string> = {};
    if (idCuenta !== undefined) params['idCuenta'] = String(idCuenta);
    if (idUsuario !== undefined) params['idUsuario'] = String(idUsuario);
    if (vigente !== undefined) params['vigente'] = String(vigente);
    return this.http.get<DtoCuentaEmailUsuario[]>(`${this.baseUrl}/autorizaciones`, { params });
  }

  crearAutorizacion(payload: DtoCuentaEmailUsuarioRequest): Observable<CuentaEmailApiResponse> {
    return this.http.post<CuentaEmailApiResponse>(`${this.baseUrl}/autorizaciones`, payload);
  }

  actualizarAutorizacion(idCuentaUsuario: number, payload: DtoCuentaEmailUsuarioEstadoRequest): Observable<CuentaEmailApiResponse> {
    return this.http.put<CuentaEmailApiResponse>(`${this.baseUrl}/autorizaciones/${idCuentaUsuario}`, payload);
  }

  eliminarAutorizacion(idCuentaUsuario: number): Observable<CuentaEmailApiResponse> {
    return this.http.delete<CuentaEmailApiResponse>(`${this.baseUrl}/autorizaciones/${idCuentaUsuario}`);
  }

  uploadImagenEncabezado(file: File): Observable<{ success: boolean; url: string; fileName: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ success: boolean; url: string; fileName: string }>(
      `${environment.apiBaseUrl}/CuentaEmailUpload/imagen`, formData
    );
  }
}
