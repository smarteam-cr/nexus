"use client";

/**
 * components/guia-exploracion/GuiaDeExploracion.tsx — la GUÍA DE EXPLORACIÓN del CSE (2026-10-02).
 *
 * Reemplaza al informe: es un lienzo que se usa DURANTE las sesiones. El ejecutivo sale sabiendo qué
 * explorar y con quién. Arriba de cada sección, lo que propone el agente («Usar» / «Descartar», con la
 * frase de donde salió); abajo, lo confirmado, editable. Nada de lo que hace el agente pisa lo
 * confirmado: por eso «Preparar» y «Leer la última reunión» se pueden correr las veces que haga falta.
 *
 * El molde y el porqué, en lib/guia-exploracion/contenido.ts.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  NOMBRE_DEL_EQUIPO,
  NOMBRE_DEL_ROL,
  ROLES,
  TOPE_NO_REPREGUNTAR,
  type Alcance,
  type ClaveDeEquipo,
  type ItemPropuesto,
  type OperacionDeGuia,
  type RolDePersona,
  type ValorPropuesto,
} from "@/lib/guia-exploracion/contenido";
import type { VistaDeLaGuia } from "@/lib/guia-exploracion/servidor";

const BTN =
  "px-2.5 py-1 rounded-lg text-xs font-semibold border border-line text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors disabled:opacity-50";
const BTN_PRIMARIO =
  "px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover transition-colors disabled:opacity-50";
const INPUT =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand";

type Cambiar = (ops: OperacionDeGuia[], ok?: string) => Promise<boolean>;

const NOMBRE_DEL_ALCANCE: Record<Alcance, string> = { dentro: "Dentro de lo contratado", duda: "En duda", fuera: "Fuera de lo contratado" };

export default function GuiaDeExploracion({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [v, setV] = useState<VistaDeLaGuia | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/guia-exploracion`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error ?? "No se pudo cargar la guía.");
      return;
    }
    setV(data);
  }, [projectId, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enCurso = !!v?.corrida.enCurso;
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => void cargar(), 4000);
    return () => clearInterval(t);
  }, [enCurso, cargar]);

  const cambiar: Cambiar = useCallback(
    async (ops, ok) => {
      if (!v) return false;
      setOcupado(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/guia-exploracion`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: v.version, operaciones: ops }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.error ?? "No se pudo guardar.");
          if (res.status === 409) void cargar();
          return false;
        }
        setV(data);
        if (ok) toast.success(ok);
        return true;
      } finally {
        setOcupado(false);
      }
    },
    [projectId, toast, v, cargar],
  );

  const lanzar = async (modo: "preparar" | "leer") => {
    setOcupado(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/guia-exploracion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo arrancar el agente.");
        return;
      }
      setV(data);
      toast.info(modo === "preparar" ? "Preparando la guía… tarda alrededor de un minuto." : "Leyendo la última reunión…");
    } finally {
      setOcupado(false);
    }
  };

  if (!v) return <div className="py-10 text-center text-sm text-fg-muted">Cargando la guía…</div>;

  const c = v.contenido;
  const pend = (pred: (i: ItemPropuesto) => boolean) => v.pendientes.filter(pred);
  const vacia =
    !c.resultados.length && !c.sesiones.length && !c.personas.length && !c.noRepreguntar.length && !Object.keys(c.equipos).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <div>
          <h3 className="text-base font-semibold text-fg">Guía de exploración</h3>
          <p className="mt-0.5 text-xs text-fg-muted">
            Qué explorar y con quién. El agente propone; tú confirmas. Lo confirmado no se pisa nunca.
          </p>
          {v.corrida.enCurso && <p className="mt-1 text-xs text-fg-secondary">✨ El agente está trabajando…</p>}
          {v.corrida.error && <p className="mt-1 text-xs text-danger-ink">El agente no pudo terminar: {v.corrida.error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={vacia ? BTN_PRIMARIO : BTN} disabled={ocupado || enCurso} onClick={() => lanzar("preparar")}>
            {vacia ? "✨ Preparar la guía" : "✨ Volver a proponer"}
          </button>
          <button className={BTN} disabled={ocupado || enCurso} onClick={() => lanzar("leer")} title="Lee la última reunión del proyecto y propone qué preguntas ya quedaron respondidas">
            Leer la última reunión
          </button>
        </div>
      </header>

      {v.pendientes.length > 0 && (
        <p className="text-xs text-fg-secondary">
          {v.pendientes.length} propuesta{v.pendientes.length === 1 ? "" : "s"} del agente esperando que decidas (están en cada sección).
        </p>
      )}

      <Seccion titulo="Lo que no hay que repreguntar" bajada={`Corto: solo lo que quemaría una sesión volver a preguntar (hasta ${TOPE_NO_REPREGUNTAR}).`}>
        <Propuestas items={pend((i) => i.destino.tipo === "noRepreguntar")} ocupado={ocupado} cambiar={cambiar} />
        <ListaDeDatos lista="noRepreguntar" datos={c.noRepreguntar} ocupado={ocupado} cambiar={cambiar} agregar="Agregar dato" />
      </Seccion>

      <Seccion titulo="1 · Resultados que el cliente necesita" bajada="Qué quiere lograr, quién lo necesita y para qué. Siempre dentro de lo contratado.">
        <Propuestas items={pend((i) => i.destino.tipo === "resultado")} ocupado={ocupado} cambiar={cambiar} />
        <Resultados v={v} ocupado={ocupado} cambiar={cambiar} />
      </Seccion>

      <Seccion titulo="2 · Cada equipo contratado" bajada="Cómo opera hoy y dónde se traba.">
        {v.equipos.length === 0 && <p className="text-xs italic text-fg-muted">El proyecto no tiene hubs de ventas, marketing o servicio.</p>}
        {v.equipos.map((e) => (
          <EquipoVista key={e} equipo={e} v={v} pend={pend} ocupado={ocupado} cambiar={cambiar} />
        ))}
      </Seccion>

      <Seccion titulo="3 · La escala" bajada="Dónde quedó en el diagnóstico preliminar, qué dijeron los cuestionarios y qué falta confirmar.">
        <EscalaVista v={v} ocupado={ocupado} cambiar={cambiar} />
      </Seccion>

      <Seccion titulo="Plan de sesiones" bajada="Qué preguntar y con quién. Marca lo que ya preguntaste y anota lo que averiguaste.">
        <Propuestas items={pend((i) => i.destino.tipo === "sesion" || i.destino.tipo === "contradiccion" || i.destino.tipo === "respondida")} ocupado={ocupado} cambiar={cambiar} v={v} />
        <Sesiones v={v} ocupado={ocupado} cambiar={cambiar} />
      </Seccion>

      <Seccion titulo="A quién involucrar" bajada="Con su rol. Lo que no está confirmado con el cliente se marca.">
        <Propuestas items={pend((i) => i.destino.tipo === "persona")} ocupado={ocupado} cambiar={cambiar} />
        <Personas v={v} ocupado={ocupado} cambiar={cambiar} />
      </Seccion>

      <details className="rounded-2xl border border-line bg-surface-muted px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-fg-secondary">
          Fuera de lo contratado ({c.fueraDeAlcance.length + pend((i) => i.destino.tipo === "fueraDeAlcance").length})
          <span className="ml-2 text-xs font-normal text-fg-muted">no es el centro de la exploración: va al mapa de oportunidades del AM</span>
        </summary>
        <div className="mt-3 space-y-3">
          <Propuestas items={pend((i) => i.destino.tipo === "fueraDeAlcance")} ocupado={ocupado} cambiar={cambiar} />
          <ListaDeDatos lista="fueraDeAlcance" datos={c.fueraDeAlcance} ocupado={ocupado} cambiar={cambiar} agregar="Agregar" />
        </div>
      </details>
    </div>
  );
}

function Seccion({ titulo, bajada, children }: { titulo: string; bajada: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div>
        <h4 className="text-sm font-semibold text-fg">{titulo}</h4>
        <p className="text-xs text-fg-muted">{bajada}</p>
      </div>
      {children}
    </section>
  );
}

// ── Propuestas del agente ────────────────────────────────────────────────────

function resumen(i: ItemPropuesto, v?: VistaDeLaGuia): ReactNode {
  const val = i.valor as ValorPropuesto & Record<string, unknown>;
  switch (i.destino.tipo) {
    case "resultado":
      return (
        <>
          <b>{String(val.que)}</b>
          {val.quien ? ` — lo necesita: ${val.quien}` : ""}
          {val.paraQue ? ` — para: ${val.paraQue}` : ""}
          {val.alcance !== "dentro" && <span className="ml-1 text-warn-ink">({NOMBRE_DEL_ALCANCE[val.alcance as Alcance]})</span>}
        </>
      );
    case "persona":
      return (
        <>
          <b>{String(val.nombre)}</b>
          {val.rol ? ` — ${NOMBRE_DEL_ROL[val.rol as RolDePersona]}` : " — rol sin confirmar"}
          {val.sabe ? `: ${val.sabe}` : ""}
        </>
      );
    case "sesion": {
      const preguntas = (val.preguntas as Array<{ texto: string }>) ?? [];
      return (
        <>
          <b>Sesión: {String(val.titulo)}</b> — con {String(val.conQuien || "—")}. {String(val.objetivo || "")}
          <ul className="mt-1 list-disc pl-5 text-xs text-fg-secondary">
            {preguntas.map((q, n) => (
              <li key={n}>{q.texto}</li>
            ))}
          </ul>
        </>
      );
    }
    case "respondida": {
      const d = i.destino;
      const q = v?.contenido.sesiones.find((s) => s.id === d.sesionId)?.preguntas.find((x) => x.id === d.preguntaId);
      return (
        <>
          <b>Ya respondida:</b> {q?.texto ?? "(una pregunta del plan)"}
          <span className="block text-xs text-fg-secondary">→ {String(val.respuesta)}</span>
        </>
      );
    }
    case "contradiccion":
      return (
        <>
          <b>Se contradicen:</b> {String(val.texto)}
        </>
      );
    default:
      return String(val.texto ?? "");
  }
}

function Propuestas({ items, ocupado, cambiar, v }: { items: ItemPropuesto[]; ocupado: boolean; cambiar: Cambiar; v?: VistaDeLaGuia }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-brand/40 bg-surface-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">✨ Propone el agente</p>
        {items.length > 1 && (
          <button className={BTN} disabled={ocupado} onClick={() => cambiar([{ op: "descartar", itemIds: items.map((i) => i.id) }])}>
            Descartar todas
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="rounded-lg border border-line bg-surface px-3 py-2">
            <div className="text-sm text-fg">{resumen(i, v)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {i.fuentes.map((f, n) => (
                <span key={n} className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-fg-muted" title={f.cita ? `«${f.cita}»` : undefined}>
                  {f.etiqueta}
                  {f.cita ? " · cita" : ""}
                </span>
              ))}
              <span className="flex-1" />
              <button className={BTN} disabled={ocupado} onClick={() => cambiar([{ op: "usar", itemId: i.id }])}>
                Usar
              </button>
              <button className={BTN} disabled={ocupado} onClick={() => cambiar([{ op: "descartar", itemIds: [i.id] }])}>
                Descartar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Listas simples ───────────────────────────────────────────────────────────

function Agregar({ placeholder, ocupado, onAgregar }: { placeholder: string; ocupado: boolean; onAgregar: (t: string) => Promise<boolean> }) {
  const [t, setT] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (t.trim() && (await onAgregar(t))) setT("");
      }}
    >
      <input className={INPUT} placeholder={placeholder} value={t} onChange={(e) => setT(e.target.value)} />
      <button className={BTN} disabled={ocupado || !t.trim()} type="submit">
        Agregar
      </button>
    </form>
  );
}

function ListaDeDatos({
  lista,
  datos,
  ocupado,
  cambiar,
  agregar,
}: {
  lista: "noRepreguntar" | "fueraDeAlcance";
  datos: VistaDeLaGuia["contenido"]["noRepreguntar"];
  ocupado: boolean;
  cambiar: Cambiar;
  agregar: string;
}) {
  return (
    <>
      {datos.length > 0 && (
        <ul className="space-y-1">
          {datos.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface-muted px-3 py-1.5 text-sm text-fg">
              <span>
                {d.texto}
                {d.fuente && <span className="ml-1.5 text-[11px] text-fg-muted">({d.fuente})</span>}
              </span>
              <button className="text-xs text-fg-muted hover:text-danger-ink" disabled={ocupado} onClick={() => cambiar([{ op: "quitar", lista, id: d.id }])}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <Agregar placeholder={`${agregar}…`} ocupado={ocupado} onAgregar={(texto) => cambiar([{ op: "agregarDato", lista, texto }])} />
    </>
  );
}

// ── Resultados ───────────────────────────────────────────────────────────────

function Resultados({ v, ocupado, cambiar }: { v: VistaDeLaGuia; ocupado: boolean; cambiar: Cambiar }) {
  return (
    <>
      {v.contenido.resultados.length === 0 && <p className="text-xs italic text-fg-muted">Todavía no hay resultados confirmados.</p>}
      <ul className="space-y-2">
        {v.contenido.resultados.map((r) => (
          <li key={r.id} className="space-y-1.5 rounded-xl border border-line p-3">
            <input className={INPUT} defaultValue={r.que} onBlur={(e) => e.target.value !== r.que && cambiar([{ op: "editar", lista: "resultados", id: r.id, campos: { que: e.target.value } }])} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={INPUT} placeholder="Quién lo necesita" defaultValue={r.quien} onBlur={(e) => e.target.value !== r.quien && cambiar([{ op: "editar", lista: "resultados", id: r.id, campos: { quien: e.target.value } }])} />
              <input className={INPUT} placeholder="Para qué" defaultValue={r.paraQue} onBlur={(e) => e.target.value !== r.paraQue && cambiar([{ op: "editar", lista: "resultados", id: r.id, campos: { paraQue: e.target.value } }])} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(["dentro", "duda", "fuera"] as Alcance[]).map((a) => (
                <button
                  key={a}
                  disabled={ocupado}
                  onClick={() => cambiar([{ op: "editar", lista: "resultados", id: r.id, campos: { alcance: a } }])}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    r.alcance === a ? (a === "dentro" ? "border-success-line bg-success-surface text-success-ink" : "border-warn-line bg-warn-surface text-warn-ink") : "border-line text-fg-muted"
                  }`}
                >
                  {NOMBRE_DEL_ALCANCE[a]}
                </button>
              ))}
              <span className="flex-1" />
              <button className="text-xs text-fg-muted hover:text-danger-ink" disabled={ocupado} onClick={() => cambiar([{ op: "quitar", lista: "resultados", id: r.id }])}>
                Quitar
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Agregar placeholder="Agregar un resultado (qué quiere lograr)…" ocupado={ocupado} onAgregar={(que) => cambiar([{ op: "agregarResultado", que }])} />
    </>
  );
}

// ── Equipos ──────────────────────────────────────────────────────────────────

function EquipoVista({
  equipo,
  v,
  pend,
  ocupado,
  cambiar,
}: {
  equipo: ClaveDeEquipo;
  v: VistaDeLaGuia;
  pend: (p: (i: ItemPropuesto) => boolean) => ItemPropuesto[];
  ocupado: boolean;
  cambiar: Cambiar;
}) {
  const e = v.contenido.equipos[equipo] ?? { opera: [], trabas: [] };
  const columna = (tipo: "opera" | "traba", titulo: string, items: { id: string; texto: string }[]) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-fg-secondary">{titulo}</p>
      <Propuestas items={pend((i) => i.destino.tipo === tipo && "equipo" in i.destino && i.destino.equipo === equipo)} ocupado={ocupado} cambiar={cambiar} />
      <ul className="space-y-1">
        {items.map((h) => (
          <li key={h.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface-muted px-3 py-1.5 text-sm text-fg">
            <span>{h.texto}</span>
            <button className="text-xs text-fg-muted hover:text-danger-ink" disabled={ocupado} onClick={() => cambiar([{ op: "quitar", lista: "hallazgo", id: h.id }])}>
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <Agregar placeholder="Agregar…" ocupado={ocupado} onAgregar={(texto) => cambiar([{ op: "agregarHallazgo", equipo, tipo, texto }])} />
    </div>
  );
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-2 text-sm font-semibold text-fg">{NOMBRE_DEL_EQUIPO[equipo]}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {columna("opera", "Cómo opera hoy", e.opera)}
        {columna("traba", "Dónde se traba", e.trabas)}
      </div>
    </div>
  );
}

// ── Escala ───────────────────────────────────────────────────────────────────

function EscalaVista({ v, ocupado, cambiar }: { v: VistaDeLaGuia; ocupado: boolean; cambiar: Cambiar }) {
  const e = v.escala;
  if (!e.disponible) return <p className="text-xs italic text-fg-muted">La escala de rendimiento todavía no está publicada en Nexus.</p>;
  if (e.areas.length === 0) return <p className="text-xs italic text-fg-muted">El proyecto no tiene áreas de la escala contratadas.</p>;
  const faltan = e.areas.flatMap((a) => a.dimensiones).filter((d) => !d.confirmado).length;
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-secondary">
        {e.hayPreliminar
          ? "El cliente viene de un diagnóstico preliminar: es el punto de partida, no evidencia."
          : "Este cliente no viene de un diagnóstico preliminar: todo está por confirmar."}{" "}
        {faltan > 0 ? `Faltan ${faltan} dimensiones por confirmar.` : "Todas las dimensiones están confirmadas."}
      </p>
      {e.areas.map((a) => (
        <details key={a.id} className="rounded-xl border border-line p-3" open>
          <summary className="cursor-pointer text-sm font-semibold text-fg">{a.nombre}</summary>
          <ul className="mt-2 divide-y divide-line">
            {a.dimensiones.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-[10rem] flex-1 text-sm text-fg">{d.nombre}</span>
                {d.previo && (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-fg-muted" title="Diagnóstico preliminar">
                    {d.previo.fuente === "test" ? "Test" : "Venta"}: {d.previo.nivel}
                  </span>
                )}
                {d.cuestionario.map((r, n) => (
                  <span key={n} className={`rounded-full border px-2 py-0.5 text-[10px] ${r.confirmada ? "border-line text-fg-secondary" : "border-dashed border-line text-fg-muted"}`}>
                    {r.persona.split(" ")[0]}: {r.nivel ?? "—"}
                  </span>
                ))}
                {d.desacuerdo && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${d.desacuerdo === "se-contradicen" ? "border-danger-line bg-danger-surface text-danger-ink" : "border-warn-line bg-warn-surface text-warn-ink"}`}>
                    {d.desacuerdo === "se-contradicen" ? "Se contradicen" : "Difieren"}
                  </span>
                )}
                <select
                  className="rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-fg"
                  value={d.confirmado?.letra ?? ""}
                  disabled={ocupado}
                  onChange={(ev) => cambiar([{ op: "confirmarNivel", dimensionId: d.id, nivel: ev.target.value || null }])}
                  title="El nivel que confirmas en la exploración"
                >
                  <option value="">Por confirmar</option>
                  {e.niveles.map((n) => (
                    <option key={n.letra} value={n.letra}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

function Sesiones({ v, ocupado, cambiar }: { v: VistaDeLaGuia; ocupado: boolean; cambiar: Cambiar }) {
  const sesiones = v.contenido.sesiones;
  return (
    <div className="space-y-3">
      {sesiones.length === 0 && <p className="text-xs italic text-fg-muted">Todavía no hay sesiones en el plan.</p>}
      {sesiones.map((s, i) => {
        const hechas = s.preguntas.filter((q) => q.hecha).length;
        return (
          <div key={s.id} className="space-y-2 rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-fg">
                {i + 1}. {s.titulo}
              </p>
              <span className="text-[11px] text-fg-muted">
                {hechas}/{s.preguntas.length} preguntadas
              </span>
            </div>
            {s.objetivo && <p className="text-xs text-fg-secondary">{s.objetivo}</p>}
            <label className="flex items-center gap-2 text-xs text-fg-secondary">
              <span className="font-semibold">Con quién:</span>
              <input
                className={`${INPUT} py-1 text-xs`}
                defaultValue={s.conQuien}
                placeholder="A quién invitar y por qué"
                onBlur={(e) => e.target.value !== s.conQuien && cambiar([{ op: "editar", lista: "sesiones", id: s.id, campos: { conQuien: e.target.value } }])}
              />
            </label>
            <ol className="space-y-1.5">
              {s.preguntas.map((q) => (
                <li key={q.id} className={`rounded-lg border px-3 py-2 ${q.hecha ? "border-success-line bg-success-surface/40" : "border-line"}`}>
                  <label className="flex items-start gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={q.hecha}
                      disabled={ocupado}
                      onChange={(e) => cambiar([{ op: "marcarPregunta", sesionId: s.id, preguntaId: q.id, hecha: e.target.checked }])}
                    />
                    <span className="flex-1">
                      {q.texto}
                      {q.repregunta && <span className="block text-xs text-fg-muted">Si sale vaga: {q.repregunta}</span>}
                    </span>
                    {!q.hecha && (
                      <button type="button" className="text-xs text-fg-muted hover:text-danger-ink" disabled={ocupado} onClick={() => cambiar([{ op: "quitar", lista: "sesiones", id: q.id }])}>
                        Quitar
                      </button>
                    )}
                  </label>
                  {q.hecha && (
                    <input
                      className={`${INPUT} mt-1.5 text-xs`}
                      placeholder="Lo que averiguaste (opcional)"
                      defaultValue={q.respuesta ?? ""}
                      onBlur={(e) =>
                        e.target.value !== (q.respuesta ?? "") &&
                        cambiar([{ op: "marcarPregunta", sesionId: s.id, preguntaId: q.id, hecha: true, respuesta: e.target.value }])
                      }
                    />
                  )}
                </li>
              ))}
            </ol>
            <Agregar placeholder="Agregar una pregunta…" ocupado={ocupado} onAgregar={(texto) => cambiar([{ op: "agregarPregunta", sesionId: s.id, texto }])} />
          </div>
        );
      })}
      <Agregar placeholder="Agregar una sesión (título)…" ocupado={ocupado} onAgregar={(titulo) => cambiar([{ op: "agregarSesion", titulo }])} />
    </div>
  );
}

// ── Personas ─────────────────────────────────────────────────────────────────

function Personas({ v, ocupado, cambiar }: { v: VistaDeLaGuia; ocupado: boolean; cambiar: Cambiar }) {
  const [nombre, setNombre] = useState("");
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {v.contenido.personas.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
            <span className="text-sm font-medium text-fg">{p.nombre}</span>
            <select
              className="rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-fg"
              value={p.rol ?? ""}
              disabled={ocupado}
              onChange={(e) => cambiar([{ op: "editar", lista: "personas", id: p.id, campos: { rol: e.target.value || null } }])}
            >
              <option value="">Rol sin definir</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_DEL_ROL[r]}
                </option>
              ))}
            </select>
            <button
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.confirmado ? "border-success-line bg-success-surface text-success-ink" : "border-warn-line bg-warn-surface text-warn-ink"}`}
              disabled={ocupado}
              onClick={() => cambiar([{ op: "editar", lista: "personas", id: p.id, campos: { confirmado: !p.confirmado } }])}
              title="¿El rol está confirmado con el cliente?"
            >
              {p.confirmado ? "Confirmado" : "⚠ Sin confirmar"}
            </button>
            {p.sabe && <span className="w-full text-xs text-fg-secondary">{p.sabe}</span>}
            <span className="flex-1" />
            <button className="text-xs text-fg-muted hover:text-danger-ink" disabled={ocupado} onClick={() => cambiar([{ op: "quitar", lista: "personas", id: p.id }])}>
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (nombre.trim() && (await cambiar([{ op: "agregarPersona", nombre }]))) setNombre("");
        }}
      >
        <input className={INPUT} placeholder="Nombre o rol…" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <button className={BTN} disabled={ocupado || !nombre.trim()} type="submit">
          Agregar persona
        </button>
      </form>
    </div>
  );
}
