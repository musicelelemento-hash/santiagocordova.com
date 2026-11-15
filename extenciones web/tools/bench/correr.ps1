# Corre el banco de 2000 clientes del popup 01 y verifica el criterio de la
# Fase 2.3: abrir con 2000 en menos de 1 s y pintar sólo una tanda.
#
#   powershell -ExecutionPolicy Bypass -File "extenciones web\tools\bench\correr.ps1"
#
# Genera el HTML, lo abre en Edge headless y lee el resultado que deja la página.

param(
    [string]$Node = "",
    [string]$Edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)

$ErrorActionPreference = "Continue"
$AQUI = Split-Path -Parent $MyInvocation.MyCommand.Path

function Buscar-Node {
    if ($Node -and (Test-Path -LiteralPath $Node)) { return $Node }
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $dsh = Join-Path $env:USERPROFILE ".dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    if (Test-Path -LiteralPath $dsh) { return $dsh }
    return ""
}

$nodeExe = Buscar-Node
if (-not $nodeExe) { Write-Host "No encontré Node." -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath $Edge)) { Write-Host "No encontré Edge en $Edge" -ForegroundColor Red; exit 1 }

& $nodeExe (Join-Path $AQUI "generar_bench.mjs")

$pagina = Join-Path $AQUI "bench_2000.html"
$perfil = Join-Path $env:TEMP ("bench_" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$url = "file:///" + ($pagina -replace '\\', '/' -replace ' ', '%20')

$dom = & $Edge --headless=new --disable-gpu --virtual-time-budget=9000 --user-data-dir="$perfil" --dump-dom $url 2>$null | Out-String
Remove-Item -LiteralPath $perfil -Recurse -Force -ErrorAction SilentlyContinue

$m = [regex]::Match($dom, 'BENCH (\{.*?\})')
if (-not $m.Success) {
    Write-Host "El banco no devolvió resultado (¿el popup falló al cargar?)." -ForegroundColor Red
    exit 1
}

$r = $m.Groups[1].Value | ConvertFrom-Json
Write-Host ""
Write-Host "  clientes      : $($r.total)"
Write-Host "  tarjetas DOM  : $($r.tarjetas)  (esperado: 60 = una tanda)"
Write-Host "  pendientes    : $($r.pendientes)"
Write-Host "  completados   : $($r.completados)"
Write-Host "  DOM listo     : $($r.msRender) ms  (criterio: < 1000 ms)"
if ($r.errores -and $r.errores.Count -gt 0) { Write-Host "  errores JS    : $($r.errores -join ' | ')" -ForegroundColor Red }

$ok = ($r.tarjetas -le 60) -and ($r.msRender -lt 1000) -and (-not ($r.errores -and $r.errores.Count -gt 0))
Write-Host ""
if ($ok) { Write-Host "OK · 2000 clientes abren en $($r.msRender) ms y sólo se pintan $($r.tarjetas)." -ForegroundColor Green; exit 0 }
Write-Host "FALLA · revisar el resultado de arriba." -ForegroundColor Red
exit 1
