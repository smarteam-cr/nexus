/**
 * lib/auditoria-portal/foto.ts — LA FOTO DE UNA AUDITORÍA, TAL COMO SE GUARDA EN `Audit.data`.
 *
 * Versión 2 (2026-10-04, rediseño de la auditoría). La auditoría se captura en segundo plano: la fila
 * nace en `capturando`, pasa a `analizando` cuando ya tiene los datos y a `lista` cuando el análisis
 * con IA termina (o falla: la foto sirve igual sin él). Las fotos de la versión 1 (antes del
 * rediseño) no se migran — el módulo estaba en construcción y se pueden volver a correr.
 *
 * Lo que la IA propone (`analisis.hallazgos`) nace `sugerido`: entra al informe solo lo que una
 * persona confirma. Lo que se revisa a mano queda en `comprobados`, con quién y cuándo.
 */
import type { AuditEnrichment, AccountDetails, LifecycleStats, PropietariosLeidos } from "@/lib/hubspot/portal-analyzer";
import type { ContextoDelCliente } from "./cruces";
import { normalizarPipeline, type InventarioDelPortal } from "./inventario";
import type { LecturaFallida } from "./lecturas";

export const VERSION_DE_LA_FOTO = 2;

export const SECCIONES_DE_HALLAZGO = [
  "actividad",
  "ciclo_de_vida",
  "empresas",
  "propietarios",
  "workflows",
  "propiedades",
  "pipelines",
  "usuarios",
  "datos",
] as const;
export type SeccionDeHallazgo = (typeof SECCIONES_DE_HALLAZGO)[number];

export const ETIQUETA_DE_SECCION: Record<SeccionDeHallazgo, string> = {
  actividad: "Actividad",
  ciclo_de_vida: "Ciclo de vida",
  empresas: "Empresas",
  propietarios: "Propietarios",
  workflows: "Workflows",
  propiedades: "Propiedades",
  pipelines: "Pipelines",
  usuarios: "Usuarios",
  datos: "Calidad de los datos",
};

export const SEVERIDADES = ["critico", "atencion", "bien"] as const;
export type Severidad = (typeof SEVERIDADES)[number];

/** Qué haría Smarteam con eso en una reimplementación. */
export const DECISIONES = ["conservar", "corregir", "apagar", "investigar"] as const;
export type Decision = (typeof DECISIONES)[number];

export const ETIQUETA_DE_DECISION: Record<Decision, string> = {
  conservar: "Conservar",
  corregir: "Corregir",
  apagar: "Apagar",
  investigar: "Averiguar",
};

export type EstadoDeHallazgo = "sugerido" | "confirmado" | "descartado";

export interface Hallazgo {
  /** Estable dentro de un análisis (h1, h2…): es lo que se confirma o descarta. */
  id: string;
  seccion: SeccionDeHallazgo;
  severidad: Severidad;
  titulo: string;
  /** Lo que se vio, en una o dos frases (el campo conserva su nombre de la primera versión). */
  hallazgo: string;
  /** La cifra que lo resume, con su rótulo corto («8 workflows», «40 %»). Vacío si no hay una. */
  dato?: string;
  porQueImporta: string;
  recomendacion: string;
  decision: Decision;
  /** Claves de los hechos en que se apoya (ver analisis/hechos.ts). */
  evidencia: string[];
  /** Pregunta para el cliente que lo confirmaría, si hace falta. */
  pregunta: string | null;
  estado: EstadoDeHallazgo;
  decididoPor?: string;
  decididoEn?: string;
}

/** Las secciones de la ficha que llevan una lectura del análisis arriba. */
export const SECCIONES_CON_LECTURA = ["ciclo", "propietarios", "propiedades", "pipelines", "workflows", "usuarios"] as const;
export type SeccionConLectura = (typeof SECCIONES_CON_LECTURA)[number];

export interface AnalisisGuardado {
  generadoEn: string;
  modelo: string;
  agentRunId: string | null;
  /** Tres o cuatro frases: cómo está el portal y qué significa para la reimplementación. */
  resumen: string;
  /** El estado del portal: un titular (el veredicto) y su explicación. Desde el 2026-10-04. */
  estado?: { titular: string; parrafo: string };
  /** Una o dos frases por sección: cómo está el portal en eso. */
  lecturasDeSeccion?: Partial<Record<SeccionConLectura, string>>;
  /** Una frase por reporte (ver reportes.ts): qué dice ese reporte del portal. */
  lecturasDeReporte?: Record<string, string>;
  hallazgos: Hallazgo[];
  /** Preguntas para el cliente que el portal no responde. */
  preguntas: string[];
  /** Hallazgos que el modelo propuso y se cayeron por citar una cifra que no está en los datos. */
  descartadosPorCifras: number;
  /** Etiquetas de los hechos que se le pasaron (para mostrar «de dónde sale»). */
  etiquetas: Record<string, string>;
}

export interface RevisionManual {
  por: string;
  en: string;
  nota?: string;
}

export type EstadoDeLaFoto = "capturando" | "analizando" | "lista" | "fallo";

export interface FotoDeAuditoria {
  version: typeof VERSION_DE_LA_FOTO;
  estado: EstadoDeLaFoto;
  /** En palabras, para la pantalla, cuando `estado` es `fallo`. */
  error?: string;
  creadaPor: { nombre: string; email: string } | null;
  iniciadaEn: string;
  /** Cuando terminó de leer el portal. */
  capturedAt?: string;
  duracionMs?: number;
  cuenta?: Pick<AccountDetails, "portalId" | "hubDomain" | "uiDomain" | "timeZone" | "companyCurrency" | "dataHostingLocation" | "accountType" | "scopes">;
  lifecycleStats?: LifecycleStats;
  ownerStats?: PropietariosLeidos;
  enriquecimiento?: AuditEnrichment;
  inventario?: InventarioDelPortal;
  /** Lo que Nexus sabe del cliente (diagnóstico, planificación…), congelado al leer el portal. */
  contextoDelCliente?: ContextoDelCliente | null;
  lecturas?: { version: number; intentos: number; fallidas: LecturaFallida[] };
  analisis?: AnalisisGuardado;
  /** El análisis falló: por qué, en palabras. La foto sirve igual. */
  analisisError?: string;
  comprobados?: Record<string, RevisionManual>;
}

/** La foto guardada, si es de esta versión. Una de la versión 1 devuelve `null` (se vuelve a correr). */
export function leerFoto(data: unknown): FotoDeAuditoria | null {
  if (!data || typeof data !== "object") return null;
  const f = data as Partial<FotoDeAuditoria>;
  if (f.version !== VERSION_DE_LA_FOTO) return null;
  // Las fotos de antes del 2026-10-04 guardaban las etapas de un pipeline como nombres sueltos.
  if (f.inventario?.pipelines) {
    return { ...f, inventario: { ...f.inventario, pipelines: f.inventario.pipelines.map(normalizarPipeline) } } as FotoDeAuditoria;
  }
  return f as FotoDeAuditoria;
}

/** Pasado este tiempo en `capturando` o `analizando`, la corrida se da por perdida (el proceso murió). */
export const CORRIDA_PERDIDA_MS = 15 * 60 * 1000;

/** ¿La corrida en curso se perdió? (el proceso murió con la fila en `capturando` o `analizando`). */
export function corridaPerdida(foto: FotoDeAuditoria, ahora = Date.now()): boolean {
  if (foto.estado !== "capturando" && foto.estado !== "analizando") return false;
  const desde = new Date(foto.capturedAt ?? foto.iniciadaEn).getTime();
  return Number.isFinite(desde) && ahora - desde > CORRIDA_PERDIDA_MS;
}
