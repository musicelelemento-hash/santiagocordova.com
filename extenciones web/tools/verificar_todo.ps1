# Verifica TODO el workspace en un solo comando.
#
# Corré esto antes de dar una tanda por cerrada o antes de commitear:
#   powershell -ExecutionPolicy Bypass -File "extenciones web\tools\verificar_todo.ps1"
#
# Junta las tres puertas que hoy viven separadas:
#   1. Extensiones  -> tools\verificar.ps1 (sintaxis, nombres reservados, build 01,
#                      banco de pruebas, suite determinista, secretos, manifiestos)
#   2. Web (React)  -> tsc --noEmit
#   3. Bot          -> npm run build (incluye la regla de cobro compartida)
#
# El objetivo es que "no se pare": si algo se rompe, se ve aca y no tres tandas
# despues.

param(
    [string]$Node = "",
    [switch]$ConNavegador
)

$ErrorActionPreference = "Continue"
$raiz = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$web = Join-Path $raiz "santiagocordova-main"
$bot = Join-Path $web "telegram-bot"
$extensiones = Join-Path $raiz "extenciones web"

function Buscar-Node {
    if ($Node -and (Test-Path -LiteralPath $Node)) { return $Node }
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $dsh = Join-Path $env:USERPROFILE ".dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    if (Test-Path -LiteralPath $dsh) { return $dsh }
    return ""
}

$nodeExe = Buscar-Node
if (-not $nodeExe) {
    Write-Host "ERROR: no encontre Node. Pasalo con -Node 'C:\ruta\node.exe'." -ForegroundColor Red
    exit 1
}

$resultados = @()

function Anotar($nombre, $ok, $detalle) {
    $script:resultados += [pscustomobject]@{ Paso = $nombre; Estado = $(if ($ok) { "OK" } else { "FALLA" }); Detalle = $detalle }
}

Write-Host ""
Write-Host "> Extensiones" -ForegroundColor Cyan
$argsVerificar = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $extensiones "tools\verificar.ps1"), "-Node", $nodeExe, "-SaltarBanco")
if ($ConNavegador) { $argsVerificar += "-ConNavegador" }
$salidaExt = & powershell @argsVerificar 2>&1 | Out-String
$okExt = $LASTEXITCODE -eq 0
Anotar "Extensiones (verificar.ps1)" $okExt ($(if ($okExt) { "todo en verde" } else { "revisar salida" }))
$salidaExt -split "`n" | Where-Object { $_ -match "FALLA|ERROR" } | Select-Object -First 5 | ForEach-Object { "   $_" }

Write-Host ""
Write-Host "> Web - typecheck" -ForegroundColor Cyan
$tsc = Join-Path $web "node_modules\typescript\bin\tsc"
if (Test-Path -LiteralPath $tsc) {
    Push-Location $web
    $salidaWeb = & $nodeExe $tsc --noEmit 2>&1 | Out-String
    $okWeb = $LASTEXITCODE -eq 0
    Pop-Location
    Anotar "Web (tsc --noEmit)" $okWeb ($(if ($okWeb) { "0 errores" } else { "errores de tipos" }))
    if (-not $okWeb) { $salidaWeb -split "`n" | Where-Object { $_ -match "error TS" } | Select-Object -First 5 | ForEach-Object { "   $_" } }
} else {
    Anotar "Web (tsc --noEmit)" $false "falta node_modules"
}

Write-Host ""
Write-Host "> Bot - build" -ForegroundColor Cyan
if (Test-Path -LiteralPath (Join-Path $bot "package.json")) {
    Push-Location $bot
    $salidaBot = & npm run build 2>&1 | Out-String
    $okBot = $LASTEXITCODE -eq 0
    Pop-Location
    Anotar "Bot (npm run build)" $okBot ($(if ($okBot) { "compila" } else { "revisar salida" }))
    if (-not $okBot) { $salidaBot -split "`n" | Where-Object { $_ -match "error TS|Error" } | Select-Object -First 5 | ForEach-Object { "   $_" } }
} else {
    Anotar "Bot (npm run build)" $false "no existe telegram-bot"
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor DarkGray
$resultados | ForEach-Object {
    $color = if ($_.Estado -eq "OK") { "Green" } else { "Red" }
    Write-Host ("  {0,-28} {1,-6} {2}" -f $_.Paso, $_.Estado, $_.Detalle) -ForegroundColor $color
}

$fallas = @($resultados | Where-Object { $_.Estado -ne "OK" }).Count
Write-Host "==============================================" -ForegroundColor DarkGray
if ($fallas -eq 0) {
    Write-Host ""
    Write-Host "TODO EN VERDE - podes commitear." -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "$fallas paso(s) con falla. No commitees hasta arreglarlo." -ForegroundColor Red
    exit 1
}
