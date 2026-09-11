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

    // Register Autonomous 24/7 Scheduler Service (Runs independently in background)
    builder.Services.AddSingleton<ISchedulerService, SchedulerService>();
    builder.Services.AddHostedService(sp => (SchedulerService)sp.GetRequiredService<ISchedulerService>());

    var app = builder.Build();

    app.UseCors("AllowAll");

    // Clean API Endpoints
    app.MapGet("/", () => Results.Ok(new
    {
        message = "KOTA Process Web API",
        status = "Healthy",
        timestamp = DateTime.UtcNow
    }));

    app.MapGet("/api/health", () => Results.Ok(new
    {
        status = "Healthy",
        timestamp = DateTime.UtcNow
    }));

    // Scheduler Endpoints
    app.MapGet("/api/scheduler/config", (ISchedulerService scheduler) => Results.Ok(scheduler.GetStatus()));

    app.MapPost("/api/scheduler/config", async (ISchedulerService scheduler, UpdateSchedulerRequest req) =>
    {
        var result = await scheduler.UpdateConfigAsync(req.DailyTime, req.IsEnabled ?? true);
        return Results.Ok(result);
    });

    app.MapPost("/api/scheduler/run-now", async (ISchedulerService scheduler) =>
    {
        var result = await scheduler.TriggerRunNowAsync();
        return Results.Ok(result);
    });

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

public record UpdateSchedulerRequest(string DailyTime, bool? IsEnabled);

