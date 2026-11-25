using System.Text.Json.Serialization;
using ACScan2Print.Agent.Core.Enums;

namespace ACScan2Print.Agent.Core.Models;

public record PrinterCapabilities(
    [property: JsonPropertyName("supports_colour")] bool? SupportsColour,
    [property: JsonPropertyName("supports_duplex")] bool? SupportsDuplex,
    [property: JsonPropertyName("supported_paper_sizes")] string[] SupportedPaperSizes
);

public record DiscoveredPrinter(
    [property: JsonPropertyName("system_printer_name")] string SystemPrinterName,
    [property: JsonPropertyName("display_name")] string DisplayName,
    [property: JsonPropertyName("driver_name")] string DriverName,
    [property: JsonPropertyName("port_name")] string PortName,
    [property: JsonPropertyName("connection_type")] ConnectionType ConnectionType,
    [property: JsonPropertyName("is_default")] bool IsDefault,
    [property: JsonPropertyName("is_online")] bool IsOnline,
    [property: JsonPropertyName("capabilities")] PrinterCapabilities Capabilities,
    [property: JsonPropertyName("printer_model")] string? PrinterModel = null
);

public record PrintSettings(
    [property: JsonPropertyName("paper_size")] PaperSize PaperSize,
    [property: JsonPropertyName("print_mode")] PrintMode PrintMode,
    [property: JsonPropertyName("sides")] PrintSides Sides,
    [property: JsonPropertyName("copies")] int Copies,
    [property: JsonPropertyName("page_range")] string? PageRange = null,
    [property: JsonPropertyName("orientation")] string Orientation = "auto",
    [property: JsonPropertyName("scaling")] string Scaling = "fit"
)
{
    public void Validate()
    {
        if (Copies < 1 || Copies > 20)
        {
            throw new ArgumentOutOfRangeException(nameof(Copies), "Copies must be between 1 and 20.");
        }
    }
}

public record PrintFileItem(
    [property: JsonPropertyName("file_id")] Guid FileId,
    [property: JsonPropertyName("original_filename")] string OriginalFilename,
    [property: JsonPropertyName("mime_type")] string MimeType,
    [property: JsonPropertyName("file_size")] long FileSize,
    [property: JsonPropertyName("sha256_checksum")] string Sha256Checksum,
    [property: JsonPropertyName("download_url")] string DownloadUrl,
    [property: JsonPropertyName("page_count")] int PageCount
);

public record PrintJob(
    [property: JsonPropertyName("job_id")] Guid JobId,
    [property: JsonPropertyName("job_number")] string JobNumber,
    [property: JsonPropertyName("status")] JobStatus Status,
    [property: JsonPropertyName("assigned_printer_name")] string AssignedPrinterName,
    [property: JsonPropertyName("settings")] PrintSettings Settings,
    [property: JsonPropertyName("files")] List<PrintFileItem> Files
);

public record PrintJobAttempt(
    [property: JsonPropertyName("attempt_id")] Guid AttemptId,
    [property: JsonPropertyName("job_id")] Guid JobId,
    [property: JsonPropertyName("attempt_number")] int AttemptNumber,
    [property: JsonPropertyName("idempotency_key")] Guid IdempotencyKey,
    [property: JsonPropertyName("windows_spooler_job_id")] int? WindowsSpoolerJobId,
    [property: JsonPropertyName("status")] JobStatus Status,
    [property: JsonPropertyName("started_at")] DateTime StartedAt,
    [property: JsonPropertyName("submitted_to_spooler_at")] DateTime? SubmittedToSpoolerAt = null,
    [property: JsonPropertyName("finished_at")] DateTime? FinishedAt = null,
    [property: JsonPropertyName("error_code")] string? ErrorCode = null,
    [property: JsonPropertyName("error_message_safe")] string? ErrorMessageSafe = null
);

public record DeviceIdentity(
    [property: JsonPropertyName("device_id")] Guid DeviceId,
    [property: JsonPropertyName("device_name")] string DeviceName,
    [property: JsonPropertyName("os_version")] string OsVersion,
    [property: JsonPropertyName("agent_version")] string AgentVersion,
    [property: JsonPropertyName("enrollment_status")] DeviceState EnrollmentStatus
);

public record AgentDiagnosticInfo(
    string DeviceName,
    string OsVersion,
    string AgentVersion,
    long RamTotalMb,
    long FreeDiskGb,
    bool IsConnected,
    bool IsPaused,
    DateTime? LastHeartbeatAt,
    List<DiscoveredPrinter> Printers,
    List<PrintJobAttempt> RecentAttempts
);
