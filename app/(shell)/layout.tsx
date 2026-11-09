import AppShell from "@/components/layout/AppShell";

/**
 * Shell interno (sidebar + notificador CS) a nivel de LAYOUT del route group:
 * persiste en la navegación client-side y envuelve los loading.tsx de todas las
 * secciones internas — los skeletons se pintan CON sidebar, sin el empujón del ancho
 * del menú que había cuando cada page.tsx montaba su propio <AppShell>.
 *
 * Los guards por página (requireInternalUser / redirects por rol) se QUEDAN en
 * cada page: esto es solo presentación, no autorización.
 *
 * `data-nx-shell`: la marca de «esta página es interna» que lee app/globals.css (`html:has(...)`)
 * para subir un punto los tamaños fijos de letra (DECISIONS › «Letra de las pantallas internas»).
 * Es un elemento oculto y no un contenedor para que la regla alcance también los portales.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span hidden data-nx-shell />
      <AppShell>{children}</AppShell>
    </>
  );
}
