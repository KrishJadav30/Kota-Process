using System.Text.RegularExpressions;

namespace KotaProcess.Api.Services;

public interface IEnvService
{
    int FrontendPort { get; }
    int BackendPort { get; }
    string DbServer { get; }
    string DbUser { get; }
    string DbPassword { get; }
    string DbDatabase { get; }
    string JwtSecret { get; }
    string LogsDirectory { get; }
    string EnvFilePath { get; }
    string ConnectionString { get; }
}

public class EnvService : IEnvService
{
    private readonly ILogger<EnvService> _logger;

    public int FrontendPort { get; private set; } = 5173;
    public int BackendPort { get; private set; } = 5001;
    public string DbServer { get; private set; } = "192.168.1.25";
    public string DbUser { get; private set; } = "sa";
    public string DbPassword { get; private set; } = "Print@123";
    public string DbDatabase { get; private set; } = "WebmisDB";
    public string JwtSecret { get; private set; } = "default-jwt-secret-key";
    public string LogsDirectory { get; private set; } = string.Empty;
    public string EnvFilePath { get; private set; } = string.Empty;

    public string ConnectionString =>
        $"Server={DbServer};Database={DbDatabase};User Id={DbUser};Password={DbPassword};TrustServerCertificate=True;Connect Timeout=5;MultipleActiveResultSets=True;";

    public EnvService(ILogger<EnvService> logger)
    {
        _logger = logger;
        LoadEnvironment();
    }

    public static (int backendPort, string logsDir, string envFile) LoadEarlyConfig()
    {
        var (envPath, logsDir) = FindRootPaths();
        int port = 5001;

        if (File.Exists(envPath))
        {
            var lines = File.ReadAllLines(envPath);
            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith('#'))
                    continue;

                var match = Regex.Match(trimmed, @"^BACKEND_PORT\s*=\s*(.*)$");
                if (match.Success && int.TryParse(match.Groups[1].Value.Trim(), out int parsedPort))
                {
                    port = parsedPort;
                }
            }
        }

        return (port, logsDir, envPath);
    }

    private static (string envPath, string logsDir) FindRootPaths()
    {
        var currentDir = Directory.GetCurrentDirectory();
        var searchDir = new DirectoryInfo(currentDir);

        for (int i = 0; i < 5; i++)
        {
            if (searchDir == null) break;

            var envCandidate = Path.Combine(searchDir.FullName, ".env");
            var logsCandidate = Path.Combine(searchDir.FullName, "logs");

            if (File.Exists(envCandidate))
            {
                if (!Directory.Exists(logsCandidate))
                {
                    Directory.CreateDirectory(logsCandidate);
                }
                return (envCandidate, logsCandidate);
            }

            searchDir = searchDir.Parent;
        }

        var fallbackEnv = Path.GetFullPath(Path.Combine(currentDir, "..", ".env"));
        var fallbackLogs = Path.GetFullPath(Path.Combine(currentDir, "..", "logs"));
        if (!Directory.Exists(fallbackLogs))
        {
            Directory.CreateDirectory(fallbackLogs);
        }

        return (fallbackEnv, fallbackLogs);
    }

    private void LoadEnvironment()
    {
        var (envPath, logsDir) = FindRootPaths();
        EnvFilePath = envPath;
        LogsDirectory = logsDir;

        if (File.Exists(envPath))
        {
            _logger.LogInformation("📁 Reading configuration from: {Path}", envPath);
            var lines = File.ReadAllLines(envPath);
            foreach (var line in lines)
            {
                var trimmed = line.Trim();
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith('#'))
                    continue;

                var eqIndex = trimmed.IndexOf('=');
                if (eqIndex <= 0) continue;

                var key = trimmed.Substring(0, eqIndex).Trim();
                var val = trimmed.Substring(eqIndex + 1).Trim();

                if ((val.StartsWith("\"") && val.EndsWith("\"")) || (val.StartsWith("'") && val.EndsWith("'")))
                {
                    val = val.Substring(1, val.Length - 2);
                }

                switch (key)
                {
                    case "FRONTEND_PORT":
                        if (int.TryParse(val, out int fPort)) FrontendPort = fPort;
                        break;
                    case "BACKEND_PORT":
                        if (int.TryParse(val, out int bPort)) BackendPort = bPort;
                        break;
                    case "DB_SERVER":
                        if (!string.IsNullOrEmpty(val)) DbServer = val;
                        break;
                    case "DB_USER":
                        if (!string.IsNullOrEmpty(val)) DbUser = val;
                        break;
                    case "DB_PASSWORD":
                        if (!string.IsNullOrEmpty(val)) DbPassword = val;
                        break;
                    case "DB_DATABASE":
                        if (!string.IsNullOrEmpty(val)) DbDatabase = val;
                        break;
                    case "JWT_SECRET":
                        if (!string.IsNullOrEmpty(val)) JwtSecret = val;
                        break;
                }
            }

            _logger.LogInformation("⚙️ Environment synchronized: Frontend={FPort}, Backend={BPort}, Server={Server}, DB={DB}",
                FrontendPort, BackendPort, DbServer, DbDatabase);
        }
        else
        {
            _logger.LogWarning("⚠️ .env file not found at {Path}. Using defaults.", envPath);
        }
    }
}
