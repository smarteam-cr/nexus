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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { token } = await params;
  // D.1.5 — superficie de destino post-verify (?next=cronograma). Se valida
  // contra una whitelist en VerifyForm; acá solo se normaliza el shape.
  const { next } = await searchParams;
  const nextSurface = typeof next === "string" ? next : undefined;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Header minimal — sin logo externo, sin links a otros sitios */}
        <div className="text-center mb-8">
          {/* Logo self-hosted (mismo origen) → respeta la regla de cero recursos externos */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-smarteam.png" alt="Smarteam" className="h-9 w-auto mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900">
            Acceso al proyecto
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingresá la contraseña que te compartió tu CSE.
          </p>
        </div>

        <VerifyForm token={token} next={nextSurface} />

        <p className="mt-8 text-xs text-gray-400 text-center">
          Si no recibiste una contraseña, contactá al equipo de Smarteam.
        </p>
      </div>
    </main>
  );
}
