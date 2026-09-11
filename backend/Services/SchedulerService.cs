using System.Diagnostics;
using System.Text.Json;

namespace KotaProcess.Api.Services;

public class SchedulerConfig
{
    public string DailyTime { get; set; } = "02:00"; // 24-hour HH:mm
    public bool IsEnabled { get; set; } = true;
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
}

public class SchedulerStatusDto
{
    public string DailyTime { get; set; } = "02:00";
    public bool IsEnabled { get; set; } = true;
    public DateTime? NextRunTime { get; set; }
    public DateTime? LastRunTime { get; set; }
    public string LastRunStatus { get; set; } = "Ready";
    public string LastRunMessage { get; set; } = "Standing by for daily scheduled execution.";
    public long LastRunDurationMs { get; set; }
    public bool IsExecuting { get; set; }
    public string WorkerMode { get; set; } = "Autonomous 24/7 Background Service";
}

public interface ISchedulerService
{
    SchedulerStatusDto GetStatus();
    Task<SchedulerStatusDto> UpdateConfigAsync(string dailyTime, bool isEnabled);
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
    private DateTime? _lastRunTime;
    private string _lastRunStatus = "Ready";
    private string _lastRunMessage = "Scheduler background worker is active.";
    private long _lastRunDurationMs = 0;
    private bool _isExecuting = false;

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

        _configFilePath = Path.Combine(AppContext.BaseDirectory, "scheduler-config.json");
        LoadConfig();
        CalculateNextRun();
    }

    private void LoadConfig()
    {
        try
        {
            if (File.Exists(_configFilePath))
            {
                var json = File.ReadAllText(_configFilePath);
                var loaded = JsonSerializer.Deserialize<SchedulerConfig>(json);
                if (loaded != null && TimeSpan.TryParse(loaded.DailyTime, out _))
                {
                    _config = loaded;
                    _logger.LogInformation("🕒 Loaded persistent scheduler config: DailyTime={Time}, Enabled={Enabled}", _config.DailyTime, _config.IsEnabled);
                    return;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("⚠️ Could not load scheduler config file, using defaults: {Message}", ex.Message);
        }

        _config = new SchedulerConfig { DailyTime = "02:00", IsEnabled = true };
        SaveConfig();
    }

    private void SaveConfig()
    {
        try
        {
            _config.LastUpdated = DateTime.UtcNow;
            var json = JsonSerializer.Serialize(_config, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_configFilePath, json);
            _logger.LogInformation("💾 Saved persistent scheduler config to disk: DailyTime={Time}", _config.DailyTime);
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
            DailyTime = _config.DailyTime,
            IsEnabled = _config.IsEnabled,
            NextRunTime = _nextRunTime,
            LastRunTime = _lastRunTime,
            LastRunStatus = _lastRunStatus,
            LastRunMessage = _lastRunMessage,
            LastRunDurationMs = _lastRunDurationMs,
            IsExecuting = _isExecuting
        };
    }

    public Task<SchedulerStatusDto> UpdateConfigAsync(string dailyTime, bool isEnabled)
    {
        if (TimeSpan.TryParse(dailyTime, out _))
        {
            _config.DailyTime = dailyTime;
        }
        _config.IsEnabled = isEnabled;
        SaveConfig();
        CalculateNextRun();

        _logger.LogInformation("⚙️ Scheduler time updated by user: DailyTime={Time}, NextRun={NextRun}", _config.DailyTime, _nextRunTime);
        return Task.FromResult(GetStatus());
    }

    public async Task<SchedulerStatusDto> TriggerRunNowAsync()
    {
        _logger.LogInformation("👉 Manual execution triggered via API.");
        await ExecuteTaskAsync("Manual Trigger (On-Demand)");
        return GetStatus();
    }

    private void CalculateNextRun()
    {
        if (!_config.IsEnabled || !TimeSpan.TryParse(_config.DailyTime, out var timeOfDay))
        {
            _nextRunTime = null;
            return;
        }

        var now = DateTime.Now;
        var scheduledToday = now.Date.Add(timeOfDay);

        if (now < scheduledToday)
        {
            _nextRunTime = scheduledToday;
        }
        else
        {
            _nextRunTime = scheduledToday.AddDays(1);
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("🕒 Autonomous 24/7 Scheduler Service started. Daily Run Time: {Time}", _config.DailyTime);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                CalculateNextRun();

                if (_nextRunTime.HasValue)
                {
                    while (DateTime.Now < _nextRunTime.Value && !stoppingToken.IsCancellationRequested)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
                    }

                    if (!stoppingToken.IsCancellationRequested && _config.IsEnabled)
                    {
                        _logger.LogInformation("⏰ Daily schedule reached ({Time})! Executing automated process in background...", _config.DailyTime);
                        await ExecuteTaskAsync("Autonomous Daily Schedule");
                    }
                }
                else
                {
                    await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "⚠️ Error in scheduler background loop: {Message}", ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }

        _logger.LogInformation("⏹️ Scheduler background worker stopped.");
    }

    private async Task ExecuteTaskAsync(string triggerSource)
    {
        if (!await _executionLock.WaitAsync(TimeSpan.FromSeconds(2)))
        {
            _logger.LogWarning("⚠️ Task skipped: Another execution is already active.");
            return;
        }

        _isExecuting = true;
        var stopwatch = Stopwatch.StartNew();
        var startTime = DateTime.UtcNow;

        try
        {
            var logFile = _logService.GetCurrentLogFileName();

            _logger.LogInformation("================================================================================");
            _logger.LogInformation("🚀 [KOTA PROCESS] Daily process execution initiated. Trigger: {Trigger}", triggerSource);
            _logger.LogInformation("📅 [KOTA PROCESS] Timestamp: {Time:yyyy-MM-dd HH:mm:ss} UTC | Destination: {LogFile}", startTime, logFile);
            _logger.LogInformation("🎯 [KOTA PROCESS] Target: Server={Server} | Database={Database}", _envService.DbServer, _envService.DbDatabase);

            using (var scope = _serviceProvider.CreateScope())
            {
                var dbService = scope.ServiceProvider.GetRequiredService<IDatabaseService>();
                var dbCheck = await dbService.CheckConnectionAsync();

                if (dbCheck.IsConnected)
                {
                    _logger.LogInformation("✅ [KOTA PROCESS] Database connection validated ({Latency}ms).", dbCheck.LatencyMs);
                }
                else
                {
                    _logger.LogWarning("⚠️ [KOTA PROCESS] Database notice: {Message}", dbCheck.Message);
                }

                // Workload step (Placeholder ready for user query)
                await Task.Delay(1000);
                _logger.LogInformation("✅ [KOTA PROCESS] Process cycle completed successfully.");
            }

            stopwatch.Stop();
            _lastRunDurationMs = stopwatch.ElapsedMilliseconds;
            _lastRunTime = DateTime.UtcNow;
            _lastRunStatus = "Success";
            _lastRunMessage = $"Completed successfully in {_lastRunDurationMs}ms (Trigger: {triggerSource}).";

            _logger.LogInformation("✨ [KOTA PROCESS] Task finished in {Duration}ms.", _lastRunDurationMs);
            _logger.LogInformation("================================================================================");
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _lastRunDurationMs = stopwatch.ElapsedMilliseconds;
            _lastRunTime = DateTime.UtcNow;
            _lastRunStatus = "Failed";
            _lastRunMessage = $"Execution failed: {ex.Message}";

            _logger.LogError(ex, "❌ [KOTA PROCESS] Execution failed: {Message}", ex.Message);
            _logger.LogInformation("================================================================================");
        }
        finally
        {
            _isExecuting = false;
            CalculateNextRun();
            _executionLock.Release();
        }
    }
}
