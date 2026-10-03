"use client";

/**
 * SesionesDeExploracion — Exploración con una pestaña por sesión (pedido de Elías, 2026-10-03).
 *
 * Cada sesión tiene dos subpestañas:
 *   - Antes de la sesión: la guía para prepararla. Las preguntas en dos columnas —«Arquitectura de
 *     la venta» (lo que falta del marco de calificación) y «Escala de rendimiento» (las dimensiones
 *     sin evidencia)—, con sus repreguntas a la vista; lo que se trajo de la sesión anterior; y el
 *     manejo de objeciones, cómo cerrar y qué hacer si no deja explorar.
 *   - Después de la sesión: la reunión que le corresponde (por fecha, o elegida a mano), leerla con
 *     el agente, lo que salió, «Lo que se dijo y nadie exploró» —cada punto se lleva a la próxima
 *     sesión con un clic— y armar la siguiente.
 *
 * Una reunión que no quedó en ninguna sesión aparece como pestaña propia, para no perderla. La
 * guía de cada sesión se guarda por su id (`propuesta.guias`): la de una sesión que ya pasó muestra
 * lo que se preparó para ella.
 */
import { useState } from "react";
import { Alert, Badge, Button, Input, Select, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import { definicionDe, type ClaveDeCasilla } from "@/lib/exploraciones/casillas";
import { esFuenteDeHipotesis, type ItemPropuesto } from "@/lib/exploraciones/contenido";
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
  pestanasDeSesiones,
  POCA_APERTURA_DE_BASE,
  preguntasParaMostrar,
  proximaReunion,
  type GuiaDeLaSesion,
  type OrigenDeReunion,
  type PestanaDeSesion,
  type PreguntaParaMostrar,
  type SesionPlaneada,
} from "@/lib/exploraciones/guia";
import { REUNIONES } from "@/lib/exploraciones/sesion";
import { Casilla } from "./Casilla";
import { useLienzo } from "./contexto";
import { NivelChip, QueVaPrimero } from "./QueVaPrimero";
import SumarAMano from "./SumarAMano";
import { useCorrida } from "./useCorrida";

const nuevoId = () => `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const ORIGEN: Record<OrigenDeReunion, string> = { meet: "Google Meet", hubspot: "HubSpot", documento: "Sumada a mano" };

type Momento = "antes" | "despues";

// ── Piezas de la guía ─────────────────────────────────────────────────────────

/** Un título de bloque: el nombre chico arriba y, si hace falta, una línea de ayuda. */
function Titulo({ nombre, ayuda }: { nombre: string; ayuda?: string }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-widest text-fg-muted">{nombre}</p>
      {ayuda && <p className="text-xs text-fg-muted">{ayuda}</p>}
    </div>
  );
}

/** Una pregunta con sus repreguntas a la vista, debajo, con su flecha: sin pliegues. */
function Pregunta({ p }: { p: PreguntaParaMostrar }) {
  const { escala, mapa } = useLienzo();
  const dimension = p.tipo === "dimension" ? escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === p.para) : null;
  const pos = dimension ? mapa.posiciones[dimension.id] : undefined;
  return (
    <li className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
        <span className="font-semibold text-fg-secondary">{dimension ? dimension.nombre : definicionDe(p.para as ClaveDeCasilla).etiqueta}</span>
        {dimension &&
          (pos ? (
            <>
              · {pos.clase === "evidencia" ? "está en" : "creemos que está en"} <NivelChip nivel={pos.nivel} />
            </>
          ) : (
            "· sin dato todavía"
          ))}
      </p>
      <p className="text-sm font-medium leading-relaxed text-fg">«{p.pregunta}»</p>
      {p.repreguntas.length > 0 && (
        <div className="space-y-1.5 border-l-2 border-brand/25 pl-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-muted">Para profundizar</p>
          <ul className="space-y-1.5">
            {p.repreguntas.map((r, i) => (
              <li key={i} className="text-sm leading-relaxed text-fg-secondary">
                «{r}»
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function Columna({ nombre, ayuda, preguntas, vacio }: { nombre: string; ayuda: string; preguntas: PreguntaParaMostrar[]; vacio: string }) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="border-b border-line pb-2">
        <p className="text-sm font-semibold text-fg">{nombre}</p>
        <p className="text-xs text-fg-muted">{ayuda}</p>
      </div>
      {preguntas.length > 0 ? (
        <ul className="space-y-3">
          {preguntas.map((p) => (
            <Pregunta key={`${p.para}-${p.pregunta}`} p={p} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-fg-muted">{vacio}</p>
      )}
    </div>
  );
}

/** El manejo de objeciones de la sesión: las típicas, con LAER, adaptadas a la empresa si hay guía. */
function ManejoDeObjeciones({ guia }: { guia: GuiaDeLaSesion | null }) {
  const objeciones = OBJECIONES_DE_BASE.map((base) => guia?.objeciones.find((o) => o.tipo === base.tipo) ?? base);
  return (
    <section className="space-y-3">
      <Titulo nombre="Manejo de objeciones" ayuda="Con LAER: escuchar, reconocer, explorar y responder." />
      <div className="grid gap-3 lg:grid-cols-2">
        {objeciones.map((o) => (
          <div key={o.tipo} className="space-y-2.5 rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-fg">{OBJECION[o.tipo]}</p>
            <dl className="space-y-1.5">
              {PASOS_LAER.map((paso) => (
                <div key={paso.clave} className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[5.5rem_1fr]">
                  <dt className="text-xs font-semibold text-fg-muted">{paso.nombre}</dt>
                  <dd className="text-sm text-fg-secondary">{o[paso.clave]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-1 rounded-xl border border-warn-line bg-warn-surface p-4">
          <p className="text-sm font-semibold text-warn-ink">Si no te deja explorar</p>
          <p className="text-sm text-fg-secondary">{guia?.pocaApertura ?? POCA_APERTURA_DE_BASE}</p>
        </div>
        <div className="space-y-1 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-fg">Para cerrar</p>
          <p className="text-sm text-fg-secondary">{guia?.cierre ?? CIERRE_DE_BASE}</p>
        </div>
      </div>
    </section>
  );
}

// ── Antes de la sesión ────────────────────────────────────────────────────────

function AntesDeLaSesion({ pestana, esLaProxima, sesiones, guardar }: { pestana: PestanaDeSesion; esLaProxima: boolean; sesiones: SesionPlaneada[]; guardar: (s: SesionPlaneada[]) => void }) {
  const { exp, escala, mapa, puedeEditar, guardando } = useLienzo();
  const { corriendo, lanzando, lanzar } = useCorrida();
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
  const vieja = esLaProxima && guia && guiaVieja(guia, huecos, enfoque);
  const traidos = pestana.sesion?.explorar ?? [];

  if (!esLaProxima && !guia) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">
        No quedó guardada la guía con que se preparó esta sesión. La de la próxima está en su pestaña.
      </p>
    );
  }

  const quitarTraido = (t: string) => {
    if (!pestana.sesion) return;
    const id = pestana.sesion.id;
    guardar(sesiones.map((s) => (s.id === id ? { ...s, explorar: (s.explorar ?? []).filter((x) => x !== t) } : s)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3">
        <p className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
          {guia ? (
            <>
              <Badge size="xs" variant={vieja ? "warning" : "info"}>
                {vieja ? "Armada antes de lo último" : "Armada por el agente"}
              </Badge>
              {diaYHora(guia.en)}
            </>
          ) : (
            <Badge size="xs">De base: el agente todavía no la armó</Badge>
          )}
          <span className="text-fg-muted">No hace falta anotar: el agente lee la transcripción.</span>
        </p>
        {puedeEditar && esLaProxima && (
          <Button size="sm" variant={!guia || vieja ? "primary" : "secondary"} loading={lanzando} disabled={corriendo} onClick={() => void lanzar("guia")}>
            {guia ? "Rearmar la guía" : "Armar la guía con el agente"}
          </Button>
        )}
      </div>

      {conTest && pestana.numero === 1 && <Alert variant="info">{REUNIONES[0].promesa}</Alert>}

      {traidos.length > 0 && (
        <section className="space-y-2 rounded-xl border border-brand/25 bg-brand/5 p-4">
          <Titulo nombre="Lo que te llevaste de la sesión anterior" ayuda="Lo que se dijo y nadie exploró: retómalo en esta." />
          <ul className="space-y-1.5">
            {traidos.map((t) => (
              <li key={t} className="flex items-start justify-between gap-3 text-sm text-fg">
                <span>{t}</span>
                {puedeEditar && (
                  <button type="button" className="flex-shrink-0 text-xs text-fg-muted hover:text-fg hover:underline" disabled={guardando} onClick={() => quitarTraido(t)}>
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(desdeCero || (guia && guia.apertura.length > 0)) && (
        <section className="space-y-2">
          <Titulo nombre="Para abrir" ayuda={desdeCero ? "No hizo el test: empieza conectando, y después explícale la escala en simple." : undefined} />
          <ul className="space-y-1.5">
            {(guia?.apertura ?? []).map((a, i) => (
              <li key={`a-${i}`} className="text-sm text-fg-secondary">
                {a}
              </li>
            ))}
            {desdeCero &&
              CONEXION_DE_BASE.map((q, i) => (
                <li key={`c-${i}`} className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-fg">
                  «{q}»
                </li>
              ))}
          </ul>
          {desdeCero && guia?.escalaEnSimple && (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-fg-secondary">
              <span className="font-medium text-fg">La escala, en simple: </span>
              {guia.escalaEnSimple}
            </p>
          )}
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Columna
          nombre="Arquitectura de la venta"
          ayuda="Lo que falta del marco: metas, retos, quién decide, tiempos… Sin eso no hay con qué proponer."
          preguntas={deTarjetas}
          vacio="El marco está completo: no falta nada por preguntar."
        />
        <Columna
          nombre="Escala de rendimiento"
          ayuda="Las dimensiones que más importan y todavía no tienen evidencia, empezando por las más bajas."
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

      <ManejoDeObjeciones guia={guia} />
    </div>
  );
}

// ── Después de la sesión ──────────────────────────────────────────────────────

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

/** La reunión de la sesión: cuál es, de dónde viene, si se leyó, y cambiarla. */
function LaReunion({ pestana, sesiones, guardar }: { pestana: PestanaDeSesion; sesiones: SesionPlaneada[]; guardar: (s: SesionPlaneada[]) => void }) {
  const { reuniones, puedeEditar, guardando } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const r = pestana.reunion;
  const leyendo = corriendo && corrida?.modo === "leer";
  const elegir = (valor: string) => {
    if (!pestana.sesion) return;
    const id = pestana.sesion.id;
    const [origen, ...resto] = valor.split(":");
    const reunion = valor ? { id: resto.join(":"), origen: origen as OrigenDeReunion } : undefined;
    guardar(sesiones.map((s) => (s.id === id ? { ...s, reunion } : s)));
  };
  return (
    <section className={cn("space-y-3 rounded-xl border px-5 py-4", r && !r.leida ? "border-brand/30 bg-brand/5" : "border-line bg-surface")}>
      <Titulo nombre={r ? (r.leida ? "La reunión de esta sesión" : "Nueva sesión detectada") : "La reunión de esta sesión"} />
      {r ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <p className="text-base font-semibold text-fg">{r.titulo}</p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
              <span>{diaYHora(r.fecha)}</span>
              <Badge size="xs" variant={r.origen === "meet" ? "success" : r.origen === "hubspot" ? "warning" : "default"}>
                {ORIGEN[r.origen]}
              </Badge>
              <Badge size="xs" variant={r.leida ? "success" : "warning"}>
                {r.leida ? "Leída por el agente" : "Sin leer"}
              </Badge>
            </p>
            {!r.leida && !leyendo && (
              <p className="max-w-2xl text-sm text-fg-secondary">
                Pídele al agente que la lea: propone lo que salió, con la frase del cliente que lo respalda. Lo encuentras como «Propuesto» en el Resumen, en La escala y aquí abajo.
              </p>
            )}
            {leyendo && (
              <p className="text-sm text-fg" role="status">
                El agente está leyendo: {corrida?.fase ?? "empezando…"}
              </p>
            )}
          </div>
          {puedeEditar && !r.leida && (
            <Button variant="primary" loading={lanzando || leyendo} disabled={corriendo} onClick={() => void lanzar("leer", r.origen === "meet" ? { sesionId: r.id } : {})}>
              Leer con el agente
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-fg-secondary">
          Todavía no hay una reunión de este día. Cuando llegue la transcripción (Google Meet o el notetaker de HubSpot), se liga sola; si no calza, elígela abajo.
        </p>
      )}
      {corrida?.estado === "ERROR" && corrida.modo === "leer" && <Alert variant="danger">{corrida.error}</Alert>}
      {puedeEditar && pestana.sesion && reuniones.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-fg-muted">
          <span>¿No es esta?</span>
          <Select
            className="w-auto max-w-xs py-1 text-xs"
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
        </div>
      )}
    </section>
  );
}

/**
 * «Lo que se dijo y nadie exploró»: lo confirmado y lo que sugirió el agente, de una vez, cada punto
 * con «Explorar en la próxima sesión» (se suma a la próxima, y si era una sugerencia, se usa).
 */
function NadieExploro({ alSiguiente }: { alSiguiente: (texto: string, item: ItemPropuesto | null) => void }) {
  const { exp, cambiar, puedeEditar, guardando, pendientesPara } = useLienzo();
  const confirmados = (exp.estado.contenido.casillas.noExplorado as string[] | undefined) ?? [];
  const sugeridos = pendientesPara((d) => d.tipo === "casilla" && d.clave === "noExplorado");
  const enAlguna = new Set(exp.estado.contenido.sesiones.flatMap((s) => s.explorar ?? []));
  const fila = (texto: string, item: ItemPropuesto | null) => (
    <li key={item?.id ?? texto} className={cn("space-y-2 rounded-xl border px-4 py-3", item ? "border-brand/25 bg-brand/5" : "border-line bg-surface")}>
      {item && <p className="text-2xs font-semibold uppercase tracking-wide text-brand-light">Sugerido por el agente</p>}
      <p className="text-sm text-fg">{texto}</p>
      {item?.fuentes.find((f) => f.cita) && <p className="text-xs italic text-fg-muted">«{item.fuentes.find((f) => f.cita)?.cita}»</p>}
      {puedeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          {enAlguna.has(texto) ? (
            <Badge size="xs" variant="success">
              Va a la próxima sesión
            </Badge>
          ) : (
            <Button size="xs" variant="primary" disabled={guardando} onClick={() => alSiguiente(texto, item)}>
              Explorar en la próxima sesión
            </Button>
          )}
          {item ? (
            <Button size="xs" variant="secondary" disabled={guardando} onClick={() => void cambiar([{ op: "descartar", itemIds: [item.id] }])}>
              Descartar
            </Button>
          ) : (
            <button
              type="button"
              className="text-xs text-fg-muted hover:text-fg hover:underline"
              disabled={guardando}
              onClick={() => void cambiar([{ op: "casilla", clave: "noExplorado", valor: confirmados.filter((x) => x !== texto).length ? confirmados.filter((x) => x !== texto) : null }])}
            >
              Quitar
            </button>
          )}
        </div>
      )}
    </li>
  );
  return (
    <section className="space-y-3">
      <Titulo nombre="Lo que se dijo y nadie exploró" ayuda="Pistas que dio el cliente y nadie siguió. Llévalas a la próxima sesión, una por una." />
      {confirmados.length + sugeridos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-fg-muted">Todavía nada: aparece cuando el agente lee la reunión.</p>
      ) : (
        <ul className="space-y-2">
          {sugeridos.map((it) => fila(String(it.valor), it))}
          {confirmados.map((t) => fila(t, null))}
        </ul>
      )}
    </section>
  );
}

function DespuesDeLaSesion({
  pestana,
  sesiones,
  guardar,
  armarLaSiguiente,
}: {
  pestana: PestanaDeSesion;
  sesiones: SesionPlaneada[];
  guardar: (s: SesionPlaneada[]) => void;
  armarLaSiguiente: (llevar?: { texto: string; item: ItemPropuesto | null }) => void;
}) {
  const { exp, irA, puedeEditar } = useLienzo();
  const { corriendo, lanzando } = useCorrida();
  const ultimaLectura = [...exp.estado.propuesta.corridas].reverse().find((c) => c.modo === "leer");
  return (
    <div className="space-y-6">
      <LaReunion pestana={pestana} sesiones={sesiones} guardar={guardar} />

      {pestana.reunion?.leida && ultimaLectura && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4">
          <div className="min-w-0">
            <Titulo nombre="Lo que salió" />
            <p className="text-sm text-fg-secondary">
              {ultimaLectura.propuestos === 0
                ? "En la última lectura no había nada nuevo que proponer."
                : `La última lectura propuso ${ultimaLectura.propuestos} ${ultimaLectura.propuestos === 1 ? "cosa" : "cosas"}: revísalas en su lugar.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => irA("resumen")}>
              Revisar el Resumen
            </Button>
            <Button size="sm" variant="secondary" onClick={() => irA("escala")}>
              Revisar La escala
            </Button>
          </div>
        </section>
      )}

      <NadieExploro alSiguiente={(texto, item) => armarLaSiguiente({ texto, item })} />

      <section className="space-y-3">
        <Titulo nombre="Lo que se vio y lo que sigue" ayuda="Lo propone el agente con la transcripción; úsalo, descártalo o complétalo a mano." />
        <Casilla clave="siguientePaso" />
        <div className="space-y-2">
          <Casilla clave="portal" />
          <SinPortal />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla clave="apertura" />
          <Casilla clave="producto" />
        </div>
      </section>

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-fg">¿No quedó grabada? Súmala a mano</summary>
        <div className="border-t border-line p-5">
          <SumarAMano />
        </div>
      </details>

      {puedeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand/5 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">¿Listo para la siguiente?</p>
            <p className="text-xs text-fg-secondary">Arma la próxima sesión con lo que falta y lo que te llevas de esta. La guía la arma el agente.</p>
          </div>
          <Button variant="primary" loading={lanzando} disabled={corriendo || sesiones.length >= MAX_SESIONES} onClick={() => armarLaSiguiente()}>
            Armar la siguiente sesión
          </Button>
        </div>
      )}
    </div>
  );
}

// ── La sesión: su encabezado y sus dos momentos ───────────────────────────────

function EncabezadoDeLaSesion({ pestana, sesiones, guardar, alQuitar }: { pestana: PestanaDeSesion; sesiones: SesionPlaneada[]; guardar: (s: SesionPlaneada[]) => void; alQuitar: () => void }) {
  const { puedeEditar, guardando } = useLienzo();
  const s = pestana.sesion;
  const [titulo, setTitulo] = useState(s?.titulo ?? "");
  const [visto, setVisto] = useState(s?.titulo);
  if (visto !== s?.titulo) {
    setVisto(s?.titulo);
    setTitulo(s?.titulo ?? "");
  }
  const cambiar = (nueva: SesionPlaneada) => guardar(sesiones.map((x) => (x.id === nueva.id ? nueva : x)));

  if (!s) {
    const r = pestana.reunion;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3">
        <p className="text-sm text-fg-secondary">Esta reunión no está en tus sesiones.</p>
        {puedeEditar && r && (
          <Button
            size="sm"
            variant="secondary"
            disabled={guardando || sesiones.length >= MAX_SESIONES}
            onClick={() => guardar([...sesiones, { id: nuevoId(), titulo: r.titulo.slice(0, 120), fecha: hoyEnCostaRica(aFecha(r.fecha)), reunion: { id: r.id, origen: r.origen } }])}
          >
            Sumarla a mis sesiones
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[1fr_11rem_auto]">
      <Input
        value={titulo}
        disabled={!puedeEditar}
        placeholder="De qué va esta sesión (opcional)"
        aria-label={`Tema de la sesión ${pestana.numero}`}
        onChange={(e) => setTitulo(e.target.value)}
        onBlur={() => {
          const t = titulo.trim();
          if (t !== (s.titulo ?? "")) cambiar({ ...s, ...(t ? { titulo: t } : { titulo: undefined }) });
        }}
      />
      <Input
        type="date"
        value={s.fecha ?? ""}
        disabled={!puedeEditar || guardando}
        aria-label={`Fecha de la sesión ${pestana.numero}`}
        onChange={(e) => cambiar({ ...s, fecha: e.target.value || undefined })}
      />
      {puedeEditar && (
        <button type="button" className="text-xs text-fg-muted hover:text-fg hover:underline" disabled={guardando} onClick={alQuitar}>
          Quitar la sesión
        </button>
      )}
    </div>
  );
}

export default function SesionesDeExploracion() {
  const { exp, cambiar, puedeEditar, guardando, reuniones } = useLienzo();
  const { lanzar } = useCorrida();
  const sesiones = exp.estado.contenido.sesiones;
  const hoy = hoyEnCostaRica();
  const pestanas = pestanasDeSesiones(sesiones, reuniones, hoy);
  const proxima = proximaReunion(sesiones, exp.leido.agenda, hoy, exp.estado.propuesta.leidas.sesiones.length);

  // Sin sesiones planeadas, la primera existe igual: es la que se prepara.
  const virtual: PestanaDeSesion = { clave: "nueva", numero: pestanas.length + 1, sesion: null, reunion: null, fecha: null, hecha: false };
  const conLaProxima = proxima.sesionId ? pestanas : [...pestanas, virtual];
  const claveDeLaProxima = proxima.sesionId ?? "nueva";

  const [elegida, setElegida] = useState<string>(claveDeLaProxima);
  const activa = conLaProxima.find((p) => p.clave === elegida) ?? conLaProxima.find((p) => p.clave === claveDeLaProxima) ?? conLaProxima[0];
  const esLaProxima = activa.clave === claveDeLaProxima;
  const [momentoElegido, setMomento] = useState<Record<string, Momento>>({});
  const momento: Momento = momentoElegido[activa.clave] ?? (esLaProxima && !activa.reunion ? "antes" : "despues");

  const guardar = (lista: SesionPlaneada[]) => void cambiar([{ op: "sesiones", sesiones: lista }]);

  const agregar = () => {
    if (sesiones.length >= MAX_SESIONES) return;
    const id = nuevoId();
    guardar([...sesiones, { id }]);
    setElegida(id);
    setMomento((m) => ({ ...m, [id]: "antes" }));
  };

  /**
   * La siguiente sesión: la próxima planeada después de esta o, si no hay, una nueva (con la fecha
   * del siguiente paso, si se acordó). `llevar` suma un punto de «nadie exploró» a esa sesión. Sin
   * `llevar`, abre la sesión y le pide la guía al agente.
   */
  const armarLaSiguiente = async (llevar?: { texto: string; item: ItemPropuesto | null }) => {
    const idx = pestanas.findIndex((p) => p.clave === activa.clave);
    const siguiente = pestanas.slice(idx + 1).find((p) => p.sesion && !p.hecha)?.sesion ?? null;
    const fechaAcordada = (exp.estado.contenido.casillas.siguientePaso as { fecha?: string } | undefined)?.fecha;
    const destino: SesionPlaneada = siguiente ?? { id: nuevoId(), ...(fechaAcordada && fechaAcordada >= hoy ? { fecha: fechaAcordada } : {}) };
    const conLoLlevado = llevar ? { ...destino, explorar: [...(destino.explorar ?? []).filter((x) => x !== llevar.texto), llevar.texto].slice(-MAX_PARA_EXPLORAR) } : destino;
    const lista = siguiente ? sesiones.map((s) => (s.id === destino.id ? conLoLlevado : s)) : [...sesiones, conLoLlevado];
    const ops = [
      ...(llevar?.item ? [{ op: "usar" as const, itemId: llevar.item.id, valor: llevar.item.valor }] : []),
      { op: "sesiones" as const, sesiones: lista },
    ];
    const ok = await cambiar(ops);
    if (!ok || llevar) return;
    setElegida(destino.id);
    setMomento((m) => ({ ...m, [destino.id]: "antes" }));
    void lanzar("guia");
  };

  const etiquetaDe = (p: PestanaDeSesion) => (
    <span className="flex items-center gap-1.5">
      Sesión {p.numero}
      {p.fecha && <span className="text-fg-muted">· {diaCorto(p.fecha)}</span>}
      {p.reunion && !p.reunion.leida ? (
        <Badge size="xs" variant="warning">
          Nueva
        </Badge>
      ) : p.clave === claveDeLaProxima ? (
        <Badge size="xs" variant="info">
          Próxima
        </Badge>
      ) : p.hecha ? (
        <span className="text-success-ink" aria-label="hecha">
          ✓
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-line">
        <Tabs<string>
          aria-label="Las sesiones"
          value={activa.clave}
          onChange={setElegida}
          items={conLaProxima.map((p) => ({ key: p.clave, label: etiquetaDe(p) }))}
          className="border-b-0"
        />
        {puedeEditar && sesiones.length < MAX_SESIONES && (
          <Button size="xs" variant="ghost" disabled={guardando} onClick={agregar}>
            + Agregar sesión
          </Button>
        )}
      </div>

      {activa.sesion || activa.reunion ? (
        <EncabezadoDeLaSesion
          pestana={activa}
          sesiones={sesiones}
          guardar={guardar}
          alQuitar={() => {
            guardar(sesiones.filter((s) => s.id !== activa.sesion?.id));
            setElegida(claveDeLaProxima);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3">
          <p className="text-sm text-fg-secondary">
            La primera sesión. {proxima.desde === "hubspot" && proxima.fecha ? `Hay una reunión agendada en HubSpot: ${diaConAnio(proxima.fecha)}.` : "Ponle fecha para que la reunión se ligue sola."}
          </p>
          {puedeEditar && (
            <Button size="sm" variant="secondary" disabled={guardando} onClick={agregar}>
              Ponerle fecha
            </Button>
          )}
        </div>
      )}

      <Tabs<Momento>
        aria-label="Antes y después de la sesión"
        variant="pill"
        size="sm"
        value={momento}
        onChange={(m) => setMomento((x) => ({ ...x, [activa.clave]: m }))}
        items={[
          { key: "antes", label: "Antes de la sesión" },
          { key: "despues", label: "Después de la sesión" },
        ]}
      />

      {momento === "antes" ? (
        <AntesDeLaSesion pestana={activa} esLaProxima={esLaProxima} sesiones={sesiones} guardar={guardar} />
      ) : (
        <DespuesDeLaSesion pestana={activa} sesiones={sesiones} guardar={guardar} armarLaSiguiente={(llevar) => void armarLaSiguiente(llevar)} />
      )}
    </div>
  );
}
