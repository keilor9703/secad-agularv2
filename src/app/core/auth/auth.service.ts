import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'sisge_token';
  private readonly userKey = 'sisge_usuario';
  private readonly authKey = 'sisge_auth';
  private readonly userIdKey = 'sisge_user_id';
  private readonly identificationKey = 'sisge_identificacion';
  private readonly loginUrl = `${environment.apiBaseUrl}/Cuenta/Token`;
  private readonly maxJwtLength = 8192;
  private readonly maxJwtPayloadB64Length = 4096;
  private readonly maxJwtPayloadJsonLength = 6144;

  constructor(private http: HttpClient) {}

  login(usuario: string, contrasena: string): Observable<LoginResponse> {
    const payload: LoginRequest = {
      Usuario: usuario,
      Contrasena: contrasena
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
      })
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

      const roleClaimUri = ['http', '://schemas.microsoft.com/ws/2008/06/identity/claims/role'].join('');
      const roleClaimShort = 'role';
      const roleClaimLegacy = 'roles';

      const rawRoles = [
        parsed?.[roleClaimUri],
        parsed?.[roleClaimShort],
        parsed?.[roleClaimLegacy]
      ];

      const values = rawRoles.flatMap((r) => (Array.isArray(r) ? r : [r])).map((v) => String(v ?? '').trim());
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

      const nameIdentifierClaim = 'http' + '://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
      const rawId =
        parsed['id_usuario'] ??
        parsed['nameid'] ??
        parsed['sub'] ??
        parsed[nameIdentifierClaim];
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

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    if (!decoded || decoded.length > this.maxJwtPayloadJsonLength) {
      return null;
    }

    const parsed: unknown = JSON.parse(decoded);
    return this.isRecord(parsed) ? parsed : null;
  }

  private isRecord(value: unknown): value is JwtPayload {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
