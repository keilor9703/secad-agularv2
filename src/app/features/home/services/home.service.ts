import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface HomeStats {
  usuariosActivos: number;
  reportesGenerados: number;
  alertasSistema: number;
}

@Injectable({ providedIn: 'root' })
export class HomeService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Home`;

  constructor(private http: HttpClient) {}

  getStats(): Observable<HomeStats> {
    return this.http.get<HomeStats>(`${this.baseUrl}/stats`);
  }
}
