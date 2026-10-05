/**
 * IP del visitante. En Vercel `x-forwarded-for` lo pone la plataforma (el
 * primer valor es el cliente); `x-real-ip` como respaldo. Sin proxy: "local".
 */
export function clientIpFrom(h: { get(name: string): string | null }): string {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim();
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : "local";
}
