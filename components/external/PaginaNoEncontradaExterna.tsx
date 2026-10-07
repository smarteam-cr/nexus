/**
 * components/external/PaginaNoEncontradaExterna.tsx — el 404 que ve quien NO es del equipo (2026-10-06).
 *
 * La superficie externa no usa el sistema interno: va con la letra y los colores de NoAccess (estilos
 * INLINE, siempre claro), sin la palabra «404» y sin nada de Nexus. La pintan app/external/not-found.tsx
 * (un enlace de cliente roto, una propuesta o un documento revocado) y app/not-found.tsx (el respaldo).
 *
 * El texto sirve para los dos tipos de enlace externo: los de proyecto (con contraseña) y los de un
 * documento suelto (propuesta, Roles), que no la piden. Por eso no habla de contraseña. Tampoco dice
 * si algo existió: un enlace revocado y uno mal copiado se ven igual, como en NoAccess.
 */
import Link from "next/link";

export default function PaginaNoEncontradaExterna({ elegirHref }: { elegirHref?: string }) {
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
          No encontramos esta página
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "#6b7280" }}>
          La dirección puede estar incompleta o el enlace ya no estar disponible. Abre el enlace que te
          compartieron desde Smarteam o pide uno nuevo.
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
