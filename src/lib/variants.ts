/**
 * Matriz talla × color de un producto (pura, sin BD): qué variantes crear,
 * cuáles actualizar y cuáles quitar al guardar el producto.
 */
export type ExistingVariant = { id: string; sizeId: string | null; colorId: string | null; stock: number; reserved: number; isActive: boolean; sold: boolean };

/** Una celda de la matriz tal como la manda el formulario. */
export type DesiredCell = {
  sizeId: string | null;
  colorId: string | null;
  /** Stock que se vio al abrir el formulario (para no pisar ventas hechas mientras tanto) */
  expectedStock: number;
  stock: number;
};

export const cellKey = (sizeId: string | null, colorId: string | null) => `${sizeId ?? "-"}|${colorId ?? "-"}`;

export type VariantPlan = {
  create: { sizeId: string | null; colorId: string | null; stock: number }[];
  /** delta = cambio de stock (+ entrada / − salida); reactivate si estaba inactiva */
  update: { id: string; delta: number; reactivate: boolean }[];
  /** Sin ventas: se borra. Con ventas: se desactiva (el historial la necesita). */
  remove: { id: string; hasSales: boolean; stock: number }[];
  errors: string[];
};

export function planVariants(existing: ExistingVariant[], desired: DesiredCell[]): VariantPlan {
  const plan: VariantPlan = { create: [], update: [], remove: [], errors: [] };
  const byKey = new Map(existing.map((v) => [cellKey(v.sizeId, v.colorId), v]));
  const wanted = new Set<string>();

  for (const cell of desired) {
    const key = cellKey(cell.sizeId, cell.colorId);
    if (wanted.has(key)) continue;
    wanted.add(key);
    if (!Number.isInteger(cell.stock) || cell.stock < 0) {
      plan.errors.push("El stock debe ser un número entero de 0 en adelante");
      continue;
    }
    const v = byKey.get(key);
    if (!v) {
      plan.create.push({ sizeId: cell.sizeId, colorId: cell.colorId, stock: cell.stock });
      continue;
    }
    // Una variante inactiva no está en el formulario: su stock nuevo es el que se escribió.
    const delta = v.isActive ? cell.stock - cell.expectedStock : cell.stock - v.stock;
    if (v.stock + delta < v.reserved) {
      plan.errors.push(`No puedes dejar menos de ${v.reserved} (apartadas por pedidos sin pagar)`);
      continue;
    }
    if (delta !== 0 || !v.isActive) plan.update.push({ id: v.id, delta, reactivate: !v.isActive });
  }

  for (const v of existing) {
    if (!v.isActive || wanted.has(cellKey(v.sizeId, v.colorId))) continue;
    if (v.reserved > 0) {
      plan.errors.push("Una talla o color que quitaste tiene unidades apartadas por un pedido sin pagar");
      continue;
    }
    plan.remove.push({ id: v.id, hasSales: v.sold, stock: v.stock });
  }
  return plan;
}

/** Margen bruto sobre el precio (0.4 = 40 %). null si no hay costo. */
export function margin(priceCents: number, costCents: number | null): number | null {
  if (costCents === null || priceCents <= 0) return null;
  return (priceCents - costCents) / priceCents;
}
