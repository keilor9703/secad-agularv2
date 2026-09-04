import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap, tap, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { decodeBase64Utf8, fixMojibake } from '../../shared/utils/string-encoding.util';

interface LoginRequest {
  Usuario: string;
  Contrasena: string;
}

interface LoginResponse {
  success: boolean;
  Success?: boolean;
  token?: string;
  mensaje?: string;
  message?: string;
  usuario?: string;
  funcionario?: string;
  identificacion?: number;
}

type JwtPayload = Record<string, unknown>;

/** Claims que el backend de SECAD firma en el JWT (ver LoginController). */
export interface JwtClaims {
  sitioGraba: number;
  acd: number;
  fuerzaId: number;
  canalId: number;
  /** CAD contra el que se consulta ahora mismo. */
  codDane: string;
  /** CAD de origen del usuario; distinto de codDane solo si conmutó contexto. */
  homeCodDane: string;
  usuario: string;
  idUsuario: number;
  esAdmin: boolean;
  esSuperAdmin: boolean;
  nombreCad: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'sisge_token';
  private readonly userKey = 'sisge_usuario';
  private readonly authKey = 'sisge_auth';
  private readonly userIdKey = 'sisge_user_id';
  private readonly identificationKey = 'sisge_identificacion';
  private readonly loginUrl = `${environment.apiBaseUrl}/Cuenta/Token`;
  private readonly lastLoginUrl = `${environment.apiBaseUrl}/Usuario/UltimoIngreso`;
  private readonly maxJwtLength = 8192;
  private readonly maxJwtPayloadB64Length = 4096;
  private readonly maxJwtPayloadJsonLength = 6144;

  constructor(private http: HttpClient) {}

  login(usuario: string, contrasena: string): Observable<LoginResponse> {
    const payload: LoginRequest = {
      Usuario: usuario,
      Contrasena: contrasena,
    };

    return this.http.post<LoginResponse>(this.loginUrl, payload, { withCredentials: true }).pipe(
      timeout(30000),
      tap((resp) => {
        if (this.isLoginSuccessful(resp)) {
          let identificacion = this.parsePositiveNumber(resp.identificacion);

          if (resp.token) {
            localStorage.setItem(this.tokenKey, resp.token);
            const userId = this.extractUserIdFromToken(resp.token);
            if (userId !== null) {
              localStorage.setItem(this.userIdKey, String(userId));
            }

            identificacion ??= this.extractIdentificationFromToken(resp.token);
          }

          if (identificacion !== null) {
            localStorage.setItem(this.identificationKey, String(identificacion));
          }

          localStorage.setItem(this.authKey, '1');
          localStorage.setItem(this.userKey, resp.usuario ?? usuario);
          sessionStorage.removeItem('modales_vistos');
        }
      }),
      /*
       * El acceso se registra después de almacenar el JWT, por lo que el
       * interceptor puede autenticar esta solicitud. Una falla de auditoría
       * se degrada de forma segura y nunca invalida un inicio de sesión válido.
       */
      switchMap((resp) => {
        if (!this.isLoginSuccessful(resp)) {
          return of(resp);
        }

        return this.http.post<void>(this.lastLoginUrl, {}).pipe(
          map(() => resp),
          catchError(() => of(resp)),
        );
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.authKey);
    localStorage.removeItem(this.userIdKey);
    localStorage.removeItem(this.identificationKey);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getUsuario(): string {
    return localStorage.getItem(this.userKey) ?? 'Usuario';
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Multi-tenant (traído de secad_angular)
  //
  //  SECAD no es una sola instalación: cada CAD (Bogotá, Cali, …) tiene su
  //  propia base de datos, y el backend decide contra cuál consultar leyendo el
  //  claim cod_dane del JWT. Sin esta capa, cualquier módulo de operación queda
  //  sin saber a qué CAD pertenece lo que pide.
  //
  //  Un SuperAdministrador puede además "entrar" al contexto de otro CAD: ahí
  //  cod_dane cambia mientras home_cod_dane conserva su CAD de origen.
  // ══════════════════════════════════════════════════════════════════════════

  getJwtClaims(): JwtClaims {
    const vacio: JwtClaims = {
      sitioGraba: 0, acd: 0, fuerzaId: 0, canalId: 0,
      codDane: '', homeCodDane: '', usuario: '', idUsuario: 0,
      esAdmin: false, esSuperAdmin: false, nombreCad: '',
    };

    const token = this.getToken();
    if (!token) return vacio;

    const p = this.decodeJwtPayload(token);
    if (!p) return vacio;

    const nameKey = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
    const codDane = String(p?.['cod_dane'] ?? '');

    return {
      sitioGraba:   Number(p?.['sitio_graba'] ?? 0),
      acd:          Number(p?.['acd'] ?? 0),
      fuerzaId:     Number(p?.['fuerza_id'] ?? 0),
      canalId:      Number(p?.['canal_id'] ?? 0),
      codDane,
      homeCodDane:  String(p?.['home_cod_dane'] ?? codDane),
      idUsuario:    Number(p?.['id_usuario'] ?? p?.['nameid'] ?? 0),
      usuario:      fixMojibake(String(p?.[nameKey] ?? p?.['unique_name'] ?? p?.['name'] ?? '')),
      esAdmin:      p?.['es_admin'] === 'true',
      esSuperAdmin: p?.['es_super_admin'] === 'true',
      nombreCad:    fixMojibake(String(p?.['nombre_cad'] ?? '')),
    };
  }

  /** true cuando el JWT pertenece a un SuperAdministrador. */
  esSuperAdmin(): boolean {
    return this.getJwtClaims().esSuperAdmin;
  }

  /** true cuando el JWT pertenece a un Administrador o SuperAdministrador. */
  esAdmin(): boolean {
    return this.getJwtClaims().esAdmin;
  }

  /** CAD de origen del usuario. No cambia al conmutar de contexto. */
  getHomeCodDane(): string {
    return this.getJwtClaims().homeCodDane;
  }

  /** CAD activo ahora mismo. Difiere del de origen si un SuperAdmin conmutó contexto. */
  getActiveCodDane(): string {
    return this.getJwtClaims().codDane;
  }

  /** true cuando un SuperAdmin está operando dentro del contexto de otro CAD. */
  isContextSwitched(): boolean {
    const { esSuperAdmin, codDane, homeCodDane } = this.getJwtClaims();
    return esSuperAdmin && codDane !== homeCodDane && !!homeCodDane;
  }

  /** Reemplaza el JWT guardado. Lo usa la conmutación de contexto, que devuelve uno nuevo. */
  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
    const userId = this.extractUserIdFromToken(token);
    if (userId !== null) localStorage.setItem(this.userIdKey, String(userId));
  }

  /**
   * Persiste el JWT y los metadatos de sesión tras completar 2FA. Lo llama el
   * login cuando el backend devuelve el token definitivo — el de login() es
   * provisional mientras el segundo factor no se resuelve.
   */
  storeLoginData(token: string, usuario: string): void {
    localStorage.setItem(this.tokenKey, token);
    const userId = this.extractUserIdFromToken(token);
    if (userId !== null) localStorage.setItem(this.userIdKey, String(userId));
    localStorage.setItem(this.authKey, '1');
    localStorage.setItem(this.userKey, usuario);
    sessionStorage.removeItem('modales_vistos');
  }

  getUserId(): number | null {
    const raw = localStorage.getItem(this.userIdKey);
    if (!raw) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  getIdentificacion(): number | null {
    const raw = localStorage.getItem(this.identificationKey);
    if (raw) {
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }

    const token = this.getToken();
    if (!token) {
      return null;
    }

    const identificacion = this.extractIdentificationFromToken(token);
    if (identificacion !== null) {
      localStorage.setItem(this.identificationKey, String(identificacion));
    }

    return identificacion;
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    if (this.isTokenExpired(token)) {
      this.logout();
      return false;
    }

    return true;
  }

  isLoginSuccessful(resp: LoginResponse | null | undefined): boolean {
    return !!resp && (resp.success === true || resp.Success === true || !!resp.token);
  }

  isCurrentUserSuperAdmin(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      const parsed = this.decodeJwtPayload(token);
      if (!parsed) {
        return false;
      }

      const roleClaimUri = [
        'http',
        '://schemas.microsoft.com/ws/2008/06/identity/claims/role',
      ].join('');
      const roleClaimShort = 'role';
      const roleClaimLegacy = 'roles';

      const rawRoles = [
        parsed?.[roleClaimUri],
        parsed?.[roleClaimShort],
        parsed?.[roleClaimLegacy],
      ];

      const values = rawRoles
        .flatMap((r) => (Array.isArray(r) ? r : [r]))
        .map((v) => String(v ?? '').trim());
      return values.some((v) => v === '1');
    } catch {
      return false;
    }
  }

  private extractUserIdFromToken(token: string): number | null {
    try {
      const parsed = this.decodeJwtPayload(token);
      if (!parsed) {
        return null;
      }

      const nameIdentifierClaim =
        'http' + '://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
      const rawId =
        parsed['id_usuario'] ?? parsed['nameid'] ?? parsed['sub'] ?? parsed[nameIdentifierClaim];
      const userId = Number(rawId);
      return Number.isFinite(userId) ? userId : null;
    } catch {
      return null;
    }
  }

  private extractIdentificationFromToken(token: string): number | null {
    try {
      const parsed = this.decodeJwtPayload(token);
      if (!parsed) {
        return null;
      }

      const rawId =
        parsed['Identificacion'] ??
        parsed['identificacion'] ??
        parsed['Documento'] ??
        parsed['documento'] ??
        parsed['Cedula'] ??
        parsed['cedula'] ??
        parsed['NumeroDocumento'] ??
        parsed['numeroDocumento'];
      return this.parsePositiveNumber(rawId);
    } catch {
      return null;
    }
  }

  private parsePositiveNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private isTokenExpired(token: string): boolean {
    try {
      const parsed = this.decodeJwtPayload(token);
      if (!parsed) {
        return true;
      }

      const exp = Number(parsed['exp']);
      if (!Number.isFinite(exp) || exp <= 0) {
        return false;
      }

      const now = Math.floor(Date.now() / 1000);
      return exp <= now;
    } catch {
      return true;
    }
  }

  private decodeJwtPayload(token: string): JwtPayload | null {
    const raw = String(token ?? '').trim();
    if (!raw || raw.length > this.maxJwtLength) {
      return null;
    }

    const parts = raw.split('.');
    if (parts.length < 2) {
      return null;
    }

    const payload = (parts[1] ?? '').trim();
    if (!payload || payload.length > this.maxJwtPayloadB64Length) {
      return null;
    }

    // Base64URL permitidos
    if (!/^[A-Za-z0-9\-_]+$/.test(payload)) {
      return null;
    }

    try {
      const decoded = decodeBase64Utf8(payload);
      if (!decoded || decoded.length > this.maxJwtPayloadJsonLength) {
        return null;
      }

      const parsed: unknown = JSON.parse(decoded);
      return this.isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private isRecord(value: unknown): value is JwtPayload {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
