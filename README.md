# GCH Moda

Tienda online + gestión + CRM + blog para boutiques de moda en Venezuela (GchSolutions). Primer negocio: **SF Boutique**.

## Arrancar en local

```bash
npm install
npm run db:local          # base de datos local (en otra terminal; nombre "moda")
npx prisma migrate deploy
npm run db:seed           # SF Boutique de demostración
npm run dev -- --port 3001
```

Abrir `http://sfboutique.localhost:3001` (tienda) y `/login` (panel). Las credenciales locales están en `.env` (ver `.env.example`).

## Pruebas

```bash
npm test
npm run typecheck
npm run lint
```

Arquitectura, modelo de datos, notas legales de Venezuela y fases: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
