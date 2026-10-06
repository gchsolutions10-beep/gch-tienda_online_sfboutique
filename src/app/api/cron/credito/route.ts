import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { runCreditDaily } from "@/server/services/credit";

/**
 * Tarea diaria de Credi-SF (Vercel Cron, 9:00 a. m. de Venezuela; ver vercel.json):
 * recargos por mora, baja de nivel por mora y recordatorios push.
 * Vercel manda «Authorization: Bearer <CRON_SECRET>»; sin esa clave no corre.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = Boolean(secret) && auth.length === expected.length && timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!ok) return new Response("No autorizado", { status: 401 });

  // Negocios con créditos abiertos (aunque hayan apagado la venta a crédito, se sigue cobrando).
  const tenants = await db.creditPlan.findMany({ where: { status: "ACTIVE" }, distinct: ["tenantId"], select: { tenantId: true } });
  const results: Record<string, unknown> = {};
  for (const { tenantId } of tenants) {
    try {
      results[tenantId] = await runCreditDaily(tenantId);
    } catch (e) {
      console.error("cron credito", tenantId, e);
      results[tenantId] = { error: (e as Error).message };
    }
  }
  return Response.json({ ok: true, tenants: tenants.length, results });
}
