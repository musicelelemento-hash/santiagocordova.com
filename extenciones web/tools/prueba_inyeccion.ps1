#requires -Version 5.1
<#
  Prueba de INYECCIÓN: ¿los módulos empaquetados dentro de la suite corren de
  verdad en una página?

  Usa el módulo 02 como canario: es chico, determinista y su resultado se ve
  en tres campos. Copia la suite a una ruta sin espacios, cambia SOLO el match
  del módulo 02 a http://127.0.0.1/*, sirve una página con los tres campos del
  SRI y comprueba que el módulo los complete:

      actual  = clave123*
      nuevo   = clave123@      ← la regla * → @
      confirmacion = clave123@

  Es la prueba que detecta el riesgo propio del empaquetado: el módulo está
  envuelto en una IIFE y concatenado con su puente de Supabase. Si la
  concatenación o el ámbito se rompieran, los campos no se llenarían.

  Requiere Edge (igual que prueba_suite.ps1) y Python para servir la página.
  El servidor levanta sólo en 127.0.0.1 y se apaga al final.

  USO
      powershell -ExecutionPolicy Bypass -File tools\prueba_inyeccion.ps1
      … -Python "C:\ruta\a\python.exe"   (si `python` no está en el PATH)
#>
param(
  [string]$Suite = (Join-Path (Split-Path -Parent $PSScriptRoot) 'suite'),
  [string]$Python = 'python',
  [int]$PuertoWeb = 8765,
  [int]$PuertoCdp = 9356
)

$ErrorActionPreference = 'Stop'
$Navegador = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path -LiteralPath $Navegador)) { throw "No encontré Edge en $Navegador" }
if (-not (Test-Path -LiteralPath (Join-Path $Suite 'manifest.json'))) { throw "No encontré la suite en $Suite" }

$probe = Join-Path $env:TEMP 'sc_probe_extension'
$pageDir = Join-Path $env:TEMP 'sc_probe_page'
$log = Join-Path $env:TEMP "sc_probe_prueba.log"
$script:mensajes = @()
$script:guion = 500

function Matar-Arbol($idProceso) {
  $ErrorActionPreference = 'Continue'
  if ($idProceso) { & taskkill /PID $idProceso /T /F *> $null }
}

function Conectar($Url) {
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ct = New-Object System.Threading.CancellationTokenSource
  $ws.ConnectAsync([Uri]$Url, $ct.Token).Wait(5000)
  return @{ ws = $ws; ct = $ct }
}

function Enviar($h, $obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 12
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $segmento = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
  $h.ws.SendAsync($segmento, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $h.ct.Token).Wait()
}

function Llamar($h, $metodo, $params = @{}, $timeoutMs = 10000, $sesion = $null) {
  $script:guion = $script:guion + 1
  $id = $script:guion
  $cuerpo = @{ id = $id; method = $metodo; params = $params }
  if ($sesion) { $cuerpo.sessionId = $sesion }
  Enviar $h $cuerpo
  $buffer = New-Object byte[] 524288
  $reloj = [System.Diagnostics.Stopwatch]::StartNew()
  while ($reloj.ElapsedMilliseconds -lt $timeoutMs) {
    $segmento = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
    $tarea = $h.ws.ReceiveAsync($segmento, $h.ct.Token)
    if (-not $tarea.Wait(1200)) { continue }
    $texto = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $tarea.Result.Count)
    try { $m = $texto | ConvertFrom-Json } catch { continue }
    if ($m.id -eq $id) { return $m }
    if ($m.method) { $script:mensajes += $m }
  }
  return $null
}

function Eval-En($h, $sesion, $expresion) {
  $r = Llamar $h 'Runtime.evaluate' @{ expression = $expresion; returnByValue = $true; awaitPromise = $true } 10000 $sesion
  if ($r -and $r.result -and $r.result.exceptionDetails) {
    return "EXCEPCION: " + $r.result.exceptionDetails.text + " :: " + $r.result.exceptionDetails.exception.description
  }
  if ($r -and $r.result -and $r.result.result) { return $r.result.result.value }
  return "ERROR"
}

# ── copia con el match cambiado + página de prueba ─────────────
if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Recurse -Force }
if (Test-Path -LiteralPath $pageDir) { Remove-Item -LiteralPath $pageDir -Recurse -Force }
New-Item -ItemType Directory -Path $probe -Force | Out-Null
New-Item -ItemType Directory -Path $pageDir -Force | Out-Null
Copy-Item -Path (Join-Path $Suite '*') -Destination $probe -Recurse -Force

$utf8 = New-Object System.Text.UTF8Encoding($false)
$manPath = Join-Path $probe 'manifest.json'
$man = [System.IO.File]::ReadAllText($manPath, $utf8) | ConvertFrom-Json
$cambiado = $false
foreach ($cs in $man.content_scripts) {
  if (($cs.js -join ',') -match '02_claves') {
    $cs.matches = @('http://127.0.0.1/*')
    $cs.run_at = 'document_end'
    $cambiado = $true
  }
}
if (-not $cambiado) { throw "no encontré el content_script del módulo 02 en el manifiesto de la suite" }
[System.IO.File]::WriteAllText($manPath, ($man | ConvertTo-Json -Depth 12), $utf8)

$html = @'
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>actualizar clave</title></head>
<body>
  <h1>Actualizar clave</h1>
  <input id="actual"><input id="nuevo"><input id="confirmacion">
  <button id="btnGuardar">Guardar</button>
</body></html>
'@
[System.IO.File]::WriteAllText((Join-Path $pageDir 'actualizar.html'), $html, $utf8)

$servidor = Start-Process -FilePath $Python -ArgumentList @('-m', 'http.server', "$PuertoWeb", '--bind', '127.0.0.1', '--directory', $pageDir) -PassThru -WindowStyle Hidden
$proc = $null
$perfil = Join-Path $env:TEMP ("sc_probe_" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$fallas = 0

try {
  Start-Sleep -Seconds 2
  $linea = @(
    "--user-data-dir=`"$perfil`"",
    "--load-extension=`"$probe`"",
    "--disable-extensions-except=`"$probe`"",
    "--remote-debugging-port=$PuertoCdp",
    "--no-first-run", "--no-default-browser-check", "--disable-sync",
    "--window-position=-32000,-32000", "--window-size=1000,800",
    "--enable-logging=stderr", "--v=0",
    "about:blank"
  ) -join ' '
  $proc = Start-Process -FilePath $Navegador -ArgumentList $linea -PassThru -RedirectStandardError $log

  $listo = $false
  for ($i = 0; $i -lt 50; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-RestMethod "http://127.0.0.1:$PuertoCdp/json/version" -TimeoutSec 2 | Out-Null; $listo = $true; break } catch {}
  }
  if (-not $listo) { throw "el navegador no abrió el puerto de depuración" }
  Start-Sleep -Seconds 4

  $version = Invoke-RestMethod "http://127.0.0.1:$PuertoCdp/json/version" -TimeoutSec 5
  $h = Conectar $version.webSocketDebuggerUrl
  try {
    $res = Llamar $h 'Target.getTargets' @{}
    $sesionSw = $null
    foreach ($t in @($res.result.targetInfos)) {
      if ($t.type -ne 'service_worker' -or ([string]$t.url) -notlike 'chrome-extension://*') { continue }
      $adj = Llamar $h 'Target.attachToTarget' @{ targetId = $t.targetId; flatten = $true }
      if (-not $adj.result.sessionId) { continue }
      $ses = $adj.result.sessionId
      Llamar $h 'Runtime.enable' @{} 5000 $ses | Out-Null
      $nombre = Eval-En $h $ses 'chrome.runtime.getManifest().name'
      if ($nombre -like '*SC PRO SUITE*') { $sesionSw = $ses; break }
    }
    if (-not $sesionSw) { throw "no se encontró el service worker de la copia" }

    $set = Eval-En $h $sesionSw "chrome.storage.local.set({ pending_sri_change: { ruc: '1712345678001', oldPassword: 'clave123*' } }).then(() => 'ok')"
    Write-Host "estado de prueba: $set"

    $nav = Eval-En $h $sesionSw @'
(async () => {
  const tabs = await chrome.tabs.query({});
  const t = tabs[0];
  await chrome.tabs.update(t.id, { url: 'http://127.0.0.1:8765/actualizar.html' });
  return 'ok';
})()
'@
    Write-Host "navegación: $nav"
    Start-Sleep -Seconds 4

    $res = Llamar $h 'Target.getTargets' @{}
    $objetivo = @($res.result.targetInfos | Where-Object { ([string]$_.url) -match 'actualizar\.html' }) | Select-Object -First 1
    if (-not $objetivo) { throw "la página de prueba no abrió" }

    $adj = Llamar $h 'Target.attachToTarget' @{ targetId = $objetivo.targetId; flatten = $true }
    $ses = $adj.result.sessionId
    Llamar $h 'Runtime.enable' @{} 5000 $ses | Out-Null
    Start-Sleep -Seconds 1

    $valores = Eval-En $h $ses @'
(function(){
  var a = document.getElementById('actual');
  var n = document.getElementById('nuevo');
  var c = document.getElementById('confirmacion');
  return JSON.stringify({ actual: a && a.value, nuevo: n && n.value, confirmacion: c && c.value });
})()
'@
    Write-Host "campos: $valores"

    if ($valores -match '"actual":"clave123\*"') { Write-Host "OK   campo actual completado" } else { Write-Host "FALLA campo actual"; $fallas++ }
    if ($valores -match '"nuevo":"clave123@"') { Write-Host "OK   transformación * → @ aplicada" } else { Write-Host "FALLA transformación * → @"; $fallas++ }
    if ($valores -match '"confirmacion":"clave123@"') { Write-Host "OK   confirmación completada" } else { Write-Host "FALLA confirmación"; $fallas++ }

    $clic = Eval-En $h $ses "document.getElementById('btnGuardar').click(); 'click'"
    Start-Sleep -Seconds 1
  } finally {
    try { $h.ws.Dispose() } catch {}
    try { $h.ct.Dispose() } catch {}
  }
} finally {
  if ($proc) { Matar-Arbol $proc.Id }
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*sc_probe_*' } |
    ForEach-Object { Matar-Arbol $_.ProcessId }
  Matar-Arbol $servidor.Id
  Start-Sleep -Seconds 1
  Remove-Item -LiteralPath $perfil -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $probe -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $pageDir -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host "`n--- consola / excepciones ---"
  $vistos = 0
  foreach ($m in $script:mensajes) {
    if ($m.method -eq 'Runtime.exceptionThrown') {
      Write-Host ("EXCEPCION  " + $m.params.exceptionDetails.text + " :: " + $m.params.exceptionDetails.exception.description)
      $vistos++
    } elseif ($m.method -eq 'Runtime.consoleAPICalled') {
      $texto = ($m.params.args | ForEach-Object { if ($_.value) { [string]$_.value } else { $_.description } }) -join ' '
      Write-Host ("CONSOLA " + $m.params.type + "  " + $texto)
      $vistos++
    }
    if ($vistos -ge 30) { Write-Host '...'; break }
  }
  if ($vistos -eq 0) { Write-Host "(nada)" }
}

if ($fallas -gt 0) { exit 1 }
