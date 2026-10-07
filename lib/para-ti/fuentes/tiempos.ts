/**
 * lib/para-ti/fuentes/tiempos.ts — lo que quedó sin anotar de «¿cuánto te tomó?» (2026-10-05, lib/tiempos).
 *
 * Personal: le llega a quien se le preguntó al marcar una tarea o al publicar un documento y cerró sin responder.
 * Va agrupado en UN pendiente («Anota cuánto te tomaron 3 cosas») y se contesta ahí mismo, sin salir de «Para ti».
 * A los tres días vence y se va solo. Nunca es un aviso: no es algo que pasó, es algo que te toca.
 */
import "server-only";
import { cuantasPendientes, tiemposDisponible } from "@/lib/tiempos/servidor";
import { PENDIENTE_DE_TIEMPOS, inicioDelDiaCR } from "@/lib/tiempos/reglas";
import { plural } from "../armar";
import type { Fuente } from "../fuente";

export const TIEMPOS_SIN_ANOTAR: Fuente = {
  clave: "tiempos",
  frente: null,
  alDia: "Los tiempos por anotar",
  async medir(a, c) {
    if (!tiemposDisponible()) return [];
    const { total, venceAntes } = await cuantasPendientes(a.email, c.ahora);
    if (total === 0) return [];
    const venceHoy = !!venceAntes && inicioDelDiaCR(venceAntes).getTime() === inicioDelDiaCR(c.ahora).getTime();
    return [
      {
        clave: PENDIENTE_DE_TIEMPOS,
        fuente: PENDIENTE_DE_TIEMPOS,
        cuando: "hoy",
        delAgente: false,
        titulo: `Anota cuánto te ${total === 1 ? "tomó" : "tomaron"} ${plural(total, "cosa", "cosas")}`,
        detalle:
          venceHoy
            ? "Las marcaste como hechas o las publicaste y no anotaste el tiempo. La primera vence hoy."
            : "Las marcaste como hechas o las publicaste y no anotaste el tiempo. Vencen a los tres días.",
        meta: "Tiempos · sirve para calibrar la carga, no para evaluarte",
        accion: "Anotar",
        href: "/para-ti?tiempos=1",
      },
    ];
  },
};
