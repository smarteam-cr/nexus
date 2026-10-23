"use client";

/**
 * components/canvas/AntesDeGenerarElDiagnostico.tsx — «Antes de generar»: lo que propuso Nexus y nadie confirmó
 * (2026-10-23, lib/canvas/diagnostico-confirmado.ts).
 *
 * Elías, antes de la sesión de diagnóstico de CEMACO: en la parte de diagnóstico hay que decirle a quien genera que
 * revise las propuestas de Nexus para que el diagnóstico tenga sentido. Va en el diagnóstico sin generar (junto al
 * selector de plantillas) y, ya generado, plegado en una franja. Cada pieza dice qué hay, qué falta y dónde se revisa.
 *
 * UI interna: tokens y tuteo. La llamada es de solo lectura; si falla, no se pinta nada (el aviso nunca frena).
 */
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import { urlDeProyecto } from "@/lib/agents/run-url";
import type { ClaveDeLoConfirmado, EstadoDeLoConfirmado, LoConfirmado } from "@/lib/canvas/diagnostico-confirmado";

export type LoConfirmadoConMensaje = LoConfirmado & { mensaje: string };

/** Lee lo confirmado del proyecto. `nonce` lo vuelve a leer (después de generar). */
export function useLoConfirmado(projectId: string, nonce = 0): LoConfirmadoConMensaje | null {
  const [r, setR] = useState<LoConfirmadoConMensaje | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/diagnostico/lo-confirmado`)
      .then((res) => (res.ok ? res.json() : null))
      .then((j: LoConfirmadoConMensaje | null) => {
        if (vivo && j && Array.isArray(j.piezas)) setR(j);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId, nonce]);
  return r;
}

/* Sin colores propios: dentro del <Alert> el texto va con la tinta de la variante (components/ui/Alert.tsx) y en la
   franja, con la del contenedor. El estado se distingue por la palabra. */
const ESTADO: Record<EstadoDeLoConfirmado, string> = {
  confirmado: "Confirmado",
  "en-parte": "En parte",
  "sin-confirmar": "Sin confirmar",
  "sin-datos": "Vacío",
};

function dondeSeRevisa(clave: ClaveDeLoConfirmado, clientId: string, projectId: string): string {
  if (clave === "exploracion") return urlDeProyecto(clientId, projectId, "exploration");
  if (clave === "procesos") return `/clients/${encodeURIComponent(clientId)}?tab=__procesos__`;
  // La ficha y los resultados medibles se confirman en «Información del cliente».
  return `/clients/${encodeURIComponent(clientId)}?tab=__strategy__`;
}

export function AntesDeGenerarElDiagnostico({
  confirmado,
  clientId,
  projectId,
  generado,
}: {
  confirmado: LoConfirmadoConMensaje;
  clientId: string;
  projectId: string;
  /** Ya generado: plegado en una línea, se abre a pedido. */
  generado?: boolean;
}) {
  const [abierto, setAbierto] = useState(!generado);
  const pendientes = confirmado.piezas.filter((p) => p.estado === "sin-confirmar" || p.estado === "en-parte");
  // Ya generado y todo confirmado: no hay nada que decir.
  if (generado && !pendientes.length) return null;

  const titulo = confirmado.casiNada
    ? "Casi nada de lo que lee el diagnóstico está confirmado"
    : pendientes.length
      ? "Revisa lo que propuso Nexus antes de generar"
      : "Lo que lee el diagnóstico está confirmado";

  const lista = (
    <ul className="mt-2 flex flex-col gap-1.5">
      {confirmado.piezas.map((p) => (
        <li key={p.clave} className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-semibold">{p.nombre}</span>
          <span className={cn("font-semibold", p.estado === "sin-datos" && "opacity-70")}>· {ESTADO[p.estado]}</span>
          <span className="opacity-90">{p.texto}</span>
          {(p.estado === "sin-confirmar" || p.estado === "en-parte") && (
            <a className="font-semibold underline underline-offset-2" href={dondeSeRevisa(p.clave, clientId, projectId)}>
              Revisar en {p.dondeSeRevisa} →
            </a>
          )}
        </li>
      ))}
      <li className="text-xs opacity-80">
        {confirmado.reuniones === 0
          ? "No hay reuniones para leer enteras: une las reuniones a las sesiones de la exploración o elígelas en el Contexto."
          : `Lee ${confirmado.reuniones} ${confirmado.reuniones === 1 ? "reunión entera" : "reuniones enteras"}: las de las sesiones de la exploración y las que elegiste en el Contexto.`}
      </li>
    </ul>
  );

  if (generado) {
    return (
      <div className="border-b border-line bg-surface-muted px-4 py-2.5 text-xs text-fg-secondary">
        <button type="button" className="font-semibold" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
          {pendientes.length === 1 ? "1 fuente del diagnóstico" : `${pendientes.length} fuentes del diagnóstico`} con propuestas
          de Nexus sin confirmar {abierto ? "▾" : "▸"}
        </button>
        <span> — si las confirmas, regenerar el diagnóstico las toma como hechos.</span>
        {abierto && lista}
      </div>
    );
  }

  return (
    <Alert variant={confirmado.casiNada ? "warning" : "info"} title={titulo}>
      <p className="text-xs">
        {confirmado.casiNada
          ? `${confirmado.mensaje} Revisa las propuestas de Nexus para que el diagnóstico tenga sentido.`
          : "El diagnóstico lee lo que Nexus sabe de la cuenta. Lo que nadie confirmó entra como supuesto: no se afirma como hecho."}
      </p>
      {lista}
    </Alert>
  );
}
