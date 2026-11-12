"use client";

/**
 * components/canvas/BorrarSeccionPropia.tsx — «✕ Borrar» en el chrome de una sección de la PERSONA (2026-11-12): una
 * propia, una copia hecha con «Duplicar» o una del catálogo que trajo «+ Agregar sección». Las de la plantilla no se
 * borran en el documento de siempre (se ocultan con el ojo): el servidor también lo rechaza.
 *
 * Mismo look que la píldora de borrar de las copias (components/artefactos/ArtefactoWorkspace.tsx). Borrar no se
 * deshace, así que pide confirmación (la regla de `removeSection` en useCanvasSections).
 */
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui";
import { esCustomKey } from "@/lib/landing/custom-sections";
import type { SectionWithBlocks } from "./useCanvasSections";

const PILDORA = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 9px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  color: "#b91c1c",
} as const;

/** ¿Es una sección de la persona? Las que se pueden borrar en el documento de siempre. */
export function esDeLaPersona(s: Pick<SectionWithBlocks, "key" | "agregadaPorPersona">): boolean {
  return esCustomKey(s.key) || s.agregadaPorPersona === true;
}

export default function BorrarSeccionPropia({
  section,
  onBorrar,
}: {
  section: SectionWithBlocks | undefined;
  onBorrar: (sectionId: string) => Promise<boolean>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  if (!section || !esDeLaPersona(section)) return null;
  const nombre = section.titleOverride?.trim() || section.label;
  return (
    <>
      <button type="button" style={PILDORA} onClick={() => setConfirmando(true)} title="Borrar esta sección" aria-label={`Borrar la sección ${nombre}`}>
        ✕ Borrar
      </button>
      <ConfirmDialog
        open={confirmando}
        title={`¿Borrar «${nombre}»?`}
        description="Se va de este documento con todo lo que tenga escrito, y no se puede deshacer. Para esconderla del cliente sin perderla, usa «Ocultar»."
        confirmLabel="Borrar"
        onCancel={() => setConfirmando(false)}
        onConfirm={() => {
          setConfirmando(false);
          void onBorrar(section.id);
        }}
      />
    </>
  );
}
