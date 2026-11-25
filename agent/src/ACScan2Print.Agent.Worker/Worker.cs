using ACScan2Print.Agent.Core.Enums;
using ACScan2Print.Agent.Core.Interfaces;
using ACScan2Print.Agent.Core.Models;
using ACScan2Print.Agent.Infrastructure.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ACScan2Print.Agent.Worker;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly IPrinterDiscoveryService _discoveryService;
    private readonly ILocalFileManager _fileManager;
    private readonly IAgentApiClient _apiClient;
    private readonly IDpapiStorage _dpapiStorage;
    private readonly IPdfRenderer _pdfRenderer;
    private readonly IImagePrintService _imageService;
    private readonly IPrintSpoolerService _spoolerService;
    private readonly HttpClient _httpClient;

    private const string CredentialKey = "ACScan2Print_DeviceCredential";
    private const string DeviceIdKey = "ACScan2Print_DeviceId";
    private const string AgentVersion = "1.0.4";

    public Worker(
        ILogger<Worker> logger,
        IPrinterDiscoveryService discoveryService,
        ILocalFileManager fileManager,
        IAgentApiClient apiClient,
        IDpapiStorage dpapiStorage,
        IPdfRenderer pdfRenderer,
        IImagePrintService imageService,
        IPrintSpoolerService spoolerService,
        HttpClient? httpClient = null)
    {
        _logger = logger;
        _discoveryService = discoveryService;
        _fileManager = fileManager;
        _apiClient = apiClient;
        _dpapiStorage = dpapiStorage;
        _pdfRenderer = pdfRenderer;
        _imageService = imageService;
        _spoolerService = spoolerService;
        _httpClient = httpClient ?? new HttpClient();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        SafeLogger.LogInfo($"AC Scan2Print Local Print Agent Worker v{AgentVersion} starting up...");

        string? deviceCredential = _dpapiStorage.LoadProtectedSecret(CredentialKey);
        string? deviceId = _dpapiStorage.LoadProtectedSecret(DeviceIdKey);

        if (string.IsNullOrEmpty(deviceCredential))
        {
            SafeLogger.LogWarning("Agent is not currently enrolled. Please enroll device via Admin Dashboard or Tray UI.");
        }
        else
        {
            SafeLogger.LogInfo($"Device credential successfully loaded from Windows DPAPI. Device ID: {deviceId}");
        }

        // Initial printer discovery and synchronization
        List<DiscoveredPrinter> printers = new();
        try
        {
            printers = await _discoveryService.DiscoverPrintersAsync(stoppingToken);
            SafeLogger.LogInfo($"Discovered {printers.Count} installed printer(s) on Windows host.");

            if (!string.IsNullOrEmpty(deviceCredential))
            {
                SafeLogger.LogInfo("Synchronizing discovered printers with Supabase backend...");
                var syncResult = await _apiClient.SyncPrintersAsync(deviceCredential, printers, stoppingToken);
                SafeLogger.LogInfo($"Printer synchronization complete. Synced {syncResult.SyncedCount} printers.");
            }
        }
        catch (Exception ex)
        {
            SafeLogger.LogError("Error during initial printer discovery / sync.", ex);
        }

        // Main worker loop: Heartbeat, Job Claiming & Execution, Stale Temp Cleanup
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                deviceCredential = _dpapiStorage.LoadProtectedSecret(CredentialKey);

                if (!string.IsNullOrEmpty(deviceCredential))
                {
                    // Refresh printer statuses
                    printers = await _discoveryService.DiscoverPrintersAsync(stoppingToken);

                    // Send heartbeat
                    var heartbeat = await _apiClient.SendHeartbeatAsync(
                        deviceCredential,
                        AgentVersion,
                        Environment.OSVersion.ToString(),
                        printers,
                        stoppingToken
                    );

                    if (heartbeat.Ok)
                    {
                        SafeLogger.LogInfo($"Heartbeat acknowledged by server at {heartbeat.ServerTime:HH:mm:ss} UTC. Status: Active");

                        // Check and execute queued print jobs
                        await PollAndExecuteJobsAsync(deviceCredential, printers, stoppingToken);
                    }
                    else if (heartbeat.DeviceStatus == "revoked")
                    {
                        SafeLogger.LogWarning("DEVICE HAS BEEN REVOKED BY SUPER ADMIN. Clearing local DPAPI credentials!");
                        _dpapiStorage.ClearSecret(CredentialKey);
                        _dpapiStorage.ClearSecret(DeviceIdKey);
                    }
                    else
                    {
                        SafeLogger.LogWarning("Heartbeat not acknowledged or device offline.");
                    }
                }

                // Cleanup stale temp files (>24h) and rotate logs (>14 days)
                _fileManager.CleanupOldOrphans(TimeSpan.FromHours(24));
                SafeLogger.PruneOldLogs(14);

                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                SafeLogger.LogError("Exception in agent worker execution cycle.", ex);
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
        }

        SafeLogger.LogInfo("AC Scan2Print Local Print Agent Worker stopped.");
    }

    public async Task<bool> PollAndExecuteJobsAsync(
        string deviceCredential,
        List<DiscoveredPrinter> printers,
        CancellationToken stoppingToken)
    {
        try
        {
            var claimResult = await _apiClient.ClaimJobAsync(deviceCredential, leaseSeconds: 180, cancellationToken: stoppingToken);
            if (!claimResult.Claimed || claimResult.Job == null || string.IsNullOrEmpty(claimResult.AttemptId))
            {
                return false; // No queued jobs to claim
            }

            var job = claimResult.Job;
            string attemptId = claimResult.AttemptId;
            Guid attemptGuid = Guid.TryParse(attemptId, out var g) ? g : Guid.NewGuid();

            SafeLogger.LogInfo($"[Agent] Claimed job {job.JobNumber} (Attempt {attemptId}). Starting print pipeline...");

            bool submittedToSpooler = false;
            try
            {
                // Step 1: Transition attempt & job to 'downloading'
                await _apiClient.ReportJobEventAsync(deviceCredential, attemptId, "downloading", cancellationToken: stoppingToken);

                // Step 2: Download files and verify SHA-256 checksums
                var localFiles = new List<(string LocalPath, string MimeType)>();
                foreach (var file in job.Files)
                {
                    if (!Uri.TryCreate(file.SignedDownloadUrl, UriKind.Absolute, out var downloadUri) ||
                        (downloadUri.Scheme != Uri.UriSchemeHttps && !(downloadUri.Scheme == Uri.UriSchemeHttp && downloadUri.IsLoopback)))
                    {
                        throw new InvalidOperationException("Rejected insecure or invalid signed download URL.");
                    }
                    SafeLogger.LogInfo($"[Agent] Downloading {file.OriginalFilename} for attempt {attemptId}...");
                    using var response = await _httpClient.GetAsync(downloadUri, HttpCompletionOption.ResponseHeadersRead, stoppingToken);
                    response.EnsureSuccessStatusCode();

                    await using var stream = await response.Content.ReadAsStreamAsync(stoppingToken);
                    string localPath = await _fileManager.SaveAndVerifyFileAsync(
                        attemptGuid,
                        file.OriginalFilename,
                        stream,
                        file.Sha256Checksum,
                        stoppingToken
                    );
                    localFiles.Add((localPath, file.MimeType));
                }

                // Step 3: Transition attempt & job to 'printing'
                await _apiClient.ReportJobEventAsync(deviceCredential, attemptId, "printing", cancellationToken: stoppingToken);

                // Step 4: Resolve target printer
                string targetPrinter = printers.FirstOrDefault(p =>
                    p.SystemPrinterName.Equals(job.PrinterId, StringComparison.OrdinalIgnoreCase) ||
                    p.DisplayName.Equals(job.PrinterId, StringComparison.OrdinalIgnoreCase))?.SystemPrinterName
                    ?? printers.FirstOrDefault(p => p.IsDefault)?.SystemPrinterName
                    ?? printers.FirstOrDefault()?.SystemPrinterName
                    ?? "Microsoft Print to PDF";

                Enum.TryParse<PaperSize>(job.PaperSize, ignoreCase: true, out var paperSize);
                Enum.TryParse<PrintMode>(job.PrintMode, ignoreCase: true, out var printMode);
                PrintSides printSides = job.PrintSides.Equals("duplex", StringComparison.OrdinalIgnoreCase)
                    ? PrintSides.Duplex
                    : PrintSides.Simplex;

                var settings = new PrintSettings(
                    paperSize,
                    printMode,
                    printSides,
                    job.Copies > 0 ? job.Copies : 1,
                    job.RequestedPageRange,
                    job.Orientation,
                    job.Scaling
                );

                // Step 5: Render and submit to Windows Spooler
                int lastSpoolerJobId = 0;
                foreach (var (localPath, mime) in localFiles)
                {
                    if (mime.Equals("application/pdf", StringComparison.OrdinalIgnoreCase) || localPath.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                    {
                        lastSpoolerJobId = await _pdfRenderer.PrintPdfAsync(localPath, targetPrinter, settings, stoppingToken);
                    }
                    else
                    {
                        lastSpoolerJobId = await _imageService.PrintImageAsync(localPath, targetPrinter, settings, stoppingToken);
                    }
                }

                // Step 6: Report 'submitted_to_spooler'
                submittedToSpooler = true;
                await _apiClient.ReportJobEventAsync(
                    deviceCredential,
                    attemptId,
                    "submitted_to_spooler",
                    spoolerJobId: lastSpoolerJobId.ToString(),
                    cancellationToken: stoppingToken
                );

                // Step 7: Verify Windows Spooler completion before marking completed; escalate uncertain faults to needs_review
                var finalSpoolerStatus = await WaitForSpoolerCompletionAsync(targetPrinter, lastSpoolerJobId, stoppingToken);
                if (finalSpoolerStatus == SpoolerJobStatus.Printed || lastSpoolerJobId <= 0)
                {
                    await _apiClient.ReportJobEventAsync(
                        deviceCredential,
                        attemptId,
                        "completed",
                        spoolerJobId: lastSpoolerJobId.ToString(),
                        cancellationToken: stoppingToken
                    );
                    SafeLogger.LogInfo($"[Agent] Job {job.JobNumber} (Attempt {attemptId}) printed successfully!");
                    return true;
                }

                if (finalSpoolerStatus == SpoolerJobStatus.Deleting)
                {
                    await _apiClient.ReportJobEventAsync(
                        deviceCredential,
                        attemptId,
                        "failed",
                        spoolerJobId: lastSpoolerJobId.ToString(),
                        errorCode: "SPOOLER_JOB_CANCELLED",
                        errorMessage: "Print job was deleted from the Windows Print Spooler before completion.",
                        cancellationToken: stoppingToken
                    );
                    return false;
                }

                await _apiClient.ReportJobEventAsync(
                    deviceCredential,
                    attemptId,
                    "needs_review",
                    spoolerJobId: lastSpoolerJobId.ToString(),
                    errorCode: $"SPOOLER_{finalSpoolerStatus.ToString().ToUpperInvariant()}",
                    errorMessage: $"Spooler reported '{finalSpoolerStatus}' after submission. Admin reconciliation required before retry.",
                    cancellationToken: stoppingToken
                );
                return false;
            }
            catch (Exception ex)
            {
                SafeLogger.LogError($"[Agent] Print execution failed for attempt {attemptId}", ex);

                string failureStatus = submittedToSpooler ? "needs_review" : "failed";
                string failureCode = submittedToSpooler ? "SPOOLER_POST_SUBMIT_AMBIGUOUS" : "PRINT_EXECUTION_FAILED";
                await _apiClient.ReportJobEventAsync(
                    deviceCredential,
                    attemptId,
                    failureStatus,
                    errorCode: failureCode,
                    errorMessage: ex.Message.Length > 280 ? ex.Message[..280] : ex.Message,
                    cancellationToken: stoppingToken
                );
                return false;
            }
            finally
            {
                // Always clean up attempt temp files
                _fileManager.CleanupAttemptDirectory(attemptGuid);
            }
        }
        catch (Exception ex)
        {
            SafeLogger.LogError("Error during job claim / execution loop.", ex);
            return false;
        }
    }

    private async Task<SpoolerJobStatus> WaitForSpoolerCompletionAsync(
        string printerName,
        int spoolerJobId,
        CancellationToken stoppingToken)
    {
        if (spoolerJobId <= 0)
        {
            return SpoolerJobStatus.Printed;
        }

        const int maxPolls = 30; // ~60s total polling window
        for (int i = 0; i < maxPolls; i++)
        {
            var status = await _spoolerService.GetSpoolerJobStatusAsync(printerName, spoolerJobId, stoppingToken);
            if (status == SpoolerJobStatus.Printed ||
                status == SpoolerJobStatus.Error ||
                status == SpoolerJobStatus.PaperOut ||
                status == SpoolerJobStatus.Offline ||
                status == SpoolerJobStatus.UserIntervention ||
                status == SpoolerJobStatus.Deleting)
            {
                return status;
            }

            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }

        return SpoolerJobStatus.Unknown;
    }
}
