/**
 * Layout minimal para /external/verify/[token].
 *
 * Wrapper vacío deliberado — esta ruta NO usa AppShell (porque el cliente
 * externo no tiene sesión Supabase ni AppUser). El layout raíz (app/layout.tsx)
 * provee la estructura HTML y las fuentes Geist self-hosted, que cumplen la
 * regla cero-recursos-externos de esta página (Next.js descarga las fuentes
 * en build time, no en runtime).
 *
 * REGLA DURA: nada en esta ruta debe cargar recursos externos (CDN scripts,
 * Google Fonts en runtime, analytics, imágenes externas). El token vive en la
 * URL y se filtraría por header Referer al navegar a cualquier origen distinto.
 */
export default function ExternalVerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
