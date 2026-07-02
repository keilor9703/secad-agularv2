import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DtoSliders {
  idSlider: number;
  titulo?: string | null;
  subtitulo?: string | null;
  urlImagen?: string | null;
  urlDestino?: string | null;
  orden: number;
  vigente: number;
  fechaInicio?: string | null;
  fechaFin?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SliderService {
  private readonly apiUrl = environment.sliderApiUrl;
  public readonly imageBaseUrl = environment.sliderMediaBaseUrl;

  constructor(private http: HttpClient) {}

  /**
   * Obtiene los sliders desde la nueva API externa configurada.
   */
  getPublicos(): Observable<DtoSliders[]> {
    return this.http.get<DtoSliders[]>(this.apiUrl);
  }
}
