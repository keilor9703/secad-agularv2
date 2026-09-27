// Qué se verifica aquí: que mantener pulsado ENCADENA pasos en vez de mandar un
// «arranca» y confiar en el «para», y que soltar corta la cadena. Es la
// propiedad de la que depende que una cámara no se quede girando sola, y lo
// único que puede comprobarla es contar las llamadas reales en el tiempo.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Observable, of, timer } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { CamaraVisorComponent } from './camara-visor.component';
import {
  CamaraService, DtoCamara, DtoPtzPeticion, DtoPtzResultado, PTZ, Reproductor,
} from '../../../../core/services/operacion/camara.service';

/** Cámara PTZ de prueba. */
const CAM: DtoCamara = {
  id: '1', nombre: 'PTZ Parque', numeroCenso: null, direccion: null, municipio: null,
  unidad: null, latitud: 4.6, longitud: -74.1, tienePtz: true, operativa: true,
  estado: 1, camaraCodigo: '1002', integracionId: '7', origen: 'VMS',
  reproducible: true, distancia: null,
};

class CamaraServiceFalso {
  /** Cada movimiento pedido, con el instante en que se pidió. */
  readonly movimientos: Array<DtoPtzPeticion & { t: number }> = [];
  /** Lo que tarda el backend en responder: es el tiempo que la cámara se mueve. */
  latencia = 60;
  siguienteFalla = false;
  detenida = true;

  /** Lo que devolvería el backend. Se cambia en las pruebas de protocolo. */
  respuestaStream = {
    url: 'http://localhost/x.m3u8', autenticacion: null as string | null,
    protocolo: 'hls_s', reproductor: 'hls' as Reproductor,
    camaraNombre: 'PTZ Parque', nodo: 'central',
  };

  stream() {
    return of({ success: true, message: '', data: this.respuestaStream });
  }

  ptz(_codigo: string, p: DtoPtzPeticion):
    Observable<{ success: boolean; message: string; data: DtoPtzResultado }> {
    this.movimientos.push({ ...p, t: Date.now() });
    if (this.siguienteFalla) {
      this.siguienteFalla = false;
      return timer(this.latencia).pipe(map(() => { throw { error: { message: 'El VMS dijo no.' } }; }));
    }
    return of({
      success: true, message: this.detenida ? 'Movimiento completado.' : 'no confirmó la parada',
      data: { ok: true, mensaje: '', comando: p.comando, duracionMs: p.duracionMs ?? 0,
              detenida: this.detenida },
    }).pipe(delay(this.latencia));
  }
}

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('CamaraVisorComponent — control PTZ', () => {
  let fixture: ComponentFixture<CamaraVisorComponent>;
  let comp: CamaraVisorComponent;
  let svc: CamaraServiceFalso;

  beforeEach(async () => {
    svc = new CamaraServiceFalso();
    await TestBed.configureTestingModule({
      imports: [CamaraVisorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: CamaraService, useValue: svc },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CamaraVisorComponent);
    comp = fixture.componentInstance;
    fixture.componentRef.setInput('camara', CAM);
    await fixture.whenStable();
  });

  it('un toque manda UN solo movimiento, con la velocidad y la duración acotadas', async () => {
    comp.unToque(PTZ.izquierda);
    await esperar(150);

    expect(svc.movimientos.length).toBe(1);
    expect(svc.movimientos[0].comando).toBe('LEFT');
    expect(svc.movimientos[0].velocidad).toBe(40);
    // La duración la fija el visor, no el usuario: es el freno que impide
    // pedirle al VMS un giro largo desde el navegador.
    expect(svc.movimientos[0].duracionMs).toBeGreaterThan(0);
    expect(svc.movimientos[0].duracionMs).toBeLessThanOrEqual(2000);
  });

  it('mantener pulsado encadena pasos, y soltar los corta', async () => {
    comp.empezarMovimiento(PTZ.derecha, new Event('pointerdown'));
    await esperar(260);
    const durante = svc.movimientos.length;
    comp.terminarMovimiento();
    await esperar(300);

    expect(durante).toBeGreaterThan(1);                     // encadenó
    expect(svc.movimientos.length).toBeLessThanOrEqual(durante + 1);  // y paró al soltar
    expect(svc.movimientos.every(m => m.comando === 'RIGHT')).toBe(true);
  });

  it('nunca hay dos movimientos en vuelo a la vez', async () => {
    svc.latencia = 120;
    comp.empezarMovimiento(PTZ.izquierda, new Event('pointerdown'));
    // Un segundo comando mientras el primero está en vuelo no sale.
    comp.unToque(PTZ.derecha);
    await esperar(40);
    expect(svc.movimientos.length).toBe(1);
    comp.terminarMovimiento();
    await esperar(200);
  });

  it('soltar el puntero fuera de la ventana también corta la cadena', async () => {
    comp.empezarMovimiento(PTZ.arriba, new Event('pointerdown'));
    await esperar(140);
    comp.alSoltarFuera();
    const alSoltar = svc.movimientos.length;
    await esperar(300);

    expect(svc.movimientos.length).toBeLessThanOrEqual(alSoltar + 1);
  });

  it('un fallo del VMS corta la cadena y se lo dice al operador', async () => {
    svc.siguienteFalla = true;
    comp.empezarMovimiento(PTZ.abajo, new Event('pointerdown'));
    await esperar(300);

    expect(svc.movimientos.length).toBe(1);
    expect(comp.ptzAviso()).toContain('El VMS dijo no.');
    expect(comp.ptzEnCurso()).toBe('');
    comp.terminarMovimiento();
  });

  it('si el VMS no confirma la parada, el operador se entera', async () => {
    svc.detenida = false;
    comp.unToque(PTZ.izquierda);
    await esperar(150);

    expect(comp.ptzAviso()).toContain('no confirmó la parada');
  });

  it('el preset se valida antes de salir a la red', async () => {
    comp.preset.set(0);
    comp.irAPreset();
    await esperar(120);
    expect(svc.movimientos.length).toBe(0);
    expect(comp.ptzAviso()).toContain('1 y 256');

    comp.preset.set(300);
    comp.irAPreset();
    await esperar(120);
    expect(svc.movimientos.length).toBe(0);

    comp.preset.set(4);
    comp.irAPreset();
    await esperar(150);
    expect(svc.movimientos.length).toBe(1);
    expect(svc.movimientos[0].comando).toBe('GOTO_PRESET');
    expect(svc.movimientos[0].preset).toBe(4);
  });

  it('cambiar de cámara deja el mando limpio', async () => {
    comp.panelPtz.set(true);
    comp.ptzAviso.set('algo pasó');
    fixture.componentRef.setInput('camara', { ...CAM, camaraCodigo: '1003' });
    await fixture.whenStable();

    expect(comp.panelPtz()).toBe(false);
    expect(comp.ptzAviso()).toBe('');
    expect(comp.ptzEnCurso()).toBe('');
  });

  it('destruir el visor corta la cadena: no sigue pidiendo movimientos', async () => {
    comp.empezarMovimiento(PTZ.izquierda, new Event('pointerdown'));
    await esperar(100);
    const alDestruir = svc.movimientos.length;
    fixture.destroy();
    await esperar(300);

    expect(svc.movimientos.length).toBeLessThanOrEqual(alDestruir + 1);
  });
});
