namespace ACScan2Print.Agent.Core.Enums;

public enum JobStatus
{
    Draft,
    Submitted,
    UnderReview,
    AwaitingPayment,
    Approved,
    Queued,
    Claimed,
    Downloading,
    Printing,
    SubmittedToSpooler,
    Completed,
    Failed,
    NeedsReview,
    Rejected,
    Cancelled,
    Expired
}

public enum PrintMode
{
    Bw,
    Colour
}

public enum PaperSize
{
    A4,
    Legal,
    A3
}

public enum PrintSides
{
    Simplex,
    Duplex
}

public enum SpoolerJobStatus
{
    Unknown = 0,
    Queued = 1,
    Spooling = 2,
    Printing = 4,
    Printed = 8,
    Paused = 16,
    Error = 32,
    Deleting = 64,
    PaperOut = 128,
    Offline = 256,
    UserIntervention = 512
}

public enum DeviceState
{
    Pending,
    Active,
    Paused,
    Offline,
    Revoked
}

public enum ConnectionType
{
    Usb,
    Wifi,
    Lan,
    Other,
    Unknown
}
