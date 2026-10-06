import { installmentState, type InstallmentState } from "@/lib/credit";
import { formatUsd, toCents, type DecimalLike } from "@/lib/money";
import { cn } from "@/components/ui/styles";

export type ScheduleRow = { number: number; dueDate: Date; amountUsd: DecimalLike; lateFeeUsd: DecimalLike; paidUsd: DecimalLike; paidAt: Date | null };

const STATE: Record<InstallmentState, { label: string; tone: string }> = {
  paid: { label: "Pagada", tone: "bg-ok/15 text-ok" },
  upcoming: { label: "Por vencer", tone: "bg-black/5" },
  "due-today": { label: "Vence hoy", tone: "bg-amber-100 text-amber-900" },
  grace: { label: "Vencida (en gracia)", tone: "bg-amber-100 text-amber-900" },
  late: { label: "En mora", tone: "bg-red-100 text-red-900" },
};

const fmt = (d: Date) => d.toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "America/Caracas" });

/** Calendario de cuotas con su estado (lo ven la clienta y el personal). */
export function CreditSchedule({ down, downPaid, rows, graceDays, now }: { down: DecimalLike; downPaid: boolean; rows: ScheduleRow[]; graceDays: number; now: Date }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Calendario de pagos</caption>
      <thead className="text-left text-xs opacity-70">
        <tr>
          <th className="py-1.5 font-semibold">Pago</th>
          <th className="py-1.5 font-semibold">Vence</th>
          <th className="py-1.5 text-right font-semibold">Monto</th>
          <th className="py-1.5 text-right font-semibold">Estado</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-black/10">
        <tr>
          <td className="py-2 font-semibold">Inicial</td>
          <td className="py-2">Para recibir tu compra</td>
          <td className="py-2 text-right tabular-nums">{formatUsd(toCents(down))}</td>
          <td className="py-2 text-right">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", downPaid ? STATE.paid.tone : "bg-amber-100 text-amber-900")}>{downPaid ? "Pagada" : "Pendiente"}</span>
          </td>
        </tr>
        {rows.map((r) => {
          const fee = toCents(r.lateFeeUsd);
          const s = installmentState({ dueDate: r.dueDate, paid: Boolean(r.paidAt) }, now, graceDays);
          const left = toCents(r.amountUsd) + fee - toCents(r.paidUsd);
          return (
            <tr key={r.number}>
              <td className="py-2 font-semibold">Cuota {r.number}</td>
              <td className="py-2">{fmt(r.dueDate)}</td>
              <td className="py-2 text-right tabular-nums">
                {formatUsd(toCents(r.amountUsd))}
                {fee ? <span className="block text-xs text-red-800">+ {formatUsd(fee)} mora</span> : null}
                {!r.paidAt && toCents(r.paidUsd) > 0 ? <span className="block text-xs opacity-70">falta {formatUsd(left)}</span> : null}
              </td>
              <td className="py-2 text-right">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATE[s.state].tone)}>
                  {STATE[s.state].label}
                  {s.daysLate ? ` · ${s.daysLate} d` : ""}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
