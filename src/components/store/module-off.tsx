import Link from "next/link";

/** Pantalla para una sección cuyo módulo está apagado (o se entra por un enlace viejo). */
export function ModuleOff({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-5xl" aria-hidden>
        🌙
      </p>
      <h1 className="mt-4 font-display text-4xl font-semibold">{title}</h1>
      <p className="mt-3 text-store-muted">Esta sección no está disponible por ahora.</p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-brand px-6 py-3 font-semibold text-on-brand">
        Ir a la tienda
      </Link>
    </div>
  );
}
