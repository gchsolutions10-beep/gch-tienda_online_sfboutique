"use client";

import { useState, useTransition } from "react";
import { saveRate } from "@/server/actions/admin/rates";
import { buttonPrimary, card, cn, inputClass, labelClass } from "@/components/ui/styles";

/** Cargar la tasa del día (BCV o P2P). Pide confirmar si el salto es muy grande. */
export function RateForm({ today }: { today: string }) {
  const [source, setSource] = useState<"BCV" | "P2P">("BCV");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (confirmed: boolean) =>
    startTransition(async () => {
      const r = await saveRate({ source, rate, effectiveDate: date, note, confirmed });
      if (r.ok) {
        setMessage({ ok: true, text: `✓ Tasa ${source} guardada. Los precios en bolívares ya usan la nueva tasa.` });
        setRate("");
        setNote("");
        setConfirm(false);
      } else {
        setMessage({ ok: false, text: r.error });
        setConfirm(Boolean(r.needsConfirm));
      }
    });

  return (
    <form
      className={cn(card, "space-y-4 p-5")}
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <h2 className="font-display text-xl font-semibold">Cargar tasa</h2>
      <div className="inline-flex rounded-full border border-line p-1" role="radiogroup" aria-label="Tipo de tasa">
        {(["BCV", "P2P"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={source === s}
            onClick={() => {
              setSource(s);
              setConfirm(false);
            }}
            className={cn("rounded-full px-5 py-1.5 text-sm font-semibold", source === s ? "bg-ink text-white" : "text-muted")}
          >
            {s === "BCV" ? "BCV (oficial)" : "P2P / USDT"}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {source === "BCV"
          ? "La oficial publicada por el Banco Central. Es la que va a la factura y al libro de ventas."
          : "La del mercado (USDT, efectivo). Solo se usa para tus reportes de gestión."}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="rate">
            Bs por 1 USD
          </label>
          <input id="rate" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="Ej.: 182,25" required className={cn(inputClass, "font-display text-lg")} />
        </div>
        <div>
          <label className={labelClass} htmlFor="rate-date">
            Rige desde
          </label>
          <input id="rate-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="rate-note">
            Nota (opcional)
          </label>
          <input id="rate-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Ej.: publicada por el BCV" className={inputClass} />
        </div>
      </div>
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={cn("rounded-lg px-3 py-2 text-sm font-semibold", message.ok ? "bg-ok/10 text-ok" : "bg-amber-50 text-amber-900")}>
          {message.text}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className={buttonPrimary} disabled={pending}>
          {pending ? "Guardando…" : "Guardar tasa"}
        </button>
        {confirm ? (
          <button type="button" onClick={() => submit(true)} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white" disabled={pending}>
            Sí, está bien: guardar
          </button>
        ) : null}
      </div>
    </form>
  );
}
