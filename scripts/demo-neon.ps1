# Carga la DEMOSTRACIÓN de SF Boutique en la base de datos en línea (Neon):
# productos, tallas, colores, cuentas de ejemplo, blog y la administradora.
#   npm run demo:neon
# OJO: borra los pedidos, productos y clientes del negocio para volver a cargar la demo.
# Úsalo solo mientras se está mostrando el modelo, nunca con la tienda ya en uso.
$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "=== Cargar la demostración de SF Boutique en línea ===" -ForegroundColor Cyan
Write-Host "Esto BORRA pedidos, productos, clientes y cuentas del negocio y los reemplaza por los de ejemplo." -ForegroundColor Yellow
Write-Host ""
$ok = Read-Host "Escribe DEMO para continuar"
if ($ok -ne "DEMO") { Write-Host "Cancelado." ; exit 0 }
$url = Read-Host "1) Pega la cadena de conexión DIRECTA de Neon (sin -pooler)"
if (-not $url.StartsWith("postgresql://")) { Write-Host "Esa cadena no empieza con postgresql:// . Revisa y vuelve a intentar." -ForegroundColor Red; exit 1 }
$email = Read-Host "2) Correo de la administradora (con el que van a entrar)"
$secure = Read-Host "3) Clave (mínimo 10 caracteres; no se ve al escribir)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

try {
  $env:DATABASE_URL = $url
  $env:DATABASE_POOL_MAX = ""
  $env:SHADOW_DATABASE_URL = ""
  $env:SEED_ADMIN_EMAIL = $email
  $env:SEED_ADMIN_PASSWORD = $password
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw "No se pudieron crear las tablas." }
  npx tsx prisma/seed.ts
  if ($LASTEXITCODE -ne 0) { throw "No se pudo cargar la demostración." }
} finally {
  # No dejar la clave ni la cadena de conexión en esta ventana.
  Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD, Env:SEED_ADMIN_EMAIL, Env:DATABASE_POOL_MAX, Env:SHADOW_DATABASE_URL -ErrorAction SilentlyContinue
  $password = $null
}
Write-Host ""
Write-Host "Listo. Entra a tu sitio en /login con el correo y la clave que escribiste." -ForegroundColor Green
