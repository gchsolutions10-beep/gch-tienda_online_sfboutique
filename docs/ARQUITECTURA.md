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
- **IGTF**: 3 % sobre pagos en divisas o criptoactivos cuando le aplica al negocio (p. ej. contribuyentes especiales). Desactivado por defecto; se calcula por pago (ver sección 5c).
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

El **IGTF** de los pagos en divisas se calcula desde la fase 4 (sección 5c).

## 5b. Caja, cuentas y CRM (fase 3)

- **Cuentas de cobro** (`/admin/cuentas`, solo la dueña): Pago Móvil, bancos en Bs y USD, punto de venta, cajas de efectivo, Zelle y USDT. La moneda la define el tipo. Las marcadas «en la tienda en línea» son las que ve la clienta al pagar; avisa si quedan datos de ejemplo.
- **Turno de caja** (`/admin/caja`): se abre con el fondo en Bs y en USD. La venta en tienda busca por nombre, SKU o código de barras, aplica descuento (repartido entre las líneas antes del IVA) y acepta **pagos mixtos** en Bs, USD y USDT; cada pago queda en su moneda y cuenta, con sus equivalentes a tasa BCV. El stock se descuenta al momento.
- **Vuelto**: si sobra, se entrega en Bs o en USD y queda como salida de efectivo de esa caja; no se permite dar más vuelto del efectivo que hay.
- **Cierre**: por cada cuenta, esperado = fondo + cobros + entradas − salidas (efectivo) o cobros del turno (bancos y billeteras), contra lo contado; guarda la diferencia por cuenta y por moneda (`CashClosingLine`) y queda un reporte imprimible.
- **CRM** (`/admin/clientes`): segmentos automáticos calculados al vuelo (VIP, Recurrente, Nueva, Inactiva, según `TenantSettings`), etiquetas manuales, mayoristas, cumpleañeras del mes, búsqueda por nombre, teléfono, cédula, correo o Instagram, y exportación CSV (dueña y encargada). La ficha muestra métricas (total, ticket promedio, frecuencia, método favorito, tallas y colores que compra), historial de compras de la web y de la tienda, y el seguimiento (notas, WhatsApp, llamadas, visitas).

## 5c. Facturación, IGTF y contenido (fase 4)

> Todo lo fiscal se marca «validar con el contador». Referencias: Providencia SNAT/2011/0071 y Reglamento de la Ley del IVA.

**IGTF** (`src/lib/tax-ve.ts → splitIgtf`, `src/lib/cash.ts → tenderStatus`)
- Un pago en divisas (USD/USDT) **trae el IGTF incluido**: `Payment.igtfAmount` es el impuesto y `Payment.igtfBase` la parte que paga el pedido. Lo que abona al pedido es `amountUsd − igtfAmount`.
- El IGTF va solo sobre la parte del total que se paga en divisas; **el vuelto no lo lleva**. En caja, los pagos en Bs cubren primero.
- El pedido acumula `igtfUsd` e `igtfBaseUsd` (pagos confirmados). `totalUsd` sigue siendo la mercancía; lo cobrado es `totalUsd + igtfUsd`.
- La clienta y la caja ven el monto a pagar en divisas con el IGTF sumado (`amountDueIn(…, igtfRateBp)`).

**Facturación** (`src/lib/invoicing.ts`, `src/server/services/invoices.ts`, `/admin/facturacion`)
- Factura de un pedido **pagado** (web o tienda), una vigente por pedido. Montos en **Bs a la tasa BCV del día de emisión**; renglones copiados en `Invoice.lines` (JSON); el envío va como renglón no sujeto; IVA = base × alícuota en Bs; IGTF aparte, fuera de la base.
- **Número de control**: modo de la serie de facturas, compartido por las notas (un solo consecutivo). `DIGITAL_PRINTER`: se emite y luego se anota el número que devuelve la imprenta (no se puede cambiar una vez puesto). `FREE_FORM`: rango preimpreso (`controlPrefix`, `nextControl`, `controlTo`) que se toma con UPDATE atómico. `NONE`: sin validez fiscal (aviso en pantalla).
- **Notas de crédito** por renglón y cantidad (no devuelven más de lo facturado menos lo ya acreditado; no mueven stock; no acreditan IGTF). **Notas de débito**: concepto + base en Bs, gravada o exenta.
- **Anular**: solo la dueña, sin notas vigentes; con imprenta digital y número de control, se corrige con nota de crédito.
- **Libro de ventas** (`/admin/facturacion/libro`, CSV): orden de emisión, notas de crédito con signo negativo, anulados en cero (tipo de transacción 03), IGTF en su columna. Lo ven dueña y encargada.
- **Configuración** (solo la dueña): razón social, RIF (con dígito verificador), domicilio fiscal, IVA, IGTF y numeración.
- Prueba de punta a punta: `npx tsx tests/integration/facturacion.ts` (solo contra base local).

**Contenido** (`src/lib/blog.ts`, `src/server/actions/admin/content.ts`)
- **Blog** (`/admin/blog`): editor Markdown con barra de formato y vista previa, fotos dentro del artículo (`![descripción](/marca/blog-<id>i<hex>)`), portada, categorías, etiquetas, «Consigue este look», SEO con vista de Google. **Programado = PUBLISHED con fecha futura**: la tienda solo muestra lo que ya llegó a su fecha, sin tareas programadas.
- **Portada** (`/admin/portada`): tarjetas verticales (máx. 4 activas) y banners con fechas desde/hasta (días completos en hora de Caracas). Los banners se muestran en el inicio de la tienda.
- Roles: dueña y `EDITOR` (contenido). Enlaces solo internos (`/…`) o `https://`.

## 5d. Reportes y dominio propio (fase 5)

- **Reportes** (`/admin/reportes`, `src/lib/reports.ts`, `src/server/queries/reports.ts`): periodos en hora de Caracas (hoy, 7 y 30 días, este mes, mes pasado, rango), comparación con el periodo anterior, ventas por día, canal y método de pago (moneda original + USD), utilidad bruta sobre la venta sin IVA (con el **costo actual** del producto; las prendas sin costo se excluyen y se avisa), lo más vendido por producto, categoría, talla y color, clientas nuevas vs. recurrentes, IVA/IGTF/descuentos, e inventario (valor a costo y a precio, prendas sin venta en 60 días).
- **Valor real de lo cobrado en Bs**: cada pago en Bs se valora a la tasa BCV y a la P2P vigentes en su fecha (historial de `ExchangeRate`); la diferencia es la pérdida o ganancia cambiaria.
- Ventas = pedidos con `paidAt` en el periodo y no anulados. Exportación CSV por prenda (`/admin/reportes/exportar`); costo y utilidad solo para la dueña. La encargada ve ventas sin costos.
- **Dominio propio** (Apariencia): registra el dominio con y sin www en `TenantDomain` (`parseCustomDomain`, `domainPair`); luego se agrega en Vercel y en el DNS (ver `docs/DESPLIEGUE.md`).

## 5e. Credi-SF (crédito), cuentas de clientas y PWA (fase 6)

> Lo legal (contrato, recargo, fianza) se marca «validar con un abogado venezolano».

- **Cuentas de clientas** (solo para crédito; de contado no hace falta): `Customer.passwordHash`, sesión propia `CustomerSession` con cookie `gch_clienta` (`src/server/auth/customer-session.ts`), páginas `/mi-cuenta`. Si el teléfono ya existe en el CRM con otra cédula, no se le pisan los datos. La tienda confirma el teléfono al aprobar (`phoneVerifiedAt`).
- **Solicitud** (`/credito/solicitud`, `CreditApplication`): dirección con pin de OpenStreetMap/Leaflet (latitud/longitud obligatorias), fotos de las cédulas de la compradora y del fiador como `TenantAsset` PRIVADOS (`credito-<id>-compradora|fiador`, solo dueña/encargada en `/admin/credito/cedula/…`). Se guardan la versión del contrato (`src/lib/credit-contract.ts`), el **SHA-256 del texto exacto**, fecha, IP y dispositivo.
- **Fiador**: acepta él mismo en `/credito/fiador/<token>` confirmando su cédula (WAITING_GUARANTOR → IN_REVIEW). Sin eso no se puede aprobar.
- **Niveles** (`src/lib/credit.ts`): 1 = 60 % + 2×20 %; 2 = 50 % + 3 cuotas; 3 = 40 % + 4 cuotas; cuotas cada 15 días, vencen al final del día en Caracas. Ascenso automático (nunca baja sola) tras `creditUpgradeAfter`/`creditVipAfter` créditos pagados sin mora; nivel fijo a mano (`creditLevelManual`); la mora (recargo aplicado en los últimos 6 meses o cuota en mora) lo deja en Nivel 1 aunque esté fijado. Límite financiado por nivel y un crédito abierto a la vez (configurables).
- **Pedido a crédito**: `Order.isCredit` + `CreditPlan` + `CreditInstallment`. Con la **inicial** el pedido pasa a Pagado y se descuenta el stock; lo pagado (neto de IGTF) se reparte en orden: inicial → cuotas con su recargo (`allocatePayments`, `syncCreditPlan`). El pedido debe `totalUsd + recargos`. Se pueden reportar y registrar pagos de cuotas después de entregado. Anular el pedido (o que venza el apartado) anula el plan.
- **Mora y cobranza**: tarea diaria `GET /api/cron/credito` (Vercel Cron 13:00 UTC = 9 a. m. Caracas, `CRON_SECRET`): recargo fijo (`creditLateFeeUsd`) desde el día `creditGraceDays + 1`, una sola vez por cuota; marca `wentLate`; reevalúa el nivel; recordatorios push 2 días antes, el día y al 3.er día de retraso (idempotente: `remindedBeforeAt/DueAt/LateAt`). Panel `/admin/credito` (cobranza con WhatsApp, solicitudes, configuración) y sección Credi-SF en la ficha del CRM.
- **PWA**: manifest por negocio en `/manifest`, íconos con la marca en `/icono/<96|180|192|512>` (`?maskable=1`), `public/sw.js` (red primero en páginas públicas con aviso sin conexión; caché de `/_next/static` y `/marca`; nunca guarda panel, cuenta, checkout ni pedidos). Push estándar Web Push con VAPID (`web-push`; sin Firebase): `PushSubscription` por clienta; `sendPushToCustomer` borra las suscripciones vencidas (404/410). En iPhone los avisos requieren instalar la app (iOS 16.4+).
- Pruebas: `tests/unit/credit.test.ts` y de punta a punta `npx tsx tests/integration/credito.ts` (base local).

## 5f. Módulos e Importaciones por encargo (fase 7)

- **Módulos** (`/admin/modulos`, solo la dueña): `TenantSettings.importsEnabled` y `creditEnabled` (`getModules` en `src/server/queries/modules.ts`). Apagado: se ocultan los enlaces de la cabecera, el pie, «Mi cuenta» y el pago; las páginas muestran `ModuleOff` («Sección no disponible») y las acciones del servidor lo rechazan. En el panel el menú marca «apagado» y la página muestra un aviso. Los datos no se borran. Las cuentas de clientas existen si hay al menos un módulo encendido.
- **Cabecera**: los nombres nunca se parten (`whitespace-nowrap`); se muestran las categorías que caben según el ancho (2 en `lg`, 4 en `xl`, 6 en `2xl`) y el resto, el blog, Importaciones y Credi-SF van en «Más ▾».
- **Lotes** (`ImportBatch`): DRAFT → OPEN (recibe pedidos entre `opensAt` y `closesAt`, días de Caracas) → IN_PROCESS (los pedidos con adelanto pasan a PREPARING) → DELIVERED (historial público y reseñas). También CANCELLED.
- **Encargos** (`ImportRequest`): la clienta (con cuenta) pega el enlace (`parseProductLink`: http/https, reconoce SHEIN, AliExpress, Alibaba, 1688, Temu, Amazon, eBay, Walmart), foto opcional PRIVADA (`TenantAsset` `encargo-<id>`, servida en `/admin/importaciones/foto/<key>`), talla, color, cantidad, notas, **privado/discreto** y acepta el descargo (`IMPORT_DISCLAIMER`). PENDING_REVIEW → QUOTED → ACCEPTED, o REJECTED/CANCELLED.
- **Cotización** (`quoteFor` en `src/lib/imports.ts`): productos + flete (reembolso de gastos, exentos) + comisión de la tienda (servicio, gravada con IVA según la configuración); adelanto = `importDepositPct` (50 %); comisión sugerida `importCommissionPct` (15 %) sobre productos + flete. VALIDAR CON EL CONTADOR el tratamiento fiscal.
- **Aceptar** crea un `Order` normal (`isImport`, `importDepositUsd`, retiro en tienda, sin reserva que venza) con 2 renglones (encargo exento + servicio de gestión). Con el adelanto confirmado `settle` lo pasa a PAID (pago PARTIAL); se siguen aceptando pagos hasta completar el saldo; no se puede marcar DELIVERED sin el pago completo. Al pasar a READY se avisa por push («¡Llegó tu encargo!»).
- **Galería grupal** (`ImportProduct`): la tienda publica un encargo no privado (copia la foto a la imagen pública `importacion-<id>`); otras clientas se suman con «Unirme al pedido» (crea su propio `ImportRequest` con `productId`) y se muestra el contador de personas distintas (`groupCount`). El enlace exacto solo lo ve el personal.
- **Reseñas** (`ImportReview`): solo en lotes DELIVERED y solo clientas con un pedido entregado de ese lote; la tienda las aprueba antes de publicarlas.
- Pantallas: tienda `/importaciones`, `/importaciones/encargar`, «Mis encargos» en `/mi-cuenta#encargos`; panel `/admin/importaciones` (bandeja, lotes, galería, reseñas, configuración) y `/admin/importaciones/<id>` (cotizador en vivo USD/Bs, rechazar, publicar, nota interna).
- Pruebas: `tests/unit/imports.test.ts` y de punta a punta `npx tsx tests/integration/importaciones.ts` (base local).

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
| Factura / libro de ventas | ✅ | Emisión con número de control, notas de crédito y débito, anular, libro en Bs con CSV, configuración fiscal |
| Editor del blog | ✅ | Markdown con vista previa, fotos, portada, productos enlazados, SEO, programar |
| Portada y banners | ✅ | Tarjetas de portada y banners con fechas, con fotos y orden |

## 7. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Proyecto, esquema completo, seed de SF Boutique, tienda (portada, catálogo facetado, producto, bolsa, blog público), tasas BCV/P2P, apariencia, login | ✅ |
| 2 | Panel de productos y stock por variante + checkout web con reporte de pago y reserva de stock + pedidos + envíos | ✅ |
| 3 | CRM de clientes + cuentas de cobro editables + caja multimoneda con cierre por moneda | ✅ |
| 4 | Facturación venezolana (series, número de control, notas, libro de ventas, IGTF) + CMS del blog y banners | ✅ |
| 5 | Reportes de gestión USD/Bs (ventas, márgenes, P2P vs BCV) y dominio propio | ✅ |
| 6 | Credi-SF (crédito con fiador, niveles, cobranza y mora), cuentas de clientas, PWA instalable y avisos push | ✅ |
| 7 | Módulos encendibles (Importaciones, Crédito), Importaciones por encargo (lotes, cotizador, galería grupal, reseñas) y cabecera sin cortes | ✅ |
