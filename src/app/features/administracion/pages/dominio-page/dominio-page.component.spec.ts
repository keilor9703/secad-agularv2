import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DominioPageComponent } from './dominio-page.component';

describe('DominioPageComponent', () => {
  let component: DominioPageComponent;
  let fixture: ComponentFixture<DominioPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DominioPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(DominioPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
