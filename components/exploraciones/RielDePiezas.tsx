"use client";

/**
 * RielDePiezas — la barra de la izquierda del lienzo: las piezas en orden y, debajo de Exploración,
 * cada sesión (rediseño de escritorio, pedido de Elías del 2026-10-03: «la interfaz no está pensada
 * para desktop»). Reemplaza al desplegable de piezas y a las pestañas de sesión: a la vista todo el
 * tiempo, sin abrir nada. Abajo, «Cómo manejar objeciones», a mano en cualquier pieza.
 *
 * Copia el tablero «1 · Sesión — Antes» medida por medida: filas de 14 px con un punto de 8 px; la
 * pieza abierta en azul sobre fondo azul claro (Exploración, cuando hay una sesión elegida, va en
 * negrita oscura y la sesión es la que se pinta); las sesiones colgadas con una línea a la izquierda,
 * ✓ verde la hecha y ● la abierta.
 *
 * El punto de cada pieza: azul si el agente sugirió algo ahí (con cuántas, en azul), ámbar si pide
 * atención (hipótesis, reuniones sin leer, lista para proponer), verde si ya tiene contenido, gris si
 * todavía nada. En pantallas chicas se acuesta y las sesiones se eligen en Exploración.
 */
import type { EstadoDePieza, FilaDePieza } from "@/components/canvas/SelectorDePiezas";
import { cn } from "@/lib/cn";
import { MAX_SESIONES, type PestanaDeSesion } from "@/lib/exploraciones/guia";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { useLienzo, type PasoDelLienzoUI } from "./contexto";
import { BotonDeObjeciones } from "./ManejoDeObjeciones";
import { useSesiones } from "./useSesiones";
import { IconoDeSugerencia } from "./FranjaDeSugerencias";

/** Una fila de la barra: la del selector de piezas, más cuántas sugerencias esperan ahí. */
export type FilaDelRiel = FilaDePieza & { sugeridas: number };

const PUNTO: Record<EstadoDePieza, string> = {
  generada: "bg-success",
  pendiente: "bg-warning",
  vacia: "bg-fg-muted/30",
};

function Fila({
  etiqueta,
  activa,
  conSesion,
  estado,
  aviso,
  sugeridas,
  title,
  onClick,
}: {
  etiqueta: string;
  activa: boolean;
  /** Es Exploración con una sesión elegida debajo: la sesión es la que se pinta. */
  conSesion?: boolean;
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
        activa && !conSesion
          ? "bg-info-surface font-semibold text-brand"
          : activa
            ? "font-semibold text-fg hover:bg-surface-hover"
            : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
      )}
    >
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", activa || sugeridas.n > 0 ? "bg-brand" : PUNTO[estado])} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
      {sugeridas.n > 0 ? (
        <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-brand" title={`${sugeridas.n} sugerencias del agente`}>
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
          {sugeridas.texto ?? sugeridas.n}
        </span>
      ) : (
        aviso && <span className={cn("flex-shrink-0 text-xs", estado === "pendiente" ? "text-warn-ink" : "text-fg-muted")}>{aviso}</span>
      )}
    </button>
  );
}

/** Las sesiones, colgadas de Exploración. */
function Sesiones({ abierta, alElegir }: { abierta: boolean; alElegir: (clave: string) => void }) {
  const { puedeEditar, guardando } = useLienzo();
  const { todas, activa, sesiones, agregar } = useSesiones();
  const marca = (p: PestanaDeSesion, actual: boolean) =>
    actual ? (
      <span aria-hidden="true">●</span>
    ) : p.reunion && !p.reunion.leida ? (
      <span className="text-warning" title="Reunión sin leer">
        ●
      </span>
    ) : p.hecha ? (
      <span className="text-success" aria-label="hecha">
        ✓
      </span>
    ) : (
      <span className="text-fg-muted" aria-hidden="true">
        ○
      </span>
    );
  return (
    <ul data-recorrido="preventa.sesiones" className="mb-1.5 ml-[18px] mt-0.5 space-y-0.5 border-l border-line pl-2">
      {todas.map((p) => {
        const actual = abierta && p.clave === activa.clave;
        return (
          <li key={p.clave}>
            <button
              type="button"
              aria-current={actual ? "true" : undefined}
              onClick={() => alElegir(p.clave)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                actual ? "bg-info-surface font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
              )}
            >
              {marca(p, actual)}
              <span className="min-w-0 flex-1 truncate">Sesión {p.numero}</span>
              {p.fecha && <span className={cn("flex-shrink-0 text-[11.5px]", actual ? "" : "text-fg-muted")}>{diaCorto(p.fecha)}</span>}
            </button>
          </li>
        );
      })}
      {puedeEditar && sesiones.length < MAX_SESIONES && (
        <li>
          <button type="button" disabled={guardando} onClick={agregar} className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg-muted hover:bg-surface-hover hover:text-fg">
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
  const { sesion, abrirObjeciones } = useLienzo();
  return (
    <nav data-recorrido="preventa.riel" aria-label="Piezas de la preventa" className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap gap-0.5 lg:flex-col">
        <div className="lg:w-full">
          <Fila
            etiqueta="Resumen"
            activa={paso === "resumen"}
            estado={resumen.estado}
            aviso={`${resumen.confirmadas}/8`}
            sugeridas={{ n: resumen.sugeridas, texto: `${resumen.sugeridas} ${resumen.sugeridas === 1 ? "sugerida" : "sugeridas"}` }}
            onClick={() => onElegir("resumen")}
          />
        </div>
        {filas.map((f) => (
          <div key={f.clave} className="lg:w-full">
            <Fila
              etiqueta={f.etiqueta}
              activa={paso === f.clave}
              conSesion={f.clave === "exploracion"}
              estado={f.estado}
              aviso={f.aviso?.corto ?? null}
              sugeridas={{ n: f.sugeridas }}
              title={f.aviso?.largo ?? f.ayuda}
              onClick={() => onElegir(f.clave as PasoDelLienzoUI)}
            />
            {f.clave === "exploracion" && (
              <div className="hidden lg:block">
                <Sesiones
                  abierta={paso === "exploracion"}
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
      <div data-recorrido="preventa.objeciones" className="lg:mt-auto">
        <BotonDeObjeciones onClick={abrirObjeciones} />
      </div>
    </nav>
  );
}
