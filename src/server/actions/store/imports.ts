"use server";

import { z } from "zod";
import { getTenantFromRequest } from "@/server/tenant";
import { getCurrentCustomer } from "@/server/auth/customer-session";
import { clientIp, hit, tooManyMessage } from "@/server/services/rate-limit";
import { OrderError } from "@/server/services/orders";
import { acceptImportQuote, cancelImportRequest, createImportRequest, joinImportProduct, submitBatchReview } from "@/server/services/imports";
import { parseProductLink } from "@/lib/imports";
import { PROOF_MAX_BYTES, sniffImageMime } from "@/lib/files";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };

const fail = (error: string, field?: string) => ({ ok: false as const, error, field });

/** Clienta con sesión y límite de intentos; los errores de negocio vuelven como mensaje. */
async function asCustomer<T extends object>(run: (tenantId: string, customerId: string) => Promise<Result<T>>): Promise<Result<T>> {
  const tenant = await getTenantFromRequest();
  const me = await getCurrentCustomer(tenant.id);
  if (!me) return fail("Entra a tu cuenta para continuar.");
  const limit = await hit("customerAction", `${tenant.id}:${await clientIp()}`);
  if (!limit.ok) return fail(tooManyMessage(limit.retryAfterSec));
  try {
    return await run(tenant.id, me.id);
  } catch (e) {
    if (e instanceof OrderError) return fail(e.message);
    throw e;
  }
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const requestInput = z.object({
  batchId: text(40),
  url: z.string().trim().min(1, "Pega el enlace del producto").max(1000),
  title: text(120),
  size: text(30),
  color: text(40),
  quantity: z.coerce.number().int().min(1, "Cantidad mínima: 1").max(20, "Máximo 20 unidades por encargo"),
  notes: text(500),
  isPrivate: z.enum(["on", ""]).optional(),
  acceptTerms: z.literal("on", { message: "Debes aceptar las condiciones del servicio" }),
});

/** Encargo con enlace (y foto opcional). Queda en revisión hasta que la tienda cotiza. */
export async function requestImport(formData: FormData): Promise<Result> {
  const parsed = requestInput.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Revisa los datos", String(issue?.path[0] ?? ""));
  }
  const d = parsed.data;
  const link = parseProductLink(d.url);
  if (!link) return fail("Pega el enlace completo del producto (empieza con https://)", "url");
  const file = formData.get("photo");
  let photo: { data: Uint8Array<ArrayBuffer>; mime: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > PROOF_MAX_BYTES) return fail("La foto pesa más de 1.5 MB", "photo");
    const data = new Uint8Array(await file.arrayBuffer());
    const mime = sniffImageMime(data);
    if (!mime) return fail("La foto debe ser JPG, PNG o WebP", "photo");
    photo = { data, mime };
  }
  return asCustomer(async (tenantId, customerId) => {
    await createImportRequest(tenantId, customerId, {
      batchId: d.batchId,
      url: link.url,
      store: link.store,
      title: d.title,
      size: d.size,
      color: d.color,
      quantity: d.quantity,
      notes: d.notes,
      isPrivate: d.isPrivate === "on",
      photo,
    });
    return { ok: true };
  });
}

const joinInput = z.object({
  productId: z.string().min(1).max(40),
  size: text(30),
  color: text(40),
  quantity: z.coerce.number().int().min(1).max(20),
  notes: text(300),
  acceptTerms: z.literal(true, { message: "Debes aceptar las condiciones del servicio" }),
});

/** «Unirme al pedido» de un producto publicado. */
export async function joinImport(raw: unknown): Promise<Result> {
  const parsed = joinInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos");
  const d = parsed.data;
  return asCustomer(async (tenantId, customerId) => {
    await joinImportProduct(tenantId, customerId, d.productId, { size: d.size, color: d.color, quantity: d.quantity, notes: d.notes });
    return { ok: true };
  });
}

/** Acepta la cotización: crea el pedido y devuelve su enlace de pago. */
export async function acceptQuote(requestId: string): Promise<Result<{ trackingToken: string }>> {
  return asCustomer(async (tenantId, customerId) => {
    const order = await acceptImportQuote(tenantId, customerId, String(requestId));
    return { ok: true, trackingToken: order.trackingToken };
  });
}

export async function cancelImport(requestId: string): Promise<Result> {
  return asCustomer(async (tenantId, customerId) => {
    await cancelImportRequest(tenantId, customerId, String(requestId));
    return { ok: true };
  });
}

const reviewInput = z.object({
  batchId: z.string().min(1).max(40),
  rating: z.coerce.number().int().min(1, "Elige de 1 a 5 estrellas").max(5),
  body: z.string().trim().min(10, "Cuéntanos un poco más (mínimo 10 letras)").max(600),
});

export async function reviewBatch(raw: unknown): Promise<Result> {
  const parsed = reviewInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos");
  const d = parsed.data;
  return asCustomer(async (tenantId, customerId) => {
    await submitBatchReview(tenantId, customerId, d.batchId, d.rating, d.body);
    return { ok: true };
  });
}
