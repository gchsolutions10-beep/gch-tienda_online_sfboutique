/**
 * Reglas puras de los pedidos: estados, entrega, totales y SKU.
 * Sin BD ni Next, para poder probarlas.
 */
import { computeTaxes, type TaxSettings } from "@/lib/tax-ve";
import { usdToVesCents, vesToUsdCents, type Currency } from "@/lib/money";

export type OrderStatus = "PENDING" | "PAYMENT_REVIEW" | "PAID" | "PREPARING" | "READY" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type Fulfillment = "PICKUP" | "LOCAL_DELIVERY" | "NATIONAL_SHIPPING";

export const ORDER_STATUS: Record<OrderStatus, { label: string; customer: string; tone: "warn" | "info" | "ok" | "done" | "off" }> = {
  PENDING: { label: "Esperando pago", customer: "Esperamos tu pago", tone: "warn" },
  PAYMENT_REVIEW: { label: "Pago por verificar", customer: "Estamos verificando tu pago", tone: "warn" },
  PAID: { label: "Pagado", customer: "¡Pago confirmado!", tone: "info" },
  PREPARING: { label: "Preparando", customer: "Estamos preparando tu pedido", tone: "info" },
  READY: { label: "Listo para entregar", customer: "Tu pedido está listo", tone: "ok" },
  SHIPPED: { label: "Enviado", customer: "Tu pedido va en camino", tone: "ok" },
  DELIVERED: { label: "Entregado", customer: "Entregado. ¡Gracias por tu compra!", tone: "done" },
  CANCELLED: { label: "Anulado", customer: "Pedido anulado", tone: "off" },
};

export const FULFILLMENT: Record<Fulfillment, { label: string; icon: string }> = {
  PICKUP: { label: "Retiro en tienda", icon: "🛍️" },
  LOCAL_DELIVERY: { label: "Delivery en la ciudad", icon: "🛵" },
  NATIONAL_SHIPPING: { label: "Envío nacional", icon: "📦" },
};

/** Empresas de encomienda más usadas en Venezuela. */
export const CARRIERS = ["MRW", "Zoom", "Tealca", "Domesa", "Liberty Express"] as const;

/** Estados de Venezuela (y el Distrito Capital) para el envío. */
export const VE_STATES = [
  "Amazonas", "Anzoátegui", "Apure", "Aragua", "Barinas", "Bolívar", "Carabobo", "Cojedes", "Delta Amacuro",
  "Distrito Capital", "Falcón", "Guárico", "La Guaira", "Lara", "Mérida", "Miranda", "Monagas", "Nueva Esparta",
  "Portuguesa", "Sucre", "Táchira", "Trujillo", "Yaracuy", "Zulia",
] as const;

/** Estados en los que aún se puede anular sin devolver mercancía al stock (no se descontó). */
export const UNPAID_STATUSES: OrderStatus[] = ["PENDING", "PAYMENT_REVIEW"];

/**
 * Siguiente paso del pedido según el tipo de entrega (lo que ve el personal).
 * Pagado → Preparando → Listo (retiro/delivery) o Enviado (nacional) → Entregado.
 */
export function nextStatus(status: OrderStatus, fulfillment: Fulfillment): OrderStatus | null {
  switch (status) {
    case "PAID":
      return "PREPARING";
    case "PREPARING":
      return fulfillment === "NATIONAL_SHIPPING" ? "SHIPPED" : "READY";
    case "READY":
    case "SHIPPED":
      return "DELIVERED";
    default:
      return null;
  }
}

export const NEXT_ACTION: Partial<Record<OrderStatus, string>> = {
  PREPARING: "Empezar a preparar",
  READY: "Marcar listo",
  SHIPPED: "Marcar enviado",
  DELIVERED: "Marcar entregado",
};

/** Línea del timeline que ve la clienta en el seguimiento. */
export function customerSteps(status: OrderStatus, fulfillment: Fulfillment): { key: OrderStatus; label: string; done: boolean }[] {
  const flow: OrderStatus[] = ["PENDING", "PAID", "PREPARING", fulfillment === "NATIONAL_SHIPPING" ? "SHIPPED" : "READY", "DELIVERED"];
  const labels: Partial<Record<OrderStatus, string>> = {
    PENDING: "Pedido recibido",
    PAID: "Pago confirmado",
    PREPARING: "Preparando",
    READY: fulfillment === "LOCAL_DELIVERY" ? "Sale a delivery" : "Listo para retirar",
    SHIPPED: "Enviado",
    DELIVERED: "Entregado",
  };
  const position = status === "PAYMENT_REVIEW" ? 0 : flow.indexOf(status);
  return flow.map((key, i) => ({ key, label: labels[key]!, done: i <= position }));
}

export type DeliverySettings = {
  pickupEnabled: boolean;
  localDeliveryEnabled: boolean;
  localDeliveryCents: number | null;
  nationalShippingEnabled: boolean;
  /** null = cobro a destino */
  nationalShippingCents: number | null;
  freeShippingFromCents: number | null;
};

export type ShippingQuote = { available: boolean; cents: number; payAtDestination: boolean; free: boolean };

/** Costo del envío. El envío gratis aplica a delivery y envío nacional con tarifa (no a cobro a destino). */
export function shippingFor(f: Fulfillment, subtotalCents: number, allFreeShipping: boolean, s: DeliverySettings): ShippingQuote {
  if (f === "PICKUP") return { available: s.pickupEnabled, cents: 0, payAtDestination: false, free: false };
  const enabled = f === "LOCAL_DELIVERY" ? s.localDeliveryEnabled : s.nationalShippingEnabled;
  const price = f === "LOCAL_DELIVERY" ? (s.localDeliveryCents ?? 0) : s.nationalShippingCents;
  if (price === null) return { available: enabled, cents: 0, payAtDestination: true, free: false };
  const free = allFreeShipping || (s.freeShippingFromCents !== null && subtotalCents >= s.freeShippingFromCents);
  return { available: enabled, cents: free ? 0 : price, payAtDestination: false, free: free && price > 0 };
}

export type PricingLine = { unitPriceCents: number; quantity: number; ivaExempt: boolean; discountCents?: number };

/** Totales del pedido en USD (centavos) y su equivalente en Bs a la tasa BCV. El envío no lleva IVA. */
export function priceOrder(lines: PricingLine[], tax: TaxSettings, shippingCents: number, bcvRate: number) {
  const taxes = computeTaxes(
    lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity, exempt: l.ivaExempt, discountCents: l.discountCents ?? 0 })),
    tax,
  );
  const subtotalCents = lines.reduce((a, l) => a + l.unitPriceCents * l.quantity, 0);
  const discountCents = lines.reduce((a, l) => a + (l.discountCents ?? 0), 0);
  const totalCents = taxes.totalCents + shippingCents;
  return {
    lines: taxes.lines,
    subtotalCents,
    discountCents,
    taxableCents: taxes.taxableCents,
    exemptCents: taxes.exemptCents,
    ivaCents: taxes.ivaCents,
    shippingCents,
    totalCents,
    totalVesCents: usdToVesCents(totalCents, bcvRate),
  };
}

/** Monto sugerido para pagar lo que falta (en la moneda del método), a la tasa BCV del pedido. */
export function amountDueIn(currency: Currency, remainingUsdCents: number, bcvRate: number): number {
  return currency === "VES" ? usdToVesCents(remainingUsdCents, bcvRate) : remainingUsdCents;
}

/** Pagos que cubren el total (con 1 centavo de tolerancia por redondeo de la conversión). */
export function isFullyPaid(totalUsdCents: number, paidUsdCents: number): boolean {
  return paidUsdCents >= totalUsdCents - 1;
}

/** Equivalente en USD de un monto en Bs a la tasa del pedido. */
export const vesToUsd = (vesCents: number, rate: number) => vesToUsdCents(vesCents, rate);

const skuPart = (s: string, max: number) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, max);

/** SKU automático: VESTIDOMIDI-LILA-M (producto + color + talla). */
export function skuFor(productName: string, colorName: string | null, sizeLabel: string | null): string {
  const words = productName.split(/\s+/).filter((w) => w.length > 2);
  const base = skuPart(words.slice(0, 2).join("") || productName, 12) || "PROD";
  return [base, colorName && skuPart(colorName, 6), sizeLabel && skuPart(sizeLabel, 4)].filter(Boolean).join("-");
}

/** Tiempo restante de la reserva en texto ("23 h 10 min", "8 min"). */
export function timeLeft(until: Date, now = new Date()): string | null {
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) return null;
  const min = Math.ceil(ms / 60_000);
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}
