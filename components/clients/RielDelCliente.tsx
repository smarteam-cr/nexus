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
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { repartirElRiel } from "@/lib/flow/reparto-del-riel";
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
  /** Se le puede cambiar el nombre desde acá: un documento de un tipo que admite copias. */
  canvasId?: string | null;
  /** Se le cambia el nombre aunque no tenga canvas: los Cuestionarios de siempre. */
  renombrable?: boolean;
  /** El tipo del documento: una copia de Exploración cuelga sus sesiones igual que la de siempre. */
  tipo?: string;
  estado: EstadoDePieza | "sin_crear";
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
  /** El equipo la desancló (2026-10-12): va plegada en «Ver N sin anclar» (lib/flow/reparto-del-riel.ts). */
  oculta?: boolean;
  /** Una COPIA de un tipo (etapa V3, docs/artefactos-plan.md): no se desancla (se archiva desde su barra). */
  esCopia?: boolean;
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
 * chispa, y lo que todavía no se creó no sale: se crea con el + de cada grupo (Elías, 30 oct). Lo que el equipo desancló
 * queda plegado en «Ver N sin anclar», y anclar o desanclar vive ahí mismo. Las novedades de las reuniones (etapa 6) llevan
 * la misma chispa con su número; el aviso que tapan va en el `title`.
 */
export function PiezasDelRiel({
  resumen,
  filas,
  porActivarAbiertas,
  onAlternarPorActivar,
  onElegir,
  onOcultar,
  slotDeSesiones,
  grupoDelResumen,
  grupoAlFinal,
  onNuevoArtefacto,
  onRenombrar,
}: {
  resumen: { activa: boolean; meta?: string | null; onClick: () => void; /** Algo del proyecto pide atención: va como ícono, con esta frase. */ alerta?: string | null };
  /**
   * El grupo al que pertenece el Resumen (2026-10-17: «Herramientas del proyecto»). Su rótulo va arriba del Resumen, y
   * las filas que siguen del mismo grupo no lo repiten. Sin él (un servicio recurrente), el Resumen va sin rótulo.
   */
  grupoDelResumen?: { id: string; titulo: string; detalle?: string | null };
  /** El grupo que va siempre, aunque no le quede ninguna fila: su + es por donde se crea lo primero de él. */
  grupoAlFinal?: { id: string; titulo: string };
  filas: FilaDelRielDePiezas[];
  porActivarAbiertas: boolean;
  onAlternarPorActivar: () => void;
  onElegir: (slug: string) => void;
  /** Desanclar (`true`) o volver a anclar (`false`) una pieza. Sin él, las filas no se desanclan. */
  onOcultar?: (slug: string, oculta: boolean) => void;
  /**
   * Debajo de la fila «Exploración», cuando está abierta: ahí la exploración del proyecto pinta sus
   * sesiones por portal, como la preventa las cuelga de su pieza (2026-10-07).
   */
  slotDeSesiones?: (el: HTMLDivElement | null) => void;
  /** El + junto al título de cada grupo: crea un artefacto de ese grupo. Sin él, no se pinta. */
  onNuevoArtefacto?: (grupo: string) => void;
  /** Cambiar el nombre desde acá, con doble clic o con el lápiz que aparece al pasar el mouse. true si quedó guardado. */
  onRenombrar?: (canvasId: string | null, nombre: string) => Promise<boolean>;
}) {
  const [renombrando, setRenombrando] = useState<{ slug: string; canvasId: string | null; nombre: string; original: string } | null>(null);
  const seRenombra = (f: FilaDelRielDePiezas) => !!onRenombrar && (!!f.canvasId || !!f.renombrable);
  const empezarARenombrar = (f: FilaDelRielDePiezas) => seRenombra(f) && setRenombrando({ slug: f.slug, canvasId: f.canvasId ?? null, nombre: f.etiqueta, original: f.etiqueta });
  // Enter y salir del campo llegan juntos: sin esto, los Cuestionarios de siempre crearían dos copias.
  const guardandoNombre = useRef(false);
  const guardarNombre = async () => {
    if (!renombrando || guardandoNombre.current) return;
    const nombre = renombrando.nombre.trim();
    guardandoNombre.current = true;
    const listo = !nombre || nombre === renombrando.original || (await onRenombrar?.(renombrando.canvasId, nombre));
    guardandoNombre.current = false;
    if (listo) setRenombrando(null);
  };
  const { existentes, ocultasALaVista, ocultables, plegadas } = repartirElRiel(filas, porActivarAbiertas);
  const hayQueOcultar = !!onOcultar && ocultables.length > 0;
  const esExploracion = (f: FilaDelRielDePiezas) => (f.tipo ?? f.slug) === "exploration";
  // Con una exploración ya abierta, el clic vuelve a su página de inicio (lo escucha LienzoDeExploracion).
  const elegir = (f: FilaDelRielDePiezas) => (esExploracion(f) && f.activa ? window.dispatchEvent(new Event("exploracion:inicio")) : onElegir(f.slug));
  const clase = (activa: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
      activa ? "bg-info-surface font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
    );
  const rotuloDeGrupo = (g: { id?: string; titulo: string; detalle?: string | null }) => (
    <div className="flex items-center justify-between gap-2 px-2.5 pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
      <span className="min-w-0 truncate" title={g.titulo}>
        {g.titulo}
      </span>
      {g.detalle && <span className="flex-shrink-0 font-normal normal-case tracking-normal">{g.detalle}</span>}
      {g.id && onNuevoArtefacto && (
        <button
          type="button"
          onClick={() => onNuevoArtefacto(g.id!)}
          aria-label={`Nuevo artefacto en ${g.titulo}`}
          title="Nuevo artefacto"
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[15px] font-normal leading-none text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          +
        </button>
      )}
    </div>
  );
  return (
    <ul className="mb-1.5 ml-[18px] space-y-0.5 border-l border-line pl-2">
      <li>
        {grupoDelResumen && rotuloDeGrupo(grupoDelResumen)}
        <button type="button" onClick={resumen.onClick} aria-current={resumen.activa ? "page" : undefined} className={clase(resumen.activa)}>
          <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", resumen.activa ? "bg-brand" : "bg-transparent")} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Resumen</span>
          {resumen.alerta && (
            <span className="flex-shrink-0 text-warn-ink" title={resumen.alerta} role="img" aria-label={resumen.alerta}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
              </svg>
            </span>
          )}
          {resumen.meta && <span className={cn("flex-shrink-0 text-[11.5px]", resumen.activa ? "" : "text-fg-muted")}>{resumen.meta}</span>}
        </button>
      </li>
      {existentes.map((f, k) => (
        <li key={f.slug}>
          {f.grupo && f.grupo.id !== (k === 0 ? grupoDelResumen : existentes[k - 1]?.grupo)?.id && rotuloDeGrupo(f.grupo)}
          <div className="group/fila relative flex items-center">
          {renombrando?.slug === f.slug ? (
            <form
              className="w-full px-1 py-0.5"
              onSubmit={(e) => {
                e.preventDefault();
                void guardarNombre();
              }}
            >
              <input
                autoFocus
                value={renombrando.nombre}
                maxLength={120}
                aria-label={`Nombre de «${f.etiqueta}»`}
                onChange={(e) => setRenombrando({ ...renombrando, nombre: e.target.value })}
                onBlur={() => void guardarNombre()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenombrando(null);
                }}
                className="w-full rounded-md border border-brand bg-surface px-2 py-1 text-[13px] text-fg focus:outline-none"
              />
            </form>
          ) : (
          <button
            type="button"
            onClick={() => elegir(f)}
            onDoubleClick={() => empezarARenombrar(f)}
            aria-current={f.activa ? "page" : undefined}
            data-recorrido={f.propuesta ? "ficha.propuesta" : f.slug === "questionnaires" ? "ficha.cuestionarios" : undefined}
            title={
              !f.propuesta && (f.novedades ?? 0) > 0
                ? `${f.novedades === 1 ? "1 novedad de una reunión" : `${f.novedades} novedades de reuniones`} para revisar${f.aviso?.largo ? `. ${f.aviso.largo}` : ""}`
                : (f.aviso?.largo ?? (f.estado === "generada" ? "Generada" : "Todavía sin contenido: entra y genérala"))
              /* Los Cuestionarios (2026-10-11) traen siempre su aviso («sin enviar», «enviado», «respondido 1 de 2»):
                 no se generan, se mandan. */
            }
            className={cn(clase(f.activa), seRenombra(f) && "pr-7")}
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
          )}
          {seRenombra(f) && renombrando?.slug !== f.slug && (
            <button
              type="button"
              onClick={() => empezarARenombrar(f)}
              aria-label={`Cambiar el nombre de «${f.etiqueta}»`}
              title="Cambiar el nombre"
              className="absolute right-1 flex h-6 w-6 items-center justify-center rounded-md text-fg-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 group-hover/fila:opacity-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
          )}
          </div>
          {esExploracion(f) && f.activa && slotDeSesiones && <div ref={slotDeSesiones} />}
        </li>
      ))}
      {grupoAlFinal && !existentes.some((f) => f.grupo?.id === grupoAlFinal.id) && <li>{rotuloDeGrupo(grupoAlFinal)}</li>}
      {(plegadas > 0 || hayQueOcultar) && (
        <li>
          <button
            type="button"
            onClick={onAlternarPorActivar}
            aria-expanded={porActivarAbiertas}
            className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            {porActivarAbiertas ? "Ver menos" : plegadas > 0 ? `Ver ${plegadas} sin anclar` : "Anclar o desanclar"}
          </button>
        </li>
      )}
      {ocultasALaVista.map((f) => (
          <li key={f.slug}>
            <div className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px]", f.activa ? "bg-info-surface font-semibold text-brand" : "text-fg-muted")}>
              <button
                type="button"
                onClick={() => elegir(f)}
                aria-current={f.activa ? "page" : undefined}
                title="Abrirla (sigue sin anclar)"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition-colors hover:text-fg"
              >
                <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", f.activa ? "bg-brand" : PUNTO[f.estado as EstadoDePieza])} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{f.etiqueta}</span>
              </button>
              {onOcultar && (
                <button type="button" onClick={() => onOcultar(f.slug, false)} className="flex-shrink-0 text-[11.5px] font-normal text-brand hover:text-brand-light">
                  Anclar
                </button>
              )}
            </div>
            {esExploracion(f) && f.activa && slotDeSesiones && <div ref={slotDeSesiones} />}
          </li>
        ))}
      {porActivarAbiertas && hayQueOcultar && (
        <>
          <li>{rotuloDeGrupo({ titulo: "Anclados" })}</li>
          {ocultables.map((f) => (
            <li key={`ocultar:${f.slug}`} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1 text-[13px] text-fg-muted">
              <span className="min-w-0 flex-1 truncate pl-[18px]">{f.etiqueta}</span>
              <button
                type="button"
                onClick={() => onOcultar?.(f.slug, true)}
                aria-label={`Desanclar «${f.etiqueta}»`}
                title="Sale de la lista y queda aquí, en «Sin anclar». No borra nada."
                className="flex-shrink-0 text-[11.5px] text-brand hover:text-brand-light"
              >
                Desanclar
              </button>
            </li>
          ))}
        </>
      )}
    </ul>
  );
}
