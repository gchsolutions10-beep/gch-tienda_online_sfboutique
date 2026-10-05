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
    (store)/             # tienda: portada, catálogo, producto, blog, checkout, seguimiento del pedido
    admin/               # panel: resumen, pedidos, productos, caja, clientes, tasas, cuentas, entregas, apariencia
    login/               # acceso del personal
  components/
    store/               # tarjeta de moda, precio dual, filtros, bolsa, buscador, cabecera
    admin/               # menú, formulario de tasas, gestor de colores
  lib/                   # money, tax-ve, ve-ids, payments, rates, catalog, orders, variants, crm, cash, theme, color
  server/
    auth/  db.ts  tenant.ts
    queries/             # tienda (tasas, portada, catálogo facetado, producto) y edición de productos
    services/orders.ts   # pedido web con reserva, pagos, estados, anulación
    services/cash.ts     # turnos de caja, venta en tienda con pagos mixtos y vuelto, cierre
    actions/             # login, búsqueda, checkout, pedidos, productos, tasas, entregas, apariencia
tests/unit/              # venezuela, catalog, orders (y matriz de variantes), cash, theme
```

## 3. Modelo de datos (resumen)

| Módulo | Modelos |
|---|---|
| Plataforma | `Tenant` (RIF, razón social, paleta), `TenantDomain`, `TenantSettings` (IVA, IGTF, tasa a mostrar, entregas, reserva, contador de pedidos, reglas del CRM), `Branch`, `User`, `Membership`, `Session`, `RateLimit`, `TenantAsset`, `AuditLog` |
| Tasas | `ExchangeRate` (BCV / P2P, histórico; la vigente es la más reciente que ya rige) |
| Catálogo | `Category` (con subcategorías), `Size` (S–XL, 35–41, Única), `Color` (con muestra), `Brand`, `Product` (precio USD, costo, exento de IVA, etiqueta, SEO), `ProductImage` (vertical 3:4, por color; la 2.ª es la del hover), `ProductVariant` (talla + color, SKU, **stock y apartado por variante**), `StockMovement` |
| CRM | `Customer` (cédula/RIF, WhatsApp, origen, notas internas, mayorista, métricas acumuladas en USD y Bs, método favorito), `CustomerAddress` (con oficina de encomienda), `CustomerTag` (+ automáticas VIP / Recurrente / Nuevo / Inactivo), `CustomerInteraction` |
| Pedidos | `Order` (número correlativo, canal, entrega: retiro / delivery / envío nacional, totales en USD, tasa BCV y total en Bs, IGTF, reserva), `OrderItem` (copia de talla, color, SKU e IVA de la línea), `OrderEvent` (historial) |
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

## 5. Pedidos web y stock (fase 2)

1. **Checkout** (`/checkout`): el servidor recalcula precios, stock, envío, IVA y el total en Bs a la tasa BCV (la bolsa del navegador es solo orientativa).
2. **Reserva**: al confirmar, cada variante se aparta (`reserved`) con un UPDATE condicional (`stock - reserved >= cantidad`), así dos clientas no pueden llevarse la última unidad. El pedido guarda `reservedUntil` (24 h por defecto).
3. **Pago**: la clienta reporta el pago desde `/pedido/<token>` (enlace privado) → *Pago por verificar*. El personal lo confirma al verlo en la cuenta; con el total cubierto, el pedido pasa a *Pagado* y **recién ahí se descuenta el stock** (movimiento `SALE`) y se actualizan las métricas de la clienta.
4. **Vencimiento**: un pedido *Esperando pago* con la reserva vencida se anula solo y libera el stock (se revisa al abrir el checkout, el seguimiento y la lista de pedidos; no necesita tareas programadas).
5. **Estados**: Pagado → Preparando → Listo (retiro/delivery) o Enviado con número de guía (nacional) → Entregado. Cada paso queda en el historial (`OrderEvent`).
6. **Anular**: sin pago libera lo apartado; pagado devuelve la mercancía al stock (`RETURN`) y el reembolso se hace aparte.
7. **Stock en el panel**: los cambios de la matriz se guardan como **diferencias** sobre el stock actual (no pisan ventas hechas mientras se editaba) y cada uno deja un movimiento con su motivo (compra, conteo, daño).

Pendiente: el **IGTF** de los pagos en divisas se calcula con la facturación (fase 4).

## 5b. Caja, cuentas y CRM (fase 3)

- **Cuentas de cobro** (`/admin/cuentas`, solo la dueña): Pago Móvil, bancos en Bs y USD, punto de venta, cajas de efectivo, Zelle y USDT. La moneda la define el tipo. Las marcadas «en la tienda en línea» son las que ve la clienta al pagar; avisa si quedan datos de ejemplo.
- **Turno de caja** (`/admin/caja`): se abre con el fondo en Bs y en USD. La venta en tienda busca por nombre, SKU o código de barras, aplica descuento (repartido entre las líneas antes del IVA) y acepta **pagos mixtos** en Bs, USD y USDT; cada pago queda en su moneda y cuenta, con sus equivalentes a tasa BCV. El stock se descuenta al momento.
- **Vuelto**: si sobra, se entrega en Bs o en USD y queda como salida de efectivo de esa caja; no se permite dar más vuelto del efectivo que hay.
- **Cierre**: por cada cuenta, esperado = fondo + cobros + entradas − salidas (efectivo) o cobros del turno (bancos y billeteras), contra lo contado; guarda la diferencia por cuenta y por moneda (`CashClosingLine`) y queda un reporte imprimible.
- **CRM** (`/admin/clientes`): segmentos automáticos calculados al vuelo (VIP, Recurrente, Nueva, Inactiva, según `TenantSettings`), etiquetas manuales, mayoristas, cumpleañeras del mes, búsqueda por nombre, teléfono, cédula, correo o Instagram, y exportación CSV (dueña y encargada). La ficha muestra métricas (total, ticket promedio, frecuencia, método favorito, tallas y colores que compra), historial de compras de la web y de la tienda, y el seguimiento (notas, WhatsApp, llamadas, visitas).

## 6. Propuesta de componentes de interfaz

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
| `CheckoutForm` | ✅ | Datos con cédula/RIF y WhatsApp validados, retiro / delivery / envío nacional (MRW, Zoom, Tealca…), totales reales del servidor en USD y Bs, aviso si algo se agotó |
| `PaymentReport` | ✅ | Seguimiento del pedido: método de pago, datos de la cuenta con botón copiar, monto en Bs a la tasa del día, referencia, banco y captura del comprobante |
| Pedidos (panel) | ✅ | Pestañas por tarea (pagos por verificar, por preparar, por entregar…), confirmar/rechazar pagos con el comprobante, registrar pagos, avanzar estados con número de guía, anular, historial |
| `ProductForm` | ✅ | Datos, precio con margen, matriz talla × color con stock por celda (+/− visibles y motivo del cambio), SKU automático, nuevos colores y tallas al vuelo |
| `ProductImages` | ✅ | Fotos verticales por color, orden (principal y hover), reducción en el navegador |
| Envíos y entregas | ✅ | Retiro, delivery con costo y zona, envío nacional con costo o cobro a destino, envío gratis desde, horas de reserva |
| Ficha del cliente (CRM) | ✅ | Datos, historial, métricas, segmentos y etiquetas, seguimiento, exportación CSV |
| Caja multimoneda | ✅ | Venta en tienda con descuento, pagos mixtos, vuelto, entradas/salidas y cierre por cuenta y moneda |
| Cuentas de cobro | ✅ | Alta y edición de las cuentas por tipo, visibles o no en la tienda en línea |
| Factura / libro de ventas | Fase 4 | Emisión con número de control, notas de crédito, libro en Bs |
| Editor del blog | Fase 4 | Markdown con vista previa, portada, productos enlazados, SEO |

## 7. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Proyecto, esquema completo, seed de SF Boutique, tienda (portada, catálogo facetado, producto, bolsa, blog público), tasas BCV/P2P, apariencia, login | ✅ |
| 2 | Panel de productos y stock por variante + checkout web con reporte de pago y reserva de stock + pedidos + envíos | ✅ |
| 3 | CRM de clientes + cuentas de cobro editables + caja multimoneda con cierre por moneda | ✅ |
| 4 | Facturación venezolana (series, número de control, notas, libro de ventas, IGTF) + CMS del blog y banners | Siguiente |
| 5 | Publicación (GitHub, Neon, Vercel, dominio) y reportes de gestión USD/Bs | |
