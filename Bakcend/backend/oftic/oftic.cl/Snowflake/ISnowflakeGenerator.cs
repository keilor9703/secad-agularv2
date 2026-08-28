namespace Comun.Snowflake;

/// <summary>
/// Generates globally unique, monotonically-increasing 64-bit IDs using the
/// Snowflake algorithm (timestamp | nodeId | sequence). Safe to use in a
/// distributed setup where each node has a distinct NodeId, eliminating the
/// risk of Primary Key collisions during a Main ↔ Edge database merge.
/// </summary>
public interface ISnowflakeGenerator
{
    /// <summary>
    /// Returns the next unique ID. Thread-safe; can be called concurrently
    /// from any number of request threads.
    /// </summary>
    long NextId();
}
