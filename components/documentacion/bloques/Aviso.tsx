"use client";

/**
 * components/documentacion/bloques/Aviso.tsx — el bloque de aviso (callout).
 *
 * Los cuatro tonos usan los tokens de panel suave del tema (`info-`, `warn-`, `success-`,
 * `danger-`), que ya están medidos para los dos modos: un aviso no puede volverse ilegible
 * porque alguien tenga el tema claro.
 *
 * ⚠ El spec se crea a nivel de MÓDULO, no dentro de un componente: la regla de eslint
 * `react-hooks/static-components` lo exige, y un spec creado en cada render remontaría el bloque
 * entero en cada tecla.
 */
import { createReactBlockSpec } from "@blocknote/react";

const TONOS = {
  info: { emoji: "💡", clases: "border-info-line bg-info-surface text-info-ink" },
  advertencia: { emoji: "⚠️", clases: "border-warn-line bg-warn-surface text-warn-ink" },
  exito: { emoji: "✅", clases: "border-success-line bg-success-surface text-success-ink" },
  peligro: { emoji: "⛔", clases: "border-danger-line bg-danger-surface text-danger-ink" },
} as const;

export type TonoDeAviso = keyof typeof TONOS;

export const TONOS_DE_AVISO = Object.keys(TONOS) as TonoDeAviso[];

export const bloqueAviso = createReactBlockSpec(
  {
    type: "aviso",
    propSchema: {
      tono: { default: "info", values: ["info", "advertencia", "exito", "peligro"] },
    },
    content: "inline",
  },
  {
    render: ({ block, contentRef }) => {
      const tono = TONOS[(block.props.tono as TonoDeAviso) ?? "info"] ?? TONOS.info;
      return (
        <div className={`my-2 flex gap-2 rounded-lg border px-3 py-2 ${tono.clases}`}>
          <span className="select-none leading-6" aria-hidden="true">
            {tono.emoji}
          </span>
          <div className="min-w-0 flex-1 leading-6" ref={contentRef} />
        </div>
      );
    },
  },
);
