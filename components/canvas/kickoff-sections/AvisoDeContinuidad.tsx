/**
 * components/canvas/kickoff-sections/AvisoDeContinuidad.tsx
 *
 * La píldora «Servicio de continuidad» arriba a la derecha del kickoff de un servicio recurrente
 * (tag `recurrente` del handoff). Vivía SOLO en la vista del cliente, así que el CSE no la veía en su
 * editor: el cliente recibía algo que adentro no se mostraba (2026-10-20, ARCHITECTURE §1-WEB punto 6).
 * Un componente, dos superficies. El CSE la quita sacando el tag del proyecto.
 *
 * Va sobre el documento (hex literal del motor, nunca flipea): el contenedor tiene que ser `relative`.
 */
export function AvisoDeContinuidad() {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 20,
        borderRadius: 999,
        border: "1px solid #99f6e4",
        background: "rgba(240, 253, 250, 0.9)",
        padding: "4px 12px",
        fontSize: 11,
        fontWeight: 500,
        color: "#0f766e",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
        backdropFilter: "blur(8px)",
      }}
    >
      Servicio de continuidad
    </div>
  );
}
