using ACScan2Print.Agent.Infrastructure.Diagnostics;
using Xunit;

namespace ACScan2Print.Agent.Tests;

public class LocalFileSecurityTests
{
    [Fact]
    public void SafeLogger_ShouldRedactSha256Tokens()
    {
        string raw = "Customer job hash 4a5b6c7d8e9f0123456789abcdef0123456789abcdef0123456789abcdef0123 was processed.";
        string sanitized = SafeLogger.Sanitize(raw);

        Assert.DoesNotContain("4a5b6c7d8e9f0123456789abcdef0123456789abcdef0123456789abcdef0123", sanitized);
        Assert.Contains("[REDACTED_HASH]", sanitized);
    }

    [Fact]
    public void SafeLogger_ShouldRedactUrlSecrets()
    {
        string raw = "Download URL: https://ac-scan2print.web.app/quick-print/track?token=secret123456789";
        string sanitized = SafeLogger.Sanitize(raw);

        Assert.DoesNotContain("secret123456789", sanitized);
        Assert.Contains("token=[REDACTED]", sanitized);
    }
}
