import webpush from "web-push";
import { db, tenantDb } from "@/server/db";

/**
 * Notificaciones push (estándar Web Push con llaves VAPID, sin Firebase).
 * Variables en Vercel: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y
 * VAPID_SUBJECT (mailto:correo). Se generan con `npx web-push generate-vapid-keys`.
 * Sin llaves, el envío se omite en silencio (todo lo demás sigue funcionando).
 */
let configured: boolean | null = null;
export function pushEnabled(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:soporte@gchsolutions.com", pub, priv);
  return (configured = true);
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Envía a todos los dispositivos de la clienta. Borra las suscripciones vencidas. Devuelve cuántos recibieron. */
export async function sendPushToCustomer(tenantId: string, customerId: string, payload: PushPayload): Promise<number> {
  if (!pushEnabled()) return 0;
  const subs = await tenantDb(tenantId).pushSubscription.findMany({ where: { customerId }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
      delivered += 1;
      await db.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date() } });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410: el teléfono ya no acepta (desinstaló o revocó el permiso).
      if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else console.error("push", status, (e as Error).message);
    }
  }
  return delivered;
}
