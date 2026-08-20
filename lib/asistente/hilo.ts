/**
 * lib/asistente/hilo.ts — LA CONVERSACIÓN DEL ASISTENTE, Y SU ÚNICO ESCRITOR.
 *
 * ── QUÉ ES ESTO Y QUÉ NO ES ──────────────────────────────────────────────────────────────────
 * El asistente conversa con el CSE sobre un documento (el cronograma, el kickoff, el handoff)
 * y, cuando hay acuerdo, EMITE UNA INSTRUCCIÓN. Este módulo guarda esa conversación: el hilo y
 * sus turnos. Nada más.
 *
 * ⛔ EL CHAT NO ESCRIBE EL DOCUMENTO. Aplicar un cambio sigue pasando por el editor de siempre
 * (`/timeline/assist`, `/canvas-assist`), con su vista previa y su aceptación por ítem. El
 * permiso vive en el botón, no en la conversación — un catálogo de herramientas que escriben
 * sería el modo de falla de `artifact-gate` multiplicado. La guarda de al lado
 * (`hilo.test.ts`) hace cumplir que ningún archivo de `lib/asistente/**` escriba en las tablas
 * del documento.
 *
 * ── POR QUÉ EL HILO SE GUARDA EN EL SERVIDOR ─────────────────────────────────────────────────
 * `ProjectCanvasPanel` se remonta con `key={activeProjectId}` y el canvas activo vive en
 * `?canvas=`: cambiar de pestaña tira el estado del navegador. Un hilo que solo viviera en
 * memoria se perdería solo, y la conversación es justamente lo que hace que el cambio se
 * consensúe ANTES de generarlo.
 *
 * ── LAS TRES DECISIONES QUE ESTE ARCHIVO HACE CUMPLIR ────────────────────────────────────────
 * 1. ⛔ **El modelo es FIJO POR HILO.** Es parte de la clave de la caché de prompt de Anthropic:
 *    cambiarlo a mitad de una conversación invalida la caché entera y se paga el prefijo de
 *    nuevo — sin error y sin log. Por eso `abrirHilo` con otro modelo NO reusa: abre uno nuevo.
 * 2. ⚠ **El contexto NO se guarda, solo su huella.** El prefijo se re-arma en cada turno.
 *    Guardar el texto son cientos de KB por día que nadie lee, y miente en cuanto el CSE
 *    confirma un bloque del handoff o toca una fase. Lo que sí se guarda es `shaDeContexto`:
 *    si cambió entre dos turnos, eso explica una respuesta que si no se lee como incoherente.
 * 3. ⚠ **`usuarioEmail` es NOT NULL**: el chat no tiene variante de sistema. (Contrasta con
 *    `BitacoraCobro.usuarioEmail`, que sí es nullable porque ahí las entradas automáticas
 *    existen de verdad.)
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { RolDeMensaje } from "@prisma/client";

export interface PedidoDeHilo {
  projectId: string;
  /** El slug de la pieza (`lib/pieces/registry.ts`), nunca el nombre visible del canvas. */
  pieza: string;
  usuarioEmail: string;
  modelo: string;
}

export interface TurnoDelHilo {
  id: string;
  rol: RolDeMensaje;
  contenido: string;
  shaDeContexto: string | null;
  createdAt: Date;
}

export interface HiloConTurnos {
  id: string;
  projectId: string;
  pieza: string;
  usuarioEmail: string;
  modelo: string;
  ultimoRunId: string | null;
  turnos: TurnoDelHilo[];
}

/** La decisión de reusar o abrir de nuevo, PURA para poder probarla sin base. */
export type DecisionDeHilo =
  | { accion: "reusar"; motivo: "mismo-modelo" }
  | { accion: "nuevo"; motivo: "sin-hilo" | "cambio-de-modelo" };

/**
 * ⛔ La regla del punto 1 del header, aislada: un hilo solo se reusa si su modelo es el que se
 * está pidiendo. Cambiar de modelo a mitad de camino no es una preferencia: invalida la caché
 * de prefijo entera, en silencio y sin error. Un hilo nuevo lo hace explícito y barato.
 */
export function decidirHilo(
  hiloVivo: { modelo: string } | null,
  modeloPedido: string,
): DecisionDeHilo {
  if (!hiloVivo) return { accion: "nuevo", motivo: "sin-hilo" };
  if (hiloVivo.modelo !== modeloPedido) return { accion: "nuevo", motivo: "cambio-de-modelo" };
  return { accion: "reusar", motivo: "mismo-modelo" };
}

/** La huella del prefijo de contexto. No guarda el texto: guarda que se pueda comparar. */
export function huellaDeContexto(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex").slice(0, 16);
}

const TURNOS_EN_ORDEN = {
  select: {
    id: true,
    rol: true,
    contenido: true,
    shaDeContexto: true,
    createdAt: true,
  },
  orderBy: { createdAt: "asc" },
} as const;

/**
 * El hilo vivo de (proyecto, pieza, persona) — el más reciente — o `null` si no hay ninguno.
 * No crea nada: sirve para pintar la conversación al abrir el panel.
 */
export async function hiloVivo(
  pedido: Omit<PedidoDeHilo, "modelo">,
): Promise<HiloConTurnos | null> {
  const hilo = await prisma.hiloDeChat.findFirst({
    where: {
      projectId: pedido.projectId,
      pieza: pedido.pieza,
      usuarioEmail: pedido.usuarioEmail,
    },
    orderBy: { createdAt: "desc" },
    include: { mensajes: TURNOS_EN_ORDEN },
  });
  return hilo ? aHiloConTurnos(hilo) : null;
}

/**
 * El hilo con el que sigue la conversación: reusa el vivo si el modelo coincide, y si no abre
 * uno nuevo. ⚠ Los hilos viejos NO se borran — quedan como historia de lo que se conversó.
 */
export async function abrirHilo(pedido: PedidoDeHilo): Promise<HiloConTurnos> {
  const vivo = await hiloVivo(pedido);
  const decision = decidirHilo(vivo, pedido.modelo);
  if (decision.accion === "reusar" && vivo) return vivo;
  return empezarDeCero(pedido);
}

/**
 * Abre un hilo nuevo aunque haya uno vivo. Es el «empezar de cero» del CSE, y también el camino
 * por el que entra un cambio de modelo.
 */
export async function empezarDeCero(pedido: PedidoDeHilo): Promise<HiloConTurnos> {
  const hilo = await prisma.hiloDeChat.create({
    data: {
      projectId: pedido.projectId,
      pieza: pedido.pieza,
      usuarioEmail: pedido.usuarioEmail,
      modelo: pedido.modelo,
    },
    include: { mensajes: TURNOS_EN_ORDEN },
  });
  return aHiloConTurnos(hilo);
}

export interface TurnoNuevo {
  rol: RolDeMensaje;
  contenido: string;
  /** La huella del prefijo con el que se produjo este turno. Ver el punto 2 del header. */
  shaDeContexto?: string | null;
  /** La fila de `LlmCall` de este turno, cuando la hubo (los turnos del CSE no la tienen). */
  llmCallId?: string | null;
}

/**
 * Suma un turno al hilo. ⚠ Es el ÚNICO escritor de `MensajeDeChat`: la guarda de al lado exige
 * que nadie más lo cree, para que el orden y la huella no se puedan escribir a medias.
 */
export async function agregarTurno(
  hiloId: string,
  turno: TurnoNuevo,
  opts?: { ultimoRunId?: string | null },
): Promise<TurnoDelHilo> {
  const [mensaje] = await prisma.$transaction([
    prisma.mensajeDeChat.create({
      data: {
        hiloId,
        rol: turno.rol,
        contenido: turno.contenido,
        shaDeContexto: turno.shaDeContexto ?? null,
        llmCallId: turno.llmCallId ?? null,
      },
      select: TURNOS_EN_ORDEN.select,
    }),
    prisma.hiloDeChat.update({
      where: { id: hiloId },
      data: { ...(opts?.ultimoRunId !== undefined ? { ultimoRunId: opts.ultimoRunId } : {}) },
    }),
  ]);
  return mensaje;
}

/**
 * Un hilo por id, ANCLADO al proyecto. ⛔ `findFirst` con `projectId`, nunca `findUnique({id})`:
 * el id de un hilo no puede ser la llave para leer la conversación de otro proyecto.
 */
export async function leerHilo(hiloId: string, projectId: string): Promise<HiloConTurnos | null> {
  const hilo = await prisma.hiloDeChat.findFirst({
    where: { id: hiloId, projectId },
    include: { mensajes: TURNOS_EN_ORDEN },
  });
  return hilo ? aHiloConTurnos(hilo) : null;
}

type FilaConMensajes = {
  id: string;
  projectId: string;
  pieza: string;
  usuarioEmail: string;
  modelo: string;
  ultimoRunId: string | null;
  mensajes: TurnoDelHilo[];
};

function aHiloConTurnos(hilo: FilaConMensajes): HiloConTurnos {
  return {
    id: hilo.id,
    projectId: hilo.projectId,
    pieza: hilo.pieza,
    usuarioEmail: hilo.usuarioEmail,
    modelo: hilo.modelo,
    ultimoRunId: hilo.ultimoRunId,
    turnos: hilo.mensajes,
  };
}
