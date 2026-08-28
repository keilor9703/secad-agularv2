using Microsoft.AspNetCore.Http;
using System.Text.RegularExpressions;

namespace ofic.Security;

public static class SecurityGuards
{
    private static readonly Regex SafeTextRegex = new(
        @"^[a-zA-Z0-9\s.,\-_()/:áéíóúÁÉÍÓÚñÑ]+$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool HasPotentialHtml(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return value.Contains('<') || value.Contains('>');
    }

    public static bool IsSafeText(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
        {
            return false;
        }

        if (HasPotentialHtml(trimmed))
        {
            return false;
        }

        return SafeTextRegex.IsMatch(trimmed);
    }

    public static bool HasValidImageSignature(IFormFile file, string extension)
    {
        var header = ReadHeader(file, 32);
        if (header.Length == 0)
        {
            return false;
        }

        return extension switch
        {
            ".jpg" or ".jpeg" => header.Length >= 3 &&
                                 header[0] == 0xFF &&
                                 header[1] == 0xD8 &&
                                 header[2] == 0xFF,
            ".png" => header.Length >= 8 &&
                      header[0] == 0x89 &&
                      header[1] == 0x50 &&
                      header[2] == 0x4E &&
                      header[3] == 0x47 &&
                      header[4] == 0x0D &&
                      header[5] == 0x0A &&
                      header[6] == 0x1A &&
                      header[7] == 0x0A,
            ".webp" => header.Length >= 12 &&
                       header[0] == 0x52 &&
                       header[1] == 0x49 &&
                       header[2] == 0x46 &&
                       header[3] == 0x46 &&
                       header[8] == 0x57 &&
                       header[9] == 0x45 &&
                       header[10] == 0x42 &&
                       header[11] == 0x50,
            ".ico" => header.Length >= 4 &&
                      header[0] == 0x00 &&
                      header[1] == 0x00 &&
                      header[2] == 0x01 &&
                      header[3] == 0x00,
            _ => false
        };
    }

    public static bool HasValidVideoSignature(IFormFile file, string extension)
    {
        var header = ReadHeader(file, 64);
        if (header.Length == 0)
        {
            return false;
        }

        return extension switch
        {
            ".mp4" or ".mov" => HasMp4Ftyp(header),
            ".webm" => header.Length >= 4 &&
                       header[0] == 0x1A &&
                       header[1] == 0x45 &&
                       header[2] == 0xDF &&
                       header[3] == 0xA3,
            ".ogg" => header.Length >= 4 &&
                      header[0] == 0x4F &&
                      header[1] == 0x67 &&
                      header[2] == 0x67 &&
                      header[3] == 0x53,
            _ => false
        };
    }

    private static bool HasMp4Ftyp(byte[] header)
    {
        if (header.Length < 12)
        {
            return false;
        }

        // MP4/MOV brands include 'ftyp' at byte offset 4.
        return header[4] == 0x66 &&
               header[5] == 0x74 &&
               header[6] == 0x79 &&
               header[7] == 0x70;
    }

    private static byte[] ReadHeader(IFormFile file, int maxBytes)
    {
        using var stream = file.OpenReadStream();
        var buffer = new byte[maxBytes];
        var read = stream.Read(buffer, 0, buffer.Length);
        if (read <= 0)
        {
            return Array.Empty<byte>();
        }

        if (read == buffer.Length)
        {
            return buffer;
        }

        return buffer[..read];
    }
}
