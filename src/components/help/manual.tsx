import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Manual de uso por rol. Textos cortos, paso a paso, con los mismos nombres
 * de menús y botones que tiene la pantalla. Si cambia un botón, actualizar aquí.
 */

export const MANUAL_SECTIONS = [
  { id: "duena", title: "Dueña o administradora", icon: "👑" },
  { id: "tienda", title: "Encargada y vendedoras", icon: "🛍️" },
  { id: "contenido", title: "Blog, portada y banners", icon: "📝" },
  { id: "clienta", title: "Cómo compra la clienta", icon: "📱" },
  { id: "prueba", title: "Guion de prueba", icon: "✅" },
] as const;

export type ManualSectionId = (typeof MANUAL_SECTIONS)[number]["id"];

const Steps = ({ children }: { children: ReactNode }) => <ol className="mt-2 list-decimal space-y-1.5 pl-5">{children}</ol>;
const Tip = ({ children }: { children: ReactNode }) => <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-sm">💡 {children}</p>;
const H3 = ({ children }: { children: ReactNode }) => <h3 className="mt-6 font-display text-base font-bold">{children}</h3>;
const B = ({ children }: { children: ReactNode }) => <b className="font-semibold">{children}</b>;
const Go = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-semibold text-brand-strong underline">
    {children}
  </Link>
);

export function OwnerManual() {
  return (
    <>
      <p>
        Todo se maneja desde el <B>panel</B> (menú de la izquierda; en el celular, arriba). Lo primero de cada día es la <B>tasa BCV</B>: sin ella la tienda no
        puede mostrar precios en bolívares ni recibir pedidos.
      </p>

      <H3>1. Antes de abrir (una sola vez)</H3>
      <Steps>
        <li>
          <Go href="/admin/apariencia">Apariencia</Go>: elige una paleta de colores (Lavanda boutique, Blanco minimal, Nude…) o ajusta los tuyos. El sistema
          cuida que los textos siempre se lean. Ahí mismo puedes registrar tu <B>dominio propio</B>.
        </li>
        <li>
          <Go href="/admin/cuentas">Cuentas de cobro</Go>: carga tu Pago Móvil, cuentas en Bs y en dólares, Zelle, Binance (USDT) y las cajas de efectivo. Marca
          «en la tienda en línea» las que verá la clienta al pagar.
        </li>
        <li>
          <Go href="/admin/entregas">Envíos y entregas</Go>: retiro en tienda (dirección y horario), delivery en tu ciudad con su precio, envío nacional (MRW,
          Zoom, Tealca…) con precio o cobro a destino, envío gratis desde cierto monto y cuántas horas se aparta la ropa de un pedido sin pagar.
        </li>
        <li>
          <Go href="/admin/facturacion/configuracion">Facturación → Configuración</Go>: razón social, RIF y domicilio fiscal; IVA (16 %) y si los precios ya lo
          incluyen; IGTF si te toca cobrarlo; y cómo obtienes el número de control (imprenta digital o formatos de forma libre).
        </li>
      </Steps>
      <Tip>Lo fiscal (IVA, IGTF, número de control) revísalo con tu contador antes de emitir la primera factura.</Tip>

      <H3>2. Todos los días: la tasa</H3>
      <Steps>
        <li>
          <Go href="/admin/tasas">Tasas BCV / P2P</Go>: escribe la tasa BCV del día y toca <B>«Cargar tasa»</B>. Si cambió más de 20 %, el sistema te pide
          confirmar (por si fue un error de tipeo).
        </li>
        <li>La tasa P2P es opcional: solo sirve para tus reportes (cuánto valen de verdad los bolívares que cobras).</li>
      </Steps>

      <H3>3. Productos y stock</H3>
      <Steps>
        <li>
          <Go href="/admin/productos">Productos y stock</Go> → <B>«+ Nuevo producto»</B>: nombre, categoría, precio en dólares y <B>costo</B> (para ver tu
          margen). Marca «exento de IVA» solo si aplica.
        </li>
        <li>
          En la <B>matriz talla × color</B> escribe cuántas hay de cada combinación. Los cambios se guardan como entradas o salidas con su motivo (compra,
          conteo, daño), así nunca se pisa una venta.
        </li>
        <li>
          Sube <B>fotos verticales</B>: la 1.ª es la principal y la 2.ª aparece al pasar el mouse. Si la foto es de un color, asígnale el color: al elegirlo, la
          clienta ve esa foto.
        </li>
      </Steps>

      <H3>4. Facturar</H3>
      <Steps>
        <li>
          En <Go href="/admin/facturacion">Facturación</Go> salen los <B>«Pedidos pagados sin factura»</B>: toca <B>«Facturar»</B>, revisa los datos de la clienta
          (cédula o RIF obligatorio) y emite. También puedes facturar desde el pedido o justo después de cobrar en la caja.
        </li>
        <li>
          Con imprenta digital: anota en la factura el <B>número de control</B> que te dio la imprenta. Con formatos de forma libre, el sistema pone el siguiente
          número solo.
        </li>
        <li>
          ¿Devolución? En la factura: <B>«Nota de crédito (devolución)»</B> y eliges qué prendas. ¿Cargo adicional? <B>«Nota de débito»</B>.
        </li>
        <li>
          A fin de mes: <B>«Libro de ventas»</B> → <B>«Excel (CSV)»</B> para tu contador.
        </li>
      </Steps>

      <H3>5. Ver cómo va el negocio</H3>
      <Steps>
        <li>
          <Go href="/admin/reportes">Reportes</Go>: ventas del periodo contra el anterior, utilidad, lo más vendido por producto, talla y color, y cuánto valen
          de verdad los bolívares cobrados (tasa BCV contra P2P).
        </li>
        <li>Abajo, «Inventario hoy»: cuánto vale tu mercancía y qué prendas no se venden hace 60 días (candidatas a oferta).</li>
        <li>
          <Go href="/admin/clientes">Clientes (CRM)</Go>: tus clientas con su historial, segmentos automáticos (VIP, Recurrente, Nueva, Inactiva), cumpleañeras del
          mes y exportación para campañas por WhatsApp.
        </li>
      </Steps>
      <Tip>Usuarios nuevos (encargada, vendedoras, contenido): pídeselos a GCH Solutions. Solo tú cambias cuentas, envíos, apariencia y facturación.</Tip>
    </>
  );
}

export function StoreManual() {
  return (
    <>
      <H3>Pedidos de la tienda en línea</H3>
      <Steps>
        <li>
          <Go href="/admin/pedidos">Pedidos</Go> se abre en la pestaña con trabajo pendiente. Lo más urgente: <B>«Pagos por verificar»</B>.
        </li>
        <li>
          Abre el pedido, toca <B>«Ver comprobante»</B> y revisa que el dinero llegó a la cuenta. Si llegó: <B>«✓ Confirmar: llegó a la cuenta»</B>. Si no:{" "}
          <B>«No llegó»</B> con el motivo (el pedido vuelve a esperar pago).
        </li>
        <li>
          Con el pago completo, el stock se descuenta solo. Luego avanza: <B>«Empezar a preparar»</B> → <B>«Marcar listo»</B> (retiro o delivery) o{" "}
          <B>«Marcar enviado»</B> con el número de guía (envío nacional) → <B>«Marcar entregado»</B>.
        </li>
        <li>
          ¿La clienta pagó por WhatsApp o en la tienda? <B>«Registrar pago recibido»</B>: eliges el método, la cuenta y el monto (el sistema sugiere lo que
          falta).
        </li>
        <li>
          El botón <B>WhatsApp</B> abre el chat con la clienta con un saludo listo.
        </li>
      </Steps>
      <Tip>Un pedido sin pago se anula solo cuando se vence su tiempo de apartado, y la ropa vuelve a estar disponible.</Tip>

      <H3>Venta en la tienda física (caja)</H3>
      <Steps>
        <li>
          <Go href="/admin/caja">Caja (venta en tienda)</Go> → <B>«Abrir turno»</B> con el efectivo inicial en Bs y en dólares.
        </li>
        <li>Busca la prenda por nombre, SKU o código de barras y elige la talla y el color. Si es clienta conocida, búscala (o «+ Nueva»).</li>
        <li>
          Agrega los pagos: puedes mezclar Pago Móvil, punto de venta, efectivo en Bs, dólares y USDT. El sistema dice cuánto falta y el <B>vuelto</B> (en Bs o
          en dólares). Si el negocio cobra IGTF, se suma solo a la parte pagada en divisas.
        </li>
        <li>
          Al cobrar puedes tocar <B>«📑 Emitir factura»</B>.
        </li>
        <li>
          <B>«↕ Entrada / salida de efectivo»</B> para pagos a proveedores o cambio de billetes.
        </li>
        <li>
          Al final del día: <B>«Cerrar turno»</B>, cuenta el efectivo y lo que muestra cada banco. El sistema dice lo esperado y la diferencia por cuenta y por
          moneda. El reporte se puede imprimir.
        </li>
      </Steps>
    </>
  );
}

export function ContentManual() {
  return (
    <>
      <H3>Blog y lookbook</H3>
      <Steps>
        <li>
          <Go href="/admin/blog">Blog y lookbook</Go> → <B>«+ Nuevo artículo»</B>. Escribe el título y el texto. La barra te ayuda con títulos, negrita, listas y
          enlaces; a la derecha (o en «Vista previa» en el celular) ves cómo queda.
        </li>
        <li>
          Guarda una vez como <B>borrador</B> y luego sube la <B>portada</B> y las <B>fotos</B> dentro del artículo (te pide describir cada foto: la leen Google y
          los lectores de pantalla).
        </li>
        <li>
          <B>«Consigue este look»</B>: busca las prendas que salen en el artículo; aparecen al final con su precio y botón de compra.
        </li>
        <li>
          <B>Publicación</B>: «Publicar ahora» o <B>«Programar»</B> con fecha y hora: sale sola ese día.
        </li>
        <li>
          En <B>«Google (SEO)»</B> ves cómo se verá en Google; mejor títulos de menos de 60 letras y descripciones de menos de 160.
        </li>
      </Steps>

      <H3>Portada y banners</H3>
      <Steps>
        <li>
          <Go href="/admin/portada">Portada y banners</Go>: las <B>tarjetas grandes</B> del inicio (hasta 4, fotos verticales) con su título y a dónde llevan.
        </li>
        <li>
          <B>«+ Nuevo banner»</B>: imagen horizontal (ideal 1920 × 600), título y fechas <B>desde / hasta</B>. Puedes dejar listos los del mes que viene: salen y se
          quitan solos.
        </li>
      </Steps>
      <Tip>Usa fotos con buena luz y fondo limpio. El sistema las reduce solo antes de subirlas para que la tienda cargue rápido.</Tip>
    </>
  );
}

export function CustomerManual() {
  return (
    <>
      <Steps>
        <li>La clienta abre la tienda, filtra por categoría, talla, color o precio, y ve los precios en dólares y en bolívares a la tasa del día.</li>
        <li>
          En el producto elige color y talla (las agotadas salen tachadas) y toca <B>«Agregar a la bolsa»</B>. También puede preguntar por WhatsApp.
        </li>
        <li>
          <B>«Finalizar compra»</B>: nombre, cédula, WhatsApp y cómo lo recibe (retiro, delivery o envío nacional con la agencia). Ve el total real con IVA y
          envío, y <B>«Confirmar pedido»</B>. La ropa queda apartada unas horas.
        </li>
        <li>
          En la página de su pedido elige cómo pagar, copia los datos de la cuenta con un toque y <B>«Reportar pago»</B> con la referencia y la captura.
        </li>
        <li>Esa página (guárdala) le muestra en todo momento el estado: pago confirmado, preparando, enviado con su guía, entregado.</li>
      </Steps>
    </>
  );
}
