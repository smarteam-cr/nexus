/**
 * components/escala/RadarDeUnaEmpresa.tsx — el radar de UNA empresa en un área: el radar de la teoría (el de Escala ›
 * Radar) con la empresa como figura. Diseño aprobado por Elías el 2026-10-29 (Claude Design, tableros `Main`, `Movil` y
 * `PdfHoja1`); la geometría y las medidas viven en lib/escala/radar-de-una-empresa.ts.
 *
 * Es para lo que ve el CLIENTE (la página pública del resultado del test y su PDF): colores hex literales (nunca flipea
 * a oscuro: el tema de la app no existe ahí) y SVG que se dibuja en el servidor. Sin "use client" a propósito: el
 * interruptor «Ver puntajes» es un checkbox y lo resuelve el CSS (radar-de-una-empresa.css), sin JavaScript.
 *
 * ── Interfaz ─────────────────────────────────────────────────────────────────
 *   import RadarDeUnaEmpresa from "@/components/escala/RadarDeUnaEmpresa";
 *
 *   <RadarDeUnaEmpresa
 *     area="Ventas"
 *     dimensiones={[                       // en el orden de la escala; cada capa llena su mitad en ese orden
 *       { clave: "1.1", nombre: "Procesos y Rutinas", capa: "base", preguntada: true, nivel: "I", puntaje: 30 },
 *       { clave: "1.3", nombre: "Datos", capa: "base", preguntada: true, nivel: "D", noLoSe: true, puntaje: 10 },
 *       { clave: "1.5", nombre: "Líneas de máquinas…", capa: "produccion", preguntada: false, nivel: null, puntaje: null },
 *       …
 *     ]}
 *     capas={[{ clave: "base", nombre: "Base operativa", descripcion: "cómo está…", nivel: "I", puntaje: 32 }, …]}
 *     niveles={escala.niveles}                        // los nombres salen de la escala, nunca escritos acá
 *     resultado={{ nivel: "D", puntaje: 12 }}       // el centro
 *     frena={{ clave: "1.6", objetivo: "F" }}         // lo que más frena: halo y flecha a su objetivo
 *     formato="pantalla"                              // o "pdf"
 *   />
 *
 *   · `formato="pantalla"`: la tarjeta entera, con el interruptor «Ver puntajes» (apagado al abrir), el radar grande y,
 *     en el teléfono (menos de 860 px), el compacto con su lista de dimensiones debajo. El CSS decide cuál se ve.
 *   · `formato="pdf"`: solo el radar grande con las letras de la hoja, sin puntajes y sin interruptor.
 *   · Una dimensión con `preguntada: false` va con el eje punteado, sin vértice y «No se preguntó»; con `noLoSe`, «?» en
 *     un aro punteado y «No lo sabías · cuenta como Deficiente». Debajo, una leyenda que solo aparece si hay alguna.
 *   · `color` y `otras` (2026-11-08, La escala de la preventa, uso INTERNO): la figura de un color y otras áreas encima,
 *     cada una del suyo, con su leyenda. Eje por eje en el mismo lugar: la parte k de cada capa de un área va sobre la
 *     parte k de esa capa del área principal (la base se llama igual en las tres áreas; la producción, no: los nombres
 *     son los del área principal y la leyenda lo dice). Un vértice de otra área lleva el `data-d` de SU dimensión. La
 *     página del cliente no los pasa y se ve igual que siempre.
 */
import type { ReactNode } from "react";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import {
  COMPACTO,
  cunasDelRadar,
  dibujoDelRadar,
  estadoDeLaDimension,
  f,
  GRANDE,
  notaDelNoLoSe,
  PDF,
  puntosSvg,
  textoDelEstado,
  type DimensionDelRadar,
  type FrenoDelRadar,
  type MedidasDelRadar,
  type RotuloDelRadar,
} from "@/lib/escala/radar-de-una-empresa";
import "./radar-de-una-empresa.css";

export type { DimensionDelRadar, FrenoDelRadar } from "@/lib/escala/radar-de-una-empresa";

/** Los colores del diseño (sistema «Nexus · interfaz interna», en hex: la página del cliente no tiene tema). */
const C = {
  tinta: "#1c2f55",
  texto: "#1c2a44",
  secundario: "#3d4b63",
  apagado: "#5f6d85",
  marca: "#2d5fb3",
  // La figura en azul y todo lo demás en gris muy suave, como el radar de la aplicación vieja (Elías, 30 oct: «se ve más
  // limpio»). El fondo del centro es el azul de la figura sobre blanco: la figura sigue por debajo sin cortarse.
  figura: "#0b58d3",
  eje: "#e9edf3",
  guia: "#eef1f6",
  anillo: "#dde3ec",
  anilloSinUso: "#eef1f6",
  etapaSinUso: "#b6c0cf",
  gris: "#c9d3e1",
  noPreguntada: "#a9b5c7",
  centro: "#d8e4f8",
  blanco: "#ffffff",
  frenaFondo: "#fdecec",
  frenaTexto: "#b5342a",
};
export const COLOR_DEL_NIVEL: Record<Letra, string> = {
  D: "#dc2626",
  I: "#f59e0b",
  F: "#22c55e",
  E: "#3b82f6",
  O: "#8b5cf6",
};
/** El mismo color, oscuro: el texto y la flecha que van sobre blanco. */
const COLOR_OSCURO_DEL_NIVEL: Record<Letra, string> = {
  D: "#b5342a",
  I: "#95580f",
  F: "#177a4f",
  E: "#1d4ed8",
  O: "#6d28d9",
};

export interface CapaDelRadar {
  clave: ClaveDeCapa;
  nombre: string;
  descripcion?: string | null;
  nivel: Letra | null;
  puntaje: number | null;
}

/** Otra área dibujada encima de la principal, con su color (`otras`). Sus dimensiones con SUS claves. */
export interface AreaSuperpuesta {
  area: string;
  color: string;
  dimensiones: readonly DimensionDelRadar[];
}

/** Un área superpuesta ya alineada con los ejes de la principal: `reales` lleva cada eje a la dimensión de esa área. */
interface AreaAlineada {
  area: string;
  color: string;
  dims: DimensionDelRadar[];
  reales: Record<string, string>;
}

/** La parte k de cada capa de `otra` sobre la parte k de esa capa de la principal (sin la suya: eje sin vértice). */
function alinear(dims: readonly DimensionDelRadar[], otra: AreaSuperpuesta): AreaAlineada {
  const reales: Record<string, string> = {};
  const vistos: Partial<Record<ClaveDeCapa, number>> = {};
  const alineadas = dims.map((d): DimensionDelRadar => {
    const k = vistos[d.capa] ?? 0;
    vistos[d.capa] = k + 1;
    const suya = otra.dimensiones.filter((x) => x.capa === d.capa)[k];
    if (suya) reales[d.clave] = suya.clave;
    return suya
      ? { ...suya, clave: d.clave, nombre: d.nombre, numero: d.numero }
      : { clave: d.clave, nombre: d.nombre, capa: d.capa, preguntada: false, nivel: null, puntaje: null };
  });
  return { area: otra.area, color: otra.color, dims: alineadas, reales };
}

export interface PropsDelRadarDeUnaEmpresa {
  area: string;
  dimensiones: readonly DimensionDelRadar[];
  /** Las dos capas con su nombre, su descripción y su nivel (las mitades). */
  capas: readonly CapaDelRadar[];
  /** Los cinco niveles de la escala, con su nombre. */
  niveles: readonly { letra: Letra; nombre: string }[];
  /** El nivel y el puntaje del área: el centro. */
  resultado?: { nivel: Letra | null; puntaje: number | null };
  frena?: FrenoDelRadar | null;
  formato?: "pantalla" | "pdf";
  /** El color de la figura; sin él, el azul de siempre. */
  color?: string;
  /** Otras áreas encima, cada una de su color (uso interno: ver el encabezado). */
  otras?: readonly AreaSuperpuesta[];
}

const redondo = (n: number | null) => (n !== null && Number.isFinite(n) ? Math.round(n) : null);

export default function RadarDeUnaEmpresa({
  area,
  dimensiones,
  capas,
  niveles,
  resultado = { nivel: null, puntaje: null },
  frena = null,
  formato = "pantalla",
  color = C.figura,
  otras = [],
}: PropsDelRadarDeUnaEmpresa) {
  const nombreDeNivel = (l: Letra) => niveles.find((n) => n.letra === l)?.nombre ?? l;
  const dims = dimensiones.filter((d) => d.capa === "base" || d.capa === "produccion");
  const etiqueta = `Radar de ${area}: ${dims
    .map((d) => {
      const e = estadoDeLaDimension(d);
      const extra = d.clave === frena?.clave ? ` (lo que más frena; el objetivo es ${nombreDeNivel(frena.objetivo)})` : "";
      return `${d.nombre}, ${e.tipo === "noLoSe" ? `no lo sabías, ${notaDelNoLoSe(nombreDeNivel)}` : textoDelEstado(e, nombreDeNivel).toLowerCase()}${extra}`;
    })
    .join("; ")}.`;
  const alineadas = otras.map((o) => alinear(dims, o));
  const comun = { area, dims, capas, nombreDeNivel, resultado, frena, figura: color, otras: alineadas };
  const leyenda = (
    <LeyendaDelRadar dims={dims} nombreDeNivel={nombreDeNivel} figura={color} areas={alineadas.length ? [{ area, color }, ...alineadas] : []} />
  );

  if (formato === "pdf") {
    return (
      <div className="rde rde-pdf">
        <SvgDelRadar m={PDF} {...comun} etiqueta={etiqueta} conPuntajes={false} />
        {leyenda}
      </div>
    );
  }

  const prod = dims.filter((d) => d.capa === "produccion");
  const base = dims.filter((d) => d.capa === "base");
  const nombreDeCapa = (c: ClaveDeCapa) => capas.find((x) => x.clave === c)?.nombre ?? c;
  return (
    <div className="rde">
      <div className="rde-arriba">
        <label className="rde-interruptor">
          Ver puntajes
          <input type="checkbox" role="switch" className="rde-check" />
          <span className="rde-pista" aria-hidden="true">
            <span className="rde-perilla" />
          </span>
        </label>
      </div>
      <div className="rde-grande">
        <SvgDelRadar m={GRANDE} {...comun} etiqueta={etiqueta} conPuntajes interactivo />
        {leyenda}
      </div>
      <div className="rde-compacto">
        <div className="rde-mitades" aria-hidden="true">
          <span>{nombreDeCapa("produccion").toUpperCase()}</span>
          <span>{nombreDeCapa("base").toUpperCase()}</span>
        </div>
        <SvgDelRadar m={COMPACTO} {...comun} etiqueta={`${etiqueta} Cada número es una parte; abajo dice cuál es.`} conPuntajes interactivo />
        <div className="rde-lista">
          <ListaDeUnaMitad dims={prod} frena={frena} nombreDeNivel={nombreDeNivel} />
          <ListaDeUnaMitad dims={base} frena={frena} nombreDeNivel={nombreDeNivel} />
        </div>
      </div>
    </div>
  );
}

/** La lista del teléfono: el número de cada dimensión y su nombre (lo que más frena, en rojo). */
function ListaDeUnaMitad({
  dims,
  frena,
  nombreDeNivel,
}: {
  dims: readonly DimensionDelRadar[];
  frena: FrenoDelRadar | null;
  nombreDeNivel: (l: Letra) => string;
}) {
  return (
    <ul>
      {dims.map((d) => {
        const e = estadoDeLaDimension(d);
        return (
          <li key={d.clave} data-apagada={!d.preguntada || undefined}>
            <b
              style={{
                color: d.clave === frena?.clave ? C.frenaTexto : undefined,
              }}
            >
              {d.numero ?? d.clave}
            </b>{" "}
            {d.nombre}
            {(e.tipo !== "nivel" || e.porExplorar) && <span className="rde-lista-estado"> · {e.tipo === "nivel" ? "por explorar" : textoDelEstado(e, nombreDeNivel).toLowerCase()}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Debajo del radar, solo si hace falta: qué es un eje punteado y qué es «?». */
function LeyendaDelRadar({
  dims,
  nombreDeNivel,
  figura,
  areas,
}: {
  dims: readonly DimensionDelRadar[];
  nombreDeNivel: (l: Letra) => string;
  figura: string;
  /** Con otras áreas encima: todas, la principal primero, con su color. */
  areas: readonly { area: string; color: string }[];
}) {
  const sinPreguntar = dims.some((d) => !d.preguntada);
  const noLoSe = dims.some((d) => d.preguntada && d.nivel && d.noLoSe);
  const porExplorar = dims.some((d) => d.preguntada && d.nivel && d.porExplorar && !d.noLoSe);
  if (!sinPreguntar && !noLoSe && !porExplorar && !areas.length) return null;
  return (
    <div className="rde-leyenda">
      {areas.length > 0 && (
        <span>
          {areas.map((a) => (
            <span key={a.area} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 12 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <rect x="1" y="1" width="12" height="12" rx="3" fill={a.color} fillOpacity={0.25} stroke={a.color} strokeWidth="1.75" />
              </svg>
              {a.area}
            </span>
          ))}
          Los nombres de las partes son los de {areas[0].area}: cada área mide la suya en el mismo lugar.
        </span>
      )}
      {sinPreguntar && (
        <span>
          <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true">
            <line x1="0" y1="5" x2="24" y2="5" stroke={C.noPreguntada} strokeWidth="1.75" strokeDasharray="4 4" />
          </svg>
          {dims.some((d) => d.sinMedir) ? "Eje punteado y sin vértice: todavía no se midió" : "Eje punteado y sin vértice: no se preguntó en este test"}
        </span>
      )}
      {noLoSe && (
        <span>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="8" fill={C.blanco} stroke={COLOR_DEL_NIVEL.D} strokeWidth="1.75" strokeDasharray="3 2.5" />
            <text x="10" y="14" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.frenaTexto}>
              ?
            </text>
          </svg>
          Contestaste «No lo sé»: {notaDelNoLoSe(nombreDeNivel)}
        </span>
      )}
      {porExplorar && (
        <span>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="6" fill={C.blanco} stroke={figura} strokeWidth="1.75" strokeDasharray="3 2.5" />
          </svg>
          Aro punteado: por explorar. Es lo que creemos por lo conversado; lo confirmamos contigo.
        </span>
      )}
    </div>
  );
}

/** Lo que solo se ve sin puntajes (`sin`) o solo con ellos (`con`). Sin interruptor, `con` no se dibuja. */
const Capa = ({ cual, children }: { cual: "sin" | "con"; children: ReactNode }) => <g className={`rde-${cual}`}>{children}</g>;

function SvgDelRadar({
  m,
  area,
  dims,
  capas,
  nombreDeNivel,
  resultado,
  frena,
  etiqueta,
  conPuntajes,
  interactivo = false,
  figura,
  otras,
}: {
  figura: string;
  otras: readonly AreaAlineada[];
  m: MedidasDelRadar;
  area: string;
  dims: readonly DimensionDelRadar[];
  capas: readonly CapaDelRadar[];
  nombreDeNivel: (l: Letra) => string;
  resultado: { nivel: Letra | null; puntaje: number | null };
  frena: FrenoDelRadar | null;
  etiqueta: string;
  conPuntajes: boolean;
  /**
   * La página: cada dimensión con su zona de cursor (una cuña) y la línea que se dibuja al pasarle el cursor
   * (AnimacionesDelResultado.tsx). En el PDF, nada de eso.
   */
  interactivo?: boolean;
}) {
  const d = dibujoDelRadar(m, dims, { frena, capas, nombreDeNivel });
  const vertFrena = d.vertices.find((v) => v.frena);
  const puntajeDelArea = redondo(resultado.puntaje);
  /** Las etapas que tienen que ver con el resultado: donde cae algún vértice y el objetivo de lo que más frena. */
  const enElResultado = new Set<Letra>([...d.vertices.map((v) => v.nivel), ...(d.objetivo ? [d.objetivo.nivel] : [])]);

  return (
    <svg viewBox={d.caja.map((v) => f(v)).join(" ")} role="img" aria-label={etiqueta} className={`rde-svg${interactivo ? " rde-interactivo" : ""}`}>
      {d.guias.map(([a, b], i) => (
        <line key={`g${i}`} x1={f(a[0])} y1={f(a[1])} x2={f(b[0])} y2={f(b[1])} stroke={C.guia} strokeWidth={m.trazo.guia} strokeDasharray={m.rayas.guia} />
      ))}
      {d.ejes.map((e) => (
        <line
          key={`e${e.clave}`}
          className="rde-eje"
          data-d={e.clave}
          x1={f(e.desde[0])}
          y1={f(e.desde[1])}
          x2={f(e.hasta[0])}
          y2={f(e.hasta[1])}
          stroke={e.preguntada ? C.eje : C.noPreguntada}
          strokeWidth={m.trazo.eje}
          strokeDasharray={e.preguntada ? undefined : m.rayas.noPreguntada}
        />
      ))}
      {/* Funcional, la única referencia con color: verde y punteada. Las otras etapas en gris, y más tenues si la empresa
          no cae en ellas (Elías, 30 oct, mirando la aplicación vieja). */}
      {d.anillos.map((a) => (
        <polygon
          key={`a${a.letra}`}
          points={puntosSvg(a.puntos)}
          fill="none"
          stroke={a.letra === "F" ? COLOR_DEL_NIVEL.F : enElResultado.has(a.letra) ? C.anillo : C.anilloSinUso}
          strokeOpacity={a.letra === "F" ? 0.6 : undefined}
          strokeWidth={m.trazo.anillo}
          strokeDasharray={a.letra === "F" ? m.rayas.funcional : undefined}
        />
      ))}
      {interactivo &&
        cunasDelRadar(m, d.ejes).map((c) => <polygon key={`z${c.clave}`} className="rde-cuna" data-d={c.clave} points={puntosSvg(c.puntos)} fill="transparent" />)}

      {/* Las otras áreas, debajo de la principal y cada una de su color: su figura y sus vértices (un aro punteado si es
          una hipótesis). El vértice lleva la clave de SU dimensión. */}
      {otras.map((o) => {
        const od = dibujoDelRadar(m, o.dims, { frena: null, capas, nombreDeNivel });
        return (
          <g key={o.area} className="rde-otra">
            {od.figura.length > 1 && (
              <polygon points={puntosSvg(od.figura)} fill={o.color} fillOpacity={0.08} stroke={o.color} strokeWidth={m.trazo.figura} strokeLinejoin="round" />
            )}
            {od.vertices.map((v) => (
              <circle
                key={v.clave}
                className="rde-vertice"
                data-d={interactivo ? o.reales[v.clave] : undefined}
                cx={f(v.punto[0])}
                cy={f(v.punto[1])}
                r={m.vertice.r}
                fill={v.porExplorar ? C.blanco : o.color}
                stroke={v.porExplorar ? o.color : C.blanco}
                strokeWidth={v.porExplorar ? m.objetivo.trazo : m.vertice.trazo}
                strokeDasharray={v.porExplorar ? m.objetivo.raya : undefined}
              />
            ))}
          </g>
        );
      })}

      {/* La empresa: la figura y los vértices (en la página, crecen desde el centro al abrir: radar-de-una-empresa.css). */}
      <g className="rde-empresa" style={{ transformOrigin: `${f(m.cx)}px ${f(m.cy)}px` }}>
        {d.figura.length > 1 && (
          <polygon
            className="rde-figura"
            points={puntosSvg(d.figura)}
            fill={figura}
            fillOpacity={0.16}
            stroke={figura}
            strokeWidth={m.trazo.figura}
            strokeLinejoin="round"
          />
        )}
        {/* El resalte va del rótulo hasta el vértice de la dimensión, no hasta el centro (como la vieja). Sin vértice
            (no se preguntó), no hay resalte. */}
        {interactivo &&
          d.ejes.map((e) => {
            const v = d.vertices.find((x) => x.clave === e.clave);
            if (!v) return null;
            return (
              <line
                key={`h${e.clave}`}
                className="rde-eje-resalte"
                data-d={e.clave}
                x1={f(e.hasta[0])}
                y1={f(e.hasta[1])}
                x2={f(v.punto[0])}
                y2={f(v.punto[1])}
                pathLength={1}
              />
            );
          })}
        <Capa cual="sin">
          {vertFrena && (
            <circle className="rde-iman" cx={f(vertFrena.punto[0])} cy={f(vertFrena.punto[1])} r={m.vertice.halo} fill={COLOR_DEL_NIVEL.D} fillOpacity={0.12} />
          )}
          {d.vertices.map((v) =>
            v.porExplorar ? (
              <circle
                key={v.clave}
                className="rde-vertice"
                data-d={v.clave}
                cx={f(v.punto[0])}
                cy={f(v.punto[1])}
                r={v.frena ? m.vertice.rFrena : m.vertice.r}
                fill={C.blanco}
                stroke={v.frena ? COLOR_DEL_NIVEL[v.nivel] : figura}
                strokeWidth={m.objetivo.trazo}
                strokeDasharray={m.objetivo.raya}
              />
            ) : v.noLoSe ? (
              <g key={v.clave} className="rde-vertice" data-d={v.clave}>
                <circle
                  cx={f(v.punto[0])}
                  cy={f(v.punto[1])}
                  r={m.noLoSe.r}
                  fill={C.blanco}
                  stroke={COLOR_DEL_NIVEL[v.nivel]}
                  strokeWidth={m.objetivo.trazo}
                  strokeDasharray={m.objetivo.raya}
                />
                <text x={f(v.punto[0])} y={f(v.punto[1] + m.noLoSe.baja)} textAnchor="middle" fontSize={m.noLoSe.letra} fontWeight={700} fill={C.frenaTexto}>
                  ?
                </text>
              </g>
            ) : (
              <circle
                key={v.clave}
                className="rde-vertice"
                data-d={v.clave}
                cx={f(v.punto[0])}
                cy={f(v.punto[1])}
                r={v.frena ? m.vertice.rFrena : m.vertice.r}
                fill={v.frena ? COLOR_DEL_NIVEL[v.nivel] : figura}
                stroke={C.blanco}
                strokeWidth={m.vertice.trazo}
              />
            ),
          )}
        </Capa>
        {conPuntajes && (
          <Capa cual="con">
            {vertFrena && m.conPuntaje.halo && (
              <circle className="rde-iman" cx={f(vertFrena.punto[0])} cy={f(vertFrena.punto[1])} r={m.conPuntaje.halo} fill={COLOR_DEL_NIVEL.D} fillOpacity={0.12} />
            )}
            {d.vertices.map((v) => (
              <g key={v.clave} className="rde-vertice" data-d={v.clave}>
                <circle
                  cx={f(v.punto[0])}
                  cy={f(v.punto[1])}
                  r={m.conPuntaje.r}
                  fill={C.blanco}
                  stroke={v.frena || v.noLoSe ? COLOR_DEL_NIVEL[v.nivel] : figura}
                  strokeWidth={v.noLoSe || v.porExplorar ? m.objetivo.trazo : m.conPuntaje.trazo}
                  strokeDasharray={v.noLoSe || v.porExplorar ? m.objetivo.raya : undefined}
                />
                <text x={f(v.punto[0])} y={f(v.punto[1] + m.conPuntaje.baja)} textAnchor="middle" fontSize={m.conPuntaje.letra} fontWeight={700} fill={C.tinta}>
                  {v.puntaje ?? ""}
                </text>
              </g>
            ))}
          </Capa>
        )}
      </g>

      {/* La flecha de lo que más frena y su objetivo, encima de los vértices: en el teléfono el disco del puntaje la tapaba. */}
      {/* En la página, la flecha y su aro se mueven con el vértice de lo que más frena cuando el imán lo corre (si no, se
          despegaban): `data-iman-x/y` es el punto del que toman la fuerza. */}
      {d.objetivo && (
        <g
          className={interactivo && vertFrena ? "rde-iman" : undefined}
          data-iman-x={interactivo && vertFrena ? f(vertFrena.punto[0]) : undefined}
          data-iman-y={interactivo && vertFrena ? f(vertFrena.punto[1]) : undefined}
        >
          {d.objetivo.linea && (
            <line
              x1={f(d.objetivo.linea[0][0])}
              y1={f(d.objetivo.linea[0][1])}
              x2={f(d.objetivo.linea[1][0])}
              y2={f(d.objetivo.linea[1][1])}
              stroke={COLOR_OSCURO_DEL_NIVEL[d.objetivo.nivel]}
              strokeWidth={m.flecha.trazo}
              strokeDasharray={m.flecha.raya}
              strokeLinecap="round"
            />
          )}
          <polygon points={puntosSvg(d.objetivo.punta)} fill={COLOR_OSCURO_DEL_NIVEL[d.objetivo.nivel]} />
          <circle
            cx={f(d.objetivo.punto[0])}
            cy={f(d.objetivo.punto[1])}
            r={m.objetivo.r}
            fill={C.blanco}
            stroke={COLOR_DEL_NIVEL[d.objetivo.nivel]}
            strokeWidth={m.objetivo.trazo}
            strokeDasharray={m.objetivo.raya}
          />
          <circle cx={f(d.objetivo.punto[0])} cy={f(d.objetivo.punto[1])} r={m.objetivo.rPunto} fill={COLOR_DEL_NIVEL[d.objetivo.nivel]} />
        </g>
      )}
      {/* Los nombres de las etapas van encima de la figura: en el teléfono, un vértice arriba los tapaba. */}
      {d.etapas.map((e) => (
        <text
          key={`n${e.letra}`}
          x={f(e.x)}
          y={f(e.y)}
          textAnchor="middle"
          fontSize={m.etapa.letra}
          fontWeight={500}
          fill={e.letra === "F" || enElResultado.has(e.letra) ? C.apagado : C.etapaSinUso}
          stroke={C.blanco}
          strokeWidth={m.etapa.borde}
          paintOrder="stroke"
        >
          {nombreDeNivel(e.letra)}
        </text>
      ))}
      {/* El centro: el área y, en grande, su nivel (y su puntaje, con «Ver puntajes»). */}
      <circle cx={m.cx} cy={m.cy} r={m.rCentro} fill={C.centro} />
      <text x={m.cx} y={m.cy + m.centro.yArea} textAnchor="middle" fontSize={m.centro.area} fontWeight={700} fill={C.tinta}>
        {area}
      </text>
      {m.centro.sub && resultado.nivel && (
        <>
          <Capa cual="sin">
            <text x={m.cx} y={m.cy + m.centro.ySub} textAnchor="middle" fontSize={m.centro.sub} fill={C.secundario}>
              {nombreDeNivel(resultado.nivel)}
            </text>
          </Capa>
          {conPuntajes && (
            <Capa cual="con">
              <text x={m.cx} y={m.cy + m.centro.ySub} textAnchor="middle" fontSize={m.centro.sub} fill={C.secundario}>
                {nombreDeNivel(resultado.nivel)}
                {puntajeDelArea !== null && (
                  <tspan fill={C.marca} fontWeight={600}>
                    {` · ${puntajeDelArea}/100`}
                  </tspan>
                )}
              </text>
            </Capa>
          )}
        </>
      )}

      {d.rotulos.map((r) => (
        <RotuloDeLaDimension key={`r${r.clave}`} r={r} m={m} nombreDeNivel={nombreDeNivel} interactivo={interactivo} />
      ))}
      {d.numeros.map((n) => (
        <g
          key={`c${n.clave}`}
          className="rde-numero"
          data-d={n.clave}
          tabIndex={interactivo ? 0 : undefined}
          role={interactivo ? "button" : undefined}
          aria-label={interactivo ? `${dims.find((x) => x.clave === n.clave)?.nombre ?? n.numero}: ver cómo está` : undefined}
        >
          <circle
            cx={f(n.punto[0])}
            cy={f(n.punto[1])}
            r={m.numeroEnLaPunta!.r}
            fill={n.frena ? C.frenaFondo : C.blanco}
            stroke={n.frena ? C.frenaTexto : n.preguntada ? C.gris : C.noPreguntada}
            strokeWidth={n.frena ? 1.25 : 1}
            strokeDasharray={n.preguntada ? undefined : "2 2"}
          />
          <text
            x={f(n.punto[0])}
            y={f(n.punto[1] + m.numeroEnLaPunta!.baja)}
            textAnchor="middle"
            fontSize={m.numeroEnLaPunta!.letra}
            fontWeight={700}
            fill={n.frena ? C.frenaTexto : n.preguntada ? C.tinta : C.apagado}
          >
            {n.numero}
          </text>
        </g>
      ))}
      {d.mitades.map((mi) => {
        const capa = capas.find((c) => c.clave === mi.clave);
        const puntaje = redondo(capa?.puntaje ?? null);
        return (
          <g key={`m${mi.clave}`}>
            {mi.nombre.map((l) => (
              <text key={l.texto} x={mi.x} y={f(l.y)} textAnchor={mi.ancla} fontSize={m.mitad!.nombre} fontWeight={700} letterSpacing="0.01em" fill={C.tinta}>
                {l.texto}
              </text>
            ))}
            {mi.descripcion.map((l) => (
              <text key={l.texto} x={mi.x} y={f(l.y)} textAnchor={mi.ancla} fontSize={m.mitad!.descripcion} fill={C.apagado}>
                {l.texto}
              </text>
            ))}
            {mi.yNivel !== null && (
              <text x={mi.x} y={f(mi.yNivel)} textAnchor={mi.ancla} fontSize={15} fontWeight={600} fill={C.texto}>
                {capa?.nivel ? (
                  <>
                    <tspan fill={COLOR_DEL_NIVEL[capa.nivel]}>●</tspan> {nombreDeNivel(capa.nivel)}
                    {conPuntajes && puntaje !== null && (
                      <tspan className="rde-con" fill={C.marca}>
                        {` · ${puntaje}/100`}
                      </tspan>
                    )}
                  </>
                ) : (
                  <tspan fill={C.apagado}>No se midió</tspan>
                )}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** El rótulo de una dimensión: «1.1 · ● Inicial», su nombre y, si va, la nota de «No lo sé» y el chip de lo que más frena. */
function RotuloDeLaDimension({
  r,
  m,
  nombreDeNivel,
  interactivo,
}: {
  r: RotuloDelRadar;
  m: MedidasDelRadar;
  nombreDeNivel: (l: Letra) => string;
  interactivo: boolean;
}) {
  const ro = m.rotulo!;
  const apagado = r.estado.tipo === "noPreguntada" || r.estado.tipo === "sinUbicar";
  return (
    // En la página, cada rótulo recibe el foco del teclado y muestra la tarjeta de su dimensión (AnimacionesDelResultado).
    <g
      className="rde-rotulo"
      data-d={r.clave}
      tabIndex={interactivo ? 0 : undefined}
      role={interactivo ? "button" : undefined}
      aria-label={interactivo ? `${r.nombre.map((l) => l.texto).join(" ")}: ver cómo está` : undefined}
    >
      {/* En la página, todo el bloque del rótulo recibe el cursor (también el hueco entre sus renglones). */}
      {interactivo && <rect x={f(r.caja.x0)} y={f(r.caja.y0)} width={f(r.caja.x1 - r.caja.x0)} height={f(r.caja.y1 - r.caja.y0)} fill="transparent" />}
      <text x={f(r.x)} y={f(r.yNumero)} textAnchor={r.ancla} fontSize={ro.numero} fontWeight={600} letterSpacing="0.04em" fill={C.apagado}>
        {`${r.numero} · `}
        {r.estado.tipo === "nivel" ? (
          <>
            <tspan fill={COLOR_DEL_NIVEL[r.estado.letra]}>{r.estado.porExplorar ? "○" : "●"}</tspan> <tspan fill={C.texto}>{nombreDeNivel(r.estado.letra)}</tspan>
            {r.estado.porExplorar && <tspan fill={C.apagado}> · por explorar</tspan>}
          </>
        ) : r.estado.tipo === "noLoSe" ? (
          <tspan fill={C.frenaTexto}>{textoDelEstado(r.estado, nombreDeNivel)}</tspan>
        ) : (
          textoDelEstado(r.estado, nombreDeNivel)
        )}
      </text>
      {r.nombre.map((l) => (
        <text
          key={l.texto}
          className="rde-rotulo-nombre"
          x={f(r.x)}
          y={f(l.y)}
          textAnchor={r.ancla}
          fontSize={ro.nombre}
          fontWeight={500}
          fill={apagado ? C.apagado : C.secundario}
        >
          {l.texto}
        </text>
      ))}
      {r.nota && (
        <text x={f(r.x)} y={f(r.nota.y)} textAnchor={r.ancla} fontSize={ro.nombre - 3.5} fill={C.apagado}>
          {notaDelNoLoSe(nombreDeNivel)}
        </text>
      )}
      {r.chip && (
        <g>
          <rect x={f(r.chip.x)} y={f(r.chip.y)} width={ro.chip.ancho} height={ro.chip.alto} rx={ro.chip.alto / 2} fill={C.frenaFondo} />
          <text
            x={f(r.chip.x + ro.chip.ancho / 2)}
            y={f(r.chip.y + ro.chip.texto)}
            textAnchor="middle"
            fontSize={ro.chip.letra}
            fontWeight={700}
            letterSpacing="0.06em"
            fill={C.frenaTexto}
          >
            LO QUE MÁS FRENA
          </text>
        </g>
      )}
    </g>
  );
}
