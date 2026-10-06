"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { reviewApplication, saveCreditSettings, setCustomerCredit } from "@/server/actions/admin/credit";
import { buttonPrimary, buttonSecondary, card, cn, inputClass, labelClass } from "@/components/ui/styles";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      if (r.ok) router.refresh();
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

/** Aprobar (con el teléfono confirmado) o rechazar con motivo. */
export function ReviewApplicationForm({ applicationId, guarantorAccepted }: { applicationId: string; guarantorAccepted: boolean }) {
  const { pending, feedback, run } = useRun();
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [note, setNote] = useState("");
  return (
    <section className={cn(card, "space-y-3 p-5")}>
      <h2 className="text-lg font-bold">Decisión</h2>
      {!guarantorAccepted ? <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-950">El fiador todavía no aceptó desde su enlace: aún no se puede aprobar.</p> : null}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={phoneVerified} onChange={(e) => setPhoneVerified(e.target.checked)} className="mt-0.5 size-4" />
        <span>Hablé con la clienta por WhatsApp y confirmé que el teléfono y la cédula son suyos.</span>
      </label>
      <div>
        <label className={labelClass} htmlFor="note">Nota (si rechazas, la ve la clienta)</label>
        <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputClass} />
      </div>
      <Feedback value={feedback} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || !guarantorAccepted || !phoneVerified} onClick={() => run(() => reviewApplication(applicationId, { approve: true, phoneVerified, note }))} className={cn(buttonPrimary, "bg-ok")}>
          ✓ Aprobar crédito
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => reviewApplication(applicationId, { approve: false, phoneVerified, note }))} className={cn(buttonSecondary, "border-danger text-danger")}>
          Rechazar
        </button>
      </div>
    </section>
  );
}

/** En la ficha de la clienta: nivel (automático o fijo), suspender o reactivar. */
export function CustomerCreditForm({ customerId, level, manual, status, note }: { customerId: string; level: number; manual: boolean; status: string; note: string | null }) {
  const { pending, feedback, run } = useRun();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(() => setCustomerCredit(customerId, { level: String(f.get("level")), status: String(f.get("status")), note: String(f.get("note") ?? "") }));
  }
  return (
    <form onSubmit={submit} method="post" className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="level">Nivel</label>
          <select id="level" name="level" defaultValue={manual ? String(level) : "auto"} className={inputClass}>
            <option value="auto">Automático (hoy Nivel {level})</option>
            <option value="1">Fijar Nivel 1 · Estándar</option>
            <option value="2">Fijar Nivel 2 · Confiable</option>
            <option value="3">Fijar Nivel 3 · VIP</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="status">Crédito</label>
          <select id="status" name="status" defaultValue={status === "SUSPENDED" ? "SUSPENDED" : "APPROVED"} disabled={status !== "APPROVED" && status !== "SUSPENDED"} className={inputClass}>
            <option value="APPROVED">Activo</option>
            <option value="SUSPENDED">Suspendido</option>
          </select>
        </div>
      </div>
      <input name="note" defaultValue={note ?? ""} placeholder="Motivo (opcional)" aria-label="Motivo" className={inputClass} />
      <p className="text-xs text-muted">Con un nivel fijo no sube sola; si cae en mora igual baja a Nivel 1.</p>
      <Feedback value={feedback} />
      <button disabled={pending} className={buttonSecondary}>Guardar</button>
    </form>
  );
}

export type CreditSettingsValues = { enabled: boolean; lateFee: string; graceDays: number; max1: string; max2: string; max3: string; upgradeAfter: number; vipAfter: number; oneOpen: boolean };

export function CreditSettingsForm({ values }: { values: CreditSettingsValues }) {
  const { pending, feedback, run } = useRun();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    run(() =>
      saveCreditSettings({
        enabled: f.get("enabled") === "on",
        lateFee: s("lateFee"),
        graceDays: Number(s("graceDays")),
        max1: s("max1"),
        max2: s("max2"),
        max3: s("max3"),
        upgradeAfter: Number(s("upgradeAfter")),
        vipAfter: Number(s("vipAfter")),
        oneOpen: f.get("oneOpen") === "on",
      }),
    );
  }
  return (
    <form onSubmit={submit} method="post" className={cn(card, "max-w-2xl space-y-4 p-5")}>
      <label className="flex items-center gap-2 text-lg font-bold">
        <input type="checkbox" name="enabled" defaultChecked={values.enabled} className="size-5" /> Ofrecer compra a crédito (Credi-SF)
      </label>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-bold">Mora</legend>
        <div>
          <label className={labelClass} htmlFor="lateFee">Recargo fijo por mora (USD)</label>
          <input id="lateFee" name="lateFee" inputMode="decimal" defaultValue={values.lateFee} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="graceDays">Días de gracia tras el vencimiento</label>
          <input id="graceDays" name="graceDays" type="number" min={0} max={30} defaultValue={values.graceDays} className={inputClass} />
        </div>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 font-bold">Monto máximo financiado (sin la inicial)</legend>
        {(["max1", "max2", "max3"] as const).map((k, i) => (
          <div key={k}>
            <label className={labelClass} htmlFor={k}>Nivel {i + 1} (USD)</label>
            <input id={k} name={k} inputMode="decimal" defaultValue={values[k]} className={inputClass} />
          </div>
        ))}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-bold">Ascenso automático (créditos pagados sin mora)</legend>
        <div>
          <label className={labelClass} htmlFor="upgradeAfter">Para Nivel 2</label>
          <input id="upgradeAfter" name="upgradeAfter" type="number" min={1} defaultValue={values.upgradeAfter} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="vipAfter">Para Nivel 3</label>
          <input id="vipAfter" name="vipAfter" type="number" min={2} defaultValue={values.vipAfter} className={inputClass} />
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="oneOpen" defaultChecked={values.oneOpen} className="size-4" /> Un solo crédito abierto a la vez por clienta
      </label>
      <p className="rounded-lg bg-cream p-3 text-xs text-muted">
        Condiciones fijas por nivel: Nivel 1 = 60 % + 2 cuotas del 20 %; Nivel 2 = 50 % + 3 cuotas; Nivel 3 = 40 % + 4 cuotas, cada 15 días. El recargo y los días
        de gracia salen en el contrato que firman las clientas nuevas. <b>Valida el recargo y el contrato con un abogado.</b>
      </p>
      <Feedback value={feedback} />
      <button disabled={pending} className={buttonPrimary}>{pending ? "Guardando…" : "Guardar configuración"}</button>
    </form>
  );
}
