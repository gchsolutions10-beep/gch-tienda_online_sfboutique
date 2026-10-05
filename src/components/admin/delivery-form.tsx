"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveDeliverySettings } from "@/server/actions/admin/delivery";
import { buttonPrimary, card, cn, inputBase, inputClass, labelClass } from "@/components/ui/styles";

export type DeliveryFormValues = {
  pickupEnabled: boolean;
  pickupInfo: string;
  localDeliveryEnabled: boolean;
  localDeliveryUsd: string;
  localDeliveryArea: string;
  nationalShippingEnabled: boolean;
  nationalShippingUsd: string;
  freeShippingFromUsd: string;
  reservationHours: number;
};

export function DeliveryForm({ values }: { values: DeliveryFormValues }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const on = (k: string) => f.get(k) === "on";
    setMessage(null);
    start(async () => {
      const r = await saveDeliverySettings({
        pickupEnabled: on("pickupEnabled"),
        pickupInfo: get("pickupInfo"),
        localDeliveryEnabled: on("localDeliveryEnabled"),
        localDeliveryUsd: get("localDeliveryUsd"),
        localDeliveryArea: get("localDeliveryArea"),
        nationalShippingEnabled: on("nationalShippingEnabled"),
        nationalShippingUsd: get("nationalShippingUsd"),
        freeShippingFromUsd: get("freeShippingFromUsd"),
        reservationHours: Number(get("reservationHours")),
      });
      setMessage(r.ok ? { ok: true, text: "✓ Guardado" } : { ok: false, text: r.error });
    });
  }

  const block = cn(card, "space-y-3 p-5");
  return (
    <form onSubmit={submit} className="max-w-3xl space-y-4">
      <section className={block}>
        <label className="flex items-center gap-2 text-lg font-bold">
          <input type="checkbox" name="pickupEnabled" defaultChecked={values.pickupEnabled} className="size-5" /> 🛍️ Retiro en tienda
        </label>
        <div>
          <label className={labelClass} htmlFor="pickupInfo">Dirección y horario (lo ve la clienta)</label>
          <input id="pickupInfo" name="pickupInfo" defaultValue={values.pickupInfo} placeholder="Av. Libertador, C.C. … Lunes a sábado 9:00 a 6:00" className={inputClass} />
        </div>
      </section>

      <section className={block}>
        <label className="flex items-center gap-2 text-lg font-bold">
          <input type="checkbox" name="localDeliveryEnabled" defaultChecked={values.localDeliveryEnabled} className="size-5" /> 🛵 Delivery en la ciudad
        </label>
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div>
            <label className={labelClass} htmlFor="localDeliveryUsd">Costo (USD)</label>
            <input id="localDeliveryUsd" name="localDeliveryUsd" inputMode="decimal" defaultValue={values.localDeliveryUsd} placeholder="3,00" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="localDeliveryArea">Zona que cubre</label>
            <input id="localDeliveryArea" name="localDeliveryArea" defaultValue={values.localDeliveryArea} placeholder="Acarigua y Araure" className={inputClass} />
          </div>
        </div>
      </section>

      <section className={block}>
        <label className="flex items-center gap-2 text-lg font-bold">
          <input type="checkbox" name="nationalShippingEnabled" defaultChecked={values.nationalShippingEnabled} className="size-5" /> 📦 Envío nacional (MRW, Zoom, Tealca…)
        </label>
        <div>
          <label className={labelClass} htmlFor="nationalShippingUsd">Costo (USD)</label>
          <input id="nationalShippingUsd" name="nationalShippingUsd" inputMode="decimal" defaultValue={values.nationalShippingUsd} placeholder="Vacío = cobro a destino" className={cn(inputBase, "w-48")} />
          <p className="mt-1 text-xs text-muted">Déjalo vacío si la clienta paga el envío al retirar en la agencia (cobro a destino).</p>
        </div>
      </section>

      <section className={cn(card, "grid gap-4 p-5 sm:grid-cols-2")}>
        <div>
          <label className={labelClass} htmlFor="freeShippingFromUsd">Envío gratis desde (USD)</label>
          <input id="freeShippingFromUsd" name="freeShippingFromUsd" inputMode="decimal" defaultValue={values.freeShippingFromUsd} placeholder="Vacío = nunca" className={inputClass} />
          <p className="mt-1 text-xs text-muted">Aplica al delivery y al envío con costo fijo.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="reservationHours">Apartar el stock sin pago por (horas)</label>
          <input id="reservationHours" name="reservationHours" type="number" min={1} max={168} defaultValue={values.reservationHours} className={inputClass} />
          <p className="mt-1 text-xs text-muted">Si no reporta el pago en ese tiempo, el pedido se anula y las prendas vuelven a estar disponibles.</p>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button disabled={pending} className={cn(buttonPrimary, "px-6 py-2.5")}>{pending ? "Guardando…" : "Guardar"}</button>
        {message ? <p role={message.ok ? "status" : "alert"} className={cn("text-sm font-semibold", message.ok ? "text-ok" : "text-danger")}>{message.text}</p> : null}
      </div>
    </form>
  );
}
