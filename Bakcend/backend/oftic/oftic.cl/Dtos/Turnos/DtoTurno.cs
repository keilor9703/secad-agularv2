namespace Comun.Dtos.Turnos;

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de dominio — deben coincidir con cad_referencias_secad
// ─────────────────────────────────────────────────────────────────────────────

/// <summary>
/// Numeración alineada con el esquema canónico de turno de vigilancia usado en
/// todo el sistema (ver GetTurnoActual() en DbPedidoRepository.cs):
/// 1=22:00-05:59, 2=06:00-13:59, 3=14:00-21:59. Antes de este cambio Turnos
/// tenía su propia numeración rotada (1=06-14h) que nunca coincidía con la del
/// resto de módulos ni con las horas que el propio frontend autocompletaba.
/// </summary>
public static class ClaseTurno
{
    public const int Primero  = 1;   // 22:00 – 06:00
    public const int Segundo  = 2;   // 06:00 – 14:00
    public const int Tercero  = 3;   // 14:00 – 22:00

    public static string Descripcion(int clase) => clase switch
    {
        1 => "Primer Turno",
        2 => "Segundo Turno",
        3 => "Tercer Turno",
        _ => $"Turno {clase}"
    };
}

public static class EstadoTurno
{
    public const string Activo  = "A";
    public const string Cerrado = "C";
    public const string Anulado = "V";
}

public static class EstadoMedio
{
    public const int Libre           = 27;
    public const int Ocupado         = 28;
    public const int FueraDeServicio = 29;
    public const int EnRuta          = 30;
    public const int EnBase          = 31;

    public static string Descripcion(int estado) => estado switch
    {
        27 => "Libre",
        28 => "Ocupado",
        29 => "Fuera de servicio",
        30 => "En ruta",
        31 => "En base",
        _  => $"Estado {estado}"
    };
}

public static class TipoMedio
{
    public const int Motocicleta    = 20;
    public const int Bicicleta      = 21;
    public const int Patrulla       = 22;
    public const int Ambulancia     = 23;
    public const int CamionBomberos = 24;
    public const int Helicoptero    = 25;
    public const int Lancha         = 26;
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Turno (header)
// ─────────────────────────────────────────────────────────────────────────────

public class DtoTurno
{
    public long    Id                  { get; set; }
    public int     SitioGraba          { get; set; }
    public int     FuerzaId            { get; set; }
    public string  FuerzaDescripcion   { get; set; } = "";
    public int     ClaseTurno          { get; set; }
    public string  ClaseTurnoDesc      { get; set; } = "";
    public int?    TipoTurno           { get; set; }
    public string  TipoTurnoDesc       { get; set; } = "";
    public string  HoraInicia          { get; set; } = "";   // dd/MM/yyyy HH:mm
    public string  HoraTermina         { get; set; } = "";
    public string  DiaInicia           { get; set; } = "";   // dd/MM/yyyy
    public string? Consignas           { get; set; }
    public string  Estado              { get; set; } = EstadoTurno.Activo;
    public bool    SiviccSincronizado  { get; set; }
    public string? SiviccFechaSync     { get; set; }
    public string  FechaCreacion       { get; set; } = "";
    public string? UsuarioCrea         { get; set; }
    // Conteos para la lista
    public int     TotalUnidades       { get; set; }
    public int     TotalMedios         { get; set; }
}

public class DtoTurnoListItem
{
    public long   Id               { get; set; }
    public int    ClaseTurno       { get; set; }
    public string ClaseTurnoDesc   { get; set; } = "";
    public string FuerzaDesc       { get; set; } = "";
    public string HoraInicia       { get; set; } = "";
    public string HoraTermina      { get; set; } = "";
    public string Estado           { get; set; } = "";
    public int    TotalUnidades    { get; set; }
    public int    TotalMedios      { get; set; }
    public bool   SiviccSync       { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Unidad en Turno
// ─────────────────────────────────────────────────────────────────────────────

public class DtoTurnoUnidad
{
    public long    Id                { get; set; }
    public long    TurnoId           { get; set; }
    public string  UnidadCodigo      { get; set; } = "";
    public string  UnidadDesc        { get; set; } = "";
    public int?    FuerzaId          { get; set; }
    public string? Consignas         { get; set; }
    public string  Origen            { get; set; } = "MANUAL";
    public int?    SiviccMinutaId    { get; set; }
    public int?    SiviccConsecutivo { get; set; }
    public int     TotalMedios       { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs de Medio Disponible
// ─────────────────────────────────────────────────────────────────────────────

public class DtoPersonalMedio
{
    public string  CeduEmpleado   { get; set; } = "";
    public string? NombrePolicial { get; set; }
    public string? DescCargo      { get; set; }
}

/// <summary>
/// Medio disponible en turno — versión completa para el panel de despacho.
/// Incluye posición GPS y personal asignado.
/// </summary>
public class DtoMedioDisponible
{
    public long    Id               { get; set; }
    public int     SitioGraba       { get; set; }
    public long    TurnoId          { get; set; }
    public long?   TurnoUnidadId    { get; set; }
    public string? UnidadCodigo     { get; set; }
    public int?    FuerzaId         { get; set; }

    // Canal de radio
    public int?    CanalFuerzaId    { get; set; }
    public int?    CanalCodigo      { get; set; }
    public string  CanalDesc        { get; set; } = "";

    // Identificación del recurso
    public string  PatrullaCodigo   { get; set; } = "";
    public string  PatrullaDesc     { get; set; } = "";
    public int     TipoMedio        { get; set; } = global::Comun.Dtos.Turnos.TipoMedio.Patrulla;
    public string  TipoMedioDesc    { get; set; } = "";

    // Estado operativo
    public int     Estado           { get; set; } = EstadoMedio.Libre;
    public string  EstadoDesc       { get; set; } = "";

    // Ubicación GPS (última posición reportada por GESPO)
    public double? Latitud          { get; set; }
    public double? Longitud         { get; set; }
    public double? VelocidadKmh     { get; set; }
    public double? RumboGrados      { get; set; }
    public string? FechaUbicacion   { get; set; }
    /// <summary>True si la última posición tiene menos de 10 minutos.</summary>
    public bool    GpsActivo        { get; set; }

    // Incidente actual (si está ocupado/en ruta)
    public long?   EventoId         { get; set; }
    public long?   ActuacionId      { get; set; }

    // Personal asignado
    public List<DtoPersonalMedio> Personal { get; set; } = new();

    // Distancia al incidente activo (calculada en el cliente o en el servidor)
    public double? DistanciaKm      { get; set; }
}

/// <summary>
/// Versión reducida para la grilla en tiempo real del módulo de Eventos.
/// Se serializa compacto para minimizar payload en polling.
/// </summary>
public class DtoMedioDisponibleResumen
{
    public long    Id             { get; set; }
    public string  PatrullaCodigo { get; set; } = "";
    public string  PatrullaDesc   { get; set; } = "";
    public int     TipoMedio      { get; set; }
    public int     Estado         { get; set; }
    public string  EstadoDesc     { get; set; } = "";
    public string  CanalDesc      { get; set; } = "";
    public double? Lat            { get; set; }
    public double? Lng            { get; set; }
    public bool    GpsActivo      { get; set; }
    public long?   EventoId       { get; set; }
    public double? DistanciaKm    { get; set; }
    // Personal resumido
    public string  PersonalResumen { get; set; } = "";  // "Nombre1 / Nombre2" (cédula solo si no hay nombre)
}

// ─────────────────────────────────────────────────────────────────────────────
// Requests y resultados
// ─────────────────────────────────────────────────────────────────────────────

public class DtoCrearTurnoRequest
{
    public int     SitioGraba   { get; set; }
    public int     FuerzaId     { get; set; }
    public int     ClaseTurno   { get; set; }
    public int?    TipoTurno    { get; set; }
    /// <summary>Formato: dd/MM/yyyy HH:mm</summary>
    public string  HoraInicia   { get; set; } = "";
    public string  HoraTermina  { get; set; } = "";
    public string? Consignas    { get; set; }
}

public class DtoCopiarTurnoRequest
{
    public long    TurnoOrigenId { get; set; }
    public int     ClaseTurno    { get; set; }
    public int?    TipoTurno     { get; set; }
    public string  HoraInicia    { get; set; } = "";
    public string  HoraTermina   { get; set; } = "";
}

public class DtoAgregarUnidadRequest
{
    public long    TurnoId          { get; set; }
    public string  UnidadCodigo     { get; set; } = "";
    public string? UnidadDesc       { get; set; }
    public int?    FuerzaId         { get; set; }
    public string? Consignas        { get; set; }
    /// <summary>MANUAL | SIVICC</summary>
    public string  Origen           { get; set; } = "MANUAL";
    public int?    SiviccMinutaId   { get; set; }
    public int?    SiviccConsecutivo { get; set; }
}

public class DtoAgregarMedioRequest
{
    public long    TurnoId         { get; set; }
    public long?   TurnoUnidadId   { get; set; }
    public string? UnidadCodigo    { get; set; }
    public int?    FuerzaId        { get; set; }
    public int?    CanalFuerzaId   { get; set; }
    public int?    CanalCodigo     { get; set; }
    public string  PatrullaCodigo  { get; set; } = "";
    public string? PatrullaDesc    { get; set; }
    public int     TipoMedio       { get; set; } = global::Comun.Dtos.Turnos.TipoMedio.Patrulla;
    public List<DtoPersonalMedio> Personal { get; set; } = new();
}

/// <summary>
/// Request para importar medios y personal de las unidades seleccionadas desde SIVICC.
///
/// Flujo correcto:
///   1. GET  api/Turnos/{id}/sivicc/unidades  →  obtiene lista de unidades disponibles
///   2. El usuario selecciona cuáles importar
///   3. POST api/Turnos/{id}/sivicc           →  envía las unidades seleccionadas aquí
///
/// MinutaId y Consecutivo de cada unidad vienen del paso 1;
/// el usuario nunca los introduce manualmente.
/// </summary>
public class DtoImportarSiviccRequest
{
    public long   TurnoId       { get; set; }
    /// <summary>
    /// Canal de radio POR DEFECTO — se usa solo para las unidades que no
    /// traigan su propio CanalCodigo en <see cref="DtoUnidadSiviccSeleccionada"/>.
    /// </summary>
    public int?   CanalCodigo   { get; set; }
    public int?   CanalFuerzaId { get; set; }
    public int    FuerzaId      { get; set; }
    public int    SitioGraba    { get; set; }

    /// <summary>
    /// Unidades seleccionadas por el usuario.
    /// Si está vacía se importan TODAS las unidades del turno en SIVICC.
    /// </summary>
    public List<DtoUnidadSiviccSeleccionada> Unidades { get; set; } = new();
}

/// <summary>
/// Campos editables de un medio ya registrado en turno.
/// Solo se actualizan datos de identificación, tipo, canal y personal;
/// los campos estructurales (turnoId, unidadId, fuerza, sitioGraba) no cambian.
/// </summary>
public class DtoActualizarMedioRequest
{
    public int?    CanalFuerzaId   { get; set; }
    public int?    CanalCodigo     { get; set; }
    public string  PatrullaCodigo  { get; set; } = "";
    public string? PatrullaDesc    { get; set; }
    public int     TipoMedio       { get; set; } = global::Comun.Dtos.Turnos.TipoMedio.Patrulla;
    /// <summary>Lista de policías asignados (máx. 2). Reemplaza completamente la lista anterior.</summary>
    public List<DtoPersonalMedio> Personal { get; set; } = new();
}

public class DtoCambiarEstadoMedioRequest
{
    public int     NuevoEstado    { get; set; }
    public long?   EventoId       { get; set; }
    public long?   ActuacionId    { get; set; }
    public string? Observacion    { get; set; }
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs de integración GESPO (minuta digital, antes "SIVICC")
// ─────────────────────────────────────────────────────────────────────────────

/// <summary>
/// Unidad con minuta activa en GESPO para el turno y fuerza indicados.
/// Se obtiene consultando GESPO directamente (VM_MINUTAS_ACTIVAS) vía
/// IGespoMinutaReader — sin FDW, conexión directa desde el backend .NET.
/// </summary>
public class DtoUnidadSivicc
{
    /// <summary>ID de la minuta en GESPO (VM_MINUTAS_ACTIVAS.MINUTA_ID).</summary>
    public int    MinutaId          { get; set; }
    /// <summary>Consecutivo de la unidad en GESPO (VM_MINUTAS_ACTIVAS.CONSECUTIVO).</summary>
    public int    Consecutivo       { get; set; }
    /// <summary>Código SECAD de la unidad (ej. "EST-01") — hoy igual al Consecutivo.</summary>
    public string UnidadCodigo      { get; set; } = "";
    /// <summary>Descripción / nombre de la unidad en GESPO (columna UNIDAD).</summary>
    public string Descripcion       { get; set; } = "";
    /// <summary>true si ya tiene medios registrados en cad_medios_disponibles.</summary>
    public bool   ExisteEnCadMedios { get; set; }
}

/// <summary>
/// Unidad seleccionada por el usuario para importar desde GESPO.
/// Contiene los identificadores obtenidos en el paso de consulta de unidades.
/// </summary>
public class DtoUnidadSiviccSeleccionada
{
    public int     MinutaId    { get; set; }
    public int     Consecutivo { get; set; }
    /// <summary>
    /// Snapshot del nombre de la unidad (viene del paso 1, GET .../sivicc/unidades)
    /// — se usa para poblar cad_turnos_unidades.unidad_desc al importar, sin
    /// necesidad de otra consulta a GESPO.
    /// </summary>
    public string? Descripcion { get; set; }
    /// <summary>
    /// Canal de radio propio de esta unidad — cada unidad puede necesitar uno
    /// distinto (no todas comparten el mismo). Si viene null, se usa el canal
    /// por defecto de <see cref="DtoImportarSiviccRequest.CanalCodigo"/>.
    /// </summary>
    public int? CanalCodigo   { get; set; }
    public int? CanalFuerzaId { get; set; }
}

/// <summary>
/// Posición GPS recibida desde GESPO (un item por patrulla).
/// </summary>
public class DtoGespoUbicacion
{
    public string  PatrullaCodigo { get; set; } = "";
    public double  Latitud        { get; set; }
    public double  Longitud       { get; set; }
    public double? VelocidadKmh   { get; set; }
    public double? RumboGrados    { get; set; }
    public string  FechaGps       { get; set; } = "";   // ISO-8601
}

/// <summary>
/// Un policía asignado a un cuadrante dentro de una minuta GESPO — resultado de
/// unir MINUTA_EMPLEADO + VM_CUADRANTE + VM_PERSONAL_AGRUPADO (ver
/// GespoMinutaReader.LeerMediosDeMinutaAsync). Varias filas comparten el mismo
/// CuadranteId (hasta 2 se usan como personal del medio).
/// </summary>
public class DtoMinutaEmpleadoGespo
{
    /// <summary>MINUTA_EMPLEADO.CUADRANTE_ID = cad_medios_disponibles.patrulla_codigo.</summary>
    public string CuadranteId    { get; set; } = "";
    /// <summary>VM_CUADRANTE.CODIGO_ZONA — nombre/código del cuadrante.</summary>
    public string PatrullaDesc   { get; set; } = "";
    /// <summary>VM_PERSONAL_AGRUPADO.IDENTIFICACION — cédula del policía.</summary>
    public string Identificacion { get; set; } = "";
    /// <summary>VM_PERSONAL_AGRUPADO.FUNCIONARIO — grado + nombre completo.</summary>
    public string NombreCompleto { get; set; } = "";
    /// <summary>VM_PERSONAL_AGRUPADO.CARGO_ACTUAL.</summary>
    public string Cargo          { get; set; } = "";
}

public class DtoTurnoResult
{
    public bool   Success   { get; set; }
    public string Message   { get; set; } = "";
    public long   Id        { get; set; }
}

/// <summary>
/// Un medio/patrulla candidato a asignación, rankeado por cercanía al punto
/// consultado (distancia Haversine en SQL plano — ver G_GetRecursoMasCercanoAsync).
/// Es solo una sugerencia: el despachador decide, nunca se auto-asigna.
/// </summary>
public class DtoRecursoCercano
{
    public string  MedioId        { get; set; } = "";   // Snowflake
    public string  PatrullaCodigo { get; set; } = "";
    public string  PatrullaDesc   { get; set; } = "";
    public int     TipoMedio      { get; set; }
    public int     Estado         { get; set; }
    public string  EstadoDesc     { get; set; } = "";
    public double  Latitud        { get; set; }
    public double  Longitud       { get; set; }
    /// <summary>Distancia en línea recta al punto consultado, en metros.</summary>
    public double  DistanciaM     { get; set; }
}
