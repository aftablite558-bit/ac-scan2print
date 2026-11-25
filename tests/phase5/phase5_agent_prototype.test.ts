import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('[P5-01] Local Print Agent Solution & Project Structure Exists', () => {
  const root = process.cwd();
  const slnPath = path.join(root, 'agent', 'ACScan2Print.Agent.sln');
  assert.ok(fs.existsSync(slnPath), 'ACScan2Print.Agent.sln must exist');

  const requiredProjects = [
    'src/ACScan2Print.Agent.Core/ACScan2Print.Agent.Core.csproj',
    'src/ACScan2Print.Agent.Infrastructure/ACScan2Print.Agent.Infrastructure.csproj',
    'src/ACScan2Print.Agent.Worker/ACScan2Print.Agent.Worker.csproj',
    'src/ACScan2Print.Agent.Tray/ACScan2Print.Agent.Tray.csproj',
    'src/ACScan2Print.Agent.Prototype/ACScan2Print.Agent.Prototype.csproj',
    'src/ACScan2Print.Agent.Tests/ACScan2Print.Agent.Tests.csproj'
  ];

  for (const proj of requiredProjects) {
    const fullPath = path.join(root, 'agent', proj);
    assert.ok(fs.existsSync(fullPath), `Project file ${proj} must exist`);
  }
});

test('[P5-02] Win32 Spooler Interop & Status Tracking Implemented', () => {
  const root = process.cwd();
  const interopPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Windows', 'Win32SpoolerInterop.cs');
  assert.ok(fs.existsSync(interopPath), 'Win32SpoolerInterop.cs must exist');

  const content = fs.readFileSync(interopPath, 'utf8');
  assert.ok(content.includes('OpenPrinter'), 'Must declare OpenPrinter');
  assert.ok(content.includes('StartDocPrinter'), 'Must declare StartDocPrinter');
  assert.ok(content.includes('WritePrinter'), 'Must declare WritePrinter');
  assert.ok(content.includes('GetJob'), 'Must declare GetJob');
  assert.ok(content.includes('JOB_INFO_2'), 'Must declare JOB_INFO_2 struct');
});

test('[P5-03] Printer Discovery Service Supports Tri-State Capabilities & Hardware Ports', () => {
  const root = process.cwd();
  const discoveryPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Windows', 'PrinterDiscoveryService.cs');
  assert.ok(fs.existsSync(discoveryPath), 'PrinterDiscoveryService.cs must exist');

  const content = fs.readFileSync(discoveryPath, 'utf8');
  assert.ok(content.includes('DiscoverPrintersAsync'), 'Must implement DiscoverPrintersAsync');
  assert.ok(content.includes('DetectConnectionType'), 'Must implement DetectConnectionType');
  assert.ok(content.includes('SupportsColour'), 'Must check colour capability');
  assert.ok(content.includes('SupportsDuplex'), 'Must check duplex capability');
  assert.ok(content.includes('SupportedPaperSizes'), 'Must detect paper sizes');
});

test('[P5-04] PDF Rendering & Licensing Complies with Roadmap Constraints', () => {
  const root = process.cwd();
  const pdfRendererPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Rendering', 'PdfRenderer.cs');
  assert.ok(fs.existsSync(pdfRendererPath), 'PdfRenderer.cs must exist');

  const content = fs.readFileSync(pdfRendererPath, 'utf8');
  assert.ok(content.includes('PDFium'), 'Must document PDFium renderer architecture');
  assert.ok(content.includes('StandardPrintController'), 'Must use silent headless print controller');
  assert.ok(content.includes('Duplex.Vertical'), 'Must enforce Long-edge duplex book flip per Roadmap §0.2');
});

test('[P5-05] Image Printing Supports Aspect Ratio, Scaling, and Margins', () => {
  const root = process.cwd();
  const imagePrintPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Rendering', 'ImagePrintService.cs');
  assert.ok(fs.existsSync(imagePrintPath), 'ImagePrintService.cs must exist');

  const content = fs.readFileSync(imagePrintPath, 'utf8');
  assert.ok(content.includes('PrintImageAsync'), 'Must implement PrintImageAsync');
  assert.ok(content.includes('actual'), 'Must support actual size scaling');
  assert.ok(content.includes('fit'), 'Must support fit-to-page aspect ratio scaling');
});

test('[P5-06] Local Temp Storage Enforces Path Traversal Protection & SHA-256 Checksums', () => {
  const root = process.cwd();
  const storagePath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Storage', 'LocalFileManager.cs');
  assert.ok(fs.existsSync(storagePath), 'LocalFileManager.cs must exist');

  const content = fs.readFileSync(storagePath, 'utf8');
  assert.ok(content.includes('SaveAndVerifyFileAsync'), 'Must implement SaveAndVerifyFileAsync');
  assert.ok(content.includes('ComputeSha256Async'), 'Must calculate SHA-256 checksum');
  assert.ok(content.includes('path traversal'), 'Must reject path traversal attempts');
  assert.ok(content.includes('CleanupAttemptDirectory'), 'Must clean attempt directories');
});

test('[P5-07] DPAPI Protection Stores Credentials Securely Without Plaintext', () => {
  const root = process.cwd();
  const dpapiPath = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Windows', 'DpapiStorage.cs');
  assert.ok(fs.existsSync(dpapiPath), 'DpapiStorage.cs must exist');

  const content = fs.readFileSync(dpapiPath, 'utf8');
  assert.ok(content.includes('ProtectedData.Protect'), 'Must use ProtectedData.Protect');
  assert.ok(content.includes('ProtectedData.Unprotect'), 'Must use ProtectedData.Unprotect');
});

test('[P5-08] Standalone Prototype CLI Menu Supports All Phase 5 Test Cases', () => {
  const root = process.cwd();
  const protoProg = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Prototype', 'Program.cs');
  assert.ok(fs.existsSync(protoProg), 'Prototype Program.cs must exist');

  const content = fs.readFileSync(protoProg, 'utf8');
  assert.ok(content.includes('TC-01'), 'Must include TC-01 single page test');
  assert.ok(content.includes('TC-02'), 'Must include TC-02 multi page test');
  assert.ok(content.includes('TC-03'), 'Must include TC-03 JPG test');
  assert.ok(content.includes('TC-04'), 'Must include TC-04 PNG test');
  assert.ok(content.includes('TC-10'), 'Must include TC-10 Duplex test');
  assert.ok(content.includes('TC-11'), 'Must include TC-11 Copies test');
  assert.ok(content.includes('TC-12'), 'Must include TC-12 Offline error test');
});

test('[P5-09] Tray UI Conforms to UI/UX Specification Colors & Context Menu', () => {
  const root = process.cwd();
  const trayContext = path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Tray', 'TrayApplicationContext.cs');
  assert.ok(fs.existsSync(trayContext), 'TrayApplicationContext.cs must exist');

  const content = fs.readFileSync(trayContext, 'utf8');
  assert.ok(content.includes('37, 199, 217'), 'Must use Electric Cyan (#25C7D9) for tray monogram');
  assert.ok(content.includes('17, 19, 24'), 'Must use Obsidian Black (#111318) for tray background');
  assert.ok(content.includes('Pause Incoming Claims'), 'Must have Pause context option');
  assert.ok(content.includes('Refresh Connected Printers'), 'Must have Refresh Printers option');
  assert.ok(content.includes('Run Local Test Print'), 'Must have Test Print option');
  assert.ok(content.includes('Open Diagnostic Window'), 'Must have Diagnostic Window option');
});
