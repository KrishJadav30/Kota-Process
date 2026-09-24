using System.Text.Json;

namespace KotaProcess.Api.Services;

public class EmployeeProcessHistoryRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string ProcessDate { get; set; } = "";
    public DateTime ExecutedAt { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "Success";
    public long DurationMs { get; set; }
    public int RowsUpdated { get; set; }
    public int RowsInserted { get; set; }
    public int TargetEntry { get; set; } = 4;
    public int EmployeeCount { get; set; }
    public List<string> EmpCodes { get; set; } = new();
    public string TriggerSource { get; set; } = "Employee Wise Process";
    public string Message { get; set; } = "";
    public string? ErrorMessage { get; set; }
}

public interface IEmployeeProcessHistoryService
{
    IEnumerable<EmployeeProcessHistoryRecord> GetTopHistory(int count = 50);
    Task AddRecordAsync(EmployeeProcessHistoryRecord record);
}

public class EmployeeProcessHistoryService : IEmployeeProcessHistoryService
{
    private const int MaxHistoryRecords = 500;
    private readonly string _historyFilePath;
    private readonly ILogger<EmployeeProcessHistoryService> _logger;
    private readonly object _lock = new();
    private List<EmployeeProcessHistoryRecord> _records = new();
    private DateTime _lastLoadedWriteTimeUtc = DateTime.MinValue;

    public EmployeeProcessHistoryService(ILogger<EmployeeProcessHistoryService> logger)
    {
        _logger = logger;
        _historyFilePath = Path.Combine(GetBackendDirectory(), "employee-process-history.json");
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
                    var list = JsonSerializer.Deserialize<List<EmployeeProcessHistoryRecord>>(json);
                    if (list != null)
                    {
                        _records = list.OrderByDescending(r => r.ExecutedAt).Take(MaxHistoryRecords).ToList();
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Failed to load employee process history: {Message}", ex.Message);
            }

            _records = new List<EmployeeProcessHistoryRecord>();
        }
    }

    public IEnumerable<EmployeeProcessHistoryRecord> GetTopHistory(int count = 50)
    {
        EnsureLoaded();
        lock (_lock)
        {
            return _records.Take(count).ToList();
        }
    }

    public async Task AddRecordAsync(EmployeeProcessHistoryRecord record)
    {
        EnsureLoaded();

        lock (_lock)
        {
            _records.Insert(0, record);
            if (_records.Count > MaxHistoryRecords)
            {
                _records = _records.Take(MaxHistoryRecords).ToList();
            }
        }

        try
        {
            string json;
            lock (_lock)
            {
                json = JsonSerializer.Serialize(_records, new JsonSerializerOptions
                {
                    WriteIndented = true
                });
            }

            var dir = Path.GetDirectoryName(_historyFilePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            await File.WriteAllTextAsync(_historyFilePath, json);
            _lastLoadedWriteTimeUtc = File.GetLastWriteTimeUtc(_historyFilePath);
            _logger.LogInformation("Saved employee process record to {Path}", _historyFilePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist employee process history: {Message}", ex.Message);
        }
    }
}
