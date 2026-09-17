using System.Data;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace KotaProcess.Api.Services;

public interface IManualSwappingService
{
    Task<ManualHistoryRecord> ExecuteSwappingAsync(DateTime fromDate, DateTime toDate, string triggerSource = "Manual Swapping (Entry 2)");
}

public class ManualSwappingService : IManualSwappingService
{
    private readonly IEnvService _envService;
    private readonly ILogService _logService;
    private readonly IManualHistoryService _historyService;
    private readonly ILogger<ManualSwappingService> _logger;

    public ManualSwappingService(
        IEnvService envService,
        ILogService logService,
        IManualHistoryService historyService,
        ILogger<ManualSwappingService> logger)
    {
        _envService = envService;
        _logService = logService;
        _historyService = historyService;
        _logger = logger;
    }

    public async Task<ManualHistoryRecord> ExecuteSwappingAsync(DateTime fromDate, DateTime toDate, string triggerSource = "Manual Swapping (Entry 2)")
    {
        if (fromDate > toDate)
        {
            (fromDate, toDate) = (toDate, fromDate);
        }

        var isSingleDay = fromDate.Date == toDate.Date;
        var dateRangeStr = isSingleDay
            ? fromDate.ToString("yyyy-MM-dd")
            : $"{fromDate:yyyy-MM-dd} to {toDate:yyyy-MM-dd}";

        var stopwatch = Stopwatch.StartNew();
        var record = new ManualHistoryRecord
        {
            ProcessDate = dateRangeStr,
            ExecutedAt = DateTime.UtcNow,
            TriggerSource = triggerSource
        };

        var logFile = _logService.GetCurrentLogFileName();
        _logger.LogInformation("================================================================================");
        _logger.LogInformation("🔄 [MANUAL SWAPPING] Starting 100% Manual Swapping (Entry 2) for: {DateRange}", dateRangeStr);
        _logger.LogInformation("📅 Trigger: {Trigger} | Target DB: {Server}/{Database} | Log: {LogFile}", 
            triggerSource, _envService.DbServer, _envService.DbDatabase, logFile);

        var connectionString = _envService.ConnectionString;
        var printMessages = new List<string>();

        try
        {
            using var connection = new SqlConnection(connectionString);
            connection.InfoMessage += (sender, e) =>
            {
                if (!string.IsNullOrWhiteSpace(e.Message))
                {
                    printMessages.Add(e.Message);
                    _logger.LogInformation("📢 [SQL PRINT] {Message}", e.Message);
                }
            };

            await connection.OpenAsync();
            _logger.LogInformation("🔌 Connected to MSSQL Server. Executing manual swapping query for {FromDate} to {ToDate}...",
                fromDate.ToString("yyyy-MM-dd"), toDate.ToString("yyyy-MM-dd"));

            using var command = new SqlCommand(ManualSwappingSqlScript, connection)
            {
                CommandTimeout = 600 // 10 minutes timeout for bulk month operations
            };

            command.Parameters.Add(new SqlParameter("@ParamFromDate", SqlDbType.Date)
            {
                Value = fromDate.Date
            });
            command.Parameters.Add(new SqlParameter("@ParamToDate", SqlDbType.Date)
            {
                Value = toDate.Date
            });

            await command.ExecuteNonQueryAsync();

            stopwatch.Stop();
            record.DurationMs = stopwatch.ElapsedMilliseconds;
            record.Status = "Success";

            // Parse rows updated from captured SQL PRINT statements
            foreach (var msg in printMessages)
            {
                var updateMatch = Regex.Match(msg, @"MonthTrns UPDATE completed:\s*(\d+)\s*row\(s\)\s*updated", RegexOptions.IgnoreCase);
                if (updateMatch.Success && int.TryParse(updateMatch.Groups[1].Value, out var updatedCount))
                {
                    record.RowsUpdated = updatedCount;
                }
            }

            var runTimeClock = DateTime.Now.ToString("hh:mm:ss tt");
            record.Message = $"Ran at {runTimeClock}. Completed in {record.DurationMs}ms. Updated {record.RowsUpdated} rows in MonthTrns.";
            _logger.LogInformation("✨ [MANUAL SWAPPING] Manual swapping finished successfully at {Time} for {DateRange}: {RowsUpdated} updated in {Duration}ms.",
                runTimeClock, dateRangeStr, record.RowsUpdated, record.DurationMs);
            _logger.LogInformation("================================================================================");
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            record.DurationMs = stopwatch.ElapsedMilliseconds;
            record.Status = "Failed";
            record.ErrorMessage = ex.Message;
            var runTimeClock = DateTime.Now.ToString("hh:mm:ss tt");
            record.Message = $"Ran at {runTimeClock}. Manual swapping execution failed: {ex.Message}";

            _logger.LogError(ex, "❌ [MANUAL SWAPPING] Manual swapping failed at {Time} for {DateRange} after {Duration}ms: {Error}",
                runTimeClock, dateRangeStr, record.DurationMs, ex.Message);
            _logger.LogInformation("================================================================================");
        }

        // Save record to persistent manual history
        await _historyService.AddRecordAsync(record);
        return record;
    }

    private const string ManualSwappingSqlScript = @"
SET NOCOUNT ON;

DECLARE @FromDate DATE = @ParamFromDate;
DECLARE @ToDate   DATE = @ParamToDate;

-- Step 1: Clear the temp table if it already exists in memory
IF OBJECT_ID('tempdb..#TempUpdates') IS NOT NULL DROP TABLE #TempUpdates;

-- Step 2: Calculate everything in memory
WITH RawCalc AS (
    SELECT 
        m.EmpCode, 
        m.DailyDate,
        ISNULL(e.entry, 0) AS EmpMstEntry,
        CAST(ISNULL(e.location, '0') AS VARCHAR(50)) AS Location,
        RawArr = m.arrtime,
        RawBIn = m.actrt_i,
        NewArr = CASE 
            WHEN m.arrtime > 0 AND m.arrtime BETWEEN s.ShfInPunchStart AND s.ShfInPunchEnd THEN m.arrtime 
            WHEN m.ArrtimeNA > 0 AND m.ArrtimeNA BETWEEN s.ShfInPunchStart AND s.ShfInPunchEnd THEN m.ArrtimeNA 
            WHEN m.arrtime > 0 AND m.arrtime NOT BETWEEN s.ShfInPunchStart AND s.ShfInPunchEnd THEN 0 
            ELSE m.arrtime 
        END,
        NewArrNA = CASE 
            WHEN m.arrtime > 0 AND m.arrtime NOT BETWEEN s.ShfInPunchStart AND s.ShfInPunchEnd THEN m.arrtime 
            WHEN m.ArrtimeNA > 0 AND m.ArrtimeNA BETWEEN s.ShfInPunchStart AND s.ShfInPunchEnd THEN 0 
            ELSE m.ArrtimeNA 
        END,

        NewDep = CASE 
            WHEN m.deptime > 0 AND m.deptime BETWEEN s.ShfOutPunchStart AND s.ShfOutPunchEnd THEN m.deptime 
            WHEN m.DeptimeNA > 0 AND m.DeptimeNA BETWEEN s.ShfOutPunchStart AND s.ShfOutPunchEnd THEN m.DeptimeNA 
            WHEN m.deptime > 0 AND m.deptime NOT BETWEEN s.ShfOutPunchStart AND s.ShfOutPunchEnd THEN 0 
            ELSE m.deptime 
        END,
        NewDepNA = CASE 
            WHEN m.deptime > 0 AND m.deptime NOT BETWEEN s.ShfOutPunchStart AND s.ShfOutPunchEnd THEN m.deptime 
            WHEN m.DeptimeNA > 0 AND m.DeptimeNA BETWEEN s.ShfOutPunchStart AND s.ShfOutPunchEnd THEN 0 
            ELSE m.DeptimeNA 
        END,

        NewBOut = CASE 
            WHEN m.actrt_o > 0 AND m.actrt_o BETWEEN s.BrkOutPunchStart AND s.BrkOutPunchEnd THEN m.actrt_o 
            WHEN m.actrt_oNA > 0 AND m.actrt_oNA BETWEEN s.BrkOutPunchStart AND s.BrkOutPunchEnd THEN m.actrt_oNA 
            WHEN m.actrt_o > 0 AND m.actrt_o NOT BETWEEN s.BrkOutPunchStart AND s.BrkOutPunchEnd THEN 0 
            ELSE m.actrt_o 
        END,
        NewBOutNA = CASE 
            WHEN m.actrt_o > 0 AND m.actrt_o NOT BETWEEN s.BrkOutPunchStart AND s.BrkOutPunchEnd THEN m.actrt_o 
            WHEN m.actrt_oNA > 0 AND m.actrt_oNA BETWEEN s.BrkOutPunchStart AND s.BrkOutPunchEnd THEN 0 
            ELSE m.actrt_oNA 
        END,

        NewBIn = CASE 
            WHEN m.actrt_i > 0 AND m.actrt_i BETWEEN s.BrkInPunchStart AND s.BrkInPunchEnd THEN m.actrt_i 
            WHEN m.actrt_iNA > 0 AND m.actrt_iNA BETWEEN s.BrkInPunchStart AND s.BrkInPunchEnd THEN m.actrt_iNA 
            WHEN m.actrt_i > 0 AND m.actrt_i NOT BETWEEN s.BrkInPunchStart AND s.BrkInPunchEnd THEN 0 
            ELSE m.actrt_i 
        END,
        NewBInNA = CASE 
            WHEN m.actrt_i > 0 AND m.actrt_i NOT BETWEEN s.BrkInPunchStart AND s.BrkInPunchEnd THEN m.actrt_i 
            WHEN m.actrt_iNA > 0 AND m.actrt_iNA BETWEEN s.BrkInPunchStart AND s.BrkInPunchEnd THEN 0 
            ELSE m.actrt_iNA 
        END,
        
        s.f_half, 
        s.s_half,
        ISNULL(s.shf_in, 0.0) AS shf_in,
        ISNULL(s.shf_out, 0.0) AS shf_out,
        ISNULL(cd.lt_allow, 0.0) AS lt_allow,
        ISNULL(s.ShfInPunchStart, 0.0) AS ShfInPunchStart,
        ISNULL(s.ShfInPunchEnd, 0.0) AS ShfInPunchEnd,
        ISNULL(s.ShfOutPunchStart, 0.0) AS ShfOutPunchStart,
        ISNULL(s.ShfOutPunchEnd, 0.0) AS ShfOutPunchEnd
        
    FROM dbo.MonthTrns m
    INNER JOIN dbo.instshft s ON m.shift = s.shift
    LEFT JOIN dbo.empmst e ON m.EmpCode = e.empcode
    LEFT JOIN dbo.catdesc cd ON e.cat = cd.cat
    WHERE m.DailyDate >= CAST(@FromDate AS DATETIME) 
      AND m.DailyDate < DATEADD(DAY, 1, CAST(@ToDate AS DATETIME))
),
PreCalc AS (
    SELECT 
        *,
        CalcPunches = (CASE WHEN NewArr > 0 THEN 1 ELSE 0 END) + 
                      (CASE WHEN NewDep > 0 THEN 1 ELSE 0 END) + 
                      (CASE WHEN NewBOut > 0 THEN 1 ELSE 0 END) + 
                      (CASE WHEN NewBIn > 0 THEN 1 ELSE 0 END),
        RawLateMin = CASE 
            WHEN NewArr > 0 AND shf_in > 0 
            THEN (CAST(FLOOR(NewArr) AS INT) * 60 + CAST(ROUND((NewArr - FLOOR(NewArr)) * 100.0, 0) AS INT))
               - (CAST(FLOOR(shf_in) AS INT) * 60 + CAST(ROUND((shf_in - FLOOR(shf_in)) * 100.0, 0) AS INT))
            ELSE 0 
        END,
        LtAllowMin = CASE 
            WHEN lt_allow > 0 
            THEN (CAST(FLOOR(lt_allow) AS INT) * 60 + CAST(ROUND((lt_allow - FLOOR(lt_allow)) * 100.0, 0) AS INT))
            ELSE 0 
        END,
        DiffEarl = CASE 
            WHEN NewDep > 0 AND shf_out > 0 
            THEN (CAST(FLOOR(shf_out) AS INT) * 60 + CAST(ROUND((shf_out - FLOOR(shf_out)) * 100.0, 0) AS INT))
               - (CAST(FLOOR(NewDep) AS INT) * 60 + CAST(ROUND((NewDep - FLOOR(NewDep)) * 100.0, 0) AS INT))
            ELSE 0 
        END
    FROM RawCalc
),
DiffCalc AS (
    SELECT 
        p.*,
        DiffLate = CASE 
            WHEN ABS(p.RawLateMin) <= p.LtAllowMin THEN 0 
            ELSE p.RawLateMin 
        END
    FROM PreCalc p
)
SELECT 
    EmpCode, DailyDate, 
    EmpMstEntry = CASE 
        WHEN Location = '6028' AND CalcPunches = 1 THEN 1
        WHEN Location = '6028' THEN 2
        ELSE EmpMstEntry
    END,
    RawArr, RawBIn,
    NewArr, NewArrNA, NewDep, NewDepNA, NewBOut, NewBOutNA, NewBIn, NewBInNA, f_half, s_half,
    
    HasAnyPunch = CASE 
        WHEN NewArr > 0 OR NewArrNA > 0 OR NewDep > 0 OR NewDepNA > 0 
          OR NewBOut > 0 OR NewBOutNA > 0 OR NewBIn > 0 OR NewBInNA > 0 
        THEN 1 ELSE 0 
    END,

    -- Calculate entry count (0 to 4)
    CalculatedEntry = CalcPunches,
    
    -- Check if it's 1 or 3 for the CHQ column
    NewCHQ = CASE 
        WHEN (CASE 
                WHEN Location = '6028' AND CalcPunches = 1 THEN 1
                WHEN Location = '6028' THEN 2
                ELSE EmpMstEntry
              END) = 1 THEN ''
        WHEN CalcPunches IN (1, 3) THEN '*' ELSE '' 
    END,
    
    -- Evaluate H1 (First Half) strictly using Entry 2 Rules
    H1 = CASE 
        WHEN NewArr > 0 AND NewDep > 0 THEN 1   -- Arrival + Departure (Forms PP)
        WHEN NewArr > 0 AND NewBOut > 0 THEN 1  -- Arrival + Rest Out (Forms PA)
        WHEN NewArr > 0 AND NewBIn > 0 THEN 1   -- Arrival + Rest In (Safety check for PA)
        ELSE 0 
    END,
        
    -- Evaluate H2 (Second Half) strictly using Entry 2 Rules
    H2 = CASE 
        WHEN NewArr > 0 AND NewDep > 0 THEN 1   -- Arrival + Departure (Forms PP)
        WHEN NewBOut > 0 AND NewDep > 0 THEN 1  -- Rest Out + Departure (Forms AP)
        WHEN NewBIn > 0 AND NewDep > 0 THEN 1   -- Rest In + Departure (Safety check for AP)
        ELSE 0 
    END,

    latehrs = CASE 
        WHEN DiffLate = 0 THEN 0.0
        WHEN DiffLate > 0 THEN CAST((DiffLate / 60) + ((DiffLate % 60) / 100.0) AS real)
        ELSE CAST(-1.0 * ((ABS(DiffLate) / 60) + ((ABS(DiffLate) % 60) / 100.0)) AS real)
    END,
    earlhrs = CASE 
        WHEN DiffEarl = 0 THEN 0.0
        WHEN DiffEarl > 0 THEN CAST((DiffEarl / 60) + ((DiffEarl % 60) / 100.0) AS real)
        ELSE CAST(-1.0 * ((ABS(DiffEarl) / 60) + ((ABS(DiffEarl) % 60) / 100.0)) AS real)
    END
INTO #TempUpdates
FROM DiffCalc;

-- Step 3: Add an index to the temp table to ensure the final UPDATE happens instantly
CREATE CLUSTERED INDEX IDX_TempUpdates ON #TempUpdates(EmpCode, DailyDate);

-- Step 4: Run the actual update on MonthTrns using the pre-calculated temp table
UPDATE m
SET 
    m.arrtime = t.NewArr, 
    m.ArrtimeNA = t.NewArrNA,
    m.deptime = t.NewDep, 
    m.DeptimeNA = t.NewDepNA,
    m.actrt_o = t.NewBOut, 
    m.actrt_oNA = t.NewBOutNA,
    m.actrt_i = t.NewBIn, 
    m.actrt_iNA = t.NewBInNA,
    m.latehrs = t.latehrs,
    m.earlhrs = t.earlhrs,
    
    m.entreq = CASE WHEN t.EmpMstEntry = 1 THEN 1 ELSE 2 END,
    m.entry = CASE 
        WHEN t.EmpMstEntry = 1 THEN 
            CASE WHEN t.CalculatedEntry > 0 THEN t.CalculatedEntry WHEN t.HasAnyPunch = 1 THEN 1 ELSE 0 END
        ELSE t.CalculatedEntry 
    END,
    m.chq = t.NewCHQ,
    
    m.presabs = CASE 
        WHEN t.EmpMstEntry = 1 THEN 
            CASE 
                WHEN t.NewArr > 0 THEN 'P P'
                WHEN t.NewBIn > 0 THEN 'A P'
                ELSE 'A A' 
            END
        WHEN t.H1 = 1 AND t.H2 = 1 THEN 'P P' 
        WHEN t.H1 = 1 AND t.H2 = 0 THEN 'P A' 
        WHEN t.H1 = 0 AND t.H2 = 1 THEN 'A P' 
        ELSE 'A A' 
    END,
        
    m.present = CASE 
        WHEN t.EmpMstEntry = 1 THEN 
            CASE 
                WHEN t.NewArr > 0 THEN 1.0
                WHEN t.NewBIn > 0 THEN 0.5
                ELSE 0.0 
            END
        WHEN t.H1 = 1 AND t.H2 = 1 THEN 1.0  
        WHEN t.H1 = 1 AND t.H2 = 0 THEN 0.5  
        WHEN t.H1 = 0 AND t.H2 = 1 THEN 0.5  
        ELSE 0.0 
    END,
        
    -- Update working hours based on presence status
    m.wrkhrs = CASE 
        WHEN t.EmpMstEntry = 1 THEN 
            CASE 
                WHEN t.NewArr > 0 THEN t.f_half + t.s_half
                WHEN t.NewBIn > 0 THEN t.s_half
                ELSE 0 
            END
        WHEN t.H1 = 1 AND t.H2 = 1 THEN t.f_half + t.s_half  -- P P
        WHEN t.H1 = 1 AND t.H2 = 0 THEN t.f_half             -- P A
        WHEN t.H1 = 0 AND t.H2 = 1 THEN t.s_half             -- A P
        ELSE 0 
    END                                                       -- A A

FROM dbo.MonthTrns m
INNER JOIN #TempUpdates t ON m.EmpCode = t.EmpCode AND m.DailyDate = t.DailyDate;

PRINT 'MonthTrns UPDATE completed: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' row(s) updated.';

-- Step 5: Clean up memory
DROP TABLE #TempUpdates;

PRINT 'Manual swapping operation successfully completed!';
";
}
