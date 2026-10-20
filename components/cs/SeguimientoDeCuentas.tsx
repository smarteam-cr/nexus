"use client";

/**
 * SeguimientoDeCuentas — Éxito del cliente › «Seguimiento de cuentas» (2026-10-19). Una fila por cuenta de la cartera:
 * la próxima sesión, el siguiente paso, los temas que se están tratando y la última reunión con el cliente. Las reglas
 * son puras (lib/mi-dia/seguimiento.ts); la carga, lib/mi-dia/seguimiento-server.ts.
 *
 * El CSE la abre en sus cuentas; quien lidera Customer Success, con todos los CSE. Los filtros viven en la dirección
 * (`?cse=` y `?solo=sesion,paso`) con `history.replaceState`: cambiar un filtro no vuelve a leer los calendarios.
 * «Agendar» es el del inicio (components/para-ti/inicio/AgendarEnLaAgenda): deja el borrador en la agenda de «Para ti»
 * para revisarlo y abrirlo en Google Calendar. Nexus nunca escribe el calendario.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader, Select } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { cuandoEsLaReunion, diaCorto, DIAS_PARA_LA_REUNION, elDia } from "@/lib/mi-dia/servicio";
import {
  conteosDelSeguimiento,
  cseDelSeguimiento,
  diasDesdeLaUltima,
  DIAS_DE_REUNIONES,
  DIAS_PARA_LA_PROXIMA_SESION,
  filtrarSeguimiento,
  sesionFueraDeLaRegla,
  sinSesion,
  TUYAS,
  type FilaDeSeguimiento,
  type FiltrosDeSeguimiento,
  type TemaDeLaCuenta,
} from "@/lib/mi-dia/seguimiento";
import type { SeguimientoDeCuentas as Datos } from "@/lib/mi-dia/seguimiento-server";
import { NOMBRE_DE_SALUD, Punto, PUNTO_DE_SALUD } from "@/components/para-ti/inicio/piezas";
import { usePlanificarAccion } from "@/components/para-ti/inicio/AgendarEnLaAgenda";

const CHIP = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold leading-4";
const ROTULO = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted";
const COLUMNAS = "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,0.9fr)]";
const BOTON_CHICO =
  "inline-flex items-center rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg";

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
/** «10:30» en Costa Rica. */
const hora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const NOMBRE_DEL_ORIGEN: Record<TemaDeLaCuenta["origen"], string> = { reunion: "Reunión", correo: "Correo", llamada: "Llamada", tarea: "Tarea abierta" };

function filtrosDeLaDireccion(p: URLSearchParams, base: FiltrosDeSeguimiento): FiltrosDeSeguimiento {
  const solo = (p.get("solo") ?? "").split(",");
  return {
    cse: p.has("cse") ? (p.get("cse") ?? "") : base.cse,
    sinSesion: solo.includes("sesion"),
    sinPaso: solo.includes("paso"),
  };
}

function escribirEnLaDireccion(f: FiltrosDeSeguimiento, base: FiltrosDeSeguimiento) {
  const p = new URLSearchParams(window.location.search);
  if (f.cse === base.cse) p.delete("cse");
  else p.set("cse", f.cse);
  const solo = [f.sinSesion ? "sesion" : null, f.sinPaso ? "paso" : null].filter(Boolean).join(",");
  if (solo) p.set("solo", solo);
  else p.delete("solo");
  const q = p.toString();
  window.history.replaceState(window.history.state, "", q ? `${window.location.pathname}?${q}` : window.location.pathname);
}

export default function SeguimientoDeCuentas({
  data,
  hoyISO,
  conCartera,
  contenedor,
}: {
  data: Datos;
  hoyISO: string;
  /** Quien lidera Customer Success: las migas llevan a la cartera. */
  conCartera: boolean;
  contenedor: string;
}) {
  const params = useSearchParams();
  const [f, setF] = useState<FiltrosDeSeguimiento>(() => filtrosDeLaDireccion(new URLSearchParams(params.toString()), data.filtros));
  const cambiar = (c: Partial<FiltrosDeSeguimiento>) => {
    const n = { ...f, ...c };
    setF(n);
    escribirEnLaDireccion(n, data.filtros);
  };

  const opciones = useMemo(() => cseDelSeguimiento(data.filas), [data.filas]);
  // Los conteos de los botones son de las cuentas del CSE elegido (sin los otros dos filtros): dicen cuántas hay.
  // Un correo que ya no es CSE de ninguna cuenta (un enlace viejo) se lee como «Todos»: el filtro y el selector dicen lo mismo.
  const cseValido = f.cse === "" || f.cse === "sin" || f.cse === TUYAS || opciones.cses.some((c) => c.clave === f.cse);
  const efectivos = useMemo(() => (cseValido ? f : { ...f, cse: "" }), [cseValido, f]);
  const delCse = useMemo(() => filtrarSeguimiento(data.filas, { cse: efectivos.cse, sinSesion: false, sinPaso: false }), [data.filas, efectivos.cse]);
  const conteos = useMemo(() => conteosDelSeguimiento(delCse), [delCse]);
  const filas = useMemo(() => filtrarSeguimiento(data.filas, efectivos), [data.filas, efectivos]);
  const quien =
    efectivos.cse === TUYAS
      ? "Las cuentas que llevas"
      : efectivos.cse === ""
        ? data.lider
          ? "La cartera"
          : "Las que llevas y las compartidas"
        : efectivos.cse === "sin"
          ? "Las cuentas sin CSE"
          : `Las cuentas de ${opciones.cses.find((c) => c.clave === efectivos.cse)?.nombre ?? "ese CSE"}`;

  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="Seguimiento de cuentas"
        description={`Por cuenta: la próxima sesión agendada (próximos ${DIAS_PARA_LA_PROXIMA_SESION} días), el siguiente paso, los temas que se están tratando y la última reunión con el cliente.`}
        crumbs={conCartera ? [{ label: "Éxito del cliente", href: "/customer-success" }, { label: "Seguimiento de cuentas" }] : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" aria-label="CSE" value={efectivos.cse} onChange={(e) => cambiar({ cse: e.target.value })}>
          {!data.lider && <option value={TUYAS}>Las que llevas</option>}
          <option value="">Todos los CSE</option>
          {opciones.cses.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.clave === data.correo.toLowerCase() ? `${c.nombre} (tú)` : c.nombre}
            </option>
          ))}
          {opciones.haySinCse && <option value="sin">Sin CSE</option>}
        </Select>
        <Alternar activo={f.sinSesion} onClick={() => cambiar({ sinSesion: !f.sinSesion })}>
          Sin sesión agendada <span className="tabular-nums">{conteos.sinSesion}</span>
        </Alternar>
        <Alternar activo={f.sinPaso} onClick={() => cambiar({ sinPaso: !f.sinPaso })}>
          Sin siguiente paso <span className="tabular-nums">{conteos.sinPaso}</span>
        </Alternar>
        {(f.sinSesion || f.sinPaso || f.cse !== data.filtros.cse) && <BotonTexto onClick={() => cambiar({ ...data.filtros })}>Quitar filtros</BotonTexto>}
      </div>

      <p className="text-[13px] text-fg-muted">
        {quien}:{" "}
        {plural(conteos.total, "cuenta", "cuentas")} · {conteos.sinSesion} sin sesión agendada · {conteos.sinPaso} sin siguiente paso
        {conteos.sinCalendario > 0 && ` · ${conteos.sinCalendario} con el calendario sin leer`}. Primero lo
        que más pide atención. El siguiente paso es una tarea con fecha esta semana o una reunión en los próximos {DIAS_PARA_LA_REUNION} días.
      </p>

      {filas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface-muted p-5 text-center text-[13px] text-fg-muted">
          {data.filas.length === 0
            ? "No tienes cuentas de Customer Success abiertas: las cuentas salen de los proyectos de HubSpot donde eres el encargado."
            : "Ninguna cuenta con estos filtros."}
        </div>
      ) : (
        <section aria-label="Cuentas" className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className={cn("hidden gap-x-5 border-b border-line bg-surface-muted px-4 py-2 lg:grid", COLUMNAS)}>
            <span className={ROTULO}>Cuenta</span>
            <span className={ROTULO}>Próxima sesión</span>
            <span className={ROTULO}>Siguiente paso</span>
            <span className={ROTULO}>Temas que se están tratando</span>
            <span className={ROTULO}>Última reunión</span>
          </div>
          {filas.map((x) => (
            <Fila key={x.clientId} f={x} hoyISO={hoyISO} correo={data.correo} lider={data.lider} />
          ))}
        </section>
      )}
    </div>
  );
}

function Alternar({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors",
        activo ? "border-info-line bg-info-surface text-brand" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Fila({ f, hoyISO, correo, lider }: { f: FilaDeSeguimiento; hoyISO: string; correo: string; lider: boolean }) {
  const planificar = usePlanificarAccion();
  const agendar = () =>
    planificar({ correo, clientId: f.clientId, empresa: f.nombre, invitados: f.invitados, titulo: `Seguimiento con ${f.nombre}` });
  const faltaSesion = sinSesion(f);
  const dias = diasDesdeLaUltima(f, hoyISO);

  return (
    <div className={cn("grid grid-cols-1 gap-x-5 gap-y-2.5 border-t border-line px-4 py-3.5 first:border-t-0 lg:grid", COLUMNAS)}>
      {/* La cuenta y su CSE. */}
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          {f.salud && (
            <span title={f.porque ? `${NOMBRE_DE_SALUD[f.salud]}: ${f.porque}` : NOMBRE_DE_SALUD[f.salud]} className="inline-flex">
              <Punto className={PUNTO_DE_SALUD[f.salud]} />
              <span className="sr-only">{NOMBRE_DE_SALUD[f.salud]}</span>
            </span>
          )}
          <Link href={`/clients/${f.clientId}`} className="min-w-0 truncate text-[15px] font-semibold text-fg hover:text-brand">
            {f.nombre}
          </Link>
        </div>
        <p className="text-xs leading-4 text-fg-muted">
          {f.cse ? (
            <>CSE: {f.cse.email === correo.toLowerCase() ? "tú" : f.cse.nombre}</>
          ) : (
            <span className="text-warn-ink">Sin CSE{f.cseDeBaja ? ` · era de ${f.cseDeBaja}, que está de baja` : ""}</span>
          )}
          {!lider && !f.tuya && <span className={cn(CHIP, "ml-1.5 border border-line bg-surface-muted font-medium text-fg-muted")}>Compartida</span>}
        </p>
      </div>

      {/* La próxima sesión. */}
      <div className="min-w-0 space-y-1 text-[13px] leading-5">
        <span className={cn(ROTULO, "lg:hidden")}>Próxima sesión</span>
        {f.proximaSesion ? (
          <>
            <p className="text-fg">
              <span className="font-medium tabular-nums">
                {cuandoEsLaReunion(f.proximaSesion.inicio, hoyISO)} · {hora(f.proximaSesion.inicio)}
              </span>
              {f.proximaSesion.fuente === "tarea" && <span className="text-fg-muted"> · planeada en Tareas</span>}
            </p>
            <p className="truncate text-xs text-fg-muted" title={f.proximaSesion.titulo}>
              {f.proximaSesion.titulo}
            </p>
          </>
        ) : faltaSesion ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(CHIP, "bg-warn-surface text-warn-ink")}>○ Sin sesión agendada</span>
            <button type="button" className={BOTON_CHICO} onClick={agendar} title="Deja el borrador en tu agenda para revisarlo antes de abrirlo en Google Calendar">
              Agendar
            </button>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">No se pudo leer el calendario de quien la lleva.</p>
        )}
      </div>

      {/* El siguiente paso. */}
      <div className="min-w-0 space-y-1 text-[13px] leading-5">
        <span className={cn(ROTULO, "lg:hidden")}>Siguiente paso</span>
        {f.paso?.tipo === "accion" ? (
          <>
            <p className="text-fg" title={`T-${f.paso.numero} · ${f.paso.titulo}`}>
              <span className="text-success-ink">✓</span> <span className="tabular-nums text-fg-muted">T-{f.paso.numero}</span> {f.paso.titulo}
            </p>
            <p className="text-xs text-fg-muted">
              {f.pasoLleva ? (f.pasoLleva.email === correo.toLowerCase() ? "Lo llevas tú" : `Lo lleva ${f.pasoLleva.nombre}`) : "Sin responsable"} · para {elDia(f.paso.dia, hoyISO)}
            </p>
          </>
        ) : f.paso?.tipo === "reunion" ? (
          <>
            <p className="text-fg">
              <span className="text-success-ink">✓</span> La reunión de {elDia(f.paso.dia, hoyISO)}
            </p>
            <p className="text-xs text-fg-muted">{f.pasoLleva ? (f.pasoLleva.email === correo.toLowerCase() ? "En tu calendario" : `En el calendario de ${f.pasoLleva.nombre}`) : "Planeada en Tareas"}</p>
          </>
        ) : (
          <>
            <span className={cn(CHIP, "bg-warn-surface text-warn-ink")}>○ Sin siguiente paso</span>
            {sesionFueraDeLaRegla(f, hoyISO) && (
              <p className="text-xs text-fg-muted">
                La sesión es en más de {DIAS_PARA_LA_REUNION} días: falta una tarea con fecha esta semana.
              </p>
            )}
          </>
        )}
      </div>

      {/* Los temas. */}
      <div className="min-w-0 text-[13px] leading-5">
        <span className={cn(ROTULO, "lg:hidden")}>Temas que se están tratando</span>
        {f.temas.length === 0 ? (
          <p className="text-xs text-fg-muted">Sin temas registrados: ni minutas ni correos recientes.</p>
        ) : (
          <ul className="space-y-1">
            {f.temas.map((t, i) => (
              <li key={`${t.fuente}-${i}`} className="min-w-0">
                <p className="truncate text-fg" title={t.completo}>
                  {t.texto}
                </p>
                <p className="truncate text-[11px] text-fg-muted" title={`${NOMBRE_DEL_ORIGEN[t.origen]}: ${t.fuente}`}>
                  {t.href ? (
                    <Link href={t.href} className="hover:text-brand">
                      {NOMBRE_DEL_ORIGEN[t.origen]} · {diaCorto(t.fecha)}
                    </Link>
                  ) : (
                    <>
                      {NOMBRE_DEL_ORIGEN[t.origen]} {t.origen === "tarea" ? t.fuente : `· ${diaCorto(t.fecha)}`}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* La última reunión. */}
      <div className="min-w-0 space-y-1 text-[13px] leading-5">
        <span className={cn(ROTULO, "lg:hidden")}>Última reunión</span>
        {f.ultimaReunion ? (
          <>
            <p className={cn("tabular-nums", dias !== null && dias > 30 ? "text-warn-ink" : "text-fg")}>
              {diaCorto(f.ultimaReunion.fecha)} · {dias === 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`}
            </p>
            <Link href={`/sessions/${f.ultimaReunion.sessionId}`} className="block truncate text-xs text-fg-muted hover:text-brand" title={f.ultimaReunion.titulo}>
              {f.ultimaReunion.titulo}
            </Link>
          </>
        ) : (
          <p className="text-xs text-warn-ink">Sin reuniones con el cliente en {DIAS_DE_REUNIONES} días</p>
        )}
      </div>
    </div>
  );
}
