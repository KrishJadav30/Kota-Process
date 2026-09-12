using System.Diagnostics;
using System.Globalization;
using KotaProcess.Api.Services;
using Microsoft.Data.SqlClient;
using Serilog;
using Serilog.Events;

// Load early configuration from root .env
var (backendPort, logsDir, envPath) = EnvService.LoadEarlyConfig();

// Ensure root logs/ directory exists
if (!Directory.Exists(logsDir))
{
    Directory.CreateDirectory(logsDir);
}

// Configure Serilog with clean level overrides to eliminate framework noise
// and keep only meaningful business events and clear errors.
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    // Suppress verbose ASP.NET Core & System framework internal messages
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore.Hosting.Diagnostics", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore.Routing", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore.Cors", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore.Mvc", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.Hosting.Lifetime", LogEventLevel.Information)
    .MinimumLevel.Override("System", LogEventLevel.Warning)
    .MinimumLevel.Override("System.Net.Http", LogEventLevel.Warning)
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

    // Register Attendance Processing & Execution History Services
    builder.Services.AddSingleton<IProcessHistoryService, ProcessHistoryService>();
    builder.Services.AddScoped<IAttendanceProcessService, AttendanceProcessService>();

    // Register 100% Manual Swapping (Entry 2) Services
    builder.Services.AddSingleton<IManualHistoryService, ManualHistoryService>();
    builder.Services.AddScoped<IManualSwappingService, ManualSwappingService>();

    // Register User Authentication & Security Service
    builder.Services.AddSingleton<IAuthService, AuthService>();

    // Register Autonomous 24/7 Scheduler Service (Runs independently in background)
    builder.Services.AddSingleton<ISchedulerService, SchedulerService>();
    builder.Services.AddHostedService(sp => (SchedulerService)sp.GetRequiredService<ISchedulerService>());

    var app = builder.Build();

    app.UseCors("AllowAll");

    // Clean HTTP Request and Global Error Handling Middleware
    app.Use(async (context, next) =>
    {
        var sw = Stopwatch.StartNew();
        var path = context.Request.Path.Value ?? "";
        var method = context.Request.Method;
        var isApi = path.StartsWith("/api", StringComparison.OrdinalIgnoreCase);

        // Force no-cache on all /api endpoints
        if (isApi)
        {
            context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate, max-age=0";
            context.Response.Headers.Pragma = "no-cache";
            context.Response.Headers.Expires = "-1";
        }

        try
        {
            await next();
            sw.Stop();

            var statusCode = context.Response.StatusCode;

            // Only log if it's an error (>= 400) OR an operational action (POST/PUT/DELETE)
            // Routine background polling like GET /api/scheduler/config, GET /api/scheduler/history stay silent and clean
            if (statusCode >= 400)
            {
                var clientIp = context.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
                if (statusCode == 401)
                {
                    Log.Warning("⚠️ [HTTP 401] Unauthorized access: {Method} {Path} from {Ip} ({Duration}ms)",
                        method, path, clientIp, sw.ElapsedMilliseconds);
                }
                else if (statusCode == 404)
                {
                    Log.Warning("⚠️ [HTTP 404] Endpoint not found: {Method} {Path} ({Duration}ms)",
                        method, path, sw.ElapsedMilliseconds);
                }
                else
                {
                    Log.Warning("⚠️ [HTTP {StatusCode}] {Method} {Path} returned warning from {Ip} ({Duration}ms)",
                        statusCode, method, path, clientIp, sw.ElapsedMilliseconds);
                }
            }
            else if (isApi && method != "GET")
            {
                // Clean single-line logging for operational actions
                Log.Information("🌐 [API] {Method} {Path} -> {StatusCode} ({Duration}ms)",
                    method, path, statusCode, sw.ElapsedMilliseconds);
            }
        }
        catch (BadHttpRequestException badEx)
        {
            sw.Stop();
            var clientIp = context.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
            Log.Warning("⚠️ [BAD REQUEST] {Method} {Path} from {Ip}:\n   💡 Reason: {Message}",
                method, path, clientIp, badEx.Message);

            if (!context.Response.HasStarted)
            {
                context.Response.StatusCode = 400;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(new { success = false, message = "Invalid JSON or request payload." });
            }
        }
        catch (SqlException sqlEx)
        {
            sw.Stop();
            Log.Error("❌ [DATABASE ERROR] SQL Error #{Number} during {Method} {Path}:\n   💡 Reason: {Message}\n   📍 Server: {Server}",
                sqlEx.Number, method, path, sqlEx.Message, sqlEx.Server);

            if (!context.Response.HasStarted)
            {
                context.Response.StatusCode = 500;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(new { success = false, message = $"Database operation failed: {sqlEx.Message}" });
            }
        }
        catch (Exception ex)
        {
            sw.Stop();
            var topFrame = ex.StackTrace?.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.Trim() ?? "Unknown";
            Log.Error("❌ [SERVER ERROR] Unhandled exception during {Method} {Path}:\n   💡 Reason: {Message}\n   📍 Type: {Type}\n   🔍 Code: {Frame}",
                method, path, ex.Message, ex.GetType().Name, topFrame);

            if (!context.Response.HasStarted)
            {
                context.Response.StatusCode = 500;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(new { success = false, message = $"Internal server error: {ex.Message}" });
            }
        }
    });

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
        var result = await scheduler.UpdateConfigAsync(req.DailyTime, req.IsEnabled, req.Schedules, req.WeeklySchedule);
        return Results.Ok(result);
    });

    // On-Demand Weekly Run Trigger Endpoint (8 Days Processing: Today minus 7 days to Today)
    app.MapPost("/api/scheduler/run-weekly", async (ISchedulerService scheduler, RunWeeklyRequest? req) =>
    {
        var result = await scheduler.TriggerWeeklyRunNowAsync(req?.DayOfWeek);
        return Results.Ok(result);
    });

    // Top 50 Execution History Logs Endpoint
    app.MapGet("/api/scheduler/history", (IProcessHistoryService history) => Results.Ok(history.GetTopHistory(50)));

    // Manual Execution Trigger Endpoint (Supports FromDate and ToDate range, with fallback to TargetDate / Today)
    app.MapPost("/api/scheduler/run-now", async (IAttendanceProcessService processService, RunNowRequest? req) =>
    {
        DateTime fromDate;
        DateTime toDate;

        if (req != null && !string.IsNullOrEmpty(req.FromDate) && DateTime.TryParse(req.FromDate, out var parsedFrom))
        {
            fromDate = parsedFrom;
            toDate = (req != null && !string.IsNullOrEmpty(req.ToDate) && DateTime.TryParse(req.ToDate, out var parsedTo))
                ? parsedTo
                : parsedFrom;
        }
        else if (req != null && !string.IsNullOrEmpty(req.TargetDate) && DateTime.TryParse(req.TargetDate, out var parsedTarget))
        {
            fromDate = parsedTarget;
            toDate = parsedTarget;
        }
        else
        {
            fromDate = DateTime.Today;
            toDate = DateTime.Today;
        }

        var result = await processService.ExecuteForDateRangeAsync(fromDate, toDate, "Manual Trigger (On-Demand)");
        return Results.Ok(result);
    });

    // 100% Manual Swapping (Entry 2) Endpoints
    app.MapGet("/api/manual-swapping/history", (IManualHistoryService history) => Results.Ok(history.GetTopHistory(50)));

    app.MapPost("/api/manual-swapping/execute", async (IManualSwappingService swappingService, ExecuteManualSwappingRequest? req) =>
    {
        DateTime fromDate;
        DateTime toDate;

        if (req != null && !string.IsNullOrEmpty(req.FromDate) && DateTime.TryParse(req.FromDate, out var parsedFrom))
        {
            fromDate = parsedFrom;
            toDate = (req != null && !string.IsNullOrEmpty(req.ToDate) && DateTime.TryParse(req.ToDate, out var parsedTo))
                ? parsedTo
                : parsedFrom;
        }
        else
        {
            fromDate = DateTime.Today;
            toDate = DateTime.Today;
        }

        var result = await swappingService.ExecuteSwappingAsync(fromDate, toDate, "Manual Swapping (Entry 2)");
        return Results.Ok(result);
    });

    // Authentication Endpoints
    app.MapPost("/api/auth/login", async (IAuthService authService, HttpContext ctx, LoginRequest req) =>
    {
        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
        var (success, token, user, error) = await authService.AuthenticateAsync(req.Email ?? "", req.Password ?? "", ip);
        if (!success || user == null || string.IsNullOrEmpty(token))
        {
            return Results.Json(new { success = false, message = error ?? "Invalid email or password." }, statusCode: 401);
        }
        return Results.Ok(new
        {
            success = true,
            token,
            user = new { email = user.Email, name = user.Name }
        });
    });

    app.MapPost("/api/auth/logout", (IAuthService authService, HttpContext ctx, LogoutRequest? req) =>
    {
        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
        authService.LogLogout(req?.Email ?? "", ip);
        return Results.Ok(new { success = true, message = "Logged out successfully." });
    });

    app.MapGet("/api/auth/me", (IAuthService authService, HttpContext ctx) =>
    {
        var authHeader = ctx.Request.Headers["Authorization"].FirstOrDefault();
        if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return Results.Unauthorized();
        }
        var token = authHeader.Substring("Bearer ".Length).Trim();
        var user = authService.ValidateToken(token);
        if (user == null)
        {
            return Results.Unauthorized();
        }
        return Results.Ok(new { email = user.Email, name = user.Name });
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

public record UpdateSchedulerRequest(
    string? DailyTime, 
    bool? IsEnabled, 
    List<KotaProcess.Api.Services.ScheduledTimeSlot>? Schedules = null, 
    KotaProcess.Api.Services.WeeklyScheduleSlot? WeeklySchedule = null);
public record RunWeeklyRequest(string? DayOfWeek);
public record RunNowRequest(string? FromDate, string? ToDate, string? TargetDate);
public record ExecuteManualSwappingRequest(string? FromDate, string? ToDate);
public record LoginRequest(string? Email, string? Password);
public record LogoutRequest(string? Email);

