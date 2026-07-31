import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NoticiasPageComponent } from './noticias-page.component';

describe('NoticiasPageComponent', () => {
  let component: NoticiasPageComponent;
  let fixture: ComponentFixture<NoticiasPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NoticiasPageComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(NoticiasPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
