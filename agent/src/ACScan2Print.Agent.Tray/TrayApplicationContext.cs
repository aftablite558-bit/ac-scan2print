using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using ACScan2Print.Agent.Infrastructure.Diagnostics;
using ACScan2Print.Agent.Infrastructure.Windows;

namespace ACScan2Print.Agent.Tray;

public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _notifyIcon;
    private readonly ContextMenuStrip _contextMenu;
    private readonly DiagnosticForm _diagnosticForm;
    private readonly PrinterDiscoveryService _discovery;
    private bool _isPaused = false;

    public TrayApplicationContext()
    {
        _discovery = new PrinterDiscoveryService();
        _diagnosticForm = new DiagnosticForm();

        _contextMenu = new ContextMenuStrip();
        BuildContextMenu();

        _notifyIcon = new NotifyIcon
        {
            Icon = CreateCyanMonogramIcon(Color.FromArgb(37, 199, 217)), // Electric Cyan monogram per UI/UX spec
            ContextMenuStrip = _contextMenu,
            Text = "AC Scan2Print Local Agent — Ready",
            Visible = true
        };

        _notifyIcon.DoubleClick += (s, e) => ShowDiagnostics();
    }

    private void BuildContextMenu()
    {
        _contextMenu.Items.Clear();

        var headerItem = new ToolStripMenuItem("AC Scan2Print Local Agent — v1.0") { Enabled = false };
        headerItem.Font = new Font(_contextMenu.Font, FontStyle.Bold);

        var dpapi = new DpapiStorage();
        bool isEnrolled = !string.IsNullOrEmpty(dpapi.LoadProtectedSecret("ACScan2Print_DeviceCredential"));

        var statusText = _isPaused 
            ? "Status: Paused" 
            : isEnrolled 
                ? "Status: Active & Enrolled (Aman Computer)" 
                : "Status: Unenrolled (Requires Pairing)";
        var statusItem = new ToolStripMenuItem(statusText) { Enabled = false };

        var enrollItem = new ToolStripMenuItem("Enroll This Device...", null, (s, e) =>
        {
            var dialog = new EnrollmentDialog();
            dialog.ShowDialog();
            BuildContextMenu();
        });

        var pauseItem = new ToolStripMenuItem(_isPaused ? "Resume Processing" : "Pause Incoming Claims", null, (s, e) =>
        {
            _isPaused = !_isPaused;
            _notifyIcon.Text = _isPaused ? "AC Scan2Print — Paused" : "AC Scan2Print — Ready";
            _notifyIcon.Icon = _isPaused ? CreateCyanMonogramIcon(Color.Orange) : CreateCyanMonogramIcon(Color.FromArgb(37, 199, 217));
            BuildContextMenu();
        });

        var refreshItem = new ToolStripMenuItem("Refresh Connected Printers", null, async (s, e) =>
        {
            var printers = await _discovery.DiscoverPrintersAsync();
            _notifyIcon.ShowBalloonTip(2000, "Printers Refreshed", $"Detected {printers.Count} printers on counter PC.", ToolTipIcon.Info);
        });

        var testPrintItem = new ToolStripMenuItem("Run Local Test Print", null, async (s, e) =>
        {
            var printers = await _discovery.DiscoverPrintersAsync();
            var target = printers.FirstOrDefault(p => p.IsDefault) ?? printers.FirstOrDefault();
            if (target != null)
            {
                var spooler = new PrintSpoolerService();
                byte[] rawTest = System.Text.Encoding.ASCII.GetBytes("AC Scan2Print Prototype Spooler Verification\r\n\f");
                int jobId = await spooler.SubmitRawJobAsync(target.SystemPrinterName, "ACScan2Print_Tray_Test", rawTest);
                _notifyIcon.ShowBalloonTip(2000, "Test Print Sent", $"Dispatched test page to '{target.DisplayName}'. Spooler Job ID: {jobId}", ToolTipIcon.Info);
            }
            else
            {
                MessageBox.Show("No installed printer detected.", "Print Test Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        });

        var diagItem = new ToolStripMenuItem("Open Diagnostic Window", null, (s, e) => ShowDiagnostics());

        var exitItem = new ToolStripMenuItem("Exit Agent", null, (s, e) =>
        {
            _notifyIcon.Visible = false;
            Application.Exit();
        });

        _contextMenu.Items.Add(headerItem);
        _contextMenu.Items.Add(statusItem);
        if (!isEnrolled)
        {
            _contextMenu.Items.Add(enrollItem);
        }
        _contextMenu.Items.Add(new ToolStripSeparator());
        _contextMenu.Items.Add(pauseItem);
        _contextMenu.Items.Add(refreshItem);
        _contextMenu.Items.Add(testPrintItem);
        _contextMenu.Items.Add(diagItem);
        _contextMenu.Items.Add(new ToolStripSeparator());
        _contextMenu.Items.Add(exitItem);
    }

    private void ShowDiagnostics()
    {
        if (_diagnosticForm.Visible)
        {
            _diagnosticForm.BringToFront();
        }
        else
        {
            _diagnosticForm.Show();
        }
    }

    private static Icon CreateCyanMonogramIcon(Color accentColor)
    {
        using var bitmap = new Bitmap(32, 32);
        using var g = Graphics.FromImage(bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;

        // Dark background tile
        using var bgBrush = new SolidBrush(Color.FromArgb(17, 19, 24));
        g.FillRectangle(bgBrush, 0, 0, 32, 32);

        // Cyan border
        using var borderPen = new Pen(accentColor, 2);
        g.DrawRectangle(borderPen, 1, 1, 30, 30);

        // "AC" monogram
        using var textBrush = new SolidBrush(accentColor);
        using var font = new Font("Arial", 12, FontStyle.Bold);
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("AC", font, textBrush, new RectangleF(0, 0, 32, 32), sf);

        return Icon.FromHandle(bitmap.GetHicon());
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _notifyIcon.Dispose();
            _contextMenu.Dispose();
            _diagnosticForm.Dispose();
        }
        base.Dispose(disposing);
    }
}
