using System.Globalization;

namespace KotaProcess.Api.Services;

public interface ILogService
{
    string GetCurrentLogFileName();
    string GetLogFileName(DateTime date);
    string GetLogFilePath(DateTime date);
    IEnumerable<string> GetExistingLogFiles();
}

public class LogService : ILogService
{
    private readonly IEnvService _envService;

    public LogService(IEnvService envService)
    {
        _envService = envService;
    }

    /// <summary>
    /// Gets the current active monthly log file name based on current date/time
    /// e.g. September_2026_logs.log
    /// </summary>
    public string GetCurrentLogFileName()
    {
        return GetLogFileName(DateTime.Now);
    }

    /// <summary>
    /// Formats log file name dynamically for any month and any year (e.g. October_2026_logs.log)
    /// </summary>
    public string GetLogFileName(DateTime date)
    {
        var monthName = date.ToString("MMMM", CultureInfo.InvariantCulture);
        var year = date.ToString("yyyy", CultureInfo.InvariantCulture);
        return $"{monthName}_{year}_logs.log";
    }

    /// <summary>
    /// Returns the full file path for the given month and year in the logs directory
    /// </summary>
    public string GetLogFilePath(DateTime date)
    {
        return Path.Combine(_envService.LogsDirectory, GetLogFileName(date));
    }

    /// <summary>
    /// Returns only the log files that actually exist in the logs folder (no future files)
    /// </summary>
    public IEnumerable<string> GetExistingLogFiles()
    {
        if (!Directory.Exists(_envService.LogsDirectory))
        {
            return Enumerable.Empty<string>();
        }

        return Directory.GetFiles(_envService.LogsDirectory, "*_logs.log")
            .Select(Path.GetFileName)
            .Where(name => !string.IsNullOrEmpty(name))!
            .OrderByDescending(name => name);
    }
}
