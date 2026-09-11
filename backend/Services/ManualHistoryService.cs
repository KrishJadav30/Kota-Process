using System.Text.Json;

namespace KotaProcess.Api.Services;

public class ManualHistoryRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ProcessDate { get; set; } = ""; // YYYY-MM-DD or range
    public DateTime ExecutedAt { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "Success"; // "Success" or "Failed"
    public long DurationMs { get; set; }
    public int RowsUpdated { get; set; }
    public string TriggerSource { get; set; } = "Manual Swapping (Entry 2)";
    public string Message { get; set; } = "";
    public string? ErrorMessage { get; set; }
}

public interface IManualHistoryService
{
    IEnumerable<ManualHistoryRecord> GetTopHistory(int count = 50);
    Task AddRecordAsync(ManualHistoryRecord record);
}

public class ManualHistoryService : IManualHistoryService
{
    private const int MaxHistoryRecords = 500;
    private readonly string _historyFilePath;
    private readonly ILogger<ManualHistoryService> _logger;
    private readonly object _lock = new();
    private List<ManualHistoryRecord> _records = new();
    private DateTime _lastLoadedWriteTimeUtc = DateTime.MinValue;

    public ManualHistoryService(ILogger<ManualHistoryService> logger)
    {
        _logger = logger;
        _historyFilePath = Path.Combine(GetBackendDirectory(), "manual-history.json");
        LoadHistory();
    }

    private static string GetBackendDirectory()
    {
        var current = Directory.GetCurrentDirectory();
        if (File.Exists(Path.Combine(current, "KotaProcess.Api.csproj")))
            return current;

        var backendSub = Path.Combine(current, "backend");
        if (Directory.Exists(backendSub) && File.Exists(Path.Combine(backendSub, "KotaProcess.Api.csproj")))
            return backendSub;

        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "KotaProcess.Api.csproj")))
                return dir.FullName;
            if (Directory.Exists(Path.Combine(dir.FullName, "backend")) && File.Exists(Path.Combine(dir.FullName, "backend", "KotaProcess.Api.csproj")))
                return Path.Combine(dir.FullName, "backend");
            dir = dir.Parent;
        }

        return AppContext.BaseDirectory;
    }

    private void EnsureLoaded()
    {
        try
        {
            if (File.Exists(_historyFilePath))
            {
                var writeTime = File.GetLastWriteTimeUtc(_historyFilePath);
                if (writeTime > _lastLoadedWriteTimeUtc)
                {
                    LoadHistory();
                }
            }
        }
        catch
        {
            // fallback gracefully without blocking
        }
    }

    private void LoadHistory()
    {
        lock (_lock)
        {
            try
            {
                if (File.Exists(_historyFilePath))
                {
                    _lastLoadedWriteTimeUtc = File.GetLastWriteTimeUtc(_historyFilePath);
                    var json = File.ReadAllText(_historyFilePath);
                    var list = JsonSerializer.Deserialize<List<ManualHistoryRecord>>(json);
                    if (list != null)
                    {
                        _records = list.OrderByDescending(r => r.ExecutedAt).Take(MaxHistoryRecords).ToList();
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("⚠️ Could not read manual history file: {Message}", ex.Message);
            }

            _records = new List<ManualHistoryRecord>();
        }
    }

    private void SaveHistory()
    {
        try
        {
            var json = JsonSerializer.Serialize(_records, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_historyFilePath, json);
            _lastLoadedWriteTimeUtc = File.GetLastWriteTimeUtc(_historyFilePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "❌ Failed to save manual history file: {Message}", ex.Message);
        }
    }

    public IEnumerable<ManualHistoryRecord> GetTopHistory(int count = 50)
    {
        lock (_lock)
        {
            EnsureLoaded();
            return _records.Take(count).ToList();
        }
    }

    public Task AddRecordAsync(ManualHistoryRecord record)
    {
        lock (_lock)
        {
            _records.Insert(0, record);

            while (_records.Count > MaxHistoryRecords)
            {
                _records.RemoveAt(_records.Count - 1);
            }

            SaveHistory();
        }

        return Task.CompletedTask;
    }
}
