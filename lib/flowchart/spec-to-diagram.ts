/**
 * lib/flowchart/spec-to-diagram.ts
 *
 * Conversor DETERMINÍSTICO spec → diagrama (server-safe: sin React, sin Prisma).
 *
 * El agente del canvas "Desarrollo" emite specs STRING-ONLY (coerceToSchema aplana
 * toda hoja a string) y este módulo las convierte en un `FlowchartData` válido
 * (kind "integration") que el renderer dibuja: sistemas/objetos → nodos "system",
 * conexiones/asociaciones → flechas de datos. El diagrama NUNCA lo dibuja la IA:
 * se deriva acá, con validación dura (ids únicos, cero edges huérfanos, strings
 * trimmeados) para que el canvas no rompa por data parcial del modelo.
 *
 * También convierte el shape LEGACY `tech_architecture` (cadena v2 / nodos+flujos
 * v1) para que los canvases viejos se rendan como diagrama sin migración de data.
 */
import type { FlowchartData } from "@/components/flowchart/FlowchartViewer";

// FlowchartData ya declara kind/dataFields/dedupeKey/trigger (D1) — alias directos.
export type DiagramNode = FlowchartData["nodes"][number];
export type DiagramEdge = FlowchartData["edges"][number];
export type IntegrationDiagram = FlowchartData;

/** Resultado de los conversores con matching: el diagrama + cuántas conexiones se
 *  descartaron por apuntar a un sistema/objeto inexistente (para loguear). */
export interface DiagramResult {
  diagram: IntegrationDiagram;
  discarded: number;
}

// ── Helpers de saneo (la spec viene string-only, pero tolera cualquier cosa) ──

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const asObjArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(asObj).filter((o) => Object.keys(o).length > 0) : [];

/** Id estable desde el nombre: lowercase, sin acentos, no-alfanumérico → guión. */
export function slugId(nombre: string): string {
  const s = stripAccents(nombre.trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "nodo";
}

/** Dedupe de ids: dos sistemas con el mismo slug → sufijo -2, -3… */
function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/** pending viene como string ("si"/"sí"/"yes"/"true"/…) → true; resto → undefined. */
function parsePending(v: unknown): true | undefined {
  const s = stripAccents(t(v).toLowerCase());
  return s.startsWith("s") || s.startsWith("y") || s.startsWith("true") ? true : undefined;
}

function parseDirection(v: unknown): "to" | "bidir" {
  return stripAccents(t(v).toLowerCase()).startsWith("bidir") ? "bidir" : "to";
}

function parseSyncType(v: unknown): "realtime" | "batch" | "manual" | undefined {
  const s = t(v).toLowerCase();
  return s === "realtime" || s === "batch" || s === "manual" ? s : undefined;
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
function parseColor(v: unknown): string | undefined {
  const s = t(v);
  return HEX_RE.test(s) ? s : undefined;
}

/** Lookup de nodos por slug Y por nombre lowercase/trim (fuzzy simple, first-wins). */
function registerLookup(byKey: Map<string, string>, nombre: string, id: string): void {
  const slug = slugId(nombre);
  if (!byKey.has(slug)) byKey.set(slug, id);
  const lower = nombre.trim().toLowerCase();
  if (!byKey.has(lower)) byKey.set(lower, id);
}

function resolveRef(byKey: Map<string, string>, ref: unknown): string | undefined {
  const s = t(ref);
  if (!s) return undefined;
  return byKey.get(slugId(s)) ?? byKey.get(s.toLowerCase());
}

// ── Arquitectura (mapa de sistemas) ──────────────────────────────────────────

/**
 * Spec `arquitectura` { sistemas[], conexiones[] } → diagrama de integración.
 * Conexiones cuyo `desde`/`hacia` no matchea NINGÚN sistema se descartan y se
 * cuentan en `discarded` (el llamador decide si loguear).
 */
export function specToDiagram(spec: unknown): DiagramResult {
  const s = asObj(spec);
  const nodes: DiagramNode[] = [];
  const used = new Set<string>();
  const byKey = new Map<string, string>();

  for (const sys of asObjArray(s.sistemas)) {
    const nombre = t(sys.nombre);
    if (!nombre) continue;
    const id = uniqueId(slugId(nombre), used);
    const rol = t(sys.rol);
    const detalle = t(sys.detalle);
    const color = parseColor(sys.color);
    nodes.push({
      id,
      type: "system",
      label: nombre,
      ...(rol ? { sublabel: rol } : {}),
      ...(detalle ? { detail: detalle } : {}),
      ...(color ? { systemColor: color } : {}),
    });
    registerLookup(byKey, nombre, id);
  }

  let discarded = 0;
  const edges: DiagramEdge[] = [];
  for (const c of asObjArray(s.conexiones)) {
    const source = resolveRef(byKey, c.desde);
    const target = resolveRef(byKey, c.hacia);
    if (!source || !target) {
      discarded++;
      continue;
    }
    const titulo = t(c.titulo);
    const dataFields = t(c.dataFields);
    const dedupeKey = t(c.dedupeKey);
    const cuando = t(c.cuando);
    const syncType = parseSyncType(c.syncType);
    const pending = parsePending(c.pending);
    const label = titulo && dataFields ? `${titulo} · ${dataFields}` : titulo || dataFields;
    edges.push({
      id: `e${edges.length}`,
      source,
      target,
      ...(label ? { label } : {}),
      direction: parseDirection(c.direction),
      ...(syncType ? { syncType } : {}),
      ...(pending ? { pending } : {}),
      ...(dataFields ? { dataFields } : {}),
      ...(dedupeKey ? { dedupeKey } : {}),
      ...(cuando ? { trigger: cuando } : {}),
    });
  }

  return { diagram: { kind: "integration", nodes, edges }, discarded };
}

// ── Relación entre objetos ───────────────────────────────────────────────────

/**
 * Spec `relacion_objetos` { objetos[], asociaciones[] } → diagrama de integración.
 * Cardinalidad como etiqueta de la flecha; "↔" en la cardinalidad → bidir.
 */
export function relacionToDiagram(spec: unknown): DiagramResult {
  const s = asObj(spec);
  const nodes: DiagramNode[] = [];
  const used = new Set<string>();
  const byKey = new Map<string, string>();

  for (const o of asObjArray(s.objetos)) {
    const nombre = t(o.nombre);
    if (!nombre) continue;
    const id = uniqueId(slugId(nombre), used);
    const equivale = t(o.equivale);
    const detalle = t(o.detalle);
    nodes.push({
      id,
      type: "system",
      label: nombre,
      ...(equivale ? { sublabel: equivale } : {}),
      ...(detalle ? { detail: detalle } : {}),
    });
    registerLookup(byKey, nombre, id);
  }

  let discarded = 0;
  const edges: DiagramEdge[] = [];
  for (const a of asObjArray(s.asociaciones)) {
    const source = resolveRef(byKey, a.desde);
    const target = resolveRef(byKey, a.hacia);
    if (!source || !target) {
      discarded++;
      continue;
    }
    const cardinalidad = t(a.cardinalidad);
    const detalle = t(a.detalle);
    const pending = parsePending(a.pending);
    edges.push({
      id: `e${edges.length}`,
      source,
      target,
      ...(cardinalidad ? { label: cardinalidad } : {}),
      direction: cardinalidad.includes("↔") ? "bidir" : "to",
      ...(pending ? { pending } : {}),
      ...(detalle ? { dataFields: detalle } : {}),
    });
  }

  return { diagram: { kind: "integration", nodes, edges }, discarded };
}

// ── Legacy tech_architecture (cadena v2 / nodos+flujos v1) ───────────────────

/**
 * Data legacy `tech_architecture` → diagrama lineal (canvases viejos, sin migrar).
 * v2: `cadena[{actor,titulo,detalle}]` en orden, edges consecutivos sin label.
 * v1 (fallback si no hay cadena): `nodos[{nombre,rol,detalle}]` + `flujos[{desde,hacia,descripcion}]`.
 */
export function cadenaToDiagram(data: unknown): IntegrationDiagram {
  const d = asObj(data);
  const cadena = asObjArray(d.cadena);
  const used = new Set<string>();

  if (cadena.length > 0) {
    const nodes: DiagramNode[] = [];
    for (const paso of cadena) {
      const actor = t(paso.actor);
      const titulo = t(paso.titulo);
      const label = actor || titulo;
      if (!label) continue;
      const detalle = t(paso.detalle);
      nodes.push({
        id: uniqueId(slugId(label), used),
        type: "system",
        label,
        ...(actor && titulo ? { sublabel: titulo } : {}),
        ...(detalle ? { detail: detalle } : {}),
      });
    }
    const edges: DiagramEdge[] = nodes.slice(1).map((n, i) => ({
      id: `e${i}`,
      source: nodes[i].id,
      target: n.id,
      direction: "to" as const,
    }));
    return { kind: "integration", nodes, edges };
  }

  // Fallback v1: nodos + flujos separados.
  const nodes: DiagramNode[] = [];
  const byKey = new Map<string, string>();
  for (const n of asObjArray(d.nodos)) {
    const nombre = t(n.nombre);
    if (!nombre) continue;
    const id = uniqueId(slugId(nombre), used);
    const rol = t(n.rol);
    const detalle = t(n.detalle);
    nodes.push({
      id,
      type: "system",
      label: nombre,
      ...(rol ? { sublabel: rol } : {}),
      ...(detalle ? { detail: detalle } : {}),
    });
    registerLookup(byKey, nombre, id);
  }
  const edges: DiagramEdge[] = [];
  for (const f of asObjArray(d.flujos)) {
    const source = resolveRef(byKey, f.desde);
    const target = resolveRef(byKey, f.hacia);
    if (!source || !target) continue;
    const descripcion = t(f.descripcion);
    edges.push({
      id: `e${edges.length}`,
      source,
      target,
      ...(descripcion ? { label: descripcion } : {}),
      direction: "to",
    });
  }
  return { kind: "integration", nodes, edges };
}
