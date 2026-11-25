using System.Text.RegularExpressions;

namespace ACScan2Print.Agent.Infrastructure.Diagnostics;

public static class SafeLogger
{
    private static readonly Regex TokenRegex = new(@"[0-9a-fA-F]{64}", RegexOptions.Compiled);
    private static readonly Regex JwtRegex = new(@"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", RegexOptions.Compiled);
    private static readonly Regex UrlSecretRegex = new(@"token=[^&\s]+", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex SignedQueryRegex = new(@"(sig|signature|apikey)=[^&\s]+", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex CredentialHeaderRegex = new(@"(x-device-credential|authorization)\s*[:=]\s*[^\s,;]+", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly object FileLock = new();
    private const int DefaultLogRetentionDays = 14;

    private static string ResolveLogDirectory()
    {
        try
        {
            string programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            if (!string.IsNullOrWhiteSpace(programData))
            {
                string dir = Path.Combine(programData, "ACScan2Print", "Logs");
                Directory.CreateDirectory(dir);
                return dir;
            }
        }
        catch
        {
            // Fallback for non-elevated contexts
        }

        string localDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ACScan2Print",
            "Logs"
        );
        Directory.CreateDirectory(localDir);
        return localDir;
    }

    public static void LogInfo(string message) => WriteEntry("INFO", message, ConsoleColor.White, null);

    public static void LogWarning(string message) => WriteEntry("WARN", message, ConsoleColor.Yellow, null);

    public static void LogError(string message, Exception? ex = null) => WriteEntry("ERROR", message, ConsoleColor.Red, ex);

    private static void WriteEntry(string level, string message, ConsoleColor color, Exception? ex)
    {
        string timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss.fffZ");
        string safeMsg = Sanitize(message);
        string line = $"[{timestamp}] [{level}] {safeMsg}";

        Console.ForegroundColor = color;
        Console.WriteLine(line);
        if (ex != null)
        {
            Console.WriteLine($"  Type: {ex.GetType().Name} - Message: {Sanitize(ex.Message)}");
        }
        Console.ResetColor();

        try
        {
            lock (FileLock)
            {
                string logDir = ResolveLogDirectory();
                string logFile = Path.Combine(logDir, $"agent-{DateTime.UtcNow:yyyyMMdd}.log");
                File.AppendAllText(logFile, line + Environment.NewLine);
                if (ex != null)
                {
                    File.AppendAllText(logFile, $"  Type: {ex.GetType().Name} - Message: {Sanitize(ex.Message)}{Environment.NewLine}");
                }
            }
        }
        catch
        {
            // Never crash worker on disk logging failure
        }
    }

    public static void PruneOldLogs(int retentionDays = DefaultLogRetentionDays)
    {
        try
        {
            string logDir = ResolveLogDirectory();
            if (!Directory.Exists(logDir)) return;

            DateTime cutoff = DateTime.UtcNow.AddDays(-Math.Max(1, retentionDays));
            foreach (string file in Directory.GetFiles(logDir, "agent-*.log"))
            {
                var info = new FileInfo(file);
                if (info.LastWriteTimeUtc < cutoff)
                {
                    info.Delete();
                }
            }
        }
        catch
        {
            // Skip locked log files
        }
    }

    public static string Sanitize(string input)
    {
        if (string.IsNullOrEmpty(input)) return string.Empty;
        string result = TokenRegex.Replace(input, "[REDACTED_HASH]");
        result = JwtRegex.Replace(result, "[REDACTED_JWT]");
        result = UrlSecretRegex.Replace(result, "token=[REDACTED]");
        result = SignedQueryRegex.Replace(result, "$1=[REDACTED]");
        result = CredentialHeaderRegex.Replace(result, "$1=[REDACTED]");
        return result;
    }
}
