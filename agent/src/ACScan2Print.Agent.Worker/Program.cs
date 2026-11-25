using ACScan2Print.Agent.Core.Interfaces;
using ACScan2Print.Agent.Infrastructure.Api;
using ACScan2Print.Agent.Infrastructure.Rendering;
using ACScan2Print.Agent.Infrastructure.Storage;
using ACScan2Print.Agent.Infrastructure.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ACScan2Print.Agent.Worker;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);
        builder.Services.AddWindowsService(options =>
        {
            options.ServiceName = "ACScan2PrintAgent";
        });

        builder.Services.AddHttpClient();
        builder.Services.AddSingleton<HttpClient>();
        builder.Services.AddSingleton<IAgentApiClient, AgentApiClient>();
        builder.Services.AddSingleton<IPrinterDiscoveryService, PrinterDiscoveryService>();
        builder.Services.AddSingleton<IPrintSpoolerService, PrintSpoolerService>();
        builder.Services.AddSingleton<IPdfRenderer, PdfRenderer>();
        builder.Services.AddSingleton<IImagePrintService, ImagePrintService>();
        builder.Services.AddSingleton<ILocalFileManager, LocalFileManager>();
        builder.Services.AddSingleton<IDpapiStorage, DpapiStorage>();

        builder.Services.AddHostedService<Worker>();

        var host = builder.Build();
        host.Run();
    }
}
