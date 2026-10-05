# Aplica a la base de datos en línea (Neon) los cambios de tablas pendientes.
# Hay que correrlo ANTES de publicar una versión que traiga migraciones nuevas.
#   npm run migrar:neon
$ErrorActionPreference = "Stop"
Write-Host ""
Write-Host "=== Actualizar las tablas de la base de datos en línea ===" -ForegroundColor Cyan
Write-Host "Copia en Neon la cadena de conexión DIRECTA: botón Connect, sin '-pooler' (empieza con postgresql://)."
Write-Host "No borra datos: solo agrega lo que falta."
Write-Host ""
$url = Read-Host "Pega la cadena de conexión de Neon"
if (-not $url.StartsWith("postgresql://")) { Write-Host "Esa cadena no empieza con postgresql:// . Revisa y vuelve a intentar." -ForegroundColor Red; exit 1 }
try {
  $env:DATABASE_URL = $url
  $env:DATABASE_POOL_MAX = ""
  $env:SHADOW_DATABASE_URL = ""
  npx prisma migrate deploy
} finally {
  Remove-Item Env:DATABASE_URL, Env:DATABASE_POOL_MAX, Env:SHADOW_DATABASE_URL -ErrorAction SilentlyContinue
}
Write-Host ""
Write-Host "Si dice 'All migrations have been successfully applied', ya puedes publicar." -ForegroundColor Green
