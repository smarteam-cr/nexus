/**
 * lib/servicios/ciclos-server.ts — leer y escribir el CICLO de un proyecto recurrente y sus casos de uso.
 *
 * Único escritor de `CicloDeProyecto` y `CasoDeUso` (docs/smartloop-plan.md, etapa 1). Las reglas puras
 * viven en lib/servicios/ciclo.ts y lib/servicios/guia.ts; acá solo se lee y se escribe.
 *
 * Reglas:
 *  · Un ciclo abierto por proyecto (también lo cuida un índice parcial de la base). Abrir el siguiente
 *    exige cerrar el anterior (etapa 4: la sesión de aprendizaje).
 *  · La etapa de un proyecto que existe en HubSpot la mueve el equipo allá: acá no se cambia.
 *  · Quitar un caso de uso lo deja «descartado», no lo borra: el historial del ciclo se conserva.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolvePipeline } from "@/lib/projects/kind";
import { guiaDeServicio, type ClaveDeServicio } from "@/lib/servicios";
import { guiaDelCiclo, type GuiaDelCiclo, type ProducidoConEstado } from "@/lib/servicios/guia";
import {
  esEtapaDelCiclo,
  ETIQUETA_DE_ETAPA,
  etapaPorNombre,
  leerMueve,
  PIEZA_DE_LA_ETAPA,
  type Compromiso,
  type EtapaDelCiclo,
  type MovimientoEnLaEscala,
} from "@/lib/servicios/ciclo";

export class ErrorDelCiclo extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
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
}

export interface CicloVista {
  id: string;
  numero: number;
  nombre: string | null;
  desde: string | null;
  hasta: string | null;
  meta: string | null;
  etapa: EtapaDelCiclo;
  estado: string;
  casos: CasoDeUsoVista[];
}

export interface EstadoDelCiclo {
  servicio: ClaveDeServicio;
  nombreDelServicio: string;
  /** El proyecto existe en HubSpot: su etapa la mueve el equipo allá. */
  enHubspot: boolean;
  esPrueba: boolean;
  compromiso: Compromiso | null;
  abierto: CicloVista | null;
  guia: GuiaDelCiclo | null;
  cerrados: Array<{ numero: number; nombre: string | null; desde: string | null; hasta: string | null; cerradoAt: string | null }>;
}

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function proyectoRecurrente(projectId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, clientId: true, hubspotPipelineId: true, hubspotServiceId: true, hubspotPipelineStageLabel: true,
      esPrueba: true, compromiso: true,
    },
  });
  if (!p) throw new ErrorDelCiclo("El proyecto no existe.", 404);
  const servicio = resolvePipeline(p.hubspotPipelineId)?.servicioRecurrente ?? null;
  return { ...p, servicio };
}

/** null si el proyecto no es de un servicio recurrente. */
export async function cargarEstadoDelCiclo(projectId: string): Promise<EstadoDelCiclo | null> {
  const p = await proyectoRecurrente(projectId);
  const guiaServicio = guiaDeServicio(p.servicio);
  if (!p.servicio || !guiaServicio) return null;
  const ciclos = await prisma.cicloDeProyecto.findMany({
    where: { projectId },
    orderBy: { numero: "desc" },
    include: { casosDeUso: { where: { estado: { not: "descartado" } }, orderBy: [{ orden: "asc" }, { createdAt: "asc" }] } },
  });
  const abierto = ciclos.find((c) => c.estado === "abierto") ?? null;
  const enHubspot = !!p.hubspotServiceId;
  // En un proyecto que existe en HubSpot la etapa es la de allá (lib/lifecycle/load.ts hace lo mismo).
  const etapaDeHubspot = enHubspot ? etapaPorNombre(p.hubspotPipelineStageLabel) : null;
  const vista: CicloVista | null = abierto
    ? {
        id: abierto.id,
        numero: abierto.numero,
        nombre: abierto.nombre,
        desde: dia(abierto.desde),
        hasta: dia(abierto.hasta),
        meta: abierto.meta,
        etapa: etapaDeHubspot ?? (esEtapaDelCiclo(abierto.etapa) ? abierto.etapa : "diagnostico"),
        estado: abierto.estado,
        casos: abierto.casosDeUso.map((c) => ({
          id: c.id,
          titulo: c.titulo,
          resultado: c.resultado,
          mueve: leerMueve(c.mueve),
          porque: c.porque,
          criterio: c.criterio,
          metrica: c.metrica,
          origen: c.origen,
          estado: c.estado,
        })),
      }
    : null;
  return {
    servicio: p.servicio,
    nombreDelServicio: guiaServicio.nombre,
    enHubspot,
    esPrueba: p.esPrueba,
    compromiso: (p.compromiso as Compromiso | null) ?? null,
    abierto: vista,
    guia: vista
      ? guiaDelCiclo(guiaServicio, {
          etapa: vista.etapa,
          meta: vista.meta,
          desde: vista.desde,
          hasta: vista.hasta,
          casos: vista.casos,
        })
      : null,
    cerrados: ciclos
      .filter((c) => c.estado === "cerrado")
      .map((c) => ({ numero: c.numero, nombre: c.nombre, desde: dia(c.desde), hasta: dia(c.hasta), cerradoAt: c.cerradoAt?.toISOString() ?? null })),
  };
}

/** Lo que el riel y el «Qué sigue» necesitan del ciclo, sin cargar la página entera. */
export interface CicloParaElRiel {
  abierto: boolean;
  /** El número del ciclo abierto, o el del siguiente si no hay ninguno abierto. */
  numero: number;
  nombre: string | null;
  desde: string | null;
  hasta: string | null;
  etapa: EtapaDelCiclo | null;
  /** La etapa en palabras («Implementación»): importa la etapa, no el número del ciclo (Elías, 2026-10-12). */
  corto: string;
  /** Lo primero que falta en la etapa (o la señal de que se saltó), si Nexus lo puede comprobar. */
  falta: string | null;
  /** El artefacto donde se trabaja la etapa en curso (lib/servicios/ciclo.ts). */
  piezaDeLaEtapa: string | null;
  /** El plan del ciclo está escrito: meta, y casos de uso, todos con criterio. */
  planListo: boolean;
  /** Lo que tiene que quedar en la etapa en curso, con lo que Nexus puede comprobar (lib/servicios/guia.ts). */
  producido: ProducidoConEstado[];
  /** El proyecto existe en HubSpot: la etapa la mueve el equipo allá (por la encuesta de la etapa). */
  enHubspot: boolean;
  /** Quien mira puede cambiar el ciclo (lo pone la ruta que lo lee: es del usuario, no del proyecto). */
  puedeEditar?: boolean;
}

/** null si el proyecto no es recurrente. */
export async function estadoDelCicloParaElRiel(projectId: string): Promise<CicloParaElRiel | null> {
  const p = await proyectoRecurrente(projectId).catch(() => null);
  const guiaServicio = guiaDeServicio(p?.servicio);
  if (!p?.servicio || !guiaServicio) return null;
  const c = await prisma.cicloDeProyecto.findFirst({
    where: { projectId, estado: "abierto" },
    select: {
      numero: true, nombre: true, etapa: true, meta: true, desde: true, hasta: true,
      casosDeUso: { where: { estado: { not: "descartado" } }, select: { titulo: true, criterio: true } },
    },
  });
  if (!c) {
    /* Sin ciclo abierto el proyecto está en Diagnóstico: el ciclo se abre solo cuando alguien cambia la etapa o
       pone sus datos (2026-10-12). Antes decía «Sin ciclo abierto» y contradecía al «Qué sigue». */
    const ultimo = await prisma.cicloDeProyecto.findFirst({ where: { projectId }, orderBy: { numero: "desc" }, select: { numero: true } });
    const g0 = guiaDelCiclo(guiaServicio, { etapa: "diagnostico", meta: null, desde: null, hasta: null, casos: [] });
    return {
      abierto: false, numero: (ultimo?.numero ?? 0) + 1, nombre: null, desde: null, hasta: null, etapa: "diagnostico",
      corto: ETIQUETA_DE_ETAPA.diagnostico, falta: null, piezaDeLaEtapa: PIEZA_DE_LA_ETAPA.diagnostico, planListo: false,
      producido: g0.producido, enHubspot: !!p.hubspotServiceId,
    };
  }
  const etapaLeida = p.hubspotServiceId ? (etapaPorNombre(p.hubspotPipelineStageLabel) ?? c.etapa) : c.etapa;
  const etapa = esEtapaDelCiclo(etapaLeida) ? etapaLeida : "diagnostico";
  const estado = { etapa, meta: c.meta, desde: dia(c.desde), hasta: dia(c.hasta), casos: c.casosDeUso };
  const g = guiaDelCiclo(guiaServicio, estado);
  const plan = guiaDelCiclo(guiaServicio, { ...estado, etapa: "planificacion" });
  const faltaDelPlan = plan.producido.some((x) => (x.clave === "meta" || x.clave === "casos-con-criterio") && x.hecho === false);
  return {
    abierto: true,
    numero: c.numero,
    nombre: c.nombre,
    desde: estado.desde,
    hasta: estado.hasta,
    etapa,
    corto: ETIQUETA_DE_ETAPA[etapa],
    falta: g.senalVista ?? (g.primeroQueFalta ? `Falta ${g.primeroQueFalta.charAt(0).toLowerCase()}${g.primeroQueFalta.slice(1)}.` : null),
    piezaDeLaEtapa: PIEZA_DE_LA_ETAPA[etapa],
    planListo: !faltaDelPlan,
    producido: g.producido,
    enHubspot: !!p.hubspotServiceId,
  };
}

const fecha = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

export async function abrirCiclo(
  projectId: string,
  datos: { nombre?: string | null; desde?: string | null; hasta?: string | null; meta?: string | null },
  por: string,
) {
  const p = await proyectoRecurrente(projectId);
  if (!p.servicio) throw new ErrorDelCiclo("Este proyecto no es de un servicio recurrente.", 409);
  return prisma.$transaction(async (tx) => {
    const abierto = await tx.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { numero: true } });
    if (abierto) throw new ErrorDelCiclo(`El ciclo ${abierto.numero} sigue abierto: se cierra con la sesión de aprendizaje.`, 409);
    const ultimo = await tx.cicloDeProyecto.findFirst({ where: { projectId }, orderBy: { numero: "desc" }, select: { numero: true } });
    return tx.cicloDeProyecto.create({
      data: {
        projectId,
        numero: (ultimo?.numero ?? 0) + 1,
        nombre: datos.nombre?.trim() || null,
        desde: fecha(datos.desde),
        hasta: fecha(datos.hasta),
        meta: datos.meta?.trim() || null,
        creadoPor: por,
      },
      select: { id: true, numero: true },
    });
  });
}

export async function actualizarCiclo(
  projectId: string,
  cambios: { nombre?: string | null; desde?: string | null; hasta?: string | null; meta?: string | null; etapa?: EtapaDelCiclo },
  por?: string,
) {
  const p = await proyectoRecurrente(projectId);
  let abierto = await prisma.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { id: true } });
  // El primero se abre solo: el proyecto ya estaba en Diagnóstico sin ciclo (estadoDelCicloParaElRiel).
  if (!abierto && por) {
    const cerrados = await prisma.cicloDeProyecto.count({ where: { projectId } });
    if (cerrados === 0) abierto = await abrirCiclo(projectId, {}, por).then((c) => ({ id: c.id }));
  }
  if (!abierto) throw new ErrorDelCiclo("No hay un ciclo abierto.", 409);
  if (cambios.etapa && p.hubspotServiceId) {
    throw new ErrorDelCiclo("En un proyecto que está en HubSpot la etapa la mueve el equipo allá.", 409);
  }
  if (cambios.desde !== undefined && cambios.hasta !== undefined && cambios.desde && cambios.hasta && cambios.desde > cambios.hasta) {
    throw new ErrorDelCiclo("El ciclo no puede terminar antes de empezar.", 400);
  }
  await prisma.cicloDeProyecto.update({
    where: { id: abierto.id },
    data: {
      ...(cambios.nombre !== undefined ? { nombre: cambios.nombre?.trim() || null } : {}),
      ...(cambios.desde !== undefined ? { desde: fecha(cambios.desde) } : {}),
      ...(cambios.hasta !== undefined ? { hasta: fecha(cambios.hasta) } : {}),
      ...(cambios.meta !== undefined ? { meta: cambios.meta?.trim() || null } : {}),
      ...(cambios.etapa ? { etapa: cambios.etapa } : {}),
    },
  });
}

export async function cambiarCompromiso(projectId: string, compromiso: Compromiso | null) {
  const p = await proyectoRecurrente(projectId);
  if (!p.servicio) throw new ErrorDelCiclo("Este proyecto no es de un servicio recurrente.", 409);
  await prisma.project.update({ where: { id: projectId }, data: { compromiso } });
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

export async function crearCaso(projectId: string, datos: DatosDeCaso & { titulo: string }, por: string) {
  const p = await proyectoRecurrente(projectId);
  const abierto = await prisma.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { id: true } });
  if (!abierto) throw new ErrorDelCiclo("Abre el ciclo antes de sumarle casos de uso.", 409);
  const orden = await prisma.casoDeUso.count({ where: { cicloId: abierto.id } });
  return prisma.casoDeUso.create({
    data: {
      clientId: p.clientId,
      projectId,
      cicloId: abierto.id,
      titulo: datos.titulo.trim(),
      resultado: texto(datos.resultado) ?? null,
      mueve: (datos.mueve ?? []) as object[],
      porque: texto(datos.porque) ?? null,
      criterio: texto(datos.criterio) ?? null,
      metrica: texto(datos.metrica) ?? null,
      origen: "manual",
      estado: "en_ciclo",
      orden,
      creadoPor: por,
    },
    select: { id: true },
  });
}

/** Cambia un caso de uso del ciclo de ESTE proyecto (404 si es de otro). `quitar` lo deja descartado. */
export async function actualizarCaso(projectId: string, casoId: string, datos: DatosDeCaso & { quitar?: boolean }) {
  const caso = await prisma.casoDeUso.findFirst({ where: { id: casoId, projectId }, select: { id: true } });
  if (!caso) throw new ErrorDelCiclo("Ese caso de uso no es de este proyecto.", 404);
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
        },
  });
}

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
