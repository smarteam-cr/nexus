/**
 * lib/tareas/para-agentes.ts — la ÚNICA puerta por la que un agente INTERNO lee tareas. SERVIDOR.
 *
 * La frontera Tareas ↔ agentes (memoria de la cuenta, etapa 2; DECISIONS «La lectura de cada reunión es durable…»):
 * desde que los compromisos de una reunión son tareas, el vigía (y después la memoria interna del proyecto y el avance)
 * necesita saber qué se prometió y qué venció. Le llega una PROYECCIÓN y nada más:
 *   · el título (recortado), para cuándo, el estado y el lado (lo prometió el cliente o es trabajo de Smarteam);
 *   · nunca el texto de la reunión, el contexto, las notas ni los pasos: eso se sirve a PERSONAS, con su regla
 *     (lib/tareas/serializar.ts);
 *   · nunca lo privado («Solo para mí»), lo de un espacio libre de «solo miembros» ni el borrador de un plan del chat:
 *     lo que escribe un agente lo leen otras personas (una alerta la ve quien lidera Customer Success).
 * Nada que ve el cliente pasa por acá, y ningún agente lee las tablas de Tareas por su cuenta: lo vigila el censo de
 * lib/tareas/guardas.test.ts. La lectura de seguimiento de cada reunión (lib/sessions/post-process.ts) también es un
 * agente: los títulos que manda como «YA SON TAREAS» salen de acá (`titulosParaLaLectura`).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { aDate, comoFecha, hoyEnCostaRica } from "./semana";
import { tareasDisponible } from "./servidor";

/** De quién es el compromiso: una tarea de seguimiento de lo que prometió el cliente, o trabajo de Smarteam. */
export type LadoDelCompromiso = "cliente" | "smarteam";

/** El estado, en palabras para un modelo. Una propuesta todavía no la decidió nadie. */
export type EstadoParaAgente = "sin decidir" | "pendiente" | "en curso";

/** Lo único que un agente interno sabe de una tarea. */
export interface TareaParaAgente {
  titulo: string;
  /** AAAA-MM-DD, o null si no tiene fecha. */
  venceEl: string | null;
  estado: EstadoParaAgente;
  lado: LadoDelCompromiso;
}

/** Hasta cuántos caracteres del título llegan al modelo (lo mismo que leía el vigía de un pendiente). */
export const TOPE_DEL_TITULO = 160;

/** Cuántas tareas, como mucho, por pedido. */
export const TOPE_DE_TAREAS = 10;

/** Lo que se pide a la base: el título, la fecha, el estado y el evento de nacimiento (de ahí sale el lado). */
const SELECT_PARA_AGENTES = {
  titulo: true,
  venceEl: true,
  estado: true,
  lado: true,
  eventos: {
    where: { tipo: { in: ["propuesta", "creada"] } },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { datos: true },
  },
} satisfies Prisma.TareaSelect;

type FilaParaAgente = Prisma.TareaGetPayload<{ select: typeof SELECT_PARA_AGENTES }>;

/**
 * Las tareas que un agente puede ver: ni archivadas, ni privadas, ni de un espacio de «solo miembros», ni del borrador
 * de un plan (todavía no le llegaron a nadie). Con OR y no con NOT a secas: un `NOT` sobre la relación deja afuera las
 * tareas sin proyecto.
 */
export const VISIBLES_PARA_AGENTES = {
  archivadaAt: null,
  privada: false,
  OR: [
    { proyectoId: null },
    {
      proyecto: {
        NOT: [{ espacio: { tipo: "libre", visibilidad: "miembros" } }, { estado: "propuesta", origen: { in: ["chat", "plantilla"] } }],
      },
    },
  ],
} satisfies Prisma.TareaWhereInput;

/** Las abiertas de esas (propuestas, pendientes y en curso). */
export const ABIERTAS_PARA_AGENTES = {
  ...VISIBLES_PARA_AGENTES,
  estado: { in: ["propuesta", "pendiente", "en_curso"] },
} satisfies Prisma.TareaWhereInput;

const ESTADO_PARA_AGENTE: Record<string, EstadoParaAgente> = { propuesta: "sin decidir", pendiente: "pendiente", en_curso: "en curso" };

/** PURO: una fila a lo que lee el agente. El lado sale de su columna (o, en lo de antes, del evento con que nació). */
export function aTareaParaAgente(f: FilaParaAgente): TareaParaAgente {
  // El lado vive en su columna desde el 2026-10-16 (fase 0.2); lo de antes, en el evento con que nació.
  const datos = f.eventos[0]?.datos;
  const delEvento = datos && typeof datos === "object" && !Array.isArray(datos) && (datos as Record<string, unknown>).lado === "cliente";
  const lado = f.lado === "cliente" || delEvento ? "cliente" : "smarteam";
  const titulo = f.titulo.trim();
  return {
    titulo: titulo.length > TOPE_DEL_TITULO ? `${titulo.slice(0, TOPE_DEL_TITULO - 1).trimEnd()}…` : titulo,
    venceEl: comoFecha(f.venceEl),
    estado: ESTADO_PARA_AGENTE[f.estado] ?? "pendiente",
    lado,
  };
}

/** Sin las tablas de Tareas (o con el cliente Prisma de antes), el agente sigue sin este bloque: nunca se cae. */
async function seguro(leer: () => Promise<FilaParaAgente[]>): Promise<FilaParaAgente[]> {
  if (!(await tareasDisponible())) return [];
  try {
    return await leer();
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/**
 * Los compromisos VENCIDOS de un proyecto para el vigía (lib/cs/watchdog-context.ts): abiertos, con fecha anterior a
 * hoy (hora de Costa Rica), el más viejo primero, hasta 10.
 */
export async function pendientesVencidosParaElVigia(projectId: string, ahora = new Date()): Promise<TareaParaAgente[]> {
  const hoy = aDate(hoyEnCostaRica(ahora));
  const filas = await seguro(() =>
    prisma.tarea.findMany({
      where: { ...ABIERTAS_PARA_AGENTES, projectId, venceEl: { lt: hoy } },
      orderBy: [{ venceEl: "asc" }, { numero: "asc" }],
      take: TOPE_DE_TAREAS,
      select: SELECT_PARA_AGENTES,
    }),
  );
  return filas.map(aTareaParaAgente);
}

/**
 * Los compromisos ABIERTOS de un proyecto (vencidos o no), para la memoria interna del proyecto y el avance (etapa 3 en
 * adelante): la que vence antes primero, las sin fecha al final, hasta `tope` (como mucho 30).
 */
export async function compromisosAbiertosParaAgentes(projectId: string, tope = TOPE_DE_TAREAS): Promise<TareaParaAgente[]> {
  const filas = await seguro(() =>
    prisma.tarea.findMany({
      where: { ...ABIERTAS_PARA_AGENTES, projectId },
      orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
      take: Math.min(Math.max(1, tope), 30),
      select: SELECT_PARA_AGENTES,
    }),
  );
  return filas.map(aTareaParaAgente);
}

/**
 * Los compromisos ABIERTOS de una CUENTA que no son de un proyecto (iniciativa B, 2026-10-18): lo que se prometió por
 * correo o en una reunión sin proyecto, para la memoria interna de la cuenta. Los de un proyecto ya van en la memoria
 * del proyecto. Solo los que salieron de lo prometido al cliente (`origen = "correo"` o la lectura de seguimiento de una
 * reunión, `:seg-`). La que vence antes primero, hasta `tope` (como mucho 30).
 */
export async function compromisosDeLaCuentaParaAgentes(clientId: string, tope = TOPE_DE_TAREAS): Promise<TareaParaAgente[]> {
  const filas = await seguro(() =>
    prisma.tarea.findMany({
      where: { ...ABIERTAS_PARA_AGENTES, clientId, projectId: null, AND: [{ OR: [{ origen: "correo" }, { origenId: { contains: ":seg-" } }] }] },
      orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
      take: Math.min(Math.max(1, tope), 30),
      select: SELECT_PARA_AGENTES,
    }),
  );
  return filas.map(aTareaParaAgente);
}

/**
 * Las tareas ABIERTAS de una CUENTA (de cualquier proyecto o sin proyecto), para «Actualizar escala» (La cuenta › La
 * escala, lib/exploraciones/posicionar-fuentes.ts): qué se está haciendo y qué prometió el cliente. La que vence antes
 * primero, hasta `tope` (como mucho 30). Con las mismas exclusiones que el resto de la puerta.
 */
export async function tareasDeLaCuentaParaAgentes(clientId: string, tope = 20): Promise<TareaParaAgente[]> {
  const filas = await seguro(() =>
    prisma.tarea.findMany({
      where: { ...ABIERTAS_PARA_AGENTES, clientId },
      orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
      take: Math.min(Math.max(1, tope), 30),
      select: SELECT_PARA_AGENTES,
    }),
  );
  return filas.map(aTareaParaAgente);
}

/**
 * Los TÍTULOS que la lectura de seguimiento de una reunión manda al modelo como «YA SON TAREAS», para no proponer lo
 * mismo otra vez (lib/sessions/post-process.ts): lo de esta reunión (cualquier estado: lo descartado tampoco se vuelve
 * a proponer) y lo abierto con el cliente. Solo el título, recortado; con las mismas exclusiones que el resto de la
 * puerta. Sin las tablas de Tareas, vacío.
 */
export async function titulosParaLaLectura(o: { clientId: string; sessionId: string }, topes = { reunion: 30, cliente: 15 }): Promise<string[]> {
  if (!(await tareasDisponible())) return [];
  const recortar = (t: string) => {
    const x = t.trim();
    return x.length > TOPE_DEL_TITULO ? `${x.slice(0, TOPE_DEL_TITULO - 1).trimEnd()}…` : x;
  };
  try {
    const [deLaReunion, abiertas] = await Promise.all([
      prisma.tarea.findMany({ where: { ...VISIBLES_PARA_AGENTES, sessionId: o.sessionId }, select: { titulo: true }, orderBy: { createdAt: "asc" }, take: topes.reunion }),
      prisma.tarea.findMany({ where: { ...ABIERTAS_PARA_AGENTES, clientId: o.clientId }, select: { titulo: true }, orderBy: { updatedAt: "desc" }, take: topes.cliente }),
    ]);
    return [...new Set([...deLaReunion, ...abiertas].map((f) => recortar(f.titulo)))];
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/** PURO: una línea del bloque del vigía. */
export function lineaParaElVigia(t: TareaParaAgente): string {
  const quien = t.lado === "cliente" ? "lo prometió el cliente" : "de Smarteam";
  return `- [venció ${t.venceEl ?? "—"}] ${t.titulo} (${quien} · ${t.estado})`;
}
