"use client";

/**
 * PanelLateral — LA COLUMNA DERECHA DE NEXUS, CON SU FLECHITA PARA OCULTARLA.
 *
 * ── POR QUÉ EXISTE (pedido de Elías, 2026-10-05) ─────────────────────────────
 * Doce pantallas internas tienen una columna de contexto a la derecha —«Qué sigue», «Necesitan
 * atención», la bandeja de feedback, el panel de la cuenta— y ninguna se podía cerrar. El menú de
 * la izquierda sí: tiene su chevron desde el primer día. En una pantalla de 1.280 px esa columna
 * se lleva 340, y cuando alguien está trabajando sobre la tabla no la quiere ahí.
 *
 * ⚠ Y hay un caso peor que el espacio: la columna repite avisos que también están en la fila de la
 * tabla. Quien ya los leyó no tiene forma de bajarles el volumen.
 *
 * ── UNA SOLA PREFERENCIA PARA TODA LA APP, Y ES A PROPÓSITO ──────────────────
 * No una por pantalla. Quien cierra la columna en Clientes está diciendo «quiero la tabla ancha»,
 * no «quiero la tabla ancha ACÁ»: con una preferencia por pantalla tendría que cerrarla doce
 * veces y volver a cerrarlas cada vez que entra a una nueva.
 *
 * ── SIN FLASH: LA COOKIE SE LEE EN EL SERVIDOR ───────────────────────────────
 * Mismo mecanismo que `nexus-sidebar` y `nexus-theme`: `AppShell` lee la cookie y la baja como
 * `initialOpen`. Si el estado naciera en el cliente, cada carga pintaría la columna abierta y la
 * cerraría de un salto — justo en el primer paint, que es cuando más se nota.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
// La lectura en el servidor vive en un módulo neutro: AppShell no puede llamar una función de acá.
import { COOKIE_PANEL_LATERAL as COOKIE_KEY } from "./panel-lateral-cookie";

const escribirCookie = (abierto: boolean) => {
  document.cookie = `${COOKIE_KEY}=${abierto ? "open" : "collapsed"};path=/;max-age=31536000;SameSite=Lax`;
};

interface Estado {
  abierto: boolean;
  alternar: () => void;
}

const Ctx = createContext<Estado | null>(null);

export function PanelLateralProvider({
  initialOpen,
  children,
}: {
  initialOpen: boolean;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(initialOpen);
  const alternar = () =>
    setAbierto((prev) => {
      const next = !prev;
      escribirCookie(next);
      return next;
    });
  return <Ctx.Provider value={{ abierto, alternar }}>{children}</Ctx.Provider>;
}

/**
 * El estado del panel. Fuera del proveedor devuelve «abierto y sin botón»: una pantalla que monte
 * un `PanelLateral` fuera del shell —el print, una vista externa— tiene que seguir mostrando su
 * contenido, no quedarse con una franja vacía.
 */
export function usePanelLateral(): Estado | null {
  return useContext(Ctx);
}

export interface PanelLateralProps {
  children: ReactNode;
  /** Para el lector de pantalla y el tooltip del botón: «Cartera», «La cuenta», «Decidir». */
  etiqueta: string;
  /** El ancho de la columna abierta, tal como lo traía su `<aside>` (`lg:w-[340px]`). */
  ancho: string;
  /**
   * Desde qué tamaño la columna va al costado. Debajo de eso cae abajo, a lo ancho.
   *
   * No es cosmético: la ficha de una propuesta pasa a columna recién en `xl` porque su centro es
   * un documento y no entra antes. Si acá se fijara `lg` para todos, esa ficha tendría el borde
   * izquierdo y el `shrink` 240 px antes que su ancho, y entre `lg` y `xl` quedaría una columna de
   * 300 px pegada a un documento que ya no entra.
   */
  breakpoint?: "lg" | "xl";
  /** Las clases de la columna ABIERTA: su padding y su separación interna. */
  className?: string;
  /** Separación entre los bloques del panel. Default `gap-6`. */
  gap?: string;
}

export default function PanelLateral({
  children,
  etiqueta,
  ancho,
  breakpoint = "lg",
  className,
  gap = "gap-6",
}: PanelLateralProps) {
  const estado = usePanelLateral();
  const abierto = estado?.abierto ?? true;

  return (
    <aside
      aria-label={etiqueta}
      className={cn(
        "border-t border-line bg-surface-muted",
        breakpoint === "xl"
          ? "xl:flex-shrink-0 xl:border-l xl:border-t-0"
          : "lg:flex-shrink-0 lg:border-l lg:border-t-0",
        /* Solo el ancho anima. `transition-all` arrastraría el padding y los bordes, y el salto se
           ve como un parpadeo del contenido en vez de un panel que se cierra. */
        "transition-[width] duration-200 ease-in-out",
        abierto
          ? cn("px-5 pb-12 pt-8", ancho, className)
          : cn("px-2 py-3", breakpoint === "xl" ? "xl:w-11" : "lg:w-11"),
      )}
    >
      {/* La flechita. Apunta a la DERECHA para cerrar y a la IZQUIERDA para abrir: siempre hacia
          donde se va a mover el panel, igual que la del menú de la izquierda. */}
      {estado && (
        <div className={cn("flex", abierto ? "mb-4 justify-start" : "justify-center")}>
          <button
            type="button"
            onClick={estado.alternar}
            title={abierto ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
            aria-expanded={abierto}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-secondary"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d={abierto ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
            </svg>
          </button>
        </div>
      )}

      {/* Cerrado, el contenido NO se desmonta: se oculta. Un panel que se desmonta pierde lo que
          el usuario haya abierto o escrito adentro, y vuelve a pagar sus consultas al reabrirlo. */}
      <div className={abierto ? cn("flex flex-col", gap) : "hidden"}>{children}</div>
    </aside>
  );
}
