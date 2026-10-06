import { ImageResponse } from "next/og";
import { getTenant } from "@/server/tenant";
import { tenantDb } from "@/server/db";
import { textOnColor } from "@/lib/color";

const SIZES = new Set([96, 180, 192, 512]);

/**
 * Ícono de la app instalable con la marca: el logo (PNG/JPG) sobre el color
 * principal o, si no hay logo compatible, las iniciales. «?maskable=1» deja el
 * margen de seguridad que Android recorta en círculo o gota.
 */
export async function GET(request: Request, { params }: RouteContext<"/t/[domain]/icono/[size]">) {
  const { domain, size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("No encontrado", { status: 404 });
  const maskable = new URL(request.url).searchParams.get("maskable") === "1";
  const tenant = await getTenant(domain);
  const brand = /^#[0-9a-f]{6}$/i.test(tenant.primaryColor) ? tenant.primaryColor : "#7B2F9E";
  const logo = await tenantDb(tenant.id).tenantAsset.findFirst({ where: { kind: "logo" }, select: { mimeType: true, data: true } });
  // El generador de imágenes acepta PNG y JPG (no WebP).
  const src = logo && /^image\/(png|jpeg)$/.test(logo.mimeType) ? `data:${logo.mimeType};base64,${Buffer.from(logo.data).toString("base64")}` : null;
  const initials = tenant.name
    .split(/\s+/)
    .filter((w) => /^[a-záéíóúñ]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  const inner = Math.round(size * (maskable ? 0.6 : 0.78));

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: src ? "#ffffff" : brand }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen dentro del generador de íconos
          <img src={src} width={inner} height={inner} style={{ objectFit: "contain" }} alt="" />
        ) : (
          <span style={{ color: textOnColor(brand), fontSize: Math.round(inner * 0.5), fontWeight: 700, letterSpacing: -2 }}>{initials || "★"}</span>
        )}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
