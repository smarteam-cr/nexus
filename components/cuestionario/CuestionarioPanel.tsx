"use client";

/**
 * components/cuestionario/CuestionarioPanel.tsx — los cuestionarios previos, del lado del CSE.
 *
 * Vive dentro de Exploración. Desde el 2026-10-02 (pedido de Elías) se organiza por PERSONA:
 *   1. Las personas del cliente, cada una con UN enlace que le muestra todos sus cuestionarios.
 *   2. Cada persona puede tener un cuestionario de cada tipo: el TÁCTICO (métricas y operación, por
 *      hubs, editable) y el de la ESCALA (sale de la escala publicada; no se edita a mano).
 *   3. «Comparar»: quién respondió qué, dónde se contradicen dos personas y qué está enviado frente a
 *      lo que solo está en borrador (components/cuestionario/CuestionarioComparar.tsx).
 *
 * Toda edición de estructura viaja como OPERACIÓN (lib/cuestionario/operaciones.ts): las reglas (las
 * 7 preguntas de etapa no se tocan, una pestaña enviada no se edita) valen igual para cualquiera que
 * edite. El cuestionario NUNCA es obligatorio para avanzar el proyecto.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/Toast";
import { porcentaje } from "@/lib/cuestionario/avance";
import type { Comparacion } from "@/lib/cuestionario/comparar";
import type { OperacionCuestionario } from "@/lib/cuestionario/operaciones";
import { PREGUNTAS_DE_ETAPA } from "@/lib/cuestionario/plantilla";
import type { CuestionarioVista, PersonaVista, PestanaVista } from "@/lib/cuestionario/servicio";
import { OPCION_NO_SE, TITULO_DEL_TIPO, type Pregunta, type Respuesta, type TipoDeCuestionario } from "@/lib/cuestionario/tipos";
import CuestionarioComparar from "./CuestionarioComparar";

interface Estado {
  personas: PersonaVista[];
  cuestionarios: CuestionarioVista[];
  comparacion: Comparacion | null;
  enlaces: Record<string, string>;
  publicable?: boolean;
  motivoNoPublicable?: string | null;
}

export const BTN =
  "px-2.5 py-1 rounded-lg text-xs font-semibold border border-line text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors disabled:opacity-50";
const BTN_PRIMARIO =
  "px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover transition-colors disabled:opacity-50";
/** Publicar / Ocultar: el mismo botón de borde que las superficies de «Acceso del cliente». */
const BTN_PUBLICAR =
  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const INPUT =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand";

export function fecha(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function OrigenChip({ r }: { r: Respuesta }) {
  const txt =
    r.origen === "prellenado"
      ? r.confirmada
        ? "Prellenada · confirmada"
        : "Prellenada · sin confirmar"
      : r.origen === "cse"
        ? "Cargada por el CSE"
        : r.origen === "conversacion"
          ? "De la conversación"
          : "Del cliente";
  const tono =
    r.origen === "prellenado" && !r.confirmada
      ? "bg-warn-surface text-warn-ink border-warn-line"
      : r.origen === "cliente" || r.confirmada
        ? "bg-success-surface text-success-ink border-success-line"
        : "bg-surface-muted text-fg-muted border-line";
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tono}`}>{txt}</span>;
}

/** El valor legible: en opción múltiple, el texto de la opción elegida (el nivel solo lo ve el CSE). */
function textoDeLaRespuesta(q: Pick<Pregunta, "opciones"> | undefined, r: Respuesta): string {
  if (!q?.opciones) return r.valor;
  if (r.valor === OPCION_NO_SE) return "No lo sabe";
  return q.opciones.find((o) => o.id === r.valor)?.texto ?? r.valor;
}

function RespuestaVista({ q, r }: { q?: Pregunta; r: Respuesta | undefined }) {
  if (!r || (!r.valor.trim() && !r.enSesion)) {
    return <p className="text-xs italic text-fg-muted">Sin respuesta todavía.</p>;
  }
  const nivel = q?.opciones?.find((o) => o.id === r.valor)?.nivel ?? (q?.opciones && r.valor === OPCION_NO_SE ? "D" : null);
  return (
    <div className="mt-1 rounded-lg bg-surface-muted px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <OrigenChip r={r} />
        {nivel && (
          <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-fg-secondary" title="Nivel de la escala (solo lo ve el equipo)">
            Nivel {nivel}
          </span>
        )}
        {r.enSesion && (
          <span className="rounded-full border border-info-line bg-info-surface px-2 py-0.5 text-[10px] font-semibold text-info-ink">
            Prefiere verlo en sesión
          </span>
        )}
      </div>
      {r.valor.trim() && <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg">{textoDeLaRespuesta(q, r)}</p>}
    </div>
  );
}

export default function CuestionarioPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<"personas" | "comparar">("personas");
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/cuestionario`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error ?? "No se pudieron cargar los cuestionarios.");
      return;
    }
    setEstado(data);
  }, [projectId, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Mientras la IA prellena (corre fuera del request), se relee cada pocos segundos.
  const prellenando = !!estado?.cuestionarios.some((c) => c.prellenado.enCurso);
  useEffect(() => {
    if (!prellenando) return;
    const t = setInterval(() => void cargar(), 4000);
    return () => clearInterval(t);
  }, [prellenando, cargar]);

  const accion = useCallback(
    async (body: Record<string, unknown>, ok?: string): Promise<boolean> => {
      setOcupado(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/cuestionario`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.error ?? "No se pudo guardar el cambio.");
          return false;
        }
        setEstado((prev) => ({ ...(prev as Estado), ...data }));
        if (ok) toast.success(ok);
        return true;
      } finally {
        setOcupado(false);
      }
    },
    [projectId, toast],
  );

  const cuestionario = useMemo(
    () => estado?.cuestionarios.find((c) => c.id === abierto) ?? null,
    [estado, abierto],
  );

  if (!estado) {
    return <div className="py-10 text-center text-sm text-fg-muted">Cargando los cuestionarios…</div>;
  }

  const publicable = estado.publicable !== false;
  const sinPersona = estado.cuestionarios.filter((c) => !c.personaId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-fg">Cuestionarios previos</h3>
          <p className="mt-0.5 text-xs text-fg-muted">
            Cada persona del cliente recibe UN enlace con sus cuestionarios. No son obligatorios para avanzar: sirven para
            llegar a las sesiones sabiendo qué preguntar.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line p-0.5">
          {(["personas", "comparar"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                vista === v ? "bg-surface-active text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {v === "personas" ? "Por persona" : "Comparar"}
            </button>
          ))}
        </div>
      </div>

      {!publicable && estado.motivoNoPublicable && (
        <p className="rounded-xl border border-warn-line bg-warn-surface px-3 py-2 text-xs text-warn-ink">{estado.motivoNoPublicable}</p>
      )}

      {vista === "comparar" ? (
        <CuestionarioComparar
          comparacion={estado.comparacion}
          onAbrir={(id) => {
            setAbierto(id);
            setVista("personas");
          }}
        />
      ) : (
        <>
          <Personas
            personas={estado.personas}
            cuestionarios={estado.cuestionarios}
            abierto={abierto}
            ocupado={ocupado}
            publicable={publicable}
            onAbrir={setAbierto}
            onAccion={accion}
          />
          {sinPersona.length > 0 && (
            <section className="rounded-2xl border border-warn-line bg-warn-surface p-4">
              <p className="text-xs text-warn-ink">
                {sinPersona.length === 1 ? "Hay un cuestionario sin persona" : `Hay ${sinPersona.length} cuestionarios sin persona`}: no se
                le muestran a nadie hasta que se los asignes.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sinPersona.map((c) => (
                  <button key={c.id} className={BTN} onClick={() => setAbierto(c.id)}>
                    {c.titulo}
                  </button>
                ))}
              </div>
            </section>
          )}
          {cuestionario && (
            <DetalleDelCuestionario
              key={cuestionario.id}
              c={cuestionario}
              personas={estado.personas}
              enlaces={estado.enlaces}
              ocupado={ocupado}
              publicable={publicable}
              onAccion={accion}
              onCerrar={() => setAbierto(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Personas ─────────────────────────────────────────────────────────────────

function EstadoChip({ c }: { c: CuestionarioVista }) {
  const enviadas = c.pestanas.filter((p) => p.enviadaAt).length;
  const txt = c.cerradoAt
    ? "cerrado"
    : !c.publicadoAt
      ? "sin publicar"
      : enviadas === c.pestanas.length && c.pestanas.length > 0
        ? "enviado"
        : `${enviadas}/${c.pestanas.length} enviadas`;
  const tono = c.cerradoAt
    ? "bg-surface-muted text-fg-muted border-line"
    : c.publicadoAt
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${tono}`}>{txt}</span>;
}

function Personas({
  personas,
  cuestionarios,
  abierto,
  ocupado,
  publicable,
  onAbrir,
  onAccion,
}: {
  personas: PersonaVista[];
  cuestionarios: CuestionarioVista[];
  abierto: string | null;
  ocupado: boolean;
  publicable: boolean;
  onAbrir: (id: string) => void;
  onAccion: (b: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const toast = useToast();
  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [email, setEmail] = useState("");
  const activas = personas.filter((p) => !p.revocado);

  const copiar = async (p: PersonaVista) => {
    const url = `${window.location.origin}${p.ruta}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Enlace de ${p.nombre} copiado.`);
    } catch {
      toast.info(url, { duration: 0 });
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h4 className="text-sm font-semibold text-fg">Personas del cliente</h4>
      <p className="mt-0.5 text-xs text-fg-muted">
        Cada persona tiene un enlace y contesta solo sus cuestionarios: lo que escribe es suyo y lo prellenado lo confirma
        ella.
      </p>
      {activas.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {activas.map((p) => {
            const suyos = cuestionarios.filter((c) => c.personaId === p.id);
            const publicados = suyos.filter((c) => c.publicadoAt);
            const faltan = (["tactico", "escala"] as TipoDeCuestionario[]).filter((t) => !suyos.some((c) => c.tipo === t));
            return (
              <li key={p.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg">
                      {p.nombre}
                      {p.cargo && <span className="font-normal text-fg-muted"> · {p.cargo}</span>}
                    </div>
                    <div className="text-[11px] text-fg-muted">{p.ultimoUsoAt ? `Entró ${fecha(p.ultimoUsoAt)}` : "Todavía no entró"}</div>
                  </div>
                  <div className="flex gap-2">
                    <CopiarEnlace
                      p={p}
                      bloqueo={suyos.length === 0 ? "sin-cuestionarios" : publicados.length === 0 ? "sin-publicar" : null}
                      onCopiar={() => copiar(p)}
                    />
                    <button
                      className={BTN}
                      disabled={ocupado}
                      onClick={() => {
                        if (window.confirm(`¿Revocar el enlace de ${p.nombre}? Lo que ya contestó se conserva.`)) {
                          void onAccion({ accion: "revocar_persona", personaId: p.id }, "Enlace revocado.");
                        }
                      }}
                    >
                      Revocar
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {suyos.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onAbrir(c.id)}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        abierto === c.id ? "border-brand bg-surface-active text-fg" : "border-line text-fg-secondary hover:bg-surface-hover"
                      }`}
                    >
                      {c.titulo}
                      <EstadoChip c={c} />
                    </button>
                  ))}
                  {faltan.map((t) => (
                    <button
                      key={t}
                      className={BTN}
                      disabled={ocupado || !publicable}
                      onClick={() =>
                        onAccion({ accion: "crear_cuestionario", tipo: t, personaId: p.id }, `${TITULO_DEL_TIPO[t]} armado para ${p.nombre}.`)
                      }
                    >
                      + {TITULO_DEL_TIPO[t]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!nombre.trim()) return;
          const ok = await onAccion({ accion: "crear_persona", nombre, cargo: cargo || null, email: email || null }, "Persona agregada.");
          if (ok) {
            setNombre("");
            setCargo("");
            setEmail("");
          }
        }}
      >
        <input className={INPUT} placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className={INPUT} placeholder="Cargo (opcional)" value={cargo} onChange={(e) => setCargo(e.target.value)} />
        <input className={INPUT} placeholder="Correo (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className={BTN_PRIMARIO} disabled={ocupado || !nombre.trim() || !publicable} type="submit">
          Agregar persona
        </button>
      </form>
    </section>
  );
}

/**
 * «Copiar enlace» solo funciona si el enlace va a abrir algo. Sin cuestionarios o sin ninguno publicado
 * el botón se ve apagado y, al tocarlo, explica por qué en un aviso — un botón muerto que no dice nada
 * se lee como un error. El aviso va por portal a <body>: el panel del proyecto recorta lo que flota.
 */
function CopiarEnlace({
  p,
  bloqueo,
  onCopiar,
}: {
  p: PersonaVista;
  bloqueo: "sin-cuestionarios" | "sin-publicar" | null;
  onCopiar: () => void;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const cerrar = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-aviso-enlace]")) setPos(null);
    };
    const alMover = () => setPos(null);
    document.addEventListener("mousedown", cerrar);
    window.addEventListener("scroll", alMover, true);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      window.removeEventListener("scroll", alMover, true);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={boton}
        className={`${BTN} ${bloqueo ? "cursor-not-allowed opacity-50" : ""}`}
        aria-disabled={!!bloqueo}
        data-aviso-enlace
        onClick={() => {
          if (!bloqueo) return onCopiar();
          const b = boton.current?.getBoundingClientRect();
          if (b) setPos(pos ? null : { top: b.bottom + 6, left: Math.max(8, b.right - 288) });
        }}
      >
        Copiar enlace
      </button>
      {pos &&
        createPortal(
          <div
            data-aviso-enlace
            role="dialog"
            className="fixed z-[90] w-72 rounded-xl border border-line bg-surface p-3 shadow-xl"
            style={{ top: pos.top, left: pos.left }}
          >
            <p className="text-sm font-semibold text-fg">
              {bloqueo === "sin-cuestionarios" ? `${p.nombre} no tiene cuestionarios` : "Primero publica un cuestionario"}
            </p>
            <p className="mt-1 text-xs text-fg-secondary">
              {bloqueo === "sin-cuestionarios"
                ? "Ármale un cuestionario táctico o de escala: sin ninguno, el enlace no tendría nada que mostrar."
                : `Mientras ninguno de sus cuestionarios esté publicado, el enlace de ${p.nombre} no abre nada. Abre el cuestionario y aprieta «Publicar».`}
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}

// ── Un cuestionario ──────────────────────────────────────────────────────────

function DetalleDelCuestionario({
  c,
  personas,
  enlaces,
  ocupado,
  publicable,
  onAccion,
  onCerrar,
}: {
  c: CuestionarioVista;
  personas: PersonaVista[];
  enlaces: Record<string, string>;
  ocupado: boolean;
  publicable: boolean;
  onAccion: (b: Record<string, unknown>, ok?: string) => Promise<boolean>;
  onCerrar: () => void;
}) {
  const [activa, setActiva] = useState<string | null>(null);
  const pestana = c.pestanas.find((p) => p.key === activa) ?? c.pestanas[0] ?? null;
  const editable = c.tipo === "tactico";
  const persona = personas.find((p) => p.id === c.personaId) ?? null;
  const ops = (lista: OperacionCuestionario[], ok?: string) => onAccion({ accion: "operaciones", cuestionarioId: c.id, ops: lista }, ok);
  const total = c.pestanas.reduce((n, p) => n + p.avance.total, 0);
  const avance = total ? Math.round((c.pestanas.reduce((n, p) => n + p.avance.contestadas, 0) / total) * 100) : 0;

  const estado = c.cerradoAt ? "cerrado" : c.publicadoAt ? "publicado" : "sin publicar";
  const tono = c.cerradoAt
    ? "bg-surface-muted text-fg-muted border-line"
    : c.publicadoAt
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : "bg-amber-500/10 text-amber-600 border-amber-500/20";

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-fg">{c.titulo}</h4>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tono}`}>{estado}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <span>De</span>
            <select
              className="rounded-lg border border-line bg-surface px-2 py-0.5 text-xs text-fg"
              value={c.personaId ?? ""}
              disabled={ocupado || !!c.cerradoAt}
              onChange={(e) => onAccion({ accion: "asignar_persona", cuestionarioId: c.id, personaId: e.target.value || null })}
            >
              <option value="">Sin persona</option>
              {personas
                .filter((p) => !p.revocado || p.id === c.personaId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
            {c.publicadoAt && <span>· contestado al {avance}%</span>}
            {c.escala?.version && <span>· escala {c.escala.version} (congelada al armarlo)</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!c.cerradoAt &&
            (c.publicadoAt ? (
              <button
                className={`${BTN_PUBLICAR} border-amber-500/30 text-amber-600 hover:bg-amber-500/10`}
                disabled={ocupado}
                title="El enlace de la persona deja de mostrar este cuestionario hasta que lo vuelvas a publicar"
                onClick={() => onAccion({ accion: "publicar", cuestionarioId: c.id, publicado: false }, "Cuestionario oculto.")}
              >
                Ocultar
              </button>
            ) : (
              <button
                className={`${BTN_PUBLICAR} border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10`}
                disabled={ocupado || !publicable || !persona}
                title={!persona ? "Asígnale una persona antes de publicarlo" : "La persona lo ve en su enlace"}
                onClick={() =>
                  onAccion({ accion: "publicar", cuestionarioId: c.id, publicado: true }, `Publicado: ${persona?.nombre ?? "la persona"} ya lo ve en su enlace.`)
                }
              >
                Publicar
              </button>
            ))}
          {c.publicadoAt && (
            <button
              className={BTN}
              disabled={ocupado}
              onClick={() =>
                onAccion(
                  { accion: "cerrar", cuestionarioId: c.id, cerrado: !c.cerradoAt },
                  c.cerradoAt ? "El cuestionario volvió a abrirse." : "Cuestionario cerrado: queda en solo lectura.",
                )
              }
            >
              {c.cerradoAt ? "Reabrir" : "Cerrar"}
            </button>
          )}
          {!c.publicadoAt && (
            <button
              className={BTN}
              disabled={ocupado}
              onClick={() => {
                if (window.confirm(`¿Borrar «${c.titulo}»? Solo se puede si nadie contestó nada.`)) {
                  void onAccion({ accion: "eliminar_cuestionario", cuestionarioId: c.id }, "Cuestionario borrado.").then((ok) => {
                    if (ok) onCerrar();
                  });
                }
              }}
            >
              Borrar
            </button>
          )}
          <button className={BTN} onClick={onCerrar} title="Cerrar el detalle">
            ✕
          </button>
        </div>
      </div>

      {c.tipo === "tactico" && <Prellenado c={c} ocupado={ocupado} onAccion={onAccion} />}
      {c.tipo === "escala" && (
        <p className="rounded-xl border border-line bg-surface-muted px-3 py-2 text-xs text-fg-secondary">
          Sale de la escala publicada: una pregunta por dimensión de las áreas contratadas, con una opción por nivel y «No lo sé».
          El nivel lo calcula Nexus; la persona nunca ve niveles ni códigos. Lo que ya ubicó el diagnóstico preliminar llega
          prellenado para que lo confirme.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          {c.pestanas.map((p) => {
            const pct = porcentaje(p.avance);
            const sel = p.key === pestana?.key;
            return (
              <button
                key={p.key}
                onClick={() => setActiva(p.key)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                  sel ? "border-brand bg-surface-active" : "border-line bg-surface hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-fg">{p.titulo}</span>
                  {p.enviadaAt ? (
                    <span className="text-[10px] font-semibold text-success-ink">Enviada</span>
                  ) : (
                    <span className="text-[10px] text-fg-muted">{p.avance.sinEtapas ? "Sin etapas" : `${pct}%`}</span>
                  )}
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full bg-brand" style={{ width: `${p.enviadaAt ? 100 : pct}%` }} />
                </div>
              </button>
            );
          })}
          {editable && <AgregarPestana disponibles={c.disponibles} ocupado={ocupado || !!c.cerradoAt} onOps={ops} />}
        </nav>

        {pestana && (
          <DetallePestana
            key={pestana.key}
            p={pestana}
            editable={editable}
            enlaces={enlaces}
            ocupado={ocupado}
            cerrado={!!c.cerradoAt}
            esPrimera={c.pestanas[0]?.key === pestana.key}
            esUltima={c.pestanas[c.pestanas.length - 1]?.key === pestana.key}
            onOps={ops}
            onAccion={onAccion}
          />
        )}
      </div>

      <Registro c={c} />
    </section>
  );
}

function Prellenado({
  c,
  ocupado,
  onAccion,
}: {
  c: CuestionarioVista;
  ocupado: boolean;
  onAccion: (b: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const prellenadas = c.pestanas.reduce(
    (n, p) => n + Object.values(p.respuestas).filter((r) => r.origen === "prellenado").length,
    0,
  );
  const sinConfirmar = c.pestanas.reduce(
    (n, p) => n + Object.values(p.respuestas).filter((r) => r.origen === "prellenado" && !r.confirmada).length,
    0,
  );
  if (c.cerradoAt) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted px-3 py-2">
      <div className="text-xs text-fg-secondary">
        {c.prellenado.enCurso ? (
          <span>✨ Nexus está leyendo el handoff y el kickoff para contestar lo que ya sabemos…</span>
        ) : c.prellenado.error ? (
          <span className="text-danger-ink">No se pudo prellenar: {c.prellenado.error}</span>
        ) : prellenadas > 0 ? (
          <span>
            ✨ {prellenadas} respuestas prellenadas con lo que ya sabemos
            {c.publicadoAt ? ` · ${sinConfirmar} sin confirmar por la persona` : ". La persona las verá para confirmar o corregir."}
          </span>
        ) : c.prellenado.at ? (
          <span>✨ El handoff y el kickoff no contestaban ninguna pregunta pendiente.</span>
        ) : (
          <span>✨ Nexus puede contestar de antemano lo que ya dice el handoff y el kickoff; la persona solo confirma.</span>
        )}
      </div>
      <button
        className={BTN}
        disabled={ocupado || c.prellenado.enCurso}
        onClick={() => onAccion({ accion: "prellenar", cuestionarioId: c.id }, "Prellenando… tarda menos de un minuto.")}
        title="Solo contesta preguntas vacías: nunca pisa lo que ya escribió la persona"
      >
        {c.prellenado.enCurso ? "Prellenando…" : prellenadas > 0 || c.prellenado.at ? "Volver a prellenar lo vacío" : "Prellenar con lo que ya sabemos"}
      </button>
    </div>
  );
}

function AgregarPestana({
  disponibles,
  ocupado,
  onOps,
}: {
  disponibles: Array<{ key: string; titulo: string }>;
  ocupado: boolean;
  onOps: (ops: OperacionCuestionario[], ok?: string) => Promise<boolean>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [etapas, setEtapas] = useState(false);
  if (!abierto) {
    return (
      <button className={`${BTN} w-full`} disabled={ocupado} onClick={() => setAbierto(true)}>
        + Agregar pestaña
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      {disponibles.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">De la plantilla</p>
          {disponibles.map((d) => (
            <button
              key={d.key}
              className="block w-full rounded-lg px-2 py-1 text-left text-sm text-fg-secondary hover:bg-surface-hover hover:text-fg"
              disabled={ocupado}
              onClick={async () => {
                if (await onOps([{ op: "agregar_pestana", desdePlantilla: d.key }], `«${d.titulo}» agregada.`)) setAbierto(false);
              }}
            >
              + {d.titulo}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">Nueva</p>
      <input className={INPUT} placeholder="Título de la pestaña" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <label className="flex items-center gap-2 text-xs text-fg-secondary">
        <input type="checkbox" checked={etapas} onChange={(e) => setEtapas(e.target.checked)} />
        Lleva etapas de un proceso (con las 7 preguntas fijas por etapa)
      </label>
      <div className="flex gap-2">
        <button
          className={BTN_PRIMARIO}
          disabled={ocupado || !titulo.trim()}
          onClick={async () => {
            const ok = await onOps([{ op: "agregar_pestana", titulo, tipo: etapas ? "etapas" : "normal" }], "Pestaña agregada.");
            if (ok) {
              setTitulo("");
              setAbierto(false);
            }
          }}
        >
          Crear
        </button>
        <button className={BTN} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function DetallePestana({
  p,
  editable,
  enlaces,
  ocupado,
  cerrado,
  esPrimera,
  esUltima,
  onOps,
  onAccion,
}: {
  p: PestanaVista;
  editable: boolean;
  enlaces: Record<string, string>;
  ocupado: boolean;
  cerrado: boolean;
  esPrimera: boolean;
  esUltima: boolean;
  onOps: (ops: OperacionCuestionario[], ok?: string) => Promise<boolean>;
  onAccion: (b: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const bloqueada = !!p.enviadaAt || cerrado || !editable;
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [titulo, setTitulo] = useState(p.titulo);
  const [nueva, setNueva] = useState("");

  return (
    <div className="min-w-0 space-y-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editandoTitulo ? (
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await onOps([{ op: "editar_pestana", pestana: p.key, titulo }])) setEditandoTitulo(false);
              }}
            >
              <input className={INPUT} value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
              <button className={BTN_PRIMARIO} disabled={ocupado} type="submit">
                Guardar
              </button>
            </form>
          ) : (
            <h4 className="text-base font-semibold text-fg">
              {p.titulo}
              {!bloqueada && (
                <button className="ml-2 text-xs font-normal text-fg-muted hover:text-fg" onClick={() => setEditandoTitulo(true)}>
                  Renombrar
                </button>
              )}
            </h4>
          )}
          {p.descripcion && <p className="mt-0.5 text-xs text-fg-muted">{p.descripcion}</p>}
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <button className={BTN} disabled={ocupado || esPrimera} onClick={() => onOps([{ op: "mover_pestana", pestana: p.key, direccion: "arriba" }])} title="Subir">
              ↑
            </button>
            <button className={BTN} disabled={ocupado || esUltima} onClick={() => onOps([{ op: "mover_pestana", pestana: p.key, direccion: "abajo" }])} title="Bajar">
              ↓
            </button>
            {!bloqueada && (
              <button
                className={BTN}
                disabled={ocupado}
                onClick={() => {
                  if (window.confirm(`¿Quitar la pestaña «${p.titulo}»?`)) void onOps([{ op: "quitar_pestana", pestana: p.key }], "Pestaña quitada.");
                }}
              >
                Quitar
              </button>
            )}
          </div>
        )}
      </div>

      {p.enviadaAt && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success-line bg-success-surface px-3 py-2">
          <p className="text-xs text-success-ink">
            La envió el {fecha(p.enviadaAt)}. Está bloqueada: si pide cambios, aparecen en el registro.
          </p>
          {!cerrado && (
            <button
              className={BTN}
              disabled={ocupado}
              onClick={() => {
                const motivo = window.prompt("¿Por qué la reabres? (la persona no lo ve; queda en el registro)") ?? undefined;
                if (motivo === undefined) return;
                void onAccion({ accion: "reabrir_pestana", pestanaId: p.id, motivo }, "Sección reabierta: la persona ya puede editarla.");
              }}
            >
              Reabrir para la persona
            </button>
          )}
        </div>
      )}

      <ol className="space-y-3">
        {p.preguntas.map((q, i) => (
          <PreguntaFila
            key={q.id}
            q={q}
            numero={p.preguntas.slice(0, i + 1).filter((x) => !x.opcional).length}
            r={p.respuestas[q.id]}
            bloqueada={bloqueada}
            ocupado={ocupado}
            primera={i === 0}
            ultima={i === p.preguntas.length - 1}
            pestana={p.key}
            onOps={onOps}
          />
        ))}
      </ol>

      {!bloqueada && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!nueva.trim()) return;
            if (await onOps([{ op: "agregar_pregunta", pestana: p.key, texto: nueva }], "Pregunta agregada.")) setNueva("");
          }}
        >
          <input className={INPUT} placeholder="Agregar una pregunta…" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          <button className={BTN_PRIMARIO} disabled={ocupado || !nueva.trim()} type="submit">
            Agregar
          </button>
        </form>
      )}

      {p.tipo === "etapas" && <EtapasVista p={p} />}

      {p.contextoAdicional?.trim() && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Contexto adicional</p>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-sm text-fg">{p.contextoAdicional}</p>
        </div>
      )}

      {p.adjuntos.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Documentos</p>
          <ul className="mt-1 space-y-1">
            {p.adjuntos.map((a) => (
              <li key={a.id} className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
                {enlaces[a.id] ? (
                  <a className="font-medium text-brand hover:underline" href={enlaces[a.id]} target="_blank" rel="noreferrer">
                    {a.titulo}
                  </a>
                ) : (
                  <span className="font-medium text-fg">{a.titulo}</span>
                )}
                <p className="text-xs text-fg-secondary">{a.descripcion ?? "Sin descripción"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PreguntaFila({
  q,
  pestana,
  numero,
  r,
  bloqueada,
  ocupado,
  primera,
  ultima,
  onOps,
}: {
  q: Pregunta;
  pestana: string;
  numero: number;
  r: Respuesta | undefined;
  bloqueada: boolean;
  ocupado: boolean;
  primera: boolean;
  ultima: boolean;
  onOps: (ops: OperacionCuestionario[], ok?: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(q.texto);
  const [categoria, setCategoria] = useState(q.categoria);
  const [ejemplo, setEjemplo] = useState(q.ejemplo ?? "");

  if (q.opcional) {
    return (
      <li className="-mt-1 pl-3">
        <p className="text-xs text-fg-muted">{q.texto}</p>
        {r?.valor?.trim() ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-fg">{r.valor}</p> : <p className="text-xs italic text-fg-muted">—</p>}
      </li>
    );
  }

  if (editando) {
    return (
      <li className="space-y-2 rounded-xl border border-brand/50 p-3">
        <input className={INPUT} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Categoría" />
        <textarea className={INPUT} rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <textarea className={INPUT} rows={2} value={ejemplo} onChange={(e) => setEjemplo(e.target.value)} placeholder="Ejemplo de respuesta esperada (opcional)" />
        <div className="flex gap-2">
          <button
            className={BTN_PRIMARIO}
            disabled={ocupado || !texto.trim()}
            onClick={async () => {
              if (await onOps([{ op: "editar_pregunta", pestana, pregunta: q.id, texto, categoria, ejemplo: ejemplo || null }])) setEditando(false);
            }}
          >
            Guardar
          </button>
          <button className={BTN} onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
            <span className="font-semibold">{numero}.</span>
            {q.categoria && <span>{q.categoria}</span>}
            {q.momento === "sesion" && (
              <span className="rounded-full border border-info-line bg-info-surface px-1.5 text-[10px] font-semibold text-info-ink">
                Mejor en sesión
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-medium text-fg">{q.texto}</p>
          {q.ejemplo && <p className="mt-0.5 text-xs text-fg-muted">Ej.: {q.ejemplo}</p>}
        </div>
        {!bloqueada && (
          <div className="flex shrink-0 gap-1">
            <button className="px-1 text-xs text-fg-muted hover:text-fg disabled:opacity-40" disabled={ocupado || primera} onClick={() => onOps([{ op: "mover_pregunta", pestana, pregunta: q.id, direccion: "arriba" }])} title="Subir">
              ↑
            </button>
            <button className="px-1 text-xs text-fg-muted hover:text-fg disabled:opacity-40" disabled={ocupado || ultima} onClick={() => onOps([{ op: "mover_pregunta", pestana, pregunta: q.id, direccion: "abajo" }])} title="Bajar">
              ↓
            </button>
            <button
              className="px-1 text-xs text-fg-muted hover:text-fg"
              disabled={ocupado}
              onClick={() => onOps([{ op: "editar_pregunta", pestana, pregunta: q.id, momento: q.momento === "sesion" ? "previo" : "sesion" }])}
              title={q.momento === "sesion" ? "Pedirla por escrito" : "Marcarla para conversar en sesión"}
            >
              {q.momento === "sesion" ? "Escrita" : "Sesión"}
            </button>
            <button className="px-1 text-xs text-fg-muted hover:text-fg" onClick={() => setEditando(true)}>
              Editar
            </button>
            <button
              className="px-1 text-xs text-fg-muted hover:text-danger-ink"
              disabled={ocupado}
              onClick={() => {
                if (window.confirm("¿Quitar esta pregunta?")) void onOps([{ op: "quitar_pregunta", pestana, pregunta: q.id }], "Pregunta quitada.");
              }}
            >
              Quitar
            </button>
          </div>
        )}
      </div>
      <RespuestaVista q={q} r={r} />
    </li>
  );
}

function EtapasVista({ p }: { p: PestanaVista }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface-muted px-3 py-2">
        <p className="text-xs font-semibold text-fg">Etapas del proceso</p>
        <p className="mt-0.5 text-xs text-fg-muted">
          La persona agrega una etapa por cada paso. Cada etapa responde siempre estas 7 preguntas (fijas: son la base
          de la definición de procesos de Planificación): {PREGUNTAS_DE_ETAPA.map((q) => q.texto.replace(/[¿?]/g, "")).join(" · ")}.
        </p>
      </div>
      {p.etapas.length === 0 ? (
        <p className="text-xs italic text-fg-muted">Todavía no agregó etapas.</p>
      ) : (
        p.etapas.map((e, i) => (
          <details key={e.id} className="rounded-xl border border-line p-3" open={i === 0}>
            <summary className="cursor-pointer text-sm font-semibold text-fg">
              Etapa {i + 1}: {e.nombre || "(sin nombre)"}
            </summary>
            <ol className="mt-2 space-y-2">
              {PREGUNTAS_DE_ETAPA.map((q) => (
                <li key={q.id}>
                  <p className="text-xs font-medium text-fg-secondary">{q.texto}</p>
                  <RespuestaVista r={e.respuestas[q.id]} />
                </li>
              ))}
            </ol>
          </details>
        ))
      )}
    </div>
  );
}

function Registro({ c }: { c: CuestionarioVista }) {
  if (c.cambios.length === 0) return null;
  return (
    <section className="rounded-xl border border-line p-3">
      <h4 className="text-sm font-semibold text-fg">Registro</h4>
      <ul className="mt-2 space-y-2">
        {c.cambios.map((x) => (
          <li key={x.id} className="text-sm">
            <span className="text-xs text-fg-muted">{fecha(x.createdAt)} · </span>
            {x.tipo === "ENVIO" && (
              <span className="text-fg">
                <b>{x.persona ?? "La persona"}</b> envió «{x.pestanaTitulo ?? "una sección"}».
              </span>
            )}
            {x.tipo === "SOLICITUD" && (
              <span className="text-fg">
                <b>{x.persona ?? "La persona"}</b> pidió un cambio en «{x.pestanaTitulo ?? "una sección"}»:{" "}
                <span className="text-fg-secondary">{x.mensaje}</span>
              </span>
            )}
            {x.tipo === "REAPERTURA" && (
              <span className="text-fg">
                {x.autorEmail ?? "El equipo"} reabrió «{x.pestanaTitulo ?? "una sección"}»
                {x.mensaje ? <span className="text-fg-secondary">: {x.mensaje}</span> : "."}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
