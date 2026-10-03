"use client";

/**
 * RielDePiezas — la barra de la izquierda del lienzo: las piezas en orden y, debajo de Exploración,
 * cada sesión (rediseño de escritorio, pedido de Elías del 2026-10-03: «la interfaz no está pensada
 * para desktop»). Reemplaza al desplegable de piezas y a las pestañas de sesión: a la vista todo el
 * tiempo, sin abrir nada. Abajo, «Cómo manejar objeciones», a mano en cualquier pieza.
 *
 * El punto de cada pieza: azul si el agente sugirió algo ahí (con cuántas, en azul), ámbar si pide
 * atención (hipótesis, reuniones sin leer, lista para proponer), verde si ya tiene contenido, hueco
 * si todavía nada. Azul es siempre «lo sugiere el agente», en todo el lienzo.
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

/** Una fila de la barra: la del selector de piezas, más cuántas sugerencias esperan ahí. */
export type FilaDelRiel = FilaDePieza & { sugeridas: number };

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
  sugeridas,
  title,
  onClick,
}: {
  etiqueta: string;
  activa: boolean;
  estado: EstadoDePieza;
  aviso?: string | null;
  /** Cuántas sugerencias esperan; el texto que las nombra, si no es solo el número. */
  sugeridas: { n: number; texto?: string };
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
        activa ? "bg-info-surface font-semibold text-info-ink" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
      )}
    >
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", activa || sugeridas.n > 0 ? "bg-info" : PUNTO[estado])} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
      {sugeridas.n > 0 ? (
        <span className="flex-shrink-0 text-2xs font-medium text-info-ink" title={`${sugeridas.n} sugerencias del agente`}>
          {sugeridas.texto ?? sugeridas.n}
        </span>
      ) : (
        aviso && <span className={cn("flex-shrink-0 text-2xs font-medium", estado === "pendiente" ? "text-warn-ink" : "text-fg-muted")}>{aviso}</span>
      )}
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
      <span className="text-2xs font-semibold text-info-ink">Próxima</span>
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
                actual ? "bg-info-surface font-semibold text-info-ink" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
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
  resumen: { sugeridas: number; confirmadas: number; estado: EstadoDePieza };
  filas: readonly FilaDelRiel[];
}) {
  const { sesion } = useLienzo();
  return (
    <nav aria-label="Piezas de la exploración" className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
        <div className="lg:w-full">
          <Fila etiqueta="Resumen" activa={paso === "resumen"}
            estado={resumen.estado}
            aviso={`${resumen.confirmadas}/8`}
            sugeridas={{ n: resumen.sugeridas, texto: `${resumen.sugeridas} ${resumen.sugeridas === 1 ? "sugerida" : "sugeridas"}` }} onClick={() => onElegir("resumen")} />
        </div>
        {filas.map((f) => (
          <div key={f.clave} className="lg:w-full">
            <Fila
              etiqueta={f.etiqueta}
              activa={paso === f.clave}
              estado={f.estado}
              aviso={f.aviso?.corto ?? null}
              sugeridas={{ n: f.sugeridas }}
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
