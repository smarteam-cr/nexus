/**
 * /external/kickoff
 *
 * Ruta PÚBLICA donde el cliente externo ve el Kickoff publicado de SU proyecto.
 * Server component: lee la cookie httpOnly `nexus_ext_access` (token, fuera de la
 * URL), pasa por el chokepoint server-side y renderiza read-only, envuelto en el
 * chrome de marca Smarteam (ExternalShell: nav + footer — Fase C.2).
 *
 * Toda la seguridad vive en getPublishedKickoffForToken (lib/external/kickoff-view):
 * resuelve token→projectId, re-chequea revokedAt + kickoffPublishedAt EN CADA render,
 * y devuelve solo bloques CONFIRMED en shape limpio. Si algo no aplica → null →
 * mensaje neutro (no se revela por qué). La cookie por sí sola NO otorga acceso.
 *
 * `force-dynamic`: lee cookies por request, nunca se cachea.
 */
import { cookies } from "next/headers";
import KickoffLanding from "@/components/canvas/KickoffLanding";
import ExternalShell from "@/components/external/ExternalShell";
import { getPublishedKickoffForToken } from "@/lib/external/kickoff-view";
import { EXTERNAL_ACCESS_COOKIE } from "@/lib/external/access";

export const dynamic = "force-dynamic";

export default async function ExternalKickoffPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(EXTERNAL_ACCESS_COOKIE)?.value ?? "";

  const data = token ? await getPublishedKickoffForToken(token) : null;

  return <ExternalShell>{data ? <KickoffLanding data={data} /> : <NoAccess />}</ExternalShell>;
}

/** Mensaje neutro — no revela si fue token inválido, revocado o no publicado. */
function NoAccess() {
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
