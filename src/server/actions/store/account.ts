"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { db, tenantDb } from "@/server/db";
import { getTenantFromRequest } from "@/server/tenant";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/server/auth/password";
import { createCustomerSession, destroyCustomerSession, getCurrentCustomer } from "@/server/auth/customer-session";
import { clientIp, hit, resetLimit, tooManyMessage } from "@/server/services/rate-limit";
import { getCreditSettings } from "@/server/services/credit";
import { getModules } from "@/server/queries/modules";
import { CONTRACT_VERSION, contractText } from "@/lib/credit-contract";
import { centsToDecimalString } from "@/lib/money";
import { formatVeId, normalizeVePhone, parseVeId } from "@/lib/ve-ids";
import { sniffProofMime, PROOF_MAX_BYTES } from "@/lib/files";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };

const fail = (error: string, field?: string) => ({ ok: false as const, error, field });

// ───────────────────────────── Cuenta ─────────────────────────────

const registerInput = z.object({
  name: z.string().trim().min(5, "Escribe tu nombre y apellido").max(80),
  idDoc: z.string().trim().max(20),
  email: z.string().trim().toLowerCase().email("Revisa tu correo").max(120),
  phone: z.string().trim().max(25),
  whatsapp: z.string().trim().max(25),
  password: z.string().min(8, "La clave debe tener al menos 8 caracteres").max(200),
  acceptPrivacy: z.literal(true, { message: "Debes aceptar la política de privacidad" }),
});

/**
 * Registro de la clienta (solo para comprar a crédito). Si ya compró antes con
 * ese teléfono, se usa su ficha del CRM. La tienda confirma el teléfono al
 * revisar la solicitud de crédito.
 */
export async function registerAccount(raw: unknown): Promise<Result> {
  const parsed = registerInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Revisa los datos", String(issue?.path[0] ?? ""));
  }
  const d = parsed.data;
  const id = parseVeId(d.idDoc);
  if (!id) return fail("Escribe tu cédula, por ejemplo V-12345678", "idDoc");
  const phone = normalizeVePhone(d.phone);
  if (!phone) return fail("Escribe un teléfono venezolano válido, por ejemplo 0414-1234567", "phone");
  const whatsapp = d.whatsapp ? normalizeVePhone(d.whatsapp) : phone;
  if (!whatsapp) return fail("Revisa el número de WhatsApp", "whatsapp");

  const tenant = await getTenantFromRequest();
  const modules = await getModules(tenant.id);
  if (!modules.credit && !modules.imports) return fail("Las cuentas no están disponibles por ahora.");
  const limit = await hit("checkout", `registro:${tenant.id}:${await clientIp()}`);
  if (!limit.ok) return fail(tooManyMessage(limit.retryAfterSec));
  const tdb = tenantDb(tenant.id);

  const existing = await tdb.customer.findFirst({ where: { phone }, select: { id: true, passwordHash: true, idNumber: true } });
  if (existing?.passwordHash) return fail("Ya hay una cuenta con ese teléfono. Entra con tu clave.", "phone");
  // Ficha del CRM con otra cédula: no se le pisan los datos a otra persona.
  if (existing?.idNumber && existing.idNumber !== id.number) return fail("Ese teléfono ya está registrado con otra cédula. Escríbenos por WhatsApp para ayudarte.", "phone");
  const emailTaken = await tdb.customer.findFirst({ where: { email: d.email, passwordHash: { not: null }, NOT: existing ? { id: existing.id } : undefined }, select: { id: true } });
  if (emailTaken) return fail("Ya hay una cuenta con ese correo. Entra con tu clave.", "email");

  const [firstName, ...rest] = d.name.split(/\s+/);
  const data = {
    firstName,
    lastName: rest.join(" ") || null,
    idType: id.type,
    idNumber: id.number,
    email: d.email,
    whatsapp,
    passwordHash: await hashPassword(d.password),
    accountCreatedAt: new Date(),
  };
  const customer = existing
    ? await tdb.customer.update({ where: { id: existing.id }, data, select: { id: true } })
    : await tdb.customer.create({ data: { ...data, tenantId: tenant.id, phone, source: "WEB" }, select: { id: true } });
  await createCustomerSession(tenant.id, customer.id);
  return { ok: true };
}

const loginInput = z.object({ login: z.string().trim().min(3, "Escribe tu correo o teléfono").max(120), password: z.string().min(1, "Escribe tu clave").max(200) });

const INVALID = "Correo/teléfono o clave incorrectos";

export async function loginCustomer(raw: unknown): Promise<Result> {
  const parsed = loginInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? INVALID);
  const tenant = await getTenantFromRequest();
  const login = parsed.data.login.toLowerCase();
  const phone = normalizeVePhone(login);
  const ip = await clientIp();
  for (const check of [await hit("loginIp", `clienta:${ip}`), await hit("loginAccount", `clienta:${tenant.id}:${phone ?? login}`)]) {
    if (!check.ok) return fail(tooManyMessage(check.retryAfterSec));
  }
  const customer = await tenantDb(tenant.id).customer.findFirst({
    where: { passwordHash: { not: null }, ...(phone ? { phone } : { email: login }) },
    select: { id: true, passwordHash: true },
  });
  const valid = await verifyPassword(parsed.data.password, customer?.passwordHash ?? DUMMY_HASH);
  if (!customer || !valid) return fail(INVALID);
  await resetLimit("loginAccount", `clienta:${tenant.id}:${phone ?? login}`);
  await createCustomerSession(tenant.id, customer.id);
  return { ok: true };
}

export async function logoutCustomer(): Promise<Result> {
  await destroyCustomerSession();
  return { ok: true };
}

// ───────────────────────────── Solicitud de crédito ─────────────────────────────

const applicationInput = z.object({
  address: z.string().trim().min(10, "Escribe tu dirección exacta (calle, casa, punto de referencia)").max(300),
  city: z.string().trim().min(2, "Escribe la ciudad").max(60),
  state: z.string().trim().min(2, "Elige el estado").max(40),
  latitude: z.string().max(20),
  longitude: z.string().max(20),
  guarantorName: z.string().trim().min(5, "Escribe el nombre y apellido del fiador").max(80),
  guarantorIdDoc: z.string().trim().max(20),
  guarantorPhone: z.string().trim().max(25),
  accept: z.literal("on", { message: "Debes leer y aceptar los términos del crédito" }),
});

async function readId(file: FormDataEntryValue | null, who: string) {
  if (!(file instanceof File) || file.size === 0) return { error: `Sube la foto de la cédula ${who}` };
  if (file.size > PROOF_MAX_BYTES) return { error: `La foto de la cédula ${who} pesa más de 1.5 MB` };
  const data = new Uint8Array(await file.arrayBuffer());
  const mime = sniffProofMime(data);
  if (!mime) return { error: `La cédula ${who} debe ser una foto (JPG, PNG) o un PDF` };
  return { data, mime };
}

const coord = (s: string, max: number) => {
  const n = Number(s);
  return s && Number.isFinite(n) && Math.abs(n) <= max ? n.toFixed(6) : null;
};

/**
 * La clienta envía su expediente: dirección con el pin del mapa, su cédula y
 * los datos y la cédula del fiador. Acepta el contrato (se guarda la versión,
 * el hash del texto, la fecha, la IP y el dispositivo) y queda un enlace para
 * que el fiador acepte desde su propio teléfono.
 */
export async function submitCreditApplication(formData: FormData): Promise<Result<{ guarantorUrl: string }>> {
  const tenant = await getTenantFromRequest();
  if (!(await getModules(tenant.id)).credit) return fail("La compra a crédito no está disponible por ahora.");
  const me = await getCurrentCustomer(tenant.id);
  if (!me) return fail("Entra a tu cuenta para solicitar el crédito");
  const parsed = applicationInput.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Revisa los datos", String(issue?.path[0] ?? ""));
  }
  const d = parsed.data;
  if (!me.idNumber || !me.phone) return fail("Completa tu cédula y teléfono en tu cuenta");
  if (!coord(d.latitude, 90) || !coord(d.longitude, 180)) return fail("Marca tu casa en el mapa: toca el mapa, arrastra el pin o usa «Usar mi ubicación»", "latitude");
  const g = parseVeId(d.guarantorIdDoc);
  if (!g) return fail("Escribe la cédula del fiador, por ejemplo V-12345678", "guarantorIdDoc");
  if (g.number === me.idNumber) return fail("El fiador debe ser otra persona", "guarantorIdDoc");
  const gPhone = normalizeVePhone(d.guarantorPhone);
  if (!gPhone) return fail("Escribe el teléfono del fiador, por ejemplo 0414-1234567", "guarantorPhone");
  if (gPhone === me.phone) return fail("El teléfono del fiador debe ser distinto al tuyo", "guarantorPhone");

  const limit = await hit("customerAction", `${tenant.id}:${await clientIp()}`);
  if (!limit.ok) return fail(tooManyMessage(limit.retryAfterSec));

  const tdb = tenantDb(tenant.id);
  const open = await tdb.creditApplication.findFirst({ where: { customerId: me.id, status: { in: ["WAITING_GUARANTOR", "IN_REVIEW"] } }, select: { id: true } });
  if (open) return fail("Ya tienes una solicitud en curso.");
  if (me.creditStatus === "APPROVED") return fail("Tu crédito ya está aprobado.");

  const buyerPhoto = await readId(formData.get("idPhoto"), "de la compradora");
  if ("error" in buyerPhoto) return fail(buyerPhoto.error!, "idPhoto");
  const guarantorPhoto = await readId(formData.get("guarantorPhoto"), "del fiador");
  if ("error" in guarantorPhoto) return fail(guarantorPhoto.error!, "guarantorPhoto");

  const settings = await getCreditSettings(tenant.id);
  const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ");
  const text = contractText({
    storeName: tenant.name,
    legalName: tenant.legalName,
    rif: tenant.rif,
    buyerName: fullName,
    buyerId: formatVeId(me.idType, me.idNumber),
    guarantorName: d.guarantorName,
    guarantorId: g.display,
    lateFeeUsd: centsToDecimalString(settings.lateFeeCents).replace(".", ","),
    graceDays: settings.graceDays,
  });
  const h = await headers();
  const now = new Date();

  const app = await db.$transaction(async (tx) => {
    const created = await tx.creditApplication.create({
      data: {
        tenantId: tenant.id,
        customerId: me.id,
        fullName,
        idType: me.idType ?? "V",
        idNumber: me.idNumber!,
        phone: me.phone!,
        whatsapp: me.whatsapp,
        email: me.email,
        address: d.address,
        city: d.city,
        state: d.state,
        latitude: coord(d.latitude, 90),
        longitude: coord(d.longitude, 180),
        guarantorName: d.guarantorName,
        guarantorIdType: g.type,
        guarantorIdNumber: g.number,
        guarantorPhone: gPhone,
        contractVersion: CONTRACT_VERSION,
        contractHash: createHash("sha256").update(text).digest("hex"),
        acceptedAt: now,
        acceptIp: await clientIp(),
        acceptUserAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      },
      select: { id: true, guarantorToken: true },
    });
    // Cédulas: archivos PRIVADOS (no salen por /marca); solo los ve el personal autorizado.
    const keys = { idPhotoKey: `credito-${created.id}-compradora`, guarantorPhotoKey: `credito-${created.id}-fiador` };
    for (const [key, file] of [
      [keys.idPhotoKey, buyerPhoto],
      [keys.guarantorPhotoKey, guarantorPhoto],
    ] as const) {
      await tx.tenantAsset.create({ data: { tenantId: tenant.id, kind: key, mimeType: file.mime, sizeBytes: file.data.byteLength, data: file.data } });
    }
    await tx.creditApplication.update({ where: { id: created.id }, data: keys });
    await tx.customer.update({ where: { id: me.id }, data: { creditStatus: "PENDING" } });
    return created;
  });
  return { ok: true, guarantorUrl: `/credito/fiador/${app.guarantorToken}` };
}

const guarantorInput = z.object({
  token: z.string().min(10).max(40),
  idDoc: z.string().trim().max(20),
  accept: z.literal(true, { message: "Debes aceptar el contrato para constituirte en fiador" }),
});

/** El fiador confirma su cédula y acepta el contrato desde su propio teléfono. */
export async function acceptAsGuarantor(raw: unknown): Promise<Result> {
  const parsed = guarantorInput.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Revisa los datos");
  const tenant = await getTenantFromRequest();
  if (!(await getModules(tenant.id)).credit) return fail("La compra a crédito no está disponible por ahora.");
  const limit = await hit("orderLookup", `fiador:${tenant.id}:${await clientIp()}`);
  if (!limit.ok) return fail(tooManyMessage(limit.retryAfterSec));
  const id = parseVeId(parsed.data.idDoc);
  const tdb = tenantDb(tenant.id);
  const app = await tdb.creditApplication.findFirst({ where: { guarantorToken: parsed.data.token }, select: { id: true, status: true, guarantorIdNumber: true } });
  if (!app) return fail("Este enlace no es válido.");
  if (app.status !== "WAITING_GUARANTOR") return fail("Esta solicitud ya no espera la aceptación del fiador.");
  if (!id || id.number !== app.guarantorIdNumber) return fail("La cédula no coincide con la del fiador registrado.");
  const h = await headers();
  await tdb.creditApplication.updateMany({
    where: { id: app.id, status: "WAITING_GUARANTOR" },
    data: { status: "IN_REVIEW", guarantorAcceptedAt: new Date(), guarantorIp: await clientIp(), guarantorUserAgent: h.get("user-agent")?.slice(0, 300) ?? null },
  });
  return { ok: true };
}

// ───────────────────────────── Notificaciones ─────────────────────────────

/** Solo servicios de push oficiales (Chrome/Android, Firefox, Safari/iPhone, Edge): el servidor les hace POST. */
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

const subscriptionInput = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .startsWith("https://")
    .refine((u) => PUSH_HOSTS.test(new URL(u).hostname), "Servicio de avisos no reconocido"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(5).max(100) }),
});

/** Guarda el teléfono de la clienta para mandarle avisos push (cobranza y pagos). */
export async function savePushSubscription(raw: unknown): Promise<Result> {
  const parsed = subscriptionInput.safeParse(raw);
  if (!parsed.success) return fail("Suscripción inválida");
  const tenant = await getTenantFromRequest();
  const me = await getCurrentCustomer(tenant.id);
  if (!me) return fail("Entra a tu cuenta para activar los avisos");
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const { endpoint, keys } = parsed.data;
  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { tenantId: tenant.id, customerId: me.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua },
    create: { tenantId: tenant.id, customerId: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  const tenant = await getTenantFromRequest();
  await tenantDb(tenant.id).pushSubscription.deleteMany({ where: { endpoint: String(endpoint).slice(0, 1000) } });
  return { ok: true };
}
