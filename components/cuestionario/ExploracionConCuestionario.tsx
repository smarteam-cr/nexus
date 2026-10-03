"use client";

/**
 * components/cuestionario/ExploracionConCuestionario.tsx — la pieza Exploración, en sus vistas.
 *
 * Desde el 2026-10-02 (pedido de Elías):
 *   · «Cuestionarios»: lo que se manda a cada persona del cliente (táctico, escala).
 *   · «Guía de exploración»: el lienzo que se usa durante las sesiones. REEMPLAZA al informe.
 *   · «Informe anterior»: el informe viejo, en solo lectura, solo si el proyecto lo tenía.
 *
 * La vista elegida se recuerda por proyecto en este navegador (conveniencia, no estado).
 */
import { useEffect, useState, type ReactNode } from "react";
import GuiaDeExploracion from "@/components/guia-exploracion/GuiaDeExploracion";
import CuestionarioPanel from "./CuestionarioPanel";

type Vista = "cuestionario" | "guia" | "informe";

export default function ExploracionConCuestionario({
  projectId,
  informeAnterior,
}: {
  projectId: string;
  /** El informe viejo en solo lectura; null si el proyecto no tenía. */
  informeAnterior: ReactNode | null;
}) {
  const clave = `nexus:exploracion-vista:${projectId}`;
  const [vista, setVista] = useState<Vista>("guia");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(clave);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación de localStorage (no existe en SSR)
      if (v === "cuestionario" || v === "guia" || (v === "informe" && informeAnterior)) setVista(v);
    } catch {
      /* sin almacenamiento: queda el default */
    }
  }, [clave, informeAnterior]);

  const elegir = (v: Vista) => {
    setVista(v);
    try {
      window.localStorage.setItem(clave, v);
    } catch {
      /* idem */
    }
  };

  const tab = (v: Vista, texto: string) => (
    <button
      onClick={() => elegir(v)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        vista === v ? "bg-surface-active text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
      }`}
    >
      {texto}
    </button>
  );

  return (
    <div>
      <div className="flex gap-1 px-6 pt-4">
        {tab("cuestionario", "Cuestionarios")}
        {tab("guia", "Guía de exploración")}
        {informeAnterior && tab("informe", "Informe anterior")}
      </div>
      {vista === "cuestionario" ? (
        <div className="px-6 py-5">
          <CuestionarioPanel projectId={projectId} />
        </div>
      ) : vista === "informe" && informeAnterior ? (
        informeAnterior
      ) : (
        <div className="px-6 py-5">
          <GuiaDeExploracion projectId={projectId} />
        </div>
      )}
    </div>
  );
}
