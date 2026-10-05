/**
 * lib/auditoria-portal/cruces.ts — LO QUE NO SE VE MIRANDO UN WORKFLOW O UN PIPELINE POR SEPARADO.
 *
 * Cada regla cruza dos lecturas del inventario y devuelve hechos, nunca opiniones:
 *  · Cadenas: un workflow escribe la propiedad (o pone la etapa) que dispara a otro, o lo llama.
 *    Tocar el primero cambia lo que hace el segundo.
 *  · Posibles bucles: se reinscribe y escribe lo mismo que lo dispara, o dos se disparan entre sí.
 *  · Avisos sin destino: avisa o rota entre personas que ya no tienen usuario.
 *  · Automatización por etapa: qué workflows corren al entrar a cada etapa y cuáles la ponen.
 *  · Planificación contra portal: las etapas que acordó Smarteam con el cliente frente a las que hay.
 *
 * La pantalla y el análisis leen lo mismo. PURO: sin red ni base.
 */
import { PROPIEDADES_DE_ETAPA, type PersonaDelPortal, type PipelineLeido, type WorkflowLeido } from "./inventario";

const con = (w: WorkflowLeido) => w.detalle;

// ── Workflows ─────────────────────────────────────────────────────────────────

export interface Cadena {
  desde: string;
  hacia: string;
  /** La propiedad, el id de etapa o «pasa» (llamada directa). */
  por: string;
  tipo: "propiedad" | "etapa" | "pasa";
}

/**
 * Las conexiones entre workflows ENCENDIDOS (la llamada directa se cuenta aunque el destino esté
 * apagado). Por propiedad, solo dentro del mismo objeto y sin las de etapa: la etapa de un pipeline se
 * cruza por su id (las etapas de distintos pipelines comparten la propiedad, no el valor).
 */
export function cadenasDeWorkflows(workflows: readonly WorkflowLeido[]): Cadena[] {
  const salida: Cadena[] = [];
  const vistas = new Set<string>();
  const sumar = (c: Cadena) => {
    const k = `${c.desde}>${c.hacia}>${c.tipo}>${c.por}`;
    if (vistas.has(k)) return;
    vistas.add(k);
    salida.push(c);
  };
  const encendidos = workflows.filter((w) => w.encendido && con(w));
  const porId = new Map(workflows.map((w) => [w.id, w]));
  for (const a of encendidos) {
    const da = con(a)!;
    for (const id of da.pasaA ?? []) if (porId.has(id) && id !== a.id) sumar({ desde: a.id, hacia: id, por: "pasa", tipo: "pasa" });
    for (const b of encendidos) {
      if (b.id === a.id) continue;
      const db = con(b)!;
      const mismoObjeto = a.objeto === b.objeto && a.objeto !== "otro";
      const props = new Set(db.disparadoPor?.propiedades ?? []);
      if (mismoObjeto) for (const p of da.escribe) if (props.has(p) && !PROPIEDADES_DE_ETAPA.has(p)) sumar({ desde: a.id, hacia: b.id, por: p, tipo: "propiedad" });
      const etapas = new Set(db.disparadoPor?.etapas ?? []);
      for (const e of da.poneEtapas ?? []) if (etapas.has(e)) sumar({ desde: a.id, hacia: b.id, por: e, tipo: "etapa" });
    }
  }
  return salida;
}

export interface PosibleBucle {
  workflows: string[];
  /** La propiedad que se escribe y a la vez dispara. */
  por: string;
}

/**
 * Un workflow que se reinscribe y escribe una propiedad que lo dispara a sí mismo, o dos encendidos
 * que se disparan entre sí. «Posible»: HubSpot frena algunos casos solo, y el filtro puede pedir un
 * valor distinto del que se escribe. Se revisa a mano.
 */
export function buclesPosibles(workflows: readonly WorkflowLeido[], cadenas = cadenasDeWorkflows(workflows)): PosibleBucle[] {
  const salida: PosibleBucle[] = [];
  for (const w of workflows) {
    const d = con(w);
    if (!w.encendido || !d?.reinscribe) continue;
    const props = new Set(d.disparadoPor?.propiedades ?? []);
    const etapas = new Set(d.disparadoPor?.etapas ?? []);
    const p = d.escribe.find((x) => props.has(x) && !PROPIEDADES_DE_ETAPA.has(x)) ?? (d.poneEtapas ?? []).find((e) => etapas.has(e));
    if (p) salida.push({ workflows: [w.id], por: p });
  }
  const vistas = new Set<string>();
  for (const c of cadenas) {
    if (c.tipo === "pasa") continue;
    const vuelta = cadenas.find((x) => x.tipo !== "pasa" && x.desde === c.hacia && x.hacia === c.desde);
    if (!vuelta) continue;
    const k = [c.desde, c.hacia].sort().join("|");
    if (vistas.has(k)) continue;
    vistas.add(k);
    salida.push({ workflows: [c.desde, c.hacia], por: c.por });
  }
  return salida;
}

export interface AvisoSinDestino {
  workflowId: string;
  tipo: "avisa" | "rota";
  /** `nombre: null` = el id no aparece entre los usuarios ni entre los que se fueron. */
  usuarios: { id: string; nombre: string | null }[];
}

/** Workflows encendidos que avisan o rotan entre personas que ya no están. `null` sin la lista de usuarios. */
export function avisosSinDestino(workflows: readonly WorkflowLeido[], personas: readonly PersonaDelPortal[] | null): AvisoSinDestino[] | null {
  if (!personas) return null;
  const porId = new Map(personas.map((p) => [p.usuarioId, p]));
  const salida: AvisoSinDestino[] = [];
  for (const w of workflows) {
    const d = con(w);
    if (!w.encendido || !d) continue;
    for (const [tipo, ids] of [["avisa", d.avisaA ?? []], ["rota", d.rotaEntre ?? []]] as const) {
      const fuera = ids
        .map((id) => ({ id, p: porId.get(id) }))
        .filter((x) => !x.p || !x.p.activo)
        .map((x) => ({ id: x.id, nombre: x.p?.nombre ?? null }));
      if (fuera.length) salida.push({ workflowId: w.id, tipo, usuarios: fuera });
    }
  }
  return salida;
}

/** Los workflows con más versiones guardadas (los que más se editaron), de más a menos. */
export function masEditados(workflows: readonly WorkflowLeido[], cuantos = 5): WorkflowLeido[] {
  return workflows
    .filter((w) => (w.versiones ?? 0) > 1)
    .sort((a, b) => (b.versiones ?? 0) - (a.versiones ?? 0) || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, cuantos);
}

// ── Pipelines ─────────────────────────────────────────────────────────────────

export interface EtapaUbicada {
  pipelineId: string;
  pipeline: string;
  objeto: PipelineLeido["objeto"];
  etapa: string;
}

/** Id de etapa → su pipeline y su nombre (los workflows guardan la etapa por id). */
export function mapaDeEtapas(pipelines: readonly PipelineLeido[]): Map<string, EtapaUbicada> {
  const m = new Map<string, EtapaUbicada>();
  for (const p of pipelines) for (const e of p.etapas) if (e.id) m.set(e.id, { pipelineId: p.id, pipeline: p.nombre, objeto: p.objeto, etapa: e.nombre });
  return m;
}

export interface AutomatizacionDeEtapa {
  etapaId: string;
  /** Workflows encendidos que corren cuando un registro está (o entra) en esta etapa. */
  alEntrar: string[];
  /** Workflows encendidos que ponen esta etapa. */
  laPonen: string[];
}

export function automatizacionDelPipeline(p: PipelineLeido, workflows: readonly WorkflowLeido[]): AutomatizacionDeEtapa[] {
  const encendidos = workflows.filter((w) => w.encendido && con(w));
  return p.etapas
    .filter((e) => e.id)
    .map((e) => ({
      etapaId: e.id,
      alEntrar: encendidos.filter((w) => con(w)!.disparadoPor?.etapas.includes(e.id)).map((w) => w.id),
      laPonen: encendidos.filter((w) => con(w)!.poneEtapas?.includes(e.id)).map((w) => w.id),
    }));
}

/** La etapa abierta con más registros: dónde se acumula el trabajo. `null` sin conteos o sin abiertos. */
export function etapaQueAcumula(p: PipelineLeido): { nombre: string; registros: number; deAbiertos: number } | null {
  const abiertas = p.etapas.filter((e) => !e.cerrada && e.registros !== null);
  const total = abiertas.reduce((s, e) => s + (e.registros ?? 0), 0);
  if (!total) return null;
  const top = abiertas.reduce((a, b) => ((b.registros ?? 0) > (a.registros ?? 0) ? b : a));
  return { nombre: top.nombre, registros: top.registros ?? 0, deAbiertos: total };
}

// ── La Planificación del cliente contra el portal ─────────────────────────────

/** Lo que Nexus sabe de la operación del cliente, congelado en la foto al leer el portal. */
export interface ContextoDelCliente {
  /** De dónde sale: documento y proyecto (siempre del MISMO cliente de la auditoría). */
  fuentes: { documento: string; proyecto: string }[];
  /** Los pipelines que define la Planificación, con sus etapas en orden. */
  pipelinesPlaneados: { nombre: string; tipo: string; etapas: string[] }[];
  /** El resto, en texto, para el análisis (diagnóstico, procesos, qué se vendió). */
  texto: string;
}

export interface ComparacionDePipeline {
  planeado: string;
  tipo: string;
  /** El pipeline del portal que más se le parece. `null` = no hay uno del mismo objeto. */
  enPortal: { id: string; nombre: string } | null;
  coinciden: string[];
  faltanEnElPortal: string[];
  soloEnElPortal: string[];
}

const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const palabras = (s: string) => new Set(normal(s).split(" ").filter((w) => w.length >= 3));

function mismaEtapa(a: string, b: string): boolean {
  const x = normal(a);
  const y = normal(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y));
}

const OBJETO_DEL_TIPO: Record<string, PipelineLeido["objeto"] | null> = { ventas: "negocios", servicio: "tickets" };

/** Cada pipeline planeado contra el del portal que más se le parece (mismo objeto, nombre parecido). */
export function compararConLaPlanificacion(
  planeados: ContextoDelCliente["pipelinesPlaneados"],
  leidos: readonly PipelineLeido[],
): ComparacionDePipeline[] {
  return planeados
    .filter((p) => p.etapas.length > 0)
    .map((p) => {
      const objeto = Object.hasOwn(OBJETO_DEL_TIPO, p.tipo) ? OBJETO_DEL_TIPO[p.tipo] : null;
      const candidatos = leidos.filter((l) => !objeto || l.objeto === objeto);
      const pp = palabras(p.nombre);
      const puntaje = (l: PipelineLeido) => [...palabras(l.nombre)].filter((w) => pp.has(w)).length;
      const elegido =
        [...candidatos].sort((a, b) => puntaje(b) - puntaje(a) || (b.registros ?? 0) - (a.registros ?? 0))[0] ?? null;
      if (!elegido) return { planeado: p.nombre, tipo: p.tipo, enPortal: null, coinciden: [], faltanEnElPortal: [...p.etapas], soloEnElPortal: [] };
      const reales = elegido.etapas.map((e) => e.nombre);
      return {
        planeado: p.nombre,
        tipo: p.tipo,
        enPortal: { id: elegido.id, nombre: elegido.nombre },
        coinciden: p.etapas.filter((e) => reales.some((r) => mismaEtapa(e, r))),
        faltanEnElPortal: p.etapas.filter((e) => !reales.some((r) => mismaEtapa(e, r))),
        soloEnElPortal: reales.filter((r) => !p.etapas.some((e) => mismaEtapa(e, r))),
      };
    });
}
