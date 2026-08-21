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
 *
 * ── LO QUE APRENDIÓ DE LA PRIMERA PRUEBA REAL (2026-08-20) ───────────────────────────────────
 * 1. El texto se pintaba como texto plano, así que el `- **Sumar…**` del modelo se veía crudo.
 *    Ahora se renderiza Markdown, y el prompt pide listas NUMERADAS (se leen mejor en 400 px).
 * 2. La instrucción ocupaba media pantalla. Va PLEGADA: el CSE la abre si quiere auditarla.
 * 3. ⛔ El cajón se cerraba aunque el «Aplicar» hubiera FALLADO, y el error aparecía suelto al
 *    pie del documento. El panel se queda abierto y muestra el error donde ocurrió.
 * 4. ⛔ Y el acuerdo quedaba con su botón para siempre, indistinguible de «nunca se intentó».
 *    Ahora el desenlace se ESCRIBE en el hilo y el botón vive solo en el último turno.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { arrastreAlDesmarcar } from "@/lib/timeline/dependencias-de-operaciones";
import type { Operacion } from "@/lib/timeline/operaciones";
import ReactMarkdown from "react-markdown";
import { useHydrated } from "@/lib/hooks/useHydrated";

export interface AcuerdoDelChat {
  resumen: string;
  /** Las operaciones a ejecutar. El camino rápido: milisegundos, sin volver a llamar al modelo. */
  operaciones?: unknown[];
  /**
   * ⭐ Las operaciones traducidas a castellano, calculadas EN EL SERVIDOR. Es lo que la persona
   * lee antes de aplicar — y sale del MISMO objeto que se ejecuta, así que no puede divergir.
   */
  lineas?: string[];
  /** ⚠ LEGACY: hilos anteriores al 2026-08-20 guardaron una instrucción de texto. */
  instruccion?: string;
}

interface TurnoVista {
  id: string;
  rol: "CSE" | "ASISTENTE";
  texto: string;
  acuerdo: AcuerdoDelChat | null;
}

/**
 * Lo que `onAplicar` tiene que contestar.
 *
 * ⛔ `avisos` NO es decoración. El 2026-08-20 Elías pidió borrar una fase con el nombre corrupto,
 * el chat contestó «✅ Se aplicó» — y la fase seguía ahí. No mintió el modelo: el editor la
 * RESCATÓ porque tenía 2 tareas con progreso, que es exactamente lo que debe hacer. Lo que falló
 * fue el desenlace: sabía que la llamada HTTP anduvo, no que el cambio hubiera pasado.
 *
 * Un «se aplicó» sobre algo que no se aplicó es peor que un error: el CSE cierra el panel
 * convencido y se entera días después.
 */
export interface ResultadoDeAplicar {
  /** El motivo del fallo, o null si el editor aceptó el cambio. */
  fallo: string | null;
  /** Lo que el editor hizo DISTINTO de lo pedido (rescates, semanas acomodadas). */
  avisos: string[];
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
   * permiso. ⚠ Devuelve el MOTIVO del fallo o `null` si anduvo — sin eso el panel no puede
   * distinguir «se aplicó» de «falló», que es justo el bug que se arregló.
   */
  onAplicar?: (acuerdo: AcuerdoDelChat) => Promise<ResultadoDeAplicar>;
}

/** El id del cajón. Lo apunta el `aria-controls` del botón que lo abre, en el otro componente. */
export const ID_DEL_CAJON = "cajon-del-asistente";

/** Un solo `Set` vacío compartido: crear uno nuevo por render rompería cualquier memo. */
const EMPTY: ReadonlySet<number> = new Set<number>();

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
  /**
   * ⭐ LO QUE LA PERSONA DESMARCÓ, por turno. Por AUSENCIA: un acuerdo nuevo arranca con todo
   * aceptado, que es el caso normal — desmarcar es la excepción, no el trámite.
   *
   * Antes aplicar era todo-o-nada, y con lotes de doce operaciones eso se volvió una apuesta: la
   * auditoría del 2026-08-21 lo marcó como el hueco más caro del carril rápido.
   */
  const [desmarcadas, setDesmarcadas] = useState<Record<string, Set<number>>>({});
  const [aplicando, setAplicando] = useState(false);
  const finRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * ⭐ EL BOTÓN DE APLICAR VIVE SOLO EN EL ÚLTIMO TURNO, y esa regla resuelve el bug entero.
   * Un acuerdo viejo sigue en el hilo (es historia), pero en cuanto se escribe su desenlace deja
   * de ser el último y el botón desaparece solo. Sin columna nueva y sin una tabla de estados
   * que pueda quedar desincronizada del texto que la explica.
   */
  const idDelAcuerdoVivo = useMemo(() => {
    const ultimo = turnos[turnos.length - 1];
    return ultimo?.acuerdo ? ultimo.id : null;
  }, [turnos]);

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
      if (e.key !== "Escape") return;
      /* ⛔ NO si hay un modal encima. `Modal` escucha en `document` y esto en `window`; el evento
         burbujea a los dos y ninguno corta, así que UN Escape cerraba el modal Y el chat de una:
         el CSE quería descartar una propuesta y encima perdía el hilo. Es el mismo criterio del
         z-index —el cajón vive DEBAJO de los modales— llevado al teclado. */
      if (document.querySelector('[aria-modal="true"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, onClose]);

  /**
   * ⭐ EL FOCO ENTRA AL CAJÓN Y VUELVE DE DONDE VINO.
   *
   * El panel se portaliza al FINAL de `body`, y su disparador vive en el header del documento —
   * arriba de todo. Sin esto, quien abre el chat con teclado tiene que tabular por TODO el
   * cronograma (cada input de cada tarea de cada fase) para llegar al campo de escribir: en la
   * práctica, el chat era inalcanzable sin mouse. Y al cerrar, el portal se desmonta y el foco
   * cae a `body`, así que la persona vuelve al principio del documento.
   *
   * ⚠ NO es una trampa de foco: el cajón no es modal y tabular al documento tiene que seguir
   * funcionando. Solo se pone el foco al abrir y se devuelve al cerrar.
   */
  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => composerRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      previo?.focus?.();
    };
  }, [abierto]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turnos, pensando]);

  async function enviar() {
    const mensaje = texto.trim();
    /* ⛔ Y `aplicando` también: en el carril lento el apply tarda minutos, y un turno que se
       cuela ahí deja el desenlace colgando del acuerdo equivocado — el botón «Aplicar» del
       acuerdo NUEVO se apaga solo, porque vive únicamente en el último turno. El borrador no se
       pierde: queda en el textarea. */
    if (!mensaje || pensando || aplicando) return;
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
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/asistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pieza, empezarDeCero: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "no se pudo empezar de cero");
      /* ⛔ La pantalla se vacía SOLO si el servidor abrió el hilo nuevo. El `?? []` de antes la
         vaciaba también con un body de error: la persona daba la conversación por archivada —sin
         que se hubiera archivado nada— y reaparecía entera con el mensaje siguiente, porque
         `abrirHilo` reusa el hilo vivo.
         ⚠ Un hilo recién abierto trae `turnos: []`, así que VACÍO es una respuesta válida y
         AUSENTE no: por eso `Array.isArray` y no un truthy sobre el largo. */
      if (!Array.isArray(j.hilo?.turnos)) throw new Error("no se pudo empezar de cero");
      setTurnos(j.hilo.turnos);
      setInstruccionEditada({});
    } catch (e) {
      /* La conversación anterior queda en pantalla a propósito: del lado del servidor sigue
         siendo la viva, y el próximo mensaje va a caer ahí. */
      setError(e instanceof Error ? e.message : "no se pudo empezar de cero");
    } finally {
      setPensando(false);
    }
  }

  /** Deja escrito en el hilo qué pasó al aplicar. Ver el porqué en `idDelAcuerdoVivo`. */
  /**
   * ⚠ DEVUELVE SI EL DESENLACE QUEDÓ ESCRITO, y no es un detalle de implementación.
   *
   * El botón «Aplicar» se apaga por UNA sola vía: dejar de ser el último turno del hilo. Y lo
   * único que corre ese último turno es esta llamada. Si falla muda, el cambio YA entró al
   * cronograma —el carril de operaciones escribe directo— y el botón sigue vivo: la persona lo
   * aprieta de nuevo y aplica dos veces. Y las operaciones no son idempotentes: `tarea.crear`
   * duplica la tarea, `fase.crear` duplica la fase.
   */
  /**
   * Marcar y desmarcar una operación del acuerdo.
   *
   * ⛔ La CASCADA no es un adorno: desmarcar la fase que se crea y dejar sus tareas produce
   * operaciones que apuntan a una fase inexistente. El ejecutor las rechaza —bien— y un solo
   * rechazo aborta el lote ENTERO: la persona desmarcaría una cosa y no se aplicaría ninguna,
   * que es peor que el todo-o-nada que esto vino a arreglar. Se tachan a la vista, nunca en
   * silencio. La regla vive en `lib/timeline/dependencias-de-operaciones.ts`, con su test.
   */
  function alternarOperacion(turnoId: string, i: number, acuerdo: AcuerdoDelChat) {
    const ops = (acuerdo.operaciones ?? []) as Operacion[];
    setDesmarcadas((m) => {
      const actual = m[turnoId] ?? EMPTY;
      const pedido = new Set(actual);
      if (pedido.has(i)) pedido.delete(i);
      else pedido.add(i);
      /* Al RE-marcar, la cascada se recalcula desde cero: si lo que la bloqueaba volvió, vuelve
         ella también. Recalcular es más barato que llevar un historial de por qué salió. */
      return { ...m, [turnoId]: arrastreAlDesmarcar(ops, pedido) };
    });
  }

  const operacionesAceptadas = (turnoId: string, acuerdo: AcuerdoDelChat): Operacion[] => {
    const fuera = desmarcadas[turnoId] ?? EMPTY;
    return ((acuerdo.operaciones ?? []) as Operacion[]).filter((_, i) => !fuera.has(i));
  };

  const sinNadaQueAplicar = (turnoId: string, acuerdo: AcuerdoDelChat): boolean =>
    !!acuerdo.operaciones && operacionesAceptadas(turnoId, acuerdo).length === 0;

  async function anotarDesenlace(ok: boolean, detalle: string, vistaPrevia = true) {
    const r = await fetch(`/api/projects/${projectId}/asistente`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieza, desenlace: { ok, detalle, vistaPrevia } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.hilo?.turnos) return false;
    setTurnos(j.hilo.turnos);
    return true;
  }

  async function aplicar(acuerdo: AcuerdoDelChat, descartadas = 0) {
    if (!onAplicar || aplicando) return;
    setAplicando(true);
    setError(null);
    try {
      const { fallo, avisos } = await onAplicar(acuerdo);
      if (fallo) {
        /* ⛔ NO se cierra el panel: el error tiene que verse donde se apretó el botón. Antes
           aparecía suelto al pie del documento, con el cajón ya cerrado. */
        setError(fallo);
        /* ⚠ El fallo del fetch se traga acá a propósito: si subiera al catch de afuera,
           `setError` pisaría el motivo REAL del rechazo con un «Failed to fetch» y la persona
           perdería lo único útil que tenía. */
        await anotarDesenlace(false, fallo).catch(() => false);
      } else {
        /* ⚠ Los avisos viajan al hilo: son la diferencia entre «se aplicó» y «se aplicó, pero
           el editor hizo otra cosa con una parte». Y como el modelo LEE el hilo, en el próximo
           turno sabe qué no entró y puede proponer otro camino. */
        /* El carril de operaciones escribe directo; el viejo deja una propuesta para revisar.
           El desenlace tiene que decir cuál de los dos pasó, o manda a buscar un banner que no
           existe. Lo sabe el acuerdo: si trae operaciones, no hay vista previa. */
        /* ⚠ Si se descartaron operaciones, el desenlace lo DICE. El `resumen` que el modelo
           escribió describe el acuerdo COMPLETO, así que sin esta línea el hilo quedaría
           afirmando un cambio más grande del que entró — y el modelo lo lee en el turno
           siguiente. */
        const nota =
          descartadas > 0
            ? `Se aplicaron ${(acuerdo.operaciones ?? []).length} de ${
                (acuerdo.operaciones ?? []).length + descartadas
              } cambios: el resto se descartó.`
            : "";
        const quedoEscrito = await anotarDesenlace(
          true,
          [nota, avisos.join(" · ")].filter(Boolean).join(" "),
          !acuerdo.operaciones?.length,
        ).catch(() => false);
        /* ⛔ Si el desenlace NO se pudo escribir, hay que DECIRLO. El cambio ya entró, pero el
           botón sigue vivo en el último turno y el silencio invita a apretarlo otra vez — sobre
           operaciones que no son idempotentes. */
        if (!quedoEscrito) {
          setError(
            "El cambio se aplicó al cronograma, pero no se pudo dejar constancia en la " +
              "conversación. ⚠ No lo apliques de nuevo: se duplicaría. Recargá para ver el hilo.",
          );
        }
        /* ⛔ EL PANEL NO SE CIERRA AL APLICAR, y es una decisión de Elías (2026-08-20).
           Con las operaciones aplicar tarda ~1 ms, así que cerrar el cajón convierte un cambio
           instantáneo en «desapareció todo y no sé qué pasó». Además la conversación sigue: lo
           normal es encadenar dos o tres ajustes seguidos, y reabrir el panel entre cada uno
           sería pelearle a la herramienta. El desenlace queda escrito en el hilo, ahí mismo. */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "no se pudo aplicar";
      setError(msg);
      await anotarDesenlace(false, msg).catch(() => {});
    } finally {
      setAplicando(false);
    }
  }

  if (!hydrated || !abierto) return null;

  return createPortal(
    <aside
      id={ID_DEL_CAJON}
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
              /* ⚠ `aplicando` también: abrir un hilo nuevo a mitad del apply hace que el
                 desenlace se escriba sobre el hilo RECIÉN CREADO —`hiloVivo` devuelve el más
                 reciente— y el «⛔ No se pudo aplicar» queda como primer turno de una
                 conversación vacía, mientras el acuerdo real se pierde de vista. */
              disabled={pensando || aplicando}
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
            <ol className="text-xs text-fg-muted space-y-1 list-decimal pl-4">
              <li>«¿Qué pasa si alargo una fase dos semanas?»</li>
              <li>«Hay fases duplicadas, ¿se pueden unir?»</li>
              <li>«Quiero mover una tarea de fase — ¿pierdo algo?»</li>
            </ol>
            <p className="text-xs text-fg-muted">
              Cuando estén de acuerdo, te deja la instrucción lista para revisar y aplicar.
            </p>
          </div>
        )}

        {turnos.map((t) => (
          <div key={t.id}>
            {/* ⭐ UN TURNO CON ACUERDO ES UNA SOLA CAJA (pedido de Elías, 2026-08-21).
                Antes eran dos bloques que decían lo mismo: la burbuja del asistente enumeraba las
                tres tareas y la cajita azul las volvía a enumerar debajo. Elías: *«lo siento
                repetitivo; de una el mensaje debería ser el cuadro azul»*. Ahora el texto del
                asistente ENTRA a la caja, y la enumeración vive en un solo lugar — el que sale de
                las operaciones, que es el que no puede mentir. */}
            {!t.acuerdo && (
              <div
                className={
                  t.rol === "CSE"
                    ? "ml-8 rounded-xl px-3 py-2 bg-surface-active text-sm text-fg whitespace-pre-wrap"
                    : "mr-2 rounded-xl px-3 py-2 bg-surface-muted text-sm text-fg-secondary"
                }
              >
                {t.rol === "CSE" ? t.texto : <Markdown>{t.texto}</Markdown>}
              </div>
            )}

            {t.acuerdo && (
              <div className="mr-2 rounded-xl border border-info-line bg-info-surface px-3 py-2">
                <p className="text-xs font-semibold text-info-ink">Lo que se acordó</p>
                {/* El texto del asistente, o el resumen si el turno no trajo texto. ⚠ NUNCA los
                    dos: son la misma frase escrita dos veces. */}
                <div className="text-sm text-fg mt-1">
                  {t.texto ? <Markdown>{t.texto}</Markdown> : <p>{t.acuerdo.resumen}</p>}
                </div>

                {/* ⭐ LO QUE SE LEE ES LO QUE SE EJECUTA. Cada renglón es UNA operación, traducida
                    en el servidor desde el mismo objeto que se va a aplicar. Antes acá había una
                    instrucción en prosa que el modelo escribía APARTE, y podía decir una cosa
                    mientras la instrucción hacía otra. */}
                {t.acuerdo.lineas && t.acuerdo.lineas.length > 0 ? (
                  <>
                    {/* ⭐ EL CONTADOR, y no es adorno. Desde que el vocabulario creció a 18
                        operaciones y las de tarea se emiten ENUMERADAS —una por tarea, para que
                        se lean por nombre— un acuerdo normal pasó de 2 líneas a 12. Sin el
                        número arriba, la persona no sabe cuánto está aprobando hasta scrollear
                        hasta el final, y el botón «Aplicar» está justo abajo. */}
                    {(() => {
                      const total = t.acuerdo.lineas.length;
                      const fuera = (desmarcadas[t.id] ?? EMPTY).size;
                      if (total <= 3 && fuera === 0) return null;
                      return (
                        <p className="mt-2 text-xs font-semibold text-info-ink">
                          {fuera === 0
                            ? `${total} cambios`
                            : `${total - fuera} de ${total} cambios — ${fuera} descartado${fuera === 1 ? "" : "s"}`}
                        </p>
                      );
                    })()}
                    {/* ⚠ El cajón mide 400 px. Doce renglones de ~120 caracteres son ~900 px: sin
                        este scroll propio, la lista empuja el botón fuera de la pantalla y el
                        auto-scroll deja la primera línea arriba de todo, invisible. El recorte es
                        VISUAL — la lista sigue completa y alcanzable, que es lo que la vuelve
                        auditable. */}
                    {/* ⚠ Cuando la lista se recorta, tiene que poder ALCANZARSE con el teclado.
                        Un contenedor con `overflow-y-auto` y nada enfocable adentro no entra en
                        el orden de tabulación: Tab pasa de largo al botón «Aplicar», así que con
                        12 operaciones se aprobaban las 6 que se ven. `tabIndex` + `role` lo
                        vuelven una región navegable con las flechas. */}
                    <ol
                      {...(t.acuerdo.lineas.length > 6
                        ? {
                            tabIndex: 0,
                            role: "region" as const,
                            "aria-label": `${t.acuerdo.lineas.length} cambios acordados`,
                          }
                        : {})}
                      className={
                        "mt-2 space-y-1 list-decimal pl-4 text-sm text-fg marker:text-fg-muted" +
                        (t.acuerdo.lineas.length > 6
                          ? " max-h-56 overflow-y-auto pr-1 overscroll-contain" +
                            " focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info-line rounded"
                          : "")
                      }
                    >
                      {t.acuerdo.lineas.map((linea, i) => {
                        const fuera = (desmarcadas[t.id] ?? EMPTY).has(i);
                        const vivo = t.id === idDelAcuerdoVivo && !!onAplicar;
                        return (
                          <li key={i} className="leading-relaxed">
                            {vivo ? (
                              <label
                                className={
                                  "flex items-start gap-2 cursor-pointer" +
                                  (fuera ? " line-through opacity-50" : "")
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={!fuera}
                                  onChange={() => alternarOperacion(t.id, i, t.acuerdo!)}
                                  disabled={aplicando}
                                  className="mt-1 shrink-0 accent-primary"
                                />
                                <span>{linea}</span>
                              </label>
                            ) : (
                              linea
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </>
                ) : t.acuerdo.instruccion ? (
                  /* ⚠ LEGACY: hilos anteriores al 2026-08-20 guardaron una instrucción de texto,
                     que un segundo modelo releía; y los DOCUMENTOS todavía la usan para copiar y
                     pegar. Se siguen pintando para no perder su historia.

                     ⛔ Pero solo SI HAY INSTRUCCIÓN. Antes esto era el `else` de «¿hay líneas?», así
                     que un acuerdo con operaciones y sin líneas caía acá y pintaba un textarea
                     VACÍO bajo un «Ver instrucción» que no abría nada — con el botón diciendo
                     «Aplicar al cronograma». Elías lo vio así y tenía razón en que sobraba: no era
                     de más, era una promesa falsa. Lo que se ejecuta son las operaciones; esa caja
                     de texto no se lee en ese camino. */
                  <details className="mt-2 group">
                    <summary className="cursor-pointer text-xs text-brand-light hover:text-brand list-none select-none">
                      <span className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
                      Ver instrucción
                    </summary>
                    <textarea
                      value={instruccionEditada[t.id] ?? t.acuerdo.instruccion ?? ""}
                      onChange={(e) =>
                        setInstruccionEditada((m) => ({ ...m, [t.id]: e.target.value }))
                      }
                      rows={5}
                      className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-fg resize-y"
                    />
                    <p className="mt-1 text-[11px] text-fg-muted">
                      Podés editarla: es lo que se va a ejecutar tal cual.
                    </p>
                  </details>
                ) : null}

                {t.id !== idDelAcuerdoVivo ? null : onAplicar ? (
                  <button
                    onClick={() =>
                      void aplicar({
                        ...t.acuerdo!,
                        ...(t.acuerdo!.operaciones
                          ? { operaciones: operacionesAceptadas(t.id, t.acuerdo!) }
                          : {}),
                        ...(instruccionEditada[t.id] !== undefined
                          ? { instruccion: instruccionEditada[t.id] }
                          : {}),
                      }, desmarcadas[t.id]?.size ?? 0)
                    }
                    disabled={aplicando || sinNadaQueAplicar(t.id, t.acuerdo!)}
                    className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-60 transition-colors"
                  >
                    {aplicando
                      ? "Aplicando…"
                      : sinNadaQueAplicar(t.id, t.acuerdo)
                        ? "No queda nada marcado"
                        : t.acuerdo.operaciones
                          ? `Aplicar al cronograma${
                              (desmarcadas[t.id]?.size ?? 0) > 0
                                ? ` (${operacionesAceptadas(t.id, t.acuerdo).length})`
                                : ""
                            }`
                          : "Aplicar — vas a poder revisarlo antes de guardar"}
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

        {/* ⚠ REGIONES MONTADAS SIEMPRE, aunque estén vacías. Una `live region` tiene que estar
            en el DOM ANTES del cambio para que el lector de pantalla la observe: insertarla ya
            con el texto adentro no anuncia nada. Antes, apretar «Aplicar» con lector de pantalla
            era silencio absoluto — y encima el botón se deshabilita, así que el foco cae a `body`
            y no queda ni contexto donde escuchar. */}
        <p role="status" aria-live="polite" className="sr-only">
          {cargando
            ? "Cargando la conversación"
            : pensando
              ? "El asistente está pensando"
              : aplicando
                ? "Aplicando los cambios"
                : ""}
        </p>
        <p role="alert" className="sr-only">
          {error ?? ""}
        </p>
        {pensando && <p className="text-xs text-fg-muted">Pensando…</p>}
        {/* ⚠ DOS CARRILES, DOS ESPERAS. El de operaciones aplica en ~1 ms; el viejo —una
            instrucción en prosa que un segundo modelo relee— tarda de dos a cuatro minutos.
            Mostrar el cartel de los minutos sobre un cambio instantáneo no es solo impreciso:
            enseña a desconfiar del único cartel que sí avisa una espera de verdad. */}
        {aplicando && (
          <p className="text-xs text-fg-muted">
            {turnos[turnos.length - 1]?.acuerdo?.operaciones?.length
              ? "Aplicando los cambios al cronograma…"
              : "El editor está reescribiendo el cronograma completo — suele tardar entre dos y cuatro minutos. Podés seguir mirando el documento mientras tanto."}
          </p>
        )}
        {error && (
          <div className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-xs text-danger-ink">
            {error}
          </div>
        )}
        <div ref={finRef} />
      </div>

      <div className="px-3 py-3 border-t border-line shrink-0">
        <textarea
          ref={composerRef}
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
          disabled={pensando || aplicando || !texto.trim()}
          className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-60 transition-colors"
        >
          Enviar
        </button>
      </div>
    </aside>,
    document.body,
  );
}

/**
 * El texto del asistente se renderiza como Markdown: viene con listas numeradas y negritas, y
 * pintado como texto plano se veía el `- **Sumar…**` crudo (reportado el 2026-08-20).
 *
 * ⚠ Las clases van por elemento y no por `prose`: el panel mide 400 px y los tamaños de `prose`
 * lo desbordan. Sin `rehype-raw` a propósito — el HTML crudo del modelo no se ejecuta.
 */
function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm text-fg-secondary [&>*+*]:mt-2">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1 marker:text-fg-muted">{children}</ol>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 space-y-1 marker:text-fg-muted">{children}</ul>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
          code: ({ children }) => (
            <code className="rounded bg-surface-active px-1 py-0.5 text-xs">{children}</code>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-brand-light underline" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
