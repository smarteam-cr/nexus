"use client";

/**
 * components/clients/SessionSelectionReview.tsx
 *
 * Selección revisable de las sesiones que alimentan un handoff (A2 rediseñado).
 *   - Panel limpio: SOLO las que alimentan según la política de link (primaria del
 *     proyecto / secundaria de confianza alta / forzada a mano) + la regla de
 *     relevancia (handoff/kickoff por título o Ventas en sala). La "X" las saca del
 *     handoff sin desvincularlas del proyecto.
 *   - "Buscar más sesiones": pop-up con las demás sesiones del cliente (buscador +
 *     las que aplican destacadas, con el porqué en tooltip). "Agregar" fuerza la
 *     inclusión (lo manual manda — así entra una mixta al handoff de su 2º proyecto).
 *
 * Componente COMPARTIDO (ProjectContextSection en columnMode + stepper). Reusa el override
 * por sesión vía POST /api/projects/[projectId]/handoff-sessions.
 */
import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui";
import { coincideConLaBusqueda } from "@/lib/sessions/candidatas-internas";
import { resumirSala, textoDeSala } from "@/lib/sessions/participantes";
import { ContextColumnList, ContextRow, CTX_ICONS } from "./context-column";

interface FeedingSession {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  source: string;
  confidence: number | null;
  rationale: string | null;
  forced: boolean;
  /** Otros proyectos donde también está linkeada (multi-proyecto) — "también en: X". */
  alsoIn?: string[];
  /** Por qué alimenta: "primaria" | "confianza alta" | "forzada a mano". */
  origin: string;
  /** Todavía no ocurrió. Las CANDIDATAS ya excluyen las futuras; ésta se vinculó de antes. */
  futura?: boolean;
}
interface ExcludedSession {
  sessionId: string;
  title: string;
  date: string;
  alsoIn?: string[];
}
interface CandidateSession {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  organizerEmail?: string | null;
  /** Minutos. Un no-show de 2' y una sesión de trabajo de 50' no se eligen igual. */
  duration?: number | null;
  applies: boolean;
  /** Por qué (no) aplica la regla de relevancia — tooltip. */
  reason: string;
  linkedElsewhere: boolean;
  /** La sacó un humano de ESTE proyecto. El botón dice "Reincluir", no "Agregar". */
  excluidaAca?: boolean;
  /** Ocurrió y no quedó nada: ni transcript, ni resumen, ni minuta. Agregarla no aporta un dato. */
  sinContenido?: boolean;
  /** Reunión del equipo que todavía no es de ningún cliente. Agregarla también la asigna. */
  sinDuenio?: boolean;
}

function fmtDuracion(min: number | null | undefined): string | null {
  /* Redondeado a minutos: el dato viene con decimales y "47,3 min" no ayuda a decidir nada.
     Por debajo del minuto no se muestra — casi siempre es una reunión que no llegó a pasar. */
  if (!min || min < 1) return null;
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function SessionSelectionReview({
  projectId,
  onChange,
  readOnly = false,
  columnMode = false,
  onCount,
  onExcludedCount,
}: {
  projectId: string;
  onChange?: () => void;
  readOnly?: boolean;
  /** Render compacto para la columna "Google Meet" de Contexto (sin header propio). */
  columnMode?: boolean;
  /** Reporta la cantidad de sesiones que alimentan (para el contador del header). */
  onCount?: (n: number) => void;
  /** Reporta la cantidad de sesiones excluidas a mano (para el contador honesto). */
  onExcludedCount?: (n: number) => void;
}) {
  const [data, setData] = useState<{ feeding: FeedingSession[]; excluded: ExcludedSession[]; candidates: CandidateSession[] }>({
    feeding: [],
    excluded: [],
    candidates: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/session-candidates`);
      if (r.ok) setData(await r.json());
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/session-candidates`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const setFeeds = useCallback(
    async (sessionId: string, feeds: boolean) => {
      setBusyId(sessionId);
      try {
        await fetch(`/api/projects/${projectId}/handoff-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, feeds }),
        });
        await reload();
        onChange?.();
      } catch {
        /* ignore */
      }
      setBusyId(null);
    },
    [projectId, reload, onChange],
  );

  useEffect(() => {
    if (!loading) {
      onCount?.(data.feeding.length);
      onExcludedCount?.(data.excluded.length);
    }
  }, [loading, data.feeding.length, data.excluded.length, onCount, onExcludedCount]);

  const { feeding, excluded, candidates } = data;
  /* El filtro mira título Y participantes: el caso que lo motivó es "esta reunión la tuvo Marco
     con alguien de tal empresa", y ese dato no está en el título. Escribir un dominio la encuentra. */
  const filtered = candidates.filter((c) => coincideConLaBusqueda(c, search));

  // Modal de "buscar más sesiones" — compartido por el render normal y el de columna.
  const searchModal = (
    <Modal
      open={showModal}
      onClose={() => { setShowModal(false); setSearch(""); }}
      title="Buscar sesiones"
      /* Era `md` (448px) y cada fila mostraba solo el título. Con quiénes estuvieron en la sala
         adentro, ese ancho obliga a truncar justo lo que se vino a leer. */
      size="xl"
    >
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por título, persona o dominio…"
        className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand mb-3"
      />
      {filtered.length === 0 ? (
        <p className="text-xs text-fg-muted py-2">No hay más sesiones.</p>
      ) : (
        // ⚠ El tope va en vh, no en un valor fijo: el cuerpo del Modal YA scrollea dentro de un
        // panel de max-h-[85vh], así que el `max-h-80` (320px) que había acá creaba un scroll
        // anidado — cuatro filas visibles y el resto de la pantalla desperdiciado.
        <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {filtered.map((c) => {
            /* Quiénes estuvieron en la sala es EL dato que decide, y hasta ahora no se mostraba:
               una reunión con alguien de `lacav.cl` adentro es del proyecto de CAV aunque el
               título no lo diga, y una donde estuvimos solos nosotros es del equipo por más que
               el título nombre a un cliente. Los emails no se pintan enteros —son datos de gente
               real en una pantalla que se comparte—: van los dominios y el conteo. */
            const sala = textoDeSala(resumirSala(c.participants, c.organizerEmail));
            const dur = fmtDuracion(c.duration);
            return (
            <li
              key={c.sessionId}
              className={`flex items-start gap-2 rounded-lg border border-line px-3 py-2 ${c.applies && !c.sinContenido ? "" : "opacity-60"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-fg truncate">{c.title || "Sin título"}</span>
                  <span className="text-[10px] text-fg-muted flex-shrink-0">{fmtDate(c.date)}</span>
                  {dur && <span className="text-[10px] text-fg-muted flex-shrink-0">· {dur}</span>}
                  {c.applies && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      aplica
                    </span>
                  )}
                  {c.linkedElsewhere && (
                    <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      en otro proyecto
                    </span>
                  )}
                  {c.sinDuenio && (
                    <span className="text-[9px] font-medium text-fg-muted bg-surface-muted border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      reunión del equipo
                    </span>
                  )}
                  {c.sinContenido && (
                    /* Se muestra igual —esconderla sería otra desaparición silenciosa— pero
                       marcada: la reunión pasó y no quedó nada de qué leer. */
                    <span className="text-[9px] font-medium text-warn-ink bg-warn-surface border border-warn-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      sin información
                    </span>
                  )}
                  {c.excluidaAca && (
                    /* Sin esta marca, una excluida que vuelve al buscador se lee como una que
                       nunca estuvo — y la persona no entiende por qué "reaparece". */
                    <span className="text-[9px] font-medium text-fg-muted bg-surface-muted border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      la excluiste
                    </span>
                  )}
                </div>
                {(sala || c.reason) && (
                  /* El motivo ("Ventas en la sala", "título de venta") YA llegaba y vivía
                     escondido en el tooltip del <li> — o sea, invisible en móvil y en cualquier
                     lectura rápida. Es justo la explicación de por qué la fila dice "aplica". */
                  <div className="text-[10px] text-fg-muted mt-0.5 truncate">
                    {sala}
                    {sala && c.reason ? " — " : ""}
                    {c.reason}
                  </div>
                )}
              </div>
              <button
                onClick={() => setFeeds(c.sessionId, true)}
                disabled={busyId === c.sessionId}
                /* El texto es la mitad de la mitigación: agregar una reunión sin dueño no solo la
                   vincula, la vuelve del cliente en TODAS las lecturas. Eso no se ve desde acá. */
                title={c.sinDuenio ? "No es de ningún cliente todavía: al agregarla queda como sesión de este cliente." : undefined}
                className="text-[11px] font-semibold text-brand hover:text-brand-dark disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {c.excluidaAca ? "Reincluir" : c.sinDuenio ? "Agregar y asignar" : "Agregar"}
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );

  /* Meta line de una sesión: "Reunión · fecha[ · todavía no ocurrió][ · también en X]".
     ⚠ Lo de "todavía no ocurrió" no es cosmético: los dos grupos de CANDIDATAS excluyen las
     futuras, pero las que ya alimentan nunca pasaron por ese filtro. Una reunión agendada para la
     semana que viene puede estar alimentando el handoff de hoy —medido: 30 vínculos así— y hasta
     ahora se veía igual que una que ya pasó. No se saca sola: se dice, y quien la puso decide. */
  const meetMeta = (date: string, alsoIn?: string[], futura?: boolean) =>
    `Reunión · ${fmtDate(date)}${futura ? " · todavía no ocurrió" : ""}${alsoIn && alsoIn.length ? ` · también en ${alsoIn.join(", ")}` : ""}`;

  // Modo columna (Contexto): incluidas + excluidas con toggle, "buscar más" + el modal.
  if (columnMode) {
    return (
      <>
        <ContextColumnList
          loading={loading}
          empty="Ninguna sesión alimenta este handoff. Agregala con “Buscar más sesiones”."
        >
          {feeding.map((s) => (
            <ContextRow
              key={s.sessionId}
              icon={CTX_ICONS.meet}
              meta={meetMeta(s.date, s.alsoIn, s.futura)}
              title={s.title || "Sin título"}
              badge={s.futura ? { label: "Aún no ocurrió", tone: "amber" } : { label: "Incluida", tone: "green" }}
              onRemove={!readOnly ? () => setFeeds(s.sessionId, false) : undefined}
              removeTitle="Excluir del handoff (no la desvincula del proyecto)"
            />
          ))}
          {excluded.map((s) => (
            <ContextRow
              key={s.sessionId}
              icon={CTX_ICONS.meet}
              meta={meetMeta(s.date, s.alsoIn)}
              title={s.title || "Sin título"}
              badge={{ label: "Excluida", tone: "muted" }}
              dim
              action={
                !readOnly
                  ? { label: "Incluir", onClick: () => setFeeds(s.sessionId, true), disabled: busyId === s.sessionId }
                  : undefined
              }
            />
          ))}
        </ContextColumnList>
        {!readOnly && (
          <button
            onClick={() => setShowModal(true)}
            className="mt-2 w-full inline-flex items-center justify-center gap-1 text-[11px] font-medium text-brand hover:text-brand-dark border border-dashed border-line rounded-lg px-2 py-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
            Buscar más sesiones
          </button>
        )}
        {searchModal}
      </>
    );
  }

  if (loading) return <div className="h-16 rounded-xl border border-line skeleton-shimmer" />;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-fg">
        Sesiones que alimentan el handoff{feeding.length > 0 ? ` (${feeding.length})` : ""}
      </p>
      <p className="text-[11px] text-fg-muted leading-relaxed">
        Entran la sesión primaria del proyecto y las secundarias de alta confianza que sean de
        handoff/kickoff o tengan Ventas en la sala. Revisá y podá antes de generar.
      </p>

      {feeding.length === 0 ? (
        <p className="text-xs text-fg-muted">
          Todavía no hay sesiones de venta para este proyecto. Buscá más abajo o pegá la transcripción a mano.
        </p>
      ) : (
        <ul className="space-y-2">
          {feeding.map((s) => (
            <li
              key={s.sessionId}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted px-3 py-2.5"
            >
              <svg className="w-4 h-4 text-fg-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-fg truncate">{s.title || "Sin título"}</p>
                {/* ⚠ MISMO `meetMeta` que la columna: incluye el «aún no ocurrió». Sin eso, una
                    sesión con fecha futura se lista acá como si ya hubiera pasado — y ésta es
                    justo la pantalla que aparece después de crear o traer un proyecto, o sea el
                    momento en que alguien decide con qué se arma el documento. */}
                <p className="text-[11px] text-fg-muted truncate">
                  {meetMeta(s.date, s.alsoIn, s.futura)} ·{" "}
                  {s.origin ?? (s.forced ? "agregada a mano" : "primaria")}
                </p>
              </div>
              {!readOnly && (
                <button
                  onClick={() => setFeeds(s.sessionId, false)}
                  disabled={busyId === s.sessionId}
                  title="Quitar del handoff (no la desvincula del proyecto)"
                  className="text-fg-muted hover:text-red-500 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-fg-muted">¿Crees que falta alguna sesión del cliente?</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-[11px] font-semibold text-brand hover:text-brand-dark transition-colors inline-flex items-center gap-1 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            Buscar más sesiones
          </button>
        </div>
      )}

      {searchModal}
    </div>
  );
}
