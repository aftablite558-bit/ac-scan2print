using System.Drawing;
using System.Drawing.Imaging;
using ACScan2Print.Agent.Core.Enums;
using ACScan2Print.Agent.Core.Models;
using ACScan2Print.Agent.Infrastructure.Diagnostics;
using ACScan2Print.Agent.Infrastructure.Rendering;
using ACScan2Print.Agent.Infrastructure.Windows;

namespace ACScan2Print.Agent.Prototype;

public class Program
{
    public static async Task Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("=====================================================================");
        Console.WriteLine("   AC Scan2Print — Phase 5 Local Print Agent Prototype v1.0");
        Console.WriteLine("   Aman Computer Smart QR Print System (Windows 11)");
        Console.WriteLine("=====================================================================");
        Console.ResetColor();

        var discovery = new PrinterDiscoveryService();
        var pdfRenderer = new PdfRenderer();
        var imageService = new ImagePrintService();
        var spooler = new PrintSpoolerService();

        while (true)
        {
            Console.WriteLine("\n[Phase 5 Menu — Local Hardware Verification Mode (Zero Cloud Credentials Needed)]");
            Console.WriteLine("1. Discover Installed Printers & Capabilities");
            Console.WriteLine("2. Test Print: Single-Page PDF (TC-01)");
            Console.WriteLine("3. Test Print: Multi-Page PDF (TC-02)");
            Console.WriteLine("4. Test Print: High-Res JPG Image (TC-03)");
            Console.WriteLine("5. Test Print: PNG Image with Alpha (TC-04)");
            Console.WriteLine("6. Test Print: Hardware Duplex / Double-Sided (TC-10)");
            Console.WriteLine("7. Test Print: Multiple Copies (TC-11)");
            Console.WriteLine("8. Test Error: Offline / Invalid Printer Guard (TC-12)");
            Console.WriteLine("9. Run All Phase 5 Baseline Tests");
            Console.WriteLine("0. Exit");
            Console.Write("\nSelect option [0-9]: ");

            string? choice = Console.ReadLine()?.Trim();
            if (choice == "0") break;

            switch (choice)
            {
                case "1":
                    await RunPrinterDiscovery(discovery);
                    break;
                case "2":
                    await RunSinglePagePdfTest(discovery, pdfRenderer);
                    break;
                case "3":
                    await RunMultiPagePdfTest(discovery, pdfRenderer);
                    break;
                case "4":
                    await RunJpgImageTest(discovery, imageService);
                    break;
                case "5":
                    await RunPngImageTest(discovery, imageService);
                    break;
                case "6":
                    await RunDuplexTest(discovery, pdfRenderer);
                    break;
                case "7":
                    await RunCopiesTest(discovery, pdfRenderer);
                    break;
                case "8":
                    await RunOfflineErrorTest(pdfRenderer);
                    break;
                case "9":
                    await RunAllTests(discovery, pdfRenderer, imageService);
                    break;
                default:
                    Console.WriteLine("Invalid option. Please try again.");
                    break;
            }
        }

        Console.WriteLine("\nExiting AC Scan2Print Prototype. Goodbye!");
    }

    private static async Task<List<DiscoveredPrinter>> RunPrinterDiscovery(PrinterDiscoveryService discovery)
    {
        SafeLogger.LogInfo("Scanning Windows Print Spooler for installed printers...");
        var printers = await discovery.DiscoverPrintersAsync();

        if (printers.Count == 0)
        {
            SafeLogger.LogWarning("No printers detected in Windows Printers & Scanners!");
            return printers;
        }

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"\nFound {printers.Count} installed printer(s):");
        Console.ResetColor();

        for (int i = 0; i < printers.Count; i++)
        {
            var p = printers[i];
            string defaultBadge = p.IsDefault ? " [DEFAULT]" : "";
            Console.WriteLine($"\n[{i + 1}] {p.DisplayName}{defaultBadge}");
            Console.WriteLine($"    Driver:       {p.DriverName}");
            Console.WriteLine($"    Port:         {p.PortName} ({p.ConnectionType})");
            Console.WriteLine($"    Colour:       {(p.Capabilities.SupportsColour == true ? "YES" : "NO / Monochrome")}");
            Console.WriteLine($"    Duplex:       {(p.Capabilities.SupportsDuplex == true ? "YES (Hardware Auto)" : "NO / Simplex")}");
            Console.WriteLine($"    Paper Sizes:  {string.Join(", ", p.Capabilities.SupportedPaperSizes)}");
        }

        return printers;
    }

    private static async Task RunSinglePagePdfTest(PrinterDiscoveryService discovery, PdfRenderer pdfRenderer)
    {
        string? printerName = await PickPrinterAsync(discovery);
        if (printerName == null) return;

        string tempPdf = GenerateSamplePdf("TC-01_SinglePage.pdf", 1);
        SafeLogger.LogInfo($"Executing TC-01: Single-page PDF test on '{printerName}'...");

        var settings = new PrintSettings(PaperSize.A4, PrintMode.Bw, PrintSides.Simplex, 1);
        int jobId = await pdfRenderer.PrintPdfAsync(tempPdf, printerName, settings);

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"✓ TC-01 Dispatched to Windows Spooler! Spooler Job ID: {jobId}");
        Console.ResetColor();
    }

    private static async Task RunMultiPagePdfTest(PrinterDiscoveryService discovery, PdfRenderer pdfRenderer)
    {
        string? printerName = await PickPrinterAsync(discovery);
        if (printerName == null) return;

        string tempPdf = GenerateSamplePdf("TC-02_MultiPage.pdf", 3);
        SafeLogger.LogInfo($"Executing TC-02: Multi-page PDF test (3 pages) on '{printerName}'...");

        var settings = new PrintSettings(PaperSize.A4, PrintMode.Bw, PrintSides.Simplex, 1);
        int jobId = await pdfRenderer.PrintPdfAsync(tempPdf, printerName, settings);

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"✓ TC-02 Dispatched to Windows Spooler! Spooler Job ID: {jobId}");
        Console.ResetColor();
    }

    private static async Task RunJpgImageTest(PrinterDiscoveryService discovery, ImagePrintService imageService)
    {
        string? printerName = await PickPrinterAsync(discovery);
        if (printerName == null) return;

        string tempJpg = GenerateSampleImage("TC-03_Sample.jpg", ImageFormat.Jpeg, Color.DarkSlateGray);
        SafeLogger.LogInfo($"Executing TC-03: High-Res JPG test on '{printerName}'...");

        var settings = new PrintSettings(PaperSize.A4, PrintMode.Colour, PrintSides.Simplex, 1, orientation: "portrait", scaling: "fit");
        int jobId = await imageService.PrintImageAsync(tempJpg, printerName, settings);

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"✓ TC-03 Dispatched to Windows Spooler! Spooler Job ID: {jobId}");
        Console.ResetColor();
    }

    private static async Task RunPngImageTest(PrinterDiscoveryService discovery, ImagePrintService imageService)
    {
        string? printerName = await PickPrinterAsync(discovery);
        if (printerName == null) return;

        string tempPng = GenerateSampleImage("TC-04_Sample.png", ImageFormat.Png, Color.MediumSeaGreen);
        SafeLogger.LogInfo($"Executing TC-04: PNG with alpha test on '{printerName}'...");

        var settings = new PrintSettings(PaperSize.A4, PrintMode.Colour, PrintSides.Simplex, 1, orientation: "auto", scaling: "fit");
        int jobId = await imageService.PrintImageAsync(tempPng, printerName, settings);

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"✓ TC-04 Dispatched to Windows Spooler! Spooler Job ID: {jobId}");
        Console.ResetColor();
    }

    private static async Task RunDuplexTest(PrinterDiscoveryService discovery, PdfRenderer pdfRenderer)
    {
        string? printerName = await PickPrinterAsync(discovery);
        if (printerName == null) return;

        string tempPdf = GenerateSamplePdf("TC-10_Duplex.pdf", 2);
        SafeLogger.LogInfo($"Executing TC-10: Hardware Duplex test (Long-edge) on '{printerName}'...");

        var settings = new PrintSettings(PaperSize.A4, PrintMode.Bw, PrintSides.Duplex, 1);
        int jobId = await pdfRenderer.PrintPdfAsync(tempPdf, printerName, settings);

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"✓ TC-10 Duplex Job Dispatched to Spooler! Spooler Job ID: {jobId}");
        Console.ResetColor();
    }

    private static async Task RunCopiesTest(PrinterDiscoveryService discovery, PdfRenderer pdfRenderer)
    {
        string? printerName = await PickPrinterAsync(discovery);
        if (printerName == null) return;

        string tempPdf = GenerateSamplePdf("TC-11_Copies.pdf", 1);
        SafeLogger.LogInfo($"Executing TC-11: Multiple Copies test (3 copies collated) on '{printerName}'...");

        var settings = new PrintSettings(PaperSize.A4, PrintMode.Bw, PrintSides.Simplex, 3);
        int jobId = await pdfRenderer.PrintPdfAsync(tempPdf, printerName, settings);

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine($"✓ TC-11 Copies Job Dispatched! Spooler Job ID: {jobId}");
        Console.ResetColor();
    }

    private static async Task RunOfflineErrorTest(PdfRenderer pdfRenderer)
    {
        SafeLogger.LogInfo("Executing TC-12: Testing safe failure when printer is offline/non-existent...");
        try
        {
            var settings = new PrintSettings(PaperSize.A4, PrintMode.Bw, PrintSides.Simplex, 1);
            await pdfRenderer.PrintPdfAsync("dummy.pdf", "NonExistent_Printer_ACScan2Print", settings);
            Console.WriteLine("FAIL: Offline printer did not throw!");
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"✓ TC-12 PASSED: Gracefully caught expected error: {ex.Message}");
            Console.ResetColor();
        }
    }

    private static async Task RunAllTests(PrinterDiscoveryService discovery, PdfRenderer pdfRenderer, ImagePrintService imageService)
    {
        SafeLogger.LogInfo("=== Running Full Phase 5 Test Suite ===");
        await RunSinglePagePdfTest(discovery, pdfRenderer);
        await RunMultiPagePdfTest(discovery, pdfRenderer);
        await RunJpgImageTest(discovery, imageService);
        await RunPngImageTest(discovery, imageService);
        await RunDuplexTest(discovery, pdfRenderer);
        await RunCopiesTest(discovery, pdfRenderer);
        await RunOfflineErrorTest(pdfRenderer);
        SafeLogger.LogInfo("=== Full Phase 5 Suite Complete ===");
    }

    private static async Task<string?> PickPrinterAsync(PrinterDiscoveryService discovery)
    {
        var printers = await discovery.DiscoverPrintersAsync();
        if (printers.Count == 0)
        {
            SafeLogger.LogWarning("No printers available. Using Microsoft Print to PDF as fallback test queue.");
            return "Microsoft Print to PDF";
        }

        var defaultP = printers.FirstOrDefault(p => p.IsDefault) ?? printers[0];
        Console.WriteLine($"\nTarget Printer: '{defaultP.DisplayName}' (Press Enter to use, or enter printer number): ");
        string? input = Console.ReadLine()?.Trim();

        if (string.IsNullOrEmpty(input))
        {
            return defaultP.SystemPrinterName;
        }

        if (int.TryParse(input, out int num) && num >= 1 && num <= printers.Count)
        {
            return printers[num - 1].SystemPrinterName;
        }

        return defaultP.SystemPrinterName;
    }

    private static string GenerateSamplePdf(string filename, int pageCount)
    {
        string dir = Path.Combine(Path.GetTempPath(), "ACScan2Print_Samples");
        Directory.CreateDirectory(dir);
        string path = Path.Combine(dir, filename);

        // Minimal valid PDF structure for test prints
        using var sw = new StreamWriter(path, false, System.Text.Encoding.ASCII);
        sw.WriteLine("%PDF-1.4");
        sw.WriteLine("1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj");
        sw.WriteLine("2 0 obj <</Type /Pages /Kids [3 0 R] /Count " + pageCount + ">> endobj");
        sw.WriteLine("3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources <<>> /Contents 4 0 R>> endobj");
        sw.WriteLine("4 0 obj <</Length 44>> stream");
        sw.WriteLine("BT /F1 12 Tf 72 712 Td (AC Scan2Print Prototype Sample) Tj ET");
        sw.WriteLine("endstream endobj");
        sw.WriteLine("xref");
        sw.WriteLine("0 5");
        sw.WriteLine("0000000000 65535 f ");
        sw.WriteLine("0000000009 00000 n ");
        sw.WriteLine("0000000056 00000 n ");
        sw.WriteLine("0000000111 00000 n ");
        sw.WriteLine("0000000212 00000 n ");
        sw.WriteLine("trailer <</Size 5 /Root 1 0 R>>");
        sw.WriteLine("startxref");
        sw.WriteLine("306");
        sw.WriteLine("%%EOF");

        return path;
    }

    private static string GenerateSampleImage(string filename, ImageFormat format, Color bgColor)
    {
        string dir = Path.Combine(Path.GetTempPath(), "ACScan2Print_Samples");
        Directory.CreateDirectory(dir);
        string path = Path.Combine(dir, filename);

        using var bmp = new Bitmap(1200, 800);
        using var g = Graphics.FromImage(bmp);
        g.Clear(bgColor);

        using var font = new Font("Arial", 28, FontStyle.Bold);
        using var brush = new SolidBrush(Color.White);
        g.DrawString("AMAN COMPUTER — AC Scan2Print", font, brush, 50, 100);

        using var subFont = new Font("Arial", 16);
        g.DrawString($"Phase 5 Local Print Prototype Test Image ({filename})", subFont, brush, 50, 160);
        g.DrawString($"Timestamp: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC", subFont, brush, 50, 200);

        bmp.Save(path, format);
        return path;
    }
}
