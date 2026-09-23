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
import { useToast } from "@/components/ui/Toast";
import {
  coincideConLaBusqueda,
  MIN_BUSQUEDA_CALENDARIO,
  MIN_BUSQUEDA_SIN_DUENIO,
} from "@/lib/sessions/candidatas-internas";
import { resumirSala, textoDeSala } from "@/lib/sessions/participantes";
import { usaReglaDeRelevancia, type DestinoDeContexto } from "@/lib/sessions/destinos-de-contexto";
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
  /**
   * Ya ocurrió y NO dejó nada: ni transcripción, ni resumen, ni minuta.
   *
   * Es la fila más engañosa del panel: alimenta el handoff, se pintaba «Incluida» en verde igual
   * que una llena de material, y el documento se escribe sobre un hueco sin que nadie lo sepa.
   */
  sinContenido?: boolean;
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
  /**
   * Solo gente nuestra en la sala. Lo manda la búsqueda de sin dueño: `false` = hubo alguien de
   * afuera cuyo dominio no es de ningún cliente, y la fila dice «sin cliente asignado».
   */
  soloEquipo?: boolean;
  /**
   * No se agrega con un clic, y por qué: sin dueño con gente de afuera o colgada de otro cliente, o
   * —en el calendario del cronograma— una reunión de OTRO cliente. La fila manda a Sesiones en vez
   * de ofrecer un botón que la puerta va a rechazar.
   */
  motivoNoAdoptable?: string | null;
  /** Todavía no ocurrió (solo las reuniones del proyecto que se ofrecen en el cronograma). */
  futura?: boolean;
}

/** Una fila del modal o el rótulo de un grupo. */
type FilaDelModal = CandidateSession | { separador: string };

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
  destino = "handoff",
}: {
  projectId: string;
  /**
   * Para qué documento es el panel (2026-09-23): el HANDOFF (el de siempre) o el CRONOGRAMA
   * («Contexto del cronograma»). Cambia la regla de qué alimenta, a qué puerta escribe y los
   * textos; lo que cambia vive en `lib/sessions/destinos-de-contexto.ts`.
   */
  destino?: DestinoDeContexto;
  onChange?: () => void;
  readOnly?: boolean;
  /** Render compacto para la columna "Google Meet" de Contexto (sin header propio). */
  columnMode?: boolean;
  /** Reporta la cantidad de sesiones que alimentan (para el contador del header). */
  onCount?: (n: number) => void;
  /** Reporta la cantidad de sesiones excluidas a mano (para el contador honesto). */
  onExcludedCount?: (n: number) => void;
}) {
  const esCronograma = destino === "cronograma";
  /* Cada destino lee su lista y escribe en SU puerta: la X del cronograma nunca toca el handoff. */
  const urlCandidatas = `/api/projects/${projectId}/session-candidates${esCronograma ? "?para=cronograma" : ""}`;
  const urlPuerta = esCronograma
    ? `/api/projects/${projectId}/timeline/sessions`
    : `/api/projects/${projectId}/handoff-sessions`;
  const documento = esCronograma ? "cronograma" : "handoff";
  /* El cronograma no tiene regla de relevancia: ninguna reunión se destaca ni se atenúa por su
     título (el chip «aplica» es del handoff). */
  const conRegla = usaReglaDeRelevancia(destino);

  const [data, setData] = useState<{ feeding: FeedingSession[]; excluded: ExcludedSession[]; candidates: CandidateSession[] }>({
    feeding: [],
    excluded: [],
    candidates: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");

  /* Reuniones SIN DUEÑO que coinciden con lo escrito (session-candidates/sin-duenio, 2026-09-22).
     Se piden solo con MIN_BUSQUEDA_SIN_DUENIO letras o más y se guardan junto a la búsqueda que las
     trajo: una respuesta vieja nunca se pinta debajo de una búsqueda nueva. */
  const [sinDuenio, setSinDuenio] = useState<{ q: string; sesiones: CandidateSession[]; error?: boolean }>({
    q: "",
    sesiones: [],
  });
  /* El cronograma no busca huérfanas sueltas: busca en el calendario de quien lo usa (abajo), que
     ya trae las del equipo en las que estuvo. */
  const consultaSinDuenio = showModal && !esCronograma ? search.trim() : "";
  /* «Pendiente» se DERIVA: hay una búsqueda que corresponde hacer y la respuesta guardada no es de
     ella. Con un booleano aparte, los 300 ms de espera y cualquier fallo se pintaban como
     «también se buscó» sin haber buscado nada. */
  const sinDuenioPendiente =
    consultaSinDuenio.length >= MIN_BUSQUEDA_SIN_DUENIO && sinDuenio.q !== consultaSinDuenio;
  useEffect(() => {
    if (consultaSinDuenio.length < MIN_BUSQUEDA_SIN_DUENIO) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/projects/${projectId}/session-candidates/sin-duenio?q=${encodeURIComponent(consultaSinDuenio)}`, {
        signal: ctrl.signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then((d: { sesiones?: CandidateSession[] }) =>
          setSinDuenio({
            q: consultaSinDuenio,
            /* La búsqueda de sin dueño viene con el criterio del HANDOFF (aplica / motivo). En el
               cronograma no hay regla de relevancia: se limpia para no atenuar ni explicar con un
               motivo que no aplica. */
            sesiones: (d.sesiones ?? []).map((x) => (conRegla ? x : { ...x, applies: true, reason: "" })),
          }),
        )
        .catch(() => {
          /* Un fallo cierra ESTA búsqueda con su error: sin esto quedaba «Buscando…» para siempre,
             o —peor— se leía como una búsqueda que corrió y no encontró nada. */
          if (!ctrl.signal.aborted) setSinDuenio({ q: consultaSinDuenio, sesiones: [], error: true });
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [consultaSinDuenio, projectId, conRegla]);

  /* «De tu calendario» — solo el CRONOGRAMA (2026-09-23): las reuniones de quien busca que todavía
     no son del proyecto. Sin escribir nada llegan sus más recientes; con MIN_BUSQUEDA_CALENDARIO
     letras o más, todo su historial. Mismo cuidado que arriba: la respuesta se guarda con la clave
     que la pidió y «pendiente» se deriva. */
  const [calendario, setCalendario] = useState<{
    clave: string | null;
    sesiones: CandidateSession[];
    hayMas: boolean;
    error?: boolean;
  }>({ clave: null, sesiones: [], hayMas: false });
  const consultaCalendario = search.trim();
  const claveCalendario =
    showModal && esCronograma ? (consultaCalendario.length >= MIN_BUSQUEDA_CALENDARIO ? consultaCalendario : "") : null;
  const calendarioPendiente = claveCalendario !== null && calendario.clave !== claveCalendario;
  useEffect(() => {
    if (claveCalendario === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(
      () => {
        fetch(`/api/projects/${projectId}/timeline/calendario?q=${encodeURIComponent(claveCalendario)}`, {
          signal: ctrl.signal,
        })
          .then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
          })
          .then((d: { sesiones?: CandidateSession[]; hayMas?: boolean }) =>
            setCalendario({ clave: claveCalendario, sesiones: d.sesiones ?? [], hayMas: !!d.hayMas }),
          )
          .catch(() => {
            if (!ctrl.signal.aborted) setCalendario({ clave: claveCalendario, sesiones: [], hayMas: false, error: true });
          });
      },
      // Al abrir, sin espera: lo primero que se ve es la lista, no un «Buscando…».
      claveCalendario ? 300 : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [claveCalendario, projectId]);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(urlCandidatas);
      if (r.ok) setData(await r.json());
    } catch {
      /* ignore */
    }
  }, [urlCandidatas]);

  useEffect(() => {
    let cancelled = false;
    fetch(urlCandidatas)
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
  }, [urlCandidatas]);

  const toast = useToast();
  const setFeeds = useCallback(
    async (sessionId: string, feeds: boolean) => {
      setBusyId(sessionId);
      try {
        const r = await fetch(urlPuerta, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, feeds }),
        });
        /* La puerta puede negarse (reunión de otro cliente, gente de afuera, otra persona la
           asignó recién). Tragarse la respuesta era dejar el botón sin efecto y sin explicación. */
        if (!r.ok) {
          const d = (await r.json().catch(() => null)) as { error?: string } | null;
          toast.error(d?.error ?? "No se pudo actualizar la sesión.");
        }
        await reload();
        onChange?.();
      } catch {
        toast.error("No se pudo actualizar la sesión: revisá la conexión.");
      }
      setBusyId(null);
    },
    [urlPuerta, reload, onChange, toast],
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
  /* Las sin dueño van DEBAJO de las del cliente, con su separador, y sin repetir: una que ya está en
     alguna lista (un proyecto interno ya las recibe todas) o que se acaba de agregar no se duplica. */
  const yaListadas = new Set([...feeding, ...excluded, ...candidates].map((s) => s.sessionId));
  const huerfanasQueCoinciden =
    consultaSinDuenio.length >= MIN_BUSQUEDA_SIN_DUENIO && sinDuenio.q === consultaSinDuenio
      ? sinDuenio.sesiones.filter((s) => !yaListadas.has(s.sessionId))
      : [];
  /* El calendario también se filtra acá con lo escrito: con una o dos letras el servidor devuelve
     las recientes sin filtrar, y la lista tiene que responder igual a lo que se tipea. */
  const delCalendario =
    claveCalendario !== null && calendario.clave === claveCalendario
      ? calendario.sesiones.filter((s) => !yaListadas.has(s.sessionId) && coincideConLaBusqueda(s, search))
      : [];
  const filasDelModal: FilaDelModal[] = esCronograma
    ? [
        ...(filtered.length > 0 ? [{ separador: "Del proyecto" }, ...filtered] : []),
        ...(delCalendario.length > 0
          ? [{ separador: "De tu calendario · al elegirla queda como reunión del proyecto" }, ...delCalendario]
          : []),
      ]
    : huerfanasQueCoinciden.length > 0
      ? [...filtered, { separador: "Sin cliente asignado · al agregarla queda como reunión de este cliente" }, ...huerfanasQueCoinciden]
      : filtered;

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
        placeholder={
          esCronograma
            ? "Buscar en el proyecto y en tu calendario — título, persona o dominio…"
            : "Buscar por título, persona o dominio…"
        }
        aria-label="Buscar sesiones"
        aria-describedby="ayuda-buscar-sesiones"
        autoFocus
        className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand mb-1.5"
      />
      <p id="ayuda-buscar-sesiones" className="text-[11px] text-fg-muted mb-3">
        {esCronograma ? (
          calendarioPendiente ? (
            "Buscando en tu calendario…"
          ) : calendario.error ? (
            <span className="text-warn-ink">
              No se pudo buscar en tu calendario. Probá de nuevo en un momento.
            </span>
          ) : claveCalendario ? (
            `Se buscó en todo tu calendario${calendario.hayMas ? " — hay más resultados: afiná la búsqueda" : ""}.`
          ) : (
            `Arriba, las reuniones del proyecto; abajo, tus reuniones más recientes. Con ${MIN_BUSQUEDA_CALENDARIO} letras o más se busca en todo tu calendario.`
          )
        ) : consultaSinDuenio.length < MIN_BUSQUEDA_SIN_DUENIO ? (
          `Con ${MIN_BUSQUEDA_SIN_DUENIO} letras o más también se busca en las reuniones que no tienen cliente asignado.`
        ) : sinDuenioPendiente ? (
          "Buscando también en las reuniones sin cliente asignado…"
        ) : sinDuenio.error ? (
          <span className="text-warn-ink">
            No se pudo buscar en las reuniones sin cliente asignado. Probá de nuevo en un momento.
          </span>
        ) : (
          "También se buscó en las reuniones sin cliente asignado."
        )}
      </p>
      {filasDelModal.length === 0 ? (
        <p className="text-xs text-fg-muted py-2">
          {sinDuenioPendiente || calendarioPendiente
            ? "Buscando…"
            : esCronograma
              ? search.trim()
                ? `Ninguna reunión coincide con «${search.trim()}», ni en el proyecto ni en tu calendario.`
                : "No hay reuniones para elegir: ni del proyecto ni en tu calendario."
              : search.trim()
              ? `Ninguna reunión coincide con «${search.trim()}»${
                  consultaSinDuenio.length >= MIN_BUSQUEDA_SIN_DUENIO && !sinDuenio.error
                    ? ", tampoco entre las que no tienen cliente asignado"
                    : ""
                }.`
              : "No hay más sesiones."}
        </p>
      ) : (
        // ⚠ El tope va en vh, no en un valor fijo: el cuerpo del Modal YA scrollea dentro de un
        // panel de max-h-[85vh], así que el `max-h-80` (320px) que había acá creaba un scroll
        // anidado — cuatro filas visibles y el resto de la pantalla desperdiciado.
        <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {filasDelModal.map((c) => {
            if ("separador" in c) {
              return (
                <li
                  key={`separador-${c.separador}`}
                  className="pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted"
                >
                  {c.separador}
                </li>
              );
            }
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
              className={`flex items-start gap-2 rounded-lg border border-line px-3 py-2 ${(c.applies || !conRegla) && !c.sinContenido ? "" : "opacity-60"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-fg truncate">{c.title || "Sin título"}</span>
                  <span className="text-[10px] text-fg-muted flex-shrink-0">{fmtDate(c.date)}</span>
                  {dur && <span className="text-[10px] text-fg-muted flex-shrink-0">· {dur}</span>}
                  {conRegla && c.applies && (
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
                      {c.soloEquipo === false ? "sin cliente asignado" : "reunión del equipo"}
                    </span>
                  )}
                  {c.futura && (
                    <span className="text-[9px] font-medium text-warn-ink bg-warn-surface border border-warn-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      aún no ocurrió
                    </span>
                  )}
                  {c.sinContenido && !c.futura && (
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
                {c.motivoNoAdoptable && (
                  <div className="text-[10px] text-warn-ink mt-0.5">{c.motivoNoAdoptable}</div>
                )}
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
              {c.motivoNoAdoptable ? (
                /* No hay botón que prometa lo que la puerta va a rechazar: va a Sesiones, con la
                   reunión abierta, donde se ve quién estuvo y se elige el cliente a mano. */
                <a
                  href={`/sessions?s=${encodeURIComponent(c.sessionId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c.motivoNoAdoptable}
                  className="text-[11px] font-semibold text-brand hover:text-brand-dark transition-colors flex-shrink-0"
                >
                  Asignar en Sesiones
                </a>
              ) : (
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
              )}
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
    /* Cuántas de las que ALIMENTAN el handoff ocurrieron y no dejaron nada. Se deriva de la
       lista en vez de pedirle un contador al servidor: un número que viaja aparte de las filas
       que lo justifican se desincroniza el día que una de las dos cambie. */
    const alimentanVacias = feeding.filter((s) => s.sinContenido).length;
    return (
      <>
        {alimentanVacias > 0 && (
          <p className="mb-2 rounded-lg border border-warn-line bg-warn-surface px-2.5 py-2 text-[11px] leading-snug text-warn-ink">
            <strong>
              {alimentanVacias} {alimentanVacias === 1 ? "reunión alimenta" : "reuniones alimentan"}
            </strong>{" "}
            este {documento} sin transcripción ni resumen. El documento se va a escribir sobre ese
            hueco — si tenés las notas, pegalas en <em>Fuentes manuales</em>.
          </p>
        )}
        <ContextColumnList
          loading={loading}
          empty={
            esCronograma
              ? "Todavía no elegiste reuniones para el cronograma. Buscalas en tu calendario o entre las del proyecto."
              : `Ninguna sesión alimenta este ${documento}. Agregala con “Buscar más sesiones”.`
          }
        >
          {feeding.map((s) => (
            <ContextRow
              key={s.sessionId}
              icon={CTX_ICONS.meet}
              meta={meetMeta(s.date, s.alsoIn, s.futura)}
              title={s.title || "Sin título"}
              badge={
                s.futura
                  ? { label: "Aún no ocurrió", tone: "amber" }
                  : s.sinContenido
                    ? { label: "Sin transcripción", tone: "amber" }
                    : { label: esCronograma ? "Elegida" : "Incluida", tone: "green" }
              }
              onRemove={!readOnly ? () => setFeeds(s.sessionId, false) : undefined}
              removeTitle={
                esCronograma
                  ? "Sacar del cronograma (sigue siendo reunión del proyecto)"
                  : `Excluir del ${documento} (no la desvincula del proyecto)`
              }
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
            {esCronograma ? "Buscar sesiones" : "Buscar más sesiones"}
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
