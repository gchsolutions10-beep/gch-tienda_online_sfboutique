"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/money";

type Day = { day: string; cents: number; count: number };

const short = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
};
const long = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "Bonito" para el tope del eje: 1, 2, 2,5 o 5 × 10ⁿ. */
function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/**
 * Ventas por día (una sola serie, color de la marca). Barras finas ancladas
 * a la base, detalle al pasar el mouse o tocar, y la misma información en una
 * tabla para lectores de pantalla.
 */
export function SalesChart({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...days.map((d) => d.cents)));
  const total = days.reduce((a, d) => a + d.cents, 0);
  const shown = active !== null ? days[active] : null;
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));

  return (
    <figure className="space-y-2">
      <div className="flex h-6 items-baseline justify-between gap-2 text-sm" aria-live="polite">
        {shown ? (
          <p>
            <b className="capitalize">{long(shown.day)}</b> · {formatUsd(shown.cents)} · {shown.count} {shown.count === 1 ? "venta" : "ventas"}
          </p>
        ) : (
          <p className="text-muted">Pasa el dedo o el mouse por una barra para ver el día.</p>
        )}
      </div>
      <div className="relative h-48" aria-hidden>
        {/* Guías recesivas: la mitad y el tope */}
        {[1, 0.5].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2.5 right-0 bg-paper pl-1 text-[10px] text-muted">{formatUsd(Math.round(max * f)).replace(",00", "")}</span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-ink/30" />
        <div className="absolute inset-0 flex items-end gap-[2px] pr-12">
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive(i)}
              className="group flex h-full min-w-0 flex-1 items-end"
            >
              <span
                className={`block w-full rounded-t-[4px] transition ${active === i ? "bg-brand-strong" : "bg-brand"} ${d.cents ? "" : "opacity-0"}`}
                style={{ height: `${Math.max(d.cents ? 2 : 0, (d.cents / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="flex pr-12 text-[10px] text-muted" aria-hidden>
        {days.map((d, i) => (
          <span key={d.day} className="min-w-0 flex-1 text-center">
            {i % labelEvery === 0 ? short(d.day) : ""}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">Ventas por día, {formatUsd(total)} en total.</figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Día</th>
            <th>Ventas</th>
            <th>Pedidos</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{formatUsd(d.cents)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
