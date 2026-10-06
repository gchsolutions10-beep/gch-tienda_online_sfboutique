"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { removePushSubscription, savePushSubscription } from "@/server/actions/store/account";

/** Registra el service worker (offline básico y avisos push). Va en el layout de la tienda. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);
  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
}

const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * «Instalar la app»: en Android/Chrome abre el diálogo del sistema; en iPhone
 * explica «Compartir → Agregar a inicio» (Safari no tiene botón propio).
 */
export function InstallButton({ storeName }: { storeName: string }) {
  const canPrompt = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred !== null,
    () => false,
  );
  const standalone = useSyncExternalStore(() => () => {}, isStandalone, () => true);
  const ios = useSyncExternalStore(() => () => {}, isIos, () => false);
  const [help, setHelp] = useState(false);

  if (standalone || (!canPrompt && !ios)) return null;
  return (
    <div className="rounded-2xl bg-store-soft p-4 text-sm">
      <p className="font-semibold">📲 Instala {storeName} en tu teléfono</p>
      <p className="mt-1 text-store-muted">Ábrela como una app, sin buscarla en el navegador, y recibe los avisos de tus cuotas.</p>
      {ios ? (
        help ? (
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Toca <b>Compartir</b> (el cuadro con la flecha ⬆️) abajo en Safari.
            </li>
            <li>
              Elige <b>«Agregar a inicio»</b> y luego <b>Agregar</b>.
            </li>
            <li>Abre la app desde tu pantalla de inicio y activa los avisos aquí en «Mi cuenta».</li>
          </ol>
        ) : (
          <button type="button" onClick={() => setHelp(true)} className="mt-2 rounded-full bg-brand px-4 py-2 font-semibold text-on-brand">
            Cómo instalarla
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={async () => {
            await deferred?.prompt();
            deferred = null;
            listeners.forEach((l) => l());
          }}
          className="mt-2 rounded-full bg-brand px-4 py-2 font-semibold text-on-brand"
        >
          Instalar la app
        </button>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Activar o desactivar los avisos push de cobranza en este teléfono. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<"loading" | "unsupported" | "ios-install" | "denied" | "off" | "on">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  if (!publicKey) return null;

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey!) });
      const r = await savePushSubscription(sub.toJSON());
      if (!r.ok) throw new Error(r.error);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron activar los avisos");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
    setBusy(false);
  }

  return (
    <div className="rounded-2xl bg-store-soft p-4 text-sm">
      <p className="font-semibold">🔔 Avisos en este teléfono</p>
      {state === "on" ? (
        <>
          <p className="mt-1 text-store-muted">Activados: te avisamos de tus cuotas, tus pagos y tus encargos (cotización lista, llegada).</p>
          <button type="button" disabled={busy} onClick={disable} className="mt-2 text-sm font-semibold text-store-muted underline">
            Desactivar
          </button>
        </>
      ) : state === "off" ? (
        <>
          <p className="mt-1 text-store-muted">Recibe un recordatorio antes de cada vencimiento y la confirmación de tus pagos.</p>
          <button type="button" disabled={busy} onClick={enable} className="mt-2 rounded-full bg-brand px-4 py-2 font-semibold text-on-brand">
            {busy ? "Activando…" : "Activar avisos"}
          </button>
        </>
      ) : state === "ios-install" ? (
        <p className="mt-1 text-store-muted">En iPhone, primero instala la app (arriba) y ábrela desde tu pantalla de inicio para poder activar los avisos.</p>
      ) : state === "denied" ? (
        <p className="mt-1 text-store-muted">Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para este sitio.</p>
      ) : state === "unsupported" ? (
        <p className="mt-1 text-store-muted">Este navegador no admite avisos. Prueba con Chrome en Android o instala la app en iPhone.</p>
      ) : null}
      {error ? <p className="mt-2 text-danger">{error}</p> : null}
    </div>
  );
}
