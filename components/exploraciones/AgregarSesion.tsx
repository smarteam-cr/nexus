"use client";

/**
 * AgregarSesion — el menú «+ Agregar sesión» de la exploración (etapa A, tablero Main.dc.html): una que
 * está agendada (del calendario, las próximas 6 semanas: Nexus espera su transcripción), una reunión
 * que ya pasó (de la empresa o de tu calendario) o una sin reunión todavía (para preparar la guía antes
 * de agendarla). Las dos primeras abren el selector (BuscarReunionesDeLaPreventa); la tercera crea la
 * sesión y la abre en su preparación. Lo usan la página de inicio y el riel.
 */
import { Menu } from "@/components/ui";
import { cn } from "@/lib/cn";
import { MAX_SESIONES } from "@/lib/exploraciones/guia";
import { useLienzo } from "./contexto";
import { useSesiones } from "./useSesiones";

function Icono({ d, className }: { d: string; className: string }) {
  return (
    <svg className={cn("h-4 w-4", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const CALENDARIO = "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";
const VIDEO = "M15 10l4.5-3v10L15 14M5 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z";
const MAS = "M12 5v14M5 12h14";

function Opcion({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <span className="flex flex-col gap-0.5 py-0.5">
      <span className="text-[13px] font-semibold text-fg">{titulo}</span>
      <span className="text-xs leading-4 text-fg-muted">{texto}</span>
    </span>
  );
}

export default function AgregarSesion({ variante }: { variante: "boton" | "riel" }) {
  const { puedeEditar, guardando, sesion } = useLienzo();
  const { sesiones, agregar } = useSesiones();
  if (!puedeEditar) return null;

  const lleno = sesiones.length >= MAX_SESIONES;
  const claseDelBoton =
    variante === "boton"
      ? "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
      : "w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg";
  if (lleno) {
    return variante === "boton" ? (
      <button type="button" disabled title={`Ya hay ${MAX_SESIONES} sesiones: saca una antes de agregar otra.`} className={claseDelBoton}>
        + Agregar sesión
      </button>
    ) : null;
  }

  return (
    <div data-recorrido={variante === "boton" ? "preventa.inicio.agregar" : undefined}>
      <Menu
        aria-label="Agregar sesión"
        align={variante === "boton" ? "end" : "start"}
        panelWidth="w-[340px]"
        triggerClassName={claseDelBoton}
        trigger={(abierto) => (
          <>
            + Agregar sesión
            {variante === "boton" && (
              <svg className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            )}
          </>
        )}
        items={[
          {
            key: "agendada",
            icon: <Icono d={CALENDARIO} className="text-brand" />,
            label: <Opcion titulo="Una que está agendada" texto="De tu calendario, próximas 6 semanas. Nexus espera su transcripción." />,
            onSelect: () => sesion.buscarReunion({ tipo: "nueva", ver: "agendadas" }),
          },
          {
            key: "pasada",
            icon: <Icono d={VIDEO} className="text-fg-muted" />,
            label: <Opcion titulo="Una reunión que ya pasó" texto="De la empresa o de tu calendario. Se lee entera." />,
            onSelect: () => sesion.buscarReunion({ tipo: "nueva", ver: "pasadas" }),
          },
          {
            key: "sinReunion",
            icon: <Icono d={MAS} className="text-fg-muted" />,
            label: <Opcion titulo="Sin reunión todavía" texto="Para preparar la guía antes de agendarla." />,
            disabled: guardando,
            onSelect: agregar,
          },
        ]}
      />
    </div>
  );
}
