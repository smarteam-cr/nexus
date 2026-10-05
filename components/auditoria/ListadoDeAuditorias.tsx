"use client";

/**
 * El listado de auditorías: una fila por auditoría con cómo quedó (lecturas, análisis, lo que falta
 * comprobar a mano) y cuánto cambió el portal desde la anterior. Las filas ya vienen armadas
 * (lib/auditoria-portal/listado.ts): acá solo se filtran y se pintan.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Segmentado, Table, type TableColumn } from "@/components/ui";
import { IconoDeSugerencia } from "@/components/exploraciones/FranjaDeSugerencias";
import { cifra } from "@/lib/auditoria-portal/cifras";
import type { FilaDelListado } from "@/lib/auditoria-portal/listado";
import { ChipDeEstado } from "./piezas";

type Filtro = "todas" | "clientes" | "smarteam" | "pendientes";

const fechaYHora = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

function Lecturas({ f }: { f: FilaDelListado }) {
  if (f.estado === "capturando") return <span className="text-[13px] text-fg-muted">Leyendo…</span>;
  if (!f.lecturas) return <span className="text-[13px] text-fg-muted">—</span>;
  const { intentos, fallidas } = f.lecturas;
  if (fallidas === 0) return <span className="text-[13px] font-medium text-success-ink">✓ {cifra(intentos)} de {cifra(intentos)}</span>;
  return (
    <span className="text-[13px] font-medium text-warn-ink">
      ● {cifra(intentos - fallidas)} de {cifra(intentos)} <span className="font-normal text-fg-muted">· {cifra(fallidas)} sin leer</span>
    </span>
  );
}

function Analisis({ f }: { f: FilaDelListado }) {
  const a = f.analisis;
  if (f.estado === "fallo" || f.estado === "perdida") return <ChipDeEstado tono="atencion">No terminó</ChipDeEstado>;
  if (f.estado === "vieja") return <span className="text-[13px] text-fg-muted">Versión anterior</span>;
  if (a.estado === "generando") return <span className="text-[13px] text-fg-muted">Generando…</span>;
  if (a.estado === "sin") return <span className="text-[13px] text-fg-muted">Sin generar</span>;
  if (a.sugeridos > 0)
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-brand">
        <IconoDeSugerencia className="h-[13px] w-[13px]" />
        {cifra(a.sugeridos)} por confirmar
      </span>
    );
  return <span className="text-[13px] font-medium text-success-ink">✓ {cifra(a.confirmados)} confirmados</span>;
}

export default function ListadoDeAuditorias({ filas }: { filas: FilaDelListado[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const pasa = (f: FilaDelListado, k: Filtro) =>
    k === "todas" || (k === "clientes" && f.tipo === "cliente") || (k === "smarteam" && f.tipo === "smarteam") || (k === "pendientes" && (f.pendientes ?? 0) > 0);
  const visibles = useMemo(() => filas.filter((f) => pasa(f, filtro)), [filas, filtro]);
  const cuenta = (k: Filtro) => filas.filter((f) => pasa(f, k)).length;

  const columnas: TableColumn<FilaDelListado>[] = [
    {
      key: "portal",
      header: "Portal",
      sortValue: (f) => f.portal,
      render: (f) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-fg">{f.portal}</p>
          <p className="truncate text-xs text-fg-muted">{f.detallePortal}</p>
        </div>
      ),
    },
    {
      key: "capturada",
      header: "Capturada",
      width: "w-44",
      sortValue: (f) => f.capturadaEn,
      render: (f) => (
        <div>
          <p className="text-[13px] text-fg">{fechaYHora(f.capturadaEn)}</p>
          {f.creadaPor && <p className="text-xs text-fg-muted">por {f.creadaPor}</p>}
        </div>
      ),
    },
    { key: "lecturas", header: "Lecturas", width: "w-44", hideOnMobile: true, render: (f) => <Lecturas f={f} /> },
    { key: "analisis", header: "Análisis", width: "w-40", render: (f) => <Analisis f={f} /> },
    {
      key: "pendientes",
      header: "Comprobar a mano",
      width: "w-40",
      hideOnMobile: true,
      sortValue: (f) => f.pendientes,
      render: (f) =>
        f.pendientes === null ? (
          <span className="text-[13px] text-fg-muted">—</span>
        ) : f.pendientes > 0 ? (
          <span className="text-[13px] font-medium text-warn-ink">● {cifra(f.pendientes)} {f.pendientes === 1 ? "pendiente" : "pendientes"}</span>
        ) : (
          <span className="text-[13px] font-medium text-success-ink">✓ Al día</span>
        ),
    },
    {
      key: "contactos",
      header: "Contactos",
      width: "w-36",
      align: "right",
      sortValue: (f) => f.contactos,
      render: (f) => (
        <div>
          <p className="tabular-nums text-fg">{f.contactos === null ? "—" : cifra(f.contactos)}</p>
          {f.delta ? (
            <p className="text-xs text-fg-muted">
              {f.delta.contactos >= 0 ? "+" : "−"}
              {cifra(Math.abs(f.delta.contactos))} desde {fechaCorta(f.delta.desde)}
            </p>
          ) : (
            f.contactos !== null && <p className="text-xs text-fg-muted">primera auditoría</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Segmentado
        etiqueta="Filtrar auditorías"
        opciones={(
          [
            ["todas", "Todas"],
            ["clientes", "De clientes"],
            ["smarteam", "De Smarteam"],
            ["pendientes", "Con pendientes"],
          ] as const
        ).map(([clave, etiqueta]) => ({ clave, etiqueta: `${etiqueta} · ${cifra(cuenta(clave))}` }))}
        valor={filtro}
        onCambio={setFiltro}
      />
      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-fg-muted">Ninguna auditoría con este filtro.</p>
      ) : (
        <Table columns={columnas} rows={visibles} rowKey={(f) => f.id} onRowClick={(f) => router.push(`/audits/${f.id}`)} />
      )}
      <p className="text-xs text-fg-muted">
        {cifra(filas.length)} {filas.length === 1 ? "auditoría" : "auditorías"}. Cada corrida queda guardada: volver a correr una crea otra, así se ve cómo cambió el portal.
      </p>
    </div>
  );
}
