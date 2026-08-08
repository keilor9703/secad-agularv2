import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import {
  UiToggleComponent,
  type UiToggleSize,
} from '../../../../../shared/components/ui-toggle/ui-toggle.component';

interface ToggleDemoForm {
  notifications: FormControl<boolean>;
  secureAccess: FormControl<boolean>;
  maintenance: FormControl<boolean>;
}

@Component({
  selector: 'app-toggle-demo',
  standalone: true,
  imports: [ReactiveFormsModule, UiToggleComponent],
  templateUrl: './toggle-demo.component.html',
  styleUrl: './toggle-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToggleDemoComponent {
  readonly sizes: readonly UiToggleSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];

  readonly form = new FormGroup<ToggleDemoForm>({
    notifications: new FormControl(true, { nonNullable: true }),
    secureAccess: new FormControl(false, { nonNullable: true }),
    maintenance: new FormControl(false, { nonNullable: true }),
  });

  readonly reactiveUsage = `readonly form = new FormGroup({
  notifications: new FormControl(true, { nonNullable: true }),
});

<form [formGroup]="form">
  <app-ui-toggle
    formControlName="notifications"
    label="Recibir notificaciones"
    hint="Se puede cambiar más adelante."
    variant="institutional"
    size="md"
    [showIcons]="true"
  />
</form>`;

  readonly standaloneUsage = `<app-ui-toggle
  ariaLabel="Habilitar sincronización"
  size="lg"
  variant="neutral"
  [checked]="syncEnabled()"
  [showIcons]="true"
  (checkedChange)="syncEnabled.set($event)"
/>`;
}
