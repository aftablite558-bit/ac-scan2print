# AC Scan2Print — Windows Hardware Discovery & Inventory Template

**Document Type:** Physical Hardware Audit & Discovery Specification  
**Project:** Aman Computer Smart QR Print System (AC Scan2Print)  
**Inspection Date:** November 24, 2026  
**Auditor:** Senior Windows Printing Engineer & Hardware Auditor  
**Status:** Audit Protocol Defined · **Awaiting On-Site Execution (NEEDS USER INPUT)**  

---

## 1. Executive Summary

The Phase 0 Discovery & Hardware Audit mandates recording the actual physical environment of the Aman Computer shop before building or running the Windows Local Print Agent. 
In strict compliance with audit rules, **zero hardware specifications are fabricated or assumed**. 

Below is the structured hardware inventory baseline. Every unconfirmed parameter is marked `NEEDS USER INPUT`. A non-destructive PowerShell discovery script is provided in Section 4 to allow the shop operator to populate this data directly from the counter PC in under 60 seconds.

---

## 2. Host Windows PC Specifications

| Hardware / OS Parameter | Required Specification | Actual Reported Value | Status |
| :--- | :--- | :---: | :---: |
| **Operating System** | Windows 11 64-bit (Build 22621+ recommended) | `NEEDS USER INPUT` | PENDING |
| **OS Edition** | Windows 11 Pro / Home / Enterprise | `NEEDS USER INPUT` | PENDING |
| **OS Build Number** | e.g., 22631.4317 | `NEEDS USER INPUT` | PENDING |
| **Processor (CPU)** | x64 Architecture (Intel Core i3/i5/i7 or AMD Ryzen) | `NEEDS USER INPUT` | PENDING |
| **System Memory (RAM)**| Minimum 8 GB (for Spooler & PDF rendering) | `NEEDS USER INPUT` | PENDING |
| **Available Storage** | Minimum 20 GB free on `C:\` (for temp spooler files) | `NEEDS USER INPUT` | PENDING |
| **USB Host Controller** | USB 2.0 / USB 3.0 / USB 3.1 Type-A ports | `NEEDS USER INPUT` | PENDING |
| **Network Adapter(s)** | Gigabit Ethernet (RJ-45) and/or Wi-Fi (802.11ac/ax) | `NEEDS USER INPUT` | PENDING |
| **Static / Reserved IP** | Counter LAN IP (if network printing is used) | `NEEDS USER INPUT` | PENDING |
| **Power Protection** | Online UPS / Inverter (prevent mid-print power cuts) | `NEEDS USER INPUT` | PENDING |
| **Windows Power Plan** | Must be set to "Never Sleep" during shop hours | `NEEDS USER INPUT` | PENDING |
| **User Account Level** | Administrator account for Windows Service install | `NEEDS USER INPUT` | PENDING |

---

## 3. Physical Printer Inventory Template

*(Duplicate section for each connected printer at the Aman Computer counter)*

### Printer Unit 1 (Primary Counter Printer)

| Attribute | Field Name | Shop Counter Reported Value | Status |
| :--- | :--- | :---: | :---: |
| **Printer Make & Brand** | Manufacturer | `NEEDS USER INPUT` (e.g. HP / Canon / Epson / Brother) | PENDING |
| **Exact Hardware Model** | `printer_model` | `NEEDS USER INPUT` (e.g. LaserJet Pro MFP M126nw) | PENDING |
| **Windows Queue Name** | `system_printer_name`| `NEEDS USER INPUT` (Exact name in Printers & Scanners) | PENDING |
| **Installed Driver Name** | Print Driver | `NEEDS USER INPUT` (e.g. HP LaserJet Pro M125-M126 PCLmS) | PENDING |
| **Driver Architecture** | Type 3 (V3) or Type 4 (V4) | `NEEDS USER INPUT` | PENDING |
| **Driver Version** | Version String | `NEEDS USER INPUT` | PENDING |
| **Connection Type** | `connection_type` | `NEEDS USER INPUT` (`usb`, `wifi`, `lan`, `other`, `unknown`) | PENDING |
| **Port Name** | Assigned Port | `NEEDS USER INPUT` (e.g. `USB001`, `WSD-xxx`, `192.168.1.100`) | PENDING |
| **Colour Capability** | `supports_colour` | `NEEDS USER INPUT` (`TRUE` = Colour, `FALSE` = Monochrome) | PENDING |
| **Duplex Capability** | `supports_duplex` | `NEEDS USER INPUT` (`TRUE` = Auto-Duplex, `FALSE` = Simplex) | PENDING |
| **Paper Trays Available** | Tray Configuration | `NEEDS USER INPUT` (Tray 1: Manual, Tray 2: Cassette) | PENDING |
| **Supported Paper Sizes** | `supported_paper_sizes`| `NEEDS USER INPUT` (`A4`, `Legal`, `Letter`, `A3`) | PENDING |
| **Telemetry Support** | Status Feedback | `NEEDS USER INPUT` (Bidirectional support: Paper Out, Offline) | PENDING |
| **Default Counter Printer** | `is_default` | `NEEDS USER INPUT` (`TRUE` / `FALSE`) | PENDING |

---

## 4. Automated Hardware Discovery Script (PowerShell)

The shop operator can run this one-liner script in **PowerShell (Run as Administrator)** on the Windows 11 counter PC. It will output all required system and printer properties cleanly to the console (and save a copy to `C:\ACScan2Print_Discovery.txt`):

```powershell
# =====================================================================
# Aman Computer — AC Scan2Print Hardware Discovery Script v2.0
# Run in PowerShell as Administrator on the Counter PC
# =====================================================================

$OutFile = "$env:USERPROFILE\Desktop\ACScan2Print_Hardware_Report.txt"
Start-Transcript -Path $OutFile -Force

Write-Host "=== 1. HOST PC SPECIFICATIONS ===" -ForegroundColor Cyan
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture | Format-List
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors | Format-List
Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum | ForEach-Object { [PSCustomObject]@{ TotalRAM_GB = [Math]::Round($_.Sum / 1GB, 2) } } | Format-List
Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID, @{Name="FreeSpace_GB";Expression={[Math]::Round($_.FreeSpace / 1GB, 2)}}, @{Name="Size_GB";Expression={[Math]::Round($_.Size / 1GB, 2)}} | Format-List

Write-Host "`n=== 2. NETWORK ADAPTERS & IP CONFIGURATION ===" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object InterfaceAlias, IPAddress, PrefixOrigin | Format-Table -AutoSize

Write-Host "`n=== 3. INSTALLED COUNTER PRINTERS ===" -ForegroundColor Cyan
Get-Printer | Select-Object Name, DriverName, PortName, Shared, Type, DeviceType | Format-Table -AutoSize

Write-Host "`n=== 4. PRINTER DRIVER ARCHITECTURE & VERSION ===" -ForegroundColor Cyan
Get-PrinterDriver | Select-Object Name, DriverVersion, MajorVersion, Manufacturer | Format-Table -AutoSize

Write-Host "`n=== 5. PRINTER CONFIGURATION & DUPLEX / COLOR CAPABILITIES ===" -ForegroundColor Cyan
Get-Printer | ForEach-Object {
    $pName = $_.Name
    Write-Host "--- Printer: $pName ---" -ForegroundColor Yellow
    Get-PrinterConfiguration -PrinterName $pName -ErrorAction SilentlyContinue | Select-Object PrinterName, DuplexingMode, Color, PaperSize | Format-List
}

Write-Host "`n=== 6. POWER & SLEEP PLAN ===" -ForegroundColor Cyan
powercfg /getactivescheme

Stop-Transcript
Write-Host "`nReport saved to: $OutFile" -ForegroundColor Green
```

---

## 5. Operational Readiness Checklist

- [ ] Counter PC specifications recorded via PowerShell script (`ACScan2Print_Hardware_Report.txt`).
- [ ] Primary printer make, model, and queue name confirmed.
- [ ] Print connection type confirmed (USB cable or Static IP network).
- [ ] Paper availability confirmed (A4 70/75/80 GSM, Legal).
- [ ] Power backup verified (UPS tested under battery switchover).
- [ ] Sleep mode disabled in Windows Settings (`Power & battery -> Sleep: Never`).
