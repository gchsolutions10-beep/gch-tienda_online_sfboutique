"use client";

import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/components/ui/styles";

/**
 * Guion de prueba de punta a punta. Las casillas se guardan en este
 * navegador (localStorage) para retomar la prueba otro día.
 */

type Test = { id: string; text: string };
type Group = { title: string; who: string; tests: Test[] };

export const TEST_SCRIPT: Group[] = [
  {
    title: "1. Puesta en marcha",
    who: "Dueña · panel",
    tests: [
      { id: "a1", text: "Entra con el usuario administrador. En el Resumen ves las ventas de hoy y los pendientes." },
      { id: "a2", text: "Tasas BCV / P2P: carga la tasa BCV del día (y una P2P). La franja de arriba de la tienda muestra la tasa nueva." },
      { id: "a3", text: "Escribe una tasa 10 veces más alta: el sistema pide confirmar. Cancela." },
      { id: "a4", text: "Apariencia: elige otra paleta y guarda. Abre la tienda y verifica que cambió. Vuelve a la original." },
      { id: "a5", text: "Cuentas de cobro: crea un Pago Móvil de prueba marcado «en la tienda en línea»." },
      { id: "a6", text: "Envíos y entregas: revisa retiro, delivery y envío nacional; pon «envío gratis desde» $50." },
      { id: "a7", text: "Facturación → Configuración: carga razón social, RIF y domicilio fiscal. Prueba un RIF con el último dígito mal: debe rechazarlo." },
    ],
  },
  {
    title: "2. Productos y stock",
    who: "Dueña o encargada",
    tests: [
      { id: "b1", text: "Productos y stock → «+ Nuevo producto»: precio $25, costo $10, tallas S-M-L en dos colores con stock 2 en cada una." },
      { id: "b2", text: "Sube 2 fotos verticales y asígnale un color a una. En la tienda, al elegir ese color, sale su foto." },
      { id: "b3", text: "Pon en 0 una talla: en la tienda sale tachada. Deja el producto con 3 unidades o menos en total: sale «¡Últimas unidades!»." },
      { id: "b4", text: "Desactiva el producto: desaparece de la tienda. Actívalo de nuevo." },
    ],
  },
  {
    title: "3. Compra en línea",
    who: "Clienta · desde el celular",
    tests: [
      { id: "c1", text: "Abre la tienda en el celular, filtra por talla y color, y agrega 2 prendas a la bolsa." },
      { id: "c2", text: "«Finalizar compra» con retiro en tienda: pon una cédula y un WhatsApp. Verifica el total en $ y en Bs." },
      { id: "c3", text: "Cambia a envío nacional: elige agencia y estado; el costo del envío se suma (o sale gratis si pasa del monto)." },
      { id: "c4", text: "«Confirmar pedido»: se abre la página del pedido con el tiempo que queda apartado." },
      { id: "c5", text: "Elige Pago Móvil, copia los datos con un toque y «Reportar pago» con una referencia y una captura cualquiera." },
      { id: "c6", text: "Si el IGTF está activo, elige Zelle: el monto a pagar trae el 3 % sumado y lo explica." },
    ],
  },
  {
    title: "4. Atender el pedido",
    who: "Encargada o vendedora",
    tests: [
      { id: "d1", text: "Pedidos → «Pagos por verificar»: abre el pedido y «Ver comprobante»." },
      { id: "d2", text: "«✓ Confirmar: llegó a la cuenta»: el pedido pasa a Pagado y el stock baja." },
      { id: "d3", text: "«Empezar a preparar» → «Marcar enviado» con un número de guía → «Marcar entregado»." },
      { id: "d4", text: "En el celular de la clienta, la página del pedido muestra cada paso y la guía." },
      { id: "d5", text: "Haz otro pedido y en el panel toca «No llegó» con un motivo: vuelve a «Esperando pago»." },
      { id: "d6", text: "Anula un pedido sin pagar: la ropa apartada vuelve a estar disponible." },
    ],
  },
  {
    title: "5. Venta en la tienda física",
    who: "Vendedora",
    tests: [
      { id: "e1", text: "Caja → «Abrir turno» con Bs 500 y $20 de fondo." },
      { id: "e2", text: "Vende una prenda con 10 % de descuento, pagando la mitad por Pago Móvil y el resto en efectivo USD con un billete grande." },
      { id: "e3", text: "Verifica el vuelto (pruébalo en Bs y en dólares) y que el stock bajó." },
      { id: "e4", text: "Después de cobrar, toca «📑 Emitir factura» y emítela a una clienta con cédula." },
      { id: "e5", text: "«↕ Entrada / salida de efectivo»: registra una salida de $5 (ej. delivery)." },
      { id: "e6", text: "«Cerrar turno»: cuenta el efectivo con $1 de menos. El cierre muestra la diferencia por moneda e imprímelo." },
    ],
  },
  {
    title: "6. Facturación",
    who: "Dueña",
    tests: [
      { id: "f1", text: "Facturación → «Pedidos pagados sin factura» → «Facturar». Revisa los montos en Bs y emite." },
      { id: "f2", text: "En la factura toca «Imprimir»: sale limpia, sin el menú del panel." },
      { id: "f3", text: "Con imprenta digital: anota el número de control. Intenta cambiarlo después: no lo permite." },
      { id: "f4", text: "«Nota de crédito (devolución)» por 1 prenda. Intenta devolver más de las facturadas: no lo permite." },
      { id: "f5", text: "Libro de ventas: la nota de crédito resta. Descarga el «Excel (CSV)» y ábrelo." },
    ],
  },
  {
    title: "7. Contenido",
    who: "Dueña o contenido",
    tests: [
      { id: "g1", text: "Blog → «+ Nuevo artículo»: escribe un texto con un título y una lista, guarda como borrador y sube una portada y una foto." },
      { id: "g2", text: "Agrega 2 prendas en «Consigue este look» y prográmalo para mañana: en la tienda todavía no sale." },
      { id: "g3", text: "Cámbialo a «Publicar ahora»: sale en el blog con las prendas al final." },
      { id: "g4", text: "Portada y banners → «+ Nuevo banner» desde hoy hasta dentro de una semana: sale en el inicio de la tienda." },
      { id: "g5", text: "Cambia el orden de las tarjetas de la portada y verifica en la tienda." },
    ],
  },
  {
    title: "8. Reportes y clientas",
    who: "Dueña",
    tests: [
      { id: "h1", text: "Reportes → «Últimos 7 días»: revisa ventas, utilidad y lo más vendido por talla y color." },
      { id: "h2", text: "Revisa «Lo cobrado en bolívares, ¿cuánto vale de verdad?» (necesita la tasa P2P cargada)." },
      { id: "h3", text: "Descarga «Ventas en Excel (CSV)» y ábrelo." },
      { id: "h4", text: "Clientes (CRM): abre la ficha de la clienta de prueba: ve su historial y agrégale una nota de seguimiento." },
      { id: "h5", text: "Seguridad: en el login pon mal la contraseña varias veces con un correo de prueba: debe bloquear un rato." },
    ],
  },
];

const listeners = new Set<() => void>();
const storageKey = () => `gch-test-script:v1:${window.location.host}`;
let cache: string | null = null;

function readRaw(): string {
  if (cache !== null) return cache;
  try {
    cache = window.localStorage.getItem(storageKey()) ?? "[]";
  } catch {
    cache = "[]";
  }
  return cache;
}

function writeIds(ids: string[]) {
  cache = JSON.stringify(ids);
  try {
    window.localStorage.setItem(storageKey(), cache);
  } catch {
    // Sin storage: las casillas duran mientras la página esté abierta.
  }
  listeners.forEach((l) => l());
}

export function TestScript() {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readRaw,
    () => "[]",
  );
  const done = new Set<string>(JSON.parse(raw) as string[]);
  const total = TEST_SCRIPT.reduce((a, g) => a + g.tests.length, 0);

  const toggle = useCallback((id: string) => {
    const current = new Set<string>(JSON.parse(readRaw()) as string[]);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    writeIds([...current]);
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <b>
            {done.size} de {total}
          </b>{" "}
          pruebas hechas
        </p>
        <button type="button" onClick={() => confirm("¿Desmarcar todas las pruebas?") && writeIds([])} className="text-xs font-semibold text-muted hover:text-danger">
          Reiniciar
        </button>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream" aria-hidden>
        <div className="h-full rounded-full bg-ok" style={{ width: `${(done.size / total) * 100}%` }} />
      </div>
      <div className="mt-4 space-y-5">
        {TEST_SCRIPT.map((g) => (
          <fieldset key={g.title}>
            <legend className="font-display font-bold">
              {g.title} <span className="text-xs font-normal text-muted">· {g.who}</span>
            </legend>
            <ul className="mt-2 space-y-1.5">
              {g.tests.map((t) => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" checked={done.has(t.id)} onChange={() => toggle(t.id)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" />
                    <span className={cn(done.has(t.id) && "text-muted line-through")}>{t.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
