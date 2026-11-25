using System.Drawing;
using System.Windows.Forms;
using ACScan2Print.Agent.Core.Models;
using ACScan2Print.Agent.Infrastructure.Windows;

namespace ACScan2Print.Agent.Tray;

public class DiagnosticForm : Form
{
    private readonly PrinterDiscoveryService _discovery = new();
    private readonly ListView _printerListView;
    private readonly Label _pcSpecsLabel;
    private readonly Label _statusLabel;

    public DiagnosticForm()
    {
        Text = "AC Scan2Print — Local Agent Diagnostics (Aman Computer)";
        Size = new Size(720, 520);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        BackColor = Color.FromArgb(17, 19, 24); // Obsidian Black per UI/UX spec
        ForeColor = Color.White;

        var header = new Label
        {
            Text = "AC Scan2Print — Agent Diagnostics",
            Font = new Font("Segoe UI", 14, FontStyle.Bold),
            ForeColor = Color.FromArgb(37, 199, 217), // Electric Cyan
            Location = new Point(20, 15),
            AutoSize = true
        };
        Controls.Add(header);

        _statusLabel = new Label
        {
            Text = "Status: Local Standalone Prototype Mode (Ready for Shop Printing)",
            Font = new Font("Segoe UI", 10),
            ForeColor = Color.LightGreen,
            Location = new Point(20, 50),
            AutoSize = true
        };
        Controls.Add(_statusLabel);

        _pcSpecsLabel = new Label
        {
            Text = $"Host PC: {Environment.MachineName} | OS: {Environment.OSVersion} | Architecture: {(Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit")}",
            Font = new Font("Segoe UI", 9),
            ForeColor = Color.DarkGray,
            Location = new Point(20, 80),
            AutoSize = true
        };
        Controls.Add(_pcSpecsLabel);

        var printersHeader = new Label
        {
            Text = "Discovered Counter Printers:",
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            ForeColor = Color.White,
            Location = new Point(20, 120),
            AutoSize = true
        };
        Controls.Add(printersHeader);

        _printerListView = new ListView
        {
            Location = new Point(20, 150),
            Size = new Size(660, 260),
            View = View.Details,
            FullRowSelect = true,
            GridLines = true,
            BackColor = Color.FromArgb(26, 32, 44),
            ForeColor = Color.White
        };
        _printerListView.Columns.Add("Printer Name", 200);
        _printerListView.Columns.Add("Driver", 150);
        _printerListView.Columns.Add("Port", 90);
        _printerListView.Columns.Add("Colour", 70);
        _printerListView.Columns.Add("Duplex", 80);
        _printerListView.Columns.Add("Default", 60);
        Controls.Add(_printerListView);

        var refreshBtn = new Button
        {
            Text = "Refresh Printers",
            Location = new Point(20, 425),
            Size = new Size(130, 36),
            BackColor = Color.FromArgb(37, 199, 217),
            ForeColor = Color.FromArgb(17, 19, 24),
            FlatStyle = FlatStyle.Flat
        };
        refreshBtn.Click += async (s, e) => await LoadPrintersAsync();
        Controls.Add(refreshBtn);

        var closeBtn = new Button
        {
            Text = "Close",
            Location = new Point(550, 425),
            Size = new Size(130, 36),
            BackColor = Color.FromArgb(45, 55, 72),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        closeBtn.Click += (s, e) => Hide();
        Controls.Add(closeBtn);

        Load += async (s, e) => await LoadPrintersAsync();
    }

    private async Task LoadPrintersAsync()
    {
        _printerListView.Items.Clear();
        var printers = await _discovery.DiscoverPrintersAsync();

        foreach (var p in printers)
        {
            var item = new ListViewItem(p.DisplayName);
            item.SubItems.Add(p.DriverName);
            item.SubItems.Add(p.PortName);
            item.SubItems.Add(p.Capabilities.SupportsColour == true ? "Yes" : "No");
            item.SubItems.Add(p.Capabilities.SupportsDuplex == true ? "Auto" : "Simplex");
            item.SubItems.Add(p.IsDefault ? "Yes" : "No");
            _printerListView.Items.Add(item);
        }
    }
}
