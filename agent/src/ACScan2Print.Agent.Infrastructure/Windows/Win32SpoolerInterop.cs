using System.Runtime.InteropServices;

namespace ACScan2Print.Agent.Infrastructure.Windows;

public static class Win32SpoolerInterop
{
    public const int PRINTER_ACCESS_ADMINISTER = 0x00000004;
    public const int PRINTER_ACCESS_USE = 0x00000008;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct DOC_INFO_1
    {
        [MarshalAs(UnmanagedType.LPTStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPTStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPTStr)] public string pDatatype;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct PRINTER_DEFAULTS
    {
        public IntPtr pDatatype;
        public IntPtr pDevMode;
        public int DesiredAccess;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOB_INFO_2
    {
        public int JobId;
        [MarshalAs(UnmanagedType.LPTStr)] public string pPrinterName;
        [MarshalAs(UnmanagedType.LPTStr)] public string pMachineName;
        [MarshalAs(UnmanagedType.LPTStr)] public string pUserName;
        [MarshalAs(UnmanagedType.LPTStr)] public string pDocument;
        [MarshalAs(UnmanagedType.LPTStr)] public string pNotifyName;
        [MarshalAs(UnmanagedType.LPTStr)] public string pDatatype;
        [MarshalAs(UnmanagedType.LPTStr)] public string pPrintProcessor;
        [MarshalAs(UnmanagedType.LPTStr)] public string pParameters;
        [MarshalAs(UnmanagedType.LPTStr)] public string pDriverName;
        public IntPtr pDevMode;
        [MarshalAs(UnmanagedType.LPTStr)] public string pStatus;
        public IntPtr pSecurityDescriptor;
        public int Status;
        public int Priority;
        public int Position;
        public int StartTime;
        public int UntilTime;
        public int TotalPages;
        public int Size;
        public SYSTEMTIME Submitted;
        public int Time;
        public int PagesPrinted;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SYSTEMTIME
    {
        public short wYear;
        public short wMonth;
        public short wDayOfWeek;
        public short wDay;
        public short wHour;
        public short wMinute;
        public short wSecond;
        public short wMilliseconds;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinter", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, ref PRINTER_DEFAULTS pDefault);

    [DllImport("winspool.drv", EntryPoint = "OpenPrinter", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinter", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] ref DOC_INFO_1 di1);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBuf, int cdBuf, out int pcWritten);

    [DllImport("winspool.drv", EntryPoint = "GetJob", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool GetJob(IntPtr hPrinter, int jobId, int level, IntPtr pJob, int cbBuf, out int pcbNeeded);
}
