import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

export function isWordInstalled(): boolean {
  const regChecks = [
    'HKLM:\\SOFTWARE\\Microsoft\\Office\\*\\Word\\InstallRoot',
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Office\\*\\Word\\InstallRoot',
    'HKLM:\\SOFTWARE\\Microsoft\\Office\\ClickToRun\\REGISTRY\\MACHINE\\Software\\Microsoft\\Office\\*\\Word\\InstallRoot',
  ];
  for (const regPath of regChecks) {
    try {
      const result = execSync(
        `powershell -NoProfile -Command "Get-ItemProperty '${regPath}' -Name Path -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path"`,
        { timeout: 5000, stdio: "pipe", windowsHide: true }
      );
      const trimmed = result.toString().trim();
      if (trimmed.length > 0 && trimmed !== "null" && trimmed !== "") {
        return true;
      }
    } catch {
      // try next path
    }
  }

  try {
    const comTestScript = [
      `try {`,
      `  $w = New-Object -ComObject Word.Application -ErrorAction Stop`,
      `  Write-Host $w.Version`,
      `  $w.Quit()`,
      `  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($w) | Out-Null`,
      `  [System.GC]::Collect()`,
      `  [System.GC]::WaitForPendingFinalizers()`,
      `  exit 0`,
      `} catch {`,
      `  Write-Error $_.Exception.Message`,
      `  exit 1`,
      `}`,
    ].join("\n");
    const psFile = path.join(os.tmpdir(), "pm-word-check.ps1");
    fs.writeFileSync(psFile, comTestScript, "utf8");
    const out = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`,
      { timeout: 15000, stdio: "pipe", windowsHide: true }
    );
    fs.unlinkSync(psFile);
    return out.toString().trim().length > 0;
  } catch {
    return false;
  }
}

export function convertDocxToPdfViaWord(docxBuffer: Buffer): Uint8Array {
  const tmpDir = os.tmpdir();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const docxPath = path.join(tmpDir, `pm-cert-${id}.docx`);
  const pdfPath = path.join(tmpDir, `pm-cert-${id}.pdf`);
  const psPath = path.join(tmpDir, `pm-cert-${id}.ps1`);

  fs.writeFileSync(docxPath, docxBuffer);

  try {
    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const psScript = [
      `try {`,
      `  $word = New-Object -ComObject Word.Application -ErrorAction Stop`,
      `  $word.Visible = $false`,
      `  $word.DisplayAlerts = 0`,
      `  $doc = $word.Documents.Open("${esc(docxPath)}")`,
      `  $doc.SaveAs([Ref]"${esc(pdfPath)}", [Ref]17)`,
      `  $doc.Close()`,
      `  $word.Quit()`,
      `  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null`,
      `  [System.GC]::Collect()`,
      `  [System.GC]::WaitForPendingFinalizers()`,
      `  if (-not (Test-Path "${esc(pdfPath)}")) { throw "PDF file was not created" }`,
      `  exit 0`,
      `} catch {`,
      `  Write-Host "ERROR:"`,
      `  Write-Host $_.Exception.Message`,
      `  Write-Host $_.ScriptStackTrace`,
      `  exit 1`,
      `}`,
    ].join("\n");

    fs.writeFileSync(psPath, psScript, "utf8");

    const execResult = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${esc(psPath)}"`,
      { timeout: 60000, stdio: "pipe", windowsHide: true }
    );

    if (!fs.existsSync(pdfPath)) {
      const stderr = execResult.toString();
      throw new Error(stderr || "Word did not produce a PDF file");
    }

    return new Uint8Array(fs.readFileSync(pdfPath));
  } catch (err: any) {
    let detail = err.message || "";
    if (err.stderr) detail += "\nstderr: " + err.stderr.toString();
    if (err.stdout) detail += "\nstdout: " + err.stdout.toString();
    throw new Error("Word conversion failed:\n" + detail);
  } finally {
    try { fs.unlinkSync(docxPath); } catch {}
    try { fs.unlinkSync(pdfPath); } catch {}
    try { fs.unlinkSync(psPath); } catch {}
  }
}
