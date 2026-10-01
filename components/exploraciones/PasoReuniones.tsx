"use client";

/**
 * PasoReuniones — la GUÍA de las dos reuniones, para tenerla abierta mientras se conversa.
 *
 * Pedido de Elías (2026-10-01): «ni siquiera anotar respuestas: lo que ventas necesita es una guía
 * de exploración; la transcripción se encarga de anotar y de sugerir las respuestas y una mejor
 * posición en la escala». Por eso cada paso dice qué se busca, cuánto dura y QUÉ PREGUNTAR —las del
 * marco y, donde toca, la pregunta de cada dimensión de la escala, con lo que hoy se cree de ella—,
 * y no hay nada que llenar. Lo que respondió el cliente aparece en su propia pestaña, propuesto por
 * el agente cuando lee la transcripción.
 */
import { useState } from "react";
import { Alert, Badge, Button, Input, Select, Tabs } from "@/components/ui";
import { LETRAS } from "@/lib/escala/documento/tipos";
import { definicionDe, type ClaveDeCasilla } from "@/lib/exploraciones/casillas";
import type { Medicion } from "@/lib/exploraciones/contenido";
import type { AreaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { minutosPara, REUNIONES, type IdDeReunion, type LoQueLlena, type PasoDelGuion, type Reunion } from "@/lib/exploraciones/sesion";
import { Casilla } from "./Casilla";
import { useLienzo } from "./contexto";
import PanelDelAgente from "./PanelDelAgente";
import { NivelChip, QueVaPrimero } from "./QueVaPrimero";

const QUE_LLENA: Record<Exclude<LoQueLlena, ClaveDeCasilla>, string> = {
  nivel: "dónde está cada dimensión",
  areas: "las áreas en juego",
  aExplorar: "qué explorar a fondo",
  falta: "lo que le falta para Funcional",
  plan: "qué va primero",
};

function etiquetaDeLoQueLlena(l: LoQueLlena): string {
  return l in QUE_LLENA ? QUE_LLENA[l as keyof typeof QUE_LLENA] : definicionDe(l as ClaveDeCasilla).etiqueta.toLowerCase();
}

/** Las dimensiones de un área para preguntar, de la más baja a la más alta según el mapa (las sin dato, primero). */
function PreguntasDeLasDimensiones({ area, soloLasElegidas = false }: { area: AreaDelLienzo; soloLasElegidas?: boolean }) {
  const { exp, mapa } = useLienzo();
  const orden = (id: string) => {
    const p = mapa.posiciones[id];
    return p ? LETRAS.indexOf(p.nivel) : -1;
  };
  const dims = area.dimensiones
    .filter((d) => d.aplica && (!soloLasElegidas || d.id in exp.estado.contenido.aExplorar))
    .sort((a, b) => orden(a.id) - orden(b.id));
  if (dims.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-fg-secondary">{area.nombre}: la pregunta de cada dimensión, empezando por las más bajas</p>
      <ul className="space-y-2">
        {dims.map((d) => {
          const p = mapa.posiciones[d.id];
          return (
            <li key={d.id} className="rounded-lg border border-line px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-fg">{d.nombre}</p>
                <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                  {p ? (
                    <>
                      {p.clase === "evidencia" ? "Está en" : "Creemos que está en"} <NivelChip nivel={p.nivel} />
                    </>
                  ) : (
                    "Sin dato todavía"
                  )}
                </span>
              </div>
              <p className="text-sm text-fg-secondary">«{d.pregunta}»</p>
              {p?.porQue && p.clase === "hipotesis" && <p className="text-xs text-fg-muted">Por qué lo creemos: {p.porQue}</p>}
              {soloLasElegidas && d.funcional.length > 0 && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer select-none text-xs text-brand-light">Qué mirar: lo que pide Funcional ({d.funcional.length})</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-fg-secondary">
                    {d.funcional.map((c) => (
                      <li key={c.id}>
                        {c.texto}
                        {c.verificacion === "comprobable" && (
                          <Badge size="xs" variant="info" className="ml-1.5">
                            Míralo en el portal
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PasoDeLaReunion({ paso, numero, minutos }: { paso: PasoDelGuion; numero: number; minutos: number }) {
  const { exp, escala, irA } = useLienzo();
  const enJuego = exp.estado.areas.map((id) => escala.areas.find((a) => a.id === id)).filter((a): a is AreaDelLienzo => !!a);
  const delPaso = paso.dimensiones === "todas" ? enJuego.slice(0, 1) : paso.dimensiones === "sumadas" ? enJuego.slice(1) : paso.dimensiones === "elegidas" ? enJuego : [];
  const hayElegidas = enJuego.some((a) => a.dimensiones.some((d) => d.id in exp.estado.contenido.aExplorar));

  return (
    <li className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">
            <span className="tabular-nums text-fg-muted">{numero}.</span> {paso.titulo}
            {paso.opcional && (
              <Badge size="xs" className="ml-2">
                Opcional
              </Badge>
            )}
          </p>
          <p className="text-xs text-fg-secondary">{paso.objetivo}</p>
        </div>
        <span className="flex-shrink-0 text-xs tabular-nums text-fg-muted">{minutos} min</span>
      </div>

      {paso.preguntas.length > 0 && (
        <ul className="space-y-1.5">
          {paso.preguntas.map((q, i) => (
            <li key={i} className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-1.5 text-sm text-fg">
              «{q}»
            </li>
          ))}
        </ul>
      )}
      {paso.ojo && <Alert variant="warning">{paso.ojo}</Alert>}

      {paso.dimensiones === "todas" && enJuego.length === 0 && (
        <p className="text-xs text-fg-muted">
          Elige primero las áreas en juego, en{" "}
          <button type="button" className="text-brand-light underline" onClick={() => irA("preparacion")}>
            Preparación
          </button>
          .
        </p>
      )}
      {paso.dimensiones === "sumadas" && delPaso.length === 0 && <p className="text-xs text-fg-muted">No se sumaron áreas: estos minutos van a profundizar.</p>}
      {paso.dimensiones === "elegidas" && !hayElegidas && (
        <p className="text-xs text-fg-muted">
          Todavía no hay dimensiones para explorar a fondo: márcalas en{" "}
          <button type="button" className="text-brand-light underline" onClick={() => irA("preparacion")}>
            Preparación
          </button>{" "}
          o en el mapa de la escala.
        </p>
      )}
      {delPaso.map((a) => (
        <PreguntasDeLasDimensiones key={a.id} area={a} soloLasElegidas={paso.dimensiones === "elegidas"} />
      ))}
      {paso.llena.includes("plan") && <QueVaPrimero />}

      <p className="text-2xs text-fg-muted">Después, el agente saca de aquí: {paso.llena.map(etiquetaDeLoQueLlena).join(", ")}.</p>
    </li>
  );
}

function Guia({ reunion }: { reunion: Reunion }) {
  const [duracion, setDuracion] = useState(reunion.duracion);
  const minutos = minutosPara(reunion, duracion);
  const opciones = [...new Set([reunion.duracion, 30, 45, 60, 90])].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Alert variant="info" className="flex-1">
          {reunion.promesa}
        </Alert>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          Dura
          <Select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} aria-label="Duración de la reunión">
            {opciones.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
        </label>
      </div>
      <ol className="space-y-3">
        {reunion.pasos.map((p, i) => (
          <PasoDeLaReunion key={p.id} paso={p} numero={i + 1} minutos={minutos[i]} />
        ))}
      </ol>
      <p className="text-xs text-fg-muted">
        No hace falta anotar: cuando llega la transcripción de la reunión, el agente la lee sola y propone las respuestas (en «Lo que respondió») y dónde está cada equipo (en «La escala»).
      </p>
    </div>
  );
}

// ── Lo que respondió ──────────────────────────────────────────────────────────

function Grupo({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
        {ayuda && <p className="text-xs text-fg-muted">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

function DatosDeLaMedicion() {
  const { exp, cambiar, puedeEditar } = useLienzo();
  const guardada = exp.estado.contenido.medicion;
  const [m, setM] = useState<Medicion>(guardada);
  const [vista, setVista] = useState(guardada);
  if (vista !== guardada) {
    setVista(guardada);
    setM(guardada);
  }
  const campo = (k: keyof Medicion, etiqueta: string, placeholder: string) => (
    <label className="space-y-1.5">
      <span className="block text-xs font-medium text-fg-secondary">{etiqueta}</span>
      <Input
        value={m[k] ?? ""}
        disabled={!puedeEditar}
        placeholder={placeholder}
        onChange={(e) => setM((x) => ({ ...x, [k]: e.target.value }))}
        onBlur={() => {
          if ((m[k] ?? "") !== (guardada[k] ?? "")) void cambiar([{ op: "medicion", medicion: { [k]: (m[k] ?? "").trim() } }]);
        }}
      />
    </label>
  );
  return (
    <div className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-3">
      {campo("pais", "País", "Por ejemplo, Costa Rica")}
      {campo("personasEmpresa", "Personas en la empresa", "Por ejemplo, 120")}
      {campo("personasEquipo", "Personas en el equipo que se mira", "Por ejemplo, 6")}
    </div>
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

/** Lo que el cliente respondió en las reuniones: lo propone el agente con la transcripción; el vendedor lo usa o lo corrige. */
function LoQueRespondio() {
  return (
    <div className="space-y-8">
      <p className="text-sm text-fg-secondary">
        Lo anota el agente con la transcripción de cada reunión: tú usas o descartas lo que propone, y si algo falta lo completas a mano. Es lo que alimenta la propuesta y el traspaso.
      </p>
      <PanelDelAgente modoPrincipal="leer" />
      <Grupo titulo="Adónde quiere llegar" ayuda="Las metas en cifras son el criterio de éxito de la propuesta.">
        <Casilla clave="metas" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla clave="retos" />
          <Casilla clave="planes" />
          <Casilla clave="tiempos" />
        </div>
      </Grupo>
      <Grupo titulo="Qué está en juego">
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla clave="consecuencias" />
          <Casilla clave="implicaciones" />
        </div>
      </Grupo>
      <Grupo titulo="Quién decide y con qué">
        <Casilla clave="autoridad" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla clave="presupuesto" />
          <Casilla clave="apertura" />
        </div>
      </Grupo>
      <Grupo titulo="Lo que se vio y lo que sigue">
        <div className="space-y-2">
          <Casilla clave="portal" />
          <SinPortal />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla clave="noExplorado" />
          <Casilla clave="siguientePaso" />
          <Casilla clave="producto" />
        </div>
      </Grupo>
      <Grupo titulo="Datos de la medición" ayuda="La escala los pide en toda medición, para poder comparar con el tiempo. El país y el tamaño salen de HubSpot.">
        <DatosDeLaMedicion />
      </Grupo>
    </div>
  );
}

type Vista = IdDeReunion | "respuestas";

export default function PasoReuniones() {
  const { revisables } = useLienzo();
  const [vista, setVista] = useState<Vista>("revision");
  const reunion = REUNIONES.find((r) => r.id === vista);
  const respuestasPendientes = revisables.filter(
    (it) => it.destino.tipo === "casilla" && !["contexto", "hubspotActual", "hipotesis"].includes(it.destino.clave),
  ).length;
  return (
    <div className="space-y-4">
      <Tabs<Vista>
        aria-label="Las reuniones"
        variant="pill"
        value={vista}
        onChange={setVista}
        items={[
          ...REUNIONES.map((r) => ({ key: r.id as Vista, label: `${r.titulo.split(" — ")[0]} · ${r.duracion} min` })),
          { key: "respuestas" as Vista, label: "Lo que respondió", count: respuestasPendientes || undefined },
        ]}
      />
      {reunion ? (
        <>
          <h2 className="text-sm font-semibold text-fg">{reunion.titulo}</h2>
          <Guia key={reunion.id} reunion={reunion} />
        </>
      ) : (
        <LoQueRespondio />
      )}
    </div>
  );
}
