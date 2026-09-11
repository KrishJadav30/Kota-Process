using System.Text.Json;

namespace KotaProcess.Api.Services;

public class ProcessHistoryRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ProcessDate { get; set; } = ""; // YYYY-MM-DD
    public DateTime ExecutedAt { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "Success"; // "Success" or "Failed"
    public long DurationMs { get; set; }
    public int RowsUpdated { get; set; }
    public int RowsInserted { get; set; }
    public string TriggerSource { get; set; } = "Autonomous Daily Schedule";
    public string Message { get; set; } = "";
    public string? ErrorMessage { get; set; }
}

public interface IProcessHistoryService
{
    IEnumerable<ProcessHistoryRecord> GetTopHistory(int count = 50);
    Task AddRecordAsync(ProcessHistoryRecord record);
}

public class ProcessHistoryService : IProcessHistoryService
{
    private const int MaxHistoryRecords = 500;
    private readonly string _historyFilePath;
    private readonly ILogger<ProcessHistoryService> _logger;
    private readonly object _lock = new();
    private List<ProcessHistoryRecord> _records = new();
    private DateTime _lastLoadedWriteTimeUtc = DateTime.MinValue;

    public ProcessHistoryService(ILogger<ProcessHistoryService> logger)
    {
        _logger = logger;
        _historyFilePath = Path.Combine(GetBackendDirectory(), "process-history.json");
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
                    var list = JsonSerializer.Deserialize<List<ProcessHistoryRecord>>(json);
                    if (list != null)
                    {
                        _records = list.OrderByDescending(r => r.ExecutedAt).Take(MaxHistoryRecords).ToList();
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("⚠️ Could not read process history file: {Message}", ex.Message);
            }

            _records = new List<ProcessHistoryRecord>();
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
            _logger.LogError(ex, "❌ Failed to save process history file: {Message}", ex.Message);
        }
    }

    public IEnumerable<ProcessHistoryRecord> GetTopHistory(int count = 50)
    {
        lock (_lock)
        {
            EnsureLoaded();
            return _records.Take(count).ToList();
        }
    }

    public Task AddRecordAsync(ProcessHistoryRecord record)
    {
        lock (_lock)
        {
            _records.Insert(0, record);

            // Maintain maximum 500 records: when 501st record comes in, remove the oldest (FIFO)
            while (_records.Count > MaxHistoryRecords)
            {
                _records.RemoveAt(_records.Count - 1);
            }

            SaveHistory();
        }

        return Task.CompletedTask;
    }
}
