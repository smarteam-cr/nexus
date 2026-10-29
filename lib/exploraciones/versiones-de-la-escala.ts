import "server-only";

/**
 * lib/exploraciones/versiones-de-la-escala.ts — la escala de la empresa EN EL TIEMPO. SERVIDOR.
 *
 * Ficha B (2026-10-17). El ÚNICO escritor de `VersionDeLaEscala`. Cada versión es una foto de lo confirmado de una
 * exploración (lib/exploraciones/foto-de-la-escala.ts), con su fecha y por qué se guardó:
 *   · `cambio`: alguien confirmó un nivel (la ruta de la exploración llama acá después de guardar). Una por
 *     exploración y por día: la del día se actualiza, así una tarde de trabajo no deja veinte versiones.
 *   · `diagnostico`: se presentó el diagnóstico de un proyecto; con el ciclo abierto, si es un servicio recurrente.
 *   · `manual`: «Guardar esta versión», en la ficha del cliente.
 * Una foto igual a la última de esa exploración no se guarda (salvo el diagnóstico, «Guardar esta versión» con una nota
 * o con un momento del pasado), y una sin ningún nivel tampoco.
 *
 * Desde el 2026-10-18 («Actualizar escala»), cada versión dice también de qué VENTA y de qué PROPUESTA sale, y de qué
 * MOMENTO es la posición («al vender», «al arrancar», «hoy», con su día: `diaDeLaPosicion`). Sin decirlo, la venta sale
 * sola del proyecto (su trato de HubSpot) y la propuesta, de la venta. Ver DECISIONS «Actualizar escala». Se decide con un candado por exploración (`pg_advisory_xact_lock`), leyendo la
 * exploración y la última versión dentro de la misma transacción.
 *
 * Nunca rompe a quien la llama: sin la tabla (falta el SQL) dice `sin-tabla` y sigue.
 */
import type { Prisma } from "@prisma/client";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { hoyEnCostaRica } from "./fechas";
import { ordenarVersiones, type MomentoDeLaVersion } from "./posicionar";
import { fotoDeLaExploracion, huellaDeLaFoto, leerFoto, type FotoDeLaEscala, type OrigenDeLaVersion } from "./foto-de-la-escala";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila } from "./servidor";

export const SQL_DE_LAS_VERSIONES = "scripts/sql/2026-10-17-ficha-b-versiones-de-la-escala.sql";
/** Las columnas de la venta y el momento (2026-10-18). */
export const SQL_DE_LA_VENTA = "scripts/sql/2026-10-18-escala-ligada-a-la-venta.sql";

export type ResultadoDeGuardar =
  | { estado: "guardada"; id: string; nueva: boolean }
  | { estado: "igual"; id: string }
  | { estado: "sin-nivel" }
  | { estado: "sin-tabla" }
  | { estado: "no-existe" };

const hayTabla = () => modeloDisponible(prisma.versionDeLaEscala);

export async function guardarVersionDeLaEscala(
  exploracionId: string,
  o: {
    origen: OrigenDeLaVersion;
    email: string | null;
    cicloId?: string | null;
    nota?: string | null;
    hoy?: string;
    /** La venta (VentaGanada) de la que sale. Sin decirlo, la del trato de HubSpot del proyecto, si la hay. */
    ventaGanadaId?: string | null;
    /** De qué momento es la posición y su día (AAAA-MM-DD). Sin decirlo, «hoy». */
    momento?: MomentoDeLaVersion | null;
    diaDeLaPosicion?: string | null;
  },
): Promise<ResultadoDeGuardar> {
  if (!hayTabla()) return { estado: "sin-tabla" };
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") return { estado: "sin-nivel" };
  if (!modeloDisponible(prisma.exploracionDeVenta)) return { estado: "no-existe" };
  const dia = o.hoy ?? hoyEnCostaRica();
  const nota = o.nota?.trim() ? o.nota.trim().slice(0, 500) : null;
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Una a la vez por exploración: dos confirmaciones seguidas (o una llamada lenta) leían la misma «última» y
        // dejaban dos versiones del mismo día, o una foto vieja encima de una nueva. El candado vive lo que la transacción.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`versiones-de-la-escala:${exploracionId}`}::text))::text AS ok`;
        // La exploración y la última versión se leen ADENTRO, con el candado tomado: la foto es la de este momento.
        const fila = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: SELECT_PARA_LA_FOTO });
        if (!fila) return { estado: "no-existe" } as const;
        const estado = estadoDesdeFila(fila);
        const foto = fotoDeLaExploracion(escalaDeLaExploracion(general.general, estado), estado);
        if (!foto.areas.length) return { estado: "sin-nivel" } as const;
        const huella = huellaDeLaFoto(foto);
        const ultima = await tx.versionDeLaEscala.findFirst({
          where: { exploracionId },
          orderBy: { createdAt: "desc" },
          select: { id: true, huella: true, dia: true, origen: true },
        });
        // La misma foto no se guarda dos veces; el diagnóstico sí deja la suya aunque nada haya cambiado (marca el ciclo),
        // y «Guardar esta versión» con una nota también: la nota es lo que se quería guardar.
        // Un momento del pasado («al vender», «al arrancar») también: es otra posición, aunque los niveles sean los mismos.
        const delPasado = !!o.momento && o.momento !== "hoy";
        const dejaLaSuya = o.origen === "diagnostico" || (o.origen === "manual" && (!!nota || delPasado));
        if (ultima && ultima.huella === huella && !dejaLaSuya) return { estado: "igual", id: ultima.id } as const;
        const venta = await ventaDeLaVersion(tx, { clientId: fila.clientId, projectId: fila.projectId, ventaGanadaId: o.ventaGanadaId });
        const datos = {
          foto: foto as unknown as Prisma.InputJsonValue,
          huella,
          escalaVersion: foto.escalaVersion,
          edicion: foto.edicion,
          ventaGanadaId: venta.ventaGanadaId,
          hubspotDealId: venta.hubspotDealId,
          businessCaseId: venta.businessCaseId,
        };
        if (ultima && o.origen === "cambio" && ultima.origen === "cambio" && ultima.dia === dia) {
          await tx.versionDeLaEscala.update({ where: { id: ultima.id }, data: { ...datos, creadoPorEmail: o.email } });
          return { estado: "guardada", id: ultima.id, nueva: false } as const;
        }
        const creada = await tx.versionDeLaEscala.create({
          data: {
            ...datos,
            clientId: fila.clientId,
            exploracionId,
            projectId: fila.projectId,
            cicloId: o.cicloId ?? null,
            origen: o.origen,
            dia,
            momento: o.momento ?? null,
            diaDeLaPosicion: o.diaDeLaPosicion ?? (o.momento ? dia : null),
            creadoPorEmail: o.email,
            nota,
          },
          select: { id: true },
        });
        return { estado: "guardada", id: creada.id, nueva: true } as const;
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tabla" };
    throw e;
  }
}

/**
 * De qué venta sale una versión: la que se eligió o, sin elegir, la del trato de HubSpot del proyecto. La propuesta
 * comercial sale de esa venta (mismo trato y misma empresa). Todo null si no hay. Nunca una venta de otra empresa.
 */
async function ventaDeLaVersion(
  tx: Prisma.TransactionClient,
  o: { clientId: string; projectId: string | null; ventaGanadaId?: string | null },
): Promise<{ ventaGanadaId: string | null; hubspotDealId: string | null; businessCaseId: string | null }> {
  let venta: { id: string; hubspotDealId: string } | null = null;
  let dealId: string | null = null;
  if (o.ventaGanadaId) {
    venta = await tx.ventaGanada.findFirst({ where: { id: o.ventaGanadaId, clientId: o.clientId }, select: { id: true, hubspotDealId: true } });
  } else if (o.ventaGanadaId === undefined && o.projectId) {
    dealId = (await tx.project.findUnique({ where: { id: o.projectId }, select: { hubspotDealId: true } }))?.hubspotDealId ?? null;
    if (dealId) venta = await tx.ventaGanada.findFirst({ where: { hubspotDealId: dealId, clientId: o.clientId }, select: { id: true, hubspotDealId: true } });
  }
  const trato = venta?.hubspotDealId ?? dealId;
  const propuesta = trato
    ? await tx.businessCase.findFirst({ where: { hubspotDealId: trato, clientId: o.clientId }, orderBy: { updatedAt: "desc" }, select: { id: true } })
    : null;
  return { ventaGanadaId: venta?.id ?? null, hubspotDealId: trato, businessCaseId: propuesta?.id ?? null };
}

/** Lo que la foto necesita de la exploración (lo que lee `estadoDesdeFila`) y a quién se cuelga la versión. */
const SELECT_PARA_LA_FOTO = {
  clientId: true,
  projectId: true,
  contenido: true,
  propuesta: true,
  areas: true,
  edicion: true,
  perfilCierre: true,
  perfilDespues: true,
  responsableEmail: true,
  archivadaEn: true,
} satisfies Prisma.ExploracionDeVentaSelect;

/** Después de guardar un cambio confirmado: deja la versión del día, sin frenar ni romper la respuesta. */
export function anotarVersionDelCambio(exploracionId: string, email: string | null): void {
  void guardarVersionDeLaEscala(exploracionId, { origen: "cambio", email }).catch((e) =>
    console.error(`[exploraciones/versiones] no se guardó la versión de ${exploracionId}`, e),
  );
}

/**
 * Al presentar el diagnóstico de un proyecto: la foto de su exploración, con el ciclo abierto si es un servicio
 * recurrente. Sin exploración (o sin ningún nivel confirmado) no hay foto: lo dice y sigue.
 */
export async function guardarVersionDelDiagnostico(projectId: string, email: string | null): Promise<ResultadoDeGuardar> {
  if (!hayTabla() || !modeloDisponible(prisma.exploracionDeVenta)) return { estado: "sin-tabla" };
  try {
    const exp = await prisma.exploracionDeVenta.findFirst({ where: { projectId, archivadaEn: null }, select: { id: true } });
    if (!exp) return { estado: "no-existe" };
    const ciclo = modeloDisponible(prisma.cicloDeProyecto)
      ? await prisma.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { id: true } }).catch(() => null)
      : null;
    return guardarVersionDeLaEscala(exp.id, { origen: "diagnostico", email, cicloId: ciclo?.id ?? null });
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tabla" };
    throw e;
  }
}

export interface VersionGuardada {
  id: string;
  exploracionId: string | null;
  proyecto: { id: string; nombre: string } | null;
  ciclo: { id: string; numero: number } | null;
  origen: OrigenDeLaVersion;
  /** ISO de la última vez que se tocó (la del día se actualiza). */
  fecha: string;
  dia: string;
  creadoPorEmail: string | null;
  nota: string | null;
  foto: FotoDeLaEscala;
  /** De qué venta y de qué propuesta sale (2026-10-18). null en las de antes. */
  venta: { id: string; nombre: string; fechaCierre: string } | null;
  propuesta: { id: string; nombre: string } | null;
  /** De qué momento es la posición y su día. null en las de antes (= el día en que se guardó). */
  momento: MomentoDeLaVersion | null;
  diaDeLaPosicion: string | null;
}

const MOMENTOS: readonly string[] = ["al-vender", "al-arrancar", "hoy"];

const ORIGENES: readonly string[] = ["cambio", "diagnostico", "manual"];

/** Las versiones de la empresa, de la más nueva a la más vieja. [] sin la tabla. */
export async function versionesDeLaEmpresa(clientId: string, take = 40): Promise<VersionGuardada[]> {
  if (!hayTabla()) return [];
  try {
    const filas = await prisma.versionDeLaEscala.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        exploracionId: true,
        origen: true,
        dia: true,
        updatedAt: true,
        creadoPorEmail: true,
        nota: true,
        foto: true,
        project: { select: { id: true, name: true } },
        ciclo: { select: { id: true, numero: true } },
        momento: true,
        diaDeLaPosicion: true,
        ventaGanada: { select: { id: true, nombre: true, fechaCierre: true } },
        businessCase: { select: { id: true, name: true } },
      },
    });
    const versiones = filas.flatMap((f): VersionGuardada[] => {
      const foto = leerFoto(f.foto);
      if (!foto) return [];
      return [
        {
          id: f.id,
          exploracionId: f.exploracionId,
          proyecto: f.project ? { id: f.project.id, nombre: f.project.name } : null,
          ciclo: f.ciclo ? { id: f.ciclo.id, numero: f.ciclo.numero } : null,
          origen: (ORIGENES.includes(f.origen) ? f.origen : "cambio") as OrigenDeLaVersion,
          fecha: f.updatedAt.toISOString(),
          dia: f.dia,
          creadoPorEmail: f.creadoPorEmail,
          nota: f.nota,
          foto,
          venta: f.ventaGanada ? { id: f.ventaGanada.id, nombre: f.ventaGanada.nombre, fechaCierre: f.ventaGanada.fechaCierre.toISOString().slice(0, 10) } : null,
          propuesta: f.businessCase ? { id: f.businessCase.id, nombre: f.businessCase.name } : null,
          momento: f.momento && MOMENTOS.includes(f.momento) ? (f.momento as MomentoDeLaVersion) : null,
          diaDeLaPosicion: f.diaDeLaPosicion,
        },
      ];
    });
    // La más nueva POSICIÓN primero: una versión «al vender» de hoy va donde le toca en el tiempo.
    return ordenarVersiones(versiones);
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/**
 * La última versión de esta exploración de ANTES de hoy: contra ella se mide «qué cambió» en la preventa. null si no
 * hay (todavía no se guardó ninguna, o falta el SQL).
 */
export async function versionAnteriorDeLaExploracion(exploracionId: string, hoy = hoyEnCostaRica()): Promise<{ dia: string; foto: FotoDeLaEscala } | null> {
  if (!hayTabla()) return null;
  try {
    const f = await prisma.versionDeLaEscala.findFirst({
      where: { exploracionId, dia: { lt: hoy } },
      orderBy: { createdAt: "desc" },
      select: { dia: true, foto: true },
    });
    const foto = f ? leerFoto(f.foto) : null;
    return f && foto ? { dia: f.dia, foto } : null;
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

/**
 * ¿La exploración ya guardó alguna versión? (escala única, 2026-10-28). La escala de la cuenta parte de la preventa solo
 * si nunca midió nada: una que tuvo niveles y alguien se los sacó no se vuelve a llenar sola.
 */
export async function tieneVersiones(exploracionId: string): Promise<boolean> {
  if (!hayTabla()) return false;
  try {
    return !!(await prisma.versionDeLaEscala.findFirst({ where: { exploracionId }, select: { id: true } }));
  } catch (e) {
    if (esquemaDesactualizado(e)) return false;
    throw e;
  }
}
