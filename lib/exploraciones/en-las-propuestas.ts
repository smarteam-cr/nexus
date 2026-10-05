/**
 * lib/exploraciones/en-las-propuestas.ts — la preventa USADA por una propuesta. SERVIDOR.
 *
 * Pedido de Elías (2026-10-05): «se deben poder hacer propuestas exista o no una preventa». Hasta
 * acá la única unión era nacer desde el lienzo (`armarPropuesta`); medido ese día en producción, 0
 * de 37 propuestas estaban unidas a una preventa, y CreditForce tenía las dos sin unir. Ahora se une
 * desde los DOS lados —el contexto de la propuesta ofrece las preventas de su empresa, y el paso
 * «Propuesta» de la preventa lista las propuestas de la empresa— y las dos puertas escriben por
 * `usarPreventa`.
 *
 * Reglas:
 *   · Una propuesta usa UNA preventa (`BusinessCase.exploracionId`); una preventa, varias propuestas.
 *   · Solo de la MISMA empresa: con otra, la propuesta hablaría de las metas de otro cliente.
 *   · Usarla no toca lo subido: la próxima generación la lee (por `paraLaPropuesta`, sin lo interno).
 *   · Al usarla quedan marcados los casos de uso que la preventa eligió, como al nacer del lienzo.
 *
 * El resumen de la columna «Preventa» es el MISMO para el handoff y para la propuesta: dos lecturas
 * del mismo hecho no pueden decir cosas distintas. Lo interno llega solo a esa pantalla (interna).
 */
import "server-only";
import { modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import type { Meta } from "./casillas";
import { listaParaProponer } from "./calidad";
import { internoParaElCse } from "./para-el-handoff";
import { chequeoDe, escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, exploracionParaLaPropuesta } from "./servidor";

/** Lo que pinta la columna «Preventa» del contexto (components/clients/ExploracionDeVentaColumn.tsx). */
export interface ResumenParaElContexto {
  id: string;
  edicion: string | null;
  areas: { nombre: string; base: string | null; produccion: string | null; objetivo: string | null }[];
  metas: string[];
  casosDeUso: string[];
  interno: { etiqueta: string; lineas: string[] }[];
  puedeAbrir: boolean;
}

export async function resumenParaElContexto(exploracionId: string, puedeAbrir: boolean): Promise<ResumenParaElContexto | null> {
  const datos = await exploracionParaLaPropuesta(exploracionId);
  if (!datos) return null;
  const { estado, escala, chequeo } = datos;
  const nivel = (l: string | null) => (l ? (escala.niveles.find((n) => n.letra === l)?.nombre ?? l) : null);
  const metas = ((estado.contenido.casillas.metas ?? []) as Meta[]).map((m) =>
    [m.que, m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).join(" "),
  );
  return {
    id: exploracionId,
    edicion: escala.edicion?.nombre ?? null,
    areas: chequeo.areas.map((a) => ({
      nombre: a.nombre,
      base: nivel(a.capas.base.nivel),
      produccion: nivel(a.capas.produccion.nivel),
      objetivo: nivel(a.objetivo),
    })),
    metas,
    casosDeUso: Object.values(estado.contenido.casosDeUso).map((c) => c.titulo),
    interno: internoParaElCse(estado, escala),
    puedeAbrir,
  };
}

/** Una preventa de la empresa, como se ofrece para usarla. */
export interface PreventaDisponible {
  id: string;
  /** Quien la lleva (nombre, o el correo si no está en el equipo). */
  responsable: string | null;
  actualizadaEn: string;
  /** Las áreas en juego, por nombre («Marketing y Ventas»). */
  areas: string[];
  /** «Lista para proponer»: cuántos de los puntos están cumplidos. null sin escala publicada. */
  lista: { cumplidos: number; total: number } | null;
}

/** Las preventas vivas de la empresa, la más reciente primero. Sin la tabla, ninguna. */
export async function preventasDeLaEmpresa(clientId: string): Promise<PreventaDisponible[]> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return [];
  const filas = await prisma.exploracionDeVenta.findMany({
    where: { clientId, archivadaEn: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      contenido: true,
      propuesta: true,
      areas: true,
      edicion: true,
      perfilCierre: true,
      perfilDespues: true,
      responsableEmail: true,
      archivadaEn: true,
      updatedAt: true,
    },
  });
  if (filas.length === 0) return [];
  const [vigente, equipo] = await Promise.all([
    escalaParaExplorar(),
    prisma.teamMember.findMany({
      where: { email: { in: filas.map((f) => f.responsableEmail).filter((e): e is string => !!e) } },
      select: { email: true, name: true },
    }),
  ]);
  const nombre = new Map(equipo.map((m) => [m.email.toLowerCase(), m.name]));
  return filas.map((f) => {
    const estado = estadoDesdeFila(f);
    let areas: string[] = [];
    let lista: PreventaDisponible["lista"] = null;
    if (vigente.estado === "ok") {
      const escala = escalaDeLaExploracion(vigente.general, estado);
      areas = estado.areas.map((id) => escala.areas.find((a) => a.id === id)?.nombre).filter((n): n is string => !!n);
      const puntos = listaParaProponer(estado, chequeoDe(escala, estado));
      lista = { cumplidos: puntos.filter((p) => p.cumplido).length, total: puntos.length };
    }
    const resp = f.responsableEmail?.toLowerCase() ?? null;
    return {
      id: f.id,
      responsable: resp ? (nombre.get(resp) ?? resp) : null,
      actualizadaEn: f.updatedAt.toISOString(),
      areas,
      lista,
    };
  });
}

export type ResultadoDeUsar = { ok: true } | { ok: false; status: number; error: string };

/**
 * Une (o desune, con `exploracionId` null) una propuesta con una preventa de SU empresa. Al unirla
 * marca los casos de uso que la preventa eligió y que la propuesta todavía no tiene: no desmarca ni
 * pisa el precio de los que el vendedor ya tocó.
 *
 * Los casos se suman con `createMany` + `skipDuplicates` (ON CONFLICT DO NOTHING): si dos pedidos
 * unen la misma preventa a la vez, el segundo ya no choca con `@@unique([businessCaseId, useCaseId])`
 * (antes era un P2002 y un 500), y la fila que ya estaba queda como estaba (`selected`, `priceOverride`).
 */
export async function usarPreventa(businessCaseId: string, exploracionId: string | null): Promise<ResultadoDeUsar> {
  const bc = await prisma.businessCase.findUnique({ where: { id: businessCaseId }, select: { clientId: true } });
  if (!bc) return { ok: false, status: 404, error: "Esa propuesta no existe." };

  if (exploracionId === null) {
    await prisma.businessCase.update({ where: { id: businessCaseId }, data: { exploracionId: null } });
    return { ok: true };
  }

  if (!modeloDisponible(prisma.exploracionDeVenta)) return { ok: false, status: 503, error: "Las preventas no están disponibles." };
  const exp = await prisma.exploracionDeVenta.findUnique({
    where: { id: exploracionId },
    select: {
      clientId: true,
      contenido: true,
      propuesta: true,
      areas: true,
      edicion: true,
      perfilCierre: true,
      perfilDespues: true,
      responsableEmail: true,
      archivadaEn: true,
    },
  });
  if (!exp) return { ok: false, status: 404, error: "Esa preventa no existe." };
  if (exp.clientId !== bc.clientId) return { ok: false, status: 400, error: "Esa preventa es de otra empresa." };
  if (exp.archivadaEn) return { ok: false, status: 409, error: "La preventa está archivada." };

  const elegidos = Object.keys(estadoDesdeFila(exp).contenido.casosDeUso);
  const [delCatalogo, yaTiene] = await Promise.all([
    elegidos.length
      ? prisma.useCase.findMany({ where: { id: { in: elegidos } }, select: { id: true } }).catch(() => [])
      : Promise.resolve([]),
    prisma.businessCaseUseCase.findMany({ where: { businessCaseId }, select: { useCaseId: true } }).catch(() => []),
  ]);
  const tiene = new Set(yaTiene.map((u) => u.useCaseId));
  const nuevos = delCatalogo.map((u) => u.id).filter((id) => !tiene.has(id));

  await prisma.$transaction([
    prisma.businessCase.update({ where: { id: businessCaseId }, data: { exploracionId } }),
    ...(nuevos.length
      ? [
          prisma.businessCaseUseCase.createMany({
            data: nuevos.map((useCaseId) => ({ businessCaseId, useCaseId, selected: true })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
  return { ok: true };
}

/** Una propuesta de la empresa, vista desde la preventa. */
export interface PropuestaDeLaEmpresa {
  id: string;
  nombre: string;
  estado: string;
  creadaEn: string;
  arma: string | null;
  /** Usa ESTA preventa · usa otra · ninguna. */
  uso: "esta" | "otra" | "ninguna";
}

/** Las propuestas de la empresa de la preventa (las que la usan y las que no), la más nueva primero. */
export async function propuestasDeLaEmpresa(exploracionId: string): Promise<PropuestaDeLaEmpresa[]> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return [];
  const exp = await prisma.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { clientId: true } });
  if (!exp) return [];
  const filas = await prisma.businessCase.findMany({
    where: { clientId: exp.clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, createdAt: true, createdByEmail: true, exploracionId: true },
  });
  const correos = [...new Set(filas.map((f) => f.createdByEmail?.toLowerCase()).filter((e): e is string => !!e))];
  const equipo = correos.length
    ? await prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } })
    : [];
  const nombre = new Map(equipo.map((m) => [m.email.toLowerCase(), m.name]));
  return filas.map((f) => {
    const autor = f.createdByEmail?.toLowerCase() ?? null;
    return {
      id: f.id,
      nombre: f.name,
      estado: f.status,
      creadaEn: f.createdAt.toISOString(),
      arma: autor ? (nombre.get(autor) ?? autor) : null,
      uso: f.exploracionId === exploracionId ? "esta" : f.exploracionId ? "otra" : "ninguna",
    };
  });
}
