/**
 * /external/business-case/verify/[token]
 *
 * Página pública: el prospecto ingresa la contraseña que le compartió el vendedor.
 * No valida el token en el server (se renderiza idéntica exista o no). CERO
 * recursos externos (el token va en la URL → un request cross-origin lo filtraría
 * por Referer).
 */
import { BusinessCaseVerifyForm } from "./VerifyForm";

export const dynamic = "force-dynamic";

export default async function BusinessCaseVerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-smarteam.png" alt="Smarteam" className="h-9 w-auto mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900">Caso de negocio</h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingresá la contraseña que te compartió tu contacto en Smarteam.
          </p>
        </div>

        <BusinessCaseVerifyForm token={token} />

        <p className="mt-8 text-xs text-gray-400 text-center">
          Si no recibiste una contraseña, contactá al equipo de Smarteam.
        </p>
      </div>
    </main>
  );
}
