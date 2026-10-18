/**
 * lib/operaciones/registro-server.ts — TODAS las operaciones de Nexus, en un solo lugar (fase 0.4 de
 * docs/nexus-sistema-de-trabajo-plan.md). SERVER-ONLY.
 *
 * Sumar algo que se pueda hacer desde el chat = una entrada acá (y su prueba en lib/operaciones/operaciones.test.ts). La
 * fase 4 (el chat de Nexus) toma de acá sus herramientas: las que leen las usa sola; las que proponen pasan por una
 * persona antes de aplicarse.
 *
 * Primera tanda: Tareas, las notas de la cuenta y el siguiente paso. Desde el 2026-10-17, generar un entregable del
 * proyecto con su plantilla (./documentos-server.ts).
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { contextoDeOperacion, type ContextoDeNexus } from "./contexto-server";
import { aplicarOperaciones, leerOperacion, prepararOperaciones, type OperacionPreparada, type PedidoDeOperacion } from "./ejecutar";
import { herramientaDe } from "./herramientas";
import { CREAR_NOTA, LEER_NOTAS_DE_LA_CUENTA } from "./notas-server";
import { GENERAR_DOCUMENTO } from "./documentos-server";
import { FIJAR_SIGUIENTE_PASO, LEER_SIGUIENTES_PASOS } from "./siguiente-paso-server";
import { CAMBIAR_ESTADO_DE_TAREA, CREAR_TAREA, LEER_TAREAS_DE_LA_CUENTA, MOVER_TAREA_DE_SEMANA } from "./tareas-server";
import type { Operacion } from "./tipos";

export const OPERACIONES: readonly Operacion<ContextoDeNexus>[] = [
  // Leen.
  LEER_TAREAS_DE_LA_CUENTA,
  LEER_NOTAS_DE_LA_CUENTA,
  LEER_SIGUIENTES_PASOS,
  // Proponen.
  CREAR_TAREA,
  CAMBIAR_ESTADO_DE_TAREA,
  MOVER_TAREA_DE_SEMANA,
  CREAR_NOTA,
  FIJAR_SIGUIENTE_PASO,
  GENERAR_DOCUMENTO,
];

/** Las herramientas para el modelo (fase 4). */
export function herramientasDeNexus() {
  return OPERACIONES.map(herramientaDe);
}

export function leer(persona: TeamMember, p: PedidoDeOperacion, ahora = new Date()) {
  return leerOperacion(OPERACIONES, contextoDeOperacion(persona, ahora), p);
}

export function preparar(persona: TeamMember, pedidos: readonly PedidoDeOperacion[], ahora = new Date()) {
  return prepararOperaciones(OPERACIONES, contextoDeOperacion(persona, ahora), pedidos);
}

/**
 * Aplica lo que se preparó. ⚠ Se vuelve a preparar antes de aplicar (lo que cambió desde que se mostró, o lo que no
 * existe ya, se rechaza con su motivo): lo que llega del navegador nunca se aplica tal cual.
 */
export async function prepararYAplicar(persona: TeamMember, pedidos: readonly PedidoDeOperacion[], ahora = new Date()) {
  const ctx = contextoDeOperacion(persona, ahora);
  const p = await prepararOperaciones(OPERACIONES, ctx, pedidos);
  if (p.rechazadas.length) return { aplicadas: [], fallo: null, sinIntentar: p.preparadas.length, rechazadas: p.rechazadas };
  const a = await aplicarOperaciones(OPERACIONES, ctx, p.preparadas as OperacionPreparada[]);
  return { ...a, rechazadas: [] };
}
