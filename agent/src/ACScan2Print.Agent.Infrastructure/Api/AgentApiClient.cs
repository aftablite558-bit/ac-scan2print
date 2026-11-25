using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using ACScan2Print.Agent.Core.Interfaces;
using ACScan2Print.Agent.Core.Models;
using ACScan2Print.Agent.Infrastructure.Diagnostics;

namespace ACScan2Print.Agent.Infrastructure.Api;

public class AgentApiClient : IAgentApiClient
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;

    public AgentApiClient(HttpClient? httpClient = null, string? baseUrl = null)
    {
        _httpClient = httpClient ?? new HttpClient();
        _baseUrl = (baseUrl ?? "https://tvtfgsijxlxpwgakpeag.supabase.co/functions/v1").TrimEnd('/');
    }

    public async Task<EnrollmentResult> EnrollDeviceAsync(
        string adminToken,
        string deviceName,
        string osVersion,
        string agentVersion,
        CancellationToken cancellationToken = default)
    {
        var payload = new
        {
            deviceName,
            osVersion,
            agentVersion,
            activateImmediately = true
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/agent-enroll")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        var response = await _httpClient.SendAsync(request, cancellationToken);
        string responseText = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            SafeLogger.LogError($"Agent enrollment failed with HTTP {(int)response.StatusCode}: {responseText}");
            throw new HttpRequestException($"Agent enrollment failed with status code {response.StatusCode}: {responseText}");
        }

        using var doc = JsonDocument.Parse(responseText);
        var root = doc.RootElement;

        Guid deviceId = Guid.Parse(root.GetProperty("deviceId").GetString()!);
        string devName = root.GetProperty("deviceName").GetString()!;
        string devStatus = root.GetProperty("deviceStatus").GetString()!;
        string credential = root.GetProperty("deviceCredential").GetString()!;

        return new EnrollmentResult(deviceId, devName, devStatus, credential);
    }

    public async Task<HeartbeatResult> SendHeartbeatAsync(
        string deviceCredential,
        string agentVersion,
        string osVersion,
        List<DiscoveredPrinter>? printers = null,
        CancellationToken cancellationToken = default)
    {
        var printerPayload = printers?.Select(p => new
        {
            printerId = p.SystemPrinterName,
            printerStatus = p.IsOnline ? "online" : "offline"
        }).ToList();

        var payload = new
        {
            agentVersion,
            osVersion,
            printers = printerPayload
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/agent-heartbeat")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.Add("x-device-credential", deviceCredential);

        var response = await _httpClient.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden)
        {
            SafeLogger.LogWarning("Device credential rejected by server. Device may be revoked or inactive.");
            return new HeartbeatResult(false, Guid.Empty, DateTime.UtcNow, "revoked");
        }

        string responseText = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            SafeLogger.LogWarning($"Heartbeat failed (HTTP {(int)response.StatusCode}): {responseText}");
            return new HeartbeatResult(false, Guid.Empty, DateTime.UtcNow, "error");
        }

        using var doc = JsonDocument.Parse(responseText);
        var root = doc.RootElement;

        bool ok = root.GetProperty("ok").GetBoolean();
        Guid deviceId = Guid.Parse(root.GetProperty("deviceId").GetString()!);
        DateTime serverTime = DateTime.Parse(root.GetProperty("serverTime").GetString()!);

        return new HeartbeatResult(ok, deviceId, serverTime, "active");
    }

    public async Task<PrinterSyncResult> SyncPrintersAsync(
        string deviceCredential,
        List<DiscoveredPrinter> printers,
        CancellationToken cancellationToken = default)
    {
        if (printers == null || printers.Count == 0)
        {
            return new PrinterSyncResult(true, 0, new List<string>());
        }

        var printerPayload = printers.Select(p => new
        {
            systemPrinterName = p.SystemPrinterName,
            printerName = p.DisplayName,
            printerModel = p.PrinterModel ?? p.DisplayName,
            connectionType = p.ConnectionType.ToString().ToLowerInvariant(),
            supportsColour = p.Capabilities.SupportsColour,
            supportsDuplex = p.Capabilities.SupportsDuplex,
            supportedPaperSizes = p.Capabilities.SupportedPaperSizes,
            printerStatus = p.IsOnline ? "online" : "offline"
        }).ToList();

        var payload = new
        {
            printers = printerPayload
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/agent-sync-printers")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.Add("x-device-credential", deviceCredential);

        var response = await _httpClient.SendAsync(request, cancellationToken);
        string responseText = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            SafeLogger.LogError($"Printer sync failed (HTTP {(int)response.StatusCode}): {responseText}");
            throw new HttpRequestException($"Printer sync failed with HTTP {response.StatusCode}: {responseText}");
        }

        using var doc = JsonDocument.Parse(responseText);
        var root = doc.RootElement;

        int syncedCount = 0;
        var ids = new List<string>();
        if (root.TryGetProperty("synced", out var syncedArray) && syncedArray.ValueKind == JsonValueKind.Array)
        {
            syncedCount = syncedArray.GetArrayLength();
            foreach (var item in syncedArray.EnumerateArray())
            {
                if (item.TryGetProperty("id", out var idElem))
                {
                    ids.Add(idElem.GetString()!);
                }
            }
        }

        return new PrinterSyncResult(true, syncedCount, ids);
    }

    public async Task<ClaimJobResult> ClaimJobAsync(
        string deviceCredential,
        int leaseSeconds = 180,
        string? idempotencyKey = null,
        CancellationToken cancellationToken = default)
    {
        var payload = new
        {
            leaseSeconds,
            idempotencyKey = idempotencyKey ?? Guid.NewGuid().ToString()
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/agent-claim-job")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.Add("x-device-credential", deviceCredential);

        var response = await _httpClient.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden)
        {
            SafeLogger.LogWarning("Device credential rejected while claiming job. Device may be revoked or inactive.");
            return new ClaimJobResult(false, null, null, null, null);
        }

        string responseText = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            SafeLogger.LogWarning($"Job claim request failed (HTTP {(int)response.StatusCode}): {responseText}");
            return new ClaimJobResult(false, null, null, null, null);
        }

        using var doc = JsonDocument.Parse(responseText);
        var root = doc.RootElement;

        bool claimed = root.GetProperty("claimed").GetBoolean();
        if (!claimed || !root.TryGetProperty("job", out var jobElement) || jobElement.ValueKind != JsonValueKind.Object)
        {
            return new ClaimJobResult(false, null, null, null, null);
        }

        string attemptId = root.GetProperty("attemptId").GetString()!;
        int attemptNumber = root.GetProperty("attemptNumber").GetInt32();
        DateTime leaseExpiresAt = DateTime.Parse(root.GetProperty("leaseExpiresAt").GetString()!);

        string jobId = jobElement.GetProperty("jobId").GetString()!;
        string jobNumber = jobElement.GetProperty("jobNumber").GetString()!;
        string printerId = jobElement.TryGetProperty("printerId", out var pId) ? (pId.GetString() ?? "") : "";
        string paperSize = jobElement.TryGetProperty("paperSize", out var ps) ? (ps.GetString() ?? "a4") : "a4";
        string printMode = jobElement.TryGetProperty("printMode", out var pm) ? (pm.GetString() ?? "bw") : "bw";
        string printSides = jobElement.TryGetProperty("printSides", out var pSides) ? (pSides.GetString() ?? "simplex") : "simplex";
        int copies = jobElement.TryGetProperty("copies", out var cp) ? cp.GetInt32() : 1;
        string orientation = jobElement.TryGetProperty("orientation", out var ori) ? (ori.GetString() ?? "auto") : "auto";
        string scaling = jobElement.TryGetProperty("scaling", out var sc) ? (sc.GetString() ?? "fit") : "fit";
        string? requestedPageRange = jobElement.TryGetProperty("requestedPageRange", out var pr) && pr.ValueKind == JsonValueKind.String
            ? pr.GetString()
            : null;

        var files = new List<ClaimedFileItem>();
        if (jobElement.TryGetProperty("files", out var filesElement) && filesElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var f in filesElement.EnumerateArray())
            {
                string fileId = f.GetProperty("fileId").GetString()!;
                string originalFilename = f.GetProperty("originalFilename").GetString()!;
                string mimeType = f.GetProperty("mimeType").GetString()!;
                string sha256Checksum = f.GetProperty("sha256Checksum").GetString()!;
                int? detectedPageCount = f.TryGetProperty("detectedPageCount", out var dpc) && dpc.ValueKind == JsonValueKind.Number
                    ? dpc.GetInt32()
                    : null;
                string signedDownloadUrl = f.GetProperty("signedDownloadUrl").GetString()!;
                int expiresInSeconds = f.TryGetProperty("expiresInSeconds", out var eis) ? eis.GetInt32() : 120;

                files.Add(new ClaimedFileItem(
                    fileId,
                    originalFilename,
                    mimeType,
                    sha256Checksum,
                    detectedPageCount,
                    signedDownloadUrl,
                    expiresInSeconds
                ));
            }
        }

        var jobDetails = new ClaimedJobDetails(
            jobId,
            jobNumber,
            printerId,
            paperSize,
            printMode,
            printSides,
            copies,
            orientation,
            scaling,
            requestedPageRange,
            files
        );

        return new ClaimJobResult(true, attemptId, attemptNumber, leaseExpiresAt, jobDetails);
    }

    public async Task<ReportJobEventResult> ReportJobEventAsync(
        string deviceCredential,
        string attemptId,
        string nextStatus,
        string? spoolerJobId = null,
        string? errorCode = null,
        string? errorMessage = null,
        CancellationToken cancellationToken = default)
    {
        var payload = new
        {
            attemptId,
            nextStatus,
            spoolerJobId,
            errorCode,
            errorMessage
        };

        var request = new HttpRequestMessage(HttpMethod.Post, $"{_baseUrl}/agent-report-job-event")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.Add("x-device-credential", deviceCredential);

        var response = await _httpClient.SendAsync(request, cancellationToken);
        string responseText = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            SafeLogger.LogWarning($"Report job event failed (HTTP {(int)response.StatusCode}): {responseText}");
            return new ReportJobEventResult(false, null, null, null, null, responseText);
        }

        using var doc = JsonDocument.Parse(responseText);
        var root = doc.RootElement;

        string? jobId = root.TryGetProperty("jobId", out var jIdElem) ? jIdElem.GetString() : null;
        string? jobStatus = root.TryGetProperty("status", out var jStatElem) ? jStatElem.GetString() : null;
        string? reportedAttemptId = root.TryGetProperty("attemptId", out var attElem) ? attElem.GetString() : null;
        bool finished = root.TryGetProperty("finished", out var finElem) && finElem.GetBoolean();
        bool ok = response.IsSuccessStatusCode && !string.IsNullOrEmpty(jobId);

        return new ReportJobEventResult(ok, jobId, jobStatus, reportedAttemptId, finished ? jobStatus : "active");
    }
}
