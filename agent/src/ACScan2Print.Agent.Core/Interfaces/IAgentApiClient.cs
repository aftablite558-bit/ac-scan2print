using ACScan2Print.Agent.Core.Models;

namespace ACScan2Print.Agent.Core.Interfaces;

public record EnrollmentResult(
    Guid DeviceId,
    string DeviceName,
    string DeviceStatus,
    string DeviceCredential
);

public record HeartbeatResult(
    bool Ok,
    Guid DeviceId,
    DateTime ServerTime,
    string? DeviceStatus = null
);

public record PrinterSyncResult(
    bool Ok,
    int SyncedCount,
    List<string> SyncedPrinterIds
);

public record ClaimedFileItem(
    string FileId,
    string OriginalFilename,
    string MimeType,
    string Sha256Checksum,
    int? DetectedPageCount,
    string SignedDownloadUrl,
    int ExpiresInSeconds
);

public record ClaimedJobDetails(
    string JobId,
    string JobNumber,
    string PrinterId,
    string PaperSize,
    string PrintMode,
    string PrintSides,
    int Copies,
    string Orientation,
    string Scaling,
    string? RequestedPageRange,
    List<ClaimedFileItem> Files
);

public record ClaimJobResult(
    bool Claimed,
    string? AttemptId,
    int? AttemptNumber,
    DateTime? LeaseExpiresAt,
    ClaimedJobDetails? Job
);

public record ReportJobEventResult(
    bool Ok,
    string? JobId,
    string? JobStatus,
    string? AttemptId,
    string? AttemptStatus,
    string? Message = null
);

public interface IAgentApiClient
{
    Task<EnrollmentResult> EnrollDeviceAsync(
        string adminToken,
        string deviceName,
        string osVersion,
        string agentVersion,
        CancellationToken cancellationToken = default
    );

    Task<HeartbeatResult> SendHeartbeatAsync(
        string deviceCredential,
        string agentVersion,
        string osVersion,
        List<DiscoveredPrinter>? printers = null,
        CancellationToken cancellationToken = default
    );

    Task<PrinterSyncResult> SyncPrintersAsync(
        string deviceCredential,
        List<DiscoveredPrinter> printers,
        CancellationToken cancellationToken = default
    );

    Task<ClaimJobResult> ClaimJobAsync(
        string deviceCredential,
        int leaseSeconds = 180,
        string? idempotencyKey = null,
        CancellationToken cancellationToken = default
    );

    Task<ReportJobEventResult> ReportJobEventAsync(
        string deviceCredential,
        string attemptId,
        string nextStatus,
        string? spoolerJobId = null,
        string? errorCode = null,
        string? errorMessage = null,
        CancellationToken cancellationToken = default
    );
}
