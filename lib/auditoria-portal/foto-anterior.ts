/**
 * lib/auditoria-portal/foto-anterior.ts — LO QUE SE PUEDE LEER DE UNA AUDITORÍA DE ANTES DEL REDISEÑO.
 *
 * Las fotos de la versión 1 (antes del 2026-10-04) no se migran ni se reescriben (`leerFoto` las
 * devuelve `null`), pero lo que guardaron se sigue viendo: los totales, los embudos del ciclo de vida,
 * los propietarios y los insights que generó la IA. Se muestran en SOLO LECTURA, tal como quedaron:
 * se corrieron antes de que la auditoría registrara qué lecturas fallaron, así que un cero puede ser
 * un error de lectura (la pantalla lo dice).
 *
 * La forma es la de `LifecycleSnapshot` hasta el commit 67d0638a (lib/hubspot/portal-analyzer.ts):
 *   { lifecycleStats: { contacts, companies, totalContacts, totalCompanies, totalDeals, totalTickets,
 *     lifecycleWorkflows }, ownerStats?: { owners, unassigned, totalAssigned, monthlyAssignments,
 *     monthlyCreated }, capturedAt, insights?: { generatedAt, insights: AuditInsight[] } }
 * Se lee a la defensiva: cualquier campo puede faltar o venir torcido, y lo que no se entiende no se
 * pinta (nunca se inventa un cero). PURO.
 */
import { VERSION_DE_LA_FOTO } from "./foto";

/** El rótulo de la ficha: que nadie la confunda con una auditoría de hoy ni busque dónde editarla. */
export const ROTULO_DE_LA_VERSION_ANTERIOR = "Auditoría de la versión anterior (solo lectura)";

export const SEVERIDADES_ANTERIORES = ["critical", "warning", "info", "positive"] as const;
export type SeveridadAnterior = (typeof SEVERIDADES_ANTERIORES)[number];

export const ETIQUETA_DE_SEVERIDAD_ANTERIOR: Record<SeveridadAnterior, string> = {
  critical: "Crítico",
  warning: "Atención",
  info: "Para saber",
  positive: "Bien",
};

/** Sobre qué parte del informe viejo hablaba cada insight (`widgetKey`). */
const SECCION_DEL_INSIGHT: Record<string, string> = {
  stats: "Totales",
  contacts_lifecycle: "Contactos por etapa",
  contacts_funnel: "Embudo de contactos",
  companies_lifecycle: "Empresas por etapa",
  companies_funnel: "Embudo de empresas",
  lifecycle_workflows: "Workflows del ciclo de vida",
  owner_assignment: "Propietarios",
};

export interface InsightAnterior {
  seccion: string | null;
  titulo: string;
  comentario: string;
  severidad: SeveridadAnterior;
  recomendaciones: string[];
}

export interface FilaDeEmbudo {
  etiqueta: string;
  valor: number;
}

export interface FotoAnterior {
  /** Cuándo se leyó el portal (ISO), si quedó guardado. */
  capturadaEn: string | null;
  /** `null` si la foto no tiene totales. Un total que no se guardó queda en `null`, no en 0. */
  totales: { contactos: number | null; empresas: number | null; negocios: number | null; tickets: number | null } | null;
  contactosPorEtapa: FilaDeEmbudo[];
  empresasPorEtapa: FilaDeEmbudo[];
  /** Los workflows que tocaban el ciclo de vida; `null` si la foto no los trae. */
  workflows: string[] | null;
  propietarios: {
    porPropietario: Array<{ nombre: string; contactos: number }>;
    sinPropietario: number | null;
    asignados: number | null;
    /** Los últimos meses: contactos creados y asignados a un propietario. */
    meses: Array<{ etiqueta: string; creados: number | null; asignados: number | null }>;
  } | null;
  insights: InsightAnterior[];
  insightsGeneradosEn: string | null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const fecha = (v: unknown): string | null => {
  const t = texto(v);
  return t && Number.isFinite(new Date(t).getTime()) ? t : null;
};

/**
 * Las etapas con contactos (o empresas), en el orden en que se guardaron, y «Sin etapa» con lo que
 * falta para el total — como las mostraba la ficha vieja.
 */
function embudo(v: unknown, total: number | null): FilaDeEmbudo[] {
  if (!Array.isArray(v)) return [];
  const filas: FilaDeEmbudo[] = [];
  for (const e of v) {
    if (!esObjeto(e)) continue;
    const valor = numero(e.count);
    const etiqueta = texto(e.label) || texto(e.value);
    if (valor === null || valor <= 0 || !etiqueta) continue;
    filas.push({ etiqueta, valor });
  }
  const conEtapa = filas.reduce((s, f) => s + f.valor, 0);
  if (total !== null && total > conEtapa && filas.length > 0) filas.push({ etiqueta: "Sin etapa", valor: total - conEtapa });
  return filas;
}

/** Los insights de la IA, de lo más grave a lo que está bien (dentro de cada severidad, en su orden). */
export function insightsDeLaFotoAnterior(data: unknown): { insights: InsightAnterior[]; generadosEn: string | null } {
  if (!esObjeto(data)) return { insights: [], generadosEn: null };
  const crudo = data.insights;
  // La forma guardada es { generatedAt, insights: [...] }; se acepta también la lista suelta.
  const lista = Array.isArray(crudo) ? crudo : esObjeto(crudo) && Array.isArray(crudo.insights) ? crudo.insights : [];
  const generadosEn = esObjeto(crudo) ? fecha(crudo.generatedAt) : null;
  const insights: InsightAnterior[] = [];
  for (const i of lista) {
    if (!esObjeto(i)) continue;
    const titulo = texto(i.title);
    const comentario = texto(i.comment);
    if (!titulo && !comentario) continue;
    const severidad = (SEVERIDADES_ANTERIORES as readonly string[]).includes(texto(i.severity)) ? (texto(i.severity) as SeveridadAnterior) : "info";
    const clave = texto(i.widgetKey);
    insights.push({
      seccion: SECCION_DEL_INSIGHT[clave] ?? null,
      titulo,
      comentario,
      severidad,
      recomendaciones: Array.isArray(i.recommendations) ? i.recommendations.map(texto).filter(Boolean) : [],
    });
  }
  const orden = (s: SeveridadAnterior) => SEVERIDADES_ANTERIORES.indexOf(s);
  return { insights: insights.map((x, k) => ({ x, k })).sort((a, b) => orden(a.x.severidad) - orden(b.x.severidad) || a.k - b.k).map(({ x }) => x), generadosEn };
}

/**
 * La foto de una auditoría de la versión anterior, lista para mostrar en solo lectura. `null` si `data`
 * no es una foto (o si es una de la versión de hoy: esa se lee con `leerFoto`).
 */
export function leerFotoAnterior(data: unknown): FotoAnterior | null {
  if (!esObjeto(data)) return null;
  if (data.version === VERSION_DE_LA_FOTO) return null;

  const ciclo = esObjeto(data.lifecycleStats) ? data.lifecycleStats : null;
  const totales = ciclo
    ? {
        contactos: numero(ciclo.totalContacts),
        empresas: numero(ciclo.totalCompanies),
        negocios: numero(ciclo.totalDeals),
        tickets: numero(ciclo.totalTickets),
      }
    : null;
  const hayTotales = !!totales && Object.values(totales).some((n) => n !== null);

  const due = esObjeto(data.ownerStats) ? data.ownerStats : null;
  let propietarios: FotoAnterior["propietarios"] = null;
  if (due) {
    const porPropietario: Array<{ nombre: string; contactos: number }> = [];
    for (const o of Array.isArray(due.owners) ? due.owners : []) {
      if (!esObjeto(o)) continue;
      const contactos = numero(o.contactCount);
      const nombre = texto(o.ownerName) || texto(o.email) || texto(o.ownerId);
      if (contactos === null || !nombre) continue;
      porPropietario.push({ nombre, contactos });
    }
    porPropietario.sort((a, b) => b.contactos - a.contactos);
    // Los meses en el orden en que se guardaron (del más viejo al más nuevo), cruzados por `month`.
    const porMes = new Map<string, { etiqueta: string; creados: number | null; asignados: number | null }>();
    const mes = (m: unknown, campo: "creados" | "asignados") => {
      if (!esObjeto(m)) return;
      const clave = texto(m.month) || texto(m.label);
      if (!clave) return;
      const fila = porMes.get(clave) ?? { etiqueta: texto(m.label) || clave, creados: null, asignados: null };
      fila[campo] = numero(m.count);
      porMes.set(clave, fila);
    };
    for (const m of Array.isArray(due.monthlyCreated) ? due.monthlyCreated : []) mes(m, "creados");
    for (const m of Array.isArray(due.monthlyAssignments) ? due.monthlyAssignments : []) mes(m, "asignados");
    const meses = [...porMes.values()];
    const sinPropietario = numero(due.unassigned);
    const asignados = numero(due.totalAssigned);
    if (porPropietario.length > 0 || sinPropietario !== null || asignados !== null || meses.length > 0) {
      propietarios = { porPropietario, sinPropietario, asignados, meses };
    }
  }

  const { insights, generadosEn } = insightsDeLaFotoAnterior(data);
  const workflows = ciclo && Array.isArray(ciclo.lifecycleWorkflows) ? ciclo.lifecycleWorkflows.map(texto).filter(Boolean) : null;

  return {
    capturadaEn: fecha(data.capturedAt),
    totales: hayTotales ? totales : null,
    contactosPorEtapa: embudo(ciclo?.contacts, totales?.contactos ?? null),
    empresasPorEtapa: embudo(ciclo?.companies, totales?.empresas ?? null),
    workflows,
    propietarios,
    insights,
    insightsGeneradosEn: generadosEn,
  };
}
