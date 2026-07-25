"use client";

/**
 * app/print/canvas/[clientId]/[canvasId]/card-print.tsx
 *
 * Impresión de los bloques CARD "tipados" del motor de landings (Diagnóstico,
 * Planificación, Implementación, Exploración, Desarrollo…). Esos canvas persisten
 * 1 bloque por sección con `content: null` y TODO el contenido en la columna `data`
 * (ver lib/canvas/diagnostico-generate.ts), así que la vista de impresión —que solo
 * sabía pintar markdown desde `content`— salía con los títulos de sección y NADA
 * debajo. Acá `data` se vuelve documento: prosa, viñetas y tablas simples.
 *
 * ── POR QUÉ APLANAR Y NO REUSAR `LandingView` + `.stl-pdf-mode` ───────────────
 * Existe un camino que YA imprime el motor de landings: app/print/business-case/[id]
 * monta `LandingView` con `pdfMode`. No se reusa acá, a propósito:
 *   1. Esta página es GENÉRICA para cualquier canvas (handoff, marketing, kickoff,
 *      canvas a medida del CSE). `LandingView` necesita el config + adaptador de SU
 *      pieza; la mitad de los canvas seguiría cayendo al vacío que estamos arreglando.
 *   2. El business case se exporta con Puppeteer como UNA página continua; esta se
 *      imprime con el Ctrl+P del navegador sobre la hoja A4 de `.cp-*` (globals.css),
 *      que trae las reglas de corte de página. Las bandas oscuras a sangre del motor
 *      paginan mal y se comen el tóner.
 *   3. El consultor lleva ESTE documento a la sesión: encabezado con cliente/proyecto/
 *      CSE y todas las secciones seguidas, legibles en blanco y negro.
 *
 * El aplanado espeja el criterio de `flattenCardData` (lib/canvas/load-canvas-context.ts,
 * el que arma el contexto de los agentes): mismas claves técnicas salteadas y misma
 * convención "título — detalle". La diferencia es el destino: aquello es un blob de texto
 * para un modelo, esto es papel — por eso acá hay jerarquía (subtítulos, viñetas, tablas)
 * y las claves crudas del schema se traducen a etiquetas en español.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown → hoja impresa. `content` vacío no imprime nada (ni un contenedor vacío). */
export function MarkdownView({ content }: { content: string }) {
  if (!content?.trim()) return null;
  return (
    <div className="cp-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// ── Vocabulario de las claves ─────────────────────────────────────────────────

/** Claves técnicas: no son contenido del documento (mismo criterio que `flattenCardData`). */
const SKIP_KEYS = new Set([
  "diagram", // lo dibuja DiagramStatic aparte
  "__lang",
  "buttonTarget",
  "buttonUrl", // un link largo en papel es ruido; el rótulo del botón sí queda
  "coverImageUrl",
  "brands",
  "color", // hex de marca
]);

/** Claves cuyo valor ya es markdown (prosa legacy de los canvas viejos). */
const MD_KEYS = new Set(["__legacyMd", "md"]);

/** Claves que titulan a su objeto: encabezan la viñeta en negrita, sin etiqueta. */
const TITLE_KEYS = ["title", "titulo", "nombre", "name", "label", "headline", "concepto", "actor", "campo", "evento", "objeto", "measure"];

/** Claves de prosa: se imprimen como párrafo pelado (etiquetarlas sería ruido). */
const NO_LABEL_KEYS = new Set(["headline", "subhead", "intro", "summary", "detail", "detalle", "descripcion", "eyebrow", "texto"]);

/** Traducciones de las claves de schema que humanizadas quedarían mal (acentos, jerga). */
const KEY_LABELS: Record<string, string> = {
  comoEsHoy: "Cómo es hoy",
  comoSera: "Cómo va a ser",
  porQueBullets: "Qué implica",
  fueraDeAlcance: "Fuera de alcance",
  dataFields: "Datos que viajan",
  dedupeKey: "Clave anti-duplicados",
  syncType: "Tipo de sincronización",
  direction: "Dirección",
  cuando: "Cuándo",
  quienes: "Quiénes",
  siguientePaso: "Siguiente paso",
  referenciaSectorial: "Referencia sectorial",
  casosDeUso: "Casos de uso",
  cotizaAparte: "Cotiza aparte",
  esLlave: "Es llave",
  metrics: "Métricas",
  duration: "Duración",
  price: "Precio",
  buttonLabel: "Botón",
  pending: "Por confirmar",
  // Claves en inglés de los schemas del motor: humanizarlas dejaría "Value", "Label"…
  value: "Valor",
  label: "Etiqueta",
  title: "Título",
  detail: "Detalle",
  name: "Nombre",
  kind: "Tipo",
  chart: "Gráfico",
  measure: "Medida",
  level: "Nivel",
  before: "Antes",
  after: "Después",
  sistemas: "Sistemas",
  procesos: "Procesos",
  conexiones: "Conexiones",
  retos: "Retos",
  cadena: "Flujo",
  opcionales: "Opcionales",
  plataforma: "Plataforma",
  objetivo: "Objetivo",
  hubs: "Hubs",
  tags: "Áreas",
};

/** `comoEsHoy` → "Como es hoy". Fallback cuando la clave no está en el diccionario. */
function humanize(key: string): string {
  const words = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelFor(key: string): string {
  return KEY_LABELS[key] ?? humanize(key);
}

/**
 * Valores que en pantalla son un ícono o una flecha y en papel serían jerga cruda
 * ("direction: to"). Solo los del mapa de sistemas, que es la sección más técnica.
 */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  direction: { to: "unidireccional", bidir: "bidireccional" },
  syncType: { realtime: "en tiempo real", batch: "por lotes", manual: "manual" },
  pending: { si: "sí", sí: "sí", no: "no" },
};

/** Valores escalares a texto. Los schemas son string-only, pero la data vieja trae números/flags. */
function toText(value: unknown, key?: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const mapped = key ? VALUE_LABELS[key]?.[trimmed.toLowerCase()] : undefined;
    return mapped ?? trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return "";
}

// ── Árbol de impresión ────────────────────────────────────────────────────────

interface TextLine {
  label: string | null;
  text: string;
}

interface BulletItem {
  title: string | null;
  lines: TextLine[];
  nodes: PrintNode[];
}

type PrintNode =
  | { kind: "md"; text: string }
  | { kind: "p"; label: string | null; strong: boolean; text: string }
  | { kind: "inline"; label: string | null; items: string[] }
  | { kind: "bullets"; label: string | null; items: BulletItem[] }
  | { kind: "table"; label: string | null; headers: string[]; rows: string[][] }
  | { kind: "group"; label: string | null; nodes: PrintNode[] };

const MAX_DEPTH = 3;
/** Umbral para decidir "esto cabe en una celda" vs "esto es un párrafo". */
const SHORT_TEXT = 48;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Objeto → viñeta: título en negrita + el resto de sus campos etiquetados. */
function objectToBullet(obj: Record<string, unknown>, depth: number): BulletItem | null {
  let title: string | null = null;
  const lines: TextLine[] = [];
  const nodes: PrintNode[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key)) continue;
    if (MD_KEYS.has(key)) {
      const md = toText(value);
      if (md) nodes.push({ kind: "md", text: md });
      continue;
    }
    const text = toText(value, key);
    if (text) {
      if (!title && TITLE_KEYS.includes(key)) title = text;
      else lines.push({ label: NO_LABEL_KEYS.has(key) ? null : labelFor(key), text });
      continue;
    }
    // Anidados (una conexión con sub-listas, un proceso con sistemas…): mismo tratamiento.
    if (Array.isArray(value) || isRecord(value)) {
      const child = buildNodes({ [key]: value }, depth + 1);
      nodes.push(...child);
    }
  }

  if (!title && lines.length === 0 && nodes.length === 0) return null;
  return { title, lines, nodes };
}

/**
 * Array de objetos "chatos y cortos" (props de HubSpot, conexiones, métricas) → tabla.
 * Con textos largos —un proceso con 3 frases por celda— la tabla se vuelve ilegible en
 * A4, así que ese caso se queda en viñetas.
 */
function arrayToTable(items: Record<string, unknown>[]): { headers: string[]; rows: string[][] } | null {
  const keys: string[] = [];
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      if (SKIP_KEYS.has(key) || MD_KEYS.has(key)) continue;
      if (Array.isArray(value) || isRecord(value)) return null; // hay estructura → viñetas
      const text = toText(value, key);
      if (text.length > SHORT_TEXT) return null; // hay prosa → viñetas
      if (text && !keys.includes(key)) keys.push(key);
    }
  }
  if (keys.length < 2 || keys.length > 5 || items.length < 2) return null;
  return {
    headers: keys.map(labelFor),
    rows: items.map((item) => keys.map((k) => toText(item[k], k))),
  };
}

/** `data` de un CARD tipado → nodos imprimibles. Devuelve [] si no hay NADA que imprimir. */
export function buildNodes(data: Record<string, unknown>, depth = 0): PrintNode[] {
  if (depth > MAX_DEPTH) return [];
  const nodes: PrintNode[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (SKIP_KEYS.has(key)) continue;

    if (MD_KEYS.has(key)) {
      const md = toText(value);
      if (md) nodes.push({ kind: "md", text: md });
      continue;
    }

    const text = toText(value, key);
    if (text) {
      nodes.push({
        kind: "p",
        label: NO_LABEL_KEYS.has(key) || TITLE_KEYS.includes(key) ? null : labelFor(key),
        strong: TITLE_KEYS.includes(key),
        text,
      });
      continue;
    }

    if (Array.isArray(value)) {
      const label = NO_LABEL_KEYS.has(key) || key === "items" ? null : labelFor(key);
      const strings = value.filter((v) => toText(v)).map((v) => toText(v));
      const objects = value.filter(isRecord);

      if (objects.length === 0) {
        if (strings.length === 0) continue;
        // Etiquetas cortas (los chips del hero) en una línea; el resto, viñetas.
        const inline = strings.length <= 8 && strings.every((s) => s.length <= SHORT_TEXT);
        if (inline) nodes.push({ kind: "inline", label, items: strings });
        else nodes.push({ kind: "bullets", label, items: strings.map((s) => ({ title: s, lines: [], nodes: [] })) });
        continue;
      }

      const table = arrayToTable(objects);
      if (table) {
        nodes.push({ kind: "table", label, headers: table.headers, rows: table.rows });
        continue;
      }
      const bullets = objects.map((o) => objectToBullet(o, depth)).filter((b): b is BulletItem => b !== null);
      if (bullets.length) nodes.push({ kind: "bullets", label, items: bullets });
      continue;
    }

    if (isRecord(value)) {
      const inner = buildNodes(value, depth + 1);
      if (inner.length) {
        nodes.push({ kind: "group", label: NO_LABEL_KEYS.has(key) ? null : labelFor(key), nodes: inner });
      }
    }
  }

  return nodes;
}

/** ¿Este `data` aporta algo al PDF? Lo usa el aviso de "canvas vacío". */
export function hasCardPrintContent(data: unknown): boolean {
  if (!isRecord(data)) return false;
  return buildNodes(data).length > 0;
}

// ── Render ────────────────────────────────────────────────────────────────────

function NodeView({ node }: { node: PrintNode }) {
  if (node.kind === "md") return <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.text}</ReactMarkdown>;

  if (node.kind === "p") {
    return (
      <p>
        {node.label && <strong>{node.label}: </strong>}
        {node.strong ? <strong>{node.text}</strong> : node.text}
      </p>
    );
  }

  if (node.kind === "inline") {
    return (
      <p>
        {node.label && <strong>{node.label}: </strong>}
        {node.items.join(" · ")}
      </p>
    );
  }

  if (node.kind === "bullets") {
    return (
      <>
        {node.label && <h3>{node.label}</h3>}
        <ul>
          {node.items.map((item, i) => {
            // El caso más común del motor ({title, detail}) se lee mejor en UNA línea.
            const inlineDetail =
              item.title && item.lines.length === 1 && !item.lines[0].label ? item.lines[0].text : null;
            return (
              <li key={i}>
                {item.title && <strong>{item.title}</strong>}
                {inlineDetail ? ` — ${inlineDetail}` : null}
                {!inlineDetail &&
                  item.lines.map((line, li) => (
                    <div key={li}>
                      {line.label && <em>{line.label}: </em>}
                      {line.text}
                    </div>
                  ))}
                {item.nodes.map((child, ci) => (
                  <NodeView key={`n${ci}`} node={child} />
                ))}
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  if (node.kind === "table") {
    return (
      <>
        {node.label && <h3>{node.label}</h3>}
        <table>
          <thead>
            <tr>
              {node.headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <>
      {node.label && <h3>{node.label}</h3>}
      {node.nodes.map((child, i) => (
        <NodeView key={i} node={child} />
      ))}
    </>
  );
}

/**
 * Contenido de un CARD tipado, listo para papel. Se monta dentro de `.cp-md` —la misma
 * tipografía de impresión que el markdown— así no hace falta CSS nuevo y el documento
 * se ve de una sola pieza sin importar de dónde vino cada sección.
 */
export function CardDataView({ data }: { data: unknown }) {
  if (!isRecord(data)) return null;
  const nodes = buildNodes(data);
  if (nodes.length === 0) return null;
  return (
    <div className="cp-md">
      {nodes.map((node, i) => (
        <NodeView key={i} node={node} />
      ))}
    </div>
  );
}
