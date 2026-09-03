// ══════════════════════════════════════════════════════════════════════════
// postinstall multiplataforma.
//
// Antes era una línea de PowerShell encadenada con `&& patch-package`, así
// que `npm ci` sólo funcionaba en Windows: en Linux —el `docker build` de la
// imagen del frontend, o cualquier CI— fallaba con «powershell: not found»
// y, lo que es peor, se saltaba `patch-package`, dejando sin aplicar los
// parches de flatpickr, sweetalert2 y zod.
//
// Hace lo mismo que hacía, en Node y sin depender del shell.
// ══════════════════════════════════════════════════════════════════════════
const { rmSync, readdirSync, statSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

/** Borra las carpetas `tests` que zod publica en su paquete (no hacen falta). */
function limpiarTestsDeZod(dir) {
  if (!existsSync(dir)) return;
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    let esDirectorio;
    try { esDirectorio = statSync(ruta).isDirectory(); } catch { continue; }
    if (!esDirectorio) continue;
    if (entrada === 'tests') rmSync(ruta, { recursive: true, force: true });
    else limpiarTestsDeZod(ruta);
  }
}

limpiarTestsDeZod(join(__dirname, '..', 'node_modules', 'zod'));

// `patch-package` aplica los parches de patches/ — sin esto, flatpickr,
// sweetalert2 y zod quedan sin parchar y el fallo aparece en tiempo de
// ejecución, no de compilación.
execFileSync(process.execPath, [join(__dirname, '..', 'node_modules', 'patch-package', 'index.js')], {
  stdio: 'inherit',
  cwd: join(__dirname, '..'),
});
