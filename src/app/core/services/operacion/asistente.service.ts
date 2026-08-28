import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface AsistenteCategoria {
  id: string;           // Snowflake → string en JSON
  codigo: string;
  descripcion: string;
  icono: string;
  orden: number;
  activo: boolean;
  totalPreguntas: number;
}

export interface AsistenteCategoriaRequest {
  Codigo: string;
  Descripcion: string;
  Icono: string;
  Orden: number;
  Activo: boolean;
}

export interface AsistentePregunta {
  id: string;           // Snowflake → string en JSON
  categoriaId?: string;
  categoriaDesc?: string;
  pregunta: string;
  ayuda?: string;
  tipoRespuesta: string;   // TEXTO | SINO | NUMERO | SELECCION
  opciones?: string;       // JSON array de strings (solo para SELECCION)
  obligatoria: boolean;
  orden: number;
  activo: boolean;
}

export interface AsistentePreguntaRequest {
  CategoriaId?: string;
  Pregunta: string;
  Ayuda?: string;
  TipoRespuesta: string;
  Opciones?: string;
  Obligatoria: boolean;
  Orden: number;
  Activo: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parsea el campo `opciones` (JSON string) a un array de strings. */
export function parsearOpciones(opciones?: string | null): string[] {
  if (!opciones) return [];
  try { return JSON.parse(opciones) as string[]; } catch { return []; }
}

/** Tipos de respuesta disponibles para el selector del formulario. */
export const TIPOS_RESPUESTA: { valor: string; label: string; icono: string }[] = [
  { valor: 'TEXTO',     label: 'Texto libre',    icono: 'fa-keyboard'     },
  { valor: 'SINO',      label: 'Sí / No',        icono: 'fa-toggle-on'    },
  { valor: 'NUMERO',    label: 'Número',          icono: 'fa-hashtag'      },
  { valor: 'SELECCION', label: 'Selección',       icono: 'fa-list-check'   },
];

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AsistenteService {
  private readonly base = `${environment.apiBaseUrl}/Asistente`;

  constructor(private http: HttpClient) {}

  // ── Categorías ──────────────────────────────────────────────────────────

  getCategorias(soloActivas = true): Observable<{ success: boolean; data: AsistenteCategoria[] }> {
    const params = new HttpParams().set('soloActivas', String(soloActivas));
    return this.http.get<{ success: boolean; data: AsistenteCategoria[] }>(
      `${this.base}/categorias`, { params });
  }

  createCategoria(req: AsistenteCategoriaRequest): Observable<{
    success: boolean; data: AsistenteCategoria; message: string
  }> {
    return this.http.post<{ success: boolean; data: AsistenteCategoria; message: string }>(
      `${this.base}/categorias`, req);
  }

  updateCategoria(id: string, req: AsistenteCategoriaRequest): Observable<{
    success: boolean; message: string
  }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.base}/categorias/${id}`, req);
  }

  deleteCategoria(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.base}/categorias/${id}`);
  }

  // ── Preguntas ────────────────────────────────────────────────────────────

  getPreguntas(categoriaId?: string | null, soloActivas = true): Observable<{
    success: boolean; data: AsistentePregunta[]
  }> {
    let params = new HttpParams().set('soloActivas', String(soloActivas));
    if (categoriaId) params = params.set('categoriaId', categoriaId);
    return this.http.get<{ success: boolean; data: AsistentePregunta[] }>(
      `${this.base}/preguntas`, { params });
  }

  createPregunta(req: AsistentePreguntaRequest): Observable<{
    success: boolean; data: AsistentePregunta; message: string
  }> {
    return this.http.post<{ success: boolean; data: AsistentePregunta; message: string }>(
      `${this.base}/preguntas`, req);
  }

  updatePregunta(id: string, req: AsistentePreguntaRequest): Observable<{
    success: boolean; message: string
  }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.base}/preguntas/${id}`, req);
  }

  deletePregunta(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.base}/preguntas/${id}`);
  }
}
