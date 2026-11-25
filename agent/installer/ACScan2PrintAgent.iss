; AC Scan2Print — Production Windows 11 x64 Installer Script (Inno Setup 6)
; Installs ACScan2PrintAgent Windows Service + Tray Companion with auto-start,
; crash recovery, ProgramData log/temp hardening, and upgrade preservation.

#define MyAppName "AC Scan2Print Local Agent"
#define MyAppVersion "1.0.4"
#define MyAppPublisher "Aman Computer"
#define MyAppURL "https://ac-scan2print.web.app"
#define MyServiceName "ACScan2PrintAgent"
#define MyWorkerExe "ACScan2Print.Agent.Worker.exe"
#define MyTrayExe "ACScan2Print.Agent.Tray.exe"

[Setup]
AppId={{8F6A2E5C-4D3B-4A19-9E7C-2B1D0C4F8A90}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf64}\AC Scan2Print\Agent
DefaultGroupName=AC Scan2Print
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=ACScan2Print-Agent-Setup-v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Dirs]
Name: "{commonappdata}\ACScan2Print"
Name: "{commonappdata}\ACScan2Print\Logs"
Name: "{commonappdata}\ACScan2Print\Temp"

[Files]
Source: "stage\worker\*"; DestDir: "{app}\worker"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "stage\tray\*"; DestDir: "{app}\tray"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "scripts\health-check.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scripts\uninstall-agent.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[Icons]
Name: "{group}\AC Scan2Print Tray"; Filename: "{app}\tray\{#MyTrayExe}"
Name: "{group}\Agent Health Check"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\health-check.ps1"""

[Registry]
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ACScan2PrintTray"; ValueData: """{app}\tray\{#MyTrayExe}"""; Flags: uninsdeletevalue

[Run]
; Configure DelayedAutoStart Windows Service & crash recovery (5s / 15s / 30s)
Filename: "{sys}\sc.exe"; Parameters: "create {#MyServiceName} binPath= ""\""{app}\worker\{#MyWorkerExe}\"" --environment Production"" start= delayed-auto DisplayName= ""AC Scan2Print Local Print Agent"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "description {#MyServiceName} ""AC Scan2Print background service for job claiming and Windows Print Spooler execution."""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failure {#MyServiceName} reset= 86400 actions= restart/5000/restart/15000/restart/30000"; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "failureflag {#MyServiceName} 1"; Flags: runhidden waituntilterminated
Filename: "{sys}\icacls.exe"; Parameters: """{commonappdata}\ACScan2Print"" /inheritance:r /grant:r ""SYSTEM:(OI)(CI)F"" ""Administrators:(OI)(CI)F"""; Flags: runhidden waituntilterminated
Filename: "{sys}\sc.exe"; Parameters: "start {#MyServiceName}"; Flags: runhidden waituntilterminated
Filename: "{app}\tray\{#MyTrayExe}"; Description: "Launch AC Scan2Print System Tray"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM {#MyTrayExe}"; Flags: runhidden; RunOnceId: "KillTray"
Filename: "{sys}\sc.exe"; Parameters: "stop {#MyServiceName}"; Flags: runhidden waituntilterminated; RunOnceId: "StopAgent"
Filename: "{sys}\sc.exe"; Parameters: "delete {#MyServiceName}"; Flags: runhidden waituntilterminated; RunOnceId: "DeleteAgent"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  // Graceful upgrade: stop existing Tray and Windows Service while preserving DPAPI credentials
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM {#MyTrayExe}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\sc.exe'), 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(1500);
  Exec(ExpandConstant('{sys}\sc.exe'), 'delete {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
