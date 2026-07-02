import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormulariosPageComponent } from './formularios-page.component';

describe('FormulariosPageComponent', () => {
  let component: FormulariosPageComponent;
  let fixture: ComponentFixture<FormulariosPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormulariosPageComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FormulariosPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
