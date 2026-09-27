<#
.SYNOPSIS
    Deja lista la base de datos de SECAD en un Windows local, sin Docker.

.DESCRIPTION
    Para correr SECAD en el mismo PC donde vive el HikCentral y probar la
    integración de cámaras contra un VMS real.

    No hay runner de migraciones: el esquema se pone al día aplicando la lista
    COMPLETA en orden, que vive en docs/sql/master/_orden.*.txt. Es repetible -
    verificado sobre PostgreSQL 16, dos pasadas seguidas, cero errores-, así
    que si algo falla a mitad se corrige y se vuelve a lanzar entero.

    Crea dos bases: la MAESTRA (que sabe qué CAD vive en qué base) y una de
    TENANT (el CAD en sí).

.EXAMPLE
    .\scripts\preparar_local_windows.ps1 -Password postgres

.EXAMPLE
    .\scripts\preparar_local_windows.ps1 -Puerto 5433 -Password miclave `
        -PgBin "C:\Program Files\PostgreSQL\16\bin"
#>
[CmdletBinding()]
param(
    [string] $PgBin        = "",
    [string] $PgHost       = "localhost",
    [int]    $Puerto       = 5432,
    [string] $Usuario      = "postgres",
    [Parameter(Mandatory = $true)]
    [string] $Password,
    [string] $BaseMaestra  = "secad",
    [string] $BaseTenant   = "secad_bogota",
    [string] $CodDane      = "11001"
)

$ErrorActionPreference = "Stop"

# psql habla UTF-8 con estos archivos. Sin esto, en una consola de Windows los
# acentos de los scripts llegan corruptos y algunas migraciones fallan.
$env:PGCLIENTENCODING = "UTF8"
$env:PGPASSWORD       = $Password

# -- Localizar psql --------------------------------------------------------
if ($PgBin) {
    $psql = Join-Path $PgBin "psql.exe"
} else {
    $cmd = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($cmd) {
        $psql = $cmd.Source
    } else {
        $cand = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending | Select-Object -First 1
        if ($cand) { $psql = $cand.FullName }
    }
}
if (-not $psql -or -not (Test-Path $psql)) {
    Write-Host "No encuentro psql.exe." -ForegroundColor Red
    Write-Host "Instala PostgreSQL (https://www.postgresql.org/download/windows/)"
    Write-Host "o pasa la ruta:  -PgBin ""C:\Program Files\PostgreSQL\16\bin"""
    exit 1
}

$raiz   = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent
$sqlDir = Join-Path $raiz "docs\sql\master"

function Invoke-Psql {
    param([string] $Base, [string] $Sql)
    & $psql -h $PgHost -p $Puerto -U $Usuario -d $Base -v ON_ERROR_STOP=1 -q -t -A -c $Sql
    if ($LASTEXITCODE -ne 0) { throw "psql falló: $Sql" }
}

function Invoke-Archivo {
    param([string] $Base, [string] $Archivo)
    & $psql -h $PgHost -p $Puerto -U $Usuario -d $Base -v ON_ERROR_STOP=1 -q -f $Archivo
    if ($LASTEXITCODE -ne 0) { throw "Falló al aplicar: $Archivo" }
}

function Aplicar-Orden {
    param([string] $Manifiesto, [string] $Base, [string] $Titulo)
    $lista = Get-Content $Manifiesto -Encoding UTF8 |
             Where-Object { $_.Trim() -ne "" -and -not $_.Trim().StartsWith("#") }
    Write-Host ""
    Write-Host "  $Titulo - $($lista.Count) archivos sobre $Base" -ForegroundColor Cyan
    $i = 0
    foreach ($nombre in $lista) {
        $i++
        $f = Join-Path $sqlDir $nombre.Trim()
        if (-not (Test-Path $f)) { throw "No existe el archivo de migración: $f" }
        Write-Host ("   [{0,2}/{1}] {2}" -f $i, $lista.Count, $nombre.Trim())
        Invoke-Archivo -Base $Base -Archivo $f
    }
}

Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "  SECAD - preparar base de datos local"                     -ForegroundColor Yellow
Write-Host "    psql    : $psql"
Write-Host "    servidor: ${PgHost}:${Puerto}  usuario: $Usuario"
Write-Host "    maestra : $BaseMaestra     tenant: $BaseTenant  (cod_dane $CodDane)"
Write-Host "==========================================================" -ForegroundColor Yellow

# -- 1. Conexión -----------------------------------------------------------
Write-Host ""
Write-Host "1/4 - Probando la conexión" -ForegroundColor Cyan
$v = & $psql -h $PgHost -p $Puerto -U $Usuario -d postgres -t -A -c "SELECT version()"
if ($LASTEXITCODE -ne 0) {
    Write-Host "No se pudo conectar. Revisa que el servicio de PostgreSQL esté" -ForegroundColor Red
    Write-Host "arriba, y que el puerto y la contraseña sean los correctos."    -ForegroundColor Red
    exit 1
}
Write-Host "   $($v.Substring(0, [Math]::Min(50, $v.Length)))..."

# -- 2. Bases de datos -----------------------------------------------------
Write-Host ""
Write-Host "2/4 - Bases de datos" -ForegroundColor Cyan
foreach ($b in @($BaseMaestra, $BaseTenant)) {

    # Los nombres van SIN comillas en el SQL: PowerShell se come las comillas
    # dobles al pasar argumentos a un .exe nativo, asi que CREATE DATABASE
    # "Secad" le llegaba a psql como CREATE DATABASE Secad y PostgreSQL lo
    # plegaba a minusculas. Se creaba "secad" y el script se conectaba despues
    # a "Secad", que no existia. Por eso el nombre tiene que ser un
    # identificador que no necesite comillas.
    if ($b -cnotmatch '^[a-z_][a-z0-9_]*$') {
        Write-Host "El nombre de base '$b' necesitaria comillas en SQL." -ForegroundColor Red
        Write-Host "Usa solo minusculas, digitos y guion bajo."          -ForegroundColor Red
        exit 1
    }

    $existe = & $psql -h $PgHost -p $Puerto -U $Usuario -d postgres -t -A `
                      -c "SELECT 1 FROM pg_database WHERE datname = '$b'"
    if ($existe -eq "1") {
        Write-Host "   $b ya existia."
    } else {
        Invoke-Psql -Base "postgres" -Sql "CREATE DATABASE $b"

        # Comprobar el EFECTO, no solo el codigo de salida de psql: es lo que
        # habria cazado el problema de las comillas en el acto.
        $ok = & $psql -h $PgHost -p $Puerto -U $Usuario -d postgres -t -A `
                      -c "SELECT 1 FROM pg_database WHERE datname = '$b'"
        if ($ok -ne "1") {
            Write-Host "psql dijo que creo la base pero '$b' no aparece." -ForegroundColor Red
            exit 1
        }
        Write-Host "   $b creada." -ForegroundColor Green
    }
}

# -- 3. Esquemas -----------------------------------------------------------
Write-Host ""
Write-Host "3/4 - Aplicando el esquema (repetible)" -ForegroundColor Cyan
Aplicar-Orden -Manifiesto (Join-Path $sqlDir "_orden.master.txt") -Base $BaseMaestra -Titulo "MAESTRA"
Aplicar-Orden -Manifiesto (Join-Path $sqlDir "_orden.tenant.txt") -Base $BaseTenant  -Titulo "TENANT"

# -- 4. Registrar el CAD en la maestra -------------------------------------
# V1 siembra el tenant 11001 apuntando a localhost:5433. Aquí se corrige con
# los datos REALES de esta instalación: si no coinciden, el backend levanta
# pero no encuentra la base del CAD y todo responde vacío.
Write-Host ""
Write-Host "4/4 - Registrando el CAD en la maestra" -ForegroundColor Cyan
$sqlTenant = @"
INSERT INTO secad_tenants
    (cod_dane, cod_unidad, nombre, departamento, municipio,
     db_host, db_port, db_name, db_username, db_password, activo)
VALUES
    ('$CodDane', 'LOCAL', 'CAD local de pruebas', 'CUNDINAMARCA', 'BOGOTA',
     '$PgHost', $Puerto, '$BaseTenant', '$Usuario', '$Password', TRUE)
ON CONFLICT (cod_dane) DO UPDATE SET
    db_host     = EXCLUDED.db_host,
    db_port     = EXCLUDED.db_port,
    db_name     = EXCLUDED.db_name,
    db_username = EXCLUDED.db_username,
    db_password = EXCLUDED.db_password,
    activo      = TRUE;
"@
Invoke-Psql -Base $BaseMaestra -Sql $sqlTenant
Write-Host "   tenant $CodDane -> $BaseTenant en ${PgHost}:${Puerto}" -ForegroundColor Green

$usuarios = Invoke-Psql -Base $BaseTenant -Sql "SELECT count(*) FROM ctr_usuarios"
Write-Host "   usuarios en el CAD: $usuarios  (V2 siembra 'admin')"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Base de datos lista."                                     -ForegroundColor Green
Write-Host "=========================================================="  -ForegroundColor Green
Write-Host ""
Write-Host "Levantar el backend (desde Bakcend\backend\oftic\oftic):"
Write-Host ""
Write-Host "  `$env:ASPNETCORE_ENVIRONMENT = 'Development'"
Write-Host "  `$env:ConnectionStrings__MasterDb = 'Host=$PgHost;Port=$Puerto;Database=$BaseMaestra;Username=$Usuario;Password=***'"
Write-Host "  dotnet run --project Api.csproj"
Write-Host ""
Write-Host "Y el frontend (desde la raíz del repo):"
Write-Host ""
Write-Host "  npm ci"
Write-Host "  npx ng serve --proxy-config proxy.conf.json"
Write-Host ""
Write-Host "Entrar con usuario 'admin' y CUALQUIER contraseña: en Development"
Write-Host "la validación contra el OUD de la Policía está desactivada."
