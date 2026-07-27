import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BannerItem } from '../interfaces/banner.interface';

@Injectable({ providedIn: 'root' })
export class BannerService {
  private readonly baseUrl = environment.bannerApiUrl || `${environment.apiBaseUrl}/Banner`;

  constructor(private http: HttpClient) {}

  getPublicos(): Observable<BannerItem[]> {
    return this.http.get<BannerItem[]>(this.baseUrl).pipe(
      map((items) => (items ?? []).map((item, index) => this.normalize(item, index))),
    );
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