using ACScan2Print.Agent.Core.Models;

namespace ACScan2Print.Agent.Core.Interfaces;

public interface IPrinterDiscoveryService
{
    Task<List<DiscoveredPrinter>> DiscoverPrintersAsync(CancellationToken cancellationToken = default);
    Task<DiscoveredPrinter?> GetPrinterDetailsAsync(string printerName, CancellationToken cancellationToken = default);
}

public interface IPrintSpoolerService
{
    Task<int> SubmitRawJobAsync(string printerName, string documentTitle, byte[] data, CancellationToken cancellationToken = default);
    Task<int> SubmitRenderedJobAsync(string printerName, string documentTitle, Func<IntPtr, bool> printCallback, CancellationToken cancellationToken = default);
    Task<Core.Enums.SpoolerJobStatus> GetSpoolerJobStatusAsync(string printerName, int spoolerJobId, CancellationToken cancellationToken = default);
}

public interface IPdfRenderer
{
    Task<int> PrintPdfAsync(string filePath, string printerName, PrintSettings settings, CancellationToken cancellationToken = default);
    Task<int> GetPageCountAsync(string filePath, CancellationToken cancellationToken = default);
}

public interface IImagePrintService
{
    Task<int> PrintImageAsync(string filePath, string printerName, PrintSettings settings, CancellationToken cancellationToken = default);
}

public interface ILocalFileManager
{
    string GetAttemptDirectory(Guid attemptId);
    Task<string> SaveAndVerifyFileAsync(Guid attemptId, string filename, Stream sourceStream, string expectedSha256, CancellationToken cancellationToken = default);
    void CleanupAttemptDirectory(Guid attemptId);
    void CleanupOldOrphans(TimeSpan maxAge);
}

public interface IDpapiStorage
{
    void SaveProtectedSecret(string key, string plaintext);
    string? LoadProtectedSecret(string key);
    void ClearSecret(string key);
}
