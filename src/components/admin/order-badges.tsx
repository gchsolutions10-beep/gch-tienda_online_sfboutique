import { ORDER_STATUS, type OrderStatus } from "@/lib/orders";
import { cn } from "@/components/ui/styles";

const TONE = {
  warn: "bg-amber-100 text-amber-900",
  info: "bg-sky-100 text-sky-900",
  ok: "bg-emerald-100 text-emerald-900",
  done: "bg-cream text-muted",
  off: "bg-red-100 text-red-900",
} as const;

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const s = ORDER_STATUS[status];
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[s.tone], className)}>{s.label}</span>;
}

const PAYMENT = {
  UNPAID: ["Sin pagar", "text-muted"],
  PARTIAL: ["Pago parcial", "text-amber-800"],
  PAID: ["Pagado", "text-ok"],
  REFUNDED: ["Reembolsado", "text-muted"],
} as const;

export function PaymentStatusText({ status }: { status: keyof typeof PAYMENT }) {
  return <span className={cn("text-xs font-semibold", PAYMENT[status][1])}>{PAYMENT[status][0]}</span>;
}
