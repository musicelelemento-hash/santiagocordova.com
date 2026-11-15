#requires -Version 5.1
<#
  Prueba real de la capa de experiencia (08) en el HUD.
  ------------------------------------------------------------------
  Sirve una página con el host del SRI mapeado a 127.0.0.1
  (--host-resolver-rules) para que el content script se inyecte de verdad,
  y verifica:
    1. el bloque nuevo monta en el HUD,
    2. el ojo cambia a modo limpio (y oculta lo secundario) y vuelve,
    3. una corrida simulada muestra nombre, cronómetro y estimación,
    4. al detenerse aparece el resumen con el tiempo por cliente.

  Requiere Edge y Python. Perfil temporal, ventana fuera de pantalla.

  USO
      powershell -ExecutionPolicy Bypass -File tools\prueba_experiencia.ps1
      … -Python "C:\ruta\a\python.exe"
#>
param(
  [string]$Suite = (Join-Path (Split-Path -Parent $PSScriptRoot) 'suite'),
  [string]$Python = 'python',
  [int]$PuertoWeb = 8777,
  [int]$PuertoCdp = 9366
)

$ErrorActionPreference = 'Stop'
$navegador = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$probe = Join-Path $env:TEMP 'sc_exp_probe'
$pageDir = Join-Path $env:TEMP 'sc_exp_page'
$log = Join-Path $env:TEMP 'sc_exp_edge.log'
$script:guion = 800

function Matar-Arbol($idProceso) { $ErrorActionPreference = 'Continue'; if ($idProceso) { & taskkill /PID $idProceso /T /F *> $null } }
function Conectar($Url) {
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ct = New-Object System.Threading.CancellationTokenSource
  $ws.ConnectAsync([Uri]$Url, $ct.Token).Wait(5000)
  return @{ ws = $ws; ct = $ct }
}
function Enviar($h, $obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 12
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
  $h.ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $h.ct.Token).Wait()
}
function Llamar($h, $metodo, $params = @{}, $timeoutMs = 12000, $sesion = $null) {
  $script:guion = $script:guion + 1
  $id = $script:guion
  $cuerpo = @{ id = $id; method = $metodo; params = $params }
  if ($sesion) { $cuerpo.sessionId = $sesion }
  Enviar $h $cuerpo
  $buffer = New-Object byte[] 262144
  $reloj = [System.Diagnostics.Stopwatch]::StartNew()
  while ($reloj.ElapsedMilliseconds -lt $timeoutMs) {
    $ms = New-Object System.IO.MemoryStream
    do {
      $seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
      $t = $h.ws.ReceiveAsync($seg, $h.ct.Token)
      if (-not $t.Wait(2000)) { break }
      $ms.Write($buffer, 0, $t.Result.Count)
    } while (-not $t.Result.EndOfMessage)
    if ($ms.Length -eq 0) { continue }
    try { $m = ([System.Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json) } catch { continue }
    if ($m.id -eq $id) { return $m }
  }
  return $null
}
function Eval-En($h, $sesion, $expresion) {
  $r = Llamar $h 'Runtime.evaluate' @{ expression = $expresion; returnByValue = $true; awaitPromise = $true } 12000 $sesion
  if ($r -and $r.result -and $r.result.exceptionDetails) {
    return "EXCEPCION: " + $r.result.exceptionDetails.text
  }
  if ($r -and $r.result -and $r.result.result) { return $r.result.result.value }
  return "ERROR"
}

# ── copia de la suite con los matches en HTTP ────────────────────────────────
if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Recurse -Force }
if (Test-Path -LiteralPath $pageDir) { Remove-Item -LiteralPath $pageDir -Recurse -Force }
New-Item -ItemType Directory -Path $probe, $pageDir -Force | Out-Null
Copy-Item -Path (Join-Path $Suite '*') -Destination $probe -Recurse -Force

$utf8 = New-Object System.Text.UTF8Encoding($false)
$manPath = Join-Path $probe 'manifest.json'
$man = [System.IO.File]::ReadAllText($manPath, $utf8)
$man = $man.Replace('https://srienlinea.sri.gob.ec/*', 'http://srienlinea.sri.gob.ec/*')
$man = $man.Replace('https://sriservicios.sri.gob.ec/', 'http://sriservicios.sri.gob.ec/')
$man = $man.Replace('https://*.sri.gob.ec/*', 'http://*.sri.gob.ec/*')
[System.IO.File]::WriteAllText($manPath, $man, $utf8)

$html = @'
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Portal SRI (prueba)</title></head>
<body>
  <h1>Portal de prueba</h1>
  <form id="frmFlujoDeclaracion"><input id="totalAPagar" value="0"></form>
</body></html>
'@
[System.IO.File]::WriteAllText((Join-Path $pageDir 'index.html'), $html, $utf8)

$servidor = Start-Process -FilePath $Python -ArgumentList @('-m', 'http.server', "$PuertoWeb", '--bind', '127.0.0.1', '--directory', $pageDir) -PassThru -WindowStyle Hidden
$proc = $null
$perfil = Join-Path $env:TEMP ("sc_exp_" + [guid]::NewGuid().ToString('N').Substring(0, 8))

try {
  Start-Sleep -Seconds 2
  $linea = @(
    "--user-data-dir=`"$perfil`"",
    "--load-extension=`"$probe`"",
    "--disable-extensions-except=`"$probe`"",
    "--remote-debugging-port=$PuertoCdp",
    "--host-resolver-rules=`"MAP srienlinea.sri.gob.ec 127.0.0.1`"",
    "--no-first-run", "--no-default-browser-check", "--disable-sync",
    "--window-position=-32000,-32000", "--window-size=1280,900",
    "--v=0", "about:blank"
  ) -join ' '
  $proc = Start-Process -FilePath $navegador -ArgumentList $linea -PassThru -RedirectStandardError $log

  $listo = $false
  for ($i = 0; $i -lt 50; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-RestMethod "http://127.0.0.1:$PuertoCdp/json/version" -TimeoutSec 2 | Out-Null; $listo = $true; break } catch {}
  }
  if (-not $listo) { throw "sin CDP" }
  Start-Sleep -Seconds 4

  $version = Invoke-RestMethod "http://127.0.0.1:$PuertoCdp/json/version" -TimeoutSec 5
  $h = Conectar $version.webSocketDebuggerUrl
  try {
    # service worker de la copia
    $res = Llamar $h 'Target.getTargets' @{}
    $sesionSw = $null
    foreach ($t in @($res.result.targetInfos)) {
      if ($t.type -ne 'service_worker' -or ([string]$t.url) -notlike 'chrome-extension://*') { continue }
      $adj = Llamar $h 'Target.attachToTarget' @{ targetId = $t.targetId; flatten = $true }
      if (-not $adj.result.sessionId) { continue }
      $ses = $adj.result.sessionId
      Llamar $h 'Runtime.enable' @{} 5000 $ses | Out-Null
      if ((Eval-En $h $ses 'chrome.runtime.getManifest().name') -like '*SC PRO SUITE*') { $sesionSw = $ses; break }
    }
    if (-not $sesionSw) { throw "no encontré la suite" }

    # despertar la extensión y abrir la página con el host del SRI
    Eval-En $h $sesionSw "chrome.storage.local.set({ sri_master_switch_on: true, sc_clients_cache: [{ruc:'1712345678001',name:'ACME PRUEBA',password:'x'}] }).then(()=>'ok')" | Out-Null
    Eval-En $h $sesionSw "chrome.tabs.create({url:'http://srienlinea.sri.gob.ec:8777/'}).then(t=>'tab:'+t.id)" | Out-Null
    Start-Sleep -Seconds 5

    $res = Llamar $h 'Target.getTargets' @{}
    $obj = @($res.result.targetInfos | Where-Object { ([string]$_.url) -match '8777' }) | Select-Object -First 1
    if (-not $obj) { throw "la página de prueba no abrió" }
    $adj = Llamar $h 'Target.attachToTarget' @{ targetId = $obj.targetId; flatten = $true }
    $ses = $adj.result.sessionId
    Llamar $h 'Runtime.enable' @{} 5000 $ses | Out-Null
    Start-Sleep -Seconds 2

    Write-Host "1) Montaje:"
    Write-Host ("   HUD: " + (Eval-En $h $ses "!!document.getElementById('sri-loop-hud')"))
    Write-Host ("   caja: " + (Eval-En $h $ses "!!document.getElementById('sc-hud-caja')"))
    Write-Host ("   modo: " + (Eval-En $h $ses "document.documentElement.dataset.scModo || '(sin definir)'"))
    Write-Host ("   crono: " + (Eval-En $h $ses "document.getElementById('sc-crono') && document.getElementById('sc-crono').textContent"))
    Write-Host ("   nombre: " + (Eval-En $h $ses "document.getElementById('sc-nombre') && document.getElementById('sc-nombre').textContent"))

    Write-Host "`n2) Cambio a modo limpio con el botón:"
    Eval-En $h $ses "document.getElementById('sc-modo').click(); 'ok'" | Out-Null
    Start-Sleep -Milliseconds 600
    Write-Host ("   modo: " + (Eval-En $h $ses "document.documentElement.dataset.scModo"))
    Write-Host ("   botón: " + (Eval-En $h $ses "document.getElementById('sc-modo').getAttribute('aria-pressed')"))
    Write-Host ("   #slh-paso oculto: " + (Eval-En $h $ses "getComputedStyle(document.getElementById('slh-paso')).display"))

    Write-Host "`n3) Volver a cockpit:"
    Eval-En $h $ses "document.getElementById('sc-modo').click(); 'ok'" | Out-Null
    Start-Sleep -Milliseconds 400
    Write-Host ("   modo: " + (Eval-En $h $ses "document.documentElement.dataset.scModo"))

    Write-Host "`n4) Corrida simulada (3 clientes):"
    $ahora = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    Eval-En $h $sesionSw "chrome.storage.local.set({ sc_loop: { estado:'CORRIENDO', latido: $ahora, indice: 0, cola: [{ruc:'1712345678001',name:'ACME PRUEBA'},{ruc:'1712345678002',name:'BETA SA'},{ruc:'1712345678003',name:'GAMMA CIA'}] } }).then(()=>'ok')" | Out-Null
    Start-Sleep -Seconds 3
    Write-Host ("   nombre: " + (Eval-En $h $ses "document.getElementById('sc-nombre').textContent"))
    Write-Host ("   crono: " + (Eval-En $h $ses "document.getElementById('sc-crono').textContent"))

    $t2 = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    Eval-En $h $sesionSw "chrome.storage.local.get(['sc_loop']).then(r=>chrome.storage.local.set({ sc_loop: Object.assign({}, r.sc_loop, { indice: 1, latido: $t2 }) })).then(()=>'ok')" | Out-Null
    Start-Sleep -Seconds 2
    Write-Host ("   nombre tras avance: " + (Eval-En $h $ses "document.getElementById('sc-nombre').textContent"))
    Write-Host ("   crono tras avance: " + (Eval-En $h $ses "document.getElementById('sc-crono').textContent"))

    $t3 = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    Eval-En $h $sesionSw "chrome.storage.local.get(['sc_loop']).then(r=>chrome.storage.local.set({ sc_loop: Object.assign({}, r.sc_loop, { estado:'DETENIDO', indice: 1, motivo:'Prueba automatica' }) })).then(()=>'ok')" | Out-Null
    Start-Sleep -Seconds 3
    Write-Host ("   popover resumen: " + (Eval-En $h $ses "!!document.querySelector('.sc-pop')"))
    Write-Host ("   texto: " + (Eval-En $h $ses "var p=document.querySelector('.sc-pop'); p ? p.textContent.replace(/\s+/g,' ').slice(0,140) : '(sin popover)'"))
    Write-Host ("   historial: " + (Eval-En $h $sesionSw "chrome.storage.local.get(['sc_corridas']).then(r=>String((r.sc_corridas||[]).length))"))
  } finally {
    try { $h.ws.Dispose() } catch {}
    try { $h.ct.Dispose() } catch {}
  }
} finally {
  if ($proc) { Matar-Arbol $proc.Id }
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*sc_exp_*' } | ForEach-Object { Matar-Arbol $_.ProcessId }
  Matar-Arbol $servidor.Id
  Start-Sleep -Seconds 1
  Remove-Item -LiteralPath $perfil -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $pageDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $probe -Recurse -Force -ErrorAction SilentlyContinue
}
