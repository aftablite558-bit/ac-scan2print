using System.Drawing;
using System.Drawing.Printing;
using ACScan2Print.Agent.Core.Enums;
using ACScan2Print.Agent.Core.Interfaces;
using ACScan2Print.Agent.Core.Models;

namespace ACScan2Print.Agent.Infrastructure.Rendering;

public class ImagePrintService : IImagePrintService
{
    public Task<int> PrintImageAsync(string filePath, string printerName, PrintSettings settings, CancellationToken cancellationToken = default)
    {
        return Task.Run(() =>
        {
            if (!File.Exists(filePath))
                throw new FileNotFoundException("Image file not found", filePath);

            settings.Validate();

            using var image = Image.FromFile(filePath);
            using var printDoc = new PrintDocument();
            printDoc.PrinterSettings.PrinterName = printerName;

            if (!printDoc.PrinterSettings.IsValid)
            {
                throw new InvalidOperationException($"Printer '{printerName}' is invalid or offline.");
            }

            printDoc.PrinterSettings.Copies = (short)settings.Copies;
            printDoc.PrinterSettings.Collate = settings.Copies > 1;

            if (settings.Sides == PrintSides.Duplex && printDoc.PrinterSettings.CanDuplex)
            {
                printDoc.PrinterSettings.Duplex = Duplex.Vertical;
            }
            else
            {
                printDoc.PrinterSettings.Duplex = Duplex.Simplex;
            }

            printDoc.DefaultPageSettings.Color = settings.PrintMode == PrintMode.Colour && printDoc.PrinterSettings.SupportsColor;

            // Auto-detect orientation from image dimensions if set to 'auto'
            bool shouldLandscape = settings.Orientation.Equals("landscape", StringComparison.OrdinalIgnoreCase) ||
                                  (settings.Orientation.Equals("auto", StringComparison.OrdinalIgnoreCase) && image.Width > image.Height);
            printDoc.DefaultPageSettings.Landscape = shouldLandscape;

            printDoc.DocumentName = $"ACScan2Print_{Path.GetFileNameWithoutExtension(filePath)}";

            printDoc.PrintPage += (sender, args) =>
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    args.Cancel = true;
                    return;
                }

                var g = args.Graphics;
                if (g == null) return;

                Rectangle bounds = args.MarginBounds;

                if (settings.Scaling.Equals("actual", StringComparison.OrdinalIgnoreCase))
                {
                    // Actual size centered
                    int destX = bounds.X + Math.Max(0, (bounds.Width - image.Width) / 2);
                    int destY = bounds.Y + Math.Max(0, (bounds.Height - image.Height) / 2);
                    g.DrawImage(image, destX, destY, image.Width, image.Height);
                }
                else // "fit" or default scaling
                {
                    // Fit to page preserving aspect ratio (fit-to-page)
                    float ratioX = (float)bounds.Width / image.Width;
                    float ratioY = (float)bounds.Height / image.Height;
                    float ratio = Math.Min(ratioX, ratioY);

                    int newWidth = (int)(image.Width * ratio);
                    int newHeight = (int)(image.Height * ratio);

                    int destX = bounds.X + (bounds.Width - newWidth) / 2;
                    int destY = bounds.Y + (bounds.Height - newHeight) / 2;

                    g.DrawImage(image, destX, destY, newWidth, newHeight);
                }

                args.HasMorePages = false;
            };

            printDoc.PrintController = new StandardPrintController();
            printDoc.Print();

            return 2000 + Random.Shared.Next(1, 9999);
        }, cancellationToken);
    }
}
