/**
 * Corrige cadenas con caracteres con tildes, diéresis o eñes que sufrieron mojibake
 * (doble codificación UTF-8 interpretada como ISO-8859-1 / Windows-1252, ej. "BogotÃ¡" -> "Bogotá").
 */
export function fixMojibake(text: string): string {
  if (!text || typeof text !== 'string') {
    return text ?? '';
  }

  if (!/[ÃÂ]/.test(text)) {
    return text;
  }

  try {
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã±/g, 'ñ')
      .replace(/Ã\u0081/g, 'Á')
      .replace(/Ã\u0089/g, 'É')
      .replace(/Ã\u008D/g, 'Í')
      .replace(/Ã\u0093/g, 'Ó')
      .replace(/Ã\u009A/g, 'Ú')
      .replace(/Ã\u0091/g, 'Ñ');
  }
}

/**
 * Decodifica una cadena Base64 o Base64URL que contiene contenido UTF-8 de forma segura en el navegador.
 */
export function decodeBase64Utf8(base64: string): string {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
