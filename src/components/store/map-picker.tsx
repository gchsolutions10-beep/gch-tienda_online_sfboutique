"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

/** Centro por defecto: Acarigua (Portuguesa). */
const DEFAULT: [number, number] = [9.5545, -69.1956];

/**
 * Mapa de OpenStreetMap con un pin que la clienta arrastra hasta su casa (o
 * toca «Usar mi ubicación»). Guarda latitud y longitud en campos ocultos.
 * Sin claves ni costos. Leaflet se carga solo en el navegador.
 */
export function MapPicker({ name = "", initial }: { name?: string; initial?: [number, number] | null }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [pos, setPos] = useState<[number, number] | null>(initial ?? null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !box.current || map.current) return;
      const start = initial ?? DEFAULT;
      const m = L.map(box.current, { scrollWheelZoom: false }).setView(start, initial ? 17 : 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);
      // Pin dibujado con CSS (no depende de imágenes de Leaflet).
      const icon = L.divIcon({ className: "", html: '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:var(--brand);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>', iconSize: [26, 26], iconAnchor: [13, 26] });
      const mk = L.marker(start, { draggable: true, icon, keyboard: true, title: "Tu ubicación" }).addTo(m);
      mk.on("dragend", () => {
        const ll = mk.getLatLng();
        setPos([ll.lat, ll.lng]);
      });
      m.on("click", (e) => {
        mk.setLatLng(e.latlng);
        setPos([e.latlng.lat, e.latlng.lng]);
      });
      map.current = m;
      marker.current = mk;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el mapa se crea una sola vez
  }, []);

  function locate() {
    if (!navigator.geolocation) return setStatus("Tu teléfono no permite ubicar. Mueve el pin a mano.");
    setStatus("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const ll: [number, number] = [p.coords.latitude, p.coords.longitude];
        marker.current?.setLatLng(ll);
        map.current?.setView(ll, 17);
        setPos(ll);
        setStatus("Listo. Si no quedó exacto, arrastra el pin.");
      },
      () => setStatus("No pudimos ubicarte (revisa el permiso). Mueve el pin a mano."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div>
      <div ref={box} className="isolate h-64 w-full overflow-hidden rounded-2xl border border-store-line" role="application" aria-label="Mapa: arrastra el pin hasta tu casa" />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={locate} className="rounded-full border-2 border-store-ink px-3 py-1.5 font-semibold">
          📍 Usar mi ubicación
        </button>
        <span className="text-store-muted">{status ?? (pos ? `Pin: ${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}` : "Toca el mapa o arrastra el pin hasta tu casa.")}</span>
      </div>
      <input type="hidden" name={`${name}latitude`} value={pos ? pos[0].toFixed(6) : ""} />
      <input type="hidden" name={`${name}longitude`} value={pos ? pos[1].toFixed(6) : ""} />
    </div>
  );
}
