using System.Data;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace KotaProcess.Api.Services;

public interface IAttendanceProcessService
{
    Task<ProcessHistoryRecord> ExecuteForDateAsync(DateTime targetDate, string triggerSource = "Autonomous Daily Schedule");
    Task<ProcessHistoryRecord> ExecuteForDateRangeAsync(DateTime fromDate, DateTime toDate, string triggerSource = "Autonomous Daily Schedule");
}

public class AttendanceProcessService : IAttendanceProcessService
{
    private readonly IEnvService _envService;
    private readonly ILogService _logService;
    private readonly IProcessHistoryService _historyService;
    private readonly ILogger<AttendanceProcessService> _logger;

    public AttendanceProcessService(
        IEnvService envService,
        ILogService logService,
        IProcessHistoryService historyService,
        ILogger<AttendanceProcessService> logger)
    {
        _envService = envService;
        _logService = logService;
        _historyService = historyService;
        _logger = logger;
    }

    public Task<ProcessHistoryRecord> ExecuteForDateAsync(DateTime targetDate, string triggerSource = "Autonomous Daily Schedule")
    {
        return ExecuteForDateRangeAsync(targetDate, targetDate, triggerSource);
    }

    public async Task<ProcessHistoryRecord> ExecuteForDateRangeAsync(DateTime fromDate, DateTime toDate, string triggerSource = "Autonomous Daily Schedule")
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
        var record = new ProcessHistoryRecord
        {
            ProcessDate = dateRangeStr,
            ExecutedAt = DateTime.UtcNow,
            TriggerSource = triggerSource
        };

        var logFile = _logService.GetCurrentLogFileName();
        _logger.LogInformation("================================================================================");
        _logger.LogInformation("🚀 [KOTA PROCESS] Starting Attendance Processing for: {DateRange}", dateRangeStr);
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
            _logger.LogInformation("🔌 Connected to MSSQL Server. Executing attendance query for {FromDate} to {ToDate}...",
                fromDate.ToString("yyyy-MM-dd"), toDate.ToString("yyyy-MM-dd"));

            using var command = new SqlCommand(AttendanceSqlScript, connection)
            {
                CommandTimeout = 600 // 10 minutes timeout for multi-day date range batch operations
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

            // Parse rows updated and inserted from captured SQL PRINT statements
            foreach (var msg in printMessages)
            {
                var updateMatch = Regex.Match(msg, @"MonthTrns UPDATE completed:\s*(\d+)\s*row\(s\)\s*updated", RegexOptions.IgnoreCase);
                if (updateMatch.Success && int.TryParse(updateMatch.Groups[1].Value, out var updatedCount))
                {
                    record.RowsUpdated = updatedCount;
                }

                var insertMatch = Regex.Match(msg, @"MonthTrns INSERT completed:\s*(\d+)\s*row\(s\)\s*inserted", RegexOptions.IgnoreCase);
                if (insertMatch.Success && int.TryParse(insertMatch.Groups[1].Value, out var insertedCount))
                {
                    record.RowsInserted = insertedCount;
                }
            }

            var runTimeClock = DateTime.Now.ToString("hh:mm:ss tt");
            record.Message = $"Ran at {runTimeClock}. Completed in {record.DurationMs}ms. Updated {record.RowsUpdated} rows, Inserted {record.RowsInserted} rows.";
            _logger.LogInformation("✨ [KOTA PROCESS] Process finished successfully at {Time} for {DateRange}: {RowsUpdated} updated, {RowsInserted} inserted in {Duration}ms.",
                runTimeClock, dateRangeStr, record.RowsUpdated, record.RowsInserted, record.DurationMs);
            _logger.LogInformation("================================================================================");
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            record.DurationMs = stopwatch.ElapsedMilliseconds;
            record.Status = "Failed";
            record.ErrorMessage = ex.Message;
            var runTimeClock = DateTime.Now.ToString("hh:mm:ss tt");
            record.Message = $"Ran at {runTimeClock}. Process execution failed: {ex.Message}";

            _logger.LogError(ex, "❌ [KOTA PROCESS] Attendance processing failed at {Time} for {DateRange} after {Duration}ms: {Error}",
                runTimeClock, dateRangeStr, record.DurationMs, ex.Message);
            _logger.LogInformation("================================================================================");
        }

        // Save record to persistent history
        await _historyService.AddRecordAsync(record);
        return record;
    }

    private const string AttendanceSqlScript = @"
SET NOCOUNT ON;

DECLARE @FromDate DATE = @ParamFromDate;
DECLARE @ToDate   DATE = @ParamToDate;

-- Step 0: Clean up temporary tables
IF OBJECT_ID('tempdb..#DateRange') IS NOT NULL DROP TABLE #DateRange;
IF OBJECT_ID('tempdb..#ActiveEmployees') IS NOT NULL DROP TABLE #ActiveEmployees;
IF OBJECT_ID('tempdb..#EmpShifts') IS NOT NULL DROP TABLE #EmpShifts;
IF OBJECT_ID('tempdb..#RawPunches') IS NOT NULL DROP TABLE #RawPunches;
IF OBJECT_ID('tempdb..#TempUpdates') IS NOT NULL DROP TABLE #TempUpdates;

-- Step 1: Generate all calendar dates in the requested range
SELECT DATEADD(DAY, n.number, @FromDate) AS DailyDate
INTO #DateRange
FROM (
    SELECT TOP (DATEDIFF(DAY, @FromDate, @ToDate) + 1)
        ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS number
    FROM master..spt_values
) n;

CREATE CLUSTERED INDEX IDX_DateRange ON #DateRange(DailyDate);

-- Step 2: Get all employees rostered in MonthShift or active (Check empmst.entry)
SELECT DISTINCT e.empcode AS EmpCode, ISNULL(e.entry, 0) AS EmpMstEntry
INTO #ActiveEmployees
FROM dbo.empmst e
WHERE EXISTS (
    SELECT 1 FROM dbo.MonthShift ms 
    JOIN #DateRange dr 
      ON ms.empcode = e.empcode 
     AND ms.Yr = YEAR(dr.DailyDate) 
     AND ms.Month = CASE MONTH(dr.DailyDate) 
         WHEN 1 THEN 'Jan' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar' WHEN 4 THEN 'Apr' 
         WHEN 5 THEN 'May' WHEN 6 THEN 'Jun' WHEN 7 THEN 'Jul' WHEN 8 THEN 'Aug' 
         WHEN 9 THEN 'Sep' WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dec' 
     END
);

CREATE CLUSTERED INDEX IDX_ActiveEmployees ON #ActiveEmployees(EmpCode);

-- Step 3: Shift assignments from MonthShift D1-D31 joined with instshft (EmpEntry = 1.0 for entry 1, 4.0 for others)
SELECT 
    ae.EmpCode,
    d.DailyDate,
    ae.EmpMstEntry,
    CAST(CASE WHEN ae.EmpMstEntry = 1 THEN 1.0 ELSE 4.0 END AS real) AS EmpEntry,
    ShiftCode = CASE DAY(d.DailyDate)
        WHEN 1 THEN ms.d1   WHEN 2 THEN ms.d2   WHEN 3 THEN ms.d3   WHEN 4 THEN ms.d4
        WHEN 5 THEN ms.d5   WHEN 6 THEN ms.d6   WHEN 7 THEN ms.d7   WHEN 8 THEN ms.d8
        WHEN 9 THEN ms.d9   WHEN 10 THEN ms.d10 WHEN 11 THEN ms.d11 WHEN 12 THEN ms.d12
        WHEN 13 THEN ms.d13 WHEN 14 THEN ms.d14 WHEN 15 THEN ms.d15 WHEN 16 THEN ms.d16
        WHEN 17 THEN ms.d17 WHEN 18 THEN ms.d18 WHEN 19 THEN ms.d19 WHEN 20 THEN ms.d20
        WHEN 21 THEN ms.d21 WHEN 22 THEN ms.d22 WHEN 23 THEN ms.d23 WHEN 24 THEN ms.d24
        WHEN 25 THEN ms.d25 WHEN 26 THEN ms.d26 WHEN 27 THEN ms.d27 WHEN 28 THEN ms.d28
        WHEN 29 THEN ms.d29 WHEN 30 THEN ms.d30 WHEN 31 THEN ms.d31
    END,
    ISNULL(s.night, 0) AS night,
    s.shf_in, s.shf_out, s.rst_out, s.rst_in, s.hdstart, s.hdend,
    s.ShfInPunchStart, s.ShfInPunchEnd,
    s.BrkOutPunchStart, s.BrkOutPunchEnd,
    s.BrkInPunchStart, s.BrkInPunchEnd,
    s.ShfOutPunchStart, s.ShfOutPunchEnd,
    ISNULL(s.f_half, 0.0) AS f_half,
    ISNULL(s.s_half, 0.0) AS s_half,
    CAST(YEAR(d.DailyDate) AS real) AS Yr,
    CASE MONTH(d.DailyDate) 
        WHEN 1 THEN 'Jan' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar' WHEN 4 THEN 'Apr' 
        WHEN 5 THEN 'May' WHEN 6 THEN 'Jun' WHEN 7 THEN 'Jul' WHEN 8 THEN 'Aug' 
        WHEN 9 THEN 'Sep' WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dec' 
    END AS Month
INTO #EmpShifts
FROM #ActiveEmployees ae
CROSS JOIN #DateRange d
LEFT JOIN dbo.MonthShift ms ON ms.empcode = ae.EmpCode 
    AND ms.Yr = YEAR(d.DailyDate) 
    AND ms.Month = CASE MONTH(d.DailyDate) 
        WHEN 1 THEN 'Jan' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar' WHEN 4 THEN 'Apr' 
        WHEN 5 THEN 'May' WHEN 6 THEN 'Jun' WHEN 7 THEN 'Jul' WHEN 8 THEN 'Aug' 
        WHEN 9 THEN 'Sep' WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dec' 
    END
LEFT JOIN dbo.instshft s ON s.shift = (
    CASE DAY(d.DailyDate)
        WHEN 1 THEN ms.d1   WHEN 2 THEN ms.d2   WHEN 3 THEN ms.d3   WHEN 4 THEN ms.d4
        WHEN 5 THEN ms.d5   WHEN 6 THEN ms.d6   WHEN 7 THEN ms.d7   WHEN 8 THEN ms.d8
        WHEN 9 THEN ms.d9   WHEN 10 THEN ms.d10 WHEN 11 THEN ms.d11 WHEN 12 THEN ms.d12
        WHEN 13 THEN ms.d13 WHEN 14 THEN ms.d14 WHEN 15 THEN ms.d15 WHEN 16 THEN ms.d16
        WHEN 17 THEN ms.d17 WHEN 18 THEN ms.d18 WHEN 19 THEN ms.d19 WHEN 20 THEN ms.d20
        WHEN 21 THEN ms.d21 WHEN 22 THEN ms.d22 WHEN 23 THEN ms.d23 WHEN 24 THEN ms.d24
        WHEN 25 THEN ms.d25 WHEN 26 THEN ms.d26 WHEN 27 THEN ms.d27 WHEN 28 THEN ms.d28
        WHEN 29 THEN ms.d29 WHEN 30 THEN ms.d30 WHEN 31 THEN ms.d31
    END
);

CREATE CLUSTERED INDEX IDX_EmpShifts ON #EmpShifts(EmpCode, DailyDate);

-- Step 4: Extract punches from Attlogs with decimal conversion (HH:MM -> HH.MM)
-- and add +24.0 for night shifts occurring on the next calendar day
SELECT DISTINCT
    es.EmpCode,
    es.DailyDate,
    DecTime = CAST(
        DATEPART(HOUR, a.TransDate) + DATEPART(MINUTE, a.TransDate)/100.0 +
        CASE WHEN es.night = 1 AND a.TransDate >= DATEADD(DAY, 1, CAST(es.DailyDate AS DATETIME)) THEN 24.0 ELSE 0.0 END
        AS real
    )
INTO #RawPunches
FROM #EmpShifts es
INNER JOIN dbo.Attlogs a ON a.EmpCode = es.EmpCode
    AND a.TransDate >= CAST(es.DailyDate AS DATETIME)
    AND a.TransDate < DATEADD(DAY, 2, CAST(es.DailyDate AS DATETIME))
    AND (
        (es.night = 0 AND a.TransDate < DATEADD(DAY, 1, CAST(es.DailyDate AS DATETIME)))
        OR
        (es.night = 1 AND (
            (a.TransDate >= DATEADD(HOUR, 12, CAST(es.DailyDate AS DATETIME)) AND a.TransDate < DATEADD(DAY, 1, CAST(es.DailyDate AS DATETIME)))
            OR
            (a.TransDate >= DATEADD(DAY, 1, CAST(es.DailyDate AS DATETIME)) AND a.TransDate < DATEADD(HOUR, 12, DATEADD(DAY, 1, CAST(es.DailyDate AS DATETIME))))
        ))
    );

CREATE CLUSTERED INDEX IDX_RawPunches ON #RawPunches(EmpCode, DailyDate, DecTime);

-- Step 5: Mutually Exclusive Punch Slot Classification (No overlapping between columns)
WITH PunchSlots AS (
    SELECT 
        es.EmpCode, 
        es.DailyDate, 
        es.ShiftCode, 
        rp.DecTime,
        Slot = CASE
            -- 1. In-Window Arrival
            WHEN rp.DecTime >= es.ShfInPunchStart AND rp.DecTime <= es.ShfInPunchEnd THEN 'ARR'
            
            -- 2. Early Arrival NA (before arrival window)
            WHEN rp.DecTime < es.ShfInPunchStart THEN 'ARR_NA'
            
            -- 3. In-Window Break Out
            WHEN es.BrkOutPunchStart > 0 AND rp.DecTime >= es.BrkOutPunchStart AND rp.DecTime <= es.BrkOutPunchEnd THEN 'BOUT'
            
            -- 4. Late Arrival / Early Break Out NA (between Arrival end and Break Out start)
            WHEN es.BrkOutPunchStart > 0 AND rp.DecTime > es.ShfInPunchEnd AND rp.DecTime < es.BrkOutPunchStart THEN 'BOUT_NA'
            
            -- 5. In-Window Break In
            WHEN es.BrkInPunchStart > 0 AND rp.DecTime >= es.BrkInPunchStart AND rp.DecTime <= es.BrkInPunchEnd THEN 'BIN'
            
            -- 6. Break In NA (between Break Out end and Break In start)
            WHEN es.BrkInPunchStart > 0 AND rp.DecTime > es.BrkOutPunchEnd AND rp.DecTime < es.BrkInPunchStart THEN 'BIN_NA'
            
            -- 7. In-Window Departure
            WHEN es.ShfOutPunchStart > 0 AND rp.DecTime >= es.ShfOutPunchStart AND rp.DecTime <= es.ShfOutPunchEnd THEN 'DEP'
            
            -- 8. Early Departure NA (between Break In end and Departure start)
            WHEN es.BrkInPunchEnd > 0 AND es.ShfOutPunchStart > 0 AND rp.DecTime > es.BrkInPunchEnd AND rp.DecTime < es.ShfOutPunchStart THEN 'DEP_NA'
            
            -- 9. Late Departure NA (after Departure end)
            WHEN es.ShfOutPunchEnd > 0 AND rp.DecTime > es.ShfOutPunchEnd THEN 'DEP_NA'
            
            -- Handling for shifts without break windows (BrkOutPunchStart = 0)
            WHEN ISNULL(es.BrkOutPunchStart, 0) = 0 AND rp.DecTime > es.ShfInPunchEnd AND rp.DecTime < ISNULL(es.hdstart, (es.shf_in + es.shf_out)/2.0) THEN 'ARR_NA'
            WHEN ISNULL(es.BrkOutPunchStart, 0) = 0 AND rp.DecTime >= ISNULL(es.hdstart, (es.shf_in + es.shf_out)/2.0) AND rp.DecTime < es.ShfOutPunchStart THEN 'DEP_NA'
            
            ELSE 'DEP_NA'
        END
    FROM #EmpShifts es
    INNER JOIN #RawPunches rp ON es.EmpCode = rp.EmpCode AND es.DailyDate = rp.DailyDate
),
AggregatedSlots AS (
    SELECT 
        es.EmpCode, 
        CAST(es.DailyDate AS DATETIME) AS DailyDate, 
        es.ShiftCode, es.EmpEntry, es.EmpMstEntry, es.Yr, es.Month, es.f_half, es.s_half,
        NewArr    = ISNULL(MAX(CASE WHEN ps.Slot = 'ARR'     THEN ps.DecTime END), 0.0),
        NewArrNA  = ISNULL(MAX(CASE WHEN ps.Slot = 'ARR_NA'  THEN ps.DecTime END), 0.0),
        NewBOut   = ISNULL(MAX(CASE WHEN ps.Slot = 'BOUT'    THEN ps.DecTime END), 0.0),
        NewBOutNA = ISNULL(MAX(CASE WHEN ps.Slot = 'BOUT_NA' THEN ps.DecTime END), 0.0),
        NewBIn    = ISNULL(MAX(CASE WHEN ps.Slot = 'BIN'     THEN ps.DecTime END), 0.0),
        NewBInNA  = ISNULL(MAX(CASE WHEN ps.Slot = 'BIN_NA'  THEN ps.DecTime END), 0.0),
        NewDep    = ISNULL(MAX(CASE WHEN ps.Slot = 'DEP'     THEN ps.DecTime END), 0.0),
        NewDepNA  = ISNULL(MAX(CASE WHEN ps.Slot = 'DEP_NA'  THEN ps.DecTime END), 0.0)
    FROM #EmpShifts es
    LEFT JOIN PunchSlots ps ON es.EmpCode = ps.EmpCode AND es.DailyDate = ps.DailyDate
    GROUP BY es.EmpCode, es.DailyDate, es.ShiftCode, es.EmpEntry, es.EmpMstEntry, es.Yr, es.Month, es.f_half, es.s_half
),
RawCalc AS (
    SELECT 
        a.EmpCode, a.DailyDate, a.ShiftCode, a.EmpEntry, a.EmpMstEntry, a.Yr, a.Month, a.f_half, a.s_half,
        a.NewArr, a.NewArrNA, a.NewDep, a.NewDepNA, a.NewBOut, a.NewBOutNA, a.NewBIn, a.NewBInNA,
        HasAnyPunch = CASE 
            WHEN a.NewArr > 0 OR a.NewArrNA > 0 OR a.NewDep > 0 OR a.NewDepNA > 0 
              OR a.NewBOut > 0 OR a.NewBOutNA > 0 OR a.NewBIn > 0 OR a.NewBInNA > 0 
            THEN 1 ELSE 0 
        END,
        CalculatedEntry = CAST((CASE WHEN a.NewArr > 0 THEN 1 ELSE 0 END) + (CASE WHEN a.NewDep > 0 THEN 1 ELSE 0 END) + (CASE WHEN a.NewBOut > 0 THEN 1 ELSE 0 END) + (CASE WHEN a.NewBIn > 0 THEN 1 ELSE 0 END) AS real),
        NewCHQ = CASE 
            WHEN a.EmpMstEntry = 1 THEN ''
            WHEN ((CASE WHEN a.NewArr > 0 THEN 1 ELSE 0 END) + (CASE WHEN a.NewDep > 0 THEN 1 ELSE 0 END) + (CASE WHEN a.NewBOut > 0 THEN 1 ELSE 0 END) + (CASE WHEN a.NewBIn > 0 THEN 1 ELSE 0 END)) IN (1, 3) THEN '*' 
            ELSE '' 
        END,
        H1 = CASE WHEN a.NewArr > 0 AND a.NewBOut > 0 THEN 1 ELSE 0 END,
        H2 = CASE WHEN a.NewBIn > 0 AND a.NewDep > 0 THEN 1 ELSE 0 END
    FROM AggregatedSlots a
)
SELECT 
    rc.EmpCode, rc.DailyDate, rc.ShiftCode, rc.EmpEntry, rc.Yr, rc.Month,
    rc.NewArr, rc.NewArrNA, rc.NewDep, rc.NewDepNA, rc.NewBOut, rc.NewBOutNA, rc.NewBIn, rc.NewBInNA,
    FinalEntry = CASE 
        WHEN rc.EmpMstEntry = 1 THEN 
            CASE WHEN rc.CalculatedEntry > 0 THEN rc.CalculatedEntry WHEN rc.HasAnyPunch = 1 THEN 1.0 ELSE 0.0 END
        ELSE rc.CalculatedEntry 
    END,
    rc.NewCHQ,
    rc.H1,
    rc.H2,
    presabs = CASE 
        WHEN rc.EmpMstEntry = 1 THEN 
            CASE 
                WHEN rc.NewArr > 0 OR rc.NewArrNA > 0 THEN 'P P'
                WHEN rc.NewBIn > 0 OR rc.NewBInNA > 0 THEN 'A P'
                ELSE 'A A' 
            END
        WHEN rc.H1 = 1 AND rc.H2 = 1 THEN 'P P'
        WHEN rc.H1 = 1 AND rc.H2 = 0 THEN 'P A'
        WHEN rc.H1 = 0 AND rc.H2 = 1 THEN 'A P'
        ELSE 'A A' 
    END,
    present = CASE 
        WHEN rc.EmpMstEntry = 1 THEN 
            CASE 
                WHEN rc.NewArr > 0 OR rc.NewArrNA > 0 THEN 1.0
                WHEN rc.NewBIn > 0 OR rc.NewBInNA > 0 THEN 0.5
                ELSE 0.0 
            END
        WHEN rc.H1 = 1 AND rc.H2 = 1 THEN 1.0
        WHEN rc.H1 = 1 AND rc.H2 = 0 THEN 0.5
        WHEN rc.H1 = 0 AND rc.H2 = 1 THEN 0.5
        ELSE 0.0 
    END,
    wrkhrs = CASE 
        WHEN rc.EmpMstEntry = 1 THEN 
            CASE 
                WHEN rc.NewArr > 0 OR rc.NewArrNA > 0 THEN rc.f_half + rc.s_half 
                WHEN rc.NewBIn > 0 OR rc.NewBInNA > 0 THEN rc.s_half
                ELSE 0.0 
            END
        WHEN rc.H1 = 1 AND rc.H2 = 1 THEN rc.f_half + rc.s_half
        WHEN rc.H1 = 1 AND rc.H2 = 0 THEN rc.f_half
        WHEN rc.H1 = 0 AND rc.H2 = 1 THEN rc.s_half
        ELSE 0.0 
    END
INTO #TempUpdates
FROM RawCalc rc;

CREATE CLUSTERED INDEX IDX_TempUpdates ON #TempUpdates(EmpCode, DailyDate);

-- Step 7: UPDATE existing rows in MonthTrns
UPDATE m
SET 
    m.shift     = t.ShiftCode,
    m.arrtime   = t.NewArr, 
    m.ArrtimeNA = t.NewArrNA,
    m.deptime   = t.NewDep, 
    m.DeptimeNA = t.NewDepNA,
    m.actrt_o   = t.NewBOut, 
    m.actrt_oNA = t.NewBOutNA,
    m.actrt_i   = t.NewBIn, 
    m.actrt_iNA = t.NewBInNA,
    m.entry     = t.FinalEntry,
    m.entreq    = t.EmpEntry,
    m.chq       = t.NewCHQ,
    m.presabs   = t.presabs,
    m.present   = t.present,
    m.wrkhrs    = t.wrkhrs,
    m.upd_date  = SYSDATETIME()
FROM dbo.MonthTrns m
INNER JOIN #TempUpdates t ON m.EmpCode = t.EmpCode AND m.DailyDate = t.DailyDate;

PRINT 'MonthTrns UPDATE completed: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' row(s) updated.';

-- Step 8: INSERT missing rows into MonthTrns
INSERT INTO dbo.MonthTrns (
    EmpCode, DailyDate, shift, entry, entreq,
    arrtime, ArrtimeNA, actrt_o, actrt_oNA, actrt_i, actrt_iNA, deptime, DeptimeNA,
    latehrs, earlhrs, actbreak, wrkhrs, ovtime, present, presabs, chq,
    Yr, Month, upd_date
)
SELECT 
    t.EmpCode, t.DailyDate, t.ShiftCode, t.FinalEntry, t.EmpEntry,
    t.NewArr, t.NewArrNA, t.NewBOut, t.NewBOutNA, t.NewBIn, t.NewBInNA, t.NewDep, t.NewDepNA,
    0.0, 0.0, 0.0, t.wrkhrs, 0.0, t.present, t.presabs, t.NewCHQ,
    t.Yr, t.Month, SYSDATETIME()
FROM #TempUpdates t
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MonthTrns m WHERE m.EmpCode = t.EmpCode AND m.DailyDate = t.DailyDate
);

PRINT 'MonthTrns INSERT completed: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' row(s) inserted.';

-- Step 9: Clean up temporary tables
DROP TABLE #DateRange;
DROP TABLE #ActiveEmployees;
DROP TABLE #EmpShifts;
DROP TABLE #RawPunches;
DROP TABLE #TempUpdates;

PRINT 'All attendance processing successfully completed!';
";
}
