"use client";

/**
 * Edge del diagrama de INTEGRACIÓN (mapa de sistemas), modelo "Miro":
 *  - Etiqueta ANCLADA a la línea. Por defecto se apoya cerca del punto medio (posición calculada
 *    en el layout con de-overlap, ya pegada a la línea). Rida CON la línea (todo se recalcula desde
 *    la curva cada render).
 *  - IMANTADA: al arrastrarla, se restringe a (a) ENCIMA de la línea o (b) a UN LADO (distancia
 *    fija SIDE), deslizándose a lo largo de la línea. No se puede alejar. Se guarda como (t, side)
 *    → sigue la línea aunque muevas las cajas.
 *  - PUNTITO de ancla sobre la línea cuando la etiqueta está a un lado (estilo Miro).
 *  - FLECHA propia (polígono) en el extremo destino — no dependemos del pipeline de markers.
 *  - Texto EDITABLE inline (doble clic). El commit usa `data.onLabelCommit` (dirty + undo).
 *
 * Parseo de la etiqueta: "Sincronizar ventas · Cliente/Orden/Productos"
 *   → título "Sincronizar ventas" + campos ["Cliente","Orden","Productos"].
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, Position, useReactFlow, useStore, type EdgeProps } from "@xyflow/react";

function parseLabel(label: string): { title: string; fields: string[] } {
  if (label.includes("·")) {
    const parts = label.split("·").map((s) => s.trim()).filter(Boolean);
    const title = parts[0] ?? label;
    const rest = parts.slice(1).join(" · ");
    const fields = rest ? rest.split("/").map((s) => s.trim()).filter(Boolean) : [];
    return { title, fields };
  }
  if (label.includes("/")) {
    const segs = label.split("/").map((s) => s.trim()).filter(Boolean);
    return { title: segs[0] ?? label, fields: segs.slice(1) };
  }
  return { title: label, fields: [] };
}

// ── Geometría de la curva bezier (parseada del path "M sx,sy C c1 c2 t") ──────────
type Cubic = [number, number, number, number, number, number, number, number];
function parseCubic(path: string): Cubic | null {
  const nums = path.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 8) return null;
  return nums.slice(0, 8).map(Number) as Cubic;
}
function cubicPoint(c: Cubic, t: number): { x: number; y: number } {
  const [sx, sy, c1x, c1y, c2x, c2y, tx, ty] = c;
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * sx + b * c1x + d * c2x + e * tx, y: a * sy + b * c1y + d * c2y + e * ty };
}
function cubicNormal(c: Cubic, t: number): { x: number; y: number } {
  const [sx, sy, c1x, c1y, c2x, c2y, tx, ty] = c;
  const u = 1 - t;
  // derivada B'(t) = 3u²(P1-P0) + 6ut(P2-P1) + 3t²(P3-P2)
  const dx = 3 * u * u * (c1x - sx) + 6 * u * t * (c2x - c1x) + 3 * t * t * (tx - c2x);
  const dy = 3 * u * u * (c1y - sy) + 6 * u * t * (c2y - c1y) + 3 * t * t * (ty - c2y);
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len }; // perpendicular unitaria
}
function nearestT(c: Cubic, px: number, py: number): number {
  let bt = 0.5;
  let bd = Infinity;
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const p = cubicPoint(c, t);
    const dd = (p.x - px) ** 2 + (p.y - py) ** 2;
    if (dd < bd) {
      bd = dd;
      bt = t;
    }
  }
  return bt;
}

const SIDE = 32; // distancia perpendicular fija cuando la etiqueta va "a un lado"
const AH_LEN = 10; // largo de la punta de flecha
const AH_W = 7; // ancho de la punta de flecha

interface EdgeExtraData {
  labelShift?: number;
  labelPos?: { x: number; y: number };
  labelT?: number;         // posición manual: t a lo largo de la curva
  labelSide?: number;      // posición manual: lado imantado {-1,0,1}
  direction?: "to" | "bidir";
  syncType?: "realtime" | "batch" | "manual";
  pending?: boolean;
  readOnly?: boolean;      // diagrama en solo-lectura → etiqueta no editable ni arrastrable
  noArrow?: boolean;       // enlace a nota (annotation/text): sin punta de flecha
  onLabelCommit?: (value: string) => void;
  onLabelPos?: (t: number, side: number) => void;
}

export function DataFlowEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  data,
  selected,
}: EdgeProps) {
  const { setEdges, getZoom } = useReactFlow();
  // Interactivo solo cuando el diagrama es editable. `elementsSelectable` ya no alcanza como
  // señal (ahora está activo también en solo-lectura para abrir el panel de detalle al clic):
  // se exige además `nodesDraggable` (= canEdit del viewer) y que el edge no venga marcado
  // read-only en su data. En lectura la etiqueta no se arrastra ni se edita (ni ensucia estado).
  const editableStore = useStore((s) => s.elementsSelectable && s.nodesDraggable);
  const [edgePath, midX, midY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const cubic = parseCubic(edgePath);
  const cubicRef = useRef<Cubic | null>(cubic);
  cubicRef.current = cubic;

  const extra = (data ?? {}) as EdgeExtraData;
  const interactive = editableStore && !extra.readOnly;

  // Posición por defecto (del layout, ya pegada a la línea) o el punto medio + perp para pares.
  let defX: number;
  let defY: number;
  if (extra.labelPos) {
    defX = extra.labelPos.x;
    defY = extra.labelPos.y;
  } else {
    defX = midX;
    defY = midY;
    const shift = typeof extra.labelShift === "number" ? extra.labelShift : 0;
    if (shift !== 0) {
      const aFirst = source < target;
      const ax = aFirst ? sourceX : targetX;
      const ay = aFirst ? sourceY : targetY;
      const bx = aFirst ? targetX : sourceX;
      const by = aFirst ? targetY : sourceY;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      defX += (-dy / len) * SIDE * shift;
      defY += (dx / len) * SIDE * shift;
    }
  }

  // `manual` = posición elegida por el usuario, imantada a la línea como (t a lo largo, side ∈ {-1,0,1}).
  // Se inicializa desde la data persistida (labelT/labelSide) para sobrevivir guardar/recargar.
  const [manual, setManual] = useState<{ t: number; side: number } | null>(
    typeof extra.labelT === "number" ? { t: extra.labelT, side: extra.labelSide ?? 0 } : null,
  );
  const manualRef = useRef(manual);
  manualRef.current = manual;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const drag = useRef<{ sx: number; sy: number; px: number; py: number; zoom: number; moved: boolean } | null>(null);
  const finished = useRef(false);

  // Sincronizar `manual` con la data persistida cuando cambie por undo/redo/reload y NO haya
  // un drag en curso (React Flow puede reusar la instancia del edge por id → el useState inicial
  // no se re-evalúa; este effect lo cubre).
  useEffect(() => {
    if (drag.current) return;
    const next = typeof extra.labelT === "number" ? { t: extra.labelT, side: extra.labelSide ?? 0 } : null;
    setManual((prev) => {
      if (!prev && !next) return prev;
      if (prev && next && prev.t === next.t && prev.side === next.side) return prev;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extra.labelT, extra.labelSide]);

  // Posición final P de la etiqueta + ANCLA A sobre la línea + si mostrar el puntito.
  let px: number;
  let py: number;
  let ancX: number;
  let ancY: number;
  let showDot: boolean;
  if (manual && cubic) {
    const a = cubicPoint(cubic, manual.t);
    const n = cubicNormal(cubic, manual.t);
    ancX = a.x;
    ancY = a.y;
    px = a.x + n.x * manual.side * SIDE;
    py = a.y + n.y * manual.side * SIDE;
    showDot = manual.side !== 0;
  } else {
    px = defX;
    py = defY;
    if (cubic) {
      const t = nearestT(cubic, px, py);
      const a = cubicPoint(cubic, t);
      ancX = a.x;
      ancY = a.y;
      showDot = Math.hypot(px - a.x, py - a.y) > 14;
    } else {
      ancX = midX;
      ancY = midY;
      showDot = false;
    }
  }

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (editing || !interactive) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { sx: e.clientX, sy: e.clientY, px, py, zoom: getZoom() || 1, moved: false };
    },
    [editing, interactive, getZoom, px, py],
  );
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const ddx = e.clientX - d.sx;
    const ddy = e.clientY - d.sy;
    if (!d.moved && Math.abs(ddx) + Math.abs(ddy) < 3) return; // umbral: ignorar micro-jitter del dblclic
    d.moved = true;
    const c = cubicRef.current;
    if (!c) return;
    // objetivo libre (coords de flujo) e IMANTADO: t sobre la línea + lado {encima, a un lado}.
    const fx = d.px + ddx / d.zoom;
    const fy = d.py + ddy / d.zoom;
    let t = nearestT(c, fx, fy);
    t = Math.max(0.12, Math.min(0.88, t)); // no deslizar sobre las cajas de los nodos
    const a = cubicPoint(c, t);
    const n = cubicNormal(c, t);
    const perp = (fx - a.x) * n.x + (fy - a.y) * n.y;
    // Histéresis: entrar a un lado a >0.7·SIDE, volver a "encima" a <0.35·SIDE → sin parpadeo cerca del umbral.
    const ap = Math.abs(perp);
    const prevSide = manualRef.current?.side ?? 0;
    const side = prevSide === 0 ? (ap > SIDE * 0.7 ? Math.sign(perp) : 0) : ap < SIDE * 0.35 ? 0 : Math.sign(perp);
    setManual({ t, side });
  }, []);
  const onPointerUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    // Commit de la posición manual UNA vez al soltar (no por frame) → dirty + undo + persiste.
    if (d?.moved && manualRef.current && extra.onLabelPos) {
      extra.onLabelPos(manualRef.current.t, manualRef.current.side);
    }
  }, [extra]);

  const endEdit = useCallback(
    (val: string | null) => {
      if (finished.current) return;
      finished.current = true;
      if (val !== null) {
        const next = val.trim();
        if (extra.onLabelCommit) extra.onLabelCommit(next);
        else setEdges((eds) => eds.map((ed) => (ed.id === id ? { ...ed, label: next || undefined } : ed)));
      }
      setEditing(false);
    },
    [id, setEdges, extra],
  );

  const text = typeof label === "string" ? label : "";
  const { title, fields } = parseLabel(text);
  // Semántica de flujo: pending → ámbar; batch/manual → línea punteada; bidir → flecha en ambos extremos.
  // Seleccionado (azul) GANA sobre la semántica — mismo criterio que el resaltado de nodos.
  const pending = !!extra.pending;
  const baseColor = pending ? "#d97706" : (style?.stroke as string) ?? "#94a3b8";
  const color = selected ? "#3b82f6" : baseColor;
  const dashed = extra.syncType === "batch" || extra.syncType === "manual";
  const edgeStyle = { ...(style ?? {}), stroke: color, strokeWidth: selected ? 3 : 1.5, ...(dashed ? { strokeDasharray: "6 4" } : {}) };
  const bidir = extra.direction === "bidir";

  // Punta de flecha propia en el extremo destino (tangente de la curva en t=1).
  // Los enlaces a notas (noArrow) van sin punta: no son flujos de datos direccionales.
  let arrowPts: string | null = null;
  if (cubic && !extra.noArrow) {
    const [, , , , c2x, c2y, tx, ty] = cubic;
    let dx = tx - c2x;
    let dy = ty - c2y;
    const l = Math.hypot(dx, dy);
    if (l > 0.01) {
      dx /= l;
      dy /= l;
      const bx = tx - dx * AH_LEN;
      const by = ty - dy * AH_LEN;
      const ox = -dy * (AH_W / 2);
      const oy = dx * (AH_W / 2);
      arrowPts = `${tx},${ty} ${bx + ox},${by + oy} ${bx - ox},${by - oy}`;
    }
  }

  // Segunda flecha en el ORIGEN si el flujo es bidireccional (tangente en t=0, hacia el origen).
  let srcArrowPts: string | null = null;
  if (cubic && bidir && !extra.noArrow) {
    const [sx, sy, c1x, c1y] = cubic;
    let dx = sx - c1x;
    let dy = sy - c1y;
    const l = Math.hypot(dx, dy);
    if (l > 0.01) {
      dx /= l;
      dy /= l;
      const bx = sx - dx * AH_LEN;
      const by = sy - dy * AH_LEN;
      const ox = -dy * (AH_W / 2);
      const oy = dx * (AH_W / 2);
      srcArrowPts = `${sx},${sy} ${bx + ox},${by + oy} ${bx - ox},${by - oy}`;
    }
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} />
      {arrowPts && <polygon points={arrowPts} fill={color} />}
      {srcArrowPts && <polygon points={srcArrowPts} fill={color} />}
      {showDot && <circle cx={ancX} cy={ancY} r={3.5} fill={color} stroke="white" strokeWidth={1} />}
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(e) => {
            if (!interactive) return;
            e.stopPropagation();
            drag.current = null;
            finished.current = false;
            setDraft(text);
            setEditing(true);
          }}
          title={interactive ? "Doble clic para editar · arrastrá para mover (se imanta a la línea)" : undefined}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${px}px, ${py}px)`,
            pointerEvents: interactive ? "all" : "none",
            cursor: !interactive ? "default" : editing ? "text" : "grab",
            fontSize: 10,
            lineHeight: 1.2,
            textAlign: "center",
            userSelect: editing ? "text" : "none",
            background: "rgba(255,255,255,0.92)",
            borderRadius: 6,
            padding: "2px 7px",
            maxWidth: 190,
            wordBreak: "break-word",
            boxShadow: editing
              ? "0 0 0 1.5px " + color
              : pending
                ? "0 0 0 1px #f59e0b"
                : "0 1px 2px rgba(15,23,42,0.10)",
          }}
        >
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  endEdit(draft);
                } else if (e.key === "Escape") {
                  endEdit(null);
                }
              }}
              onBlur={() => endEdit(draft)}
              style={{
                fontSize: 10,
                width: Math.max(110, Math.min(180, draft.length * 6)),
                maxWidth: "100%",
                border: "none",
                outline: "none",
                textAlign: "center",
                background: "transparent",
                color: "#0f172a",
              }}
            />
          ) : text ? (
            <>
              <div style={{ fontWeight: 700, color }}>{title}</div>
              {fields.length > 0 && (
                <div style={{ color: "#64748b", marginTop: 1, fontSize: 9 }}>{fields.join(" · ")}</div>
              )}
              {pending && (
                <div style={{ color: "#b45309", marginTop: 1, fontSize: 8, fontWeight: 600 }}>Por confirmar</div>
              )}
            </>
          ) : (
            <span style={{ fontSize: 9, color: "#cbd5e1" }}>＋ etiqueta</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// ── SelectableSmoothStepEdge ──────────────────────────────────────────────────
// Edge "smoothstep" clásico/pipeline (el que arma `buildGraph` para diagramas que NO
// son de integración) con resaltado azul al seleccionar. Registrado en `EDGE_TYPES`
// bajo la clave "smoothstep" — sobrescribe el renderer built-in de React Flow para
// ese tipo en esta instancia (patrón oficial de la librería para "extender" un tipo
// base). Sin esto, el `style` inline que arma `buildGraph` (color semántico yes/no/
// default) queda fijo y la selección no se nota en la línea.
export function SelectableSmoothStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const edgeStyle = selected ? { ...(style ?? {}), stroke: "#3b82f6", strokeWidth: 3 } : style;

  // La punta de flecha (`markerEnd`) llega acá ya resuelta a un string `url(#...)` que referencia
  // un <marker> SVG cacheado por color — no es recoloreable por edge ni reacciona a `selected`.
  // Sin esto la línea se pone azul pero la punta (lo más visible del conector) se queda con su
  // color semántico de siempre. Dibujamos nuestro propio triángulo azul ENCIMA (mismo patrón que
  // `DataFlowEdge`); la dirección de entrada al nodo destino en un path smoothstep siempre queda
  // alineada al eje del lado del handle, así que no hace falta parsear la curva.
  let arrowPts: string | null = null;
  if (selected) {
    let dx = 0;
    let dy = 0;
    if (targetPosition === Position.Top) dy = 1;
    else if (targetPosition === Position.Bottom) dy = -1;
    else if (targetPosition === Position.Left) dx = 1;
    else dx = -1; // Position.Right
    const bx = targetX - dx * AH_LEN;
    const by = targetY - dy * AH_LEN;
    const ox = -dy * (AH_W / 2);
    const oy = dx * (AH_W / 2);
    arrowPts = `${targetX},${targetY} ${bx + ox},${by + oy} ${bx - ox},${by - oy}`;
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />
      {arrowPts && <polygon points={arrowPts} fill="#3b82f6" />}
    </>
  );
}
