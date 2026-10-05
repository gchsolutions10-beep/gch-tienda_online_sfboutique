import Link from "next/link";
import { logout } from "@/server/actions/auth";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";

export const metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream px-4">
      <div className="max-w-sm text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="mt-3 font-display text-xl font-bold text-ink">No tienes acceso a esta sección</h1>
        <p className="mt-2 text-sm text-muted">
          Tu usuario no tiene el rol necesario en este negocio. Pídele acceso al administrador.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className={buttonSecondary}>
            Ir a la tienda
          </Link>
          <form action={logout}>
            <button className={buttonPrimary}>Cambiar de usuario</button>
          </form>
        </div>
      </div>
    </main>
  );
}
