/**
 * lib/servicios/ciclos-server.ts — lo que queda del CICLO de un proyecto recurrente, y los casos de uso de la empresa.
 *
 * Nexus ya no administra ciclos (Elías, 31 oct; docs/DECISIONS.md): la etapa la trae HubSpot y no se cuentan vueltas. Las
 * tablas `CicloDeProyecto` y `CasoDeUso` se quedan, y este archivo sigue siendo su único escritor:
 *  · «Pasar a recurrente» abre una fila con la etapa que se confirmó, mientras una persona mueve el proyecto en HubSpot.
 *  · Quitar un caso de uso lo deja «descartado», no lo borra.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolvePipeline } from "@/lib/projects/kind";
import { guiaDeServicio } from "@/lib/servicios";
import {
  ETIQUETA_DE_ETAPA,
  etapaQueMuestraElCiclo,
  leerMueve,
  type EtapaDelCiclo,
  type MovimientoEnLaEscala,
} from "@/lib/servicios/ciclo";
import { servicioDelCatalogo } from "@/lib/servicios/catalogo";
import { claveDelTitulo } from "@/lib/casos-de-uso/catalogo";
import type { ArranqueDelCiclo } from "@/lib/servicios/arranque-del-ciclo";
import { arranqueDelCiclo } from "@/lib/servicios/arranque-del-ciclo-server";

export class ErrorDelCiclo extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    /** Lo que la pantalla necesita para responder, además del mensaje (p. ej. `{ codigo: "SIN_ARRANQUE", fecha }`). */
    readonly datos?: { codigo: string } & Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface CasoDeUsoVista {
  id: string;
  titulo: string;
  resultado: string | null;
  mueve: MovimientoEnLaEscala[];
  porque: string | null;
  criterio: string | null;
  metrica: string | null;
  origen: string;
  estado: string;
  /** Etapa 4 (ficha E): lo medido y lo decidido en la sesión de aprendizaje (borrador mientras el ciclo está abierto). */
  criterioMedido: string | null;
  decisionAlCerrar: string | null;
  /** Etapa 3 (ficha E): la fase del cronograma que es este caso de uso. */
  faseId: string | null;
}

async function proyectoRecurrente(projectId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, clientId: true, hubspotPipelineId: true, hubspotServiceId: true, hubspotPipelineStageLabel: true,
      esPrueba: true, compromiso: true, servicioRecurrente: true,
    },
  });
  if (!p) throw new ErrorDelCiclo("El proyecto no existe.", 404);
  /* El pipeline manda (un proyecto en el pipeline de SmartLoop es SmartLoop); si no, el servicio que se le eligió en Nexus
     al «Pasar a recurrente» (2026-10-18), mientras una persona lo mueve en HubSpot. Solo si ese servicio avanza por ciclos. */
  const servicio =
    resolvePipeline(p.hubspotPipelineId)?.servicioRecurrente ?? servicioDelCatalogo(p.servicioRecurrente)?.ciclo?.servicio ?? null;
  return { ...p, servicio };
}

/** Lo que la ficha necesita del servicio: la etapa, con su nombre, y el arranque. */
export interface CicloParaElRiel {
  etapa: EtapaDelCiclo;
  /** La etapa en palabras («Implementación»). */
  corto: string;
  /** El kickoff anterior al servicio y cuántas reuniones leyó la exploración. Opcional: una respuesta cacheada vieja no lo trae. */
  arranque?: ArranqueDelCiclo;
}

async function arranqueSeguro(projectId: string): Promise<ArranqueDelCiclo> {
  try {
    return await arranqueDelCiclo(projectId, null);
  } catch (e) {
    console.warn("[ciclo] el arranque del ciclo no se pudo leer:", e instanceof Error ? e.message : e);
    return { lecturasDeExploracion: 0, kickoffAnteriorAlServicio: false };
  }
}

/** null si el proyecto no es recurrente. La etapa es la de HubSpot; sin ella, la que se confirmó al pasar a recurrente. */
export async function estadoDelCicloParaElRiel(projectId: string): Promise<CicloParaElRiel | null> {
  const p = await proyectoRecurrente(projectId).catch(() => null);
  if (!p?.servicio || !guiaDeServicio(p.servicio)) return null;
  const [arranque, abierto] = await Promise.all([
    arranqueSeguro(projectId),
    prisma.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { etapa: true } }),
  ]);
  const etapa = etapaQueMuestraElCiclo({ enHubspot: !!p.hubspotServiceId, rotuloDeHubspot: p.hubspotPipelineStageLabel, etapaGuardada: abierto?.etapa ?? null });
  return { etapa, corto: ETIQUETA_DE_ETAPA[etapa], arranque };
}

const fecha = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

export async function abrirCiclo(
  projectId: string,
  datos: { nombre?: string | null; desde?: string | null; hasta?: string | null; meta?: string | null; etapa?: EtapaDelCiclo },
  por: string,
) {
  const p = await proyectoRecurrente(projectId);
  if (!p.servicio) throw new ErrorDelCiclo("Este proyecto no es de un servicio recurrente.", 409);
  /* Leer y crear va sin bloqueo: dos pedidos a la vez (dos pestañas, el GET que abre el primero) pueden pasar la
     lectura los dos. El índice parcial CicloDeProyecto_uno_abierto frena al segundo con P2002: ahí se relee el ciclo
     que abrió el otro y se devuelve ese, en vez de terminar en 500. */
  try {
    return await abrirCicloEnTx(projectId, datos, por);
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    const abierto = await prisma.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { id: true, numero: true } });
    if (!abierto) throw e;
    return abierto;
  }
}

function abrirCicloEnTx(
  projectId: string,
  datos: { nombre?: string | null; desde?: string | null; hasta?: string | null; meta?: string | null; etapa?: EtapaDelCiclo },
  por: string,
) {
  return prisma.$transaction(async (tx) => {
    const abierto = await tx.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { numero: true } });
    if (abierto) throw new ErrorDelCiclo("Este proyecto ya tiene un ciclo abierto.", 409);
    const ultimo = await tx.cicloDeProyecto.findFirst({ where: { projectId }, orderBy: { numero: "desc" }, select: { numero: true } });
    return tx.cicloDeProyecto.create({
      data: {
        projectId,
        numero: (ultimo?.numero ?? 0) + 1,
        nombre: datos.nombre?.trim() || null,
        desde: fecha(datos.desde),
        hasta: fecha(datos.hasta),
        meta: datos.meta?.trim() || null,
        // «Pasar a recurrente» abre el ciclo 1 en la etapa que propuso Nexus y confirmó la persona.
        ...(datos.etapa ? { etapa: datos.etapa } : {}),
        creadoPor: por,
      },
      select: { id: true, numero: true },
    });
  });
}

export interface DatosDeCaso {
  titulo?: string;
  resultado?: string | null;
  mueve?: MovimientoEnLaEscala[];
  porque?: string | null;
  criterio?: string | null;
  metrica?: string | null;
}

const texto = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

// ── Los casos de uso de la EMPRESA (La cuenta › Casos de uso, 2026-10-12) ─────

/** Un caso de uso de la empresa, con dónde está: en un ciclo (de qué proyecto) o en el plan de crecimiento. */
export interface CasoDeLaEmpresa extends CasoDeUsoVista {
  proyecto: { id: string; nombre: string } | null;
  ciclo: { numero: number; abierto: boolean } | null;
}

export interface CasosDeLaEmpresa {
  casos: CasoDeLaEmpresa[];
  /** Los proyectos recurrentes de la empresa con un ciclo abierto: ahí se puede sumar un caso «al ciclo». */
  ciclosAbiertos: Array<{ projectId: string; nombre: string; numero: number }>;
}

export async function casosDeLaEmpresa(clientId: string): Promise<CasosDeLaEmpresa> {
  const [filas, ciclos] = await Promise.all([
    prisma.casoDeUso.findMany({
      where: { clientId },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        ciclo: { select: { numero: true, estado: true } },
      },
    }),
    prisma.cicloDeProyecto.findMany({
      where: { estado: "abierto", project: { clientId } },
      select: { numero: true, project: { select: { id: true, name: true } } },
    }),
  ]);
  return {
    casos: filas.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      resultado: c.resultado,
      mueve: leerMueve(c.mueve),
      porque: c.porque,
      criterio: c.criterio,
      metrica: c.metrica,
      origen: c.origen,
      estado: c.estado,
      criterioMedido: c.criterioMedido,
      decisionAlCerrar: c.decisionAlCerrar,
      faseId: c.faseId,
      proyecto: c.project ? { id: c.project.id, nombre: c.project.name } : null,
      ciclo: c.ciclo ? { numero: c.ciclo.numero, abierto: c.ciclo.estado === "abierto" } : null,
    })),
    ciclosAbiertos: ciclos.map((c) => ({ projectId: c.project.id, nombre: c.project.name, numero: c.numero })),
  };
}

/** Suma un caso de uso a la empresa: al plan de crecimiento, o al ciclo abierto de uno de sus proyectos. */
export async function crearCasoDeLaEmpresa(
  clientId: string,
  datos: DatosDeCaso & { titulo: string; projectId?: string | null; deLaEscala?: boolean },
  por: string,
) {
  let projectId: string | null = null;
  let cicloId: string | null = null;
  if (datos.projectId) {
    const ciclo = await prisma.cicloDeProyecto.findFirst({
      where: { projectId: datos.projectId, estado: "abierto", project: { clientId } },
      select: { id: true },
    });
    if (!ciclo) throw new ErrorDelCiclo("Ese proyecto no tiene un ciclo abierto en esta empresa.", 409);
    projectId = datos.projectId;
    cicloId = ciclo.id;
  }
  const orden = await prisma.casoDeUso.count({ where: { clientId } });
  return prisma.casoDeUso.create({
    data: {
      clientId,
      projectId,
      cicloId,
      titulo: datos.titulo.trim(),
      resultado: texto(datos.resultado) ?? null,
      mueve: (datos.mueve ?? []) as object[],
      porque: texto(datos.porque) ?? null,
      criterio: texto(datos.criterio) ?? null,
      metrica: texto(datos.metrica) ?? null,
      // Lo que sugiere el camino de crecimiento (ficha B) nace sugerido: se revisa con el cliente antes del plan.
      origen: datos.deLaEscala ? "escala" : "manual",
      estado: cicloId ? "en_ciclo" : datos.deLaEscala ? "sugerido" : "en_plan",
      orden,
      creadoPor: por,
    },
    select: { id: true },
  });
}

/** Cambia un caso de uso de ESTA empresa (404 si es de otra). `quitar` lo deja descartado; nada se borra. */
export async function actualizarCasoDeLaEmpresa(
  clientId: string,
  casoId: string,
  datos: DatosDeCaso & { quitar?: boolean; estado?: "sugerido" | "en_plan" | "cumplido" | "no_cumplido" },
) {
  const caso = await prisma.casoDeUso.findFirst({ where: { id: casoId, clientId }, select: { id: true, cicloId: true } });
  if (!caso) throw new ErrorDelCiclo("Ese caso de uso no es de esta empresa.", 404);
  if (datos.titulo !== undefined && !datos.titulo.trim()) throw new ErrorDelCiclo("El caso de uso necesita un título.", 400);
  await prisma.casoDeUso.update({
    where: { id: casoId },
    data: datos.quitar
      ? { estado: "descartado" }
      : {
          ...(datos.titulo !== undefined ? { titulo: datos.titulo.trim() } : {}),
          ...(datos.resultado !== undefined ? { resultado: texto(datos.resultado) } : {}),
          ...(datos.mueve !== undefined ? { mueve: datos.mueve as object[] } : {}),
          ...(datos.porque !== undefined ? { porque: texto(datos.porque) } : {}),
          ...(datos.criterio !== undefined ? { criterio: texto(datos.criterio) } : {}),
          ...(datos.metrica !== undefined ? { metrica: texto(datos.metrica) } : {}),
          // Volver al plan de crecimiento lo saca de su ciclo; cerrarlo (cumplido o no) lo deja en él.
          ...(datos.estado === "en_plan" || datos.estado === "sugerido"
            ? { estado: datos.estado, cicloId: null, projectId: null }
            : datos.estado
              ? { estado: datos.estado }
              : {}),
        },
  });
}

/**
 * Los casos de uso que vendió una propuesta recurrente, en el plan del proyecto que nace de ella (iniciativa 4, paso 4):
 * origen «propuesta», sin ciclo todavía (entran al ciclo cuando se planifica). Dentro de la transacción del alta. No
 * duplica: un título que el proyecto ya tiene no se vuelve a crear.
 */
export async function sumarCasosDeLaPropuestaEnTx(
  tx: Prisma.TransactionClient,
  d: { clientId: string; projectId: string; propuesta: string; casos: ReadonlyArray<{ titulo: string; resultado: string | null }>; por: string },
): Promise<number> {
  if (!d.casos.length) return 0;
  const ya = await tx.casoDeUso.findMany({ where: { projectId: d.projectId }, select: { titulo: true } });
  const vistos = new Set(ya.map((c) => claveDelTitulo(c.titulo)));
  const nuevos = d.casos.filter((c) => !vistos.has(claveDelTitulo(c.titulo)));
  if (!nuevos.length) return 0;
  await tx.casoDeUso.createMany({
    data: nuevos.map((c, i) => ({
      clientId: d.clientId,
      projectId: d.projectId,
      titulo: c.titulo,
      resultado: c.resultado,
      porque: `Vendido en la propuesta «${d.propuesta}».`,
      origen: "propuesta",
      estado: "en_plan",
      orden: i,
      creadoPor: d.por,
    })),
  });
  return nuevos.length;
}
