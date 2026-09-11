using System.Globalization;
using KotaProcess.Api.Services;
using Serilog;

// Load early configuration from root .env
var (backendPort, logsDir, envPath) = EnvService.LoadEarlyConfig();

// Ensure root logs/ directory exists
if (!Directory.Exists(logsDir))
{
    Directory.CreateDirectory(logsDir);
}

// Configure Serilog with dynamic monthly file rotation for any month and any year
// Format: {MonthName}_{Year}_logs.log (e.g. September_2026_logs.log)
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
    .WriteTo.Map(
        keySelector: evt => evt.Timestamp.ToString("MMMM_yyyy", CultureInfo.InvariantCulture) + "_logs",
        configure: (name, wt) => wt.File(
            path: Path.Combine(logsDir, $"{name}.log"),
            shared: true,
            outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
    )
    .CreateLogger();

try
{
    var currentMonthLog = DateTime.Now.ToString("MMMM_yyyy", CultureInfo.InvariantCulture) + "_logs.log";

    Log.Information("🚀 Starting KOTA Process Backend Web API...");
    Log.Information("📁 Root .env detected at: {EnvPath}", envPath);
    Log.Information("🌐 Backend Port configured to: {Port}", backendPort);
    Log.Information("📝 Active monthly log file: {LogsDir}/{LogFile}", logsDir, currentMonthLog);

    var builder = WebApplication.CreateBuilder(args);

    // Serilog logger
    builder.Host.UseSerilog();

    // Bind Kestrel explicitly to BACKEND_PORT from .env
    builder.WebHost.UseUrls($"http://*:{backendPort}");

    // Add services
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowAll", policy =>
        {
            policy.AllowAnyOrigin()
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
    });

    // Register Core Services
    builder.Services.AddSingleton<IEnvService, EnvService>();
    builder.Services.AddSingleton<ILogService, LogService>();
    builder.Services.AddScoped<IDatabaseService, DatabaseService>();

    var app = builder.Build();

    app.UseCors("AllowAll");

    // 🌟 Clean API Endpoints:

    // 1. Overall Status Endpoint (Includes current month log file)
    app.MapGet("/api/status", (IEnvService env, ILogService logService) => Results.Ok(new
    {
        status = "Ready ✅",
        frontendPort = env.FrontendPort,
        backendPort = env.BackendPort,
        dbServer = env.DbServer,
        dbDatabase = env.DbDatabase,
        logsDir = env.LogsDirectory,
        currentLogFile = logService.GetCurrentLogFileName(),
        timestamp = DateTime.UtcNow
    }));

    // 2. Database Connection Check Endpoint
    app.MapGet("/api/db-check", async (IDatabaseService dbService) =>
    {
        var result = await dbService.CheckConnectionAsync();
        return Results.Ok(result);
    });

    // 3. Existing Log Files Endpoint (Only files that actually exist, no future files)
    app.MapGet("/api/logs/files", (ILogService logService) =>
    {
        return Results.Ok(new
        {
            currentLogFile = logService.GetCurrentLogFileName(),
            existingFiles = logService.GetExistingLogFiles().ToList()
        });
    });

    // 4. Root Welcome Check
    app.MapGet("/", () => Results.Ok(new
    {
        message = "🚀 KOTA Process Web API is running!",
        status = "Ready for instructions ✅",
        timestamp = DateTime.UtcNow
    }));

    Log.Information("✅ KOTA Process Backend Web API is Ready & Listening on http://localhost:{Port}", backendPort);

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "❌ KOTA Process Backend encountered a fatal error during startup.");
}
finally
{
    Log.CloseAndFlush();
}
