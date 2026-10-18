import "server-only";

/**
 * lib/exploraciones/posicionar-fuentes.ts — LO QUE LEE «Actualizar escala» (La cuenta › La escala). SERVIDOR.
 *
 * Todo lo que Nexus sabe de la cuenta, cada cosa con su id (2026-10-18, iniciativa 2 de «La siguiente serie»):
 *   · lo que dijo o hizo el cliente — respalda un nivel (`esFuenteDelCliente`):
 *       T (el test) y H (su actividad en HubSpot), V0 (el handoff), Q0 (los cuestionarios) y S (las reuniones que ya se
 *       leyeron, en resumen: su minuta y sus notas, por el chokepoint);
 *   · lo que sirve para entender — nunca respalda un nivel:
 *       G (las ventas ganadas), B (las propuestas, con servicios y licencias aparte), J0 (las tareas abiertas, por la
 *       puerta de Tareas), R0 (el cronograma), A0 y A1 (la memoria de la cuenta y del proyecto, por el cargador de
 *       lib/memoria), K0 (el kickoff), P0 (lo que estimó la preventa) y E0, C0, D0 (la ficha de HubSpot).
 * Nada se marca como leído y la guía de la exploración no se toca: ubicar la escala no es leer una reunión.
 * Lo que falla se omite: el agente lee lo demás.
 */
import { prisma } from "@/lib/db/prisma";
import { loadSelectedUseCases } from "@/lib/business-cases/use-cases";
import { inversionDelDocumento } from "@/lib/landing/forma-de-pago";
import { memoriaDeLaCuenta, memoriaDelProyecto } from "@/lib/memoria";
import { tareasDeLaCuentaParaAgentes } from "@/lib/tareas/para-agentes";
import { FUENTES_DE_POSICIONAR } from "./agente-pedido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { fuentesDeHubspotSinMarcar, reunionesEnResumen } from "./fuentes";
import { fuentesDelProyecto } from "./fuentes-del-proyecto";
import type { Fuente } from "./fuentes-tipos";
import { textoDeLaPropuesta, textoDeLasTareas, textoDeLasVentas, textoDelCronograma, type VentaParaElTexto } from "./posicionar";

const seguro = <T,>(p: Promise<T>, vacio: T, que: string): Promise<T> =>
  p.catch((e) => {
    console.error(`[exploraciones/posicionar] no se pudo leer ${que}`, e);
    return vacio;
  });

/** Las ventas ganadas de la empresa (vigentes, sin las de prueba), para el texto y para elegir sobre cuál se ubica. */
export async function ventasDeLaEmpresa(clientId: string): Promise<VentaParaElTexto[]> {
  const filas = await prisma.ventaGanada.findMany({
    where: { clientId, estado: "GANADA", excluida: false },
    orderBy: { fechaCierre: "desc" },
    take: 30,
    select: { id: true, nombre: true, fechaCierre: true, hubspotDealId: true, monto: true, moneda: true, pipelineLabel: true },
  });
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    fechaCierre: f.fechaCierre.toISOString().slice(0, 10),
    hubspotDealId: f.hubspotDealId,
    monto: f.monto === null ? null : Number(f.monto),
    moneda: f.moneda,
    pipeline: f.pipelineLabel,
  }));
}

/** Las propuestas comerciales de la empresa (las 4 más recientes), con su inversión y sus casos de uso. */
async function propuestasDeLaEmpresa(clientId: string): Promise<string[]> {
  const casos = await prisma.businessCase.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: { id: true, name: true, status: true, approvedAt: true },
  });
  return Promise.all(
    casos.map(async (c) => {
      const [seccion, elegidos] = await Promise.all([
        prisma.canvasSection
          .findFirst({
            where: { key: "inversion", canvas: { businessCaseId: c.id, isActive: true } },
            select: { key: true, blocks: { orderBy: { order: "asc" }, take: 1, select: { data: true } } },
          })
          .catch(() => null),
        loadSelectedUseCases(c.id),
      ]);
      const inversion = seccion ? inversionDelDocumento([{ key: seccion.key, data: seccion.blocks[0]?.data ?? null }]) : null;
      return textoDeLaPropuesta({
        nombre: c.name,
        estado: c.status,
        aprobadaEl: c.approvedAt ? c.approvedAt.toISOString() : null,
        inversion,
        casosDeUso: elegidos.map((u) => u.title),
      });
    }),
  );
}

async function cronogramaDelProyecto(projectId: string): Promise<string> {
  const t = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { anchorStartDate: true, phases: { orderBy: { order: "asc" }, select: { name: true, status: true, durationWeeks: true } } },
  });
  if (!t) return "";
  return textoDelCronograma(
    t.phases.map((p) => ({ nombre: p.name, estado: p.status, semanas: p.durationWeeks })),
    t.anchorStartDate ? t.anchorStartDate.toISOString() : null,
  );
}

export interface LoQueLeePosicionar {
  fuentes: Fuente[];
  /** Las reuniones que leyó (en resumen): van a la corrida, no se marcan como leídas. */
  sesionesUsadas: string[];
}

/**
 * Todo lo que lee «Actualizar escala» sobre un objetivo. `projectId` es el proyecto de la exploración; `esContenedor`
 * dice si es «Información del cliente» (la cuenta entera): ahí no hay handoff, cronograma ni memoria del proyecto.
 */
export async function fuentesParaPosicionar(o: {
  clientId: string;
  projectId: string | null;
  esContenedor: boolean;
  companyId: string | null;
  ventaId: string | null;
  escala: EscalaDelLienzo;
}): Promise<LoQueLeePosicionar> {
  const real = o.projectId && !o.esContenedor ? o.projectId : null;
  const [hubspot, delProyecto, cuenta, proyecto, ventas, propuestas, tareas, cronograma, reuniones] = await Promise.all([
    seguro(fuentesDeHubspotSinMarcar({ clientId: o.clientId, companyId: o.companyId, escala: o.escala }), [] as Fuente[], "HubSpot"),
    real ? seguro(fuentesDelProyecto(real, o.clientId, { conMemoria: false }), [] as Fuente[], "el proyecto") : Promise.resolve([] as Fuente[]),
    seguro(memoriaDeLaCuenta(o.clientId, { lector: "escala", projectId: real }).then((m) => m.texto), "", "la memoria de la cuenta"),
    real ? seguro(memoriaDelProyecto(real, { lector: "escala" }).then((m) => m.texto), "", "la memoria del proyecto") : Promise.resolve(""),
    seguro(ventasDeLaEmpresa(o.clientId), [] as VentaParaElTexto[], "las ventas"),
    seguro(propuestasDeLaEmpresa(o.clientId), [] as string[], "las propuestas"),
    seguro(tareasDeLaCuentaParaAgentes(o.clientId), [], "las tareas"),
    real ? seguro(cronogramaDelProyecto(real), "", "el cronograma") : Promise.resolve(""),
    seguro(reunionesEnResumen(o.clientId), { fuentes: [] as Fuente[], sesiones: [] as string[] }, "las reuniones"),
  ]);

  const f = FUENTES_DE_POSICIONAR;
  const fuentes: Fuente[] = [...delProyecto, ...reuniones.fuentes, ...hubspot];
  const textoVentas = textoDeLasVentas(ventas, o.ventaId);
  if (textoVentas) fuentes.push({ id: `${f.ventas}1`, etiqueta: "Las ventas ganadas (lo que compró; no dice cómo lo usa)", texto: textoVentas });
  propuestas
    .filter(Boolean)
    .forEach((texto, i) => fuentes.push({ id: `${f.propuestas}${i + 1}`, etiqueta: "Una propuesta comercial (lo que se le ofreció; no lo dijo el cliente)", texto: texto.slice(0, 4_000) }));
  const textoTareas = textoDeLasTareas(tareas);
  if (textoTareas) fuentes.push({ id: f.tareas, etiqueta: "Las tareas abiertas de la cuenta (lo que se está haciendo)", texto: textoTareas.slice(0, 4_000) });
  if (cronograma) fuentes.push({ id: f.cronograma, etiqueta: "El cronograma del proyecto (implementarlo no es que ya funcione)", texto: cronograma.slice(0, 4_000) });
  if (cuenta.trim()) fuentes.push({ id: f.memoriaDeLaCuenta, etiqueta: "Lo que Nexus ya sabe de la cuenta (lo escribió Smarteam; no lo dijo el cliente)", texto: cuenta.slice(0, 8_000) });
  if (proyecto.trim()) fuentes.push({ id: f.memoriaDelProyecto, etiqueta: "Lo que Nexus ya sabe del proyecto (lo escribió Smarteam; no lo dijo el cliente)", texto: proyecto.slice(0, 8_000) });
  return { fuentes, sesionesUsadas: reuniones.sesiones };
}
