# Crea o corrige la administradora del negocio en la base de datos en línea
# (Neon) SIN borrar productos ni pedidos. Pregunta todo; no guarda nada.
#   npm run admin:neon
$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "=== Administradora del negocio en la base de datos en línea ===" -ForegroundColor Cyan
Write-Host "Copia en Neon la cadena de conexión DIRECTA: botón Connect, sin '-pooler' (empieza con postgresql://)."
Write-Host ""
$url = Read-Host "1) Pega la cadena de conexión de Neon"
if (-not $url.StartsWith("postgresql://")) { Write-Host "Esa cadena no empieza con postgresql:// . Revisa y vuelve a intentar." -ForegroundColor Red; exit 1 }
$email = Read-Host "2) Correo de la administradora (con el que va a entrar)"
$secure = Read-Host "3) Clave (mínimo 10 caracteres; no se ve al escribir)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
$remove = Read-Host "4) Correo a ELIMINAR (Enter = ninguno)"

try {
  $env:DATABASE_URL = $url
  $env:DATABASE_POOL_MAX = ""
  $env:SEED_ADMIN_EMAIL = $email
  $env:SEED_ADMIN_PASSWORD = $password
  if ([string]::IsNullOrWhiteSpace($remove)) { npx tsx prisma/admin.ts } else { npx tsx prisma/admin.ts --remove $remove }
} finally {
  Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD, Env:SEED_ADMIN_EMAIL, Env:DATABASE_POOL_MAX -ErrorAction SilentlyContinue
  $password = $null
}
Write-Host ""
Write-Host "Listo. Entra a tu sitio en /login con el correo y la clave que escribiste." -ForegroundColor Green
