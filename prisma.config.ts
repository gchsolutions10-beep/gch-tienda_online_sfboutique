import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // "prisma generate" (al instalar y al compilar en Vercel) no se conecta: si falta la
    // variable usa una dirección vacía y el error claro sale al usar la base (src/server/db.ts).
    url: process.env.DATABASE_URL ?? "postgresql://sin-configurar@localhost:5432/sin-configurar",
    // BD temporal que usa "migrate dev" para calcular diferencias (prisma dev la expone en otro puerto).
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
});
