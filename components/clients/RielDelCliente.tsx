"use client";

/**
 * RielDelCliente — la barra izquierda de la ficha del cliente (rediseño del 2026-10-04, sistema
 * «Nexus · interfaz interna», como el riel de la preventa). Reemplaza a tres cosas que vivían
 * separadas: las pestañas de proyecto, las pestañas «Procesos» e «Información del cliente», y el
 * desplegable de piezas de cada proyecto.
 *
 *  · PROYECTOS: uno por fila, con su tipo debajo. Debajo del proyecto abierto cuelgan sus piezas
 *    (las pinta `PiezasDelRiel`, por portal, desde el panel del proyecto: es el que sabe cuáles
 *    tiene y en qué estado están).
 *  · LA CUENTA: «Información del cliente», «Procesos», «La escala» y «Casos de uso» (2026-10-12: dónde está la
 *    empresa en la escala y lo que se hace con ella, venga o no de una preventa) y «Fuera de alcance» (2026-10-07:
 *    las solicitudes fuera de alcance de todos sus proyectos, con su seguimiento).
 *  · Al pie, «Traer proyectos de HubSpot».
 *
 * Copia medida por medida el riel de la preventa: filas de 14 px con un punto de 8 px, la pieza
 * abierta en azul sobre azul claro, lo colgado con una línea a la izquierda.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { EstadoDePieza } from "@/components/canvas/SelectorDePiezas";
import { IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";

export type CuentaDelRiel = "info" | "procesos" | "personas" | "notas" | "tareas" | "escala" | "casos" | "solicitudes";

export interface ProyectoDelRiel {
  id: string;
  nombre: string;
  /** El tipo en palabras («Implementación de HubSpot», «Desarrollo · hermano de …»). */
  tipo: string;
  /** Lo que el tipo implica para la plata y la cartera, en el `title`. */
  ayuda?: string;
  /** Un proyecto de prueba (2026-10-11): lleva su marca, para no confundirlo con el real. */
  prueba?: boolean;
}

export default function RielDelCliente({
  proyectos,
  activo,
  proyectoDelRiel,
  onElegirProyecto,
  onElegirCuenta,
  cuentaActiva,
  avisoDeLaFicha,
  slotDePiezas,
  traer,
}: {
  proyectos: ProyectoDelRiel[];
  /** El proyecto abierto en el centro (null si se mira algo de la cuenta). */
  activo: string | null;
  /** El proyecto cuyas piezas se ven colgadas: el abierto, o el último que se abrió. */
  proyectoDelRiel: string | null;
  onElegirProyecto: (id: string) => void;
  onElegirCuenta: (que: CuentaDelRiel) => void;
  cuentaActiva: CuentaDelRiel | null;
  /** El contador de campos que propuso la IA en la ficha (`AvisoDeFicha`). */
  avisoDeLaFicha: ReactNode;
  /** Dónde el panel del proyecto pinta sus piezas. */
  slotDePiezas: (el: HTMLDivElement | null) => void;
  traer: { visible: boolean; sincronizando: boolean; onClick: () => void };
}) {
  return (
    <nav aria-label="Proyectos y piezas del cliente" data-recorrido="ficha.riel" className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <p className={cn(ROTULO_DEL_SISTEMA, "px-2.5 pb-1.5 pt-1")}>Proyectos</p>
        {proyectos.length === 0 && (
          <p className="px-2.5 py-1 text-[13px] text-fg-muted">Esta empresa todavía no tiene proyectos abiertos.</p>
        )}
        {proyectos.map((p) => {
          const abierto = p.id === proyectoDelRiel;
          const enCentro = p.id === activo;
          return (
            <div key={p.id} className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => onElegirProyecto(p.id)}
                title={p.ayuda}
                aria-current={enCentro ? "true" : undefined}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={cn("mt-1 h-3 w-3 flex-shrink-0 text-fg-muted transition-transform", abierto && "rotate-90")}
                  aria-hidden="true"
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
                <span className="flex min-w-0 flex-col gap-px">
                  <span className={cn("text-sm leading-[1.35]", abierto ? "font-semibold text-fg" : "font-medium text-fg-secondary")}>{p.nombre}</span>
                  <span className={cn("text-xs leading-[1.35]", p.prueba ? "font-medium text-warn-ink" : "text-fg-muted")}>{p.tipo}</span>
                </span>
              </button>
              {abierto && <div ref={slotDePiezas} />}
            </div>
          );
        })}

        <div className="mx-1 my-2.5 border-t border-line" />
        <p className={cn(ROTULO_DEL_SISTEMA, "px-2.5 pb-1.5")}>La cuenta</p>
        <FilaDeCuenta
          etiqueta="Información del cliente"
          activa={cuentaActiva === "info"}
          onClick={() => onElegirCuenta("info")}
          extra={avisoDeLaFicha}
        />
        <FilaDeCuenta etiqueta="Procesos" activa={cuentaActiva === "procesos"} onClick={() => onElegirCuenta("procesos")} />
        <FilaDeCuenta etiqueta="Personas y tickets" activa={cuentaActiva === "personas"} onClick={() => onElegirCuenta("personas")} />
        <FilaDeCuenta etiqueta="Tareas" activa={cuentaActiva === "tareas"} onClick={() => onElegirCuenta("tareas")} />
        <FilaDeCuenta etiqueta="Notas" activa={cuentaActiva === "notas"} onClick={() => onElegirCuenta("notas")} />
        <FilaDeCuenta etiqueta="La escala" activa={cuentaActiva === "escala"} onClick={() => onElegirCuenta("escala")} />
        <FilaDeCuenta etiqueta="Casos de uso" activa={cuentaActiva === "casos"} onClick={() => onElegirCuenta("casos")} />
        <FilaDeCuenta etiqueta="Fuera de alcance" activa={cuentaActiva === "solicitudes"} onClick={() => onElegirCuenta("solicitudes")} />
      </div>

      {traer.visible && (
        <div className="lg:mt-auto">
          <button
            type="button"
            onClick={traer.onClick}
            disabled={traer.sincronizando}
            title="Trae los proyectos que esta empresa tenga en HubSpot y todavía no estén acá. No borra nada."
            className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-left text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn("h-4 w-4 flex-shrink-0", traer.sincronizando && "animate-spin")} aria-hidden="true">
              <path d="M4 4v5h5M20 20v-5h-5" />
              <path d="M5.6 15A7 7 0 0018.4 15M18.4 9A7 7 0 005.6 9" />
            </svg>
            {traer.sincronizando ? "Trayendo…" : "Traer proyectos de HubSpot"}
          </button>
        </div>
      )}
    </nav>
  );
}

function FilaDeCuenta({ etiqueta, activa, onClick, extra }: { etiqueta: string; activa: boolean; onClick: () => void; extra?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        activa ? "bg-info-surface font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
      )}
    >
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", activa ? "bg-brand" : "bg-fg-muted/30")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
      {extra}
    </button>
  );
}

// ── Las piezas de un proyecto, colgadas de su fila ───────────────────────────

export interface FilaDelRielDePiezas {
  slug: string;
  etiqueta: string;
  estado: EstadoDePieza | "por_activar";
  activa: boolean;
  /** Lo que se lee a la derecha: «desactualizado» (ámbar), «Antes: Kickoff» (gris). */
  aviso?: { corto: string; largo?: string; tono: "atencion" | "neutro" } | null;
  /** El handoff dejó una propuesta sin decidir en esta pieza (el cronograma). */
  propuesta?: boolean;
  /**
   * Etapa 6: cuántas novedades de reuniones tiene esta pieza (lo que una reunión le cambia; lib/seguimiento/novedades.ts).
   * Se pinta con la misma chispa que la propuesta y el número, DESPUÉS del aviso («desactualizado» no se esconde: sin ese
   * renglón el CSE creía que la pieza estaba al día). La propuesta del cronograma gana sobre los dos.
   */
  novedades?: number;
  ocupada?: boolean;
  /**
   * El grupo de la fila (2026-10-12): en un servicio recurrente, «Ciclo · Implementación» sobre los artefactos del
   * ciclo. El rótulo se pinta arriba de la primera fila VISIBLE del grupo (así ocultar la primera no lo borra). No
   * se cliquea.
   */
  grupo?: { id: string; titulo: string; detalle?: string | null };
  /** El equipo la ocultó del riel (2026-10-12): va plegada en «Ver N piezas más», salvo mientras está abierta. */
  oculta?: boolean;
}

const PUNTO: Record<EstadoDePieza, string> = {
  generada: "bg-success",
  pendiente: "bg-fg-muted/30",
  vacia: "bg-fg-muted/30",
};

/**
 * Las filas de piezas del proyecto abierto. Las pinta `ProjectCanvasPanel` por portal adentro del
 * riel: el estado de cada pieza (generada, vacía, desactualizada) y su activación viven allá.
 *
 * El punto de color dice el estado y nunca solo: «desactualizado» va escrito, la propuesta lleva la
 * chispa, y lo que todavía no existe en el proyecto queda plegado en «Ver N piezas más», junto con lo que
 * el equipo ocultó (2026-10-12: cada fila se oculta con el ojo que aparece al pasar el mouse). Las
 * novedades de las reuniones (etapa 6) llevan la misma chispa con su número; el aviso que tapan va en el `title`.
 */
export function PiezasDelRiel({
  resumen,
  filas,
  porActivarAbiertas,
  onAlternarPorActivar,
  onElegir,
  onActivar,
  onOcultar,
  slotDeSesiones,
}: {
  resumen: { activa: boolean; meta?: string | null; onClick: () => void };
  filas: FilaDelRielDePiezas[];
  porActivarAbiertas: boolean;
  onAlternarPorActivar: () => void;
  onElegir: (slug: string) => void;
  onActivar: (slug: string) => void;
  /** Ocultar (`true`) o volver a mostrar (`false`) una pieza del riel. Sin él, las filas no se ocultan. */
  onOcultar?: (slug: string, oculta: boolean) => void;
  /**
   * Debajo de la fila «Exploración», cuando está abierta: ahí la exploración del proyecto pinta sus
   * sesiones por portal, como la preventa las cuelga de su pieza (2026-10-07).
   */
  slotDeSesiones?: (el: HTMLDivElement | null) => void;
}) {
  // La pieza abierta se ve en su lugar aunque esté oculta: no se pierde de vista dónde se está.
  const existentes = filas.filter((f) => f.estado !== "por_activar" && (!f.oculta || f.activa));
  const ocultas = filas.filter((f) => f.estado !== "por_activar" && f.oculta && !f.activa);
  const porActivar = filas.filter((f) => f.estado === "por_activar");
  const plegadas = ocultas.length + porActivar.length;
  const clase = (activa: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
      activa ? "bg-info-surface font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
    );
  return (
    <ul className="mb-1.5 ml-[18px] space-y-0.5 border-l border-line pl-2">
      <li>
        <button type="button" onClick={resumen.onClick} aria-current={resumen.activa ? "page" : undefined} className={clase(resumen.activa)}>
          <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", resumen.activa ? "bg-brand" : "bg-transparent")} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Resumen</span>
          {resumen.meta && <span className={cn("flex-shrink-0 text-[11.5px]", resumen.activa ? "" : "text-fg-muted")}>{resumen.meta}</span>}
        </button>
      </li>
      {existentes.map((f, k) => (
        <li key={f.slug}>
          {f.grupo && f.grupo.id !== existentes[k - 1]?.grupo?.id && (
            <p className="flex items-baseline justify-between gap-2 px-2.5 pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
              <span className="min-w-0 truncate" title={f.grupo.titulo}>
                {f.grupo.titulo}
              </span>
              {f.grupo.detalle && <span className="flex-shrink-0 font-normal normal-case tracking-normal">{f.grupo.detalle}</span>}
            </p>
          )}
          <div className="group/fila relative flex items-center">
          <button
            type="button"
            // Con «Exploración» ya abierta, el clic vuelve a su página de inicio (lo escucha LienzoDeExploracion).
            onClick={() => (f.slug === "exploration" && f.activa ? window.dispatchEvent(new Event("exploracion:inicio")) : onElegir(f.slug))}
            aria-current={f.activa ? "page" : undefined}
            data-recorrido={f.propuesta ? "ficha.propuesta" : f.slug === "questionnaires" ? "ficha.cuestionarios" : undefined}
            title={
              !f.propuesta && (f.novedades ?? 0) > 0
                ? `${f.novedades === 1 ? "1 novedad de una reunión" : `${f.novedades} novedades de reuniones`} para revisar${f.aviso?.largo ? `. ${f.aviso.largo}` : ""}`
                : (f.aviso?.largo ?? (f.estado === "generada" ? "Generada" : "Todavía sin contenido: entra y genérala"))
              /* Los Cuestionarios (2026-10-11) traen siempre su aviso («sin enviar», «enviado», «respondido 1 de 2»):
                 no se generan, se mandan. */
            }
            className={cn(clase(f.activa), onOcultar && "pr-7")}
          >
            <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", f.activa ? "bg-brand" : PUNTO[f.estado as EstadoDePieza])} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{f.etiqueta}</span>
            {f.propuesta ? (
              <span
                className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full border border-info-line bg-info-surface py-0 pl-1 pr-1.5 text-[11px] font-semibold text-brand"
                title="Tiene una propuesta sin decidir"
              >
                <IconoDeSugerencia className="h-3 w-3" />
                propuesta
              </span>
            ) : (
              // El aviso («desactualizado», lo que le falta) va primero y no se esconde detrás de las novedades: es el
              // mismo orden que «Qué sigue» (lib/clients/que-sigue-del-proyecto.ts).
              <>
                {f.aviso && (
                  <span className={cn("flex-shrink-0 text-[11.5px]", f.aviso.tono === "atencion" ? "text-warn-ink" : "text-fg-muted")}>{f.aviso.corto}</span>
                )}
                {(f.novedades ?? 0) > 0 && (
                  <span
                    data-recorrido="ficha.novedades"
                    className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full border border-info-line bg-info-surface py-0 pl-1 pr-1.5 text-[11px] font-semibold tabular-nums text-brand"
                  >
                    <IconoDeSugerencia className="h-3 w-3" />
                    {f.novedades}
                  </span>
                )}
              </>
            )}
          </button>
          {onOcultar && (
            <button
              type="button"
              onClick={() => onOcultar(f.slug, !f.oculta)}
              aria-label={f.oculta ? `Mostrar «${f.etiqueta}» en el riel` : `Ocultar «${f.etiqueta}» del riel`}
              title={f.oculta ? "Volver a mostrarla en el riel" : "Ocultarla del riel: queda en «Ver más piezas»"}
              className="absolute right-1 flex h-6 w-6 items-center justify-center rounded-md text-fg-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 group-hover/fila:opacity-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                {f.oculta ? (
                  <>
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.7 9.7 0 0112 5c5 0 9 4.5 10 7a13 13 0 01-3.2 4.3M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7a9.6 9.6 0 004.4-1" />
                )}
              </svg>
            </button>
          )}
          </div>
          {f.slug === "exploration" && f.activa && slotDeSesiones && <div ref={slotDeSesiones} />}
        </li>
      ))}
      {plegadas > 0 && (
        <li>
          <button
            type="button"
            onClick={onAlternarPorActivar}
            aria-expanded={porActivarAbiertas}
            className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            {porActivarAbiertas ? "Ver menos" : `Ver ${plegadas} ${plegadas === 1 ? "pieza" : "piezas"} más +`}
          </button>
        </li>
      )}
      {porActivarAbiertas &&
        ocultas.map((f) => (
          <li key={f.slug}>
            <div className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-fg-muted">
              <button
                type="button"
                onClick={() => onElegir(f.slug)}
                title="Abrirla (sigue oculta del riel)"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition-colors hover:text-fg"
              >
                <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PUNTO[f.estado as EstadoDePieza])} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{f.etiqueta}</span>
              </button>
              {onOcultar && (
                <button type="button" onClick={() => onOcultar(f.slug, false)} className="flex-shrink-0 text-[11.5px] text-brand hover:text-brand-light">
                  Mostrar
                </button>
              )}
            </div>
          </li>
        ))}
      {porActivarAbiertas &&
        porActivar.map((f) => (
          <li key={f.slug}>
            <button
              type="button"
              onClick={() => onActivar(f.slug)}
              disabled={f.ocupada}
              title={f.aviso?.largo ?? "Este proyecto todavía no la tiene: actívala para empezar a trabajarla"}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-60"
            >
              <span className="h-2 w-2 flex-shrink-0 rounded-full border border-dashed border-line" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{f.etiqueta}</span>
              <span className="flex-shrink-0 text-[11.5px]">{f.ocupada ? "Activando…" : "Activar"}</span>
            </button>
          </li>
        ))}
    </ul>
  );
}
