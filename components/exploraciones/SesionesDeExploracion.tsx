"use client";

/**
 * SesionesDeExploracion — la sesión elegida en la barra de la izquierda, con su «antes» y su
 * «después» (pedido de Elías, 2026-10-03; rediseño de escritorio el mismo día: menos información a
 * la vista y el ancho aprovechado).
 *
 *   - Antes: la guía para prepararla. Arriba, en una sola franja, cómo abrir y lo que te llevaste de
 *     la sesión anterior. Después, las preguntas en dos columnas —«Arquitectura de la venta» (lo que
 *     falta del marco) y «Escala de rendimiento» (las dimensiones sin evidencia)—, con las
 *     repreguntas plegadas en una línea. Las objeciones de esta empresa, con LAER, quedan plegadas
 *     abajo: la guía general está en «Cómo manejar objeciones», a la izquierda.
 *   - Después: la reunión, lo que salió (cada propuesta con Usar o Descartar, ahí mismo) y «Se dijo y
 *     nadie lo exploró» con una casilla para llevar cada punto a la próxima sesión. Abajo, fija, la
 *     barra para armar la siguiente.
 *
 * La guía de cada sesión se guarda por su id (`propuesta.guias`): la de una sesión que ya pasó
 * muestra lo que se preparó para ella. Qué sesión está abierta lo decide el lienzo (useSesiones).
 */
import { useState } from "react";
import { Alert, Badge, Button, Input, Select, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { definicionDe, type ClaveDeCasilla } from "@/lib/exploraciones/casillas";
import { esFuenteDeHipotesis, type DestinoDePropuesta, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import { aFecha, diaConAnio, diaCorto, diaYHora, hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import {
  CIERRE_DE_BASE,
  CONEXION_DE_BASE,
  focoDeLaGuia,
  guiaVieja,
  MAX_PARA_EXPLORAR,
  MAX_SESIONES,
  OBJECION,
  OBJECIONES_DE_BASE,
  PASOS_LAER,
  POCA_APERTURA_DE_BASE,
  preguntasParaMostrar,
  type GuiaDeLaSesion,
  type OrigenDeReunion,
  type PestanaDeSesion,
  type PreguntaParaMostrar,
  type SesionPlaneada,
} from "@/lib/exploraciones/guia";
import { REUNIONES } from "@/lib/exploraciones/sesion";
import { Casilla } from "./Casilla";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";
import { FilaSugerida } from "./Propuestas";
import { NivelChip, QueVaPrimero } from "./QueVaPrimero";
import SumarAMano from "./SumarAMano";
import { useCorrida } from "./useCorrida";
import { nuevoIdDeSesion, useSesiones } from "./useSesiones";

const ORIGEN: Record<OrigenDeReunion, string> = { meet: "Google Meet", hubspot: "HubSpot", documento: "Sumada a mano" };

type Guardar = (s: SesionPlaneada[]) => unknown;

/** El rótulo chico de un bloque. */
function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-2xs font-semibold uppercase tracking-widest text-fg-muted">{children}</p>;
}

// ── Antes de la sesión ────────────────────────────────────────────────────────

/** Una pregunta, en una línea de lectura; sus repreguntas, plegadas detrás de un enlace. */
function Pregunta({ p }: { p: PreguntaParaMostrar }) {
  const { escala, mapa } = useLienzo();
  const [abierta, setAbierta] = useState(false);
  const dimension = p.tipo === "dimension" ? escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === p.para) : null;
  const pos = dimension ? mapa.posiciones[dimension.id] : undefined;
  const nombre = dimension ? dimension.nombre : definicionDe(p.para as ClaveDeCasilla).etiqueta;
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <span
        className={cn(
          "mt-0.5 flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-md px-1 text-2xs font-bold",
          dimension ? "bg-warn-surface text-warn-ink" : "bg-info-surface text-brand",
        )}
        aria-hidden="true"
      >
        {dimension ? dimension.id : nombre.charAt(0)}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium leading-snug text-fg">«{p.pregunta}»</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <span>{nombre}</span>
          {dimension &&
            (pos ? (
              <>
                · {pos.clase === "evidencia" ? "está en" : "creemos"} <NivelChip nivel={pos.nivel} />
              </>
            ) : (
              "· sin dato"
            ))}
        </p>
        {p.repreguntas.length > 0 && (
          <>
            <button type="button" aria-expanded={abierta} onClick={() => setAbierta((x) => !x)} className="text-xs font-semibold text-brand hover:underline">
              {abierta ? "Ocultar repreguntas" : `${p.repreguntas.length} ${p.repreguntas.length === 1 ? "repregunta" : "repreguntas"}`}
            </button>
            {abierta && (
              <ol className="list-decimal space-y-1 rounded-lg bg-surface-muted py-2 pl-8 pr-3 text-sm leading-relaxed text-fg-secondary">
                {p.repreguntas.map((r, i) => (
                  <li key={i}>«{r}»</li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function Columna({ nombre, detalle, preguntas, vacio }: { nombre: string; detalle: string; preguntas: PreguntaParaMostrar[]; vacio: string }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-baseline gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">{nombre}</h3>
        <span className="text-xs text-fg-muted">{detalle}</span>
      </header>
      {preguntas.length > 0 ? (
        <ul className="divide-y divide-line">
          {preguntas.map((p) => (
            <Pregunta key={`${p.para}-${p.pregunta}`} p={p} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-sm text-fg-muted">{vacio}</p>
      )}
    </section>
  );
}

/** Las objeciones típicas, adaptadas a esta empresa si hay guía, con LAER: plegadas, para cuando aparezcan. */
function ObjecionesDeLaSesion({ guia }: { guia: GuiaDeLaSesion | null }) {
  const objeciones = OBJECIONES_DE_BASE.map((base) => guia?.objeciones.find((o) => o.tipo === base.tipo) ?? base);
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg">
        Si aparece una objeción {guia && <span className="font-normal text-fg-muted">· adaptadas a esta empresa, con LAER</span>}
      </summary>
      <div className="grid gap-3 border-t border-line p-4 xl:grid-cols-2">
        {objeciones.map((o) => (
          <div key={o.tipo} className="space-y-2 rounded-lg border border-line p-3">
            <p className="text-sm font-semibold text-fg">{OBJECION[o.tipo]}</p>
            <dl className="space-y-1">
              {PASOS_LAER.map((paso) => (
                <div key={paso.clave} className="grid grid-cols-[5.5rem_1fr] gap-x-3">
                  <dt className="text-xs font-semibold text-fg-muted">{paso.nombre}</dt>
                  <dd className="text-sm text-fg-secondary">{o[paso.clave]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}

function AntesDeLaSesion({ pestana, esLaProxima, sesiones, guardar }: { pestana: PestanaDeSesion; esLaProxima: boolean; sesiones: SesionPlaneada[]; guardar: Guardar }) {
  const { exp, escala, mapa, puedeEditar, guardando } = useLienzo();
  const e = exp.estado;
  const guiaGuardada = pestana.sesion ? (e.propuesta.guias[pestana.sesion.id] ?? null) : null;
  // La próxima usa la guía viva (la última que armó el agente); una que ya pasó, la que se guardó para ella.
  const guia = guiaGuardada ?? (esLaProxima ? e.propuesta.guia : null);
  const { huecos, enfoque } = focoDeLaGuia(e.contenido.casillas, escala, e.areas, mapa.posiciones, e.contenido.aExplorar);
  const preguntas = esLaProxima ? preguntasParaMostrar(guia, huecos, enfoque, escala) : guia ? preguntasParaMostrar(guia, guia.huecos, guia.enfoque, escala) : [];
  const deTarjetas = preguntas.filter((p) => p.tipo === "tarjeta");
  const deDimensiones = preguntas.filter((p) => p.tipo === "dimension");

  const conTest = exp.leido.tests.length > 0;
  const conEvidencia = Object.values(e.contenido.chequeo).some((x) => !esFuenteDeHipotesis(x.fuente)) || e.propuesta.leidas.sesiones.length > 0;
  const desdeCero = esLaProxima && !conTest && !conEvidencia && pestana.numero === 1;
  const traidos = pestana.sesion?.explorar ?? [];
  const apertura = guia?.apertura ?? [];

  if (!esLaProxima && !guia) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
        No quedó guardada la guía con que se preparó esta sesión. La de la próxima está en su sesión, a la izquierda.
      </p>
    );
  }

  const quitarTraido = (t: string) => {
    if (!pestana.sesion) return;
    const id = pestana.sesion.id;
    void guardar(sesiones.map((s) => (s.id === id ? { ...s, explorar: (s.explorar ?? []).filter((x) => x !== t) } : s)));
  };

  const hayFranja = apertura.length > 0 || desdeCero || traidos.length > 0 || (conTest && pestana.numero === 1);

  return (
    <div className="space-y-5">
      {hayFranja && (
        <section className="grid gap-x-8 gap-y-4 rounded-xl border border-line bg-surface p-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2">
            <Rotulo>Para abrir</Rotulo>
            {conTest && pestana.numero === 1 && <p className="text-sm text-fg-secondary">{REUNIONES[0].promesa}</p>}
            {desdeCero && <p className="text-xs text-fg-muted">No hizo el test: empieza conectando, y después explícale la escala en simple.</p>}
            <ul className="space-y-1.5">
              {apertura.map((a, i) => (
                <li key={`a-${i}`} className="text-sm leading-relaxed text-fg">
                  {a}
                </li>
              ))}
              {desdeCero &&
                CONEXION_DE_BASE.map((q, i) => (
                  <li key={`c-${i}`} className="text-sm leading-relaxed text-fg">
                    «{q}»
                  </li>
                ))}
            </ul>
            {desdeCero && guia?.escalaEnSimple && (
              <p className="text-sm text-fg-secondary">
                <span className="font-medium text-fg">La escala, en simple: </span>
                {guia.escalaEnSimple}
              </p>
            )}
          </div>
          {traidos.length > 0 && (
            <div className="min-w-0 space-y-2">
              <Rotulo>Te llevaste de la sesión anterior</Rotulo>
              <ul className="flex flex-wrap gap-1.5">
                {traidos.map((t) => (
                  <li key={t} className="flex items-center gap-1.5 rounded-full border border-info-line bg-info-surface py-1 pl-3 pr-2 text-xs text-fg">
                    <span>{t}</span>
                    {puedeEditar && (
                      <button type="button" aria-label={`Quitar «${t}»`} className="text-fg-muted hover:text-fg" disabled={guardando} onClick={() => quitarTraido(t)}>
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

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Columna
          nombre="Arquitectura de la venta"
          detalle={deTarjetas.length ? `${deTarjetas.length} por preguntar` : "completa"}
          preguntas={deTarjetas}
          vacio="El marco está completo: no falta nada por preguntar."
        />
        <Columna
          nombre="Escala de rendimiento"
          detalle={deDimensiones.length ? `${deDimensiones.length} sin evidencia` : ""}
          preguntas={deDimensiones}
          vacio={e.areas.length === 0 ? "Elige las áreas en juego en «La escala» para saber qué dimensiones preguntar." : "Todas las dimensiones en juego ya tienen evidencia."}
        />
      </div>

      {conTest && pestana.numero === 1 && (
        <details className="rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg">Su plan: qué va primero (es lo que se lleva de esta reunión)</summary>
          <div className="border-t border-line p-4">
            <QueVaPrimero />
          </div>
        </details>
      )}

      <ObjecionesDeLaSesion guia={guia} />

      <p className="text-sm text-fg-muted">
        <span className="font-medium text-fg-secondary">Para cerrar: </span>
        {guia?.cierre ?? CIERRE_DE_BASE} <span className="font-medium text-fg-secondary">Si no te deja explorar: </span>
        {guia?.pocaApertura ?? POCA_APERTURA_DE_BASE}
      </p>
    </div>
  );
}

// ── Después de la sesión ──────────────────────────────────────────────────────

/** Dónde aterriza lo propuesto, en una palabra o dos, para el chip de la fila. */
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

/** Lo que salió de las reuniones: cada propuesta del agente con su cita, para usarla o descartarla ahí mismo. */
function LoQueSalio() {
  const { revisables, escala, cambiar, puedeEditar, guardando } = useLienzo();
  const [todas, setTodas] = useState(false);
  const items = revisables.filter((it) => it.destino.tipo !== "casoDeUso" && !(it.destino.tipo === "casilla" && it.destino.clave === "noExplorado"));
  const visibles = todas ? items : items.slice(0, 6);
  const nombreDeDimension = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.nombre ?? id;
  const refrescar = (its: ItemPropuesto[]) => its.some((it) => it.destino.tipo === "edicion" || it.destino.tipo === "perfil");
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">Lo que salió</h3>
        <span className="text-xs text-fg-muted">{items.length ? `${items.length} para revisar` : "nada pendiente"}</span>
        <span className="flex-1" />
        {puedeEditar && items.length > 1 && (
          <Button
            size="xs"
            variant="primary"
            disabled={guardando}
            onClick={() => void cambiar([{ op: "usarVarias", items: items.map((it) => ({ itemId: it.id, valor: it.valor })) }], { refrescar: refrescar(items) })}
          >
            Usar todas
          </Button>
        )}
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-sm text-fg-muted">Cuando el agente lee la reunión, lo que propone aparece acá, con la frase del cliente que lo respalda.</p>
      ) : (
        <ul className="space-y-1.5 p-3">
          {visibles.map((it) => (
            <FilaSugerida key={it.id} item={it} destino={destinoCorto(it.destino, nombreDeDimension)} />
          ))}
        </ul>
      )}
      {items.length > visibles.length && (
        <button type="button" className="w-full border-t border-line px-4 py-2.5 text-sm font-semibold text-brand hover:bg-surface-hover" onClick={() => setTodas(true)}>
          Ver las {items.length - visibles.length} restantes
        </button>
      )}
    </section>
  );
}

/**
 * «Se dijo y nadie lo exploró»: lo confirmado y lo que sugirió el agente, cada punto con su casilla
 * para llevarlo a la próxima sesión (si era una sugerencia, se usa al marcarla).
 */
function NadieExploro({ llevar, soltar }: { llevar: (texto: string, item: ItemPropuesto | null) => void; soltar: (texto: string) => void }) {
  const { exp, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const confirmados = (exp.estado.contenido.casillas.noExplorado as string[] | undefined) ?? [];
  const sugeridos = pendientesPara((d) => d.tipo === "casilla" && d.clave === "noExplorado");
  const enAlguna = new Set(exp.estado.contenido.sesiones.flatMap((s) => s.explorar ?? []));
  const fila = (texto: string, item: ItemPropuesto | null) => {
    const marcado = enAlguna.has(texto);
    const cita = item?.fuentes.find((f) => f.cita)?.cita;
    return (
      <li key={item?.id ?? texto} className="flex items-start gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={marcado}
          disabled={!puedeEditar || guardando}
          aria-label={`Llevar «${texto}» a la próxima sesión`}
          onChange={() => (marcado ? soltar(texto) : llevar(texto, item))}
          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-info"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className={cn("text-sm leading-snug", marcado ? "font-medium text-fg" : "text-fg-secondary")}>{texto}</p>
          {cita && <p className="line-clamp-2 text-xs italic text-fg-muted">«{cita}»</p>}
          {item && <p className="text-2xs font-semibold text-brand">Sugerido por el agente</p>}
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
      <header className="border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">Se dijo y nadie lo exploró</h3>
        <p className="text-xs text-fg-muted">Marca lo que te llevas a la próxima sesión.</p>
      </header>
      {confirmados.length + sugeridos.length === 0 ? (
        <p className="px-4 py-5 text-sm text-fg-muted">Todavía nada: aparece cuando el agente lee la reunión.</p>
      ) : (
        <ul className="divide-y divide-line">
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
        <Button size="xs" variant="secondary" disabled={guardando} onClick={() => void cambiar([{ op: "sinPortal", valor: !sin }])}>
          {sin ? "Sí usa HubSpot" : "No usa HubSpot"}
        </Button>
      )}
    </div>
  );
}

/** La reunión de la sesión, en una franja: cuál es, si se leyó, leerla y cambiarla. */
function LaReunion({ pestana, sesiones, guardar }: { pestana: PestanaDeSesion; sesiones: SesionPlaneada[]; guardar: Guardar }) {
  const { reuniones, puedeEditar, guardando } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const r = pestana.reunion;
  const leyendo = corriendo && corrida?.modo === "leer";
  const elegir = (valor: string) => {
    if (!pestana.sesion) return;
    const id = pestana.sesion.id;
    const [origen, ...resto] = valor.split(":");
    const reunion = valor ? { id: resto.join(":"), origen: origen as OrigenDeReunion } : undefined;
    void guardar(sesiones.map((s) => (s.id === id ? { ...s, reunion } : s)));
  };
  return (
    <section className={cn("space-y-2 rounded-xl border px-4 py-3", r && !r.leida ? "border-info-line bg-info-surface" : "border-line bg-surface")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {r ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-fg">{r.titulo}</span>
              <span className="text-xs text-fg-muted">{diaYHora(r.fecha)}</span>
              <Badge size="xs" variant={r.origen === "meet" ? "success" : r.origen === "hubspot" ? "warning" : "default"}>
                {ORIGEN[r.origen]}
              </Badge>
              <Badge size="xs" variant={r.leida ? "success" : "warning"}>
                {r.leida ? "Leída por el agente" : "Sin leer"}
              </Badge>
            </p>
          ) : (
            <p className="text-sm text-fg-secondary">Todavía no hay una reunión de este día. Cuando llegue la transcripción se liga sola; si no calza, elígela.</p>
          )}
          {leyendo && (
            <p className="mt-1 text-xs text-fg" role="status">
              El agente está leyendo: {corrida?.fase ?? "empezando…"}
            </p>
          )}
        </div>
        {puedeEditar && pestana.sesion && reuniones.length > 0 && (
          <Select
            className="w-auto max-w-[16rem] py-1 text-xs"
            aria-label="Elegir la reunión de esta sesión"
            disabled={guardando}
            value={pestana.sesion.reunion ? `${pestana.sesion.reunion.origen}:${pestana.sesion.reunion.id}` : ""}
            onChange={(ev) => elegir(ev.target.value)}
          >
            <option value="">La del mismo día</option>
            {reuniones.map((x) => (
              <option key={`${x.origen}:${x.id}`} value={`${x.origen}:${x.id}`}>
                {diaCorto(x.fecha)} · {x.titulo.slice(0, 60)}
              </option>
            ))}
          </Select>
        )}
        {puedeEditar && r && !r.leida && (
          <Button size="sm" variant="primary" loading={lanzando || leyendo} disabled={corriendo} onClick={() => void lanzar("leer", r.origen === "meet" ? { sesionId: r.id } : {})}>
            Leer con el agente
          </Button>
        )}
      </div>
      {corrida?.estado === "ERROR" && corrida.modo === "leer" && <Alert variant="danger">{corrida.error}</Alert>}
    </section>
  );
}

function DespuesDeLaSesion({
  pestana,
  sesiones,
  guardar,
  armarLaSiguiente,
  soltar,
  numeroSiguiente,
}: {
  pestana: PestanaDeSesion;
  sesiones: SesionPlaneada[];
  guardar: Guardar;
  armarLaSiguiente: (llevar?: { texto: string; item: ItemPropuesto | null }) => void;
  soltar: (texto: string) => void;
  numeroSiguiente: number;
}) {
  const { exp, puedeEditar } = useLienzo();
  const { corriendo, lanzando } = useCorrida();
  const siguientePaso = exp.estado.contenido.casillas.siguientePaso as { que?: string; fecha?: string; conQuien?: string } | undefined;
  const marcados = new Set(exp.estado.contenido.sesiones.flatMap((s) => s.explorar ?? [])).size;
  return (
    <div className="space-y-5">
      <LaReunion pestana={pestana} sesiones={sesiones} guardar={guardar} />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <LoQueSalio />
        <NadieExploro llevar={(texto, item) => armarLaSiguiente({ texto, item })} soltar={soltar} />
      </div>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg">
          Datos de la sesión <span className="font-normal text-fg-muted">· siguiente paso, portal, apertura y producto mostrado</span>
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
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-fg">¿No quedó grabada? Súmala a mano</summary>
        <div className="border-t border-line p-4">
          <SumarAMano />
        </div>
      </details>

      {puedeEditar && (
        <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface px-6 py-3 xl:-mx-8 xl:px-8">
          <p className="min-w-0 flex-1 text-sm text-fg-secondary">
            {siguientePaso?.que ? (
              <>
                Siguiente paso: <span className="font-semibold text-fg">{[siguientePaso.que, siguientePaso.fecha && diaConAnio(siguientePaso.fecha), siguientePaso.conQuien && `con ${siguientePaso.conQuien}`].filter(Boolean).join(" · ")}</span>
              </>
            ) : (
              "Sin siguiente paso acordado todavía."
            )}
          </p>
          {marcados > 0 && <span className="text-xs text-fg-muted">{marcados === 1 ? "1 tema marcado" : `${marcados} temas marcados`}</span>}
          <Button variant="primary" loading={lanzando} disabled={corriendo || sesiones.length >= MAX_SESIONES} onClick={() => armarLaSiguiente()}>
            Armar la sesión {numeroSiguiente} →
          </Button>
        </div>
      )}
    </div>
  );
}

// ── La sesión: su encabezado y sus dos momentos ───────────────────────────────

function EncabezadoDeLaSesion({ pestana, esLaProxima, momento, alMomento }: { pestana: PestanaDeSesion; esLaProxima: boolean; momento: MomentoDeLaSesion; alMomento: (m: MomentoDeLaSesion) => void }) {
  const { exp, escala, mapa, puedeEditar, guardando, sesion: seleccion } = useLienzo();
  const { todas, sesiones, guardar, claveDeLaProxima, proxima, agregar } = useSesiones();
  const { corriendo, lanzando, lanzar } = useCorrida();
  const s = pestana.sesion;
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
  // Armada antes de lo último que se supo: el botón pasa a ser el principal.
  const vieja = esLaProxima && !!guia && guiaVieja(guia, foco.huecos, foco.enfoque);

  return (
    <header className="space-y-3">
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

      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-fg">
            Sesión {pestana.numero}
            {esLaProxima ? (
              <Badge size="xs" variant="info">
                Próxima
              </Badge>
            ) : pestana.hecha ? (
              <Badge size="xs" variant="success">
                Hecha
              </Badge>
            ) : null}
          </h2>
          {s ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-8 w-72 max-w-full text-sm"
                value={titulo}
                disabled={!puedeEditar}
                placeholder="De qué va esta sesión (opcional)"
                aria-label={`Tema de la sesión ${pestana.numero}`}
                onChange={(ev) => setTitulo(ev.target.value)}
                onBlur={() => {
                  const t = titulo.trim();
                  if (t !== (s.titulo ?? "")) cambiarSesion({ ...s, ...(t ? { titulo: t } : { titulo: undefined }) });
                }}
              />
              <Input
                className="h-8 w-40 text-sm"
                type="date"
                value={s.fecha ?? ""}
                disabled={!puedeEditar || guardando}
                aria-label={`Fecha de la sesión ${pestana.numero}`}
                onChange={(ev) => cambiarSesion({ ...s, fecha: ev.target.value || undefined })}
              />
              {puedeEditar && (
                <button
                  type="button"
                  className="text-xs text-fg-muted hover:text-fg hover:underline"
                  disabled={guardando}
                  onClick={() => {
                    void guardar(sesiones.filter((x) => x.id !== s.id));
                    seleccion.elegir(claveDeLaProxima);
                  }}
                >
                  Quitar la sesión
                </button>
              )}
            </div>
          ) : pestana.reunion ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
              Esta reunión no está en tus sesiones.
              {puedeEditar && (
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={guardando || sesiones.length >= MAX_SESIONES}
                  onClick={() => {
                    const r = pestana.reunion!;
                    void guardar([...sesiones, { id: nuevoIdDeSesion(), titulo: r.titulo.slice(0, 120), fecha: hoyEnCostaRica(aFecha(r.fecha)), reunion: { id: r.id, origen: r.origen } }]);
                  }}
                >
                  Sumarla a mis sesiones
                </Button>
              )}
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
              {proxima.desde === "hubspot" && proxima.fecha ? `Hay una reunión agendada en HubSpot: ${diaConAnio(proxima.fecha)}.` : "Ponle fecha para que la reunión se ligue sola."}
              {puedeEditar && (
                <Button size="xs" variant="secondary" disabled={guardando} onClick={agregar}>
                  Ponerle fecha
                </Button>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {momento === "antes" && esLaProxima && puedeEditar && (
            <>
              <span className="text-xs text-fg-muted">{guia ? (vieja ? "La guía es de antes de lo último" : `Guía del ${diaYHora(guia.en)}`) : "Guía de base"}</span>
              <Button size="sm" variant={!guia || vieja ? "primary" : "secondary"} loading={lanzando} disabled={corriendo} onClick={() => void lanzar("guia")}>
                {guia ? "Rearmar la guía" : "Armar la guía con el agente"}
              </Button>
            </>
          )}
          <Tabs<MomentoDeLaSesion>
            aria-label="Antes y después de la sesión"
            variant="pill"
            size="sm"
            value={momento}
            onChange={alMomento}
            items={[
              { key: "antes", label: "Antes" },
              { key: "despues", label: "Después" },
            ]}
          />
        </div>
      </div>
    </header>
  );
}

export default function SesionesDeExploracion() {
  const { exp, cambiar, sesion: seleccion } = useLienzo();
  const { lanzar } = useCorrida();
  const { sesiones, hoy, pestanas, activa, esLaProxima, momento, guardar } = useSesiones();

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
    <div className="space-y-6">
      <EncabezadoDeLaSesion pestana={activa} esLaProxima={esLaProxima} momento={momento} alMomento={(m) => seleccion.ponerMomento(activa.clave, m)} />
      {momento === "antes" ? (
        <AntesDeLaSesion pestana={activa} esLaProxima={esLaProxima} sesiones={sesiones} guardar={guardar} />
      ) : (
        <DespuesDeLaSesion pestana={activa} sesiones={sesiones} guardar={guardar} armarLaSiguiente={(llevar) => void armarLaSiguiente(llevar)} soltar={soltar} numeroSiguiente={numeroSiguiente} />
      )}
    </div>
  );
}
