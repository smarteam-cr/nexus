"use client";

/**
 * «Tus reuniones» del tablero de salud (T1): la vista de quien ve solo las suyas. Todas, de la más reciente a la más
 * vieja, con un filtro: todas · sin nada · sin empresa · sin leer. El filtro es de esta lista (estado local), no de la URL.
 */
import { useState } from "react";
import { Segmentado } from "@/components/ui";
import type { ReunionVista } from "@/lib/sessions/salud-de-las-reuniones";
import { ListaDeReuniones } from "./TableroDeSalud";

type Filtro = "todas" | "nada" | "sin_empresa" | "sin_leer";

const PASA: Record<Filtro, (r: ReunionVista) => boolean> = {
  todas: () => true,
  nada: (r) => r.estado === "nada",
  sin_empresa: (r) => r.estado === "sin_empresa",
  sin_leer: (r) => r.leida === false,
};

const TOPE = 100;

export default function TusReuniones({ reuniones }: { reuniones: readonly ReunionVista[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const cuenta = (f: Filtro) => reuniones.filter(PASA[f]).length;
  const vistas = reuniones.filter(PASA[filtro]);
  return (
    <section aria-label="Tus reuniones" className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-fg">Tus {reuniones.length} reuniones</h2>
          <p className="text-xs text-fg-muted">De la más reciente a la más vieja.</p>
        </div>
        <Segmentado<Filtro>
          etiqueta="Mostrar"
          opciones={[
            { clave: "todas", etiqueta: "Todas" },
            { clave: "nada", etiqueta: `Sin nada · ${cuenta("nada")}` },
            { clave: "sin_empresa", etiqueta: `Sin empresa · ${cuenta("sin_empresa")}` },
            { clave: "sin_leer", etiqueta: `Sin leer · ${cuenta("sin_leer")}` },
          ]}
          valor={filtro}
          onCambio={setFiltro}
        />
      </div>
      <div className="border-t border-line">
        <ListaDeReuniones reuniones={vistas.slice(0, TOPE)} total={vistas.length} />
      </div>
    </section>
  );
}
