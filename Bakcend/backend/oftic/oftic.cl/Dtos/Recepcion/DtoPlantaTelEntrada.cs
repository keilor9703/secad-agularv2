using System.Text.Json.Serialization;

namespace Comun.Dtos.Recepcion
{
    // ── Payload de recepción PlantaTel (PBX → SECAD, máquina a máquina) ──────
    // Autenticación: cabecera X-Api-Key. Tenant: cabecera X-Cod-Dane.
    // La PBX envía Acd/NumTelefono como texto (extensiones con ceros a la
    // izquierda, números con separadores, etc.); se normalizan en el controlador.
    public class DtoPlantaTelEntrada
    {
        /// <summary>Extensión ACD del operador destino.</summary>
        public string Acd { get; set; } = "";
        /// <summary>Número de teléfono del ciudadano que llama.</summary>
        public string NumTelefono { get; set; } = "";
        /// <summary>Sitio de grabación del CAD origen (consecutivo en cad_sitios_grabacion).</summary>
        public int SitioGraba { get; set; }
    }

    // ── Resultado devuelto a la PBX ───────────────────────────────────────────
    public class DtoPlantaTelEntradaResult
    {
        public bool   Success { get; set; }
        public string Message { get; set; } = "";
        /// <summary>ID de la fila insertada en cad_plantatel (string para precisión JS).</summary>
        [JsonNumberHandling(JsonNumberHandling.WriteAsString | JsonNumberHandling.AllowReadingFromString)]
        public long   Id      { get; set; }
    }
}
