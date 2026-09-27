namespace Servicios.Vms
{
    /// <summary>
    /// Enrutado de las peticiones de cámaras hacia el nodo edge del municipio.
    ///
    /// ── El problema ──────────────────────────────────────────────────────────
    /// El VMS de cada municipio vive en la red de cámaras de ese municipio, y el
    /// backend central de Bogotá no la alcanza: entre medio hay segmentación de
    /// VLAN que no se va a levantar. El nodo edge —un servidor de SECAD dentro
    /// de la sede— sí alcanza las dos: la red institucional y la de cámaras.
    ///
    /// ── Por qué basta con un proxy transparente ─────────────────────────────
    /// La firma AK/SK de HikCentral (§3.2) se calcula sobre
    ///
    ///     MÉTODO \n Accept \n Content-MD5 \n Content-Type \n Date \n
    ///     cabeceras-firmadas
    ///     URI
    ///
    /// y el **host no entra en la firma**: «Host» está además en la lista de
    /// cabeceras que el gateway excluye explícitamente. Eso significa que una
    /// petición ya firmada se puede enviar a un proxy que la reenvíe tal cual al
    /// VMS, y la firma sigue siendo válida.
    ///
    /// La consecuencia práctica es importante: **el edge no necesita conocer el
    /// AppSecret**. Firma el nodo central, el edge solo reenvía bytes. Un
    /// servidor en una sede regional no custodia la credencial del VMS, y
    /// comprometerlo no permite emitir peticiones nuevas.
    ///
    /// ── El video ────────────────────────────────────────────────────────────
    /// HikCentral devuelve la URL del video apuntando a sí mismo
    /// («https://10.x.x.x:443/proxy/…/live.m3u8»). Si el navegador del
    /// despachador tiene que ir por el edge, hay que reescribir el ORIGEN de esa
    /// URL conservando ruta y query, que es lo que lleva el token del stream.
    /// </summary>
    public static class NodoEdge
    {
        /// <summary>
        /// A qué host se le habla de verdad: el edge si está configurado, y si
        /// no el propio VMS.
        /// </summary>
        public static string Destino(string? nodoEdgeUrl, string baseUrl) =>
            string.IsNullOrWhiteSpace(nodoEdgeUrl) ? Limpiar(baseUrl) : Limpiar(nodoEdgeUrl);

        /// <summary>
        /// Cambia el origen de una URL absoluta por el del nodo edge,
        /// conservando ruta, query y fragmento.
        ///
        /// Se conserva la ruta completa —incluida la parte «/proxy/ip:puerto/»
        /// que antepone HikCentral— porque es ahí donde va el token del stream y
        /// porque el proxy del edge la necesita para saber a dónde reenviar.
        /// </summary>
        /// <param name="url">URL tal como la devolvió el VMS.</param>
        /// <param name="nodoEdgeUrl">Base del edge, o vacío para no tocar nada.</param>
        public static string ReescribirOrigen(string url, string? nodoEdgeUrl)
        {
            if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(nodoEdgeUrl))
                return url;

            var baseEdge = Limpiar(nodoEdgeUrl);

            // Si el VMS devolvió una ruta relativa, basta con anteponer el edge.
            if (!Uri.TryCreate(url, UriKind.Absolute, out var original))
                return baseEdge + (url.StartsWith('/') ? url : "/" + url);

            if (!Uri.TryCreate(baseEdge, UriKind.Absolute, out var edge))
                return url;

            // El edge puede estar publicado bajo un prefijo («https://edge/vms»),
            // en cuyo caso la ruta del VMS se cuelga de él.
            var prefijo = edge.AbsolutePath.TrimEnd('/');
            if (prefijo == "/") prefijo = string.Empty;

            // Un stream de WebSocket o RTSP no se puede reescribir con el
            // esquema del edge a secas: dejaría «http://» en una URL que el
            // navegador tiene que abrir como «wss://», y no conectaría nunca.
            // Ver EsquemaEquivalente.
            var esquema = EsquemaEquivalente(original.Scheme, edge.Scheme);
            if (esquema is null)
                // Esquema que el proxy HTTP del edge no atiende (rtsp, rtmp): se
                // cambia solo el host y se conserva puerto y esquema, porque lo
                // que haría falta ahí es un reenvío TCP del MISMO puerto, no el
                // proxy de HTTP. Si el edge no lo tiene montado, esto no
                // funciona —y es mejor que devolver una URL http:// que tampoco
                // habría funcionado y además engaña sobre el motivo—.
                return new UriBuilder(original.Scheme, edge.Host,
                                      original.IsDefaultPort ? -1 : original.Port)
                {
                    Path     = original.AbsolutePath,
                    Query    = original.Query.TrimStart('?'),
                    Fragment = original.Fragment.TrimStart('#'),
                }.Uri.ToString();

            return new UriBuilder(esquema, edge.Host, edge.IsDefaultPort ? -1 : edge.Port)
            {
                Path     = prefijo + original.AbsolutePath,
                Query    = original.Query.TrimStart('?'),
                Fragment = original.Fragment.TrimStart('#'),
            }.Uri.ToString();
        }

        /// <summary>
        /// Con qué esquema debe salir la URL reescrita.
        ///
        /// La regla es: la FAMILIA la manda la URL original —si el VMS devolvió
        /// un WebSocket, sigue siendo un WebSocket— y el CIFRADO lo manda el
        /// edge, porque es el edge quien termina la conexión del navegador. Así,
        /// un «ws://vms/...» detrás de un edge con TLS sale como «wss://edge/...»,
        /// que es lo correcto: el tramo que ve el navegador va cifrado.
        ///
        /// Devuelve null cuando el esquema no lo atiende un proxy de HTTP.
        /// </summary>
        private static string? EsquemaEquivalente(string original, string esquemaEdge)
        {
            var edgeSeguro = esquemaEdge.Equals("https", StringComparison.OrdinalIgnoreCase)
                          || esquemaEdge.Equals("wss",   StringComparison.OrdinalIgnoreCase);

            return original.ToLowerInvariant() switch
            {
                "http" or "https" => edgeSeguro ? "https" : "http",
                "ws"   or "wss"   => edgeSeguro ? "wss"   : "ws",
                _                 => null,
            };
        }

        private static string Limpiar(string? u) => (u ?? string.Empty).Trim().TrimEnd('/');
    }
}
