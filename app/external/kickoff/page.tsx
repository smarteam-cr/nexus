/**
 * /external/kickoff
 *
 * Ruta PÚBLICA donde el cliente externo ve el Kickoff publicado de SU proyecto
 * (Fase C.1). Server component: lee la cookie httpOnly `nexus_ext_access` (token,
 * fuera de la URL), pasa por el chokepoint server-side y renderiza read-only.
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
import { getPublishedKickoffForToken, EXTERNAL_ACCESS_COOKIE } from "@/lib/external/kickoff-view";

export const dynamic = "force-dynamic";

export default async function ExternalKickoffPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(EXTERNAL_ACCESS_COOKIE)?.value ?? "";

  const data = token ? await getPublishedKickoffForToken(token) : null;

  if (!data) {
    return <NoAccess />;
  }

  return (
    <main style={{ minHeight: "100vh", background: "#fff" }}>
      <KickoffLanding data={data} />
    </main>
  );
}

/** Mensaje neutro — no revela si fue token inválido, revocado o no publicado. */
function NoAccess() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gray-900 text-white text-sm font-bold mb-4">
          N
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Acceso no disponible</h1>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          Tu acceso expiró o este contenido todavía no está disponible. Volvé a abrir
          el enlace que te compartió tu equipo de Smarteam para ingresar de nuevo.
        </p>
      </div>
    </main>
  );
}
