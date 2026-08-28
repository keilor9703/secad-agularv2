using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Api.Converters;

/// <summary>
/// Serializa <c>long</c> como cadena JSON ("317274735010385920") para evitar
/// la pérdida de precisión que sufre JavaScript al parsear enteros mayores
/// que Number.MAX_SAFE_INTEGER (2^53 − 1 ≈ 9 × 10^15).
///
/// Los Snowflake IDs generados por este sistema tienen ~18 dígitos y superan
/// ese límite.  Sin este convertidor, JSON.parse() los redondea silenciosamente
/// y las llamadas posteriores al API fallan con violaciones de FK.
///
/// El lector acepta tanto cadenas ("123") como números (123) para mantener
/// compatibilidad con clientes que aún envíen números en los request bodies.
/// </summary>
public sealed class LongToStringJsonConverter : JsonConverter<long>
{
    public override long Read(
        ref Utf8JsonReader reader,
        Type              typeToConvert,
        JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var s = reader.GetString();
            if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
                return parsed;
            throw new JsonException($"Cannot convert \"{s}\" to Int64.");
        }
        return reader.GetInt64();
    }

    public override void Write(
        Utf8JsonWriter        writer,
        long                  value,
        JsonSerializerOptions options)
        => writer.WriteStringValue(value.ToString(CultureInfo.InvariantCulture));
}

/// <summary>
/// Versión nullable de <see cref="LongToStringJsonConverter"/>.
/// </summary>
public sealed class NullableLongToStringJsonConverter : JsonConverter<long?>
{
    public override long? Read(
        ref Utf8JsonReader reader,
        Type              typeToConvert,
        JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
            return null;

        if (reader.TokenType == JsonTokenType.String)
        {
            var s = reader.GetString();
            if (string.IsNullOrEmpty(s)) return null;
            if (long.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
                return parsed;
            throw new JsonException($"Cannot convert \"{s}\" to Int64?.");
        }
        return reader.GetInt64();
    }

    public override void Write(
        Utf8JsonWriter        writer,
        long?                 value,
        JsonSerializerOptions options)
    {
        if (value is null) writer.WriteNullValue();
        else               writer.WriteStringValue(value.Value.ToString(CultureInfo.InvariantCulture));
    }
}
