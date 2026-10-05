"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { quickCreateCustomer, searchCustomers, searchSaleItems, storeSale } from "@/server/actions/admin/cash";
import { fromUsdCents, splitDiscount, tenderStatus } from "@/lib/cash";
import { priceOrder } from "@/lib/orders";
import type { TaxSettings } from "@/lib/tax-ve";
import { formatMoney, formatRate, formatUsd, formatVes, parseAmount, usdToVesCents, type Currency } from "@/lib/money";
import type { FinancialAccountType, PaymentMethod } from "@/lib/payments";
import { buttonGhost, buttonPrimary, buttonSecondary, card, cn, inputBase, inputClass, labelClass } from "@/components/ui/styles";

type Item = Awaited<ReturnType<typeof searchSaleItems>>[number];
type CartLine = Item & { quantity: number };
type Customer = { id: string; name: string; idDoc?: string | null; phone?: string | null };
type Account = { id: string; name: string; type: FinancialAccountType; currency: Currency };
type Method = { method: PaymentMethod; label: string; icon: string; currency: Currency; accountTypes: FinancialAccountType[] };
type PayLine = { key: number; method: PaymentMethod; accountId: string; amount: string; reference: string };

const toInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const amountCents = (s: string) => Math.round((parseAmount(s) ?? 0) * 100);

/** Venta en la tienda física con pagos mixtos (Bs, USD, USDT) y vuelto. */
export function StoreSale({ sessionId, bcvRate, accounts, methods, tax }: { sessionId: string; bcvRate: number; accounts: Account[]; methods: Method[]; tax: TaxSettings }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState("");
  const [pays, setPays] = useState<PayLine[]>([]);
  const [changeCurrency, setChangeCurrency] = useState<"VES" | "USD">("VES");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const search = useRef<HTMLInputElement>(null);
  const nextKey = useRef(1);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => searchSaleItems(term).then(setResults), 200);
    return () => clearTimeout(t);
  }, [q]);

  const accountsFor = (m: PaymentMethod) => {
    const info = methods.find((x) => x.method === m)!;
    return accounts.filter((a) => info.accountTypes.includes(a.type));
  };
  const currencyOf = (p: PayLine) => accounts.find((a) => a.id === p.accountId)?.currency ?? methods.find((m) => m.method === p.method)!.currency;

  // Mismo cálculo que el servidor (que igual lo repite al cobrar).
  const gross = cart.reduce((a, l) => a + l.priceCents * l.quantity, 0);
  const discountCents = Math.min(gross, amountCents(discount));
  const discounts = splitDiscount(cart.map((l) => l.priceCents * l.quantity), discountCents);
  const priced = priceOrder(cart.map((l, i) => ({ unitPriceCents: l.priceCents, quantity: l.quantity, ivaExempt: l.ivaExempt, discountCents: discounts[i] })), tax, 0, bcvRate);
  const totalCents = priced.totalCents;
  const ivaIncluded = tax.ivaEnabled && tax.taxMode === "PRICE_INCLUDES_TAX";
  const tender = useMemo(
    () => tenderStatus(totalCents, pays.map((p) => ({ currency: currencyOf(p), cents: amountCents(p.amount) })), bcvRate, changeCurrency),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currencyOf depende de pays y accounts
    [totalCents, pays, bcvRate, changeCurrency, accounts],
  );

  function add(item: Item) {
    setDone(null);
    setCart((c) => {
      const same = c.find((l) => l.variantId === item.variantId);
      if (same) return c.map((l) => (l === same ? { ...l, quantity: Math.min(l.available, l.quantity + 1) } : l));
      return item.available > 0 ? [...c, { ...item, quantity: 1 }] : c;
    });
    setQ("");
    setResults([]);
    search.current?.focus();
  }

  function addPayment(method: PaymentMethod) {
    const acc = accountsFor(method)[0];
    const currency = acc?.currency ?? methods.find((m) => m.method === method)!.currency;
    const due = fromUsdCents(currency, tender.remainingUsd, bcvRate);
    setPays((p) => [...p, { key: nextKey.current++, method, accountId: acc?.id ?? "", amount: due ? toInput(due) : "", reference: "" }]);
  }
  const patch = (key: number, data: Partial<PayLine>) => setPays((p) => p.map((x) => (x.key === key ? { ...x, ...data } : x)));

  function charge() {
    setError(null);
    start(async () => {
      const r = await storeSale({
        sessionId,
        lines: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        discount,
        customerId: customer?.id ?? null,
        payments: pays.map((p) => ({ method: p.method, accountId: p.accountId, amount: p.amount, reference: p.reference })),
        changeCurrency,
        notes: "",
      });
      if (!r.ok) return setError(r.error);
      setDone(`Venta #${r.number} registrada.${r.change > 0 ? ` Vuelto: ${formatMoney(r.change, r.changeCurrency as Currency)}` : ""}`);
      setCart([]);
      setPays([]);
      setDiscount("");
      setCustomer(null);
      router.refresh();
      search.current?.focus();
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      {/* Productos */}
      <section className={cn(card, "p-4")}>
        <div className="relative">
          <input
            ref={search}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length < 2) setResults([]);
            }}
            onKeyDown={(e) => e.key === "Enter" && results.length === 1 && add(results[0])}
            placeholder="Buscar prenda por nombre, SKU o código de barras…"
            aria-label="Buscar prenda"
            className={cn(inputClass, "py-3 text-base")}
          />
          {results.length ? (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-xl border border-line bg-paper shadow-lg">
              {results.map((r) => (
                <li key={r.variantId}>
                  <button
                    type="button"
                    disabled={r.available <= 0}
                    onClick={() => add(r)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-cream disabled:opacity-40"
                  >
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura
                      <img src={r.imageUrl} alt="" className="h-12 w-9 rounded object-cover" />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{r.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        {r.hex ? <span className="size-3 rounded-full border border-black/20" style={{ background: r.hex }} /> : null}
                        {[r.color, r.size && `Talla ${r.size}`, r.sku].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold">{formatUsd(r.priceCents)}</span>
                      <span className={cn("text-xs", r.available <= 0 ? "text-danger" : "text-muted")}>{r.available <= 0 ? "Agotado" : `${r.available} disp.`}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {done ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">✓ {done}</p> : null}

        {cart.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">Busca una prenda para empezar la venta.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {cart.map((l, i) => (
              <li key={l.variantId} className="flex items-center gap-3 py-2.5">
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura
                  <img src={l.imageUrl} alt="" className="h-14 w-10 rounded object-cover" />
                ) : null}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-xs text-muted">{[l.color, l.size && `Talla ${l.size}`].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center rounded-lg border border-line">
                  <button type="button" onClick={() => setCart((c) => (l.quantity <= 1 ? c.filter((x) => x !== l) : c.map((x) => (x === l ? { ...x, quantity: x.quantity - 1 } : x))))} aria-label={`Quitar uno de ${l.name}`} className="grid size-9 place-items-center text-lg">−</button>
                  <span className="w-7 text-center font-semibold">{l.quantity}</span>
                  <button type="button" disabled={l.quantity >= l.available} onClick={() => setCart((c) => c.map((x) => (x === l ? { ...x, quantity: x.quantity + 1 } : x)))} aria-label={`Agregar otro ${l.name}`} className="grid size-9 place-items-center text-lg disabled:opacity-30">+</button>
                </div>
                <span className="w-24 text-right text-sm">
                  <span className="block font-semibold">{formatUsd(l.priceCents * l.quantity - discounts[i])}</span>
                  {discounts[i] ? <s className="text-xs text-muted">{formatUsd(l.priceCents * l.quantity)}</s> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cobro */}
      <section className={cn(card, "space-y-4 p-4")}>
        <CustomerPicker value={customer} onChange={setCustomer} />

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className={labelClass} htmlFor="discount">Descuento (USD)</label>
            <input id="discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0,00" className={inputClass} />
          </div>
          {gross ? (
            <div className="flex gap-1">
              {[5, 10, 15].map((pct) => (
                <button key={pct} type="button" onClick={() => setDiscount(toInput(Math.round((gross * pct) / 100)))} className={buttonGhost}>
                  {pct}%
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl bg-cream p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Total{ivaIncluded ? " (IVA incluido)" : ""}{priced.ivaCents && !ivaIncluded ? ` · IVA ${formatUsd(priced.ivaCents)}` : ""}</span>
            <span className="font-display text-3xl font-bold">{formatUsd(totalCents)}</span>
          </div>
          <p className="text-right text-sm text-muted">
            {formatVes(usdToVesCents(totalCents, bcvRate))} · BCV {formatRate(bcvRate)}
          </p>
        </div>

        <div className="space-y-2">
          <p className={labelClass}>Pagos</p>
          {pays.map((p) => {
            const accs = accountsFor(p.method);
            const info = methods.find((m) => m.method === p.method)!;
            const cur = currencyOf(p);
            return (
              <div key={p.key} className="space-y-1.5 rounded-xl border border-line p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{info.icon} {info.label}</span>
                  <button type="button" onClick={() => setPays((x) => x.filter((y) => y.key !== p.key))} className={cn(buttonGhost, "hover:text-danger")} aria-label="Quitar pago">✕</button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-1.5">
                  <select value={p.accountId} onChange={(e) => patch(p.key, { accountId: e.target.value })} aria-label="Cuenta" className={cn(inputBase, "min-w-0")}>
                    {accs.length ? null : <option value="">Sin cuenta configurada</option>}
                    {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <div className="relative">
                    <input value={p.amount} onChange={(e) => patch(p.key, { amount: e.target.value })} inputMode="decimal" aria-label={`Monto en ${cur}`} className={cn(inputBase, "w-full pr-10 text-right")} />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">{cur === "VES" ? "Bs" : cur}</span>
                  </div>
                </div>
                {info.method !== "CASH_VES" && info.method !== "CASH_USD" ? (
                  <input value={p.reference} onChange={(e) => patch(p.key, { reference: e.target.value })} placeholder={info.method === "POS_CARD" ? "N.º de aprobación (opcional)" : "Referencia"} aria-label="Referencia" className={inputClass} />
                ) : null}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-1.5">
            {methods.map((m) => (
              <button key={m.method} type="button" disabled={!totalCents || tender.complete} onClick={() => addPayment(m.method)} className={cn(buttonSecondary, "px-2.5 py-1.5 text-xs")}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>

        {pays.length ? (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Pagado</dt><dd className="font-semibold">{formatUsd(tender.paidUsd)}</dd></div>
            {tender.remainingUsd ? (
              <div className="flex justify-between text-amber-800">
                <dt>Falta</dt>
                <dd className="font-semibold">{formatUsd(tender.remainingUsd)} · {formatVes(usdToVesCents(tender.remainingUsd, bcvRate))}</dd>
              </div>
            ) : null}
            {tender.changeUsd ? (
              <div className="flex items-center justify-between rounded-lg bg-amber-50 p-2 text-amber-950">
                <dt className="font-semibold">Vuelto</dt>
                <dd className="flex items-center gap-2">
                  <b>{formatMoney(tender.change, changeCurrency)}</b>
                  <select value={changeCurrency} onChange={(e) => setChangeCurrency(e.target.value as "VES" | "USD")} aria-label="Moneda del vuelto" className={cn(inputBase, "py-1")}>
                    <option value="VES">en Bs</option>
                    <option value="USD">en USD</option>
                  </select>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {error ? <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-semibold text-danger">{error}</p> : null}
        <button type="button" disabled={pending || !cart.length || !tender.complete || !pays.length} onClick={charge} className={cn(buttonPrimary, "w-full py-3.5 text-base")}>
          {pending ? "Registrando…" : `Cobrar ${formatUsd(totalCents)}`}
        </button>
      </section>
    </div>
  );
}

function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchCustomers>>>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => searchCustomers(term).then(setResults), 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-brand-soft p-3 text-sm">
        <span>
          <b>{value.name}</b>
          {value.idDoc ? <span className="text-muted"> · {value.idDoc}</span> : null}
        </span>
        <button type="button" onClick={() => onChange(null)} className={buttonGhost}>Cambiar</button>
      </div>
    );
  }
  if (creating) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            const r = await quickCreateCustomer({ name: String(f.get("name") ?? ""), idDoc: String(f.get("idDoc") ?? ""), phone: String(f.get("phone") ?? "") });
            if (!r.ok) return setError(r.error);
            onChange(r.customer);
            setCreating(false);
          });
        }}
        className="space-y-1.5 rounded-xl border border-line p-3"
      >
        <p className="text-sm font-semibold">Nueva clienta</p>
        <input name="name" required placeholder="Nombre y apellido" aria-label="Nombre" className={inputClass} />
        <div className="grid grid-cols-2 gap-1.5">
          <input name="idDoc" placeholder="Cédula V-12345678" aria-label="Cédula" className={inputClass} />
          <input name="phone" placeholder="0414-1234567" aria-label="Teléfono" className={inputClass} />
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <button disabled={pending} className={cn(buttonPrimary, "flex-1")}>Guardar</button>
          <button type="button" onClick={() => setCreating(false)} className={buttonSecondary}>Cancelar</button>
        </div>
      </form>
    );
  }
  return (
    <div className="relative">
      <label className={labelClass} htmlFor="customer-search">Clienta (opcional)</label>
      <div className="flex gap-1.5">
        <input id="customer-search" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setResults([]); }} placeholder="Nombre, teléfono o cédula" className={inputClass} />
        <button type="button" onClick={() => setCreating(true)} className={buttonSecondary} title="Nueva clienta">+ Nueva</button>
      </div>
      {results.length ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-line bg-paper shadow-lg">
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { onChange(c); setQ(""); setResults([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-cream">
                <b>{c.name}</b>
                <span className="text-xs text-muted"> {[c.idDoc, c.ordersCount ? `${c.ordersCount} compras` : null].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
