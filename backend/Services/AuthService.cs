using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using BCrypt.Net;
using Microsoft.IdentityModel.Tokens;

namespace KotaProcess.Api.Services;

public class UserAccount
{
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
}

public interface IAuthService
{
    Task<(bool Success, string? Token, UserAccount? User, string? Error)> AuthenticateAsync(string email, string password, string ipAddress);
    void LogLogout(string email, string ipAddress);
    UserAccount? ValidateToken(string token);
    UserAccount? GetUserByEmail(string email);
}

public class AuthService : IAuthService
{
    private readonly IEnvService _envService;
    private readonly ILogger<AuthService> _logger;
    private readonly string _usersFilePath;
    private readonly object _lock = new();
    private List<UserAccount> _users = new();
    private DateTime _lastLoadedWriteTimeUtc = DateTime.MinValue;

    public AuthService(IEnvService envService, ILogger<AuthService> logger)
    {
        _envService = envService;
        _logger = logger;
        _usersFilePath = Path.Combine(GetBackendDirectory(), "users.json");
        LoadUsers();
    }

    private static string GetBackendDirectory()
    {
        var current = Directory.GetCurrentDirectory();
        if (File.Exists(Path.Combine(current, "KotaProcess.Api.csproj")))
            return current;

        var backendSub = Path.Combine(current, "backend");
        if (Directory.Exists(backendSub) && File.Exists(Path.Combine(backendSub, "KotaProcess.Api.csproj")))
            return backendSub;

        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "KotaProcess.Api.csproj")))
                return dir.FullName;
            if (Directory.Exists(Path.Combine(dir.FullName, "backend")) && File.Exists(Path.Combine(dir.FullName, "backend", "KotaProcess.Api.csproj")))
                return Path.Combine(dir.FullName, "backend");
            dir = dir.Parent;
        }

        return AppContext.BaseDirectory;
    }

    private void EnsureLoaded()
    {
        try
        {
            if (File.Exists(_usersFilePath))
            {
                var writeTime = File.GetLastWriteTimeUtc(_usersFilePath);
                if (writeTime > _lastLoadedWriteTimeUtc)
                {
                    LoadUsers();
                }
            }
        }
        catch
        {
            // fallback gracefully
        }
    }

    private void LoadUsers()
    {
        lock (_lock)
        {
            try
            {
                if (File.Exists(_usersFilePath))
                {
                    _lastLoadedWriteTimeUtc = File.GetLastWriteTimeUtc(_usersFilePath);
                    var json = File.ReadAllText(_usersFilePath);
                    var list = JsonSerializer.Deserialize<List<UserAccount>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (list != null)
                    {
                        _users = list;
                        _logger.LogInformation("👥 Loaded {Count} authorized user account(s) from users.json", _users.Count);
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("⚠️ Could not read users.json file: {Message}", ex.Message);
            }

            // Fallback default
            _users = new List<UserAccount>
            {
                new()
                {
                    Email = "print@electronics.com",
                    Name = "Print Electronics",
                    PasswordHash = "$2b$10$sWre8B8GvaziExeP23g7RudGT6g2Xh1thDFTPF94sfXP2r6PHSs2S"
                }
            };
        }
    }

    public Task<(bool Success, string? Token, UserAccount? User, string? Error)> AuthenticateAsync(string email, string password, string ipAddress)
    {
        EnsureLoaded();

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            _logger.LogWarning("⚠️ [AUTH] Login failed: Empty email or password submitted from {Ip}.", ipAddress);
            return Task.FromResult<(bool, string?, UserAccount?, string?)>((false, null, null, "Email and password are required."));
        }

        var normalizedEmail = email.Trim().ToLowerInvariant();
        UserAccount? matchedUser;

        lock (_lock)
        {
            matchedUser = _users.FirstOrDefault(u => u.Email.Trim().Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase));
        }

        if (matchedUser == null)
        {
            _logger.LogWarning("⚠️ [AUTH] Login failed: User {Email} not found. Attempt from {Ip} at {Time}.", email, ipAddress, DateTime.Now.ToString("hh:mm:ss tt"));
            return Task.FromResult<(bool, string?, UserAccount?, string?)>((false, null, null, "Invalid email or password."));
        }

        bool isPasswordValid = false;
        try
        {
            isPasswordValid = BCrypt.Net.BCrypt.Verify(password, matchedUser.PasswordHash);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "❌ [AUTH] BCrypt verification error for {Email}: {Error}", email, ex.Message);
        }

        if (!isPasswordValid)
        {
            _logger.LogWarning("⚠️ [AUTH] Login failed: Incorrect password for {Email}. Attempt from {Ip} at {Time}.", email, ipAddress, DateTime.Now.ToString("hh:mm:ss tt"));
            return Task.FromResult<(bool, string?, UserAccount?, string?)>((false, null, null, "Invalid email or password."));
        }

        // Generate JWT Token
        var token = GenerateJwtToken(matchedUser);

        _logger.LogInformation("🔐 [AUTH] User {Email} ({Name}) successfully logged in at {Time} from {Ip}.",
            matchedUser.Email, matchedUser.Name, DateTime.Now.ToString("hh:mm:ss tt"), ipAddress);

        return Task.FromResult<(bool, string?, UserAccount?, string?)>((true, token, matchedUser, null));
    }

    public void LogLogout(string email, string ipAddress)
    {
        _logger.LogInformation("🚪 [AUTH] User {Email} logged out at {Time} from {Ip}.",
            string.IsNullOrWhiteSpace(email) ? "Unknown" : email,
            DateTime.Now.ToString("hh:mm:ss tt"),
            ipAddress);
    }

    public UserAccount? GetUserByEmail(string email)
    {
        EnsureLoaded();
        lock (_lock)
        {
            return _users.FirstOrDefault(u => u.Email.Trim().Equals(email.Trim(), StringComparison.OrdinalIgnoreCase));
        }
    }

    public UserAccount? ValidateToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_envService.JwtSecret);

            tokenHandler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ValidateIssuer = false,
                ValidateAudience = false,
                ClockSkew = TimeSpan.FromMinutes(5)
            }, out SecurityToken validatedToken);

            var jwtToken = (JwtSecurityToken)validatedToken;
            var emailClaim = jwtToken.Claims.FirstOrDefault(x => x.Type == ClaimTypes.Email || x.Type == "email")?.Value;

            if (string.IsNullOrEmpty(emailClaim)) return null;

            return GetUserByEmail(emailClaim);
        }
        catch
        {
            return null;
        }
    }

    private string GenerateJwtToken(UserAccount user)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_envService.JwtSecret);

        // Fallback key length security check (at least 256 bits / 32 bytes)
        if (key.Length < 32)
        {
            var padded = new byte[32];
            Array.Copy(key, padded, Math.Min(key.Length, 32));
            key = padded;
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Name, user.Name)
            }),
            Expires = DateTime.UtcNow.AddDays(7), // 7 days token expiry
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }
}
