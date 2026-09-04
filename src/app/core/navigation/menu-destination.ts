/**
 * En ctr_menu conviven DOS vocabularios para la columna `tipo`:
 *
 *   · El de esta aplicación:  'S' | 'frm' | 'url' | 'pdf'
 *   · El de las migraciones:  'GRUPO' | 'ENLACE'   (V47 en adelante)
 *
 * Nunca se unificaron, y hasta ahora el segundo funcionaba de casualidad:
 * 'GRUPO' no coincidía con ninguna rama de resolveMenuTarget y acababa en el
 * catch-all de compatibilidad. Aquí se reconocen los dos de forma explícita,
 * que es más barato que renombrar filas en cada CAD en producción:
 *
 *   GRUPO  ≡ contenedor (lo mismo que 'S' sin ruta)
 *   ENLACE ≡ destino interno (lo mismo que 'frm')
 */
export type MenuDestinationType = 'GRUPO' | 'S' | 'frm' | 'url' | 'pdf';

export type MenuNavigationTarget = 'group' | 'internal' | 'external' | 'document';

export function resolveMenuTarget(rawType: unknown, rawDetail: unknown): MenuNavigationTarget {
  const type = String(rawType ?? '')
    .trim()
    .toLocaleLowerCase('es');
  const detail = String(rawDetail ?? '').trim();

  // Un grupo lo es por declaración, lleve ruta o no: es el contenedor.
  if (type === 'grupo') {
    return 'group';
  }

  if (type === 'enlace') {
    return 'internal';
  }

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
  return (
    value === 'GRUPO' || value === 'S' || value === 'frm' || value === 'url' || value === 'pdf'
  );
}

/**
 * ¿Este ítem puede tener hijos? Es la única pregunta que hay que hacerse para
 * ofrecer «crear submenú», y la responde el destino, no la etiqueta: un
 * contenedor no navega a ninguna parte, y una pantalla con ruta propia no es
 * sitio para colgar nada debajo.
 */
export function esContenedorMenu(rawType: unknown, rawDetail: unknown): boolean {
  return resolveMenuTarget(rawType, rawDetail) === 'group';
}

/**
 * Lleva un `tipo` cualquiera al vocabulario de esta aplicación, para que
 * editar un ítem no lo degrade. El formulario venía convirtiendo 'GRUPO' en
 * 'S' al abrirlo: guardar sin tocar nada reescribía el tipo del grupo.
 */
export function normalizeMenuType(rawType: unknown): MenuDestinationType {
  const type = String(rawType ?? '')
    .trim()
    .toLocaleLowerCase('es');

  if (type === 'grupo') return 'GRUPO';
  if (type === 'enlace') return 'frm';
  if (type === 'url') return 'url';
  if (type === 'pdf') return 'pdf';
  if (type === 'frm') return 'frm';
  return 'S';
}
