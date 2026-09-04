/**
 * Carga de ExcelJS bajo demanda.
 *
 * Dos cosas que hay que hacer bien y que es fácil equivocar:
 *
 * 1. **Perezosa.** Importado de forma estática, ExcelJS se lleva cerca de
 *    700 kB al paquete de la pantalla que lo use, y el navegador se los
 *    descarga al ENTRAR aunque nadie vaya a importar ni exportar nada.
 *
 * 2. **El módulo llega envuelto.** ExcelJS se publica como CommonJS, de modo
 *    que `import('exceljs')` devuelve un módulo cuyo ÚNICO export es
 *    `default`, y `Workbook` cuelga de ahí. Escrito como
 *    `const ExcelJS = await import('exceljs'); new ExcelJS.Workbook()`
 *    revienta en tiempo de ejecución con «XL.Workbook is not a constructor»:
 *    compila sin quejarse —los tipos dicen que `Workbook` existe— y solo se
 *    ve al pulsar el botón. Comprobado en Chromium: las claves del módulo son
 *    exactamente `['default']`.
 */
export async function cargarExcelJS(): Promise<typeof import('exceljs')> {
  const modulo = await import('exceljs');
  const conDefault = modulo as unknown as { default?: typeof import('exceljs') };
  return conDefault.default ?? modulo;
}

/** Descarga un libro ya escrito como archivo .xlsx. */
export function descargarLibroExcel(buffer: ArrayBuffer, nombreArchivo: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
