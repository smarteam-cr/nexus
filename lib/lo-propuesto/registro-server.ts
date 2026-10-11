/**
 * lib/lo-propuesto/registro-server.ts — un LECTOR por tipo de lo que Nexus propone. SERVIDOR.
 *
 * Cada lector trae de la base lo mínimo para calcular el estado de cada propuesta con la regla de su tipo
 * (lib/lo-propuesto/ciclo.ts) y la cuenta con `contarTipo` (lib/lo-propuesto/conteo.ts). Es la fuente de «Uso de
 * Nexus» (lib/lo-propuesto/uso-server.ts) y de la futura pestaña «Conclusiones» del panel de dirección: no se construye
 * un `lib/conclusiones` aparte. Un tipo nuevo de propuesta = un lector acá y su regla en ciclo.ts.
 *
 * Se trae cada fila (con pocas columnas) y se cuenta en código, en vez de agrupar en la base: así el número sale de la
 * MISMA regla que usan la tarjeta y «Para ti», incluido el vencimiento por fecha. Solo lee. Recibe la conexión para que
 * un script la abra de solo lectura (scripts/uso-de-nexus.ts).
 *
 * Lo que no se sabe, se dice: la etapa no guarda quién decidió (solo cuenta lo pendiente y lo vencido), los
 * compromisos viejos (`ActionItem`) no guardan quién ni cuándo, y una sugerencia del handoff no guarda quién la usó ni
 * se distingue una descartada de una reemplazada (`GUARDA` en tipos.ts).
 */
import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as prismaDeLaApp } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { PASO_DE_LAS_SUGERENCIAS } from "@/lib/agents/historial-corridas";
import { camposPropuestos, leerFicha } from "@/lib/clients/ficha";
import { leerPresentacion } from "@/lib/canvas/presentacion-del-diagnostico";
import { huellaDeLaSugerencia, sugerenciaDelBloque } from "@/lib/handoff/sugerencias";
import { sugerenciaVigente } from "@/lib/projects/etapa-sugerida";
import { resolvePipeline } from "@/lib/projects/kind";
import { DESTINOS, destinoPorClave } from "@/lib/seguimiento/destinos";
import { leerDestinos } from "@/lib/seguimiento/hechos/estado";
import {
  diaCR,
  estadoDeAlerta,
  estadoDeCampoPendiente,
  estadoDeDecisionDeCampo,
  estadoDeDestinoDeHecho,
  estadoDeEtapa,
  estadoDeFechaDecidida,
  estadoDeMinuta,
  estadoDePedido,
  estadoDePropuestaDeFecha,
  estadoDeSugerenciaDelHandoff,
  estadoDeTarea,
  vencioSinRevisar,
} from "./ciclo";
import { contarTipo, conteoVacio, type ConteoDeTipo, type ItemParaContar, type Ventana } from "./conteo";
import { TIPOS_DE_LO_PROPUESTO, type ClaveDeTipo } from "./tipos";

export interface OpcionesDeConteo extends Ventana {
  ahora?: Date;
  db?: PrismaClient;
}

type Lector = (o: Required<Pick<OpcionesDeConteo, "desde" | "hasta" | "ahora" | "db">>, hoyISO: string) => Promise<Partial<Record<ClaveDeTipo, ItemParaContar[]>>>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** El rango de la ventana. Cada lector trae lo NACIDO o lo DECIDIDO en ella (lo decidido de algo anterior va a `deAntes`). */
const rango = (v: Ventana) => ({ gte: v.desde, lt: v.hasta });

/** Una tabla o columna que falta (un SQL sin aplicar) no rompe el conteo: ese tipo sale vacío. */
async function seguro<T>(p: Promise<T>, siFalta: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (esquemaDesactualizado(e)) return siFalta;
    throw e;
  }
}

const minutas: Lector = async ({ db, ...v }, hoyISO) => {
  const filas = await db.sessionMinute.findMany({
    where: { OR: [{ createdAt: rango(v) }, { reviewedAt: rango(v) }] },
    select: { status: true, reviewedByEmail: true, reviewedAt: true, createdAt: true },
  });
  return { minuta: filas.map((m) => ({ ...estadoDeMinuta(m, hoyISO), nacioEn: m.createdAt.toISOString() })) };
};

const pedidos: Lector = async ({ db, ...v }, hoyISO) => {
  const filas = await seguro(
    db.pedidoFueraDeAlcance.findMany({
      where: { creadoPor: null, OR: [{ createdAt: rango(v) }, { decididoAt: rango(v) }] },
      select: { estado: true, decididoPor: true, decididoAt: true, creadoPor: true, createdAt: true },
    }),
    [],
  );
  return {
    "pedido-fuera-de-alcance": filas.flatMap((p) => {
      const e = estadoDePedido(p, hoyISO);
      return e ? [{ ...e, nacioEn: p.createdAt.toISOString() }] : [];
    }),
  };
};

const tareas: Lector = async ({ db, ...v }) => {
  const filas = await seguro(
    db.tarea.findMany({
      where: {
        origen: { in: ["reunion", "notas", "chat"] },
        AND: [
          { OR: [{ decision: { not: null } }, { estado: { in: ["propuesta", "vencida"] } }] },
          { OR: [{ createdAt: rango(v) }, { decididaAt: rango(v) }] },
        ],
      },
      select: { estado: true, decision: true, decididaPorEmail: true, decididaAt: true, createdAt: true },
    }),
    [],
  );
  return {
    "tarea-propuesta": filas.flatMap((t) => {
      const e = estadoDeTarea(t);
      return e ? [{ ...e, nacioEn: t.createdAt.toISOString() }] : [];
    }),
  };
};

const alertas: Lector = async ({ db, ...v }) => {
  const filas = await db.csAlert.findMany({
    where: { OR: [{ createdAt: rango(v) }, { resolvedAt: rango(v) }] },
    select: { status: true, resolvedByEmail: true, resolvedAt: true, createdAt: true, agentRunId: true },
  });
  const vigia: ItemParaContar[] = [];
  const regla: ItemParaContar[] = [];
  for (const a of filas) (a.agentRunId ? vigia : regla).push({ ...estadoDeAlerta(a), nacioEn: a.createdAt.toISOString() });
  return { "alerta-del-vigia": vigia, "alerta-de-regla": regla };
};

const camposDeFicha: Lector = async ({ db }, hoyISO) => {
  const filas = await db.client.findMany({ where: { ficha: { not: Prisma.DbNull } }, select: { ficha: true } });
  const items: ItemParaContar[] = [];
  for (const f of filas) {
    const ficha = leerFicha(f.ficha);
    const at = ficha.propuesta?.at;
    const propuestos = at ? camposPropuestos(ficha).length : 0;
    for (let i = 0; i < propuestos; i++) items.push({ ...estadoDeCampoPendiente(at!, hoyISO), nacioEn: at! });
    for (const d of ficha.decisiones ?? []) items.push({ ...estadoDeDecisionDeCampo(d), nacioEn: d.propuestaAt ?? d.en });
  }
  return { "campo-de-ficha": items };
};

const etapasYFechas: Lector = async ({ db }, hoyISO) => {
  const filas = await seguro(
    db.project.findMany({
      where: { OR: [{ etapaPropuestaStageId: { not: null } }, { diagnosticoPresentacion: { not: Prisma.DbNull } }] },
      select: {
        hubspotPipelineId: true,
        hubspotPipelineStageId: true,
        etapaPropuestaStageId: true,
        etapaPropuestaMotivo: true,
        etapaPropuestaAt: true,
        diagnosticoPresentacion: true,
      },
    }),
    [],
  );
  const etapa: ItemParaContar[] = [];
  const fecha: ItemParaContar[] = [];
  for (const p of filas) {
    const s = p.etapaPropuestaStageId
      ? sugerenciaVigente(resolvePipeline(p.hubspotPipelineId), p.hubspotPipelineStageId, {
          stageId: p.etapaPropuestaStageId,
          motivo: p.etapaPropuestaMotivo,
          at: p.etapaPropuestaAt,
        })
      : null;
    if (s?.at) etapa.push({ ...estadoDeEtapa(s.at, hoyISO), nacioEn: s.at });
    const pr = leerPresentacion(p.diagnosticoPresentacion);
    if (pr.propuesta) {
      const en = pr.propuesta.en || pr.propuesta.reunion.fecha;
      fecha.push({ ...estadoDePropuestaDeFecha(en, hoyISO), nacioEn: new Date(en).toISOString() });
    }
    if (pr.fijadaPor && pr.fijadaEn && pr.fuente?.startsWith("Lo leyó Nexus")) {
      fecha.push({ ...estadoDeFechaDecidida({ usada: true, por: pr.fijadaPor, en: pr.fijadaEn }), nacioEn: pr.fijadaEn });
    }
    for (const d of pr.descartadasPor ?? []) fecha.push({ ...estadoDeFechaDecidida({ usada: false, por: d.por, en: d.en }), nacioEn: d.en });
  }
  return { "etapa-sugerida": etapa, "fecha-del-diagnostico": fecha };
};

/** DEPRECATED — etapa 2: Tarea. Los compromisos que dejó la lectura de una reunión. No guardan quién ni cuándo. */
const compromisosLegacy: Lector = async ({ db, ...v }, hoyISO) => {
  const filas = await db.actionItem.findMany({
    where: { source: { startsWith: "agent:" }, createdAt: rango(v) },
    select: { done: true, status: true, deletedAt: true, createdAt: true, updatedAt: true },
  });
  return {
    "compromiso-legacy": filas.map((a): ItemParaContar => {
      const nacioEn = a.createdAt.toISOString();
      if (a.done || a.status === "DONE") return { estado: "usado", sinFirma: true, decididoPor: null, decididoEn: iso(a.updatedAt), nacioEn };
      if (a.deletedAt) return { estado: "desestimado", sinFirma: true, decididoPor: null, decididoEn: iso(a.deletedAt), nacioEn };
      return { estado: vencioSinRevisar(a.createdAt, hoyISO) ? "vencido" : "pendiente", sinFirma: false, decididoPor: null, decididoEn: null, nacioEn };
    }),
  };
};

/** Los tipos de hecho que pueden tener un destino que espera a una persona: una novedad o el aviso de Procesos. */
const TIPOS_CON_NOVEDAD_O_PROCESOS = [...new Set(DESTINOS.filter((d) => d.salida === "novedad" || d.salida === "procesos").flatMap((d) => d.tipos))];

/**
 * Los hechos de las reuniones (etapa 6), un item por destino que espera a una persona:
 *   · `novedad` — un destino a la sección de un documento («Listo» o el chat la usan, «No aplica» la desestima). Cuenta
 *     también la de un documento que todavía no tiene contenido: la franja la muestra cuando lo tenga.
 *   · `hecho` — el aviso de Procesos («Volver a mapear»), solo de un hecho sacado de una transcripción: lo único que lee
 *     el mapeo (lib/procesos/novedades.ts cuenta igual).
 * Lo delegado (la ficha, la alerta, la etapa, el avance, el vigía) lo cuenta su módulo, y un hecho repetido no tiene
 * destinos. Sin la tabla (el SQL de la etapa 6 sin aplicar: el caso de `faltaLaTablaDeLosHechos`) sale vacío.
 */
const hechos: Lector = async ({ db, ahora, ...v }) => {
  if (!modeloDisponible((db as unknown as { hechoDeReunion?: unknown }).hechoDeReunion)) return {};
  const filas = await seguro(
    db.hechoDeReunion.findMany({
      // Lo NACIDO en la ventana, o con una decisión en ella (decidir un destino toca `updatedAt`).
      where: { tipo: { in: TIPOS_CON_NOVEDAD_O_PROCESOS }, OR: [{ createdAt: rango(v) }, { updatedAt: rango(v) }] },
      select: { tipo: true, citaFuente: true, destinos: true, createdAt: true },
    }),
    [],
  );
  const novedad: ItemParaContar[] = [];
  const hecho: ItemParaContar[] = [];
  for (const h of filas) {
    for (const d of leerDestinos(h.destinos)) {
      const salida = destinoPorClave(d.clave)?.salida;
      const esProcesos = salida === "procesos" && h.tipo === "proceso_hoy" && h.citaFuente === "transcripcion";
      if (salida !== "novedad" && !esProcesos) continue;
      const e = estadoDeDestinoDeHecho(d, h.createdAt, ahora);
      if (!e) continue;
      (esProcesos ? hecho : novedad).push({ ...e, nacioEn: h.createdAt.toISOString() });
    }
  }
  return { novedad, hecho };
};

/**
 * Las sugerencias de «Buscar lo nuevo» sobre un handoff congelado (etapa 3b). Cada corrida guarda en su salida lo que
 * propuso; la misma sugerencia (misma cita, mismo proyecto) cuenta una vez, desde la primera búsqueda que la propuso.
 * Su estado sale del bloque que hoy lleva la marca: en borrador, confirmado o ya no está (lib/lo-propuesto/ciclo.ts ›
 * `estadoDeSugerenciaDelHandoff`). Lee por el paso de la corrida, no por el grupo del agente.
 */
const sugerenciasDelHandoff: Lector = async ({ db, hasta }, hoyISO) => {
  const corridas = await db.agentRun.findMany({
    where: { stepLabel: PASO_DE_LAS_SUGERENCIAS, status: "DONE", projectId: { not: null }, createdAt: { lt: hasta } },
    orderBy: { createdAt: "asc" },
    select: { id: true, projectId: true, createdAt: true, output: true },
  });
  if (!corridas.length) return {};
  const proyectoDe = new Map(corridas.map((c) => [c.id, c.projectId ?? ""]));
  const bloques = await db.canvasBlock.findMany({
    where: { agentRunId: { in: corridas.map((c) => c.id) } },
    select: { status: true, data: true, agentRunId: true },
  });
  // Por proyecto y huella, el bloque que hoy lleva la marca (uno confirmado gana sobre uno en borrador).
  const vivas = new Map<string, { status: string }>();
  for (const b of bloques) {
    const s = sugerenciaDelBloque(b.data);
    if (!s || !b.agentRunId) continue;
    const clave = `${proyectoDe.get(b.agentRunId)}|${huellaDeLaSugerencia(s.cita)}`;
    if (!vivas.has(clave) || b.status !== "DRAFT") vivas.set(clave, { status: b.status });
  }
  const vistas = new Set<string>();
  const items: ItemParaContar[] = [];
  for (const c of corridas) {
    for (const cita of citasDeLaSalida(c.output)) {
      const clave = `${c.projectId}|${huellaDeLaSugerencia(cita)}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      items.push({ ...estadoDeSugerenciaDelHandoff(vivas.get(clave) ?? null, c.createdAt, hoyISO), nacioEn: c.createdAt.toISOString() });
    }
  }
  return { "sugerencia-del-handoff": items };
};

/** Las citas de las sugerencias que guardó una corrida de «Buscar lo nuevo» (`SalidaDeSugerencias`). Tolerante. */
function citasDeLaSalida(output: string | null): string[] {
  try {
    const lista = (JSON.parse(output ?? "{}") as { sugerencias?: unknown }).sugerencias;
    if (!Array.isArray(lista)) return [];
    return lista
      .map((x) => (x && typeof x === "object" ? (x as { cita?: unknown }).cita : null))
      .filter((c): c is string => typeof c === "string" && !!huellaDeLaSugerencia(c));
  } catch {
    return [];
  }
}

const LECTORES: readonly Lector[] = [minutas, pedidos, tareas, alertas, camposDeFicha, etapasYFechas, compromisosLegacy, hechos, sugerenciasDelHandoff];

/** Lo propuesto de la ventana, contado por tipo (todos los tipos, aunque salgan en cero). */
export async function contar(o: OpcionesDeConteo): Promise<ConteoDeTipo[]> {
  const ahora = o.ahora ?? new Date();
  const db = o.db ?? prismaDeLaApp;
  const hoyISO = diaCR(ahora);
  const ventana = { desde: o.desde, hasta: o.hasta };
  const partes = await Promise.all(LECTORES.map((l) => l({ ...ventana, ahora, db }, hoyISO)));
  const porTipo = new Map<ClaveDeTipo, ItemParaContar[]>();
  for (const parte of partes) {
    for (const [tipo, items] of Object.entries(parte) as [ClaveDeTipo, ItemParaContar[]][]) {
      porTipo.set(tipo, [...(porTipo.get(tipo) ?? []), ...items]);
    }
  }
  return TIPOS_DE_LO_PROPUESTO.map((tipo) => {
    const items = porTipo.get(tipo);
    return items ? contarTipo(tipo, items, ventana) : conteoVacio(tipo);
  });
}
