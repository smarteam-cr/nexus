/**
 * components/external/ExternalShell.tsx
 *
 * Chrome de marca Smarteam para la superficie EXTERNA (Fase C.2). Server component
 * estático (sin estado, sin auth): franja de acento de marca + nav con el logo +
 * footer. Envuelve SOLO las páginas públicas de `/external` — el embed interno del
 * Kickoff (dentro de ProjectCanvasPanel) NO usa esto, así no se duplica chrome.
 *
 * Usa los tokens de marca SMARTEAM (#168CF6 azul, #42E4B3 teal), NO el azul global
 * de Nexus (#3b82f6). El logo es self-hosted (`/logo-smarteam.png`) y la tipografía
 * sale de la var global `--font-montserrat` — cero recursos externos.
 */
import type { ReactNode } from "react";

const SMARTEAM_BLUE = "#168CF6";
const SMARTEAM_TEAL = "#42E4B3";

export default function ExternalShell({
  children,
  smarteamLogoUrl = "/logo-smarteam.png",
}: {
  children: ReactNode;
  /** Logo de marca Smarteam (config global, fallback al asset self-hosted). */
  smarteamLogoUrl?: string;
}) {
  const year = new Date().getFullYear();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff" }}>
      {/* Franja de acento de marca (ambos colores Smarteam) */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${SMARTEAM_BLUE}, ${SMARTEAM_TEAL})` }} />

      {/* Nav: logo a la izquierda (vista de cliente, sin menú) */}
      <header style={{ borderBottom: "1px solid #eef1f4", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={smarteamLogoUrl} alt="Smarteam" style={{ height: 30, width: "auto", display: "block" }} />
        </div>
      </header>

      {/* Contenido (el landing o el mensaje de acceso) */}
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>

      {/* Footer de marca */}
      <footer style={{ borderTop: "1px solid #eef1f4", background: "#fff", fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={smarteamLogoUrl} alt="Smarteam" style={{ height: 22, width: "auto", display: "block", opacity: 0.9 }} />
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
            © {year} Smarteam · Acompañamos tu implementación de HubSpot
          </p>
        </div>
      </footer>
    </div>
  );
}
