using System.Data;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace KotaProcess.Api.Services;

public class LocationDto
{
    public string Location { get; set; } = string.Empty;
    public string LocDesc { get; set; } = string.Empty;
    public int EmployeeCount { get; set; }
}

public class EmployeeDto
{
    public string EmpCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public double Entry { get; set; }
    public string? Location { get; set; }
    public string? LocationDesc { get; set; }
    public string? Designation { get; set; }
    public string? Department { get; set; }
    public string? Category { get; set; }
}

public interface IEmployeeProcessService
{
    Task<List<EmployeeDto>> GetEmployeesAsync();
    Task<List<LocationDto>> GetLocationsAsync();
    Task<EmployeeProcessHistoryRecord> ExecuteEmployeeProcessAsync(
        DateTime fromDate, 
        DateTime toDate, 
        int targetEntry, 
        List<string> empCodes, 
        string triggerSource = "Employee Wise Process");
}

public class EmployeeProcessService : IEmployeeProcessService
{
    private readonly IEnvService _envService;
    private readonly ILogService _logService;
    private readonly IEmployeeProcessHistoryService _historyService;
    private readonly ILogger<EmployeeProcessService> _logger;

    public EmployeeProcessService(
        IEnvService envService,
        ILogService logService,
        IEmployeeProcessHistoryService historyService,
        ILogger<EmployeeProcessService> logger)
    {
        _envService = envService;
        _logService = logService;
        _historyService = historyService;
        _logger = logger;
    }

    public async Task<List<EmployeeDto>> GetEmployeesAsync()
    {
        var result = new List<EmployeeDto>();
        var connectionString = _envService.ConnectionString;

        using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();

        const string sql = @"
            SELECT 
                e.empcode, 
                e.name, 
                ISNULL(e.entry, 0) AS entry, 
                ISNULL(e.location, '') AS location,
                ISNULL(l.LocDesc, '') AS locdesc,
                e.designatn, 
                e.dept, 
                e.cat
            FROM dbo.empmst e
            LEFT JOIN dbo.location l ON RTRIM(LTRIM(e.Location)) = RTRIM(LTRIM(l.Location))
            ORDER BY e.empcode ASC;
        ";

        using var cmd = new SqlCommand(sql, connection);
        cmd.CommandTimeout = 30;

        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(new EmployeeDto
            {
                EmpCode = reader["empcode"]?.ToString()?.Trim() ?? string.Empty,
                Name = reader["name"]?.ToString()?.Trim() ?? string.Empty,
                Entry = Convert.ToDouble(reader["entry"] == DBNull.Value ? 0 : reader["entry"]),
                Location = reader["location"]?.ToString()?.Trim(),
                LocationDesc = reader["locdesc"]?.ToString()?.Trim(),
                Designation = reader["designatn"]?.ToString()?.Trim(),
                Department = reader["dept"]?.ToString()?.Trim(),
                Category = reader["cat"]?.ToString()?.Trim()
            });
        }

        return result;
    }

    public async Task<List<LocationDto>> GetLocationsAsync()
    {
        var result = new List<LocationDto>();
        var connectionString = _envService.ConnectionString;

        using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();

        const string sql = @"
            SELECT 
                l.Location, 
                l.LocDesc,
                COUNT(e.empcode) AS EmployeeCount
            FROM dbo.location l
            LEFT JOIN dbo.empmst e ON RTRIM(LTRIM(e.Location)) = RTRIM(LTRIM(l.Location))
            GROUP BY l.Location, l.LocDesc
            ORDER BY l.Location ASC;
        ";

        using var cmd = new SqlCommand(sql, connection);
        cmd.CommandTimeout = 30;

        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(new LocationDto
            {
                Location = reader["Location"]?.ToString()?.Trim() ?? string.Empty,
                LocDesc = reader["LocDesc"]?.ToString()?.Trim() ?? string.Empty,
                EmployeeCount = Convert.ToInt32(reader["EmployeeCount"] == DBNull.Value ? 0 : reader["EmployeeCount"])
            });
        }

        return result;
    }

    public async Task<EmployeeProcessHistoryRecord> ExecuteEmployeeProcessAsync(
        DateTime fromDate, 
        DateTime toDate, 
        int targetEntry, 
        List<string> empCodes, 
        string triggerSource = "Employee Wise Process")
    {
        if (fromDate > toDate)
        {
            (fromDate, toDate) = (toDate, fromDate);
        }

        // Validate targetEntry (must be 2 or 4)
        if (targetEntry != 2 && targetEntry != 4)
        {
            targetEntry = 4;
        }

        var distinctCodes = empCodes
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Select(c => c.Trim())
            .Distinct()
            .ToList();

        if (distinctCodes.Count == 0)
        {
            throw new ArgumentException("At least one employee must be selected for processing.", nameof(empCodes));
        }

        var isSingleDay = fromDate.Date == toDate.Date;
        var dateRangeStr = isSingleDay
            ? fromDate.ToString("yyyy-MM-dd")
            : $"{fromDate:yyyy-MM-dd} to {toDate:yyyy-MM-dd}";

        var stopwatch = Stopwatch.StartNew();
        var fullTrigger = $"{triggerSource} (Entry {targetEntry} - {distinctCodes.Count} emps)";

        var record = new EmployeeProcessHistoryRecord
        {
            ProcessDate = dateRangeStr,
            ExecutedAt = DateTime.UtcNow,
            TriggerSource = fullTrigger,
            TargetEntry = targetEntry,
            EmployeeCount = distinctCodes.Count,
            EmpCodes = distinctCodes.ToList()
        };

        var logFile = _logService.GetCurrentLogFileName();
        _logger.LogInformation("================================================================================");
        _logger.LogInformation("👥 [EMPLOYEE WISE PROCESS] Starting processing for {Count} employees, Entry {TargetEntry}, Range: {DateRange}", 
            distinctCodes.Count, targetEntry, dateRangeStr);
        _logger.LogInformation("📅 Trigger: {Trigger} | Target DB: {Server}/{Database} | Log: {LogFile}", 
            fullTrigger, _envService.DbServer, _envService.DbDatabase, logFile);

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

            // 1. Create temporary table for selected employee codes
            using (var createCmd = new SqlCommand(@"
                IF OBJECT_ID('tempdb..#SelectedEmployees') IS NOT NULL DROP TABLE #SelectedEmployees;
                CREATE TABLE #SelectedEmployees (EmpCode NVARCHAR(50) NOT NULL PRIMARY KEY);
            ", connection))
            {
                await createCmd.ExecuteNonQueryAsync();
            }

            // 2. Stream distinct employee codes into #SelectedEmployees via fast SqlBulkCopy
            var dt = new DataTable();
            dt.Columns.Add("EmpCode", typeof(string));
            foreach (var code in distinctCodes)
            {
                dt.Rows.Add(code);
            }

            using (var bulkCopy = new SqlBulkCopy(connection))
            {
                bulkCopy.DestinationTableName = "#SelectedEmployees";
                bulkCopy.BulkCopyTimeout = 60;
                await bulkCopy.WriteToServerAsync(dt);
            }

            _logger.LogInformation("📋 Successfully loaded {Count} employee codes into #SelectedEmployees.", distinctCodes.Count);

            // 3. Execute Employee Attendance Processing Query
            using var command = new SqlCommand(EmployeeAttendanceSqlScript, connection)
            {
                CommandTimeout = 600 // 10 minutes timeout for batch operations
            };

            command.Parameters.Add(new SqlParameter("@ParamFromDate", SqlDbType.Date)
            {
                Value = fromDate.Date
            });
            command.Parameters.Add(new SqlParameter("@ParamToDate", SqlDbType.Date)
            {
                Value = toDate.Date
            });
            command.Parameters.Add(new SqlParameter("@ParamTargetEntry", SqlDbType.Real)
            {
                Value = (float)targetEntry
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
            var empCodesSummary = distinctCodes.Count <= 5 
                ? string.Join(", ", distinctCodes) 
                : $"{string.Join(", ", distinctCodes.Take(5))} (+{distinctCodes.Count - 5} more)";
            record.Message = $"Processed for empcodes: {empCodesSummary}. Completed in {record.DurationMs}ms. Updated {record.RowsUpdated} rows, Inserted {record.RowsInserted} rows for {distinctCodes.Count} employees (Entry {targetEntry}).";
            _logger.LogInformation("✨ [EMPLOYEE WISE PROCESS] Finished successfully at {Time} for empcodes [{Codes}] ({DateRange}): {RowsUpdated} updated, {RowsInserted} inserted in {Duration}ms.",
                runTimeClock, empCodesSummary, dateRangeStr, record.RowsUpdated, record.RowsInserted, record.DurationMs);
            _logger.LogInformation("================================================================================");
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            record.DurationMs = stopwatch.ElapsedMilliseconds;
            record.Status = "Failed";
            record.ErrorMessage = ex.Message;
            var runTimeClock = DateTime.Now.ToString("hh:mm:ss tt");
            var empCodesSummary = distinctCodes.Count <= 5 
                ? string.Join(", ", distinctCodes) 
                : $"{string.Join(", ", distinctCodes.Take(5))} (+{distinctCodes.Count - 5} more)";
            record.Message = $"Processed for empcodes: {empCodesSummary}. Failed: {ex.Message}";

            _logger.LogError(ex, "❌ [EMPLOYEE WISE PROCESS] Failed at {Time} for empcodes [{Codes}] ({DateRange}) after {Duration}ms: {Error}",
                runTimeClock, empCodesSummary, dateRangeStr, record.DurationMs, ex.Message);
            _logger.LogInformation("================================================================================");
        }

        // Save record to persistent employee process history
        await _historyService.AddRecordAsync(record);
        return record;
    }

    private const string EmployeeAttendanceSqlScript = @"
SET NOCOUNT ON;

DECLARE @FromDate    DATE = @ParamFromDate;
DECLARE @ToDate      DATE = @ParamToDate;
DECLARE @TargetEntry REAL = @ParamTargetEntry;

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

-- Step 2: Get ONLY the selected employees from #SelectedEmployees joined with empmst
SELECT DISTINCT 
    e.empcode AS EmpCode, 
    ISNULL(e.entry, 0) AS EmpMstEntry, 
    CAST(ISNULL(e.location, '0') AS VARCHAR(50)) AS Location,
    ISNULL(cd.lt_allow, 0.0) AS lt_allow
INTO #ActiveEmployees
FROM dbo.empmst e
INNER JOIN #SelectedEmployees se ON e.empcode = se.EmpCode
LEFT JOIN dbo.catdesc cd ON e.cat = cd.cat;

CREATE CLUSTERED INDEX IDX_ActiveEmployees ON #ActiveEmployees(EmpCode);

-- Step 3: Shift assignments from MonthShift D1-D31 joined with instshft
-- Rule: If EmpMstEntry = 1 then EmpEntry = 1.0 (Entry 1 rule preserved), otherwise @TargetEntry (2.0 or 4.0)
SELECT 
    ae.EmpCode,
    d.DailyDate,
    ae.EmpMstEntry,
    ae.Location,
    ae.lt_allow,
    CAST(CASE WHEN ae.EmpMstEntry = 1 THEN 1.0 ELSE @TargetEntry END AS real) AS EmpEntry,
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
    END AS Month,
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

-- Step 5: Mutually Exclusive Punch Slot Classification
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
            
            -- 4. Between Arrival End and Break Out Start (Window divided by 2: closer to ARR -> ARR_NA, closer to BOUT -> BOUT_NA)
            WHEN es.BrkOutPunchStart > 0 AND rp.DecTime > es.ShfInPunchEnd AND rp.DecTime < es.Mid_Arr_BOut THEN 'ARR_NA'
            WHEN es.BrkOutPunchStart > 0 AND rp.DecTime >= es.Mid_Arr_BOut AND rp.DecTime < es.BrkOutPunchStart THEN 'BOUT_NA'
            
            -- 5. In-Window Break In
            WHEN es.BrkInPunchStart > 0 AND rp.DecTime >= es.BrkInPunchStart AND rp.DecTime <= es.BrkInPunchEnd THEN 'BIN'
            
            -- 6. Between Break Out End and Break In Start (Window divided by 2: e.g. 11.15-11.30 -> BOUT_NA, 11.30-11.45 -> BIN_NA)
            WHEN es.BrkInPunchStart > 0 AND es.BrkOutPunchEnd > 0 AND rp.DecTime > es.BrkOutPunchEnd AND rp.DecTime < es.Mid_BOut_BIn THEN 'BOUT_NA'
            WHEN es.BrkInPunchStart > 0 AND es.BrkOutPunchEnd > 0 AND rp.DecTime >= es.Mid_BOut_BIn AND rp.DecTime < es.BrkInPunchStart THEN 'BIN_NA'
            
            -- 7. In-Window Departure
            WHEN es.ShfOutPunchStart > 0 AND rp.DecTime >= es.ShfOutPunchStart AND rp.DecTime <= es.ShfOutPunchEnd THEN 'DEP'
            
            -- 8. Between Break In End and Departure Start (Window divided by 2: closer to BIN -> BIN_NA, closer to DEP -> DEP_NA)
            WHEN es.BrkInPunchEnd > 0 AND es.ShfOutPunchStart > 0 AND rp.DecTime > es.BrkInPunchEnd AND rp.DecTime < es.Mid_BIn_Dep THEN 'BIN_NA'
            WHEN es.BrkInPunchEnd > 0 AND es.ShfOutPunchStart > 0 AND rp.DecTime >= es.Mid_BIn_Dep AND rp.DecTime < es.ShfOutPunchStart THEN 'DEP_NA'
            
            -- 9. Late Departure NA (after Departure end)
            WHEN es.ShfOutPunchEnd > 0 AND rp.DecTime > es.ShfOutPunchEnd THEN 'DEP_NA'
            
            -- Handling for shifts without break-out window, but with break-in window (e.g. AS, TOA)
            WHEN ISNULL(es.BrkOutPunchStart, 0) = 0 AND es.BrkInPunchStart > 0 AND rp.DecTime > es.ShfInPunchEnd AND rp.DecTime < es.Mid_Arr_BIn THEN 'ARR_NA'
            WHEN ISNULL(es.BrkOutPunchStart, 0) = 0 AND es.BrkInPunchStart > 0 AND rp.DecTime >= es.Mid_Arr_BIn AND rp.DecTime < es.BrkInPunchStart THEN 'BIN_NA'
            WHEN ISNULL(es.BrkOutPunchStart, 0) = 0 AND es.BrkInPunchStart > 0 AND es.BrkInPunchEnd > 0 AND rp.DecTime > es.BrkInPunchEnd THEN 'BIN_NA'

            -- Handling for shifts without any break windows (BrkOutPunchStart = 0 and BrkInPunchStart = 0)
            WHEN ISNULL(es.BrkOutPunchStart, 0) = 0 AND ISNULL(es.BrkInPunchStart, 0) = 0 AND rp.DecTime > es.ShfInPunchEnd AND rp.DecTime < ISNULL(es.hdstart, (es.shf_in + es.shf_out)/2.0) THEN 'ARR_NA'
            WHEN ISNULL(es.BrkOutPunchStart, 0) = 0 AND ISNULL(es.BrkInPunchStart, 0) = 0 AND rp.DecTime >= ISNULL(es.hdstart, (es.shf_in + es.shf_out)/2.0) AND rp.DecTime < es.ShfOutPunchStart THEN 'DEP_NA'
            
            ELSE 'DEP_NA'
        END
    FROM #EmpShifts es
    INNER JOIN #RawPunches rp ON es.EmpCode = rp.EmpCode AND es.DailyDate = rp.DailyDate
),
AggregatedSlots AS (
    SELECT 
        es.EmpCode, 
        CAST(es.DailyDate AS DATETIME) AS DailyDate, 
        es.ShiftCode, es.EmpEntry, es.EmpMstEntry, es.Location, es.Yr, es.Month, es.f_half, es.s_half,
        ISNULL(es.shf_in, 0.0) AS shf_in,
        ISNULL(es.shf_out, 0.0) AS shf_out,
        ISNULL(es.lt_allow, 0.0) AS lt_allow,
        ISNULL(es.ShfInPunchStart, 0.0) AS ShfInPunchStart,
        ISNULL(es.ShfInPunchEnd, 0.0) AS ShfInPunchEnd,
        ISNULL(es.ShfOutPunchStart, 0.0) AS ShfOutPunchStart,
        ISNULL(es.ShfOutPunchEnd, 0.0) AS ShfOutPunchEnd,
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
    GROUP BY es.EmpCode, es.DailyDate, es.ShiftCode, es.EmpEntry, es.EmpMstEntry, es.Location, es.Yr, es.Month, es.f_half, es.s_half,
             es.shf_in, es.shf_out, es.lt_allow,
             es.ShfInPunchStart, es.ShfInPunchEnd, es.ShfOutPunchStart, es.ShfOutPunchEnd
),
PreCalc AS (
    SELECT 
        a.*,
        CalcPunches = (CASE WHEN a.NewArr > 0 THEN 1 ELSE 0 END) + (CASE WHEN a.NewDep > 0 THEN 1 ELSE 0 END) + (CASE WHEN a.NewBOut > 0 THEN 1 ELSE 0 END) + (CASE WHEN a.NewBIn > 0 THEN 1 ELSE 0 END),
        RawLateMin = CASE 
            WHEN a.NewArr > 0 AND a.shf_in > 0 
            THEN (CAST(FLOOR(a.NewArr) AS INT) * 60 + CAST(ROUND((a.NewArr - FLOOR(a.NewArr)) * 100.0, 0) AS INT))
               - (CAST(FLOOR(a.shf_in) AS INT) * 60 + CAST(ROUND((a.shf_in - FLOOR(a.shf_in)) * 100.0, 0) AS INT))
            ELSE 0 
        END,
        LtAllowMin = CASE 
            WHEN a.lt_allow > 0 
            THEN (CAST(FLOOR(a.lt_allow) AS INT) * 60 + CAST(ROUND((a.lt_allow - FLOOR(a.lt_allow)) * 100.0, 0) AS INT))
            ELSE 0 
        END,
        DiffEarl = CASE 
            WHEN a.NewDep > 0 AND a.shf_out > 0 
            THEN (CAST(FLOOR(a.shf_out) AS INT) * 60 + CAST(ROUND((a.shf_out - FLOOR(a.shf_out)) * 100.0, 0) AS INT))
               - (CAST(FLOOR(a.NewDep) AS INT) * 60 + CAST(ROUND((a.NewDep - FLOOR(a.NewDep)) * 100.0, 0) AS INT))
            ELSE 0 
        END
    FROM AggregatedSlots a
),
RawCalc AS (
    SELECT 
        a.EmpCode, a.DailyDate, a.ShiftCode, 
        DiffLate = CASE 
            WHEN ABS(a.RawLateMin) <= a.LtAllowMin THEN 0 
            ELSE a.RawLateMin 
        END,
        a.DiffEarl,
        EmpEntry = CASE 
            WHEN a.Location = '6028' AND a.CalcPunches = 1 THEN 1.0
            WHEN a.Location = '6028' THEN @TargetEntry
            ELSE a.EmpEntry
        END,
        EmpMstEntry = CASE 
            WHEN a.Location = '6028' AND a.CalcPunches = 1 THEN 1
            WHEN a.Location = '6028' THEN CAST(@TargetEntry AS INT)
            ELSE a.EmpMstEntry
        END,
        a.Yr, a.Month, a.f_half, a.s_half,
        a.NewArr, a.NewArrNA, a.NewDep, a.NewDepNA, a.NewBOut, a.NewBOutNA, a.NewBIn, a.NewBInNA,
        HasAnyPunch = CASE 
            WHEN a.NewArr > 0 OR a.NewArrNA > 0 OR a.NewDep > 0 OR a.NewDepNA > 0 
              OR a.NewBOut > 0 OR a.NewBOutNA > 0 OR a.NewBIn > 0 OR a.NewBInNA > 0 
            THEN 1 ELSE 0 
        END,
        CalculatedEntry = CAST(a.CalcPunches AS real),
        NewCHQ = CASE 
            WHEN (CASE 
                    WHEN a.Location = '6028' AND a.CalcPunches = 1 THEN 1
                    WHEN a.Location = '6028' THEN CAST(@TargetEntry AS INT)
                    ELSE a.EmpMstEntry
                  END) = 1 THEN ''
            WHEN @TargetEntry = 2 AND a.CalcPunches = 1 THEN '*'
            WHEN @TargetEntry = 4 AND a.CalcPunches IN (1, 3) THEN '*' 
            ELSE '' 
        END,
        H1 = CASE 
            WHEN a.NewArr > 0 AND a.NewBOut > 0 THEN 1 
            WHEN a.NewArr > 0 AND a.NewDep > 0 AND a.NewBOut = 0 AND a.NewBIn = 0 THEN 1 
            WHEN a.NewArr > 0 AND a.NewBIn > 0 AND a.NewBOut = 0 AND a.NewDep = 0 THEN 1 
            ELSE 0 
        END,
        H2 = CASE 
            WHEN a.NewBIn > 0 AND a.NewDep > 0 THEN 1 
            WHEN a.NewArr > 0 AND a.NewDep > 0 AND a.NewBOut = 0 AND a.NewBIn = 0 THEN 1 
            WHEN a.NewBOut > 0 AND a.NewDep > 0 AND a.NewArr = 0 AND a.NewBIn = 0 THEN 1 
            ELSE 0 
        END
    FROM PreCalc a
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
                WHEN rc.NewArr > 0 THEN 'P P'
                WHEN rc.NewBIn > 0 THEN 'A P'
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
                WHEN rc.NewArr > 0 THEN 1.0
                WHEN rc.NewBIn > 0 THEN 0.5
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
                WHEN rc.NewArr > 0 THEN rc.f_half + rc.s_half
                WHEN rc.NewBIn > 0 THEN rc.s_half
                ELSE 0.0 
            END
        WHEN rc.H1 = 1 AND rc.H2 = 1 THEN rc.f_half + rc.s_half
        WHEN rc.H1 = 1 AND rc.H2 = 0 THEN rc.f_half
        WHEN rc.H1 = 0 AND rc.H2 = 1 THEN rc.s_half
        ELSE 0.0 
    END,
    latehrs = CASE 
        WHEN rc.DiffLate = 0 THEN 0.0
        WHEN rc.DiffLate > 0 THEN CAST((rc.DiffLate / 60) + ((rc.DiffLate % 60) / 100.0) AS real)
        ELSE CAST(-1.0 * ((ABS(rc.DiffLate) / 60) + ((ABS(rc.DiffLate) % 60) / 100.0)) AS real)
    END,
    earlhrs = CASE 
        WHEN rc.DiffEarl = 0 THEN 0.0
        WHEN rc.DiffEarl > 0 THEN CAST((rc.DiffEarl / 60) + ((rc.DiffEarl % 60) / 100.0) AS real)
        ELSE CAST(-1.0 * ((ABS(rc.DiffEarl) / 60) + ((ABS(rc.DiffEarl) % 60) / 100.0)) AS real)
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
    m.latehrs   = t.latehrs,
    m.earlhrs   = t.earlhrs,
    m.entry     = t.FinalEntry,
    m.entreq    = t.EmpEntry,
    m.chq       = t.NewCHQ,
    m.presabs   = t.presabs,
    m.present   = t.present,
    m.wrkhrs    = t.wrkhrs,
    m.NDAHrs    = 0.0,
    m.upd_date  = SYSDATETIME()
FROM dbo.MonthTrns m
INNER JOIN #TempUpdates t ON m.EmpCode = t.EmpCode AND m.DailyDate = t.DailyDate;

PRINT 'MonthTrns UPDATE completed: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' row(s) updated.';

-- Step 8: INSERT missing rows into MonthTrns
INSERT INTO dbo.MonthTrns (
    EmpCode, DailyDate, shift, entry, entreq,
    arrtime, ArrtimeNA, actrt_o, actrt_oNA, actrt_i, actrt_iNA, deptime, DeptimeNA,
    latehrs, earlhrs, actbreak, wrkhrs, ovtime, present, presabs, chq,
    Yr, Month, upd_date, NDAHrs
)
SELECT 
    t.EmpCode, t.DailyDate, t.ShiftCode, t.FinalEntry, t.EmpEntry,
    t.NewArr, t.NewArrNA, t.NewBOut, t.NewBOutNA, t.NewBIn, t.NewBInNA, t.NewDep, t.NewDepNA,
    t.latehrs, t.earlhrs, 0.0, t.wrkhrs, 0.0, t.present, t.presabs, t.NewCHQ,
    t.Yr, t.Month, SYSDATETIME(), 0.0
FROM #TempUpdates t
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MonthTrns m WHERE m.EmpCode = t.EmpCode AND m.DailyDate = t.DailyDate
);

PRINT 'MonthTrns INSERT completed: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' row(s) inserted.';

-- Step 9: Update NDAHrs based on shift and presabs for the processed rows
UPDATE m
SET NDAHrs = ISNULL(m.NDAHrs, 0) + 
    CASE 
        -- Shifts D, DS
        WHEN m.shift IN ('D', 'DS') AND m.presabs IN ('P P ', 'A P ') THEN 2.3
        
        -- Shift D1
        WHEN m.shift = 'D1' AND m.presabs IN ('P P ', 'A P ') THEN 1.0
        
        -- Shifts D2, D3
        WHEN m.shift IN ('D2', 'D3') AND m.presabs IN ('P P ', 'A P ') THEN 2.0
        
        -- Shift E
        WHEN m.shift = 'E' AND m.presabs = 'P P ' THEN 7.0
        WHEN m.shift = 'E' AND m.presabs = 'P A ' THEN 4.0
        WHEN m.shift = 'E' AND m.presabs = 'A P ' THEN 3.0
        
        -- Shift G
        WHEN m.shift = 'G' AND m.presabs = 'P P ' THEN 6.3
        WHEN m.shift = 'G' AND m.presabs = 'P A ' THEN 4.0
        WHEN m.shift = 'G' AND m.presabs = 'A P ' THEN 2.3
        
        -- Default case to add 0 if conditions aren't met
        ELSE 0 
    END 
FROM dbo.MonthTrns m
INNER JOIN #TempUpdates t ON m.EmpCode = t.EmpCode AND m.DailyDate = t.DailyDate
WHERE m.shift IN ('D', 'DS', 'D1', 'D2', 'D3', 'E', 'G');

PRINT 'MonthTrns NDAHrs UPDATE completed: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' row(s) updated.';

-- Step 10: Clean up temporary tables
DROP TABLE #DateRange;
DROP TABLE #ActiveEmployees;
DROP TABLE #EmpShifts;
DROP TABLE #RawPunches;
DROP TABLE #TempUpdates;
IF OBJECT_ID('tempdb..#SelectedEmployees') IS NOT NULL DROP TABLE #SelectedEmployees;

PRINT 'Employee wise attendance processing successfully completed!';
";
}
