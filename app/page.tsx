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

/* Posiciones de los 7 nodos del logo (constelación) en el viewBox 0..24 del SVG
   de marca. El nodo central es el "hub"; los 6 perimetrales se conectan a él.
   Se usan en la capa de fondo para que la red "lata" con pulsos escalonados. */
const HUB = { x: 12, y: 12 };
const SATELLITES = [
  { x: 19, y: 12 },
  { x: 15.5, y: 18.1 },
  { x: 8.5, y: 18.1 },
  { x: 5, y: 12 },
  { x: 8.5, y: 5.9 },
  { x: 15.5, y: 5.9 },
];

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
    <main className="nx-login">
      {/* ── Capa de fondo: aurora a la deriva + constelación de marca viva ──── */}
      <div className="nx-login__bg" aria-hidden="true">
        <span className="nx-login__blob nx-login__blob--a" />
        <span className="nx-login__blob nx-login__blob--b" />
        <span className="nx-login__blob nx-login__blob--c" />
        <span className="nx-login__grid" />

        {/* Constelación de marca, grande y tenue, con nodos/aristas que laten */}
        <svg
          className="nx-login__constellation"
          viewBox="0 0 24 24"
          fill="none"
          focusable="false"
        >
          {/* Aristas hub → satélites */}
          {SATELLITES.map((s, i) => (
            <line
              key={`edge-${i}`}
              x1={HUB.x}
              y1={HUB.y}
              x2={s.x}
              y2={s.y}
              className="nx-login__edge"
              style={{ animationDelay: `${i * 0.45}s` }}
            />
          ))}
          {/* Nodos satélite */}
          {SATELLITES.map((s, i) => (
            <circle
              key={`node-${i}`}
              cx={s.x}
              cy={s.y}
              r="0.9"
              className="nx-login__node"
              style={{ animationDelay: `${i * 0.45}s` }}
            />
          ))}
          {/* Nodo central (hub) */}
          <circle cx={HUB.x} cy={HUB.y} r="1.6" className="nx-login__node nx-login__node--hub" />
        </svg>

        <span className="nx-login__vignette" />
      </div>

      {/* ── Card central ───────────────────────────────────────────────────── */}
      <section className="nx-login__card" aria-labelledby="nx-login-title">
        {/* Logo con halo latiente */}
        <div className="nx-login__brand">
          <div className="nx-login__logo">
            <span className="nx-login__logo-halo" aria-hidden="true" />
            <svg
              className="nx-login__logo-mark"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              role="img"
              aria-label="Logo de Nexus"
            >
              <circle cx="12" cy="12" r="2.5" />
              <circle cx="19" cy="12" r="1.5" />
              <circle cx="15.5" cy="18.1" r="1.5" />
              <circle cx="8.5" cy="18.1" r="1.5" />
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="8.5" cy="5.9" r="1.5" />
              <circle cx="15.5" cy="5.9" r="1.5" />
              <line x1="14.5" y1="12" x2="17.5" y2="12" />
              <line x1="13.25" y1="14.17" x2="14.75" y2="16.76" />
              <line x1="10.75" y1="14.17" x2="9.25" y2="16.76" />
              <line x1="9.5" y1="12" x2="6.5" y2="12" />
              <line x1="10.75" y1="9.83" x2="9.25" y2="7.24" />
              <line x1="13.25" y1="9.83" x2="14.75" y2="7.24" />
            </svg>
          </div>

          <h1 id="nx-login-title" className="nx-login__title">
            Nexus
          </h1>
          <p className="nx-login__subtitle">Acceso exclusivo para consultores</p>
        </div>

        {/* Mensaje de error si vino de un callback fallido */}
        {errorMessage && (
          <div className="nx-login__error" role="alert">
            <svg
              className="nx-login__error-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16.5" x2="12" y2="16.5" />
            </svg>
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Único botón de login: Google OAuth vía Supabase Auth */}
        <a
          href="/auth/google"
          className="nx-login__google"
          aria-label="Iniciar sesión con Google"
        >
          <svg className="nx-login__google-icon" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
            />
            <path
              fill="#FF3D00"
              d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
            />
            <path
              fill="#4CAF50"
              d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
            />
            <path
              fill="#1976D2"
              d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
            />
          </svg>
          <span>Iniciar sesión con Google</span>
        </a>

        {/* Nota de dominio como pill refinado con candado */}
        <div className="nx-login__note-wrap">
          <p className="nx-login__note">
            <svg
              className="nx-login__note-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <span>
              Solo cuentas <code className="nx-login__code">@smarteamcr.com</code> registradas
              pueden acceder.
            </span>
          </p>
        </div>
      </section>
    </main>
  );
}
