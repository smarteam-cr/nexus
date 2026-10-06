"use client";

/**
 * components/procesos/MapaPorCarriles.tsx — UN PROCESO DIBUJADO EN CARRILES, CON REACT FLOW.
 *
 * Una fila por quién hace el paso (el cliente final, cada equipo, cada sistema) y una columna por
 * cuándo lo hace. El acomodo es propio y determinista (`lib/procesos/layout.ts`): React Flow no trae
 * carriles. Lo que sí pone la librería:
 *  - los carriles son nodos de fondo (no se arrastran ni se eligen, detrás de todo);
 *  - el dolor es hijo del paso (`parentId`): se mueve con él;
 *  - las flechas son `smoothstep` con punta; las que vuelven atrás, punteadas;
 *  - el detalle del paso elegido es un `NodeToolbar` (de dónde sale, la cita, editar).
 *
 * Los colores salen de los tokens (`var(--color-…)`), así el mapa acompaña el modo claro y oscuro.
 */
import "@xyflow/react/dist/style.css";
import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "@/lib/cn";
import { acomodarPorCarriles, ladoDelDetalle, MEDIDAS } from "@/lib/procesos/layout";
import { ETIQUETA_DE_ORIGEN, type MapaDeProceso, type PasoDelMapa, type TipoDeCarril } from "@/lib/procesos/mapa";

export type CualVersion = "hoy" | "despues";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  const mes = MESES[parseInt(m, 10) - 1];
  return mes ? `${parseInt(d, 10)} ${mes}` : iso;
}

const ETIQUETA_DE_CARRIL: Record<TipoDeCarril, string> = {
  cliente_final: "Cliente final",
  equipo: "Equipo",
  sistema: "Sistema",
};
const ROTULO_DE_TIPO: Partial<Record<PasoDelMapa["tipo"], string>> = {
  decision: "◇ Decisión",
  inicio: "Inicio",
  fin: "Fin",
  espera: "Espera",
};

interface DatoCarril extends Record<string, unknown> {
  nombre: string;
  tipo: TipoDeCarril;
  ancho: number;
  alto: number;
  primero: boolean;
}

interface DatoPaso extends Record<string, unknown> {
  paso: PasoDelMapa;
  cual: CualVersion;
  chip: string;
  /** El número del cambio al que pertenece (en «Comparar»). */
  marca: string;
  /** Si el paso de hoy se va después de la implementación, por qué. */
  seVa: string;
  carrilNombre: string;
  reemplazaTexto: string;
  lado: "izquierda" | "derecha";
  onEditar?: (cual: CualVersion, pasoId: string) => void;
}

const NodoCarril = memo(function NodoCarril({ data }: NodeProps<Node<DatoCarril>>) {
  const sistema = data.tipo === "sistema";
  return (
    <div
      className={cn("pointer-events-none flex", sistema ? "bg-surface-hover" : "bg-surface", !data.primero && "border-t border-line")}
      style={{ width: data.ancho, height: data.alto }}
    >
      <div className="flex flex-col gap-0.5 border-r border-line px-3 py-3.5" style={{ width: MEDIDAS.rotulo }}>
        <span className="text-[12.5px] font-semibold leading-[1.3] text-fg">{data.nombre}</span>
        <span className="text-[11px] text-fg-muted">{ETIQUETA_DE_CARRIL[data.tipo]}</span>
      </div>
    </div>
  );
});

const NodoPaso = memo(function NodoPaso({ data, selected }: NodeProps<Node<DatoPaso>>) {
  const p = data.paso;
  const supuesto = p.origen === "supuesto";
  const redonda = p.tipo === "inicio" || p.tipo === "fin";
  const ambar = data.chip.includes("supuesto");
  const seVa = data.chip === "se va";
  const rotulo = ROTULO_DE_TIPO[p.tipo] ?? "";
  return (
    <>
      <NodeToolbar isVisible={selected} position={data.lado === "izquierda" ? Position.Left : Position.Right} align="start" offset={14}>
        <div className="nodrag nowheel flex w-[340px] flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 text-[13px] shadow-segment">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{data.carrilNombre}</span>
          <span className="text-[14.5px] font-semibold leading-[1.4] text-fg">{p.texto}</span>
          <span className={cn("text-xs font-semibold", supuesto ? "text-warn-ink" : p.origen === "propuesto" ? "text-fg-secondary" : "text-success-ink")}>
            {ETIQUETA_DE_ORIGEN[p.origen]}
          </span>
          {p.herramienta && <span className="text-xs text-fg-secondary">Con: {p.herramienta}</span>}
          {data.cual === "hoy" && p.dolor && (
            <div className="rounded-lg border border-warn-line bg-warn-surface px-2.5 py-1.5 text-[12.5px] text-warn-ink">Dolor: {p.dolor}</div>
          )}
          {data.cual === "despues" && p.enHubspot && (
            <span className="text-xs text-fg-secondary">
              <b className="font-semibold">En HubSpot:</b> {p.enHubspot}
            </span>
          )}
          {data.reemplazaTexto && <span className="text-xs text-fg-secondary">Reemplaza a: {data.reemplazaTexto}</span>}
          {p.citas.map((c, i) => (
            <div key={i} className="flex flex-col gap-[3px] border-t border-line pt-2">
              <span className="text-[13px] leading-[1.45] text-fg">«{c.cita}»</span>
              <span className="text-[11.5px] text-fg-muted">
                {[c.quien, c.sesionTitulo, c.fecha ? fechaCorta(c.fecha) : "", c.minuto ? `min ${c.minuto}` : ""].filter(Boolean).join(" · ")}
              </span>
            </div>
          ))}
          {p.citas.length === 0 && (
            <span className="text-[12.5px] text-warn-ink">
              {p.origen === "propuesto"
                ? "Sin cita: lo propone Smarteam. Confírmalo con el cliente."
                : "Sin cita: lo completó el agente para que el mapa cierre. Pregúntalo en la próxima sesión."}
            </span>
          )}
          {data.seVa && <span className="border-t border-line pt-2 text-xs text-fg-secondary">Después de la implementación se va: {data.seVa}</span>}
          {data.onEditar && (
            <button
              type="button"
              onClick={() => data.onEditar?.(data.cual, p.id)}
              className="self-start rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
            >
              Editar el paso
            </button>
          )}
        </div>
      </NodeToolbar>
      <Handle type="target" position={Position.Left} className="!opacity-0" isConnectable={false} />
      <div
        className={cn(
          "relative flex cursor-pointer flex-col justify-center gap-[2px] px-[10px] py-[6px]",
          redonda ? "rounded-[18px]" : "rounded-lg",
          p.tipo === "decision" || p.tipo === "espera" ? "bg-surface-hover" : "bg-surface",
          selected ? "border-2 border-brand ring-[3px] ring-brand-soft" : supuesto ? "border-[1.5px] border-dashed border-warning" : "border border-line",
          seVa && "opacity-55",
        )}
        style={{ width: MEDIDAS.paso.ancho, height: MEDIDAS.paso.alto }}
      >
        {data.chip && (
          <span
            className={cn(
              "absolute -top-[9px] right-[6px] whitespace-nowrap rounded-full border px-[6px] text-[10px] font-semibold leading-[16px]",
              ambar ? "border-warn-line bg-warn-surface text-warn-ink" : "border-line bg-surface",
              !ambar && (seVa ? "text-fg-muted" : "text-fg-secondary"),
            )}
          >
            {data.chip}
          </span>
        )}
        {data.marca && (
          <span className="absolute -left-[9px] -top-[9px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-fg text-[10.5px] font-bold text-surface">
            {data.marca}
          </span>
        )}
        {rotulo && <span className="text-[10px] font-semibold leading-[12px] text-fg-muted">{rotulo}</span>}
        <span
          className={cn("overflow-hidden text-[12.5px] font-medium leading-[16px] text-fg", seVa && "line-through")}
          style={{
            display: "-webkit-box",
            WebkitLineClamp: rotulo ? 2 : 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {p.texto}
        </span>
        {p.herramienta && <span className="truncate text-[11px] leading-[14px] text-fg-muted">{p.herramienta}</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!opacity-0" isConnectable={false} />
    </>
  );
});

const NodoDolor = memo(function NodoDolor({ data }: NodeProps<Node<{ texto: string }>>) {
  return (
    <div
      className="overflow-hidden rounded-md border border-warn-line bg-warn-surface px-[7px] py-[3px] text-[11px] leading-[13px] text-warn-ink"
      style={{ width: MEDIDAS.paso.ancho, height: MEDIDAS.dolor }}
    >
      {data.texto}
    </div>
  );
});

const tiposDeNodo = { carril: NodoCarril, paso: NodoPaso, dolor: NodoDolor };

/** El chip de arriba a la derecha de un paso. */
function chipDelPaso(p: PasoDelMapa, cual: CualVersion, seVa: string): string {
  if (seVa) return "se va";
  let chip = "";
  if (cual === "despues") chip = p.cambio === "nuevo" ? "nuevo" : p.cambio === "automatico" ? "automático" : p.cambio === "cambia" ? "cambia" : "";
  if (!chip) return p.origen === "supuesto" ? "supuesto" : p.origen === "propuesto" ? "propuesto" : "";
  return p.origen === "supuesto" || p.origen === "propuesto" ? `${chip} · ${p.origen}` : chip;
}

/** Nodos y flechas de React Flow para una versión del proceso. Puro: lo prueba el test. */
export function armarFlujo(
  mapa: MapaDeProceso,
  cual: CualVersion,
  opciones: {
    conMarcas: boolean;
    onEditar?: (cual: CualVersion, pasoId: string) => void;
  },
) {
  const version = mapa[cual];
  const conDolor = cual === "hoy";
  const acomodo = acomodarPorCarriles(version, { conDolor });
  const seVaDe = new Map(mapa.despues.seVa.map((v) => [v.id, v.porque]));
  const hoyPorId = new Map(mapa.hoy.pasos.map((p) => [p.id, p]));
  const marcas = new Map<string, string>();
  if (opciones.conMarcas) {
    mapa.cambios.forEach((c, i) => {
      for (const id of cual === "hoy" ? c.hoy : c.despues) if (!marcas.has(id)) marcas.set(id, String(i + 1));
    });
  }
  const nombreDelCarril = new Map(acomodo.bandas.map((b) => [b.carril.id, b.carril.nombre]));

  const nodes: Node[] = acomodo.bandas.map((b) => ({
    id: `carril-${b.carril.id}`,
    type: "carril",
    position: { x: 0, y: b.y },
    data: {
      nombre: b.carril.nombre,
      tipo: b.carril.tipo,
      ancho: acomodo.ancho,
      alto: b.alto,
      primero: b.primero,
    } satisfies DatoCarril,
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: -1,
  }));
  for (const p of version.pasos) {
    const seVa = cual === "hoy" && opciones.conMarcas ? (seVaDe.get(p.id) ?? "") : "";
    const dato: DatoPaso = {
      paso: p,
      cual,
      chip: chipDelPaso(p, cual, seVa),
      marca: marcas.get(p.id) ?? "",
      seVa: cual === "hoy" ? (seVaDe.get(p.id) ?? "") : "",
      carrilNombre: nombreDelCarril.get(p.carril) ?? p.carril,
      reemplazaTexto: cual === "despues" ? p.reemplaza.map((r) => `«${hoyPorId.get(r)?.texto ?? r}»`).join(", ") : "",
      lado: ladoDelDetalle(acomodo, p),
      onEditar: opciones.onEditar,
    };
    nodes.push({
      id: p.id,
      type: "paso",
      position: acomodo.posicion[p.id],
      data: dato,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  }
  // El dolor es HIJO del paso: tiene que ir después de su padre en el arreglo.
  if (conDolor) {
    for (const p of version.pasos) {
      if (!p.dolor) continue;
      nodes.push({
        id: `dolor-${p.id}`,
        type: "dolor",
        parentId: p.id,
        position: { x: 0, y: MEDIDAS.paso.alto + 6 },
        data: { texto: p.dolor },
        draggable: false,
        selectable: false,
      });
    }
  }
  const ids = new Set(version.pasos.map((p) => p.id));
  const edges: Edge[] = version.flechas
    .filter((f) => ids.has(f.de) && ids.has(f.a))
    .map((f, i) => {
      const retorno = acomodo.retornos.has(`${f.de}>${f.a}`);
      return {
        id: `f${i}-${f.de}-${f.a}`,
        source: f.de,
        target: f.a,
        type: "smoothstep",
        label: f.etiqueta || undefined,
        pathOptions: { borderRadius: 8, offset: 14 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "var(--color-fg-muted)",
          width: 16,
          height: 16,
        },
        style: {
          stroke: "var(--color-fg-muted)",
          strokeWidth: 1.5,
          strokeDasharray: retorno ? "4 4" : undefined,
        },
        labelStyle: { fontSize: 11, fill: "var(--color-fg-muted)" },
        labelBgStyle: { fill: "var(--color-surface)" },
        labelBgPadding: [4, 2] as [number, number],
      };
    });
  return { nodes, edges, ancho: acomodo.ancho, alto: acomodo.alto };
}

/** Los controles de zoom de React Flow, con los tokens (sin esto salen blancos en modo oscuro). */
const COLORES_DE_REACT_FLOW = {
  "--xy-controls-button-background-color": "var(--color-surface)",
  "--xy-controls-button-background-color-hover": "var(--color-surface-hover)",
  "--xy-controls-button-color": "var(--color-fg-secondary)",
  "--xy-controls-button-color-hover": "var(--color-fg)",
  "--xy-controls-button-border-color": "var(--color-line)",
  "--xy-controls-box-shadow": "none",
} as CSSProperties;

/** Aire arriba del mapa: ahí va el rótulo de la versión, que no puede tapar el primer carril. */
const ARRIBA = 48;
const MARGEN = 16;
/** Más chico que esto el texto de un paso ya no se lee: el mapa se recorre de costado. */
const ZOOM_MINIMO = 0.8;

/**
 * El mapa entra al ancho de la pantalla si se puede leer; si no, arranca a la izquierda con un zoom
 * que se lee y se recorre arrastrando. El alto se ajusta al mapa, sin espacio vacío.
 */
function encuadre(anchoDelLienzo: number, ancho: number, alto: number) {
  const zoom = Math.min(1, Math.max(ZOOM_MINIMO, (anchoDelLienzo - 2 * MARGEN) / ancho));
  return {
    zoom,
    x: MARGEN,
    y: ARRIBA,
    alto: Math.min(720, Math.round(alto * zoom + ARRIBA + MARGEN)),
  };
}

function Lienzo({
  mapa,
  cual,
  conMarcas,
  onEditar,
}: {
  mapa: MapaDeProceso;
  cual: CualVersion;
  conMarcas: boolean;
  onEditar?: (cual: CualVersion, pasoId: string) => void;
}) {
  const { nodes: iniciales, edges, ancho, alto } = useMemo(() => armarFlujo(mapa, cual, { conMarcas, onEditar }), [mapa, cual, conMarcas, onEditar]);
  const [nodes, setNodes] = useState(iniciales);
  const [base, setBase] = useState(iniciales);
  // Un mapa nuevo (otra versión, un paso editado) reemplaza lo que se haya arrastrado.
  if (base !== iniciales) {
    setBase(iniciales);
    setNodes(iniciales);
  }
  const caja = useRef<HTMLDivElement>(null);
  const [anchoDelLienzo, setAnchoDelLienzo] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (caja.current) setAnchoDelLienzo(caja.current.clientWidth);
  }, []);
  const vista = anchoDelLienzo === null ? null : encuadre(anchoDelLienzo, ancho, alto);
  return (
    <div
      ref={caja}
      className="bg-surface-muted"
      style={{
        height: vista?.alto ?? Math.min(720, alto + ARRIBA + MARGEN),
        ...COLORES_DE_REACT_FLOW,
      }}
    >
      {vista && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={tiposDeNodo}
          onNodesChange={(cambios) => setNodes((ns) => applyNodeChanges(cambios, ns))}
          defaultViewport={{ x: vista.x, y: vista.y, zoom: vista.zoom }}
          minZoom={0.3}
          maxZoom={1.6}
          nodesConnectable={false}
          edgesFocusable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--color-line)" />
          <Controls showInteractive={false} position="top-right" />
          <Panel position="top-left">
            <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11.5px] text-fg-secondary">
              {cual === "hoy" ? "Hoy" : "Después de la implementación"} · toca un paso para ver de dónde sale
            </span>
          </Panel>
        </ReactFlow>
      )}
    </div>
  );
}

export type VistaDelMapa = CualVersion | "comparar";

export default function MapaPorCarriles({
  mapa,
  vista,
  onEditar,
}: {
  mapa: MapaDeProceso;
  vista: VistaDelMapa;
  /** Sin esto, el detalle del paso no ofrece «Editar el paso». */
  onEditar?: (cual: CualVersion, pasoId: string) => void;
}) {
  if (vista === "comparar") {
    return (
      <div className="flex flex-col gap-3">
        {(["hoy", "despues"] as const).map((cual) => (
          <div key={cual} className="overflow-hidden rounded-xl border border-line bg-surface">
            <ReactFlowProvider key={`${mapa.id}-${cual}-comparar`}>
              <Lienzo mapa={mapa} cual={cual} conMarcas onEditar={onEditar} />
            </ReactFlowProvider>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <ReactFlowProvider key={`${mapa.id}-${vista}`}>
        <Lienzo mapa={mapa} cual={vista} conMarcas={false} onEditar={onEditar} />
      </ReactFlowProvider>
    </div>
  );
}
