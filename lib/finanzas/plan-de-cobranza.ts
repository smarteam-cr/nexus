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
 */

/** Las etapas del plan que quedaron commiteadas en verde. La 15 no se construye hasta tener las respuestas. */
export const ETAPAS_COMMITEADAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

/**
 * Las que no andan hasta que Elías pone su cambio en la base de datos: la 4 (el espejo de Odoo), la
 * 7 (número de factura), la 10 (plata que no es venta) y la 12 (sociedades). La 13 no trae uno
 * propio, pero cargar el libro exige los de la 7 y la 12.
 */
export const ETAPAS_QUE_ESPERAN_LA_BASE = [4, 7, 10, 12, 13] as const;

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

const CUANDO_LA_BASE = "Anda cuando Elías ponga los cambios en la base de datos.";

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
    espera: CUANDO_LA_BASE,
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
    consecuencia:
      "«Lo que no cuadra» ya no acusa USD 237.355 de cobros sin factura: acusa 82 cobros por USD 83.187, que bajan a 18 por USD 22.270 cuando Elías reatribuya las facturas de Odoo. Si el espejo de Odoo o el corte quincenal se quedan viejos, sus pantallas se ponen en rojo esa misma mañana.",
    etapas: [2, 3],
    espera: null,
  },
  {
    titulo: "El libro de Alex, contra Nexus y adentro",
    consecuencia:
      "Alex sube su libro y ve documento por documento qué coincide, qué no y qué falta, sin que se escriba nada. Desde ahí carga por cobrar las facturas que Nexus no tiene, con número y firma; nunca como cobradas. «Nueva empresa» pregunta por las parecidas antes de duplicar un cliente.",
    etapas: [11, 12, 13],
    espera: "Comparar anda ya. Cargar facturas, cuando Elías ponga los cambios en la base de datos.",
  },
];

const DESPUES_DE_ELIAS = "Después de que Elías ponga los cambios en la base de datos.";

export const TAREAS: readonly Tarea[] = [
  {
    quien: "Alex",
    que: "Devolver a por cobrar, con «Sacar de Cobrado», los 3 cobros que nunca se depositaron: Global Supply feb-2026 ($1.867, FAC/2026/0206), IIA jun-2026 ($60, FAC/2026/0295) y Seléctrica jun-2026 ($45, FAC/2026/0302).",
    espera: "Apenas se publique esta versión.",
  },
  {
    quien: "Alex",
    que: "Anotar el número de factura de lo ya facturado: 144 cobros muestran «Agregar número», y en el libro «Números» propone el de 68 cuotas para confirmar con «Es esta».",
    espera: DESPUES_DE_ELIAS,
  },
  {
    quien: "Alex",
    que: "Aplicar el libro: cargar por cobrar las 78 facturas que Nexus no tiene (21 sin pagar, por ₡39.920.993,51 + US$58.331,60 según el libro) y elegir la cuenta de los 24 nombres que no traen una propuesta.",
    espera: DESPUES_DE_ELIAS,
  },
  {
    quien: "Alex",
    que: "Cargar el fondo de marketing de Insider (US$5.346,91) en Finanzas › Ingresos variables: suma a la caja, no a la venta.",
    espera: DESPUES_DE_ELIAS,
  },
  {
    quien: "Alex",
    que: "Poner el plan de suscripción a Seléctrica, Electrocaribe y Don Juan Tours, las 3 que hoy avisan que se quedan sin cuotas.",
    espera: null,
  },
  {
    quien: "Elías",
    que: "Poner en la base de datos los 4 cambios de esta tanda y después publicar esta versión. El del espejo de Odoo va antes que la credencial.",
    espera: null,
  },
  {
    quien: "Elías",
    que: "Recuperar el usuario de Odoo y cargar su credencial en el servidor, sin probarlo desde su computadora: cada intento suma al bloqueo.",
    espera: "Después del cambio de base del espejo de Odoo.",
  },
  {
    quien: "Elías",
    que: "Reatribuir una vez las facturas de Odoo de los clientes ya emparejados: hasta entonces quedan 170 sin su cuenta.",
    espera: null,
  },
  {
    quien: "Elías",
    que: "Encender el corte quincenal.",
    espera: "Con esta versión ya publicada.",
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
    vencido: "Lo facturado en Odoo después no está en Nexus. Vuelve cuando Elías recupere el usuario de Odoo.",
  },
  facturas: {
    etiqueta: "Facturas de Odoo con su cuenta",
    detalle: "Sube cuando Elías reatribuye las facturas y cada vez que Alex empareja un cliente.",
  },
  verdes: {
    etiqueta: "Cobros en Cobrado firmados por la importación",
    detalle: "Los 3 que nunca se depositaron salen de acá cuando Alex los devuelve; el resto se queda cobrado.",
  },
} as const;

export const NO_SE_PUDO_LEER = "No se pudo leer ahora. El resto de la página no depende de este número.";
