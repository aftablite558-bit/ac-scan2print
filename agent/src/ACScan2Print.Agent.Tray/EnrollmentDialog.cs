using System.Drawing;
using System.Windows.Forms;
using ACScan2Print.Agent.Core.Interfaces;
using ACScan2Print.Agent.Infrastructure.Api;
using ACScan2Print.Agent.Infrastructure.Windows;

namespace ACScan2Print.Agent.Tray;

public class EnrollmentDialog : Form
{
    private readonly TextBox _deviceNameBox;
    private readonly TextBox _adminTokenBox;
    private readonly Button _enrollBtn;
    private readonly Label _statusLabel;
    private readonly IDpapiStorage _dpapiStorage;
    private readonly IAgentApiClient _apiClient;

    public EnrollmentDialog()
    {
        _dpapiStorage = new DpapiStorage();
        _apiClient = new AgentApiClient();

        Text = "AC Scan2Print — Device Enrollment";
        Size = new Size(540, 360);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        BackColor = Color.FromArgb(17, 19, 24); // Obsidian Black
        ForeColor = Color.White;

        var title = new Label
        {
            Text = "Enroll Windows 11 Counter PC",
            Font = new Font("Segoe UI", 13, FontStyle.Bold),
            ForeColor = Color.FromArgb(37, 199, 217), // Electric Cyan
            Location = new Point(25, 20),
            AutoSize = true
        };
        Controls.Add(title);

        var sub = new Label
        {
            Text = "Pair this PC securely with Aman Computer Supabase backend.",
            Font = new Font("Segoe UI", 9),
            ForeColor = Color.DarkGray,
            Location = new Point(25, 50),
            AutoSize = true
        };
        Controls.Add(sub);

        var devLabel = new Label
        {
            Text = "Device Friendly Name:",
            Location = new Point(25, 90),
            AutoSize = true
        };
        Controls.Add(devLabel);

        _deviceNameBox = new TextBox
        {
            Text = Environment.MachineName,
            Location = new Point(25, 115),
            Size = new Size(470, 26),
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };
        Controls.Add(_deviceNameBox);

        var tokenLabel = new Label
        {
            Text = "Super Admin Token / Pairing Key:",
            Location = new Point(25, 155),
            AutoSize = true
        };
        Controls.Add(tokenLabel);

        _adminTokenBox = new TextBox
        {
            Location = new Point(25, 180),
            Size = new Size(470, 26),
            UseSystemPasswordChar = true,
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };
        Controls.Add(_adminTokenBox);

        _statusLabel = new Label
        {
            Text = "",
            Location = new Point(25, 220),
            Size = new Size(470, 40),
            ForeColor = Color.Yellow
        };
        Controls.Add(_statusLabel);

        _enrollBtn = new Button
        {
            Text = "Complete Enrollment",
            Location = new Point(25, 265),
            Size = new Size(180, 36),
            BackColor = Color.FromArgb(37, 199, 217),
            ForeColor = Color.FromArgb(17, 19, 24),
            FlatStyle = FlatStyle.Flat
        };
        _enrollBtn.Click += async (s, e) => await PerformEnrollmentAsync();
        Controls.Add(_enrollBtn);

        var cancelBtn = new Button
        {
            Text = "Cancel",
            Location = new Point(365, 265),
            Size = new Size(130, 36),
            BackColor = Color.FromArgb(45, 55, 72),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        cancelBtn.Click += (s, e) => Close();
        Controls.Add(cancelBtn);
    }

    private async Task PerformEnrollmentAsync()
    {
        string devName = _deviceNameBox.Text.Trim();
        string token = _adminTokenBox.Text.Trim();

        if (string.IsNullOrEmpty(devName) || devName.Length < 2)
        {
            _statusLabel.Text = "Please enter a valid Device Name (at least 2 characters).";
            _statusLabel.ForeColor = Color.Red;
            return;
        }

        if (string.IsNullOrEmpty(token))
        {
            _statusLabel.Text = "Please enter the Admin Token or pairing key.";
            _statusLabel.ForeColor = Color.Red;
            return;
        }

        _enrollBtn.Enabled = false;
        _statusLabel.Text = "Contacting Supabase Edge Function to pair device...";
        _statusLabel.ForeColor = Color.Cyan;

        try
        {
            var res = await _apiClient.EnrollDeviceAsync(token, devName, Environment.OSVersion.ToString(), "1.0.4");

            // Encrypt and persist with Windows DPAPI
            _dpapiStorage.SaveProtectedSecret("ACScan2Print_DeviceId", res.DeviceId.ToString());
            _dpapiStorage.SaveProtectedSecret("ACScan2Print_DeviceCredential", res.DeviceCredential);

            _statusLabel.Text = $"Device Enrolled Successfully! ID: {res.DeviceId}";
            _statusLabel.ForeColor = Color.LightGreen;

            MessageBox.Show($"Device '{res.DeviceName}' successfully enrolled!\nCredentials securely encrypted using Windows DPAPI.", "Enrollment Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Close();
        }
        catch (Exception ex)
        {
            _statusLabel.Text = $"Enrollment failed: {ex.Message}";
            _statusLabel.ForeColor = Color.Red;
            _enrollBtn.Enabled = true;
        }
    }
}
