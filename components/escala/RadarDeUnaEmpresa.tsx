/**
 * components/escala/RadarDeUnaEmpresa.tsx — el radar de UNA empresa en un área: la rueda de la escala (la misma del
 * Mapa y del Radar internos) con un punto por dimensión, en el anillo de su nivel y con su puntaje adentro.
 *
 * Es para lo que ve el CLIENTE (la página pública del resultado del test y su PDF): colores hex literales (nunca
 * flipea a oscuro: el tema de la app no existe ahí), SVG estático que se dibuja en el servidor y sin JavaScript, sin
 * nada que haya que tocar para leerlo. Sin "use client" a propósito: lo puede usar un Server Component.
 *
 * ── Interfaz ─────────────────────────────────────────────────────────────────
 *   import RadarDeUnaEmpresa from "@/components/escala/RadarDeUnaEmpresa";
 *
 *   <RadarDeUnaEmpresa
 *     area="Ventas"                       // el centro: el nombre del área
 *     dimensiones={[                       // en el orden de la escala; cada capa llena su mitad en ese orden
 *       { clave: "1.1", nombre: "Procesos y Rutinas", capa: "base", puntaje: 28, nivel: "I" },
 *       { clave: "1.2", nombre: "Tecnología y Automatización", capa: "base", puntaje: 10, nivel: "D", noLoSe: true },
 *       { clave: "1.5", nombre: "Propuesta y Coherencia", capa: "produccion", puntaje: null, nivel: null },
 *       …
 *     ]}
 *     subtitulo="Inicial · 28/100"         // opcional; por defecto «8 dimensiones · 5 niveles»
 *   />
 *
 *   · `clave`: el id de la dimensión («1.1»). `numero` (opcional) es lo que se lee arriba del nombre; por defecto, la clave.
 *   · `capa`: "base" va a la mitad derecha (BASE OPERATIVA) y "produccion" a la izquierda (PRODUCCIÓN). Otra capa no
 *     se dibuja.
 *   · `puntaje` es el 0–100 del chequeo (lib/escala/chequeo.ts) y `nivel` la letra que se le dice a la empresa
 *     ("D" | "I" | "F" | "E" | "O"). El NIVEL elige el anillo y el puntaje, cuánto avanzó dentro de él: el punto nunca
 *     cae en un anillo que contradiga el nivel. Con `nivel: null` la dimensión no lleva punto («no se preguntó»). Un
 *     puntaje que no es un número se trata como null (disco sin número).
 *   · `noLoSe` (opcional): contestó «No lo sé» (`DimensionDelResultado.noLoSe`). El punto va donde diga su nivel, con el
 *     borde punteado y «?» en vez del puntaje, y su rótulo dice «no lo sabías», como las barras.
 *   · Opcionales: `capas` (nombre y, si hay, descripción de cada mitad), `niveles` (los nombres de los cinco niveles),
 *     `paleta` (cambiar algún color: la página de resultado tiene su propia tinta, p. ej. `{ fg: "#0f1b3d" }`),
 *     `etiqueta` (el texto para lectores de pantalla; por defecto lista cada dimensión con su nivel y puntaje),
 *     `className` y `style`.
 *   · Ocupa todo el ancho que le den y mantiene la proporción 1300 × 900 del mapa. Sus textos miden lo mismo que en el
 *     mapa (18 los nombres, 14 los números), así que se leen bien desde unos 700 px de ancho (el PDF, una pantalla de
 *     escritorio). En un teléfono quedan de 5 px: ahí la lectura principal tienen que ser las barras, y el radar, un
 *     resumen de la forma.
 */
import type { CSSProperties } from "react";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { f, H, porciones, puntosDeUnaEmpresa, W, type DimensionDeUnaEmpresa } from "@/lib/escala/rueda";
import {
  AnillosDeLaRueda,
  CentroDeLaRueda,
  LineaDeLaBase,
  LineaDeUnaSerie,
  MitadesDeLaRueda,
  NombresDeNiveles,
  RotuloDeDimension,
  type PaletaDeLaRueda,
} from "./rueda";

export type { DimensionDeUnaEmpresa } from "@/lib/escala/rueda";

/**
 * La tinta y los grises del test público (components/external/test/diagnostico.css: #051849 y #41527A; el gris de los
 * rótulos, un poco más oscuro que su `--muted` para pasar 4,5:1 sobre blanco) y los colores de cada nivel de la escala.
 */
export const PALETA_DEL_CLIENTE: PaletaDeLaRueda = {
  fg: "#051849",
  fgSecundario: "#41527A",
  fgApagado: "#5A6890",
  linea: "#DCE4F2",
  superficie: "#FFFFFF",
  base: "#22c55e",
  niveles: { D: "#dc2626", I: "#f59e0b", F: "#22c55e", E: "#3b82f6", O: "#8b5cf6" },
};

const CAPAS_POR_DEFECTO: { clave: ClaveDeCapa; nombre: string; descripcion?: string | null }[] = [
  { clave: "base", nombre: "Base operativa", descripcion: "cómo está montado el departamento por dentro" },
  { clave: "produccion", nombre: "Producción", descripcion: "qué entrega el departamento hacia afuera" },
];

const NIVELES_POR_DEFECTO: { letra: Letra; nombre: string }[] = [
  { letra: "D", nombre: "Deficiente" },
  { letra: "I", nombre: "Inicial" },
  { letra: "F", nombre: "Funcional" },
  { letra: "E", nombre: "Eficiente" },
  { letra: "O", nombre: "Óptimo" },
];

export interface PropsDelRadarDeUnaEmpresa {
  area: string;
  dimensiones: readonly DimensionDeUnaEmpresa[];
  subtitulo?: string | null;
  capas?: readonly { clave: ClaveDeCapa; nombre: string; descripcion?: string | null }[];
  niveles?: readonly { letra: Letra; nombre: string }[];
  paleta?: Partial<PaletaDeLaRueda>;
  etiqueta?: string;
  className?: string;
  style?: CSSProperties;
}

export default function RadarDeUnaEmpresa({
  area,
  dimensiones: entrada,
  subtitulo,
  capas = CAPAS_POR_DEFECTO,
  niveles = NIVELES_POR_DEFECTO,
  paleta: cambios,
  etiqueta,
  className,
  style,
}: PropsDelRadarDeUnaEmpresa) {
  const paleta: PaletaDeLaRueda = { ...PALETA_DEL_CLIENTE, ...cambios };
  // Lo que no se puede dibujar no rompe la página del cliente: una capa desconocida no entra, y un puntaje que no es un
  // número se trata como «sin puntaje».
  const dimensiones = entrada
    .filter((d) => d.capa === "base" || d.capa === "produccion")
    .map((d) => (d.puntaje !== null && !Number.isFinite(d.puntaje) ? { ...d, puntaje: null } : d));
  const dims = dimensiones.map((d) => ({ id: d.clave, nombre: d.nombre, capa: d.capa }));
  const angulos = porciones(dims);
  const puntos = puntosDeUnaEmpresa(dimensiones);
  const nombreNivel = (l: Letra) => niveles.find((n) => n.letra === l)?.nombre ?? l;
  /** Lo que dice cada dimensión, en palabras: su nivel, o que no se preguntó o no lo sabía. */
  const estado = (d: DimensionDeUnaEmpresa) => (!d.nivel ? "no se preguntó" : d.noLoSe ? "no lo sabías" : nombreNivel(d.nivel));
  const descripcion =
    etiqueta ??
    `Radar de ${area}: ${dimensiones.map((d) => `${d.nombre}, ${estado(d)}${d.nivel && !d.noLoSe && d.puntaje !== null ? ` (${Math.round(d.puntaje)} de 100)` : ""}`).join("; ")}.`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={descripcion} className={className} style={{ display: "block", width: "100%", height: "auto", ...style }}>
      <MitadesDeLaRueda capas={capas} paleta={paleta} />
      <AnillosDeLaRueda dims={dims} angulos={angulos} paleta={paleta} />
      <LineaDeLaBase paleta={paleta} />

      {/* La línea de la empresa: une sus puntos; un eje sin dato la corta. */}
      <LineaDeUnaSerie
        ejes={dimensiones.map((d, i) => {
          const [g0, g1] = angulos.get(d.clave)!;
          const p = puntos[i];
          return { medio: (g0 + g1) / 2, capa: d.capa, punto: p ? ([p.x, p.y] as [number, number]) : null };
        })}
        color={paleta.fg}
        relleno={0.07}
      />

      {/* Cada punto: un disco blanco con el borde del color de su nivel y el puntaje adentro («?» si no lo sabía). */}
      {dimensiones.map((d, i) => {
        const p = puntos[i];
        if (!p || !d.nivel) return null;
        return (
          <g key={d.clave}>
            <circle
              cx={f(p.x)}
              cy={f(p.y)}
              r={20}
              style={{ fill: paleta.superficie, stroke: paleta.niveles[d.nivel], strokeWidth: 5, strokeDasharray: d.noLoSe ? "5 4" : undefined }}
            />
            <text
              x={f(p.x)}
              y={f(p.y + 5.5)}
              style={{ fill: paleta.fg, fontSize: d.puntaje !== null && d.puntaje >= 100 ? 13 : 16, fontWeight: 800, textAnchor: "middle", fontVariantNumeric: "tabular-nums" }}
            >
              {d.noLoSe ? "?" : d.puntaje !== null ? Math.round(d.puntaje) : ""}
            </text>
          </g>
        );
      })}

      <NombresDeNiveles niveles={niveles} paleta={paleta} />

      {dimensiones.map((d) => {
        const [g0, g1] = angulos.get(d.clave)!;
        return (
          <RotuloDeDimension
            key={d.clave}
            medio={(g0 + g1) / 2}
            nombre={d.nombre}
            numero={`${d.numero ?? d.clave} · ${estado(d)}`}
            paleta={paleta}
            apagado={!d.nivel}
          />
        );
      })}

      <CentroDeLaRueda paleta={paleta} titulo={area} subtitulo={subtitulo ?? `${dimensiones.length} dimensiones · ${niveles.length} niveles`} />
    </svg>
  );
}
