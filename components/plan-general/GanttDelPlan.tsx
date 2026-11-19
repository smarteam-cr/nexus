"use client";

/**
 * GanttDelPlan — el dibujo del plan general de la cuenta (2026-11-19, kölbi), el mismo para el equipo y para el
 * cliente: una fila por actividad, agrupadas por loop (01 → 07), las semanas como columnas, la de hoy marcada, y la
 * barra en verde si está hecha y en azul si está en curso o por iniciar (como el plan que Valentina presentaba).
 *
 * Los colores salen de variables propias (`--pg-*`) que pone el `tema`: «interno» las apunta a los tokens de la app
 * (flipean en claro y oscuro, invariante 5) y «cliente» a hex literal, porque la página externa es un documento claro
 * que no conoce el tema de la app (ARCHITECTURE §1-WEB). Así el dibujo es uno solo y no se copia.
 *
 * La semana de hoy se calcula DESPUÉS de montar, con la fecha de quien mira (lib/timeline/weeks.ts: la fecha de hoy
 * nunca en SSR).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { semanaActualDelPlan } from "@/lib/plan-general/armar";
import { addWeeks, fmtDay } from "@/lib/timeline/weeks";
import { ETIQUETA_DEL_TIPO, rotuloDelLoop, type EstadoDelPlan, type TipoDeTrabajo } from "@/lib/plan-general/tipos";

export interface FilaDelGantt {
  key: string;
  titulo: string;
  tipo: TipoDeTrabajo | null;
  desde: number;
  hasta: number;
  estado: EstadoDelPlan;
  /** Solo el equipo: la sugirió un agente y nadie la revisó (el cliente no la ve). */
  porValidar?: boolean;
}

export interface GrupoDelGantt {
  key: string;
  loopNumero: number;
  nombre: string;
  filas: FilaDelGantt[];
  /** Solo el equipo: de qué proyecto es el loop (se lee debajo del nombre). */
  proyecto?: string;
}

const TEMAS: Record<"interno" | "cliente", CSSProperties> = {
  interno: {
    "--pg-fg": "var(--color-fg)",
    "--pg-fg2": "var(--color-fg-secondary)",
    "--pg-muted": "var(--color-fg-muted)",
    "--pg-line": "var(--color-line)",
    "--pg-zebra": "var(--color-surface-muted)",
    "--pg-hecho": "var(--color-success)",
    "--pg-plan": "var(--color-brand)",
    "--pg-curso": "var(--color-warn-ink)",
    "--pg-hover": "var(--color-surface-hover)",
  } as CSSProperties,
  cliente: {
    "--pg-fg": "#0f1f3d",
    "--pg-fg2": "#33415c",
    "--pg-muted": "#6b7a90",
    "--pg-line": "#e3e8ef",
    "--pg-zebra": "#f4f6fa",
    "--pg-hecho": "#2fb344",
    "--pg-plan": "#1f56d6",
    "--pg-curso": "#e8590c",
    "--pg-hover": "#eef2f8",
  } as CSSProperties,
};

const ANCHO_SEMANA = 52;

export default function GanttDelPlan({
  grupos,
  semanas,
  arranque,
  tema,
  onElegirFila,
  onAgregar,
}: {
  grupos: GrupoDelGantt[];
  semanas: number;
  arranque: string | null;
  tema: "interno" | "cliente";
  /** Solo el equipo: abrir una actividad para editarla. */
  onElegirFila?: (grupoKey: string, filaKey: string) => void;
  /** Solo el equipo: «+ Actividad» al pie de cada loop. */
  onAgregar?: (grupoKey: string) => void;
}) {
  const [hoy, setHoy] = useState<number | null>(null);
  // La fecha de quien mira, después de montar (nunca en SSR).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- la semana de hoy depende del reloj del navegador
  useEffect(() => setHoy(semanaActualDelPlan(arranque, new Date())), [arranque]);

  const columnas = Array.from({ length: Math.max(semanas, 1) }, (_, i) => i + 1);
  const plantilla = `minmax(150px, 1.1fr) 104px minmax(190px, 1.6fr) repeat(${columnas.length}, minmax(${ANCHO_SEMANA}px, 1fr))`;
  const editable = !!onElegirFila;

  return (
    <div style={TEMAS[tema]} className="w-full">
      <div className="overflow-x-auto">
        <div role="table" aria-label="Plan general" style={{ display: "grid", gridTemplateColumns: plantilla, minWidth: 460 + columnas.length * ANCHO_SEMANA }}>
          {/* Cabecera */}
          <div role="row" style={{ display: "contents" }}>
            {["Loop", "Tipo", "Actividad"].map((t) => (
              <div key={t} role="columnheader" className="px-3 pb-2 text-sm font-semibold" style={{ color: "var(--pg-fg2)", borderBottom: "1px solid var(--pg-line)" }}>
                {t}
              </div>
            ))}
            {columnas.map((s) => (
              <div
                key={s}
                role="columnheader"
                title={arranque ? `Semana del ${fmtDay(addWeeks(arranque, s - 1))}` : undefined}
                className="pb-2 text-center text-sm font-semibold"
                style={{ color: s === hoy ? "var(--pg-curso)" : "var(--pg-fg2)", borderBottom: "1px solid var(--pg-line)" }}
              >
                S{s}
              </div>
            ))}
          </div>

          {grupos.map((g) => {
            const filas = g.filas.length > 0 ? g.filas : [null];
            return filas.map((f, i) => {
              const zebra = i % 2 === 0;
              const fondo = zebra ? "var(--pg-zebra)" : "transparent";
              const borde = i === 0 ? "1px solid var(--pg-line)" : undefined;
              const celda: CSSProperties = { background: fondo, borderTop: borde };
              return (
                <div
                  key={`${g.key}:${f?.key ?? "vacio"}`}
                  role="row"
                  style={{ display: "contents" }}
                >
                  <div role="cell" className="px-3 py-1.5 text-sm" style={celda}>
                    {i === 0 && (
                      <>
                        <span className="font-semibold" style={{ color: "var(--pg-fg)" }}>{rotuloDelLoop(g.loopNumero, g.nombre)}</span>
                        {g.proyecto && <span className="block text-xs" style={{ color: "var(--pg-muted)" }}>{g.proyecto}</span>}
                      </>
                    )}
                  </div>
                  <div role="cell" className="px-3 py-1.5 text-sm" style={{ ...celda, color: "var(--pg-muted)" }}>
                    {f?.tipo ? ETIQUETA_DEL_TIPO[f.tipo] : ""}
                  </div>
                  <div role="cell" className="min-w-0 px-3 py-1.5 text-sm" style={{ ...celda, color: "var(--pg-fg)" }}>
                    {f ? (
                      editable ? (
                        <button
                          type="button"
                          onClick={() => onElegirFila!(g.key, f.key)}
                          className="w-full rounded text-left hover:underline decoration-dotted underline-offset-2"
                          title="Editar la actividad: semanas, estado, tipo y detalle"
                        >
                          {f.titulo}
                          {f.porValidar && (
                            <span className="ml-1.5 whitespace-nowrap text-xs font-medium" style={{ color: "var(--pg-curso)" }}>
                              por validar
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="block">{f.titulo}</span>
                      )
                    ) : (
                      <span style={{ color: "var(--pg-muted)" }}>Sin actividades todavía.</span>
                    )}
                    {onAgregar && i === filas.length - 1 && (
                      <button
                        type="button"
                        onClick={() => onAgregar(g.key)}
                        className="mt-1 block text-xs font-medium hover:underline"
                        style={{ color: "var(--pg-plan)" }}
                      >
                        + Actividad
                      </button>
                    )}
                  </div>
                  <BarraDeSemanas fila={f} columnas={columnas.length} celda={celda} hoy={hoy} onClick={f && editable ? () => onElegirFila!(g.key, f.key) : undefined} />
                </div>
              );
            });
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: "var(--pg-fg2)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--pg-hecho)" }} aria-hidden="true" /> Hecho
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--pg-plan)" }} aria-hidden="true" /> En curso o por iniciar
        </span>
        {hoy != null && hoy >= 1 && hoy <= columnas.length && (
          <span>
            · Semana actual: <span className="font-semibold" style={{ color: "var(--pg-curso)" }}>S{hoy}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Las celdas de las semanas de una fila: una sola celda que abarca todas, con la barra y su rótulo adentro. */
function BarraDeSemanas({
  fila,
  columnas,
  celda,
  hoy,
  onClick,
}: {
  fila: FilaDelGantt | null;
  columnas: number;
  celda: CSSProperties;
  hoy: number | null;
  onClick?: () => void;
}) {
  const ancho = 100 / columnas;
  const desde = fila ? Math.max(fila.desde, 1) : 0;
  const hasta = fila ? Math.min(fila.hasta, columnas) : 0;
  const color = fila?.estado === "DONE" ? "var(--pg-hecho)" : "var(--pg-plan)";
  const rotulo = fila?.estado === "DONE" ? "✓ Hecho" : fila?.estado === "IN_PROGRESS" ? "En curso" : null;
  const colorDelRotulo = fila?.estado === "DONE" ? "var(--pg-hecho)" : "var(--pg-curso)";
  // El rótulo va a la derecha de la barra; si no cabe (llega al final), a su izquierda; si tampoco (va de la S1 o S2 al
  // final), adentro de la barra, en blanco: nunca encima del nombre de la actividad.
  const rotuloAfuera = hasta < columnas - 1;
  const rotuloAdentro = !rotuloAfuera && desde <= 2;
  return (
    <div role="cell" style={{ ...celda, gridColumn: `span ${columnas}`, position: "relative", minHeight: 34 }}>
      {hoy != null && hoy >= 1 && hoy <= columnas && (
        <div
          aria-hidden="true"
          style={{ position: "absolute", top: 0, bottom: 0, left: `${(hoy - 1) * ancho}%`, width: `${ancho}%`, borderLeft: "1px dashed var(--pg-curso)", borderRight: "1px dashed var(--pg-curso)", opacity: 0.35 }}
        />
      )}
      {fila && hasta >= desde && (
        <>
          <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            aria-label={`${fila.titulo}: semanas ${fila.desde} a ${fila.hasta}`}
            title={`S${fila.desde}${fila.hasta > fila.desde ? `–S${fila.hasta}` : ""}`}
            className={onClick ? "cursor-pointer" : "cursor-default"}
            style={{
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              left: `calc(${(desde - 1) * ancho}% + 4px)`,
              width: `calc(${(hasta - desde + 1) * ancho}% - 8px)`,
              height: 14,
              borderRadius: 3,
              background: color,
              border: "none",
              padding: 0,
            }}
          />
          {rotulo && (
            <span
              className="pointer-events-none whitespace-nowrap text-sm font-semibold"
              style={{
                position: "absolute",
                top: "50%",
                transform: "translateY(-50%)",
                color: rotuloAdentro ? "#ffffff" : colorDelRotulo,
                ...(rotuloAfuera
                  ? { left: `calc(${hasta * ancho}% + 6px)` }
                  : rotuloAdentro
                    ? { left: `calc(${(desde - 1) * ancho}% + 10px)`, fontSize: 11, lineHeight: "14px" }
                    : { right: `calc(${(columnas - desde + 1) * ancho}% + 6px)` }),
              }}
            >
              {rotulo}
            </span>
          )}
        </>
      )}
    </div>
  );
}
