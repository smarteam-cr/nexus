/**
 * lib/escala/nueve/cierre.ts — el cierre del borrador 9.0.0: una decisión por cada cosa que «Lo que falta decidir»
 * dejaba abierta, para poder publicar. PURO.
 *
 * El 27 oct Elías pidió publicar la 9.0 ya («si hay alguna duda me lo dejas claro, pero publica»). Cada pregunta,
 * cada texto por escribir y cada cosa que esperaba la prueba se cierra con la opción que el borrador recomendaba o,
 * si no recomendaba ninguna, con la más conservadora: dejar el borrador como está, sin mover criterios. Son
 * DECISIONES PROVISIONALES, propuestas por Claude, que Elías revisa: la lista entera queda en el manual de operación
 * (1.4.0, «Decisiones provisionales de la 9.0») y cada una con texto, en la bitácora del borrador.
 *
 * Cada decisión nombra el `punto` de su entrada del catálogo (nueve.test.ts exige una, y solo una, por cada
 * pendiente). Las que cambian el texto lo hacen con las operaciones del catálogo; `FINAL` pone la fecha y la entrada
 * del historial, y después el script saca «Lo que falta decidir». Lo que se corrige con el borrador ya cerrado en
 * producción va en `CORRECCIONES`, al final: el cierre aplicado no se reescribe, como el catálogo.
 */
import type { Entrada, Operacion } from "./tipos";

export interface Decision {
  /** El `punto` de la entrada del catálogo que cierra. */
  punto: string;
  /** Qué se decidió, en palabras simples: va a la bitácora y al manual. */
  decision: string;
  ops: Operacion[];
}

export const MARCA_PROVISIONAL = "decisión provisional del 27 oct, propuesta de Claude; Elías la revisa";
export const FECHA_DE_LA_9_0 = "2026-10-27";

const P2 = "Parte 2";

/** Las decisiones, en el orden del catálogo. */
export const CIERRE: readonly Decision[] = [
  {
    punto: "§1 · 2.4.F4 · 2.4.F5",
    decision: "Decidir con datos y operar el sistema sin ayuda externa siguen pidiéndose solo en Marketing, en Funcional. No se mueve nada.",
    ops: [],
  },
  {
    punto: "§1 · 1.3.O3 · 3.3.E3",
    decision: "La ficha completa queda como en el borrador: en Óptimo de Ventas y, el dato de lo prometido, en Eficiente de Datos de Servicio. Que el equipo la use no se mide aparte.",
    ops: [],
  },
  {
    punto: "§1 · 2.6.F3 · 1.6.E3",
    decision: "Hablarle distinto a cada segmento sigue en Funcional de Marketing y en Eficiente de Ventas. Ninguno cambia de nivel.",
    ops: [],
  },
  {
    punto: "§2 · 3.1.F2",
    decision: "El contacto de seguimiento de Funcional y el acompañamiento de uno a muchos de Eficiente siguen los dos, como están.",
    ops: [],
  },
  {
    punto: "§3 · 1.6.E1 · 2.6.E3 (puntaje de leads)",
    decision: "Va así: el puntaje de leads es de Segmentación de Marketing, en Eficiente, y Ventas lo usa para priorizar, también en Eficiente. Se escribe en la regla de asignación.",
    ops: [
      {
        op: "prosa-punto",
        parte: P2,
        empieza: "El **puntaje de leads por reglas**",
        texto:
          "El **puntaje de leads por reglas** se asigna a **Segmentación (2.6)**, y es nivel Eficiente; Ventas lo usa para priorizar, en **Priorización de Leads (1.6)**, también en Eficiente. No se confunde con lo que pide Funcional —calificar los leads en Ventas, clasificarlos en Marketing—: ahí basta aplicar criterios escritos, sea a mano o con una automatización simple sobre una propiedad; el puntaje de Eficiente es un modelo con varios atributos.",
      },
    ],
  },
  {
    punto: "§3 · 1.6.F4 · 2.3.F2",
    decision: "Los rasgos del cliente ideal en el CRM quedan en Ventas y en Marketing, como están. Ninguno se retira ni cambia de lo que mide.",
    ops: [],
  },
  {
    punto: "§3 · 1.4.E3 · 2.4.E3 · 3.4.E4 (acuerdos entre dos áreas)",
    decision: "Se escribe en la regla de asignación: cada acuerdo entre dos áreas se cuenta una sola vez, en Equipo y Gobierno del área que recibe.",
    ops: [
      {
        op: "prosa-punto-despues",
        parte: P2,
        despuesDe: "La **orquestación entre áreas**",
        texto:
          "Cada **acuerdo entre dos áreas** se cuenta una sola vez, en **Equipo y Gobierno** del área que recibe: el traspaso de los leads de Marketing a Ventas, en **1.4**; el de cada cliente nuevo de Ventas a Servicio, en **3.4**; y lo que Servicio le pasa a Marketing —qué clientes se vuelven casos de éxito o referidos—, en **2.4**. La automatización del traspaso sigue en Tecnología.",
      },
    ],
  },
  {
    punto: "§4 · 3.7.E2 · 1.6.O2 · 1.7.E · 3.4.O3 (la expansión)",
    decision:
      "Así: ofrecerle el siguiente producto a un cliente actual es de Ventas, en Eficiente, con la señal que le pasa Servicio. Se escribe en «La próxima compra» y en la regla de asignación. En Educación no entra todavía un criterio propio de Admisiones: se lee como la general.",
    ops: [
      {
        op: "prosa-cambiar",
        parte: P2,
        empieza: "**La próxima compra.**",
        bloques: [
          {
            tipo: "parrafo",
            texto:
              "**La próxima compra.** Donde el cliente vuelve a comprar sin contrato, la próxima compra se trata como un negocio más, se venda con equipo o sin vendedor: si no llega cuando se esperaba, es un negocio que se enfrió, y reactivarlo es trabajo de Ventas. La renovación de un contrato, en cambio, es de Servicio. Ofrecerle el siguiente producto a un cliente actual también es de Ventas: Servicio ve el potencial y le pasa la señal, y Ventas lo trabaja como un negocio.",
          },
        ],
      },
      {
        op: "prosa-punto-despues",
        parte: P2,
        despuesDe: "La **próxima compra de un cliente que vuelve sin contrato**",
        texto:
          "La **renovación y el siguiente producto** de un cliente actual se reparten así: retenerlo, renovar su contrato y ver dónde tiene potencial de crecer es de **Proactividad (3.7)**; el acuerdo de cómo le llega esa señal a Ventas, de **Equipo y Gobierno (3.4)**; y ofrecerle el siguiente producto, con esa señal, de **Tracción del Negocio (1.7)**, en Eficiente.",
      },
      {
        op: "prosa-punto",
        parte: P2,
        empieza: "El **uso de lo que produce otra área**",
        texto:
          "El **uso de lo que produce otra área** —las señales de Servicio en la priorización de Ventas, los promotores de Servicio como canal de Marketing, el contexto de la venta en la atención de Servicio— se asigna, en Óptimo, a la dimensión de producción del área que lo recibe. Hay dos que se usan en Eficiente, porque sin ellos el área no ordena su trabajo: el puntaje de leads de Marketing, para priorizar en Ventas, y la señal de Servicio de los clientes listos para el siguiente producto. No es orquestación: la coordinación entre líderes sigue en Equipo y Gobierno.",
      },
    ],
  },
  {
    punto: "§4 · 3.4.E4 · Banca 3.4.E4",
    decision: "Lo prometido en la venta queda en los dos lugares, como está: el dato en la ficha (Datos de Servicio) y su traspaso en lo que trae cada cliente nuevo (Equipo y Gobierno). No se acota ninguno.",
    ops: [],
  },
  {
    punto: "§4 · 3.7.O4 · regla de asignación (lealtad)",
    decision:
      "Se escribe en la regla de asignación: lo que se gana comprando va en Tracción del Negocio; lo que se da sin pedir una compra, en Proactividad; premiar al que trae otro cliente, en Canales. Sale «promociones de fidelización» de los detalles para deleitar.",
    ops: [
      {
        op: "prosa-punto",
        parte: P2,
        empieza: "Los **detalles para deleitar a los clientes actuales**",
        texto:
          "Los **detalles para deleitar a los clientes actuales** —obsequios o beneficios que se dan sin pedirle una compra— se asignan a **Proactividad (3.7)**; las campañas hacia el mercado, a **Canales y Alcance (2.7)**.",
      },
      {
        op: "prosa-punto-despues",
        parte: P2,
        despuesDe: "Los **detalles para deleitar a los clientes actuales**",
        texto:
          "Lo que el cliente **gana comprando** —puntos, niveles o beneficios por lo que compra— se asigna a **Tracción del Negocio (1.7)**, porque mueve la próxima compra; lo que se le da sin pedirle una compra, a **Proactividad (3.7)**; y premiar al que trae a otro cliente, al **programa de referidos**, en **Canales y Alcance (2.7)**.",
      },
    ],
  },
  {
    punto: "§5 · 1.4.O2",
    decision: "1.4.O2 se queda como está: ni se retira ni se reescribe.",
    ops: [],
  },
  {
    punto: "§5 · 1.5.F4 · 1.7.F4",
    decision: "Se escribe en la regla de asignación: la plantilla de la propuesta es de Propuesta y Coherencia; el material de apoyo para mover un negocio, de Tracción del Negocio.",
    ops: [
      {
        op: "prosa-punto-despues",
        parte: P2,
        despuesDe: "Los **artefactos de ejecución de venta**",
        texto:
          "La **plantilla de la propuesta** se mide en **Propuesta y Coherencia (1.5)**; el **material de apoyo para mover un negocio** —presentaciones, casos de éxito, demos— en **Tracción del Negocio (1.7)**.",
      },
    ],
  },
  {
    punto: "§5 · 2.6.O3",
    decision: "Se escribe en la regla de asignación: lo que cambia en la tienda o en el sitio de venta para cada comprador es de Priorización de Ventas.",
    ops: [
      {
        op: "prosa-punto",
        parte: P2,
        empieza: "Donde se vende sin vendedor, **lo que la tienda le muestra a cada comprador**",
        texto:
          "**Lo que cambia en la tienda o en el sitio de venta para cada comprador** —sugerencias, oferta, orden de los productos, trato a sus mejores clientes— se asigna a **Priorización de Leads (1.6)**, también donde se vende sin vendedor; el mensaje y el contenido de marketing para cada segmento o cada persona siguen en **Segmentación (2.6)**.",
      },
    ],
  },
  {
    punto: "§5 · 3.6.O1 · 3.6.O2",
    decision: "3.6.O1 y 3.6.O2 siguen separados, como están. No se juntan hasta decidir qué hace la IA ahí.",
    ops: [],
  },
  {
    punto: "§6 · 1.2.O2 · Ecommerce 1.2.O2",
    decision: "Ecommerce sigue reescribiendo 1.2.O2 para la tienda; el criterio nuevo de la venta sin vendedor se lee en Ecommerce como en la general.",
    ops: [],
  },
  {
    punto: "§6 · 1.8.O1 · 1.8.O2 · Banca 1.8.O201",
    decision: "1.8.O1 queda como está (el análisis de las llamadas). No se amplía a reuniones y chats ni se le escribe qué ejecuta la IA en esta versión.",
    ops: [],
  },
  {
    punto: "§6 · 3.3.O3",
    decision: "3.3.O3 queda en Óptimo, como está. No baja a Eficiente ni se reescribe.",
    ops: [],
  },
  {
    punto: "§6 · 2.7.O1 · 2.4.O4 · 1.4.O1 · 3.4.O4",
    decision: "Los Óptimos de la lista quedan como están. Qué ejecuta la IA en cada uno se escribe en la versión siguiente.",
    ops: [],
  },
  {
    punto: "§6 · 2.1.O1 · 3.1.O1",
    decision: "En Servicio, la IA de las rutinas sigue aparte del agente que resuelve casos, como entró.",
    ops: [],
  },
  {
    punto: "§7 · 2.7.F (plan de canales)",
    decision: "No: Funcional no pide un mínimo de canales. La decisión 1 sigue: la empresa elige sus canales.",
    ops: [],
  },
  {
    punto: "§7 · 2.5.F (mensaje central)",
    decision: "El mensaje central no entra en esta versión: la escala queda como está, sin pedirlo en un lugar nuevo.",
    ops: [],
  },
  {
    punto: "§7 · 3.7.F2 · Inmobiliaria 3.7.F2",
    decision: "Inmobiliaria lee el criterio nuevo de Funcional como la general, junto a sus dos de Eficiente.",
    ops: [],
  },
  {
    punto: "§8 · 2.7.F3 · las cuatro ediciones",
    decision: "Las ediciones leen el criterio nuevo de la pauta como la general («en el último trimestre»). Reescribirlo en Educación («en el último período de admisión») queda para la versión siguiente.",
    ops: [],
  },
  {
    punto: "§8 · Ecommerce 2.4.E3",
    decision: "Ecommerce queda como está: preparar el calendario de promociones con quien opera la venta y con la posventa sigue contando, también sin vendedores.",
    ops: [],
  },
  {
    punto: "§9 · 3.4.I",
    decision: "No se retira ninguna señal de Inicial de Servicio: quedan las dos de números y la nueva de los roles de palabra.",
    ops: [],
  },
  {
    punto: "§9 · 3.3.D1 · Educación 3.3.D1",
    decision: "La señal de que no hay medición fiable de tiempos ni de satisfacción no vuelve. Datos de Servicio queda como está.",
    ops: [],
  },
  {
    punto: "§11 · 3.3.F (duplicados)",
    decision: "Las ediciones leen el control de duplicados de Servicio como la general. Reescribirlo en cada una queda para la versión siguiente.",
    ops: [],
  },
  {
    punto: "§12 · 2.5 (suplantación)",
    decision: "No entra en la escala general en esta versión: sigue solo en las ediciones que la piden, y la regla de asignación lo dice así.",
    ops: [],
  },
  {
    punto: "§12 · Banca 1.2.F · 3.2",
    decision: "Sí sirve: el mensaje de riesgo del contacto desde canales verificados queda como lo redactó Claude.",
    ops: [],
  },
  {
    punto: "§12 · 3.1.F (verificar la identidad)",
    decision: "Ecommerce, Educación e Inmobiliaria leen la verificación de identidad como la general; Banca, con su criterio propio. Reescribirla queda para la versión siguiente.",
    ops: [],
  },
  {
    punto: "§13 · Educación 2.3.F301 · 3.7.F",
    decision: "Queda como está: en Banca no decide un criterio de permiso nuevo; en Educación, el permiso de Admisiones se queda con su redacción de hoy.",
    ops: [],
  },
  {
    punto: "§14 · 1.1.E · 1.2.F · 1.5.E · 1.7.E · 1.3.F · 1.5.O · 2.8.F · 2.1.E · 2.2.E · 2.6.F · 2.3.F · 3.5.O · 3.6.E · 3.7.F · 3.7.E · 3.8.F",
    decision: "Sigue esperando la prueba con clientes: las celdas se balancean después, y los dos criterios propuestos no entran todavía.",
    ops: [],
  },
  {
    punto: "§15 · x.6",
    decision: "La dimensión 6 se llama «Priorización» como nombre general, en «Las ocho dimensiones» y en la tabla de la Parte 4. Las semillas de documentación que la nombran se cambian con la próxima tanda de Nexus.",
    ops: [
      {
        op: "prosa-punto",
        parte: "Parte 1",
        empieza: "**Personalización** —",
        texto: "**Priorización** — a quién le da prioridad y cómo trata distinto a cada uno: en Ventas y en Servicio se mide como priorización, y en Marketing, como segmentación.",
      },
      { op: "prosa-celda", parte: "Parte 4", fila: "x.6", columna: 1, texto: "Priorización" },
    ],
  },
  {
    punto: "§15 · Ecommerce 3.8 · Banca 3.8",
    decision: "En Ecommerce y Banca, la dimensión 8 de Servicio conserva el nombre que tiene hoy en cada edición.",
    ops: [],
  },
  {
    punto: "§16 · Regla nueva: cambiar solo para un perfil",
    decision: "No por ahora: las ediciones no dicen «No aplica en tal perfil». El lector y la especificación no cambian.",
    ops: [],
  },
  {
    punto: "§16 · Registro de equivalencias · Banca 3.7.E5",
    decision: "El registro de qué práctica va en qué dimensión en cada edición queda para la versión siguiente. Nada sube a la general todavía.",
    ops: [],
  },
  {
    punto: "§16 · 2.3.E1 en las cuatro",
    decision: "Completar los datos con terceros queda como está, en Datos. No suma los sistemas propios ni cambia en las ediciones.",
    ops: [],
  },
  {
    punto: "§16 · Regla nueva: el aprendizaje vive en x.8",
    decision: "Revisar las seis ediciones con esa regla queda para la versión siguiente. Las ediciones quedan como están.",
    ops: [],
  },
  {
    punto: "§16 · Ecommerce 1.5.E102 · 1.8.F2 · 1.8.F101",
    decision: "En Ecommerce, la razón de una devolución queda donde está hoy, en sus varias dimensiones.",
    ops: [],
  },
  {
    punto: "§16 · Banca 1.7.F201",
    decision: "En Banca, la solicitud a medias en un canal digital se queda como criterio propio. No se retira.",
    ops: [],
  },
  {
    punto: "§16 · Educación 1.7.F301 · 1.7.F302",
    decision: "En Educación, la solicitud a medias en línea sigue como criterio propio, porque otro criterio lo requiere.",
    ops: [],
  },
  {
    punto: "§16 · Educación 1.3.E1",
    decision: "En Educación, el ±10% del pronóstico se lee como en la general. El ejemplo de los cierres de matrícula no entra todavía.",
    ops: [],
  },
  {
    punto: "§16 · Inmobiliaria 1.8 · 3.4.E4 (promesa y desistimiento)",
    decision: "Inmobiliaria queda como está: no entran todavía la razón de cada promesa desistida ni las señales de que un comprador puede desistir.",
    ops: [],
  },
  {
    punto: "§16 · Inmobiliaria: encabezado y alquileres",
    decision: "Las administradoras de alquileres no entran todavía en la edición de Inmobiliaria.",
    ops: [],
  },
  {
    punto: "§17 · especificación (pasos 3 y 6, el chequeo, el salto final, «Qué se emite», el ejemplo de 1.6)",
    decision:
      "La especificación 1.4.0 rehace el ejemplo de Priorización de Leads (Eficiente, 66, cumple 1 de 3 para Óptimo) para que la prueba 3 cuadre. Lo demás del cálculo sigue esperando la prueba con clientes.",
    ops: [],
  },
  {
    punto: "Insider 6 · 2.8.O3 (tráfico suficiente)",
    decision: "Medir cada recorrido y cada campaña contra un grupo de control no entra en esta versión: el Óptimo de Aprendizaje de Marketing queda como está.",
    ops: [],
  },
  {
    punto: "Insider · los «Ajuste» que suben la vara",
    decision: "Conservan el número nuevo con que entraron: piden más que antes, y esa es la regla de la escala.",
    ops: [],
  },
  {
    punto: "Insider · N4 · la tercera pregunta del perfil (tráfico suficiente)",
    decision: "El umbral de tráfico queda en 50.000 visitas al mes, provisional, hasta que Insider mande su calificación de clientes.",
    ops: [],
  },
  {
    punto: "Insider · N6 · la lectura de preparación, con sus umbrales y sus cimientos",
    decision: "Los umbrales quedan escritos donde Nexus los lee: el del tráfico, en la tercera pregunta del perfil; el de la base, en «Lista».",
    ops: [],
  },
  {
    punto: "Insider · N6 · la base dentro de un rango",
    decision: "El umbral de la base queda en 5.000 y el rango de HubSpot no se parte: una empresa de mil a 10 mil contactos queda «por confirmar» en la lectura.",
    ops: [],
  },
  {
    punto: "Insider · N6 · qué es una relación digital recurrente",
    decision: "Una empresa que vende con equipo puede estar «Lista»: la lectura no pide venta sin vendedor.",
    ops: [],
  },
  {
    punto: "Insider · N7 · el mapa de herramientas para la 9.0",
    decision: "El mapa de herramientas 2.0.0 se publica con la 9.0 y reemplaza al 1.0.1.",
    ops: [],
  },
];

/** Lo último del cierre: la fecha de la versión y su entrada en el historial. */
export const FINAL: Decision = {
  punto: "historial",
  decision: "La 9.0.0 lleva la fecha en que se publica y su entrada en el historial.",
  ops: [
    { op: "encabezado", clave: "fecha", valor: FECHA_DE_LA_9_0 },
    {
      op: "prosa-insertar",
      parte: "Parte 4",
      despuesDe: "Historial de versiones",
      bloques: [
        {
          tipo: "parrafo",
          texto:
            `**9.0.0 (${FECHA_DE_LA_9_0}).** La revisión de la 8.9 y el engagement avanzado. Cada cosa se mide en un solo lugar: lo que compartían Ventas y Marketing, o Ventas y Servicio, queda en el área que lo ejecuta, y la regla de asignación suma los acuerdos entre dos áreas, la renovación y el siguiente producto, la lealtad, la plantilla de la propuesta y lo que cambia en la tienda para cada comprador. Los criterios que pedían dos cosas se parten; los Óptimos que se cumplían con una persona y datos bajan a Eficiente, con la misma vara en las tres áreas; entran criterios para lo que ningún criterio pedía —el plan de canales, el contacto antes de cada entrega, los duplicados de Servicio, la identidad del cliente y el permiso de contacto—, y las señales de Deficiente e Inicial se completan. El perfil de negocio suma una tercera pregunta, el tráfico del sitio o la app, con su marca, «tráfico suficiente», y la Parte 2 suma la lectura de preparación para engagement avanzado, que no cambia el nivel. La dimensión 6 se llama «Priorización» como nombre general. Entran 112 criterios en la matriz y salen 54; los que cambian de nivel o de lo que mide dejan su identificador y entran con otro, y la especificación 1.4.0 los anota como retirados. Las ediciones leen como la general lo que su texto propio todavía no dice. Cambia lo que piden todos los niveles. Se publica con decisiones provisionales que su responsable revisa: están en el manual de operación.`,
        },
      ],
    },
  ],
};

/**
 * Lo corregido después de cerrar (el borrador cerrado en producción es la revisión 117), en orden. Cada una con su nota
 * en la bitácora, como las del cierre.
 */
export const CORRECCIONES: readonly Decision[] = [
  {
    punto: "§3 · 1.4.E3 · 2.4.E3 · 3.4.E4 (acuerdos entre dos áreas)",
    decision:
      "Corrección del cierre: cada acuerdo entre dos áreas se cuenta en Equipo y Gobierno de una sola de las dos, la que lo mide, y la regla los nombra. Decía «del área que recibe», y la señal del siguiente producto la mide Servicio, que es quien la manda.",
    ops: [
      {
        op: "prosa-punto",
        parte: P2,
        empieza: "Cada **acuerdo entre dos áreas**",
        texto:
          "Cada **acuerdo entre dos áreas** se cuenta una sola vez, en **Equipo y Gobierno** de una de las dos: el traspaso de los leads de Marketing a Ventas, en **1.4**; el de cada cliente nuevo de Ventas a Servicio y la señal de Servicio a Ventas de los clientes listos para el siguiente producto, en **3.4**; y qué clientes se vuelven casos de éxito o referidos, que el líder de marketing acuerda con Servicio, en **2.4**. La automatización del traspaso sigue en Tecnología.",
      },
    ],
  },
];

/** La nota de la bitácora de una decisión. Empieza con «9.0 · », como las del catálogo. */
export function notaDelCierre(d: Decision): string {
  return `9.0 · cierre · ${d.punto}. ${MARCA_PROVISIONAL[0]!.toUpperCase()}${MARCA_PROVISIONAL.slice(1)}: ${d.decision}`;
}

export const NOTA_DE_LA_SALIDA =
  "9.0 · cierre · sale «Lo que falta decidir»: cada pregunta, cada texto por escribir y cada cosa que esperaba la prueba tiene su decisión provisional del 27 oct (propuesta de Claude; Elías la revisa), en el manual de operación 1.4.0.";

/** Las decisiones como entradas del catálogo, para aplicarlas con el mismo aplicador y verlas en la bitácora. */
export function entradasDelCierre(): Entrada[] {
  return [...CIERRE, FINAL, ...CORRECCIONES].map((d) => ({
    punto: `cierre · ${d.punto}`,
    fuente: "pendiente-9-0",
    tema: "Cierre del borrador",
    resumen: d.decision,
    estado: "aplicada-con-redaccion",
    ops: d.ops,
  }));
}
