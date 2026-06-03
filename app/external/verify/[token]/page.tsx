/**
 * /external/verify/[token]
 *
 * Página pública para que el cliente externo ingrese la contraseña que el CSE
 * le compartió por canal seguro. NO valida el token en el server (sería filtrar
 * información — la página se renderiza idéntica exista o no el token; solo el
 * POST a /api/external/verify-access decide).
 *
 * Esta página es deliberadamente mínima: forma parte de la Fase 1 del módulo
 * externo, el landing real se construye en una fase próxima. Por ahora solo
 * confirma "acceso concedido / denegado" para validar el flujo end-to-end.
 *
 * REGLA DURA — CERO RECURSOS EXTERNOS: no `<a>` a sitios externos, no fonts
 * de Google Fonts en runtime, no scripts de CDN, no imágenes externas, no
 * analytics. La URL contiene un token sensible y cualquier navegación a un
 * origen distinto lo filtraría por el header Referer. Si algún día se agrega
 * un link "Powered by Nexus" o similar, debe apuntar al mismo dominio.
 */
import { VerifyForm } from "./VerifyForm";

export const dynamic = "force-dynamic";

export default async function ExternalVerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Header minimal — sin logo externo, sin links a otros sitios */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gray-900 text-white text-sm font-bold mb-4">
            N
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            Acceso al proyecto
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingresá la contraseña que te compartió tu CSE.
          </p>
        </div>

        <VerifyForm token={token} />

        <p className="mt-8 text-xs text-gray-400 text-center">
          Si no recibiste una contraseña, contactá al equipo de Smarteam.
        </p>
      </div>
    </main>
  );
}
