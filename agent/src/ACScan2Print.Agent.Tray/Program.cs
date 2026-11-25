using System.Windows.Forms;

namespace ACScan2Print.Agent.Tray;

public static class Program
{
    [STAThread]
    public static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
    }
}
