import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiTooltipComponent } from '../../../../../shared/components/ui-tooltip/ui-tooltip.component';

@Component({
  selector: 'app-tooltip-demo',
  standalone: true,
  imports: [UiButtonComponent, UiTooltipComponent],
  templateUrl: './tooltip-demo.component.html',
  styleUrl: './tooltip-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TooltipDemoComponent {}
