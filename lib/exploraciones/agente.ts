/**
 * lib/exploraciones/agente.ts — correr el agente de la exploración. SERVIDOR.
 *
 * Cuatro momentos: «preparar» (antes de la primera reunión), «leer» (después de cada una), «casos»
 * (los casos de uso, en modo experimental) y «guia» (la guía de la próxima reunión, que también se
 * rearma sola al final de cada preparación y de cada lectura). La corrida queda en `AgentRun` (creada ANTES de llamar
 * a nada: cualquier falla deja su causa) y corre en segundo plano; la pantalla sigue su fase.
 *
 * ⛔ El agente PROPONE: lo que guarda es `propuesta` (lo propuesto, lo que ya leyó y sus corridas) y
 * la foto de lo leído en `test`, con la fila BLOQUEADA y releída, como el vendedor: así una corrida
 * que leyó antes de un «Descartar» no lo resucita, y la lápida de lo descartado se respeta.
 *
 * La ÚNICA excepción es lo que la preparación deja hecho sola (pedido de Elías, 2026-10-01: «debería
 * leerse la información de HubSpot para automáticamente seleccionar…»): la industria y su perfil
 * —mientras el vendedor no los haya tocado—, el área del test si no había ninguna y el país y el
 * tamaño de la empresa si estaban vacíos. Son datos de arranque, no conclusiones: se ven con quién
 * los eligió y por qué, y el vendedor los cambia con un clic (`escribirLoQueVaSolo`).
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { estaColgada, MOTIVO_COLGADA } from "@/lib/agents/run-colgada";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import type { Escala } from "@/lib/escala/documento/tipos";
import {
  leerLaIndustria,
  leerLaRespuesta,
  leerLosCasos,
  pedidoDeCasos,
  pedidoDeLaExploracion,
  pedidoDeLaIndustria,
  propuestasDelTest,
  type ContextoDelPedido,
} from "./agente-pedido";
import { exploracionParaLosCasos } from "./casos-de-uso";
import {
  cambioLoConfirmado,
  claveDelDestino,
  destinoValido,
  fusionarPropuestas,
  industriaDelVendedor,
  propuestaVigente,
  type EstadoDeExploracion,
  type ItemPropuesto,
  type ModoDeLaCorrida,
} from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { leerPropuesta } from "./esquemas";
import { leerFuentes, type LoQueSeLeyo } from "./fuentes";
import { debeLeerSola } from "./lectura";
import { hoyEnCostaRica } from "./fechas";
import { contextoDeLaGuia, leerLaGuiaDelAgente, pedidoDeLaGuia } from "./guia-pedido";
import type { GuiaDeLaSesion } from "./guia";
import { leerEmpresa } from "./hubspot";
import { leerLoLeido, type LoLeidoDeHubspot } from "./lo-leido";
import { leerLaRadiografia, pedidoDeLaRadiografia } from "./radiografia-pedido";
import { posicionesDelMapa } from "./mapa";
import {
  bloquearFila,
  datosParaGuardar,
  escalaDeLaExploracion,
  escalaParaExplorar,
  estadoDesdeFila,
  leerExploracion,
  validezPara,
} from "./servidor";

export const AGENTE_DE_LA_EXPLORACION = "exploracion-de-venta";

/** Hasta cuántos días después del alta el agente lee solo las reuniones nuevas. */
export const DIAS_DE_LECTURA_AUTOMATICA = 180;

export type ModoDelAgente = ModoDeLaCorrida;

const ETIQUETA: Record<ModoDelAgente, string> = {
  preparar: "Exploración de venta: preparar",
  leer: "Exploración de venta: leer la reunión",
  casos: "Exploración de venta: proponer casos de uso",
  guia: "Exploración de venta: armar la guía de la próxima reunión",
};

/** Lo que una corrida leyó, para guardarlo con lo propuesto. */
interface LoQueLeyoLaCorrida {
  /** Cómo lo ve el vendedor, para la historia. */
  leyo: string[];
  leidas: { sesiones: string[]; hubspot: string[]; documentos: string[] };
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
  /** Para «leer»: el documento que el vendedor acaba de sumar. */
  documentoId?: string | null;
  /** La lanzó una reunión nueva, no una persona. */
  automatica?: boolean;
}

/** La última corrida de esta exploración (la pantalla la sigue). */
export async function ultimaCorrida(exploracionId: string, clientId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.agentRun.findFirst({
    where: { clientId, agentSlug: AGENTE_DE_LA_EXPLORACION, filters: { path: ["exploracionId"], equals: exploracionId } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, currentPhase: true, createdAt: true, updatedAt: true, output: true, stepLabel: true, filters: true },
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
    let estado = estadoDesdeFila(fila);
    let escala = escalaDeLaExploracion(escalaVig.general, estado);

    if (modo === "casos") {
      await proponerCasos(runId, exploracionId, { fila, estado, escala, general: escalaVig.general }, opts);
      return;
    }
    if (modo === "guia") {
      await fase(runId, "Armando la guía de la próxima reunión…");
      const preguntas = await armarGuia(runId, exploracionId, opts, true);
      await prisma.agentRun.update({
        where: { id: runId },
        data: { status: "DONE", currentPhase: null, output: JSON.stringify({ propuestos: 0, guia: preguntas, nadaNuevo: false }) },
      });
      return;
    }

    await fase(runId, "Leyendo HubSpot y las reuniones…");
    const leido = await leerFuentes({
      exploracionId,
      clientId: fila.clientId,
      companyId: fila.client.hubspotCompanyId,
      creadaEn: fila.createdAt,
      escala,
      propuesta: estado.propuesta,
      notas: estado.contenido.notas,
      modo,
      sesionId: opts.sesionId,
      documentoId: opts.documentoId,
    });

    // Lo que la preparación deja hecho sola; desde ahí, la escala con la industria y el perfil nuevos.
    if (modo === "preparar") {
      const armado = await armarLoQueVaSolo(runId, exploracionId, { fila, estado, escala, general: escalaVig.general, leido }, opts);
      if (armado) {
        estado = armado;
        escala = escalaDeLaExploracion(escalaVig.general, armado);
      }
    }

    const ctx: ContextoDelPedido = {
      modo,
      empresa: fila.client.name,
      industria: fila.client.industry,
      escala,
      areas: estado.areas,
      perfil: estado.perfilCierre && estado.perfilDespues ? `venta ${estado.perfilCierre} · relación ${estado.perfilDespues}` : null,
      contenido: estado.contenido,
      fuentes: leido.fuentes,
      hoy: new Date().toISOString(),
      proxima: leido.agenda[0] ?? null,
    };

    /* Al preparar, primero la radiografía: el agente investiga la empresa en internet. Lo que
       encuentra se propone en su casilla y entra como fuente (W1) para la hipótesis de valor y el
       pitch. Si falla, la preparación sigue sin ella. */
    let deLaWeb: ItemPropuesto[] = [];
    if (modo === "preparar" && fila.client.hubspotCompanyId) {
      await fase(runId, "Investigando la empresa en internet…");
      const r = await investigar(runId, fila, opts).catch((e) => {
        console.error(`[exploraciones/agente] radiografía ${exploracionId}`, e);
        return null;
      });
      if (r?.item) deLaWeb = [r.item];
      if (r?.fuente) {
        leido.fuentes.push(r.fuente);
        ctx.fuentes = leido.fuentes;
      }
    }

    const delTest = propuestasDelTest(leido.tests, ctx, runId);
    let deLaIA: ItemPropuesto[] = [];
    let descartadas = 0;
    const hayQueLeer = modo === "preparar" ? leido.fuentes.length > 0 : leido.fuentes.some((f) => /^[SHM]\d/.test(f.id));
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
      [...deLaWeb, ...delTest, ...deLaIA],
      {
        leyo: leido.fuentes.map((f) => f.etiqueta),
        leidas: leido.leidas,
        foto: { tests: leido.tests, agenda: leido.agenda, correosSinPermiso: leido.correosSinPermiso },
      },
      { runId, modo, automatica: opts.automatica === true },
    );
    /* Con lo nuevo ya guardado, la guía de la próxima reunión se rearma en la misma corrida (la
       pantalla la sigue sola). Si falla, lo propuesto queda igual: la guía de base sigue ahí. */
    await fase(runId, "Armando la guía de la próxima reunión…");
    await armarGuia(runId, exploracionId, opts, false).catch((e) => console.error(`[exploraciones/agente] guía ${exploracionId}`, e));

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

/** Cuántas veces se continúa una respuesta que la búsqueda web dejó en pausa. */
const CONTINUACIONES_DE_LA_BUSQUEDA = 3;

/**
 * La radiografía de la empresa: una llamada con la búsqueda web de Anthropic y nuestra herramienta.
 * Si la búsqueda deja la respuesta en pausa, se continúa con lo que trajo (patrón del SDK).
 */
async function investigar(runId: string, fila: { clientId: string; client: { name: string; industry: string | null; hubspotCompanyId: string | null } }, opts: OpcionesDeLaCorrida) {
  const empresa = fila.client.hubspotCompanyId ? await leerEmpresa(fila.client.hubspotCompanyId) : null;
  const pedido = pedidoDeLaRadiografia({
    empresa: empresa?.nombre ?? fila.client.name,
    dominio: empresa?.dominio ?? null,
    industria: empresa?.industria ?? fila.client.industry,
    pais: empresa?.pais ?? null,
    hoy: hoyEnCostaRica(),
  });
  const contenido: Anthropic.Messages.ContentBlock[] = [];
  const mensajes = [...pedido.messages];
  for (let vuelta = 0; vuelta <= CONTINUACIONES_DE_LA_BUSQUEDA; vuelta++) {
    const respuesta = await conContextoDeIA(
      {
        agentSlug: AGENTE_DE_LA_EXPLORACION,
        agentRunId: runId,
        clientId: fila.clientId,
        triggeredByEmail: opts.triggeredByEmail,
        origen: "exploraciones/agente:radiografia",
      },
      () => getAnthropic().messages.create({ ...pedido, messages: mensajes }),
    );
    contenido.push(...respuesta.content);
    if (respuesta.stop_reason !== "pause_turn") break;
    // El servidor de Anthropic pausó las búsquedas: se reenvía lo que trajo y sigue donde quedó.
    mensajes.push({ role: "assistant", content: respuesta.content as unknown as Anthropic.Messages.ContentBlockParam[] });
  }
  return leerLaRadiografia(contenido, runId);
}

/**
 * Los casos de uso, en modo EXPERIMENTAL: el agente los propone sin la biblioteca (que hoy está
 * vacía), a partir de dónde parece estar cada equipo, lo que le falta y sus metas. Cada tanda no
 * repite lo que ya está ni lo que el vendedor descartó. No lee HubSpot ni las reuniones.
 */
async function proponerCasos(
  runId: string,
  exploracionId: string,
  ex: {
    fila: { clientId: string; client: { name: string } };
    estado: EstadoDeExploracion;
    escala: EscalaDelLienzo;
    general: Escala;
  },
  opts: OpcionesDeLaCorrida,
) {
  if (ex.estado.areas.length === 0) throw new FalloDeLaExploracion("Elige primero las áreas en juego: los casos de uso se proponen por área.");
  await fase(runId, "Mirando dónde está cada equipo…");
  const pendientes = pendientesVigentes(ex.estado, ex.general, ex.escala);
  const ctx = {
    empresa: ex.fila.client.name,
    edicion: ex.escala.edicion?.nombre ?? "escala general",
    areas: ex.escala.areas
      .filter((a) => ex.estado.areas.includes(a.id))
      .map((a) => ({ id: a.id, nombre: a.nombre, dimensiones: a.dimensiones.filter((d) => d.aplica).map((d) => ({ id: d.id, nombre: d.nombre })) })),
    exploracion: exploracionParaLosCasos(ex.estado, ex.escala, pendientes),
    yaEstan: [
      ...Object.values(ex.estado.contenido.casosDeUso).map((c) => c.titulo),
      ...pendientes.filter((it) => it.destino.tipo === "casoDeUso").map((it) => (it.valor as { titulo: string }).titulo),
    ],
    descartados: ex.estado.contenido.casosDescartados,
  };
  await fase(runId, "Pensando casos de uso…");
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
    { leyo: ["Dónde está cada equipo en la escala", "Lo que el cliente contó en las reuniones"], leidas: { sesiones: [], hubspot: [], documentos: [] }, foto: null },
    { runId, modo: "casos", automatica: false },
  );
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: "DONE", currentPhase: null, output: JSON.stringify({ propuestos, descartadas: r.descartadas, nadaNuevo: false }) },
  });
}

/** Las fuentes que bastan para saber qué hace la empresa: la ficha, los contactos, los negocios, el test y la actividad reciente, recortadas. */
function fuentesParaLaIndustria(leido: LoQueSeLeyo) {
  const deLaEmpresa = leido.fuentes.filter((f) => /^(E0|W0|C0|D0|T\d+)$/.test(f.id));
  const actividad = leido.fuentes.filter((f) => /^H\d+$/.test(f.id)).slice(0, 6);
  return [...deLaEmpresa, ...actividad].map((f) => ({ ...f, texto: f.texto.slice(0, 1500) }));
}

/**
 * Lo que la preparación deja hecho SOLA, antes de pensar las hipótesis: la industria (la edición de
 * la escala) y su perfil, mientras el vendedor no los haya tocado; el área del test, si no había
 * ninguna; el país y el tamaño de la empresa, si estaban vacíos. Devuelve el estado nuevo, o null si
 * no cambió nada. Una falla al elegir la industria no frena la preparación: sigue con la que había.
 */
async function armarLoQueVaSolo(
  runId: string,
  exploracionId: string,
  ex: { fila: { clientId: string; client: { name: string } }; estado: EstadoDeExploracion; escala: EscalaDelLienzo; general: Escala; leido: LoQueSeLeyo },
  opts: OpcionesDeLaCorrida,
): Promise<EstadoDeExploracion | null> {
  let industria: Awaited<ReturnType<typeof leerLaIndustria>> = null;
  /* Se pregunta mientras el vendedor no la haya elegido, o si la eligió pero todavía no hay una
     sugerida a la que pueda volver con «Restablecer». */
  const sinSugerida = !ex.estado.contenido.edicionElegida?.sugerida;
  if ((!industriaDelVendedor(ex.estado) || sinSugerida) && ex.general.ediciones.length > 0) {
    await fase(runId, "Eligiendo la industria…");
    const pregunta = (p: EscalaDelLienzo["perfil"]["cierre"]) => (p ? `${p.pregunta}: ${p.opciones.map((o) => `${o.nombre} (${o.definicion})`).join("; ")}` : null);
    const ctx = {
      empresa: ex.fila.client.name,
      ediciones: ex.escala.ediciones,
      perfil: { cierre: pregunta(ex.escala.perfil.cierre), despues: pregunta(ex.escala.perfil.despues) },
      fuentes: fuentesParaLaIndustria(ex.leido),
    };
    if (ctx.fuentes.length > 0) {
      try {
        const respuesta = await conContextoDeIA(
          {
            agentSlug: AGENTE_DE_LA_EXPLORACION,
            agentRunId: runId,
            clientId: ex.fila.clientId,
            triggeredByEmail: opts.triggeredByEmail,
            origen: "exploraciones/agente:industria",
          },
          () => getAnthropic().messages.create(pedidoDeLaIndustria(ctx)),
        );
        industria = leerLaIndustria(respuesta, ctx);
      } catch (e) {
        console.error(`[exploraciones/agente] no se pudo elegir la industria de ${exploracionId}`, e);
      }
    }
  }

  const habituales = Object.fromEntries(ex.general.ediciones.map((e) => [e.slug, e.perfilHabitual]));
  const areasDelTest = [...new Set(ex.leido.tests.map((t) => t.resultado.areaId))].filter((id) => ex.general.areas.some((a) => a.id === id));
  const nombreDeArea = (id: string) => ex.escala.areas.find((a) => a.id === id)?.nombre ?? id;

  return escribirLoQueVaSolo(exploracionId, (actual) => {
    let e = actual;
    // Se vuelve a mirar con la fila bloqueada: si el vendedor eligió mientras tanto, manda lo suyo.
    if (industria) {
      const perfil = industria.edicion ? habituales[industria.edicion] : industria.perfil;
      const sugerida = {
        edicion: industria.edicion,
        cierre: perfil?.cierre ?? null,
        despues: perfil?.despues ?? null,
        por: "agente" as const,
        ...(industria.razon ? { razon: industria.razon } : {}),
      };
      e = industriaDelVendedor(e)
        ? // La eligió el vendedor: no se toca, pero queda la sugerida para poder volver a ella.
          { ...e, contenido: { ...e.contenido, edicionElegida: { por: "vendedor", sugerida } } }
        : {
            ...e,
            edicion: industria.edicion,
            ...(perfil ? { perfilCierre: perfil.cierre, perfilDespues: perfil.despues } : {}),
            contenido: { ...e.contenido, edicionElegida: { por: "agente", razon: industria.razon, sugerida } },
          };
    }
    if (e.areas.length === 0 && areasDelTest.length > 0) {
      e = {
        ...e,
        areas: areasDelTest,
        contenido: {
          ...e.contenido,
          razonesDeAreas: { ...Object.fromEntries(areasDelTest.map((id) => [id, `Hizo el test de ${nombreDeArea(id)}`])), ...e.contenido.razonesDeAreas },
        },
      };
    }
    const m = e.contenido.medicion;
    const pais = !m.pais && ex.leido.empresa?.pais ? ex.leido.empresa.pais.slice(0, 80) : null;
    const personas = !m.personasEmpresa && ex.leido.empresa?.empleados ? ex.leido.empresa.empleados.slice(0, 40) : null;
    if (pais || personas) {
      e = { ...e, contenido: { ...e.contenido, medicion: { ...m, ...(pais ? { pais } : {}), ...(personas ? { personasEmpresa: personas } : {}) } } };
    }
    return e;
  }, ex.general);
}

/**
 * Escribe lo que va solo con la fila BLOQUEADA y releída, y sube la versión (es un cambio de lo
 * confirmado: si el vendedor tenía la pantalla abierta, su próximo cambio recarga en vez de pisar).
 * Lo pendiente que quedó sin dónde ir con la industria nueva se cuenta como inválido en la pantalla,
 * como siempre (`destinoValido`).
 */
async function escribirLoQueVaSolo(
  exploracionId: string,
  cambio: (e: EstadoDeExploracion) => EstadoDeExploracion,
  general: Escala,
): Promise<EstadoDeExploracion | null> {
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
    if (!fila || fila.archivadaEn) return null;
    const antes = estadoDesdeFila(fila);
    const despues = cambio(antes);
    if (!cambioLoConfirmado(antes, despues)) return null;
    // Una edición que la escala publicada ya no trae no se escribe (la lista cerrada del pedido lo evita; esto lo asegura).
    if (despues.edicion !== null && !general.ediciones.some((e) => e.slug === despues.edicion)) return null;
    await tx.exploracionDeVenta.update({ where: { id: exploracionId }, data: { ...datosParaGuardar(despues), version: { increment: 1 } } });
    return despues;
  });
}

/**
 * La guía de la PRÓXIMA reunión (lib/exploraciones/guia.ts): el código elige qué cubre (las tarjetas
 * vacías del resumen y hasta 4 dimensiones sin evidencia) y el agente escribe las preguntas, las
 * repreguntas y las objeciones. Lee la exploración de nuevo: corre después de guardar lo propuesto.
 * Devuelve cuántas preguntas armó (0 si el agente no devolvió nada que sirva: queda la de base).
 */
async function armarGuia(runId: string, exploracionId: string, opts: OpcionesDeLaCorrida, registrar: boolean): Promise<number> {
  const escalaVig = await escalaParaExplorar();
  if (escalaVig.estado !== "ok") throw new FalloDeLaExploracion("La escala no está publicada en Nexus.");
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") throw new FalloDeLaExploracion("La exploración ya no existe.");
  const fila = lectura.fila;
  const estado = estadoDesdeFila(fila);
  const escala = escalaDeLaExploracion(escalaVig.general, estado);
  const pendientes = pendientesVigentes(estado, escalaVig.general, escala);
  const loLeido = leerLoLeido(fila.test);
  const ahora = new Date();
  const ctx = contextoDeLaGuia({
    empresa: fila.client.name,
    industria: fila.client.industry,
    estado,
    escala,
    posiciones: posicionesDelMapa(estado, pendientes),
    pendientes,
    agenda: loLeido.agenda.filter((a) => Date.parse(a.inicio) > ahora.getTime()),
    conTest: loLeido.tests.length > 0,
    hoy: hoyEnCostaRica(ahora),
  });
  const respuesta = await conContextoDeIA(
    {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      agentRunId: runId,
      clientId: fila.clientId,
      triggeredByEmail: opts.triggeredByEmail,
      origen: "exploraciones/agente:guia",
    },
    () => getAnthropic().messages.create(pedidoDeLaGuia(ctx)),
  );
  const guia = leerLaGuiaDelAgente(respuesta, ctx, runId, ahora);
  if (!guia) return 0;
  await guardarGuia(exploracionId, guia, registrar ? { runId, automatica: opts.automatica === true } : null);
  return guia.preguntas.length;
}

/** Guarda la guía con la fila bloqueada (solo la mitad del agente: lo confirmado no se toca). */
async function guardarGuia(exploracionId: string, guia: GuiaDeLaSesion, corrida: { runId: string; automatica: boolean } | null) {
  await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const fila = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { propuesta: true } });
    if (!fila) return;
    const actual = leerPropuesta(fila.propuesta);
    const propuesta = {
      ...actual,
      guia,
      corridas: corrida
        ? [
            ...actual.corridas,
            { id: corrida.runId, modo: "guia" as const, en: new Date().toISOString(), propuestos: 0, leyo: ["Lo que falta del resumen", "Dónde parece estar cada equipo"], alimento: [], automatica: corrida.automatica },
          ].slice(-50)
        : actual.corridas,
    };
    await tx.exploracionDeVenta.update({ where: { id: exploracionId }, data: { propuesta: propuesta as unknown as Prisma.InputJsonValue } });
  });
}

/** Lo pendiente que sigue teniendo dónde ir con la escala de la exploración. */
function pendientesVigentes(estado: EstadoDeExploracion, general: Escala, escala: EscalaDelLienzo): ItemPropuesto[] {
  const validez = validezPara(general, escala);
  return propuestaVigente(estado).filter((it) => destinoValido(it.destino, validez));
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
      documentos: union(fusion.leidas.documentos, leido.leidas.documentos ?? []),
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
