"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { acceptAsGuarantor, loginCustomer, logoutCustomer, registerAccount, submitCreditApplication } from "@/server/actions/store/account";
import { MapPicker } from "@/components/store/map-picker";
import { prepareProofFile } from "@/lib/image-compress";
import { VE_STATES } from "@/lib/orders";
import { cn } from "@/components/ui/styles";

export const field =
  "w-full min-w-0 rounded-xl border-[1.5px] border-store-line bg-store-card px-3.5 py-2.5 text-sm text-store-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25";
export const label = "mb-1 block text-xs font-semibold uppercase tracking-wider text-store-muted";
const primary = "w-full rounded-full bg-brand px-5 py-3 font-semibold text-on-brand transition hover:brightness-110 disabled:opacity-60";

const get = (f: FormData, k: string) => String(f.get(k) ?? "");

function ErrorBox({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-semibold text-danger">
      {text}
    </p>
  ) : null;
}

/** Entrar o crear la cuenta (solo para comprar a crédito). */
export function AuthForms({ next }: { next: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r =
        tab === "login"
          ? await loginCustomer({ login: get(f, "login"), password: get(f, "password") })
          : await registerAccount({
              name: get(f, "name"),
              idDoc: get(f, "idDoc"),
              email: get(f, "email"),
              phone: get(f, "phone"),
              whatsapp: get(f, "whatsapp"),
              password: get(f, "password"),
              acceptPrivacy: f.get("acceptPrivacy") === "on",
            });
      if (!r.ok) return setError({ text: r.error, field: "field" in r ? r.field : undefined });
      router.replace(next);
      router.refresh();
    });
  }

  const err = (name: string) => error?.field === name;
  return (
    <div className="rounded-3xl bg-store-card p-5 shadow-sm sm:p-7">
      <div role="tablist" aria-label="Cuenta" className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-store-soft p-1">
        {(["login", "register"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => (setTab(t), setError(null))} className={cn("rounded-full py-2 text-sm font-semibold", tab === t && "bg-store-card shadow-sm")}>
            {t === "login" ? "Ya tengo cuenta" : "Crear cuenta"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} method="post" className="space-y-3" noValidate>
        {tab === "login" ? (
          <>
            <div>
              <label className={label} htmlFor="login">Correo o teléfono</label>
              <input id="login" name="login" autoComplete="username" required className={field} />
            </div>
            <div>
              <label className={label} htmlFor="password">Clave</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required className={field} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={label} htmlFor="name">Nombre y apellido (como en la cédula)</label>
              <input id="name" name="name" autoComplete="name" required aria-invalid={err("name")} className={field} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="idDoc">Cédula</label>
                <input id="idDoc" name="idDoc" required placeholder="V-12345678" aria-invalid={err("idDoc")} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="email">Correo</label>
                <input id="email" name="email" type="email" autoComplete="email" required aria-invalid={err("email")} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="phone">Teléfono</label>
                <input id="phone" name="phone" type="tel" autoComplete="tel" required placeholder="0414-1234567" aria-invalid={err("phone")} className={field} />
              </div>
              <div>
                <label className={label} htmlFor="whatsapp">WhatsApp (si es otro)</label>
                <input id="whatsapp" name="whatsapp" type="tel" placeholder="Igual al teléfono" aria-invalid={err("whatsapp")} className={field} />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="password">Clave (mínimo 8 caracteres)</label>
              <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-invalid={err("password")} className={field} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="acceptPrivacy" required className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span>
                Acepto la{" "}
                <Link href="/privacidad" target="_blank" className="font-semibold underline">
                  política de privacidad
                </Link>{" "}
                y que la tienda me contacte por WhatsApp para verificar mis datos.
              </span>
            </label>
          </>
        )}
        <ErrorBox text={error?.text ?? null} />
        <button disabled={pending} className={primary}>
          {pending ? "Un momento…" : tab === "login" ? "Entrar" : "Crear mi cuenta"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-store-muted">¿Vas a pagar de contado? No necesitas cuenta: compra directo desde la bolsa.</p>
    </div>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await logoutCustomer();
          router.replace("/");
          router.refresh();
        })
      }
      className="text-sm font-semibold text-store-muted hover:text-danger"
    >
      Cerrar sesión
    </button>
  );
}

export type ContractView = { title: string; body: string }[];

/** Expediente de crédito: dirección con pin, cédulas y datos del fiador, y aceptación del contrato. */
export function CreditApplicationForm({ contract }: { contract: ContractView }) {
  const router = useRouter();
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      for (const key of ["idPhoto", "guarantorPhoto"]) {
        const file = form.get(key);
        if (file instanceof File && file.size > 0) {
          const prepared = await prepareProofFile(file);
          if (!prepared.ok) return setError({ text: prepared.error, field: key });
          form.set(key, prepared.file);
        }
      }
      const r = await submitCreditApplication(form);
      if (!r.ok) return setError({ text: r.error, field: r.field });
      setDone(`${window.location.origin}${r.guarantorUrl}`);
      router.refresh();
    });
  }

  if (done) return <GuarantorLink url={done} />;

  return (
    <form onSubmit={submit} method="post" className="space-y-6" noValidate>
      <section className="space-y-3 rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
        <h2 className="font-display text-2xl font-semibold">1. Tu dirección</h2>
        <div>
          <label className={label} htmlFor="address">Dirección exacta</label>
          <textarea id="address" name="address" required rows={2} placeholder="Urbanización, calle, casa o apartamento, punto de referencia" className={field} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="city">Ciudad</label>
            <input id="city" name="city" required className={field} />
          </div>
          <div>
            <label className={label} htmlFor="state">Estado</label>
            <select id="state" name="state" required defaultValue="Portuguesa" className={field}>
              {VE_STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <MapPicker />
        <div>
          <label className={label} htmlFor="idPhoto">Foto de tu cédula (legible, por delante)</label>
          <input id="idPhoto" name="idPhoto" type="file" required accept="image/*,application/pdf" capture="environment" aria-invalid={error?.field === "idPhoto"} className="block w-full text-sm" />
        </div>
      </section>

      <section className="space-y-3 rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
        <h2 className="font-display text-2xl font-semibold">2. Tu fiador</h2>
        <p className="text-sm text-store-muted">
          Una persona de confianza que responde por el crédito si tú no pagas. Le llegará un enlace para que lea el contrato y acepte desde su propio teléfono.
        </p>
        <div>
          <label className={label} htmlFor="guarantorName">Nombre y apellido del fiador</label>
          <input id="guarantorName" name="guarantorName" required aria-invalid={error?.field === "guarantorName"} className={field} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="guarantorIdDoc">Cédula del fiador</label>
            <input id="guarantorIdDoc" name="guarantorIdDoc" required placeholder="V-12345678" aria-invalid={error?.field === "guarantorIdDoc"} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="guarantorPhone">Teléfono / WhatsApp del fiador</label>
            <input id="guarantorPhone" name="guarantorPhone" type="tel" required placeholder="0414-1234567" aria-invalid={error?.field === "guarantorPhone"} className={field} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="guarantorPhoto">Foto de la cédula del fiador</label>
          <input id="guarantorPhoto" name="guarantorPhoto" type="file" required accept="image/*,application/pdf" aria-invalid={error?.field === "guarantorPhoto"} className="block w-full text-sm" />
        </div>
      </section>

      <section className="space-y-3 rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
        <h2 className="font-display text-2xl font-semibold">3. Contrato</h2>
        <Contract paragraphs={contract} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="accept" required className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
          <span>
            <b>Leí y acepto los Términos y Condiciones de Crédito.</b> Entiendo que mi aceptación electrónica queda registrada con fecha, hora y dispositivo, y que
            la solicitud será revisada por la tienda.
          </span>
        </label>
        <ErrorBox text={error?.text ?? null} />
        <button disabled={pending} className={primary}>
          {pending ? "Enviando…" : "Enviar mi solicitud"}
        </button>
      </section>
    </form>
  );
}

export function Contract({ paragraphs }: { paragraphs: ContractView }) {
  return (
    <div tabIndex={0} aria-label="Texto del contrato" className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-store-line bg-store p-4 text-sm leading-relaxed">
      <p className="font-bold">TÉRMINOS Y CONDICIONES DE CRÉDITO Y RESGUARDO JURÍDICO (SF BOUTIQUE)</p>
      {paragraphs.map((p) => (
        <p key={p.title}>
          <b>{p.title}:</b> {p.body}
        </p>
      ))}
    </div>
  );
}

/** Después de enviar: el enlace para el fiador, listo para mandar por WhatsApp. */
export function GuarantorLink({ url, phone }: { url: string; phone?: string | null }) {
  const [copied, setCopied] = useState(false);
  const text = `Hola, te pido que seas mi fiador en Credi-SF. Lee el contrato y acepta aquí: ${url}`;
  return (
    <div className="space-y-3 rounded-3xl bg-store-card p-5 shadow-sm sm:p-6">
      <h2 className="font-display text-2xl font-semibold">✅ Falta un paso: tu fiador</h2>
      <p className="text-sm">Mándale este enlace a tu fiador. Cuando lo abra, confirme su cédula y acepte, la tienda revisa tu solicitud.</p>
      <p className="break-all rounded-xl bg-store-soft p-3 text-sm font-semibold">{url}</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/${phone ? phone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-[#1a7f45] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Enviar por WhatsApp
        </a>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}
          className="rounded-full border-2 border-store-ink px-4 py-2 text-sm font-semibold"
        >
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </button>
      </div>
    </div>
  );
}

/** El fiador confirma su cédula y acepta. */
export function GuarantorAcceptForm({ token, contract }: { token: string; contract: ContractView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await acceptAsGuarantor({ token, idDoc: get(f, "idDoc"), accept: f.get("accept") === "on" });
          if (!r.ok) return setError(r.error);
          router.refresh();
        });
      }}
      method="post"
      className="space-y-4"
    >
      <Contract paragraphs={contract} />
      <div>
        <label className={label} htmlFor="idDoc">Para confirmar que eres tú, escribe tu cédula</label>
        <input id="idDoc" name="idDoc" required placeholder="V-12345678" className={field} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" required className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
        <span>
          <b>Acepto constituirme en fiador principal pagador y codeudor solidario</b> en los términos de este contrato. Entiendo que mi aceptación electrónica queda
          registrada con fecha, hora y dispositivo.
        </span>
      </label>
      <ErrorBox text={error} />
      <button disabled={pending} className={primary}>
        {pending ? "Guardando…" : "Acepto ser fiador"}
      </button>
    </form>
  );
}
