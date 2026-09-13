/**
 * lib/finanzas/plan-de-cobranza.ts
 *
 * Los textos de /finanzas/plan-de-cobranza: qué hace Nexus ahora en cobranza, qué falta y quién lo
 * hace, y qué espera una decisión. Para Alex (dueño de cobranza) y Marco (dirección), que no leen
 * commits: una página que se lee en dos minutos.
 *
 * ⚠ POR QUÉ ES UN MÓDULO TIPADO Y NO TEXTO EN EL JSX: un resumen de un plan envejece prometiendo.
 * Cada renglón de «qué hace ahora» nombra las etapas del plan que lo sostienen, y el test exige que
 * sean de las que quedaron commiteadas en verde (1 a 14). La 15 —lo que espera una decisión— no se
 * construye, y un renglón que la nombre da rojo. En pantalla las etapas no se numeran.
 *
 * ⛔ Nada de acá es un número vivo: los montos y conteos son los MEDIDOS al cerrar cada etapa
 * (2026-09-12). Lo que cambia día a día lo lee `plan-de-cobranza-vivo.ts`.
 *
 * ⚠ 2026-09-13: los cuatro cambios de base de la tanda ya están en producción (verificados columna
 * por columna) y la copia de Odoo volvió, con una clave de API. Por eso ningún renglón espera la base
 * y desaparecieron las tareas de recuperar Odoo y reatribuir facturas: el primer sync las atribuyó.
 */

/** Las etapas del plan que quedaron commiteadas en verde. La 15 no se construye hasta tener las respuestas. */
export const ETAPAS_COMMITEADAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

/**
 * Las que no andan hasta que un cambio de base esté en producción. Hasta el 2026-09-12 eran la 4, la
 * 7, la 10, la 12 y la 13; el 2026-09-13 se verificó que los cuatro cambios ya están puestos.
 *
 * ⚠ Queda como lista vacía y no se borra: el test la usa para exigir que un renglón que depende de la
 * base lo avise. La próxima tanda con un cambio de base vuelve a anotar acá sus etapas.
 */
export const ETAPAS_QUE_ESPERAN_LA_BASE: readonly number[] = [];

export type Persona = "Alex" | "Marco" | "Elías";

export const PERSONAS: readonly { quien: Persona; rol: string }[] = [
  { quien: "Alex", rol: "Cobranza" },
  { quien: "Marco", rol: "Dirección" },
  { quien: "Elías", rol: "Nexus" },
];

export interface CambioHecho {
  titulo: string;
  /** La consecuencia para quien usa Nexus, no el mecanismo. */
  consecuencia: string;
  /** Etapas del plan que lo sostienen. Solo para el test: en pantalla no se muestran. */
  etapas: readonly number[];
  /** Qué falta para que ande, si falta algo; null = anda apenas se publica. */
  espera: string | null;
}

export interface Tarea {
  quien: Persona;
  que: string;
  /** Si depende de lo que hace otra persona antes; null = se puede hacer apenas se publica. */
  espera: string | null;
}

export interface Decision {
  /** Solo las de Alex y Marco: las de Elías son tareas, no decisiones de negocio. */
  quien: Exclude<Persona, "Elías">;
  pregunta: string;
  /** Qué hace Nexus mientras no se decide. */
  mientras: string;
}

export const TITULO = "Plan de cobranza";
export const DESCRIPCION = "Qué cambió en cobranza, qué falta y quién lo hace, y qué espera una decisión.";

export const QUE_HACE_AHORA: readonly CambioHecho[] = [
  {
    titulo: "Nada sale de Cobrado sin una firma",
    consecuencia:
      "Sacar un cobro de Cobrado pide motivo y la fecha real de la factura, y la bitácora guarda quién lo había confirmado y quién lo revierte. El importador viejo del libro ya no escribe en Nexus.",
    etapas: [1],
    espera: null,
  },
  {
    titulo: "Una promesa de pago ya no esconde la deuda",
    consecuencia:
      "La factura sigue vencida con la fecha prometida al lado y la alerta sigue en Alta. Si la fecha pasa sin depósito, la alerta sube a «Promesa incumplida». Los US$4.298 de AMVAC y AMC vuelven al vencido.",
    etapas: [5, 6],
    espera: null,
  },
  {
    titulo: "Las alertas se ponen al día solas",
    consecuencia:
      "Cada noche se abren los vencidos y se cierran las alertas que ya no aplican: la primera noche cierra 21, entre ellas las de cobros ya cobrados y las de Kaizen. Una suscripción que se queda sin cuotas avisa 45 días antes, y poner su plan ya no borra la cuota de diciembre.",
    etapas: [6, 14],
    espera: null,
  },
  {
    titulo: "Cada factura con su número",
    consecuencia:
      "Marcar facturado pide el número de la factura, o que digás por qué no lo tenés, y queda firmado. El cruce con Odoo usa ese número en vez de adivinar por monto, y un número que ya es de otra cuenta se frena.",
    etapas: [7, 8],
    espera: null,
  },
  {
    titulo: "Los números de Dirección dejan de inflarse",
    consecuencia:
      "El % de cobranza se muestra sobre lo facturado (82,1 %; antes se veía 87,6 %) y sobre lo exigible (87,7 %), con cada moneda aparte. Las comisiones estimadas (US$108.637) ya no suman: el margen a la fecha baja de US$208.067 a US$168.051.",
    etapas: [9],
    espera: null,
  },
  {
    titulo: "Los avisos dejan de mentir",
    // ⚠ 2026-09-13: acá decía «82 cobros por USD 83.187, que bajan a 18 por USD 22.270 cuando Elías
    // reatribuya». El sync ya atribuyó las facturas, y la cifra nueva no se volvió a medir: se saca
    // antes que publicar un número que nadie comprobó.
    consecuencia:
      "«Lo que no cuadra» ya no acusa USD 237.355 de cobros sin factura que no lo eran: solo acusa lo que se puede verificar contra Odoo. La copia de Odoo trae cada monto en su moneda y deja las facturas de los clientes emparejados pegadas a su cuenta. Si esa copia o el corte quincenal se quedan viejos, sus pantallas se ponen en rojo esa misma mañana.",
    etapas: [2, 3, 4],
    espera: null,
  },
  {
    titulo: "El libro de Alex, contra Nexus y adentro",
    consecuencia:
      "Alex sube su libro y ve documento por documento qué coincide, qué no y qué falta, sin que se escriba nada. Desde ahí carga por cobrar las facturas que Nexus no tiene, con número y firma; nunca como cobradas. «Nueva empresa» pregunta por las parecidas antes de duplicar un cliente.",
    etapas: [11, 12, 13],
    espera: null,
  },
];

const APENAS_SE_PUBLIQUE = "Apenas se publique esta versión.";

export const TAREAS: readonly Tarea[] = [
  {
    quien: "Alex",
    que: "Devolver a por cobrar, con «Sacar de Cobrado», los 3 cobros que nunca se depositaron: Global Supply feb-2026 ($1.867, FAC/2026/0206), IIA jun-2026 ($60, FAC/2026/0295) y Seléctrica jun-2026 ($45, FAC/2026/0302).",
    espera: APENAS_SE_PUBLIQUE,
  },
  {
    quien: "Alex",
    // Medido el 2026-09-13 en la copia de Odoo: la factura de febrero sigue sin pagar, pero el cliente
    // tiene dos notas de crédito por el mismo monto sin aplicar.
    que: "Antes de cobrarle a Global Supply, confirmar con el contador si las dos notas de crédito de $2.109,71 que tiene sin aplicar le dejan saldo a favor.",
    espera: null,
  },
  {
    quien: "Alex",
    que: "Anotar el número de factura de lo ya facturado: 144 cobros muestran «Agregar número», y en el libro «Números» propone el de 68 cuotas para confirmar con «Es esta».",
    espera: APENAS_SE_PUBLIQUE,
  },
  {
    quien: "Alex",
    que: "Aplicar el libro: cargar por cobrar las 78 facturas que Nexus no tiene (21 sin pagar, por ₡39.920.993,51 + US$58.331,60 según el libro) y elegir la cuenta de los 24 nombres que no traen una propuesta.",
    espera: APENAS_SE_PUBLIQUE,
  },
  {
    quien: "Alex",
    que: "Cargar el fondo de marketing de Insider (US$5.346,91) en Finanzas › Ingresos variables: suma a la caja, no a la venta.",
    espera: APENAS_SE_PUBLIQUE,
  },
  {
    quien: "Alex",
    que: "Poner el plan de suscripción a Seléctrica, Electrocaribe y Don Juan Tours, las 3 que hoy avisan que se quedan sin cuotas.",
    espera: null,
  },
  {
    quien: "Elías",
    que: "Publicar esta versión y cargar en el servidor el usuario y la clave de Odoo, para que la copia se ponga al día sola cada mañana.",
    espera: null,
  },
  {
    quien: "Elías",
    que: "Encender el corte quincenal.",
    espera: "Con esta versión ya publicada.",
  },
  {
    quien: "Elías",
    que: "Crear en Odoo un usuario solo de lectura para Nexus, con su propia clave: hoy la copia entra con la clave de Elías, que puede modificar todo el ERP.",
    espera: null,
  },
  {
    quien: "Elías",
    que: "Definir con Claudia la categoría del fondo de marketing de Insider. Mientras tanto se carga «sin clasificar» y Dirección lo ve en «Lo que no cuadra».",
    espera: null,
  },
];

/** Lo que dice el bloque de una persona que no tiene tareas, solo decisiones. */
export const SIN_TAREAS = "Nada por hacer fuera de las decisiones de abajo.";

export const DECISIONES: readonly Decision[] = [
  {
    quien: "Alex",
    pregunta: "Kaizen: ¿pide una sola factura o una por cada depósito?",
    mientras: "No se construye nada hasta saberlo.",
  },
  {
    quien: "Alex",
    pregunta: "JCB: ¿va a pedir nota de crédito sobre los $7.000 ya facturados, y por cuánto?",
    // ⚠ Medido el 2026-09-13: «Aditec JCB» existe como empresa pero sin cuenta de cobranza, y el
    // libro no la carga (etapa 13). «Sigue por cobrar» hacía creer que Nexus ya la sigue.
    mientras: "Todavía no está en Nexus: la empresa no tiene cuenta de cobranza y el libro no la carga.",
  },
  {
    quien: "Marco",
    pregunta: "¿Las comisiones de aliado cuentan para cubrir el punto de equilibrio? Con Claudia.",
    mientras: "Hoy Nexus las cuenta.",
  },
  {
    quien: "Marco",
    pregunta: "¿Con qué tipo de cambio se pasan los colones a dólares?",
    // ⚠ Medido el 2026-09-13: las 12 tasas de 2026 valen ₡500, tomadas del Excel de egresos. Decir
    // solo «sin convertir» hacía creer a Dirección que el margen y el % no convierten, y convierten.
    mientras: "Nexus usa ₡500 por dólar todo el año, el del Excel de egresos. El % de cobranza además muestra cada moneda aparte, sin convertir.",
  },
];

/** Los textos de los tres números en vivo. Los valores los trae `loadEstadoDelPlan`. */
export const NUMEROS_EN_VIVO = {
  espejo: {
    etiqueta: "Última copia buena de Odoo",
    nunca: "Nunca",
    alDia: "Al día.",
    vencido: "Lo facturado en Odoo después de esa fecha no está en Nexus. La copia se pone al día sola cada mañana; si sigue vieja, avisale a Elías.",
  },
  facturas: {
    etiqueta: "Facturas de Odoo con su cuenta",
    detalle: "Sube cada vez que Alex empareja un cliente de Odoo: sus facturas quedan asignadas en el momento.",
  },
  verdes: {
    etiqueta: "Cobros en Cobrado firmados por la importación",
    detalle: "Los 3 que nunca se depositaron salen de acá cuando Alex los devuelve; el resto se queda cobrado.",
  },
} as const;

export const NO_SE_PUDO_LEER = "No se pudo leer ahora. El resto de la página no depende de este número.";
