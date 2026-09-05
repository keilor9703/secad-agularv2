import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiModalComponent } from './ui-modal.component';

/**
 * ui-modal proyecta EXACTAMENTE dos ranuras: [modal-body] y [modal-actions].
 * Un nombre parecido pero distinto —«modal-footer»— no da error de compilación
 * ni aviso en consola: simplemente no pinta nada. Así desapareció el botón de
 * guardar del modal de códigos de caso, dejando la pantalla sin forma de
 * guardar. Esta prueba fija el contrato para que la próxima vez se vea aquí.
 */
@Component({
  standalone: true,
  imports: [UiModalComponent],
  template: `
    <app-ui-modal [open]="true" title="Prueba">
      <div modal-body>cuerpo</div>
      <div modal-actions><button id="ok">Guardar</button></div>
      <div modal-footer><button id="fantasma">Guardar</button></div>
    </app-ui-modal>
  `,
})
class HostComponent {}

describe('UiModalComponent — ranuras de contenido', () => {
  it('pinta lo proyectado en [modal-actions] y descarta un nombre inventado', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const raiz: HTMLElement = fixture.nativeElement;
    expect(raiz.querySelector('#ok')).not.toBeNull();
    expect(raiz.querySelector('#fantasma')).toBeNull();
  });
});
