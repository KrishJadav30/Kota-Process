using System.Diagnostics;
using System.Text.Json;

namespace KotaProcess.Api.Services;

public class ScheduledTimeSlot
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Label { get; set; } = "General Shift";
    public string Time { get; set; } = "08:00"; // HH:mm 24-hr format
    public bool IsEnabled { get; set; } = true;
    public bool IsNightShift { get; set; } = false; // True = processes 2 calendar dates: Today & Tomorrow
}

public class SchedulerConfig
{
    public List<ScheduledTimeSlot> Schedules { get; set; } = new();
    public string DailyTime { get; set; } = "22:00"; // Legacy fallback
    public bool IsEnabled { get; set; } = true;
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
}

public class SchedulerStatusDto
{
    public List<ScheduledTimeSlot> Schedules { get; set; } = new();
    public string DailyTime { get; set; } = "22:00";
    public bool IsEnabled { get; set; } = true;
    public DateTime? NextRunTime { get; set; }
    public string? NextRunLabel { get; set; }
    public bool? NextRunIsNightShift { get; set; }
    public DateTime? LastRunTime { get; set; }
    public string LastRunStatus { get; set; } = "Ready";
    public string LastRunMessage { get; set; } = "Standing by for scheduled executions.";
    public long LastRunDurationMs { get; set; }
    public bool IsExecuting { get; set; }
    public string WorkerMode { get; set; } = "Autonomous 24/7 Multi-Shift Background Service";
}

public interface ISchedulerService
{
    SchedulerStatusDto GetStatus();
    Task<SchedulerStatusDto> UpdateConfigAsync(string? dailyTime, bool? isEnabled, List<ScheduledTimeSlot>? schedules = null);
    Task<SchedulerStatusDto> TriggerRunNowAsync();
}

public class SchedulerService : BackgroundService, ISchedulerService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly IEnvService _envService;
    private readonly ILogService _logService;
    private readonly ILogger<SchedulerService> _logger;
    private readonly string _configFilePath;

    private readonly SemaphoreSlim _executionLock = new(1, 1);
    private SchedulerConfig _config = new();
    private DateTime? _nextRunTime;
    private string? _nextRunLabel;
    private bool? _nextRunIsNightShift;
    private DateTime? _lastRunTime;
    private string _lastRunStatus = "Ready";
    private string _lastRunMessage = "Scheduler background worker is active.";
    private long _lastRunDurationMs = 0;
    private bool _isExecuting = false;

    private readonly HashSet<string> _executedSlotsToday = new();
    private string _currentDateStr = "";

    public SchedulerService(
        IServiceProvider serviceProvider,
        IEnvService envService,
        ILogService logService,
        ILogger<SchedulerService> logger)
    {
        _serviceProvider = serviceProvider;
        _envService = envService;
        _logService = logService;
        _logger = logger;

        _configFilePath = Path.Combine(GetBackendDirectory(), "scheduler-config.json");
        LoadConfig();
        CalculateNextRun();
    }

    private static List<ScheduledTimeSlot> GetDefaultSchedules() => new()
    {
        new ScheduledTimeSlot
        {
            Id = "shift-1",
            Label = "Night Shift",
            Time = "06:00", // 06:00 AM (runs for Yesterday & Today)
            IsEnabled = true,
            IsNightShift = true
        },
        new ScheduledTimeSlot
        {
            Id = "shift-2",
            Label = "Morning Shift",
            Time = "12:00", // 12:00 PM (runs for Today)
            IsEnabled = true,
            IsNightShift = false
        },
        new ScheduledTimeSlot
        {
            Id = "shift-3",
            Label = "Evening Shift",
            Time = "18:00", // 06:00 PM (runs for Today)
            IsEnabled = true,
            IsNightShift = false
        },
        new ScheduledTimeSlot
        {
            Id = "shift-4",
            Label = "Midnight Shift",
            Time = "00:00", // 12:00 AM (runs for Yesterday & Today)
            IsEnabled = true,
            IsNightShift = true
        }
    };

    private static string GetBackendDirectory()
    {
        var current = Directory.GetCurrentDirectory();
        if (File.Exists(Path.Combine(current, "KotaProcess.Api.csproj")))
            return current;

        var backendSub = Path.Combine(current, "backend");
        if (Directory.Exists(backendSub) && File.Exists(Path.Combine(backendSub, "KotaProcess.Api.csproj")))
            return backendSub;

        var dir = new DirectoryInfo(current);
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

    private void LoadConfig()
    {
        try
        {
            if (File.Exists(_configFilePath))
            {
                var json = File.ReadAllText(_configFilePath);
                var loaded = JsonSerializer.Deserialize<SchedulerConfig>(json);
                if (loaded != null)
                {
                    _config = loaded;
                    if (_config.Schedules == null || _config.Schedules.Count == 0)
                    {
                        _config.Schedules = GetDefaultSchedules();
                        SaveConfig();
                    }
                    else if (_config.Schedules.Count < 4)
                    {
                        // Auto-upgrade to the 4 shifts with 6-hour gap
                        var defaults = GetDefaultSchedules();
                        var merged = new List<ScheduledTimeSlot>();

                        foreach (var def in defaults)
                        {
                            var existing = _config.Schedules.FirstOrDefault(s => s.Id == def.Id || s.Label.Equals(def.Label, StringComparison.OrdinalIgnoreCase));
                            if (existing != null)
                            {
                                def.Time = existing.Time;
                                def.IsEnabled = existing.IsEnabled;
                                def.IsNightShift = existing.IsNightShift;
                            }
                            merged.Add(def);
                        }
                        _config.Schedules = merged;
                        SaveConfig();
                    }
                    _logger.LogInformation("🕒 Loaded persistent scheduler config with {Count} schedules.", _config.Schedules.Count);
                    return;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("⚠️ Could not load scheduler config file, using defaults: {Message}", ex.Message);
        }

        _config = new SchedulerConfig
        {
            DailyTime = "06:00",
            IsEnabled = true,
            Schedules = GetDefaultSchedules()
        };
        SaveConfig();
    }

    private void SaveConfig()
    {
        try
        {
            _config.LastUpdated = DateTime.UtcNow;
            var json = JsonSerializer.Serialize(_config, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_configFilePath, json);
            _logger.LogInformation("💾 Saved persistent scheduler config to disk: {Count} schedules active.", _config.Schedules.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "❌ Failed to save scheduler configuration to disk: {Message}", ex.Message);
        }
    }

    public SchedulerStatusDto GetStatus()
    {
        return new SchedulerStatusDto
        {
            Schedules = _config.Schedules ?? new(),
            DailyTime = _config.DailyTime,
            IsEnabled = _config.IsEnabled,
            NextRunTime = _nextRunTime,
            NextRunLabel = _nextRunLabel,
            NextRunIsNightShift = _nextRunIsNightShift,
            LastRunTime = _lastRunTime,
            LastRunStatus = _lastRunStatus,
            LastRunMessage = _lastRunMessage,
            LastRunDurationMs = _lastRunDurationMs,
            IsExecuting = _isExecuting
        };
    }

    public Task<SchedulerStatusDto> UpdateConfigAsync(string? dailyTime, bool? isEnabled, List<ScheduledTimeSlot>? schedules = null)
    {
        if (schedules != null && schedules.Count > 0)
        {
            var normalized = new List<ScheduledTimeSlot>();

            var s1 = schedules.FirstOrDefault(s => s.Id == "shift-1" || s.Label.StartsWith("Night", StringComparison.OrdinalIgnoreCase))
                     ?? new ScheduledTimeSlot { Id = "shift-1", Label = "Night Shift", Time = "06:00", IsNightShift = true, IsEnabled = true };
            s1.Id = "shift-1";
            s1.Label = "Night Shift";
            normalized.Add(s1);

            var s2 = schedules.FirstOrDefault(s => s.Id == "shift-2" || s.Label.StartsWith("Morning", StringComparison.OrdinalIgnoreCase))
                     ?? new ScheduledTimeSlot { Id = "shift-2", Label = "Morning Shift", Time = "12:00", IsNightShift = false, IsEnabled = true };
            s2.Id = "shift-2";
            s2.Label = "Morning Shift";
            normalized.Add(s2);

            var s3 = schedules.FirstOrDefault(s => s.Id == "shift-3" || s.Label.StartsWith("Evening", StringComparison.OrdinalIgnoreCase))
                     ?? new ScheduledTimeSlot { Id = "shift-3", Label = "Evening Shift", Time = "18:00", IsNightShift = false, IsEnabled = true };
            s3.Id = "shift-3";
            s3.Label = "Evening Shift";
            normalized.Add(s3);

            var s4 = schedules.FirstOrDefault(s => s.Id == "shift-4" || s.Label.StartsWith("Midnight", StringComparison.OrdinalIgnoreCase))
                     ?? new ScheduledTimeSlot { Id = "shift-4", Label = "Midnight Shift", Time = "00:00", IsNightShift = true, IsEnabled = true };
            s4.Id = "shift-4";
            s4.Label = "Midnight Shift";
            normalized.Add(s4);

            _config.Schedules = normalized;
            MarkPastSlotsForToday();
        }
        else if (!string.IsNullOrEmpty(dailyTime) && TimeSpan.TryParse(dailyTime, out _))
        {
            _config.DailyTime = dailyTime;
            if (_config.Schedules.Count >= 1)
            {
                _config.Schedules[0].Time = dailyTime;
            }
            MarkPastSlotsForToday();
        }

        if (isEnabled.HasValue)
        {
            _config.IsEnabled = isEnabled.Value;
        }

        SaveConfig();
        CalculateNextRun();

        _logger.LogInformation("⚙️ Scheduler updated: SlotsCount={Count}, NextRun={NextRun} ({Label})", 
            _config.Schedules.Count, _nextRunTime, _nextRunLabel);
        return Task.FromResult(GetStatus());
    }

    private void MarkPastSlotsForToday()
    {
        var now = DateTime.Now;
        var todayStr = now.ToString("yyyy-MM-dd");
        _currentDateStr = todayStr;

        if (_config.Schedules == null) return;

        foreach (var slot in _config.Schedules)
        {
            if (TimeSpan.TryParse(slot.Time, out var timeOfDay))
            {
                var scheduledToday = now.Date.Add(timeOfDay);
                if (now >= scheduledToday)
                {
                    _executedSlotsToday.Add($"{todayStr}_{slot.Id}");
                }
            }
        }
    }

    public async Task<SchedulerStatusDto> TriggerRunNowAsync()
    {
        _logger.LogInformation("👉 Manual execution triggered via API.");
        await ExecuteDateRangeTaskAsync(DateTime.Today, DateTime.Today, "Manual Trigger (On-Demand)");
        return GetStatus();
    }

    private void CalculateNextRun()
    {
        if (!_config.IsEnabled || _config.Schedules == null || _config.Schedules.Count == 0)
        {
            _nextRunTime = null;
            _nextRunLabel = null;
            _nextRunIsNightShift = null;
            return;
        }

        var now = DateTime.Now;
        var todayStr = now.ToString("yyyy-MM-dd");
        if (_currentDateStr != todayStr)
        {
            _executedSlotsToday.Clear();
            _currentDateStr = todayStr;
        }

        DateTime? earliestTime = null;
        ScheduledTimeSlot? earliestSlot = null;

        foreach (var slot in _config.Schedules.Where(s => s.IsEnabled))
        {
            if (!TimeSpan.TryParse(slot.Time, out var timeOfDay))
                continue;

            var scheduledToday = now.Date.Add(timeOfDay);
            var slotKey = $"{todayStr}_{slot.Id}";

            DateTime candidateTime;
            if (now < scheduledToday && !_executedSlotsToday.Contains(slotKey))
            {
                candidateTime = scheduledToday;
            }
            else
            {
                candidateTime = scheduledToday.AddDays(1);
            }

            if (earliestTime == null || candidateTime < earliestTime.Value)
            {
                earliestTime = candidateTime;
                earliestSlot = slot;
            }
        }

        _nextRunTime = earliestTime;
        _nextRunLabel = earliestSlot?.Label;
        _nextRunIsNightShift = earliestSlot?.IsNightShift;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("🕒 Autonomous 24/7 Multi-Shift Scheduler Service started with {Count} schedules.", _config.Schedules.Count);

        // On service startup, mark all shifts whose scheduled time has already passed today as completed
        // This strictly prevents unwanted retroactive executions when starting or restarting the service
        MarkPastSlotsForToday();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_config.IsEnabled && _config.Schedules != null && _config.Schedules.Count > 0)
                {
                    var now = DateTime.Now;
                    var todayStr = now.ToString("yyyy-MM-dd");
                    if (_currentDateStr != todayStr)
                    {
                        _executedSlotsToday.Clear();
                        _currentDateStr = todayStr;
                    }

                    foreach (var slot in _config.Schedules.Where(s => s.IsEnabled).ToList())
                    {
                        if (!TimeSpan.TryParse(slot.Time, out var timeOfDay))
                            continue;

                        var scheduledToday = now.Date.Add(timeOfDay);
                        var slotKey = $"{todayStr}_{slot.Id}";

                        if (now >= scheduledToday && !_executedSlotsToday.Contains(slotKey))
                        {
                            var delayMinutes = (now - scheduledToday).TotalMinutes;
                            // If the scheduled time is in the past by more than 2 minutes, mark as passed and DO NOT run retroactively
                            if (delayMinutes > 2)
                            {
                                _logger.LogInformation("⏭️ Shift {Label} ({Time}) was scheduled in the past today ({Delay:F1}m ago). Skipping retroactive run.",
                                    slot.Label, slot.Time, delayMinutes);
                                _executedSlotsToday.Add(slotKey);
                                continue;
                            }

                            var actualTime = now.ToString("hh:mm tt");
                            DateTime fromDate;
                            DateTime toDate;
                            string triggerText;

                            if (slot.IsNightShift)
                            {
                                // Night Shift covers punches spanning Yesterday night to Today morning (2 calendar days)
                                fromDate = DateTime.Today.AddDays(-1);
                                toDate = DateTime.Today;
                                triggerText = $"Autonomous Daily Schedule - {slot.Label} (Yesterday & Today: {fromDate:yyyy-MM-dd} to {toDate:yyyy-MM-dd}, Ran at {actualTime})";
                            }
                            else
                            {
                                // Day Shift covers single day (Today only)
                                fromDate = DateTime.Today;
                                toDate = DateTime.Today;
                                triggerText = $"Autonomous Daily Schedule - {slot.Label} (Ran at {actualTime})";
                            }

                            _logger.LogInformation("⏰ Multi-Shift execution triggering now: {Trigger}", triggerText);
                            _executedSlotsToday.Add(slotKey);
                            await ExecuteDateRangeTaskAsync(fromDate, toDate, triggerText);
                        }
                    }

                    CalculateNextRun();
                }
                else
                {
                    _nextRunTime = null;
                    _nextRunLabel = null;
                    _nextRunIsNightShift = null;
                }

                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "⚠️ Error in scheduler background loop: {Message}", ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
            }
        }

        _logger.LogInformation("⏹️ Scheduler background worker stopped.");
    }

    private async Task ExecuteDateRangeTaskAsync(DateTime fromDate, DateTime toDate, string triggerSource)
    {
        if (!await _executionLock.WaitAsync(TimeSpan.FromSeconds(2)))
        {
            _logger.LogWarning("⚠️ Task skipped: Another execution is already active.");
            return;
        }

        _isExecuting = true;

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var attendanceService = scope.ServiceProvider.GetRequiredService<IAttendanceProcessService>();

            var record = await attendanceService.ExecuteForDateRangeAsync(fromDate, toDate, triggerSource);

            _lastRunDurationMs = record.DurationMs;
            _lastRunTime = record.ExecutedAt;
            _lastRunStatus = record.Status;
            _lastRunMessage = record.Message;
        }
        catch (Exception ex)
        {
            _lastRunStatus = "Failed";
            _lastRunMessage = ex.Message;
            _logger.LogError(ex, "❌ Scheduler error invoking attendance service: {Message}", ex.Message);
        }
        finally
        {
            _isExecuting = false;
            CalculateNextRun();
            _executionLock.Release();
        }
    }
}
