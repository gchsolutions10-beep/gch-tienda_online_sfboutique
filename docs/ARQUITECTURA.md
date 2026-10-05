# GCH Moda — Arquitectura

Tienda online, gestión, CRM y blog para **boutiques de moda en Venezuela**. Primer negocio: **SF Boutique** (Acarigua, Portuguesa · @sf_boutiqueve).

Reutiliza la base probada de *GCH Commerce* (Sabrosito): multi-negocio por subdominio, inicio de sesión del personal, límite de intentos, imágenes en la base de datos y **gestor de paletas de colores** con contraste AA.

---

## 1. Pila y convenciones

| Pieza | Elección |
|---|---|
| Framework | Next.js 16 (App Router, `proxy.ts`, Server Actions) + React 19 |
| Estilos | Tailwind 4 con tokens por negocio (`src/app/globals.css`, `src/lib/theme.ts`) |
| Base de datos | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`). Local: `prisma dev --name moda`; producción: Neon |
| Validación | Zod |
| Pruebas | Vitest (lógica pura en `src/lib`) |
| Tipografía | Playfair Display (títulos, precios) + Inter (texto) |

**Reglas que no se rompen**

- Todo lo de un negocio pasa por `tenantDb(tenantId)`, que agrega el `tenantId` a cada consulta (`src/server/db.ts`).
- Dinero en **centavos enteros**; tasas con hasta 6 decimales (`src/lib/money.ts`).
- Precios del catálogo en **USD**; el **bolívar es la moneda de cuenta**. Cada pedido guarda la tasa BCV del momento y sus montos en Bs.
- Cada **pago** se guarda en su moneda original (VES, USD o USDT) con la tasa usada y sus equivalentes en USD (gestión) y en Bs a tasa BCV (libros).
- Lógica de negocio pura y probada en `src/lib`; acceso a datos en `src/server`.

## 2. Estructura

```
prisma/
  schema.prisma          # modelo completo (catálogo, CRM, blog, multimoneda, caja, facturación)
  seed.ts                # SF Boutique de demostración
  demo-images.ts         # ilustraciones de ejemplo (se reemplazan por fotos reales)
src/
  proxy.ts               # subdominio → /t/[domain]/…
  app/t/[domain]/
    (store)/             # tienda: portada, catálogo, producto, blog
    admin/               # panel: resumen, tasas, apariencia (y los módulos de las próximas fases)
    login/               # acceso del personal
  components/
    store/               # tarjeta de moda, precio dual, filtros, bolsa, buscador, cabecera
    admin/               # menú, formulario de tasas, gestor de colores
  lib/                   # money, tax-ve, ve-ids, payments, rates, catalog, crm, theme, color
  server/
    auth/  db.ts  tenant.ts
    queries/store.ts     # tasas vigentes, portada, catálogo facetado, producto, sugerencias
    actions/             # login, búsqueda, tasas, apariencia
tests/unit/              # venezuela, catalog, theme
```

## 3. Modelo de datos (resumen)

| Módulo | Modelos |
|---|---|
| Plataforma | `Tenant` (RIF, razón social, paleta), `TenantDomain`, `TenantSettings` (IVA, IGTF, tasa a mostrar, reglas del CRM), `Branch`, `User`, `Membership`, `Session`, `RateLimit`, `TenantAsset`, `AuditLog` |
| Tasas | `ExchangeRate` (BCV / P2P, histórico; la vigente es la más reciente que ya rige) |
| Catálogo | `Category` (con subcategorías), `Size` (S–XL, 35–41, Única), `Color` (con muestra), `Brand`, `Product` (precio USD, costo, exento de IVA, etiqueta, SEO), `ProductImage` (vertical 3:4, por color; la 2.ª es la del hover), `ProductVariant` (talla + color, SKU, **stock y apartado por variante**), `StockMovement` |
| CRM | `Customer` (cédula/RIF, WhatsApp, origen, notas internas, mayorista, métricas acumuladas en USD y Bs, método favorito), `CustomerAddress` (con oficina de encomienda), `CustomerTag` (+ automáticas VIP / Recurrente / Nuevo / Inactivo), `CustomerInteraction` |
| Pedidos | `Order` (canal, entrega: retiro / delivery / envío nacional, totales en USD, tasa BCV y total en Bs, IGTF), `OrderItem` (copia de talla, color, SKU e IVA de la línea) |
| Cobros | `FinancialAccount` (Banesco Pago Móvil, Mercantil, Caja chica USD, Zelle, Binance USDT…), `Payment` (moneda original, tasa, equivalentes, referencia, comprobante, revisión) |
| Facturación | `InvoiceSeries` (factura, nota de crédito/débito, nota de entrega; modo del número de control), `Invoice` (número, **número de control**, comprador, base imponible, exento, IVA, IGTF y total en Bs + referencia USD y tasa) |
| Caja | `CashRegister`, `CashSession` (fondo por moneda), `CashMovement`, `CashClosingLine` (esperado vs. contado **por cuenta y por moneda**, con equivalentes) |
| Contenido | `PromoBanner`, `HeroCard` (tarjetas verticales de portada), `BlogCategory`, `BlogPost` (Markdown seguro, SEO, estado), `BlogPostProduct` («Consigue este look») |

## 4. Venezuela: reglas implementadas y por validar

> Referencia para el desarrollo. **Validar con el contador del negocio** antes de facturar.

- **IVA**: alícuota general 16 %, configurable; interruptor global y productos exentos uno por uno. Precio con IVA incluido (por defecto) o sumado (`src/lib/tax-ve.ts`).
- **IGTF**: 3 % sobre pagos en divisas o criptoactivos cuando le aplica al negocio (p. ej. contribuyentes especiales). Desactivado por defecto; se calcula por pago.
- **Factura**: número correlativo por serie + **número de control** asignado por una *imprenta digital autorizada* por el SENIAT o por formatos preimpresos (forma libre). Datos del comprador con cédula/RIF. Operaciones en divisas: se muestran los montos en Bs con la tasa BCV usada. El sistema no sustituye a la imprenta digital: guarda el número de control y la respuesta del proveedor (`providerData`).
- **Tasas**: la BCV es la oficial (libros y factura); la P2P solo para gestión. Histórico con quién y cuándo la cargó; aviso si cambia más de 20 % (posible error de tipeo).
- **Precios**: la tienda muestra USD y su equivalente en bolívares a la tasa del día.
- **Cédula / RIF**: validación con el dígito verificador del SENIAT (`src/lib/ve-ids.ts`). Teléfonos +58 (0412, 0414, 0416, 0422, 0424, 0426 y fijos).

## 5. Propuesta de componentes de interfaz

| Componente | Estado | Qué hace |
|---|---|---|
| `SiteHeader` | ✅ | Logo/nombre en serif, categorías, buscador, bolsa con contador, menú en celular, franja con la tasa del día |
| `SearchBox` | ✅ | Búsqueda en vivo con autocompletado (categorías y productos con foto y precio), teclado y Enter |
| Tarjetas de portada (`HeroCard`) | ✅ | Tarjetas verticales grandes con foto («Moda Mujer», «Calzado & Zapatos», «Colección Nueva»); en el celular se deslizan |
| `ProductCard` | ✅ | Foto 3:4 con segunda foto al pasar el mouse, puntos de color, tallas rápidas (agotadas tachadas), precio dual, etiquetas (Nuevo, −20 %, Envío gratis, Últimas unidades, Agotado) |
| `Price` | ✅ | USD principal + Bs a la tasa vigente + precio anterior tachado |
| `CatalogFilters` | ✅ | Categoría, talla, color, precio en USD o Bs, solo disponibles, orden; chips activos; panel lateral en celular |
| `ProductDetail` | ✅ | Galería por color, talla con disponibilidad, «¡Quedan 2!», cantidad, bolsa, preguntar por WhatsApp |
| `BagDrawer` | ✅ | Bolsa lateral; mientras llega el checkout, pedido por WhatsApp con detalle y totales en USD/Bs |
| `Markdown` | ✅ | Artículos del blog sin HTML crudo (seguro) |
| `ThemeForm` | ✅ | Paletas (Lavanda boutique, Blanco minimal, Nude, Rosa palo, Negro elegante, Oliva) con vista previa |
| `RateForm` | ✅ | Carga diaria de tasa BCV/P2P con confirmación de saltos grandes |
| Checkout + reporte de pago | Fase 2 | Datos con cédula, envío (MRW/Zoom/Tealca), métodos de pago con las cuentas, referencia y captura |
| Gestor de productos | Fase 2 | Fotos por color, matriz talla × color con stock, SKU automático |
| Ficha del cliente (CRM) | Fase 3 | Datos, historial, métricas, etiquetas, interacciones |
| Caja multimoneda | Fase 3 | Venta en tienda con pagos mixtos, cuentas y cierre por moneda |
| Factura / libro de ventas | Fase 4 | Emisión con número de control, notas de crédito, libro en Bs |
| Editor del blog | Fase 4 | Markdown con vista previa, portada, productos enlazados, SEO |

## 6. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Proyecto, esquema completo, seed de SF Boutique, tienda (portada, catálogo facetado, producto, bolsa, blog público), tasas BCV/P2P, apariencia, login | ✅ |
| 2 | Panel de productos y stock por variante + checkout web con reporte de pago y reserva de stock + pedidos | Siguiente |
| 3 | CRM de clientes + caja multimoneda con cuentas financieras y cierre por moneda | |
| 4 | Facturación venezolana (series, número de control, notas, libro de ventas) + CMS del blog y banners | |
| 5 | Publicación (GitHub, Neon, Vercel, dominio) y reportes de gestión USD/Bs | |
