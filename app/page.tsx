import { getConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  domain: "Solo se permite el inicio de sesión con cuentas de @smarteamcr.com.",
  not_member:
    "Tu correo no está registrado como miembro del equipo en Nexus. Pedile a un administrador que te agregue.",
  oauth_init: "No se pudo iniciar el flujo de Google. Intentá de nuevo en un momento.",
  oauth_exchange: "Google rechazó el intercambio de credenciales. Probá de nuevo.",
  oauth_no_code: "Google no devolvió un código de autorización válido.",
  oauth_no_user: "Google no devolvió información de usuario. Probá de nuevo.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authenticated = await getConsultantSession();
  if (authenticated) redirect("/clients");

  const { error: errorCode } = await searchParams;
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950">
      <div className="max-w-sm w-full space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20">
            <svg className="w-7 h-7 text-brand-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="2.5"/>
              <circle cx="19" cy="12" r="1.5"/>
              <circle cx="15.5" cy="18.1" r="1.5"/>
              <circle cx="8.5" cy="18.1" r="1.5"/>
              <circle cx="5" cy="12" r="1.5"/>
              <circle cx="8.5" cy="5.9" r="1.5"/>
              <circle cx="15.5" cy="5.9" r="1.5"/>
              <line x1="14.5" y1="12" x2="17.5" y2="12"/>
              <line x1="13.25" y1="14.17" x2="14.75" y2="16.76"/>
              <line x1="10.75" y1="14.17" x2="9.25" y2="16.76"/>
              <line x1="9.5" y1="12" x2="6.5" y2="12"/>
              <line x1="10.75" y1="9.83" x2="9.25" y2="7.24"/>
              <line x1="13.25" y1="9.83" x2="14.75" y2="7.24"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Nexus
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Acceso exclusivo para consultores
            </p>
          </div>
        </div>

        {/* Mensaje de error si vino de un callback fallido */}
        {errorMessage && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-300">{errorMessage}</p>
          </div>
        )}

        {/* Único botón de login: Google OAuth vía Supabase Auth */}
        <a
          href="/auth/google"
          className="flex items-center justify-center gap-3 w-full px-6 py-3.5 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-semibold text-sm transition-colors shadow-lg shadow-black/20 text-center"
        >
          <svg className="w-5 h-5" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
          </svg>
          Iniciar sesión con Google
        </a>

        <p className="text-center text-xs text-gray-600">
          Solo cuentas <code className="text-gray-500">@smarteamcr.com</code> registradas pueden acceder.
        </p>
      </div>
    </main>
  );
}
