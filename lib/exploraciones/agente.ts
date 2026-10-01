/**
 * lib/exploraciones/agente.ts — correr el agente de la exploración. SERVIDOR.
 *
 * Dos momentos: «preparar» (antes de la primera reunión) y «leer» (después de cada una). La
 * corrida queda en `AgentRun` (creada ANTES de llamar a nada: cualquier falla deja su causa) y corre
 * en segundo plano; la pantalla sigue su fase.
 *
 * ⛔ El agente NUNCA escribe lo confirmado: lo único que guarda es `propuesta` (lo propuesto, lo que
 * ya leyó y sus corridas) y la foto de lo leído en `test`. Lo guarda con la fila BLOQUEADA y
 * releída, como el vendedor: así una corrida que leyó antes de un «Descartar» no lo resucita, y la
 * lápida de lo descartado se respeta (fusionarPropuestas).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { estaColgada, MOTIVO_COLGADA } from "@/lib/agents/run-colgada";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import {
  leerLaRespuesta,
  leerLosCasos,
  pedidoDeCasos,
  pedidoDeLaExploracion,
  propuestasDelTest,
  type ContextoDelPedido,
} from "./agente-pedido";
import { claveDelDestino, fusionarPropuestas, propuestaVigente, type ItemPropuesto, type ModoDeLaCorrida } from "./contenido";
import { leerPropuesta } from "./esquemas";
import { leerFuentes } from "./fuentes";
import { debeLeerSola } from "./lectura";
import type { LoLeidoDeHubspot } from "./lo-leido";
import { bloqueParaLaPropuesta } from "./para-la-propuesta";
import { catalogoDeCasosDeUso } from "./propuesta";
import { bloquearFila, chequeoDe, escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion } from "./servidor";

export const AGENTE_DE_LA_EXPLORACION = "exploracion-de-venta";

/** Hasta cuántos días después del alta el agente lee solo las reuniones nuevas. */
export const DIAS_DE_LECTURA_AUTOMATICA = 180;

export type ModoDelAgente = ModoDeLaCorrida;

const ETIQUETA: Record<ModoDelAgente, string> = {
  preparar: "Exploración de venta: preparar",
  leer: "Exploración de venta: leer la reunión",
  casos: "Exploración de venta: sugerir casos de uso",
};

/** Lo que una corrida leyó, para guardarlo con lo propuesto. */
interface LoQueLeyoLaCorrida {
  /** Cómo lo ve el vendedor, para la historia. */
  leyo: string[];
  leidas: { sesiones: string[]; hubspot: string[] };
  /** La foto de HubSpot (el test, la agenda, los correos). null = no leyó HubSpot: queda la anterior. */
  foto: Omit<LoLeidoDeHubspot, "leidoEn"> | null;
}

/** Un fallo con un mensaje que ya está escrito para el vendedor (no hace falta traducirlo). */
class FalloDeLaExploracion extends Error {}

export type ResultadoDeLanzar = { ok: true; runId: string; yaCorria: boolean } | { ok: false; status: number; error: string };

interface OpcionesDeLaCorrida {
  triggeredByEmail: string | null;
  /** Para «leer»: la reunión que hay que leer (la que acaba de llegar). */
  sesionId?: string | null;
  /** La lanzó una reunión nueva, no una persona. */
  automatica?: boolean;
}

/** La última corrida de esta exploración (la pantalla la sigue). */
export async function ultimaCorrida(exploracionId: string, clientId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.agentRun.findFirst({
    where: { clientId, agentSlug: AGENTE_DE_LA_EXPLORACION, filters: { path: ["exploracionId"], equals: exploracionId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, currentPhase: true, createdAt: true, updatedAt: true, output: true, stepLabel: true },
  });
}

export async function lanzarCorrida(exploracionId: string, modo: ModoDelAgente, opts: OpcionesDeLaCorrida): Promise<ResultadoDeLanzar> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: lectura.estado === "no-existe" ? 404 : 503, error: "Esa exploración no existe." };
  if (lectura.fila.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada: el agente ya no trabaja en ella." };
  const clientId = lectura.fila.clientId;

  /* Una corrida a la vez, y la revisión con el alta en la MISMA transacción, con la fila bloqueada:
     dos pedidos juntos (un clic durante la lectura automática, dos reuniones que llegan a la vez) no
     arrancan dos corridas. Una que dice RUNNING pero hace rato que no da señales murió con un
     reinicio (lib/agents/run-colgada.ts): se cierra con su motivo y se lanza otra. */
  const r = await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const ultima = await ultimaCorrida(exploracionId, clientId, tx);
    if (ultima?.status === "RUNNING") {
      if (!estaColgada(ultima)) return { runId: ultima.id, yaCorria: true };
      await tx.agentRun.update({
        where: { id: ultima.id },
        data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: MOTIVO_COLGADA }) },
      });
    }
    const run = await tx.agentRun.create({
      data: {
        agentSlug: AGENTE_DE_LA_EXPLORACION,
        clientId,
        status: "RUNNING",
        stepLabel: ETIQUETA[modo],
        currentPhase: "Empezando…",
        triggeredByEmail: opts.triggeredByEmail,
        filters: { exploracionId, modo, ...(opts.automatica ? { automatica: true } : {}) } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { runId: run.id, yaCorria: false };
  });
  // En segundo plano: la pantalla sigue la fase. Cualquier falla queda en la corrida.
  if (!r.yaCorria) {
    void correr(r.runId, exploracionId, modo, opts).catch((e) => console.error("[exploraciones/agente] la corrida falló fuera de su try", e));
  }
  return { ok: true, ...r };
}

async function fase(runId: string, texto: string) {
  await prisma.agentRun.update({ where: { id: runId }, data: { currentPhase: texto } }).catch(() => {});
}

async function correr(runId: string, exploracionId: string, modo: ModoDelAgente, opts: OpcionesDeLaCorrida) {
  try {
    const escalaVig = await escalaParaExplorar();
    if (escalaVig.estado !== "ok") throw new FalloDeLaExploracion("La escala no está publicada en Nexus: sin ella el agente no puede proponer niveles.");
    const lectura = await leerExploracion(exploracionId);
    if (lectura.estado !== "ok") throw new FalloDeLaExploracion("La exploración ya no existe.");
    const fila = lectura.fila;
    const estado = estadoDesdeFila(fila);
    const escala = escalaDeLaExploracion(escalaVig.general, estado);

    if (modo === "casos") {
      await sugerirCasos(runId, exploracionId, { fila, estado, escala }, opts);
      return;
    }

    await fase(runId, "Leyendo HubSpot y las reuniones…");
    const leido = await leerFuentes({
      clientId: fila.clientId,
      companyId: fila.client.hubspotCompanyId,
      creadaEn: fila.createdAt,
      escala,
      propuesta: estado.propuesta,
      notas: estado.contenido.notas,
      modo,
      sesionId: opts.sesionId,
    });

    const ctx: ContextoDelPedido = {
      modo,
      empresa: fila.client.name,
      industria: fila.client.industry,
      escala,
      areas: estado.areas,
      perfil: estado.perfilCierre && estado.perfilDespues ? `venta ${estado.perfilCierre} · relación ${estado.perfilDespues}` : null,
      contenido: estado.contenido,
      fuentes: leido.fuentes,
    };

    const delTest = propuestasDelTest(leido.tests, ctx, runId);
    let deLaIA: ItemPropuesto[] = [];
    let descartadas = 0;
    const hayQueLeer = modo === "preparar" ? leido.fuentes.length > 0 : leido.fuentes.some((f) => /^[SH]\d/.test(f.id));
    if (hayQueLeer) {
      await fase(runId, "Pensando qué proponer…");
      const respuesta = await conContextoDeIA(
        {
          agentSlug: AGENTE_DE_LA_EXPLORACION,
          agentRunId: runId,
          clientId: fila.clientId,
          triggeredByEmail: opts.triggeredByEmail,
          origen: `exploraciones/agente:${modo}`,
        },
        () => getAnthropic().messages.create(pedidoDeLaExploracion(ctx)),
      );
      const r = leerLaRespuesta(respuesta, ctx, runId);
      deLaIA = r.items;
      descartadas = r.descartadas;
    }

    await fase(runId, "Guardando lo propuesto…");
    const propuestos = await guardar(
      exploracionId,
      [...delTest, ...deLaIA],
      {
        leyo: leido.fuentes.map((f) => f.etiqueta),
        leidas: leido.leidas,
        foto: { tests: leido.tests, agenda: leido.agenda, correosSinPermiso: leido.correosSinPermiso },
      },
      { runId, modo, automatica: opts.automatica === true },
    );
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "DONE",
        currentPhase: null,
        sourceSessionIds: leido.sesionesUsadas,
        output: JSON.stringify({
          propuestos,
          descartadas,
          fuentes: leido.fuentes.length,
          correosSinPermiso: leido.correosSinPermiso,
          nadaNuevo: modo === "leer" && !hayQueLeer,
        }),
      },
    });
  } catch (e) {
    console.error(`[exploraciones/agente] ${modo} ${exploracionId}`, e);
    await prisma.agentRun
      .update({
        where: { id: runId },
        data: {
          status: "ERROR",
          currentPhase: null,
          output: JSON.stringify({
            error: e instanceof FalloDeLaExploracion ? e.message : humanizeAgentError(e),
            raw: e instanceof Error ? e.message : String(e),
          }),
        },
      })
      .catch(() => {});
  }
}

/**
 * Los casos de uso del catálogo que llevan cada área a Funcional (modo «casos»). Lee lo confirmado
 * en el lienzo, como lo verá la propuesta, y el catálogo; no lee HubSpot ni las reuniones.
 */
async function sugerirCasos(
  runId: string,
  exploracionId: string,
  ex: {
    fila: { clientId: string; client: { name: string } };
    estado: ReturnType<typeof estadoDesdeFila>;
    escala: ReturnType<typeof escalaDeLaExploracion>;
  },
  opts: OpcionesDeLaCorrida,
) {
  if (ex.estado.areas.length === 0) throw new FalloDeLaExploracion("Elige primero las áreas en juego: los casos de uso se sugieren por área.");
  await fase(runId, "Leyendo el catálogo…");
  const catalogo = await catalogoDeCasosDeUso();
  if (catalogo.length === 0) throw new FalloDeLaExploracion("El catálogo de casos de uso está vacío: no hay qué sugerir.");
  const ctx = {
    empresa: ex.fila.client.name,
    areas: ex.escala.areas.filter((a) => ex.estado.areas.includes(a.id)).map((a) => ({ id: a.id, nombre: a.nombre })),
    exploracion: bloqueParaLaPropuesta({ estado: ex.estado, escala: ex.escala, chequeo: chequeoDe(ex.escala, ex.estado), conEscala: true }),
    catalogo: catalogo.map((c) => ({ id: c.id, titulo: c.titulo, descripcion: c.descripcion, tags: c.tags })),
  };
  await fase(runId, "Pensando qué casos de uso cubren lo que falta…");
  const respuesta = await conContextoDeIA(
    {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      agentRunId: runId,
      clientId: ex.fila.clientId,
      triggeredByEmail: opts.triggeredByEmail,
      origen: "exploraciones/agente:casos",
    },
    () => getAnthropic().messages.create(pedidoDeCasos(ctx)),
  );
  const r = leerLosCasos(respuesta, ctx, runId);
  await fase(runId, "Guardando lo propuesto…");
  const propuestos = await guardar(
    exploracionId,
    r.items,
    { leyo: ["Lo confirmado en el lienzo", `El catálogo de casos de uso (${catalogo.length})`], leidas: { sesiones: [], hubspot: [] }, foto: null },
    { runId, modo: "casos", automatica: false },
  );
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: "DONE", currentPhase: null, output: JSON.stringify({ propuestos, descartadas: r.descartadas, nadaNuevo: false }) },
  });
}

/** Suma lo propuesto con la fila bloqueada y releída. Devuelve cuántas propuestas nuevas quedaron. */
async function guardar(
  exploracionId: string,
  items: ItemPropuesto[],
  leido: LoQueLeyoLaCorrida,
  corrida: { runId: string; modo: ModoDelAgente; automatica: boolean },
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const fila = await tx.exploracionDeVenta.findUnique({
      where: { id: exploracionId },
      select: {
        contenido: true,
        propuesta: true,
        areas: true,
        edicion: true,
        perfilCierre: true,
        perfilDespues: true,
        responsableEmail: true,
        archivadaEn: true,
      },
    });
    if (!fila) return 0;
    const estado = estadoDesdeFila(fila);
    const antes = new Set(propuestaVigente(estado).map((it) => it.id));
    const fusion = fusionarPropuestas(estado, items);
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])].slice(-500);
    const leidas = {
      sesiones: union(fusion.leidas.sesiones, leido.leidas.sesiones),
      hubspot: union(fusion.leidas.hubspot, leido.leidas.hubspot),
    };
    // Lo que esta corrida dejó pendiente y antes no estaba: es lo que la historia cuenta.
    const nuevas = propuestaVigente({ ...estado, propuesta: { ...fusion, leidas } }).filter((it) => !antes.has(it.id));
    const propuesta = {
      ...fusion,
      leidas,
      corridas: [
        ...fusion.corridas,
        {
          id: corrida.runId,
          modo: corrida.modo,
          en: new Date().toISOString(),
          propuestos: nuevas.length,
          leyo: leido.leyo.map((f) => f.slice(0, 200)).slice(0, 40),
          alimento: [...new Set(nuevas.map((it) => claveDelDestino(it.destino)))].slice(0, 120),
          automatica: corrida.automatica,
        },
      ].slice(-50),
    };
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: {
        propuesta: propuesta as unknown as Prisma.InputJsonValue,
        ...(leido.foto ? { test: { ...leido.foto, leidoEn: new Date().toISOString() } as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    return nuevas.length;
  });
}

/**
 * Llegó la transcripción de una reunión (lib/sessions/post-process.ts): si la empresa tiene una
 * exploración viva y la reunión es de después del alta, de hace a lo sumo dos semanas y nadie la
 * leyó, el agente la lee solo. Solo DISPARA: la corrida va en segundo plano y cobra contra el
 * presupuesto automático (sin persona). Si ya hay una corrida en curso, no lanza otra: la reunión
 * queda avisada como «sin leer».
 */
export async function leerReunionNueva(o: { sesionId: string; fecha: Date; clientId: string }): Promise<"lanzada" | "ya-corre" | "no-corresponde"> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return "no-corresponde";
  const exp = await prisma.exploracionDeVenta.findFirst({
    where: { clientId: o.clientId, archivadaEn: null },
    select: { id: true, createdAt: true, propuesta: true, client: { select: { kind: true } } },
  });
  if (!exp) return "no-corresponde";
  const ahora = new Date();
  /* Lee sola solo MIENTRAS SE VENDE: a un prospecto, dentro de los seis meses del alta y antes de que
     la venta tenga un proyecto. Después, cada reunión de implementación dispararía una corrida (HubSpot
     y Claude) contra el presupuesto automático, para siempre. El botón sigue a mano. */
  if (exp.client.kind !== "PROSPECTO") return "no-corresponde";
  if (ahora.getTime() - exp.createdAt.getTime() > DIAS_DE_LECTURA_AUTOMATICA * 24 * 60 * 60 * 1000) return "no-corresponde";
  const yaHayProyecto = await prisma.project.count({ where: proyectoClasificableWhere({ clientId: o.clientId, createdAt: { gte: exp.createdAt } }) });
  if (yaHayProyecto > 0) return "no-corresponde";
  const leidas = leerPropuesta(exp.propuesta).leidas.sesiones;
  if (!debeLeerSola({ fechaDeLaReunion: o.fecha, creadaEn: exp.createdAt, sesionId: o.sesionId, leidas, ahora })) return "no-corresponde";
  const r = await lanzarCorrida(exp.id, "leer", { triggeredByEmail: null, sesionId: o.sesionId, automatica: true });
  if (!r.ok) return "no-corresponde";
  return r.yaCorria ? "ya-corre" : "lanzada";
}
