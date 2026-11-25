using System.ComponentModel;
using System.Runtime.InteropServices;
using ACScan2Print.Agent.Core.Enums;
using ACScan2Print.Agent.Core.Interfaces;

namespace ACScan2Print.Agent.Infrastructure.Windows;

public class PrintSpoolerService : IPrintSpoolerService
{
    public Task<int> SubmitRawJobAsync(string printerName, string documentTitle, byte[] data, CancellationToken cancellationToken = default)
    {
        return Task.Run(() =>
        {
            if (string.IsNullOrWhiteSpace(printerName))
                throw new ArgumentException("Printer name cannot be empty", nameof(printerName));

            if (data == null || data.Length == 0)
                throw new ArgumentException("Print payload cannot be empty", nameof(data));

            var defaults = new Win32SpoolerInterop.PRINTER_DEFAULTS
            {
                pDatatype = IntPtr.Zero,
                pDevMode = IntPtr.Zero,
                DesiredAccess = Win32SpoolerInterop.PRINTER_ACCESS_USE
            };

            if (!Win32SpoolerInterop.OpenPrinter(printerName, out var hPrinter, ref defaults))
            {
                int error = Marshal.GetLastWin32Error();
                throw new Win32Exception(error, $"Failed to open printer '{printerName}'. Win32 error code: {error}");
            }

            try
            {
                var docInfo = new Win32SpoolerInterop.DOC_INFO_1
                {
                    pDocName = documentTitle,
                    pOutputFile = null!,
                    pDatatype = "RAW"
                };

                int jobId = Win32SpoolerInterop.StartDocPrinter(hPrinter, 1, ref docInfo);
                if (jobId == 0)
                {
                    int error = Marshal.GetLastWin32Error();
                    throw new Win32Exception(error, $"Failed to start doc on printer '{printerName}'. Win32 error: {error}");
                }

                try
                {
                    if (!Win32SpoolerInterop.StartPagePrinter(hPrinter))
                    {
                        int error = Marshal.GetLastWin32Error();
                        throw new Win32Exception(error, $"Failed to start page on printer '{printerName}'. Win32 error: {error}");
                    }

                    IntPtr unmanagedPointer = Marshal.AllocHGlobal(data.Length);
                    try
                    {
                        Marshal.Copy(data, 0, unmanagedPointer, data.Length);
                        if (!Win32SpoolerInterop.WritePrinter(hPrinter, unmanagedPointer, data.Length, out int written))
                        {
                            int error = Marshal.GetLastWin32Error();
                            throw new Win32Exception(error, $"Failed to write to printer '{printerName}'. Win32 error: {error}");
                        }
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(unmanagedPointer);
                        Win32SpoolerInterop.EndPagePrinter(hPrinter);
                    }
                }
                finally
                {
                    Win32SpoolerInterop.EndDocPrinter(hPrinter);
                }

                return jobId;
            }
            finally
            {
                Win32SpoolerInterop.ClosePrinter(hPrinter);
            }
        }, cancellationToken);
    }

    public Task<int> SubmitRenderedJobAsync(string printerName, string documentTitle, Func<IntPtr, bool> printCallback, CancellationToken cancellationToken = default)
    {
        return Task.Run(() =>
        {
            var defaults = new Win32SpoolerInterop.PRINTER_DEFAULTS
            {
                DesiredAccess = Win32SpoolerInterop.PRINTER_ACCESS_USE
            };

            if (!Win32SpoolerInterop.OpenPrinter(printerName, out var hPrinter, ref defaults))
            {
                int error = Marshal.GetLastWin32Error();
                throw new Win32Exception(error, $"Cannot open printer '{printerName}'. Win32 error: {error}");
            }

            try
            {
                var docInfo = new Win32SpoolerInterop.DOC_INFO_1
                {
                    pDocName = documentTitle,
                    pOutputFile = null!,
                    pDatatype = "RAW"
                };

                int jobId = Win32SpoolerInterop.StartDocPrinter(hPrinter, 1, ref docInfo);
                if (jobId == 0)
                {
                    int error = Marshal.GetLastWin32Error();
                    throw new Win32Exception(error, $"StartDocPrinter failed for '{printerName}'. Win32 error: {error}");
                }

                try
                {
                    bool success = printCallback(hPrinter);
                    if (!success)
                    {
                        throw new InvalidOperationException($"Print callback failed during execution for '{documentTitle}'");
                    }
                }
                finally
                {
                    Win32SpoolerInterop.EndDocPrinter(hPrinter);
                }

                return jobId;
            }
            finally
            {
                Win32SpoolerInterop.ClosePrinter(hPrinter);
            }
        }, cancellationToken);
    }

    public Task<SpoolerJobStatus> GetSpoolerJobStatusAsync(string printerName, int spoolerJobId, CancellationToken cancellationToken = default)
    {
        return Task.Run(() =>
        {
            if (!Win32SpoolerInterop.OpenPrinter(printerName, out var hPrinter, IntPtr.Zero))
            {
                return SpoolerJobStatus.Unknown;
            }

            try
            {
                Win32SpoolerInterop.GetJob(hPrinter, spoolerJobId, 2, IntPtr.Zero, 0, out int bytesNeeded);
                if (bytesNeeded == 0)
                {
                    // Job no longer in queue -> Printed or Cleared
                    return SpoolerJobStatus.Printed;
                }

                IntPtr pJob = Marshal.AllocHGlobal(bytesNeeded);
                try
                {
                    if (Win32SpoolerInterop.GetJob(hPrinter, spoolerJobId, 2, pJob, bytesNeeded, out _))
                    {
                        var jobInfo = Marshal.PtrToStructure<Win32SpoolerInterop.JOB_INFO_2>(pJob);
                        return MapWin32JobStatus(jobInfo.Status);
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(pJob);
                }

                return SpoolerJobStatus.Unknown;
            }
            finally
            {
                Win32SpoolerInterop.ClosePrinter(hPrinter);
            }
        }, cancellationToken);
    }

    private static SpoolerJobStatus MapWin32JobStatus(int statusFlags)
    {
        const int JOB_STATUS_PAUSED = 0x00000001;
        const int JOB_STATUS_ERROR = 0x00000002;
        const int JOB_STATUS_DELETING = 0x00000004;
        const int JOB_STATUS_SPOOLING = 0x00000008;
        const int JOB_STATUS_PRINTING = 0x00000010;
        const int JOB_STATUS_OFFLINE = 0x00000020;
        const int JOB_STATUS_PAPEROUT = 0x00000040;
        const int JOB_STATUS_PRINTED = 0x00000080;
        const int JOB_STATUS_USER_INTERVENTION = 0x00000400;

        if ((statusFlags & JOB_STATUS_ERROR) != 0) return SpoolerJobStatus.Error;
        if ((statusFlags & JOB_STATUS_PAPEROUT) != 0) return SpoolerJobStatus.PaperOut;
        if ((statusFlags & JOB_STATUS_OFFLINE) != 0) return SpoolerJobStatus.Offline;
        if ((statusFlags & JOB_STATUS_USER_INTERVENTION) != 0) return SpoolerJobStatus.UserIntervention;
        if ((statusFlags & JOB_STATUS_PRINTING) != 0) return SpoolerJobStatus.Printing;
        if ((statusFlags & JOB_STATUS_SPOOLING) != 0) return SpoolerJobStatus.Spooling;
        if ((statusFlags & JOB_STATUS_PAUSED) != 0) return SpoolerJobStatus.Paused;
        if ((statusFlags & JOB_STATUS_DELETING) != 0) return SpoolerJobStatus.Deleting;
        if ((statusFlags & JOB_STATUS_PRINTED) != 0) return SpoolerJobStatus.Printed;

        return SpoolerJobStatus.Queued;
    }
}
