using ACScan2Print.Agent.Core.Enums;
using ACScan2Print.Agent.Core.Models;
using Xunit;

namespace ACScan2Print.Agent.Tests;

public class PrintSettingsValidationTests
{
    [Fact]
    public void ValidSettings_ShouldPassValidation()
    {
        var settings = new PrintSettings(PaperSize.A4, PrintMode.Bw, PrintSides.Simplex, 2);
        settings.Validate(); // Should not throw
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(21)]
    [InlineData(100)]
    public void InvalidCopies_ShouldThrowArgumentOutOfRangeException(int invalidCopies)
    {
        var settings = new PrintSettings(PaperSize.A4, PrintMode.Bw, PrintSides.Simplex, invalidCopies);
        Assert.Throws<ArgumentOutOfRangeException>(() => settings.Validate());
    }

    [Fact]
    public void DuplexSettings_ShouldEnforceDuplexSides()
    {
        var settings = new PrintSettings(PaperSize.A4, PrintMode.Colour, PrintSides.Duplex, 1);
        Assert.Equal(PrintSides.Duplex, settings.Sides);
        Assert.Equal(PrintMode.Colour, settings.PrintMode);
    }
}
