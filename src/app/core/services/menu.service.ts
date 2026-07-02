import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DbMenuItem {
  idMenu: number;
  descripcion: string;
  idPadre: number;
  posicion: number;
  tipo: string;
  icono?: string | null;
  vigente: number;
  detalle?: string | null;
}

export interface MenuSaveRequest {
  idMenu?: number | null;
  descripcion: string;
  idPadre: number;
  posicion: number;
  tipo: string;
  icono?: string | null;
  vigente: number;
  detalle?: string | null;
}

export interface MenuEstadoRequest {
  vigente: number;
}

export interface MenuApiResponse {
  success: boolean;
  id: number;
  message: string;
  detail?: string;
}

export interface MenuRolCatalogItem {
  idRol: number;
  descripcion: string;
}

export interface MenuRolItem {
  idMenuRol: number;
  idRol: number;
  descripcionRol: string;
}

export interface MenuRolAssignRequest {
  idRol: number;
}

export interface RoleMenuItem {
  idMenu: number;
  descripcionMenu: string;
  idPadre: number;
  posicion: number;
  tipo: string;
  detalle?: string | null;
}

export interface RoleMenuAssignRequest {
  idMenu: number;
}

@Injectable({ providedIn: 'root' })
export class MenuService {
  constructor(private http: HttpClient) {}

  getByUser(idUsuario: number): Observable<DbMenuItem[]> {
    return this.http.get<DbMenuItem[]>(`${environment.apiBaseUrl}/menu/by-user/${idUsuario}`);
  }

  getMyMenu(): Observable<DbMenuItem[]> {
    return this.http.get<DbMenuItem[]>(`${environment.apiBaseUrl}/menu/me`);
  }

  getAdminMenu(): Observable<DbMenuItem[]> {
    return this.http.get<DbMenuItem[]>(`${environment.apiBaseUrl}/menu/admin`);
  }

  saveAdminMenu(payload: MenuSaveRequest): Observable<MenuApiResponse> {
    return this.http.post<MenuApiResponse>(`${environment.apiBaseUrl}/menu/admin`, payload);
  }

  setEstadoAdminMenu(idMenu: number, payload: MenuEstadoRequest): Observable<MenuApiResponse> {
    return this.http.patch<MenuApiResponse>(`${environment.apiBaseUrl}/menu/admin/${idMenu}/estado`, payload);
  }

  getRolesCatalog(): Observable<MenuRolCatalogItem[]> {
    return this.http.get<MenuRolCatalogItem[]>(`${environment.apiBaseUrl}/menu/admin/roles`);
  }

  getRolesByMenu(idMenu: number): Observable<MenuRolItem[]> {
    return this.http.get<MenuRolItem[]>(`${environment.apiBaseUrl}/menu/admin/${idMenu}/roles`);
  }

  assignRolToMenu(idMenu: number, payload: MenuRolAssignRequest): Observable<MenuApiResponse> {
    return this.http.post<MenuApiResponse>(`${environment.apiBaseUrl}/menu/admin/${idMenu}/roles`, payload);
  }

  removeRolFromMenu(idMenu: number, idRol: number): Observable<MenuApiResponse> {
    return this.http.delete<MenuApiResponse>(`${environment.apiBaseUrl}/menu/admin/${idMenu}/roles/${idRol}`);
  }

  getMenusByRol(idRol: number): Observable<RoleMenuItem[]> {
    return this.http.get<RoleMenuItem[]>(`${environment.apiBaseUrl}/menu/admin/roles/${idRol}/menus`);
  }

  assignMenuToRol(idRol: number, payload: RoleMenuAssignRequest): Observable<MenuApiResponse> {
    return this.http.post<MenuApiResponse>(`${environment.apiBaseUrl}/menu/admin/roles/${idRol}/menus`, payload);
  }

  removeMenuFromRol(idRol: number, idMenu: number): Observable<MenuApiResponse> {
    return this.http.delete<MenuApiResponse>(`${environment.apiBaseUrl}/menu/admin/roles/${idRol}/menus/${idMenu}`);
  }
}

