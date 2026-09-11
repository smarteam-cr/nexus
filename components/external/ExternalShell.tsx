/**
 * components/external/ExternalShell.tsx
 *
 * Chrome de marca Smarteam para la superficie EXTERNA (Fase C.2). Server component
 * estático (sin estado, sin auth): franja de acento de marca + nav con el logo +
 * footer. Envuelve SOLO las páginas públicas de `/external` — el embed interno del
 * Kickoff (dentro de ProjectCanvasPanel) NO usa esto, así no se duplica chrome.
 *
 * Usa los tokens de la LÍNEA GRÁFICA Smarteam (naranja #E8481C → royal #0B58D3,
 * el degradado del patrón "timeline" de la marca), NO el azul global de Nexus
 * (#3b82f6). El logo es self-hosted (`/logo-smarteam.png`) y la tipografía sale
 * de la var global `--font-jakarta` — cero recursos externos.
 *
 * ── EL ENCABEZADO DICE DE QUÉ PROYECTO ES (2026-09-10) ───────────────────────
 * Las páginas de un proyecto pasan `proyecto`: a la derecha del logo se lee el cliente y el
 * proyecto, y —si este navegador ya abrió otros proyectos del MISMO cliente con su contraseña—
 * un «Ver otros proyectos» para cambiar sin volver a entrar. Antes la página decía solo el
 * cliente: entre dos proyectos de la misma empresa, nadie notaba que estaba mirando el otro.
 * Lo que entra en la lista lo decide lib/external/selector-de-proyectos.ts, no este archivo.
 * El menú es un <details>: sin JS, funciona igual en la vista del cliente.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { OpcionDeProyecto } from "@/lib/external/selector-de-proyectos";

const SMARTEAM_ACCENT = "#E8481C";
const SMARTEAM_ROYAL = "#0B58D3";
const TINTA = "#0f1b3d";
const TINTA_SUAVE = "#6b7a99";
const BORDE = "#eaeff8";

/**
 * El MISMO ancho que el contenedor del documento (`--stl-w-pagina`, declarado en
 * `:root` por landing-engine.css) + el mismo padding lateral de 24px. Antes era un
 * 1100 suelto, así que el logo del chrome quedaba metido hacia adentro respecto del
 * contenido que envuelve — se veía como un desalineado, porque lo era.
 */
const SHELL_MAXW = "var(--stl-w-pagina, 1280px)";

/** El proyecto que se está mirando, y los otros del mismo cliente que este navegador ya abrió. */
export interface ProyectoEnPantalla {
  nombre: string;
  cliente: string;
  otros: OpcionDeProyecto[];
}

export default function ExternalShell({
  children,
  smarteamLogoUrl = "/logo-smarteam.png",
  proyecto,
}: {
  children: ReactNode;
  /** Logo de marca Smarteam (config global, fallback al asset self-hosted). */
  smarteamLogoUrl?: string;
  /** Solo en las páginas de UN proyecto. Sin esto el nav muestra solo el logo. */
  proyecto?: ProyectoEnPantalla;
}) {
  const year = new Date().getFullYear();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fff" }}>
      {/* Franja de acento de marca (degradado naranja→royal del patrón timeline) */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${SMARTEAM_ACCENT}, ${SMARTEAM_ROYAL})` }} />

      {/* Nav: logo a la izquierda; a la derecha, de qué proyecto es la página */}
      {/* zIndex 50: el menú «Ver otros proyectos» se abre hacia abajo, sobre el documento, y el sello
          «Servicio de continuidad» del kickoff (z-20) venía después en el DOM y se lo comía. Los
          toasts (z-100) siguen por encima. */}
      <header style={{ borderBottom: `1px solid ${BORDE}`, background: "#fff", position: "relative", zIndex: 50 }}>
        <div
          style={{
            maxWidth: SHELL_MAXW,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={smarteamLogoUrl} alt="Smarteam" style={{ height: 30, width: "auto", display: "block" }} />
          {proyecto && <ProyectoDelEncabezado proyecto={proyecto} />}
        </div>
      </header>

      {/* Contenido (el landing o el mensaje de acceso) */}
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>

      {/* Footer de marca */}
      <footer style={{ borderTop: `1px solid ${BORDE}`, background: "#fff", fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
        <div style={{ maxWidth: SHELL_MAXW, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={smarteamLogoUrl} alt="Smarteam" style={{ height: 22, width: "auto", display: "block", opacity: 0.9 }} />
          <p style={{ margin: 0, fontSize: 12, color: "#41527a" }}>
            © {year} Smarteam · Acompañamos tu implementación de HubSpot
          </p>
        </div>
      </footer>
    </div>
  );
}

function ProyectoDelEncabezado({ proyecto }: { proyecto: ProyectoEnPantalla }) {
  return (
    <div
      style={{
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: 14,
        minWidth: 0,
        fontFamily: "var(--font-jakarta), system-ui, sans-serif",
      }}
    >
      <div style={{ minWidth: 0, textAlign: "right" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: TINTA_SUAVE }}>
          {proyecto.cliente}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: TINTA, overflowWrap: "anywhere" }}>{proyecto.nombre}</div>
      </div>

      {proyecto.otros.length > 0 && (
        <details style={{ position: "relative", flexShrink: 0 }}>
          {/* `display: inline-flex` apaga el triángulo nativo del <summary> en Chrome y Firefox. */}
          <summary
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              listStyle: "none",
              fontSize: 13,
              fontWeight: 600,
              color: SMARTEAM_ROYAL,
              border: "1px solid #d7e1f3",
              borderRadius: 999,
              padding: "6px 12px",
              background: "#fff",
              userSelect: "none",
            }}
          >
            Ver otros proyectos <span aria-hidden="true">▾</span>
          </summary>
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 6px)",
              minWidth: 260,
              maxWidth: "min(360px, 90vw)",
              background: "#fff",
              border: `1px solid ${BORDE}`,
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(15, 27, 61, 0.12)",
              padding: 6,
            }}
          >
            {proyecto.otros.map((o) => (
              <Link
                key={o.href}
                href={o.href}
                style={{
                  display: "block",
                  padding: "9px 10px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  color: TINTA,
                  textDecoration: "none",
                  overflowWrap: "anywhere",
                }}
              >
                {o.nombre}
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
