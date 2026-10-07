"use client";

/**
 * components/cuestionario/ExploracionConCuestionario.tsx — la pieza Exploración, en sus pestañas.
 *
 * Desde el 2026-10-05 (decisión de Elías, diseño «Clientes · rediseño», tableros 5 y 6):
 *   · UNA PESTAÑA POR SESIÓN, como en la preventa: «Sesión 1», «Sesión 2»… las del plan y, en azul
 *     con la chispa, las que propone el agente. Al final, «+ Sesión» para agregar una a mano.
 *     Las arma components/guia-exploracion (este componente solo pinta la barra).
 *   · «Cuestionarios»: lo que se manda a cada persona del cliente (táctico, escala).
 *   · «Informe anterior»: el informe viejo, en solo lectura, solo si el proyecto lo tenía.
 * La «Guía» se retiró: repetía Información del cliente. Lo que se averigua va allá como sugerencia.
 *
 * Es una herramienta de trabajo, no un documento: va FUERA del marco «El documento» (solo el informe
 * anterior, que es del motor de landings, lleva su marco). Las sesiones quedan montadas aunque se
 * mire otra pestaña: pintan la columna derecha y no pierden lo que se estaba escribiendo.
 *
 * Si se miraban las sesiones o los cuestionarios se recuerda por proyecto en este navegador
 * (conveniencia, no estado). La sesión abierta no: al volver, abre la próxima.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import SesionesDeExploracion, { AGREGAR_SESION, type EstadoDeLasSesiones, type PestanaDeSesion } from "@/components/guia-exploracion/SesionesDeExploracion";
import CuestionarioPanel from "./CuestionarioPanel";

/** `s:<clave>` = una sesión (`s:` sola = la de por defecto); o una de las otras dos vistas. */
type Vista = `s:${string}` | "cuestionarios" | "informe";

function EtiquetaDeSesion({ p }: { p: PestanaDeSesion }) {
  if (p.propuesta) {
    return (
      <span className="inline-flex items-center gap-1.5 text-brand">
        <IconoDeSugerencia className="h-3.5 w-3.5" />
        Sesión {p.numero}
      </span>
    );
  }
  const completa = p.total > 0 && p.hechas === p.total;
  return (
    <span className="inline-flex items-center gap-1.5">
      Sesión {p.numero}
      {completa ? (
        <span className="text-xs font-semibold text-success-ink" aria-label="todas preguntadas">
          ✓
        </span>
      ) : (
        p.total > 0 && (
          <span className="text-xs font-normal tabular-nums text-fg-muted">
            {p.hechas}/{p.total}
          </span>
        )
      )}
      {p.sugeridas > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs font-normal text-brand" title={`${p.sugeridas} sugerencias del agente`}>
          <IconoDeSugerencia className="h-3 w-3" />
          {p.sugeridas}
        </span>
      )}
    </span>
  );
}

export default function ExploracionConCuestionario({
  projectId,
  clientId,
  informeAnterior,
  slotDelPanel,
}: {
  projectId: string;
  clientId: string;
  /** El informe viejo en solo lectura (ya dentro de su marco); null si el proyecto no tenía. */
  informeAnterior: ReactNode | null;
  /** La columna derecha de la ficha; null si está oculta. */
  slotDelPanel: HTMLElement | null;
}) {
  const clave = `nexus:exploracion-vista:${projectId}`;
  const [vista, setVista] = useState<Vista>("s:");
  const [estado, setEstado] = useState<EstadoDeLasSesiones | null>(null);
  const alEstado = useCallback((e: EstadoDeLasSesiones) => setEstado(e), []);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(clave);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación de localStorage (no existe en SSR)
      if (v === "cuestionarios" || (v === "informe" && informeAnterior)) setVista(v);
    } catch {
      /* sin almacenamiento: queda el default */
    }
  }, [clave, informeAnterior]);

  const elegir = useCallback(
    (v: Vista) => {
      setVista(v);
      try {
        window.localStorage.setItem(clave, v.startsWith("s:") ? "sesiones" : v);
      } catch {
        /* idem */
      }
    },
    [clave],
  );
  const elegirSesion = useCallback((c: string) => elegir(`s:${c}`), [elegir]);

  const enSesiones = vista.startsWith("s:");
  const elegida = enSesiones ? vista.slice(2) || null : null;
  const pestanas = estado?.pestanas ?? [];
  const valor: Vista = enSesiones ? `s:${estado?.activa ?? ""}` : vista;

  const items = [
    ...(pestanas.length
      ? pestanas.map((p) => ({ key: `s:${p.clave}` as Vista, label: <EtiquetaDeSesion p={p} />, title: p.titulo }))
      : [{ key: "s:" as Vista, label: "Sesiones" }]),
    { key: `s:${AGREGAR_SESION}` as Vista, label: <span className="text-fg-muted">+ Sesión</span>, title: "Agregar una sesión a mano" },
    { key: "cuestionarios" as const, label: "Cuestionarios" },
    ...(informeAnterior ? [{ key: "informe" as const, label: "Informe anterior" }] : []),
  ];

  return (
    <div className="space-y-5">
      <div data-recorrido="exploracion.vistas">
        <Tabs aria-label="Sesiones y cuestionarios de la exploración" items={items} value={valor} onChange={elegir} />
      </div>
      <div hidden={!enSesiones}>
        <SesionesDeExploracion
          projectId={projectId}
          clientId={clientId}
          slotDelPanel={slotDelPanel}
          elegida={elegida}
          onElegir={elegirSesion}
          onEstado={alEstado}
        />
      </div>
      <div hidden={vista !== "cuestionarios"}>
        <CuestionarioPanel projectId={projectId} />
      </div>
      {vista === "informe" && informeAnterior}
    </div>
  );
}
