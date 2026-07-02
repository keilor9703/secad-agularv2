import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ClasificacionCorreo,
  CorreoEnviado,
  CorreoHistoricoApi,
  CuentaEmail,
  EnvioCorreoResponse
} from '../interfaces/gestion-correo.interface';

@Injectable({ providedIn: 'root' })
export class GestionCorreoService {
  private readonly apiUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  getClasificaciones(): Observable<ClasificacionCorreo[]> {
    return this.http
      .get<ClasificacionCorreo[]>(`${this.apiUrl}/Dominio`)
      .pipe(map((data) => (data ?? []).filter((item) => item.idPadre === 198 && item.vigente === 1)));
  }

  getMisCuentas(): Observable<CuentaEmail[]> {
    return this.http
      .get<CuentaEmail[]>(`${this.apiUrl}/CuentaEmail/mis-cuentas`)
      .pipe(map((data) => (data ?? []).filter((item) => item.vigente === 1)));
  }

  getHistorico(): Observable<CorreoEnviado[]> {
    return this.http
      .get<CorreoHistoricoApi[]>(`${this.apiUrl}/GestionCorreos/historico`)
      .pipe(map((data) => (data ?? []).map((item) => this.mapHistorico(item))));
  }

  enviar(formData: FormData): Observable<EnvioCorreoResponse> {
    return this.http.post<EnvioCorreoResponse>(`${this.apiUrl}/GestionCorreos/enviar`, formData);
  }

  private mapHistorico(item: CorreoHistoricoApi): CorreoEnviado {
    return {
      idEnvio: item.idEnvio,
      radicado: item.radicado,
      deEmail: item.deEmail,
      nombreCuenta: item.nombreCuenta,
      para: item.destinatario,
      asunto: item.asunto,
      cuerpo: item.cuerpo,
      fecha: new Date(item.fecha),
      tieneAdjuntos: false,
      username: item.username,
      nombreCompleto: item.nombreCompleto,
      clasificacion: item.clasificacion
    };
  }
}
