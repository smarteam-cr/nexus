"use client";

/**
 * AgregarSesion — el menú «+ Agregar sesión» de la exploración (etapa A, tablero Main.dc.html): una que
 * está agendada (del calendario, las próximas 6 semanas: Nexus espera su transcripción), una reunión
 * que ya pasó (de la empresa o de tu calendario) o una sin reunión todavía (para preparar la guía antes
 * de agendarla). Las dos primeras abren el selector (BuscarReunionesDeLaPreventa); la tercera crea la
 * sesión y la abre en su preparación. Lo usan la página de inicio y el riel.
 *
 * Desde el 2026-11-28 también «Pegar una transcripción» (Elías, con Líneas Hospitalarias): sin buscar la reunión en el
 * calendario, se pega su texto en el cajón de «Agregar una reunión» y queda como sesión, leída como cualquier otra.
 */
import { useState } from "react";
import { Menu, useToast } from "@/components/ui";
import { AgregarReunion } from "@/components/sessions/AgregarReunion";
import { cn } from "@/lib/cn";
import { MAX_SESIONES, pestanaDeLaReunion } from "@/lib/exploraciones/guia";
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
const TEXTO = "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6";

function Opcion({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <span className="flex flex-col gap-0.5 py-0.5">
      <span className="text-[13px] font-semibold text-fg">{titulo}</span>
      <span className="text-xs leading-4 text-fg-muted">{texto}</span>
    </span>
  );
}

export default function AgregarSesion({ variante }: { variante: "boton" | "riel" }) {
  const { puedeEditar, guardando, sesion, exp, recargar } = useLienzo();
  const { sesiones, todas, agregar } = useSesiones();
  const toast = useToast();
  const [pegando, setPegando] = useState(false);
  /** La reunión con la transcripción pegada, como sesión de la exploración (POST …/sesiones, como «Una que ya pasó»). */
  const comoSesion = async (sessionId: string) => {
    // Se le pegó el texto a una reunión del día que ya era la de una pestaña (su sesión, por su evento o su fecha, o
    // porque entró sola): no se agrega otra, se relee (`pestanaDeLaReunion`).
    if (pestanaDeLaReunion(todas, sessionId)) {
      await recargar();
      toast.success("Listo: la transcripción quedó en esa sesión. Nexus la lee.");
      return;
    }
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/sesiones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pasada", sessionId }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; sesionId?: string };
      if (!res.ok) {
        toast.error(d.error ?? "La reunión quedó guardada, pero no se pudo agregar como sesión. Agrégala con «Una reunión que ya pasó».");
        return;
      }
      // Sin ir a la sesión: el cajón sigue abierto si falta subir el audio, y la sesión ya está en la barra.
      await recargar();
      toast.success("Sesión agregada: Nexus lee la transcripción y la suma a la guía.");
    } catch {
      toast.error("La reunión quedó guardada, pero no se pudo agregar como sesión: revisa la conexión.");
    }
  };
  if (!puedeEditar) return null;

  const lleno = sesiones.length >= MAX_SESIONES;
  const claseDelBoton =
    variante === "boton"
      ? "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
      : // En la barra (también la de la ficha) se ve como lo que es: un menú, con su flecha (2026-11-06, Elías: parecía un enlace).
        "flex w-full items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg";
  /* El cajón vive acá aunque la exploración se llene con la sesión que agrega: si no, se cerraría antes de subir el audio. */
  const cajon = pegando ? (
    <AgregarReunion
      open={pegando}
      onClose={() => setPegando(false)}
      clienteFijo={{ id: exp.empresa.clientId, nombre: exp.empresa.nombre }}
      tipoInicial="transcripcion"
      onAgregada={(sessionId) => void comoSesion(sessionId)}
    />
  ) : null;
  if (lleno) {
    return (
      <>
        {variante === "boton" && (
          <button type="button" disabled title={`Ya hay ${MAX_SESIONES} sesiones: saca una antes de agregar otra.`} className={claseDelBoton}>
            + Agregar sesión
          </button>
        )}
        {cajon}
      </>
    );
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
            <svg className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
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
            key: "transcripcion",
            icon: <Icono d={TEXTO} className="text-fg-muted" />,
            label: <Opcion titulo="Pegar una transcripción" texto="La de una reunión que no está en tu calendario (Zoom, Teams, en persona). Nexus la lee y arma la guía con ella." />,
            disabled: guardando,
            onSelect: () => setPegando(true),
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
      {/* 2026-11-28 · El mismo cajón de «+ Pegar la transcripción» (components/sessions/AgregarReunion.tsx): la reunión queda
          de la empresa y, al guardarla, se agrega como sesión por la misma puerta que «Una reunión que ya pasó». */}
      {cajon}
    </div>
  );
}
