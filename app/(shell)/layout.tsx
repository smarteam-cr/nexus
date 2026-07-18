import AppShell from "@/components/layout/AppShell";

/**
 * Shell interno (sidebar + notificador CS) a nivel de LAYOUT del route group:
 * persiste en la navegación client-side y envuelve los loading.tsx de todas las
 * secciones internas — los skeletons se pintan CON sidebar, sin el empujón de
 * ~224px que había cuando cada page.tsx montaba su propio <AppShell>.
 *
 * Los guards por página (requireInternalUser / redirects por rol) se QUEDAN en
 * cada page: esto es solo presentación, no autorización.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
