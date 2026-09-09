import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiBadgeComponent } from '../../../../../shared/components/ui-badge/ui-badge.component';
import { ToastService } from '../../../../../core/services/toast.service';
import { DtoContratoIntegracion } from '../../../services/api-keys.service';

/**
 * La ficha técnica de un canal entrante, tal como hay que entregársela a quien
 * integra desde el otro lado.
 *
 * Todo lo que muestra viene del backend, generado desde los propios endpoints.
 * Antes esto era un par de campos de texto libre en el formulario —«headers
 * requeridos» y «payload de ejemplo»— que alguien llenaba a mano: en cuanto el
 * código cambiaba, la documentación mentía y nadie se enteraba hasta que la
 * integración fallaba en producción.
 */
@Component({
  selector: 'app-contrato-integracion',
  standalone: true,
  imports: [UiSectionHeaderComponent, UiButtonComponent, UiBadgeComponent],
  templateUrl: './contrato-integracion.component.html',
  styleUrls: ['./contrato-integracion.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContratoIntegracionComponent {
  private readonly toast = inject(ToastService);

  readonly contrato = input.required<DtoContratoIntegracion>();
  /** Oculta el encabezado cuando el contenedor ya puso el suyo. */
  readonly conEncabezado = input(true);

  /** Qué se acaba de copiar, para dar acuse en el propio botón. */
  readonly copiado = signal('');

  readonly cabeceras = computed(() =>
    Object.entries(this.contrato().headers ?? {}).map(([clave, valor]) => ({ clave, valor })),
  );

  readonly obligatorios = computed(() => this.contrato().campos.filter(c => c.obligatorio));
  readonly opcionales   = computed(() => this.contrato().campos.filter(c => !c.obligatorio));

  /** El payload de ejemplo con saltos de línea, que en una sola línea no se lee. */
  readonly payloadFormateado = computed(() => {
    try { return JSON.stringify(JSON.parse(this.contrato().ejemploPayload), null, 2); }
    catch { return this.contrato().ejemploPayload; }
  });

  async copiar(texto: string, que: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(que);
      setTimeout(() => { if (this.copiado() === que) this.copiado.set(''); }, 2000);
    } catch {
      // El portapapeles falla sin https o sin permiso; el texto está a la vista
      // para seleccionarlo a mano, así que basta con decirlo.
      this.toast.warning('Copiar', 'El navegador no permitió copiar. Seleccione el texto manualmente.');
    }
  }

  /** Todo el contrato en texto plano, para pegarlo en un correo al proveedor. */
  async copiarTodo(): Promise<void> {
    const c = this.contrato();
    const campo = (x: { nombre: string; tipo: string; obligatorio: boolean; descripcion: string }) =>
      `  - ${x.nombre} (${x.tipo})${x.obligatorio ? ' [obligatorio]' : ''}: ${x.descripcion}`;

    const texto = [
      `${c.titulo}`,
      ``,
      c.descripcion,
      ``,
      `${c.metodo} ${c.urlAbsoluta}`,
      ``,
      `Cabeceras:`,
      ...this.cabeceras().map(h => `  ${h.clave}: ${h.valor}`),
      ``,
      `Cuerpo (JSON):`,
      this.payloadFormateado(),
      ``,
      `Campos:`,
      ...c.campos.map(campo),
      ``,
      `Respuestas:`,
      ...c.respuestas.map(r => `  ${r}`),
      ...(c.notas.length ? ['', 'Notas:', ...c.notas.map(n => `  - ${n}`)] : []),
      ``,
      `Ejemplo:`,
      c.ejemploCurl,
    ].join('\n');

    await this.copiar(texto, 'todo');
  }
}
