/**
 * components/casos-de-uso/TarjetaDelCaso.tsx — la tarjeta de un caso en el listado del catálogo (2026-10-12, sobre la
 * referencia que mandó Elías). Arriba, el tipo (solo en «Todos»: en la pestaña de un tipo sobra) y las dimensiones que
 * mueve, por su nombre; después el título y la descripción; abajo, la licencia que pide y «Ver detalles». Smarteam no
 * se nombra: está en todos los casos. El salto de nivel de cada dimensión se ve en la ficha del caso.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { CasoDelCatalogo, TipoDeCaso } from "@/lib/casos-de-uso/catalogo";
import { NOMBRE_DEL_TIPO, nombreDeLaDimension, type EscalaDelCatalogo } from "@/lib/casos-de-uso/vista";
import { ChipDeHerramienta } from "./piezas";

/** El color del tipo: azul el que aterriza un área, ámbar el que la reactiva, verde el que la sube; gris el que acompaña. */
const CHIP_DEL_TIPO: Record<TipoDeCaso, string> = {
  aterrizar: "border-info-line bg-info-surface text-brand",
  reactivar: "border-warn-line bg-warn-surface text-warn-ink",
  expandir: "border-success-line bg-success-surface text-success-ink",
  complementario: "border-line bg-surface-hover text-fg-secondary",
};

/** Cuántas dimensiones se nombran en la tarjeta antes de decir «+N». */
const DIMENSIONES_EN_LA_TARJETA = 3;

export function TarjetaDelCaso({ caso, escala, conTipo = true }: { caso: CasoDelCatalogo; escala: EscalaDelCatalogo | null; conTipo?: boolean }) {
  const dimensiones = [...new Set(caso.mueve.map((m) => (escala ? nombreDeLaDimension(escala, m.dimension) : m.dimension)))];
  const visibles = dimensiones.slice(0, DIMENSIONES_EN_LA_TARJETA);
  const resto = dimensiones.length - visibles.length;
  return (
    <Link
      href={`/sales/use-cases/${caso.id}`}
      className="group flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-6 text-fg transition-colors hover:border-fg-muted/40"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {conTipo && (
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", CHIP_DEL_TIPO[caso.tipo])}>{NOMBRE_DEL_TIPO[caso.tipo]}</span>
        )}
        {visibles.map((d) => (
          <span key={d} className="rounded-full border border-line bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
            {d}
          </span>
        ))}
        {resto > 0 && <span className="px-1 text-xs text-fg-muted">+{resto}</span>}
      </div>
      <h3 className="text-lg font-semibold leading-[26px] group-hover:text-brand">{caso.titulo}</h3>
      <p className="line-clamp-3 text-[15px] leading-6 text-fg-secondary">{caso.descripcion}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex flex-wrap gap-1.5">
          {caso.herramientas
            .filter((h) => h !== "smarteam")
            .map((h) => (
              <ChipDeHerramienta key={h} herramienta={h} />
            ))}
        </div>
        <span className="text-[15px] font-medium text-brand group-hover:text-brand-light">
          Ver detalles <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}
