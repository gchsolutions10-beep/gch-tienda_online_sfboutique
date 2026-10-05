# Crea o corrige el administrador del negocio en la base de datos en línea
# (Neon) SIN borrar el menú ni los datos. Pregunta todo; no guarda nada.
#   npm run admin:neon
$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "=== Administrador del negocio en la base de datos en línea ===" -ForegroundColor Cyan
Write-Host "Copia la cadena de conexión en Neon: botón Connect (empieza con postgresql://)."
Write-Host ""
$url = Read-Host "1) Pega la cadena de conexión de Neon"
if (-not $url.StartsWith("postgresql://")) { Write-Host "Esa cadena no empieza con postgresql:// . Revisa y vuelve a intentar." -ForegroundColor Red; exit 1 }
$email = Read-Host "2) Correo del administrador (con el que vas a entrar)"
$secure = Read-Host "3) Clave del administrador (mínimo 10 caracteres; no se ve al escribir)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
$remove = Read-Host "4) Correo de administrador a ELIMINAR (Enter = tu-correo@ejemplo.com, el de ejemplo)"
if ([string]::IsNullOrWhiteSpace($remove)) { $remove = "tu-correo@ejemplo.com" }

try {
  $env:DATABASE_URL = $url
  $env:DATABASE_POOL_MAX = ""
  $env:SEED_ADMIN_EMAIL = $email
  $env:SEED_ADMIN_PASSWORD = $password
  npx tsx prisma/admin.ts --remove $remove
} finally {
  # No dejar la clave ni la cadena de conexión en esta ventana.
  Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD, Env:SEED_ADMIN_EMAIL, Env:DATABASE_POOL_MAX -ErrorAction SilentlyContinue
  $password = $null
}
Write-Host ""
Write-Host "Listo. Entra a tu sitio en /login con el correo y la clave que escribiste." -ForegroundColor Green
