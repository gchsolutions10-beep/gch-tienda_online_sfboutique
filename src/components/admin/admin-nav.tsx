"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/styles";

/** phase: módulo diseñado (tablas listas) que se construye en esa fase. */
const ITEMS: { href: string; label: string; icon: string; phase?: number; ownerOnly?: boolean }[] = [
  { href: "/admin", label: "Resumen", icon: "📊" },
  { href: "/admin/tasas", label: "Tasas BCV / P2P", icon: "💱" },
  { href: "#productos", label: "Productos y stock", icon: "👗", phase: 2 },
  { href: "#pedidos", label: "Pedidos", icon: "🧾", phase: 2 },
  { href: "#clientes", label: "Clientes (CRM)", icon: "👥", phase: 3 },
  { href: "#caja", label: "Caja y cuentas", icon: "💵", phase: 3 },
  { href: "#facturas", label: "Facturación", icon: "📑", phase: 4 },
  { href: "#blog", label: "Blog y lookbook", icon: "📝", phase: 4 },
  { href: "/admin/apariencia", label: "Apariencia", icon: "🎨", ownerOnly: true },
];

export function AdminNav({ owner }: { owner: boolean }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => owner || !i.ownerOnly);
  const active = items.filter((i) => !i.phase && (pathname === i.href || pathname.startsWith(`${i.href}/`))).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto">
      {items.map((item) =>
        item.phase ? (
          <span key={item.label} className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted/70" title={`Se construye en la fase ${item.phase}`}>
            <span aria-hidden>{item.icon}</span>
            {item.label}
            <span className="ml-auto hidden rounded bg-cream px-1.5 text-[10px] font-semibold lg:inline">Fase {item.phase}</span>
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active === item.href ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              active === item.href ? "bg-brand-soft font-semibold text-brand-strong" : "text-ink hover:bg-cream",
            )}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
