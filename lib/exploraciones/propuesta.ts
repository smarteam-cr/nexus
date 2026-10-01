/**
 * lib/exploraciones/propuesta.ts — armar la Propuesta de Nexus desde la exploración. SERVIDOR.
 *
 * Crea el caso de negocio con lo mismo que la puerta de siempre (app/api/business-cases/
 * create-from-company): el tipo, el interruptor `BC_DISABLED_TYPES`, los tags del tipo y su
 * Plantilla (v0). Lo propio de la exploración:
 *   - usa el cliente de la exploración: no crea clientes;
 *   - EXIGE el negocio de HubSpot, y que sea de esa empresa: el kickoff une la propuesta con el
 *     proyecto por el negocio, y sin él la exploración no le llegaría al CSE;
 *   - deja marcados los casos de uso elegidos en el lienzo;
 *   - guarda la foto de «lista para proponer» de ese momento (la lee la métrica).
 * El texto lo escribe después la generación de siempre, con la exploración como fuente principal.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { createBusinessCase } from "@/lib/business-cases";
import { bcTypeOrNull, DEFAULT_BC_TYPE_ID, seedTagsFor } from "@/lib/business-cases/case-types";
import { createBusinessCaseCanvas } from "@/lib/canvas/default-canvases";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { fetchCompanyDeals, type AvailableDeal } from "@/lib/hubspot/deals";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { listaParaProponer } from "./calidad";
import { calcularMetricas, DIAS_DE_LA_METRICA, type Metricas } from "./metricas";
import { leerContenido } from "./esquemas";
import { bloquearFila, exploracionParaLaPropuesta, leerExploracion } from "./servidor";

/** El tipo de la primera venta que sale de una exploración: la implementación de HubSpot. */
export const TIPO_DE_LA_PROPUESTA = DEFAULT_BC_TYPE_ID;

export interface CasoDelCatalogo {
  id: string;
  titulo: string;
  descripcion: string;
  precio: string | null;
  tags: string[];
}

/** Los casos de uso del catálogo que aplican a la implementación de HubSpot. Sin la tabla, vacío. */
export async function catalogoDeCasosDeUso(): Promise<CasoDelCatalogo[]> {
  try {
    const filas = await prisma.useCase.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, description: true, price: true, tags: true, appliesTo: true },
    });
    return filas
      .filter((f) => f.appliesTo.length === 0 || f.appliesTo.includes(TIPO_DE_LA_PROPUESTA))
      .map((f) => ({ id: f.id, titulo: f.title, descripcion: f.description, precio: f.price, tags: f.tags }));
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "P2021" || code === "42P01") return [];
    throw e;
  }
}

/** Los negocios de la empresa en HubSpot (ganados primero). null si HubSpot no respondió. */
export async function negociosDeLaEmpresa(companyId: string): Promise<AvailableDeal[] | null> {
  try {
    const hs = await getSystemHubspotClient();
    return await fetchCompanyDeals(hs, companyId);
  } catch (e) {
    console.error("[exploraciones/propuesta] no se pudieron leer los negocios", e);
    return null;
  }
}

/** Las propuestas que ya nacieron de esta exploración, la más nueva primero. */
export async function propuestasDeLaExploracion(exploracionId: string) {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return [];
  const filas = await prisma.businessCase.findMany({
    where: { exploracionId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, createdAt: true },
  });
  return filas.map((f) => ({ id: f.id, nombre: f.name, estado: f.status, creadaEn: f.createdAt.toISOString() }));
}

export type ResultadoDeArmar = { ok: true; businessCaseId: string } | { ok: false; status: number; error: string };

export async function armarPropuesta(o: { exploracionId: string; dealId: string; nombre: string | null; email: string | null }): Promise<ResultadoDeArmar> {
  const lectura = await leerExploracion(o.exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: lectura.estado === "no-existe" ? 404 : 503, error: "Esa exploración no existe." };
  const fila = lectura.fila;
  if (fila.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada." };
  const companyId = fila.client.hubspotCompanyId;
  if (!companyId) return { ok: false, status: 409, error: "La empresa no está vinculada a HubSpot: no se puede elegir su negocio." };

  const tipo = bcTypeOrNull(TIPO_DE_LA_PROPUESTA);
  if (!tipo?.enabled) return { ok: false, status: 400, error: "La implementación de HubSpot no está disponible." };
  const apagados = (process.env.BC_DISABLED_TYPES ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (apagados.includes(tipo.id)) return { ok: false, status: 400, error: `"${tipo.label}" está deshabilitado temporalmente.` };

  // El negocio tiene que ser de ESTA empresa: con otro, el proyecto nacería de otro trato.
  const negocios = await negociosDeLaEmpresa(companyId);
  if (negocios === null) return { ok: false, status: 502, error: "No se pudo consultar HubSpot. Inténtalo de nuevo en un momento." };
  const negocio = negocios.find((n) => n.id === o.dealId);
  if (!negocio) return { ok: false, status: 400, error: "Ese negocio no es de esta empresa en HubSpot." };

  const datos = await exploracionParaLaPropuesta(o.exploracionId);
  const contenido = leerContenido(fila.contenido);
  const casos = Object.keys(contenido.casosDeUso);
  const delCatalogo = casos.length
    ? new Set((await prisma.useCase.findMany({ where: { id: { in: casos } }, select: { id: true } }).catch(() => [])).map((u) => u.id))
    : new Set<string>();

  const businessCaseId = await prisma.$transaction(async (tx) => {
    const bc = await createBusinessCase(
      {
        clientId: fila.clientId,
        name: o.nombre?.trim() || `Propuesta — ${fila.client.name}`,
        hubspotCompanyId: companyId,
        hubspotDealId: negocio.id,
        createdByEmail: o.email,
        caseType: tipo.id,
        caseSubtype: null,
        tags: seedTagsFor(tipo, null),
        exploracionId: o.exploracionId,
      },
      tx,
    );
    await createBusinessCaseCanvas(bc.id, 0, tx, tipo.templateId, { caseType: tipo.id, caseSubtype: null });
    for (const useCaseId of casos.filter((id) => delCatalogo.has(id))) {
      await tx.businessCaseUseCase.create({ data: { businessCaseId: bc.id, useCaseId, selected: true } });
    }

    /* La foto de «lista para proponer» de este momento, para la métrica. Con la fila bloqueada y
       releída; no sube la versión: no es algo que el vendedor confirme, es un registro. */
    if (datos) {
      await bloquearFila(tx, o.exploracionId);
      const actual = await tx.exploracionDeVenta.findUnique({ where: { id: o.exploracionId }, select: { contenido: true } });
      const c = leerContenido(actual?.contenido);
      const puntos = Object.fromEntries(listaParaProponer(datos.estado, datos.chequeo).map((p) => [p.id, p.cumplido]));
      c.alProponer = [...c.alProponer, { en: new Date().toISOString(), businessCaseId: bc.id, puntos }].slice(-50);
      await tx.exploracionDeVenta.update({ where: { id: o.exploracionId }, data: { contenido: c as unknown as Prisma.InputJsonValue } });
    }
    return bc.id;
  });
  return { ok: true, businessCaseId };
}

/**
 * Los números de la métrica (lib/exploraciones/metricas.ts): las fotos de «lista para proponer» de
 * todas las exploraciones y cuántas propuestas a prospectos salieron sin exploración en la ventana.
 * Las exploraciones son pocas (una por prospecto): se leen enteras.
 */
export async function metricasDeLasPropuestas(ahora = new Date()): Promise<Metricas | null> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return null;
  const desde = new Date(ahora.getTime() - DIAS_DE_LA_METRICA * 24 * 60 * 60 * 1000);
  const [filas, sinExploracion] = await Promise.all([
    prisma.exploracionDeVenta.findMany({ select: { contenido: true } }),
    prisma.businessCase.count({ where: { createdAt: { gte: desde }, exploracionId: null, client: { kind: "PROSPECTO" } } }),
  ]);
  const fotos = filas.flatMap((f) => leerContenido(f.contenido).alProponer);
  const ids = [...new Set(fotos.map((f) => f.businessCaseId))];
  const existen = new Set(
    ids.length ? (await prisma.businessCase.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((b) => b.id) : [],
  );
  return calcularMetricas(fotos, { ahora, existen, sinExploracion });
}
