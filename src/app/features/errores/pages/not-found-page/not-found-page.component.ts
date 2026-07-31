
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './not-found-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./not-found-page.component.scss']
})
export class NotFoundPageComponent {}
