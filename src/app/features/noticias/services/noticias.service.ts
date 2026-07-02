import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of, switchMap } from 'rxjs';

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

interface JsonApiResponse {
  data: JsonApiResource[];
  included?: JsonApiResource[];
}

export interface NoticiaCard {
  id: string;
  title: string;
  lead: string;
  image: string;
  date: string;
  url: string;
}

@Injectable({ providedIn: 'root' })
export class NoticiasService {
  private readonly apiUrlAdvanced =
    '/jsonapi/node/noticias?sort=-created&page[limit]=24&filter[status][value]=1&include=field_imagen_noticia,field_imagen_noticia.field_media_image';
  private readonly apiUrlBasic =
    '/jsonapi/node/noticias?sort=-created&page[limit]=24&filter[status][value]=1&include=field_imagen_noticia';
  private readonly apiUrlEsAdvanced =
    '/es/jsonapi/node/noticias?sort=-created&page[limit]=24&filter[status][value]=1&include=field_imagen_noticia,field_imagen_noticia.field_media_image';
  private readonly apiUrlEsBasic =
    '/es/jsonapi/node/noticias?sort=-created&page[limit]=24&filter[status][value]=1&include=field_imagen_noticia';
  private readonly siteBaseUrl = 'https://www.policia.gov.co';
  private readonly fallbackImage = 'imagenes/actividades/news2.jpg';

  constructor(private http: HttpClient) {}

  getNoticias(): Observable<NoticiaCard[]> {
    return this.fetchWithFallback(this.apiUrlAdvanced, this.apiUrlBasic).pipe(
      switchMap((news) =>
        news.length > 0
          ? of(news)
          : this.fetchWithFallback(this.apiUrlEsAdvanced, this.apiUrlEsBasic)
      )
    );
  }

  private fetchWithFallback(primaryUrl: string, fallbackUrl: string): Observable<NoticiaCard[]> {
    return this.fetchNoticias(primaryUrl).pipe(
      catchError(() => this.fetchNoticias(fallbackUrl))
    );
  }

  private fetchNoticias(url: string): Observable<NoticiaCard[]> {
    return this.http.get<JsonApiResponse>(url).pipe(map((resp) => this.mapNoticias(resp)));
  }

  private mapNoticias(resp: JsonApiResponse): NoticiaCard[] {
    const includedById = new Map<string, JsonApiResource>();
    (resp.included ?? []).forEach((item) => includedById.set(item.id, item));

    return (resp.data ?? []).map((node) => {
      const attrs = node.attributes ?? {};
      const imageResource = this.resolveImageResource(node, includedById);

      const imageUrl = this.resolveImageUrl(imageResource?.attributes);
      const title = String(attrs['title'] ?? 'Sin título');
      const lead = this.resolveLead(attrs);
      const date = this.formatDate(typeof attrs['created'] === 'string' ? attrs['created'] : undefined);
      const url = this.resolveNodeUrl(attrs);

      return {
        id: node.id,
        title,
        lead,
        image: imageUrl,
        date,
        url
      };
    });
  }

  private resolveImageResource(
    node: JsonApiResource,
    includedById: Map<string, JsonApiResource>
  ): JsonApiResource | undefined {
    const imageRelData = this.asRecord(node.relationships?.['field_imagen_noticia'])?.['data'];
    const mediaId = this.extractFirstRelationshipId(imageRelData);
    if (!mediaId) {
      return undefined;
    }

    const mediaResource = includedById.get(mediaId);
    if (!mediaResource) {
      return undefined;
    }

    // A veces la relación apunta directo a file--file
    if (mediaResource.type === 'file--file') {
      return mediaResource;
    }

    // Caso común Drupal: media--image -> field_media_image -> file--file
    const mediaImageRel = this.asRecord(mediaResource.relationships?.['field_media_image'])?.['data'];
    const fileId = this.extractFirstRelationshipId(mediaImageRel);
    return fileId ? includedById.get(fileId) : undefined;
  }

  private extractFirstRelationshipId(relData: unknown): string | undefined {
    if (!relData) {
      return undefined;
    }
    if (Array.isArray(relData)) {
      const first = relData[0];
      return this.isJsonApiIdentifier(first) ? first.id : undefined;
    }
    return this.isJsonApiIdentifier(relData) ? relData.id : undefined;
  }

  private resolveImageUrl(attrs: Record<string, unknown> | undefined): string {
    const uri = this.asRecord(attrs?.['uri']);
    const directUrl = uri?.['url'];
    if (directUrl) {
      const value = String(directUrl);
      return value.startsWith('http') ? value : `${this.siteBaseUrl}${value}`;
    }

    const raw = uri?.['value'];
    if (typeof raw === 'string' && raw.startsWith('public://')) {
      return `${this.siteBaseUrl}/sites/default/files/${raw.replace('public://', '')}`;
    }

    return this.fallbackImage;
  }

  private resolveLead(attrs: Record<string, unknown>): string {
    const candidates = [
      attrs['field_entradilla'],
      attrs['field_resumen'],
      attrs['field_bajada'],
      this.asRecord(attrs['body'])?.['summary'],
      this.asRecord(attrs['body'])?.['value']
    ];

    const text = candidates.find((value) => typeof value === 'string' && value.trim().length > 0) as
      | string
      | undefined;

    if (!text) {
      return 'Sin entradilla disponible.';
    }

    const noHtml = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return noHtml.length > 180 ? `${noHtml.slice(0, 177)}...` : noHtml;
  }

  private resolveNodeUrl(attrs: Record<string, unknown>): string {
    const alias = this.asRecord(attrs['path'])?.['alias'];
    if (alias) {
      const value = String(alias);
      return value.startsWith('http') ? value : `${this.siteBaseUrl}${value}`;
    }

    const nid = attrs['drupal_internal__nid'];
    if (nid) {
      return `${this.siteBaseUrl}/node/${nid}`;
    }

    return this.siteBaseUrl;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private isJsonApiIdentifier(value: unknown): value is { id: string } {
    return typeof this.asRecord(value)?.['id'] === 'string';
  }

  private formatDate(rawDate: string | undefined): string {
    if (!rawDate) {
      return '';
    }

    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }
}
