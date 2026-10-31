"use client";

/**
 * components/ventas/PipelineDeVentas.tsx — Ventas › Pipeline: el total, los negocios abiertos y lo que prometió Smarteam.
 * Las filas llegan resueltas del servidor (lib/ventas/pipeline-server.ts); acá solo se filtra y se pinta. Lo ámbar es lo
 * que pide atención: un negocio sin siguiente paso, un compromiso sin cumplir.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, Badge, EmptyState, Segmentado, Table, Tabs, type TableColumn } from "@/components/ui";
import { LineaDelPaso } from "@/components/siguiente-paso/LineaDelPaso";
import { cn } from "@/lib/cn";
import { cuandoEs, diasHasta, fechaCorta, montoCorto, ponderadoDelAnio } from "@/lib/ventas/negocios";
import { compromisosDeLosNegocios, ESTADOS_SIN_CUMPLIR, TEXTO_DE_LA_MARCA, textoDelCompromiso } from "@/lib/ventas/pipeline";
import type { CompromisoDelPipeline, FilaDelPipeline, VistaDelPipeline } from "@/lib/ventas/pipeline-server";

type Pestana = "negocios" | "compromisos";
type DeQuien = "mios" | "todos";
type DeQueEquipo = "smarteam" | "ventas";

const veces = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;

function Cifra({ rotulo, valor, nota, atencion = false }: { rotulo: string; valor: string; nota?: string | null; atencion?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs text-fg-muted">{rotulo}</div>
      <div className={cn("text-xl font-semibold", atencion ? "text-warn-ink" : "text-fg")}>{valor}</div>
      {nota && <div className="text-xs text-fg-muted">{nota}</div>}
    </div>
  );
}

export default function PipelineDeVentas({ vista }: { vista: VistaDelPipeline }) {
  const { hoyISO } = vista;
  const [pestana, setPestana] = useState<Pestana>("negocios");
  const [quien, setQuien] = useState<DeQuien>("todos");
  const [equipo, setEquipo] = useState<DeQueEquipo>("smarteam");

  const filas = useMemo(() => (quien === "mios" ? vista.filas.filter((f) => f.esMio) : vista.filas), [vista.filas, quien]);
  const deSusEmpresas = useMemo(() => compromisosDeLosNegocios(vista.compromisos, filas), [filas, vista.compromisos]);
  // «Solo Ventas» filtra la lista: la cifra de arriba y cada negocio cuentan lo de todo Smarteam.
  const compromisos = equipo === "smarteam" ? deSusEmpresas : deSusEmpresas.filter((c) => c.equipo === "ventas");

  const total = ponderadoDelAnio(filas, Number(hoyISO.slice(0, 4)));
  const sinPaso = filas.filter((f) => f.marca).length;
  const sinCumplir = deSusEmpresas.filter((c) => ESTADOS_SIN_CUMPLIR.includes(c.estado)).length;
  const pausados = quien === "mios" ? vista.pausadosMios : vista.pausados;
  const aparte = [total.sinMonto ? veces(total.sinMonto, "sin monto", "sin monto") : null, total.enOtraMoneda ? `${total.enOtraMoneda} en otra moneda` : null].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra rotulo={`Total de ${veces(filas.length, "negocio", "negocios")}`} valor={montoCorto(total.pipelineUsd, "USD")} nota={aparte || null} />
        <Cifra rotulo="Sin siguiente paso" valor={String(sinPaso)} atencion={sinPaso > 0} />
        <Cifra rotulo="Compromisos sin cumplir" valor={String(sinCumplir)} atencion={sinCumplir > 0} />
      </div>

      {vista.calendariosSinLeer > 0 && (
        <Alert variant="warning">
          No se pudo leer el calendario de {veces(vista.calendariosSinLeer, "vendedor", "vendedores")}: sus reuniones agendadas no cuentan como siguiente paso.
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
        <Tabs
          aria-label="Qué ver"
          items={[
            { key: "negocios" as const, label: "Negocios", count: filas.length },
            { key: "compromisos" as const, label: "Compromisos", count: compromisos.length },
          ]}
          value={pestana}
          onChange={setPestana}
          className="border-b-0"
        />
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {pestana === "compromisos" && (
            <Segmentado
              etiqueta="De qué equipo"
              opciones={[
                { clave: "smarteam", etiqueta: "Todo Smarteam" },
                { clave: "ventas", etiqueta: "Solo Ventas" },
              ]}
              valor={equipo}
              onCambio={setEquipo}
            />
          )}
          <Segmentado
            etiqueta="De quién"
            opciones={[
              { clave: "todos", etiqueta: "Todos" },
              { clave: "mios", etiqueta: "Mis negocios" },
            ]}
            valor={quien}
            onCambio={setQuien}
          />
        </div>
      </div>

      {pestana === "negocios" ? <TablaDeNegocios filas={filas} hoyISO={hoyISO} quien={quien} /> : <TablaDeCompromisos compromisos={compromisos} />}

      <p className="text-xs text-fg-muted">
        {pausados > 0 ? `${veces(pausados, "negocio pausado queda", "negocios pausados quedan")} fuera. ` : ""}
        Nexus mira tareas y reuniones: no confirma si algo se mandó.
        {vista.copiadoAt ? ` Negocios copiados de HubSpot: ${cuandoEs(vista.copiadoAt, hoyISO)}.` : ""}
      </p>
    </div>
  );
}

function TablaDeNegocios({ filas, hoyISO, quien }: { filas: FilaDelPipeline[]; hoyISO: string; quien: DeQuien }) {
  const columnas: TableColumn<FilaDelPipeline>[] = [
    {
      key: "negocio",
      header: "Negocio",
      width: "w-[24%]",
      render: (f) => (
        <div className="min-w-0 whitespace-normal">
          {f.hubspotUrl ? (
            <a href={f.hubspotUrl} target="_blank" rel="noopener noreferrer" className="block truncate font-semibold text-fg hover:text-brand" title={f.nombre}>
              {f.nombre}
            </a>
          ) : (
            <span className="block truncate font-semibold text-fg">{f.nombre}</span>
          )}
          <span className="block truncate text-xs text-fg-muted">
            {f.pipeline} · {f.etapa}
          </span>
        </div>
      ),
    },
    {
      key: "empresa",
      header: "Empresa",
      width: "w-[15%]",
      render: (f) =>
        f.clientId ? (
          <Link href={`/clients/${f.clientId}`} className="block truncate text-fg-secondary hover:text-brand" title={f.empresa}>
            {f.empresa}
          </Link>
        ) : (
          <span className="block truncate text-fg-secondary" title={f.empresa}>
            {f.empresa}
          </span>
        ),
    },
    {
      key: "monto",
      header: "Monto",
      width: "w-[10%]",
      align: "right",
      render: (f) => (f.monto === null ? <span className="text-fg-muted">Sin monto</span> : <span className="text-fg">{montoCorto(f.monto, f.moneda)}</span>),
    },
    {
      key: "cierre",
      header: "Cierre",
      width: "w-[9%]",
      render: (f) =>
        f.fechaCierre ? (
          <span className={diasHasta(f.fechaCierre, hoyISO) < 0 ? "text-warn-ink" : "text-fg-secondary"}>{fechaCorta(f.fechaCierre)}</span>
        ) : (
          <span className="text-fg-muted">Sin fecha</span>
        ),
    },
    { key: "responsable", header: "Responsable", width: "w-[12%]", render: (f) => <span className="block truncate text-fg-secondary">{f.vendedor ?? "Sin vendedor en Nexus"}</span> },
    {
      key: "paso",
      header: "Siguiente paso",
      render: (f) => (
        <div className="min-w-0 space-y-1 whitespace-normal">
          {f.marca && (
            <Badge variant="warning" size="xs">
              {TEXTO_DE_LA_MARCA[f.marca]}
            </Badge>
          )}
          <LineaDelPaso paso={f.paso} reunion={f.reunion} hoyISO={hoyISO} sugerencia={f.sugerencia} />
          {f.compromisosSinCumplir > 0 && <div className="text-xs text-warn-ink">{veces(f.compromisosSinCumplir, "compromiso sin cumplir", "compromisos sin cumplir")}</div>}
        </div>
      ),
    },
  ];
  return (
    <Table
      variante="sistema"
      columns={columnas}
      rows={filas}
      rowKey={(f) => f.id}
      empty={<EmptyState variant="dashed" title={quien === "mios" ? "No tienes negocios abiertos" : "No hay negocios abiertos"} description="Los negocios se copian de HubSpot cada hora." />}
    />
  );
}

function TablaDeCompromisos({ compromisos }: { compromisos: CompromisoDelPipeline[] }) {
  const columnas: TableColumn<CompromisoDelPipeline>[] = [
    {
      key: "compromiso",
      header: "Lo que se prometió",
      render: (c) => (
        <div className="min-w-0 space-y-1 whitespace-normal">
          <Link href={`/tareas?t=${encodeURIComponent(c.id)}`} className="block font-semibold text-fg hover:text-brand">
            {c.titulo}
          </Link>
          {c.cita ? (
            <p className="border-l-2 border-line pl-2 text-xs text-fg-secondary">«{c.cita}»</p>
          ) : (
            <p className="text-xs text-fg-muted">La cita solo la ve quien estuvo en la reunión.</p>
          )}
        </div>
      ),
    },
    { key: "empresa", header: "Empresa", width: "w-[16%]", render: (c) => <span className="block truncate text-fg-secondary" title={c.empresa}>{c.empresa}</span> },
    { key: "responsable", header: "Responsable", width: "w-[14%]", render: (c) => <span className="block truncate text-fg-secondary">{c.responsable ?? "Por asignar"}</span> },
    {
      key: "reunion",
      header: "Reunión",
      width: "w-[14%]",
      render: (c) =>
        c.reunion ? (
          <span className="block truncate text-fg-secondary" title={c.reunion.titulo}>
            {fechaCorta(c.reunion.fecha)}
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      key: "estado",
      header: "Estado",
      width: "w-[18%]",
      render: (c) =>
        ESTADOS_SIN_CUMPLIR.includes(c.estado) ? (
          <Badge variant="warning" size="xs">
            {textoDelCompromiso(c.estado, c.venceEl)}
          </Badge>
        ) : (
          <span className="text-xs text-fg-muted">{textoDelCompromiso(c.estado, c.venceEl)}</span>
        ),
    },
  ];
  return (
    <Table
      variante="sistema"
      columns={columnas}
      rows={compromisos}
      rowKey={(c) => c.id}
      empty={<EmptyState variant="dashed" title="No hay compromisos por seguir" description="Salen de lo que Smarteam prometió en las reuniones con estas empresas." />}
    />
  );
}
