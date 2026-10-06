"use client";

/**
 * components/ui/UndoProvider.tsx
 *
 * Undo global (Ctrl+Z / Cmd+Z + toast con contador) para TODOS los canvas editables
 * (cronograma, kickoff, handoff, diagnóstico/planificación, business cases).
 *
 * No unifica la PERSISTENCIA (cada superficie guarda distinto) sino el REGISTRO: cada
 * acción mutante registra un comando `{ scope, label, coalesceKey?, undo }` con
 * `pushUndo`. El provider mantiene un stack acotado multi-nivel, muestra un toast con
 * cuenta regresiva para el último cambio (botón "Deshacer") y atiende UN solo listener
 * global de teclado. El toast se va al expirar, pero la entrada queda en el stack →
 * Ctrl+Z sigue rebobinando los cambios recientes.
 *
 *   const { pushUndo } = useUndo();
 *   const snap = { phases, anchor };               // capturar ANTES de mutar
 *   setPhases(next); markDirty();
 *   pushUndo({ scope, label: "Renombrar fase", coalesceKey: `${scope}|${id}|name`,
 *             undo: () => { setPhases(snap.phases); silentMarkDirty(); } });
 *
 * Reglas clave:
 *  - El `undo` de una entrada NO debe registrar otra entrada (evita loops).
 *  - Coalescing: ediciones consecutivas con el MISMO coalesceKey dentro de ~800 ms
 *    conservan la entrada original (su snapshot pre-burst) y solo reinician el contador
 *    → escribir un nombre = 1 paso, no uno por tecla.
 *  - `useUndoScope(scope)` PURGA las entradas de ese scope al desmontar la superficie
 *    (un undo nunca aplica al proyecto/caso equivocado). `clearScope` también se llama
 *    al regenerar con agente (la regeneración reemplaza el estado de raíz).
 *  - Ctrl+Z se ignora si el foco está en un input/textarea/select/contentEditable
 *    (no pisar el undo nativo del texto) o si no hay entradas.
 *
 * ── LO QUE CAMBIÓ CON LA AUDITORÍA DEL DESHACER (2026-10-05) ──────────────────────────────
 *  - ⛔ SOLO LO QUE SE VE. La pila es global, y Ctrl+Z tomaba la última entrada de cualquier
 *    pantalla montada aunque estuviera oculta. Ahora una pantalla declara su ANCLA (el elemento
 *    que la representa) al registrar su scope —`useUndoScope(scope, ref)`— o por entrada
 *    (`pushUndo({ …, ancla })`), y Ctrl+Z deshace la entrada MÁS RECIENTE cuya ancla se ve. Si no
 *    hay ninguna visible, no hace nada (y no cancela la tecla). Sin ancla declarada la entrada se
 *    da por visible: compatibilidad con las pantallas que todavía no la declaran (el cronograma).
 *    La lógica pura vive en lib/ui/deshacer.ts, con su prueba.
 *  - ⛔ UNA TECLA, UN DESHACER. Si otro manejador ya atendió Ctrl+Z (`defaultPrevented`: el
 *    diagrama, con su pila propia), el global no actúa. Los locales escuchan en `document` y este
 *    en `window`, así que en el burbujeo el otro siempre pasa antes.
 *  - El botón del aviso deshace EXACTAMENTE la entrada que el aviso muestra, y el aviso se va si
 *    su pantalla deja de verse.
 *  - `agruparDeshacer(label, fn)`: todo lo que se registre mientras corre `fn` queda en UN paso
 *    (lo que el chat aplica a un documento de una vez: «Aplicado · Deshacer»).
 *
 * Montado una vez en app/layout.tsx, DENTRO de <ToastProvider> (usa useToast para el
 * error si un restablecer falla). Redo (Ctrl+Shift+Z) queda fuera de alcance (v1).
 */
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useToast } from "./Toast";
import {
  deshacerEnOrdenInverso,
  elegirEntradaParaDeshacer,
  elGlobalAtiende,
  resolverAncla,
  seVeEnPantalla,
  sumarAlGrupo,
  superficieVisible,
  type Ancla,
} from "@/lib/ui/deshacer";

/** Dónde está la pantalla de una entrada: el elemento, un ref o una función que lo devuelve. */
export type AnclaDeDeshacer = Ancla<Element>;

export interface UndoCommand {
  /** Contexto de la superficie, p. ej. `cronograma:projId`, `canvas:projId:canvasId`, `bc:bcId`. */
  scope: string;
  /** Texto del toast (tuteo), p. ej. "Cambio aplicado", "Tarea eliminada". */
  label: string;
  /** scope|entidad|campo — ediciones consecutivas con la misma clave se agrupan (~800 ms). */
  coalesceKey?: string;
  /** Revierte ESTA acción. Devuelve false (o lanza) si ya no se puede (el dato cambió). */
  undo: () => void | Promise<boolean | void>;
  /**
   * Opcional: el elemento que representa la pantalla de ESTA entrada. Sin él vale el ancla con que
   * la pantalla registró su scope (`useUndoScope(scope, ancla)`); sin ninguna, la entrada se da por
   * visible. Ctrl+Z solo deshace entradas cuya pantalla se ve.
   */
  ancla?: AnclaDeDeshacer;
}

interface UndoEntry extends UndoCommand {
  id: number;
  ts: number;
  /** Un GRUPO (`agruparDeshacer`): sus entradas se deshacen juntas, de la última a la primera. */
  hijos?: UndoEntry[];
}

interface UndoApi {
  pushUndo: (cmd: UndoCommand) => void;
  clearScope: (scope: string) => void;
  /**
   * Devuelve un cleanup que purga el scope (lo usa useUndoScope al desmontar). `ancla` (opcional):
   * dónde está la pantalla, para que Ctrl+Z no deshaga lo suyo mientras está oculta.
   */
  registerScope: (scope: string, ancla?: AnclaDeDeshacer) => () => void;
  /**
   * Corre `fn` y junta TODO lo que se registre mientras tanto en UN solo paso con `label` (sin un
   * aviso por cada uno). Un grupo dentro de otro se suma al de afuera.
   * ⚠ Junta lo de cualquier pantalla: es para ráfagas cortas que la persona disparó de una vez
   * (lo que el chat aplica a un documento), no para envolver una sesión de edición.
   */
  agruparDeshacer: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
}

const UndoContext = createContext<UndoApi | null>(null);

const MAX_STACK = 20;
const COALESCE_MS = 800;
const TOAST_SECONDS = 6;

export function UndoProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const stackRef = useRef<UndoEntry[]>([]);
  const idRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef(0);
  /** Las anclas que cada pantalla declaró para su scope (puede haber más de una montada). */
  const anclasRef = useRef(new Map<string, AnclaDeDeshacer[]>());
  /** El grupo abierto por `agruparDeshacer`, si hay uno: lo que se registre va adentro. */
  const grupoRef = useRef<{ hijos: UndoEntry[] } | null>(null);

  // Solo el ÚLTIMO comando muestra contador. El stack vive en un ref (no se renderiza entero).
  const [visible, setVisible] = useState<{ id: number; label: string } | null>(null);
  const [remaining, setRemaining] = useState(0);

  /**
   * Si la pantalla de una entrada se ve. Un grupo se ve si se ve alguna de las suyas. Se pregunta en
   * el momento de deshacer (no al registrar): la pantalla pudo ocultarse o volver a verse después.
   */
  const entradaVisible = useCallback((e: UndoEntry): boolean => {
    const ver = (x: UndoEntry): boolean => {
      if (x.hijos) return x.hijos.some(ver);
      const anclas = x.ancla !== undefined ? [x.ancla] : (anclasRef.current.get(x.scope) ?? []);
      return superficieVisible(
        anclas.map((a) => resolverAncla(a)),
        seVeEnPantalla,
      );
    };
    return ver(e);
  }, []);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Apaga el intervalo en cuanto el toast deja de verse (fin del contador, purga o desmontaje).
  useEffect(() => {
    if (!visible) stopTick();
  }, [visible, stopTick]);

  useEffect(() => () => stopTick(), [stopTick]);

  const showToast = useCallback(
    (id: number, label: string) => {
      deadlineRef.current = Date.now() + TOAST_SECONDS * 1000;
      setVisible({ id, label });
      setRemaining(TOAST_SECONDS);
      stopTick();
      tickRef.current = setInterval(() => {
        const left = Math.ceil((deadlineRef.current - Date.now()) / 1000);
        /* El aviso se va también si su pantalla dejó de verse (la persona pasó a otra pestaña): su
           botón deshace ESA entrada, y deshacer algo que no está en pantalla es el hueco que se cerró. */
        const entrada = stackRef.current.find((e) => e.id === id);
        if (left <= 0 || !entrada || !entradaVisible(entrada)) {
          setVisible(null);
          setRemaining(0);
        } else {
          setRemaining(left);
        }
      }, 250);
    },
    [stopTick, entradaVisible],
  );

  const pushUndo = useCallback(
    (cmd: UndoCommand) => {
      const now = Date.now();
      /* Con un grupo abierto, la entrada se suma al grupo y no muestra aviso propio: el aviso es el
         del grupo, cuando se cierra. */
      const grupo = grupoRef.current;
      if (grupo) {
        grupo.hijos = sumarAlGrupo(grupo.hijos, { ...cmd, id: ++idRef.current, ts: now });
        return;
      }
      const stack = stackRef.current;
      const top = stack[stack.length - 1];
      // Coalesce: misma acción consecutiva → conservar la entrada original (su snapshot
      // pre-burst), descartar el nuevo undo, solo reiniciar el contador.
      if (
        top &&
        cmd.coalesceKey &&
        top.coalesceKey === cmd.coalesceKey &&
        top.scope === cmd.scope &&
        now - top.ts < COALESCE_MS
      ) {
        top.ts = now;
        showToast(top.id, cmd.label);
        return;
      }
      const id = ++idRef.current;
      stack.push({ ...cmd, id, ts: now });
      if (stack.length > MAX_STACK) stack.shift();
      showToast(id, cmd.label);
    },
    [showToast],
  );

  const clearScope = useCallback((scope: string) => {
    // Un grupo con alguna entrada de ese scope se va entero: una purga nunca aplica un deshacer a
    // medias sobre una pantalla que ya no está.
    stackRef.current = stackRef.current.filter(
      (e) => e.scope !== scope && !e.hijos?.some((h) => h.scope === scope),
    );
    if (grupoRef.current) grupoRef.current.hijos = grupoRef.current.hijos.filter((h) => h.scope !== scope);
    setVisible((v) => (v && !stackRef.current.some((e) => e.id === v.id) ? null : v));
  }, []);

  const registerScope = useCallback(
    (scope: string, ancla?: AnclaDeDeshacer) => {
      if (ancla != null) {
        const m = anclasRef.current;
        m.set(scope, [...(m.get(scope) ?? []), ancla]);
      }
      return () => {
        if (ancla != null) {
          const m = anclasRef.current;
          const resto = (m.get(scope) ?? []).filter((a) => a !== ancla);
          if (resto.length > 0) m.set(scope, resto);
          else m.delete(scope);
        }
        clearScope(scope);
      };
    },
    [clearScope],
  );

  const agruparDeshacer = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      // Anidado: lo de adentro se suma al grupo de afuera (un acuerdo es UN paso, siempre).
      if (grupoRef.current) return fn();
      const grupo: { hijos: UndoEntry[] } = { hijos: [] };
      grupoRef.current = grupo;
      try {
        return await fn();
      } finally {
        grupoRef.current = null;
        const hijos = grupo.hijos;
        if (hijos.length > 0) {
          const id = ++idRef.current;
          stackRef.current.push({
            scope: hijos[0].scope,
            label,
            id,
            ts: Date.now(),
            hijos,
            undo: () =>
              deshacerEnOrdenInverso(
                hijos.map((h) => h.undo),
                (e) => console.error("[undo] falló un paso del grupo", e),
              ),
          });
          if (stackRef.current.length > MAX_STACK) stackRef.current.shift();
          showToast(id, label);
        }
      }
    },
    [showToast],
  );

  const runUndo = useCallback(
    async (entry: UndoEntry) => {
      try {
        const r = await entry.undo();
        if (r === false) toast.error("No se pudo deshacer (el contenido cambió).");
      } catch (e) {
        console.error("[undo] falló el restablecer", e);
        toast.error("No se pudo deshacer.");
      }
    },
    [toast],
  );

  /** Saca de la pila la entrada `idx` y la deshace. */
  const sacarYDeshacer = useCallback(
    (idx: number) => {
      const [entry] = stackRef.current.splice(idx, 1);
      if (!entry) return;
      setVisible((v) => (v && v.id === entry.id ? null : v));
      void runUndo(entry);
    },
    [runUndo],
  );

  /* El botón del aviso deshace EXACTAMENTE la entrada que el aviso muestra —no «la última de la
     pila», que con varias pantallas montadas puede ser otra—, y solo si su pantalla se ve. */
  const deshacerDelAviso = useCallback(
    (id: number) => {
      const idx = stackRef.current.findIndex((e) => e.id === id);
      if (idx < 0 || !entradaVisible(stackRef.current[idx])) {
        setVisible(null);
        return;
      }
      sacarYDeshacer(idx);
    },
    [entradaVisible, sacarYDeshacer],
  );

  /* Atajo global Ctrl/Cmd+Z. Escucha en `window` A PROPÓSITO: los manejadores locales (el diagrama)
     escuchan en `document`, que en el burbujeo pasa antes, así que acá ya se sabe si alguien la
     atendió. No pisa el deshacer nativo del texto, y deshace la entrada más reciente cuya pantalla se
     ve: si no hay ninguna, no cancela la tecla. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!elGlobalAtiende(e, document.activeElement as HTMLElement | null)) return;
      const idx = elegirEntradaParaDeshacer(stackRef.current, entradaVisible);
      if (idx < 0) return;
      e.preventDefault();
      sacarYDeshacer(idx);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entradaVisible, sacarYDeshacer]);

  const api = useMemo<UndoApi>(
    () => ({ pushUndo, clearScope, registerScope, agruparDeshacer }),
    [pushUndo, clearScope, registerScope, agruparDeshacer],
  );

  return (
    <UndoContext.Provider value={api}>
      {children}
      {visible && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[101] pointer-events-none">
          <div className="nx-undo-in pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-line bg-surface text-fg shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)]">
            <style>{`@keyframes nx-undo-in{from{opacity:0;transform:translateY(10px) scale(.975)}to{opacity:1;transform:translateY(0) scale(1)}}.nx-undo-in{animation:nx-undo-in .18s cubic-bezier(.21,1.02,.73,1)}`}</style>
            <span className="text-[13px] font-medium text-fg">{visible.label}</span>
            <button
              onClick={() => deshacerDelAviso(visible.id)}
              className="text-xs font-semibold text-brand hover:underline underline-offset-2 whitespace-nowrap"
            >
              Deshacer <span className="text-fg-muted">({remaining}s)</span>
            </button>
          </div>
        </div>
      )}
    </UndoContext.Provider>
  );
}

export function useUndo(): UndoApi {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo debe usarse dentro de <UndoProvider>");
  return ctx;
}

/**
 * Marca un scope como montado y PURGA sus entradas al desmontar la superficie. Llámalo
 * en el componente raíz de cada editor con su scope estable (p. ej. `cronograma:${projectId}`).
 *
 * `ancla` (opcional, recomendado): el elemento raíz de la pantalla —un ref sirve—. Con ella, Ctrl+Z
 * no deshace lo de esta pantalla mientras está oculta (montada pero con `hidden`, en otra pestaña).
 */
export function useUndoScope(scope: string, ancla?: AnclaDeDeshacer) {
  const { registerScope } = useUndo();
  // Por ref: un ref o una función inline cambian de identidad en cada render, y re-registrar el
  // scope por eso lo purgaría a cada rato.
  const anclaRef = useRef(ancla);
  useEffect(() => {
    anclaRef.current = ancla;
  });
  const tieneAncla = ancla != null;
  useEffect(
    () => registerScope(scope, tieneAncla ? () => resolverAncla(anclaRef.current) : undefined),
    [registerScope, scope, tieneAncla],
  );
}
