import { CommonModule } from '@angular/common';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { HomeStats } from '../../services/home.service';

@Component({
  selector: 'app-home-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-stats.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home-stats.component.scss',
})
export class HomeStatsComponent {
  @Input({ required: true }) stats!: HomeStats;
}
