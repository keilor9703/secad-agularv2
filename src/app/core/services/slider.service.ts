import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BannerItem } from '../interfaces/banner.interface';
import { BannerService } from './banner.service';

export type DtoSliders = BannerItem;

@Injectable({ providedIn: 'root' })
export class SliderService {
  public readonly imageBaseUrl = environment.mediaBaseUrl || environment.sliderMediaBaseUrl || '';

  constructor(private bannerService: BannerService) {}

  getPublicos(): Observable<BannerItem[]> {
    return this.bannerService.getPublicos();
  }
}