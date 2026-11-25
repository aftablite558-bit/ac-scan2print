using System.Drawing.Printing;
using System.Management;
using ACScan2Print.Agent.Core.Enums;
using ACScan2Print.Agent.Core.Interfaces;
using ACScan2Print.Agent.Core.Models;

namespace ACScan2Print.Agent.Infrastructure.Windows;

public class PrinterDiscoveryService : IPrinterDiscoveryService
{
    public Task<List<DiscoveredPrinter>> DiscoverPrintersAsync(CancellationToken cancellationToken = default)
    {
        return Task.Run(() =>
        {
            var list = new List<DiscoveredPrinter>();

            foreach (string printerName in PrinterSettings.InstalledPrinters)
            {
                cancellationToken.ThrowIfCancellationRequested();

                try
                {
                    var settings = new PrinterSettings { PrinterName = printerName };
                    if (!settings.IsValid) continue;

                    string driverName = "Generic / Unknown Driver";
                    string portName = "Unknown Port";
                    bool isDefault = settings.IsDefaultPrinter;
                    string? model = null;

                    // Query WMI Win32_Printer for hardware specifics
                    try
                    {
                        using var searcher = new ManagementObjectSearcher(
                            $"SELECT DriverName, PortName, Caption, Local, Network, WorkOffline, PrinterStatus FROM Win32_Printer WHERE Name = '{printerName.Replace("\\", "\\\\")}'");
                        foreach (ManagementObject obj in searcher.Get())
                        {
                            driverName = obj["DriverName"]?.ToString() ?? driverName;
                            portName = obj["PortName"]?.ToString() ?? portName;
                            model = obj["Caption"]?.ToString();
                        }
                    }
                    catch
                    {
                        // Fallback gracefully if WMI is restricted in user session
                    }

                    ConnectionType connectionType = DetectConnectionType(portName);
                    bool supportsColour = settings.SupportsColor;
                    bool supportsDuplex = settings.CanDuplex;

                    var supportedSizes = new List<string>();
                    foreach (PaperSize size in settings.PaperSizes)
                    {
                        string sName = size.PaperName.ToUpperInvariant();
                        if (sName.Contains("A4") && !supportedSizes.Contains("A4")) supportedSizes.Add("A4");
                        else if (sName.Contains("LEGAL") && !supportedSizes.Contains("Legal")) supportedSizes.Add("Legal");
                        else if (sName.Contains("A3") && !supportedSizes.Contains("A3")) supportedSizes.Add("A3");
                    }
                    if (supportedSizes.Count == 0) supportedSizes.Add("A4");

                    var capabilities = new PrinterCapabilities(
                        SupportsColour: supportsColour,
                        SupportsDuplex: supportsDuplex,
                        SupportedPaperSizes: supportedSizes.ToArray()
                    );

                    list.Add(new DiscoveredPrinter(
                        SystemPrinterName: printerName,
                        DisplayName: printerName,
                        DriverName: driverName,
                        PortName: portName,
                        ConnectionType: connectionType,
                        IsDefault: isDefault,
                        IsOnline: !settings.PrinterName.Contains("Offline"),
                        Capabilities: capabilities,
                        PrinterModel: model
                    ));
                }
                catch
                {
                    // Continue scanning other printers if one driver throws
                }
            }

            return list;
        }, cancellationToken);
    }

    public async Task<DiscoveredPrinter?> GetPrinterDetailsAsync(string printerName, CancellationToken cancellationToken = default)
    {
        var all = await DiscoverPrintersAsync(cancellationToken);
        return all.FirstOrDefault(p => string.Equals(p.SystemPrinterName, printerName, StringComparison.OrdinalIgnoreCase));
    }

    private static ConnectionType DetectConnectionType(string portName)
    {
        string portUpper = portName.ToUpperInvariant();
        if (portUpper.StartsWith("USB")) return ConnectionType.Usb;
        if (portUpper.StartsWith("WSD") || portUpper.Contains("WIFI") || portUpper.Contains("WIRELESS")) return ConnectionType.Wifi;
        if (portUpper.StartsWith("IP_") || portUpper.StartsWith("TCP") || portUpper.Contains("LAN") || portUpper.Contains("192.") || portUpper.Contains("10.")) return ConnectionType.Lan;
        if (portUpper.StartsWith("COM") || portUpper.StartsWith("LPT")) return ConnectionType.Other;

        return ConnectionType.Unknown;
    }
}
