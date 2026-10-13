import "server-only";

/**
 * lib/exploraciones/escala-de-la-empresa.ts — LA ESCALA DE LA EMPRESA: dónde está en cada área, con la fecha y de dónde sale
 * (2026-10-12, pedido de Elías: «una sección general que sirva para las empresas que no vienen de preventa, o para
 * clientes que no están posicionados»). Es La cuenta › La escala.
 *
 * Primera versión: junta lo que ya existe, sin tabla nueva. Las posiciones salen de las exploraciones de la empresa —la
 * preventa y la de cada proyecto (La escala de la exploración, que es donde el CSE confirma cada nivel con su
 * evidencia)—, con la fecha de su última actualización. Un nivel propuesto por el agente que nadie confirmó no cuenta;
 * uno confirmado que salió del test o de una hipótesis cuenta como hipótesis, y se dice.
 *
 * Lo que falta (docs/smartloop-plan.md): guardar cada posición con su fecha cuando el Diagnóstico del ciclo la cierra,
 * para ver la escala en el tiempo ciclo tras ciclo.
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { chequeoDelMapa, posicionesDelMapa } from "./mapa";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila } from "./servidor";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";

export interface DimensionDeLaEmpresa {
  id: string;
  nombre: string;
  capa: ClaveDeCapa;
  nivel: Letra | null;
  /** `evidencia`: lo dijo el cliente, se vio o lo marcó quien exploró · `hipotesis`: del test o de una hipótesis. */
  clase: "evidencia" | "hipotesis" | null;
  /** Una dimensión que no aplica al perfil de la empresa no se cuenta. */
  aplica: boolean;
}

export interface AreaDeLaEmpresa {
  id: string;
  nombre: string;
  nivel: Letra | null;
  puntaje: number | null;
  capas: Record<ClaveDeCapa, { nombre: string; nivel: Letra | null }>;
  dimensiones: DimensionDeLaEmpresa[];
  /** Cuántas dimensiones que aplican tienen nivel. */
  conNivel: number;
  aplican: number;
}

export interface PosicionDeLaEmpresa {
  /** De qué exploración sale. */
  exploracionId: string;
  origen: "preventa" | "proyecto";
  /** El proyecto de la exploración (null en la preventa). */
  proyecto: { id: string; nombre: string } | null;
  /** Cuándo se tocó por última vez (ISO). */
  fecha: string;
  edicion: string | null;
  areas: AreaDeLaEmpresa[];
}

export type EscalaDeLaEmpresa =
  | {
      estado: "ok";
      niveles: { letra: Letra; nombre: string }[];
      /** De la más reciente a la más vieja; solo las que tienen algún nivel. */
      posiciones: PosicionDeLaEmpresa[];
      /** Los proyectos de la empresa (para ofrecer dónde posicionarla si no tiene posición). */
      proyectos: { id: string; nombre: string }[];
    }
  | { estado: "sin-escala" };

export async function escalaDeLaEmpresa(clientId: string): Promise<EscalaDeLaEmpresa> {
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") return { estado: "sin-escala" };

  const proyectos = await prisma.project.findMany({
    where: { clientId, status: { not: "completed" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  if (!modeloDisponible(prisma.exploracionDeVenta)) {
    return { estado: "ok", niveles: [], posiciones: [], proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.name })) };
  }

  let filas;
  try {
    // La preventa y las exploraciones de cada proyecto de esta empresa: TODAS son de la empresa (clientId).
    filas = await prisma.exploracionDeVenta.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        projectId: true,
        edicion: true,
        perfilCierre: true,
        perfilDespues: true,
        areas: true,
        contenido: true,
        propuesta: true,
        responsableEmail: true,
        archivadaEn: true,
        updatedAt: true,
        project: { select: { id: true, name: true } },
      },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "ok", niveles: [], posiciones: [], proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.name })) };
    throw e;
  }

  let niveles: { letra: Letra; nombre: string }[] = [];
  const posiciones: PosicionDeLaEmpresa[] = [];
  for (const f of filas) {
    const estado = estadoDesdeFila(f);
    const escala = escalaDeLaExploracion(general.general, estado);
    if (!niveles.length) niveles = escala.niveles;
    // Solo lo confirmado: lo que el agente propone y nadie usó no posiciona a la empresa.
    const pos = posicionesDelMapa(estado, []);
    const conAlgo = escala.areas.filter((a) => a.dimensiones.some((d) => pos[d.id]));
    if (!conAlgo.length) continue;
    const chequeo = chequeoDelMapa(escala, conAlgo.map((a) => a.id), pos);
    const nombreDeCapa = (c: ClaveDeCapa) => escala.capas.find((x) => x.clave === c)?.nombre ?? c;
    posiciones.push({
      exploracionId: f.id,
      origen: f.projectId ? "proyecto" : "preventa",
      proyecto: f.project ? { id: f.project.id, nombre: f.project.name } : null,
      fecha: f.updatedAt.toISOString(),
      edicion: escala.edicion?.nombre ?? null,
      areas: conAlgo.map((a) => {
        const r = chequeo.areas.find((x) => x.id === a.id);
        const dims: DimensionDeLaEmpresa[] = a.dimensiones.map((d) => ({
          id: d.id,
          nombre: d.nombre,
          capa: d.capa,
          nivel: pos[d.id]?.nivel ?? null,
          clase: pos[d.id]?.clase ?? null,
          aplica: d.aplica,
        }));
        const aplican = dims.filter((d) => d.aplica);
        return {
          id: a.id,
          nombre: a.nombre,
          nivel: r?.nivel ?? null,
          puntaje: r?.puntaje ?? null,
          capas: {
            base: { nombre: nombreDeCapa("base"), nivel: r?.capas.base.nivel ?? null },
            produccion: { nombre: nombreDeCapa("produccion"), nivel: r?.capas.produccion.nivel ?? null },
          },
          dimensiones: dims,
          conNivel: aplican.filter((d) => d.nivel).length,
          aplican: aplican.length,
        };
      }),
    });
  }

  return { estado: "ok", niveles, posiciones, proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.name })) };
}
