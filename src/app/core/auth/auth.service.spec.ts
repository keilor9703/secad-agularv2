import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';

/**
 * «Ser SuperAdministrador» tiene que significar UNA cosa en todo el frontend.
 *
 * isCurrentUserSuperAdmin() tenía implementación propia y miraba el claim de
 * roles buscando el valor '1' — que es Administrador, no SuperAdministrador
 * (el 2). Con eso, un administrador de unidad podía asignar el rol de
 * SuperAdministrador y se saltaba entero el control de acceso por menú.
 */
describe('AuthService — quién es SuperAdministrador', () => {
  let auth: AuthService;

  const token = (payload: Record<string, unknown>): string => {
    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64({ alg: 'HS256' })}.${b64(payload)}.firma`;
  };

  const ROL = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), AuthService] });
    auth = TestBed.inject(AuthService);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('un Administrador (rol 1) NO es super administrador', () => {
    localStorage.setItem('sisge_token', token({ [ROL]: ['1'], es_admin: 'true', es_super_admin: 'false' }));

    expect(auth.esSuperAdmin()).toBe(false);
    expect(auth.isCurrentUserSuperAdmin()).toBe(false);
  });

  it('un SuperAdministrador (rol 2) sí lo es, y las dos vías coinciden', () => {
    localStorage.setItem('sisge_token', token({ [ROL]: ['1', '2'], es_admin: 'true', es_super_admin: 'true' }));

    expect(auth.esSuperAdmin()).toBe(true);
    expect(auth.isCurrentUserSuperAdmin()).toBe(true);
  });

  it('sin token, nadie lo es', () => {
    expect(auth.isCurrentUserSuperAdmin()).toBe(false);
  });
});
