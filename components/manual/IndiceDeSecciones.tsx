/**
 * components/manual/IndiceDeSecciones.tsx — el índice de salto de la Documentación.
 *
 * ── POR QUÉ ES UNA FORMA NUEVA Y NO `<Tabs>` ──────────────────────────────────
 * Parece una tab bar y NO lo es. El modo navegación de `<Tabs>` decide el activo con
 * `usePathname`, así que cinco enlaces al MISMO path quedarían los cinco con
 * `aria-current="page"`; y `role="tab"` sobre un ancla es semántica falsa —un tab controla un
 * tabpanel, no desplaza la página—. Un lector de pantalla anunciaría cinco pestañas
 * seleccionadas de un tablist que no existe.
 *
 * Vive acá y no en `components/ui` a propósito (§1-UI punto 5 pide agregar la forma al
 * vocabulario): es el único índice in-page del repo, y un ratchet para un consumidor único es
 * teatro. Si aparece un segundo consumidor, se promueve CON su ratchet.
 *
 * Sin scroll-spy, también a propósito: marcar la sección activa exige un `IntersectionObserver`,
 * o sea volver cliente a la única pantalla del módulo que puede ser 100% servidor. El costo no
 * paga la mejora cosmética.
 */
import { SECCIONES } from "@/lib/manual/anclas";
import { cn } from "@/lib/cn";

export default function IndiceDeSecciones({ className }: { className?: string }) {
  return (
    <nav aria-label="Secciones de la documentación" className={className}>
      <p className="text-2xs font-semibold uppercase tracking-wider text-fg-muted mb-2 px-2">
        En esta página
      </p>
      <ul className="flex flex-wrap gap-1 lg:block lg:space-y-0.5">
        {SECCIONES.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={cn(
                "block rounded-md px-2 py-1.5 text-sm text-fg-secondary transition-colors",
                "hover:bg-surface-hover hover:text-fg",
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
