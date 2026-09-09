namespace Comun.Dtos.Integraciones
{
    /// <summary>Un campo del cuerpo que espera un endpoint entrante.</summary>
    public class DtoCampoContrato
    {
        public string Nombre      { get; set; } = string.Empty;
        public string Tipo        { get; set; } = string.Empty;
        public bool   Obligatorio { get; set; }
        public string Descripcion { get; set; } = string.Empty;
        public string? Ejemplo    { get; set; }
    }

    /// <summary>
    /// Todo lo que hay que entregarle a quien integra desde el otro lado.
    /// Sale del código, no de un campo de texto que alguien llenó a mano: un
    /// contrato editable solo garantiza que la documentación mienta.
    /// </summary>
    public class DtoContratoIntegracion
    {
        public string Canal        { get; set; } = string.Empty;
        public string Titulo       { get; set; } = string.Empty;
        public string Descripcion  { get; set; } = string.Empty;
        public string Metodo       { get; set; } = "POST";
        /// <summary>Ruta relativa. La absoluta la arma el backend con el host real.</summary>
        public string Ruta         { get; set; } = string.Empty;
        public string UrlAbsoluta  { get; set; } = string.Empty;
        /// <summary>Alcance de llave que exige este endpoint.</summary>
        public string AlcanceRequerido { get; set; } = string.Empty;

        public Dictionary<string, string> Headers { get; set; } = new();
        public List<DtoCampoContrato>     Campos  { get; set; } = new();
        public string EjemploPayload { get; set; } = "{}";
        public string EjemploCurl    { get; set; } = string.Empty;
        public List<string> Respuestas { get; set; } = new();
        public List<string> Notas      { get; set; } = new();
    }

    /// <summary>
    /// El catálogo de contratos, escrito una sola vez y junto a los endpoints
    /// que describe.
    ///
    /// Las rutas NO son configurables: están fijas en los controladores. Por eso
    /// el formulario de integraciones ofrece un canal y no un texto libre — un
    /// «endpoint relativo» escrito a mano no enruta nada, solo documenta mal.
    /// </summary>
    public static class ContratosIntegracion
    {
        public const string CanalPbx           = "PBX";
        public const string CanalChat          = "CHAT";
        public const string CanalSms           = "SMS";
        public const string CanalActualizacion = "ACTUALIZACION";

        public static readonly string[] Canales =
            { CanalPbx, CanalChat, CanalSms, CanalActualizacion };

        /// <summary>
        /// Tipo de canal del catálogo (cad_integraciones_entrantes.tipo_canal) →
        /// canal con contrato. Los que no aparecen —API_FOTO, OTRA— no tienen un
        /// endpoint propio en SECAD: son fichas puramente documentales.
        /// </summary>
        private static readonly Dictionary<string, string> PorTipoCanal = new(StringComparer.OrdinalIgnoreCase)
        {
            ["CHAT"] = CanalChat,
            ["SMS"]  = CanalSms,
            ["PBX"]  = CanalPbx,
        };

        /// <summary>
        /// La ruta que le corresponde a un tipo de canal, o cadena vacía si ese
        /// tipo no tiene endpoint.
        ///
        /// Existe para que la ruta la ponga el servidor y no el cliente: está
        /// fija en los controladores, así que dejar que llegue del formulario
        /// solo permitía guardar documentación equivocada.
        /// </summary>
        public static string RutaDeTipoCanal(string? tipoCanal)
        {
            if (tipoCanal is null || !PorTipoCanal.TryGetValue(tipoCanal, out var canal))
                return string.Empty;

            // El baseUrl no importa aquí: solo se lee la ruta relativa.
            return Obtener(canal, string.Empty, null, 1)?.Ruta ?? string.Empty;
        }

        /// <summary>
        /// Devuelve el contrato del canal, ya resuelto para este CAD: URL con el
        /// host real, la llave si se le pasa una, y la unidad por defecto.
        /// </summary>
        public static DtoContratoIntegracion? Obtener(
            string canal, string baseUrl, string? clave, int sitioGrabaEjemplo)
        {
            var c = canal?.ToUpperInvariant() switch
            {
                CanalPbx           => Pbx(sitioGrabaEjemplo),
                CanalChat          => Chat(sitioGrabaEjemplo),
                CanalSms           => Sms(sitioGrabaEjemplo),
                CanalActualizacion => Actualizacion(),
                _                  => null,
            };
            if (c is null) return null;

            c.UrlAbsoluta = $"{baseUrl.TrimEnd('/')}{c.Ruta}";
            c.Headers["X-Api-Key"] = string.IsNullOrWhiteSpace(clave)
                ? "«genere la llave en esta pantalla y péguela aquí»"
                : clave;
            c.Headers["Content-Type"] = "application/json";
            c.EjemploCurl =
                $"curl -X {c.Metodo} {c.UrlAbsoluta} \\\n" +
                $"  -H \"X-Api-Key: {c.Headers["X-Api-Key"]}\" \\\n" +
                $"  -H \"Content-Type: application/json\" \\\n" +
                $"  -d '{c.EjemploPayload}'";
            return c;
        }

        // ── Planta telefónica ────────────────────────────────────────────────

        private static DtoContratoIntegracion Pbx(int sitio) => new()
        {
            Canal   = CanalPbx,
            Titulo  = "Llamada entrante desde la planta telefónica (PBX)",
            Descripcion =
                "La planta llama a este webhook cada vez que una llamada entra y es contestada por " +
                "una extensión. SECAD la registra en cad_plantatel y el operador la ve aparecer en " +
                "Recepción sin hacer nada.",
            Metodo = "POST",
            Ruta   = "/api/RecepcionExterna/plantatel",
            AlcanceRequerido = AlcanceApiKey.Pbx,
            Campos = new()
            {
                new() { Nombre = "acd", Tipo = "string (numérico)", Obligatorio = true, Ejemplo = "1042",
                        Descripcion =
                            "La EXTENSIÓN que contestó la llamada. Es el único dato que une la llamada con " +
                            "el operador: SECAD busca la llamada por sitio + acd. Tiene que ser el mismo " +
                            "número que el CAD configuró en Administración → Usuarios → Asignación " +
                            "operativa → ACD. Si no coincide, la llamada se guarda y no se le muestra a nadie." },
                new() { Nombre = "numTelefono", Tipo = "string", Obligatorio = true, Ejemplo = "+573001234567",
                        Descripcion = "Número del ciudadano que llama. Se aceptan «+», espacios y guiones; SECAD los limpia." },
                new() { Nombre = "sitioGraba", Tipo = "int", Obligatorio = false, Ejemplo = sitio.ToString(),
                        Descripcion =
                            "Unidad policial destino. OPCIONAL: si no se envía, SECAD usa la unidad por " +
                            "defecto de la llave. Solo hace falta mandarlo cuando una misma planta atiende " +
                            "a dos unidades que comparten el CAD." },
            },
            EjemploPayload = $"{{\"acd\":\"1042\",\"numTelefono\":\"+573001234567\",\"sitioGraba\":{sitio}}}",
            Respuestas = new()
            {
                "200 → {\"success\":true,\"message\":\"Llamada PlantaTel registrada.\",\"id\":\"123\"}",
                "400 → falta acd o numTelefono, o no son numéricos.",
                "401 → la llave no es válida, está revocada o venció su periodo de gracia.",
                "403 → la llave existe pero no tiene alcance PBX.",
                "500 → error interno; se puede reintentar.",
            },
            Notas = new()
            {
                "Reintentos: si SECAD responde 5xx o no responde, reintente con espera creciente " +
                "(por ejemplo 2 s, 5 s, 15 s). Un 4xx no se reintenta, hay que corregir la petición.",
                "Tiempo de espera recomendado: 5 segundos.",
                "No hace falta enviar el CAD: la llave ya dice a qué CAD pertenece la planta.",
            },
        };

        // ── Chat ─────────────────────────────────────────────────────────────

        private static DtoContratoIntegracion Chat(int sitio) => new()
        {
            Canal  = CanalChat,
            Titulo = "Caso recibido por chat (WhatsApp, Telegram, bot web)",
            Descripcion =
                "Crea un pedido de recepción con origen CHAT. El payload crudo queda en la auditoría " +
                "de integraciones aunque el caso falle, así que nunca se pierde lo que llegó.",
            Metodo = "POST",
            Ruta   = "/api/RecepcionExterna/chat",
            AlcanceRequerido = AlcanceApiKey.Chat,
            Campos = new()
            {
                new() { Nombre = "sitioGraba", Tipo = "int", Obligatorio = true, Ejemplo = sitio.ToString(),
                        Descripcion = "Unidad policial destino. Si no se envía se usa la de la llave." },
                new() { Nombre = "nombreReportante", Tipo = "string", Obligatorio = true, Ejemplo = "Juan García",
                        Descripcion = "Quien reporta. Si el canal no lo conoce, envíe «CIUDADANO»." },
                new() { Nombre = "contactoId", Tipo = "string", Obligatorio = true, Ejemplo = "3001234567",
                        Descripcion = "Teléfono o identificador del contacto en la plataforma de chat." },
                new() { Nombre = "mensaje", Tipo = "string", Obligatorio = true, Ejemplo = "Hay un hurto en la Cra 7 con 32",
                        Descripcion = "Texto del ciudadano. Va al comentario del caso precedido de [CHAT]." },
                new() { Nombre = "direccionCaso", Tipo = "string", Obligatorio = true, Ejemplo = "Carrera 7 # 32-15",
                        Descripcion = "Dirección del incidente." },
                new() { Nombre = "ciudad", Tipo = "string", Obligatorio = false, Ejemplo = "Bogotá", Descripcion = "Municipio del incidente." },
                new() { Nombre = "barrio", Tipo = "string", Obligatorio = false, Ejemplo = "Candelaria", Descripcion = "Barrio del incidente." },
                new() { Nombre = "latitudCaso", Tipo = "string", Obligatorio = false, Ejemplo = "4.598056",
                        Descripcion = "Coordenada, si el canal la capturó. Ahorra que el operador la ubique a mano." },
                new() { Nombre = "longitudCaso", Tipo = "string", Obligatorio = false, Ejemplo = "-74.075833", Descripcion = "Coordenada." },
                new() { Nombre = "codigoCaso", Tipo = "string", Obligatorio = false, Ejemplo = "120",
                        Descripcion = "Código de caso del catálogo del CAD (Administración → Códigos de Caso). Vacío = lo tipifica el operador." },
                new() { Nombre = "caliPedido", Tipo = "string", Obligatorio = false, Ejemplo = "01", Descripcion = "Calificación del pedido." },
                new() { Nombre = "comentario", Tipo = "string", Obligatorio = false, Descripcion = "Texto adicional para el operador." },
                new() { Nombre = "canales", Tipo = "array", Obligatorio = false, Ejemplo = "[{\"codigo\":1,\"fuerzaId\":1}]",
                        Descripcion = "Canales de despacho a los que enviar el caso. Vacío = queda en la bandeja sin despachar." },
            },
            EjemploPayload =
                $"{{\"sitioGraba\":{sitio},\"nombreReportante\":\"Juan García\",\"contactoId\":\"3001234567\"," +
                "\"mensaje\":\"Hay un hurto en la Cra 7 con 32\",\"direccionCaso\":\"Carrera 7 # 32-15\"," +
                "\"ciudad\":\"Bogotá\",\"barrio\":\"Candelaria\",\"latitudCaso\":\"4.598056\"," +
                "\"longitudCaso\":\"-74.075833\",\"codigoCaso\":\"120\",\"caliPedido\":\"01\",\"canales\":[]}",
            Respuestas = new()
            {
                "200 → {\"success\":true,\"pedidoId\":\"…\"}",
                "400 → falta sitioGraba.",
                "401 / 403 → llave inválida o sin alcance CHAT.",
            },
            Notas = new()
            {
                "Todo lo que llega queda en Hub de Integraciones → Auditoría → Recepciones entrantes, " +
                "con el payload crudo y la IP, se haya procesado o no.",
            },
        };

        // ── SMS ──────────────────────────────────────────────────────────────

        private static DtoContratoIntegracion Sms(int sitio) => new()
        {
            Canal  = CanalSms,
            Titulo = "Caso recibido por SMS",
            Descripcion = "Crea un pedido de recepción con origen SMS.",
            Metodo = "POST",
            Ruta   = "/api/RecepcionExterna/sms",
            AlcanceRequerido = AlcanceApiKey.Sms,
            Campos = new()
            {
                new() { Nombre = "sitioGraba", Tipo = "int", Obligatorio = true, Ejemplo = sitio.ToString(),
                        Descripcion = "Unidad policial destino. Si no se envía se usa la de la llave." },
                new() { Nombre = "numeroCelular", Tipo = "string", Obligatorio = true, Ejemplo = "+573001234567",
                        Descripcion = "Celular desde el que se envió el SMS." },
                new() { Nombre = "mensajeSms", Tipo = "string", Obligatorio = true, Ejemplo = "Accidente en Av El Dorado con Cra 50",
                        Descripcion = "Texto del mensaje." },
                new() { Nombre = "nombreReportante", Tipo = "string", Obligatorio = false, Ejemplo = "CIUDADANO", Descripcion = "Si se conoce." },
                new() { Nombre = "direccionCaso", Tipo = "string", Obligatorio = false, Ejemplo = "Av El Dorado con Cra 50", Descripcion = "Dirección del incidente." },
                new() { Nombre = "ciudad", Tipo = "string", Obligatorio = false, Ejemplo = "Bogotá", Descripcion = "Municipio." },
                new() { Nombre = "barrio", Tipo = "string", Obligatorio = false, Ejemplo = "Fontibón", Descripcion = "Barrio." },
                new() { Nombre = "codigoCaso", Tipo = "string", Obligatorio = false, Ejemplo = "300", Descripcion = "Código de caso del catálogo del CAD." },
                new() { Nombre = "caliPedido", Tipo = "string", Obligatorio = false, Ejemplo = "01", Descripcion = "Calificación del pedido." },
                new() { Nombre = "canales", Tipo = "array", Obligatorio = false, Descripcion = "Canales de despacho destino." },
            },
            EjemploPayload =
                $"{{\"sitioGraba\":{sitio},\"numeroCelular\":\"+573001234567\",\"nombreReportante\":\"CIUDADANO\"," +
                "\"mensajeSms\":\"Accidente en Av El Dorado con Cra 50\",\"direccionCaso\":\"Av El Dorado con Cra 50\"," +
                "\"ciudad\":\"Bogotá\",\"barrio\":\"Fontibón\",\"codigoCaso\":\"300\",\"caliPedido\":\"01\",\"canales\":[]}",
            Respuestas = new()
            {
                "200 → {\"success\":true,\"pedidoId\":\"…\"}",
                "400 → falta sitioGraba.",
                "401 / 403 → llave inválida o sin alcance SMS.",
            },
        };

        // ── Actualización de un caso ya creado ───────────────────────────────

        private static DtoContratoIntegracion Actualizacion() => new()
        {
            Canal  = CanalActualizacion,
            Titulo = "Actualización de un caso desde un sistema externo",
            Descripcion =
                "Permite que una agencia a la que se despachó un caso devuelva su estado o " +
                "novedades. El {casoId} es el id que SECAD entregó al despachar.",
            Metodo = "POST",
            Ruta   = "/api/ActualizacionExterna/{casoId}",
            AlcanceRequerido = AlcanceApiKey.Actualizacion,
            Campos = new()
            {
                new() { Nombre = "estado", Tipo = "string", Obligatorio = false, Ejemplo = "EN_ATENCION",
                        Descripcion = "Estado en el sistema de la agencia." },
                new() { Nombre = "observacion", Tipo = "string", Obligatorio = false, Ejemplo = "Unidad en el sitio",
                        Descripcion = "Novedad que verá el despachador." },
            },
            EjemploPayload = "{\"estado\":\"EN_ATENCION\",\"observacion\":\"Unidad en el sitio\"}",
            Respuestas = new()
            {
                "200 → actualización registrada.",
                "401 / 403 → llave inválida o sin alcance ACTUALIZACION.",
                "404 → el casoId no existe en este CAD.",
            },
        };
    }
}
