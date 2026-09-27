// Qué se verifica aquí: que el visor abre cada stream con el reproductor que
// dice el BACKEND, y que cuando no puede reproducirlo dice por qué en vez de
// dejar un rectángulo negro.
//
// Importa porque el fallo anterior de este módulo fue justo de esta clase: el
// visor eligió el camino nativo del <video>, la CSP bloqueó la petición, y el
// operador vio un error de red que no decía nada del motivo real.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { of } from 'rxjs';
import { CamaraVisorComponent } from './camara-visor.component';
import { CamaraService, DtoCamara, Reproductor } from '../../../../core/services/operacion/camara.service';

const CAM: DtoCamara = {
  id: '1', nombre: 'Cámara centro', numeroCenso: null, direccion: null, municipio: null,
  unidad: null, latitud: 4.6, longitud: -74.1, tienePtz: false, operativa: true,
  estado: 1, camaraCodigo: '1001', integracionId: '7', origen: 'VMS',
  reproducible: true, distancia: null,
};

class ServicioFalso {
  url = 'http://localhost/x.m3u8';
  protocolo = 'hls_s';
  reproductor: Reproductor = 'hls';

  stream() {
    return of({ success: true, message: '', data: {
      url: this.url, autenticacion: 'tok', protocolo: this.protocolo,
      reproductor: this.reproductor, camaraNombre: CAM.nombre, nodo: 'central' } });
  }
  ptz() { return of({ success: true, message: '', data: {
    ok: true, mensaje: '', comando: '', duracionMs: 0, detenida: true } }); }
}

describe('CamaraVisorComponent — elección de reproductor', () => {
  let fixture: ComponentFixture<CamaraVisorComponent>;
  let comp: CamaraVisorComponent;
  let svc: ServicioFalso;

  const montar = async () => {
    fixture = TestBed.createComponent(CamaraVisorComponent);
    comp = fixture.componentInstance;
    fixture.componentRef.setInput('camara', CAM);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    svc = new ServicioFalso();
    await TestBed.configureTestingModule({
      imports: [CamaraVisorComponent],
      providers: [provideZonelessChangeDetection(), { provide: CamaraService, useValue: svc }],
    }).compileComponents();
  });

  it('HLS usa el <video>, no el lienzo del jsDecoder', async () => {
    await montar();
    expect(comp.usaJsDecoder()).toBe(false);
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.cv__lienzo')).toBeNull();
  });

  it('WebSocket cambia al lienzo y explica que falta el jsDecoder', async () => {
    svc.protocolo = 'websocket_s';
    svc.reproductor = 'jsdecoder';
    svc.url = 'wss://vms.local/ws/1001?token=x';
    await montar();

    expect(comp.usaJsDecoder()).toBe(true);
    expect(fixture.nativeElement.querySelector('.cv__lienzo')).not.toBeNull();

    // El SDK no está instalado en el navegador de las pruebas, que es
    // exactamente el caso del puesto que no lo tiene: el visor tiene que
    // decirlo, no fallar en silencio.
    const msg = comp.error();
    expect(msg).not.toBe('');
    expect(msg.toLowerCase()).toContain('jsdecoder');
    // Y tiene que decir qué hacer, no solo que no se puede.
    expect(msg.toLowerCase()).toContain('hls');
  });

  it('WebRTC va al <video>, no al lienzo, y no pasa por hls.js', async () => {
    svc.protocolo = 'rtsp_s';
    svc.reproductor = 'webrtc';
    svc.url = 'http://edge.local:8889/cam-1001/whep';
    await montar();

    // WebRTC y HLS comparten el <video>: uno entra por MSE y el otro por
    // srcObject. El lienzo es solo del jsDecoder.
    expect(comp.usaJsDecoder()).toBe(false);
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
    // En este navegador de pruebas no hay WebRTC, así que lo que se comprueba es
    // que se intentó por ahí y el motivo llega al operador en vez de quedarse en
    // la consola.
    expect(comp.error()).not.toBe('');
  });

  it('un protocolo que ningún navegador reproduce se explica nombrándolo', async () => {
    svc.protocolo = 'rtsp';
    svc.reproductor = 'ninguno';
    svc.url = 'rtsp://vms.local:554/Streaming/1';
    await montar();

    expect(comp.error()).toContain('rtsp');
    expect(comp.error().toLowerCase()).toContain('hls');
  });
});
