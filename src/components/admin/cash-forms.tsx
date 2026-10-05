"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cashMovementAction, closeCashSession, openCashSession } from "@/server/actions/admin/cash";
import { formatMoney, parseAmount, type Currency } from "@/lib/money";
import { buttonPrimary, buttonSecondary, card, cn, inputBase, inputClass, labelClass } from "@/components/ui/styles";

/** Abrir el turno con el fondo de caja en Bs y en USD. */
export function OpenSessionForm({ registerId }: { registerId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await openCashSession(registerId, { VES: String(f.get("ves") ?? ""), USD: String(f.get("usd") ?? "") });
          if (!r.ok) return setError(r.error);
          router.refresh();
        });
      }}
      className={cn(card, "max-w-md space-y-4 p-6")}
    >
      <div>
        <h2 className="text-lg font-bold">Abrir turno</h2>
        <p className="text-sm text-muted">Cuenta el efectivo con el que empiezas (fondo para dar vuelto).</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="ves">Efectivo en Bs</label>
          <input id="ves" name="ves" inputMode="decimal" placeholder="0,00" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="usd">Efectivo en USD</label>
          <input id="usd" name="usd" inputMode="decimal" placeholder="0,00" className={inputClass} />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
      <button disabled={pending} className={cn(buttonPrimary, "w-full py-3")}>{pending ? "Abriendo…" : "Abrir turno"}</button>
    </form>
  );
}

/** Entrada o salida de efectivo (pago a proveedor, retiro para el banco…). */
export function CashMovementForm({ sessionId, cashAccounts }: { sessionId: string; cashAccounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonSecondary}>↕ Entrada / salida de efectivo</button>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await cashMovementAction({
            sessionId,
            type: f.get("type") === "PAY_IN" ? "PAY_IN" : "PAY_OUT",
            accountId: String(f.get("accountId") ?? ""),
            amount: String(f.get("amount") ?? ""),
            reason: String(f.get("reason") ?? ""),
          });
          if (!r.ok) return setError(r.error);
          setOpen(false);
          setError(null);
          router.refresh();
        });
      }}
      className={cn(card, "flex flex-wrap items-end gap-2 p-3")}
    >
      <select name="type" aria-label="Tipo" className={cn(inputBase, "w-32")}>
        <option value="PAY_OUT">Salida</option>
        <option value="PAY_IN">Entrada</option>
      </select>
      <select name="accountId" aria-label="Caja" className={cn(inputBase, "w-40")}>
        {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <input name="amount" required inputMode="decimal" placeholder="Monto" aria-label="Monto" className={cn(inputBase, "w-28")} />
      <input name="reason" required placeholder="Motivo (pago de delivery, depósito…)" aria-label="Motivo" className={cn(inputBase, "min-w-48 flex-1")} />
      <button disabled={pending} className={buttonPrimary}>Guardar</button>
      <button type="button" onClick={() => setOpen(false)} className={buttonSecondary}>Cancelar</button>
      {error ? <p role="alert" className="w-full text-sm font-semibold text-danger">{error}</p> : null}
    </form>
  );
}

type Line = { accountId: string; name: string; currency: Currency; isCash: boolean; opening: number; sales: number; payIn: number; payOut: number; expected: number };

/** Cierre: lo que se cuenta en cada caja y lo que muestra cada banco, contra lo esperado. */
export function CloseSessionForm({ sessionId, lines }: { sessionId: string; lines: Line[] }) {
  const router = useRouter();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const value = (l: Line) => (counted[l.accountId] === undefined ? null : Math.round((parseAmount(counted[l.accountId]) ?? 0) * 100));
  const currencies = [...new Set(lines.map((l) => l.currency))];
  const missing = lines.some((l) => counted[l.accountId] === undefined || counted[l.accountId].trim() === "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (lines.some((l) => (value(l) ?? 0) !== l.expected) && !confirm("Hay diferencias entre lo contado y lo esperado. ¿Cerrar el turno igual?")) return;
        start(async () => {
          const r = await closeCashSession(sessionId, counted, notes);
          if (!r.ok) return setError(r.error);
          router.push(`/admin/caja/turnos/${sessionId}`);
        });
      }}
      className="space-y-4"
    >
      <div className={cn(card, "overflow-x-auto")}>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-cream text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2">Cuenta</th>
              <th className="px-2 py-2 text-right">Fondo</th>
              <th className="px-2 py-2 text-right">Ventas</th>
              <th className="px-2 py-2 text-right">Entradas − salidas</th>
              <th className="px-2 py-2 text-right">Esperado</th>
              <th className="px-2 py-2 text-right">Contado</th>
              <th className="px-4 py-2 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => {
              const v = value(l);
              const diff = v === null ? null : v - l.expected;
              return (
                <tr key={l.accountId}>
                  <td className="px-4 py-2">
                    <b>{l.name}</b>
                    <span className="block text-xs text-muted">{l.isCash ? "Cuenta los billetes" : "Revisa el saldo en el banco o la app"}</span>
                  </td>
                  <td className="px-2 py-2 text-right">{l.opening ? formatMoney(l.opening, l.currency) : "—"}</td>
                  <td className="px-2 py-2 text-right">{formatMoney(l.sales, l.currency)}</td>
                  <td className="px-2 py-2 text-right">{l.payIn || l.payOut ? formatMoney(l.payIn - l.payOut, l.currency) : "—"}</td>
                  <td className="px-2 py-2 text-right font-semibold">{formatMoney(l.expected, l.currency)}</td>
                  <td className="px-2 py-2 text-right">
                    <input
                      value={counted[l.accountId] ?? ""}
                      onChange={(e) => setCounted((c) => ({ ...c, [l.accountId]: e.target.value }))}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label={`Contado en ${l.name}`}
                      className={cn(inputBase, "w-28 text-right")}
                    />
                  </td>
                  <td className={cn("px-4 py-2 text-right font-semibold", diff === null ? "text-muted" : diff === 0 ? "text-ok" : "text-danger")}>
                    {diff === null ? "—" : diff === 0 ? "✓ Cuadra" : `${diff > 0 ? "+" : ""}${formatMoney(diff, l.currency)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-cream text-sm">
            {currencies.map((c) => {
              const ls = lines.filter((l) => l.currency === c);
              const exp = ls.reduce((a, l) => a + l.expected, 0);
              const cnt = ls.reduce((a, l) => a + (value(l) ?? 0), 0);
              return (
                <tr key={c}>
                  <td className="px-4 py-2 font-bold" colSpan={4}>Total en {c === "VES" ? "bolívares" : c}</td>
                  <td className="px-2 py-2 text-right font-bold">{formatMoney(exp, c)}</td>
                  <td className="px-2 py-2 text-right font-bold">{formatMoney(cnt, c)}</td>
                  <td className={cn("px-4 py-2 text-right font-bold", cnt === exp ? "text-ok" : "text-danger")}>{formatMoney(cnt - exp, c)}</td>
                </tr>
              );
            })}
          </tfoot>
        </table>
      </div>
      <div>
        <label className={labelClass} htmlFor="notes">Observaciones del cierre</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ej. faltan Bs 50 por un vuelto mal dado" className={inputClass} />
      </div>
      {error ? <p role="alert" className="text-sm font-semibold text-danger">{error}</p> : null}
      <button disabled={pending || missing} className={cn(buttonPrimary, "px-6 py-3")}>{pending ? "Cerrando…" : "Cerrar turno"}</button>
      {missing ? <p className="text-xs text-muted">Escribe lo contado en todas las cuentas (0 si no hay nada).</p> : null}
    </form>
  );
}
