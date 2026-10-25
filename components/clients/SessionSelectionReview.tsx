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
import { useState, useEffect, useCallback, useRef } from "react";
import { Modal } from "@/components/ui";
import { Select } from "@/components/ui/Input";
import { EQUIPOS, EQUIPOS_DEL_CLIENTE, esEquipo, type ClaveDeEquipo } from "@/lib/exploraciones/equipos";
import { useToast } from "@/components/ui/Toast";
import {
  coincideConLaBusqueda,
  MIN_BUSQUEDA_CALENDARIO,
  MIN_BUSQUEDA_SIN_DUENIO,
} from "@/lib/sessions/candidatas-internas";
import { resumirSala, textoDeSala } from "@/lib/sessions/participantes";
import { esSoloElegidas, usaReglaDeRelevancia, type DestinoDeContexto } from "@/lib/sessions/destinos-de-contexto";
import { MAX_ELEGIDAS_A_LEER, MAX_ELEGIDAS_ENTERAS, documentoDelDestino } from "@/lib/contexto/documento";
import { BotonBlanco, BotonTexto, BotonUsar, FilaSugerida, FranjaDeSugerencias } from "@/components/ui/sistema";
import {
  avisoDelMaterial,
  insigniaDelMaterial,
  resumenDelInforme,
  type InformeDelMaterial,
  type InsigniaDelMaterial,
} from "@/lib/contexto/material-cronograma";
import EnlaceDeContexto from "@/components/contexto/EnlaceDeContexto";
import ListaDeReuniones from "@/components/contexto/ListaDeReuniones";
import { estadoDeLaReunion, estadoDesdeInsignia, fechaDeReunion } from "@/lib/contexto/lista-de-reuniones";

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
  /** Nexus la sugirió para este documento y alguien la descartó (etapa 7). Se puede elegir igual. */
  desestimada?: boolean;
  /** Es del proyecto (vínculo vivo): va bajo «Del proyecto». En el cronograma, todas; en los seis documentos, arriba de las del cliente. */
  delProyecto?: boolean;
}
/**
 * Una reunión que Nexus SUGIERE para el documento (etapa 7, solo los seis que leen las elegidas): las sesiones de la
 * exploración en el diagnóstico, las reuniones con hechos abiertos y las reuniones con el cliente que el documento leía
 * antes de la etapa 7. Se calcula al leer; no entra hasta que alguien
 * toca «Usar» (escribe `true`), y «Descartar» la deja desestimada (`false`).
 */
interface SugeridaSession {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  /** Por qué la sugiere Nexus: «Sesión 2 de la exploración», la frase de un hecho o «Reunión con el cliente en este proyecto». */
  motivo: string;
  fuente: "exploracion" | "proyecto" | "hecho" | "reunion";
  alsoIn?: string[];
  sinContenido?: boolean;
  /** Solo en el diagnóstico (L5, 2026-10-25): el equipo del cliente de la reunión que entra sola. null = sin equipo. */
  equipo?: ClaveDeEquipo | null;
}

/** Una fila del modal o el rótulo de un grupo. */
type FilaDelModal = CandidateSession | { separador: string };

/**
 * «Equipo del cliente» de una reunión que entra sola al diagnóstico (L5 etapa 2, 2026-10-25). La de una sesión de la
 * exploración lo muestra (se cambia en la sesión); la de una reunión del proyecto lo elige acá.
 */
function EquipoDeLaReunion({
  equipo,
  editable,
  onCambiar,
}: {
  equipo: ClaveDeEquipo | null;
  /** false = de una sesión de la exploración (solo se muestra) o sin permiso. */
  editable: boolean;
  onCambiar: (equipo: ClaveDeEquipo | null) => void;
}) {
  if (!editable) {
    return equipo ? <span className="text-xs text-fg-muted"> · {EQUIPOS[equipo].nombre}</span> : null;
  }
  return (
    <Select
      value={equipo ?? ""}
      onChange={(e) => onCambiar(esEquipo(e.target.value) ? e.target.value : null)}
      aria-label="Equipo del cliente de esta reunión"
      title="Con qué equipo del cliente fue: el diagnóstico la lee por equipo"
      className="ml-1 w-auto px-1.5 py-0.5 text-xs"
    >
      <option value="">Equipo del cliente…</option>
      {EQUIPOS_DEL_CLIENTE.map((e) => (
        <option key={e} value={e}>
          {EQUIPOS[e].nombre}
        </option>
      ))}
    </Select>
  );
}

/** Lo que dice la franja de las reuniones que entran solas al diagnóstico (la exploración y las del proyecto con texto). */
function fraseDeLasQueEntranSolas(total: number, deLaExploracion: number): string {
  const delProyecto = total - deLaExploracion;
  const lectura =
    total > MAX_ELEGIDAS_A_LEER
      ? ` Lee ${MAX_ELEGIDAS_A_LEER}: primero las elegidas y las de la exploración (6 enteras), después las más recientes; las más viejas quedan afuera.`
      : total > 6
        ? " Lee 6 enteras (primero las elegidas y las de la exploración) y las demás en resumen."
        : "";
  if (delProyecto === 0) {
    return total === 1
      ? "La reunión de la sesión de la exploración entra sola y entera al diagnóstico."
      : `Las ${total} reuniones de las sesiones de la exploración entran solas al diagnóstico.${lectura}`;
  }
  if (deLaExploracion === 0) {
    return total === 1
      ? "La reunión del proyecto con texto entra sola al diagnóstico. «Sacar» la deja afuera."
      : `Las ${total} reuniones del proyecto con texto entran solas al diagnóstico. «Sacar» deja afuera la que no va.${lectura}`;
  }
  return `${total} reuniones entran solas al diagnóstico: las de las sesiones de la exploración y las del proyecto con texto. «Sacar» deja afuera la que no va.${lectura}`;
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
  onErrorDeCarga,
  onSugeridas,
  destino = "handoff",
  materialDelCronograma = null,
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
  /**
   * Avisa si la lista NO se pudo cargar (true) o ya se cargó bien (false). Mientras falla, `onCount`
   * no se llama: un fallo no es «0 reuniones elegidas» (revisión adversarial, 2026-09-24).
   */
  onErrorDeCarga?: (error: boolean) => void;
  /** Reporta cuántas reuniones sugiere Nexus (solo los seis documentos que leen las elegidas): la línea cerrada lo dice. */
  onSugeridas?: (n: number) => void;
  /**
   * SOLO el cronograma (2026-09-23): qué le llega a la IA de cada reunión elegida — el informe de
   * GET /timeline/material, que sale del mismo cargador que usan los agentes. Con él, cada fila dice
   * si entra completa, recortada o no entra, y el aviso de arriba cuenta lo mismo. `null` (el
   * handoff, o el informe todavía no llegó o falló) = las insignias de siempre.
   */
  materialDelCronograma?: InformeDelMaterial | null;
}) {
  const esCronograma = destino === "cronograma";
  /* Los documentos del proyecto (lib/contexto/documento.ts) escriben cada uno en SU columna, por la
     puerta de su pieza. Desde la etapa 7 los seis que leen SOLO LAS ELEGIDAS (diagnóstico,
     planificación, ejecución, kickoff, integraciones y entrega) se comportan como el cronograma: la X
     deja de elegirla (sin «Excluidas»), deshacer la vuelve a elegir, y lo que sugiere Nexus va arriba,
     aparte, con «Usar» y «Descartar» (DECISIONS «Los documentos leen la memoria y solo las reuniones
     elegidas»). */
  const docConContexto = documentoDelDestino(destino);
  const soloElegidas = esSoloElegidas(destino);
  /* Cada destino lee su lista y escribe en SU puerta: la X del cronograma nunca toca el handoff. */
  const urlCandidatas = `/api/projects/${projectId}/session-candidates${destino === "handoff" ? "" : `?para=${destino}`}`;
  const urlPuerta = esCronograma
    ? `/api/projects/${projectId}/timeline/sessions`
    : docConContexto
      ? `/api/projects/${projectId}/contexto/${docConContexto.pieza}/sessions`
      : `/api/projects/${projectId}/handoff-sessions`;
  const documento = esCronograma ? "cronograma" : docConContexto ? docConContexto.elDocumento.replace(/^(el|la) /, "") : "handoff";
  // «del diagnóstico» / «de la planificación», «este diagnóstico» / «esta ejecución»: con género.
  const esFemenino = docConContexto?.elDocumento.startsWith("la ") ?? false;
  const delDocumento = `${esFemenino ? "de la" : "del"} ${documento}`;
  const esteDocumento = `${esFemenino ? "esta" : "este"} ${documento}`;
  /* El cronograma no tiene regla de relevancia: ninguna reunión se destaca ni se atenúa por su
     título (el chip «aplica» es del handoff). */
  const conRegla = usaReglaDeRelevancia(destino);

  const [data, setDataCruda] = useState<{
    feeding: FeedingSession[];
    excluded: ExcludedSession[];
    candidates: CandidateSession[];
    sugeridas: SugeridaSession[];
  }>({
    feeding: [],
    excluded: [],
    candidates: [],
    sugeridas: [],
  });
  /* El handoff y el cronograma no traen `sugeridas`: sin el campo, ninguna. */
  const setData = useCallback(
    (d: { feeding: FeedingSession[]; excluded: ExcludedSession[]; candidates: CandidateSession[]; sugeridas?: SugeridaSession[] }) =>
      setDataCruda({ ...d, sugeridas: Array.isArray(d.sugeridas) ? d.sugeridas : [] }),
    [],
  );
  const [loading, setLoading] = useState(true);
  /* ⛔ Que la lista no cargue NO es que no haya ninguna (revisión adversarial, 2026-09-24): un 500 o
     un corte de red dejaban la lista vacía y el contador en 0, y el cronograma decía «Todavía no
     elegiste reuniones» mientras la IA sí las leía. */
  const [errorDeCarga, setErrorDeCarga] = useState(false);
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

  /* «De tu calendario» — en TODOS los documentos desde el 2026-10-07 (Elías: «siempre se debe poder
     buscar y agregar cualquier sesión de Meet del usuario o del cliente»; hasta ese día, solo el
     cronograma): las reuniones de quien busca que todavía no son del proyecto. Sin escribir nada
     llegan sus más recientes; con MIN_BUSQUEDA_CALENDARIO letras o más, todo su historial. Mismo
     cuidado que arriba: la respuesta se guarda con la clave que la pidió y «pendiente» se deriva. */
  const [calendario, setCalendario] = useState<{
    clave: string | null;
    sesiones: CandidateSession[];
    hayMas: boolean;
    error?: boolean;
  }>({ clave: null, sesiones: [], hayMas: false });
  const consultaCalendario = search.trim();
  const claveCalendario = showModal ? (consultaCalendario.length >= MIN_BUSQUEDA_CALENDARIO ? consultaCalendario : "") : null;
  const calendarioPendiente = claveCalendario !== null && calendario.clave !== claveCalendario;
  useEffect(() => {
    if (claveCalendario === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(
      () => {
        fetch(`/api/projects/${projectId}/session-candidates/calendario?para=${destino}&q=${encodeURIComponent(claveCalendario)}`, {
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
  }, [claveCalendario, projectId, destino]);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(urlCandidatas);
      if (r.ok) {
        setData(await r.json());
        setErrorDeCarga(false);
      }
    } catch {
      /* ignore */
    }
  }, [urlCandidatas, setData]);

  useEffect(() => {
    let cancelled = false;
    fetch(urlCandidatas)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setErrorDeCarga(false);
        }
      })
      .catch(() => {
        if (!cancelled) setErrorDeCarga(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [urlCandidatas, setData]);

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
        toast.error("No se pudo actualizar la sesión: revisa la conexión.");
      }
      setBusyId(null);
    },
    [urlPuerta, reload, onChange, toast],
  );

  /* Quitar o devolver varias de una vez (la lista de reuniones de todo «Contexto adicional»: la X,
     «Quitar las N», «Vaciar y buscar», «Volver a incluir» y deshacer). La misma puerta, en su forma
     de lista: una sola transacción, y si una no pasa no se escribe ninguna y el error dice cuál.
     `sugeridas` (solo deshacer, fuera de los seis documentos): las que vuelven a «sugerida» y no a
     «agregada a mano». `desestimar` (solo los seis documentos): «Descartar» una sugerencia de Nexus. */
  const postReuniones = useCallback(
    async (cuerpo: { sessionIds: string[]; feeds: boolean; sugeridas?: string[]; desestimar?: boolean }): Promise<boolean> => {
      try {
        const r = await fetch(urlPuerta, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
        if (!r.ok) {
          const d = (await r.json().catch(() => null)) as { error?: string } | null;
          toast.error(d?.error ?? "No se pudieron cambiar las reuniones.");
        }
        /* Se relee igual cuando la puerta rechaza: suele ser porque la lista quedó vieja («ya no es de
           este proyecto: se actualizó la lista»), y sin releer cada intento fallaba igual. */
        await reload();
        onChange?.();
        return r.ok;
      } catch {
        toast.error("No se pudieron cambiar las reuniones: revisa la conexión.");
        return false;
      }
    },
    [urlPuerta, reload, onChange, toast],
  );
  const escribirReuniones = useCallback(
    (sessionIds: string[], feeds: boolean) => postReuniones({ sessionIds, feeds }),
    [postReuniones],
  );
  /* Deshacer deja cada reunión como estaba antes de la X: «agregada a mano» si lo estaba, y si no,
     «sugerida» (el afinado vacío). Sin esto, deshacer la dejaba forzada y con candado. Se recuerda
     cómo estaba cada una mientras alimentaba: al deshacer ya está entre las excluidas. El cronograma
     y los seis documentos (etapa 7) no tienen «sugerida» en la lista (solo alimenta la elegida): ahí
     devolver es elegirla. */
  const forzadas = useRef(new Map<string, boolean>());
  useEffect(() => {
    for (const s of data.feeding) forzadas.current.set(s.sessionId, s.forced);
  }, [data.feeding]);
  const restaurarReuniones = useCallback(
    (sessionIds: string[]) =>
      postReuniones({
        sessionIds,
        feeds: true,
        ...(esCronograma || soloElegidas ? {} : { sugeridas: sessionIds.filter((id) => forzadas.current.get(id) === false) }),
      }),
    [postReuniones, esCronograma, soloElegidas],
  );

  /* Lo que sugiere Nexus (los seis documentos): «Usar» la elige (`true`, el clic de una persona) y
     «Descartar» la desestima (`false`, sin candado: no se sugiere más mientras exista el vínculo; el clasificador
     puede borrar un vínculo que nadie eligió y recrearlo vacío). Nada de esto pasa solo. */
  const [decidiendo, setDecidiendo] = useState<string | null>(null);
  const usarSugeridas = useCallback(
    async (sessionIds: string[], clave: string) => {
      setDecidiendo(clave);
      try {
        await postReuniones({ sessionIds, feeds: true });
      } finally {
        setDecidiendo(null);
      }
    },
    [postReuniones],
  );
  const descartarSugerida = useCallback(
    async (sessionId: string) => {
      setDecidiendo(sessionId);
      try {
        await postReuniones({ sessionIds: [sessionId], feeds: false, desestimar: true });
      } finally {
        setDecidiendo(null);
      }
    },
    [postReuniones],
  );

  /* «Equipo del cliente» de una reunión del proyecto que entra sola al diagnóstico (L5 etapa 2, 2026-10-25): se guarda en
     el vínculo de la reunión con el proyecto y el diagnóstico la lee por equipo. */
  const cambiarEquipo = useCallback(
    async (sessionId: string, equipo: ClaveDeEquipo | null) => {
      try {
        const r = await fetch(`/api/projects/${projectId}/contexto/diagnosis/equipo`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, equipo }),
        });
        if (!r.ok) {
          const d = (await r.json().catch(() => null)) as { error?: string } | null;
          toast.error(d?.error ?? "No se pudo guardar el equipo de la reunión.");
        }
        await reload();
      } catch {
        toast.error("No se pudo guardar el equipo de la reunión: revisa la conexión.");
      }
    },
    [projectId, reload, toast],
  );

  /* En el DIAGNÓSTICO, las reuniones de las sesiones de la exploración (2026-10-23) y, desde el 2026-10-24 (L1 etapa 2),
     todas las demás del proyecto con texto ENTRAN SOLAS (`reunionesQueEntranSolasAlDiagnostico`). El servidor las manda
     como sugeridas de las fuentes `exploracion` y `proyecto`; acá se cuentan y se muestran como lo que son, con «Sacar»
     (`false`). */
  const entranSolasDeLaExploracion =
    destino === "diagnostico" ? data.sugeridas.filter((s) => s.fuente === "exploracion" || s.fuente === "proyecto") : [];
  const nDeLaExploracion = entranSolasDeLaExploracion.filter((s) => s.fuente === "exploracion").length;
  const nEntranSolas = entranSolasDeLaExploracion.length;
  useEffect(() => {
    if (!loading && !errorDeCarga) {
      onCount?.(data.feeding.length + nEntranSolas);
      onExcludedCount?.(data.excluded.length);
      onSugeridas?.(soloElegidas ? data.sugeridas.length - nEntranSolas : 0);
    }
  }, [loading, errorDeCarga, data.feeding.length, data.excluded.length, data.sugeridas.length, nEntranSolas, soloElegidas, onCount, onExcludedCount, onSugeridas]);
  useEffect(() => {
    if (!loading) onErrorDeCarga?.(errorDeCarga);
  }, [loading, errorDeCarga, onErrorDeCarga]);

  const { feeding, excluded, candidates } = data;
  const sugeridas = soloElegidas ? data.sugeridas.filter((s) => !entranSolasDeLaExploracion.includes(s)) : [];
  /* El filtro mira título Y participantes: el caso que lo motivó es "esta reunión la tuvo Marco
     con alguien de tal empresa", y ese dato no está en el título. Escribir un dominio la encuentra. */
  const filtered = candidates.filter((c) => coincideConLaBusqueda(c, search));
  /* Las sin dueño van DEBAJO de las del cliente, con su separador, y sin repetir: una que ya está en
     alguna lista (un proyecto interno ya las recibe todas) o que se acaba de agregar no se duplica. */
  const yaListadas = new Set([...feeding, ...excluded, ...candidates, ...sugeridas, ...entranSolasDeLaExploracion].map((s) => s.sessionId));
  /* El calendario también se filtra acá con lo escrito: con una o dos letras el servidor devuelve
     las recientes sin filtrar, y la lista tiene que responder igual a lo que se tipea. */
  const delCalendario =
    claveCalendario !== null && calendario.clave === claveCalendario
      ? calendario.sesiones.filter((s) => !yaListadas.has(s.sessionId) && coincideConLaBusqueda(s, search))
      : [];
  // Las sin dueño que ya trajo el calendario no se repiten abajo.
  const enElCalendario = new Set(delCalendario.map((s) => s.sessionId));
  const huerfanasQueCoinciden =
    consultaSinDuenio.length >= MIN_BUSQUEDA_SIN_DUENIO && sinDuenio.q === consultaSinDuenio
      ? sinDuenio.sesiones.filter((s) => !yaListadas.has(s.sessionId) && !enElCalendario.has(s.sessionId))
      : [];
  /* Las del servidor, con sus grupos. En los seis documentos, las del proyecto van arriba («Del proyecto») y las demás
     del cliente debajo: desde la etapa 7 una reunión del proyecto entra solo si alguien la elige. */
  const filtradasDelProyecto = soloElegidas ? filtered.filter((c) => c.delProyecto) : [];
  const filtradasDelCliente = soloElegidas ? filtered.filter((c) => !c.delProyecto) : filtered;
  const conGrupoDelProyecto = esCronograma || filtradasDelProyecto.length > 0;
  const listaDelServidor: FilaDelModal[] = esCronograma
    ? [{ separador: "Del proyecto" }, ...filtered]
    : filtradasDelProyecto.length > 0
      ? [
          { separador: "Del proyecto" },
          ...filtradasDelProyecto,
          ...(filtradasDelCliente.length > 0 ? [{ separador: "Del cliente" }, ...filtradasDelCliente] : []),
        ]
      : [{ separador: "Del cliente" }, ...filtered];
  /* Dónde se buscó, en palabras: el cronograma busca en el proyecto; los seis documentos, en el proyecto y el
     cliente; el handoff, en el cliente. */
  const dondeBusca = esCronograma ? "del proyecto" : soloElegidas ? "del proyecto y del cliente" : "del cliente";
  const niDonde = esCronograma ? "del proyecto" : soloElegidas ? "del proyecto ni del cliente" : "del cliente";
  const filasDelModal: FilaDelModal[] =
    delCalendario.length === 0 && huerfanasQueCoinciden.length === 0
      ? conGrupoDelProyecto && filtered.length > 0
        ? listaDelServidor
        : filtered
      : [
          ...(filtered.length > 0 ? listaDelServidor : []),
          ...(delCalendario.length > 0
            ? [{ separador: "De tu calendario · al elegirla queda como reunión del proyecto" }, ...delCalendario]
            : []),
          ...(huerfanasQueCoinciden.length > 0
            ? [{ separador: "Sin cliente asignado · al agregarla queda como reunión de este cliente" }, ...huerfanasQueCoinciden]
            : []),
        ];

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
            : soloElegidas
              ? "Buscar en el proyecto, en el cliente y en tu calendario — título, persona o dominio…"
              : "Buscar en el cliente y en tu calendario — título, persona o dominio…"
        }
        aria-label="Buscar sesiones"
        aria-describedby="ayuda-buscar-sesiones"
        autoFocus
        className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand mb-1.5"
      />
      <p id="ayuda-buscar-sesiones" className="text-[11px] text-fg-muted mb-3">
        {calendarioPendiente || sinDuenioPendiente ? (
          "Buscando en tu calendario…"
        ) : calendario.error ? (
          <span className="text-warn-ink">
            No se pudo buscar en tu calendario. Prueba de nuevo en un momento.
          </span>
        ) : sinDuenio.error ? (
          <span className="text-warn-ink">
            No se pudo buscar en las reuniones sin cliente asignado. Prueba de nuevo en un momento.
          </span>
        ) : claveCalendario ? (
          `Se buscó en todo tu calendario${esCronograma ? "" : " y en las reuniones sin cliente asignado"}${calendario.hayMas ? " — hay más resultados: afina la búsqueda" : ""}.`
        ) : (
          `Arriba, las reuniones ${dondeBusca}; abajo, tus reuniones más recientes que ya tienen cliente. Con ${MIN_BUSQUEDA_CALENDARIO} letras o más se busca en todo tu calendario, también en las que no tienen cliente asignado.`
        )}
      </p>
      {filasDelModal.length === 0 ? (
        <p className="text-xs text-fg-muted py-2">
          {sinDuenioPendiente || calendarioPendiente
            ? "Buscando…"
            : search.trim()
              ? `Ninguna reunión coincide con «${search.trim()}», ni ${esCronograma ? "en el proyecto" : niDonde} ni en tu calendario.`
              : `No hay reuniones para elegir: ni ${niDonde} ni en tu calendario.`}
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
                  {c.desestimada && (
                    /* Nexus la sugirió y alguien la descartó: se puede elegir igual, pero que se sepa. */
                    <span className="text-[9px] font-medium text-fg-muted bg-surface-muted border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                      la descartaste
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
     ahora se veía igual que una que ya pasó. No se saca sola: se dice, y quien la puso decide.
     `lectura` (solo el cronograma): cuánto de la reunión lee la IA cuando se corta lo principal. */
  const meetMeta = (date: string, alsoIn?: string[], futura?: boolean, lectura?: string) =>
    `Reunión · ${fmtDate(date)}${futura ? " · todavía no ocurrió" : ""}${lectura ? ` · ${lectura}` : ""}${alsoIn && alsoIn.length ? ` · también en ${alsoIn.join(", ")}` : ""}`;

  /* La línea de datos de la columna: la fecha y, si está en otros proyectos, cuáles. Sin «Reunión ·»
     ni ícono por fila: el de Meet ya está en el título de la columna. */
  const datosDeLaReunion = (date: string, alsoIn?: string[]) =>
    `${fechaDeReunion(date)}${alsoIn && alsoIn.length ? ` · también en ${alsoIn.join(", ")}` : ""}`;

  // Modo columna (Contexto): incluidas + excluidas con toggle, "buscar más" + el modal.
  if (columnMode) {
    /* Cuántas de las que ALIMENTAN el handoff ocurrieron y no dejaron nada. Se deriva de la
       lista en vez de pedirle un contador al servidor: un número que viaja aparte de las filas
       que lo justifican se desincroniza el día que una de las dos cambie. */
    const alimentanVacias = feeding.filter((s) => s.sinContenido).length;
    /* Con el informe del cronograma, el aviso y las insignias dicen lo que le LLEGA a la IA (el
       mismo plan que arma el prompt), y reemplazan al aviso de las vacías: el informe también las
       cuenta. Sin informe (el handoff, o todavía no llegó), todo queda como siempre. */
    const material = esCronograma ? materialDelCronograma : null;
    const avisoMaterial = material ? avisoDelMaterial(resumenDelInforme(material)) : [];
    const insignias = new Map<string, InsigniaDelMaterial>();
    for (const fila of material?.reuniones ?? []) {
      const insignia = insigniaDelMaterial(fila);
      if (insignia) insignias.set(fila.sessionId, insignia);
    }
    // Igual que la preventa: la lista arriba y el enlace al pie, a la misma altura que el de la otra columna.
    return (
      <div className="flex flex-1 flex-col gap-2">
        {avisoMaterial.length > 0 && (
          <p className="rounded-lg border border-warn-line bg-warn-surface px-2.5 py-2 text-[11px] leading-snug text-warn-ink">
            {avisoMaterial.join(" ")}
          </p>
        )}
        {!material && alimentanVacias > 0 && (
          <p className="rounded-lg border border-warn-line bg-warn-surface px-2.5 py-2 text-[11px] leading-snug text-warn-ink">
            <strong>
              {alimentanVacias} {alimentanVacias === 1 ? "reunión alimenta" : "reuniones alimentan"}
            </strong>{" "}
            {esteDocumento} sin transcripción ni resumen. El documento se va a escribir sobre ese
            hueco — si tienes las notas, pégalas en <em>Fuentes manuales</em>.
          </p>
        )}
        {/* Las de las sesiones de la exploración, en el diagnóstico: entran solas y enteras (2026-10-23). «Sacar» las
            desestima (`false`) y deja de leerlas. */}
        {entranSolasDeLaExploracion.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <FranjaDeSugerencias>
              {fraseDeLasQueEntranSolas(entranSolasDeLaExploracion.length, nDeLaExploracion)}
            </FranjaDeSugerencias>
            <ul className="flex flex-col gap-1.5">
              {entranSolasDeLaExploracion.map((s) => (
                <FilaSugerida
                  key={s.sessionId}
                  origen={<span className="min-w-0 truncate" title={s.motivo}>{s.motivo}</span>}
                  acciones={
                    readOnly ? undefined : (
                      <BotonTexto
                        onClick={() => void descartarSugerida(s.sessionId)}
                        disabled={decidiendo !== null}
                        title="El diagnóstico deja de leerla"
                      >
                        Sacar
                      </BotonTexto>
                    )
                  }
                >
                  <span className="font-medium">{s.title || "Sin título"}</span>
                  <span className="text-xs text-fg-muted">
                    {" "}
                    · {datosDeLaReunion(s.date, s.alsoIn)}
                    {s.sinContenido ? " · sin transcripción" : ""}
                  </span>
                  {s.equipo !== undefined && (
                    <EquipoDeLaReunion
                      equipo={s.equipo}
                      editable={!readOnly && s.fuente === "proyecto"}
                      onCambiar={(equipo) => void cambiarEquipo(s.sessionId, equipo)}
                    />
                  )}
                </FilaSugerida>
              ))}
            </ul>
          </div>
        )}
        {/* Lo que sugiere Nexus (etapa 7, solo los seis documentos): arriba y una sola vez, con las piezas del
            sistema. Se calcula al leer: no entra al documento hasta que alguien toca «Usar». */}
        {sugeridas.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <FranjaDeSugerencias
              acciones={
                !readOnly && sugeridas.length > 1 ? (
                  <BotonBlanco
                    onClick={() => void usarSugeridas(sugeridas.map((s) => s.sessionId), "todas")}
                    disabled={decidiendo !== null}
                  >
                    Usar todas
                  </BotonBlanco>
                ) : undefined
              }
            >
              Nexus sugiere {sugeridas.length} {sugeridas.length === 1 ? "reunión" : "reuniones"} para {docConContexto?.elDocumento ?? esteDocumento}. La IA
              no las lee enteras hasta que las uses.
            </FranjaDeSugerencias>
            <ul className="flex flex-col gap-1.5">
              {sugeridas.map((s) => (
                <FilaSugerida
                  key={s.sessionId}
                  origen={<span className="min-w-0 truncate" title={s.motivo}>{s.motivo}</span>}
                  acciones={
                    readOnly ? undefined : (
                      <>
                        <BotonTexto
                          onClick={() => void descartarSugerida(s.sessionId)}
                          disabled={decidiendo !== null}
                          title="Por ahora no la sugiere más para este documento"
                        >
                          Descartar
                        </BotonTexto>
                        <BotonUsar
                          onClick={() => void usarSugeridas([s.sessionId], s.sessionId)}
                          disabled={decidiendo !== null}
                          title={`La IA la lee al escribir ${esteDocumento} (entera si está entre las ${MAX_ELEGIDAS_ENTERAS} elegidas más recientes)`}
                        />
                      </>
                    )
                  }
                >
                  <span className="font-medium">{s.title || "Sin título"}</span>
                  <span className="text-xs text-fg-muted">
                    {" "}
                    · {datosDeLaReunion(s.date, s.alsoIn)}
                    {s.sinContenido ? " · sin transcripción" : ""}
                  </span>
                  {s.equipo !== undefined && (
                    <EquipoDeLaReunion
                      equipo={s.equipo}
                      editable={!readOnly && s.fuente === "proyecto"}
                      onCambiar={(equipo) => void cambiarEquipo(s.sessionId, equipo)}
                    />
                  )}
                </FilaSugerida>
              ))}
            </ul>
          </div>
        )}
        {/* La lista de reuniones de todo «Contexto adicional» (2026-10-09): una tarjeta, casillas para
            elegir varias, la X al pasar el mouse, deshacer con Ctrl+Z y las excluidas plegadas. Los
            estados van como punto + texto en la línea de datos; el de la insignia del material del
            cronograma lleva su detalle («la IA lee 3 200 de 7 100 caracteres») en el `title`. */}
        <ListaDeReuniones
          reuniones={feeding.map((s) => {
            const insignia = insignias.get(s.sessionId);
            return {
              id: s.sessionId,
              titulo: s.title || "Sin título",
              datos: datosDeLaReunion(s.date, s.alsoIn),
              estado: estadoDeLaReunion({ futura: s.futura, sinTranscripcion: s.sinContenido }) ?? estadoDesdeInsignia(insignia),
              title: insignia?.detalle,
            };
          })}
          /* En el cronograma y en los seis documentos no hay excluidas: sacar es dejar de elegir. */
          excluidas={soloElegidas ? [] : excluded.map((s) => ({
            id: s.sessionId,
            titulo: s.title || "Sin título",
            datos: datosDeLaReunion(s.date, s.alsoIn),
          }))}
          puedeEditar={!readOnly}
          escribir={escribirReuniones}
          restaurar={restaurarReuniones}
          onBuscar={() => setShowModal(true)}
          vacio={
            errorDeCarga
              ? `No se pudo cargar la lista de reuniones ${delDocumento}: recarga la página. Lo que elegiste sigue elegido.`
              : esCronograma
                ? "Todavía no elegiste reuniones para el cronograma. Búscalas en tu calendario o entre las del proyecto."
                : soloElegidas && entranSolasDeLaExploracion.length > 0
                  ? "Ninguna elegida a mano: la IA lee las que entran solas (arriba). Suma las que quieras."
                  : soloElegidas
                  ? "Sin reuniones elegidas: la IA no lee ninguna reunión, solo la memoria del proyecto. Elige las que quieras que lea enteras."
                  : `Ninguna reunión alimenta ${esteDocumento}. Búscala con «Buscar una reunión de Meet».`
          }
          etiquetaQuitar={(titulo) =>
            esCronograma || soloElegidas ? `Sacar «${titulo}» ${delDocumento}` : `Excluir «${titulo}» ${delDocumento}`
          }
          tituloQuitar={
            esCronograma || soloElegidas
              ? `Sacar ${delDocumento} (sigue siendo reunión del proyecto)`
              : `Excluir ${delDocumento} (no la desvincula del proyecto)`
          }
          cargando={loading}
        />
        {!readOnly && <EnlaceDeContexto onClick={() => setShowModal(true)}>Buscar una reunión de Meet</EnlaceDeContexto>}
        {searchModal}
      </div>
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
        handoff/kickoff o tengan Ventas en la sala. Revisa y poda antes de generar.
      </p>

      {feeding.length === 0 ? (
        <p className="text-xs text-fg-muted">
          {errorDeCarga
            ? "No se pudo cargar la lista de sesiones del handoff: recarga la página. Lo que elegiste sigue elegido."
            : "Todavía no hay sesiones de venta para este proyecto. Busca más abajo o pega la transcripción a mano."}
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
                {/* ⚠ `meetMeta` incluye el «aún no ocurrió» (la columna lo dice con su punto ámbar). Sin eso, una
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
