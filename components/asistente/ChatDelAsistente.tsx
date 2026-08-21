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

  /** Deja escrito en el hilo qué pasó al aplicar. Ver el porqué en `idDelAcuerdoVivo`. */
  async function anotarDesenlace(ok: boolean, detalle: string, vistaPrevia = true) {
    const r = await fetch(`/api/projects/${projectId}/asistente`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieza, desenlace: { ok, detalle, vistaPrevia } }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.hilo?.turnos) setTurnos(j.hilo.turnos);
  }

  async function aplicar(acuerdo: AcuerdoDelChat) {
    if (!onAplicar || aplicando) return;
    setAplicando(true);
    setError(null);
    try {
      const { fallo, avisos } = await onAplicar(acuerdo);
      if (fallo) {
        /* ⛔ NO se cierra el panel: el error tiene que verse donde se apretó el botón. Antes
           aparecía suelto al pie del documento, con el cajón ya cerrado. */
        setError(fallo);
        await anotarDesenlace(false, fallo);
      } else {
        /* ⚠ Los avisos viajan al hilo: son la diferencia entre «se aplicó» y «se aplicó, pero
           el editor hizo otra cosa con una parte». Y como el modelo LEE el hilo, en el próximo
           turno sabe qué no entró y puede proponer otro camino. */
        /* El carril de operaciones escribe directo; el viejo deja una propuesta para revisar.
           El desenlace tiene que decir cuál de los dos pasó, o manda a buscar un banner que no
           existe. Lo sabe el acuerdo: si trae operaciones, no hay vista previa. */
        await anotarDesenlace(true, avisos.join(" · "), !acuerdo.operaciones?.length);
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
                    {t.acuerdo.lineas.length > 3 && (
                      <p className="mt-2 text-xs font-semibold text-info-ink">
                        {t.acuerdo.lineas.length} cambios
                      </p>
                    )}
                    {/* ⚠ El cajón mide 400 px. Doce renglones de ~120 caracteres son ~900 px: sin
                        este scroll propio, la lista empuja el botón fuera de la pantalla y el
                        auto-scroll deja la primera línea arriba de todo, invisible. El recorte es
                        VISUAL — la lista sigue completa y alcanzable, que es lo que la vuelve
                        auditable. */}
                    <ol
                      className={
                        "mt-2 space-y-1 list-decimal pl-4 text-sm text-fg marker:text-fg-muted" +
                        (t.acuerdo.lineas.length > 6
                          ? " max-h-56 overflow-y-auto pr-1 overscroll-contain"
                          : "")
                      }
                    >
                      {t.acuerdo.lineas.map((linea, i) => (
                        <li key={i} className="leading-relaxed">
                          {linea}
                        </li>
                      ))}
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
                        ...(instruccionEditada[t.id] !== undefined
                          ? { instruccion: instruccionEditada[t.id] }
                          : {}),
                      })
                    }
                    disabled={aplicando}
                    className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-60 transition-colors"
                  >
                    {aplicando
                      ? "Aplicando…"
                      : t.acuerdo.operaciones
                        ? "Aplicar al cronograma"
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
