/**
 * components/manual/Piezas.tsx — las piezas de presentación compartidas del manual.
 *
 * Server Components puros (sin estado, sin eventos): la Documentación se lee, no se opera. Eso
 * es lo que permite que un link con ancla FUNCIONE — si el contenido se resolviera en el
 * cliente, el navegador buscaría el `#doc-kickoff` antes de que exista y no saltaría a ningún
 * lado.
 *
 * La jerarquía de encabezados es contrato, no estilo: h1 = el título de la página (PageHeader) ·
 * h2 = las secciones del índice · h3 = bloque narrativo, documento o categoría de agentes ·
 * h4 = agente, pipeline o grupo de propiedades. Un `<p className="font-medium">` haciendo de
 * título es invisible para la navegación por encabezados y para un lector de pantalla.
 */
import type { BloqueNarrativo } from "@/lib/manual/contenido";

/**
 * Una sección de primer nivel — la unidad a la que apunta el índice.
 *
 * `scroll-mt-24` deja aire arriba para que el encabezado no quede pegado al borde, y
 * `tabIndex={-1}` es lo que hace que el FOCO viaje con el salto: sin él, quien navega por
 * teclado hace clic en el índice, la página scrollea, y el siguiente Tab lo devuelve al índice.
 */
export function Seccion({
  id,
  titulo,
  intro,
  children,
}: {
  id: string;
  titulo: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mb-14">
      <h2
        id={id}
        tabIndex={-1}
        className="scroll-mt-24 text-lg font-semibold text-fg border-b border-line pb-2 mb-5"
      >
        {titulo}
      </h2>
      {intro && <p className="text-sm text-fg-secondary leading-relaxed mb-6 max-w-prose">{intro}</p>}
      {children}
    </section>
  );
}

/** Un bloque narrativo del contenido escrito a mano: título, párrafos y tarjetas opcionales. */
export function Bloque({ b }: { b: BloqueNarrativo }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-fg mb-2">{b.titulo}</h3>
      {b.parrafos.map((p, i) => (
        <p key={i} className="text-sm text-fg-secondary leading-relaxed mb-4 max-w-prose">
          {p}
        </p>
      ))}
      {b.bullets && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {b.bullets.map((x) => (
            <div key={x.titulo} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-sm font-medium text-fg">{x.titulo}</p>
              <p className="text-xs text-fg-muted leading-relaxed mt-1">{x.detalle}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rótulo neutro y chico — para etiquetas derivadas, no para estados. */
export function Pildora({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-line bg-surface-hover px-2 py-0.5 text-[11px] text-fg-secondary">
      {children}
    </span>
  );
}

/**
 * La misma píldora, pero que lleva a otra parte del manual. Existe porque el cruce
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
