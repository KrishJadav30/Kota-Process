using System.Data;
using System.Diagnostics;
using Microsoft.Data.SqlClient;

namespace KotaProcess.Api.Services;

public class DatabaseCheckResult
{
    public bool IsConnected { get; set; }
    public string Message { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public string Database { get; set; } = string.Empty;
    public long LatencyMs { get; set; }
    public string? Version { get; set; }
}

public interface IDatabaseService
{
    Task<DatabaseCheckResult> CheckConnectionAsync(CancellationToken cancellationToken = default);
}

public class DatabaseService : IDatabaseService
{
    private readonly IEnvService _envService;
    private readonly ILogger<DatabaseService> _logger;

    public DatabaseService(IEnvService envService, ILogger<DatabaseService> logger)
    {
        _envService = envService;
        _logger = logger;
    }

    public async Task<DatabaseCheckResult> CheckConnectionAsync(CancellationToken cancellationToken = default)
    {
        var result = new DatabaseCheckResult
        {
            Server = _envService.DbServer,
            Database = _envService.DbDatabase
        };

        var stopwatch = Stopwatch.StartNew();

        try
        {
            _logger.LogInformation("🔍 Testing MSSQL connection to {Server}/{Database}...", _envService.DbServer, _envService.DbDatabase);

            using var connection = new SqlConnection(_envService.ConnectionString);
            await connection.OpenAsync(cancellationToken);

            using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT @@VERSION AS Version, GETDATE() AS ServerTime, DB_NAME() AS CurrentDb;";
            cmd.CommandTimeout = 5;

            using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                result.Version = reader["Version"]?.ToString();
            }

            stopwatch.Stop();
            result.IsConnected = true;
            result.LatencyMs = stopwatch.ElapsedMilliseconds;
            result.Message = "Connected successfully to MSSQL database! ✅";
            _logger.LogInformation("✅ MSSQL Connection verified successfully in {Latency}ms", result.LatencyMs);
        }
        catch (SqlException sqlEx)
        {
            stopwatch.Stop();
            result.IsConnected = false;
            result.LatencyMs = stopwatch.ElapsedMilliseconds;
            result.Message = $"MSSQL Error: {sqlEx.Message}";
            _logger.LogWarning("⚠️ MSSQL connection attempt failed: {Message}", sqlEx.Message);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            result.IsConnected = false;
            result.LatencyMs = stopwatch.ElapsedMilliseconds;
            result.Message = ex.Message;
            _logger.LogWarning("⚠️ Database connection error: {Message}", ex.Message);
        }

        return result;
    }
}
