#requires -Version 5.1
<#
  verificar.ps1 — LA PUERTA DE CALIDAD DEL PROYECTO
  ==================================================
  Un solo comando para saber si lo que hay en disco es entregable:

    1. Sintaxis de todos los JS que se empaquetan (node --check).
    2. Compila la 01 (vite) — el content script que viaja al SRI.
    3. Corre los 24 bancos de prueba (909 comprobaciones) contra el bundle real.
    4. Regenera la suite y verifica que quede igual (determinismo).
    5. Valida los cinco manifiestos y muestra las versiones.

  Uso:
      powershell -ExecutionPolicy Bypass -File tools\verificar.ps1
      … -SaltarBanco          # rápido: sintaxis + build + suite (sin los 57s)
      … -ConNavegador         # suma las pruebas de Edge (popup, HUD, inyección)
      … -Python "C:\ruta\python.exe"

  Sale con código 0 sólo si TODO pasó. Es lo que se corre antes de entregar.
#>
param(
  [string]$Node = 'node',
  [string]$Python = 'python',
  [switch]$SaltarBanco,
  [switch]$ConNavegador
)

$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot          # "extenciones web"
$Uno = Join-Path $Raiz '01_Nueva_Luz_3.0'
$Suite = Join-Path $Raiz 'suite'
$herramientas = Join-Path $Raiz 'tools'

$fallas = New-Object System.Collections.Generic.List[string]
$reloj = [System.Diagnostics.Stopwatch]::StartNew()

function Paso($texto) {
  Write-Host ''
  Write-Host "▶ $texto" -ForegroundColor Cyan
}

function Bien($texto) { Write-Host "  ✓ $texto" -ForegroundColor Green }
function Mal($texto) { Write-Host "  ✗ $texto" -ForegroundColor Red; $script:fallas.Add($texto) }
function Nota($texto) { Write-Host "  · $texto" -ForegroundColor DarkGray }

function Correr-Node {
  param([string[]]$Argumentos, [string]$Cwd = $Raiz)
  $salida = & $Node @Argumentos 2>&1
  return @{ Codigo = $LASTEXITCODE; Salida = $salida }
}

# ─────────────────────────────────────────────────────────────────────────────
Paso 'Node disponible'
$ver = & $Node --version 2>&1
if ($LASTEXITCODE -ne 0) {
  Mal "no encuentro Node ('$Node'). Pasá la ruta con -Node 'C:\ruta\node.exe'."
  Write-Host ''
  Write-Host 'No se puede seguir sin Node.' -ForegroundColor Red
  exit 1
}
Bien "Node $ver"

# ─────────────────────────────────────────────────────────────────────────────
Paso 'Sintaxis de los scripts que se empaquetan'
$archivos = @()
$archivos += Get-ChildItem -LiteralPath (Join-Path $Uno 'src') -Filter '*.js' -File | ForEach-Object { $_.FullName }
foreach ($n in @('bridge_content.js', 'options.js', 'popup.js', 'background.js')) {
  $f = Join-Path $Uno $n
  if (Test-Path -LiteralPath $f) { $archivos += $f }
}
foreach ($n in @('content.js', 'bridge_content.js', 'supabase_bridge.js', 'popup.js')) {
  $f = Join-Path (Join-Path $Raiz '02_Cambio_Claves_SRI') $n
  if (Test-Path -LiteralPath $f) { $archivos += $f }
}
foreach ($n in @('content.js', 'popup.js')) {
  $f = Join-Path (Join-Path $Raiz '03_Anexo_Gastos_Personales') $n
  if (Test-Path -LiteralPath $f) { $archivos += $f }
}
foreach ($n in @('content.js', 'popup.js', 'libs\injected_bypass.js')) {
  $f = Join-Path (Join-Path $Raiz '04_Anulador_Comprobantes_SRI') $n
  if (Test-Path -LiteralPath $f) { $archivos += $f }
}

$conError = 0
foreach ($f in $archivos) {
  $r = Correr-Node @('--check', $f)
  if ($r.Codigo -ne 0) {
    Mal "sintaxis: $(Split-Path -Leaf $f)"
    $r.Salida | Select-Object -First 6 | ForEach-Object { Nota ($_ -join ' ') }
    $conError++
  }
}
if ($conError -eq 0) { Bien "$($archivos.Count) archivos sin errores de sintaxis" }

# ─────────────────────────────────────────────────────────────────────────────
Paso 'Nombres reservados por Chrome'
# Chrome NO ignora las carpetas que empiezan con "_": las rechaza y la
# extensión no carga ("Cannot load extension with file or directory name
# _recorridos. Filenames starting with _ are reserved for use by the system").
# Esta comprobación existe porque pasó: 112 MB de evidencia quedaron fuera de
# carga sin que nada lo avisara.
$conReservados = 0
foreach ($a in @('01_Nueva_Luz_3.0', '02_Cambio_Claves_SRI', '03_Anexo_Gastos_Personales', '04_Anulador_Comprobantes_SRI', 'suite')) {
  $dir = Join-Path $Raiz $a
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name.StartsWith('_') } |
    ForEach-Object {
      Mal "$a\$($_.Name): Chrome rechaza los nombres que empiezan con _ en la raíz"
      $conReservados++
    }
}
if ($conReservados -eq 0) { Bien 'ninguna extensión tiene nombres reservados en la raíz' }

# ─────────────────────────────────────────────────────────────────────────────
Paso 'Compilar la 01 (vite → build/content.js)'
$vite = Join-Path $Uno 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vite)) {
  Mal "no encontré vite en 01_Nueva_Luz_3.0\node_modules (corré npm install ahí)"
} else {
  Push-Location $Uno
  try {
    $r = Correr-Node @($vite, 'build') $Uno
    if ($r.Codigo -ne 0) {
      Mal 'la compilación de la 01 falló'
      $r.Salida | Select-Object -Last 12 | ForEach-Object { Nota ($_ -join ' ') }
    } else {
      $lineaSello = $r.Salida | Select-String 'build:' | Select-Object -Last 1
      $tam = [math]::Round((Get-Item (Join-Path $Uno 'build\content.js')).Length / 1KB, 0)
      Bien "build OK · ${tam} KB"
      if ($lineaSello) { Nota ($lineaSello.ToString().Trim()) }
    }
  } finally { Pop-Location }
}

# ─────────────────────────────────────────────────────────────────────────────
if (-not $SaltarBanco) {
  Paso 'Bancos de prueba (24 HTML · ~57 s)'
  Push-Location $Uno
  try {
    $r = Correr-Node @((Join-Path $Uno 'tests\run.mjs')) $Uno
    $lineaResumen = $r.Salida | Select-String 'comprobaciones' | Select-Object -Last 1
    if ($r.Codigo -ne 0) {
      Mal 'los bancos no pasaron'
      $r.Salida | Select-Object -Last 20 | ForEach-Object { Nota ($_ -join ' ') }
    } else {
      if ($lineaResumen) { Bien ($lineaResumen.ToString().Trim()) } else { Bien 'bancos en verde' }
    }
  } finally { Pop-Location }
} else {
  Nota 'bancos omitidos (-SaltarBanco)'
}

# ─────────────────────────────────────────────────────────────────────────────
Paso 'Suite: regenerar y verificar que sea determinista'
$constructor = Join-Path $herramientas 'construir_suite.mjs'
$r = Correr-Node @($constructor)
if ($r.Codigo -ne 0) {
  Mal 'el constructor de la suite falló'
  $r.Salida | Select-Object -Last 12 | ForEach-Object { Nota ($_ -join ' ') }
} else {
  $r2 = Correr-Node @($constructor, '--check')
  if ($r2.Codigo -ne 0) {
    Mal 'la suite no quedó igual después de generarla (¿no determinista?)'
    $r2.Salida | Select-Object -Last 10 | ForEach-Object { Nota ($_ -join ' ') }
  } else {
    $peso = [math]::Round((Get-ChildItem $Suite -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 2)
    Bien "suite generada y al día · ${peso} MB"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
Paso 'Secretos en archivos que se empaquetan'
# La clave de Gemini vivió años en el código de la 03. Que no vuelva a pasar:
# si aparece un patrón de credencial en algo que viaja al navegador, la puerta
# se cierra. No se imprime el valor, sólo dónde está.
$patrones = @(
  @{ Nombre = 'clave de Google (AIza…)';        Regex = 'AIza[0-9A-Za-z_\-]{30,}' },
  @{ Nombre = 'token de GitHub (ghp_)';         Regex = 'ghp_[0-9A-Za-z]{20,}' },
  @{ Nombre = 'clave de AWS (AKIA)';            Regex = 'AKIA[0-9A-Z]{16}' },
  @{ Nombre = 'clave privada PEM';              Regex = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
  @{ Nombre = 'JWT de Supabase service_role';   Regex = 'service_role' }
)
$artefactos = @('01_Nueva_Luz_3.0', '02_Cambio_Claves_SRI', '03_Anexo_Gastos_Personales', '04_Anulador_Comprobantes_SRI', 'suite')
$objetivos = @()
foreach ($a in $artefactos) {
  $dir = Join-Path $Raiz $a
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  # Se filtra por extensión con Where-Object: en PowerShell 5.1, `-Include`
  # junto con `-LiteralPath` se ignora y se escaneaba TODO (incluidas las
  # trazas de Burp, que dan falsos positivos de AKIA dentro de base64).
  $objetivos += Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Extension -in @('.js', '.html', '.json') -and
      $_.FullName -notmatch '\\node_modules\\|\\tests\\|\\vendor\\|\\libs\\|\\_recorridos\\'
    }
}
$hallazgos = 0
foreach ($pat in $patrones) {
  foreach ($f in $objetivos) {
    $m = Select-String -LiteralPath $f.FullName -Pattern $pat.Regex -AllMatches -CaseSensitive -ErrorAction SilentlyContinue
    if ($m) {
      $hallazgos++
      $rel = $f.FullName.Substring($Raiz.Length + 1)
      Mal "$($pat.Nombre) en $rel (línea $($m[0].LineNumber))"
    }
  }
}
if ($hallazgos -eq 0) { Bien "$($objetivos.Count) archivos sin credenciales embebidas" }

# ─────────────────────────────────────────────────────────────────────────────
Paso 'Manifiestos'
$esperados = @{
  '01_Nueva_Luz_3.0'             = '01'
  '02_Cambio_Claves_SRI'         = '02'
  '03_Anexo_Gastos_Personales'   = '03'
  '04_Anulador_Comprobantes_SRI' = '04'
  'suite'                        = 'SUITE'
}
foreach ($clave in $esperados.Keys) {
  $f = Join-Path (Join-Path $Raiz $clave) 'manifest.json'
  if (-not (Test-Path -LiteralPath $f)) { Mal "falta $clave/manifest.json"; continue }
  try {
    $m = ConvertFrom-Json ([System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8))
    $tag = $esperados[$clave]
    $okNombre = ($tag -eq 'SUITE' -and $m.name -like '*SUITE*') -or ($tag -ne 'SUITE' -and $m.name -like "*PRO $tag*")
    if (-not $okNombre) { Mal "${clave}: el nombre no sigue el formato SC PRO ($($m.name))" }
    elseif ($m.manifest_version -ne 3) { Mal "${clave}: manifest_version $($m.manifest_version)" }
    else { Bien ("{0,-30} v{1}  {2}" -f $m.name, $m.version, "content_scripts: $(@($m.content_scripts).Count)") }
  } catch {
    Mal "$clave/manifest.json no es JSON válido: $($_.Exception.Message)"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
if ($ConNavegador) {
  Paso 'Pruebas de navegador (Edge + Python)'
  $pruebas = @(
    @{ Nombre = 'popup + riel de la suite'; Archivo = 'prueba_suite.ps1'; Args = @() },
    @{ Nombre = 'capa de experiencia (HUD)'; Archivo = 'prueba_experiencia.ps1'; Args = @('-Python', $Python) },
    @{ Nombre = 'inyección de módulo (02)'; Archivo = 'prueba_inyeccion.ps1'; Args = @('-Python', $Python) }
  )
  foreach ($p in $pruebas) {
    $ruta = Join-Path $herramientas $p.Archivo
    if (-not (Test-Path -LiteralPath $ruta)) { Nota "no existe $($p.Archivo)"; continue }
    $salida = & powershell -NoProfile -ExecutionPolicy Bypass -File $ruta @($p.Args) 2>&1
    if ($LASTEXITCODE -ne 0) {
      Mal "$($p.Nombre): falló"
      $salida | Select-Object -Last 8 | ForEach-Object { Nota ($_ -join ' ') }
    } else {
      Bien "$($p.Nombre): OK"
    }
  }
} else {
  Nota 'pruebas de navegador omitidas (-ConNavegador)'
}

# ─────────────────────────────────────────────────────────────────────────────
$reloj.Stop()
Write-Host ''
if ($fallas.Count -eq 0) {
  Write-Host ("✅ TODO EN VERDE ({0:N0}s)" -f $reloj.Elapsed.TotalSeconds) -ForegroundColor Green
  exit 0
}
Write-Host ("❌ {0} problema(s) en {1:N0}s:" -f $fallas.Count, $reloj.Elapsed.TotalSeconds) -ForegroundColor Red
$fallas | ForEach-Object { Write-Host "   · $_" -ForegroundColor Red }
exit 1
