import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import {
  UiButtonAppearance,
  UiButtonComponent,
  UiButtonSize,
  UiButtonVariant,
} from '../../../../../shared/components/ui-button/ui-button.component';
import { UiSearchInputComponent } from '../../../../../shared/components/ui-search-input/ui-search-input.component';

interface ButtonToneDemo {
  label: string;
  variant: UiButtonVariant;
  icon: string;
}

interface ButtonAppearanceDemo {
  label: string;
  appearance: UiButtonAppearance;
}

interface ButtonSizeDemo {
  label: string;
  size: UiButtonSize;
}

@Component({
  selector: 'app-button-search-demo',
  standalone: true,
  imports: [ReactiveFormsModule, UiButtonComponent, UiSearchInputComponent],
  templateUrl: './button-search-demo.component.html',
  styleUrl: './button-search-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonSearchDemoComponent {
  readonly attachedSearch = new FormControl('', { nonNullable: true });
  readonly detachedSearch = new FormControl('', { nonNullable: true });
  readonly customSearch = new FormControl('', { nonNullable: true });

  readonly feedback = signal('Interactúe con un ejemplo para observar el evento emitido.');
  readonly copiedSnippet = signal('');

  readonly solidButtons: ButtonToneDemo[] = [
    { label: 'Primario', variant: 'primary', icon: 'fa-solid fa-floppy-disk' },
    { label: 'Secundario', variant: 'secondary', icon: 'fa-solid fa-shield-halved' },
    { label: 'Información', variant: 'info', icon: 'fa-solid fa-circle-info' },
    { label: 'Éxito', variant: 'success', icon: 'fa-solid fa-check' },
    { label: 'Advertencia', variant: 'warning', icon: 'fa-solid fa-triangle-exclamation' },
    { label: 'Peligro', variant: 'danger', icon: 'fa-solid fa-trash-can' },
    { label: 'Neutral', variant: 'neutral', icon: 'fa-solid fa-ellipsis' },
  ];

  readonly appearances: ButtonAppearanceDemo[] = [
    { label: 'Sólido', appearance: 'solid' },
    { label: 'Suave', appearance: 'soft' },
    { label: 'Contorno', appearance: 'outline' },
    { label: 'Ghost', appearance: 'ghost' },
  ];

  readonly sizes: ButtonSizeDemo[] = [
    { label: 'Pequeño', size: 'sm' },
    { label: 'Mediano', size: 'md' },
    { label: 'Grande', size: 'lg' },
  ];

  readonly attachedSearchCode = `<app-ui-search-input
  formControlName="criterio"
  label="Buscar funcionario"
  placeholder="Nombre o identificación"
  buttonText="Consultar"
  buttonVariant="secondary"
  buttonAppearance="solid"
  buttonIconColor="#c8ff00"
  [hideButtonTextOnMobile]="true"
  (search)="consultar($event)"
/>`;

  readonly detachedSearchCode = `<app-ui-search-input
  formControlName="criterio"
  label="Buscar por nombre"
  placeholder="Escriba un nombre"
  buttonText="Filtrar"
  buttonLayout="detached"
  buttonVariant="primary"
  [buttonGap]="10"
  [hideButtonTextOnMobile]="false"
  (search)="filtrar($event)"
/>`;

  readonly customSearchCode = `<app-ui-search-input
  formControlName="criterio"
  buttonLayout="detached"
  buttonText="Verificar"
  buttonBackgroundColor="#5b21b6"
  buttonTextColor="#ffffff"
  buttonBorderColor="#4c1d95"
  buttonIconColor="#fde047"
/>`;

  readonly buttonCode = `<app-ui-button
  type="submit"
  variant="secondary"
  appearance="solid"
  size="md"
  icon="fa-solid fa-floppy-disk"
  iconPosition="start"
  [loading]="guardando()"
  (buttonClick)="guardar()"
>
  Guardar cambios
</app-ui-button>`;

  readonly customButtonCode = `<app-ui-button
  variant="neutral"
  appearance="solid"
  icon="fa-solid fa-wand-magic-sparkles"
  backgroundColor="#5b21b6"
  textColor="#ffffff"
  borderColor="#4c1d95"
  iconColor="#fde047"
>
  Acción personalizada
</app-ui-button>`;

  onSearch(source: string, value: string): void {
    this.feedback.set(`${source}: "${value || 'sin criterio'}"`);
  }

  onButton(label: string): void {
    this.feedback.set(`Botón activado: ${label}`);
  }

  async copySnippet(name: string, code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copiedSnippet.set(name);
      this.feedback.set(`Código de ${name} copiado al portapapeles.`);
    } catch {
      this.feedback.set(
        'No fue posible copiar automáticamente. Puede seleccionar el código manualmente.',
      );
    }
  }
}
