/**
 * lib/exploraciones/llegadas-server.ts — los leads del test, por empresa (K10 del roadmap, 2026-10-27). SERVIDOR.
 *
 * Lo leen dos pantallas: «Llegaron por el test» en el listado de preventas (Ventas) y el reporte «Leads del test» de
 * Marketing. Las dos parten de la MISMA lectura de HubSpot (las notas que deja el test, lib/exploraciones/hubspot.ts ›
 * llegadasPorElTest), guardada 3 minutos en memoria: son ~10 pedidos y abrir las dos páginas no los repite. Solo lee
 * HubSpot.
 *
 * El reporte suma lo que sabe Nexus de cada empresa: si ya es una ficha, de qué clase, y si pasó a preventa (tiene o tuvo
 * una exploración de venta, viva o archivada).
 */
import "server-only";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { llegadasPorElTest, type LlegadaPorElTest, type LlegadasPorElTest } from "./hubspot";
import { INICIO_DEL_TEST, type LlegadaSinEmpresa } from "./llegadas";

const VIGENCIA_MS = 3 * 60 * 1000;
let guardado: { en: number; datos: LlegadasPorElTest } | null = null;

/** Lo que dejó el test desde que existe, con 3 minutos de memoria. null si HubSpot no respondió. */
export async function llegadasDelTest(ahora = new Date()): Promise<LlegadasPorElTest | null> {
  if (guardado && ahora.getTime() - guardado.en < VIGENCIA_MS) return guardado.datos;
  const datos = await llegadasPorElTest(new Date(`${INICIO_DEL_TEST}T00:00:00-06:00`), ahora);
  if (datos) guardado = { en: ahora.getTime(), datos };
  return datos;
}

/** Lo que Nexus sabe de cada empresa de HubSpot que llegó por el test. */
export interface FichaDeLaLlegada {
  clientId: string;
  kind: string;
  /** Tiene o tuvo una preventa (viva o archivada). */
  preventa: { id: string; archivada: boolean } | null;
}

export async function fichasDeLasLlegadas(companyIds: readonly string[]): Promise<Map<string, FichaDeLaLlegada>> {
  if (!companyIds.length) return new Map();
  const conExploraciones = modeloDisponible(prisma.exploracionDeVenta);
  const clientes = await prisma.client.findMany({
    where: { hubspotCompanyId: { in: [...companyIds] } },
    select: {
      id: true,
      hubspotCompanyId: true,
      kind: true,
      ...(conExploraciones
        ? { exploracionesDeVenta: { where: { projectId: null }, orderBy: { createdAt: "desc" as const }, select: { id: true, archivadaEn: true }, take: 1 } }
        : {}),
    },
  });
  const out = new Map<string, FichaDeLaLlegada>();
  for (const c of clientes) {
    if (!c.hubspotCompanyId) continue;
    const exp = (c as { exploracionesDeVenta?: { id: string; archivadaEn: Date | null }[] }).exploracionesDeVenta?.[0];
    out.set(c.hubspotCompanyId, { clientId: c.id, kind: c.kind, preventa: exp ? { id: exp.id, archivada: exp.archivadaEn !== null } : null });
  }
  return out;
}

export interface FilaDelReporte {
  companyId: string;
  empresa: string;
  porArea: LlegadaPorElTest["porArea"];
  terminado: boolean;
  fecha: string;
  intentos: number;
  ficha: FichaDeLaLlegada | null;
}

export interface ReporteDeLeadsDelTest {
  filas: FilaDelReporte[];
  sinEmpresa: LlegadaSinEmpresa[];
  totales: {
    empresas: number;
    terminaron: number;
    /** Empresas con dos o más áreas del test. */
    variasAreas: number;
    /** Empresas que pasaron a preventa (tienen o tuvieron una). */
    aPreventa: number;
    intentosSinEmpresa: number;
  };
}

/** El reporte de Marketing: cuántas empresas llegaron por el test, con cuántas áreas y cuántas pasaron a preventa. */
export async function reporteDeLeadsDelTest(ahora = new Date()): Promise<ReporteDeLeadsDelTest | null> {
  const datos = await llegadasDelTest(ahora);
  if (!datos) return null;
  const fichas = await fichasDeLasLlegadas(datos.llegadas.map((l) => l.companyId));
  // Las de Smarteam y las aliadas no son leads (igual que «Llegaron por el test»).
  const filas: FilaDelReporte[] = datos.llegadas
    .map((l) => ({ companyId: l.companyId, empresa: l.empresa, porArea: l.porArea, terminado: l.terminado, fecha: l.fecha, intentos: l.intentos, ficha: fichas.get(l.companyId) ?? null }))
    .filter((f) => f.ficha?.kind !== "INTERNO" && f.ficha?.kind !== "ALIADO");
  return {
    filas,
    sinEmpresa: datos.sinEmpresaPorDominio,
    totales: {
      empresas: filas.length,
      terminaron: filas.filter((f) => f.terminado).length,
      variasAreas: filas.filter((f) => f.porArea.filter((a) => a.areaId).length >= 2).length,
      aPreventa: filas.filter((f) => f.ficha?.preventa).length,
      intentosSinEmpresa: datos.sinEmpresa,
    },
  };
}
