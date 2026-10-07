"use client";

/**
 * components/procesos/MapaPorCarriles.tsx — UN PROCESO DIBUJADO EN CARRILES, CON REACT FLOW.
 *
 * Una fila por quién hace el paso (el cliente final, cada equipo, cada sistema) y una columna por
 * cuándo lo hace. El acomodo es propio y determinista (`lib/procesos/layout.ts`): React Flow no trae
 * carriles. Lo que sí pone la librería:
 *  - los carriles son nodos de fondo (detrás de todo);
 *  - el dolor es hijo del paso (`parentId`): se mueve con él;
 *  - las flechas son `smoothstep` con punta; las que vuelven atrás, punteadas;
 *  - en la ficha, el detalle del paso elegido es un `NodeToolbar` (de dónde sale, la cita).
 *
 * Los mismos nodos sirven al editor de pantalla completa (`EditorDelMapa.tsx`, con `opciones.editor`):
 * ahí el carril se elige tocando su nombre, el paso elegido muestra el punto azul para unirlo con
 * otro, y debajo del último carril está «+ Agregar carril».
 *
 * Los colores salen de los tokens (`var(--color-…)`), así el mapa acompaña el modo claro y oscuro.
 */
import "@xyflow/react/dist/style.css";
import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  Handle,
  MarkerType,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { cn } from "@/lib/cn";
import { acomodarPorCarriles, ladoDelDetalle, MEDIDAS } from "@/lib/procesos/layout";
import { ETIQUETA_DE_ORIGEN, type MapaDeProceso, type PasoDelMapa, type TipoDeCarril } from "@/lib/procesos/mapa";

export type CualVersion = "hoy" | "despues";

/** Lo elegido en el editor: un paso, una flecha o un carril. */
export type Elegido = { que: "paso"; id: string } | { que: "flecha"; de: string; a: string } | { que: "carril"; id: string };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  const mes = MESES[parseInt(m, 10) - 1];
  return mes ? `${parseInt(d, 10)} ${mes}` : iso;
}

export const ETIQUETA_DE_CARRIL: Record<TipoDeCarril, string> = {
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

/** La línea de una cita: quién, en qué reunión, cuándo y en qué minuto. */
export function pieDeCita(c: { quien?: string; sesionTitulo: string; fecha: string; minuto?: string }): string {
  return [c.quien, c.sesionTitulo, c.fecha ? fechaCorta(c.fecha) : "", c.minuto ? `min ${c.minuto}` : ""].filter(Boolean).join(" · ");
}

interface DatoCarril extends Record<string, unknown> {
  nombre: string;
  tipo: TipoDeCarril;
  ancho: number;
  alto: number;
  primero: boolean;
  /** En el editor: el nombre se toca para elegir el carril. */
  editor: boolean;
  /** En el editor y con permiso: se puede renombrar y mover. */
  editable: boolean;
  elegido: boolean;
  /** En el editor, mientras se elige dónde poner un paso nuevo. */
  colocando: boolean;
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
  /** En la ficha: el botón del detalle que abre el editor en este paso. */
  onAbrirEditor?: (cual: CualVersion, pasoId: string) => void;
  puedeEditar: boolean;
  /** En el editor: sin detalle flotante (el detalle va al panel de la derecha). */
  editor: boolean;
  /** En el editor y con permiso: el paso elegido muestra el punto azul para unirlo con otro. */
  conectable: boolean;
  elegido: boolean;
}

interface DatoAgregarCarril extends Record<string, unknown> {
  onAgregar: () => void;
}

const NodoCarril = memo(function NodoCarril({ data }: NodeProps<Node<DatoCarril>>) {
  const sistema = data.tipo === "sistema";
  return (
    <div
      className={cn(
        "flex",
        data.editor ? (data.colocando ? "cursor-crosshair hover:bg-info-surface" : "") : "pointer-events-none",
        sistema ? "bg-surface-hover" : "bg-surface",
        !data.primero && "border-t border-line",
      )}
      style={{ width: data.ancho, height: data.alto }}
    >
      <div
        data-rotulo-de-carril=""
        title={data.editable && !data.colocando ? "Toca para renombrar o mover el carril" : undefined}
        className={cn(
          "flex flex-col gap-0.5 border-r px-3 py-3.5",
          data.elegido ? "border-info-line bg-info-surface" : "border-line",
          data.editor && !data.colocando && "cursor-pointer hover:bg-surface-hover",
        )}
        style={{ width: MEDIDAS.rotulo }}
      >
        <span className={cn("text-[12.5px] font-semibold leading-[1.3]", data.elegido ? "text-brand" : "text-fg")}>{data.nombre}</span>
        <span className="text-[11px] text-fg-muted">{ETIQUETA_DE_CARRIL[data.tipo]}</span>
      </div>
    </div>
  );
});

/** El punto de donde sale una flecha (y el de llegada, que no se ve). En el editor, el de arriba a la
 *  derecha del paso elegido es el punto azul para unirlo con otro. */
const HANDLE_OCULTO = "!h-2 !w-2 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0";

const NodoPaso = memo(function NodoPaso({ data, selected }: NodeProps<Node<DatoPaso>>) {
  const p = data.paso;
  const elegido = data.editor ? data.elegido : selected;
  const supuesto = p.origen === "supuesto";
  const redonda = p.tipo === "inicio" || p.tipo === "fin";
  const ambar = data.chip.includes("supuesto");
  const seVa = data.chip === "se va";
  const rotulo = ROTULO_DE_TIPO[p.tipo] ?? "";
  return (
    <>
      {!data.editor && (
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
                <span className="text-[11.5px] text-fg-muted">{pieDeCita(c)}</span>
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
            {data.onAbrirEditor && (
              <button
                type="button"
                onClick={() => data.onAbrirEditor?.(data.cual, p.id)}
                className="self-start rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
              >
                {data.puedeEditar ? "Editar el paso" : "Ver en pantalla completa"}
              </button>
            )}
          </div>
        </NodeToolbar>
      )}
      <Handle type="target" position={Position.Left} className={HANDLE_OCULTO} isConnectableStart={false} isConnectableEnd={data.editor} />
      <div
        className={cn(
          "relative flex flex-col justify-center gap-[2px] px-[10px] py-[6px]",
          data.conectable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          redonda ? "rounded-[18px]" : "rounded-lg",
          p.tipo === "decision" || p.tipo === "espera" ? "bg-surface-hover" : "bg-surface",
          elegido ? "border-2 border-brand ring-[3px] ring-brand-soft" : supuesto ? "border-[1.5px] border-dashed border-warning" : "border border-line",
          seVa && "opacity-55",
        )}
        style={{ width: MEDIDAS.paso.ancho, height: MEDIDAS.paso.alto }}
      >
        {data.chip && (
          <span
            className={cn(
              "absolute -top-[9px] right-[10px] whitespace-nowrap rounded-full border px-[6px] text-[10px] font-semibold leading-[16px]",
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
      {/* El primero de salida es el de las flechas (React Flow usa el primero si la flecha no dice cuál). */}
      <Handle type="source" position={Position.Right} className={HANDLE_OCULTO} isConnectable={false} />
      {data.conectable && (
        <Handle
          id="conectar"
          type="source"
          position={Position.Right}
          isConnectable={elegido}
          title="Tira de este punto hasta otro paso para unirlos"
          className={cn(
            "!h-3 !w-3 !min-h-0 !min-w-0 !rounded-full !border-2 !border-brand !bg-surface",
            elegido ? "!cursor-crosshair" : "!pointer-events-none !opacity-0",
          )}
          style={{ top: 0 }}
        />
      )}
    </>
  );
});

const NodoDolor = memo(function NodoDolor({ data }: NodeProps<Node<{ texto: string; editor: boolean }>>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-warn-line bg-warn-surface px-[7px] py-[3px] text-[11px] leading-[13px] text-warn-ink",
        data.editor && "cursor-pointer",
      )}
      style={{ width: MEDIDAS.paso.ancho, height: MEDIDAS.dolor }}
    >
      {data.texto}
    </div>
  );
});

const NodoAgregarCarril = memo(function NodoAgregarCarril({ data }: NodeProps<Node<DatoAgregarCarril>>) {
  return (
    <button
      type="button"
      onClick={data.onAgregar}
      className="nodrag rounded-lg border border-dashed border-line bg-surface-muted px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      + Agregar carril
    </button>
  );
});

export const tiposDeNodo = { carril: NodoCarril, paso: NodoPaso, dolor: NodoDolor, agregarCarril: NodoAgregarCarril };

/** El chip de arriba a la derecha de un paso. */
function chipDelPaso(p: PasoDelMapa, cual: CualVersion, seVa: string): string {
  if (seVa) return "se va";
  let chip = "";
  if (cual === "despues") chip = p.cambio === "nuevo" ? "nuevo" : p.cambio === "automatico" ? "automático" : p.cambio === "cambia" ? "cambia" : "";
  if (!chip) return p.origen === "supuesto" ? "supuesto" : p.origen === "propuesto" ? "propuesto" : "";
  return p.origen === "supuesto" || p.origen === "propuesto" ? `${chip} · ${p.origen}` : chip;
}

/** Lo que el editor le agrega al mapa: qué está elegido, si se está poniendo un paso y el botón del carril nuevo. */
export interface OpcionesDelEditor {
  elegido: Elegido | null;
  colocando: boolean;
  soloLectura: boolean;
  /** Sin esto (solo lectura) no hay «+ Agregar carril». */
  onAgregarCarril?: () => void;
}

/** Nodos y flechas de React Flow para una versión del proceso. */
export function armarFlujo(
  mapa: MapaDeProceso,
  cual: CualVersion,
  opciones: {
    conMarcas: boolean;
    onAbrirEditor?: (cual: CualVersion, pasoId: string) => void;
    puedeEditar?: boolean;
    editor?: OpcionesDelEditor;
  },
) {
  const version = mapa[cual];
  const conDolor = cual === "hoy";
  const ed = opciones.editor;
  const acomodo = acomodarPorCarriles(version, { conDolor, conCarrilesVacios: !!ed });
  const seVaDe = new Map(mapa.despues.seVa.map((v) => [v.id, v.porque]));
  const hoyPorId = new Map(mapa.hoy.pasos.map((p) => [p.id, p]));
  const marcas = new Map<string, string>();
  if (opciones.conMarcas) {
    mapa.cambios.forEach((c, i) => {
      for (const id of cual === "hoy" ? c.hoy : c.despues) if (!marcas.has(id)) marcas.set(id, String(i + 1));
    });
  }
  const nombreDelCarril = new Map(acomodo.bandas.map((b) => [b.carril.id, b.carril.nombre]));
  const elegido = ed?.elegido ?? null;

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
      editor: !!ed,
      editable: !!ed && !ed.soloLectura,
      elegido: elegido?.que === "carril" && elegido.id === b.carril.id,
      colocando: !!ed?.colocando,
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
      onAbrirEditor: opciones.onAbrirEditor,
      puedeEditar: !!opciones.puedeEditar,
      editor: !!ed,
      conectable: !!ed && !ed.soloLectura,
      elegido: elegido?.que === "paso" && elegido.id === p.id,
    };
    nodes.push({
      id: p.id,
      type: "paso",
      position: acomodo.posicion[p.id],
      data: dato,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      // El paso elegido va adelante: si no, su punto azul queda debajo del vecino.
      zIndex: dato.elegido ? 2 : undefined,
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
        data: { texto: p.dolor, editor: !!ed },
        draggable: false,
        selectable: false,
      });
    }
  }
  if (ed?.onAgregarCarril) {
    nodes.push({
      id: "agregar-carril",
      type: "agregarCarril",
      position: { x: 12, y: acomodo.alto + 12 },
      data: { onAgregar: ed.onAgregarCarril } satisfies DatoAgregarCarril,
      draggable: false,
      selectable: false,
    });
  }
  const ids = new Set(version.pasos.map((p) => p.id));
  const edges: Edge[] = version.flechas
    .filter((f) => ids.has(f.de) && ids.has(f.a))
    .map((f, i) => {
      const retorno = acomodo.retornos.has(`${f.de}>${f.a}`);
      const laElegida = elegido?.que === "flecha" && elegido.de === f.de && elegido.a === f.a;
      const color = laElegida ? "var(--color-brand)" : "var(--color-fg-muted)";
      return {
        id: `f${i}-${f.de}-${f.a}`,
        source: f.de,
        target: f.a,
        type: "smoothstep",
        label: f.etiqueta || undefined,
        pathOptions: { borderRadius: 8, offset: 14 },
        interactionWidth: ed ? 18 : undefined,
        zIndex: laElegida ? 1 : undefined,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 16,
          height: 16,
        },
        style: {
          stroke: color,
          strokeWidth: laElegida ? 2.5 : 1.5,
          strokeDasharray: retorno ? "4 4" : undefined,
          cursor: ed ? "pointer" : undefined,
        },
        labelStyle: { fontSize: 11, fill: laElegida ? "var(--color-brand)" : "var(--color-fg-muted)" },
        labelBgStyle: { fill: "var(--color-surface)" },
        labelBgPadding: [4, 2] as [number, number],
      };
    });
  return { nodes, edges, ancho: acomodo.ancho, alto: acomodo.alto, bandas: acomodo.bandas };
}

/** Los controles de zoom de React Flow, con los tokens (sin esto salen blancos en modo oscuro). */
export const COLORES_DE_REACT_FLOW = {
  "--xy-controls-button-background-color": "var(--color-surface)",
  "--xy-controls-button-background-color-hover": "var(--color-surface-hover)",
  "--xy-controls-button-color": "var(--color-fg-secondary)",
  "--xy-controls-button-color-hover": "var(--color-fg)",
  "--xy-controls-button-border-color": "var(--color-line)",
  "--xy-controls-box-shadow": "none",
  "--xy-connectionline-stroke-default": "var(--color-brand)",
  "--xy-connectionline-stroke-width-default": "2",
} as CSSProperties;

/** Aire arriba del mapa: ahí va el rótulo de la versión, que no puede tapar el primer carril. */
const ARRIBA = 48;
const MARGEN = 16;
/** Más chico que esto el texto de un paso ya no se lee: el mapa se recorre de costado. */
const ZOOM_MINIMO = 0.8;
/** En pantalla completa el mapa puede crecer un poco más que su tamaño real. */
const ZOOM_MAXIMO_EN_PANTALLA_COMPLETA = 1.3;
/** El alto del mapa en la ficha (en pantalla completa lo da la pantalla). */
const ALTO_MAXIMO = 720;

/**
 * Dónde arranca el mapa. En la ficha entra al ancho si se puede leer; si no, arranca a la izquierda
 * con un zoom que se lee y se recorre arrastrando, y el alto se ajusta al mapa, sin espacio vacío.
 * En pantalla completa ocupa todo el alto que le dan y el zoom sale del ancho Y del alto.
 */
export function encuadre(lienzo: { ancho: number; alto: number | null }, ancho: number, alto: number, arriba = ARRIBA) {
  const zoomPorAncho = (lienzo.ancho - 2 * MARGEN) / ancho;
  if (lienzo.alto === null) {
    const zoom = Math.min(1, Math.max(ZOOM_MINIMO, zoomPorAncho));
    return { zoom, x: MARGEN, y: arriba, alto: Math.min(ALTO_MAXIMO, Math.round(alto * zoom + arriba + MARGEN)) };
  }
  const zoomPorAlto = (lienzo.alto - arriba - MARGEN) / alto;
  const zoom = Math.min(ZOOM_MAXIMO_EN_PANTALLA_COMPLETA, Math.max(ZOOM_MINIMO, Math.min(zoomPorAncho, zoomPorAlto)));
  const sobra = lienzo.ancho - ancho * zoom;
  return { zoom, x: sobra > 2 * MARGEN ? Math.round(sobra / 2) : MARGEN, y: arriba, alto: lienzo.alto };
}

const ICONO_DE_CONTROL = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Encuadrar: un recuadro con un punto al centro (no las cuatro esquinas, que se leen como pantalla completa). */
export function IconoEncuadrar() {
  return (
    <svg viewBox="0 0 24 24" style={ICONO_DE_CONTROL} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

/** Pantalla completa: las cuatro esquinas hacia afuera (o hacia adentro, para salir). */
export function IconoPantallaCompleta({ salir = false }: { salir?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" style={ICONO_DE_CONTROL} aria-hidden="true">
      <path d={salir ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} />
    </svg>
  );
}

/** Los botones propios de los controles: encuadrar el mapa y abrirlo en pantalla completa. */
function BotonesDelMapa({ onPantallaCompleta, puedeEditar }: { onPantallaCompleta?: () => void; puedeEditar: boolean }) {
  const { fitView } = useReactFlow();
  const textoDeEditar = puedeEditar ? "Editar en pantalla completa" : "Ver en pantalla completa";
  return (
    <>
      <ControlButton onClick={() => void fitView({ padding: 0.06, duration: 200 })} title="Ver el mapa entero" aria-label="Ver el mapa entero">
        <IconoEncuadrar />
      </ControlButton>
      {onPantallaCompleta && (
        <ControlButton onClick={onPantallaCompleta} title={textoDeEditar} aria-label={textoDeEditar}>
          <IconoPantallaCompleta />
        </ControlButton>
      )}
    </>
  );
}

function Lienzo({
  mapa,
  cual,
  conMarcas,
  onAbrirEditor,
  puedeEditar,
}: {
  mapa: MapaDeProceso;
  cual: CualVersion;
  conMarcas: boolean;
  onAbrirEditor?: (cual: CualVersion, pasoId?: string) => void;
  puedeEditar: boolean;
}) {
  const { nodes: iniciales, edges, ancho, alto } = useMemo(
    () => armarFlujo(mapa, cual, { conMarcas, onAbrirEditor, puedeEditar }),
    [mapa, cual, conMarcas, onAbrirEditor, puedeEditar],
  );
  const [nodes, setNodes] = useState(iniciales);
  const [base, setBase] = useState(iniciales);
  // Un mapa nuevo (otra versión, un cambio guardado) reemplaza lo que se haya arrastrado.
  if (base !== iniciales) {
    setBase(iniciales);
    setNodes(iniciales);
  }
  const caja = useRef<HTMLDivElement>(null);
  const [lienzo, setLienzo] = useState<{ ancho: number; alto: number | null } | null>(null);
  useLayoutEffect(() => {
    if (caja.current) setLienzo({ ancho: caja.current.clientWidth, alto: null });
  }, []);
  const vista = lienzo === null ? null : encuadre(lienzo, ancho, alto);
  return (
    <div
      ref={caja}
      className="bg-surface-muted"
      style={{
        height: vista?.alto ?? Math.min(ALTO_MAXIMO, alto + ARRIBA + MARGEN),
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
          <Controls showInteractive={false} showFitView={false} position="top-right">
            <BotonesDelMapa onPantallaCompleta={onAbrirEditor ? () => onAbrirEditor(cual) : undefined} puedeEditar={puedeEditar} />
          </Controls>
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
  onAbrirEditor,
  puedeEditar,
}: {
  mapa: MapaDeProceso;
  vista: VistaDelMapa;
  /** Abre el mapa en pantalla completa (para editarlo o, sin permiso, para verlo). */
  onAbrirEditor?: (cual: CualVersion, pasoId?: string) => void;
  puedeEditar: boolean;
}) {
  if (vista === "comparar") {
    return (
      <div className="flex flex-col gap-3">
        {(["hoy", "despues"] as const).map((cual) => (
          <div key={cual} className="overflow-hidden rounded-xl border border-line bg-surface">
            <ReactFlowProvider key={`${mapa.id}-${cual}-comparar`}>
              <Lienzo mapa={mapa} cual={cual} conMarcas onAbrirEditor={onAbrirEditor} puedeEditar={puedeEditar} />
            </ReactFlowProvider>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <ReactFlowProvider key={`${mapa.id}-${vista}`}>
        <Lienzo mapa={mapa} cual={vista} conMarcas={false} onAbrirEditor={onAbrirEditor} puedeEditar={puedeEditar} />
      </ReactFlowProvider>
    </div>
  );
}
