"use client";

/**
 * components/contexto/InstruccionesDelDocumento.tsx — las «Instrucciones adicionales» de UN documento
 * del proyecto (2026-10-07).
 *
 * Pedido de Elías: «el contexto adicional debe ser para cada artefacto por separado: la misma
 * sección, pero guardarse para cada artefacto». Lo que el CSE le pide a la IA de ESE documento se
 * guarda en su canvas (la entry `__doc`, por /api/projects/[id]/doc-brief) y lo lee solo su agente
 * (`cargarMaterialDelDocumento` / `instruccionesDelDocumento`). La caja es la misma de la preventa
 * (InstruccionesAdicionales); acá solo se carga y se guarda. El cronograma conserva la suya.
 */
import { useEffect, useState } from "react";
import InstruccionesAdicionales from "./InstruccionesAdicionales";
import { TOPE_INSTRUCCIONES_DEL_DOC } from "@/lib/business-cases/section-briefs";
import { useToast } from "@/components/ui/Toast";

export default function InstruccionesDelDocumento({
  projectId,
  slug,
  elDocumento,
  ejemplo,
  soloLectura,
  onActivas,
}: {
  projectId: string;
  /** El slug de la pieza (lib/pieces/registry.ts): «handoff», «diagnosis», «kickoff»… */
  slug: string;
  /** Cómo se nombra en una frase: «el diagnóstico», «la entrega». */
  elDocumento: string;
  ejemplo: string;
  soloLectura?: boolean;
  /** Para la línea cerrada del bloque: si hay instrucciones guardadas. */
  onActivas?: (activas: boolean) => void;
}) {
  const [guardadas, setGuardadas] = useState("");
  const toast = useToast();

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/doc-brief?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ brief: string | null }>) : null))
      .then((d) => {
        if (vivo && d) setGuardadas(d.brief ?? "");
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId, slug]);

  useEffect(() => {
    onActivas?.(guardadas.trim() !== "");
  }, [guardadas, onActivas]);

  async function guardar(texto: string): Promise<boolean> {
    try {
      const r = await fetch(`/api/projects/${projectId}/doc-brief`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, brief: texto || null }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        toast.error(
          d?.error === "canvas_not_found"
            ? `Todavía no existe ${elDocumento}: genéralo o actívalo y vuelve a guardar.`
            : (d?.error ?? "No se pudieron guardar las instrucciones."),
        );
        return false;
      }
      const d = (await r.json()) as { brief: string | null };
      setGuardadas(d.brief ?? "");
      toast.success("Instrucciones guardadas.");
      return true;
    } catch {
      toast.error("No se pudieron guardar las instrucciones: revisa la conexión.");
      return false;
    }
  }

  return (
    <InstruccionesAdicionales
      guardadas={guardadas}
      onGuardar={guardar}
      tope={TOPE_INSTRUCCIONES_DEL_DOC}
      soloLectura={soloLectura}
      explicacion={`Lo que le pides a la IA para ${elDocumento}. Pesan más que las reuniones y las notas, y valen solo para ${elDocumento}: no cambian los otros documentos.`}
      ejemplo={ejemplo}
    />
  );
}
