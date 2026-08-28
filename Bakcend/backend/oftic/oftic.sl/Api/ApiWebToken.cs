using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;  
using System;
using System.Linq;
using System.Net.Http;             
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Comun.Dtos;
using Servicios.ApiInterfaz;

namespace Servicios.Api
{
    public class ApiWebToken : IApiWebToken
    {
        private readonly IHttpClientFactory _factory;
        private readonly IConfiguration _cfg;
        private readonly ILogger<ApiWebToken> _logger;

        public ApiWebToken(
            IHttpClientFactory factory,
            IConfiguration cfg,
            ILogger<ApiWebToken> logger)
        {
            _factory = factory;
            _cfg = cfg;
            _logger = logger;
        }

        public async Task<DtoRespuesta<string>> ObtenerTokenPipAsync(CancellationToken ct)
        {
            var client = _factory.CreateClient("AuthClient");

            var url = _cfg["ApiSettings:OudLogin"]?.Trim();
            var usuario = _cfg["ApiSettings:UsuarioPip"];
            var clave = _cfg["ApiSettings:ClavePip"];

            var payload = new DtoUsuarioPip
            {
                usuario = usuario,
                clave = clave
            };

            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var resp = await client.PostAsync(url, content, ct);
            resp.EnsureSuccessStatusCode();

            var responseJson = await resp.Content.ReadAsStringAsync(ct);
            return JsonSerializer.Deserialize<DtoRespuesta<string>>(responseJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        }

        public async Task<DtoRespuesta<string>> ObtenerTokenSeviciosAsync(DtoUsuarioPip usuario)
        {
            var client = _factory.CreateClient("AuthClient");  
            var url = _cfg["ApiSettings:OudLogin"]!;

            var content = new StringContent(
                JsonSerializer.Serialize(usuario),
                Encoding.UTF8,
                "application/json");

            using var resp = await client.PostAsync(url, content);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("OUD login failed: {StatusCode}", resp.StatusCode);
                return new DtoRespuesta<string>
                {
                    Estado = false,
                    Codigo = (int)resp.StatusCode,
                    Mensaje = "Credenciales inválidas en OUD",
                    Respuesta = string.Empty
                };
            }

            var json = await resp.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<DtoRespuesta<string>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new DtoRespuesta<string>
                {
                    Estado = false,
                    Codigo = 500,
                    Mensaje = "Respuesta inválida de OUD",
                    Respuesta = string.Empty
                };
        }

        public async Task<string> GetTokenAsync(string usuario, string contrasena)
        {
            try
            {
                var client = _factory.CreateClient("AuthClient");
                var url = _cfg["ApiSettings:PostPipToken"] ?? "https://internalpip.policia.gov.co:8080/api/Cuenta/Token";
                var payloads = new object[]
                {
                    new { Usuario = usuario, Clave = contrasena },
                    new { usuario, clave = contrasena },
                    new { usuario, contrasena },
                    new { Usuario = usuario, Contrasena = contrasena }
                };

                HttpResponseMessage? lastResponse = null;
                string lastPayload = string.Empty;
                string lastBody = string.Empty;

                foreach (var payload in payloads)
                {
                    var json = JsonSerializer.Serialize(payload);
                    using var content = new StringContent(json, Encoding.UTF8, "application/json");
                    using var resp = await client.PostAsync(url, content);
                    var responseJson = await resp.Content.ReadAsStringAsync();
                    lastResponse = resp;
                    lastPayload = json;
                    lastBody = responseJson;

                    if (!resp.IsSuccessStatusCode)
                    {
                        _logger.LogInformation("Token attempt failed: {StatusCode}. Payload: {Payload}",
                            resp.StatusCode, json, responseJson);
                        continue;
                    }

                    var token = TryExtractToken(responseJson);
                    if (!string.IsNullOrWhiteSpace(token))
                    {
                        return token;
                    }

                    _logger.LogInformation("Token attempt without token in response. Payload: {Payload}", json);
                }

                if (lastResponse is not null)
                {
                    _logger.LogWarning(
                        "Token request failed after all attempts. LastStatus: {StatusCode}. LastPayload: {Payload}. LastBody: {Body}",
                        lastResponse.StatusCode,
                        lastPayload,
                        lastBody);
                }

                return string.Empty;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting token");
                return string.Empty;
            }
        }

        private static string TryExtractToken(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return string.Empty;
            }

            // Intento 1: formato conocido { token: "..."}
            var dto = JsonSerializer.Deserialize<DtoTokenResponse>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (!string.IsNullOrWhiteSpace(dto?.token))
            {
                return dto.token!;
            }

            // Intento 2: formatos alternos { Token }, { respuesta }, { Respuesta }, { data: { token } }
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (TryGetString(root, "token", out var token)) return token;
            if (TryGetString(root, "Token", out token)) return token;
            if (TryGetString(root, "respuesta", out token)) return token;
            if (TryGetString(root, "Respuesta", out token)) return token;

            if (root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object)
            {
                if (TryGetString(data, "token", out token)) return token;
                if (TryGetString(data, "Token", out token)) return token;
            }

            return string.Empty;
        }

        private static bool TryGetString(JsonElement element, string propName, out string value)
        {
            value = string.Empty;
            if (!element.TryGetProperty(propName, out var prop))
            {
                return false;
            }

            if (prop.ValueKind == JsonValueKind.String)
            {
                value = prop.GetString() ?? string.Empty;
                return !string.IsNullOrWhiteSpace(value);
            }

            return false;
        }

        public async Task<DtoFuncionario> GetFuncionarioAsync(string token, string identificacion)
        {
            try
            {
                var client = _factory.CreateClient("AuthClient");
                client.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

                var url = _cfg["ApiSettings:ConsultaFuncionarios"] ?? "https://internalpip.policia.gov.co:8080/api/Icahu/FuncionarioPorIdentificacion";
                url = $"{url}{identificacion}";

                var resp = await client.GetAsync(url);

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("GetFuncionario request failed: {StatusCode}", resp.StatusCode);
                    return new DtoFuncionario();
                }

                var json = await resp.Content.ReadAsStringAsync();
                var funcionario = TryExtractFuncionario(json);
                if (funcionario is null)
                {
                    _logger.LogWarning("GetFuncionario returned 200 but could not parse payload. Body: {Body}", json);
                    return new DtoFuncionario();
                }

                return funcionario;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting employee");
                return new DtoFuncionario();
            }
        }

        public async Task<string> GetFotoFuncionarioAsync(string token, string identificacion)
        {
            try
            {
                var client = _factory.CreateClient("AuthClient");
                client.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");

                var baseUrl = "https://internalpip.policia.gov.co:8080/api/Icahu/ImagenFuncionarioB64";
                var url = $"{baseUrl}?_Identificacion={identificacion}";

                var resp = await client.GetAsync(url);

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("GetFoto request failed: {StatusCode}", resp.StatusCode);
                    return string.Empty;
                }

                var raw = await resp.Content.ReadAsStringAsync();
                var foto = TryExtractFotoBase64(raw);
                if (string.IsNullOrWhiteSpace(foto))
                {
                    _logger.LogWarning("GetFoto returned 200 but no base64 could be extracted. Body: {Body}", raw);
                }
                return foto;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting photo");
                return string.Empty;
            }
        }

        private static DtoFuncionario? TryExtractFuncionario(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return null;
            }

            var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

            // 1) Formato directo
            var direct = SafeDeserialize<DtoFuncionario>(json, opts);
            if (HasFuncionarioData(direct))
            {
                return direct;
            }

            // 2) Formato envuelto: { estado, respuesta: { ... } }
            var wrapped = SafeDeserialize<DtoRespuesta<DtoFuncionario>>(json, opts);
            if (wrapped?.Respuesta is not null && HasFuncionarioData(wrapped.Respuesta))
            {
                return wrapped.Respuesta;
            }

            // 3) Formato envuelto con lista: { respuesta: [ { ... } ] }
            var wrappedList = SafeDeserialize<DtoRespuesta<List<DtoFuncionario>>>(json, opts);
            var first = wrappedList?.Respuesta?.FirstOrDefault();
            if (HasFuncionarioData(first))
            {
                return first;
            }

            // 4) Parse flexible con data/respuesta/Resultado/etc.
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (TryGetFuncionarioFromProperty(root, "respuesta", opts, out var fromRespuesta)) return fromRespuesta;
            if (TryGetFuncionarioFromProperty(root, "Respuesta", opts, out fromRespuesta)) return fromRespuesta;
            if (TryGetFuncionarioFromProperty(root, "data", opts, out fromRespuesta)) return fromRespuesta;
            if (TryGetFuncionarioFromProperty(root, "Data", opts, out fromRespuesta)) return fromRespuesta;
            if (TryGetFuncionarioFromProperty(root, "resultado", opts, out fromRespuesta)) return fromRespuesta;
            if (TryGetFuncionarioFromProperty(root, "Resultado", opts, out fromRespuesta)) return fromRespuesta;

            // 5) Búsqueda recursiva del objeto candidato en cualquier nivel.
            if (TryFindFuncionarioCandidate(root, 0, out var candidate))
            {
                var mapped = MapFlexibleFuncionario(candidate);
                if (HasFuncionarioData(mapped))
                {
                    return mapped;
                }
            }

            return null;
        }

        private static bool TryGetFuncionarioFromProperty(
            JsonElement root,
            string propertyName,
            JsonSerializerOptions opts,
            out DtoFuncionario? funcionario)
        {
            funcionario = null;
            if (!root.TryGetProperty(propertyName, out var prop))
            {
                return false;
            }

            if (prop.ValueKind == JsonValueKind.Object)
            {
                funcionario = SafeDeserialize<DtoFuncionario>(prop.GetRawText(), opts);
                var mapped = MapFlexibleFuncionario(prop);
                funcionario = MergeFuncionario(funcionario, mapped);
                return HasFuncionarioData(funcionario);
            }

            if (prop.ValueKind == JsonValueKind.Array && prop.GetArrayLength() > 0)
            {
                var first = prop[0];
                if (first.ValueKind == JsonValueKind.Object)
                {
                    funcionario = SafeDeserialize<DtoFuncionario>(first.GetRawText(), opts);
                    var mapped = MapFlexibleFuncionario(first);
                    funcionario = MergeFuncionario(funcionario, mapped);
                    return HasFuncionarioData(funcionario);
                }
            }

            return false;
        }

        private static bool HasFuncionarioData(DtoFuncionario? f)
        {
            if (f is null) return false;
            return
                !string.IsNullOrWhiteSpace(f.identificacion) ||
                !string.IsNullOrWhiteSpace(f.nombres) ||
                !string.IsNullOrWhiteSpace(f.apellidos) ||
                !string.IsNullOrWhiteSpace(f.usuario) ||
                !string.IsNullOrWhiteSpace(f.correo);
        }

        private static DtoFuncionario MapFlexibleFuncionario(JsonElement obj)
        {
            return new DtoFuncionario
            {
                identificacion = Pick(obj, "identificacion", "Identificacion", "numeroDocumento", "NumeroDocumento", "documento", "Documento", "identidad", "IdFuncionario"),
                nombres = Pick(obj, "nombres", "Nombres", "nombre", "Nombre", "primerNombre", "PrimerNombre", "nombresFuncionario"),
                apellidos = Pick(obj, "apellidos", "Apellidos", "apellido", "Apellido", "primerApellido", "PrimerApellido", "apellidosFuncionario"),
                situacionLaboral = Pick(obj, "situacionLaboral", "SituacionLaboral", "situacion_laboral", "Situacion_Laboral", "situacion", "Situacion", "estadoLaboral", "EstadoLaboral"),
                correo = Pick(obj, "correo", "Correo", "email", "Email", "correoElectronico", "CorreoElectronico", "mail", "Mail"),
                usuario = Pick(obj, "usuario", "Usuario", "username", "Username", "usuarioEmpresarial", "UsuarioEmpresarial"),
                celular = Pick(obj, "celular", "Celular", "numeroCelular", "NumeroCelular", "telefono", "Telefono", "telefonoMovil", "TelefonoMovil", "movil", "Movil"),
                dependencia = Pick(obj, "descripcionDependencia", "DescripcionDependencia"),
                siglaFisica = Pick(obj, "siglaFisica", "SiglaFisica", "siglaLaborando", "SiglaLaborando"),
                siglaLaborando = Pick(obj, "siglaLaborando", "SiglaLaborando"),
                nombreGrado = Pick(obj, "nombreGrado", "NombreGrado", "grado", "Grado"),
                gradAlfabetico = Pick(obj, "gradAlfabetico", "GradAlfabetico", "gradoAlfabetico", "GradoAlfabetico", "siglaGrado", "SiglaGrado"),
                tiempoServicio = Pick(obj, "tiempoServicio", "TiempoServicio", "tiempo_servicio", "Tiempo_Servicio"),
                // En PIP "funcionario" llega como texto; para código usamos consecutivo/numerico.
                funcionarioCodigo = Pick(obj, "consecutivo", "Consecutivo", "numerico", "Numerico", "identificacion", "Identificacion"),
                // Código de unidad donde labora.
                undeLaborandoCodigo = Pick(obj, "undeConsecutivoLaborando", "UndeConsecutivoLaborando", "undeConsecutivo", "UndeConsecutivo", "tiunCodigo", "TiunCodigo"),
                // No viene "codigoCargo" explícito; usamos ordenamiento como fallback numérico.
                codigoCargo = Pick(obj, "codigoCargo", "CodigoCargo", "codigocargo", "idCargo", "IdCargo", "cargoCodigo", "CargoCodigo", "ordenamiento", "Ordenamiento"),
                cargo = Pick(obj, "cargo", "Cargo", "rolCargo", "RolCargo"),
                activo = PickBool(obj, "activo", "Activo", "vigente", "Vigente")
            };
        }

        private static DtoFuncionario MergeFuncionario(DtoFuncionario? primary, DtoFuncionario fallback)
        {
            primary ??= new DtoFuncionario();

            primary.identificacion ??= fallback.identificacion;
            primary.nombres ??= fallback.nombres;
            primary.apellidos ??= fallback.apellidos;
            primary.situacionLaboral ??= fallback.situacionLaboral;
            primary.correo ??= fallback.correo;
            primary.usuario ??= fallback.usuario;
            primary.celular ??= fallback.celular;
            primary.dependencia ??= fallback.dependencia;
            primary.siglaFisica ??= fallback.siglaFisica;
            primary.siglaLaborando ??= fallback.siglaLaborando;
            primary.nombreGrado ??= fallback.nombreGrado;
            primary.cargo ??= fallback.cargo;
            primary.gradAlfabetico ??= fallback.gradAlfabetico;
            primary.tiempoServicio ??= fallback.tiempoServicio;
            primary.funcionarioCodigo ??= fallback.funcionarioCodigo;
            primary.undeLaborandoCodigo ??= fallback.undeLaborandoCodigo;
            primary.codigoCargo ??= fallback.codigoCargo;

            return primary;
        }

        private static string? Pick(JsonElement obj, params string[] names)
        {
            foreach (var n in names)
            {
                if (TryExtractStringProp(obj, n, out var value) && !string.IsNullOrWhiteSpace(value))
                {
                    return value.Trim();
                }
            }
            return null;
        }

        private static bool PickBool(JsonElement obj, params string[] names)
        {
            foreach (var n in names)
            {
                if (TryGetBoolProp(obj, n, out var value))
                {
                    return value;
                }
            }
            return true;
        }

        private static string TryExtractFotoBase64(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                return string.Empty;
            }

            var trimmed = raw.Trim();

            // 1) String plano (puede venir como "....")
            if (trimmed.StartsWith("\"") && trimmed.EndsWith("\""))
            {
                try
                {
                    trimmed = JsonSerializer.Deserialize<string>(trimmed) ?? string.Empty;
                }
                catch
                {
                    // dejar trimmed original
                }
            }

            if (LooksLikeBase64(trimmed))
            {
                return trimmed;
            }

            // 2) JSON envuelto: { respuesta: "..." } o { data: { foto: "..." } }
            try
            {
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;

                if (TryExtractStringProp(root, "respuesta", out var s) && LooksLikeBase64(s)) return s;
                if (TryExtractStringProp(root, "Respuesta", out s) && LooksLikeBase64(s)) return s;
                if (TryExtractStringProp(root, "foto", out s) && LooksLikeBase64(s)) return s;
                if (TryExtractStringProp(root, "Foto", out s) && LooksLikeBase64(s)) return s;

                if (root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object)
                {
                    if (TryExtractStringProp(data, "foto", out s) && LooksLikeBase64(s)) return s;
                    if (TryExtractStringProp(data, "Foto", out s) && LooksLikeBase64(s)) return s;
                    if (TryExtractStringProp(data, "respuesta", out s) && LooksLikeBase64(s)) return s;
                }
            }
            catch
            {
                // No JSON parseable
            }

            return string.Empty;
        }

        private static bool TryExtractStringProp(JsonElement root, string propName, out string value)
        {
            value = string.Empty;
            if (!TryGetPropertyIgnoreCase(root, propName, out var prop))
            {
                return false;
            }

            if (prop.ValueKind == JsonValueKind.String)
            {
                value = prop.GetString() ?? string.Empty;
                return !string.IsNullOrWhiteSpace(value);
            }

            if (prop.ValueKind == JsonValueKind.Number)
            {
                value = prop.GetRawText();
                return !string.IsNullOrWhiteSpace(value);
            }

            if (prop.ValueKind == JsonValueKind.True || prop.ValueKind == JsonValueKind.False)
            {
                value = prop.GetBoolean() ? "true" : "false";
                return true;
            }

            return false;
        }

        private static bool TryGetBoolProp(JsonElement root, string propName, out bool value)
        {
            value = false;
            if (!TryGetPropertyIgnoreCase(root, propName, out var prop))
            {
                return false;
            }

            if (prop.ValueKind == JsonValueKind.True || prop.ValueKind == JsonValueKind.False)
            {
                value = prop.GetBoolean();
                return true;
            }

            if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt32(out var number))
            {
                value = number != 0;
                return true;
            }

            if (prop.ValueKind == JsonValueKind.String)
            {
                var raw = prop.GetString() ?? string.Empty;
                if (bool.TryParse(raw, out var parsedBool))
                {
                    value = parsedBool;
                    return true;
                }

                if (int.TryParse(raw, out var parsedInt))
                {
                    value = parsedInt != 0;
                    return true;
                }
            }

            return false;
        }

        private static bool TryGetPropertyIgnoreCase(JsonElement root, string propName, out JsonElement value)
        {
            foreach (var p in root.EnumerateObject())
            {
                if (string.Equals(p.Name, propName, StringComparison.OrdinalIgnoreCase))
                {
                    value = p.Value;
                    return true;
                }
            }
            value = default;
            return false;
        }

        private static bool LooksLikeBase64(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length < 40)
            {
                return false;
            }

            // Acepta Base64 puro o data URL.
            if (value.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return value.All(c =>
                (c >= 'A' && c <= 'Z') ||
                (c >= 'a' && c <= 'z') ||
                (c >= '0' && c <= '9') ||
                c == '+' || c == '/' || c == '=' ||
                c == '-' || c == '_');
        }

        private static T? SafeDeserialize<T>(string json, JsonSerializerOptions opts)
        {
            try
            {
                return JsonSerializer.Deserialize<T>(json, opts);
            }
            catch
            {
                return default;
            }
        }

        private static bool TryFindFuncionarioCandidate(JsonElement element, int depth, out JsonElement candidate)
        {
            candidate = default;
            if (depth > 8)
            {
                return false;
            }

            if (element.ValueKind == JsonValueKind.Object)
            {
                if (LooksLikeFuncionarioObject(element))
                {
                    candidate = element;
                    return true;
                }

                foreach (var prop in element.EnumerateObject())
                {
                    if (TryFindFuncionarioCandidate(prop.Value, depth + 1, out candidate))
                    {
                        return true;
                    }
                }
            }

            if (element.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in element.EnumerateArray())
                {
                    if (TryFindFuncionarioCandidate(item, depth + 1, out candidate))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private static bool LooksLikeFuncionarioObject(JsonElement obj)
        {
            var keys = obj.EnumerateObject().Select(p => p.Name.ToLowerInvariant()).ToList();

            var score = 0;
            if (keys.Any(k => k.Contains("ident"))) score++;
            if (keys.Any(k => k.Contains("nombre"))) score++;
            if (keys.Any(k => k.Contains("apellido"))) score++;
            if (keys.Any(k => k.Contains("correo") || k.Contains("email") || k.Contains("mail"))) score++;
            if (keys.Any(k => k.Contains("usuario"))) score++;
            if (keys.Any(k => k.Contains("celular") || k.Contains("telefono") || k.Contains("movil"))) score++;
            if (keys.Any(k => k.Contains("dependencia") || k.Contains("unidad"))) score++;
            if (keys.Any(k => k.Contains("cargo"))) score++;

            return score >= 2;
        }
    }
}
