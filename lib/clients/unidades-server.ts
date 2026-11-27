/**
 * lib/clients/unidades-server.ts — «Unidades de negocio» de Información del cliente (2026-11-26): la vista, la vista previa
 * de un cambio y el guardado. La lógica pura (permisos, validación, qué se mueve y qué se protege) vive en
 * lib/clients/unidades.ts; la ruta es app/api/clients/[id]/unidades.
 *
 * Las reuniones las decide SOLO el resolver (lib/sessions/categorize.ts), con las fichas como quedarán
 * (`reResolverReunionesDe` con `ajustarFichas`). Al guardar se mueve exactamente lo que se vio en la vista previa (la
 * huella): si la cuenta da otra, se deshace el cambio de la ficha antes de mover nada y se pide revisar.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { clientesQueNoAbre } from "@/lib/auth/access";
import { buildInternalDomainsSet, effectiveDomainsForClient, esLaCasaEn, gruposDeLaGenteConfirmada, normalize, type CategorizeContext } from "@/lib/sessions/categorize";
import { buildCategorizeCtx, cargarInterlocutoresConfirmados, reResolveSession, reResolverReunionesDe, type ReunionQueCambia } from "@/lib/sessions/resolve-client";
import { asignarDuenioManual } from "@/lib/sessions/duenio-manual";
import { isLockedLink } from "@/lib/sessions/session-project-locks";
import { NO_ES_CONTENEDOR_WHERE } from "@/lib/projects/scope";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import { ETIQUETA_DEL_ROL, esRolDePersona } from "./roles-de-persona";
import { fichasDeLaEmpresa } from "./personas-de-la-empresa-server";
import { esEmpresa } from "./empresa";
import { cuantasComunicacionesVigentes } from "@/lib/comunicaciones/de-la-empresa-server";
import { huellaDeMovidas } from "./interlocutores";
import {
  ID_DE_LA_UNIDAD_NUEVA,
  SE_MUDAN_CON_EL_PROYECTO,
  ajusteDeLasFichas,
  leerFicha,
  planDeLaMudanza,
  type ComoQueda,
  type FichaDeLaEmpresaConLlaves,
  type VinculoDeLaVista,
} from "./unidades";

/** Un pedido que no se guarda por una regla: la ruta responde con su estado y su mensaje. */
export class RechazoDeUnidad extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 500 = 400,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const MUEVE_AJENAS = "Este cambio movería reuniones de una ficha que no puedes abrir. Pídeselo a quien lleva esa cuenta.";

/** Los documentos de un vínculo elegido por una persona (las columnas de `SessionProject`). */
const DOCUMENTOS = [
  ["handoffOverride", "Handoff"],
  ["kickoffOverride", "Kickoff"],
  ["diagnosisOverride", "Diagnóstico"],
  ["planningOverride", "Planificación"],
  ["implementationOverride", "Ejecución"],
  ["timelineOverride", "Cronograma"],
  ["techRequirementsOverride", "Integraciones"],
  ["deliveryOverride", "Entrega"],
] as const;

const SELECT_DEL_VINCULO = {
  sessionId: true,
  projectId: true,
  isPrimary: true,
  source: true,
  reviewedAt: true,
  included: true,
  handoffOverride: true,
  timelineOverride: true,
  diagnosisOverride: true,
  planningOverride: true,
  implementationOverride: true,
  kickoffOverride: true,
  explorationOverride: true,
  techRequirementsOverride: true,
  deliveryOverride: true,
  project: { select: { name: true, clientId: true } },
} satisfies Prisma.SessionProjectSelect;

// ── La empresa ────────────────────────────────────────────────────────────────────────────────────────────────────────

interface FichaCruda {
  id: string;
  name: string;
  kind: string;
  siglas: string[];
  emailDomains: string[];
  company: string | null;
  hubspotCompanyId: string | null;
  comparteDominioConId: string | null;
}

const SELECT_DE_LA_FICHA = {
  id: true,
  name: true,
  kind: true,
  siglas: true,
  emailDomains: true,
  company: true,
  hubspotCompanyId: true,
  comparteDominioConId: true,
} as const;

/** Las fichas de la empresa de esta ficha (la principal primero), con sus llaves. */
async function cargarEmpresa(clientId: string): Promise<FichaCruda[]> {
  const orden = await fichasDeLaEmpresa(clientId);
  const filas = await prisma.client.findMany({ where: { id: { in: orden.map((f) => f.id) } }, select: SELECT_DE_LA_FICHA });
  const porId = new Map(filas.map((f) => [f.id, f as FichaCruda]));
  return orden.map((f) => porId.get(f.id)).filter((f): f is FichaCruda => !!f);
}

const conLlaves = (f: FichaCruda, i: number): FichaDeLaEmpresaConLlaves => ({
  id: f.id,
  nombre: f.name,
  siglas: f.siglas ?? [],
  /* Los que ve el resolver: los de correo y el de `company` si parece un dominio (cemaco.com). */
  dominios: effectiveDomainsForClient(f),
  principal: i === 0,
});

/** Las fichas de otro grupo de la gente confirmada (Teamnet y Stratosphere): sin principal, armado por personas. */
async function fichasDelGrupo(clientId: string): Promise<string[]> {
  const [clients, categories, interlocutoresConfirmados] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true, company: true, emailDomains: true, siglas: true, comparteDominioConId: true, kind: true } }),
    prisma.sessionCategory.findMany({ select: { id: true, name: true, slug: true, domains: true, kind: true, color: true } }),
    cargarInterlocutoresConfirmados(),
  ]);
  const ctx: CategorizeContext = {
    clients,
    categories,
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
    interlocutoresConfirmados,
  };
  const grupos = gruposDeLaGenteConfirmada(ctx);
  const clave = grupos.get(clientId);
  if (!clave) return [];
  return [...grupos].filter(([, k]) => k === clave).map(([id]) => id);
}

/** Las fichas (de esta lista) que quien pide NO abre. La de la página siempre la abre: ya pasó el guard. */
async function queNoAbre(teamMemberId: string | null, paginaId: string, ids: readonly string[]): Promise<Set<string>> {
  const otras = [...new Set(ids)].filter((x) => x !== paginaId && x !== ID_DE_LA_UNIDAD_NUEVA);
  if (!otras.length) return new Set();
  if (!teamMemberId) return new Set(otras);
  return clientesQueNoAbre(teamMemberId, otras);
}

// ── La vista ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface UnidadEnLaVista {
  id: string;
  nombre: string;
  principal: boolean;
  /** La empresa arriba de sus unidades (2026-11-26): no trabaja, guarda lo compartido y lo que espera unidad. */
  esEmpresa: boolean;
  /** Solo en la empresa: lo de HubSpot que todavía no tiene unidad (se reparte al confirmar a la persona). */
  enEspera: { contactos: number; correos: number; tickets: number; negocios: number; ventas: number } | null;
  esEsta: boolean;
  /** Quien mira no abre esta ficha: solo se ve el nombre. */
  abre: boolean;
  siglas: string[];
  dominios: string[];
  /** Una unidad sin dominio propio: comparte el de la principal. */
  comparteDominio: boolean;
  conEmpresaDeHubspot: boolean;
  proyectos: { id: string; nombre: string }[];
  reuniones: number;
  personas: { nombre: string; rol: string | null }[];
  confirmadas: number;
  porConfirmar: number;
}

export interface VistaDeUnidades {
  /** `unidades`: la principal y sus unidades. `grupo`: fichas unidas por gente confirmada en las dos. `sola`: ninguna. */
  tipo: "unidades" | "grupo" | "sola";
  /** El nombre de la empresa («TEC», «Cemaco»): lo que va antes del « · » en el nombre de la principal. */
  empresa: string;
  fichas: UnidadEnLaVista[];
  /** En un grupo: la gente confirmada en dos fichas o más del grupo. */
  delGrupo: { nombre: string; correo: string }[];
}

/** Las personas a la vista por unidad: las confirmadas, primero las que deciden. */
const PERSONAS_A_LA_VISTA = 3;
const ORDEN_DEL_ROL: Record<string, number> = { decide: 0, champion: 1, participa: 2 };

export async function vistaDeLasUnidades(clientId: string, teamMemberId: string | null): Promise<VistaDeUnidades> {
  const empresa = await cargarEmpresa(clientId);
  let ids = empresa.map((f) => f.id);
  let tipo: VistaDeUnidades["tipo"] = empresa.length > 1 ? "unidades" : "sola";
  if (tipo === "sola") {
    const grupo = await fichasDelGrupo(clientId);
    if (grupo.length > 1) {
      tipo = "grupo";
      ids = [clientId, ...grupo.filter((x) => x !== clientId)];
    }
  }
  const noAbre = await queNoAbre(teamMemberId, clientId, ids);
  const abiertas = ids.filter((x) => !noAbre.has(x));
  const [fichas, proyectos, personas] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: ids } }, select: { ...SELECT_DE_LA_FICHA, createdAt: true } }),
    prisma.project.findMany({
      where: { clientId: { in: abiertas }, esPrueba: false, ...NO_ES_CONTENEDOR_WHERE },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, clientId: true },
    }),
    prisma.personaDeLaEmpresa.findMany({
      where: { clientId: { in: abiertas }, OR: [{ vigente: true }, { confirmadaAt: { not: null } }] },
      select: { clientId: true, correo: true, nombre: true, rol: true, confirmadaAt: true, reuniones: true },
    }),
  ]);
  const reuniones = new Map<string, number>();
  await Promise.all(abiertas.map(async (id) => reuniones.set(id, await prisma.firefliesSession.count({ where: whereBelongsToClient(id) }))));
  const porId = new Map(fichas.map((f) => [f.id, f]));
  /* La empresa arriba (2026-11-26): lo de HubSpot que se quedó en ella, sin unidad. */
  const laEmpresa = fichas.find((f) => esEmpresa(f) && abiertas.includes(f.id));
  const enEspera = laEmpresa
    ? await Promise.all([
        prisma.contactoDeHubspot.count({ where: { clientId: laEmpresa.id, vigente: true } }),
        cuantasComunicacionesVigentes(laEmpresa.id),
        prisma.ticketDeHubspot.count({ where: { clientId: laEmpresa.id, vigente: true } }),
        prisma.negocioAbierto.count({ where: { clientId: laEmpresa.id, abierto: true } }),
        prisma.ventaGanada.count({ where: { clientId: laEmpresa.id } }),
      ]).then(([contactos, correos, tickets, negocios, ventas]) => ({ contactos, correos, tickets, negocios, ventas }))
    : null;
  const principalId = tipo === "unidades" ? empresa[0]!.id : null;

  const vista: UnidadEnLaVista[] = ids
    .map((id) => porId.get(id))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => {
      const abre = !noAbre.has(f.id);
      const suyas = personas.filter((p) => p.clientId === f.id);
      const confirmadas = suyas
        .filter((p) => p.confirmadaAt)
        .sort((a, b) => (ORDEN_DEL_ROL[a.rol ?? ""] ?? 9) - (ORDEN_DEL_ROL[b.rol ?? ""] ?? 9) || b.reuniones - a.reuniones);
      const principal = f.id === principalId;
      return {
        id: f.id,
        nombre: f.name,
        principal,
        esEmpresa: esEmpresa(f),
        enEspera: f.id === laEmpresa?.id ? enEspera : null,
        esEsta: f.id === clientId,
        abre,
        siglas: abre ? (f.siglas ?? []) : [],
        dominios: abre ? (f.emailDomains ?? []) : [],
        comparteDominio: tipo === "unidades" && !principal && effectiveDomainsForClient(f).length === 0,
        conEmpresaDeHubspot: !!f.hubspotCompanyId,
        proyectos: abre ? proyectos.filter((p) => p.clientId === f.id).map((p) => ({ id: p.id, nombre: p.name.trim() })) : [],
        reuniones: reuniones.get(f.id) ?? 0,
        personas: abre
          ? confirmadas.slice(0, PERSONAS_A_LA_VISTA).map((p) => ({
              nombre: p.nombre?.trim() || p.correo,
              rol: p.rol && esRolDePersona(p.rol) ? ETIQUETA_DEL_ROL[p.rol] : null,
            }))
          : [],
        confirmadas: abre ? confirmadas.length : 0,
        porConfirmar: abre ? suyas.filter((p) => !p.confirmadaAt).length : 0,
      };
    });

  let delGrupo: VistaDeUnidades["delGrupo"] = [];
  if (tipo === "grupo") {
    const confirmadas = personas.filter((p) => p.confirmadaAt);
    const fichasDe = new Map<string, Set<string>>();
    for (const p of confirmadas) fichasDe.set(p.correo, new Set([...(fichasDe.get(p.correo) ?? []), p.clientId]));
    delGrupo = [...fichasDe]
      .filter(([, s]) => s.size > 1)
      .map(([correo]) => ({ correo, nombre: confirmadas.find((p) => p.correo === correo)?.nombre?.trim() || correo }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }
  const base = tipo === "unidades" ? empresa[0]!.name : (porId.get(clientId)?.name ?? "");
  /* Con la empresa arriba, su nombre es el de la empresa («TEC», «Grupo Teamnet»); antes, lo que iba antes del « · ». */
  const nombreDeLaEmpresa = tipo === "unidades" && esEmpresa(empresa[0]) ? base : base.split(/\s+·\s+/)[0]!.trim() || base;
  return { tipo, empresa: nombreDeLaEmpresa, fichas: vista, delGrupo };
}

// ── La vista previa y el guardado ─────────────────────────────────────────────────────────────────────────────────────

export interface PedidoDeUnidad {
  /** La ficha que se edita; sin él, se agrega una unidad nueva. */
  fichaId?: string;
  nombre?: string;
  siglas: string[];
  dominios: string[];
  /**
   * Los proyectos de la principal que pasan: al agregar, a la unidad nueva; con `fichaId`, solo si la principal es una
   * EMPRESA (2026-11-26: «Pasar a una unidad», un proyecto que llegó de HubSpot sin siglas).
   */
  proyectos?: string[];
  /** Reuniones a las que la persona les eligió la ficha (sessionId → ficha de la empresa, o la unidad nueva). */
  asignar?: Record<string, string>;
  /** Reuniones con un vínculo de una persona que igual se dejan ir adonde dice Nexus. */
  moverIgual?: string[];
  /** La huella de la vista previa que se vio (al guardar). */
  huella?: string;
}

export interface FilaDeLaVistaPrevia {
  sessionId: string;
  title: string;
  date: string;
  de: string | null;
  a: string | null;
  final: string | null;
  como: ComoQueda;
  conVinculoDeUnaPersona: boolean;
  elegidaPara: string[];
  pierde: string[];
}

export interface VistaPrevia {
  ficha: { nombre: string; siglas: string[]; dominios: string[] };
  filas: FilaDeLaVistaPrevia[];
  /** Nombre de cada ficha que sale en las filas (y «unidad-nueva» → el nombre de la unidad nueva). */
  nombres: Record<string, string>;
  proyectos: { id: string; nombre: string; frenadoPor: { sessionId: string; title: string }[] }[];
  /** Vínculos que puso Nexus y se sueltan porque su reunión no va con el proyecto. */
  sueltan: number;
  /** Lo que se mueve con los proyectos que pasan: filas por tabla. */
  conLosProyectos: Record<string, number>;
  listo: boolean;
  huella: string;
}

interface Calculo {
  empresa: FichaCruda[];
  principal: FichaCruda;
  leida: { nombre: string; siglas: string[]; dominios: string[] };
  mirar: string[];
  fichasParaTitulo: string[];
  cambian: ReunionQueCambia[];
  plan: ReturnType<typeof planDeLaMudanza>;
  pasan: string[];
  vista: VistaPrevia;
}

/**
 * Ids de las reuniones de estas fichas (su dueña de hoy), de las de gente de estos dominios y de las que traen en el título
 * alguna de estas palabras (las del nombre de la unidad nueva: si una ya estaba en el nombre de otra ficha, pasa a ser
 * ambigua y deja de decidir por el título las reuniones de esa otra).
 */
async function reunionesQueMirar(fichas: readonly string[], dominios: readonly string[], palabras: readonly string[] = []): Promise<string[]> {
  const ids = new Set<string>();
  if (palabras.length) {
    for (const s of await prisma.firefliesSession.findMany({
      where: { OR: palabras.map((p) => ({ title: { contains: p, mode: "insensitive" as const } })) },
      select: { id: true },
    })) {
      ids.add(s.id);
    }
  }
  for (const f of fichas) {
    for (const s of await prisma.firefliesSession.findMany({ where: whereBelongsToClient(f), select: { id: true } })) ids.add(s.id);
  }
  const patrones = [...new Set(dominios.map((d) => d.toLowerCase()))].map((d) => `%@${d}`);
  if (patrones.length) {
    const filas = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "FirefliesSession"
      WHERE EXISTS (SELECT 1 FROM unnest(participants) p WHERE lower(p) LIKE ANY (${patrones}::text[]))`;
    for (const f of filas) ids.add(f.id);
  }
  return [...ids];
}

/** La cuenta: qué cambia con este pedido, sin escribir nada. */
async function calcular(paginaId: string, pedido: PedidoDeUnidad, teamMemberId: string | null): Promise<Calculo> {
  const empresa = await cargarEmpresa(paginaId);
  const principal = empresa[0];
  if (!principal) throw new RechazoDeUnidad("No existe esa ficha.", 404);
  if (pedido.fichaId && !empresa.some((f) => f.id === pedido.fichaId)) throw new RechazoDeUnidad("Esa ficha no es de esta empresa.", 400);
  if (!pedido.fichaId && principal.comparteDominioConId) throw new RechazoDeUnidad("Esta ficha cuelga de otra: no puede tener unidades.");
  const editada = pedido.fichaId ? empresa.find((f) => f.id === pedido.fichaId)! : null;
  /* La empresa arriba (2026-11-26) no lleva siglas ni recibe proyectos: las siglas y el trabajo son de cada unidad. */
  if (editada && esEmpresa(editada) && pedido.siglas.some((s) => s.trim())) throw new RechazoDeUnidad("La empresa no lleva siglas: van en cada unidad.");
  if (editada && pedido.proyectos?.length && (!esEmpresa(principal) || editada.id === principal.id)) {
    throw new RechazoDeUnidad("Los proyectos pasan de la empresa a una de sus unidades.");
  }

  const deLaEmpresa = new Set(empresa.map((f) => f.id));
  const afuera = await prisma.client.findMany({
    where: { id: { notIn: [...deLaEmpresa] } },
    select: { name: true, company: true, emailDomains: true },
  });
  const leido = leerFicha(
    { nombre: pedido.nombre, siglas: pedido.siglas, dominios: pedido.dominios },
    {
      empresa: empresa.map(conLlaves),
      esta: pedido.fichaId ?? null,
      dominioDeOtra: (d) => afuera.find((c) => effectiveDomainsForClient(c).includes(d))?.name ?? null,
    },
  );
  if (!leido.ok) throw new RechazoDeUnidad(leido.error);

  /* Los proyectos que pasan: al agregar, de la principal; a una unidad que ya existe, solo de la empresa arriba. */
  const pasan = pedido.fichaId && !esEmpresa(principal) ? [] : [...new Set(pedido.proyectos ?? [])];
  const proyectosDelGrupo = await prisma.project.findMany({
    where: { clientId: { in: [...deLaEmpresa] } },
    select: { id: true, name: true, clientId: true, serviceType: true },
  });
  const fichaDelProyecto = new Map(proyectosDelGrupo.map((p) => [p.id, p.clientId]));
  for (const id of pasan) {
    const p = proyectosDelGrupo.find((x) => x.id === id);
    if (!p || p.clientId !== principal.id || p.serviceType === SENTINEL_SERVICE_TYPE) {
      throw new RechazoDeUnidad("Solo pueden pasar a la unidad los proyectos de la principal.");
    }
  }

  /* Pasar un proyecto de una ficha que es de un grupo de la gente confirmada cambia cuál tiene el proyecto más antiguo, y
     con eso de quién son las reuniones de todo el grupo (categorize.ts › la regla del grupo): eso no lo ve la vista previa. */
  if (pasan.length && (await fichasDelGrupo(principal.id)).length > 1) {
    throw new RechazoDeUnidad(
      `${principal.name} es de un grupo con otra empresa: pasar sus proyectos cambiaría de quién son las reuniones de todo el grupo. Crea la unidad sin proyectos y pásalos después con el equipo de Nexus.`,
    );
  }

  const ajuste = ajusteDeLasFichas({ id: editada?.id, nombre: leido.nombre, siglas: leido.siglas, dominios: leido.dominios, principalId: principal.id });
  const fichasParaTitulo = [...deLaEmpresa, ...(editada ? [] : [ID_DE_LA_UNIDAD_NUEVA])];
  /* Con y sin tilde: la búsqueda en la base no las iguala («Logística» y «logistica»). */
  const palabrasNuevas = editada
    ? []
    : [
        ...new Set(
          [...normalize(leido.nombre).split(/[^a-z0-9]+/), ...leido.nombre.toLowerCase().split(/[^\p{L}\p{N}]+/u)].filter((w) => w.length >= 4),
        ),
      ];
  const mirar = await reunionesQueMirar(
    [...deLaEmpresa],
    [...empresa.flatMap((f) => effectiveDomainsForClient(f)), ...leido.dominios],
    palabrasNuevas,
  );
  const { cambian } = await reunionesQueCambian({ ajuste, fichasParaTitulo, mirar });

  const deSesiones = [...new Set(cambian.map((c) => c.sessionId))];
  /* Todos los vínculos de las reuniones que cambian, también con proyectos de OTRAS empresas: mudar una reunión suelta los
     que no quedan en su ficha nueva, y si los puso una persona hay que verlo. Y los de los proyectos que pasan. */
  const vinculosCrudos = await prisma.sessionProject.findMany({
    where: { OR: [{ sessionId: { in: deSesiones } }, ...(pasan.length ? [{ projectId: { in: pasan } }] : [])] },
    select: SELECT_DEL_VINCULO,
  });
  for (const v of vinculosCrudos) if (!fichaDelProyecto.has(v.projectId)) fichaDelProyecto.set(v.projectId, v.project.clientId);
  const enCambian = new Set(deSesiones);
  const otras = [...new Set(vinculosCrudos.filter((v) => !enCambian.has(v.sessionId)).map((v) => v.sessionId))];
  const sesionesQueSiguen = otras.length
    ? await prisma.firefliesSession.findMany({
        where: { id: { in: otras } },
        select: { id: true, title: true, date: true, resolvedClientId: true, manualClientId: true },
      })
    : [];
  const actual = new Map(sesionesQueSiguen.map((s) => [s.id, { title: s.title, resolvedClientId: s.manualClientId ?? s.resolvedClientId }]));
  /* Las reuniones de un proyecto que pasa que el resolver deja donde están y FRENAN el pase (como principal o con un
     vínculo de una persona): van a la vista previa como «sigue», para que la persona les pueda elegir la unidad. */
  const frenan = new Set(
    vinculosCrudos.filter((v) => pasan.includes(v.projectId) && !enCambian.has(v.sessionId) && (v.isPrimary || isLockedLink(v))).map((v) => v.sessionId),
  );
  const siguen = sesionesQueSiguen
    .filter((s) => frenan.has(s.id))
    .map((s) => ({ sessionId: s.id, title: s.title, date: s.date, de: s.manualClientId ?? s.resolvedClientId, a: s.manualClientId ?? s.resolvedClientId }));
  /* De las que siguen, TODOS sus vínculos: si la persona les elige la unidad, hay que ver lo que pierden con otros proyectos. */
  if (siguen.length) {
    const ya = new Set(vinculosCrudos.map((v) => `${v.sessionId}|${v.projectId}`));
    for (const v of await prisma.sessionProject.findMany({ where: { sessionId: { in: siguen.map((s) => s.sessionId) } }, select: SELECT_DEL_VINCULO })) {
      if (ya.has(`${v.sessionId}|${v.projectId}`)) continue;
      vinculosCrudos.push(v);
      if (!fichaDelProyecto.has(v.projectId)) fichaDelProyecto.set(v.projectId, v.project.clientId);
    }
  }

  const vinculos: VinculoDeLaVista[] = vinculosCrudos.map((v) => ({
    sessionId: v.sessionId,
    projectId: v.projectId,
    isPrimary: v.isPrimary,
    conCandado: isLockedLink(v),
    elegidaPara: DOCUMENTOS.filter(([col]) => v[col] === true).map(([, etiqueta]) => `${etiqueta} de ${v.project.name.trim()}`),
  }));
  /* Una reunión se le elige a una unidad, nunca a la empresa arriba (2026-11-26: no es dueña de nada). */
  const fichasValidas = new Set(fichasParaTitulo.filter((id) => !esEmpresa(empresa.find((f) => f.id === id))));
  const elegibles = new Set([...deSesiones, ...siguen.map((s) => s.sessionId)]);
  const asignar = new Map(Object.entries(pedido.asignar ?? {}).filter(([s, f]) => elegibles.has(s) && fichasValidas.has(f)));
  const plan = planDeLaMudanza({
    cambian: [...cambian, ...siguen],
    vinculos,
    fichaDelProyecto,
    pasan: new Set(pasan),
    unidad: editada ? (pasan.length ? editada.id : null) : ID_DE_LA_UNIDAD_NUEVA,
    actual,
    asignar,
    moverIgual: new Set(pedido.moverIgual ?? []),
  });

  /* Quien pide tiene que abrir cada ficha que gana o pierde una reunión (también las que elige a mano), la que edita y, al
     agregar una unidad, la principal: de ella cuelga y de ella salen los proyectos que pasan. */
  const tocadas = [
    ...new Set(
      [
        ...cambian.flatMap((c) => [c.de, c.a]),
        ...plan.filas.filter((f) => plan.fijar.has(f.sessionId)).flatMap((f) => [f.de, plan.fijar.get(f.sessionId)!]),
        editada?.id,
        editada ? null : principal.id,
      ].filter((x): x is string => !!x && x !== ID_DE_LA_UNIDAD_NUEVA),
    ),
  ];
  const casa = await fichasDeLaCasa(tocadas);
  const noAbre = await queNoAbre(teamMemberId, paginaId, tocadas.filter((x) => !casa.has(x)));
  if (noAbre.size) throw new RechazoDeUnidad(MUEVE_AJENAS, 403);

  const nombres: Record<string, string> = Object.fromEntries(empresa.map((f) => [f.id, f.name]));
  if (!editada) nombres[ID_DE_LA_UNIDAD_NUEVA] = leido.nombre;
  const ajenas = tocadas.filter((x) => !nombres[x]);
  if (ajenas.length) {
    for (const c of await prisma.client.findMany({ where: { id: { in: ajenas } }, select: { id: true, name: true } })) nombres[c.id] = c.name;
  }
  const conLosProyectos = pasan.length ? await contarLoQueCuelga(pasan, principal.id) : {};

  return {
    empresa,
    principal,
    leida: leido,
    mirar,
    fichasParaTitulo,
    cambian,
    plan,
    pasan,
    vista: {
      ficha: { nombre: leido.nombre, siglas: leido.siglas, dominios: leido.dominios },
      filas: plan.filas
        .map((f) => ({
          sessionId: f.sessionId,
          title: f.title,
          date: new Date(f.date).toISOString(),
          de: f.de,
          a: f.a,
          final: f.final,
          como: f.como,
          conVinculoDeUnaPersona: f.conVinculoDeUnaPersona,
          elegidaPara: f.elegidaPara,
          pierde: f.pierde,
        }))
        .sort((x, y) => y.date.localeCompare(x.date)),
      nombres,
      proyectos: plan.proyectos.map((p) => ({
        id: p.projectId,
        nombre: proyectosDelGrupo.find((x) => x.id === p.projectId)?.name.trim() ?? p.projectId,
        frenadoPor: p.frenadoPor,
      })),
      sueltan: plan.sueltan.length,
      conLosProyectos,
      listo: plan.listo,
      huella: huellaDeMovidas(cambian),
    },
  };
}

async function reunionesQueCambian(o: { ajuste?: ReturnType<typeof ajusteDeLasFichas>; fichasParaTitulo: string[]; mirar: string[] }) {
  return reResolverReunionesDe([], {
    aplicar: false,
    ajustarFichas: o.ajuste,
    exigirHubspot: true,
    tambienLasDeLasFichas: o.fichasParaTitulo,
    tambienEstasReuniones: o.mirar,
  });
}

async function fichasDeLaCasa(ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const [categorias, fichas] = await Promise.all([
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
    prisma.client.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, company: true, emailDomains: true } }),
  ]);
  const casa = esLaCasaEn(buildInternalDomainsSet(categorias));
  return new Set(fichas.filter(casa).map((c) => c.id));
}

type Delegado = {
  count(a: { where: Record<string, unknown> }): Promise<number>;
  updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};
const delegado = (db: unknown, modelo: string) => (db as Record<string, Delegado>)[modelo.charAt(0).toLowerCase() + modelo.slice(1)]!;

/** Cuántas filas de cada tabla pasan con los proyectos. */
async function contarLoQueCuelga(pasan: readonly string[], principalId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const tabla of SE_MUDAN_CON_EL_PROYECTO) {
    const n = await delegado(prisma, tabla).count({ where: { projectId: { in: [...pasan] }, clientId: principalId } });
    if (n) out[tabla] = n;
  }
  return out;
}

/** La vista previa: qué cambia con este pedido. No escribe nada. */
export async function simularUnidad(paginaId: string, pedido: PedidoDeUnidad, teamMemberId: string | null): Promise<VistaPrevia> {
  return (await calcular(paginaId, pedido, teamMemberId)).vista;
}

/** La huella de una cuenta hecha con la unidad nueva ya creada: su id real cuenta como el de la vista previa. */
const huellaConLaNueva = (cambian: readonly ReunionQueCambia[], idNueva: string | null) =>
  huellaDeMovidas(
    cambian.map((c) => ({
      sessionId: c.sessionId,
      de: idNueva && c.de === idNueva ? ID_DE_LA_UNIDAD_NUEVA : c.de,
      a: idNueva && c.a === idNueva ? ID_DE_LA_UNIDAD_NUEVA : c.a,
    })),
  );

export interface ResultadoDelGuardado {
  fichaId: string;
  movidas: number;
  fijadas: number;
  proyectos: number;
  sinMover: number;
  /** Reuniones de un proyecto que pasó que quedaron en otra ficha porque algo falló a mitad del guardado. */
  aMedias: number;
  /** ¿Quien guardó abre la ficha? Una unidad nueva sin proyectos suyos no entra en su cartera. */
  abre: boolean;
}

/**
 * Guarda el cambio: la ficha (o la unidad nueva), los proyectos que pasan con lo que cuelga de ellos, las reuniones que
 * eligió o protege la persona (asignadas a mano) y las que mueve el resolver. Solo si la cuenta de ahora da lo mismo que
 * la vista previa que se vio (`pedido.huella`); si no, deshace la ficha antes de mover nada y responde 409.
 */
export async function guardarUnidad(
  paginaId: string,
  pedido: PedidoDeUnidad,
  quien: { teamMemberId: string | null; email: string },
): Promise<ResultadoDelGuardado> {
  const REVISA = () => new RechazoDeUnidad("Cambió algo desde la vista previa: revísala de nuevo.", 409, { vistaNueva: true });
  const c = await calcular(paginaId, pedido, quien.teamMemberId);
  if (!pedido.huella || pedido.huella !== c.vista.huella) throw REVISA();
  if (!c.plan.listo) throw new RechazoDeUnidad("Antes de guardar, elige la ficha de las reuniones marcadas y revisa los proyectos que no pueden pasar.");

  /* 1. La ficha. */
  const editada = pedido.fichaId ? c.empresa.find((f) => f.id === pedido.fichaId)! : null;
  let fichaId: string;
  if (editada) {
    await prisma.client.update({ where: { id: editada.id }, data: { siglas: c.leida.siglas, emailDomains: c.leida.dominios } });
    fichaId = editada.id;
  } else {
    const creada = await prisma.client.create({
      data: {
        name: c.leida.nombre,
        emailDomains: c.leida.dominios,
        siglas: c.leida.siglas,
        comparteDominioConId: c.principal.id,
        /* Una unidad de la empresa arriba es un cliente: la empresa misma no es de la cartera (2026-11-26). */
        kind: (esEmpresa(c.principal) ? "CLIENTE" : c.principal.kind) as Prisma.ClientCreateInput["kind"],
        source: "manual",
      },
      select: { id: true },
    });
    fichaId = creada.id;
  }
  /* Deshacer solo si la ficha sigue como la dejó este guardado: si otro guardado la cambió en el medio, no se le pisa. */
  const deshacer = async () => {
    try {
      await deshacerLaFicha();
    } catch (e) {
      console.error(`[unidades] no se pudo deshacer ${fichaId}:`, e);
      throw new RechazoDeUnidad(
        "La vista previa cambió y no se pudo deshacer la ficha: quedó guardada sin mover ninguna reunión. Ábrela y guarda de nuevo, o avísale al equipo de Nexus.",
        500,
        { aMedias: true },
      );
    }
  };
  const deshacerLaFicha = async () => {
    if (editada) {
      await prisma.client.updateMany({
        where: { id: editada.id, siglas: { equals: c.leida.siglas }, emailDomains: { equals: c.leida.dominios } },
        data: { siglas: editada.siglas, emailDomains: editada.emailDomains },
      });
    } else {
      await prisma.client.delete({ where: { id: fichaId } });
    }
  };

  /* 2. Con la ficha escrita y ANTES de mover nada, la cuenta tiene que dar lo mismo que la vista previa. */
  const fichasParaTitulo = c.fichasParaTitulo.map((x) => (x === ID_DE_LA_UNIDAD_NUEVA ? fichaId : x));
  let ahora: Awaited<ReturnType<typeof reunionesQueCambian>>;
  try {
    ahora = await reunionesQueCambian({ fichasParaTitulo, mirar: c.mirar });
  } catch (e) {
    await deshacer();
    throw e;
  }
  const idNueva = editada ? null : fichaId;
  if (huellaConLaNueva(ahora.cambian, idNueva) !== c.vista.huella) {
    await deshacer();
    throw REVISA();
  }
  const real = (x: string | null) => (x === ID_DE_LA_UNIDAD_NUEVA ? fichaId : x);

  /* 3. Los proyectos que pasan, con lo que cuelga de ellos, ANTES de las reuniones: mudar una reunión suelta sus vínculos
        con proyectos de otra ficha, y los de un proyecto que pasa son de la unidad. */
  if (c.pasan.length) {
    try {
      await prisma.$transaction(
      async (tx) => {
        await tx.project.updateMany({ where: { id: { in: c.pasan }, clientId: c.principal.id }, data: { clientId: fichaId } });
        for (const tabla of SE_MUDAN_CON_EL_PROYECTO) {
          await delegado(tx, tabla).updateMany({ where: { projectId: { in: c.pasan }, clientId: c.principal.id }, data: { clientId: fichaId } });
        }
        /* La propuesta de una preventa que pasa va con ella, con la empresa de HubSpot de la unidad (ninguna: la unidad
           nueva no tiene). Con la de la principal, regenerarla metería la actividad de HubSpot de toda la empresa. */
        const preventas = await tx.exploracionDeVenta.findMany({ where: { projectId: { in: c.pasan } }, select: { id: true } });
        if (preventas.length) {
          await tx.businessCase.updateMany({
            where: { exploracionId: { in: preventas.map((p) => p.id) }, clientId: c.principal.id },
            data: { clientId: fichaId, hubspotCompanyId: null },
          });
        }
        for (const v of c.plan.sueltan) await tx.sessionProject.deleteMany({ where: { sessionId: v.sessionId, projectId: v.projectId } });
        await tx.csAccountBrief.updateMany({ where: { clientId: c.principal.id }, data: { staleAt: new Date() } });
      },
      { timeout: 60_000 },
      );
    } catch (e) {
      /* La transacción no dejó nada: se deshace la ficha y no se mueve ninguna reunión. */
      await deshacer();
      throw e;
    }
  }

  /* 4 y 5. Las reuniones. Desde aquí no se deshace nada (los proyectos ya pasaron): una reunión que falla no frena a las
     demás, y al final `asegurarLosProyectos` deja cada reunión de un proyecto que pasó en la unidad, como se vio. */
  let falla: unknown = null;
  let movidas = 0;
  let sinMover = 0;
  try {
    /* 4. Las que eligió la persona o que se protegen: asignadas a mano a su ficha. */
    if (c.plan.fijar.size) {
      /* Asignada a mano, el resolver la manda a esa ficha (paso 1): el contexto se arma una sola vez. */
      const ctx = await buildCategorizeCtx();
      ctx.hubspotCompaniesByDomain = new Map(ahora.hubspot);
      for (const [sessionId, ficha] of c.plan.fijar) {
        try {
          await asignarDuenioManual(sessionId, real(ficha), { origen: "humano", actorEmail: quien.email });
          await reResolveSession(sessionId, ctx, { reclassify: false, soltarVinculosAjenos: true });
        } catch (e) {
          falla ??= e;
        }
      }
    }
    /* 5. Las que mueve el resolver, solo las que se vieron. */
    const aprobadas = new Map([...c.plan.aprobadas].map(([s, m]) => [s, { de: real(m.de), a: real(m.a) }]));
    const hechas = await reResolverReunionesDe([], {
      aplicar: true,
      aprobadas,
      hubspot: ahora.hubspot,
      tambienLasDeLasFichas: fichasParaTitulo,
      tambienEstasReuniones: c.mirar,
    });
    movidas = hechas.cambian.length;
    sinMover = hechas.saltadas.filter((s) => !c.plan.fijar.has(s.sessionId)).length;
    if (sinMover) console.warn(`[unidades] ${sinMover} reunión(es) dieron distinto al escribir y no se movieron (${fichaId}).`);
  } catch (e) {
    falla ??= e;
  }
  let aMedias = 0;
  if (c.pasan.length) {
    try {
      aMedias = await asegurarLosProyectos(c, fichaId, real, quien.email);
    } catch (e) {
      falla ??= e;
      aMedias = -1;
    }
  }
  if (falla || aMedias !== 0) {
    console.error(`[unidades] guardado a medias en ${fichaId}:`, falla ?? `${aMedias} reunión(es) de un proyecto que pasó quedaron en otra ficha`);
    /* No se le manda a reintentar desde la pantalla: editar la unidad no vuelve a mirar los proyectos que ya pasaron. Lo
       que quedó cruzado lo marca check:invariants (INV1) y lo arregla el equipo de Nexus. */
    throw new RechazoDeUnidad(
      `${editada ? "Las siglas y el dominio quedaron guardados" : `«${c.leida.nombre}» quedó creada`}, pero no se terminaron de mover todas las reuniones. Avísale al equipo de Nexus: el detalle quedó en el registro.`,
      500,
      { aMedias: true },
    );
  }
  const abre = !quien.teamMemberId ? false : (await clientesQueNoAbre(quien.teamMemberId, [fichaId])).size === 0;
  return { fichaId, movidas, fijadas: c.plan.fijar.size, proyectos: c.pasan.length, sinMover, aMedias, abre };
}

/**
 * Después de pasar proyectos: ninguna reunión vinculada a uno de ellos puede quedar en otra ficha (invariante 1). La que la
 * vista previa mandaba a la unidad y no llegó (algo falló, o la cuenta dio distinto al escribir) se asigna a mano a la
 * unidad, como se vio; el vínculo que puso Nexus de una que no va se suelta. Devuelve cuántas quedaron cruzadas igual
 * (un vínculo de una persona con una reunión que nadie mandó a la unidad: no debería pasar, el plan lo frena).
 */
async function asegurarLosProyectos(
  c: Calculo,
  fichaId: string,
  real: (x: string | null) => string | null,
  email: string,
): Promise<number> {
  const finalDe = new Map(c.plan.filas.map((f) => [f.sessionId, real(f.final)]));
  const vinculos = await prisma.sessionProject.findMany({
    where: { projectId: { in: c.pasan } },
    select: { ...SELECT_DEL_VINCULO, id: true, session: { select: { resolvedClientId: true, manualClientId: true } } },
  });
  let cruzadas = 0;
  for (const v of vinculos) {
    const dueña = v.session.manualClientId ?? v.session.resolvedClientId;
    if (dueña === fichaId) continue;
    if (finalDe.get(v.sessionId) === fichaId) {
      await asignarDuenioManual(v.sessionId, fichaId, { origen: "humano", actorEmail: email });
      await reResolveSession(v.sessionId, undefined, { reclassify: false, soltarVinculosAjenos: true });
    } else if (!v.isPrimary && !isLockedLink(v)) {
      await prisma.sessionProject.delete({ where: { id: v.id } });
    } else {
      cruzadas++;
    }
  }
  return cruzadas;
}

// ── Juntar (solo el simulacro) ────────────────────────────────────────────────────────────────────────────────────────

export interface SimulacroDeJuntar {
  unidad: string;
  principal: string;
  proyectos: number;
  reuniones: number;
  propuestas: number;
  preventas: number;
  personasConfirmadas: number;
  conCuentaDeCobro: boolean;
}

/**
 * Lo que pasaría a la principal si se junta esta unidad con ella. Solo lee: juntar BORRA la ficha de la unidad y no se
 * puede deshacer, así que lo aplica el script de fusión (scripts/merge-duplicate-clients.ts) después de este simulacro
 * (CLAUDE.md, invariante 3: lo destructivo es simulacro primero y lo aplica una persona).
 */
export async function simularJuntar(unidadId: string): Promise<SimulacroDeJuntar> {
  const unidad = await prisma.client.findUnique({
    where: { id: unidadId },
    select: { name: true, comparteDominioConId: true, kind: true, comparteDominioCon: { select: { name: true, kind: true } } },
  });
  if (!unidad?.comparteDominioConId || !unidad.comparteDominioCon) throw new RechazoDeUnidad("Esa ficha no es una unidad: no hay con qué juntarla.");
  /* Con la empresa arriba (2026-11-26), juntar una unidad con la empresa le daría proyectos, cobro y gente a una ficha que
     nunca tiene reuniones: los proyectos quedarían sin las suyas. Las unidades se juntan entre ellas, con el equipo de Nexus. */
  if (unidad.comparteDominioCon.kind === "EMPRESA") throw new RechazoDeUnidad("Una unidad no se junta con la empresa: la empresa no tiene trabajo propio. Para juntar dos unidades, avísale al equipo de Nexus.");
  const [proyectos, reuniones, propuestas, preventas, personasConfirmadas, cuenta] = await Promise.all([
    prisma.project.count({ where: { clientId: unidadId, ...NO_ES_CONTENEDOR_WHERE } }),
    prisma.firefliesSession.count({ where: whereBelongsToClient(unidadId) }),
    prisma.businessCase.count({ where: { clientId: unidadId } }),
    /* Solo las preventas (`projectId` null, lib/exploraciones/marco.ts › DE_LA_PREVENTA): la exploración de un proyecto no lo es. */
    prisma.exploracionDeVenta.count({ where: { clientId: unidadId, projectId: null } }),
    prisma.personaDeLaEmpresa.count({ where: { clientId: unidadId, confirmadaAt: { not: null } } }),
    prisma.cuentaFinanciera.findUnique({ where: { clientId: unidadId }, select: { id: true } }),
  ]);
  return {
    unidad: unidad.name,
    principal: unidad.comparteDominioCon.name,
    proyectos,
    reuniones,
    propuestas,
    preventas,
    personasConfirmadas,
    conCuentaDeCobro: !!cuenta,
  };
}
