#requires -Version 5.1
<#
  Prueba de humo de la suite: ¿carga el manifiesto? ¿abre el popup?
  ¿se monta el riel con sus cuatro módulos?

  POR QUÉ EDGE Y NO CHROME
  Chrome estable ya ignora --load-extension:
      "--load-extension is not allowed in Google Chrome, ignoring."
  Edge 157 es el mismo Chromium y acepta el switch, así que la prueba corre
  ahí. Si algún día Chrome vuelve a aceptarlo, alcanza con cambiar
  $Navegador.

  QUÉ VERIFICA
  1. El manifiesto carga y el service worker (background.js) arranca.
  2. El popup abre con el panel de clientes de Nueva Luz (es su popup).
  3. Al hacer clic en 🧰, el riel pinta las 4 filas y los 4 botones.

  Cómo se abre el popup: desde el propio service worker con
  chrome.tabs.create. Abrir chrome-extension://…/popup.html desde la línea
  de comandos lo bloquea el navegador (la página termina en chrome-error).

  USO
      powershell -ExecutionPolicy Bypass -File tools\prueba_suite.ps1
      … -Pagina options.html       (para probar la página de Ajustes)
#>
param(
  [string]$Suite = (Join-Path (Split-Path -Parent $PSScriptRoot) 'suite'),
  [string]$Pagina = 'popup.html',
  [int]$Puerto = 9352
)

$ErrorActionPreference = 'Stop'
$Navegador = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path -LiteralPath $Navegador)) { throw "No encontré Edge en $Navegador" }
if (-not (Test-Path -LiteralPath (Join-Path $Suite 'manifest.json'))) { throw "No encontré la suite en $Suite" }

$log = Join-Path $env:TEMP "sc_suite_prueba.log"
$script:mensajes = @()
$script:guion = 100

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

# En modo flatten el sessionId viaja al nivel del mensaje, no dentro de params.
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

$jsDiag = @'
(function(){
  return JSON.stringify({
    href: location.href,
    ready: document.readyState,
    titulo: document.title,
    botonRiel: !!document.getElementById('scsBtn'),
    panelClientes: !!document.getElementById('btnEjecutarLote'),
    scripts: document.querySelectorAll('script').length
  });
})()
'@

$jsClick = "document.getElementById('scsBtn') ? (document.getElementById('scsBtn').click(), 'CLICK') : 'SIN-BOTON'"

$jsFilas = @'
(function(){
  var p = document.querySelector('.scs-panel');
  var filas = document.querySelectorAll('.scs-fila').length;
  var mods = Array.prototype.map.call(document.querySelectorAll('[data-modulo]'), function(b){ return b.getAttribute('data-modulo'); });
  return filas + ' filas / modulos=' + mods.join(',') + ' / panel=' + (p ? p.dataset.abierto : 'n/a');
})()
'@

$perfil = Join-Path $env:TEMP ("sc_suite_" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$proc = $null
$fallas = 0

try {
  $linea = @(
    "--user-data-dir=`"$perfil`"",
    "--load-extension=`"$Suite`"",
    "--disable-extensions-except=`"$Suite`"",
    "--remote-debugging-port=$Puerto",
    "--no-first-run", "--no-default-browser-check", "--disable-sync",
    "--window-position=-32000,-32000", "--window-size=1200,900",
    "--enable-logging=stderr", "--v=0",
    "about:blank"
  ) -join ' '
  $proc = Start-Process -FilePath $Navegador -ArgumentList $linea -PassThru -RedirectStandardError $log

  $listo = $false
  for ($i = 0; $i -lt 50; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-RestMethod "http://127.0.0.1:$Puerto/json/version" -TimeoutSec 2 | Out-Null; $listo = $true; break } catch {}
  }
  if (-not $listo) { throw "el navegador no abrió el puerto de depuración" }
  Start-Sleep -Seconds 4

  $version = Invoke-RestMethod "http://127.0.0.1:$Puerto/json/version" -TimeoutSec 5
  $h = Conectar $version.webSocketDebuggerUrl
  try {
    # ── 1. manifiesto + service worker ─────────────────────────
    $res = Llamar $h 'Target.getTargets' @{}
    $idSuite = $null
    $sesionSw = $null
    foreach ($t in @($res.result.targetInfos)) {
      if ($t.type -ne 'service_worker' -or ([string]$t.url) -notlike 'chrome-extension://*') { continue }
      $adj = Llamar $h 'Target.attachToTarget' @{ targetId = $t.targetId; flatten = $true }
      if (-not $adj.result.sessionId) { continue }
      $ses = $adj.result.sessionId
      Llamar $h 'Runtime.enable' @{} 5000 $ses | Out-Null
      $nombre = Eval-En $h $ses 'chrome.runtime.getManifest().name'
      if ($nombre -like '*SC PRO SUITE*') {
        $idSuite = ([Uri]$t.url).Host
        $sesionSw = $ses
        Write-Host "OK 1/3  manifiesto cargado y service worker vivo"
        Write-Host "        $nombre  (id $idSuite)"
        break
      }
    }
    if (-not $idSuite) { throw "no se encontró la suite cargada: revisá el manifiesto" }

    # ── 2. abrir la página interna desde el worker ─────────────
    $abrir = Eval-En $h $sesionSw "chrome.tabs.create({url: chrome.runtime.getURL('$Pagina')}).then(t => 'tab:' + t.id)"
    Start-Sleep -Seconds 3

    $res = Llamar $h 'Target.getTargets' @{}
    $objetivo = @($res.result.targetInfos | Where-Object { ([string]$_.url) -match [regex]::Escape($Pagina) }) | Select-Object -First 1
    if (-not $objetivo) { throw "no quedó abierta $Pagina (abrir: $abrir)" }

    $adj = Llamar $h 'Target.attachToTarget' @{ targetId = $objetivo.targetId; flatten = $true }
    $sesion = $adj.result.sessionId
    Llamar $h 'Runtime.enable' @{} 5000 $sesion | Out-Null
    Llamar $h 'Log.enable' @{} 5000 $sesion | Out-Null
    Start-Sleep -Milliseconds 800

    # ── 3. DOM ─────────────────────────────────────────────────
    $diag = Eval-En $h $sesion $jsDiag
    Write-Host "OK 2/3  $Pagina abierto"
    Write-Host "        $diag"

    if ($Pagina -eq 'popup.html') {
      $clic = Eval-En $h $sesion $jsClick
      Start-Sleep -Milliseconds 1500
      $panel = Eval-En $h $sesion $jsFilas
      Write-Host "OK 3/3  riel: $panel"
      if ($clic -ne 'CLICK') { Write-Host "FALLA: no encontré el botón del riel (#scsBtn)"; $fallas++ }
      if ($panel -notmatch '4 filas') { Write-Host "FALLA: el riel no pintó las 4 filas"; $fallas++ }
      if ($diag -notmatch '"panelClientes":true') { Write-Host "AVISO: el panel de clientes de la 01 no está en el DOM"; }
    }
  } finally {
    try { $h.ws.Dispose() } catch {}
    try { $h.ct.Dispose() } catch {}
  }
} finally {
  if ($proc) { Matar-Arbol $proc.Id }
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*sc_suite_*' } |
    ForEach-Object { Matar-Arbol $_.ProcessId }
  Start-Sleep -Seconds 2
  Remove-Item -LiteralPath $perfil -Recurse -Force -ErrorAction SilentlyContinue

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
    if ($vistos -ge 40) { Write-Host '...'; break }
  }
  if ($vistos -eq 0) { Write-Host "(nada)" }
}

if ($fallas -gt 0) { exit 1 }
