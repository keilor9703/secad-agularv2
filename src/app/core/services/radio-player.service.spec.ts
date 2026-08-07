import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { RadioPlayerService } from './radio-player.service';

describe('RadioPlayerService', () => {
  let service: RadioPlayerService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });

    service = TestBed.inject(RadioPlayerService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('normaliza emisoras activas y selecciona la primera disponible', () => {
    service.initialize();

    httpTesting.expectOne(environment.radioApiUrl).flush([
      {
        idEmisora: 7,
        nombre: 'Bogotá',
        streamUrl: 'https://radio.example/live',
        logoUrl: '/uploads/radio/bogota.svg',
        orden: 1,
        activo: 1,
      },
      {
        idEmisora: 8,
        nombre: 'Inactiva',
        streamUrl: 'https://radio.example/off',
        logoUrl: null,
        orden: 2,
        activo: 0,
      },
    ]);

    expect(service.stations().length).toBe(1);
    expect(service.selectedStationId()).toBe('7');
    expect(service.currentStation()?.name).toBe('Bogotá');
    expect(service.status().state).toBe('online');
  });

  it('limita el volumen y conserva el estado de silencio sin navegador', () => {
    service.setVolume(1.4);
    expect(service.volume()).toBe(1);

    service.toggleMuted();
    expect(service.isMuted()).toBe(true);
  });
});
