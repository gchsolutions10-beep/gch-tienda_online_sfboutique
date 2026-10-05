"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/server/actions/auth";
import Link from "next/link";

const pill =
  "w-full rounded-full border-[1.5px] border-store-ink/40 bg-store-card px-5 py-3 text-center text-sm text-store-ink outline-none focus:border-brand-strong";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="mb-1.5 block text-center font-display text-sm font-bold">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className={pill}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-center font-display text-sm font-bold">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={pill}
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-2 text-center text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand py-3 font-display text-sm font-bold text-on-brand transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Inicia sesión"}
      </button>
      <Link
        href="/"
        className="block w-full rounded-full border-[1.5px] border-brand-strong py-3 text-center font-display text-sm font-bold text-brand-strong hover:bg-brand-soft"
      >
        Volver a la tienda
      </Link>
      <p className="text-center text-xs text-store-muted">¿Olvidaste tu contraseña? Pídele al administrador que te ponga una nueva.</p>
    </form>
  );
}
