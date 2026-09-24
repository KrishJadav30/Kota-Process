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

-- Step 2: Unpivot punches, calculate midpoints, classify into slots, and calculate everything in memory
WITH MonthPunches AS (
    SELECT 
        m.EmpCode, 
        m.DailyDate,
        p.DecTime
    FROM dbo.MonthTrns m
    CROSS APPLY (
        SELECT DISTINCT DecTime FROM (VALUES 
            (m.arrtime), (m.ArrtimeNA), 
            (m.actrt_o), (m.actrt_oNA), 
            (m.actrt_i), (m.actrt_iNA), 
            (m.deptime), (m.DeptimeNA)
        ) AS v(DecTime)
        WHERE DecTime > 0
    ) p
    WHERE m.DailyDate >= CAST(@FromDate AS DATETIME) 
      AND m.DailyDate < DATEADD(DAY, 1, CAST(@ToDate AS DATETIME))
),
ShiftInfo AS (
    SELECT 
        m.EmpCode, 
        m.DailyDate,
        ISNULL(e.entry, 0) AS EmpMstEntry,
        CAST(ISNULL(e.location, '0') AS VARCHAR(50)) AS Location,
        RawArr = m.arrtime,
        RawBIn = m.actrt_i,
        s.f_half, 
        s.s_half,
        ISNULL(s.shf_in, 0.0) AS shf_in,
        ISNULL(s.shf_out, 0.0) AS shf_out,
        ISNULL(cd.lt_allow, 0.0) AS lt_allow,
        ISNULL(s.ShfInPunchStart, 0.0) AS ShfInPunchStart,
        ISNULL(s.ShfInPunchEnd, 0.0) AS ShfInPunchEnd,
        ISNULL(s.BrkOutPunchStart, 0.0) AS BrkOutPunchStart,
        ISNULL(s.BrkOutPunchEnd, 0.0) AS BrkOutPunchEnd,
        ISNULL(s.BrkInPunchStart, 0.0) AS BrkInPunchStart,
        ISNULL(s.BrkInPunchEnd, 0.0) AS BrkInPunchEnd,
        ISNULL(s.ShfOutPunchStart, 0.0) AS ShfOutPunchStart,
        ISNULL(s.ShfOutPunchEnd, 0.0) AS ShfOutPunchEnd,
        s.hdstart,
        Mid_Arr_BOut = CASE 
            WHEN s.BrkOutPunchStart > 0 AND s.BrkOutPunchStart > s.ShfInPunchEnd THEN
                CAST(((CAST(FLOOR(s.ShfInPunchEnd) AS INT)*60 + CAST(ROUND((s.ShfInPunchEnd - FLOOR(s.ShfInPunchEnd))*100.0, 0) AS INT)
                     + CAST(FLOOR(s.BrkOutPunchStart) AS INT)*60 + CAST(ROUND((s.BrkOutPunchStart - FLOOR(s.BrkOutPunchStart))*100.0, 0) AS INT))/2)/60
                     + (((CAST(FLOOR(s.ShfInPunchEnd) AS INT)*60 + CAST(ROUND((s.ShfInPunchEnd - FLOOR(s.ShfInPunchEnd))*100.0, 0) AS INT)
                     + CAST(FLOOR(s.BrkOutPunchStart) AS INT)*60 + CAST(ROUND((s.BrkOutPunchStart - FLOOR(s.BrkOutPunchStart))*100.0, 0) AS INT))/2)%60)/100.0 AS real)
            ELSE 0.0 END,
        Mid_BOut_BIn = CASE 
            WHEN s.BrkInPunchStart > 0 AND s.BrkOutPunchEnd > 0 AND s.BrkInPunchStart > s.BrkOutPunchEnd THEN
                CAST(((CAST(FLOOR(s.BrkOutPunchEnd) AS INT)*60 + CAST(ROUND((s.BrkOutPunchEnd - FLOOR(s.BrkOutPunchEnd))*100.0, 0) AS INT)
                     + CAST(FLOOR(s.BrkInPunchStart) AS INT)*60 + CAST(ROUND((s.BrkInPunchStart - FLOOR(s.BrkInPunchStart))*100.0, 0) AS INT))/2)/60
                     + (((CAST(FLOOR(s.BrkOutPunchEnd) AS INT)*60 + CAST(ROUND((s.BrkOutPunchEnd - FLOOR(s.BrkOutPunchEnd))*100.0, 0) AS INT)
                     + CAST(FLOOR(s.BrkInPunchStart) AS INT)*60 + CAST(ROUND((s.BrkInPunchStart - FLOOR(s.BrkInPunchStart))*100.0, 0) AS INT))/2)%60)/100.0 AS real)
            ELSE 0.0 END,
        Mid_BIn_Dep = CASE 
            WHEN s.ShfOutPunchStart > 0 AND s.BrkInPunchEnd > 0 AND s.ShfOutPunchStart > s.BrkInPunchEnd THEN
                CAST(((CAST(FLOOR(s.BrkInPunchEnd) AS INT)*60 + CAST(ROUND((s.BrkInPunchEnd - FLOOR(s.BrkInPunchEnd))*100.0, 0) AS INT)
                     + CAST(FLOOR(s.ShfOutPunchStart) AS INT)*60 + CAST(ROUND((s.ShfOutPunchStart - FLOOR(s.ShfOutPunchStart))*100.0, 0) AS INT))/2)/60
                     + (((CAST(FLOOR(s.BrkInPunchEnd) AS INT)*60 + CAST(ROUND((s.BrkInPunchEnd - FLOOR(s.BrkInPunchEnd))*100.0, 0) AS INT)
                     + CAST(FLOOR(s.ShfOutPunchStart) AS INT)*60 + CAST(ROUND((s.ShfOutPunchStart - FLOOR(s.ShfOutPunchStart))*100.0, 0) AS INT))/2)%60)/100.0 AS real)
            ELSE 0.0 END,
        Mid_Arr_BIn = CASE 
            WHEN ISNULL(s.BrkOutPunchStart, 0) = 0 AND s.BrkInPunchStart > 0 AND s.BrkInPunchStart > s.ShfInPunchEnd THEN
                CAST(((CAST(FLOOR(s.ShfInPunchEnd) AS INT)*60 + CAST(ROUND((s.ShfInPunchEnd - FLOOR(s.ShfInPunchEnd))*100.0, 0) AS INT)
                     + CAST(FLOOR(s.BrkInPunchStart) AS INT)*60 + CAST(ROUND((s.BrkInPunchStart - FLOOR(s.BrkInPunchStart))*100.0, 0) AS INT))/2)/60
                     + (((CAST(FLOOR(s.ShfInPunchEnd) AS INT)*60 + CAST(ROUND((s.ShfInPunchEnd - FLOOR(s.ShfInPunchEnd))*100.0, 0) AS INT)
                     + CAST(FLOOR(s.BrkInPunchStart) AS INT)*60 + CAST(ROUND((s.BrkInPunchStart - FLOOR(s.BrkInPunchStart))*100.0, 0) AS INT))/2)%60)/100.0 AS real)
            ELSE 0.0 END
    FROM dbo.MonthTrns m
    INNER JOIN dbo.instshft s ON m.shift = s.shift
    LEFT JOIN dbo.empmst e ON m.EmpCode = e.empcode
    LEFT JOIN dbo.catdesc cd ON e.cat = cd.cat
    WHERE m.DailyDate >= CAST(@FromDate AS DATETIME) 
      AND m.DailyDate < DATEADD(DAY, 1, CAST(@ToDate AS DATETIME))
),
PunchSlots AS (
    SELECT 
        si.EmpCode,
        si.DailyDate,
        mp.DecTime,
        Slot = CASE
            -- 1. In-Window Arrival
            WHEN mp.DecTime >= si.ShfInPunchStart AND mp.DecTime <= si.ShfInPunchEnd THEN 'ARR'
            
            -- 2. Early Arrival NA (before arrival window)
            WHEN mp.DecTime < si.ShfInPunchStart THEN 'ARR_NA'
            
            -- 3. In-Window Break Out
            WHEN si.BrkOutPunchStart > 0 AND mp.DecTime >= si.BrkOutPunchStart AND mp.DecTime <= si.BrkOutPunchEnd THEN 'BOUT'
            
            -- 4. Between Arrival End and Break Out Start (Window divided by 2: closer to ARR -> ARR_NA, closer to BOUT -> BOUT_NA)
            WHEN si.BrkOutPunchStart > 0 AND mp.DecTime > si.ShfInPunchEnd AND mp.DecTime < si.Mid_Arr_BOut THEN 'ARR_NA'
            WHEN si.BrkOutPunchStart > 0 AND mp.DecTime >= si.Mid_Arr_BOut AND mp.DecTime < si.BrkOutPunchStart THEN 'BOUT_NA'
            
            -- 5. In-Window Break In
            WHEN si.BrkInPunchStart > 0 AND mp.DecTime >= si.BrkInPunchStart AND mp.DecTime <= si.BrkInPunchEnd THEN 'BIN'
            
            -- 6. Between Break Out End and Break In Start (Window divided by 2: e.g. 11.15-11.30 -> BOUT_NA, 11.30-11.45 -> BIN_NA)
            WHEN si.BrkInPunchStart > 0 AND si.BrkOutPunchEnd > 0 AND mp.DecTime > si.BrkOutPunchEnd AND mp.DecTime < si.Mid_BOut_BIn THEN 'BOUT_NA'
            WHEN si.BrkInPunchStart > 0 AND si.BrkOutPunchEnd > 0 AND mp.DecTime >= si.Mid_BOut_BIn AND mp.DecTime < si.BrkInPunchStart THEN 'BIN_NA'
            
            -- 7. In-Window Departure
            WHEN si.ShfOutPunchStart > 0 AND mp.DecTime >= si.ShfOutPunchStart AND mp.DecTime <= si.ShfOutPunchEnd THEN 'DEP'
            
            -- 8. Between Break In End and Departure Start (Window divided by 2: closer to BIN -> BIN_NA, closer to DEP -> DEP_NA)
            WHEN si.BrkInPunchEnd > 0 AND si.ShfOutPunchStart > 0 AND mp.DecTime > si.BrkInPunchEnd AND mp.DecTime < si.Mid_BIn_Dep THEN 'BIN_NA'
            WHEN si.BrkInPunchEnd > 0 AND si.ShfOutPunchStart > 0 AND mp.DecTime >= si.Mid_BIn_Dep AND mp.DecTime < si.ShfOutPunchStart THEN 'DEP_NA'
            
            -- 9. Late Departure NA (after Departure end)
            WHEN si.ShfOutPunchEnd > 0 AND mp.DecTime > si.ShfOutPunchEnd THEN 'DEP_NA'
            
            -- Handling for shifts without break-out window, but with break-in window (e.g. AS, TOA)
            WHEN ISNULL(si.BrkOutPunchStart, 0) = 0 AND si.BrkInPunchStart > 0 AND mp.DecTime > si.ShfInPunchEnd AND mp.DecTime < si.Mid_Arr_BIn THEN 'ARR_NA'
            WHEN ISNULL(si.BrkOutPunchStart, 0) = 0 AND si.BrkInPunchStart > 0 AND mp.DecTime >= si.Mid_Arr_BIn AND mp.DecTime < si.BrkInPunchStart THEN 'BIN_NA'
            WHEN ISNULL(si.BrkOutPunchStart, 0) = 0 AND si.BrkInPunchStart > 0 AND si.BrkInPunchEnd > 0 AND mp.DecTime > si.BrkInPunchEnd THEN 'BIN_NA'

            -- Handling for shifts without any break windows (BrkOutPunchStart = 0 and BrkInPunchStart = 0)
            WHEN ISNULL(si.BrkOutPunchStart, 0) = 0 AND ISNULL(si.BrkInPunchStart, 0) = 0 AND mp.DecTime > si.ShfInPunchEnd AND mp.DecTime < ISNULL(si.hdstart, (si.shf_in + si.shf_out)/2.0) THEN 'ARR_NA'
            WHEN ISNULL(si.BrkOutPunchStart, 0) = 0 AND ISNULL(si.BrkInPunchStart, 0) = 0 AND mp.DecTime >= ISNULL(si.hdstart, (si.shf_in + si.shf_out)/2.0) AND mp.DecTime < si.ShfOutPunchStart THEN 'DEP_NA'
            
            ELSE 'DEP_NA'
        END
    FROM ShiftInfo si
    INNER JOIN MonthPunches mp ON si.EmpCode = mp.EmpCode AND si.DailyDate = mp.DailyDate
),
RawCalc AS (
    SELECT 
        si.EmpCode, 
        si.DailyDate,
        si.EmpMstEntry,
        si.Location,
        si.RawArr,
        si.RawBIn,
        NewArr    = ISNULL(MAX(CASE WHEN ps.Slot = 'ARR'     THEN ps.DecTime END), 0.0),
        NewArrNA  = ISNULL(MAX(CASE WHEN ps.Slot = 'ARR_NA'  THEN ps.DecTime END), 0.0),
        NewBOut   = ISNULL(MAX(CASE WHEN ps.Slot = 'BOUT'    THEN ps.DecTime END), 0.0),
        NewBOutNA = ISNULL(MAX(CASE WHEN ps.Slot = 'BOUT_NA' THEN ps.DecTime END), 0.0),
        NewBIn    = ISNULL(MAX(CASE WHEN ps.Slot = 'BIN'     THEN ps.DecTime END), 0.0),
        NewBInNA  = ISNULL(MAX(CASE WHEN ps.Slot = 'BIN_NA'  THEN ps.DecTime END), 0.0),
        NewDep    = ISNULL(MAX(CASE WHEN ps.Slot = 'DEP'     THEN ps.DecTime END), 0.0),
        NewDepNA  = ISNULL(MAX(CASE WHEN ps.Slot = 'DEP_NA'  THEN ps.DecTime END), 0.0),
        si.f_half, 
        si.s_half,
        si.shf_in,
        si.shf_out,
        si.lt_allow,
        si.ShfInPunchStart,
        si.ShfInPunchEnd,
        si.ShfOutPunchStart,
        si.ShfOutPunchEnd
    FROM ShiftInfo si
    LEFT JOIN PunchSlots ps ON si.EmpCode = ps.EmpCode AND si.DailyDate = ps.DailyDate
    GROUP BY si.EmpCode, si.DailyDate, si.EmpMstEntry, si.Location, si.RawArr, si.RawBIn,
             si.f_half, si.s_half, si.shf_in, si.shf_out, si.lt_allow,
             si.ShfInPunchStart, si.ShfInPunchEnd, si.ShfOutPunchStart, si.ShfOutPunchEnd
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
    
    -- Evaluate H1 (First Half)
    H1 = CASE 
        WHEN NewArr > 0 AND NewBOut > 0 THEN 1 
        WHEN NewArr > 0 AND NewDep > 0 AND NewBOut = 0 AND NewBIn = 0 THEN 1 
        WHEN NewArr > 0 AND NewBIn > 0 AND NewBOut = 0 AND NewDep = 0 THEN 1 
        ELSE 0 
    END,
        
    -- Evaluate H2 (Second Half)
    H2 = CASE 
        WHEN NewBIn > 0 AND NewDep > 0 THEN 1 
        WHEN NewArr > 0 AND NewDep > 0 AND NewBOut = 0 AND NewBIn = 0 THEN 1 
        WHEN NewBOut > 0 AND NewDep > 0 AND NewArr = 0 AND NewBIn = 0 THEN 1 
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
    END,                                                      -- A A
    m.NDAHrs = 0.0

FROM dbo.MonthTrns m
INNER JOIN #TempUpdates t ON m.EmpCode = t.EmpCode AND m.DailyDate = t.DailyDate;

PRINT 'MonthTrns UPDATE completed: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' row(s) updated.';

-- Step 5: Update NDAHrs based on shift and presabs
UPDATE dbo.MonthTrns
SET NDAHrs = ISNULL(NDAHrs, 0) + 
    CASE 
        -- Shifts D, DS
        WHEN shift IN ('D', 'DS') AND presabs IN ('P P ', 'A P ') THEN 2.3
        
        -- Shift D1
        WHEN shift = 'D1' AND presabs IN ('P P ', 'A P ') THEN 1.0
        
        -- Shifts D2, D3
        WHEN shift IN ('D2', 'D3') AND presabs IN ('P P ', 'A P ') THEN 2.0
        
        -- Shift E
        WHEN shift = 'E' AND presabs = 'P P ' THEN 7.0
        WHEN shift = 'E' AND presabs = 'P A ' THEN 4.0
        WHEN shift = 'E' AND presabs = 'A P ' THEN 3.0
        
        -- Shift G
        WHEN shift = 'G' AND presabs = 'P P ' THEN 6.3
        WHEN shift = 'G' AND presabs = 'P A ' THEN 4.0
        WHEN shift = 'G' AND presabs = 'A P ' THEN 2.3
        
        -- Default case to add 0 if conditions aren't met
        ELSE 0 
    END 
WHERE shift IN ('D', 'DS', 'D1', 'D2', 'D3', 'E', 'G')
  AND DailyDate >= CAST(@FromDate AS DATETIME) 
  AND DailyDate < DATEADD(DAY, 1, CAST(@ToDate AS DATETIME));

PRINT 'MonthTrns NDAHrs UPDATE completed: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' row(s) updated.';

-- Step 6: Clean up memory
DROP TABLE #TempUpdates;

PRINT 'Manual swapping operation successfully completed!';
";
}
