import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BannerItem } from '../interfaces/banner.interface';

type BannerApiPayload =
  | BannerItem[]
  | {
      respuesta?: BannerItem[] | null;
      data?: BannerItem[] | null;
      items?: BannerItem[] | null;
    };

@Injectable({ providedIn: 'root' })
export class BannerService {
  private readonly baseUrl = environment.bannerApiUrl || `${environment.apiBaseUrl}/Banner`;

  constructor(private http: HttpClient) {}

  getPublicos(identificacion?: number | null): Observable<BannerItem[]> {
    const options =
      identificacion && identificacion > 0
        ? { params: new HttpParams().set('identificacion', String(identificacion)) }
        : {};

    return this.http
      .get<BannerApiPayload>(this.baseUrl, options)
      .pipe(map((payload) => this.unwrapItems(payload).map((item, index) => this.normalize(item, index))));
  }

  private unwrapItems(payload: BannerApiPayload | null | undefined): BannerItem[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    return payload?.respuesta ?? payload?.data ?? payload?.items ?? [];
  }

  private normalize(item: BannerItem, index: number): BannerItem {
    return {
      ...item,
      idBanner: Number(item?.idBanner ?? index + 1),
      orden: Number(item?.orden ?? index + 1),
      vigente: Number(item?.vigente ?? 1),
      titulo: item?.titulo ?? `Banner ${index + 1}`,
      urlImagen: item?.urlImagen ?? '',
      urlDestino: item?.urlDestino ?? '',
    };
  }
}
