"use client";

/**
 * PanelDeLaReunion — la reunión elegida en la agenda del inicio, al costado (ficha D, 2026-10-17; diseño «Para ti ·
 * Ventas y CSE»).
 *
 * Arriba, lo de Nexus una sola vez (la guía, en azul con la chispa): el objetivo y tres o cuatro puntos, sacados de los
 * datos de la cuenta sin IA. «Editar» deja escribir TU objetivo, que manda. Abajo, los hechos: quién viene, la última
 * vez, lo pendiente de los dos lados (que se marca «Hecha», se desestima o se agenda desde acá: PendientesDelPanel.tsx,
 * 2026-10-20), el negocio, tus notas (las ves solo tú) y la búsqueda en lo que se dijo con la cuenta. «Preparar» abre
 * este panel (2026-10-20): la página aparte de preparar se retiró. Una reunión que ya pasó muestra lo que dejó. El espacio libre dice de cuándo a cuándo está libre, con «Crear un evento aquí» (el borrador de
 * la agenda), «Bloquear en Calendar» y «Con qué usar este espacio» (lib/mi-dia/espacio-libre.ts, sin IA): tus tareas que
 * caben, la reunión con una cuenta que no la tiene y el siguiente paso; cada una deja el borrador lleno con un clic.
 *
 * Un evento propio (2026-10-19: el almuerzo, «Tenis», «Preparar demo para Accesos Automáticos») se abre igual: título,
 * día y hora, «Abrir en Google Calendar» como enlace y tus notas. Si nombra UNA cuenta (lib/mi-dia/agenda.ts ›
 * empresasDelEventoPropio), suma lo de esa cuenta: la próxima reunión, el siguiente paso, lo pendiente, la última vez y
 * el negocio. Si no se sabe de qué cuenta es, no se inventa.
 *
 * «Asociar a una tarea» (P3, 2026-10-27; components/tareas/AsociarATarea.tsx): el evento, reunión o propio, se une a una de
 * tus tareas abiertas sin moverlo ni borrarlo.
 *
 * Una reunión interna (solo gente de Smarteam) que nombra entera a UNA empresa (2026-10-19, prueba 151: «Preparar demo
 * para Accesos Automáticos» con Andrés y Liz; lib/mi-dia/agenda.ts › empresasDeLaReunionInterna) suma lo mismo, sin
 * perder lo de reunión interna (Meet, el texto del sprint, la sesión si ya pasó).
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
import type { EventoPropioDeLaAgenda, ReunionDeLaAgenda } from "@/lib/mi-dia/agenda-server";
import { cuentaDelEvento } from "@/lib/mi-dia/agenda";
import { hrefDeLaSesion, ReunionDespues } from "../DespuesDeTusReuniones";
import { lineaDeLaReunion } from "./AgendaDelInicio";
import { ENLACE_BOTON } from "./piezas";
import { MINUTOS_DEL_BORRADOR } from "@/lib/mi-dia/agenda-borrador";
import { sugerenciasParaElEspacio, type ParaSugerirEnElEspacio, type SugerenciaDelEspacio } from "@/lib/mi-dia/espacio-libre";
import { crearBorrador } from "./borradores";
import PendientesDelPanel from "./PendientesDelPanel";
import BuscarEnReuniones from "@/components/busqueda/BuscarEnReuniones";
import { tituloDelBloque } from "@/lib/tareas/titulo-corto";
import AsociarATarea from "@/components/tareas/AsociarATarea";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function cuandoEs(r: { inicio: string; fin: string | null }, hoyISO: string, ahora: Date): string {
  const d = minutoDelDia(r.inicio).dia;
  const nombre = d === hoyISO ? "Hoy" : `${DIAS[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;
  return `${nombre} · ${lineaDeLaReunion(r, hoyISO, ahora)}`;
}

export type LoElegido = { tipo: "reunion"; reunion: ReunionDeLaAgenda } | { tipo: "propio"; propio: EventoPropioDeLaAgenda } | {
      tipo: "hueco";
      /** El bloque que se tocó (lo que sugiere Nexus, del tamaño de la tarea). */
      inicio: string;
      fin: string;
      /** El espacio libre entero donde cae. */
      espacio: { inicio: string; fin: string };
      avanzar: ConQueAvanzar | null;
    };

export default function PanelDeLaReunion({
  elegido,
  hoyISO,
  ahora,
  correo,
  paraSugerir,
  onCerrar,
  onDescartarHueco,
}: {
  elegido: LoElegido;
  hoyISO: string;
  ahora: Date;
  correo: string;
  paraSugerir?: ParaSugerirEnElEspacio;
  onCerrar: () => void;
  onDescartarHueco: () => void;
}) {
  const r = elegido.tipo === "reunion" ? elegido.reunion : null;
  const p = elegido.tipo === "propio" ? elegido.propio : null;
  const [empresa, setEmpresa] = useState<string | null>(r && r.empresas.length === 1 ? r.empresas[0] : null);
  // La cuenta de un evento propio: la que nombra, si es UNA (invariante 1). No se elige a mano: si no se sabe, no se inventa.
  const cuentaPropia = p ? cuentaDelEvento(p) : null;
  // La cuenta de una reunión interna: la que nombra entera, si es UNA (no la de los invitados: no hay nadie de afuera).
  const cuentaInterna = r && r.empresas.length === 0 && r.externos === 0 ? cuentaDelEvento({ empresas: r.nombradas ?? [] }) : null;
  const evento = r ?? p;
  const clave = r ? `${r.id}:${empresa ?? cuentaInterna ?? ""}` : p ? `${p.id}:${cuentaPropia ?? ""}` : "hueco";
  const [cargado, setCargado] = useState<{ clave: string; panel: Panel | null; error: string | null } | null>(null);

  // Al cambiar de reunión, la empresa vuelve a la de esa reunión (se ajusta en el render, sin efecto).
  const [reunionVista, setReunionVista] = useState(r?.id ?? null);
  if ((r?.id ?? null) !== reunionVista) {
    setReunionVista(r?.id ?? null);
    setEmpresa(r && r.empresas.length === 1 ? r.empresas[0] : null);
  }

  const idDeLaReunion = evento?.id ?? null;
  const inicioDeLaReunion = evento?.inicio ?? null;
  const esPropio = !!p;
  const esInterna = !!cuentaInterna;
  const clienteDelPanel = p ? cuentaPropia : (cuentaInterna ?? empresa);
  useEffect(() => {
    if (!idDeLaReunion || !inicioDeLaReunion) return;
    let vivo = true;
    const q = new URLSearchParams({ inicio: inicioDeLaReunion });
    if (clienteDelPanel) q.set("cliente", clienteDelPanel);
    if (esPropio) q.set("propio", "1");
    else if (esInterna) q.set("interna", "1");
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
  }, [clave, idDeLaReunion, inicioDeLaReunion, clienteDelPanel, esPropio, esInterna]);

  const datos = cargado?.clave === clave ? cargado : null;
  const futura = evento ? Date.parse(evento.fin ?? evento.inicio) > ahora.getTime() : false;

  return (
    <aside aria-label="La reunión elegida" className="absolute inset-y-0 right-0 z-10 w-full max-w-[440px] border-l border-line bg-surface shadow-segment">
      <div className="sticky top-0 flex max-h-screen flex-col gap-[18px] overflow-y-auto px-[22px] pb-7 pt-5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs text-fg-muted">
              {evento ? cuandoEs(evento, hoyISO, ahora) : elegido.tipo === "hueco" ? cuandoEs(elegido.espacio, hoyISO, ahora) : ""}
            </p>
            <h2 className="text-lg font-semibold leading-6 text-fg">{evento ? evento.titulo : "Espacio libre"}</h2>
            <p className="text-[13px] text-fg-secondary">
              {p
                ? cuentaPropia
                  ? `${p.nombres[cuentaPropia]}${datos?.panel?.cliente?.tipo ? ` · ${datos.panel.cliente.tipo}` : ""}`
                  : "Evento tuyo, sin otros invitados"
                : r
                ? empresa
                  ? `${r.nombres[empresa]}${datos?.panel?.cliente?.tipo ? ` · ${datos.panel.cliente.tipo}` : ""}`
                  : r.empresas.length > 1
                    ? `Puede ser de ${r.empresas.length} empresas`
                    : r.externos > 0
                      ? "Con alguien de afuera, sin empresa de Nexus"
                      : cuentaInterna
                        ? `Interna · ${r.nombres[cuentaInterna] ?? "Empresa"}${datos?.panel?.cliente?.tipo ? ` · ${datos.panel.cliente.tipo}` : ""}`
                        : "Interna"
                : "Tu calendario está libre"}
            </p>
          </div>
          <button type="button" aria-label="Cerrar el panel" onClick={onCerrar} className="rounded px-2 py-1 text-lg leading-[18px] text-fg-muted transition-colors hover:text-fg">
            ×
          </button>
        </div>

        {elegido.tipo === "hueco" && (
          <Hueco
            elegido={elegido}
            correo={correo}
            sugerencias={paraSugerir ? sugerenciasParaElEspacio({ inicio: elegido.inicio, fin: elegido.espacio.fin, hoyISO, ...paraSugerir }) : []}
            onCerrar={onCerrar}
            onDescartar={onDescartarHueco}
          />
        )}

        {/* P3 (2026-10-27): un evento que ya existe se une a una de tus tareas; un espacio vacío la sigue creando. */}
        {evento && <AsociarATarea eventoId={evento.id} correo={correo} />}

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
            {cuentaInterna && datos?.panel?.cliente && (
              <Link href={`/clients/${encodeURIComponent(cuentaInterna)}`} className={ENLACE_BOTON}>
                Ir a la cuenta
              </Link>
            )}
          </div>
        )}

        {p && <EventoPropio p={p} cuenta={cuentaPropia} datos={datos} futura={futura} correo={correo} onCerrar={onCerrar} />}

        {r && (
          <>
            {r.empresas.length === 0 ? (
              <>
                <p className="text-[13px] leading-[19px] text-fg-secondary">
                  Reunión interna. Si es la reunión de tu sprint, Nexus propone en Tareas lo que se comprometió cada uno.
                </p>
                {datos?.panel?.sesionId && <EnlaceALaSesion sessionId={datos.panel.sesionId} />}
                {/* Ya pasó: «Ir a la cuenta» no está arriba (los botones son de una reunión que viene). */}
                {cuentaInterna && !futura && datos?.panel?.cliente && (
                  <Link href={`/clients/${encodeURIComponent(cuentaInterna)}`} className={cn(ENLACE_BOTON, "self-start")}>
                    Ir a la cuenta
                  </Link>
                )}
                {cuentaInterna && <LaCuentaDelEvento datos={datos} correo={correo} onCerrar={onCerrar} />}
                {/* Una por reunión: lo escrito antes de que lleguen tus notas guardadas no se pierde (ver `Notas`). */}
                <Notas key={r.id} eventoId={r.id} panel={datos?.panel ?? null} futura={futura} />
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
              <Contenido panel={datos.panel} futura={futura} hoyISO={hoyISO} correo={correo} onCerrar={onCerrar} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Hueco({
  elegido,
  correo,
  sugerencias,
  onCerrar,
  onDescartar,
}: {
  elegido: Extract<LoElegido, { tipo: "hueco" }>;
  correo: string;
  sugerencias: readonly SugerenciaDelEspacio[];
  onCerrar: () => void;
  onDescartar: () => void;
}) {
  // Una sugerencia deja el borrador lleno en este espacio y lo lleva a la vista; todo sigue editable ahí.
  const usar = (s: SugerenciaDelEspacio) => {
    crearBorrador({
      correo,
      inicio: elegido.inicio,
      fin: new Date(Date.parse(elegido.inicio) + (s.minutos ?? MINUTOS_DEL_BORRADOR) * 60_000).toISOString(),
      titulo: s.titulo,
      cuenta: s.cuenta,
      invitados: s.invitados.map((c) => ({ correo: c, nombre: null, clientId: s.cuenta?.id ?? null })),
      tarea: s.tarea,
      origen: "agenda",
      enfocar: true,
    });
    onCerrar();
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-info-line bg-info-surface p-3.5">
      {sugerencias.length > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-info-line pb-2.5">
          <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
            <IconoDeSugerencia className="h-[13px] w-[13px]" />
            Con qué usar este espacio
          </p>
          <ul className="flex flex-col">
            {sugerencias.map((s, i) => (
              <li key={s.clave} className="flex items-start gap-2.5 border-t border-info-line py-2 first:border-t-0 first:pt-0">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-medium leading-[19px] text-fg">{s.texto}</span>
                  <span className="text-xs leading-4 text-fg-secondary">{s.porque}</span>
                  {s.tarea && (
                    <Link href={`/tareas?t=${encodeURIComponent(s.tarea.id)}`} className="text-xs text-brand hover:text-brand-light">
                      Ver la tarea
                    </Link>
                  )}
                </div>
                {i === 0 ? (
                  <BotonAzul onClick={() => usar(s)}>Usar</BotonAzul>
                ) : (
                  <BotonBlanco onClick={() => usar(s)}>Usar</BotonBlanco>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className={cn(ROTULO_DEL_SISTEMA, "text-brand")}>Espacio libre</p>
      <p className="text-sm leading-[21px] text-fg">
        Tienes libre de <strong className="font-semibold">{horaCR(elegido.espacio.inicio)}</strong> a <strong className="font-semibold">{horaCR(elegido.espacio.fin)}</strong>. Puedes poner un
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
          href={enlaceParaAgendarEnCalendar({
            titulo: elegido.avanzar ? tituloDelBloque(elegido.avanzar.tarea) : "Tiempo de trabajo",
            detalle: "Bloqueado desde Nexus.",
            inicio: elegido.inicio,
            fin: elegido.fin,
            correo,
          })}
        >
          Bloquear en Calendar
        </a>
        <BotonTexto onClick={onDescartar}>Descartar</BotonTexto>
      </div>
    </div>
  );
}

function Contenido({ panel, futura, hoyISO, correo, onCerrar }: { panel: Panel; futura: boolean; hoyISO: string; correo: string; onCerrar: () => void }) {
  return (
    <>
      <Guia panel={panel} />
      {panel.loQueDejo ? (
        <div className="flex flex-col gap-2">
          <p className={ROTULO_DEL_SISTEMA}>Lo que dejó</p>
          <ul>
            <ReunionDespues r={panel.loQueDejo} hoyISO={hoyISO} />
          </ul>
        </div>
      ) : (
        panel.sesionId && <EnlaceALaSesion sessionId={panel.sesionId} />
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
      <LoDeLaCuenta panel={panel} correo={correo} onCerrar={onCerrar} />
      {/* También en una reunión que ya pasó: la nota sirve igual después (2026-10-17). */}
      <Notas key={panel.eventoId} eventoId={panel.eventoId} panel={panel} futura={futura} />
      {/* La búsqueda en lo que se dijo con la cuenta (vivía en la página de «Preparar», retirada el 2026-10-20). */}
      {panel.cliente && <BuscarEnReuniones clientId={panel.cliente.id} nombre={panel.cliente.nombre} />}
    </>
  );
}

/**
 * Lo de la cuenta que no es de una reunión en particular: la última vez, lo pendiente (que se cierra, se desestima o se
 * agenda desde acá, 2026-10-20) y el negocio.
 */
function LoDeLaCuenta({ panel, correo, onCerrar }: { panel: Panel; correo: string; onCerrar: () => void }) {
  return (
    <>
      {panel.ultima && (
        <div className="flex flex-col gap-1.5">
          <p className={ROTULO_DEL_SISTEMA}>La última vez · {panel.ultima.fecha}</p>
          <p className="line-clamp-4 text-[13px] leading-[19px] text-fg-secondary">{panel.ultima.resumen ?? "La reunión no dejó minuta ni notas."}</p>
          <Link href={`/sessions/${encodeURIComponent(panel.ultima.sessionId)}`} className="text-xs font-medium text-brand hover:text-brand-light">
            {panel.ultima.fuente === "notas de la reunión" ? "Leer las notas" : "Leer la minuta"}
          </Link>
        </div>
      )}
      {panel.cliente && <PendientesDelPanel clientId={panel.cliente.id} empresa={panel.cliente.nombre} correo={correo} onAgendado={onCerrar} />}
      {panel.negocio && (
        <div className="flex flex-col gap-1.5">
          <p className={ROTULO_DEL_SISTEMA}>El negocio</p>
          <p className="text-[13px] leading-[19px] text-fg-secondary">{panel.negocio}</p>
        </div>
      )}
    </>
  );
}

/**
 * Un evento propio en el panel (2026-10-19): «Abrir en Google Calendar» como enlace (no es el clic principal), lo de su
 * cuenta si nombra una y tus notas. Sin cuenta, solo tus notas: no se inventa de quién es.
 */
function EventoPropio({
  p,
  cuenta,
  datos,
  futura,
  correo,
  onCerrar,
}: {
  p: EventoPropioDeLaAgenda;
  cuenta: string | null;
  datos: { panel: Panel | null; error: string | null } | null;
  futura: boolean;
  correo: string;
  onCerrar: () => void;
}) {
  const panel = datos?.panel ?? null;
  const conCuenta = !!cuenta && !!panel?.cliente;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {conCuenta && (
          <Link href={`/clients/${encodeURIComponent(cuenta!)}`} className={ENLACE_BOTON}>
            Ir a la cuenta
          </Link>
        )}
        <a
          href={p.calendarUrl ?? enlaceAlDia(minutoDelDia(p.inicio).dia, correo)}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-brand transition-colors hover:text-brand-light"
        >
          Abrir en Google Calendar
        </a>
      </div>
      {cuenta && <LaCuentaDelEvento datos={datos} correo={correo} onCerrar={onCerrar} />}
      {/* Tus notas, como en una reunión: las ves solo tú. */}
      <Notas key={p.id} eventoId={p.id} panel={panel} futura={futura} />
      {!cuenta && (
        <p className="text-xs leading-4 text-fg-muted">
          {p.empresas.length > 1
            ? "El título nombra más de una cuenta: Nexus no elige cuál."
            : "Si el título o la descripción nombran a un cliente, aquí verías lo de su cuenta."}
        </p>
      )}
    </>
  );
}

/**
 * Lo de la cuenta de un evento que no fue con el cliente (uno propio, o uno interno que lo nombra): la próxima reunión,
 * el siguiente paso, la última vez, lo pendiente y el negocio. Sin acceso a la cuenta, lo dice y no muestra nada de ella.
 */
function LaCuentaDelEvento({ datos, correo, onCerrar }: { datos: { panel: Panel | null; error: string | null } | null; correo: string; onCerrar: () => void }) {
  const panel = datos?.panel ?? null;
  return (
    <>
      {!datos ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line px-4 py-3.5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3.5 w-full" delay={40} />
          <Skeleton className="h-3 w-64" delay={80} />
        </div>
      ) : datos?.error ? (
        <p className="text-[13px] text-danger-ink">{datos.error}</p>
      ) : (
        panel &&
        (panel.cliente ? (
          <>
            {panel.proxima ? (
              <div className="flex flex-col gap-1.5">
                <p className={ROTULO_DEL_SISTEMA}>La próxima reunión</p>
                <p className="text-[13px] leading-[19px] text-fg">
                  {panel.proxima.titulo} <span className="text-fg-muted">· {panel.proxima.cuando}</span>
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className={ROTULO_DEL_SISTEMA}>La próxima reunión</p>
                <p className="text-[13px] leading-[19px] text-fg-muted">Sin reunión con {panel.cliente.nombre} en los próximos 8 días.</p>
              </div>
            )}
            {panel.siguientePaso && (
              <div className="flex flex-col gap-1.5">
                <p className={ROTULO_DEL_SISTEMA}>El siguiente paso · {panel.siguientePaso.equipo}</p>
                <p className="text-[13px] leading-[19px] text-fg">{panel.siguientePaso.que}</p>
                {(panel.siguientePaso.cuando || panel.siguientePaso.quien) && (
                  <p className="text-xs text-fg-muted">{[panel.siguientePaso.cuando, panel.siguientePaso.quien].filter(Boolean).join(" · ")}</p>
                )}
              </div>
            )}
            <LoDeLaCuenta panel={panel} correo={correo} onCerrar={onCerrar} />
          </>
        ) : (
          <p className="text-[13px] leading-[19px] text-fg-muted">El evento nombra una cuenta que no está entre las que ves.</p>
        ))
      )}
    </>
  );
}

/** Una reunión que ya pasó y no dejó nada por decidir (o es interna): igual se llega a su página. */
function EnlaceALaSesion({ sessionId }: { sessionId: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className={ROTULO_DEL_SISTEMA}>La sesión</p>
      <p className="text-[13px] leading-[19px] text-fg-secondary">La minuta, la transcripción y las tareas que dejó están en la página de la sesión.</p>
      <Link href={hrefDeLaSesion(sessionId)} className={cn(ENLACE_BOTON, "self-start")}>
        Revisar sesión
      </Link>
    </div>
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
function Notas({ eventoId, panel, futura }: { eventoId: string; panel: Panel | null; futura: boolean }) {
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

  if (panel?.verComo) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className={ROTULO_DEL_SISTEMA}>Tus notas</p>
        <p className="text-xs text-fg-muted">Las notas son de cada persona: mientras ves Nexus como otra persona no se ven ni se escriben.</p>
      </div>
    );
  }
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
        placeholder={futura ? "Lo que quieres preguntar o recordar. Solo lo ves tú." : "Lo que pasó o lo que quieres recordar de esta reunión. Solo lo ves tú."}
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
