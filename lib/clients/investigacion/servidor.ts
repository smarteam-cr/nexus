/**
 * lib/clients/investigacion/servidor.ts — investigar la empresa, guardarlo en la empresa y leerlo de ahí (R5). SERVIDOR.
 *
 * `lanzarInvestigacion` abre la corrida (una a la vez por empresa; una colgada se cierra y se lanza otra) y la corre en
 * segundo plano: la pantalla sigue su fase por `AgentRun.currentPhase`. Al terminar guarda la investigación en
 * `InvestigacionDeEmpresa` y pasa lo que encontró de los datos de la empresa por la regla de quién manda (fuente
 * `investigacion`, con la cita y el enlace; lib/clients/datos-de-la-empresa.ts): llena lo vacío de lo que manda HubSpot y
 * deja lo demás como propuesta para la persona. El tamaño estimado cuenta como los empleados si la investigación no los
 * mandó aparte.
 *
 * El gasto queda atribuido (`conContextoDeIA`, agente `investigacion-de-empresa`). Decisión: DECISIONS › «Los datos de la
 * empresa» (punto 8).
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { estaColgada, MOTIVO_COLGADA } from "@/lib/agents/run-colgada";
import { leerEmpresa } from "@/lib/exploraciones/hubspot";
import { hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { proponerDato, type ResultadoDelDato } from "../datos-de-la-empresa-server";
import { escribirEnHubspot } from "../escritura-en-hubspot-server";
import { fechaParaHubspot } from "@/lib/hubspot/empresa";
import { AGENTE_DE_LA_INVESTIGACION, leerLaInvestigacion, pedidoDeLaInvestigacion, venceLaInvestigacion, type LecturaDeLaInvestigacion } from "./pedido";

/** Cuántas veces se continúa una respuesta que la búsqueda web dejó en pausa (patrón del SDK, como la radiografía). */
const CONTINUACIONES = 3;

export interface InvestigacionGuardada {
  id: string;
  hechaAt: Date;
  venceAt: Date;
  vencida: boolean;
  origen: string;
  resumen: string | null;
  contenido: LecturaDeLaInvestigacion["contenido"];
  fuentes: { url: string }[];
  contrataciones: LecturaDeLaInvestigacion["contrataciones"];
  tamanoEstimado: LecturaDeLaInvestigacion["tamanoEstimado"];
}

/** La última investigación de la empresa, o null. */
export async function ultimaInvestigacion(clientId: string, ahora = new Date()): Promise<InvestigacionGuardada | null> {
  const f = await prisma.investigacionDeEmpresa.findFirst({ where: { clientId }, orderBy: { hechaAt: "desc" } });
  if (!f) return null;
  return {
    id: f.id,
    hechaAt: f.hechaAt,
    venceAt: f.venceAt,
    vencida: f.venceAt.getTime() <= ahora.getTime(),
    origen: f.origen,
    resumen: f.resumen,
    contenido: (f.contenido ?? {}) as LecturaDeLaInvestigacion["contenido"],
    fuentes: Array.isArray(f.fuentes) ? (f.fuentes as { url: string }[]) : [],
    contrataciones: Array.isArray(f.contrataciones) ? (f.contrataciones as LecturaDeLaInvestigacion["contrataciones"]) : [],
    tamanoEstimado: (f.tamanoEstimado ?? null) as LecturaDeLaInvestigacion["tamanoEstimado"],
  };
}

/**
 * La corrida en curso o la última de la empresa (para que la pantalla siga la fase). Una que dice «corriendo» pero hace
 * rato que no da señales murió con un reinicio (lib/agents/run-colgada.ts): se muestra como fallada, con su motivo, para
 * que la pantalla deje de esperarla y ofrezca lanzarla otra vez (`lanzarInvestigacion` la cierra en la base).
 */
export async function corridaDeLaInvestigacion(clientId: string) {
  const c = await prisma.agentRun.findFirst({
    where: { clientId, agentSlug: AGENTE_DE_LA_INVESTIGACION },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, currentPhase: true, output: true, createdAt: true, updatedAt: true },
  });
  if (c && estaColgada(c)) return { ...c, status: "ERROR" as const, currentPhase: null, output: JSON.stringify({ error: MOTIVO_COLGADA }) };
  return c;
}

export type ResultadoDeLanzar = { ok: true; runId: string; yaCorria: boolean } | { ok: false; status: 404; error: string };

export async function lanzarInvestigacion(clientId: string, opts: { triggeredByEmail: string | null }): Promise<ResultadoDeLanzar> {
  const r = await prisma.$transaction(async (tx) => {
    // La fila de la empresa bloqueada: dos clics a la vez no arrancan dos corridas.
    const filas = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Client" WHERE "id" = ${clientId} FOR UPDATE`;
    if (filas.length === 0) return null;
    const ultima = await tx.agentRun.findFirst({
      where: { clientId, agentSlug: AGENTE_DE_LA_INVESTIGACION },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, updatedAt: true },
    });
    if (ultima && (ultima.status === "RUNNING" || ultima.status === "PENDING")) {
      if (!estaColgada(ultima)) return { runId: ultima.id, yaCorria: true };
      await tx.agentRun.update({ where: { id: ultima.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: MOTIVO_COLGADA }) } });
    }
    const run = await tx.agentRun.create({
      data: {
        agentSlug: AGENTE_DE_LA_INVESTIGACION,
        clientId,
        status: "RUNNING",
        stepLabel: "Investigar la empresa",
        currentPhase: "Empezando…",
        triggeredByEmail: opts.triggeredByEmail,
      },
      select: { id: true },
    });
    return { runId: run.id, yaCorria: false };
  });
  if (!r) return { ok: false, status: 404, error: "La empresa no existe." };
  if (!r.yaCorria) void correr(r.runId, clientId, opts).catch((e) => console.error("[investigacion] la corrida falló fuera de su try", e));
  return { ok: true, ...r };
}

async function fase(runId: string, texto: string) {
  await prisma.agentRun.update({ where: { id: runId }, data: { currentPhase: texto } }).catch(() => {});
}

async function correr(runId: string, clientId: string, opts: { triggeredByEmail: string | null }) {
  try {
    const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, industry: true, hubspotCompanyId: true, pais: true, sitioWeb: true } });
    if (!cliente) throw new FalloDeLaInvestigacion("La empresa ya no existe.");
    await fase(runId, "Leyendo la empresa en HubSpot…");
    const empresa = cliente.hubspotCompanyId ? await leerEmpresa(cliente.hubspotCompanyId).catch(() => null) : null;
    const pedido = pedidoDeLaInvestigacion({
      empresa: empresa?.nombre ?? cliente.name,
      dominio: empresa?.dominio ?? cliente.sitioWeb,
      industria: empresa?.industria ?? cliente.industry,
      pais: empresa?.pais ?? cliente.pais,
      hoy: hoyEnCostaRica(),
    });

    await fase(runId, "Buscando su sitio, noticias, contrataciones y tamaño…");
    const contenido: Anthropic.Messages.ContentBlock[] = [];
    const mensajes = [...pedido.messages];
    for (let vuelta = 0; vuelta <= CONTINUACIONES; vuelta++) {
      const respuesta = await conContextoDeIA(
        { agentSlug: AGENTE_DE_LA_INVESTIGACION, agentRunId: runId, clientId, triggeredByEmail: opts.triggeredByEmail, origen: "clients/investigacion" },
        () => getAnthropic().messages.create({ ...pedido, messages: mensajes }),
      );
      contenido.push(...respuesta.content);
      if (respuesta.stop_reason !== "pause_turn") break;
      mensajes.push({ role: "assistant", content: respuesta.content as unknown as Anthropic.Messages.ContentBlockParam[] });
    }
    const lectura = leerLaInvestigacion(contenido);
    // Sin nada que guardar (cortada, o no encontró nada con su enlace), no se guarda: taparía la anterior con una vacía.
    if (!lectura || !tieneContenido(lectura)) throw new FalloDeLaInvestigacion("No encontró nada de esta empresa con sus fuentes. La investigación anterior queda como estaba.");

    await fase(runId, "Guardando lo que encontró…");
    const hechaAt = new Date();
    const guardada = await prisma.investigacionDeEmpresa.create({
      data: {
        clientId,
        hechaAt,
        venceAt: venceLaInvestigacion(hechaAt),
        origen: "actualizar",
        agentRunId: runId,
        resumen: lectura.resumen,
        contenido: lectura.contenido as Prisma.InputJsonValue,
        fuentes: lectura.fuentes as Prisma.InputJsonValue,
        contrataciones: lectura.contrataciones as Prisma.InputJsonValue,
        ...(lectura.tamanoEstimado ? { tamanoEstimado: lectura.tamanoEstimado as Prisma.InputJsonValue } : {}),
      },
      select: { id: true },
    });

    const resultados: ResultadoDelDato[] = [];
    const propuestas = await proponerLoEncontrado(clientId, lectura, resultados);
    // A HubSpot (R2, con la bandera): lo que llenó (solo lo vacío de lo que manda HubSpot) y la fecha de la investigación.
    await escribirEnHubspot(clientId, resultados, { extras: [{ propiedad: "nexus_investigacion_fecha", valor: fechaParaHubspot(hechaAt) }] });
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: "DONE", currentPhase: null, output: JSON.stringify({ investigacionId: guardada.id, propuestas, sinEnlace: lectura.sinEnlace, busquedas: lectura.busquedas }) },
    });
  } catch (e) {
    console.error("[investigacion] falló", e);
    // A la pantalla, en palabras: el error crudo del servicio («529 overloaded_error…») queda en el log.
    const error = e instanceof FalloDeLaInvestigacion ? e.message : "La investigación no pudo terminar (el servicio de IA no respondió). Vuelve a intentarlo en un rato.";
    await prisma.agentRun.update({ where: { id: runId }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error }) } }).catch(() => {});
  }
}

/** Un fallo que se le puede contar a la persona tal cual. */
class FalloDeLaInvestigacion extends Error {}

/** Hay algo que guardar solo si al menos una cosa trae su enlace de la búsqueda: un resumen solo («no encontré
 *  información verificable») taparía la investigación anterior con una vacía. */
function tieneContenido(l: LecturaDeLaInvestigacion): boolean {
  return l.fuentes.length > 0;
}

/**
 * Lo que encontró de los datos de la empresa, como propuestas con su cita y su enlace. Un dato que no pasa la lectura del
 * catálogo (un valor raro) se salta; los demás siguen. Devuelve cuántos quedaron por revisar o se llenaron; en
 * `resultados`, si viene, deja lo que hizo cada uno (para escribir en HubSpot lo que se llenó).
 */
export async function proponerLoEncontrado(
  clientId: string,
  lectura: Pick<LecturaDeLaInvestigacion, "datos" | "tamanoEstimado">,
  resultados?: ResultadoDelDato[],
): Promise<number> {
  const datos = [...lectura.datos];
  if (lectura.tamanoEstimado?.empleados !== undefined && !datos.some((d) => d.clave === "empleados")) {
    datos.push({ clave: "empleados", valor: lectura.tamanoEstimado.empleados, cita: lectura.tamanoEstimado.cita, url: lectura.tamanoEstimado.url });
  }
  let n = 0;
  for (const d of datos) {
    const r = await proponerDato({ clientId, clave: d.clave, valor: d.valor, fuente: "investigacion", cita: d.cita, enlace: d.url }).catch((e) => {
      console.warn(`[investigacion] el dato ${d.clave} no se propuso`, e instanceof Error ? e.message : e);
      return null;
    });
    if (r && r[0].veredicto.accion !== "nada") n++;
    if (r) resultados?.push(...r);
  }
  return n;
}
