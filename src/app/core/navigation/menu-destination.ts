export type MenuDestinationType = 'S' | 'frm' | 'url' | 'pdf';

export type MenuNavigationTarget = 'group' | 'internal' | 'external' | 'document';

export function resolveMenuTarget(rawType: unknown, rawDetail: unknown): MenuNavigationTarget {
  const type = String(rawType ?? '')
    .trim()
    .toLocaleLowerCase('es');
  const detail = String(rawDetail ?? '').trim();

  if (type === 's' && !detail) {
    return 'group';
  }

  if (type === 'url') {
    return 'external';
  }

  if (type === 'pdf') {
    return 'document';
  }

  if (type === 'frm') {
    return 'internal';
  }

  // Compatibilidad con registros históricos que no tenían un tipo confiable.
  return /^(https?:\/\/|www\.|mailto:|tel:)/i.test(detail) ? 'external' : 'internal';
}

export function normalizeExternalResource(rawResource: unknown): string {
  const value = String(rawResource ?? '').trim();
  return value.startsWith('www.') ? `https://${value}` : value;
}

export function isSafeExternalUrl(rawResource: unknown): boolean {
  return /^(https?:\/\/|www\.)[^\s]+$/i.test(String(rawResource ?? '').trim());
}

export function isSafePdfResource(rawResource: unknown): boolean {
  return /^(?:(?:https?:\/\/|www\.)[^\s]+|\/?(?:assets|documentos)\/[^\s]+\.pdf(?:[?#].*)?)$/i.test(
    String(rawResource ?? '').trim(),
  );
}

export function isMenuDestinationType(value: unknown): value is MenuDestinationType {
  return value === 'S' || value === 'frm' || value === 'url' || value === 'pdf';
}
