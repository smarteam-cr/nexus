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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Lo que el editor sabe hacer con un acuerdo del chat.
 *
 * ── QUÉ CAMBIÓ EL 2026-08-22 ─────────────────────────────────────────────────
 * Antes recibía una INSTRUCCIÓN en castellano y devolvía `void`: el editor la mandaba a un segundo
 * modelo y la persona revisaba la propuesta en OTRA pantalla. Dos problemas que se arreglan juntos:
 *
 *   · el desenlace se escribía cuando LLEGABA la propuesta, no cuando alguien la aceptaba, así que
 *     el hilo decía «se aplicó» sobre algo que nadie había mirado;
 *   · los avisos del editor no tenían por dónde volver — `avisos: []` estaba escrito a mano — así
 *     que «se aplicó, pero mirá esto» se leía igual que «se aplicó».
 *
 * Ahora recibe OPERACIONES, las ejecuta de verdad, y devuelve lo que el sistema hizo además de lo
 * pedido y lo que no pudo hacer.
 */
export interface ResultadoDelAplicador {
  /** Lo que el sistema hizo además de lo pedido. Viaja al hilo. */
  avisos: string[];
  /** Lo que NO se pudo hacer, y por qué. Nunca se ignora en silencio. */
  rechazadas: string[];
}

type Aplicador = (operaciones: unknown[]) => Promise<ResultadoDelAplicador>;

interface Registro {
  registrar: (a: Aplicador | null) => void;
  /** `null` cuando no hay ningún editor montado — p. ej. un documento sin contenido todavía. */
  obtener: () => Aplicador | null;
  /**
   * ⭐ SI HAY EDITOR, COMO ESTADO REACTIVO.
   *
   * ── POR QUÉ NO ALCANZA CON `obtener()` ──────────────────────────────────
   * `obtener` se lee al APRETAR el botón, así que un editor ausente se descubría después del
   * clic: la persona apretaba «Aplicar», el chat escribía un desenlace, y recién ahí aparecía un
   * cartel diciendo que el editor no estaba montado — sobre un documento que estaba abierto
   * delante suyo. Visto en pantalla el 2026-08-22.
   *
   * Con esto el botón se apaga ANTES, con el motivo al lado. Un estado imposible que no se puede
   * apretar es mejor que un error que lo explica después.
   */
  hay: boolean;
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
  const [hay, setHay] = useState(false);
  const [base] = useState(() => {
    let actual: Aplicador | null = null;
    return {
      registrar: (a: Aplicador | null) => {
        actual = a;
      },
      obtener: () => actual,
    };
  });
  /**
   * ⛔ `registrar` TIENE QUE SER ESTABLE, y esto es la trampa entera de este archivo.
   *
   * El efecto que registra al editor depende de esta función. Si su identidad cambiara cuando
   * cambia `hay` —que es justo lo que `registrar` provoca— el ciclo sería: registro → `hay` pasa a
   * true → identidad nueva → el efecto se limpia (des-registra) → `hay` pasa a false → identidad
   * nueva → registro… sin parar. El editor se desregistraría a sí mismo en loop.
   */
  const registrar = useCallback(
    (a: Aplicador | null) => {
      base.registrar(a);
      setHay(a !== null);
    },
    [base],
  );
  const valor = useMemo<Registro>(
    () => ({ registrar, obtener: base.obtener, hay }),
    [registrar, base, hay],
  );
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
  /* ⚠ Depende de `registrar`, NO de `ctx`: `ctx` se recrea cuando cambia `hay`, y `hay` lo cambia
     este mismo efecto. Ver el porqué completo en el proveedor. */
  const registrar = ctx?.registrar;
  useEffect(() => {
    if (!registrar) return;
    registrar((i) => vivo.current(i));
    return () => registrar(null);
  }, [registrar]);
}

/** Lo llama el chat al aplicar. `null` si no hay editor montado para la pieza activa. */
export function useAplicadorDeDocumento(): () => Aplicador | null {
  const ctx = useContext(Ctx);
  return () => ctx?.obtener() ?? null;
}

/**
 * Si HAY un editor montado para la pieza activa. Reactivo: la pantalla se entera al toque.
 *
 * Fuera del proveedor devuelve `false` — es lo correcto: sin proveedor no hay a quién aplicarle.
 */
export function useHayAplicadorDeDocumento(): boolean {
  return useContext(Ctx)?.hay ?? false;
}
