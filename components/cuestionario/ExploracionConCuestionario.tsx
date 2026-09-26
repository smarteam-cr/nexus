"use client";

/**
 * components/cuestionario/ExploracionConCuestionario.tsx — Exploración en sus dos momentos.
 *
 * «Cuestionario previo» (4A) es lo que el CSE manda al cierre del kickoff; «Informe de
 * exploración» (4B) es el documento que sale después de las sesiones y que ya lee lo contestado.
 * Van juntos en la misma pieza porque son la misma fase: separarlos en dos piezas del desplegable
 * obligaba a elegir cuál «es» Exploración.
 *
 * La vista elegida se recuerda por proyecto en este navegador (conveniencia, no estado).
 */
import { useEffect, useState, type ReactNode } from "react";
import CuestionarioPanel from "./CuestionarioPanel";

type Vista = "cuestionario" | "informe";

export default function ExploracionConCuestionario({
  projectId,
  informe,
}: {
  projectId: string;
  informe: ReactNode;
}) {
  const clave = `nexus:exploracion-vista:${projectId}`;
  const [vista, setVista] = useState<Vista>("informe");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(clave);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación de localStorage (no existe en SSR)
      if (v === "cuestionario" || v === "informe") setVista(v);
    } catch {
      /* sin almacenamiento: queda el default */
    }
  }, [clave]);

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
        {tab("cuestionario", "Cuestionario previo")}
        {tab("informe", "Informe de exploración")}
      </div>
      {vista === "cuestionario" ? <div className="px-6 py-5">{<CuestionarioPanel projectId={projectId} />}</div> : informe}
    </div>
  );
}
