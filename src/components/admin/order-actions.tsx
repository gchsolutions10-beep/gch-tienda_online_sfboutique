"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { advanceOrderAction, cancelOrderAction, registerPaymentAction, reviewPaymentAction, saveInternalNote } from "@/server/actions/admin/orders";
import { amountDueIn, type OrderStatus } from "@/lib/orders";
import { formatMoney, type Currency } from "@/lib/money";
import type { FinancialAccountType, PaymentMethod } from "@/lib/payments";
import { buttonGhost, buttonPrimary, buttonSecondary, card, cn, inputClass, labelClass } from "@/components/ui/styles";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, feedback, run };
}

function Feedback({ value }: { value: { ok: boolean; text: string } | null }) {
  if (!value) return null;
  return (
    <p role={value.ok ? "status" : "alert"} className={cn("rounded-lg p-2 text-sm font-medium", value.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-danger")}>
      {value.text}
    </p>
  );
}

/** Confirmar o rechazar un pago reportado por la clienta. */
export function PaymentReview({ paymentId }: { paymentId: string }) {
  const { pending, feedback, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
      {rejecting ? (
        <>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo (no llegó, monto distinto…)" className={cn(inputClass, "max-w-xs")} />
          <button type="button" disabled={pending} onClick={() => run(() => reviewPaymentAction(paymentId, false, note))} className={cn(buttonSecondary, "border-danger text-danger")}>
            Rechazar
          </button>
          <button type="button" onClick={() => setRejecting(false)} className={buttonGhost}>
            Volver
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setRejecting(true)} className={buttonSecondary}>
            No llegó
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => reviewPaymentAction(paymentId, true, ""))} className={cn(buttonPrimary, "bg-ok")}>
            {pending ? "Guardando…" : "✓ Confirmar: llegó a la cuenta"}
          </button>
        </>
      )}
      <div className="w-full">
        <Feedback value={feedback} />
      </div>
    </div>
  );
}

type Account = { id: string; name: string; type: FinancialAccountType; currency: Currency };
type MethodInfo = { method: PaymentMethod; label: string; currency: Currency; accountTypes: FinancialAccountType[] };

/** Siguiente paso, registrar un pago, nota interna y anular. */
export function OrderActions({
  orderId,
  status,
  next,
  carrier,
  carriers,
  remainingUsdCents,
  canPay,
  igtfRateBp,
  bcvRate,
  accounts,
  methods,
  internalNote,
}: {
  orderId: string;
  status: OrderStatus;
  next: { status: OrderStatus; label: string } | null;
  carrier: string | null;
  carriers: string[];
  remainingUsdCents: number;
  /** Se puede registrar un pago (a crédito, también después de entregado) */
  canPay: boolean;
  /** IGTF sobre pagos en divisas (0 = no se cobra) */
  igtfRateBp: number;
  bcvRate: number;
  accounts: Account[];
  methods: MethodInfo[];
  internalNote: string | null;
}) {
  const { pending, feedback, run } = useAction();
  const [panel, setPanel] = useState<"pay" | "cancel" | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("PAGO_MOVIL");
  const info = methods.find((m) => m.method === method)!;
  const methodAccounts = accounts.filter((a) => info.accountTypes.includes(a.type));
  const due = amountDueIn(info.currency, remainingUsdCents, bcvRate, igtfRateBp);
  const closed = status === "CANCELLED" || status === "DELIVERED";

  return (
    <section className={cn(card, "space-y-4 p-5")}>
      <h2 className="text-lg font-bold">Acciones</h2>
      <Feedback value={feedback} />

      {next ? (
        <form
          action={(f) =>
            run(() => advanceOrderAction(orderId, { to: next.status, carrier: String(f.get("carrier") ?? ""), trackingNumber: String(f.get("trackingNumber") ?? "") }))
          }
          className="space-y-2"
        >
          {next.status === "SHIPPED" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass} htmlFor="carrier">Empresa</label>
                <select id="carrier" name="carrier" defaultValue={carrier ?? carriers[0]} className={inputClass}>
                  {carriers.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="trackingNumber">N.º de guía</label>
                <input id="trackingNumber" name="trackingNumber" required className={inputClass} />
              </div>
            </div>
          ) : null}
          <button disabled={pending} className={cn(buttonPrimary, "w-full py-3")}>
            {next.label} →
          </button>
        </form>
      ) : null}

      {canPay ? (
        panel === "pay" ? (
          <form
            action={(f) =>
              run(
                () =>
                  registerPaymentAction(orderId, {
                    method,
                    accountId: String(f.get("accountId") ?? ""),
                    amount: String(f.get("amount") ?? ""),
                    reference: String(f.get("reference") ?? ""),
                    payerName: String(f.get("payerName") ?? ""),
                  }),
                () => setPanel(null),
              )
            }
            className="space-y-2 rounded-xl bg-cream p-3"
          >
            <p className="text-sm font-semibold">Registrar un pago recibido</p>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputClass} aria-label="Método">
              {methods.map((m) => <option key={m.method} value={m.method}>{m.label}</option>)}
            </select>
            <select name="accountId" key={method} className={inputClass} aria-label="Cuenta">
              {methodAccounts.length ? null : <option value="">Sin cuenta</option>}
              {methodAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input key={`amount-${method}`} name="amount" required inputMode="decimal" defaultValue={(due / 100).toFixed(2).replace(".", ",")} aria-label="Monto" className={inputClass} />
              <input name="reference" placeholder="Referencia" className={inputClass} />
            </div>
            <input name="payerName" placeholder="Quién pagó (opcional)" className={inputClass} />
            <p className="text-xs text-muted">
              Falta {formatMoney(due, info.currency)}
              {info.currency !== "VES" && igtfRateBp > 0 ? ` (incluye IGTF ${igtfRateBp / 100} %)` : ""}
            </p>
            <div className="flex gap-2">
              <button disabled={pending} className={cn(buttonPrimary, "flex-1")}>Registrar</button>
              <button type="button" onClick={() => setPanel(null)} className={buttonSecondary}>Cancelar</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setPanel("pay")} className={cn(buttonSecondary, "w-full")}>
            💵 Registrar pago recibido
          </button>
        )
      ) : null}

      <form action={(f) => run(() => saveInternalNote(orderId, String(f.get("note") ?? "")), undefined)} className="space-y-1">
        <label className={labelClass} htmlFor="note">Nota interna (no la ve la clienta)</label>
        <textarea id="note" name="note" rows={2} defaultValue={internalNote ?? ""} className={inputClass} />
        <button disabled={pending} className={buttonGhost}>Guardar nota</button>
      </form>

      {!closed ? (
        panel === "cancel" ? (
          <form action={(f) => run(() => cancelOrderAction(orderId, String(f.get("reason") ?? "")), () => setPanel(null))} className="space-y-2 rounded-xl bg-red-50 p-3">
            <label className={labelClass} htmlFor="reason">Motivo de la anulación</label>
            <input id="reason" name="reason" required minLength={3} className={inputClass} />
            <p className="text-xs text-red-900">
              {status === "PENDING" || status === "PAYMENT_REVIEW" ? "Se libera el stock apartado." : "La mercancía vuelve al stock. El reembolso a la clienta lo haces aparte."}
            </p>
            <div className="flex gap-2">
              <button disabled={pending} className={cn(buttonPrimary, "flex-1 bg-danger text-white")}>Anular pedido</button>
              <button type="button" onClick={() => setPanel(null)} className={buttonSecondary}>Volver</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setPanel("cancel")} className="w-full text-sm font-semibold text-muted hover:text-danger">
            Anular pedido
          </button>
        )
      ) : null}
    </section>
  );
}
