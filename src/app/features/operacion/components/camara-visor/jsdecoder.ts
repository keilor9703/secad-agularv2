// ─────────────────────────────────────────────────────────────────────────────
// Puente hacia el jsDecoder SDK de Hikvision (reproducción por WebSocket).
//
// ── POR QUÉ ESTE ARCHIVO ESTÁ AISLADO Y NO REPRODUCE TODAVÍA ────────────────
//
// El HLS de HikCentral llega con unos 7 segundos de retraso. Para mirar una
// cámara no cambia ninguna decisión; para MOVERLA sí: el operador corrige
// contra una imagen de hace siete segundos y se pasa de largo. La vía que
// ofrece Hikvision para bajarlo a 1-3 s es el jsDecoder: el VMS entrega una URL
// «ws://» o «wss://» y un decodificador en el navegador pinta los fotogramas
// en un canvas.
//
// El backend ya sabe pedir esa URL. Lo que NO está aquí es la llamada al SDK, y
// no está por una razón concreta: el jsDecoder es un componente propietario que
// **no viene con la OpenAPI**. Sus archivos y su API están en un entregable
// aparte de Hikvision —«VMSPlatform Video JsDecoder SDK_Developer Guide»— que
// hoy no tenemos. El Developer Guide de la OpenAPI solo documenta las funciones
// del *web plug-in* (JS_CreateWnd, JS_Disconnect…), que es otro componente
// distinto y exige instalar un .exe.
//
// Escribir aquí una secuencia de llamadas sacada de la memoria y decir que
// funciona sería repetir el error que ya costó una tarde en este proyecto: el
// simulador que reproducía mi propia lectura equivocada del manual y por eso no
// detectaba nada. Así que este archivo hace dos cosas honestas:
//
//   1. Detecta si el SDK está instalado en el puesto.
//   2. Si no está, dice exactamente qué falta, en vez de dejar un rectángulo
//      negro o un error de red que manda a buscar donde no es.
//
// Cuando llegue el SDK, la integración entra SOLO en `reproducir()`. Todo lo
// que necesita está en la firma: el contenedor, la URL y el token.
//
// ── LÍMITES QUE YA SABEMOS, Y HAY QUE DECIRLOS ANTES DE PROMETER NADA ───────
//
// El manual de la OpenAPI (§4.4.4) es explícito: el jsDecoder **solo funciona
// en Windows** —7/8/10— y con Chrome 45+ o Firefox 52+. No hay soporte para
// Linux, macOS, Safari ni, según ese texto, Edge. Los puestos de despacho son
// Windows con Chrome, así que encaja; pero cualquier otro equipo tiene que
// seguir cayendo a HLS, y por eso la elección del reproductor es automática y
// no una casilla de configuración.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que el visor necesita de cualquier reproductor. */
export interface Reproductor {
  destruir(): void;
}

export interface ResultadoJsDecoder {
  ok: boolean;
  /** Reproductor vivo, o null si no se pudo abrir. */
  reproductor: Reproductor | null;
  /** Qué decirle al operador cuando no se pudo. */
  mensaje: string;
}

/**
 * Nombres con los que el SDK de Hikvision se publica en `window`. Se prueban
 * varios porque el nombre ha cambiado entre versiones del paquete y no se puede
 * confirmar cuál usa el que instale la Policía hasta tenerlo delante.
 */
const GLOBALES_SDK = ['JSPlugin', 'JSDecoder', 'jsDecoder'] as const;

/** ¿Está el SDK cargado en este navegador? */
export function sdkDisponible(): boolean {
  const w = globalThis as Record<string, unknown>;
  return GLOBALES_SDK.some(n => typeof w[n] !== 'undefined');
}

/**
 * ¿Puede este equipo ejecutar el jsDecoder? Según §4.4.4: Windows, y Chrome o
 * Firefox. Se comprueba para poder explicar el motivo exacto —«este equipo no
 * es Windows» es una respuesta mucho más útil que «no se pudo reproducir»—.
 */
export function plataformaCompatible(): { ok: boolean; motivo: string } {
  const ua = (globalThis.navigator?.userAgent ?? '').toLowerCase();
  if (!ua) return { ok: false, motivo: 'No se pudo identificar el navegador.' };

  if (!ua.includes('windows'))
    return { ok: false, motivo: 'El jsDecoder de Hikvision solo funciona en Windows.' };

  const esChrome  = ua.includes('chrome') && !ua.includes('edg/') && !ua.includes('opr/');
  const esFirefox = ua.includes('firefox');
  if (!esChrome && !esFirefox)
    return { ok: false, motivo: 'El jsDecoder de Hikvision solo está soportado en Chrome o Firefox.' };

  return { ok: true, motivo: '' };
}

/**
 * Abre el stream de WebSocket en el contenedor dado.
 *
 * Hoy NO reproduce: comprueba plataforma y presencia del SDK, y devuelve el
 * motivo exacto por el que no puede. Cuando estén los archivos del SDK y su
 * guía, la integración va aquí dentro y el resto del visor no cambia.
 *
 * @param _contenedor div donde el SDK pinta (el SDK exige un div, no un iframe).
 * @param _url        URL ws:// o wss:// que devolvió el VMS.
 * @param _token      Campo «authentication» de la respuesta del VMS.
 */
export function reproducir(
  _contenedor: HTMLElement, _url: string, _token: string | null,
): ResultadoJsDecoder {
  const plataforma = plataformaCompatible();
  if (!plataforma.ok)
    return {
      ok: false, reproductor: null,
      mensaje: `${plataforma.motivo} Cambie el protocolo de la integración a HLS para ver esta ` +
               `cámara desde este equipo, o ábrala desde un puesto de despacho.`,
    };

  if (!sdkDisponible())
    return {
      ok: false, reproductor: null,
      mensaje: 'Esta integración está configurada para video de baja latencia (WebSocket), pero el ' +
               'jsDecoder de Hikvision no está instalado en este equipo. Mientras no lo esté, ' +
               'configure la integración con HLS: se ve igual, con unos segundos de retraso.',
    };

  // El SDK está presente pero su secuencia de llamadas viene en un manual
  // aparte que todavía no tenemos. Decirlo es lo correcto: fingir que se
  // reproduce dejaría al operador mirando un rectángulo negro sin saber por qué.
  return {
    ok: false, reproductor: null,
    mensaje: 'El jsDecoder está presente en el equipo pero SECAD todavía no lo maneja. ' +
             'Configure la integración con HLS mientras se completa esa parte.',
  };
}
