<#
.SYNOPSIS
  Deja listo el entorno de desarrollo personal (ver README > Setup).

.DESCRIPTION
  1. Instala fnm + Node LTS si faltan (sin permisos de administrador).
  2. Instala clasp (npm install) y verifica el login de Google.
  3. Cambia a tu rama personal y la pone al día con master.
  4. Crea TU proyecto DEV de Apps Script (si no lo tienes) y escribe .clasp.json.
  5. Sube el código a tu DEV y abre el editor.

  Se puede correr varias veces: lo que ya está hecho se salta.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-dev.ps1 -Nombre jorge
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9-]+$')]
  [string]$Nombre
)

$ErrorActionPreference = 'Stop'
$ScriptIdCompartido = '1NbOczw_H8UJ7adxRP4h_jl9VlfyvxM3mANYsaz12U5uo8Gj0BmfIYN3k'
$RepoRoot = $PSScriptRoot
Set-Location $RepoRoot

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Ok($texto)   { Write-Host "    OK  $texto" -ForegroundColor Green }
function Aviso($texto){ Write-Host "    !!  $texto" -ForegroundColor Yellow }
function Falla($texto){ Write-Host "`n    ERROR: $texto`n" -ForegroundColor Red; exit 1 }

function Invocar($exe, [string[]]$argumentos, $mensajeError) {
  & $exe @argumentos
  if ($LASTEXITCODE -ne 0) { Falla $mensajeError }
}

function EscribirJsonSinBom($ruta, $objeto) {
  $json = $objeto | ConvertTo-Json
  [IO.File]::WriteAllText($ruta, $json + "`n", (New-Object Text.UTF8Encoding $false))
}

# ---------------------------------------------------------------------------
Paso 'Git'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Falla 'No encuentro git. Instálalo (https://git-scm.com) y vuelve a correr este script.'
}
if (-not (Test-Path (Join-Path $RepoRoot '.git'))) {
  Falla 'Corre este script desde la carpeta del repo clonado.'
}
Ok (git --version)

# ---------------------------------------------------------------------------
Paso 'fnm + Node'
if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
  $fnmDir = Join-Path $env:LOCALAPPDATA 'fnm'
  $fnmExe = Join-Path $fnmDir 'fnm.exe'
  if (-not (Test-Path $fnmExe)) {
    Aviso "fnm no está instalado; lo instalo en $fnmDir (sin admin)"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $zip = Join-Path $env:TEMP 'fnm-windows.zip'
    Invoke-WebRequest 'https://github.com/Schniz/fnm/releases/latest/download/fnm-windows.zip' -OutFile $zip -UseBasicParsing
    New-Item -ItemType Directory -Force $fnmDir | Out-Null
    Expand-Archive $zip $fnmDir -Force
    Remove-Item $zip
  }
  # PATH del usuario (no requiere admin)
  $pathUsuario = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $pathUsuario) { $pathUsuario = '' }
  if (($pathUsuario -split ';') -notcontains $fnmDir) {
    [Environment]::SetEnvironmentVariable('Path', ($fnmDir + ';' + $pathUsuario).TrimEnd(';'), 'User')
  }
  $env:Path = "$fnmDir;$env:Path"
}
Ok (fnm --version)

# Cargar fnm en ESTA sesión
fnm env --shell powershell | Out-String | Invoke-Expression

if (-not (fnm list | Select-String 'v\d')) {
  Aviso 'No hay Node instalado; instalo la versión LTS'
  Invocar fnm @('install', '--lts') 'No se pudo instalar Node con fnm.'
}
if (fnm list | Select-String 'lts-latest') {
  fnm default lts-latest
} else {
  # lts-latest solo existe si se instaló con --lts; si no, usar la primera versión instalada
  $version = (fnm list | Select-String 'v\d+\.\d+\.\d+' | Select-Object -First 1).Matches[0].Value
  fnm default $version
}
fnm use default | Out-Null
Ok ('node ' + (node -v) + ' / npm ' + (npm -v))

# fnm en el $PROFILE para que funcione en terminales nuevas
$lineaFnm = 'fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression'
if (-not (Test-Path $PROFILE)) { New-Item -ItemType File -Force $PROFILE | Out-Null }
if (-not (Select-String -Path $PROFILE -Pattern 'fnm env' -Quiet)) {
  Add-Content -Path $PROFILE -Value "`n# Node.js via fnm`n$lineaFnm" -Encoding UTF8
  Ok "Agregué fnm a tu perfil: $PROFILE"
} else {
  Ok 'fnm ya está en tu perfil de PowerShell'
}
$politica = Get-ExecutionPolicy -Scope CurrentUser
if ($politica -eq 'Undefined' -or $politica -eq 'Restricted') {
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
  Ok 'Política de ejecución (solo tu usuario) = RemoteSigned, para que cargue el perfil'
}

# ---------------------------------------------------------------------------
Paso 'clasp'
Invocar npm @('install', '--no-fund', '--no-audit') 'Falló npm install.'
$clasp = Join-Path $RepoRoot 'node_modules\.bin\clasp.cmd'
if (-not (Test-Path $clasp)) { Falla 'npm install no dejó clasp en node_modules.' }

function UsuarioClasp {
  # En PowerShell 5.1, redirigir stderr de un .exe con ErrorAction=Stop truena aunque no haya error.
  $ErrorActionPreference = 'Continue'
  return (& $clasp show-authorized-user 2>&1 | Out-String)
}
$usuario = UsuarioClasp
if ($usuario -notmatch 'logged in as') {
  Aviso 'No has iniciado sesión en clasp. Se abrirá el navegador: entra con tu cuenta @ciudadmaderas.com'
  Invocar $clasp @('login') 'No se completó clasp login.'
  $usuario = UsuarioClasp
}
Ok $usuario.Trim()
Aviso 'Si nunca lo has hecho: activa "Google Apps Script API" en https://script.google.com/home/usersettings'

# ---------------------------------------------------------------------------
Paso "Rama personal: $Nombre"
$cambios = git status --porcelain --untracked-files=no
if ($cambios) {
  Falla "Tienes cambios sin commit. Haz commit o 'git stash' y vuelve a correr el script:`n$cambios"
}
Invocar git @('fetch', 'origin', '--prune') 'No se pudo hacer git fetch.'

$existeLocal  = git branch --list $Nombre
$existeRemota = git branch -r --list "origin/$Nombre"
if ($existeLocal) {
  Invocar git @('checkout', $Nombre) "No se pudo cambiar a la rama $Nombre."
} elseif ($existeRemota) {
  Invocar git @('checkout', '-b', $Nombre, '--track', "origin/$Nombre") "No se pudo crear la rama $Nombre."
} else {
  Invocar git @('checkout', '-b', $Nombre, 'origin/master') "No se pudo crear la rama $Nombre."
  Invocar git @('push', '-u', 'origin', $Nombre) "No se pudo subir la rama $Nombre."
}
Invocar git @('merge', '--no-edit', 'origin/master') 'Hubo conflictos al traer master. Resuélvelos y vuelve a correr el script.'
Ok "En la rama $Nombre, al día con master"

# ---------------------------------------------------------------------------
Paso 'Proyecto DEV de Apps Script'
$claspJson = Join-Path $RepoRoot '.clasp.json'
$scriptIdDev = $null

if (Test-Path $claspJson) {
  $actual = (Get-Content $claspJson -Raw | ConvertFrom-Json).scriptId
  if ($actual -eq $ScriptIdCompartido) {
    # Guardarlo aparte (ignorado por git) para publicar desde master más adelante
    Move-Item $claspJson (Join-Path $RepoRoot '.clasp.compartido.json') -Force
    Aviso 'Tu .clasp.json apuntaba al proyecto COMPARTIDO; lo moví a .clasp.compartido.json'
  } elseif ($actual -and $actual -notmatch 'PEGA_AQUI') {
    $scriptIdDev = $actual
    Ok "Ya tienes proyecto DEV: $scriptIdDev"
  }
}

if (-not $scriptIdDev) {
  $tmp = Join-Path $env:TEMP ("clasp-dev-" + $Nombre + "-" + (Get-Date -Format 'yyyyMMddHHmmss'))
  New-Item -ItemType Directory -Force $tmp | Out-Null
  Push-Location $tmp
  try {
    & $clasp create-script --type standalone --title "Inventario DEV - $Nombre"
    if ($LASTEXITCODE -ne 0) { Falla 'No se pudo crear el proyecto. ¿Activaste la Apps Script API en https://script.google.com/home/usersettings ?' }
    $scriptIdDev = (Get-Content (Join-Path $tmp '.clasp.json') -Raw | ConvertFrom-Json).scriptId
  } finally {
    Pop-Location
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  EscribirJsonSinBom $claspJson ([ordered]@{ scriptId = $scriptIdDev; rootDir = './src' })
  Ok "Proyecto DEV creado: $scriptIdDev"
}

if ($scriptIdDev -eq $ScriptIdCompartido) { Falla 'Por seguridad: .clasp.json apunta al proyecto compartido. No hago push.' }

# ---------------------------------------------------------------------------
Paso 'Subir código a tu DEV'
Invocar $clasp @('push', '--force') 'Falló clasp push.'
Ok 'Código subido'
& $clasp open-script | Out-Null

Write-Host @"

=====================================================================
 Listo. Te falta hacer esto UNA vez en el editor que se acaba de abrir:

  1. En la lista de funciones (arriba) elige  configurarEntornoDev
     -> Ejecutar -> acepta los permisos.
  2. Implementar -> Probar implementaciones -> copia la URL que
     termina en /dev. Esa es TU app de pruebas.

 Día a día:  npm run push   (sube a tu DEV)
             git add -A; git commit -m "..."; git push
=====================================================================
"@ -ForegroundColor Green
