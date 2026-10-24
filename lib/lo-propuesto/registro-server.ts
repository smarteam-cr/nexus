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
import { decisionesDeLasPropuestas, type FilaDePresentacion } from "@/lib/presentaciones/reglas";
import { huellaDeLaSugerencia, sugerenciaDelBloque } from "@/lib/handoff/sugerencias";
import { sugerenciaVigente } from "@/lib/projects/etapa-sugerida";
import { resolvePipeline } from "@/lib/projects/kind";
import { DESTINOS, destinoPorClave } from "@/lib/seguimiento/destinos";
import { leerDestinos } from "@/lib/seguimiento/hechos/estado";
import { notaSugeridaDeLaMinuta, reunionConNotaSugerida, textosDeLaMinuta } from "@/lib/notas/reglas";
import { itemsParaContar as recomendacionesDeRecurrencia } from "@/lib/servicios/recurrencia-server";
import {
  diaCR,
  estadoDeAlerta,
  estadoDeCampoPendiente,
  estadoDeDecisionDeCampo,
  estadoDeDestinoDeHecho,
  estadoDeEtapa,
  estadoDeFechaDecidida,
  estadoDeMinuta,
  estadoDeNotaParaHubspot,
  estadoDePedido,
  estadoDePropuestaDeFecha,
  estadoDeSugerenciaDelHandoff,
  estadoDeTarea,
  vencioSinRevisar,
} from "./ciclo";
import { ETIQUETA_DE_LA_RECUPERACION } from "@/lib/lecturas/reglas";
import { contarTipo, conteoVacio, type ConteoDeTipo, type ItemParaContar, type Ventana } from "./conteo";
import { PLAZO_PARA_REVISAR_DIAS, TIPOS_DE_LO_PROPUESTO, type ClaveDeTipo } from "./tipos";

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

/**
 * Sin las minutas de la RECUPERACIÓN (T2: reuniones de hace meses, leídas por lote): no nacieron de una reunión de hoy.
 * Contarlas llenaría «Minuta de la reunión» y «Nota para HubSpot» de pendientes y vencidas que nadie tenía que revisar.
 * Se reconocen por la etiqueta de su corrida (`ETIQUETA_DE_LA_RECUPERACION`).
 */
export async function sinLasRecuperadas<T extends { generatedByAgentRunId: string | null }>(db: Pick<PrismaClient, "agentRun">, minutas: T[]): Promise<T[]> {
  const corridas = [...new Set(minutas.map((m) => m.generatedByAgentRunId).filter((x): x is string => !!x))];
  if (!corridas.length) return minutas;
  const recuperadas = new Set(
    (await db.agentRun.findMany({ where: { id: { in: corridas }, stepLabel: ETIQUETA_DE_LA_RECUPERACION }, select: { id: true } })).map((r) => r.id),
  );
  return minutas.filter((m) => !m.generatedByAgentRunId || !recuperadas.has(m.generatedByAgentRunId));
}

const minutas: Lector = async ({ db, ...v }, hoyISO) => {
  const todas = await db.sessionMinute.findMany({
    where: { OR: [{ createdAt: rango(v) }, { reviewedAt: rango(v) }] },
    select: {
      status: true,
      reviewedByEmail: true,
      reviewedAt: true,
      createdAt: true,
      generatedByAgentRunId: true,
      session: { select: { resolvedClientId: true, manualClientId: true } },
    },
  });
  const filas = await sinLasRecuperadas(db, todas);
  return {
    minuta: filas.map((m) => ({
      ...estadoDeMinuta(m, hoyISO),
      nacioEn: m.createdAt.toISOString(),
      clientId: m.session.resolvedClientId ?? m.session.manualClientId,
    })),
  };
};

const pedidos: Lector = async ({ db, ...v }, hoyISO) => {
  const filas = await seguro(
    db.pedidoFueraDeAlcance.findMany({
      where: { creadoPor: null, OR: [{ createdAt: rango(v) }, { decididoAt: rango(v) }] },
      select: { estado: true, decididoPor: true, decididoAt: true, creadoPor: true, createdAt: true, clientId: true },
    }),
    [],
  );
  return {
    "pedido-fuera-de-alcance": filas.flatMap((p) => {
      const e = estadoDePedido(p, hoyISO);
      return e ? [{ ...e, nacioEn: p.createdAt.toISOString(), clientId: p.clientId }] : [];
    }),
  };
};

const tareas: Lector = async ({ db, ...v }) => {
  const filas = await seguro(
    db.tarea.findMany({
      where: {
        origen: { in: ["reunion", "notas", "chat", "correo"] },
        AND: [
          { OR: [{ decision: { not: null } }, { estado: { in: ["propuesta", "vencida"] } }] },
          { OR: [{ createdAt: rango(v) }, { decididaAt: rango(v) }] },
        ],
      },
      select: { estado: true, decision: true, decididaPorEmail: true, decididaAt: true, createdAt: true, clientId: true, origen: true },
    }),
    [],
  );
  return {
    "tarea-propuesta": filas.flatMap((t) => {
      const e = estadoDeTarea(t);
      return e ? [{ ...e, nacioEn: t.createdAt.toISOString(), clientId: t.clientId, fuente: t.origen }] : [];
    }),
  };
};

const alertas: Lector = async ({ db, ...v }) => {
  const filas = await db.csAlert.findMany({
    where: { OR: [{ createdAt: rango(v) }, { resolvedAt: rango(v) }] },
    select: { status: true, resolvedByEmail: true, resolvedAt: true, createdAt: true, agentRunId: true, clientId: true },
  });
  const vigia: ItemParaContar[] = [];
  const regla: ItemParaContar[] = [];
  for (const a of filas) {
    (a.agentRunId ? vigia : regla).push({ ...estadoDeAlerta(a), nacioEn: a.createdAt.toISOString(), clientId: a.clientId });
  }
  return { "alerta-del-vigia": vigia, "alerta-de-regla": regla };
};

const camposDeFicha: Lector = async ({ db }, hoyISO) => {
  const filas = await db.client.findMany({ where: { ficha: { not: Prisma.DbNull } }, select: { id: true, ficha: true } });
  const items: ItemParaContar[] = [];
  for (const f of filas) {
    const ficha = leerFicha(f.ficha);
    const at = ficha.propuesta?.at;
    const propuestos = at ? camposPropuestos(ficha).length : 0;
    for (let i = 0; i < propuestos; i++) items.push({ ...estadoDeCampoPendiente(at!, hoyISO), nacioEn: at!, clientId: f.id });
    for (const d of ficha.decisiones ?? []) items.push({ ...estadoDeDecisionDeCampo(d), nacioEn: d.propuestaAt ?? d.en, clientId: f.id });
  }
  return { "campo-de-ficha": items };
};

const etapasYFechas: Lector = async ({ db }, hoyISO) => {
  const [filas, presentaciones] = await Promise.all([
    seguro(
      db.project.findMany({
        where: { etapaPropuestaStageId: { not: null } },
        select: {
          clientId: true,
          hubspotPipelineId: true,
          hubspotPipelineStageId: true,
          etapaPropuestaStageId: true,
          etapaPropuestaMotivo: true,
          etapaPropuestaAt: true,
        },
      }),
      [],
    ),
    // La fecha de presentación del diagnóstico que leyó Nexus en una reunión, y qué hizo una persona con ella
    // (lib/presentaciones, 2026-10-14: una fila por respuesta, así se sabe quién la usó o la descartó).
    modeloDisponible(db.presentacionDeDocumento)
      ? seguro(
          db.presentacionDeDocumento.findMany({
            where: { documento: "diagnostico", evento: { in: ["propuesta", "fecha", "descarte"] } },
            select: { projectId: true, evento: true, fecha: true, porEmail: true, sessionId: true, detalle: true, createdAt: true },
          }),
          [],
        )
      : Promise.resolve([]),
  ]);
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
    if (s?.at) etapa.push({ ...estadoDeEtapa(s.at, hoyISO), nacioEn: s.at, clientId: p.clientId });
  }
  const porProyecto = new Map<string, FilaDePresentacion[]>();
  for (const f of presentaciones) {
    if (!f.projectId) continue;
    porProyecto.set(f.projectId, [...(porProyecto.get(f.projectId) ?? []), f]);
  }
  const clienteDelProyecto = new Map<string, string>(
    porProyecto.size
      ? (await db.project.findMany({ where: { id: { in: [...porProyecto.keys()] } }, select: { id: true, clientId: true } })).map(
          (p) => [p.id, p.clientId] as [string, string],
        )
      : [],
  );
  for (const [projectId, filasDelProyecto] of porProyecto) {
    const clientId = clienteDelProyecto.get(projectId) ?? null;
    for (const d of decisionesDeLasPropuestas(filasDelProyecto)) {
      if (d.estado === "pendiente") fecha.push({ ...estadoDePropuestaDeFecha(d.nacioEn, hoyISO), nacioEn: d.nacioEn, clientId });
      else {
        fecha.push({
          ...estadoDeFechaDecidida({ usada: d.estado === "usado", por: d.por ?? "", en: d.en ?? d.nacioEn }),
          nacioEn: d.nacioEn,
          clientId,
        });
      }
    }
  }
  return { "etapa-sugerida": etapa, "fecha-del-diagnostico": fecha };
};

/** DEPRECATED — etapa 2: Tarea. Los compromisos que dejó la lectura de una reunión. No guardan quién ni cuándo. */
const compromisosLegacy: Lector = async ({ db, ...v }, hoyISO) => {
  const filas = await db.actionItem.findMany({
    where: { source: { startsWith: "agent:" }, createdAt: rango(v) },
    select: { done: true, status: true, deletedAt: true, createdAt: true, updatedAt: true, clientId: true },
  });
  return {
    "compromiso-legacy": filas.map((a): ItemParaContar => {
      const nacioEn = a.createdAt.toISOString();
      const clientId = a.clientId;
      if (a.done || a.status === "DONE") return { estado: "usado", sinFirma: true, decididoPor: null, decididoEn: iso(a.updatedAt), nacioEn, clientId };
      if (a.deletedAt) return { estado: "desestimado", sinFirma: true, decididoPor: null, decididoEn: iso(a.deletedAt), nacioEn, clientId };
      return {
        estado: vencioSinRevisar(a.createdAt, hoyISO) ? "vencido" : "pendiente",
        sinFirma: false,
        decididoPor: null,
        decididoEn: null,
        nacioEn,
        clientId,
      };
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
      select: { tipo: true, citaFuente: true, destinos: true, createdAt: true, clientId: true },
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
      (esProcesos ? hecho : novedad).push({ ...e, nacioEn: h.createdAt.toISOString(), clientId: h.clientId });
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
    select: { id: true, projectId: true, clientId: true, createdAt: true, output: true },
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
      items.push({
        ...estadoDeSugerenciaDelHandoff(vivas.get(clave) ?? null, c.createdAt, hoyISO),
        nacioEn: c.createdAt.toISOString(),
        clientId: c.clientId,
      });
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

/**
 * La nota para HubSpot de cada reunión (etapa 5 de docs/mi-dia-plan.md). Nace con la reunión: una por cada reunión con
 * un cliente o un prospecto, desde que salió la función, cuya minuta dice algo. Decidida = una fila de `NotaDeLaCuenta`
 * con origen «reunion» (usada o descartada, con quién y cuándo).
 */
const notasParaHubspot: Lector = async ({ db, ahora, ...v }, hoyISO) => {
  const decididas = await seguro(
    db.notaDeLaCuenta.findMany({
      where: { origen: "reunion", OR: [{ createdAt: rango(v) }, { session: { date: rango(v) } }] },
      select: { estado: true, autorEmail: true, createdAt: true, sessionId: true, clientId: true, session: { select: { date: true } } },
    }),
    [],
  );
  const porReunion = new Map(decididas.filter((d) => d.sessionId).map((d) => [d.sessionId!, d]));
  const minutasDeLaVentana = await sinLasRecuperadas(
    db,
    await db.sessionMinute.findMany({
      where: { session: { date: { gte: v.desde, lt: v.hasta, lte: ahora } } },
      select: {
        sessionId: true,
        summary: true,
        agreements: true,
        decisions: true,
        generatedByAgentRunId: true,
        session: { select: { title: true, date: true, resolvedClientId: true, manualClientId: true } },
      },
    }),
  );
  const duenos = [...new Set(minutasDeLaVentana.map((m) => m.session.resolvedClientId ?? m.session.manualClientId).filter((x): x is string => !!x))];
  const clientes = duenos.length ? await db.client.findMany({ where: { id: { in: duenos }, kind: { in: ["CLIENTE", "PROSPECTO"] } }, select: { id: true } }) : [];
  const conTarjeta = new Set(clientes.map((c) => c.id));

  const items: ItemParaContar[] = [];
  const vistas = new Set<string>();
  for (const m of minutasDeLaVentana) {
    const dueno = m.session.resolvedClientId ?? m.session.manualClientId;
    const dia = diaCR(m.session.date);
    if (!dueno || !conTarjeta.has(dueno) || !reunionConNotaSugerida(dia)) continue;
    const decision = porReunion.get(m.sessionId);
    const sugerida = notaSugeridaDeLaMinuta({
      titulo: m.session.title,
      fecha: dia,
      resumen: m.summary,
      acuerdos: textosDeLaMinuta(m.agreements),
      decisiones: textosDeLaMinuta(m.decisions),
    });
    if (!sugerida && !decision) continue;
    vistas.add(m.sessionId);
    items.push({
      ...estadoDeNotaParaHubspot(
        decision ? { estado: decision.estado === "descartada" ? "descartada" : "usada", por: decision.autorEmail, en: decision.createdAt } : null,
        m.session.date,
        hoyISO,
      ),
      nacioEn: m.session.date.toISOString(),
      clientId: dueno,
    });
  }
  // Lo decidido en la ventana de una reunión de antes.
  for (const d of decididas) {
    if (!d.sessionId || vistas.has(d.sessionId) || !d.session) continue;
    items.push({
      ...estadoDeNotaParaHubspot({ estado: d.estado === "descartada" ? "descartada" : "usada", por: d.autorEmail, en: d.createdAt }, d.session.date, hoyISO),
      nacioEn: d.session.date.toISOString(),
      clientId: d.clientId,
    });
  }
  return { "nota-para-hubspot": items };
};

/**
 * La recomendación de pasar un servicio temporal a SmartLoop (etapa 6 de docs/smartloop-plan.md). Nace el día que el
 * proyecto llegó a su entrega (o cerró); decidida = una fila de `RecomendacionDeRecurrencia`, con quién y cuándo.
 */
const recurrencia: Lector = async ({ db, desde, hasta }, hoyISO) => ({
  "recomendacion-de-recurrencia": await seguro(recomendacionesDeRecurrencia(db, { desde, hasta }, hoyISO), []),
});

/**
 * Lo que propone la lectura de los números de Rentabilidad (iniciativa C, 2026-10-18; lib/rentabilidad/lectura): nace
 * cuando corre la lectura y la decide dirección (usar o desestimar, con quién y cuándo). Vence a los 30 días.
 */
const lecturaDeRentabilidad: Lector = async ({ db, ...v }) => {
  if (!modeloDisponible(db.propuestaDeRentabilidad)) return {};
  const filas = await seguro(
    db.propuestaDeRentabilidad.findMany({
      where: { OR: [{ createdAt: rango(v) }, { decididaAt: rango(v) }] },
      select: { estado: true, decididaPor: true, decididaAt: true, createdAt: true, clientId: true },
    }),
    [],
  );
  return {
    "lectura-de-rentabilidad": filas.map((f) => {
      const decidida = f.estado === "usado" || f.estado === "desestimado";
      const vencida = !decidida && v.ahora.getTime() - f.createdAt.getTime() > PLAZO_PARA_REVISAR_DIAS * 86_400_000;
      return {
        estado: decidida ? (f.estado as "usado" | "desestimado") : vencida ? "vencido" : "pendiente",
        sinFirma: decidida && !f.decididaPor,
        decididoPor: decidida ? f.decididaPor : null,
        decididoEn: decidida ? iso(f.decididaAt) : null,
        nacioEn: f.createdAt.toISOString(),
        clientId: f.clientId,
      };
    }),
  };
};

const LECTORES: readonly Lector[] = [minutas, pedidos, tareas, alertas, camposDeFicha, etapasYFechas, compromisosLegacy, hechos, sugerenciasDelHandoff, notasParaHubspot, recurrencia, lecturaDeRentabilidad];

/**
 * Cada propuesta de la ventana con su estado, por tipo: lo NACIDO en ella y lo DECIDIDO en ella de algo anterior. Lo
 * leen `contar` y las cuentas por cliente, por equipo y por proceso de «Uso de Nexus» (lib/lo-propuesto/uso-server.ts):
 * una sola lectura de la base sirve para todas.
 */
export async function itemsDeLoPropuesto(o: OpcionesDeConteo): Promise<Map<ClaveDeTipo, ItemParaContar[]>> {
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
  return porTipo;
}

/** Cuenta los items ya leídos, por tipo (todos los tipos, aunque salgan en cero). PURO. */
export function contarItems(porTipo: ReadonlyMap<ClaveDeTipo, readonly ItemParaContar[]>, ventana: Ventana): ConteoDeTipo[] {
  return TIPOS_DE_LO_PROPUESTO.map((tipo) => {
    const items = porTipo.get(tipo);
    return items ? contarTipo(tipo, items, ventana) : conteoVacio(tipo);
  });
}

/** Lo propuesto de la ventana, contado por tipo (todos los tipos, aunque salgan en cero). */
export async function contar(o: OpcionesDeConteo): Promise<ConteoDeTipo[]> {
  return contarItems(await itemsDeLoPropuesto(o), { desde: o.desde, hasta: o.hasta });
}
