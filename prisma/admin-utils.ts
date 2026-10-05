/** Contraseñas de ejemplo que aparecen en la documentación: nunca se aceptan. */
const EXAMPLE_PASSWORDS = new Set(["unaclavefuerte-2026", "cambia-esta-clave", "<tu-clave-fuerte>", "tu-clave-fuerte"]);

/** Valida la contraseña del administrador inicial. Devuelve el error o null. */
export function adminPasswordProblem(password: string | undefined): string | null {
  if (!password || password.length < 10) return "SEED_ADMIN_PASSWORD debe tener al menos 10 caracteres";
  if (EXAMPLE_PASSWORDS.has(password.toLowerCase())) {
    return "Esa es la contraseña de ejemplo de la guía. Inventa una propia.";
  }
  return null;
}
