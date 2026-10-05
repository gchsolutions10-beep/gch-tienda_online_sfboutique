"use server";

import { getTenantFromRequest } from "@/server/tenant";
import { searchSuggestions } from "@/server/queries/store";

/** Autocompletado del buscador (productos y categorías). */
export async function suggest(q: string) {
  if (typeof q !== "string") return { products: [], categories: [] };
  const tenant = await getTenantFromRequest();
  return searchSuggestions(tenant.id, q.slice(0, 60));
}
