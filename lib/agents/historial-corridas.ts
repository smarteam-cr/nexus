/**
 * lib/agents/historial-corridas.ts — EL HISTORIAL DE CORRIDAS DE UN DOCUMENTO.
 * Client-safe: solo `import type` de Prisma, nunca el cliente.
 *
 * ── POR QUÉ ESTO EXISTE ──────────────────────────────────────────────────────
 * Regenerar un documento borra los bloques del agente anterior, así que `AgentRun.output` es la
 * única copia sobreviviente de lo que decía antes. Este módulo define de QUIÉN son esas
 * corridas y cómo se resumen; el contenido lo arma `lib/canvas/agent-output-doc.ts`.
 *
 * ⚠ EL `where` VIVE ACÁ Y EN NINGÚN OTRO LADO. Lo usan el CONTADOR (que decide si el botón
 * "Ver historial" se muestra) y la LISTA (lo que el diálogo abre). Si cada uno escribiera el
 * suyo, el día que difieran el botón aparecería y abriría una lista que no coincide — el fallo
 * más difícil de diagnosticar de toda la función, porque los dos lados "andan bien".
 */
import type { Prisma } from "@prisma/client";
import { estaColgada } from "./run-colgada";

/** Tope de corridas que trae el historial. En la realidad son 1-4 por proyecto. */
export const LIMITE_HISTORIAL = 20;

/**
 * De quién son las corridas de un documento.
 *
 * El rescate de HUÉRFANAS aplica solo al handoff: `AgentRun.agentId` es `onDelete: SetNull`,
 * así que borrar la fila del Agent deja corridas invisibles al filtro por grupo. Para el
 * handoff hay una premisa que el repo ya usa (scripts/heal-handoff-anchors.ts): SOLO ese agente
 * setea `sourceSessionIds`, así que una corrida con sesiones fuente no vacías ES de handoff.
 * Para los demás grupos no existe una señal equivalente y no se inventa una.
 */
export function whereCorridasDeDocumento(projectId: string, grupo: string): Prisma.AgentRunWhereInput {
  const porAgente = { agent: { agentGroup: grupo } };
  if (grupo !== "handoff") return { projectId, ...porAgente };
  return {
    projectId,
    OR: [porAgente, { agentId: null, sourceSessionIds: { isEmpty: false } }],
  };
}

export interface FilaDeCorrida {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  triggeredByEmail: string | null;
  sourceSessionIds: string[];
}

export interface ResumenDeCorrida {
  id: string;
  /** Estado CORREGIDO: una RUNNING sin latido hace media hora se reporta como ERROR. */
  estado: "DONE" | "ERROR" | "RUNNING" | "PENDING" | "ARCHIVED";
  colgada: boolean;
  createdAt: string;
  updatedAt: string;
  /** Cuánto tardó. null mientras sigue viva y con latido. */
  duracionMs: number | null;
  /** Nombre del que la lanzó → su email → null (= la lanzó el sistema). */
  lanzadaPor: string | null;
  sesionesFuente: number;
  /** ¿Es la corrida cuyo contenido está hoy en el documento? */
  vigente: boolean;
}

/** Resumen de una corrida para la lista del diálogo. Puro: la hidratación la hace el caller. */
export function resumenDeCorrida(
  fila: FilaDeCorrida,
  nombre: string | null,
  runVigenteId: string | null,
  ahora: Date = new Date(),
): ResumenDeCorrida {
  const colgada = estaColgada(fila, ahora);
  const enCurso = fila.status === "PENDING" || fila.status === "RUNNING";
  return {
    id: fila.id,
    estado: (colgada ? "ERROR" : fila.status) as ResumenDeCorrida["estado"],
    colgada,
    createdAt: fila.createdAt.toISOString(),
    updatedAt: fila.updatedAt.toISOString(),
    /* Una corrida viva todavía no tiene duración: su updatedAt es el último latido, no el fin.
       Una colgada tampoco — el tiempo que estuvo muerta no es tiempo de trabajo. */
    duracionMs: enCurso ? null : fila.updatedAt.getTime() - fila.createdAt.getTime(),
    lanzadaPor: nombre ?? fila.triggeredByEmail ?? null,
    sesionesFuente: fila.sourceSessionIds.length,
    vigente: !!runVigenteId && fila.id === runVigenteId,
  };
}

/** Rótulo de cada estado en la lista. Tokens semánticos, nunca grises crudos. */
export const ESTADO_HISTORIAL: Record<string, { label: string; cls: string }> = {
  DONE: { label: "OK", cls: "text-emerald-400 border-emerald-700/40 bg-emerald-900/20" },
  ERROR: { label: "Falló", cls: "text-red-400 border-red-700/40 bg-red-900/20" },
  RUNNING: { label: "Corriendo", cls: "text-blue-300 border-blue-700/40 bg-blue-900/20" },
  PENDING: { label: "En cola", cls: "text-fg-muted border-line bg-surface-muted" },
  ARCHIVED: { label: "Archivada", cls: "text-fg-muted border-line bg-surface-muted" },
};

/** "45 s" / "2 min" / "en curso". */
export function duracionLegible(ms: number | null): string {
  if (ms === null) return "en curso";
  const seg = Math.round(ms / 1000);
  if (seg < 60) return `${seg} s`;
  return `${Math.round(seg / 60)} min`;
}

/**
 * ¿Se muestra el CTA "Ver historial"?
 *
 * Elías pidió «si tiene más de 1 corrida». Se suma UN caso: la corrida ÚNICA que falló, porque
 * ahí el historial es el único lugar donde queda escrito por qué —el error en pantalla muere al
 * recargar la pestaña, y `output` con el motivo es la única copia—. Con una sola corrida OK no
 * se muestra: el historial sería idéntico al documento que ya está abajo.
 */
export function debeVerHistorial(x: { corridas?: number; ultimoEstado?: string | null }): boolean {
  const n = x.corridas ?? 0;
  if (n >= 2) return true;
  return n === 1 && x.ultimoEstado === "ERROR";
}
