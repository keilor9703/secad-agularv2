import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface DtoFuncionario {
  identificacion?: string | null;
  nombres?: string | null;
  apellidos?: string | null;
  situacionLaboral?: string | null;
  correo?: string | null;
  usuario?: string | null;
  celular?: string | null;
  dependencia?: string | null;
  siglaFisica?: string | null;
  siglaLaborando?: string | null;
  nombreGrado?: string | null;
  gradAlfabetico?: string | null;
  funcionarioCodigo?: string | null;
  undeLaborandoCodigo?: string | null;
  codigoCargo?: string | null;
  cargo?: string | null;
  activo?: boolean;
}

export interface DtoRolAsignado {
  id: number;
  rol?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  estado?: string | null;
  justificacion?: string | null;
}

export interface DtoRolCatalogo {
  id: number;
  nombre?: string | null;
}

export interface UsuarioConsultaResult {
  funcionario: DtoFuncionario;
  fotoBase64: string | null;
  rolesAsignados: DtoRolAsignado[];
  rolesCatalogo: DtoRolCatalogo[];
}

export interface UsuarioListadoItem {
  idUsuario: number;
  identificacion: string;
  username: string;
  nombreCompleto: string;
  rol: string;
  fechaFinRol?: string | null;
}

export interface SaveUsuarioRequest {
  username: string;
  identificacion: string;
  nombres: string;
  apellidos: string;
  email: string;
  gradAlfabetico: string;
  funcionario: string;
  undeLaborando: string;
  codigoCargo: string;
  activo: boolean;
}

export interface SaveUsuarioResponse {
  success: boolean;
  idUsuario: number;
  message: string;
}

export interface AsignarRolRequest {
  usuarioId: number;
  usuario: string;
  identificacion: string;
  rolId: number;
  justificacion: string;
  fechaFin: string;
  vigente: number;
}

export interface AsignarRolResponse {
  success: boolean;
  idRolUserAdmin?: number;
  message: string;
}

export interface EliminarRolResponse {
  success: boolean;
  message: string;
}

export interface EliminarUsuarioResponse {
  success: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class UsuarioAdminService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Usuario`;

  constructor(private http: HttpClient) {}

  consultarUsuarioPorIdentificacion(identificacion: string): Observable<UsuarioConsultaResult> {
    const id = identificacion.trim();
    return this.http
      .get<DtoFuncionario>(`${this.baseUrl}/Funcionario`, {
        params: { identificacion: id },
      })
      .pipe(
        map((funcionario) => funcionario ?? {}),
        // Con el usuario empresarial ya resuelto, pedimos datos complementarios en paralelo.
        // Esto evita consultar roles asignados sin conocer el username real en DB.
        switchMap((funcionario) => {
          const usuario = (funcionario.usuario ?? '').trim();
          return forkJoin({
            funcionario: of(funcionario),
            fotoBase64: this.http
              .get(`${this.baseUrl}/Foto`, {
                params: { identificacion: id },
                responseType: 'text',
              })
              .pipe(
                map((raw) => this.normalizeFotoResponse(raw)),
                catchError(() => of(null)),
              ),
            rolesAsignados: usuario
              ? this.http
                  .get<DtoRolAsignado[]>(`${this.baseUrl}/RolesAsignados`, {
                    params: { usuario },
                  })
                  .pipe(catchError(() => of([])))
              : of([]),
            rolesCatalogo: this.http
              .get<DtoRolCatalogo[]>(`${this.baseUrl}/Roles`)
              .pipe(catchError(() => of([]))),
          });
        }),
      );
  }

  getListadoUsuarios(nombre?: string): Observable<UsuarioListadoItem[]> {
    const term = (nombre ?? '').trim();
    return this.http.get<UsuarioListadoItem[]>(`${this.baseUrl}/Listado`, {
      params: term ? { nombre: term } : {},
    });
  }

  guardarUsuario(payload: SaveUsuarioRequest): Observable<SaveUsuarioResponse> {
    return this.http.post<SaveUsuarioResponse>(this.baseUrl, payload);
  }

  asignarRol(payload: AsignarRolRequest): Observable<AsignarRolResponse> {
    return this.http.post<AsignarRolResponse>(`${this.baseUrl}/Roles`, payload);
  }

  eliminarRol(
    rolId: number,
    usuario: string,
    identificacion: string,
  ): Observable<EliminarRolResponse> {
    return this.http.delete<EliminarRolResponse>(`${this.baseUrl}/Roles/${rolId}`, {
      params: {
        usuario: (usuario ?? '').trim(),
        identificacion: (identificacion ?? '').trim(),
      },
    });
  }

  eliminarUsuario(idUsuario: number): Observable<EliminarUsuarioResponse> {
    return this.http.delete<EliminarUsuarioResponse>(`${this.baseUrl}/${idUsuario}`);
  }

  private normalizeFotoResponse(raw: string | null): string | null {
    if (!raw) {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    // Si backend responde JSON string ("..."), quitar envoltura.
    let decoded = trimmed;
    try {
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        decoded = JSON.parse(trimmed);
      }
    } catch {
      decoded = trimmed;
    }

    if (!decoded || decoded.length < 20) {
      return null;
    }

    if (decoded.startsWith('data:image/')) {
      return decoded;
    }

    return `data:image/jpeg;base64,${decoded}`;
  }
}
