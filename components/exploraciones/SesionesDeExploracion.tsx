"use client";

/**
 * SesionesDeExploracion — la sesión elegida en la barra de la izquierda, con su «antes» y su
 * «después» (pedido de Elías, 2026-10-03). Copia los tableros «1 · Sesión — Antes» y «2 · Sesión —
 * Después» medida por medida: el título de 22 px con su línea de datos debajo, el control
 * Antes/Después sobre gris con la opción elegida en blanco, «Rearmar la guía» blanco con borde, las
 * tarjetas blancas sobre el fondo gris de la pieza y las etiquetas cuadradas de cada pregunta.
 *
 *   - Antes: la guía para prepararla. Arriba, en una sola franja, cómo abrir y lo que te llevaste de
 *     la sesión anterior. Después, las preguntas en dos columnas —«Arquitectura de la venta» (lo que
 *     falta del marco) y «Escala de rendimiento» (las dimensiones sin evidencia)—, con las
 *     repreguntas plegadas. Las objeciones adaptadas a esta empresa están en «Cómo manejar
 *     objeciones», a la izquierda.
 *   - Después: la reunión en la línea de datos, lo que salió (cada sugerencia con Usar o Descartar,
 *     ahí mismo) y «Se dijo y nadie lo exploró» con una casilla para llevar cada punto a la próxima
 *     sesión. Abajo, fija, la barra para armar la siguiente.
 *
 * La guía de cada sesión se guarda por su id (`propuesta.guias`): la de una sesión que ya pasó
 * muestra lo que se preparó para ella. Qué sesión está abierta lo decide el lienzo (useSesiones).
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CASILLAS_DEL_RESUMEN, definicionDe, type ClaveDeCasilla } from "@/lib/exploraciones/casillas";
import { esFuenteDeHipotesis, type DestinoDePropuesta, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import { aFecha, conEspaciosComunes, diaConAnio, diaCorto, diaYHora, hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import {
  CIERRE_DE_BASE,
  CONEXION_DE_BASE,
  focoDeLaGuia,
  guiaVieja,
  MAX_PARA_EXPLORAR,
  MAX_SESIONES,
  preguntasParaMostrar,
  type OrigenDeReunion,
  type PestanaDeSesion,
  type PreguntaParaMostrar,
  type SesionPlaneada,
} from "@/lib/exploraciones/guia";
import { claveDeNotaDeSesion, MAX_NOTA_DE_SESION } from "@/lib/exploraciones/notas-de-sesion";
import { REUNIONES } from "@/lib/exploraciones/sesion";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";
import { Casilla } from "./Casilla";
import Segmentos from "./Segmentos";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";
import { FilaSugerida } from "./Propuestas";
import { QueVaPrimero } from "./QueVaPrimero";
import { LETRA_DEL_MARCO, lineasDe } from "./Resumen";
import SumarAMano from "./SumarAMano";
import { useCorrida } from "./useCorrida";
import { nuevoIdDeSesion, useSesiones } from "./useSesiones";

const ORIGEN: Record<OrigenDeReunion, string> = { meet: "Meet", hubspot: "HubSpot", documento: "sumada a mano" };

type Guardar = (s: SesionPlaneada[]) => unknown;

/** «jueves 8 oct»: el día de la semana, como en el tablero. */
function diaLargo(v: string): string {
  try {
    return conEspaciosComunes(
      new Intl.DateTimeFormat("es-CR", { weekday: "long", day: "numeric", month: "short", timeZone: "America/Costa_Rica" }).format(aFecha(v)).replace(/\.$/, "").replace(",", ""),
    );
  } catch {
    return diaCorto(v);
  }
}

/** El rótulo chico de un bloque. */
function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">{children}</p>;
}

/** Una tarjeta blanca con su encabezado (el de las columnas del tablero). */
function Tarjeta({ titulo, detalle, accion, children }: { titulo: string; detalle?: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
        <h3 className="text-sm font-bold text-fg">{titulo}</h3>
        {detalle && <span className="text-[12.5px] text-fg-muted">{detalle}</span>}
        {accion && (
          <>
            <span className="flex-1" />
            {accion}
          </>
        )}
      </header>
      {children}
    </section>
  );
}

// ── Antes de la sesión ────────────────────────────────────────────────────────

/** Una pregunta: su etiqueta cuadrada, la pregunta en negrita, de qué es, y las repreguntas plegadas. */
function Pregunta({ p }: { p: PreguntaParaMostrar }) {
  const { escala, mapa, nombreDeNivel } = useLienzo();
  const [abierta, setAbierta] = useState(false);
  const dimension = p.tipo === "dimension" ? escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === p.para) : null;
  const pos = dimension ? mapa.posiciones[dimension.id] : undefined;
  const clave = p.para as ClaveDeCasilla;
  const etiqueta = dimension ? dimension.nombre : definicionDe(clave).etiqueta;
  const letra = dimension ? dimension.id : (LETRA_DEL_MARCO[clave as keyof typeof LETRA_DEL_MARCO]?.letra ?? etiqueta.charAt(0));
  return (
    <li className="flex gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
      <span
        className={cn(
          "flex h-[26px] min-w-[26px] flex-none items-center justify-center rounded-[7px] px-1 text-xs font-bold",
          dimension ? "bg-warn-surface text-warn-ink" : "bg-info-surface text-brand",
        )}
        aria-hidden="true"
      >
        {letra}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold leading-[1.4] text-fg">{p.pregunta}</p>
        <p className="mt-[3px] text-[12.5px] text-fg-muted">
          {etiqueta}
          {dimension &&
            (pos ? (
              <>
                {" "}
                · {pos.clase === "evidencia" ? "está en" : "hoy creemos"}{" "}
                <span
                  className={cn(
                    "rounded px-1",
                    pos.clase === "evidencia" ? "bg-success-surface text-success-ink" : "border border-dashed border-warning text-warn-ink",
                  )}
                >
                  {nombreDeNivel(pos.nivel)}
                </span>
              </>
            ) : (
              " · sin dato"
            ))}
        </p>
        {p.repreguntas.length > 0 && (
          <>
            {abierta && (
              <ol className="mt-2.5 list-decimal rounded-lg bg-surface-muted py-2.5 pl-[30px] pr-3 text-[13px] leading-[1.55] text-fg-secondary">
                {p.repreguntas.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            )}
            <button type="button" aria-expanded={abierta} onClick={() => setAbierta((x) => !x)} className="mt-1.5 text-[12.5px] font-semibold text-brand hover:underline">
              {abierta ? "Ocultar repreguntas" : `${p.repreguntas.length} ${p.repreguntas.length === 1 ? "repregunta" : "repreguntas"}`}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function Columna({ titulo, detalle, preguntas, vacio }: { titulo: string; detalle: string; preguntas: PreguntaParaMostrar[]; vacio: string }) {
  return (
    <Tarjeta titulo={titulo} detalle={detalle}>
      {preguntas.length > 0 ? (
        <ul>
          {preguntas.map((p) => (
            <Pregunta key={`${p.para}-${p.pregunta}`} p={p} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-[13px] text-fg-muted">{vacio}</p>
      )}
    </Tarjeta>
  );
}

function AntesDeLaSesion({ pestana, esLaProxima, sesiones, guardar }: { pestana: PestanaDeSesion; esLaProxima: boolean; sesiones: SesionPlaneada[]; guardar: Guardar }) {
  const { exp, escala, mapa, puedeEditar, guardando, abrirObjeciones } = useLienzo();
  const e = exp.estado;
  const guiaGuardada = pestana.sesion ? (e.propuesta.guias[pestana.sesion.id] ?? null) : null;
  // La próxima usa la guía viva (la última que armó el agente); una que ya pasó, la que se guardó para ella.
  const guia = guiaGuardada ?? (esLaProxima ? e.propuesta.guia : null);
  const { huecos, enfoque } = focoDeLaGuia(e.contenido.casillas, escala, e.areas, mapa.posiciones, e.contenido.aExplorar);
  const preguntas = esLaProxima ? preguntasParaMostrar(guia, huecos, enfoque, escala) : guia ? preguntasParaMostrar(guia, guia.huecos, guia.enfoque, escala) : [];
  const deTarjetas = preguntas.filter((p) => p.tipo === "tarjeta");
  const deDimensiones = preguntas.filter((p) => p.tipo === "dimension");
  const faltan = CASILLAS_DEL_RESUMEN.filter((c) => lineasDe(c, e.contenido.casillas[c]).length === 0).length;

  const conTest = exp.leido.tests.length > 0;
  const conEvidencia = Object.values(e.contenido.chequeo).some((x) => !esFuenteDeHipotesis(x.fuente)) || e.propuesta.leidas.sesiones.length > 0;
  const desdeCero = esLaProxima && !conTest && !conEvidencia && pestana.numero === 1;
  const traidos = pestana.sesion?.explorar ?? [];
  const apertura = guia?.apertura ?? [];
  const areasEnJuego = escala.areas.filter((a) => e.areas.includes(a.id)).map((a) => a.nombre);

  if (!esLaProxima && !guia) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[13px] text-fg-muted">
        No quedó guardada la guía con que se preparó esta sesión. La de la próxima está en su sesión, a la izquierda.
      </p>
    );
  }

  const quitarTraido = (t: string) => {
    if (!pestana.sesion) return;
    const id = pestana.sesion.id;
    void guardar(sesiones.map((s) => (s.id === id ? { ...s, explorar: (s.explorar ?? []).filter((x) => x !== t) } : s)));
  };

  const hayApertura = apertura.length > 0 || desdeCero || (conTest && pestana.numero === 1);

  return (
    <div className="space-y-5">
      {(hayApertura || traidos.length > 0) && (
        <section className="flex flex-wrap items-start gap-6 rounded-xl border border-line bg-surface px-5 py-4">
          {hayApertura && (
            <div className="min-w-0 flex-[1_1_360px]">
              <Rotulo>Para abrir</Rotulo>
              {conTest && pestana.numero === 1 && <p className="mt-1.5 text-[13px] text-fg-muted">{REUNIONES[0].promesa}</p>}
              {desdeCero && <p className="mt-1.5 text-[13px] text-fg-muted">No hizo el test: empieza conectando, y después explícale la escala en simple.</p>}
              {apertura.map((a, i) => (
                <p key={`a-${i}`} className="mt-1.5 text-[14.5px] leading-normal text-fg">
                  {a}
                </p>
              ))}
              {desdeCero &&
                CONEXION_DE_BASE.map((q, i) => (
                  <p key={`c-${i}`} className="mt-1.5 text-[14.5px] leading-normal text-fg">
                    «{q}»
                  </p>
                ))}
              {desdeCero && guia?.escalaEnSimple && (
                <p className="mt-1.5 text-[13px] text-fg-secondary">
                  <span className="font-semibold text-fg">La escala, en simple: </span>
                  {guia.escalaEnSimple}
                </p>
              )}
            </div>
          )}
          {traidos.length > 0 && (
            <div className="min-w-0 flex-[0_1_380px]">
              <Rotulo>Te llevaste de la sesión {Math.max(1, pestana.numero - 1)}</Rotulo>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {traidos.map((t) => (
                  <li key={t} className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-[3px] text-xs font-medium text-fg-secondary">
                    {t}
                    {puedeEditar && (
                      <button
                        type="button"
                        aria-label={`Quitar «${t}»`}
                        className="hidden text-fg-muted hover:text-fg group-hover:inline focus:inline"
                        disabled={guardando}
                        onClick={() => quitarTraido(t)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div data-recorrido="preventa.sesion.preguntas" className="grid items-start gap-5 xl:grid-cols-2">
        <Columna
          titulo="Arquitectura de la venta"
          detalle={faltan > 0 ? `faltan ${faltan} de 8` : "completa"}
          preguntas={deTarjetas}
          vacio="El marco está completo: no falta nada por preguntar."
        />
        <Columna
          titulo="Escala de rendimiento"
          detalle={[areasEnJuego.join(" · "), deDimensiones.length ? `${deDimensiones.length} sin evidencia` : ""].filter(Boolean).join(" · ")}
          preguntas={deDimensiones}
          vacio={e.areas.length === 0 ? "Elige las áreas en juego en «La escala» para saber qué dimensiones preguntar." : "Todas las dimensiones en juego ya tienen evidencia."}
        />
      </div>

      {conTest && pestana.numero === 1 && (
        <details className="rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer select-none px-4 py-3.5 text-sm font-semibold text-fg">Su plan: qué va primero (es lo que se lleva de esta reunión)</summary>
          <div className="border-t border-line p-4">
            <QueVaPrimero />
          </div>
        </details>
      )}

      <p className="text-[13px] text-fg-muted">
        Para cerrar: {guia?.cierre ?? CIERRE_DE_BASE} ¿No te deja explorar? Abre{" "}
        <button type="button" className="text-brand hover:underline" onClick={abrirObjeciones}>
          «Cómo manejar objeciones»
        </button>
        , a la izquierda.
      </p>
    </div>
  );
}

// ── Después de la sesión ──────────────────────────────────────────────────────

/** Dónde aterriza lo propuesto, en una palabra o dos, sobre la fila. */
function destinoCorto(d: DestinoDePropuesta, nombreDeDimension: (id: string) => string): string {
  switch (d.tipo) {
    case "casilla":
      return definicionDe(d.clave).etiqueta;
    case "nivel":
      return `Escala · ${nombreDeDimension(d.dimensionId)}`;
    case "aExplorar":
      return `Explorar · ${nombreDeDimension(d.dimensionId)}`;
    case "falta":
      return "Criterio de la escala";
    case "area":
      return "Área en juego";
    case "edicion":
      return "Escala";
    case "perfil":
      return "Perfil";
    case "casoDeUso":
      return "Caso de uso";
  }
}

/** Lo que salió de las reuniones: cada sugerencia del agente, para usarla o descartarla ahí mismo. */
function LoQueSalio() {
  const { revisables, escala, cambiar, puedeEditar, guardando } = useLienzo();
  const [todas, setTodas] = useState(false);
  const items = revisables.filter((it) => it.destino.tipo !== "casoDeUso" && !(it.destino.tipo === "casilla" && it.destino.clave === "noExplorado"));
  const visibles = todas ? items : items.slice(0, 6);
  const nombreDeDimension = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre ?? id;
  const refrescar = items.some((it) => it.destino.tipo === "edicion" || it.destino.tipo === "perfil");
  return (
    <Tarjeta
      titulo="Lo que salió"
      detalle={items.length ? `${items.length} para revisar` : "nada pendiente"}
      accion={
        puedeEditar &&
        items.length > 1 && (
          <button
            type="button"
            disabled={guardando}
            className="rounded-[7px] bg-primary px-2.5 py-[5px] text-[12.5px] font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
            onClick={() => void cambiar([{ op: "usarVarias", items: items.map((it) => ({ itemId: it.id, valor: it.valor })) }], { refrescar })}
          >
            Usar todas
          </button>
        )
      }
    >
      {items.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-fg-muted">Cuando el agente lee la reunión, lo que sugiere aparece acá, con la frase del cliente que lo respalda.</p>
      ) : (
        <ul className="space-y-1.5 p-3">
          {visibles.map((it) => (
            <FilaSugerida key={it.id} item={it} destino={destinoCorto(it.destino, nombreDeDimension)} />
          ))}
        </ul>
      )}
      {items.length > visibles.length && (
        <button type="button" className="w-full border-t border-line px-4 py-2.5 text-[13px] font-semibold text-brand hover:bg-surface-hover" onClick={() => setTodas(true)}>
          Ver las {items.length - visibles.length} restantes
        </button>
      )}
    </Tarjeta>
  );
}

/**
 * «Se dijo y nadie lo exploró»: lo confirmado y lo que sugirió el agente, cada punto con su casilla
 * para llevarlo a la próxima sesión (si era una sugerencia, se usa al marcarla).
 */
function NadieExploro({ numeroSiguiente, llevar, soltar }: { numeroSiguiente: number; llevar: (texto: string, item: ItemPropuesto | null) => void; soltar: (texto: string) => void }) {
  const { exp, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const confirmados = (exp.estado.contenido.casillas.noExplorado as string[] | undefined) ?? [];
  const sugeridos = pendientesPara((d) => d.tipo === "casilla" && d.clave === "noExplorado");
  const enAlguna = new Set(exp.estado.contenido.sesiones.flatMap((s) => s.explorar ?? []));
  const fila = (texto: string, item: ItemPropuesto | null) => {
    const marcado = enAlguna.has(texto);
    const cita = item?.fuentes.find((f) => f.cita)?.cita;
    return (
      <li key={item?.id ?? texto} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
        <input
          type="checkbox"
          checked={marcado}
          disabled={!puedeEditar || guardando}
          aria-label={`Llevar «${texto}» a la próxima sesión`}
          onChange={() => (marcado ? soltar(texto) : llevar(texto, item))}
          className="mt-[3px] h-4 w-4 flex-shrink-0 accent-brand"
        />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold", marcado ? "text-fg" : "text-fg-secondary")}>{texto}</p>
          {item?.razon ? (
            <p className="mt-[3px] text-[12.5px] text-fg-secondary">Sugerencia: {item.razon}</p>
          ) : (
            cita && <p className="mt-[3px] text-[12.5px] italic text-fg-muted">«{cita}»</p>
          )}
        </div>
        {puedeEditar &&
          (item ? (
            <button type="button" className="flex-shrink-0 text-xs text-fg-muted hover:text-fg hover:underline" disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [item.id] }])}>
              Descartar
            </button>
          ) : (
            <button
              type="button"
              className="flex-shrink-0 text-xs text-fg-muted hover:text-fg hover:underline"
              disabled={guardando}
              onClick={() => {
                const resto = confirmados.filter((x) => x !== texto);
                void cambiar([{ op: "casilla", clave: "noExplorado", valor: resto.length ? resto : null }]);
              }}
            >
              Quitar
            </button>
          ))}
      </li>
    );
  };
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-4 py-3.5">
        <h3 className="text-sm font-bold text-fg">Se dijo y nadie lo exploró</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">Marca lo que te llevas a la sesión {numeroSiguiente}</p>
      </header>
      {confirmados.length + sugeridos.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-fg-muted">Todavía nada: aparece cuando el agente lee la reunión.</p>
      ) : (
        <ul>
          {sugeridos.map((it) => fila(String(it.valor), it))}
          {confirmados.map((t) => fila(t, null))}
        </ul>
      )}
    </section>
  );
}

function SinPortal() {
  const { exp, cambiar, puedeEditar, guardando } = useLienzo();
  const sin = exp.estado.contenido.sinPortal;
  if (!puedeEditar && !sin) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-muted">
      <span>{sin ? "Marcado: el prospecto no usa HubSpot (no hay portal que mirar)." : "¿No usa HubSpot? Márcalo: cuenta como portal revisado."}</span>
      {puedeEditar && (
        <button type="button" className="rounded-[7px] border border-line bg-surface px-2.5 py-[5px] text-[12.5px] text-fg-secondary hover:bg-surface-hover" disabled={guardando} onClick={() => void cambiar([{ op: "sinPortal", valor: !sin }])}>
          {sin ? "Sí usa HubSpot" : "No usa HubSpot"}
        </button>
      )}
    </div>
  );
}

function DespuesDeLaSesion({
  armarLaSiguiente,
  soltar,
  numeroSiguiente,
}: {
  armarLaSiguiente: (llevar?: { texto: string; item: ItemPropuesto | null }) => void;
  soltar: (texto: string) => void;
  numeroSiguiente: number;
}) {
  const { exp, puedeEditar } = useLienzo();
  const { sesiones } = useSesiones();
  const { corriendo, lanzando } = useCorrida();
  const siguientePaso = exp.estado.contenido.casillas.siguientePaso as { que?: string; fecha?: string; conQuien?: string } | undefined;
  const marcados = new Set(exp.estado.contenido.sesiones.flatMap((s) => s.explorar ?? [])).size;
  return (
    <div className="space-y-5">
      <div data-recorrido="preventa.sesion.salio" className="grid items-start gap-5 xl:grid-cols-2">
        <LoQueSalio />
        <NadieExploro numeroSiguiente={numeroSiguiente} llevar={(texto, item) => armarLaSiguiente({ texto, item })} soltar={soltar} />
      </div>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3.5 text-sm font-semibold text-fg">
          Datos de la sesión <span className="text-[13px] font-normal text-fg-muted">· siguiente paso, portal visto, apertura y producto mostrado</span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          <Casilla clave="siguientePaso" />
          <div className="space-y-2">
            <Casilla clave="portal" />
            <SinPortal />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Casilla clave="apertura" />
            <Casilla clave="producto" />
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3.5 text-sm font-semibold text-fg">¿No quedó grabada? Súmala a mano</summary>
        <div className="border-t border-line p-4">
          <SumarAMano />
        </div>
      </details>

      {puedeEditar && (
        <div data-recorrido="preventa.sesion.siguiente" className="sticky bottom-0 z-10 -mx-6 -mb-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface px-6 py-3.5 xl:-mx-8 xl:px-8">
          <p className="min-w-0 flex-1 text-[13.5px] text-fg-secondary">
            {siguientePaso?.que ? (
              <>
                Siguiente paso:{" "}
                <strong className="text-fg">
                  {[siguientePaso.que, siguientePaso.fecha && diaLargo(siguientePaso.fecha), siguientePaso.conQuien && `con ${siguientePaso.conQuien}`].filter(Boolean).join(" · ")}
                </strong>
              </>
            ) : (
              "Sin siguiente paso acordado todavía."
            )}
          </p>
          {marcados > 0 && <span className="text-[13px] text-fg-muted">{marcados === 1 ? "1 tema marcado" : `${marcados} temas marcados`}</span>}
          <button
            type="button"
            disabled={lanzando || corriendo || sesiones.length >= MAX_SESIONES}
            onClick={() => armarLaSiguiente()}
            className="rounded-[9px] bg-primary px-[18px] py-[11px] text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {lanzando ? "Armando…" : `Armar la sesión ${numeroSiguiente} →`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Durante la sesión: las notas del vendedor ─────────────────────────────────

/**
 * Lo que el vendedor sabe o interpreta y no está en la transcripción: lo que le contaron por WhatsApp,
 * cómo entiende su modelo de negocio, una sensación sobre quién decide (Elías, 2026-10-05). Se guarda
 * solo (al dejar de escribir y al salir del campo) en `contenido.notas`, con la clave de la sesión, y
 * el agente la lee como nota del vendedor la próxima vez que prepare o lea. Una reunión suelta o la
 * sesión todavía sin crear se vuelven sesión al escribir la primera nota.
 */
function DuranteLaSesion({ pestana }: { pestana: PestanaDeSesion }) {
  const { exp, cambiar, puedeEditar, sesion: seleccion } = useLienzo();
  const { sesiones } = useSesiones();
  const clave = pestana.sesion ? claveDeNotaDeSesion(pestana.sesion.id) : null;
  const guardada = clave ? (exp.estado.contenido.notas[clave] ?? "") : "";
  const [texto, setTexto] = useState(guardada);
  const [estado, setEstado] = useState<"quieto" | "guardando" | "guardado" | "error">("quieto");
  const ultimo = useRef(guardada);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guardar = async (valor: string) => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
    if (valor === ultimo.current) return;
    setEstado("guardando");
    let ops: Parameters<typeof cambiar>[0];
    let id = pestana.sesion?.id ?? null;
    if (!id) {
      // La primera nota de una sesión que todavía no existe (o de una reunión suelta): se crea la sesión.
      id = nuevoIdDeSesion();
      const r = pestana.reunion;
      const nueva: SesionPlaneada = { id, ...(r ? { reunion: { id: r.id, origen: r.origen }, fecha: r.fecha.slice(0, 10) } : {}) };
      ops = [{ op: "sesiones", sesiones: [...sesiones, nueva] }, { op: "nota", paso: claveDeNotaDeSesion(id), texto: valor }];
    } else {
      ops = [{ op: "nota", paso: claveDeNotaDeSesion(id), texto: valor }];
    }
    const ok = await cambiar(ops);
    if (!ok) return setEstado("error");
    ultimo.current = valor;
    setEstado("guardado");
    if (!pestana.sesion) {
      seleccion.elegir(id);
      seleccion.ponerMomento(id, "durante");
    }
  };

  const alEscribir = (v: string) => {
    setTexto(v);
    setEstado("quieto");
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => void guardar(v), 1500);
  };

  // Lo que quedó sin guardar al cambiar de sesión o de momento se guarda igual.
  const pendiente = useRef(texto);
  pendiente.current = texto;
  useEffect(
    () => () => {
      if (espera.current) {
        clearTimeout(espera.current);
        void guardar(pendiente.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al desmontar
    [],
  );

  return (
    <div data-recorrido="preventa.sesion.notas">
      <Tarjeta
        titulo="Tus notas de la sesión"
        detalle="lo que sabes y no quedó en la grabación"
        accion={
          <span className={cn("text-[12px]", estado === "error" ? "text-danger-ink" : "text-fg-muted")}>
            {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : estado === "error" ? "No se pudo guardar" : ""}
          </span>
        }
      >
        <div className="space-y-2.5 p-4">
          <p className="text-[13px] leading-[1.5] text-fg-secondary">
            Lo que te contaron por WhatsApp o en el pasillo, cómo entiendes su modelo de negocio, quién crees que decide. El agente lo lee como tu nota, no como palabras del
            cliente, la próxima vez que prepare o lea una reunión.
          </p>
          <textarea
            value={texto}
            onChange={(ev) => alEscribir(ev.target.value)}
            onBlur={() => void guardar(texto)}
            disabled={!puedeEditar}
            maxLength={MAX_NOTA_DE_SESION}
            rows={12}
            aria-label="Tus notas de la sesión"
            placeholder="Ej.: Por WhatsApp, Laura contó que el gerente comercial se va en diciembre y que el presupuesto sale del área de mercadeo."
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-[1.55] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none disabled:opacity-60"
          />
          <p className="text-right text-[11.5px] text-fg-muted">
            {texto.length.toLocaleString("es-CR")} de {MAX_NOTA_DE_SESION.toLocaleString("es-CR")} caracteres
          </p>
        </div>
      </Tarjeta>
    </div>
  );
}

// ── La sesión: su encabezado y sus tres momentos ──────────────────────────────

/** Antes / Durante / Después: la opción elegida en blanco sobre el gris, como en el tablero. */
function AntesDespues({ valor, onCambiar }: { valor: MomentoDeLaSesion; onCambiar: (m: MomentoDeLaSesion) => void }) {
  return (
    <Segmentos
      etiqueta="Antes, durante y después de la sesión"
      opciones={[
        { clave: "antes", nombre: "Antes" },
        { clave: "durante", nombre: "Durante" },
        { clave: "despues", nombre: "Después" },
      ]}
      valor={valor}
      onCambiar={onCambiar}
    />
  );
}

/** El botón blanco con borde del tablero («Rearmar la guía»). */
function BotonClaro({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function EncabezadoDeLaSesion({ pestana, esLaProxima, momento, alMomento }: { pestana: PestanaDeSesion; esLaProxima: boolean; momento: MomentoDeLaSesion; alMomento: (m: MomentoDeLaSesion) => void }) {
  const { exp, escala, mapa, reuniones, puedeEditar, guardando, sesion: seleccion } = useLienzo();
  const { todas, sesiones, guardar, claveDeLaProxima, proxima, agregar } = useSesiones();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const s = pestana.sesion;
  const r = pestana.reunion;
  const [editando, setEditando] = useState(false);
  const [cambiandoReunion, setCambiandoReunion] = useState(false);
  const [titulo, setTitulo] = useState(s?.titulo ?? "");
  const [visto, setVisto] = useState(s?.titulo);
  if (visto !== s?.titulo) {
    setVisto(s?.titulo);
    setTitulo(s?.titulo ?? "");
  }
  const cambiarSesion = (nueva: SesionPlaneada) => void guardar(sesiones.map((x) => (x.id === nueva.id ? nueva : x)));
  const guia = esLaProxima ? exp.estado.propuesta.guia : s ? (exp.estado.propuesta.guias[s.id] ?? null) : null;
  const e = exp.estado;
  const foco = focoDeLaGuia(e.contenido.casillas, escala, e.areas, mapa.posiciones, e.contenido.aExplorar);
  const vieja = esLaProxima && !!guia && guiaVieja(guia, foco.huecos, foco.enfoque);
  const leyendo = corriendo && corrida?.modo === "leer";

  const elegirReunion = (valor: string) => {
    if (!s) return;
    const [origen, ...resto] = valor.split(":");
    const reunion = valor ? { id: resto.join(":"), origen: origen as OrigenDeReunion } : undefined;
    void guardar(sesiones.map((x) => (x.id === s.id ? { ...x, reunion } : x)));
    setCambiandoReunion(false);
  };

  const enlace = (texto: string, onClick: () => void) => (
    <button type="button" className="text-brand hover:underline" onClick={onClick}>
      {texto}
    </button>
  );

  // La línea de datos de debajo del título: en el «después», la reunión; en el «antes», la fecha y el tema.
  const datos: React.ReactNode[] = [];
  if (momento === "despues" && r) {
    datos.push(diaLargo(r.fecha), ORIGEN[r.origen]);
    datos.push(r.leida ? <span className="text-success-ink">leída por el agente ✓</span> : <span className="text-warn-ink">sin leer</span>);
    if (puedeEditar && s && reuniones.length > 0) datos.push(enlace("cambiar reunión", () => setCambiandoReunion((x) => !x)));
  } else if (momento === "despues" && s) {
    datos.push(s.fecha ? diaLargo(s.fecha) : "sin fecha", "todavía sin reunión: cuando llegue la transcripción se liga sola");
    if (puedeEditar && reuniones.length > 0) datos.push(enlace("elegirla", () => setCambiandoReunion((x) => !x)));
  } else if (s) {
    if (s.fecha) datos.push(diaLargo(s.fecha));
    if (s.titulo) datos.push(s.titulo);
    if (!s.fecha && !s.titulo) datos.push("sin fecha ni tema");
    if (puedeEditar) datos.push(enlace(editando ? "listo" : "editar", () => setEditando((x) => !x)));
  } else if (r) {
    datos.push(diaLargo(r.fecha), "esta reunión no está en tus sesiones");
    if (puedeEditar && sesiones.length < MAX_SESIONES)
      datos.push(
        enlace("sumarla a mis sesiones", () =>
          void guardar([...sesiones, { id: nuevoIdDeSesion(), titulo: r.titulo.slice(0, 120), fecha: hoyEnCostaRica(aFecha(r.fecha)), reunion: { id: r.id, origen: r.origen } }]),
        ),
      );
  } else {
    datos.push(proxima.desde === "hubspot" && proxima.fecha ? `agendada en HubSpot para el ${diaConAnio(proxima.fecha)}` : "ponle fecha para que la reunión se ligue sola");
    if (puedeEditar) datos.push(enlace("ponerle fecha", agregar));
  }

  return (
    <header data-recorrido="preventa.sesion.cabecera" className="space-y-3">
      {/* En pantallas chicas la barra de la izquierda no lista las sesiones: se eligen acá. */}
      <Select className="w-full lg:hidden" aria-label="Elegir la sesión" value={pestana.clave} onChange={(ev) => seleccion.elegir(ev.target.value)}>
        {todas.map((p) => (
          <option key={p.clave} value={p.clave}>
            Sesión {p.numero}
            {p.fecha ? ` · ${diaCorto(p.fecha)}` : ""}
            {p.clave === claveDeLaProxima ? " · próxima" : ""}
          </option>
        ))}
      </Select>

      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold leading-tight text-fg">Sesión {pestana.numero}</h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            {datos.map((d, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {d}
              </span>
            ))}
          </p>
        </div>
        <span className="flex-1" />
        <div data-recorrido="preventa.sesion.momento">
        <AntesDespues valor={momento} onCambiar={alMomento} />
        </div>
        {momento === "antes" && esLaProxima && puedeEditar && (
          <BotonClaro disabled={lanzando || corriendo} onClick={() => void lanzar("guia")} title={guia ? (vieja ? "La guía es de antes de lo último que se supo" : `Guía armada el ${diaYHora(guia.en)}`) : "Todavía es la guía de base"}>
            {lanzando ? "Armando…" : guia ? "Rearmar la guía" : "Armar la guía"}
          </BotonClaro>
        )}
        {momento === "despues" && r && !r.leida && puedeEditar && (
          <button
            type="button"
            disabled={lanzando || corriendo}
            onClick={() => void lanzar("leer", r.origen === "meet" ? { sesionId: r.id } : {})}
            className="rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            {leyendo ? "Leyendo…" : "Leer con el agente"}
          </button>
        )}
      </div>

      {leyendo && (
        <p className="text-[13px] text-fg-secondary" role="status">
          El agente está leyendo: {corrida?.fase ?? "empezando…"}
        </p>
      )}
      {corrida?.estado === "ERROR" && corrida.modo === "leer" && <Alert variant="danger">{corrida.error}</Alert>}

      {cambiandoReunion && s && (
        <Select
          className="w-auto max-w-md text-[13px]"
          aria-label="Elegir la reunión de esta sesión"
          disabled={guardando}
          value={s.reunion ? `${s.reunion.origen}:${s.reunion.id}` : ""}
          onChange={(ev) => elegirReunion(ev.target.value)}
        >
          <option value="">La del mismo día</option>
          {reuniones.map((x) => (
            <option key={`${x.origen}:${x.id}`} value={`${x.origen}:${x.id}`}>
              {diaCorto(x.fecha)} · {x.titulo.slice(0, 60)}
            </option>
          ))}
        </Select>
      )}

      {editando && s && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 w-72 max-w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-fg"
            value={titulo}
            placeholder="De qué va esta sesión (opcional)"
            aria-label={`Tema de la sesión ${pestana.numero}`}
            onChange={(ev) => setTitulo(ev.target.value)}
            onBlur={() => {
              const t = titulo.trim();
              if (t !== (s.titulo ?? "")) cambiarSesion({ ...s, ...(t ? { titulo: t } : { titulo: undefined }) });
            }}
          />
          <input
            type="date"
            className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] text-fg"
            value={s.fecha ?? ""}
            disabled={guardando}
            aria-label={`Fecha de la sesión ${pestana.numero}`}
            onChange={(ev) => cambiarSesion({ ...s, fecha: ev.target.value || undefined })}
          />
          <button
            type="button"
            className="text-xs text-fg-muted hover:text-fg hover:underline"
            disabled={guardando}
            onClick={() => {
              void guardar(sesiones.filter((x) => x.id !== s.id));
              seleccion.elegir(claveDeLaProxima);
              setEditando(false);
            }}
          >
            Quitar la sesión
          </button>
        </div>
      )}
    </header>
  );
}

export default function SesionesDeExploracion() {
  const { exp, cambiar, sesion: seleccion } = useLienzo();
  const { lanzar } = useCorrida();
  const { sesiones, hoy, pestanas, activa, esLaProxima, momento, guardar } = useSesiones();

  // El recorrido de la preventa muestra los tres momentos de la sesión abierta (lib/recorridos/contenido/preventa.ts).
  const ponerMomento = seleccion.ponerMomento;
  const claveActiva = activa.clave;
  useEffect(() => {
    const alPedido = (e: Event) => {
      const a = (e as CustomEvent<AccionDelRecorrido>).detail;
      if (a?.evento === "preventa.momento" && (a.valor === "antes" || a.valor === "durante" || a.valor === "despues")) ponerMomento(claveActiva, a.valor);
    };
    window.addEventListener(EVENTO_DEL_RECORRIDO, alPedido);
    return () => window.removeEventListener(EVENTO_DEL_RECORRIDO, alPedido);
  }, [ponerMomento, claveActiva]);

  /**
   * La siguiente sesión: la próxima planeada después de esta o, si no hay, una nueva (con la fecha
   * del siguiente paso, si se acordó). `llevar` suma un punto de «nadie exploró» a esa sesión. Sin
   * `llevar`, abre la sesión y le pide la guía al agente.
   */
  const siguienteDe = () => {
    const idx = pestanas.findIndex((p) => p.clave === activa.clave);
    return pestanas.slice(idx + 1).find((p) => p.sesion && !p.hecha) ?? null;
  };
  const armarLaSiguiente = async (llevar?: { texto: string; item: ItemPropuesto | null }) => {
    const siguiente = siguienteDe()?.sesion ?? null;
    const fechaAcordada = (exp.estado.contenido.casillas.siguientePaso as { fecha?: string } | undefined)?.fecha;
    const destino: SesionPlaneada = siguiente ?? { id: nuevoIdDeSesion(), ...(fechaAcordada && fechaAcordada >= hoy ? { fecha: fechaAcordada } : {}) };
    const conLoLlevado = llevar ? { ...destino, explorar: [...(destino.explorar ?? []).filter((x) => x !== llevar.texto), llevar.texto].slice(-MAX_PARA_EXPLORAR) } : destino;
    const lista = siguiente ? sesiones.map((s) => (s.id === destino.id ? conLoLlevado : s)) : [...sesiones, conLoLlevado];
    const ops = [
      ...(llevar?.item ? [{ op: "usar" as const, itemId: llevar.item.id, valor: llevar.item.valor }] : []),
      { op: "sesiones" as const, sesiones: lista },
    ];
    const ok = await cambiar(ops);
    if (!ok || llevar) return;
    seleccion.elegir(destino.id);
    seleccion.ponerMomento(destino.id, "antes");
    void lanzar("guia");
  };
  /** Desmarca un punto: sale de la sesión a la que se había llevado. */
  const soltar = (texto: string) => void guardar(sesiones.map((s) => (s.explorar?.includes(texto) ? { ...s, explorar: s.explorar.filter((x) => x !== texto) } : s)));
  const numeroSiguiente = siguienteDe()?.numero ?? activa.numero + 1;

  return (
    <div className="space-y-5">
      <EncabezadoDeLaSesion pestana={activa} esLaProxima={esLaProxima} momento={momento} alMomento={(m) => seleccion.ponerMomento(activa.clave, m)} />
      {momento === "antes" ? (
        <AntesDeLaSesion pestana={activa} esLaProxima={esLaProxima} sesiones={sesiones} guardar={guardar} />
      ) : momento === "durante" ? (
        <DuranteLaSesion key={activa.clave} pestana={activa} />
      ) : (
        <DespuesDeLaSesion armarLaSiguiente={(llevar) => void armarLaSiguiente(llevar)} soltar={soltar} numeroSiguiente={numeroSiguiente} />
      )}
    </div>
  );
}
