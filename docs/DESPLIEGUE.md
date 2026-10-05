# Publicar en línea: GitHub + Neon + Vercel

Guía paso a paso para poner en línea la demostración de SF Boutique. Toma unos 30–45 minutos.
Al final tendrás la tienda en `https://<tu-proyecto>.vercel.app` y el panel en `/login`.

```
Tu computadora ──(git push)──▶ GitHub ──(publica solo)──▶ Vercel ──(datos)──▶ Neon
```

- **GitHub** guarda el código. Vercel publica lo que hay en la rama `main`.
- **Neon** es la base de datos en línea (productos, pedidos, clientas, caja…).
- **Vercel** es donde corre la página.

> Las claves nunca se suben a GitHub: viven en tu `.env` (ignorado por git) y en las *Environment Variables* de Vercel.
> Las fotos que suba la boutique se guardan en la base de datos, así que no hace falta otro servicio.

---

## 1. Subir el código a GitHub

1. En [github.com/new](https://github.com/new) crea un repositorio **privado** llamado `gch-moda`.
   No marques «Add a README», «.gitignore» ni licencia: el proyecto ya los tiene.
2. En la terminal, dentro de la carpeta del proyecto:

```bash
git remote add origin https://github.com/gchsolutions10-beep/gch-moda.git
```

```bash
git push -u origin main
```

La primera vez Windows te pide entrar con tu cuenta de GitHub en el navegador.

---

## 2. Base de datos en Neon

1. Entra a [console.neon.tech](https://console.neon.tech) → **New project**:
   - **Name:** `gch-moda`
   - **Postgres version:** la más reciente
   - **Region:** **AWS US East (N. Virginia)**: la más cercana a Venezuela y la misma de Vercel.
2. En el panel del proyecto pulsa **Connect**. Hay dos cadenas de conexión (las dos empiezan con `postgresql://`):
   - **Pooled** (activa la opción *Connection pooling*; el host contiene `-pooler`) → para **Vercel**.
   - **Direct** (sin `-pooler`) → para **los comandos desde tu computadora**.
3. **Plan:** para mostrar la demo basta el gratis. Antes de vender de verdad, pasa a un plan pago (copias de
   seguridad y restauración en el tiempo).

### 2.1 Crear las tablas y cargar la demostración

En la carpeta del proyecto:

```bash
npm run demo:neon
```

Te pide escribir `DEMO`, la cadena **Direct** de Neon, el correo y la clave de la administradora (mínimo
10 caracteres; no se ve al escribir). Crea las tablas y carga SF Boutique con productos, tallas, colores, blog,
tasas y cuentas de ejemplo. No guarda la clave ni la cadena en ningún archivo.

> **Ojo:** `demo:neon` borra pedidos, productos y clientes del negocio para volver a cargar la demo. Sirve mientras
> se muestra el modelo; cuando la boutique empiece a usarla de verdad, **no** se vuelve a correr.

### 2.2 Cambiar la clave o crear otra administradora (sin borrar nada)

```bash
npm run admin:neon
```

> **Nunca compartas la cadena de conexión** (lleva la clave de la base de datos). Si se filtró, cámbiala en Neon:
> **Roles → neondb_owner → Reset password**, y actualiza `DATABASE_URL` en Vercel (y vuelve a desplegar).

---

## 3. Publicar en Vercel

1. Entra a [vercel.com/new](https://vercel.com/new) con tu cuenta de GitHub e **importa** `gch-moda`.
2. Vercel detecta Next.js solo. No cambies *Build Command* ni *Output* (el proyecto ya trae `prisma generate && next build`).
3. Antes de pulsar **Deploy**, abre **Environment Variables** y agrega (para *Production* y *Preview*):

| Variable | Valor | ¿Para qué? |
|---|---|---|
| `DATABASE_URL` | la cadena **Pooled** de Neon | Conexión a la base de datos |
| `ROOT_DOMAIN` | `gch-moda.vercel.app` (sin `https://`; la dirección que te dé Vercel) | Dirección de la plataforma |
| `DEFAULT_TENANT_SLUG` | `sfboutique` | Negocio que se ve en la dirección principal |

**No** agregues `DATABASE_POOL_MAX`, `SHADOW_DATABASE_URL`, `SEED_ADMIN_EMAIL` ni `SEED_ADMIN_PASSWORD`: son solo
para tu computadora.

4. Pulsa **Deploy** (2–4 minutos).
5. En **Settings → Functions → Function Region** elige **Washington, D.C. (iad1)**, la misma zona que Neon, y en
   **Deployments** pulsa **Redeploy** en el último despliegue.
6. Si Vercel te dio otra dirección (por ejemplo `gch-moda-abc.vercel.app`), corrige `ROOT_DOMAIN` y vuelve a desplegar.

---

## 4. Antes de mostrársela a la clienta

1. Abre `https://gch-moda.vercel.app`: debe verse la tienda de SF Boutique.
2. Entra a `/login` con el correo y la clave del paso 2.1.
3. En el panel:
   - **Tasas BCV / P2P:** carga la tasa del día (la de la demo es de ejemplo).
   - **Cuentas de cobro:** las de ejemplo dicen «⚠️ datos de ejemplo». Para una demo puedes dejarlas; para vender, pon las reales.
   - **Apariencia:** sube el logo de SF Boutique si lo tienes.
4. Prueba desde tu celular con datos móviles: compra algo, reporta un pago y confírmalo desde el panel.

> Las fotos de los productos de la demo son ilustraciones. Se cambian en **Productos y stock** por las fotos reales.

---

## 5. Cada vez que haya cambios

1. Yo trabajo en una rama y, cuando me dices «publícala», la uno a `main`.
2. **Si el cambio trae una migración nueva** (carpeta nueva en `prisma/migrations`), **antes** de publicar corre:

   ```bash
   npm run migrar:neon
   ```

   Agrega a la base en línea solo lo que falta (no borra nada). Te aviso cada vez que haga falta.
3. Haces `git push` (o me pides que lo haga). Vercel publica solo en 2–4 minutos.

---

## 6. Más adelante: dominio propio

Cuando la boutique tenga su dominio (por ejemplo `sfboutique.com`):

1. En Vercel: **Settings → Domains → Add**, y crea en el proveedor del dominio el registro DNS que indique Vercel.
2. Se registra el dominio para el negocio en la base de datos (tabla `tenant_domains`); te lo dejo hecho en su momento.

---

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| «DATABASE_URL no está configurada» | Falta la variable en Vercel o no se marcó para *Production* |
| Error de conexión al correr `demo:neon` o `migrar:neon` | Pegaste la cadena *Pooled* en vez de *Direct* |
| La página dice que no encuentra el negocio | `DEFAULT_TENANT_SLUG` distinto de `sfboutique`, o falta el paso 2.1 |
| Error 500 después de publicar cambios | Faltó `npm run migrar:neon` antes del `git push` |
| El login funciona pero te saca al recargar | Abriste otra dirección (las sesiones son por dominio) |
