"use client";

/**
 * PanelDeLaReunion — la reunión elegida en la agenda del inicio, al costado (ficha D, 2026-10-17; diseño «Para ti ·
 * Ventas y CSE»).
 *
 * Arriba, lo de Nexus una sola vez (la guía, en azul con la chispa): el objetivo y tres o cuatro puntos, sacados de los
 * datos de la cuenta sin IA. «Editar» deja escribir TU objetivo, que manda. Abajo, los hechos: quién viene, la última
 * vez, lo pendiente de los dos lados, el negocio y tus notas (las ves solo tú). Una reunión que ya pasó muestra lo que
 * dejó, con «Usar todo». El hueco libre dice de cuándo a cuándo está libre, con «Crear un evento aquí» (el borrador de la
 * agenda), «Bloquear en Calendar» y, si alguna cabe, la tarea tuya con que avanzar ahí («Ponerla en la agenda»: el
 * mismo borrador, con la tarea en la descripción del evento).
 *
 * Los datos los trae GET /api/para-ti/reunion/[evento] (pide acceso al cliente); TU objetivo y tus notas se guardan con
 * PUT en el mismo lugar.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { enlaceAlDia, enlaceParaAgendarEnCalendar } from "@/lib/mi-dia/calendario";
import { horaCR, minutoDelDia, type ConQueAvanzar } from "@/lib/mi-dia/inicio";
import type { PanelDeLaReunion as Panel } from "@/lib/mi-dia/panel-server";
import type { ReunionDeLaAgenda } from "@/lib/mi-dia/agenda-server";
import { ReunionDespues } from "../DespuesDeTusReuniones";
import { lineaDeLaReunion } from "./AgendaDelInicio";
import { ENLACE_BOTON, Punto } from "./piezas";
import { MINUTOS_DEL_BORRADOR } from "@/lib/mi-dia/agenda-borrador";
import { crearBorrador } from "./borradores";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function cuandoEs(r: { inicio: string; fin: string | null }, hoyISO: string, ahora: Date): string {
  const d = minutoDelDia(r.inicio).dia;
  const nombre = d === hoyISO ? "Hoy" : `${DIAS[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;
  return `${nombre} · ${lineaDeLaReunion(r, hoyISO, ahora)}`;
}

export type LoElegido = { tipo: "reunion"; reunion: ReunionDeLaAgenda } | { tipo: "hueco"; inicio: string; fin: string; avanzar: ConQueAvanzar | null };

export default function PanelDeLaReunion({
  elegido,
  hoyISO,
  ahora,
  correo,
  onCerrar,
  onDescartarHueco,
}: {
  elegido: LoElegido;
  hoyISO: string;
  ahora: Date;
  correo: string;
  onCerrar: () => void;
  onDescartarHueco: () => void;
}) {
  const r = elegido.tipo === "reunion" ? elegido.reunion : null;
  const [empresa, setEmpresa] = useState<string | null>(r && r.empresas.length === 1 ? r.empresas[0] : null);
  const clave = r ? `${r.id}:${empresa ?? ""}` : "hueco";
  const [cargado, setCargado] = useState<{ clave: string; panel: Panel | null; error: string | null } | null>(null);

  // Al cambiar de reunión, la empresa vuelve a la de esa reunión (se ajusta en el render, sin efecto).
  const [reunionVista, setReunionVista] = useState(r?.id ?? null);
  if ((r?.id ?? null) !== reunionVista) {
    setReunionVista(r?.id ?? null);
    setEmpresa(r && r.empresas.length === 1 ? r.empresas[0] : null);
  }

  const idDeLaReunion = r?.id ?? null;
  const inicioDeLaReunion = r?.inicio ?? null;
  useEffect(() => {
    if (!idDeLaReunion || !inicioDeLaReunion) return;
    let vivo = true;
    const q = new URLSearchParams({ inicio: inicioDeLaReunion });
    if (empresa) q.set("cliente", empresa);
    fetch(`/api/para-ti/reunion/${encodeURIComponent(idDeLaReunion)}?${q.toString()}`)
      .then(async (res) => {
        const j = await res.json().catch(() => null);
        if (!vivo) return;
        if (!res.ok) setCargado({ clave, panel: null, error: (j as { error?: string } | null)?.error ?? "No se pudo abrir la reunión." });
        else setCargado({ clave, panel: j as Panel, error: null });
      })
      .catch(() => vivo && setCargado({ clave, panel: null, error: "No se pudo abrir la reunión." }));
    return () => {
      vivo = false;
    };
  }, [clave, idDeLaReunion, inicioDeLaReunion, empresa]);

  const datos = cargado?.clave === clave ? cargado : null;
  const futura = r ? Date.parse(r.fin ?? r.inicio) > ahora.getTime() : false;

  return (
    <aside aria-label="La reunión elegida" className="absolute inset-y-0 right-0 z-10 w-full max-w-[440px] border-l border-line bg-surface shadow-segment">
      <div className="sticky top-0 flex max-h-screen flex-col gap-[18px] overflow-y-auto px-[22px] pb-7 pt-5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs text-fg-muted">
              {r ? cuandoEs(r, hoyISO, ahora) : elegido.tipo === "hueco" ? `Hoy · ${horaCR(elegido.inicio)}–${horaCR(elegido.fin)}` : ""}
            </p>
            <h2 className="text-lg font-semibold leading-6 text-fg">{r ? r.titulo : "Hueco libre"}</h2>
            <p className="text-[13px] text-fg-secondary">
              {r
                ? empresa
                  ? `${r.nombres[empresa]}${datos?.panel?.cliente?.tipo ? ` · ${datos.panel.cliente.tipo}` : ""}`
                  : r.empresas.length > 1
                    ? `Puede ser de ${r.empresas.length} empresas`
                    : r.externos > 0
                      ? "Con alguien de afuera, sin empresa de Nexus"
                      : "Interna"
                : "Tu calendario está libre"}
            </p>
          </div>
          <button type="button" aria-label="Cerrar el panel" onClick={onCerrar} className="rounded px-2 py-1 text-lg leading-[18px] text-fg-muted transition-colors hover:text-fg">
            ×
          </button>
        </div>

        {elegido.tipo === "hueco" && <Hueco elegido={elegido} correo={correo} onCerrar={onCerrar} onDescartar={onDescartarHueco} />}

        {r && r.empresas.length > 1 && !empresa && (
          <div className="flex flex-col gap-2">
            <p className={ROTULO_DEL_SISTEMA}>¿De qué empresa es?</p>
            <div className="flex flex-wrap gap-2">
              {r.empresas.slice(0, 4).map((id) => (
                <BotonBlanco key={id} onClick={() => setEmpresa(id)}>
                  {r.nombres[id]}
                </BotonBlanco>
              ))}
            </div>
          </div>
        )}

        {r && futura && (
          <div className="flex flex-wrap gap-2">
            {r.meetUrl && (
              <a href={r.meetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3.5 py-[7px] text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover">
                Unirse a Meet
              </a>
            )}
            <a href={r.calendarUrl ?? enlaceAlDia(minutoDelDia(r.inicio).dia, correo)} target="_blank" rel="noreferrer" className={ENLACE_BOTON}>
              Abrir en Calendar
            </a>
            {empresa && (
              <Link href={`/clients/${encodeURIComponent(empresa)}`} className={ENLACE_BOTON}>
                Ir a la cuenta
              </Link>
            )}
          </div>
        )}

        {r && (
          <>
            {r.empresas.length === 0 ? (
              <>
                <p className="text-[13px] leading-[19px] text-fg-secondary">
                  Reunión interna. Si es la reunión de tu sprint, Nexus propone en Tareas lo que se comprometió cada uno.
                </p>
                {/* Una por reunión: lo escrito antes de que lleguen tus notas guardadas no se pierde (ver `Notas`). */}
                <Notas key={r.id} eventoId={r.id} panel={datos?.panel ?? null} />
              </>
            ) : !empresa ? null : !datos ? (
              <div className="flex flex-col gap-2.5 rounded-xl border border-line px-4 py-3.5">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3.5 w-full" delay={40} />
                <Skeleton className="h-3 w-64" delay={80} />
                <Skeleton className="h-3 w-56" delay={120} />
              </div>
            ) : datos.error || !datos.panel ? (
              <p className="text-[13px] text-danger-ink">{datos.error ?? "No se pudo abrir la reunión."}</p>
            ) : (
              <Contenido panel={datos.panel} futura={futura} hoyISO={hoyISO} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Hueco({ elegido, correo, onCerrar, onDescartar }: { elegido: Extract<LoElegido, { tipo: "hueco" }>; correo: string; onCerrar: () => void; onDescartar: () => void }) {
  const a = elegido.avanzar;
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-info-line bg-info-surface p-3.5">
      {a && (
        <div className="flex flex-col gap-1.5 border-b border-info-line pb-2.5">
          <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
            <IconoDeSugerencia className="h-[13px] w-[13px]" />
            Con qué avanzar
          </p>
          <p className="text-sm leading-[21px] text-fg">
            <strong className="font-semibold">T-{a.tarea.numero}</strong> {a.tarea.titulo}
            {a.tarea.empresa ? <span className="text-fg-secondary"> · {a.tarea.empresa}</span> : null}
          </p>
          <p className="text-xs text-fg-secondary">
            Es la más importante de tus tareas que cabe en este hueco: {a.porque}.{" "}
            {a.tarea.minutosEstimados != null ? `Estimaste ${a.minutos} min.` : "Sin estimar: se propone una hora."}
          </p>
          <div className="flex flex-wrap gap-2">
            <BotonAzul
              onClick={() => {
                crearBorrador({
                  correo,
                  inicio: elegido.inicio,
                  fin: new Date(Date.parse(elegido.inicio) + a.minutos * 60_000).toISOString(),
                  titulo: `T-${a.tarea.numero} · ${a.tarea.titulo}`,
                  cuenta: a.tarea.clientId && a.tarea.empresa ? { id: a.tarea.clientId, nombre: a.tarea.empresa } : null,
                  tarea: { id: a.tarea.id, numero: a.tarea.numero },
                  origen: "agendar",
                  enfocar: true,
                });
                onCerrar();
              }}
            >
              Ponerla en la agenda
            </BotonAzul>
            <Link href={`/tareas?t=${encodeURIComponent(a.tarea.id)}`} className={ENLACE_BOTON}>
              Ver la tarea
            </Link>
          </div>
        </div>
      )}
      <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
        <IconoDeSugerencia className="h-[13px] w-[13px]" />
        Hueco libre
      </p>
      <p className="text-sm leading-[21px] text-fg">
        Tienes libre de <strong className="font-semibold">{horaCR(elegido.inicio)}</strong> a <strong className="font-semibold">{horaCR(elegido.fin)}</strong>. Puedes poner un
        evento ahí o bloquear el tiempo en tu calendario.
      </p>
      <div className="flex flex-wrap gap-2">
        <BotonBlanco
          onClick={() => {
            crearBorrador({ correo, inicio: elegido.inicio, fin: new Date(Date.parse(elegido.inicio) + MINUTOS_DEL_BORRADOR * 60_000).toISOString(), origen: "agenda" });
            onCerrar();
          }}
        >
          Crear un evento aquí
        </BotonBlanco>
        <a
          className={ENLACE_BOTON}
          target="_blank"
          rel="noreferrer"
          href={enlaceParaAgendarEnCalendar({ titulo: "Tiempo de trabajo", detalle: "Bloqueado desde Nexus.", inicio: elegido.inicio, fin: elegido.fin, correo })}
        >
          Bloquear en Calendar
        </a>
        <BotonTexto onClick={onDescartar}>Descartar</BotonTexto>
      </div>
    </div>
  );
}

function Contenido({ panel, futura, hoyISO }: { panel: Panel; futura: boolean; hoyISO: string }) {
  return (
    <>
      <Guia panel={panel} />
      {panel.loQueDejo && (
        <div className="flex flex-col gap-2">
          <p className={ROTULO_DEL_SISTEMA}>Lo que dejó</p>
          <ul>
            <ReunionDespues r={panel.loQueDejo} hoyISO={hoyISO} />
          </ul>
        </div>
      )}
      {panel.vienen.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={ROTULO_DEL_SISTEMA}>Quién viene</p>
          {panel.vienen.map((p, i) => (
            <div key={`${p.nombre}-${i}`} className="flex items-baseline gap-2.5 text-[13px] leading-[19px]">
              <span className="flex-none font-semibold text-fg">{p.nombre}</span>
              {p.cargo && <span className="min-w-0 truncate text-fg-muted">{p.cargo}</span>}
              {p.nota && <span className="ml-auto whitespace-nowrap text-xs font-semibold text-warn-ink">{p.nota}</span>}
            </div>
          ))}
        </div>
      )}
      {panel.ultima && (
        <div className="flex flex-col gap-1.5">
          <p className={ROTULO_DEL_SISTEMA}>La última vez · {panel.ultima.fecha}</p>
          <p className="line-clamp-4 text-[13px] leading-[19px] text-fg-secondary">{panel.ultima.resumen ?? "La reunión no dejó minuta ni notas."}</p>
          <Link href={`/sessions/${encodeURIComponent(panel.ultima.sessionId)}`} className="text-xs font-medium text-brand hover:text-brand-light">
            {panel.ultima.fuente === "notas de la reunión" ? "Leer las notas" : "Leer la minuta"}
          </Link>
        </div>
      )}
      {panel.pendientes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={ROTULO_DEL_SISTEMA}>Pendiente</p>
          {panel.pendientes.map((q, i) => (
            <div key={`${q.titulo}-${i}`} className="flex gap-2 text-[13px] leading-[19px]">
              <Punto className={cn("mt-1.5", q.vencido ? "bg-warning" : q.lado === "cliente" ? "bg-primary" : "bg-success")} />
              <span className="flex-1 text-fg">
                {q.lado === "cliente" ? "El cliente: " : ""}
                {q.titulo}
              </span>
              <span className={cn("whitespace-nowrap text-xs font-semibold", q.vencido ? "text-warn-ink" : "text-fg-muted")}>{q.cuando}</span>
            </div>
          ))}
        </div>
      )}
      {panel.negocio && (
        <div className="flex flex-col gap-1.5">
          <p className={ROTULO_DEL_SISTEMA}>El negocio</p>
          <p className="text-[13px] leading-[19px] text-fg-secondary">{panel.negocio}</p>
        </div>
      )}
      {futura && <Notas key={panel.eventoId} eventoId={panel.eventoId} panel={panel} />}
    </>
  );
}

/** La guía: lo de Nexus, arriba y una vez. Con «Editar», tu objetivo manda. */
function Guia({ panel }: { panel: Panel }) {
  const toast = useToast();
  const [propio, setPropio] = useState(panel.preparacion.objetivo);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);
  const propuesto = panel.guia.objetivo;
  if (!propuesto && !propio && panel.guia.puntos.length === 0 && !editando) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line bg-surface-muted px-4 py-3.5">
        <p className="text-[13px] text-fg-secondary">Nexus no tiene con qué proponer un objetivo para esta reunión.</p>
        {panel.sePuedeGuardar && (
          <BotonBlanco
            className="self-start"
            onClick={() => {
              setBorrador("");
              setEditando(true);
            }}
          >
            Escribir el objetivo
          </BotonBlanco>
        )}
      </div>
    );
  }

  async function guardar(valor: string | null) {
    setGuardando(true);
    try {
      const res = await fetch(`/api/para-ti/reunion/${encodeURIComponent(panel.eventoId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objetivo: valor }),
      });
      const j = (await res.json().catch(() => null)) as { objetivo?: string | null; error?: string } | null;
      if (!res.ok) {
        toast.error(j?.error ?? "No se pudo guardar el objetivo.");
        return;
      }
      setPropio(j?.objetivo ?? null);
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-info-line bg-info-surface px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
          Guía para esta reunión
        </p>
        {!editando && panel.sePuedeGuardar && (
          <BotonTexto
            className="p-0"
            onClick={() => {
              setBorrador(propio ?? propuesto?.texto ?? "");
              setEditando(true);
            }}
          >
            Editar
          </BotonTexto>
        )}
      </div>
      {editando ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`objetivo-${panel.eventoId}`} className="text-xs text-fg-muted">
            Lo que quieres lograr en esta reunión
          </label>
          <textarea
            id={`objetivo-${panel.eventoId}`}
            rows={3}
            maxLength={500}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] leading-[19px] text-fg"
          />
          <div className="flex flex-wrap gap-2">
            <BotonAzul onClick={() => guardar(borrador)} disabled={guardando || !borrador.trim()}>
              {guardando ? "Guardando…" : "Guardar"}
            </BotonAzul>
            {propio && (
              <BotonBlanco onClick={() => guardar(null)} disabled={guardando}>
                Usar el de Nexus
              </BotonBlanco>
            )}
            <BotonTexto onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </BotonTexto>
          </div>
        </div>
      ) : (
        <>
          {(propio || propuesto) && <p className="text-[14.5px] font-semibold leading-[21px] text-fg">{propio ?? propuesto!.texto}</p>}
          <p className="text-xs text-fg-muted">{propio ? "Tu objetivo" : propuesto ? `Lo propone Nexus: ${propuesto.deDonde.toLowerCase()}` : "Sin objetivo: escríbelo con «Editar»"}</p>
        </>
      )}
      {panel.guia.puntos.length > 0 && (
        <ul className="flex list-disc flex-col gap-1.5 pl-[18px] text-[13px] leading-[19px] text-fg-secondary">
          {panel.guia.puntos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Tus notas de la reunión: se guardan solas al dejar de escribir. Las ves solo tú.
 *
 * ⚠ No se vuelve a montar cuando llegan tus notas guardadas: lo que escribiste mientras cargaban se queda (las
 * guardadas solo llenan el campo si no tocaste nada). Y al cerrarse (otra reunión, cerrar el panel) guarda lo que
 * quedó sin guardar, en vez de perderlo con el temporizador.
 */
function Notas({ eventoId, panel }: { eventoId: string; panel: Panel | null }) {
  const toast = useToast();
  const [texto, setTexto] = useState(panel?.preparacion.notas ?? "");
  const [estado, setEstado] = useState<"" | "guardando" | "guardado">("");
  const [tocado, setTocado] = useState(false);
  const guardado = useRef(panel?.preparacion.notas ?? "");
  const ultimo = useRef(texto);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Llegan tus notas guardadas: llenan el campo si no escribiste nada todavía (se ajusta en el render, sin efecto).
  const [conLoGuardado, setConLoGuardado] = useState(panel !== null);
  if (panel && !conLoGuardado) {
    setConLoGuardado(true);
    if (!tocado) setTexto(panel.preparacion.notas ?? "");
  }
  // Lo guardado del servidor, una vez al llegar (después lo lleva `guardar`): así no se vuelve a mandar lo mismo.
  const tomoLoGuardado = useRef(panel !== null);
  useEffect(() => {
    if (!panel || tomoLoGuardado.current) return;
    tomoLoGuardado.current = true;
    guardado.current = panel.preparacion.notas ?? "";
    if (!tocado) ultimo.current = guardado.current;
  }, [panel, tocado]);

  const guardar = useCallback(
    async (valor: string) => {
      if (valor === guardado.current) return;
      setEstado("guardando");
      const res = await fetch(`/api/para-ti/reunion/${encodeURIComponent(eventoId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notas: valor }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = (await res?.json().catch(() => null)) as { error?: string } | null;
        toast.error(j?.error ?? "No se pudieron guardar tus notas.");
        setEstado("");
        return;
      }
      guardado.current = valor;
      setEstado("guardado");
    },
    [eventoId, toast],
  );

  // Con «Ver como» (o sin la tabla) no se guarda nada, tampoco al cerrarse.
  const noSeGuarda = useRef(false);
  useEffect(() => {
    noSeGuarda.current = !!panel && !panel.sePuedeGuardar;
  }, [panel]);

  // Al cerrarse, lo que quedó sin guardar se manda igual (`keepalive`: sobrevive a cambiar de página). Sin avisos: el
  // panel ya no está.
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      if (noSeGuarda.current || ultimo.current === guardado.current) return;
      void fetch(`/api/para-ti/reunion/${encodeURIComponent(eventoId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notas: ultimo.current }),
        keepalive: true,
      }).catch(() => null);
    },
    [eventoId],
  );

  if (panel && !panel.sePuedeGuardar) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={`notas-${eventoId}`} className={ROTULO_DEL_SISTEMA}>
          Tus notas
        </label>
        <span className="text-[11px] text-fg-muted">{estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : ""}</span>
      </div>
      <textarea
        id={`notas-${eventoId}`}
        rows={4}
        maxLength={5000}
        value={texto}
        placeholder="Lo que quieres preguntar o recordar. Solo lo ves tú."
        onChange={(e) => {
          const v = e.target.value;
          setTexto(v);
          setTocado(true);
          ultimo.current = v;
          setEstado("");
          if (temporizador.current) clearTimeout(temporizador.current);
          temporizador.current = setTimeout(() => guardar(v), 900);
        }}
        onBlur={() => {
          if (temporizador.current) clearTimeout(temporizador.current);
          void guardar(texto);
        }}
        className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] leading-[19px] text-fg"
      />
    </div>
  );
}
