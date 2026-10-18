/**
 * lib/servicios/recurrencia-server.ts — la RECOMENDACIÓN DE RECURRENCIA de un proyecto: si califica, su porqué con datos
 * y lo que decidió una persona (docs/smartloop-plan.md, etapa 6). SERVIDOR. La regla es lib/servicios/recurrencia.ts.
 *
 * Tres lectores y un escritor:
 *  · `recomendacionDelProyecto`: la del «Qué sigue» del proyecto, con el porqué entero.
 *  · `recomendacionesPendientesPara`: las del CSE para «Para ti» (solo lo que sigue pendiente, sin el porqué caro).
 *  · `itemsParaContar`: lo que mide «Uso de Nexus» (lib/lo-propuesto/registro-server.ts).
 *  · `decidirRecomendacion`: usar (dejar la tarea o abrir el alta) o descartar. ⛔ Nunca escribe en HubSpot.
 */
import "server-only";
import type { PrismaClient, TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { esCseDeLaCuenta } from "@/lib/cs/adopcion-del-cse-server";
import { ESTADOS_ABIERTOS } from "@/lib/sessions/solicitudes-fuera-de-alcance";
import { escalaParaLaPropuesta } from "@/lib/exploraciones/escala-de-la-empresa";
import { caminoDeCrecimiento, casosSugeridosParaLaPropuesta, type AreaParaElCamino } from "@/lib/casos-de-uso/camino";
import { proyectosAbiertos } from "@/lib/clients/resumen-proyectos";
import { diaCR, estadoDeRecomendacionDeRecurrencia } from "@/lib/lo-propuesto/ciclo";
import type { EstadoCalculado } from "@/lib/lo-propuesto/tipos";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { contextoDeTareas, equipoDe, ErrorDeTareas } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { crearTarea, urlDeLaTarea } from "@/lib/tareas/mutaciones";
import { guiaDeServicio } from "./index";
import {
  calificaParaRecurrencia,
  ETAPA_DE_ENTREGA,
  ETAPA_FINALIZADO,
  lineasDelPorque,
  notasDeLaTarea,
  PORQUE_VACIO,
  puedeDecidirRecurrencia,
  SERVICIO_RECOMENDADO,
  textoDeLaRecomendacion,
  tituloDeLaTarea,
  urlDelAlta,
  type AccionDeRecurrencia,
  type Calificacion,
  type CasoDelPorque,
  type PorqueDeRecurrencia,
} from "./recurrencia";

const NOMBRE_DE_NIVEL: Record<string, string> = { D: "Deficiente", I: "Inicial", F: "Funcional", E: "Eficiente", O: "Óptimo" };
const nombreDeNivel = (l: string) => NOMBRE_DE_NIVEL[l] ?? l;

const SELECT_PROYECTO = {
  id: true,
  name: true,
  clientId: true,
  status: true,
  serviceType: true,
  hubspotServiceId: true,
  hubspotPipelineId: true,
  hubspotPipelineStageId: true,
  hubspotEtapaDesde: true,
  hubspotOwnerEmail: true,
  proyectoInterno: true,
  hermanoCsProjectId: true,
  altaEstado: true,
  esPrueba: true,
  tags: true,
} as const;

type FilaDeProyecto = {
  id: string;
  name: string;
  clientId: string;
  status: string;
  serviceType: string | null;
  hubspotServiceId: string | null;
  hubspotPipelineId: string | null;
  hubspotPipelineStageId: string | null;
  hubspotEtapaDesde: Date | null;
  hubspotOwnerEmail: string | null;
  proyectoInterno: boolean;
  hermanoCsProjectId: string | null;
  altaEstado: string | null;
  esPrueba: boolean;
  tags: string[];
};

/** ¿Este proyecto (con los demás de su cuenta) califica hoy? */
function calificar(p: FilaDeProyecto, deLaCuenta: readonly FilaDeProyecto[], hoyISO: string): Calificacion | null {
  const abiertos = new Set(proyectosAbiertos(deLaCuenta).map((x) => x.id));
  return calificaParaRecurrencia(
    {
      hubspotPipelineId: p.hubspotPipelineId,
      hubspotPipelineStageId: p.hubspotPipelineStageId,
      etapaDesde: p.hubspotEtapaDesde ? diaCR(p.hubspotEtapaDesde) : null,
      esPrueba: p.esPrueba,
      proyectoInterno: p.proyectoInterno,
    },
    deLaCuenta
      .filter((x) => x.id !== p.id)
      .map((x) => ({
        hubspotPipelineId: x.hubspotPipelineId,
        hubspotPipelineStageId: x.hubspotPipelineStageId,
        tags: x.tags,
        abierto: abiertos.has(x.id),
        esPrueba: x.esPrueba,
      })),
    hoyISO,
  );
}

/** La tabla de las decisiones existe (el SQL del 2026-10-17 corrió). Sin ella, todo se lee como pendiente y no se decide. */
function hayTabla(db: PrismaClient = prisma): boolean {
  return modeloDisponible(db.recomendacionDeRecurrencia);
}

async function decisionDe(projectId: string) {
  if (!hayTabla()) return null;
  try {
    return await prisma.recomendacionDeRecurrencia.findUnique({ where: { projectId } });
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

// ── El porqué ────────────────────────────────────────────────────────────────

/** Arma el porqué con datos. La adopción solo viaja si quien mira puede ver HubSpot Partner. */
export async function armarPorque(clientId: string, o: { verAdopcion: boolean }): Promise<PorqueDeRecurrencia> {
  const [escala, pedidos, totalPedidos, casosDeLaCuenta, uso] = await Promise.all([
    escalaParaLaPropuesta(clientId).catch(() => null),
    prisma.pedidoFueraDeAlcance.findMany({
      where: { clientId, estado: { in: [...ESTADOS_ABIERTOS].filter((e) => e !== "PEDIDO") } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { pedido: true, estado: true },
    }),
    prisma.pedidoFueraDeAlcance.count({ where: { clientId, estado: { in: [...ESTADOS_ABIERTOS].filter((e) => e !== "PEDIDO") } } }),
    prisma.casoDeUso.findMany({
      where: { clientId, estado: { in: ["sugerido", "en_plan"] } },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      take: 4,
      select: { titulo: true, resultado: true, porque: true },
    }),
    o.verAdopcion
      ? prisma.partnerUsageSnapshot.findFirst({
          where: { clientId },
          orderBy: { weekKey: "desc" },
          select: { uusScore: true, activationScore: true, weekKey: true },
        })
      : Promise.resolve(null),
  ]);

  const areas: AreaParaElCamino[] = (escala ?? []).map((a) => ({
    id: a.id,
    nombre: a.nombre,
    nivel: a.nivel,
    objetivo: a.objetivo,
    frena: a.frena,
    capas: a.capas,
    dimensiones: a.dimensiones.map((d) => ({ id: d.id, nombre: d.nombre, aplica: d.aplica, nivel: d.nivel, clase: d.clase })),
  }));
  const camino = caminoDeCrecimiento(areas, nombreDeNivel, { casosPorArea: 2 });

  const casos: CasoDelPorque[] = casosDeLaCuenta.map((c) => ({ titulo: c.titulo, razon: c.resultado ?? c.porque ?? null, deDonde: "cuenta" }));
  const yaEstan = new Set(casos.map((c) => c.titulo.trim().toLowerCase()));
  for (const paso of camino) {
    for (const c of paso.casos) {
      if (casos.length >= 4 || yaEstan.has(c.caso.titulo.trim().toLowerCase())) continue;
      yaEstan.add(c.caso.titulo.trim().toLowerCase());
      casos.push({ titulo: c.caso.titulo, razon: c.razon, deDonde: "catalogo" });
    }
  }
  if (!casos.length) {
    // Sin escala: lo que aterriza las áreas de la cuenta (el land del primer ciclo).
    for (const c of casosSugeridosParaLaPropuesta({ areas: [], escala: areas.length ? areas : null, max: 3 })) {
      casos.push({ titulo: c.titulo, razon: c.promesa, deDonde: "catalogo" });
    }
  }

  return {
    escala: camino
      .filter((p) => p.nivel)
      .map((p) => ({
        area: p.areaNombre,
        nivel: p.nivel ? nombreDeNivel(p.nivel) : null,
        siguiente: p.siguiente ? nombreDeNivel(p.siguiente) : null,
        frenan: p.frenan.map((d) => d.nombre),
      })),
    fueraDeAlcance: pedidos.map((p) => ({ pedido: p.pedido, estado: p.estado })),
    fueraDeAlcanceTotal: totalPedidos,
    casos,
    adopcion: uso ? { uso: uso.uusScore, activacion: uso.activationScore, semana: uso.weekKey } : null,
  };
}

// ── Lo que ve la ficha ───────────────────────────────────────────────────────

export interface RecomendacionDelProyecto {
  servicio: string;
  motivo: Calificacion["motivo"];
  texto: string;
  lineas: string[];
  porque: PorqueDeRecurrencia;
  estado: EstadoCalculado;
  /** La decisión, si la hubo. */
  decision: { estado: "usada" | "descartada"; accion: string | null; por: string; en: string; tareaId: string | null } | null;
  puedeDecidir: boolean;
  /** Abrir el alta del servicio (Clientes › Nuevo proyecto). */
  hrefDelAlta: string;
}

/** La recomendación del proyecto, o null si no califica. */
export async function recomendacionDelProyecto(
  projectId: string,
  quien: { email: string; rol: string | null },
  ahora = new Date(),
): Promise<RecomendacionDelProyecto | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ...SELECT_PROYECTO, client: { select: { name: true, emailDomains: true, projects: { select: SELECT_PROYECTO } } } },
  });
  if (!p) return null;
  const hoyISO = diaCR(ahora);
  const decision = await decisionDe(projectId);
  const cal = calificar(p, p.client.projects, hoyISO);
  // Lo ya decidido se sigue mostrando como decidido aunque el proyecto haya dejado de calificar (pasó a otra etapa).
  if (!cal && !decision) return null;

  const verAdopcion = esLiderDeCs(quien.rol) || (await esCseDeLaCuenta(p.clientId, quien.email).catch(() => false));
  const porque = await armarPorque(p.clientId, { verAdopcion });
  const servicio = guiaDeServicio(SERVICIO_RECOMENDADO)?.nombre ?? "SmartLoop";
  const motivo = cal?.motivo ?? (p.hubspotPipelineStageId === ETAPA_FINALIZADO ? "cierre" : "entrega");
  return {
    servicio,
    motivo,
    texto: textoDeLaRecomendacion({ motivo, empresa: p.client.name, servicio }),
    lineas: lineasDelPorque(porque),
    porque,
    estado: estadoDeRecomendacionDeRecurrencia(
      decision ? { estado: decision.estado === "usada" ? "usada" : "descartada", por: decision.decididoPor, en: decision.decididoEn } : null,
      cal?.nacio ?? null,
      hoyISO,
    ),
    decision: decision
      ? {
          estado: decision.estado === "usada" ? "usada" : "descartada",
          accion: decision.accion,
          por: decision.decididoPor,
          en: decision.decididoEn.toISOString(),
          tareaId: decision.tareaId,
        }
      : null,
    puedeDecidir: puedeDecidirRecurrencia(quien.rol),
    hrefDelAlta: urlDelAlta({ dominio: p.client.emailDomains[0] ?? null, servicio: SERVICIO_RECOMENDADO }),
  };
}

// ── Lo que ve «Para ti» ──────────────────────────────────────────────────────

export interface RecomendacionPendiente {
  projectId: string;
  proyecto: string;
  clientId: string;
  empresa: string;
  motivo: Calificacion["motivo"];
  nacio: string | null;
  servicio: string;
}

/** Las recomendaciones pendientes de los proyectos donde `email` es el encargado en HubSpot. */
export async function recomendacionesPendientesPara(email: string, ahora = new Date()): Promise<RecomendacionPendiente[]> {
  const correo = email.trim().toLowerCase();
  if (!correo || !ETAPA_DE_ENTREGA) return [];
  const etapas = [ETAPA_DE_ENTREGA, ETAPA_FINALIZADO].filter((x): x is string => !!x);
  const candidatos = await prisma.project.findMany({
    where: { hubspotOwnerEmail: { equals: correo, mode: "insensitive" }, hubspotPipelineStageId: { in: etapas }, esPrueba: false },
    select: { ...SELECT_PROYECTO, client: { select: { name: true, kind: true, projects: { select: SELECT_PROYECTO } } } },
    take: 50,
  });
  if (!candidatos.length) return [];
  const decididos = hayTabla()
    ? new Set(
        (
          await prisma.recomendacionDeRecurrencia
            .findMany({ where: { projectId: { in: candidatos.map((c) => c.id) } }, select: { projectId: true } })
            .catch((e) => {
              if (esquemaDesactualizado(e)) return [];
              throw e;
            })
        ).map((d) => d.projectId),
      )
    : new Set<string>();
  const hoyISO = diaCR(ahora);
  const servicio = guiaDeServicio(SERVICIO_RECOMENDADO)?.nombre ?? "SmartLoop";
  const out: RecomendacionPendiente[] = [];
  for (const p of candidatos) {
    if (p.client.kind !== "CLIENTE" || decididos.has(p.id)) continue;
    const cal = calificar(p, p.client.projects, hoyISO);
    if (!cal) continue;
    if (estadoDeRecomendacionDeRecurrencia(null, cal.nacio, hoyISO).estado !== "pendiente") continue;
    out.push({ projectId: p.id, proyecto: p.name, clientId: p.clientId, empresa: p.client.name, motivo: cal.motivo, nacio: cal.nacio, servicio });
  }
  return out;
}

// ── Lo que mide «Uso de Nexus» ───────────────────────────────────────────────

/** Cada recomendación que nació o se decidió en la ventana, con su estado (para `contarTipo`). */
export async function itemsParaContar(
  db: PrismaClient,
  v: { desde: Date; hasta: Date },
  hoyISO: string,
): Promise<Array<EstadoCalculado & { nacioEn: string }>> {
  if (!hayTabla(db) || !ETAPA_DE_ENTREGA) return [];
  const etapas = [ETAPA_DE_ENTREGA, ETAPA_FINALIZADO].filter((x): x is string => !!x);
  const [decididas, candidatos] = await Promise.all([
    db.recomendacionDeRecurrencia
      .findMany({
        where: { decididoEn: { gte: v.desde, lt: v.hasta } },
        select: { estado: true, decididoPor: true, decididoEn: true, projectId: true, project: { select: { hubspotEtapaDesde: true } } },
      })
      .catch((e) => {
        if (esquemaDesactualizado(e)) return [];
        throw e;
      }),
    db.project.findMany({
      where: { hubspotPipelineStageId: { in: etapas }, hubspotEtapaDesde: { gte: v.desde, lt: v.hasta }, esPrueba: false },
      select: { ...SELECT_PROYECTO, client: { select: { kind: true, projects: { select: SELECT_PROYECTO } } } },
    }),
  ]);
  const items: Array<EstadoCalculado & { nacioEn: string }> = [];
  const vistos = new Set<string>();
  for (const d of decididas) {
    vistos.add(d.projectId);
    items.push({
      ...estadoDeRecomendacionDeRecurrencia({ estado: d.estado === "usada" ? "usada" : "descartada", por: d.decididoPor, en: d.decididoEn }, null, hoyISO),
      nacioEn: (d.project.hubspotEtapaDesde ?? d.decididoEn).toISOString(),
    });
  }
  for (const p of candidatos) {
    if (vistos.has(p.id) || p.client.kind !== "CLIENTE") continue;
    const cal = calificar(p, p.client.projects, hoyISO);
    if (!cal || !p.hubspotEtapaDesde) continue;
    items.push({ ...estadoDeRecomendacionDeRecurrencia(null, cal.nacio, hoyISO), nacioEn: p.hubspotEtapaDesde.toISOString() });
  }
  return items;
}

// ── Decidir ──────────────────────────────────────────────────────────────────

export class ErrorDeRecurrencia extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ResultadoDeLaDecision {
  estado: "usada" | "descartada";
  accion: AccionDeRecurrencia;
  /** A dónde ir: la tarea creada o el alta del servicio. */
  href: string | null;
}

/**
 * Usar o descartar la recomendación. «tarea» deja una tarea al CSE del proyecto (o a quien decide, si el encargado no
 * está en el equipo) por el escritor único de Tareas; «alta» solo deja dicho que se usó y devuelve la dirección del alta.
 * ⛔ Ninguna de las dos escribe en HubSpot.
 */
export async function decidirRecomendacion(
  projectId: string,
  persona: TeamMember,
  d: { accion: AccionDeRecurrencia; motivo?: string | null },
  ahora = new Date(),
): Promise<ResultadoDeLaDecision> {
  if (!puedeDecidirRecurrencia(persona.roleEnum)) throw new ErrorDeRecurrencia(403, "La decide Customer Success.");
  if (!hayTabla()) throw new ErrorDeRecurrencia(503, "Falta correr el SQL de la recomendación de recurrencia (2026-10-17).");
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ...SELECT_PROYECTO, client: { select: { name: true, emailDomains: true, projects: { select: SELECT_PROYECTO } } } },
  });
  if (!p) throw new ErrorDeRecurrencia(404, "El proyecto no existe.");
  const yaDecidida = await decisionDe(projectId);
  if (yaDecidida) throw new ErrorDeRecurrencia(409, "Esta recomendación ya se decidió.");
  const hoyISO = diaCR(ahora);
  const cal = calificar(p, p.client.projects, hoyISO);
  if (!cal) throw new ErrorDeRecurrencia(409, "El proyecto ya no está en su entrega o la cuenta ya tiene un servicio recurrente.");

  const servicio = guiaDeServicio(SERVICIO_RECOMENDADO)?.nombre ?? "SmartLoop";
  const porque = await armarPorque(p.clientId, { verAdopcion: false });
  const quien = persona.email.toLowerCase();

  let tareaId: string | null = null;
  let href: string | null = null;
  if (d.accion === "tarea") {
    const ctx = await contextoDeTareas({ teamMember: persona });
    const clientes = await clientesQueVesParaTareas(persona);
    const encargado = p.hubspotOwnerEmail?.toLowerCase() ?? null;
    const para = encargado && equipoDe(encargado, ctx.miembros) ? encargado : quien;
    try {
      const creada = await crearTarea(
        ctx,
        clientes,
        {
          titulo: tituloDeLaTarea({ empresa: p.client.name, servicio }),
          notas: notasDeLaTarea(porque),
          para,
          cuando: "esta_semana",
          clientId: p.clientId,
          projectId: p.id,
          origenId: `recurrencia:${p.id}`,
        },
        ahora,
      );
      tareaId = creada.id;
      href = urlDeLaTarea(creada.id);
    } catch (e) {
      if (e instanceof ErrorDeTareas) throw new ErrorDeRecurrencia(e.status, e.message);
      throw e;
    }
    olvidarMedicion(quien);
    if (para !== quien) olvidarMedicion(para);
  } else if (d.accion === "alta") {
    href = urlDelAlta({ dominio: p.client.emailDomains[0] ?? null, servicio: SERVICIO_RECOMENDADO });
  }

  const estado = d.accion === "descartar" ? "descartada" : "usada";
  await prisma.recomendacionDeRecurrencia.create({
    data: {
      projectId,
      servicio: SERVICIO_RECOMENDADO,
      estado,
      accion: d.accion === "descartar" ? null : d.accion,
      motivo: d.accion === "descartar" ? d.motivo?.trim() || null : null,
      tareaId,
      porque: JSON.parse(JSON.stringify(porque ?? PORQUE_VACIO)),
      decididoPor: quien,
      decididoEn: ahora,
    },
  });
  olvidarMedicion(quien);
  return { estado, accion: d.accion, href };
}
