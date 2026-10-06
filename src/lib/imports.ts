/**
 * Importaciones por encargo (puro, sin BD). Montos en centavos de USD.
 * La tienda presta un servicio de gestión de compra e importación por comisión.
 */
import { computeTaxes, type TaxSettings } from "@/lib/tax-ve";

/** Texto del descargo de responsabilidad (visible y aceptado al encargar). */
export const IMPORT_DISCLAIMER = (store: string) =>
  `${store} presta un servicio de gestión de compra e importación por comisión. No somos fabricantes ni poseemos stock propio de estos productos. No nos hacemos responsables por defectos de fábrica de origen ni realizamos cambios de talla. Nuestro servicio abarca la compra, logística, flete y entrega final.`;

/** Lo que la tienda no gestiona (se rechaza en la revisión). */
export const NOT_ACCEPTED = ["Electrodomésticos y televisores", "Celulares y equipos electrónicos de alto valor", "Medicinas, suplementos y cosméticos sin registro", "Armas, réplicas o artículos prohibidos por la ley", "Productos falsificados de marcas registradas"];

const STORES: [RegExp, string][] = [
  [/(^|\.)shein\.(com|co|net)/, "SHEIN"],
  [/(^|\.)aliexpress\./, "AliExpress"],
  [/(^|\.)alibaba\.com$/, "Alibaba"],
  [/(^|\.)1688\.com$/, "1688"],
  [/(^|\.)temu\.com$/, "Temu"],
  [/(^|\.)amazon\./, "Amazon"],
  [/(^|\.)ebay\./, "eBay"],
  [/(^|\.)walmart\.com$/, "Walmart"],
];

/** Valida el enlace (http/https con dominio) y dice de qué tienda es. */
export function parseProductLink(input: string): { url: string; store: string } | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!/\.[a-z]{2,}$/i.test(u.hostname) || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const store = STORES.find(([re]) => re.test(host))?.[1] ?? "Otra tienda";
  return { url: u.toString().slice(0, 1000), store };
}

export type QuoteInput = {
  /** Costo de una unidad en la tienda de origen */
  unitCostCents: number;
  quantity: number;
  /** Flete y gastos de envío hasta la entrega */
  freightCents: number;
  /** Comisión de la tienda (monto fijo, ya calculado) */
  commissionCents: number;
};

export type Quote = {
  productsCents: number;
  freightCents: number;
  commissionCents: number;
  /** IVA de la comisión (si el negocio cobra IVA y los precios no lo incluyen) */
  ivaCents: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
};

/**
 * Cotización: productos + flete (reembolso de gastos, sin IVA) + comisión de
 * la tienda (servicio, con IVA según la configuración). VALIDAR CON EL CONTADOR.
 */
export function quoteFor(q: QuoteInput, tax: TaxSettings, depositPct: number): Quote {
  const productsCents = q.unitCostCents * q.quantity;
  const t = computeTaxes(
    [
      { unitPriceCents: productsCents + q.freightCents, quantity: 1, exempt: true },
      { unitPriceCents: q.commissionCents, quantity: 1, exempt: false },
    ],
    tax,
  );
  const depositCents = Math.round((t.totalCents * Math.min(100, Math.max(0, depositPct))) / 100);
  return {
    productsCents,
    freightCents: q.freightCents,
    commissionCents: q.commissionCents,
    ivaCents: tax.taxMode === "TAX_ADDED" ? t.ivaCents : 0,
    totalCents: t.totalCents,
    depositCents,
    balanceCents: t.totalCents - depositCents,
  };
}

/** Comisión sugerida: % sobre productos + flete. */
export const suggestedCommission = (productsCents: number, freightCents: number, pct: number) => Math.round(((productsCents + freightCents) * pct) / 100);

export type BatchStatus = "DRAFT" | "OPEN" | "IN_PROCESS" | "DELIVERED" | "CANCELLED";

export const BATCH_STATUS: Record<BatchStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Borrador", tone: "bg-cream text-muted" },
  OPEN: { label: "Abierto · recibiendo pedidos", tone: "bg-emerald-100 text-emerald-900" },
  IN_PROCESS: { label: "En proceso · comprado / en tránsito", tone: "bg-amber-100 text-amber-900" },
  DELIVERED: { label: "Entregado", tone: "bg-brand-soft text-brand-strong" },
  CANCELLED: { label: "Cancelado", tone: "bg-cream text-muted" },
};

/** ¿El lote recibe pedidos ahora? Abierto y dentro de sus fechas (cierra al final del día). */
export function acceptingOrders(b: { status: BatchStatus; opensAt: Date; closesAt: Date }, now = new Date()): boolean {
  return b.status === "OPEN" && b.opensAt.getTime() <= now.getTime() && now.getTime() <= b.closesAt.getTime();
}

export type RequestStatus = "PENDING_REVIEW" | "REJECTED" | "QUOTED" | "ACCEPTED" | "CANCELLED";
export type OrderStatusLite = "PENDING" | "PAYMENT_REVIEW" | "PAID" | "PREPARING" | "READY" | "SHIPPED" | "DELIVERED" | "CANCELLED";

/**
 * Paso del encargo que ve la clienta. Después de aceptar la cotización, el
 * avance sale del pedido: adelanto → comprado/en tránsito → llegó → entregado.
 */
export function requestStep(status: RequestStatus, order: { status: OrderStatusLite; paymentStatus: "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED" } | null): { label: string; tone: "warn" | "info" | "ok" | "done" | "off" } {
  switch (status) {
    case "PENDING_REVIEW":
      return { label: "En revisión: te enviaremos la cotización", tone: "info" };
    case "REJECTED":
      return { label: "No aprobado", tone: "off" };
    case "QUOTED":
      return { label: "Cotización lista: acéptala para continuar", tone: "warn" };
    case "CANCELLED":
      return { label: "Cancelado", tone: "off" };
  }
  if (!order || order.status === "CANCELLED") return { label: "Cancelado", tone: "off" };
  if (order.status === "PENDING" || order.status === "PAYMENT_REVIEW") return { label: order.status === "PENDING" ? "Paga el adelanto para procesarlo" : "Verificando tu adelanto", tone: "warn" };
  if (order.status === "PAID") return { label: "Adelanto recibido: se compra con el lote", tone: "info" };
  if (order.status === "PREPARING" || order.status === "SHIPPED") return { label: "Comprado · en tránsito", tone: "info" };
  if (order.status === "READY") return { label: order.paymentStatus === "PAID" ? "¡Llegó! Listo para entregar" : "¡Llegó! Paga el saldo para retirarlo", tone: "ok" };
  return { label: "Entregado", tone: "done" };
}

/** Cuántas personas distintas pidieron un producto publicado (sin rechazados ni cancelados). */
export function groupCount(requests: { customerId: string; status: RequestStatus; quantity: number }[]) {
  const active = requests.filter((r) => r.status !== "REJECTED" && r.status !== "CANCELLED");
  return { people: new Set(active.map((r) => r.customerId)).size, units: active.reduce((a, r) => a + r.quantity, 0) };
}

/** Promedio de estrellas (1 decimal) o null. */
export function averageRating(ratings: number[]): number | null {
  return ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
}
