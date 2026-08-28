using Comun.Snowflake;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Servicios.Snowflake;

/// <summary>
/// Thread-safe Snowflake ID generator — produces collision-free 64-bit longs
/// that can be safely merged across the Main node and the Edge node.
///
/// Bit layout (64 bits total):
/// ┌─────┬────────────────────────────────────────────┬──────────────┬──────────────────┐
/// │  63 │                  62 – 22                   │   21 – 12    │     11 –  0      │
/// │  0  │    41-bit timestamp (ms since epoch)        │ 10-bit node  │ 12-bit sequence  │
/// └─────┴────────────────────────────────────────────┴──────────────┴──────────────────┘
///
/// Capacity:
///   • ~69 years of timestamps from the custom epoch (2024-01-01)
///   • 1 024 distinct nodes  (NodeId 0–1023)
///   • 4 096 IDs per millisecond per node  → 4 096 000 IDs/second per node
///
/// Configuration (appsettings.json):
///   "Snowflake": { "NodeId": 1 }   ← Main node
///   "Snowflake": { "NodeId": 2 }   ← Edge node
/// </summary>
public sealed class SnowflakeGenerator : ISnowflakeGenerator
{
    // ── Bit-layout constants ──────────────────────────────────────────────────
    private const int  NodeIdBits    = 10;
    private const int  SequenceBits  = 12;
    private const int  TimestampShift = NodeIdBits + SequenceBits;  // 22
    private const int  NodeIdShift   = SequenceBits;                // 12
    private const long MaxNodeId     = (1L << NodeIdBits)   - 1;   // 1 023
    private const long MaxSequence   = (1L << SequenceBits) - 1;   // 4 095

    /// <summary>
    /// Custom epoch: 2024-01-01 00:00:00 UTC.
    /// Starting from this date instead of Unix epoch (1970) gives us
    /// ~69 useful years (until ~2093) while keeping IDs compact.
    /// </summary>
    private static readonly long Epoch =
        new DateTimeOffset(2024, 1, 1, 0, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();

    private readonly long   _nodeId;
    private readonly ILogger<SnowflakeGenerator> _logger;
    private          long   _lastTimestamp = -1;
    private          long   _sequence      = 0;
    private readonly object _lock          = new();

    public SnowflakeGenerator(IConfiguration config, ILogger<SnowflakeGenerator> logger)
    {
        _logger = logger;
        var nodeId = config.GetValue<long>("Snowflake:NodeId", 1);

        if (nodeId < 0 || nodeId > MaxNodeId)
            throw new InvalidOperationException(
                $"Snowflake:NodeId must be between 0 and {MaxNodeId}. " +
                $"Configured value: {nodeId}. " +
                $"Set NodeId=1 for the Main node, NodeId=2 for the Edge node.");

        _nodeId = nodeId;
        _logger.LogInformation(
            "SnowflakeGenerator initialized — NodeId={NodeId} (max {MaxNode})",
            _nodeId, MaxNodeId);
    }

    /// <inheritdoc/>
    public long NextId()
    {
        lock (_lock)
        {
            var ts = CurrentMs();

            if (ts == _lastTimestamp)
            {
                // Same millisecond — advance the sequence counter.
                _sequence = (_sequence + 1) & MaxSequence;

                if (_sequence == 0)
                {
                    // Sequence exhausted (> 4 095 calls in 1 ms).
                    // Spin-wait until the clock moves forward.
                    ts = WaitNextMs(_lastTimestamp);
                    _logger.LogWarning(
                        "Snowflake sequence exhausted in 1 ms — waited for next millisecond.");
                }
            }
            else
            {
                // New millisecond — reset sequence.
                _sequence = 0;
            }

            _lastTimestamp = ts;

            return (ts << TimestampShift) | (_nodeId << NodeIdShift) | _sequence;
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static long CurrentMs() =>
        DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - Epoch;

    private static long WaitNextMs(long lastTimestamp)
    {
        long ts;
        do { ts = CurrentMs(); }
        while (ts <= lastTimestamp);
        return ts;
    }
}
