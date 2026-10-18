/**
 * lib/servicios/catalogo.ts — EL CATÁLOGO DE SERVICIOS RECURRENTES. PURO y CLIENT-SAFE.
 *
 * (Roadmap «La siguiente serie», iniciativa 4, 2026-10-18.) Un servicio recurrente es lo que Smarteam le vende a un
 * cliente para hacer todos los meses, no una vez: SmartLoop, la administración de su sitio web, el soporte de su
 * HubSpot, el contenido mensual. Cada uno se declara UNA vez acá: qué incluye, con qué cadencia, sus rutinas (las
 * reuniones fijas y las tareas que se repiten), su nivel de servicio y, si avanza por ciclos, sus etapas.
 *
 * ⭐ SUMAR UN SERVICIO ES UNA ENTRADA NUEVA, NO UNA PANTALLA NUEVA. De este catálogo salen, sin código propio por
 * servicio: la opción «Servicio recurrente» al crear una propuesta (lib/business-cases/case-types.ts), las secciones que
 * la propuesta siembra (operación, ciclo y nivel de servicio), la guía del servicio en el Resumen del proyecto, las
 * rutinas que Nexus propone al arrancar y «Pasar a recurrente» en la ficha. SEO, AEO, redes sociales, IA en marketing y
 * rediseño web entran igual.
 *
 * ⚠ LA CADENCIA Y LAS RUTINAS ESTÁN «A VALIDAR CON ELÍAS» (iniciativa 4, paso 7). Se propusieron con lo que dicen
 * docs/smartloop-plan.md, el documento de proceso de SmartLoop (lib/servicios/smartloop.ts) y lo que Ventas ya vendió a
 * mano a Cayalá y a Grupo Inve. Cada servicio lo dice en `validado: false`, y la guía del Resumen lo muestra.
 *
 * ⚠ Que un servicio avance por CICLOS (tenga `ciclo`) es otra cosa que ser recurrente: hoy solo SmartLoop. Los ciclos,
 * los casos de uso del ciclo y el cronograma del ciclo siguen siendo de lib/servicios/ciclo.ts y no cambian.
 */
import type { ProjectPipelineKey } from "@/lib/projects/kind";
import { GUIA_SMARTLOOP } from "./smartloop";
import type { ClaveDeServicio as ClaveDeServicioConCiclo, GuiaDeServicio } from "./tipos";

/** Cada cuánto se repite una rutina. «semana» = cada lunes; «mes» = el primer lunes de cada mes. */
export const CADENCIAS = ["semana", "quincena", "mes", "trimestre"] as const;
export type Cadencia = (typeof CADENCIAS)[number];

export const ETIQUETA_DE_CADENCIA: Record<Cadencia, string> = {
  semana: "Cada semana",
  quincena: "Cada 15 días",
  mes: "Cada mes",
  trimestre: "Cada trimestre",
};

/** Una reunión fija del servicio: Nexus la propone para guardarla en Google Calendar por enlace (nunca la escribe). */
export interface ReunionFija {
  /** Estable: es la clave con la que se recuerda que ya se agendó. */
  clave: string;
  titulo: string;
  cada: Cadencia;
  duracionMin: number;
  /** Con quién del lado del cliente. */
  conQuien: string;
  /** Para qué es, en una línea: va en la invitación. */
  paraQue: string;
}

/** Una tarea que se repite para el CSE: Nexus la crea por el escritor único de Tareas. */
export interface TareaQueSeRepite {
  /** Estable: arma la clave de la tarea (`servicio:<proyecto>:<clave>:<lunes>`) para no crearla dos veces. */
  clave: string;
  titulo: string;
  cada: Cadencia;
}

/** Una prioridad del nivel de servicio: cuánto se tarda Smarteam en responder. */
export interface NivelDeServicio {
  prioridad: string;
  tiempo: string;
  detalle: string;
}

/** Una etapa del ciclo, dicha para el cliente (la propuesta) — la guía del CSE vive en `ciclo.guia`. */
export interface EtapaParaLaPropuesta {
  titulo: string;
  detalle: string;
}

export interface ServicioRecurrente {
  /** Estable: va en `Project.servicioRecurrente` y en `BusinessCase.caseSubtype`. Solo minúsculas y guiones. */
  clave: string;
  nombre: string;
  /** Lo que hace por el cliente, en una línea (tarjeta de la propuesta y de «Pasar a recurrente»). */
  descripcion: string;
  /** Qué se entrega. */
  incluye: readonly string[];
  /** La cadencia, en palabras. */
  cadencia: string;
  /** Las rutinas: lo que se repite. */
  reuniones: readonly ReunionFija[];
  tareas: readonly TareaQueSeRepite[];
  /** El nivel de servicio por defecto (la propuesta lo siembra; Ventas lo ajusta por cliente). */
  nivelDeServicio: readonly NivelDeServicio[];
  /** Dónde vive el proyecto en HubSpot. Al pasar a recurrente, si no está ahí, Nexus le deja la tarea a una persona. */
  enHubspot: { pipeline: ProjectPipelineKey; etapa: string };
  /**
   * Solo si avanza por CICLOS (SmartLoop): su guía del CSE (lib/servicios/smartloop.ts) y cómo se le cuentan las etapas
   * al cliente en la propuesta. Sin esto, el servicio se lleva con su cadencia y sus rutinas, sin ciclos.
   */
  ciclo?: { servicio: ClaveDeServicioConCiclo; guia: GuiaDeServicio; paraLaPropuesta: readonly EtapaParaLaPropuesta[] };
  /** false = la cadencia y las rutinas todavía son una propuesta de Nexus (iniciativa 4, paso 7). */
  validado: boolean;
}

/** El nivel de servicio que ya se vendió a Cayalá (2026-10, secciones a mano): la base de todos, a validar. */
const NIVEL_BASE: readonly NivelDeServicio[] = [
  { prioridad: "Crítica", tiempo: "4 h", detalle: "Algo que implementó Smarteam bloquea un proceso esencial de la operación." },
  { prioridad: "Alta", tiempo: "1 día", detalle: "Un error afecta un proceso o a un grupo de usuarios, aunque la operación sigue." },
  { prioridad: "Normal", tiempo: "2 días", detalle: "Consultas, ajustes y mejoras que se resuelven o entran al plan de trabajo." },
  { prioridad: "Nueva iniciativa", tiempo: "2 días", detalle: "Una necesidad nueva: se revisa, se dimensiona y se prioriza con el cliente." },
];

const NOTA_DE_TIEMPOS = "Los tiempos son de respuesta y clasificación; la resolución depende de la complejidad.";

export const CATALOGO_DE_SERVICIOS: readonly ServicioRecurrente[] = [
  {
    clave: "smartloop",
    nombre: "SmartLoop",
    descripcion: "Evoluciona el ecosistema del cliente en ciclos cortos: diagnosticar, planificar, implementar, adoptar y aprender.",
    incluye: [
      "Un diagnóstico de la escala al abrir cada ciclo (profundo cada 6 meses)",
      "Una prioridad principal a la vez, con su criterio de aceptación",
      "Implementación y adopción, primero con los champions del cliente",
      "La sesión de aprendizaje y la propuesta del siguiente ciclo",
      "El gobierno del plan de trabajo y una sesión ejecutiva de resultados",
    ],
    cadencia: "Ciclos de 60 a 90 días, con seguimiento semanal y una sesión ejecutiva cada mes o al cerrar el ciclo.",
    reuniones: [
      {
        clave: "seguimiento",
        titulo: "Seguimiento semanal del ciclo",
        cada: "semana",
        duracionMin: 45,
        conQuien: "Los champions del cliente",
        paraQue: "Revisar el avance del caso de uso del ciclo, lo que falta del cliente y lo que sigue.",
      },
      {
        clave: "ejecutiva",
        titulo: "Sesión ejecutiva de resultados",
        cada: "mes",
        duracionMin: 60,
        conQuien: "La gerencia del cliente",
        paraQue: "Avance, indicadores, riesgos y la recomendación para la siguiente prioridad.",
      },
    ],
    tareas: [
      { clave: "avance", titulo: "Revisar el avance del ciclo y lo que falta del cliente", cada: "semana" },
      { clave: "adopcion", titulo: "Revisar en HubSpot que lo implementado se use", cada: "quincena" },
      { clave: "reporte", titulo: "Preparar el reporte de resultados para la sesión ejecutiva", cada: "mes" },
    ],
    nivelDeServicio: NIVEL_BASE,
    enHubspot: { pipeline: "smartloop", etapa: "Diagnóstico" },
    ciclo: {
      servicio: "smartloop",
      guia: GUIA_SMARTLOOP,
      // Lo que Ventas ya le vendió a Grupo Inve con SmartLoop (2026-10), dicho para el cliente.
      paraLaPropuesta: [
        { titulo: "Diagnóstico", detalle: "Revisamos dónde está hoy la operación, qué cambió desde la última vuelta y dónde hay más valor." },
        { titulo: "Planificación", detalle: "Elegimos la prioridad del ciclo, con su criterio de aceptación, sus fechas y lo que necesitamos de ustedes." },
        { titulo: "Implementación", detalle: "Construimos lo necesario para un impacto medible, y lo validan primero los champions." },
        { titulo: "Adopción", detalle: "Acompañamos al equipo hasta que lo implementado sea su forma real de trabajar." },
        { titulo: "Aprendizaje", detalle: "Medimos el resultado, decidimos cada pendiente y proponemos el siguiente ciclo." },
      ],
    },
    validado: false,
  },
  {
    clave: "sitio-web",
    nombre: "Administración de sitio web",
    descripcion: "Mantiene el sitio del cliente al día, seguro y rápido, con cambios de contenido cada mes.",
    incluye: [
      "Cambios de contenido y páginas dentro de las horas del mes",
      "Actualizaciones de seguridad y respaldos",
      "Revisión de velocidad, formularios y enlaces rotos",
      "Un reporte mensual de tráfico y formularios",
    ],
    cadencia: "Mensual: una revisión con el cliente cada mes y el reporte el primer lunes.",
    reuniones: [
      {
        clave: "revision",
        titulo: "Revisión mensual del sitio",
        cada: "mes",
        duracionMin: 45,
        conQuien: "Quien lleva el sitio del lado del cliente",
        paraQue: "Revisar el reporte del mes y priorizar los cambios del mes siguiente.",
      },
    ],
    tareas: [
      { clave: "salud", titulo: "Revisar formularios, enlaces rotos y velocidad del sitio", cada: "quincena" },
      { clave: "seguridad", titulo: "Aplicar las actualizaciones de seguridad del sitio", cada: "mes" },
      { clave: "reporte", titulo: "Enviar el reporte mensual del sitio", cada: "mes" },
    ],
    nivelDeServicio: [
      { prioridad: "Sitio caído", tiempo: "4 h", detalle: "El sitio no carga o un formulario principal no envía." },
      { prioridad: "Error en una página", tiempo: "1 día", detalle: "Una página o una sección se ve mal o no funciona." },
      { prioridad: "Cambio de contenido", tiempo: "2 días", detalle: "Textos, imágenes y ajustes dentro de las horas del mes." },
      { prioridad: "Página nueva", tiempo: "En la revisión", detalle: "Se dimensiona y se prioriza en la revisión mensual." },
    ],
    enHubspot: { pipeline: "customer-success", etapa: "Continuidad" },
    validado: false,
  },
  {
    clave: "soporte-hubspot",
    nombre: "Soporte y continuidad de HubSpot",
    descripcion: "Acompaña al equipo del cliente en su HubSpot: responde, ajusta y mejora lo que ya está implementado.",
    incluye: [
      "Soporte a usuarios y administradores",
      "Ajustes de propiedades, pipelines, automatizaciones y reportes",
      "Revisión de la calidad de los datos y del uso",
      "Una revisión mensual con el cliente",
    ],
    cadencia: "Mensual: una bolsa de horas por mes, con una revisión del uso cada mes.",
    reuniones: [
      {
        clave: "revision",
        titulo: "Revisión mensual de HubSpot",
        cada: "mes",
        duracionMin: 45,
        conQuien: "El administrador de HubSpot del cliente",
        paraQue: "Revisar el uso, los pedidos del mes y lo que conviene mejorar.",
      },
    ],
    tareas: [
      { clave: "pedidos", titulo: "Revisar los pedidos de soporte abiertos del cliente", cada: "semana" },
      { clave: "datos", titulo: "Revisar la calidad de los datos y el uso en HubSpot", cada: "mes" },
    ],
    nivelDeServicio: NIVEL_BASE,
    enHubspot: { pipeline: "customer-success", etapa: "Continuidad" },
    validado: false,
  },
  {
    clave: "contenido",
    nombre: "Contenido y marketing mensual",
    descripcion: "Produce y publica el contenido del cliente cada mes, con un calendario aprobado y su reporte.",
    incluye: [
      "El calendario de contenido del mes, aprobado por el cliente",
      "Las piezas del mes: publicaciones, correos o blogs",
      "La publicación y la programación en HubSpot",
      "Un reporte mensual de resultados",
    ],
    cadencia: "Mensual: el calendario se aprueba antes de empezar el mes y el reporte llega la primera semana.",
    reuniones: [
      {
        clave: "calendario",
        titulo: "Aprobación del calendario de contenido",
        cada: "mes",
        duracionMin: 45,
        conQuien: "Marketing del cliente",
        paraQue: "Aprobar el calendario del mes siguiente y revisar los resultados del mes.",
      },
    ],
    tareas: [
      { clave: "calendario", titulo: "Armar el calendario de contenido del mes siguiente", cada: "mes" },
      { clave: "programar", titulo: "Programar las piezas aprobadas de la semana", cada: "semana" },
      { clave: "reporte", titulo: "Enviar el reporte mensual de contenido", cada: "mes" },
    ],
    nivelDeServicio: [
      { prioridad: "Error en una publicación", tiempo: "4 h", detalle: "Algo publicado tiene un error que hay que corregir o bajar." },
      { prioridad: "Cambio en una pieza", tiempo: "2 días", detalle: "Ajustes a una pieza del calendario aprobado." },
      { prioridad: "Pieza fuera del calendario", tiempo: "En la revisión", detalle: "Se dimensiona y entra al calendario siguiente." },
    ],
    enHubspot: { pipeline: "customer-success", etapa: "Continuidad" },
    validado: false,
  },
];

export const NOTA_DEL_NIVEL_DE_SERVICIO = NOTA_DE_TIEMPOS;

const POR_CLAVE: ReadonlyMap<string, ServicioRecurrente> = new Map(CATALOGO_DE_SERVICIOS.map((s) => [s.clave, s]));

/** El servicio de una clave, o null si no está en el catálogo (una clave vieja o mal escrita no rompe nada). */
export function servicioDelCatalogo(clave: string | null | undefined): ServicioRecurrente | null {
  return clave ? (POR_CLAVE.get(clave) ?? null) : null;
}

export function esClaveDeServicio(v: unknown): v is string {
  return typeof v === "string" && POR_CLAVE.has(v);
}

/**
 * El servicio recurrente de un proyecto: el que se le eligió en Nexus (`Project.servicioRecurrente`) y, si no hay, el del
 * pipeline de HubSpot (un proyecto en el pipeline de SmartLoop es SmartLoop). null = el proyecto se hace una vez.
 */
export function servicioDelProyecto(p: { servicioRecurrente?: string | null; servicioDelPipeline?: string | null }): ServicioRecurrente | null {
  return servicioDelCatalogo(p.servicioRecurrente) ?? servicioDelCatalogo(p.servicioDelPipeline);
}

/**
 * Lo que el agente de la propuesta tiene que saber del servicio vendido, en un bloque. Es la única forma en que el
 * catálogo llega al prompt: la propuesta describe ESTE servicio y no otro que se le parezca.
 */
export function servicioParaLaPropuesta(s: ServicioRecurrente): string {
  const lineas = [
    `# El servicio recurrente que se propone: ${s.nombre}`,
    s.descripcion,
    `Qué incluye: ${s.incluye.join(" · ")}.`,
    `Cadencia: ${s.cadencia}`,
    `Reuniones fijas: ${s.reuniones.map((r) => `${r.titulo} (${ETIQUETA_DE_CADENCIA[r.cada].toLowerCase()}, con ${r.conQuien.toLowerCase()})`).join(" · ")}.`,
  ];
  if (s.ciclo) lineas.push(`Avanza por ciclos de cinco etapas: ${s.ciclo.paraLaPropuesta.map((e) => e.titulo).join(" → ")} → y vuelve a empezar.`);
  lineas.push(
    "Es un servicio que se hace todos los meses, no un proyecto que se entrega una vez: escribe en ese tono. La cadencia, " +
      "las rutinas, el ciclo y el nivel de servicio los escribe Nexus desde el catálogo; no los inventes ni les cambies los tiempos.",
  );
  return lineas.join("\n");
}
