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

export interface UndoCommand {
  /** Contexto de la superficie, p. ej. `cronograma:projId`, `canvas:projId:canvasId`, `bc:bcId`. */
  scope: string;
  /** Texto del toast (tuteo), p. ej. "Cambio aplicado", "Tarea eliminada". */
  label: string;
  /** scope|entidad|campo — ediciones consecutivas con la misma clave se agrupan (~800 ms). */
  coalesceKey?: string;
  /** Revierte ESTA acción. Devolvé false (o lanzá) si ya no se puede (el dato cambió). */
  undo: () => void | Promise<boolean | void>;
}

interface UndoEntry extends UndoCommand {
  id: number;
  ts: number;
}

interface UndoApi {
  pushUndo: (cmd: UndoCommand) => void;
  clearScope: (scope: string) => void;
  /** Devuelve un cleanup que purga el scope (lo usa useUndoScope al desmontar). */
  registerScope: (scope: string) => () => void;
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

  // Solo el ÚLTIMO comando muestra contador. El stack vive en un ref (no se renderiza entero).
  const [visible, setVisible] = useState<{ id: number; label: string } | null>(null);
  const [remaining, setRemaining] = useState(0);

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
        if (left <= 0) {
          setVisible(null);
          setRemaining(0);
        } else {
          setRemaining(left);
        }
      }, 250);
    },
    [stopTick],
  );

  const pushUndo = useCallback(
    (cmd: UndoCommand) => {
      const now = Date.now();
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
    stackRef.current = stackRef.current.filter((e) => e.scope !== scope);
    setVisible((v) => (v && !stackRef.current.some((e) => e.id === v.id) ? null : v));
  }, []);

  const registerScope = useCallback(
    (scope: string) => () => clearScope(scope),
    [clearScope],
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

  // Pop & run del último comando del stack (el más reciente, sin importar scope: la
  // purga al desmontar garantiza que el stack solo tenga entradas de superficies montadas).
  const popAndRun = useCallback(() => {
    const entry = stackRef.current.pop();
    if (!entry) return false;
    setVisible((v) => (v && v.id === entry.id ? null : v));
    void runUndo(entry);
    return true;
  }, [runUndo]);

  // Atajo global Ctrl/Cmd+Z. Guard: no pisar el undo nativo del texto ni actuar sin entradas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "z") return;
      const el = document.activeElement as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
      }
      if (stackRef.current.length === 0) return;
      e.preventDefault();
      popAndRun();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popAndRun]);

  const api = useMemo<UndoApi>(
    () => ({ pushUndo, clearScope, registerScope }),
    [pushUndo, clearScope, registerScope],
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
              onClick={() => popAndRun()}
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
 * Marca un scope como montado y PURGA sus entradas al desmontar la superficie. Llamalo
 * en el componente raíz de cada editor con su scope estable (p. ej. `cronograma:${projectId}`).
 */
export function useUndoScope(scope: string) {
  const { registerScope } = useUndo();
  useEffect(() => registerScope(scope), [registerScope, scope]);
}
