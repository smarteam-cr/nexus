/**
 * lib/notas/lectura-server.ts — lo que se lee de las notas de la cuenta (etapa 5 de docs/mi-dia-plan.md). Solo lectura.
 *
 *   · `notasDeLaCuenta`: las notas de Nexus (las vigentes) y, aparte, las que se escribieron directo en el registro de
 *     HubSpot de la empresa, sin repetir las que escribió Nexus. Para La cuenta › Notas.
 *   · `notasParaLaMemoria`: lo que lee la memoria interna de la cuenta (lib/memoria): las vigentes más nuevas.
 *   · `decisionDeLaSugerencia`: si la nota sugerida de una reunión ya se usó o se descartó (para la tarjeta de la
 *     reunión y «Después de tus reuniones»).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { fetchCompanyTimelineItems } from "@/lib/hubspot/company-timeline";
import { notasDeHubspotSinLasDeNexus, type CanalDeLaNota, type EstadoEnHubspot, type OrigenDeLaNota } from "./reglas";

export interface NotaEnPantalla {
  id: string;
  canal: CanalDeLaNota;
  /** AAAA-MM-DD. */
  fecha: string;
  texto: string;
  autorEmail: string;
  autor: string;
  origen: OrigenDeLaNota;
  proyecto: { id: string; nombre: string } | null;
  negocio: string | null;
  reunion: { id: string; titulo: string } | null;
  hubspotEstado: EstadoEnHubspot;
  hubspotIntentos: number;
  hubspotNotaId: string | null;
  hubspotError: string | null;
  /** ISO. */
  creada: string;
}

export interface NotaSoloEnHubspot {
  id: string;
  texto: string;
  /** ISO. */
  fecha: string;
}

export interface NotasDeLaCuenta {
  hayTabla: boolean;
  notas: NotaEnPantalla[];
  /** null = la empresa no está en HubSpot. */
  deHubspot: NotaSoloEnHubspot[] | null;
  /** HubSpot no respondió: lo de Nexus se ve igual. */
  errorDeHubspot: string | null;
  /** Los negocios abiertos de la cuenta, para elegir uno al anotar. */
  negocios: { id: string; nombre: string }[];
  hubspotCompanyId: string | null;
}

/** Cuántas notas de Nexus se muestran (las más nuevas). */
export const NOTAS_EN_PANTALLA = 100;

export async function notasDeLaCuenta(clientId: string): Promise<NotasDeLaCuenta> {
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { hubspotCompanyId: true } });
  const vacio: NotasDeLaCuenta = { hayTabla: false, notas: [], deHubspot: null, errorDeHubspot: null, negocios: [], hubspotCompanyId: cliente?.hubspotCompanyId ?? null };
  if (!cliente || !modeloDisponible(prisma.notaDeLaCuenta)) return vacio;

  let filas;
  let idsDeNexus: string[];
  try {
    [filas, idsDeNexus] = await Promise.all([
      prisma.notaDeLaCuenta.findMany({
        where: { clientId, estado: "vigente" },
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        take: NOTAS_EN_PANTALLA,
        include: { project: { select: { id: true, name: true } }, session: { select: { id: true, title: true } } },
      }),
      // Todas las que escribió Nexus en HubSpot (también las que se sacaron de Nexus): ninguna vuelve como «de HubSpot».
      prisma.notaDeLaCuenta
        .findMany({ where: { clientId, hubspotNotaId: { not: null } }, select: { hubspotNotaId: true } })
        .then((xs) => xs.map((x) => x.hubspotNotaId!).filter(Boolean)),
    ]);
  } catch (e) {
    if (esquemaDesactualizado(e)) return vacio;
    throw e;
  }

  const correos = [...new Set(filas.map((f) => f.autorEmail))];
  const tratos = [...new Set(filas.map((f) => f.hubspotDealId).filter((x): x is string => !!x))];
  const [personas, negociosDeLasNotas, negocios] = await Promise.all([
    correos.length ? prisma.teamMember.findMany({ where: { email: { in: correos } }, select: { email: true, name: true } }) : Promise.resolve([]),
    tratos.length ? prisma.negocioAbierto.findMany({ where: { hubspotDealId: { in: tratos } }, select: { hubspotDealId: true, nombre: true } }) : Promise.resolve([]),
    prisma.negocioAbierto.findMany({ where: { clientId, abierto: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  ]);
  const nombreDe = new Map(personas.map((p) => [p.email.toLowerCase(), p.name]));
  const negocioDe = new Map(negociosDeLasNotas.map((n) => [n.hubspotDealId, n.nombre]));

  const notas: NotaEnPantalla[] = filas.map((f) => ({
    id: f.id,
    canal: f.canal as CanalDeLaNota,
    fecha: f.fecha.toISOString().slice(0, 10),
    texto: f.texto,
    autorEmail: f.autorEmail,
    autor: nombreDe.get(f.autorEmail) ?? f.autorEmail,
    origen: f.origen as OrigenDeLaNota,
    proyecto: f.project ? { id: f.project.id, nombre: f.project.name } : null,
    negocio: f.hubspotDealId ? (negocioDe.get(f.hubspotDealId) ?? "Un negocio de HubSpot") : null,
    reunion: f.session ? { id: f.session.id, titulo: f.session.title } : null,
    hubspotEstado: f.hubspotEstado as EstadoEnHubspot,
    hubspotIntentos: f.hubspotIntentos,
    hubspotNotaId: f.hubspotNotaId,
    hubspotError: f.hubspotError,
    creada: f.createdAt.toISOString(),
  }));

  let deHubspot: NotaSoloEnHubspot[] | null = null;
  let errorDeHubspot: string | null = null;
  if (cliente.hubspotCompanyId) {
    try {
      const items = await fetchCompanyTimelineItems(await getSystemHubspotClient(), cliente.hubspotCompanyId, { grabaciones: false });
      const enHubspot = items.filter((i) => i.type === "NOTE").map((i) => ({ id: i.id, texto: i.body, ts: i.ts }));
      deHubspot = notasDeHubspotSinLasDeNexus(enHubspot, new Set(idsDeNexus)).map((n) => ({ id: n.id, texto: n.texto, fecha: new Date(n.ts).toISOString() }));
    } catch (e) {
      errorDeHubspot = e instanceof Error ? e.message : "HubSpot no respondió.";
    }
  }

  return { hayTabla: true, notas, deHubspot, errorDeHubspot, negocios, hubspotCompanyId: cliente.hubspotCompanyId };
}

/** Una nota, como la lee la memoria interna de la cuenta. */
export interface NotaParaLaMemoria {
  canal: CanalDeLaNota;
  /** AAAA-MM-DD. */
  fecha: string;
  texto: string;
  autor: string;
}

/** Cuántas notas lee la memoria (las más nuevas). */
export const NOTAS_EN_LA_MEMORIA = 8;

export async function notasParaLaMemoria(clientId: string): Promise<NotaParaLaMemoria[]> {
  if (!modeloDisponible(prisma.notaDeLaCuenta)) return [];
  try {
    const filas = await prisma.notaDeLaCuenta.findMany({
      where: { clientId, estado: "vigente" },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: NOTAS_EN_LA_MEMORIA,
      select: { canal: true, fecha: true, texto: true, autorEmail: true },
    });
    const correos = [...new Set(filas.map((f) => f.autorEmail))];
    const personas = correos.length ? await prisma.teamMember.findMany({ where: { email: { in: correos } }, select: { email: true, name: true } }) : [];
    const nombreDe = new Map(personas.map((p) => [p.email.toLowerCase(), p.name]));
    return filas.map((f) => ({
      canal: f.canal as CanalDeLaNota,
      fecha: f.fecha.toISOString().slice(0, 10),
      texto: f.texto,
      autor: nombreDe.get(f.autorEmail) ?? f.autorEmail,
    }));
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/** Lo que ya se decidió de la nota sugerida de una reunión. null = nadie la decidió (o falta la tabla). */
export interface DecisionDeLaSugerencia {
  estado: "usada" | "descartada";
  notaId: string;
  texto: string;
  por: string;
  /** ISO. */
  en: string;
  hubspotEstado: EstadoEnHubspot;
}

export async function decisionDeLaSugerencia(sessionId: string): Promise<DecisionDeLaSugerencia | null> {
  if (!modeloDisponible(prisma.notaDeLaCuenta)) return null;
  try {
    const f = await prisma.notaDeLaCuenta.findFirst({
      where: { sessionId, origen: "reunion" },
      select: { id: true, estado: true, texto: true, autorEmail: true, createdAt: true, hubspotEstado: true },
    });
    if (!f) return null;
    return {
      estado: f.estado === "descartada" ? "descartada" : "usada",
      notaId: f.id,
      texto: f.texto,
      por: f.autorEmail,
      en: f.createdAt.toISOString(),
      hubspotEstado: f.hubspotEstado as EstadoEnHubspot,
    };
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}
