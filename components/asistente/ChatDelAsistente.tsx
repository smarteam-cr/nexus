"use client";
/**
 * components/asistente/ChatDelAsistente.tsx — EL PANEL QUE CONVIVE CON EL DOCUMENTO.
 *
 * ── EL ÚNICO TRABAJO ESTRUCTURAL DE INTERFAZ DEL CHAT ────────────────────────────────────────
 * Los cuatro paneles deslizantes del repo son MODALES: fondo oscuro, `aria-modal`, y candado
 * sobre `body.overflow`. Ninguno sirve acá, porque la conversación es SOBRE el documento: el CSE
 * tiene que poder mirar el cronograma mientras habla de él, y scrollearlo sin cerrar nada.
 *
 * Así que esto es un cajón NO modal:
 *  · sin fondo oscuro y sin candado de scroll — la página sigue viva debajo;
 *  · `z-[45]`, por DEBAJO de los modales de verdad (z-55/60), así un `ConfirmDialog` lo tapa
 *    como corresponde en vez de pelearse con él;
 *  · por PORTAL a `document.body`, porque el rail del cliente es `sticky` y una capa flotante
 *    adentro de un contenedor con `sticky` se recorta contra él (ya mordido antes).
 *
 * ⚠ El cajón TAPA los ~400 px derechos del documento. Es el canje aceptado: empujar el layout
 * obligaría a tocar el contenedor de todas las piezas, y el cajón se cierra con un clic o con
 * Escape. Si molesta en el Gantt, ahí sí conviene el empuje.
 *
 * ⛔ ESTE COMPONENTE NO ESCRIBE EL DOCUMENTO. Cuando hay acuerdo, pinta la instrucción —EDITABLE—
 * y el botón de aplicar la manda al editor de siempre, con su vista previa y su aceptación por
 * ítem. El permiso vive en ese botón.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/hooks/useHydrated";

export interface AcuerdoDelChat {
  resumen: string;
  instruccion: string;
}

interface TurnoVista {
  id: string;
  rol: "CSE" | "ASISTENTE";
  texto: string;
  acuerdo: AcuerdoDelChat | null;
}

interface Props {
  projectId: string;
  /** El slug de la pieza sobre la que se conversa. */
  pieza: string;
  /** Rótulo visible del documento, para el encabezado. */
  piezaLabel: string;
  abierto: boolean;
  onClose: () => void;
  /**
   * Aplicar lo acordado. Lo resuelve el CANVAS, no el chat: cada pieza tiene su editor y su
   * permiso. Sin esto, el acuerdo se muestra igual (se puede copiar) pero sin botón.
   */
  onAplicar?: (instruccion: string) => Promise<void> | void;
}

export default function ChatDelAsistente({
  projectId,
  pieza,
  piezaLabel,
  abierto,
  onClose,
  onAplicar,
}: Props) {
  const hydrated = useHydrated();
  const [turnos, setTurnos] = useState<TurnoVista[]>([]);
  const [cargando, setCargando] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  /* La instrucción es EDITABLE antes de aplicar: ese es el «dar el ok» — un humano leyendo la
     instrucción exacta que se va a ejecutar, no un resumen de ella. */
  const [instruccionEditada, setInstruccionEditada] = useState<Record<string, string>>({});
  const [aplicando, setAplicando] = useState(false);
  const finRef = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/projects/${projectId}/asistente?pieza=${encodeURIComponent(pieza)}`,
      );
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "no se pudo cargar");
      const j = await r.json();
      setTurnos(j.hilo?.turnos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "no se pudo cargar la conversación");
    } finally {
      setCargando(false);
    }
  }, [projectId, pieza]);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  /* Escape cierra. No hay trampa de foco a propósito: el cajón no es modal y el CSE tiene que
     poder tabular al documento. */
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, onClose]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turnos, pensando]);

  async function enviar() {
    const mensaje = texto.trim();
    if (!mensaje || pensando) return;
    setTexto("");
    setPensando(true);
    setError(null);
    /* El turno del CSE se pinta al toque (optimista) para que la pantalla no se sienta muerta
       los ~4 s que tarda el modelo. El servidor devuelve el hilo REAL y lo reemplaza. */
    setTurnos((t) => [...t, { id: `optimista-${t.length}`, rol: "CSE", texto: mensaje, acuerdo: null }]);
    try {
      const r = await fetch(`/api/projects/${projectId}/asistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieza, mensaje }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "el asistente no pudo contestar");
      setTurnos(j.hilo?.turnos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "el asistente no pudo contestar");
      /* Se saca el turno optimista: dejarlo mentiría diciendo que la pregunta quedó guardada. */
      setTurnos((t) => t.filter((x) => !x.id.startsWith("optimista-")));
      setTexto(mensaje);
    } finally {
      setPensando(false);
    }
  }

  async function empezarDeCero() {
    setPensando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/asistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieza, empezarDeCero: true }),
      });
      const j = await r.json().catch(() => ({}));
      setTurnos(j.hilo?.turnos ?? []);
      setInstruccionEditada({});
    } finally {
      setPensando(false);
    }
  }

  async function aplicar(turnoId: string, instruccion: string) {
    if (!onAplicar || aplicando) return;
    setAplicando(true);
    setError(null);
    try {
      await onAplicar(instruccion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "no se pudo aplicar");
    } finally {
      setAplicando(false);
      void turnoId;
    }
  }

  if (!hydrated || !abierto) return null;

  return createPortal(
    <aside
      className="fixed right-0 top-0 h-full z-[45] w-[400px] max-w-[92vw] bg-surface border-l border-line shadow-2xl flex flex-col"
      aria-label={`Asistente sobre ${piezaLabel}`}
    >
      <header className="px-4 py-3 border-b border-line flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg truncate">Asistente · {piezaLabel}</h2>
          <p className="text-xs text-fg-muted">Conversá el cambio antes de generarlo</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {turnos.length > 0 && (
            <button
              onClick={() => void empezarDeCero()}
              disabled={pensando}
              className="px-2 py-1 rounded-lg text-xs text-fg-muted hover:text-fg hover:bg-surface-hover disabled:opacity-60 transition-colors"
              title="Empezar una conversación nueva (la anterior queda guardada)"
            >
              Nueva
            </button>
          )}
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
            aria-label="Cerrar el asistente"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {cargando && <p className="text-xs text-fg-muted">Cargando la conversación…</p>}

        {!cargando && turnos.length === 0 && (
          <div className="text-sm text-fg-secondary space-y-2">
            <p>Preguntale qué se puede cambiar y qué va a costar. Por ejemplo:</p>
            <ul className="text-xs text-fg-muted space-y-1 list-disc pl-4">
              <li>«¿Qué pasa si alargo una fase dos semanas?»</li>
              <li>«Hay fases duplicadas, ¿se pueden unir?»</li>
              <li>«Quiero mover una tarea de fase — ¿pierdo algo?»</li>
            </ul>
            <p className="text-xs text-fg-muted">
              Cuando estén de acuerdo, te deja la instrucción lista para revisar y aplicar.
            </p>
          </div>
        )}

        {turnos.map((t) => (
          <div key={t.id}>
            <div
              className={
                t.rol === "CSE"
                  ? "ml-8 rounded-xl px-3 py-2 bg-surface-active text-sm text-fg whitespace-pre-wrap"
                  : "mr-2 rounded-xl px-3 py-2 bg-surface-muted text-sm text-fg-secondary whitespace-pre-wrap"
              }
            >
              {t.texto}
            </div>

            {t.acuerdo && (
              <div className="mt-2 mr-2 rounded-xl border border-info-line bg-info-surface px-3 py-2">
                <p className="text-xs font-semibold text-info-ink">Lo que se acordó</p>
                <p className="text-sm text-fg mt-1">{t.acuerdo.resumen}</p>
                <label className="block mt-2 text-xs text-fg-muted">
                  La instrucción que se va a ejecutar (podés editarla):
                </label>
                <textarea
                  value={instruccionEditada[t.id] ?? t.acuerdo.instruccion}
                  onChange={(e) =>
                    setInstruccionEditada((m) => ({ ...m, [t.id]: e.target.value }))
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-fg resize-y"
                />
                {onAplicar ? (
                  <button
                    onClick={() =>
                      void aplicar(t.id, instruccionEditada[t.id] ?? t.acuerdo!.instruccion)
                    }
                    disabled={aplicando}
                    className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-60 transition-colors"
                  >
                    {aplicando ? "Aplicando…" : "Aplicar — vas a poder revisarlo antes de guardar"}
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-fg-muted">
                    Copiá esta instrucción y pegala en «Pedir cambio con IA» del documento.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {pensando && <p className="text-xs text-fg-muted">Pensando…</p>}
        {error && (
          <div className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-xs text-danger-ink">
            {error}
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="px-3 py-3 border-t border-line shrink-0">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            /* Enter envía, Shift+Enter hace salto de línea — la convención de un chat. */
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={2}
          placeholder="Escribí qué querés cambiar…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted resize-none"
        />
        <button
          onClick={() => void enviar()}
          disabled={pensando || !texto.trim()}
          className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-60 transition-colors"
        >
          Enviar
        </button>
      </div>
    </aside>,
    document.body,
  );
}
