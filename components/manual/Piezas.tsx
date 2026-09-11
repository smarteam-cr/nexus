/**
 * components/manual/Piezas.tsx — las piezas de presentación compartidas de los bloques vivos.
 *
 * Sin estado y sin eventos: esto se lee, no se opera. Lo usan los renderizadores que pinta el
 * bloque «Vivo» de una página de Documentación (recorrido, documentos, agentes, HubSpot).
 *
 * La jerarquía de encabezados es contrato, no estilo: el título de la página es h1 (lo pone el
 * encabezado de la página) · h2 los títulos que escribe quien edita · h3 documento o categoría de
 * agentes · h4 agente, pipeline o grupo de propiedades. Un `<p className="font-medium">` haciendo
 * de título es invisible para la navegación por encabezados y para un lector de pantalla.
 *
 * ⚠ `Seccion` y `Bloque` vivían acá y se retiraron el 2026-09-11: eran el envoltorio del manual
 * cuando ERA la pantalla del módulo. Ahora los títulos y la narrativa son contenido editable de
 * la página, así que un componente que los dibujara desde el código volvería a congelarlos.
 */

/** Rótulo neutro y chico — para etiquetas derivadas, no para estados. */
export function Pildora({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-line bg-surface-hover px-2 py-0.5 text-[11px] text-fg-secondary">
      {children}
    </span>
  );
}

/**
 * La misma píldora, pero que lleva a otra parte de la página. Existe porque el cruce
 * documento↔agente es la relación que la pantalla vieja pintaba como texto muerto: decía
 * "Botón: Generar kickoff" y no había forma de llegar al agente.
 */
export function PildoraLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center rounded-md border border-line bg-surface-hover px-2 py-0.5 text-[11px] text-fg-secondary hover:border-brand hover:text-brand transition-colors"
    >
      {children}
    </a>
  );
}
