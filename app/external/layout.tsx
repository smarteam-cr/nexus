import type { ReactNode } from "react";

/**
 * Layout de la superficie EXTERNA (cliente final): landing de kickoff/cronograma/
 * caso de negocio + páginas de verificación de acceso.
 *
 * Aísla el chrome del documento del tema interno: marca todo el subárbol con
 * `data-external-surface` y fija `color-scheme: light`. Así el scrollbar y los
 * controles nativos (p.ej. el input de contraseña de /external/.../verify) se ven
 * SIEMPRE claros, sin importar la cookie `nexus-theme` que el navegador pueda
 * arrastrar (caso: un CSE en modo oscuro previsualizando el link del cliente).
 * La regla `html:has([data-external-surface])` en globals.css pinea además el
 * scrollbar del DOCUMENTO (el scroller raíz) a claro. Regla medular: las URLs que
 * se comparten al cliente son siempre claras/branded.
 */
export default function ExternalLayout({ children }: { children: ReactNode }) {
  return (
    <div data-external-surface style={{ colorScheme: "light" }}>
      {children}
    </div>
  );
}
