"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setModule } from "@/server/actions/admin/modules";
import { card, cn } from "@/components/ui/styles";

type Item = { key: "imports" | "credit"; title: string; icon: string; description: string; when: string; manage: string; enabled: boolean; note?: string | null };

/** Interruptores de los módulos: se guardan al tocarlos. */
export function ModuleSwitches({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="max-w-3xl space-y-4">
      {items.map((m) => (
        <section key={m.key} className={cn(card, "flex flex-wrap items-start gap-4 p-5", m.enabled && "border-brand")}>
          <span className="text-3xl" aria-hidden>
            {m.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`m-${m.key}`} className="text-lg font-bold">{m.title}</h2>
            <p className="text-sm text-muted">{m.description}</p>
            <p className="mt-2 text-xs text-muted">{m.when}</p>
            {m.note ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-950">{m.note}</p> : null}
            <Link href={m.manage} className="mt-2 inline-block text-sm font-semibold text-brand-strong underline">
              Ir a gestionar →
            </Link>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={m.enabled}
            aria-labelledby={`m-${m.key}`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await setModule({ module: m.key, enabled: !m.enabled });
                setError(r.ok ? null : r.error);
                router.refresh();
              })
            }
            className={cn("relative h-8 w-14 shrink-0 rounded-full transition", m.enabled ? "bg-brand" : "bg-line")}
          >
            <span className={cn("absolute top-1 size-6 rounded-full bg-white shadow transition-all", m.enabled ? "left-7" : "left-1")} />
            <span className="sr-only">{m.enabled ? "Activado" : "Apagado"}</span>
          </button>
          <p className={cn("w-full text-right text-xs font-semibold sm:w-auto", m.enabled ? "text-ok" : "text-muted")}>{m.enabled ? "Activado" : "Apagado"}</p>
        </section>
      ))}
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
