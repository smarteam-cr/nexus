"use client";

/**
 * SelectorDePiezas — el nombre de la pieza abierta, con el desplegable del recorrido debajo.
 *
 * Salió de `ProjectCanvasPanel` (2026-10-01) para que la exploración de venta use el MISMO caparazón
 * que el proyecto (pedido de Elías). Es presentacional: quién decide qué filas hay, en qué estado y
 * qué hace cada una es quien lo monta.
 *
 * Cada fila: estado (punto) · nombre · aviso corto si lo hay (texto visible, no un hover) · una
 * acción a la derecha. La fila es un contenedor con DOS botones: anidar botones es HTML inválido y el
 * click de la acción burbujearía hasta cambiar de pieza. El «Resumen» va primero y aparte: no es una
 * pieza del recorrido, no se genera ni tiene estado, así que tampoco lleva punto.
 */
import { useEffect, useRef, type ReactNode } from "react";

/** generada = verde · pendiente = ámbar (hay algo que hacer) · vacia = punto hueco (todavía nada). */
export type EstadoDePieza = "generada" | "pendiente" | "vacia";

export interface FilaDePieza {
  clave: string;
  etiqueta: string;
  estado: EstadoDePieza;
  /** Qué significa el estado, en el title de la fila. */
  ayuda?: string;
  /** Un aviso corto y legible bajo el nombre; `largo` va en el title. */
  aviso?: { corto: string; largo?: string } | null;
  /** Se está creando o activando: el punto gira. */
  ocupada?: boolean;
  /** Atenuada (no existe todavía para este proyecto). */
  atenuada?: boolean;
  /** La acción de la derecha (Generar, Regenerar, Activar…). */
  accion?: ReactNode;
}

export function SelectorDePiezas({
  titulo,
  abierto,
  onCambiarAbierto,
  resumen,
  filas,
  activa,
  onElegir,
  deshabilitado,
  motivoDeshabilitado,
  bloqueadas,
}: {
  titulo: string;
  abierto: boolean;
  onCambiarAbierto: (abierto: boolean) => void;
  resumen?: { activo: boolean; ayuda: string; onElegir: () => void };
  filas: readonly FilaDePieza[];
  /** La clave de la pieza abierta (null si está el resumen). */
  activa: string | null;
  onElegir: (clave: string) => void;
  /** El botón del título no abre (por ejemplo, mientras la IA trabaja en esa pieza). */
  deshabilitado?: boolean;
  motivoDeshabilitado?: string;
  /** Las filas no responden (algo se está activando). */
  bloqueadas?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Clic afuera y Escape cierran.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCambiarAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCambiarAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto, onCambiarAbierto]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => onCambiarAbierto(!abierto)}
        disabled={deshabilitado}
        title={deshabilitado ? motivoDeshabilitado : undefined}
        aria-expanded={abierto}
        className="flex items-center gap-2 text-xl font-bold text-fg transition-colors hover:text-fg-secondary disabled:cursor-wait disabled:opacity-60"
      >
        {titulo}
        <svg className={`h-4 w-4 text-fg-muted transition-transform ${abierto ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {abierto && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-1.5 shadow-2xl">
          {resumen && (
            <>
              <button
                type="button"
                onClick={resumen.onElegir}
                className={`flex w-full items-center gap-2.5 rounded-xl py-2 pl-3 pr-2 text-left transition-colors ${
                  resumen.activo ? "bg-brand/10" : "hover:bg-surface-hover"
                }`}
                title={resumen.ayuda}
              >
                <span aria-hidden className="w-2 shrink-0" />
                <span className={`block truncate text-sm ${resumen.activo ? "font-semibold text-brand" : "text-fg"}`}>Resumen</span>
              </button>
              <div className="my-1.5 border-t border-line" aria-hidden />
            </>
          )}
          {filas.map((f) => {
            const esLaActiva = f.clave === activa;
            return (
              <div
                key={f.clave}
                className={`group flex items-center gap-3 rounded-xl py-2 pl-3 pr-2 transition-colors ${esLaActiva ? "bg-brand/10" : "hover:bg-surface-hover"}`}
              >
                <button
                  type="button"
                  onClick={() => onElegir(f.clave)}
                  disabled={bloqueadas}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-60"
                  title={f.ayuda}
                >
                  <span aria-hidden className="flex w-2 shrink-0 justify-center">
                    {f.ocupada ? (
                      <span className="h-2 w-2 animate-spin rounded-full border border-brand border-t-transparent" />
                    ) : (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          f.estado === "generada" ? "bg-success" : f.estado === "pendiente" ? "bg-warning" : "border border-line"
                        }`}
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm ${esLaActiva ? "font-semibold text-brand" : f.atenuada ? "text-fg-muted" : "text-fg"}`}>
                      {f.etiqueta}
                    </span>
                    {f.aviso && (
                      <span className="block text-xs leading-snug text-warn-ink" title={f.aviso.largo}>
                        {f.aviso.corto}
                      </span>
                    )}
                  </span>
                </button>
                {f.accion}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
