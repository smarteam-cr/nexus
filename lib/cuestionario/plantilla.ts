/**
 * lib/cuestionario/plantilla.ts — la plantilla del cuestionario previo.
 *
 * Sigue la lógica del Excel que el CSE mandaba al cierre del kickoff: preguntas generales, una
 * pestaña por hub y una pestaña duplicable por cada etapa del proceso. Las pestañas se encienden
 * por los tags del proyecto (`HUBSPOT_HUB_SLUGS`, lib/tags/catalog.ts).
 *
 * ⛔ LAS 7 PREGUNTAS DE «ETAPA N» (`PREGUNTAS_DE_ETAPA`) SON FIJAS. Son exactamente las filas del
 * Management Map de Planificación: qué se hace, objetivo, información que se registra, tareas y
 * responsables, qué se necesita para avanzar, comunicación automática y duración. El CSE y el
 * chat pueden sumar preguntas a una pestaña de etapas, pero no editar ni quitar estas: lo hace
 * cumplir `operaciones.ts`, no la buena voluntad del editor.
 *
 * Los ids de pregunta son ESTABLES: una respuesta se guarda por id, así que cambiar un id acá
 * dejaría huérfanas las respuestas de los cuestionarios ya generados. Se agregan, no se renombran.
 *
 * Módulo PURO: lo importa la página del cliente para pintar las preguntas de etapa.
 */
import type { PestanaData, Pregunta } from "./tipos";

type Semilla = Omit<Pregunta, "momento"> & { momento?: Pregunta["momento"] };

function preguntas(semillas: Semilla[]): Pregunta[] {
  return semillas.map((s) => ({ ...s, momento: s.momento ?? "previo" }));
}

/** Las 7 preguntas de cada «Etapa N». ⛔ Fijas: ver el encabezado. */
export const PREGUNTAS_DE_ETAPA: readonly Pregunta[] = preguntas([
  {
    id: "etapa-que-se-hace",
    categoria: "Etapa",
    texto: "¿Qué se hace en esta etapa?",
    ejemplo: "El vendedor llama al prospecto, confirma el interés y agenda una demo.",
  },
  {
    id: "etapa-objetivo",
    categoria: "Etapa",
    texto: "¿Cuál es el objetivo de la etapa?",
    ejemplo: "Confirmar que el prospecto tiene presupuesto y necesidad real.",
  },
  {
    id: "etapa-informacion",
    categoria: "Etapa",
    texto: "¿Qué información se registra en esta etapa?",
    ejemplo: "Presupuesto estimado, fecha tentativa de compra, quién decide.",
  },
  {
    id: "etapa-tareas",
    categoria: "Etapa",
    texto: "¿Qué tareas se hacen y quién es responsable de cada una?",
    ejemplo: "Llamada de calificación (SDR), envío de material (SDR), agendar demo (vendedor).",
  },
  {
    id: "etapa-para-avanzar",
    categoria: "Etapa",
    texto: "¿Qué se necesita para pasar a la siguiente etapa?",
    ejemplo: "Que el prospecto confirme la demo y tengamos al tomador de decisión en la llamada.",
  },
  {
    id: "etapa-comunicacion",
    categoria: "Etapa",
    texto: "¿Qué comunicación automática recibe el cliente en esta etapa?",
    ejemplo: "Un correo de confirmación con el enlace de la reunión y un recordatorio un día antes.",
  },
  {
    id: "etapa-duracion",
    categoria: "Etapa",
    texto: "¿Cuánto dura esta etapa en promedio?",
    ejemplo: "Entre 3 y 5 días hábiles.",
  },
]);

export const IDS_DE_ETAPA: ReadonlySet<string> = new Set(PREGUNTAS_DE_ETAPA.map((p) => p.id));

interface PestanaDePlantilla extends PestanaData {
  /** null = siempre; si no, el slug de hub que la enciende. */
  hub: "marketing_hub" | "sales_hub" | "service_hub" | null;
}

const PLANTILLA: PestanaDePlantilla[] = [
  {
    key: "general",
    titulo: "Información general",
    descripcion: "Cómo está organizado hoy el equipo y con qué herramientas trabaja.",
    tipo: "normal",
    hub: null,
    preguntas: preguntas([
      {
        id: "gen-usuarios",
        categoria: "Usuarios y roles",
        texto: "¿Cuántas personas van a usar HubSpot y qué rol tiene cada una?",
        ejemplo: "12 personas: 1 gerente comercial, 8 vendedores, 2 de servicio y 1 de marketing.",
      },
      {
        id: "gen-equipos",
        categoria: "Usuarios y roles",
        texto: "¿Cómo se dividen los equipos? (por país, por producto, por tipo de cliente…)",
        ejemplo: "Dos equipos de venta: uno para Costa Rica y otro para el resto de Centroamérica.",
      },
      {
        id: "gen-base-contactos",
        categoria: "Base de contactos",
        texto: "¿Cuántos contactos y empresas tienen hoy y dónde están guardados?",
        ejemplo: "Unos 8.000 contactos en un Excel compartido y en el CRM anterior.",
      },
      {
        id: "gen-correo",
        categoria: "Herramientas",
        texto: "¿Qué herramienta de correo usa el equipo?",
        ejemplo: "Google Workspace (Gmail).",
      },
      {
        id: "gen-llamadas",
        categoria: "Herramientas",
        texto: "¿Cómo hacen las llamadas? ¿Usan alguna central telefónica o WhatsApp?",
        ejemplo: "Celular personal y WhatsApp Business; no hay central.",
      },
      {
        id: "gen-otras-herramientas",
        categoria: "Herramientas",
        texto: "¿Qué otras herramientas usan en el día a día y para qué?",
        ejemplo: "Trello para tareas, Excel para reportes, Calendly para agendar.",
      },
    ]),
  },
  {
    key: "objetivos",
    titulo: "Objetivos y métricas",
    descripcion: "Qué se quiere lograr con el proyecto y cómo se va a medir.",
    tipo: "normal",
    hub: null,
    preguntas: preguntas([
      {
        id: "obj-metas-anteriores",
        categoria: "Metas",
        texto: "¿Cuáles fueron las metas del trimestre anterior y cuánto se cumplieron?",
        ejemplo: "Meta de $120.000 en ventas nuevas; se cumplió el 85%.",
      },
      {
        id: "obj-meta-proyecto",
        categoria: "Metas",
        texto: "¿Qué tiene que pasar para que este proyecto se considere un éxito?",
        ejemplo: "Que todo el equipo registre sus oportunidades en HubSpot y la gerencia vea el pronóstico sin pedir Excel.",
      },
      {
        id: "obj-metricas",
        categoria: "Métricas",
        texto: "¿Qué indicadores revisan hoy y cada cuánto?",
        ejemplo: "Ventas por vendedor (semanal), tasa de cierre y tiempo de respuesta (mensual).",
      },
      {
        id: "obj-sponsor",
        categoria: "Personas",
        texto: "¿Quién es el sponsor del proyecto y quiénes toman las decisiones?",
        ejemplo: "Sponsor: la gerente general. Decide junto con el gerente comercial.",
      },
      {
        id: "obj-dolores",
        categoria: "Contexto",
        texto: "¿Qué es lo que más les cuesta hoy y quieren resolver primero?",
        ejemplo: "No sabemos en qué estado está cada oportunidad sin preguntarle al vendedor.",
        momento: "sesion",
      },
    ]),
  },
  {
    key: "marketing",
    titulo: "Marketing",
    descripcion: "Cómo se atraen prospectos y cómo se entregan a ventas.",
    tipo: "normal",
    hub: "marketing_hub",
    preguntas: preguntas([
      {
        id: "mkt-captacion",
        categoria: "Captación",
        texto: "¿Por qué canales llegan hoy los prospectos?",
        ejemplo: "Formulario del sitio web, pauta en Meta, ferias y referidos.",
      },
      {
        id: "mkt-entrega-ventas",
        categoria: "Entrega a ventas",
        texto: "¿Cómo y cuándo se le pasa un prospecto a ventas?",
        ejemplo: "Cuando llena el formulario de cotización se le asigna al vendedor de su zona.",
      },
      {
        id: "mkt-landings",
        categoria: "Landing pages",
        texto: "¿Tienen landing pages o formularios? ¿Dónde están hechos?",
        ejemplo: "Dos landings en WordPress con formularios de Contact Form 7.",
      },
      {
        id: "mkt-email",
        categoria: "Email",
        texto: "¿Envían correos masivos? ¿Con qué herramienta y cada cuánto?",
        ejemplo: "Un boletín mensual desde Mailchimp.",
      },
      {
        id: "mkt-segmentacion",
        categoria: "Segmentación",
        texto: "¿Cómo segmentan su base de contactos?",
        ejemplo: "Por industria y por país; no tenemos segmentación por interés.",
      },
      {
        id: "mkt-pauta",
        categoria: "Pauta",
        texto: "¿Invierten en pauta digital? ¿En qué plataformas?",
        ejemplo: "Meta Ads y Google Ads, unos $1.500 al mes.",
      },
      {
        id: "mkt-chat",
        categoria: "Chat",
        texto: "¿Tienen chat en el sitio web o atienden por WhatsApp?",
        ejemplo: "WhatsApp desde un botón del sitio; lo atiende la recepcionista.",
      },
    ]),
  },
  {
    key: "ventas",
    titulo: "Ventas",
    descripcion: "Cómo trabaja el equipo comercial en el día a día.",
    tipo: "normal",
    hub: "sales_hub",
    preguntas: preguntas([
      {
        id: "ven-herramientas",
        categoria: "Herramientas del vendedor",
        texto: "¿Dónde registran hoy los vendedores sus oportunidades y seguimientos?",
        ejemplo: "Cada vendedor en su propio Excel; la gerencia los junta cada viernes.",
      },
      {
        id: "ven-plantillas",
        categoria: "Plantillas",
        texto: "¿Usan plantillas de correo, cotizaciones o propuestas?",
        ejemplo: "Cotización en Word que cada vendedor adapta.",
      },
      {
        id: "ven-reuniones",
        categoria: "Reuniones",
        texto: "¿Cómo agendan las reuniones con los clientes?",
        ejemplo: "Por correo, ida y vuelta, hasta encontrar un horario.",
      },
      {
        id: "ven-campo",
        categoria: "Trabajo en campo",
        texto: "¿Los vendedores visitan clientes? ¿Cómo registran esas visitas?",
        ejemplo: "Sí, tres visitas por semana; lo anotan en un grupo de WhatsApp.",
      },
      {
        id: "ven-reportes",
        categoria: "Reportes",
        texto: "¿Qué reportes de ventas necesitan y quién los usa?",
        ejemplo: "Pronóstico mensual por vendedor para la gerencia general.",
      },
    ]),
  },
  {
    key: "proceso_comercial",
    titulo: "Proceso comercial",
    descripcion:
      "El camino de un prospecto desde que llega hasta que compra. Agrega una etapa por cada paso de tu proceso.",
    tipo: "etapas",
    hub: "sales_hub",
    preguntas: preguntas([
      {
        id: "pc-general",
        categoria: "Proceso",
        texto: "¿Cómo describirías el proceso comercial de principio a fin?",
        ejemplo: "Llega el prospecto, se califica, se hace una demo, se cotiza, se negocia y se cierra.",
      },
      {
        id: "pc-varios",
        categoria: "Proceso",
        texto: "¿Tienen más de un proceso de venta? (por producto, por tipo de cliente…)",
        ejemplo: "Uno para venta nueva y otro para renovaciones.",
      },
      {
        id: "pc-ciclo",
        categoria: "Proceso",
        texto: "¿Cuánto tarda en promedio una venta desde el primer contacto hasta el cierre?",
        ejemplo: "Entre 30 y 45 días.",
      },
    ]),
  },
  {
    key: "servicio",
    titulo: "Servicio",
    descripcion: "Cómo se atiende al cliente después de la venta.",
    tipo: "normal",
    hub: "service_hub",
    preguntas: preguntas([
      {
        id: "ser-canales",
        categoria: "Canales",
        texto: "¿Por qué canales piden ayuda los clientes?",
        ejemplo: "Correo de soporte, WhatsApp y llamadas.",
      },
      {
        id: "ser-herramientas",
        categoria: "Herramientas",
        texto: "¿Dónde registran hoy los casos o tickets?",
        ejemplo: "En una hoja de cálculo compartida; no hay sistema de tickets.",
      },
      {
        id: "ser-plantillas",
        categoria: "Plantillas",
        texto: "¿Tienen respuestas o plantillas para las consultas frecuentes?",
        ejemplo: "Un documento con respuestas que el equipo copia y pega.",
      },
      {
        id: "ser-correo-compartido",
        categoria: "Correo compartido",
        texto: "¿Usan un correo compartido (tipo soporte@)? ¿Quién lo atiende?",
        ejemplo: "soporte@empresa.com, lo revisan dos personas.",
      },
      {
        id: "ser-reportes",
        categoria: "Reportes",
        texto: "¿Qué miden del servicio y qué reportes necesitan?",
        ejemplo: "Tiempo de primera respuesta y casos resueltos por mes.",
      },
    ]),
  },
  {
    key: "proceso_servicio",
    titulo: "Proceso de servicio",
    descripcion:
      "El camino de un caso desde que entra hasta que se resuelve. Agrega una etapa por cada paso.",
    tipo: "etapas",
    hub: "service_hub",
    preguntas: preguntas([
      {
        id: "ps-general",
        categoria: "Proceso",
        texto: "¿Cómo describirías el proceso de atención de principio a fin?",
        ejemplo: "Entra el caso, se clasifica, se asigna, se resuelve y se confirma con el cliente.",
      },
      {
        id: "ps-tipos",
        categoria: "Proceso",
        texto: "¿Qué tipos de casos atienden y alguno sigue un camino distinto?",
        ejemplo: "Consultas, reclamos y garantías; las garantías pasan por bodega.",
      },
      {
        id: "ps-tiempos",
        categoria: "Proceso",
        texto: "¿Tienen tiempos de respuesta comprometidos con el cliente?",
        ejemplo: "Primera respuesta en 4 horas hábiles.",
      },
    ]),
  },
  {
    key: "datos",
    titulo: "Datos e integraciones",
    descripcion: "Qué sistemas hay que conectar y en qué estado está la información.",
    tipo: "normal",
    hub: null,
    preguntas: preguntas([
      {
        id: "dat-sistemas",
        categoria: "Sistemas",
        texto: "¿Qué sistemas necesitan conectarse con HubSpot? (ERP, facturación, e-commerce…)",
        ejemplo: "El ERP (SAP Business One) para ver facturas y el e-commerce en Shopify.",
      },
      {
        id: "dat-llave",
        categoria: "Identificación",
        texto: "¿Con qué dato identifican de forma única a un cliente entre sistemas?",
        ejemplo: "La cédula jurídica de la empresa.",
      },
      {
        id: "dat-calidad",
        categoria: "Calidad de la base",
        texto: "¿Cómo está la calidad de la información? ¿Hay duplicados o datos incompletos?",
        ejemplo: "Muchos duplicados entre el Excel y el CRM anterior; faltan teléfonos.",
      },
      {
        id: "dat-responsable-ti",
        categoria: "Personas",
        texto: "¿Quién es la persona técnica que conoce esos sistemas?",
        ejemplo: "Carlos Mora, jefe de TI.",
      },
      {
        id: "dat-migracion",
        categoria: "Migración",
        texto: "¿Qué información histórica hay que migrar a HubSpot?",
        ejemplo: "Clientes activos y las oportunidades abiertas; el historial viejo no.",
        momento: "sesion",
      },
    ]),
  },
];

/**
 * Las pestañas que le corresponden a un proyecto según sus tags, en el orden de la plantilla.
 * Sin ningún hub se arman solo las generales: el CSE suma lo demás a mano.
 */
export function pestanasParaTags(tags: readonly string[]): PestanaData[] {
  const set = new Set(tags);
  return PLANTILLA.filter((p) => p.hub === null || set.has(p.hub)).map((p) => ({
    key: p.key,
    titulo: p.titulo,
    descripcion: p.descripcion,
    tipo: p.tipo,
    preguntas: p.preguntas.map((q) => ({ ...q })),
  }));
}

/** Todas las pestañas de la plantilla (para ofrecer las que faltan al CSE). */
export function pestanasDePlantilla(): Array<PestanaData & { hub: string | null }> {
  return PLANTILLA.map((p) => ({ ...p, preguntas: p.preguntas.map((q) => ({ ...q })) }));
}
