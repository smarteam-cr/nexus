/**
 * lib/tests-diagnostico/variantes-de-crm.datos.ts — LAS VARIANTES DEL BANCO POR USO DE CRM: el texto que lee cada grupo
 * en lugar de la base. Solo datos; las reglas y por qué existen viven en ./variantes.ts.
 *
 * Una entrada se cuelga de toda pregunta con ese id cuyo campo diga EXACTAMENTE `base`, en todas las versiones y
 * ediciones: se escribe una vez por texto distinto, no por banco. Si la escala cambia una base, la entrada queda sin uso y
 * la prueba (./variantes.test.ts) lo dice. Se cargan a los borradores con scripts/tests-variantes-crm.ts.
 *
 * Cómo escribirlas:
 *   · Mismo nivel que la base (docs/escala/escala_rendimiento_smarteam.md). Se cambia la herramienta, nunca lo que el
 *     equipo hace.
 *   · `{crm}` pone lo que marcó la persona («HubSpot», «Salesforce», «tu CRM»; en `sin-crm`, «tus hojas de cálculo» o
 *     «el lugar donde hoy anotan a tus clientes»: ahí solo calza después de «en»).
 *   · El vocabulario sin CRM es neutro: «un lugar común» donde la base dice el CRM como lugar, «tu base de clientes» donde
 *     lo dice como sistema que se conecta, «lo que se paga» donde dice las herramientas.
 */
import type { CampoDeVariante, EntradaDeVariante } from "./variantes";

/** La versión de la escala contra la que se revisó este archivo. La mueve SOLO la skill `revisar-banco-del-test`. */
export const ESCALA_DE_LAS_VARIANTES = "9.2.0";

type Cambio = readonly [buscar: string, poner: string];

/** Una entrada que sale de cambiar un pedazo de la base: así la base y la variante no se separan. */
function cambia(pregunta: string, campo: CampoDeVariante, base: string, cambios: { con?: Cambio; sin?: Cambio }): EntradaDeVariante {
  const con = cambios.con ? base.replace(cambios.con[0], cambios.con[1]) : undefined;
  const sin = cambios.sin ? base.replace(cambios.sin[0], cambios.sin[1]) : undefined;
  return { pregunta, campo, base, ...(con ? { "con-crm": con } : {}), ...(sin ? { "sin-crm": sin } : {}) };
}

/** «¿Qué pasa en tu sistema…»: cada grupo lee el nombre de lo que usa. */
const enTuHerramienta = (pregunta: string, base: string) => cambia(pregunta, "texto", base, { con: ["tu sistema", "{crm}"], sin: ["tu sistema", "{crm}"] });

/** Ventas, nivel Funcional: el proceso escrito en el CRM. Sin CRM mide lo mismo: un proceso escrito, en un solo lugar. */
const procesoEnElCrm = (base: string) => cambia("p-1.1", "F", base, { con: ["en el CRM", "en {crm}"], sin: ["en el CRM", "en un solo lugar"] });

/** Ventas, nivel Eficiente: el CRM conectado con los otros sistemas. */
function crmConectado(base: string): EntradaDeVariante {
  const sujeto = base.startsWith("El CRM") ? "El CRM" : "el CRM";
  return cambia("p-1.2", "E", base, { con: [sujeto, "{crm}"], sin: [sujeto, base.startsWith("El CRM") ? "Tu base de clientes" : "tu base de clientes"] });
}

const SIN_HERRAMIENTAS: Cambio = ["las herramientas que se pagan se usan", "lo que se paga para marketing se usa"];

export const VARIANTES_DE_CRM: readonly EntradaDeVariante[] = [
  // ── 1.1 Procesos y Rutinas (Ventas) ──
  procesoEnElCrm("Todo el equipo sigue el mismo proceso escrito en el CRM, con etapas, una cadencia de contacto y una revisión fija de los negocios."),
  procesoEnElCrm("Todo el equipo sigue el mismo recorrido escrito de la solicitud en el CRM, con un plazo de respuesta en cada etapa comercial, una cadencia de seguimiento y una revisión fija de las solicitudes."),
  procesoEnElCrm("Todo el equipo sigue el mismo proceso de admisión escrito en el CRM, con etapas, una cadencia de contacto, una revisión fija de los aspirantes y el calendario de cada período."),
  procesoEnElCrm("Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la firma, con una cadencia de contacto, un proceso de reserva escrito y una revisión fija de los negocios."),
  procesoEnElCrm("Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la llegada, con una cadencia de contacto, un proceso escrito para cotizar grupos y una revisión fija de las reservas."),
  procesoEnElCrm("Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la entrega, con una cadencia de contacto, un proceso escrito para recibir el usado y una revisión fija de los negocios."),
  procesoEnElCrm("Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la entrega técnica, con una cadencia de contacto, un proceso escrito para recibir la máquina usada y una revisión fija de los negocios."),
  procesoEnElCrm("Todo el equipo sigue el mismo recorrido escrito en el CRM, de la consulta a la activación o la instalación, con una cadencia de contacto, el proceso de la portabilidad por escrito y una revisión fija de las ventas."),

  // ── 1.2 Tecnología y Automatización (Ventas) · la pregunta ──
  enTuHerramienta("p-1.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra un lead o se cierra una venta?"),
  enTuHerramienta("p-1.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien compra en la tienda en línea o en la caja?"),
  enTuHerramienta("p-1.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una solicitud o cambia de estado?"),
  enTuHerramienta("p-1.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando llega un interesado o un aspirante hace su solicitud o su matrícula en línea?"),
  enTuHerramienta("p-1.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una consulta o se reserva una unidad?"),
  enTuHerramienta("p-1.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una consulta o se hace una reserva en cualquier canal?"),
  enTuHerramienta("p-1.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una consulta o se aparta un vehículo?"),
  enTuHerramienta("p-1.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando entra una consulta o se aparta una máquina?"),
  enTuHerramienta("p-1.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando llega un interesado o una venta avanza hacia la activación?"),

  // ── 1.2 · la línea que aclara ──
  cambia("p-1.2", "ayuda", "Mide si la tienda, la caja y el CRM trabajan como un solo sistema, y cuánto trabajo repetitivo se automatiza.", {
    con: ["el CRM", "{crm}"],
    sin: ["el CRM", "tu base de clientes"],
  }),
  cambia("p-1.2", "ayuda", "Mide cuánto del trabajo repetitivo hace el sistema —repartir las solicitudes, registrar lo que entra por los canales digitales, avisarle al cliente en qué va su solicitud—, si el CRM está conectado con el core bancario y cómo usa el equipo la IA.", {
    con: ["el CRM", "{crm}"],
    sin: ["el CRM está conectado", "tu base de clientes está conectada"],
  }),

  // ── 1.2 · Deficiente: tener CRM no es usarlo. Quien no lo tiene lee la base. ──
  {
    pregunta: "p-1.2",
    campo: "D",
    base: "No hay un CRM: los leads y las ventas se anotan donde cada quien puede.",
    "con-crm": "{crm} casi no se usa: los leads y las ventas se siguen anotando donde cada quien puede.",
  },
  {
    pregunta: "p-1.2",
    campo: "D",
    base: "No hay un CRM: los interesados y las matrículas se anotan donde cada quien puede.",
    "con-crm": "{crm} casi no se usa: los interesados y las matrículas se siguen anotando donde cada quien puede.",
  },
  {
    pregunta: "p-1.2",
    campo: "D",
    base: "No hay un CRM: los interesados y las ventas se anotan en hojas de cálculo o en el WhatsApp de cada ejecutivo.",
    "con-crm": "{crm} casi no se usa: los interesados y las ventas se siguen anotando en hojas de cálculo o en el WhatsApp de cada ejecutivo.",
  },

  // ── 1.2 · Inicial: todo en un lugar, pero a mano ──
  {
    pregunta: "p-1.2",
    campo: "I",
    base: "Hay un CRM, pero todo se carga y se reparte a mano.",
    "con-crm": "{crm} se usa, pero todo se carga y se reparte a mano.",
    "sin-crm": "Hay un lugar común para anotar todo, pero se carga y se reparte a mano.",
  },
  {
    pregunta: "p-1.2",
    campo: "I",
    base: "Hay un CRM, pero las solicitudes se cargan y se reparten a mano, y el cliente tiene que llamar para saber en qué va la suya.",
    "con-crm": "{crm} se usa, pero las solicitudes se cargan y se reparten a mano, y el cliente tiene que llamar para saber en qué va la suya.",
    "sin-crm": "Hay un lugar común para las solicitudes, pero se cargan y se reparten a mano, y el cliente tiene que llamar para saber en qué va la suya.",
  },
  {
    pregunta: "p-1.2",
    campo: "I",
    base: "Hay un CRM, pero los interesados se reparten a mano, lo que se contrata en la web o en la app se pasa al sistema cuando alguien tiene tiempo y el cliente tiene que llamar para saber en qué va su venta.",
    "con-crm": "{crm} se usa, pero los interesados se reparten a mano, lo que se contrata en la web o en la app se pasa ahí cuando alguien tiene tiempo y el cliente tiene que llamar para saber en qué va su venta.",
    "sin-crm": "Hay un lugar común para los interesados, pero se reparten a mano, lo que se contrata en la web o en la app se pasa ahí cuando alguien tiene tiempo y el cliente tiene que llamar para saber en qué va su venta.",
  },

  // ── 1.2 · Eficiente: conectado con los otros sistemas ──
  crmConectado("Las secuencias se adaptan a cómo responde cada prospecto, los leads se asignan por varias condiciones, el CRM se conecta con los otros sistemas que use la empresa y el equipo usa la IA en su trabajo diario."),
  crmConectado("El CRM se conecta con el core bancario, las simulaciones salen del sistema, el cliente firma sin ir a la sucursal y el equipo usa la IA en su trabajo diario."),
  cambia("p-1.2", "E", "Las secuencias se adaptan a cómo responde cada aspirante, el CRM trabaja conectado con los sistemas académico y de pagos que use la institución, el aspirante hace sus trámites en línea sin ir a la sede y el equipo usa la IA en su trabajo diario.", {
    con: ["el CRM", "{crm}"],
    sin: ["el CRM trabaja conectado", "tu base de clientes trabaja conectada"],
  }),
  crmConectado("Las cotizaciones salen del sistema, la reserva y la promesa —o el contrato, en un alquiler— se firman de forma digital, el CRM se conecta con los otros sistemas que use la empresa y el equipo usa la IA en su trabajo diario."),
  crmConectado("Las cotizaciones salen del sistema, el CRM se conecta con el sistema de reservas y el equipo usa la IA en su trabajo diario."),
  crmConectado("Las cotizaciones salen del sistema, la solicitud de financiamiento viaja sola a las financieras, el CRM se conecta con el sistema del concesionario y el equipo usa la IA en su trabajo diario."),
  crmConectado("Las cotizaciones salen del sistema, la solicitud de financiamiento viaja sola a los bancos y las arrendadoras, el CRM se conecta con el sistema del distribuidor y el equipo usa la IA en su trabajo diario."),
  crmConectado("Las ofertas salen del sistema, el CRM se conecta con los sistemas del operador, el cliente puede contratar en línea de punta a punta y el equipo usa la IA en su trabajo diario."),

  // ── 1.3 Datos (Ventas): cada quien lee dónde están sus datos ──
  cambia("p-1.3", "D", "Los datos de ventas están repartidos entre el CRM, las hojas de cada tienda y los sistemas del operador, y nadie los cuida.", {
    con: ["el CRM", "{crm}"],
    sin: ["entre el CRM, las hojas de cada tienda y los sistemas", "entre las hojas de cada tienda y los sistemas"],
  }),
  ...[
    "Hay datos en el sistema, pero incompletos: el reporte del pipeline hay que corregirlo a mano antes de usarlo.",
    "Hay datos en el sistema, pero incompletos: el reporte de ventas hay que corregirlo a mano antes de usarlo.",
    "Hay datos en el sistema, pero incompletos: el reporte de admisiones hay que corregirlo a mano antes de usarlo.",
  ].map((base) => cambia("p-1.3", "I", base, { con: ["en el sistema", "en {crm}"], sin: ["en el sistema", "en {crm}"] })),

  // ── 2.2 Tecnología y Automatización (Marketing) · la pregunta ──
  enTuHerramienta("p-2.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien deja sus datos en tu sitio o te escribe por WhatsApp o el chat?"),
  enTuHerramienta("p-2.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien se suscribe en tu tienda en línea o te escribe por WhatsApp o el chat?"),
  enTuHerramienta("p-2.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien pide información de un producto en tu sitio o te escribe por WhatsApp o por el chat?"),
  enTuHerramienta("p-2.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando un interesado deja sus datos en tu sitio o en una feria, o te escribe por WhatsApp o el chat?"),
  enTuHerramienta("p-2.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien deja sus datos en tu sitio o en la página de un proyecto, o te escribe por WhatsApp o el chat para preguntar por una unidad?"),
  enTuHerramienta("p-2.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien deja sus datos en tu sitio o te escribe por WhatsApp o el chat para preguntar por fechas?"),
  enTuHerramienta("p-2.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien pide una cotización o una prueba de manejo en tu sitio, o te escribe por WhatsApp?"),
  enTuHerramienta("p-2.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien pide una cotización o una demostración en tu sitio, o te escribe por WhatsApp?"),
  enTuHerramienta("p-2.2", "¿Qué pasa en tu sistema, sin que nadie lo haga a mano, cuando alguien llena la página de una campaña, se preregistra para un equipo o te escribe por WhatsApp, y cuando sale una base de tus sistemas?"),

  // ── 2.2 · la línea que aclara ──
  cambia("p-2.2", "ayuda", "Mide si las herramientas que se pagan se usan, si lo que entra llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.", { sin: SIN_HERRAMIENTAS }),
  cambia("p-2.2", "ayuda", "Mide si las herramientas de marketing que paga la tienda se usan, si lo que entra llega solo al sistema, si el catálogo y las compras alimentan solos los anuncios, y cuánto trabajo repetitivo hacen las automatizaciones y la IA.", {
    sin: ["las herramientas de marketing que paga la tienda se usan", "lo que paga la tienda para marketing se usa"],
  }),
  cambia("p-2.2", "ayuda", "Mide si las herramientas que paga la entidad se usan, si quien pide información de un producto llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.", {
    sin: ["las herramientas que paga la entidad se usan", "lo que paga la entidad para marketing se usa"],
  }),
  cambia("p-2.2", "ayuda", "Mide si las herramientas que paga la institución se usan, si cada interesado —del sitio, de una feria o de una conversación— llega solo al sistema y cuánto trabajo repetitivo de las campañas hacen las automatizaciones y la IA.", {
    sin: ["las herramientas que paga la institución se usan", "lo que paga la institución para marketing se usa"],
  }),
  cambia("p-2.2", "ayuda", "Mide si las herramientas que se pagan se usan, si cada interesado que deja sus datos o escribe llega solo al sistema y cuánto trabajo repetitivo del marketing inmobiliario hacen las automatizaciones y la IA.", { sin: SIN_HERRAMIENTAS }),
  cambia("p-2.2", "ayuda", "Mide si las herramientas que se pagan se usan, si cada viajero que deja sus datos o escribe llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.", { sin: SIN_HERRAMIENTAS }),
  cambia("p-2.2", "ayuda", "Mide si las herramientas que se pagan se usan, si cada interesado que deja sus datos o escribe llega solo al sistema y cuánto trabajo repetitivo hacen las automatizaciones y la IA.", { sin: SIN_HERRAMIENTAS }),
  {
    pregunta: "p-2.2",
    campo: "ayuda",
    base: "Mide si las herramientas que paga el operador se usan, si lo que entra por las páginas de campaña, el preregistro, WhatsApp y las bases de sus sistemas llega solo al CRM, y cuánto trabajo repetitivo hacen las automatizaciones y la IA.",
    "con-crm": "Mide si las herramientas que paga el operador se usan, si lo que entra por las páginas de campaña, el preregistro, WhatsApp y las bases de sus sistemas llega solo a {crm}, y cuánto trabajo repetitivo hacen las automatizaciones y la IA.",
    "sin-crm": "Mide si lo que paga el operador para marketing se usa, si lo que entra por las páginas de campaña, el preregistro, WhatsApp y las bases de sus sistemas llega solo a un lugar común, y cuánto trabajo repetitivo hacen las automatizaciones y la IA.",
  },

  // ── 2.2 · las opciones ──
  {
    pregunta: "p-2.2",
    campo: "D",
    base: "No hay un sistema para marketing: los contactos viven en hojas y correos, y todo se hace a mano.",
    "con-crm": "{crm} casi no se usa para marketing: los contactos siguen viviendo en hojas y correos, y todo se hace a mano.",
  },
  {
    pregunta: "p-2.2",
    campo: "I",
    base: "Hay herramientas, pero se usan a medias: se pagan licencias o módulos que nadie usa y parte de lo que entra se pasa a mano.",
    "con-crm": "{crm} se usa a medias: se pagan licencias o módulos que nadie usa y parte de lo que entra se pasa a mano.",
    "sin-crm": "Se contrató algo para marketing, pero se usa a medias: se pagan licencias o módulos que nadie usa y parte de lo que entra se pasa a mano.",
  },
  cambia("p-2.2", "F", "Las herramientas que se pagan se usan, lo que entra llega solo al sistema y recibe respuesta, y si el equipo usa IA, esta conoce la voz de marca y los buyer personas.", {
    sin: ["Las herramientas que se pagan se usan", "Lo que se paga para marketing se usa"],
  }),
  cambia("p-2.2", "F", "Las herramientas que paga la tienda se usan, lo que entra llega solo al sistema y recibe respuesta, y si hay anuncios de producto, el catálogo y las compras de la tienda los alimentan solos.", {
    sin: ["Las herramientas que paga la tienda se usan", "Lo que paga la tienda para marketing se usa"],
  }),
  cambia("p-2.2", "F", "Las herramientas que se pagan se usan, todo interesado —llegue por el sitio, por una feria o, si se usa, por WhatsApp o el chat— entra solo al sistema y recibe respuesta, y si el equipo usa IA, esta conoce la voz de la institución y los buyer personas.", {
    sin: ["Las herramientas que se pagan se usan", "Lo que se paga para marketing se usa"],
  }),
  {
    pregunta: "p-2.2",
    campo: "F",
    base: "Las herramientas que se pagan se usan, lo que entra llega solo al sistema y recibe respuesta, cada base de campaña pasa por el CRM, y si el equipo usa IA, esta conoce la voz de marca y los perfiles de cliente.",
    "con-crm": "Las herramientas que se pagan se usan, lo que entra llega solo al sistema y recibe respuesta, cada base de campaña pasa por {crm}, y si el equipo usa IA, esta conoce la voz de marca y los perfiles de cliente.",
    "sin-crm": "Lo que se paga para marketing se usa, lo que entra llega solo al sistema y recibe respuesta, cada base de campaña pasa por un lugar común, y si el equipo usa IA, esta conoce la voz de marca y los perfiles de cliente.",
  },
  cambia("p-2.2", "E", "Las herramientas están integradas, las automatizaciones siguen reglas de varios pasos y la IA ayuda al equipo en su trabajo diario.", {
    sin: ["Las herramientas están integradas", "Lo que se usa para marketing está integrado"],
  }),

  // ── 2.3 Datos (Marketing) ──
  cambia("p-2.3", "I", "Los datos están en el sistema, pero los reportes se arman a mano y la limpieza se hace cuando alguien se acuerda.", {
    con: ["en el sistema", "en {crm}"],
    sin: ["en el sistema", "en {crm}"],
  }),

  // ── 3.2 Tecnología y Automatización (Servicio) ──
  // Solo Deficiente: el sistema de atención puede no ser el CRM, y quien no tiene CRM puede tener uno de casos.
  {
    pregunta: "p-3.2",
    campo: "D",
    base: "No hay un sistema de atención: los casos viven en el correo y el teléfono de cada persona.",
    "con-crm": "{crm} no se usa para atender: los casos viven en el correo y el teléfono de cada persona.",
  },
];
