namespace Api.Services
{
    /// <summary>
    /// Almacén en disco de las grabaciones de videollamada que se están recibiendo
    /// por trozos.
    ///
    /// <para><b>Por qué existe:</b> antes el navegador del despachador acumulaba la
    /// grabación ENTERA en memoria y solo la subía si él oprimía "Detener
    /// grabación". Cualquier final abrupto —el ciudadano cuelga, el despachador
    /// refresca o navega, se cae la red, se cierra Chrome, se va la luz— perdía la
    /// grabación completa. Como este material puede ser probatorio, eso no es
    /// aceptable.</para>
    ///
    /// <para>Ahora el navegador envía trozos cada pocos segundos y aquí se van
    /// anexando a un archivo temporal. <b>La evidencia queda a salvo en el servidor
    /// desde el primer trozo</b>: lo que ya llegó, ya no se pierde pase lo que pase
    /// del lado del despachador.</para>
    ///
    /// <para><b>Sobre anexar trozos de MediaRecorder:</b> el primer trozo trae la
    /// cabecera WebM y los primeros clusters; los siguientes son clusters de
    /// continuación del mismo flujo. Concatenarlos en orden produce un WebM válido,
    /// que es justamente lo que hace este almacén.</para>
    ///
    /// <para>Lo usan tanto el controlador (cierre normal) como
    /// <c>GrabacionesHuerfanasService</c> (cierre automático cuando el puesto del
    /// despachador murió sin cerrar la grabación).</para>
    /// </summary>
    public sealed class GrabacionVideoStore
    {
        private readonly string _uploadsPath;   // .../uploads/adjuntos
        private readonly string _tempPath;      // .../uploads/grabaciones_en_curso
        private readonly ILogger<GrabacionVideoStore> _logger;

        /// <summary>Tope por sesión — evita que una grabación olvidada llene el disco.</summary>
        public const long MaxBytesPorGrabacion = 500L * 1024 * 1024;   // 500 MB

        public GrabacionVideoStore(
            IConfiguration configuration,
            IWebHostEnvironment environment,
            ILogger<GrabacionVideoStore> logger)
        {
            _logger = logger;

            // Misma resolución de ruta que AdjuntoController, para que las
            // grabaciones terminen conviviendo con el resto de adjuntos.
            var configured = configuration["AppSettings:UploadsPath"];
            var root = string.IsNullOrWhiteSpace(configured)
                ? Path.Combine(environment.ContentRootPath, "uploads")
                : configured;

            if (!Path.IsPathRooted(root))
                root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, root));

            _uploadsPath = Path.GetFullPath(Path.Combine(root, "adjuntos"));
            _tempPath    = Path.GetFullPath(Path.Combine(root, "grabaciones_en_curso"));

            Directory.CreateDirectory(_tempPath);
        }

        /// <summary>Ruta del archivo temporal de una sesión. El nombre sale solo del id (numérico), nunca de entrada del usuario.</summary>
        public string RutaTemp(long sesionId) => Path.Combine(_tempPath, $"{sesionId}.webm");

        public bool Existe(long sesionId) => File.Exists(RutaTemp(sesionId));

        public long Tamanio(long sesionId)
        {
            var ruta = RutaTemp(sesionId);
            return File.Exists(ruta) ? new FileInfo(ruta).Length : 0;
        }

        /// <summary>
        /// Anexa un trozo al archivo de la sesión. Devuelve los bytes escritos, o -1
        /// si se rechazó por superar el tope. Serializado por sesión: dos trozos de la
        /// misma grabación nunca se entrelazan.
        /// </summary>
        public async Task<long> AnexarAsync(long sesionId, Stream contenido, CancellationToken ct)
        {
            var ruta = RutaTemp(sesionId);
            var sem  = _locks.GetOrAdd(sesionId, _ => new SemaphoreSlim(1, 1));

            await sem.WaitAsync(ct);
            try
            {
                if (File.Exists(ruta) && new FileInfo(ruta).Length >= MaxBytesPorGrabacion)
                {
                    _logger.LogWarning(
                        "[Grabacion] Sesión {SesionId} superó el tope de {Max} MB; se descarta el trozo.",
                        sesionId, MaxBytesPorGrabacion / 1024 / 1024);
                    return -1;
                }

                await using var fs = new FileStream(
                    ruta, FileMode.Append, FileAccess.Write, FileShare.None,
                    bufferSize: 64 * 1024, useAsync: true);

                var antes = fs.Length;
                await contenido.CopyToAsync(fs, ct);
                await fs.FlushAsync(ct);
                return fs.Length - antes;
            }
            finally
            {
                sem.Release();
            }
        }

        /// <summary>
        /// Mueve el archivo temporal a su ubicación definitiva junto al resto de
        /// adjuntos del caso. Devuelve los datos que necesita el registro del adjunto,
        /// o null si no había nada grabado.
        /// </summary>
        public async Task<(string nombreGuardado, string rutaRelativa, long bytes)?> MoverADefinitivoAsync(
            long sesionId, int sitioGraba, long pedidoId, CancellationToken ct)
        {
            var origen = RutaTemp(sesionId);
            var sem    = _locks.GetOrAdd(sesionId, _ => new SemaphoreSlim(1, 1));

            await sem.WaitAsync(ct);
            try
            {
                if (!File.Exists(origen)) return null;

                var bytes = new FileInfo(origen).Length;
                if (bytes == 0)
                {
                    // Grabación vacía (se inició y se cerró sin recibir nada): se
                    // limpia el archivo en vez de registrar un adjunto inútil.
                    TryDelete(origen);
                    return null;
                }

                var subDir = Path.Combine(_uploadsPath, sitioGraba.ToString(), pedidoId.ToString());
                Directory.CreateDirectory(subDir);

                var nombreGuardado = $"{Guid.NewGuid():N}.webm";
                var destino        = Path.Combine(subDir, nombreGuardado);

                File.Move(origen, destino, overwrite: false);

                var rutaRelativa = string.Join("/", "uploads", "adjuntos",
                    sitioGraba.ToString(), pedidoId.ToString(), nombreGuardado);

                return (nombreGuardado, rutaRelativa, bytes);
            }
            finally
            {
                sem.Release();
                _locks.TryRemove(sesionId, out _);
            }
        }

        private void TryDelete(string ruta)
        {
            try { if (File.Exists(ruta)) File.Delete(ruta); }
            catch (Exception ex) { _logger.LogWarning(ex, "[Grabacion] No se pudo borrar {Ruta}", ruta); }
        }

        // Un semáforo por sesión: los trozos de una misma grabación se escriben en
        // orden aunque el navegador mande varios casi simultáneos.
        private readonly System.Collections.Concurrent.ConcurrentDictionary<long, SemaphoreSlim> _locks = new();
    }
}
