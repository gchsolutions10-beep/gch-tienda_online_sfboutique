import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream px-4 text-center">
      <div>
        <p className="font-mono text-5xl font-bold text-brand">404</p>
        <h1 className="mt-3 font-display text-xl font-bold text-ink">No encontramos esta página</h1>
        <p className="mt-1 text-sm text-muted">Puede que el enlace esté mal escrito o que el negocio no exista.</p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
