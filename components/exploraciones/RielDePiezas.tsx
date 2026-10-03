"use client";

/**
 * RielDePiezas — la barra de la izquierda del lienzo: las piezas en orden y, debajo de Exploración,
 * cada sesión (rediseño de escritorio, pedido de Elías del 2026-10-03: «la interfaz no está pensada
 * para desktop»). Reemplaza al desplegable de piezas y a las pestañas de sesión: a la vista todo el
 * tiempo, sin abrir nada. Abajo, «Cómo manejar objeciones», a mano en cualquier pieza.
 *
 * En pantallas chicas se acuesta: las piezas en una fila que salta de renglón, sin las sesiones
 * (Exploración las muestra arriba de la sesión).
 */
import type { EstadoDePieza, FilaDePieza } from "@/components/canvas/SelectorDePiezas";
import { cn } from "@/lib/cn";
import { MAX_SESIONES, type PestanaDeSesion } from "@/lib/exploraciones/guia";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { useLienzo, type PasoDelLienzoUI } from "./contexto";
import ManejoDeObjeciones from "./ManejoDeObjeciones";
import { useSesiones } from "./useSesiones";

const PUNTO: Record<EstadoDePieza, string> = {
  generada: "bg-success",
  pendiente: "bg-warning",
  vacia: "border border-line",
};

function Fila({
  etiqueta,
  activa,
  estado,
  aviso,
  title,
  onClick,
}: {
  etiqueta: string;
  activa: boolean;
  estado: EstadoDePieza | null;
  aviso?: string | null;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-current={activa ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        activa ? "bg-brand/10 font-semibold text-fg" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
      )}
    >
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", estado ? PUNTO[estado] : "bg-brand")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
      {aviso && <span className="flex-shrink-0 text-2xs font-medium text-fg-muted">{aviso}</span>}
    </button>
  );
}

/** Las sesiones, colgadas de Exploración. */
function Sesiones({ alElegir }: { alElegir: (clave: string) => void }) {
  const { puedeEditar, guardando } = useLienzo();
  const { todas, activa, claveDeLaProxima, sesiones, agregar } = useSesiones();
  const marca = (p: PestanaDeSesion) =>
    p.reunion && !p.reunion.leida ? (
      <span className="rounded bg-warn-surface px-1 text-2xs font-semibold text-warn-ink">Nueva</span>
    ) : p.clave === claveDeLaProxima ? (
      <span className="text-2xs font-semibold text-brand-light">Próxima</span>
    ) : p.hecha ? (
      <span className="text-success-ink" aria-label="hecha">
        ✓
      </span>
    ) : null;
  return (
    <ul className="ml-3.5 space-y-0.5 border-l border-line py-1 pl-2">
      {todas.map((p) => {
        const actual = p.clave === activa.clave;
        return (
          <li key={p.clave}>
            <button
              type="button"
              aria-current={actual ? "true" : undefined}
              onClick={() => alElegir(p.clave)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                actual ? "bg-surface-hover font-semibold text-fg" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
              )}
            >
              <span className="min-w-0 flex-1 truncate">Sesión {p.numero}</span>
              {p.fecha && <span className="flex-shrink-0 text-2xs text-fg-muted">{diaCorto(p.fecha)}</span>}
              {marca(p)}
            </button>
          </li>
        );
      })}
      {puedeEditar && sesiones.length < MAX_SESIONES && (
        <li>
          <button type="button" disabled={guardando} onClick={agregar} className="w-full rounded-md px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-surface-hover hover:text-fg">
            + Agregar sesión
          </button>
        </li>
      )}
    </ul>
  );
}

export default function RielDePiezas({
  paso,
  onElegir,
  resumen,
  filas,
}: {
  paso: PasoDelLienzoUI;
  onElegir: (p: PasoDelLienzoUI) => void;
  resumen: { aviso: string | null };
  filas: readonly FilaDePieza[];
}) {
  const { sesion } = useLienzo();
  return (
    <nav aria-label="Piezas de la exploración" className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
        <div className="lg:w-full">
          <Fila etiqueta="Resumen" activa={paso === "resumen"} estado={null} aviso={resumen.aviso} onClick={() => onElegir("resumen")} />
        </div>
        {filas.map((f) => (
          <div key={f.clave} className="lg:w-full">
            <Fila
              etiqueta={f.etiqueta}
              activa={paso === f.clave}
              estado={f.estado}
              aviso={f.aviso?.corto ?? null}
              title={f.aviso?.largo ?? f.ayuda}
              onClick={() => onElegir(f.clave as PasoDelLienzoUI)}
            />
            {f.clave === "exploracion" && (
              <div className="hidden lg:block">
                <Sesiones
                  alElegir={(clave) => {
                    sesion.elegir(clave);
                    onElegir("exploracion");
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="lg:mt-auto">
        <ManejoDeObjeciones />
      </div>
    </nav>
  );
}
