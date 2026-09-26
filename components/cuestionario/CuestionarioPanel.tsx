"use client";

/**
 * components/cuestionario/CuestionarioPanel.tsx — el cuestionario previo, del lado del CSE.
 *
 * Vive dentro de Exploración («4A Cuestionario previo» / «4B Informe de exploración»): es lo que el
 * CSE manda al cierre del kickoff y lo que después alimenta el informe.
 *
 * Tres cosas en una pantalla:
 *   1. ARMARLO: las pestañas salen de los hubs del proyecto; el CSE edita, suma o quita preguntas.
 *      Toda edición viaja como OPERACIÓN (lib/cuestionario/operaciones.ts), la misma forma que va a
 *      usar el chat — así las reglas (las 7 preguntas de etapa no se tocan, una pestaña enviada no
 *      se edita) valen igual para los dos.
 *   2. REPARTIRLO: cada pestaña tiene UN responsable, y cada responsable su propio enlace.
 *   3. SEGUIRLO: avance por pestaña, lo que contestó cada uno (con su origen), sus documentos y el
 *      registro de envíos, cambios pedidos y reaperturas.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { porcentaje } from "@/lib/cuestionario/avance";
import type { OperacionCuestionario } from "@/lib/cuestionario/operaciones";
import { PREGUNTAS_DE_ETAPA } from "@/lib/cuestionario/plantilla";
import type { CuestionarioVista, PestanaVista, ResponsableVista } from "@/lib/cuestionario/servicio";
import type { Pregunta, Respuesta } from "@/lib/cuestionario/tipos";

interface Estado {
  cuestionario: CuestionarioVista | null;
  enlaces: Record<string, string>;
  publicable?: boolean;
  motivoNoPublicable?: string | null;
}

const BTN =
  "px-2.5 py-1 rounded-lg text-xs font-semibold border border-line text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors disabled:opacity-50";
const BTN_PRIMARIO =
  "px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover transition-colors disabled:opacity-50";
const INPUT =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand";

function fecha(iso: string | null): string {
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

function RespuestaVista({ r }: { r: Respuesta | undefined }) {
  if (!r || (!r.valor.trim() && !r.enSesion)) {
    return <p className="text-xs italic text-fg-muted">Sin respuesta todavía.</p>;
  }
  return (
    <div className="mt-1 rounded-lg bg-surface-muted px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <OrigenChip r={r} />
        {r.enSesion && (
          <span className="rounded-full border border-info-line bg-info-surface px-2 py-0.5 text-[10px] font-semibold text-info-ink">
            Prefiere verlo en sesión
          </span>
        )}
      </div>
      {r.valor.trim() && <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg">{r.valor}</p>}
    </div>
  );
}

export default function CuestionarioPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [activa, setActiva] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/cuestionario`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error ?? "No se pudo cargar el cuestionario.");
      return;
    }
    setEstado(data);
  }, [projectId, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Mientras la IA prellena (corre fuera del request), se relee cada pocos segundos.
  const prellenando = !!estado?.cuestionario?.prellenado.enCurso;
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
        setEstado((prev) => ({ ...prev, ...data }));
        if (ok) toast.success(ok);
        return true;
      } finally {
        setOcupado(false);
      }
    },
    [projectId, toast],
  );

  const ops = useCallback(
    (lista: OperacionCuestionario[], ok?: string) => accion({ accion: "operaciones", ops: lista }, ok),
    [accion],
  );

  const c = estado?.cuestionario ?? null;
  const pestana = useMemo(
    () => c?.pestanas.find((p) => p.key === activa) ?? c?.pestanas[0] ?? null,
    [c, activa],
  );

  if (!estado) {
    return <div className="py-10 text-center text-sm text-fg-muted">Cargando el cuestionario…</div>;
  }

  if (!c) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-8 text-center">
        <h3 className="text-lg font-semibold text-fg">Cuestionario previo</h3>
        <p className="mt-2 text-sm text-fg-secondary">
          Lo que antes mandabas en un Google Sheets al cierre del kickoff. Nexus lo arma con una pestaña por cada hub
          del proyecto; tú lo ajustas, le asignas cada pestaña a una persona del cliente y cada una recibe su propio
          enlace. Lo que contesten alimenta el informe de exploración.
        </p>
        <button className={`${BTN_PRIMARIO} mt-5`} disabled={ocupado} onClick={() => accion({ accion: "generar" }, "Cuestionario armado.")}>
          Armar el cuestionario
        </button>
      </div>
    );
  }

  const responsablesActivos = c.responsables.filter((r) => !r.revocado);
  const totalContestadas = c.pestanas.reduce((n, p) => n + p.avance.contestadas, 0);
  const totalPreguntas = c.pestanas.reduce((n, p) => n + p.avance.total, 0);

  return (
    <div className="space-y-5">
      <Encabezado
        c={c}
        ocupado={ocupado}
        publicable={estado.publicable !== false}
        motivo={estado.motivoNoPublicable ?? null}
        avance={totalPreguntas ? Math.round((totalContestadas / totalPreguntas) * 100) : 0}
        onAccion={accion}
      />

      <Prellenado c={c} ocupado={ocupado} onAccion={accion} />

      <Responsables
        responsables={c.responsables}
        pestanas={c.pestanas}
        ocupado={ocupado}
        publicado={!!c.publicadoAt}
        onAccion={accion}
      />

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
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
                <div className="mt-1 truncate text-[11px] text-fg-muted">
                  {c.responsables.find((r) => r.id === p.responsableId)?.nombre ?? "Sin responsable"}
                </div>
              </button>
            );
          })}
          <AgregarPestana disponibles={c.disponibles} ocupado={ocupado || !!c.cerradoAt} onOps={ops} />
        </nav>

        {pestana && (
          <DetallePestana
            key={pestana.key}
            p={pestana}
            responsables={responsablesActivos}
            enlaces={estado.enlaces}
            ocupado={ocupado}
            cerrado={!!c.cerradoAt}
            esPrimera={c.pestanas[0]?.key === pestana.key}
            esUltima={c.pestanas[c.pestanas.length - 1]?.key === pestana.key}
            onOps={ops}
            onAccion={accion}
          />
        )}
      </div>

      <Registro c={c} />
    </div>
  );
}

function Encabezado({
  c,
  ocupado,
  publicable,
  motivo,
  avance,
  onAccion,
}: {
  c: CuestionarioVista;
  ocupado: boolean;
  publicable: boolean;
  motivo: string | null;
  avance: number;
  onAccion: (b: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const estado = c.cerradoAt ? "Cerrado" : c.publicadoAt ? "Enviado al cliente" : "Borrador";
  const tono = c.cerradoAt
    ? "bg-surface-muted text-fg-muted border-line"
    : c.publicadoAt
      ? "bg-success-surface text-success-ink border-success-line"
      : "bg-warn-surface text-warn-ink border-warn-line";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-fg">Cuestionario previo</h3>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tono}`}>{estado}</span>
        </div>
        <p className="mt-0.5 text-xs text-fg-muted">
          {c.publicadoAt
            ? `Contestado al ${avance}%. Los enlaces abren solo las pestañas de cada persona.`
            : "Mientras está en borrador, los enlaces no abren nada. Ajústalo y envíalo cuando esté listo."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!c.cerradoAt &&
          (c.publicadoAt ? (
            <button className={BTN} disabled={ocupado} onClick={() => onAccion({ accion: "publicar", publicado: false }, "Los enlaces quedaron en pausa.")}>
              Pausar enlaces
            </button>
          ) : (
            <button
              className={BTN_PRIMARIO}
              disabled={ocupado || !publicable}
              title={publicable ? "Activa los enlaces de los responsables" : (motivo ?? undefined)}
              onClick={() => onAccion({ accion: "publicar", publicado: true }, "Listo: los enlaces ya abren el cuestionario.")}
            >
              Enviar al cliente
            </button>
          ))}
        {c.publicadoAt && (
          <button
            className={BTN}
            disabled={ocupado}
            onClick={() =>
              onAccion(
                { accion: "cerrar", cerrado: !c.cerradoAt },
                c.cerradoAt ? "El cuestionario volvió a abrirse." : "Cuestionario cerrado: los enlaces quedan en solo lectura.",
              )
            }
          >
            {c.cerradoAt ? "Reabrir cuestionario" : "Cerrar cuestionario"}
          </button>
        )}
      </div>
      {!publicable && motivo && <p className="w-full text-xs text-warn-ink">{motivo}</p>}
    </div>
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-muted px-4 py-3">
      <div className="text-xs text-fg-secondary">
        {c.prellenado.enCurso ? (
          <span>✨ Nexus está leyendo el handoff y el kickoff para contestar lo que ya sabemos…</span>
        ) : c.prellenado.error ? (
          <span className="text-danger-ink">No se pudo prellenar: {c.prellenado.error}</span>
        ) : prellenadas > 0 ? (
          <span>
            ✨ {prellenadas} respuestas prellenadas con lo que ya sabemos
            {c.publicadoAt ? ` · ${sinConfirmar} sin confirmar por el cliente` : ". El cliente las verá para confirmar o corregir."}
          </span>
        ) : c.prellenado.at ? (
          <span>✨ El handoff y el kickoff no contestaban ninguna pregunta pendiente.</span>
        ) : (
          <span>✨ Nexus puede contestar de antemano lo que ya dice el handoff y el kickoff; el cliente solo confirma.</span>
        )}
      </div>
      <button
        className={BTN}
        disabled={ocupado || c.prellenado.enCurso}
        onClick={() => onAccion({ accion: "prellenar" }, "Prellenando… tarda menos de un minuto.")}
        title="Solo contesta preguntas vacías: nunca pisa lo que ya escribió el cliente"
      >
        {c.prellenado.enCurso ? "Prellenando…" : prellenadas > 0 || c.prellenado.at ? "Volver a prellenar lo vacío" : "Prellenar con lo que ya sabemos"}
      </button>
    </div>
  );
}

function Responsables({
  responsables,
  pestanas,
  ocupado,
  publicado,
  onAccion,
}: {
  responsables: ResponsableVista[];
  pestanas: PestanaVista[];
  ocupado: boolean;
  publicado: boolean;
  onAccion: (b: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const toast = useToast();
  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [email, setEmail] = useState("");
  const activos = responsables.filter((r) => !r.revocado);

  const copiar = async (r: ResponsableVista) => {
    const url = `${window.location.origin}${r.ruta}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(publicado ? `Enlace de ${r.nombre} copiado.` : `Enlace de ${r.nombre} copiado. Recuerda enviar el cuestionario para activarlo.`);
    } catch {
      toast.info(url, { duration: 0 });
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h4 className="text-sm font-semibold text-fg">Responsables del cliente</h4>
      <p className="mt-0.5 text-xs text-fg-muted">
        Cada persona recibe su propio enlace y solo ve las pestañas que le asignes.
      </p>
      {activos.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {activos.map((r) => {
            const suyas = pestanas.filter((p) => p.responsableId === r.id);
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">
                    {r.nombre}
                    {r.cargo && <span className="font-normal text-fg-muted"> · {r.cargo}</span>}
                  </div>
                  <div className="text-[11px] text-fg-muted">
                    {suyas.length ? suyas.map((p) => p.titulo).join(", ") : "Sin pestañas asignadas"}
                    {r.ultimoUsoAt ? ` · entró ${fecha(r.ultimoUsoAt)}` : " · todavía no entró"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className={BTN} onClick={() => copiar(r)}>
                    Copiar enlace
                  </button>
                  <button
                    className={BTN}
                    disabled={ocupado}
                    onClick={() => {
                      if (window.confirm(`¿Revocar el enlace de ${r.nombre}? Lo que ya contestó se conserva y sus pestañas quedan sin responsable.`)) {
                        void onAccion({ accion: "revocar_responsable", responsableId: r.id }, "Enlace revocado.");
                      }
                    }}
                  >
                    Revocar
                  </button>
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
          const ok = await onAccion({ accion: "crear_responsable", nombre, cargo: cargo || null, email: email || null }, "Responsable agregado.");
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
        <button className={BTN_PRIMARIO} disabled={ocupado || !nombre.trim()} type="submit">
          Agregar
        </button>
      </form>
    </section>
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
  responsables,
  enlaces,
  ocupado,
  cerrado,
  esPrimera,
  esUltima,
  onOps,
  onAccion,
}: {
  p: PestanaVista;
  responsables: ResponsableVista[];
  enlaces: Record<string, string>;
  ocupado: boolean;
  cerrado: boolean;
  esPrimera: boolean;
  esUltima: boolean;
  onOps: (ops: OperacionCuestionario[], ok?: string) => Promise<boolean>;
  onAccion: (b: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const bloqueada = !!p.enviadaAt || cerrado;
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
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg"
            value={p.responsableId ?? ""}
            disabled={ocupado || cerrado}
            onChange={(e) => onAccion({ accion: "asignar", pestanaId: p.id, responsableId: e.target.value || null })}
            title="Quién contesta esta pestaña"
          >
            <option value="">Sin responsable</option>
            {responsables.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
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
      </div>

      {p.enviadaAt && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success-line bg-success-surface px-3 py-2">
          <p className="text-xs text-success-ink">
            El cliente la envió el {fecha(p.enviadaAt)}. Está bloqueada: si pide cambios, aparecen en el registro.
          </p>
          {!cerrado && (
            <button
              className={BTN}
              disabled={ocupado}
              onClick={() => {
                const motivo = window.prompt("¿Por qué la reabres? (el cliente no lo ve; queda en el registro)") ?? undefined;
                if (motivo === undefined) return;
                void onAccion({ accion: "reabrir_pestana", pestanaId: p.id, motivo }, "Pestaña reabierta: el cliente ya puede editarla.");
              }}
            >
              Reabrir para el cliente
            </button>
          )}
        </div>
      )}

      <ol className="space-y-3">
        {p.preguntas.map((q, i) => (
          <PreguntaFila
            key={q.id}
            q={q}
            numero={i + 1}
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
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Contexto adicional del cliente</p>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-sm text-fg">{p.contextoAdicional}</p>
        </div>
      )}

      {p.adjuntos.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Documentos del cliente</p>
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
      <RespuestaVista r={r} />
    </li>
  );
}

function EtapasVista({ p }: { p: PestanaVista }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface-muted px-3 py-2">
        <p className="text-xs font-semibold text-fg">Etapas del proceso</p>
        <p className="mt-0.5 text-xs text-fg-muted">
          El cliente agrega una etapa por cada paso. Cada etapa responde siempre estas 7 preguntas (fijas: son la base
          de la definición de procesos de Planificación): {PREGUNTAS_DE_ETAPA.map((q) => q.texto.replace(/[¿?]/g, "")).join(" · ")}.
        </p>
      </div>
      {p.etapas.length === 0 ? (
        <p className="text-xs italic text-fg-muted">El cliente todavía no agregó etapas.</p>
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
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h4 className="text-sm font-semibold text-fg">Registro</h4>
      <ul className="mt-2 space-y-2">
        {c.cambios.map((x) => (
          <li key={x.id} className="text-sm">
            <span className="text-xs text-fg-muted">{fecha(x.createdAt)} · </span>
            {x.tipo === "ENVIO" && (
              <span className="text-fg">
                <b>{x.responsable ?? "El cliente"}</b> envió «{x.pestanaTitulo ?? "una pestaña"}».
              </span>
            )}
            {x.tipo === "SOLICITUD" && (
              <span className="text-fg">
                <b>{x.responsable ?? "El cliente"}</b> pidió un cambio en «{x.pestanaTitulo ?? "una pestaña"}»:{" "}
                <span className="text-fg-secondary">{x.mensaje}</span>
              </span>
            )}
            {x.tipo === "REAPERTURA" && (
              <span className="text-fg">
                {x.autorEmail ?? "El equipo"} reabrió «{x.pestanaTitulo ?? "una pestaña"}»
                {x.mensaje ? <span className="text-fg-secondary">: {x.mensaje}</span> : "."}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
