/**
 * lib/tiempos/familias.ts — las 12 tareas clave de Customer Success (2026-10-07). PURO y CLIENT-SAFE.
 *
 * Una tarea clave es un trabajo que se repite en muchas cuentas y pesa en la carga: configurar un pipeline, una
 * integración, migrar datos. Las demás tareas del cronograma son «comunes» y se calibran por su tipo de fase.
 *
 * ── POR QUÉ SE RECONOCEN POR EL TÍTULO ───────────────────────────────────────
 * El cronograma no guarda qué clase de trabajo es una tarea: solo su título, su fase y quién la hace. Mientras el
 * agente del cronograma no la marque al crearla, la familia se lee del título, con las palabras de abajo. Lo que no
 * calza en ninguna es común.
 *
 * ── UNA SOLA FAMILIA POR TAREA ───────────────────────────────────────────────
 * Una tarea cae en la PRIMERA familia de `FAMILIAS` que calza. El orden va de lo que describe la actividad a lo que
 * describe el objeto: «Capacitación sobre el pipeline» es una capacitación, no un pipeline. Así cada respuesta
 * calibra un solo número.
 *
 * ⚠ Las claves se guardan en las preguntas de la encuesta de arranque (`arranque:<clave>:<correo>`) y en los
 * supuestos de la carga (`horasPorFamilia`): cambiar una clave pierde lo que ya se respondió para ella.
 */

export const CLAVES_DE_FAMILIA = [
  "capacitacion",
  "migracion",
  "limpieza",
  "integracion",
  "chat",
  "automatizaciones",
  "formularios",
  "pipeline",
  "reportes",
  "propiedades",
  "plantillas",
  "usuarios",
] as const;
export type ClaveDeFamilia = (typeof CLAVES_DE_FAMILIA)[number];

export interface FamiliaDeTarea {
  clave: ClaveDeFamilia;
  nombre: string;
  /** Cómo se dice en la encuesta de arranque: «¿Cuánto te toma normalmente… configurar un pipeline?». */
  enLaPregunta: string;
  /** Las palabras con que se reconoce, para mostrar. */
  seReconocePor: string;
  /** Sobre el título ya normalizado (minúsculas, sin tildes). */
  patron: RegExp;
}

/** En el orden en que se busca (ver arriba). En pantalla se muestran por nombre. */
export const FAMILIAS: readonly FamiliaDeTarea[] = [
  {
    clave: "capacitacion",
    nombre: "Capacitación",
    enLaPregunta: "Una capacitación",
    seReconocePor: "capacitación, entrenamiento, training",
    patron: /\b(capacita\w*|entrenamiento\w*|training)\b/,
  },
  {
    clave: "migracion",
    nombre: "Importar o migrar datos",
    enLaPregunta: "Importar o migrar datos",
    seReconocePor: "importar, migración, carga de datos",
    patron: /\b(importa(r|cion|ciones|do|da|dos|das)|migra(r|cion|ciones|do|da|dos|das)|carga (de|inicial de) (la )?(base|datos|contactos|empresas|negocios))\b/,
  },
  {
    clave: "limpieza",
    nombre: "Limpieza de la base",
    enLaPregunta: "Limpiar la base",
    seReconocePor: "limpieza, depurar, duplicados",
    patron: /\b(limpi\w*|depura\w*|duplicad\w*)\b/,
  },
  {
    clave: "integracion",
    nombre: "Integración",
    enLaPregunta: "Una integración",
    seReconocePor: "integración, API, conector, sincronizar",
    patron: /\b(integr(a|ar|acion|aciones|ado|ada|ados|adas)|apis?|conector\w*|sincroniza\w*)\b/,
  },
  {
    clave: "chat",
    nombre: "Chat, bots y conversaciones",
    enLaPregunta: "Configurar un chat o un bot",
    seReconocePor: "chat, bot, WhatsApp, inbox, conversaciones",
    patron: /\b(chat\w*|bots?|chatbots?|whatsapp|inbox|conversacion\w*)\b/,
  },
  {
    clave: "automatizaciones",
    nombre: "Automatizaciones (workflows)",
    enLaPregunta: "Una automatización (workflow)",
    seReconocePor: "workflow, automatización, secuencia",
    patron: /\b(workflows?|automatiza\w*|secuencias?)\b/,
  },
  {
    clave: "formularios",
    nombre: "Formularios y landings",
    enLaPregunta: "Un formulario o una landing",
    seReconocePor: "formulario, landing",
    patron: /\b(formularios?|landings?)\b/,
  },
  {
    clave: "pipeline",
    nombre: "Pipeline o etapas",
    enLaPregunta: "Configurar un pipeline",
    seReconocePor: "pipeline, etapas (en plural)",
    patron: /\b(pipelines?|etapas)\b/,
  },
  {
    clave: "reportes",
    nombre: "Reportes y dashboards",
    enLaPregunta: "Reportes y dashboards",
    seReconocePor: "reporte, dashboard, tablero",
    patron: /\b(reportes?|dashboards?|tableros?|informes? de (gestion|ventas|marketing|servicio))\b/,
  },
  {
    clave: "propiedades",
    nombre: "Propiedades",
    enLaPregunta: "Crear propiedades",
    seReconocePor: "propiedad, campos",
    patron: /\b(propiedad\w*|campos?)\b/,
  },
  {
    clave: "plantillas",
    nombre: "Plantillas y correos",
    enLaPregunta: "Plantillas y correos",
    seReconocePor: "plantilla, correo, email",
    patron: /\b(plantillas?|correos?|e-?mails?|templates?)\b/,
  },
  {
    clave: "usuarios",
    nombre: "Usuarios, equipos y permisos",
    enLaPregunta: "Usuarios, equipos y permisos",
    seReconocePor: "usuarios, permisos, licencias de usuario",
    patron: /\b(usuarios?|permisos?|seats?|licencias? de usuario)\b/,
  },
];

/** Minúsculas y sin tildes: «Integración» y «integracion» son lo mismo. */
export function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** La familia de una tarea por su título, o null si es una tarea común. */
export function familiaDe(titulo: string | null | undefined): ClaveDeFamilia | null {
  if (!titulo) return null;
  const t = normalizarTitulo(titulo);
  return FAMILIAS.find((f) => f.patron.test(t))?.clave ?? null;
}

export function familiaPorClave(clave: string | null | undefined): FamiliaDeTarea | null {
  return FAMILIAS.find((f) => f.clave === clave) ?? null;
}

export function esClaveDeFamilia(x: unknown): x is ClaveDeFamilia {
  return typeof x === "string" && (CLAVES_DE_FAMILIA as readonly string[]).includes(x);
}

/** Por nombre, para las tablas. */
export const FAMILIAS_POR_NOMBRE: readonly FamiliaDeTarea[] = [...FAMILIAS].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
