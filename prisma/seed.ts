/**
 * Datos de demostración de SF Boutique (Acarigua, Venezuela):
 *   npm run db:seed
 * Crea el negocio, su administradora, tallas, colores, categorías, productos
 * con variantes (talla + color + stock), tasas BCV/P2P de EJEMPLO, cuentas
 * de cobro, etiquetas del CRM, clientes, portada y un artículo del blog.
 * Se puede correr varias veces: borra y recrea los datos de demo del negocio.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { demoSvg, type Garment } from "./demo-images";

const SLUG = process.env.DEFAULT_TENANT_SLUG || "sfboutique";

const CLOTHING = ["XS", "S", "M", "L", "XL"];
const SHOES = ["35", "36", "37", "38", "39", "40", "41"];
const COLORS: [string, string][] = [
  ["Negro", "#1A1A1A"],
  ["Blanco", "#F7F7F5"],
  ["Beige", "#D8C3A5"],
  ["Rosa", "#E9A8C4"],
  ["Lila", "#B48AD8"],
  ["Morado", "#6B2C91"],
  ["Azul jean", "#4A6FA5"],
  ["Rojo", "#C0392B"],
  ["Verde oliva", "#6B7A3A"],
  ["Dorado", "#C9A227"],
];

type DemoProduct = {
  name: string;
  category: string;
  garment: Garment;
  priceUsd: number;
  compareAtUsd?: number;
  sizes: "clothing" | "shoes" | "one";
  colors: string[];
  badge?: string;
  freeShipping?: boolean;
  featured?: boolean;
  ivaExempt?: boolean;
  description: string;
  details?: string;
  /** Días desde que se publicó (para "Nuevo") */
  ageDays?: number;
};

const PRODUCTS: DemoProduct[] = [
  { name: "Vestido midi satinado", category: "vestidos", garment: "vestido", priceUsd: 38, compareAtUsd: 45, sizes: "clothing", colors: ["Lila", "Negro", "Rosa"], badge: "Promoción", featured: true, description: "Vestido midi de satén con caída fluida y tirantes ajustables. Ideal para eventos y noches especiales.", details: "Satén 100 % poliéster · Lavar a mano en frío" },
  { name: "Vestido floral de verano", category: "vestidos", garment: "vestido", priceUsd: 29, sizes: "clothing", colors: ["Rosa", "Blanco"], ageDays: 3, description: "Vestido corto con estampado floral, ligero y fresco para el calor de los llanos.", details: "Viscosa · No usar secadora" },
  { name: "Vestido largo de lino", category: "vestidos", garment: "vestido", priceUsd: 42, sizes: "clothing", colors: ["Beige", "Blanco"], description: "Vestido largo de lino con abertura lateral. Elegante y cómodo." },
  { name: "Blusa de seda con lazo", category: "blusas-tops", garment: "blusa", priceUsd: 24, sizes: "clothing", colors: ["Blanco", "Morado", "Negro"], featured: true, description: "Blusa con lazo al cuello y botones forrados. Perfecta para la oficina." },
  { name: "Top crop acanalado", category: "blusas-tops", garment: "franela", priceUsd: 14, sizes: "clothing", colors: ["Negro", "Blanco", "Lila", "Rosa"], ageDays: 5, description: "Top corto de tejido acanalado que se adapta al cuerpo." },
  { name: "Blusa off-shoulder", category: "blusas-tops", garment: "blusa", priceUsd: 19, compareAtUsd: 24, sizes: "clothing", colors: ["Rojo", "Blanco"], badge: "Promoción", description: "Blusa de hombros descubiertos con volantes." },
  { name: "Jean mom tiro alto", category: "pantalones-jeans", garment: "jean", priceUsd: 32, sizes: "clothing", colors: ["Azul jean", "Negro"], featured: true, freeShipping: true, description: "Jean de tiro alto, corte mom, con bolsillos clásicos. El favorito de la tienda.", details: "98 % algodón, 2 % elastano" },
  { name: "Pantalón palazzo", category: "pantalones-jeans", garment: "jean", priceUsd: 27, sizes: "clothing", colors: ["Beige", "Negro", "Verde oliva"], ageDays: 2, description: "Pantalón ancho de tiro alto que estiliza la figura." },
  { name: "Jean skinny clásico", category: "pantalones-jeans", garment: "jean", priceUsd: 28, sizes: "clothing", colors: ["Azul jean"], description: "Jean ajustado de mezclilla con elasticidad." },
  { name: "Sandalia de tacón bloque", category: "calzado", garment: "sandalia", priceUsd: 35, sizes: "shoes", colors: ["Negro", "Beige", "Dorado"], featured: true, description: "Sandalia de tacón cuadrado de 7 cm, cómoda para todo el día." },
  { name: "Zapato de tacón stiletto", category: "calzado", garment: "zapato", priceUsd: 39, sizes: "shoes", colors: ["Negro", "Rojo"], ageDays: 6, description: "Clásico stiletto de punta fina, tacón de 10 cm." },
  { name: "Mocasín de cuero", category: "calzado", garment: "zapato", priceUsd: 33, sizes: "shoes", colors: ["Beige", "Negro"], freeShipping: true, description: "Mocasín de cuero sintético con plantilla acolchada." },
  { name: "Bolso tote", category: "accesorios", garment: "bolso", priceUsd: 26, sizes: "one", colors: ["Beige", "Negro", "Lila"], description: "Bolso amplio con cierre y bolsillo interno." },
  { name: "Cartera de mano", category: "accesorios", garment: "bolso", priceUsd: 18, sizes: "one", colors: ["Dorado", "Negro"], ageDays: 4, description: "Cartera pequeña para fiestas con cadena desmontable." },
  { name: "Franela oversize", category: "ropa-casual", garment: "franela", priceUsd: 12, sizes: "clothing", colors: ["Blanco", "Negro", "Lila"], description: "Franela de algodón de corte holgado. Básico de todos los días." },
  { name: "Conjunto deportivo", category: "ropa-casual", garment: "franela", priceUsd: 34, sizes: "clothing", colors: ["Rosa", "Negro"], badge: "Más vendido", description: "Top y leggings de secado rápido." },
  { name: "Gomitas de vinagre de manzana", category: "belleza-bienestar", garment: "bienestar", priceUsd: 15, sizes: "one", colors: ["Lila"], ivaExempt: false, description: "Gomitas Nutriplus de vinagre de manzana: apoyan la digestión y el control de peso. 60 gomitas." },
];

const CATEGORIES: [string, string, string][] = [
  ["vestidos", "Vestidos", "Para cada ocasión"],
  ["blusas-tops", "Blusas & Tops", "Básicos y elegantes"],
  ["pantalones-jeans", "Pantalones & Jeans", "Tu jean ideal"],
  ["calzado", "Calzado", "Tacones, sandalias y más"],
  ["accesorios", "Accesorios", "El toque final"],
  ["ropa-casual", "Ropa Casual", "Cómoda todos los días"],
  ["belleza-bienestar", "Belleza y bienestar", "Y algo más…"],
];

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en .env");

  // Negocio
  const tenant = await db.tenant.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      slug: SLUG,
      name: "SF Boutique",
      tagline: "Ropa y algo más…",
      legalName: "SF Boutique (razón social por configurar)",
      contactPhone: "+584245902803",
      instagram: "sf_boutiqueve",
      fiscalAddress: "Acarigua, estado Portuguesa",
      primaryColor: "#7B2F9E",
      themeBackground: "#F7F3FA",
      themeSurface: "#FFFFFF",
      themeText: "#2A1035",
      themeAccent: "#B0378F",
      settings: { create: { freeShippingFromUsd: "60" } },
      branches: { create: { name: "SF Boutique Acarigua", slug: "acarigua", city: "Acarigua", state: "Portuguesa" } },
    },
    select: { id: true },
  });
  const tenantId = tenant.id;
  const branch = await db.branch.findFirstOrThrow({ where: { tenantId }, select: { id: true } });

  // Limpia los datos de demo para poder volver a correr el seed
  await db.order.deleteMany({ where: { tenantId } });
  await db.blogPost.deleteMany({ where: { tenantId } });
  await db.product.deleteMany({ where: { tenantId } });
  await db.category.deleteMany({ where: { tenantId } });
  await db.size.deleteMany({ where: { tenantId } });
  await db.color.deleteMany({ where: { tenantId } });
  await db.customer.deleteMany({ where: { tenantId } });
  await db.customerTag.deleteMany({ where: { tenantId } });
  await db.financialAccount.deleteMany({ where: { tenantId } });
  await db.exchangeRate.deleteMany({ where: { tenantId } });
  await db.heroCard.deleteMany({ where: { tenantId } });
  await db.blogCategory.deleteMany({ where: { tenantId } });
  await db.invoiceSeries.deleteMany({ where: { tenantId } });

  // Administradora
  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash: await hashPassword(password) },
    create: { email, name: "Administradora SF", passwordHash: await hashPassword(password) },
    select: { id: true },
  });
  if (!(await db.membership.findFirst({ where: { userId: user.id, tenantId } }))) {
    await db.membership.create({ data: { userId: user.id, tenantId, role: "TENANT_ADMIN" } });
  }

  // Tallas y colores
  await db.size.createMany({
    data: [
      ...CLOTHING.map((label, i) => ({ tenantId, label, kind: "CLOTHING" as const, sortOrder: i })),
      ...SHOES.map((label, i) => ({ tenantId, label, kind: "SHOE" as const, sortOrder: i })),
      { tenantId, label: "Única", kind: "ONE_SIZE" as const, sortOrder: 0 },
    ],
  });
  await db.color.createMany({ data: COLORS.map(([name, hex], i) => ({ tenantId, name, hex, sortOrder: i })) });
  const sizes = await db.size.findMany({ where: { tenantId } });
  const colors = await db.color.findMany({ where: { tenantId } });

  // Categorías (con su ilustración de portada)
  const demoDir = join(process.cwd(), "public", "demo");
  mkdirSync(demoDir, { recursive: true });
  const catIds = new Map<string, string>();
  for (const [i, [slug, name, description]] of CATEGORIES.entries()) {
    const sample = PRODUCTS.find((p) => p.category === slug)!;
    // Para la ilustración, un color que contraste (no el blanco).
    const color = COLORS.find(([n]) => n === (sample.colors.find((c) => c !== "Blanco") ?? sample.colors[0]))![1];
    writeFileSync(join(demoDir, `cat-${slug}.svg`), demoSvg(sample.garment, color));
    const c = await db.category.create({
      data: { tenantId, slug, name, description, sortOrder: i, imageUrl: `/demo/cat-${slug}.svg` },
      select: { id: true },
    });
    catIds.set(slug, c.id);
  }

  // Productos con variantes (talla × color) y stock
  let skuN = 1;
  for (const [i, p] of PRODUCTS.entries()) {
    const slug = slugify(p.name);
    const sizeList =
      p.sizes === "clothing"
        ? sizes.filter((s) => s.kind === "CLOTHING")
        : p.sizes === "shoes"
          ? sizes.filter((s) => s.kind === "SHOE")
          : sizes.filter((s) => s.kind === "ONE_SIZE");
    const productColors = p.colors.map((n) => colors.find((c) => c.name === n)!);
    const images = productColors.flatMap((c, ci) =>
      ([0, 1] as const).map((v) => {
        const file = `${slug}-${ci}-${v}.svg`;
        writeFileSync(join(demoDir, file), demoSvg(p.garment, c.hex, v));
        return { url: `/demo/${file}`, alt: `${p.name} color ${c.name}`, colorId: c.id, sortOrder: ci * 2 + v };
      }),
    );
    await db.product.create({
      data: {
        tenantId,
        categoryId: catIds.get(p.category)!,
        name: p.name,
        slug,
        description: p.description,
        details: p.details ?? null,
        priceUsd: String(p.priceUsd),
        compareAtUsd: p.compareAtUsd ? String(p.compareAtUsd) : null,
        costUsd: String(Math.round(p.priceUsd * 0.5)),
        badge: p.badge ?? null,
        freeShipping: p.freeShipping ?? false,
        isFeatured: p.featured ?? false,
        ivaExempt: p.ivaExempt ?? false,
        sortOrder: i,
        publishedAt: new Date(Date.now() - (p.ageDays ?? 60) * 86_400_000),
        images: { create: images },
        variants: {
          create: productColors.flatMap((c) =>
            sizeList.map((s, si) => ({
              tenantId,
              sizeId: s.id,
              colorId: c.id,
              sku: `SF-${String(skuN++).padStart(4, "0")}`,
              // Stock variado: algunas tallas agotadas o en últimas unidades.
              stock: (si + c.name.length + i) % 5 === 0 ? 0 : ((si * 3 + i) % 7) + 1,
            })),
          ),
        },
      },
    });
  }

  // Tasas de EJEMPLO (la dueña las actualiza a diario en el panel)
  const now = new Date();
  await db.exchangeRate.createMany({
    data: [
      { tenantId, source: "BCV", rate: "180.50", effectiveAt: new Date(now.getTime() - 86_400_000), note: "Tasa de ejemplo: actualízala", createdById: user.id },
      { tenantId, source: "BCV", rate: "182.25", effectiveAt: now, note: "Tasa de ejemplo: actualízala", createdById: user.id },
      { tenantId, source: "P2P", rate: "215.00", effectiveAt: now, note: "Tasa de ejemplo: actualízala", createdById: user.id },
    ],
  });

  // Cuentas de cobro (datos de EJEMPLO: se configuran en el panel)
  await db.financialAccount.createMany({
    data: [
      { tenantId, name: "Banesco Pago Móvil", type: "PAGO_MOVIL", currency: "VES", bankName: "Banesco", bankCode: "0134", phone: "04240000000", holderIdType: "V", holderIdNumber: "00000000", holderName: "Por configurar", sortOrder: 1 },
      { tenantId, name: "Mercantil (transferencia)", type: "BANK_VES", currency: "VES", bankName: "Mercantil", bankCode: "0105", accountNumber: "0105-0000-00-0000000000", holderName: "Por configurar", sortOrder: 2 },
      { tenantId, name: "Punto de venta Banesco", type: "POS_TERMINAL", currency: "VES", bankName: "Banesco", showInCheckout: false, sortOrder: 3 },
      { tenantId, name: "Caja Bs", type: "CASH_VES", currency: "VES", showInCheckout: false, sortOrder: 4 },
      { tenantId, name: "Caja chica USD", type: "CASH_USD", currency: "USD", showInCheckout: false, sortOrder: 5 },
      { tenantId, name: "Zelle", type: "ZELLE", currency: "USD", email: "pagos@ejemplo.com", holderName: "Por configurar", sortOrder: 6 },
      { tenantId, name: "Binance USDT", type: "CRYPTO_USDT", currency: "USDT", walletId: "Por configurar", sortOrder: 7 },
    ],
  });

  // CRM
  await db.customerTag.createMany({
    data: [
      { tenantId, name: "Cliente VIP", color: "#B0378F", autoRule: "VIP" },
      { tenantId, name: "Recurrente", color: "#7B2F9E", autoRule: "RECURRENT" },
      { tenantId, name: "Nuevo", color: "#2E7D5B", autoRule: "NEW" },
      { tenantId, name: "Inactivo", color: "#8A8A8A", autoRule: "INACTIVE" },
      { tenantId, name: "Mayorista", color: "#C9A227" },
    ],
  });
  await db.customer.createMany({
    data: [
      { tenantId, firstName: "María", lastName: "González", idType: "V", idNumber: "18456789", phone: "+584141112233", whatsapp: "+584141112233", source: "INSTAGRAM", marketingOptIn: true },
      { tenantId, firstName: "Andreína", lastName: "Pérez", idType: "V", idNumber: "21345678", phone: "+584241234567", source: "STORE", notes: "Prefiere tallas S. Le gustan los colores pastel." },
      { tenantId, firstName: "Inversiones Moda Llanera", idType: "J", idNumber: "401234560", phone: "+582556211234", source: "WHATSAPP", isWholesale: true, notes: "Compra al mayor cada mes." },
    ],
  });

  // Facturación: series (el número de control se configura con la imprenta digital)
  await db.invoiceSeries.createMany({
    data: [
      { tenantId, type: "INVOICE", controlMode: "NONE" },
      { tenantId, type: "CREDIT_NOTE", controlMode: "NONE" },
      { tenantId, type: "DELIVERY_NOTE", controlMode: "NONE" },
    ],
  });

  // Portada: tarjetas verticales
  await db.heroCard.createMany({
    data: [
      { tenantId, title: "Moda Mujer", subtitle: "Vestidos, blusas y jeans", imageUrl: "/demo/cat-vestidos.svg", linkUrl: "/catalogo?categoria=vestidos", sortOrder: 0 },
      { tenantId, title: "Calzado & Zapatos", subtitle: "Del 35 al 41", imageUrl: "/demo/cat-calzado.svg", linkUrl: "/catalogo?categoria=calzado", sortOrder: 1 },
      { tenantId, title: "Colección Nueva", subtitle: "Recién llegado", imageUrl: "/demo/cat-blusas-tops.svg", linkUrl: "/catalogo?orden=nuevos", sortOrder: 2 },
    ],
  });

  // Blog
  const blogCats = ["Tendencias", "Outfits", "Lanzamientos", "Noticias"];
  await db.blogCategory.createMany({ data: blogCats.map((name, i) => ({ tenantId, name, slug: slugify(name), sortOrder: i })) });
  const outfits = await db.blogCategory.findFirstOrThrow({ where: { tenantId, slug: "outfits" } });
  const jean = await db.product.findFirstOrThrow({ where: { tenantId, slug: "jean-mom-tiro-alto" } });
  const blouse = await db.product.findFirstOrThrow({ where: { tenantId, slug: "blusa-de-seda-con-lazo" } });
  const sandal = await db.product.findFirstOrThrow({ where: { tenantId, slug: "sandalia-de-tacon-bloque" } });
  await db.blogPost.create({
    data: {
      tenantId,
      categoryId: outfits.id,
      authorId: user.id,
      title: "3 formas de combinar tu jean mom",
      slug: "3-formas-de-combinar-tu-jean-mom",
      excerpt: "Del día a la noche con una sola prenda: ideas fáciles para lucir tu jean favorito.",
      content: [
        "El **jean mom** es la prenda más versátil de tu clóset. Te mostramos tres looks para usarlo toda la semana.",
        "## 1. Oficina chic",
        "Combínalo con una **blusa de seda** y sandalias de tacón bloque. Elegante sin perder comodidad.",
        "## 2. Casual de fin de semana",
        "Una franela oversize y tus zapatos favoritos. Suma un bolso tote y listo.",
        "## 3. Salida nocturna",
        "Top crop, accesorios dorados y tacones. ¡A brillar!",
      ].join("\n\n"),
      coverImageUrl: "/demo/cat-pantalones-jeans.svg",
      tags: ["jeans", "outfits", "tendencias"],
      status: "PUBLISHED",
      publishedAt: now,
      readingMinutes: 2,
      seoTitle: "3 formas de combinar un jean mom | SF Boutique",
      seoDescription: "Ideas de outfits con jean mom para la oficina, el fin de semana y la noche.",
      products: {
        create: [
          { productId: jean.id, sortOrder: 0, note: "La base del look" },
          { productId: blouse.id, sortOrder: 1 },
          { productId: sandal.id, sortOrder: 2 },
        ],
      },
    },
  });

  // Caja
  if (!(await db.cashRegister.count({ where: { tenantId } }))) {
    await db.cashRegister.create({ data: { tenantId, branchId: branch.id, name: "Caja principal" } });
  }

  const counts = {
    productos: await db.product.count({ where: { tenantId } }),
    variantes: await db.productVariant.count({ where: { tenantId } }),
  };
  console.log(`✓ SF Boutique lista: ${counts.productos} productos, ${counts.variantes} variantes (talla × color). Admin: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
