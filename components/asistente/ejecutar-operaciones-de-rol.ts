"use client";

/**
 * components/asistente/ejecutar-operaciones-de-rol.ts — EL CHAT APLICA SOBRE UN DOCUMENTO DE ROLES.
 *
 * ── POR QUÉ NO ALCANZA CON EL EJECUTOR DE CANVAS ────────────────────────────
 * Roles reusa el motor de PRESENTACIÓN del resto (LandingView, las mismas primitivas de edición)
 * pero NO su motor de datos: su contenido vive en `RoleProfile.content`, un Json por sección, y no
 * en filas de `CanvasSection` con bloques. Es una decisión escrita en `docs/DECISIONS.md`, no un
 * accidente — así que no hay `sectionId`, no hay `upsertCardData`, y forzar el otro ejecutor por
 * acá habría significado inventarle un canvas que no tiene.
 *
 * Lo que sí es idéntico: el vocabulario, las líneas en castellano, las casillas y el consenso. Lo
 * único propio es el último metro — escribir por KEY contra `content`, por el mismo camino que usa
 * la edición a mano (con su autoguardado y su deshacer).
 *
 * ⛔ Y las operaciones de ESTRUCTURA no aplican: la lista de secciones de un rol es FIJA — el
 * motor las arma siempre desde `ROLE_SECTIONS` completo. Crear, borrar, ocultar o mover acá
 * escribiría algo que nadie lee, así que se rechazan con su motivo en vez de fingir.
 */
import { useEffect, useMemo, useRef } from "react";
import { useRegistrarAplicadorDeDocumento, type ResultadoDelAplicador } from "./aplicador-de-documento";
import {
  aplicarOperacionesDeDocumento,
  esOperacionDeDocumento,
  type OperacionDeDocumento,
  type SeccionActual,
} from "@/lib/canvas/operaciones-de-documento";

/** Una sección de rol tal como el motor la pinta: su key y los datos que se le pasan. */
export interface SeccionDeRol {
  key: string;
  data: unknown;
}

/** Lo mínimo de una def: el esquema y cómo se llama. */
export type DefsDeRol = Record<string, { schema?: unknown; label?: string } | undefined>;

export function useEjecutarOperacionesDelChatDeRol(
  /**
   * ⭐ Las secciones TAL COMO SE PINTAN, no `content` crudo.
   *
   * ⚠ La portada no vive en `content`: su título, área y resumen son columnas de la fila y el
   * workspace las junta al armar esta lista. Leyendo `content` directamente, una operación sobre
   * la portada partiría de `{}` y escribiría un solo campo — borrando los otros dos sin que nada
   * avise. Recibir lo que se pinta hace que eso no se pueda escribir mal.
   */
  secciones0: SeccionDeRol[],
  defsByKey: DefsDeRol,
  /** El mismo camino que usa la edición a mano: autoguardado + deshacer. */
  onSectionChange: (key: string, data: unknown) => void,
) {
  const secciones: SeccionActual[] = useMemo(
    () =>
      secciones0.map((s) => ({
        /* ⚠ La KEY hace de id: en Roles no existe `CanvasSection.id`, y el contenido se indexa
           por key. Es la identidad correcta acá, no un atajo. */
        id: s.key,
        key: s.key,
        label: defsByKey[s.key]?.label ?? s.key,
        data: s.data ?? {},
        schema: defsByKey[s.key]?.schema ?? { type: "object", properties: {} },
        oculta: false,
        esCreada: false,
        /* La lista es fija: nada se mueve ni se saca. */
        movible: false,
      })),
    [secciones0, defsByKey],
  );

  const vivo = useRef({ secciones, onSectionChange });
  useEffect(() => {
    vivo.current = { secciones, onSectionChange };
  });

  useRegistrarAplicadorDeDocumento(async (crudas): Promise<ResultadoDelAplicador> => {
    const { secciones: secs, onSectionChange: escribir } = vivo.current;
    const ops = crudas.filter(esOperacionDeDocumento) as OperacionDeDocumento[];
    if (ops.length === 0) {
      return { avisos: [], rechazadas: ["No llegó ninguna operación que este documento entienda."] };
    }

    /* ⛔ `puedeOcultar` y `puedeCrear` en false: ver el encabezado. Las de estructura se caen acá
       con un motivo legible en vez de escribir en un lugar que este documento no tiene. */
    const { plan, avisos, rechazadas } = aplicarOperacionesDeDocumento(secs, ops, {
      puedeOcultar: false,
      puedeCrear: false,
    });

    for (const e of plan) {
      if (e.tipo === "data") escribir(e.sectionId, e.data);
    }

    return { avisos, rechazadas: rechazadas.map((r) => r.motivo) };
  });
}
