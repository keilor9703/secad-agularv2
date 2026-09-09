import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ── Alcances ──────────────────────────────────────────────────────────────────

/** Para qué sirve una llave. La de la planta no debe crear casos por chat. */
export type AlcanceApiKey = 'PBX' | 'CHAT' | 'SMS' | 'ACTUALIZACION' | 'TODO';

export const ALCANCES: { value: AlcanceApiKey; label: string; icon: string; descripcion: string }[] = [
  { value: 'PBX',  label: 'Planta telefónica', icon: 'fa-solid fa-phone-volume',
    descripcion: 'Registrar llamadas entrantes de la PBX.' },
  { value: 'CHAT', label: 'Chat', icon: 'fa-solid fa-comments',
    descripcion: 'Crear casos desde WhatsApp, Telegram o un bot web.' },
  { value: 'SMS',  label: 'SMS', icon: 'fa-solid fa-comment-sms',
    descripcion: 'Crear casos desde mensajes de texto.' },
  { value: 'ACTUALIZACION', label: 'Actualización de casos', icon: 'fa-solid fa-rotate',
    descripcion: 'Permitir que una agencia devuelva el estado de un caso.' },
  { value: 'TODO', label: 'Todos los canales', icon: 'fa-solid fa-asterisk',
    descripcion: 'Comodín. Úselo solo para pruebas: una llave así lo abre todo.' },
];

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface DtoApiKey {
  id: string;
  codDane: string;
  nombre: string;
  alcance: AlcanceApiKey;
  /** Trozo visible, para reconocerla sin revelarla. */
  prefijo: string;
  sitioGrabaDefecto: number;
  activa: boolean;
  notas?: string | null;
  /** Hasta cuándo sigue sirviendo la llave anterior tras rotar. */
  anteriorExpira?: string | null;
  ultimoUso?: string | null;
  ultimoUsoIp?: string | null;
  totalUsos: number;
  fechaCreacion: string;
  usuarioCreacion?: string | null;
  fechaRevocacion?: string | null;
}

export interface DtoApiKeyConSecreto {
  llave: DtoApiKey;
  clave: string;
  mensaje?: string | null;
}

export interface DtoApiKeyRequest {
  nombre: string;
  alcance: AlcanceApiKey;
  sitioGrabaDefecto: number;
  notas?: string | null;
}

export interface DtoApiKeyAuditoria {
  id: string;
  apiKeyId: string;
  accion: string;
  usuario?: string | null;
  ip?: string | null;
  detalle?: string | null;
  fecha: string;
}

// ── Contrato ──────────────────────────────────────────────────────────────────

export interface DtoCampoContrato {
  nombre: string;
  tipo: string;
  obligatorio: boolean;
  descripcion: string;
  ejemplo?: string | null;
}

/** Todo lo que hay que entregarle a quien integra desde el otro lado. */
export interface DtoContratoIntegracion {
  canal: string;
  titulo: string;
  descripcion: string;
  metodo: string;
  ruta: string;
  urlAbsoluta: string;
  alcanceRequerido: string;
  headers: Record<string, string>;
  campos: DtoCampoContrato[];
  ejemploPayload: string;
  ejemploCurl: string;
  respuestas: string[];
  notas: string[];
}

export interface DtoApiKeyResult { success: boolean; message: string; }

/** Resultado de la autoprueba: lo que respondió el endpoint real. */
export interface DtoPruebaIntegracion {
  estado: number;
  ok: boolean;
  url: string;
  cuerpo: string;
}

/**
 * Llaves de API de las integraciones entrantes.
 *
 * Cada llave pertenece a un CAD y vive en la base maestra: es lo que permite
 * que SECAD sepa a qué tenant escribir sin creerle a una cabecera. Todo lo de
 * aquí va con el JWT del administrador, y el backend saca el CAD de ese token
 * —nunca de un parámetro—, así que un administrador no puede tocar las llaves
 * de otro CAD aunque conozca sus identificadores.
 */
@Injectable({ providedIn: 'root' })
export class ApiKeysService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/ApiKeys`;

  listar(): Observable<{ success: boolean; data: DtoApiKey[] }> {
    return this.http.get<{ success: boolean; data: DtoApiKey[] }>(this.base);
  }

  crear(request: DtoApiKeyRequest): Observable<{ success: boolean; data: DtoApiKeyConSecreto }> {
    return this.http.post<{ success: boolean; data: DtoApiKeyConSecreto }>(this.base, request);
  }

  actualizar(id: string, request: DtoApiKeyRequest): Observable<DtoApiKeyResult> {
    return this.http.put<DtoApiKeyResult>(`${this.base}/${id}`, request);
  }

  /** Devuelve la llave en claro. El backend registra quién la vio y desde dónde. */
  revelar(id: string): Observable<{ success: boolean; data: { clave: string } }> {
    return this.http.get<{ success: boolean; data: { clave: string } }>(`${this.base}/${id}/revelar`);
  }

  /**
   * @param horasGracia cuánto sigue sirviendo la anterior. 24 h por defecto,
   *   para que al proveedor le dé tiempo de reconfigurar. 0 corta en seco.
   */
  regenerar(id: string, horasGracia = 24): Observable<{ success: boolean; data: DtoApiKeyConSecreto }> {
    const params = new HttpParams().set('horasGracia', horasGracia);
    return this.http.post<{ success: boolean; data: DtoApiKeyConSecreto }>(
      `${this.base}/${id}/regenerar`, {}, { params });
  }

  cambiarEstado(id: string, activa: boolean): Observable<DtoApiKeyResult> {
    const params = new HttpParams().set('activa', activa);
    return this.http.put<DtoApiKeyResult>(`${this.base}/${id}/estado`, {}, { params });
  }

  auditoria(limite = 100): Observable<{ success: boolean; data: DtoApiKeyAuditoria[] }> {
    const params = new HttpParams().set('limite', limite);
    return this.http.get<{ success: boolean; data: DtoApiKeyAuditoria[] }>(`${this.base}/auditoria`, { params });
  }

  /**
   * El contrato del canal, con la URL absoluta real del servidor.
   * @param llaveId si se pasa, el contrato viene con esa llave ya puesta en la
   *   cabecera y en el curl, listo para entregar. Cuenta como un revelado.
   */
  contrato(canal: string, llaveId?: string): Observable<{ success: boolean; data: DtoContratoIntegracion }> {
    const params = llaveId ? new HttpParams().set('llaveId', llaveId) : undefined;
    return this.http.get<{ success: boolean; data: DtoContratoIntegracion }>(
      `${this.base}/contrato/${canal}`, { params });
  }

  /**
   * Prueba la llave contra el endpoint real.
   *
   * La dispara el servidor, no el navegador: desde aquí toda petición sale con
   * el JWT del administrador pegado por el interceptor, y con un JWT presente
   * el backend resuelve el tenant por el token sin mirar la llave — la prueba
   * saldría verde sin haber probado nada.
   */
  probar(id: string): Observable<{ success: boolean; data: DtoPruebaIntegracion }> {
    return this.http.post<{ success: boolean; data: DtoPruebaIntegracion }>(
      `${this.base}/${id}/probar`, {});
  }

  etiquetaAlcance(a: string): string {
    return ALCANCES.find(x => x.value === a)?.label ?? a;
  }
}
