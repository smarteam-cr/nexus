"use client";

/**
 * components/propuestas/ListaDePropuestas.tsx — la lista de Propuestas (rediseño del 2026-10-05,
 * sistema «Nexus · interfaz interna»).
 *
 * Antes: nombre, tipo y «Publicado/Borrador». Ahora dice qué hacer con cada una: en qué está, qué
 * pasó del lado del cliente (la abrió, no la abre desde…, la aprobó) y quién la arma. Pestañas por
 * estado con su cuenta, «Mías / De todo el equipo» y búsqueda. El estado lo decide UNA regla
 * (lib/business-cases/estado-de-la-propuesta.ts); acá solo se filtra y se pinta.
 *
 * Lo ámbar es lo que pide atención: un link vencido, una propuesta que nadie abre.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Segmentado, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ClaveDeEstado } from "@/lib/business-cases/estado-de-la-propuesta";

export interface FilaDeLaLista {
  id: string;
  nombre: string;
  empresa: string;
  prospecto: boolean;
  /** «Propuesta 2»: la última generada. null si todavía no se generó ninguna. */
  version: string | null;
  tipo: string;
  estado: { clave: ClaveDeEstado; etiqueta: string; nota: string; notaAtencion: boolean };
  cliente: { texto: string; atencion: boolean };
  arma: string | null;
  esMia: boolean;
  hubspotUrl: string | null;
  usaPreventa: boolean;
}

type Pestana = "todas" | ClaveDeEstado;
type Quien = "mias" | "equipo";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "todas", etiqueta: "Todas" },
  { clave: "armado", etiqueta: "En armado" },
  { clave: "compartida", etiqueta: "Compartidas" },
  { clave: "aprobada", etiqueta: "Aprobadas" },
];

const CHIP: Record<ClaveDeEstado, string> = {
  armado: "border-dashed border-line bg-surface-muted text-fg-muted",
  compartida: "border-line bg-surface text-fg-secondary",
  aprobada: "border-success-line bg-success-surface text-success-ink",
};
const MARCA: Record<ClaveDeEstado, string> = { armado: "○ ", compartida: "", aprobada: "✓ " };

const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";

export default function ListaDePropuestas({ filas, hayMias }: { filas: FilaDeLaLista[]; hayMias: boolean }) {
  const [pestana, setPestana] = useState<Pestana>("todas");
  // Quien arma propuestas arranca en las suyas; el resto (dirección, Customer Success), en todas.
  const [quien, setQuien] = useState<Quien>(hayMias ? "mias" : "equipo");
  const [busqueda, setBusqueda] = useState("");

  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter(
      (f) =>
        (quien === "equipo" || f.esMia) &&
        (!q || f.nombre.toLowerCase().includes(q) || f.empresa.toLowerCase().includes(q)),
    );
  }, [filas, quien, busqueda]);

  const cuenta = (p: Pestana) => (p === "todas" ? base.length : base.filter((f) => f.estado.clave === p).length);
  const visibles = pestana === "todas" ? base : base.filter((f) => f.estado.clave === pestana);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
        <Tabs
          aria-label="Estado de la propuesta"
          items={PESTANAS.map((p) => ({ key: p.clave, label: p.etiqueta, count: cuenta(p.clave) }))}
          value={pestana}
          onChange={setPestana}
          className="border-b-0"
        />
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <Segmentado
            etiqueta="De quién"
            opciones={[
              { clave: "mias", etiqueta: "Mías" },
              { clave: "equipo", etiqueta: "De todo el equipo" },
            ]}
            valor={quien}
            onCambio={setQuien}
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar"
            aria-label="Buscar por propuesta o empresa"
            className="h-8 w-44 rounded-lg border border-line bg-surface px-3 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      {visibles.length === 0 ? (
        <Vacia quien={quien} hayFiltro={!!busqueda.trim() || pestana !== "todas"} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[920px] border-collapse text-[13px] leading-[19px]">
            <thead>
              <tr className="bg-surface-muted text-left">
                <th className={cn(ROTULO, "border-b border-line px-4 py-2.5")}>Propuesta</th>
                <th className={cn(ROTULO, "w-28 border-b border-line px-4 py-2.5")}>Tipo</th>
                <th className={cn(ROTULO, "w-48 border-b border-line px-4 py-2.5")}>Estado</th>
                <th className={cn(ROTULO, "w-56 border-b border-line px-4 py-2.5")}>El cliente</th>
                <th className={cn(ROTULO, "w-36 border-b border-line px-4 py-2.5")}>La arma</th>
                <th className={cn(ROTULO, "w-24 border-b border-line px-4 py-2.5")}>
                  <span className="sr-only">HubSpot</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id} className="group align-top transition-colors hover:bg-surface-hover">
                  <td className="border-b border-line px-4 py-3">
                    <Link href={`/business-cases/${f.id}`} className="block min-w-0">
                      <span className="block truncate text-sm font-semibold text-fg group-hover:text-brand">{f.nombre}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {f.empresa}
                        {f.prospecto ? " (prospecto)" : ""}
                        {f.version ? ` · ${f.version}` : " · sin generar"}
                        {f.usaPreventa ? " · con preventa" : ""}
                      </span>
                    </Link>
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <span className="inline-flex rounded-full border border-line px-2 py-0.5 text-xs text-fg-secondary">{f.tipo}</span>
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", CHIP[f.estado.clave])}>
                      {MARCA[f.estado.clave]}
                      {f.estado.etiqueta}
                    </span>
                    <span className={cn("mt-1 block text-xs", f.estado.notaAtencion ? "text-warn-ink" : "text-fg-muted")}>
                      {f.estado.nota}
                    </span>
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    {f.cliente.atencion ? (
                      <span className="inline-flex rounded-md border border-warn-line bg-warn-surface px-2 py-0.5 text-xs text-warn-ink">
                        {f.cliente.texto}
                      </span>
                    ) : (
                      <span className={f.cliente.texto === "—" ? "text-fg-muted" : "text-fg-secondary"}>{f.cliente.texto}</span>
                    )}
                  </td>
                  <td className="border-b border-line px-4 py-3 text-fg-secondary">{f.arma ?? "—"}</td>
                  <td className="border-b border-line px-4 py-3">
                    {f.hubspotUrl && (
                      <a
                        href={f.hubspotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver la empresa en HubSpot"
                        className="text-xs text-fg-muted transition-colors hover:text-brand"
                      >
                        HubSpot ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-fg-muted">Ordenadas por lo último que pasó: una apertura o una aprobación del cliente sube la propuesta.</p>
    </div>
  );
}

function Vacia({ quien, hayFiltro }: { quien: Quien; hayFiltro: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <span className="text-[15px] font-semibold text-fg">
        {hayFiltro ? "Nada con ese filtro" : quien === "mias" ? "Todavía no armas ninguna propuesta" : "Todavía no hay propuestas"}
      </span>
      <span className="max-w-md text-[13px] leading-[19px] text-fg-muted">
        {hayFiltro
          ? "Prueba con otra pestaña o borra la búsqueda."
          : "Empieza por la empresa en HubSpot, o desde una preventa si ya pasó por ahí."}
      </span>
    </div>
  );
}
