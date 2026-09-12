/**
 * components/documentacion/iconos.tsx — los íconos de la INTERFAZ del módulo.
 *
 * ── LA DISTINCIÓN QUE ORDENA ESTE ARCHIVO ────────────────────────────────────
 * Hay dos clases de ícono en una base de conocimiento, y mezclarlas se ve mal:
 *
 *   · El ícono de una PÁGINA lo elige una persona y es un emoji (📈, 💼). Es contenido: dice de
 *     qué trata esa página, y por eso se guarda con ella.
 *   · Los íconos de la INTERFAZ —buscar, papelera, crear, arrastrar, candado— son parte de la
 *     app, no del contenido. Van en el mismo trazo que el resto de Nexus (SVG de 24, `stroke`
 *     currentColor, grosor 2), como los del menú lateral.
 *
 * Usar emojis para lo segundo era lo que hacía que el módulo se viera ajeno al resto de la app:
 * un 🗑️ al lado de un ícono de trazo fino canta.
 */

function Svg({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** El ícono por defecto de una página sin emoji: una hoja, en el trazo de la app. */
export function IconoDocumento({ className }: { className?: string }) {
  return (
    <Svg
      className={className}
      d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8m-5-5l5 5m-5-5v5h5M9 13h6M9 17h4"
    />
  );
}

export function IconoBuscar({ className }: { className?: string }) {
  return <Svg className={className} d="M11 4a7 7 0 100 14 7 7 0 000-14zm5 12l4 4" />;
}

export function IconoPapelera({ className }: { className?: string }) {
  return (
    <Svg
      className={className}
      d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"
    />
  );
}

export function IconoMas({ className }: { className?: string }) {
  return <Svg className={className} d="M12 5v14M5 12h14" />;
}

export function IconoCandado({ className }: { className?: string }) {
  return (
    <Svg className={className} d="M7 11V8a5 5 0 0110 0v3m-11 0h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1z" />
  );
}

export function IconoChevron({ className }: { className?: string }) {
  return <Svg className={className} d="M9 6l6 6-6 6" />;
}

/** La manija de arrastre: seis puntos, el gesto universal de «esto se mueve». */
export function IconoArrastrar({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

/**
 * El ícono de UNA página: su emoji si lo tiene, y si no la hoja de la app.
 *
 * Está acá y no repetido en cada pantalla porque aparece en cinco lugares —el árbol, el Inicio,
 * las migas, el buscador, las subpáginas— y la regla «emoji o hoja» tiene que ser una sola.
 */
export function IconoDePagina({
  icono,
  className = "h-4 w-4",
  tamanoEmoji = "text-sm",
}: {
  icono: string | null;
  className?: string;
  tamanoEmoji?: string;
}) {
  if (icono) {
    return (
      <span className={`${tamanoEmoji} leading-none`} aria-hidden="true">
        {icono}
      </span>
    );
  }
  return <IconoDocumento className={`${className} text-fg-muted`} />;
}
