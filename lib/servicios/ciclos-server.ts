/**
 * lib/servicios/ciclos-server.ts — leer y escribir el CICLO de un proyecto recurrente y sus casos de uso.
 *
 * Único escritor de `CicloDeProyecto` y `CasoDeUso` (docs/smartloop-plan.md, etapa 1), junto con sus tres hermanos de
 * la ficha E: cronograma-del-ciclo-server.ts (etapa 3), cierre-server.ts (etapa 4) y traductor-server.ts (etapa 5). Las
 * reglas puras viven en lib/servicios/ciclo.ts, guia.ts, cierre.ts y traductor.ts; acá solo se lee y se escribe.
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
import { leerCierre, type CierreGuardado } from "@/lib/servicios/cierre";

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
  /** Etapa 3: la versión aprobada del cronograma del ciclo (0 = sin aprobar). */
  versionAprobada: number;
  aprobadoAt: string | null;
  aprobadoPor: string | null;
  /** Etapa 4: el borrador de la sesión de aprendizaje. */
  metaResultado: string | null;
  metaEvaluada: string | null;
  siguienteCiclo: string | null;
}

/** Un ciclo cerrado, para «Ciclos anteriores»: con lo que quedó del cierre (los casos y los documentos congelados). */
export interface CicloCerradoVista {
  numero: number;
  nombre: string | null;
  desde: string | null;
  hasta: string | null;
  cerradoAt: string | null;
  cerradoPor: string | null;
  meta: string | null;
  cierre: CierreGuardado | null;
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
  cerrados: CicloCerradoVista[];
}

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function casoVista(c: {
  id: string; titulo: string; resultado: string | null; mueve: unknown; porque: string | null; criterio: string | null;
  metrica: string | null; origen: string; estado: string; criterioMedido: string | null; decisionAlCerrar: string | null; faseId: string | null;
}): CasoDeUsoVista {
  return {
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
  };
}

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
        casos: abierto.casosDeUso.map(casoVista),
        versionAprobada: abierto.versionAprobada,
        aprobadoAt: abierto.aprobadoAt?.toISOString() ?? null,
        aprobadoPor: abierto.aprobadoPor,
        metaResultado: abierto.metaResultado,
        metaEvaluada: abierto.metaEvaluada,
        siguienteCiclo: abierto.siguienteCiclo,
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
          aprobada: vista.versionAprobada > 0,
          aprendizaje: { metaResultado: vista.metaResultado, siguienteCiclo: vista.siguienteCiclo },
        })
      : null,
    cerrados: ciclos
      .filter((c) => c.estado === "cerrado")
      .map((c) => ({
        numero: c.numero,
        nombre: c.nombre,
        desde: dia(c.desde),
        hasta: dia(c.hasta),
        cerradoAt: c.cerradoAt?.toISOString() ?? null,
        cerradoPor: c.cerradoPor,
        meta: c.meta,
        cierre: leerCierre(c.cierre),
      })),
  };
}

/** Lo que el riel y el «Qué sigue» necesitan del ciclo, sin cargar la página entera. */
export interface CicloParaElRiel {
  abierto: boolean;
  /** El id del ciclo abierto (null sin ciclo abierto): lo mandan los cambios del ciclo para no editar otro. */
  id: string | null;
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
      id: true, numero: true, nombre: true, etapa: true, meta: true, desde: true, hasta: true,
      versionAprobada: true, metaResultado: true, siguienteCiclo: true,
      casosDeUso: {
        where: { estado: { not: "descartado" } },
        select: { id: true, titulo: true, criterio: true, criterioMedido: true, decisionAlCerrar: true },
      },
    },
  });
  if (!c) {
    /* Sin ciclo abierto el proyecto está en Diagnóstico: el ciclo se abre solo cuando alguien cambia la etapa o
       pone sus datos (2026-10-12). Antes decía «Sin ciclo abierto» y contradecía al «Qué sigue». */
    const ultimo = await prisma.cicloDeProyecto.findFirst({ where: { projectId }, orderBy: { numero: "desc" }, select: { numero: true } });
    const g0 = guiaDelCiclo(guiaServicio, { etapa: "diagnostico", meta: null, desde: null, hasta: null, casos: [] });
    return {
      abierto: false, id: null, numero: (ultimo?.numero ?? 0) + 1, nombre: null, desde: null, hasta: null, etapa: "diagnostico",
      corto: ETIQUETA_DE_ETAPA.diagnostico, falta: null, piezaDeLaEtapa: PIEZA_DE_LA_ETAPA.diagnostico, planListo: false,
      producido: g0.producido, enHubspot: !!p.hubspotServiceId,
    };
  }
  const etapaLeida = p.hubspotServiceId ? (etapaPorNombre(p.hubspotPipelineStageLabel) ?? c.etapa) : c.etapa;
  const etapa = esEtapaDelCiclo(etapaLeida) ? etapaLeida : "diagnostico";
  const estado = {
    etapa,
    meta: c.meta,
    desde: dia(c.desde),
    hasta: dia(c.hasta),
    casos: c.casosDeUso,
    aprobada: c.versionAprobada > 0,
    aprendizaje: { metaResultado: c.metaResultado, siguienteCiclo: c.siguienteCiclo },
  };
  const g = guiaDelCiclo(guiaServicio, estado);
  const plan = guiaDelCiclo(guiaServicio, { ...estado, etapa: "planificacion" });
  const faltaDelPlan = plan.producido.some((x) => (x.clave === "meta" || x.clave === "casos-con-criterio") && x.hecho === false);
  return {
    abierto: true,
    id: c.id,
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
  datos: { nombre?: string | null; desde?: string | null; hasta?: string | null; meta?: string | null },
  por: string,
) {
  return prisma.$transaction(async (tx) => {
    const abierto = await tx.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { numero: true } });
    if (abierto) throw new ErrorDelCiclo(`El ciclo ${abierto.numero} sigue abierto: se cierra con la sesión de aprendizaje.`, 409);
    const ultimo = await tx.cicloDeProyecto.findFirst({ where: { projectId }, orderBy: { numero: "desc" }, select: { numero: true } });
    const nuevo = await tx.cicloDeProyecto.create({
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
    /* Lo que la sesión de aprendizaje del ciclo anterior decidió que «pasa» entra solo al ciclo nuevo (etapa 4, ficha
       E): el cierre lo dejó en el plan del proyecto con esa marca. Entra sin fase ni medición: es otro ciclo. */
    await tx.casoDeUso.updateMany({
      where: { projectId, cicloId: null, estado: "en_plan", decisionAlCerrar: "pasa" },
      data: { cicloId: nuevo.id, estado: "en_ciclo", decisionAlCerrar: null, criterioMedido: null, faseId: null },
    });
    return nuevo;
  });
}

export async function actualizarCiclo(
  projectId: string,
  cambios: {
    nombre?: string | null;
    desde?: string | null;
    hasta?: string | null;
    meta?: string | null;
    etapa?: EtapaDelCiclo;
    metaResultado?: string | null;
    metaEvaluada?: string | null;
    siguienteCiclo?: string | null;
  },
  por?: string,
  /**
   * El ciclo que la pantalla tiene enfrente: su id, o null si la pantalla no veía ninguno abierto. Si ya no es el
   * abierto, 409: una pestaña vieja no edita (ni abre) otro ciclo con lo que tenía escrito. `undefined` = quien llama
   * no lo sabe: edita el abierto, y sin abierto solo abre si el proyecto nunca tuvo un ciclo.
   */
  cicloId?: string | null,
) {
  const p = await proyectoRecurrente(projectId);
  let abierto = await prisma.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { id: true } });
  if (typeof cicloId === "string" && abierto?.id !== cicloId) {
    const ese = await prisma.cicloDeProyecto.findFirst({ where: { id: cicloId, projectId }, select: { estado: true } });
    throw new ErrorDelCiclo(
      ese?.estado === "cerrado" ? "Este ciclo ya se cerró: recarga la página." : "El ciclo cambió: recarga la página.",
      409,
    );
  }
  if (cicloId === null && abierto) throw new ErrorDelCiclo("Ya hay un ciclo abierto: recarga la página.", 409);
  /* Sin ciclo abierto el proyecto está en Diagnóstico (estadoDelCicloParaElRiel): el ciclo se abre solo al cambiar algo.
     Vale para el primero y, desde la ficha E, para el siguiente a uno cerrado (al cerrar, el proyecto vuelve a
     Diagnóstico): solo si la pantalla tampoco veía uno abierto (`cicloId: null`). Sin saber qué veía la pantalla, abre
     solo el primero. Lo de la sesión de aprendizaje es del ciclo abierto: no abre uno nuevo. */
  const delAprendizaje = cambios.metaResultado !== undefined || cambios.metaEvaluada !== undefined || cambios.siguienteCiclo !== undefined;
  if (!abierto && por && !delAprendizaje) {
    const puedeAbrir =
      cicloId === null || (await prisma.cicloDeProyecto.count({ where: { projectId } })) === 0;
    if (!puedeAbrir) throw new ErrorDelCiclo("Este ciclo ya se cerró: recarga la página.", 409);
    abierto = await abrirCiclo(projectId, {}, por).then((c) => ({ id: c.id }));
  }
  if (!abierto) throw new ErrorDelCiclo("No hay un ciclo abierto.", 409);
  if (cambios.etapa && p.hubspotServiceId) {
    throw new ErrorDelCiclo("En un proyecto que está en HubSpot la etapa la mueve el equipo allá.", 409);
  }
  if (cambios.desde !== undefined && cambios.hasta !== undefined && cambios.desde && cambios.hasta && cambios.desde > cambios.hasta) {
    throw new ErrorDelCiclo("El ciclo no puede terminar antes de empezar.", 400);
  }
  // Solo si sigue abierto: si se cerró entre la lectura y acá, no se le escribe nada.
  const escrito = await prisma.cicloDeProyecto.updateMany({
    where: { id: abierto.id, estado: "abierto" },
    data: {
      ...(cambios.nombre !== undefined ? { nombre: cambios.nombre?.trim() || null } : {}),
      ...(cambios.desde !== undefined ? { desde: fecha(cambios.desde) } : {}),
      ...(cambios.hasta !== undefined ? { hasta: fecha(cambios.hasta) } : {}),
      ...(cambios.meta !== undefined ? { meta: cambios.meta?.trim() || null } : {}),
      ...(cambios.etapa ? { etapa: cambios.etapa } : {}),
      ...(cambios.metaResultado !== undefined ? { metaResultado: cambios.metaResultado || null } : {}),
      ...(cambios.metaEvaluada !== undefined ? { metaEvaluada: cambios.metaEvaluada?.trim() || null } : {}),
      ...(cambios.siguienteCiclo !== undefined ? { siguienteCiclo: cambios.siguienteCiclo?.trim() || null } : {}),
    },
  });
  if (escrito.count === 0) throw new ErrorDelCiclo("Este ciclo ya se cerró: recarga la página.", 409);
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

/** Lo que se escribe de un caso de uso en la sesión de aprendizaje (etapa 4, ficha E): borrador hasta cerrar. */
export interface DatosDelAprendizaje {
  criterioMedido?: string | null;
  decisionAlCerrar?: string | null;
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
export async function actualizarCaso(projectId: string, casoId: string, datos: DatosDeCaso & DatosDelAprendizaje & { quitar?: boolean }) {
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
          ...(datos.criterioMedido !== undefined ? { criterioMedido: texto(datos.criterioMedido) } : {}),
          ...(datos.decisionAlCerrar !== undefined ? { decisionAlCerrar: datos.decisionAlCerrar || null } : {}),
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
