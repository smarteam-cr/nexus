/**
 * components/external/NoAccess.tsx
 *
 * Mensaje NEUTRO de acceso denegado para las páginas externas (D.1.5 lo extrajo de kickoff/page.tsx
 * — lo comparten las superficies de proyecto y el Business Case). No revela el motivo: token
 * inválido, revocado, superficie no publicada o un proyecto que este navegador no tiene abierto se
 * ven igual.
 *
 * `elegirHref` (2026-09-10): la página de UN proyecto que no se puede abrir, en un navegador que sí
 * tiene otros proyectos abiertos, ofrece ir a elegirlos en vez de dejar un callejón sin salida.
 */
import Link from "next/link";

export default function NoAccess({ elegirHref }: { elegirHref?: string }) {
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
          Tu acceso expiró, este contenido todavía no está disponible o no está abierto en este
          navegador. Abre el enlace que te compartió tu equipo de Smarteam —el que pide la
          contraseña— para ingresar.
        </p>
        {elegirHref && (
          <p style={{ marginTop: 14, fontSize: 14 }}>
            <Link href={elegirHref} style={{ color: "#0B58D3", fontWeight: 600, textDecoration: "none" }}>
              Ver los proyectos abiertos en este navegador
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
