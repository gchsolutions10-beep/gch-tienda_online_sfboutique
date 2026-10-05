"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { submitPayment } from "@/server/actions/store/checkout";
import { prepareProofFile } from "@/lib/image-compress";
import { amountDueIn } from "@/lib/orders";
import { formatMoney, formatRate, formatUsd, type Currency } from "@/lib/money";
import { VE_BANKS, type FinancialAccountType, type PaymentMethod } from "@/lib/payments";
import { formatVePhone } from "@/lib/ve-ids";
import { cn } from "@/components/ui/styles";

export type CheckoutAccount = {
  id: string;
  name: string;
  type: FinancialAccountType;
  currency: Currency;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  holderName: string | null;
  holderIdType: string | null;
  holderIdNumber: string | null;
  phone: string | null;
  email: string | null;
  walletId: string | null;
};

type MethodOption = { method: PaymentMethod; label: string; icon: string; currency: Currency; accounts: CheckoutAccount[] };

const field =
  "w-full min-w-0 rounded-xl border-[1.5px] border-store-line bg-store-card px-3.5 py-2.5 text-sm text-store-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wider text-store-muted";

/** "1234,56" para el campo de monto (formato venezolano). */
const plain = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function accountRows(a: CheckoutAccount): [string, string][] {
  const id = a.holderIdNumber ? `${a.holderIdType ?? "V"}-${a.holderIdNumber}` : null;
  const bank = a.bankName ? `${a.bankCode ? `${a.bankCode} · ` : ""}${a.bankName}` : null;
  const rows: [string, string | null][] =
    a.type === "PAGO_MOVIL"
      ? [["Banco", bank], ["Teléfono", a.phone ? formatVePhone(a.phone.startsWith("+") ? a.phone : `+58${a.phone.replace(/^0/, "")}`) : null], ["Cédula/RIF", id]]
      : a.type === "BANK_VES" || a.type === "BANK_USD"
        ? [["Banco", bank], ["Cuenta", a.accountNumber], ["Titular", a.holderName], ["Cédula/RIF", id]]
        : a.type === "ZELLE"
          ? [["Correo", a.email], ["Titular", a.holderName]]
          : [["Binance Pay ID / correo", a.walletId]];
  return rows.filter((r): r is [string, string] => Boolean(r[1]));
}

function CopyRow({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-store-muted">{name}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(name === "Teléfono" || name === "Cuenta" ? value.replace(/\D/g, "") : value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="flex items-center gap-2 text-right font-semibold"
        title="Copiar"
      >
        {value}
        <span className="text-xs font-normal text-store-muted">{copied ? "¡Copiado!" : "📋"}</span>
      </button>
    </div>
  );
}

/** Elegir método, ver los datos de la cuenta y reportar el pago (con captura opcional). */
export function PaymentReport({
  token,
  methods,
  remainingUsdCents,
  bcvRate,
  igtfRateBp = 0,
}: {
  token: string;
  methods: MethodOption[];
  remainingUsdCents: number;
  bcvRate: number;
  /** IGTF que se suma a los pagos en divisas (0 = no aplica) */
  igtfRateBp?: number;
}) {
  const router = useRouter();
  const [methodKey, setMethodKey] = useState<PaymentMethod>(methods[0].method);
  const method = methods.find((m) => m.method === methodKey) ?? methods[0];
  const [accountId, setAccountId] = useState(method.accounts[0]?.id ?? "");
  const account = method.accounts.find((a) => a.id === accountId) ?? method.accounts[0];
  const due = amountDueIn(method.currency, remainingUsdCents, bcvRate, igtfRateBp);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(m: MethodOption) {
    setMethodKey(m.method);
    setAccountId(m.accounts[0]?.id ?? "");
    setError(null);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const proof = form.get("proof");
      if (proof instanceof File && proof.size > 0) {
        const prepared = await prepareProofFile(proof);
        if (!prepared.ok) return setError(prepared.error);
        form.set("proof", prepared.file);
      }
      form.set("token", token);
      form.set("method", method.method);
      form.set("accountId", account?.id ?? "");
      const result = await submitPayment(form);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  const isVes = method.currency === "VES";

  return (
    <div className="mt-4">
      <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {methods.map((m) => (
          <button
            key={m.method}
            type="button"
            role="radio"
            aria-checked={m.method === method.method}
            onClick={() => choose(m)}
            className={cn("rounded-2xl border-2 p-3 text-left text-sm transition", m.method === method.method ? "border-brand bg-brand-soft" : "border-store-line hover:border-store-muted")}
          >
            <span aria-hidden className="text-xl">{m.icon}</span>
            <span className="block font-semibold">{m.label}</span>
            <span className="text-xs text-store-muted">{m.currency === "VES" ? "En bolívares" : m.currency}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-store-soft p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-store-muted">Monto a pagar</p>
        <p className="font-display text-3xl font-semibold">{formatMoney(due, method.currency)}</p>
        {isVes ? (
          <p className="text-xs text-store-muted">
            {formatUsd(remainingUsdCents)} a la tasa BCV de hoy ({formatRate(bcvRate)})
          </p>
        ) : igtfRateBp > 0 ? (
          <p className="text-xs text-store-muted">
            {formatUsd(remainingUsdCents)} + IGTF {igtfRateBp / 100} % por pagar en divisas ({formatUsd(due - remainingUsdCents)}). En bolívares no se cobra.
          </p>
        ) : null}

        {method.accounts.length > 1 ? (
          <select value={account?.id} onChange={(e) => setAccountId(e.target.value)} className={cn(field, "mt-3")} aria-label="Cuenta">
            {method.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        ) : null}
        {account ? (
          <div className="mt-3 divide-y divide-store-line rounded-xl bg-store-card px-3 text-sm">
            {accountRows(account).map(([k, v]) => (
              <CopyRow key={k} name={k} value={v} />
            ))}
          </div>
        ) : null}
      </div>

      <form method="post" onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <p className="text-sm font-semibold sm:col-span-2">Cuando pagues, repórtalo aquí:</p>
        <div>
          <label htmlFor="amount" className={label}>Monto pagado ({method.currency === "VES" ? "Bs" : method.currency})</label>
          <input key={method.method} id="amount" name="amount" required inputMode="decimal" defaultValue={plain(due)} className={field} />
        </div>
        <div>
          <label htmlFor="reference" className={label}>{method.currency === "USDT" ? "ID de la orden o hash" : "Número de referencia"}</label>
          <input id="reference" name="reference" required minLength={4} className={field} />
        </div>
        {isVes ? (
          <>
            <div>
              <label htmlFor="payerBank" className={label}>Banco desde donde pagaste</label>
              <select id="payerBank" name="payerBank" defaultValue="" className={field}>
                <option value="">Elige…</option>
                {VE_BANKS.map(([code, name]) => (
                  <option key={code} value={`${code} ${name}`}>{code} · {name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="payerPhone" className={label}>{method.method === "PAGO_MOVIL" ? "Teléfono que pagó" : "Cédula del titular"}</label>
              <input id="payerPhone" name={method.method === "PAGO_MOVIL" ? "payerPhone" : "payerIdNumber"} className={field} />
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <label htmlFor="payerName" className={label}>Nombre de quien pagó</label>
            <input id="payerName" name="payerName" className={field} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="proof" className={label}>Captura del comprobante (opcional)</label>
          <input id="proof" name="proof" type="file" accept="image/*,application/pdf" className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-store-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-on-store-ink" />
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger sm:col-span-2">{error}</p>
        ) : null}
        <button type="submit" disabled={pending} className="rounded-full bg-brand px-4 py-3 font-semibold text-on-brand hover:brightness-110 disabled:opacity-60 sm:col-span-2">
          {pending ? "Enviando…" : "Reportar pago"}
        </button>
      </form>
    </div>
  );
}
