"use client";

/**
 * ListaDeExploraciones — las exploraciones vivas, con lo que le falta a cada una.
 *
 * Cada fila dice en una línea QUÉ SIGUE (la misma indicación que el lienzo muestra arriba) y cuántos
 * de los siete puntos de «lista para proponer» ya cumple. Se ordena por la última actividad.
 */
import { useRouter } from "next/navigation";
import { Badge, EmptyState, Table, type TableColumn } from "@/components/ui";
import { diaCorto } from "@/lib/exploraciones/fechas";
import type { FilaDeLaLista } from "@/lib/exploraciones/servidor";
import NuevaExploracion from "./NuevaExploracion";

const cuando = (iso: string): string => diaCorto(iso);

export default function ListaDeExploraciones({ filas, puedeEditar }: { filas: FilaDeLaLista[]; puedeEditar: boolean }) {
  const router = useRouter();

  const columnas: TableColumn<FilaDeLaLista>[] = [
    {
      key: "empresa",
      header: "Empresa",
      render: (f) => <span className="font-medium text-fg">{f.empresa}</span>,
      sortValue: (f) => f.empresa.toLowerCase(),
    },
    {
      key: "industria",
      header: "Industria",
      width: "w-40",
      hideOnMobile: true,
      render: (f) => <span className="text-fg-secondary">{f.edicion ?? "Escala general"}</span>,
    },
    {
      key: "areas",
      header: "Áreas en juego",
      width: "w-44",
      hideOnMobile: true,
      render: (f) => (f.areas.length ? <span className="text-fg-secondary">{f.areas.join(" · ")}</span> : <span className="text-fg-muted">—</span>),
    },
    {
      key: "sigue",
      header: "Qué sigue",
      render: (f) => <span className="text-fg-secondary">{f.queSigue}</span>,
    },
    {
      key: "lista",
      header: "Lista para proponer",
      width: "w-36",
      align: "center",
      render: (f) => (
        <Badge variant={f.total > 0 && f.cumplidos === f.total ? "success" : "default"} size="xs">
          {f.cumplidos} de {f.total}
        </Badge>
      ),
      sortValue: (f) => f.cumplidos,
    },
    {
      key: "actualizada",
      header: "Actualizada",
      width: "w-28",
      align: "right",
      render: (f) => <span className="text-fg-muted tabular-nums">{cuando(f.actualizadaEn)}</span>,
      sortValue: (f) => new Date(f.actualizadaEn),
    },
  ];

  return (
    <Table
      columns={columnas}
      rows={filas}
      rowKey={(f) => f.id}
      onRowClick={(f) => router.push(`/sales/exploraciones/${f.id}`)}
      search={{ placeholder: "Buscar empresa…", getText: (f) => `${f.empresa} ${f.edicion ?? ""}` }}
      action={puedeEditar ? <NuevaExploracion /> : undefined}
      initialSort={{ key: "actualizada", dir: "desc" }}
      empty={
        <EmptyState
          variant="dashed"
          title="Todavía no hay exploraciones"
          description="Una exploración es el lienzo de una empresa para preparar y guiar las dos reuniones con el prospecto, y llegar a la primera propuesta con sus metas en cifras."
          action={puedeEditar ? <NuevaExploracion /> : undefined}
        />
      }
    />
  );
}
