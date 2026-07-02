export interface CuentaEmail {
  idCuenta: number;
  nombreCuenta: string;
  email: string;
  vigente: number;
  prioridadAlta: number;
  acuseRecibido: number;
}

export interface ClasificacionCorreo {
  idDominio: number;
  descripcion: string;
  idPadre: number;
  vigente: number;
}

export interface CorreoEnviado {
  idEnvio: number;
  radicado: string;
  deEmail: string;
  nombreCuenta: string;
  para: string;
  asunto: string;
  cuerpo: string;
  fecha: Date;
  tieneAdjuntos: boolean;
  username: string;
  nombreCompleto: string;
  clasificacion: string;
}

export interface CorreoHistoricoApi {
  idEnvio: number;
  radicado: string;
  deEmail: string;
  nombreCuenta: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
  fecha: string;
  username: string;
  nombreCompleto: string;
  clasificacion: string;
}

export interface EnvioCorreoResponse {
  radicado: string;
  message?: string;
}
