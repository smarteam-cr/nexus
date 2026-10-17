"use client";

/**
 * InicioDelDia — «Tu día» en el inicio de cada equipo (ficha D, 2026-10-17), medida por medida del diseño «Para ti ·
 * Ventas y CSE».
 *
 * Arriba, los cuatro números del día y «Tu día, según Nexus» (lo de Nexus, una sola vez). A la izquierda, la agenda como
 * Google Calendar y «Lo que importa hoy»; a la derecha, lo de cada equipo (el siguiente movimiento de Ventas, las
 * cuentas del CSE con su acción y su reunión, las tareas de hoy y los avisos). Tocar una reunión la abre en un panel al
 * costado, con su guía y su objetivo.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { huecoLibre, type PedazoDeFrase, type VarianteDelInicio } from "@/lib/mi-dia/inicio";
import type { Cifra, MovimientoDeVentas } from "@/lib/mi-dia/cifras";
import type { AgendaDeHoy } from "@/lib/mi-dia/agenda-server";
import type { CuentaDelInicio, TareaDelInicio } from "@/lib/mi-dia/inicio-server";
import type { AvisoVisto, ParaTi } from "@/lib/para-ti/tipos";
import AgendaDelInicio from "./AgendaDelInicio";
import PanelDeLaReunion, { type LoElegido } from "./PanelDeLaReunion";
import LoQueImportaHoy from "./LoQueImportaHoy";
import AvisosDelInicio from "./AvisosDelInicio";
import TusCuentasDelInicio from "./TusCuentasDelInicio";
import { TusTareasDeHoy, TusTareasInternas } from "./TareasDelInicio";
import { Punto, TARJETA, TITULO } from "./piezas";

export interface DatosDelInicio {
  variante: VarianteDelInicio;
  hoyISO: string;
  ahoraISO: string;
  correo: string;
  cifras: Cifra[];
  resumen: PedazoDeFrase[][];
  medicion: ParaTi;
  avisos: AvisoVisto[];
  agenda: { datos: AgendaDeHoy; vista: "dia" | "semana"; dia: string; enlaces: { hoy: string; anterior: string; siguiente: string; dia: string; semana: string } } | null;
  cuentas: CuentaDelInicio[];
  /** La pestaña con todas las cuentas (`?vista=cuentas`). */
  verLasCuentas: string | null;
  tareasDeHoy: { tareas: TareaDelInicio[]; total: number };
  tareasInternas: TareaDelInicio[] | null;
  movimiento: { lista: MovimientoDeVentas[]; total: number; verPipeline: string } | null;
  /** La reunión que se abre sola (la próxima con un cliente), o null. */
  abrirDeEntrada: string | null;
}

export default function InicioDelDia({ d }: { d: DatosDelInicio }) {
  const ahora = useMemo(() => new Date(d.ahoraISO), [d.ahoraISO]);
  const [elegida, setElegida] = useState<string | null>(d.abrirDeEntrada);
  const [sinHueco, setSinHueco] = useState(false);
  const [sinResumen, setSinResumen] = useState(false);

  const agenda = d.agenda;
  const reuniones = useMemo(() => (agenda?.datos.estado === "ok" ? agenda.datos.reuniones : []), [agenda]);
  const hueco = useMemo(
    () => (agenda && agenda.vista === "dia" && agenda.dia === d.hoyISO && !sinHueco ? huecoLibre(reuniones, d.hoyISO, ahora) : null),
    [agenda, reuniones, d.hoyISO, ahora, sinHueco],
  );
  const primero = d.medicion.importa[0] ?? null;
  const loElegido: LoElegido | null =
    elegida === "__hueco__" && hueco
      ? { tipo: "hueco", inicio: hueco.inicio, fin: hueco.fin, sugerencia: primero ? { titulo: primero.titulo, href: primero.href } : null }
      : (() => {
          const r = reuniones.find((x) => x.id === elegida);
          return r ? { tipo: "reunion" as const, reunion: r } : null;
        })();

  const conCuentas = d.variante === "cse" || d.variante === "csl" || d.variante === "dev";
  const esViernes = new Date(`${d.hoyISO}T00:00:00Z`).getUTCDay() === 5;
  const sinReunion = d.cuentas.filter((c) => c.servicio?.falta.includes("reunion")).length;
  const sinAccion = d.cuentas.filter((c) => c.servicio?.falta.includes("accion")).length;

  return (
    <div className="relative min-h-[1200px]">
      <div className="flex flex-col gap-6">
        <Cifras cifras={d.cifras} />

        {d.resumen.length > 0 && !sinResumen && (
          <section aria-label="Tu día según Nexus" className="flex items-start gap-3 rounded-[10px] border border-info-line bg-info-surface px-3.5 py-3">
            <IconoDeSugerencia className="mt-px h-[18px] w-[18px] flex-none text-brand" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className={cn(ROTULO_DEL_SISTEMA, "text-brand")}>Tu día, según Nexus</p>
              <p className="text-sm leading-[21px] text-fg">
                {d.resumen.map((frase, i) => (
                  <span key={i}>
                    {i > 0 && " "}
                    {frase.map((p, j) =>
                      p.fuerte ? (
                        <strong key={j} className="font-semibold">
                          {p.t}
                        </strong>
                      ) : (
                        <span key={j}>{p.t}</span>
                      ),
                    )}
                  </span>
                ))}
              </p>
            </div>
            <button type="button" aria-label="Ocultar el resumen" onClick={() => setSinResumen(true)} className="rounded px-1.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:text-fg">
              Ocultar
            </button>
          </section>
        )}

        <div className="flex flex-wrap items-start gap-6">
          <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
            {agenda && (
              <AgendaDelInicio
                agenda={agenda.datos}
                vista={agenda.vista}
                dia={agenda.dia}
                hoyISO={d.hoyISO}
                ahora={ahora}
                correo={d.correo}
                seleccion={elegida}
                onElegir={setElegida}
                hueco={hueco}
                enlaces={agenda.enlaces}
              />
            )}
            <LoQueImportaHoy medicion={d.medicion} />
            {d.variante === "cse" && esViernes && d.cuentas.length > 0 && (
              <section className={cn(TARJETA, "flex flex-wrap items-center gap-4 px-5 py-4")} aria-labelledby="semana-t">
                <div className="flex min-w-[260px] flex-1 flex-col gap-[3px]">
                  <h2 id="semana-t" className={TITULO}>
                    Es viernes: planifica la semana que viene
                  </h2>
                  <p className="text-[13px] leading-[19px] text-fg-secondary">
                    Deja una acción con fecha y una reunión para cada cuenta. «Agendar» abre Google Calendar con el título y los invitados.
                  </p>
                </div>
                <div className="flex gap-4 text-[13px] text-fg-secondary">
                  <span>
                    <strong className="font-semibold">{d.cuentas.length}</strong> {d.cuentas.length === 1 ? "cuenta" : "cuentas"}
                  </span>
                  {sinAccion > 0 && <span className="font-semibold text-warn-ink">{sinAccion} sin acción</span>}
                  {sinReunion > 0 && <span className="font-semibold text-warn-ink">{sinReunion} sin reunión</span>}
                </div>
                <Link
                  href="/tareas?vista=calendario"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
                >
                  Planificar la semana
                </Link>
              </section>
            )}
            {d.tareasInternas && <TusTareasInternas tareas={d.tareasInternas} hoyISO={d.hoyISO} />}
          </main>

          <aside className="flex min-w-0 max-w-[440px] flex-[1_1_360px] flex-col gap-6">
            {d.movimiento && <SiguienteMovimiento m={d.movimiento} />}
            {conCuentas && (
              <TusCuentasDelInicio
                cuentas={d.cuentas}
                titulo={d.variante === "csl" ? "La cartera" : d.variante === "dev" ? "Clientes con desarrollo" : "Tus cuentas"}
                max={5}
                verTodas={d.verLasCuentas}
                conQuienLaLleva={d.variante !== "cse"}
                hoyISO={d.hoyISO}
              />
            )}
            <TusTareasDeHoy tareas={d.tareasDeHoy.tareas} total={d.tareasDeHoy.total} hoyISO={d.hoyISO} />
            <AvisosDelInicio avisos={d.avisos} ahoraISO={d.ahoraISO} />
            {d.medicion.alDia.length > 0 && (
              <section aria-label="Al día" className="flex flex-col gap-2 rounded-xl border border-line bg-surface-muted p-4">
                <span className={ROTULO_DEL_SISTEMA}>También revisé y está al día</span>
                {d.medicion.alDia.map((t) => (
                  <span key={t} className="flex gap-2 text-[13px] leading-[19px] text-fg-secondary">
                    <span className="font-semibold text-success-ink">✓</span>
                    <span>{t}</span>
                  </span>
                ))}
              </section>
            )}
          </aside>
        </div>
      </div>

      {loElegido && (
        <PanelDeLaReunion
          elegido={loElegido}
          hoyISO={d.hoyISO}
          ahora={ahora}
          correo={d.correo}
          onCerrar={() => setElegida(null)}
          onDescartarHueco={() => {
            setSinHueco(true);
            setElegida(null);
          }}
        />
      )}
    </div>
  );
}

function Cifras({ cifras }: { cifras: Cifra[] }) {
  if (cifras.length === 0) return null;
  return (
    <section aria-label="Tu día en números" className={cn(TARJETA, "grid grid-cols-2 lg:grid-cols-4")}>
      {cifras.map((c, i) => (
        <div key={c.clave} className={cn("flex flex-col gap-1 border-line px-5 py-4", i % 2 === 1 && "border-l", i >= 2 && "max-lg:border-t", i > 0 && "lg:border-l")}>
          <p className={ROTULO_DEL_SISTEMA}>{c.rotulo}</p>
          {c.colores ? (
            <div className="flex flex-wrap items-baseline gap-3 pt-1.5 text-[13px] text-fg-secondary">
              <span className="flex items-center gap-1.5">
                <Punto className="bg-destructive" />
                <strong className="text-xl font-semibold text-fg">{c.colores.riesgo}</strong> riesgo
              </span>
              <span className="flex items-center gap-1.5">
                <Punto className="bg-warning" />
                <strong className="text-xl font-semibold text-fg">{c.colores.senales}</strong> señales
              </span>
              <span className="flex items-center gap-1.5">
                <Punto className="bg-success" />
                <strong className="text-xl font-semibold text-fg">{c.colores.bien}</strong> bien
              </span>
            </div>
          ) : (
            <p className="text-[26px] font-semibold leading-8 text-fg">
              {c.valor}
              {c.unidad && <span className="ml-1.5 text-[13px] font-normal text-fg-muted">{c.unidad}</span>}
            </p>
          )}
          {c.barra != null && (
            <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, c.barra))}%` }} />
            </div>
          )}
          {c.sub && <p className={cn("text-xs", c.subAviso ? "text-warn-ink" : "text-fg-muted")}>{c.sub}</p>}
        </div>
      ))}
    </section>
  );
}

function SiguienteMovimiento({ m }: { m: NonNullable<DatosDelInicio["movimiento"]> }) {
  return (
    <section className={cn(TARJETA, "flex flex-col gap-3 p-5")} aria-labelledby="mov-t">
      <div className="flex items-baseline justify-between">
        <h2 id="mov-t" className={TITULO}>
          Tu siguiente movimiento
        </h2>
        <span className="text-xs text-fg-muted">cierran en 60 días</span>
      </div>
      {m.lista.length === 0 ? (
        <p className="border-t border-line pt-2.5 text-[13px] text-fg-muted">Ningún negocio tuyo cierra en los próximos 60 días.</p>
      ) : (
        <ol className="flex flex-col">
          {m.lista.map((n, i) => (
            <li key={n.id} className="flex gap-3 border-t border-line px-1 py-2.5 transition-colors hover:bg-surface-muted">
              <span className="w-[18px] pt-px text-xs font-semibold text-fg-muted">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex justify-between gap-2">
                  {n.clientId ? (
                    <Link href={`/clients/${encodeURIComponent(n.clientId)}`} className="truncate text-[13px] font-semibold text-fg hover:text-brand">
                      {n.empresa}
                    </Link>
                  ) : (
                    <span className="truncate text-[13px] font-semibold text-fg">{n.empresa}</span>
                  )}
                  <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-fg">{n.monto ?? "Sin monto"}</span>
                </div>
                <span className="truncate text-xs text-fg-muted" title={n.linea}>
                  {n.linea}
                </span>
                <span className={cn("flex items-center gap-1.5 text-xs", n.estado.tono === "aviso" ? "text-warn-ink" : "text-fg-secondary")}>
                  <Punto className={n.estado.tono === "aviso" ? "bg-warning" : "bg-success"} />
                  <span className="truncate">{n.estado.texto}</span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Link href={m.verPipeline} className="text-[13px] font-medium text-brand transition-colors hover:text-brand-light">
        Ver los {m.total} del pipeline
      </Link>
    </section>
  );
}
