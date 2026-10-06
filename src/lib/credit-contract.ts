/**
 * Contrato de crédito Credi-SF. El texto lo dio el negocio; VALIDAR CON UN
 * ABOGADO venezolano antes de usarlo. Cada solicitud guarda la versión y el
 * hash (SHA-256) del texto exacto que aceptaron la compradora y el fiador.
 * Si se cambia el texto, sube CONTRACT_VERSION.
 */
export const CONTRACT_VERSION = "credi-sf-v1";

export type ContractParties = {
  storeName: string;
  legalName: string | null;
  rif: string | null;
  buyerName: string;
  buyerId: string;
  guarantorName: string;
  guarantorId: string;
  lateFeeUsd: string;
  graceDays: number;
};

const dias = (n: number) => {
  const words = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
  return `${words[n] ?? n} (${n}) días`;
};

/** Párrafos del contrato con los datos de las partes. */
export function contractParagraphs(p: ContractParties): { title: string; body: string }[] {
  const store = p.legalName ? `${p.storeName} (${p.legalName}${p.rif ? `, RIF ${p.rif}` : ""})` : p.storeName;
  return [
    {
      title: "PARTES",
      body: `Entre ${store}, en adelante «SF Boutique»; ${p.buyerName}, titular de la cédula/RIF ${p.buyerId}, en adelante «el Comprador»; y ${p.guarantorName}, titular de la cédula/RIF ${p.guarantorId}, en adelante «el Fiador», se conviene lo siguiente:`,
    },
    {
      title: "PRIMERO (DEL CRÉDITO Y FORMA DE PAGO)",
      body: "El Comprador declara haber adquirido bienes a través de SF Boutique bajo la modalidad de venta a crédito, obligándose al pago de las cuotas quincenales, consecutivas e improrrogables fijadas al momento del checkout.",
    },
    {
      title: "SEGUNDO (DEL CODEUDOR SOLIDARIO / FIADOR)",
      body: "El Fiador identificado en este registro se constituye formal e irrevocablemente en FIADOR PRINCIPAL PAGADOR y Codeudor Solidario de todas las obligaciones presentes y futuras contraídas por el Comprador frente a SF Boutique, renunciando expresamente a los beneficios de excusión y división.",
    },
    {
      title: "TERCERO (PUNTUALIDAD Y CLÁUSULA DE MORA)",
      body: `Los pagos deberán realizarse dentro del plazo estipulado. Se concede un lapso de gracia de hasta ${dias(p.graceDays)} continuos posteriores al vencimiento de la cuota. Transcurrido dicho plazo (a partir del día ${p.graceDays + 1} de morosidad), se generará de manera automática e inmediata un Recargo Fijo por Gastos de Cobranza y Morosidad de $${p.lateFeeUsd} USD (o su equivalente en bolívares a la tasa de cambio aplicable), el cual se sumará al saldo pendiente sin perjuicio del cobro de los intereses moratorios a que haya lugar.`,
    },
    {
      title: "CUARTO (VÍA EJECUTIVA Y RESOLUCIÓN)",
      body: "El incumplimiento del pago de dos (2) o más cuotas consecutivas facultará a SF Boutique para declarar la mora de pleno derecho, exigir la totalidad del saldo adeudado (cuotas vencidas y por vencer) y ejercer las acciones legales por la vía ejecutiva, mercantil o civil ante los Tribunales competentes de la República Bolivariana de Venezuela, siendo por cuenta del Comprador y/o Fiador los gastos judiciales, honorarios profesionales y costas derivados de la cobranza.",
    },
    {
      title: "QUINTO (ACEPTACIÓN ELECTRÓNICA Y DATOS)",
      body: "El Comprador y el Fiador aceptan este contrato por medios electrónicos, cada uno desde su propio dispositivo. Se registran la fecha, la hora, la dirección IP, el dispositivo y la versión exacta del texto aceptado. Los datos y las fotos de la cédula se usan solo para evaluar y gestionar el crédito, y se resguardan con acceso restringido al personal autorizado.",
    },
  ];
}

/** Texto plano completo (lo que se firma y se guarda en el hash). */
export function contractText(p: ContractParties): string {
  return [`TÉRMINOS Y CONDICIONES DE CRÉDITO Y RESGUARDO JURÍDICO (SF BOUTIQUE) · ${CONTRACT_VERSION}`, ...contractParagraphs(p).map((x) => `${x.title}: ${x.body}`)].join("\n\n");
}
