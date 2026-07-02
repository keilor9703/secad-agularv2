import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  // Siempre enviar credenciales para flujo cookie-based (backend Razor)
  const baseReq = req.clone({ withCredentials: true });

  if (!token) {
    return next(baseReq);
  }

  const authReq = baseReq.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });

  return next(authReq);
};
