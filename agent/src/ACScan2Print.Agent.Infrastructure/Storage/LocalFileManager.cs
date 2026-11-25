using System.Security.Cryptography;
using ACScan2Print.Agent.Core.Interfaces;

namespace ACScan2Print.Agent.Infrastructure.Storage;

public class LocalFileManager : ILocalFileManager
{
    private readonly string _baseTempDirectory;

    public LocalFileManager()
    {
        _baseTempDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ACScan2Print",
            "Temp"
        );
        Directory.CreateDirectory(_baseTempDirectory);
    }

    public string GetAttemptDirectory(Guid attemptId)
    {
        string dir = Path.Combine(_baseTempDirectory, attemptId.ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    public async Task<string> SaveAndVerifyFileAsync(Guid attemptId, string filename, Stream sourceStream, string expectedSha256, CancellationToken cancellationToken = default)
    {
        string safeFileName = Path.GetFileName(filename);
        if (string.IsNullOrWhiteSpace(safeFileName))
        {
            safeFileName = $"{Guid.NewGuid():N}.bin";
        }

        string attemptDir = Path.GetFullPath(GetAttemptDirectory(attemptId))
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        string targetPath = Path.GetFullPath(Path.Combine(attemptDir, safeFileName));

        // Security: Prevent canonical path traversal outside the attempt directory
        if (!targetPath.StartsWith(attemptDir, StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException("Potential path traversal attempt detected in filename.");
        }

        await using (var fileStream = new FileStream(targetPath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, useAsync: true))
        {
            await sourceStream.CopyToAsync(fileStream, cancellationToken);
        }

        // Verify SHA-256 Checksum
        string actualHash = await ComputeSha256Async(targetPath, cancellationToken);
        if (!string.Equals(actualHash, expectedSha256, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(targetPath);
            throw new InvalidOperationException($"SHA-256 verification failed for '{safeFileName}'. Expected: {expectedSha256}, Actual: {actualHash}");
        }

        return targetPath;
    }

    public void CleanupAttemptDirectory(Guid attemptId)
    {
        string dir = Path.Combine(_baseTempDirectory, attemptId.ToString("N"));
        if (Directory.Exists(dir))
        {
            try
            {
                Directory.Delete(dir, recursive: true);
            }
            catch
            {
                // File lock fallback: Will be cleared in next sweep
            }
        }
    }

    public void CleanupOldOrphans(TimeSpan maxAge)
    {
        if (!Directory.Exists(_baseTempDirectory)) return;

        DateTime cutoff = DateTime.UtcNow - maxAge;
        foreach (string dir in Directory.GetDirectories(_baseTempDirectory))
        {
            try
            {
                var dirInfo = new DirectoryInfo(dir);
                if (dirInfo.CreationTimeUtc < cutoff)
                {
                    dirInfo.Delete(recursive: true);
                }
            }
            catch
            {
                // Skip if currently in use
            }
        }
    }

    private static async Task<string> ComputeSha256Async(string filePath, CancellationToken cancellationToken)
    {
        using var sha = SHA256.Create();
        await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        byte[] hash = await sha.ComputeHashAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
