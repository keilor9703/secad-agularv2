import { HttpErrorResponse } from '@angular/common/http';

/**
 * Obtiene un mensaje seguro sin propagar estructuras `any` de HttpClient
 * hacia los componentes consumidores.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    return extractMessage(error.error) || error.message || fallback;
  }

  return extractMessage(error) || fallback;
}

function extractMessage(value: unknown): string {
  if (!isRecord(value)) {
    return typeof value === 'string' ? value.trim() : '';
  }

  const detail = value['detail'];
  const message = value['message'];

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  const nestedError = value['error'];
  return nestedError === value ? '' : extractMessage(nestedError);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
