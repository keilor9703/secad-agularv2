import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HomeStats } from '../../services/home.service';

@Component({
  selector: 'app-home-stats',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './home-stats.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './home-stats.component.scss',
})
export class HomeStatsComponent {
  readonly stats = input.required<HomeStats>();
}
