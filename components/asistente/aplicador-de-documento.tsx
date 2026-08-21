"use client";

/**
 * components/asistente/aplicador-de-documento.tsx — CÓMO LLEGA EL ACUERDO DEL CHAT AL EDITOR.
 *
 * ── EL PROBLEMA DE UBICACIÓN, QUE ES TODO EL PROBLEMA ────────────────────────────────────────
 * El cajón del chat lo monta `ProjectCanvasPanel`. El aplicador de documentos (`DocumentAssist`,
 * con su instrucción → propuesta → revisión POR SECCIÓN → aplicar) lo monta cada workspace, más
 * adentro. Son dos ramas distintas del árbol, y el chat necesita llamar al de la pieza activa.
 *
 * ⛔ LO QUE NO SE HIZO, Y POR QUÉ:
 *
 * · Mover el chat adentro de cada workspace serían SEIS copias del mismo cajón. El cronograma lo
 *   tiene adentro porque su «Aplicar» entra por un camino propio; los documentos comparten uno.
 * · Que el chat llame a `canvas-assist` por su cuenta y escriba con `upsertCardData` abriría un
 *   SEGUNDO camino de escritura para lo mismo. La regla del repo es explícita: *el chat NO
 *   escribe; emite una instrucción y aplicar pasa por el editor de siempre, con su vista previa y
 *   su aceptación por ítem*. Dos caminos no serían interfaz duplicada: serían lógica de pérdida
 *   de datos duplicada.
 *
 * ⭐ Lo que sí: el aplicador que YA existe se anuncia, y el chat lo llama. Se registra el propio
 * `DocumentAssist` —no cada workspace— así que los seis documentos quedan cableados sin tocar
 * ninguno, y el séptimo que alguien agregue mañana entra solo.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** Lo que el editor de documentos sabe hacer con una instrucción: proponer, para que la revisen. */
type Aplicador = (instruccion: string) => Promise<void> | void;

interface Registro {
  registrar: (a: Aplicador | null) => void;
  /** `null` cuando no hay ningún editor montado — p. ej. un documento sin contenido todavía. */
  obtener: () => Aplicador | null;
}

const Ctx = createContext<Registro | null>(null);

export function AplicadorDeDocumentoProvider({ children }: { children: ReactNode }) {
  /**
   * ⚠ Un CIERRE, no un `ref`. Registrarse no tiene que re-renderizar el panel entero —el chat lee
   * el valor recién cuando la persona aprieta el botón, nunca durante el render— pero leer
   * `ref.current` en el render es justamente lo que la regla de React prohíbe, y con razón: en
   * modo concurrente el valor que se lee puede no ser el del árbol que se está pintando.
   *
   * Guardarlo en una variable del cierre del inicializador de `useState` da lo mismo sin romper
   * ninguna regla: la identidad del objeto es estable y nadie lee nada durante el render.
   */
  const [valor] = useState<Registro>(() => {
    let actual: Aplicador | null = null;
    return {
      registrar: (a) => {
        actual = a;
      },
      obtener: () => actual,
    };
  });
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Lo llama el editor de documentos para anunciarse. Sin provider no hace nada: el mismo componente
 * se usa en pantallas que no tienen chat, y ahí esto tiene que ser inerte.
 */
export function useRegistrarAplicadorDeDocumento(aplicador: Aplicador) {
  const ctx = useContext(Ctx);
  /* El aplicador se recrea en cada render del editor; el ref evita re-registrar por eso.
     ⚠ Se escribe en un EFECTO, no en el render: escribir un ref durante el render es lo mismo que
     leerlo — el árbol que se está pintando puede no ser el que termina montado. */
  const vivo = useRef(aplicador);
  useEffect(() => {
    vivo.current = aplicador;
  });
  useEffect(() => {
    if (!ctx) return;
    ctx.registrar((i) => vivo.current(i));
    return () => ctx.registrar(null);
  }, [ctx]);
}

/** Lo llama el chat al aplicar. `null` si no hay editor montado para la pieza activa. */
export function useAplicadorDeDocumento(): () => Aplicador | null {
  const ctx = useContext(Ctx);
  return () => ctx?.obtener() ?? null;
}
