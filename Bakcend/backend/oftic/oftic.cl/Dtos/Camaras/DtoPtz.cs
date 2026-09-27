namespace Comun.Dtos.Camaras
{
    /// <summary>
    /// Comandos PTZ tal como los nombra la OpenAPI de HikCentral (§5.4.23).
    /// Se guardan como texto y no como enum de C# porque viajan literalmente al
    /// VMS: inventarse nombres propios obligaría a una tabla de traducción que
    /// solo puede desincronizarse.
    /// </summary>
    public static class PtzComandos
    {
        public const string Izquierda      = "LEFT";
        public const string Derecha        = "RIGHT";
        public const string Arriba         = "UP";
        public const string Abajo          = "DOWN";
        public const string ArribaIzq      = "LEFT_UP";
        public const string AbajoIzq       = "LEFT_DOWN";
        public const string ArribaDer      = "RIGHT_UP";
        public const string AbajoDer       = "RIGHT_DOWN";
        public const string AcercarZoom    = "ZOOM_IN";
        public const string AlejarZoom     = "ZOOM_OUT";
        public const string EnfocarCerca   = "FOCUS_NEAR";
        // El manual lo escribe así, con la errata: «FOUCS_FAR». Se manda tal
        // cual porque lo que importa es lo que acepta el gateway, no cómo
        // debería llamarse. Si un despliegue lo rechaza, es el primer sitio
        // donde mirar.
        public const string EnfocarLejos   = "FOUCS_FAR";
        public const string AbrirIris      = "IRIS_ENLARGE";
        public const string CerrarIris     = "IRIS_REDUCE";
        public const string IrAPreset      = "GOTO_PRESET";
        public const string CorrerPatrulla = "RUN_PATROL";

        /// <summary>Los que mueven la cámara de forma continua y por tanto hay que parar.</summary>
        public static readonly HashSet<string> Continuos = new(StringComparer.OrdinalIgnoreCase)
        {
            Izquierda, Derecha, Arriba, Abajo, ArribaIzq, AbajoIzq, ArribaDer, AbajoDer,
            AcercarZoom, AlejarZoom, EnfocarCerca, EnfocarLejos, AbrirIris, CerrarIris,
        };

        /// <summary>Los que se disparan una vez y el VMS ejecuta solo.</summary>
        public static readonly HashSet<string> Puntuales = new(StringComparer.OrdinalIgnoreCase)
        {
            IrAPreset, CorrerPatrulla,
        };

        public static bool EsValido(string? c) =>
            !string.IsNullOrWhiteSpace(c) && (Continuos.Contains(c!) || Puntuales.Contains(c!));
    }

    /// <summary>Lo que pide el operador al mover una cámara.</summary>
    public class DtoPtzPeticion
    {
        /// <summary>Uno de <see cref="PtzComandos"/>.</summary>
        public string Comando { get; set; } = "";

        /// <summary>
        /// Velocidad del movimiento. El manual la acota entre 20 y 60 y usa 40
        /// por defecto; fuera de ese rango el VMS rechaza la petición.
        /// </summary>
        public int? Velocidad { get; set; }

        /// <summary>
        /// Cuánto se mueve, en milisegundos. El backend arranca el movimiento y
        /// lo PARA él mismo al cumplirse: así una petición no puede dejar la
        /// cámara girando para siempre (ver DtoPtzResultado).
        /// </summary>
        public int? DuracionMs { get; set; }

        /// <summary>Requerido con GOTO_PRESET. El manual lo acota de 1 a 256.</summary>
        public int? Preset { get; set; }

        /// <summary>Requerido con RUN_PATROL. El manual lo acota de 1 a 8.</summary>
        public int? Patrulla { get; set; }

        /// <summary>Caso desde el que se mueve la cámara; va a la auditoría.</summary>
        public long? PedidoId { get; set; }
        public long? EventoId { get; set; }
    }

    /// <summary>Resultado de un movimiento PTZ.</summary>
    public class DtoPtzResultado
    {
        public bool   Ok           { get; set; }
        public string Mensaje      { get; set; } = "";
        public string Comando      { get; set; } = "";
        /// <summary>Milisegundos que duró el movimiento, ya acotados.</summary>
        public int    DuracionMs   { get; set; }
        /// <summary>false = el VMS aceptó el arranque pero no confirmó la parada.</summary>
        public bool   Detenida     { get; set; } = true;
    }
}
