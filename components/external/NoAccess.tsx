/**
 * components/external/NoAccess.tsx
 *
 * Mensaje NEUTRO de acceso denegado para las páginas externas (D.1.5 lo
 * extrajo de kickoff/page.tsx — lo comparten kickoff y cronograma). No revela
 * el motivo: token inválido, revocado o superficie no publicada se ven igual.
 */
export default function NoAccess() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "48px 16px",
      }}
    >
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#111827", fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}>
          Acceso no disponible
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "#6b7280" }}>
          Tu acceso expiró o este contenido todavía no está disponible. Volvé a abrir
          el enlace que te compartió tu equipo de Smarteam para ingresar de nuevo.
        </p>
      </div>
    </div>
  );
}
