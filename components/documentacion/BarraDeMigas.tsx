/**
 * components/documentacion/BarraDeMigas.tsx — dónde está la página, fija arriba.
 *
 * Como la barra de arriba de Notion: de Inicio a la página, cada paso clicable. Queda pegada al
 * bajar, así volver a la sección o a Inicio está siempre a un clic. Reemplaza a las migas chicas
 * que iban sobre el título, que en las páginas del primer nivel ni aparecían.
 *
 * Sin estado: la arma el servidor (`migasDe`). Al renombrar una página, el `router.refresh()` la
 * trae con el título nuevo.
 */
import Link from "next/link";
import { Z } from "@/lib/ui/z";
import { IconoDePagina } from "./iconos";
import { ALTO_DE_BARRA_DE_MIGAS } from "./layout";

export interface Miga {
  slug: string;
  titulo: string;
  icono: string | null;
}

export default function BarraDeMigas({ migas }: { migas: Miga[] }) {
  if (migas.length === 0) return null;
  return (
    <nav
      aria-label="Ruta de la página"
      /* La capa sale de la escala única (lib/ui/z.ts). Va en `style` porque `z-[20]` no está
         escrito en ningún archivo y Tailwind no generaría la clase. */
      style={{ zIndex: Z.STICKY }}
      className={`sticky top-0 flex ${ALTO_DE_BARRA_DE_MIGAS} items-center border-b border-line bg-background px-4`}
    >
      <ol className="flex min-w-0 items-center gap-0.5 text-sm">
        {migas.map((m, i) => {
          const actual = i === migas.length - 1;
          const nombre = (
            <>
              <IconoDePagina icono={m.icono} className="h-3.5 w-3.5" tamanoEmoji="text-xs" />
              <span className="truncate">{m.titulo}</span>
            </>
          );
          return (
            <li key={m.slug} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && (
                <span aria-hidden="true" className="px-0.5 text-fg-muted">
                  /
                </span>
              )}
              {actual ? (
                <span
                  aria-current="page"
                  className="flex min-w-0 items-center gap-1.5 px-1.5 py-1 text-fg"
                >
                  {nombre}
                </span>
              ) : (
                <Link
                  href={`/documentacion/${m.slug}`}
                  className="flex min-w-0 max-w-[16rem] items-center gap-1.5 rounded-md px-1.5 py-1 text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
                >
                  {nombre}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
