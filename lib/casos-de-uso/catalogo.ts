/**
 * lib/casos-de-uso/catalogo.ts — el catálogo de casos de uso de Smarteam, versión 1 (BORRADOR, 2026-10-11).
 *
 * Pedido de Elías: un catálogo mínimo para que la preventa y las propuestas lo usen de inspiración. Cada caso dice
 * el RESULTADO que obtiene el cliente, nunca el trabajo que se hace. Está atado a la Escala de Rendimiento: qué
 * dimensiones mueve, de qué nivel a cuál y qué criterios cubre (`catalogo.test.ts` verifica que existan en la
 * escala publicada y que el nivel calce). Las herramientas y los servicios salen del mapa de herramientas
 * (docs/escala/mapa_de_herramientas.md).
 *
 * Tres tipos, como los ordena la escala («Land and expand»):
 *   - aterrizar: lleva un área a Funcional. Para la escala no es un caso de uso: es el servicio de entrada.
 *   - reactivar: recupera un HubSpot que se paga y no se usa (de Inicial a Funcional).
 *   - expandir: desde Funcional, sube una o varias dimensiones al nivel siguiente. Esto es un caso de uso.
 *   - complementario: un servicio que la escala no mide. No cita criterios.
 *
 * Fase 2: el licenciamiento de cada caso (hubs, ediciones y asientos). Por eso no hay campo todavía.
 * Este archivo es puro y no toca la base: se puede leer en el navegador.
 */
import type { Letra } from "@/lib/escala/documento/tipos";

export type TipoDeCaso = "aterrizar" | "reactivar" | "expandir" | "complementario";

/** Las herramientas, con las claves del mapa de herramientas. */
export type Herramienta = "hubspot" | "insider" | "smarteam";

/** Los servicios de Smarteam, con los nombres del mapa de herramientas. Los dos últimos todavía no están en el mapa. */
export const SERVICIOS = [
  "Implementación de CRM",
  "Rescate de CRM",
  "Migraciones de datos",
  "Integraciones y automatización",
  "RevOps y alineación",
  "CDP y activación",
  "Desarrollo de sitio web",
  "SmartLoop",
  "Contenido y SEO",
  "Capacitación técnica",
] as const;
export type Servicio = (typeof SERVICIOS)[number];

/** Las áreas de la escala: 1 Ventas, 2 Marketing, 3 Servicio. */
export type AreaDeLaEscala = "1" | "2" | "3";

export interface Movimiento {
  /** La dimensión de la escala: `1.5`. */
  dimension: string;
  /** El nivel en que suele estar cuando se ofrece el caso. */
  desde: Letra;
  /** El nivel al que la deja. */
  hasta: Letra;
}

export interface CasoDelCatalogo {
  /** Estable: no cambia aunque cambie el título. */
  id: string;
  /** El resultado, en imperativo y en tuteo. */
  titulo: string;
  /** Lo que gana el cliente, en una frase. */
  promesa: string;
  /** Qué incluye, contado como lo que cambia para el cliente: dos frases. Es la que se lee en la tarjeta del catálogo. */
  descripcion: string;
  tipo: TipoDeCaso;
  areas: AreaDeLaEscala[];
  /** Cómo lo diría el cliente. Es lo que usa el agente para reconocer el caso en una reunión. */
  sintomas: string[];
  /** Lo que el cliente puede hacer, ver o decidir que antes no podía. Resultados, no trabajo. */
  obtienes: string[];
  mueve: Movimiento[];
  /** Los criterios de la escala general que cubre (`1.5.F4`). */
  criterios: string[];
  herramientas: Herramienta[];
  servicios: Servicio[];
  /** Para qué negocio conviene, cuando no es para todos. */
  cuandoConviene?: string;
  /** Los casos que conviene tener antes. */
  requiere?: string[];
  /** El caso más grande del que este es una parte más chica. */
  dentroDe?: string;
  /** Nota interna para quien vende: qué no mide la escala o qué hay que saber antes de ofrecerlo. */
  aviso?: string;
}

export const CATALOGO_DE_CASOS: readonly CasoDelCatalogo[] = [
  // ─── Aterrizar ───────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "sistematiza-ventas",
    titulo: "Sistematiza tu proceso comercial con HubSpot",
    promesa: "Tu equipo comercial vende con un mismo proceso en el CRM y ves en qué va cada negocio sin tener que preguntar.",
    descripcion:
      "Tu proceso comercial queda en HubSpot de punta a punta: un pipeline con etapas claras, la ficha de cada cliente con lo que importa, reglas para repartir los leads y un tablero de seguimiento. Tu equipo vende igual y tú ves el avance sin pedir reportes.",
    tipo: "aterrizar",
    areas: ["1"],
    sintomas: [
      "Cada vendedor vende a su manera.",
      "No sé en qué va cada negocio hasta que pregunto.",
      "Si se va un vendedor, se lleva sus clientes.",
      "Los leads se los queda quien los ve primero.",
    ],
    obtienes: [
      "Si rota un vendedor, el siguiente sabe en qué va cada negocio.",
      "Ningún lead se pierde por no saber a quién le toca.",
      "Ves el estado real del pipeline cuando lo necesitas, sin armar el reporte a mano.",
      "Ningún negocio se enfría sin que alguien reaccione.",
    ],
    mueve: [
      { dimension: "1.1", desde: "D", hasta: "F" },
      { dimension: "1.2", desde: "D", hasta: "F" },
      { dimension: "1.3", desde: "D", hasta: "F" },
      { dimension: "1.4", desde: "D", hasta: "F" },
      { dimension: "1.7", desde: "D", hasta: "F" },
    ],
    criterios: [
      "1.1.F1", "1.1.F2", "1.1.F4", "1.1.F5", "1.1.F6",
      "1.2.F2", "1.2.F3",
      "1.3.F1", "1.3.F3", "1.3.F4",
      "1.4.F1", "1.4.F2", "1.4.F3",
      "1.7.F1", "1.7.F2", "1.7.F3",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
  },
  {
    id: "sistematiza-marketing",
    titulo: "Sistematiza tu marketing con HubSpot",
    promesa: "Tu marketing deja de depender de una persona: sabes de dónde viene cada lead y cuánto te cuesta en cada canal.",
    descripcion:
      "Tu marketing queda montado en HubSpot: formularios que entran al sistema, segmentos básicos, campañas con fecha y reportes por canal. El equipo genera demanda que se puede medir, y lo que funciona no depende de quién está.",
    tipo: "aterrizar",
    areas: ["2"],
    sintomas: [
      "No sé de dónde vienen mis leads.",
      "Las campañas salen cuando alguien tiene tiempo.",
      "Pagamos herramientas que nadie usa.",
      "Los formularios del sitio llegan a un correo y ahí se quedan.",
    ],
    obtienes: [
      "Sabes de dónde viene cada lead, con reportes que salen del sistema.",
      "Las campañas siguen saliendo aunque cambie una persona del equipo.",
      "Ves cuánto te cuesta cada lead según el canal del que viene.",
      "Todo lo que entra por el sitio llega al sistema y recibe respuesta.",
    ],
    mueve: [
      { dimension: "2.1", desde: "D", hasta: "F" },
      { dimension: "2.2", desde: "D", hasta: "F" },
      { dimension: "2.3", desde: "D", hasta: "F" },
      { dimension: "2.4", desde: "D", hasta: "F" },
      { dimension: "2.7", desde: "D", hasta: "F" },
      { dimension: "2.8", desde: "D", hasta: "F" },
    ],
    criterios: [
      "2.1.F1", "2.1.F2", "2.1.F3", "2.1.F6",
      "2.2.F2", "2.2.F3", "2.2.F5",
      "2.3.F1", "2.3.F5",
      "2.4.F1", "2.4.F2", "2.4.F3",
      "2.7.F5", "2.7.F6",
      "2.8.F3", "2.8.F5",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    aviso: "Aterrizar Marketing pide más acompañamiento que configuración: hay que enseñarle al equipo a operar sus canales y su calendario. Conviene decirlo cuando el cliente compara precios.",
  },
  {
    id: "sistematiza-servicio",
    titulo: "Sistematiza tu servicio con HubSpot",
    promesa: "Tu servicio deja de depender de una persona: cada caso se atiende igual, con la historia del cliente a la vista.",
    descripcion:
      "Tu servicio queda en HubSpot: cada caso entra a una bandeja, sigue etapas claras, tiene un plazo de respuesta y queda en la ficha del cliente. El equipo responde con consistencia y tú sabes qué problemas llegan.",
    tipo: "aterrizar",
    areas: ["3"],
    sintomas: [
      "Cuando falta una persona, los casos se acumulan.",
      "Cada agente responde desde su correo o su teléfono.",
      "Nos enteramos del problema cuando el cliente ya está enojado.",
      "No sabemos cuántos casos llegan ni de qué tipo.",
    ],
    obtienes: [
      "Un caso se atiende igual sin importar qué agente lo tome.",
      "Cualquier agente tiene la historia del cliente en segundos.",
      "Lo urgente se atiende primero.",
      "Sabes qué tipo de problemas llegan y cuántos.",
    ],
    mueve: [
      { dimension: "3.1", desde: "D", hasta: "F" },
      { dimension: "3.2", desde: "D", hasta: "F" },
      { dimension: "3.3", desde: "D", hasta: "F" },
      { dimension: "3.4", desde: "D", hasta: "F" },
      { dimension: "3.5", desde: "D", hasta: "F" },
      { dimension: "3.6", desde: "D", hasta: "F" },
    ],
    criterios: [
      "3.1.F1", "3.1.F2", "3.1.F4", "3.1.F6",
      "3.2.F5",
      "3.3.F1", "3.3.F4", "3.3.F5",
      "3.4.F1", "3.4.F2",
      "3.5.F1", "3.5.F2",
      "3.6.F1", "3.6.F3",
    ],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
  },
  {
    id: "reactiva-hubspot",
    titulo: "Reactiva tu inversión en HubSpot",
    promesa: "El HubSpot que ya pagas vuelve a ser la herramienta de trabajo del equipo, no una carga administrativa.",
    descripcion:
      "El HubSpot que pagas vuelve a usarse: se revisa qué se usa y qué no, se limpia lo que estorba y el equipo vuelve a trabajar ahí cada día. Recuperas el valor de las licencias antes de pensar en comprar más.",
    tipo: "reactivar",
    areas: ["1", "2", "3"],
    sintomas: [
      "Tenemos HubSpot, pero el equipo trabaja en Excel.",
      "Pagamos módulos que nadie usa.",
      "Los reportes no cuadran porque hay contactos duplicados.",
      "El CRM se llena después, cuando alguien se acuerda.",
    ],
    obtienes: [
      "El equipo abre el CRM para saber qué le toca hacer, no para cargar lo que ya hizo.",
      "Ninguna licencia que pagas lleva más de un mes sin usarse.",
      "Los reportes vuelven a ser confiables porque los duplicados están bajo control.",
      "Sacas provecho de lo que ya invertiste antes de invertir más.",
    ],
    mueve: [
      { dimension: "1.1", desde: "I", hasta: "F" },
      { dimension: "1.3", desde: "I", hasta: "F" },
      { dimension: "2.1", desde: "I", hasta: "F" },
      { dimension: "2.2", desde: "I", hasta: "F" },
      { dimension: "2.3", desde: "I", hasta: "F" },
      { dimension: "3.1", desde: "I", hasta: "F" },
    ],
    criterios: ["1.1.F6", "1.3.F2", "2.1.F6", "2.2.F2", "2.3.F3", "3.1.F6"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Rescate de CRM"],
  },
  {
    id: "migra-a-hubspot",
    titulo: "Migra a HubSpot sin perder datos ni continuidad",
    promesa: "Cambias de CRM sin dejar de vender ni de atender, y llegas con la historia de cada cliente completa y limpia.",
    descripcion:
      "Tu información pasa del CRM actual a HubSpot con su historia completa: contactos, negocios, casos y conversaciones, sin duplicados. El equipo sigue vendiendo y atendiendo mientras se hace el cambio.",
    tipo: "aterrizar",
    areas: ["1", "2", "3"],
    sintomas: [
      "Nuestro CRM actual ya no da más.",
      "Tenemos miedo de perder el historial si cambiamos.",
      "Los datos están repartidos entre varios sistemas y hojas.",
    ],
    obtienes: [
      "El equipo sigue vendiendo y atendiendo mientras se hace el cambio.",
      "Cada cliente llega con su historia: negocios, casos y conversaciones.",
      "Arrancas sin duplicados, con el origen y la etapa de cada contacto.",
      "Los reportes del primer día ya salen del sistema nuevo.",
    ],
    mueve: [
      { dimension: "1.3", desde: "I", hasta: "F" },
      { dimension: "2.3", desde: "I", hasta: "F" },
      { dimension: "3.3", desde: "I", hasta: "F" },
    ],
    criterios: ["1.3.F1", "1.3.F2", "1.3.F3", "2.3.F1", "2.3.F3", "3.3.F1", "3.3.F3"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Migraciones de datos"],
    aviso: "Suele ir junto con el aterrizaje del área: migrar sin ordenar el proceso deja los mismos problemas en otro sistema.",
  },

  // ─── Ventas ──────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "cotizaciones",
    titulo: "Estandariza y controla tus cotizaciones comerciales",
    promesa: "Cada cotización sale del sistema con la misma estructura, los precios vigentes y el alcance validado.",
    descripcion:
      "Cada cotización sale de HubSpot con una plantilla, el catálogo de productos y precios al día, y los descuentos aprobados por quien corresponde. Dejas de mandar propuestas distintas para clientes parecidos y ves qué se cotizó en cada negocio.",
    tipo: "expandir",
    areas: ["1"],
    sintomas: [
      "Cada vendedor arma la cotización a su manera.",
      "Se van cotizaciones con precios viejos o descuentos que nadie aprobó.",
      "Prometemos cosas que después no podemos entregar.",
      "No sé cuánto hay cotizado este mes.",
    ],
    obtienes: [
      "Dos clientes parecidos reciben una propuesta igual de sólida, sin importar qué vendedor les toque.",
      "Ninguna cotización sale con un precio viejo o un descuento sin aprobar.",
      "Solo prometes lo que el equipo puede entregar.",
      "Ves en cada negocio qué se cotizó, cuándo y por cuánto.",
    ],
    mueve: [
      { dimension: "1.5", desde: "I", hasta: "E" },
      { dimension: "1.2", desde: "F", hasta: "E" },
    ],
    criterios: ["1.5.F4", "1.5.E3", "1.2.E1"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene: "Cuando la venta la cierra una persona del equipo.",
  },
  {
    id: "prospeccion-ia",
    titulo: "Prioriza y acelera tu prospección B2B con IA",
    promesa: "Cada vendedor sabe cada mañana a quién contactar primero, y la IA le prepara el siguiente paso.",
    descripcion:
      "Cada lead tiene un puntaje, las cuentas clave están en una lista escrita y cada segmento recibe su propio mensaje. La IA le sugiere al vendedor la siguiente acción y él decide; los leads que no están listos siguen recibiendo contenido.",
    tipo: "expandir",
    areas: ["1"],
    sintomas: [
      "Los vendedores pierden tiempo con prospectos que nunca iban a comprar.",
      "Prospectamos a todos igual.",
      "Los leads que todavía no están listos se abandonan.",
    ],
    obtienes: [
      "Cada vendedor sabe cada mañana a quién contactar primero.",
      "Las cuentas que más importan se trabajan de forma deliberada, con mensajes para cada segmento.",
      "Los leads que todavía no están listos siguen recibiendo contenido hasta que lo están.",
      "La IA propone la siguiente mejor acción para cada lead y el vendedor decide.",
    ],
    mueve: [
      { dimension: "1.6", desde: "F", hasta: "O" },
      { dimension: "1.2", desde: "F", hasta: "E" },
      { dimension: "1.7", desde: "F", hasta: "E" },
    ],
    criterios: ["1.6.E1", "1.6.E2", "1.6.E3", "1.6.O1", "1.2.E2", "1.2.E5", "1.7.E2"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "SmartLoop"],
    cuandoConviene: "Cuando se le vende a empresas y la venta la cierra una persona del equipo.",
    requiere: ["sistematiza-ventas"],
  },
  {
    id: "pronostico",
    titulo: "Pronostica tus ventas con confianza",
    promesa: "Comprometes un número de ventas sabiendo que el pronóstico se acerca a lo que de verdad pasa.",
    descripcion:
      "El pronóstico sale de la historia real de tus negocios y no de lo que cree cada vendedor. Ves en qué etapa se caen y cuándo uno se traba, y comprometes un número que se acerca a lo que de verdad pasa.",
    tipo: "expandir",
    areas: ["1"],
    sintomas: [
      "El pronóstico es lo que cada vendedor cree que va a cerrar.",
      "Nos enteramos en la última semana del mes de que no llegamos.",
      "No sé en qué etapa se caen los negocios.",
    ],
    obtienes: [
      "En la mayoría de los meses, lo vendido queda dentro de ±10% del pronóstico.",
      "Ves en tiempo real en qué etapa se caen los negocios.",
      "Te enteras cuando un negocio se traba, sin esperar a la reunión.",
      "Un modelo calcula el pronóstico con la historia de los negocios y tú lo revisas antes de comprometerlo.",
    ],
    mueve: [
      { dimension: "1.3", desde: "F", hasta: "O" },
      { dimension: "1.2", desde: "F", hasta: "E" },
      { dimension: "1.7", desde: "F", hasta: "E" },
    ],
    criterios: ["1.3.E1", "1.3.O2", "1.2.E4", "1.7.E4"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    requiere: ["sistematiza-ventas"],
  },
  {
    id: "cobranza",
    titulo: "Acelera y controla tu cobranza con HubSpot",
    promesa: "Cobras a tiempo sin perseguir a nadie a mano, y Ventas y Servicio ven en la ficha qué tiene contratado cada cliente.",
    descripcion:
      "Los cobros, las facturas y lo que tiene contratado cada cliente quedan en HubSpot, con avisos que salen solos antes del vencimiento. Ventas y Servicio ven quién debe antes de volver a venderle o de atenderlo.",
    tipo: "expandir",
    areas: ["1", "3"],
    sintomas: [
      "Nos enteramos de que un cliente debe cuando ya pasó un mes.",
      "Cobranza persigue a los clientes por correo y por WhatsApp, a mano.",
      "Ventas le vuelve a vender a un cliente que no ha pagado.",
    ],
    obtienes: [
      "Cada cliente recibe el aviso de su cobro antes de que venza, sin que nadie lo mande a mano.",
      "Ventas y Servicio ven en la ficha lo que el cliente tiene contratado y lo que factura.",
      "Ningún reclamo por un cobro se pierde entre áreas.",
    ],
    mueve: [
      { dimension: "3.3", desde: "I", hasta: "F" },
      { dimension: "3.7", desde: "F", hasta: "E" },
      { dimension: "1.3", desde: "F", hasta: "E" },
    ],
    criterios: ["3.3.F2", "3.7.E4", "3.7.E5", "1.3.E3"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Integraciones y automatización"],
    aviso: "La escala no tiene un área de finanzas: mide que el cobro no se pierda entre áreas y que el cliente reciba el aviso a tiempo. Cobrar más rápido no tiene un criterio propio.",
  },

  // ─── Marketing ───────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "alinea-marketing-ventas",
    titulo: "Alinea Marketing y Ventas para que cada lead calificado llegue a tiempo",
    promesa: "Marketing y Ventas usan la misma definición de lead calificado, y cada lead listo le llega al vendedor que corresponde, con su historia.",
    descripcion:
      "Marketing y Ventas acuerdan por escrito qué es un lead calificado y quién se hace cargo de cada uno. Los leads listos le llegan al vendedor que corresponde con su historia, y Marketing ve qué pasó con lo que entregó.",
    tipo: "expandir",
    areas: ["1", "2"],
    sintomas: [
      "Ventas dice que los leads de Marketing no sirven.",
      "Los leads pasan días sin que nadie los llame.",
      "Marketing no sabe qué pasó con los leads que entregó.",
    ],
    obtienes: [
      "Ventas recibe primero los leads con más probabilidad de comprar.",
      "Cada lead listo llega al vendedor que corresponde, con su historial, sin que nadie lo pase a mano.",
      "Se acaba la discusión de quién se hace cargo de un lead: hay reglas escritas que se cumplen.",
    ],
    mueve: [
      { dimension: "1.6", desde: "I", hasta: "F" },
      { dimension: "2.6", desde: "I", hasta: "E" },
      { dimension: "2.2", desde: "F", hasta: "E" },
      { dimension: "1.4", desde: "F", hasta: "E" },
      { dimension: "2.4", desde: "F", hasta: "E" },
    ],
    criterios: ["1.6.F2", "2.6.F4", "2.6.E3", "2.2.E3", "1.4.E3", "2.4.E3"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["RevOps y alineación", "Implementación de CRM"],
    cuandoConviene: "Cuando Marketing le pasa leads a un equipo de vendedores.",
  },
  {
    id: "atribucion",
    titulo: "Descubre qué canal te trae ventas y cuánto te cuesta cada una",
    promesa: "Demuestras qué canal y qué contenido contribuyeron a cada venta, y mueves el presupuesto hacia donde rinde.",
    descripcion:
      "Cada venta queda conectada con los canales y contenidos que la hicieron posible, no solo con el primer clic. Ves cuánto te cuesta un lead y una venta por canal y mueves el presupuesto hacia lo que rinde.",
    tipo: "expandir",
    areas: ["2"],
    sintomas: [
      "Sé qué canal me trae clics, pero no cuál me trae ventas.",
      "Invertimos en pauta por costumbre.",
      "Cuando la dirección pregunta por el retorno, armamos una hoja a mano.",
    ],
    obtienes: [
      "Ves cuánto te costó cada lead y cada venta el último mes, por canal.",
      "Sabes qué canales y qué contenidos contribuyeron a cada venta, no solo cuál trajo el primer clic.",
      "Cada mes mueves el presupuesto hacia el canal que mejor rinde.",
    ],
    mueve: [
      { dimension: "2.7", desde: "I", hasta: "E" },
      { dimension: "2.3", desde: "F", hasta: "E" },
    ],
    criterios: ["2.7.F6", "2.3.E2", "2.7.E3"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["RevOps y alineación"],
    requiere: ["sistematiza-marketing"],
  },
  {
    id: "marketing-ia-breeze",
    titulo: "Acelera tu marketing con IA y Breeze",
    promesa: "Tu equipo produce más campañas y contenido con una IA que escribe con tu voz de marca y conoce a tus buyer personas.",
    descripcion:
      "La IA de HubSpot trabaja con tu voz de marca y tus buyer personas: prepara briefs, adapta piezas y carga el calendario. El equipo dedica su tiempo a la estrategia y una persona revisa todo antes de publicarlo.",
    tipo: "expandir",
    areas: ["2"],
    sintomas: [
      "Cada uno usa ChatGPT a su manera y todo suena distinto.",
      "El equipo no da abasto con el contenido.",
      "La IA escribe cosas genéricas que no suenan a nosotros.",
    ],
    obtienes: [
      "La IA redacta con tu voz de marca y para tus buyer personas, no a ciegas.",
      "El equipo dedica su tiempo a la estrategia mientras la IA prepara los briefs, adapta las piezas y carga el calendario.",
      "Cada pieza que produce la IA pasa por una persona antes de publicarse.",
      "Está escrito qué puede decidir la IA sola y quién la valida.",
    ],
    mueve: [
      { dimension: "2.2", desde: "I", hasta: "E" },
      { dimension: "2.1", desde: "F", hasta: "O" },
      { dimension: "2.5", desde: "F", hasta: "O" },
      { dimension: "2.4", desde: "F", hasta: "O" },
    ],
    criterios: ["2.2.F9", "2.2.E6", "2.1.O1", "2.5.O2", "2.4.O1"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["SmartLoop", "Implementación de CRM"],
  },
  {
    id: "seo-aeo",
    titulo: "Optimiza tu SEO y tu AEO",
    promesa: "Apareces cuando tus clientes buscan lo que ofreces, en Google y en los asistentes de IA.",
    descripcion:
      "Tu sitio cumple lo básico para los buscadores y tu contenido se organiza por temas alrededor de lo que vendes. Apareces en Google y en las respuestas de los asistentes de IA, y sabes cuántas veces.",
    tipo: "expandir",
    areas: ["2"],
    sintomas: [
      "No aparecemos en Google por lo que vendemos.",
      "Cuando alguien le pregunta a ChatGPT por lo que hacemos, no salimos.",
      "Publicamos contenido sin un plan.",
    ],
    obtienes: [
      "Tu sitio cumple lo básico para buscadores: se indexa, carga bien en el celular y no tiene enlaces rotos.",
      "Tu contenido está organizado por temas y refuerza lo que vendes.",
      "Apareces como respuesta en los asistentes de IA y sabes cuántas veces.",
      "Publicas contenido propio con una cadencia previsible.",
    ],
    mueve: [{ dimension: "2.5", desde: "I", hasta: "E" }],
    criterios: ["2.5.F4", "2.5.F5", "2.5.E2", "2.5.E3"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Contenido y SEO"],
  },
  {
    id: "presencia-web",
    titulo: "Evoluciona tu presencia web sobre HubSpot",
    promesa: "Tu sitio dice lo mismo que tu equipo, convierte visitas en contactos y lo administras sin depender de un programador.",
    descripcion:
      "Tu sitio vive en HubSpot, junto a tus campañas: cada formulario entra como contacto y recibe respuesta, y las landing pages salen sin esperar a nadie. El sitio dice lo mismo que tu equipo y lo cambias sin un programador.",
    tipo: "expandir",
    areas: ["1", "2"],
    sintomas: [
      "Para cambiar un texto del sitio dependemos de un proveedor.",
      "Los formularios llegan a un correo y se pierden.",
      "El sitio dice una cosa y los vendedores otra.",
    ],
    obtienes: [
      "Lo que una persona llena en el sitio entra solo como contacto y recibe respuesta.",
      "Tus landing pages se crean en el mismo sistema que tus campañas.",
      "El sitio, las presentaciones y el equipo dicen lo mismo sobre lo que te distingue.",
      "Tu equipo cambia el sitio sin esperar a un programador.",
    ],
    mueve: [
      { dimension: "2.2", desde: "I", hasta: "E" },
      { dimension: "2.5", desde: "I", hasta: "F" },
      { dimension: "1.5", desde: "F", hasta: "E" },
    ],
    criterios: ["2.2.F3", "2.2.F5", "2.2.E5", "2.5.F4", "1.5.E2"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Desarrollo de sitio web"],
  },

  // ─── Servicio y conversaciones ───────────────────────────────────────────────────────────────────────────
  {
    id: "whatsapp",
    titulo: "Integra WhatsApp y unifica tus conversaciones en HubSpot",
    promesa: "Lo que tu equipo habla por WhatsApp queda en la ficha del cliente, en una sola bandeja, y nadie se queda sin respuesta.",
    descripcion:
      "WhatsApp, el chat y el correo llegan a una sola bandeja en HubSpot, y cada conversación queda en la ficha del cliente. Ves cuánto tarda la primera respuesta y, si alguien se va, sus conversaciones se quedan en la empresa.",
    tipo: "expandir",
    areas: ["1", "2", "3"],
    sintomas: [
      "Cada vendedor atiende WhatsApp desde su teléfono.",
      "Si alguien se va, se lleva sus conversaciones.",
      "No sabemos cuántos mensajes quedan sin responder.",
    ],
    obtienes: [
      "Lo que cada persona habla por WhatsApp queda en el sistema, aunque responda desde su teléfono.",
      "Todos los canales escritos llegan a una sola bandeja.",
      "Ves en tiempo real cuánto tarda la primera respuesta y cuántas conversaciones esperan.",
      "Si alguien se va, sus conversaciones se quedan en la empresa.",
    ],
    mueve: [
      { dimension: "1.2", desde: "I", hasta: "E" },
      { dimension: "2.2", desde: "I", hasta: "E" },
      { dimension: "3.2", desde: "I", hasta: "E" },
    ],
    criterios: ["1.2.F4", "2.2.F4", "3.2.F4", "1.2.E4", "2.2.E4", "2.2.E7", "3.2.E3"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    cuandoConviene: "Cuando el equipo atiende o vende por WhatsApp.",
  },
  {
    id: "agentes-ia-atencion",
    titulo: "Automatiza la atención al cliente con agentes de IA",
    promesa: "Un agente de IA resuelve las consultas de siempre en todos tus canales y le pasa a una persona, con todo el contexto, lo que no puede resolver.",
    descripcion:
      "Un agente de IA atiende las consultas de siempre en tus canales, con el tono de tu marca y lo que sabe tu base de conocimiento. Lo que no puede resolver le llega a una persona con todo el contexto, y tu cartera crece sin crecer el equipo al mismo ritmo.",
    tipo: "expandir",
    areas: ["3"],
    sintomas: [
      "Atendemos las mismas preguntas todos los días.",
      "Para atender más clientes tenemos que contratar más gente.",
      "Fuera del horario nadie responde.",
    ],
    obtienes: [
      "Buena parte de los casos se resuelve sin que intervenga una persona.",
      "La cartera crece sin que el equipo crezca en la misma proporción.",
      "Lo que la IA no puede resolver llega a una persona con el contexto completo.",
      "La IA responde con el tono de tu marca, y el equipo revisa una muestra de sus respuestas.",
    ],
    mueve: [
      { dimension: "3.8", desde: "I", hasta: "O" },
      { dimension: "3.2", desde: "F", hasta: "O" },
      { dimension: "3.4", desde: "F", hasta: "O" },
      { dimension: "3.5", desde: "F", hasta: "O" },
    ],
    criterios: ["3.8.F1", "3.2.E2", "3.8.E3", "3.2.O1", "3.8.O2", "3.4.O1", "3.5.O1"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "SmartLoop"],
    requiere: ["sistematiza-servicio"],
    aviso: "Sin una base de conocimiento al día el agente responde mal: es lo primero que se arma.",
  },
  {
    id: "customer-success",
    titulo: "Expande tus cuentas con Customer Success en HubSpot",
    promesa: "Sabes qué cliente está sano, cuál se puede ir y cuál está listo para comprarte más, antes de que te lo diga.",
    descripcion:
      "Cada cliente tiene un indicador de salud que junta sus casos, su satisfacción y su uso. Los que están en riesgo reciben una acción a tiempo, los que tienen potencial una propuesta, y tus clientes clave revisan contigo qué lograron.",
    tipo: "expandir",
    areas: ["3", "1"],
    sintomas: [
      "Los clientes se van sin aviso.",
      "Solo hablamos con el cliente cuando hay un problema.",
      "No sabemos a qué clientes venderles más.",
    ],
    obtienes: [
      "Cada cliente tiene un indicador de salud que combina sus casos, su satisfacción y su uso.",
      "Los clientes en riesgo reciben una acción de retención antes de decidir irse.",
      "Los que tienen potencial reciben una propuesta de expansión, y el vendedor ve el riesgo y el potencial en el CRM.",
      "Tus clientes clave revisan contigo cada trimestre qué lograron y qué sigue.",
    ],
    mueve: [
      { dimension: "3.3", desde: "F", hasta: "E" },
      { dimension: "3.6", desde: "F", hasta: "E" },
      { dimension: "3.7", desde: "F", hasta: "E" },
      { dimension: "1.6", desde: "F", hasta: "O" },
    ],
    criterios: ["3.3.E5", "3.6.E1", "3.7.E1", "3.7.E2", "3.7.E3", "1.6.O2"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM", "RevOps y alineación"],
    cuandoConviene: "Cuando la relación con el cliente es continua: contratos, suscripciones o servicios recurrentes.",
    requiere: ["sistematiza-servicio"],
  },

  // ─── Datos e integraciones ───────────────────────────────────────────────────────────────────────────────
  {
    id: "data-lake",
    titulo: "Convierte tus datos en un activo confiable e integra tu stack",
    promesa: "Todo lo que pasa en tu empresa se junta en un solo lugar confiable, y lo que se calcula ahí vuelve a las herramientas de cada equipo.",
    descripcion:
      "Lo que pasa en Ventas, Marketing, Servicio y tus otros sistemas se junta en un almacén de datos confiable. Lo que se calcula ahí, como el riesgo de un cliente o el potencial de una cuenta, vuelve a la ficha de HubSpot.",
    tipo: "expandir",
    areas: ["1", "2", "3"],
    sintomas: [
      "Cada área tiene su número y ninguno cuadra.",
      "Para un reporte de la dirección cruzamos cinco sistemas a mano.",
      "La venta, la facturación y el servicio no se hablan.",
    ],
    obtienes: [
      "Ventas, Marketing y Servicio se apoyan en el mismo almacén de datos.",
      "Lo que se calcula afuera, como el potencial de una cuenta o el riesgo de un cliente, se ve en la ficha.",
      "El pronóstico y la atribución salen de la vista completa de la empresa, no de una sola herramienta.",
    ],
    mueve: [
      { dimension: "1.2", desde: "E", hasta: "O" },
      { dimension: "1.3", desde: "E", hasta: "O" },
      { dimension: "2.2", desde: "E", hasta: "O" },
      { dimension: "2.3", desde: "E", hasta: "O" },
      { dimension: "3.2", desde: "E", hasta: "O" },
      { dimension: "3.3", desde: "E", hasta: "O" },
    ],
    criterios: ["1.2.O3", "1.3.O4", "2.2.O3", "2.3.O1", "3.2.O4", "3.3.O2"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Integraciones y automatización"],
  },
  {
    id: "power-bi",
    titulo: "Lleva los datos de HubSpot a Power BI o a tu BI corporativo",
    promesa: "La dirección ve los números de HubSpot en el mismo tablero donde mira el resto de la empresa.",
    descripcion:
      "Los datos de HubSpot llegan solos al BI de tu empresa, sin exportarlos a mano. La dirección ve en un mismo tablero qué canal y qué cliente dejan más margen.",
    tipo: "expandir",
    areas: ["1", "2"],
    sintomas: [
      "La dirección no entra a HubSpot: quiere todo en Power BI.",
      "Cada semana exportamos de HubSpot a Excel para armar el reporte.",
    ],
    obtienes: [
      "Los datos de HubSpot llegan solos al BI de la empresa, sin exportarlos a mano.",
      "La dirección decide qué canal y qué cliente dejan más margen, con números de fondo.",
      "Los reportes de Marketing salen de la vista completa de la empresa.",
    ],
    mueve: [
      { dimension: "1.4", desde: "E", hasta: "O" },
      { dimension: "2.3", desde: "E", hasta: "O" },
      { dimension: "2.4", desde: "E", hasta: "O" },
    ],
    criterios: ["1.4.O1", "2.3.O1", "2.4.O4"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Integraciones y automatización"],
    dentroDe: "data-lake",
  },
  {
    id: "integracion-erp",
    titulo: "Integra HubSpot con tu ERP y tu backoffice",
    promesa: "Ventas y Servicio ven en HubSpot lo que pasa en el ERP, como pedidos, facturas e inventario, sin pedírselo a nadie.",
    descripcion:
      "HubSpot y tu ERP se hablan: pedidos, facturas e inventario aparecen en la ficha del cliente. Quien vende sabe qué hay disponible antes de ofrecerlo y nadie carga dos veces el mismo dato.",
    tipo: "expandir",
    areas: ["1", "3"],
    sintomas: [
      "El vendedor llama a administración para saber si un cliente pagó.",
      "Ofrecemos productos que ya no hay en inventario.",
      "Cargamos dos veces el mismo pedido.",
    ],
    obtienes: [
      "La ficha del cliente reúne lo comercial con sus pedidos y su facturación.",
      "Quien vende ve qué está disponible antes de ofrecerlo.",
      "Ventas y Servicio ven la misma información del cliente.",
      "Nadie carga dos veces el mismo dato.",
    ],
    mueve: [
      { dimension: "1.2", desde: "I", hasta: "E" },
      { dimension: "1.3", desde: "F", hasta: "E" },
      { dimension: "3.3", desde: "I", hasta: "E" },
    ],
    criterios: ["1.2.F8", "1.2.E3", "1.3.E3", "3.3.F2", "3.3.E3"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Integraciones y automatización"],
    cuandoConviene: "Cuando la empresa tiene un ERP o un sistema donde vive su operación.",
  },
  {
    id: "objetos-personalizados",
    titulo: "Mapea tu operación única en HubSpot con objetos personalizados",
    promesa: "HubSpot habla el idioma de tu negocio: tus unidades, contratos o programas viven en el CRM, con su estado, junto a cada cliente.",
    descripcion:
      "Lo que tu negocio tiene de único, como unidades, contratos, programas o propiedades, vive en HubSpot con su estado y junto a cada cliente. Ventas sabe qué está disponible y Servicio sabe qué tiene contratado cada uno.",
    tipo: "aterrizar",
    areas: ["1", "3"],
    sintomas: [
      "HubSpot no tiene dónde guardar lo que vendemos.",
      "Llevamos el inventario de unidades en una hoja aparte.",
      "Forzamos todo a negocios y contactos, y se vuelve un desorden.",
    ],
    obtienes: [
      "Lo que tu negocio tiene de único vive en el CRM, con su estado.",
      "Quien vende ve qué está disponible antes de ofrecerlo.",
      "Servicio ve en la ficha lo que cada cliente tiene contratado.",
    ],
    mueve: [
      { dimension: "1.2", desde: "I", hasta: "F" },
      { dimension: "3.3", desde: "I", hasta: "F" },
    ],
    criterios: ["1.2.F8", "3.3.F2", "3.3.F3"],
    herramientas: ["hubspot", "smarteam"],
    servicios: ["Implementación de CRM"],
    aviso: "La escala no pide objetos personalizados: pide, ya en Funcional, que lo único del negocio (unidades, cupos, contratos) se vea en el CRM. Por eso suele ir dentro del aterrizaje de Ventas o de Servicio.",
  },
  {
    id: "equipo-tecnico",
    titulo: "Haz que tu equipo técnico sostenga y extienda HubSpot sin depender de terceros",
    promesa: "Tu equipo técnico entiende cómo está conectado HubSpot y puede mantenerlo y hacerlo crecer por su cuenta.",
    descripcion:
      "Tu equipo técnico aprende cómo está conectado HubSpot, por qué se hizo así y cómo extenderlo, con todo documentado. Corrige y hace crecer las integraciones sin esperar a un proveedor.",
    tipo: "complementario",
    areas: ["1", "2", "3"],
    sintomas: [
      "Cada cambio en la integración depende del proveedor.",
      "Nadie en la empresa sabe cómo está conectado HubSpot.",
    ],
    obtienes: [
      "Tu equipo técnico sabe cómo está conectado HubSpot y por qué.",
      "Corrige y extiende las integraciones sin esperar a un proveedor.",
      "Lo que se construyó queda documentado y no se va con una persona.",
    ],
    mueve: [],
    criterios: [],
    herramientas: ["smarteam"],
    servicios: ["Capacitación técnica"],
    aviso: "La escala no lo mide: se ofrece como complemento de una integración, no como un paso en la escala.",
  },

  // ─── Insider ─────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "personalizacion-web",
    titulo: "Personaliza la experiencia web de tus visitantes con Insider",
    promesa: "Cada visitante ve en tu sitio y tu app lo que le corresponde según lo que hizo antes, sin que nadie arme un segmento para él.",
    descripcion:
      "Tu sitio y tu app muestran a cada visitante lo que le corresponde según lo que hizo antes, sin armar segmentos a mano. Cada cliente ve en el autoservicio lo que tiene que ver con lo que compró.",
    tipo: "expandir",
    areas: ["2", "3"],
    sintomas: [
      "Todos ven el mismo sitio, hayan comprado o no.",
      "Tenemos tráfico, pero convierte poco.",
      "El sitio no reconoce a un cliente que vuelve.",
    ],
    obtienes: [
      "Cada persona ve el contenido que le corresponde según lo que hizo antes.",
      "En el autoservicio, cada cliente ve lo que corresponde a lo que compró.",
      "Se ve qué versión vio cada persona.",
    ],
    mueve: [
      { dimension: "2.6", desde: "E", hasta: "O" },
      { dimension: "3.6", desde: "E", hasta: "O" },
    ],
    criterios: ["2.6.O3", "3.6.O1"],
    herramientas: ["insider", "smarteam"],
    servicios: ["CDP y activación"],
    cuandoConviene: "Cuando la venta la cierra el sitio o la app y hay decenas de miles de visitantes al mes.",
  },
  {
    id: "carritos-abandonados",
    titulo: "Recupera carritos y compras a medias con Insider",
    promesa: "Quien deja una compra a medias recibe a tiempo el recordatorio correcto, por el canal donde responde.",
    descripcion:
      "Quien deja una compra a medias recibe el recordatorio correcto, a tiempo y sin que nadie lo mande. El mensaje combina correo, WhatsApp y notificaciones, por el canal y a la hora en que esa persona responde.",
    tipo: "expandir",
    areas: ["1"],
    sintomas: [
      "Se nos quedan carritos abandonados todos los días.",
      "Mandamos un solo correo y nada más.",
      "No sabemos cuánta venta se recupera.",
    ],
    obtienes: [
      "Cada compra a medias recibe su recordatorio a tiempo, sin que nadie lo mande.",
      "El recordatorio combina correo, WhatsApp y notificaciones de la app.",
      "Cada persona lo recibe por el canal y a la hora en que más responde.",
    ],
    mueve: [{ dimension: "1.7", desde: "I", hasta: "O" }],
    criterios: ["1.7.F1", "1.7.F2", "1.7.E1", "1.7.O2"],
    herramientas: ["insider", "smarteam"],
    servicios: ["CDP y activación"],
    cuandoConviene: "Cuando la venta la cierra el sitio o la app.",
  },
  {
    id: "recompra",
    titulo: "Haz que tus clientes vuelvan a comprar con Insider",
    promesa: "Cada cliente recibe el recordatorio o la oferta para volver a comprar justo cuando le toca.",
    descripcion:
      "La IA reconoce quién debería estar volviendo a comprar y quién está perdiendo interés. Cada cliente recibe su recordatorio u oferta justo cuando le toca, por el canal donde más responde.",
    tipo: "expandir",
    areas: ["1", "2"],
    sintomas: [
      "Los clientes compran una vez y no vuelven.",
      "Mandamos la misma promoción a todos.",
      "No sabemos quién debería estar volviendo a comprar.",
    ],
    obtienes: [
      "Los clientes que ya deberían haber vuelto se reconocen a tiempo y reciben su recordatorio.",
      "La IA predice quién va a comprar y quién está perdiendo interés.",
      "Cada persona recibe el mensaje por el canal y en el momento en que más responde.",
    ],
    mueve: [
      { dimension: "1.7", desde: "I", hasta: "O" },
      { dimension: "2.6", desde: "E", hasta: "O" },
    ],
    criterios: ["1.7.F5", "1.7.O2", "2.6.O1"],
    herramientas: ["insider", "smarteam"],
    servicios: ["CDP y activación"],
    cuandoConviene: "Cuando el cliente vuelve a comprar sin contrato.",
  },
  {
    id: "ficha-unica",
    titulo: "Une la ficha de cada cliente entre tu sitio, tu app y tu tienda",
    promesa: "Cada cliente es una sola persona en tus sistemas, aunque compre en la tienda, navegue en el sitio y abra la app.",
    descripcion:
      "Lo que cada cliente hace en tu tienda, tu sitio y tu app se junta en una sola ficha. La mayoría de tus ventas quedan asociadas a una persona identificada, y lo que hizo antes de dejar sus datos no se pierde.",
    tipo: "expandir",
    areas: ["1", "2"],
    sintomas: [
      "El mismo cliente aparece tres veces en nuestros sistemas.",
      "No sabemos quién compra en la tienda.",
      "Lo que alguien hizo en el sitio se pierde cuando se registra.",
    ],
    obtienes: [
      "La mayoría de las ventas quedan asociadas a un cliente identificado.",
      "Lo que alguien hizo antes de dejar sus datos queda en su ficha.",
      "Cada persona tiene una sola ficha que junta al momento lo que hace en todos los canales.",
    ],
    mueve: [
      { dimension: "1.3", desde: "F", hasta: "O" },
      { dimension: "2.3", desde: "F", hasta: "O" },
    ],
    criterios: ["1.3.E4", "1.3.O3", "2.3.E3", "2.3.E4", "2.3.O5"],
    herramientas: ["insider", "smarteam"],
    servicios: ["CDP y activación"],
    cuandoConviene: "Cuando se vende por más de un canal sin vendedor: sitio, app y tienda.",
  },
];

export function casoPorId(id: string): CasoDelCatalogo | undefined {
  return CATALOGO_DE_CASOS.find((c) => c.id === id);
}
