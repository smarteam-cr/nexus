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
 *   · `formato="pdf"`: solo el radar grande con las letras de la hoja, sin puntajes, sin interruptor y sin los puntos
 *     grises de los cruces.
 *   · Una dimensión con `preguntada: false` va con el eje punteado, sin vértice y «No se preguntó»; con `noLoSe`, «?» en
 *     un aro punteado y «No lo sabías · cuenta como Deficiente». Debajo, una leyenda que solo aparece si hay alguna.
 */
import type { ReactNode } from "react";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import {
  COMPACTO,
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
  eje: "#d6dee9",
  guia: "#e3e9f2",
  gris: "#c9d3e1",
  noPreguntada: "#a9b5c7",
  centro: "#f4f7fb",
  centroBorde: "#edf1f7",
  blanco: "#ffffff",
  frenaFondo: "#fdecec",
  frenaTexto: "#b5342a",
  baseTexto: "#177a4f",
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
  const comun = { area, dims, capas, nombreDeNivel, resultado, frena };
  const leyenda = <LeyendaDelRadar dims={dims} nombreDeNivel={nombreDeNivel} />;

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
        <SvgDelRadar m={GRANDE} {...comun} etiqueta={etiqueta} conPuntajes />
        {leyenda}
      </div>
      <div className="rde-compacto">
        <div className="rde-mitades" aria-hidden="true">
          <span>{nombreDeCapa("produccion").toUpperCase()}</span>
          <span>{nombreDeCapa("base").toUpperCase()}</span>
        </div>
        <SvgDelRadar m={COMPACTO} {...comun} etiqueta={`${etiqueta} Cada número es una parte; abajo dice cuál es.`} conPuntajes />
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
            {e.tipo !== "nivel" && <span className="rde-lista-estado"> · {textoDelEstado(e, nombreDeNivel).toLowerCase()}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Debajo del radar, solo si hace falta: qué es un eje punteado y qué es «?». */
function LeyendaDelRadar({ dims, nombreDeNivel }: { dims: readonly DimensionDelRadar[]; nombreDeNivel: (l: Letra) => string }) {
  const sinPreguntar = dims.some((d) => !d.preguntada);
  const noLoSe = dims.some((d) => d.preguntada && d.nivel && d.noLoSe);
  if (!sinPreguntar && !noLoSe) return null;
  return (
    <div className="rde-leyenda">
      {sinPreguntar && (
        <span>
          <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true">
            <line x1="0" y1="5" x2="24" y2="5" stroke={C.noPreguntada} strokeWidth="1.75" strokeDasharray="4 4" />
          </svg>
          Eje punteado y sin vértice: no se preguntó en este test
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
}: {
  m: MedidasDelRadar;
  area: string;
  dims: readonly DimensionDelRadar[];
  capas: readonly CapaDelRadar[];
  nombreDeNivel: (l: Letra) => string;
  resultado: { nivel: Letra | null; puntaje: number | null };
  frena: FrenoDelRadar | null;
  etiqueta: string;
  conPuntajes: boolean;
}) {
  const d = dibujoDelRadar(m, dims, { frena, capas, nombreDeNivel });
  const vertFrena = d.vertices.find((v) => v.frena);
  const puntajeDelArea = redondo(resultado.puntaje);

  return (
    <svg viewBox={d.caja.map((v) => f(v)).join(" ")} role="img" aria-label={etiqueta} className="rde-svg">
      {d.guias.map(([a, b], i) => (
        <line key={`g${i}`} x1={f(a[0])} y1={f(a[1])} x2={f(b[0])} y2={f(b[1])} stroke={C.guia} strokeWidth={m.trazo.guia} strokeDasharray={m.rayas.guia} />
      ))}
      {d.ejes.map((e) => (
        <line
          key={`e${e.clave}`}
          x1={f(e.desde[0])}
          y1={f(e.desde[1])}
          x2={f(e.hasta[0])}
          y2={f(e.hasta[1])}
          stroke={e.preguntada ? C.eje : C.noPreguntada}
          strokeWidth={m.trazo.eje}
          strokeDasharray={e.preguntada ? undefined : m.rayas.noPreguntada}
        />
      ))}
      {d.anillos.map((a) => (
        <polygon
          key={`a${a.letra}`}
          points={puntosSvg(a.puntos)}
          fill="none"
          stroke={COLOR_DEL_NIVEL[a.letra]}
          strokeOpacity={a.letra === "F" ? undefined : 0.7}
          strokeWidth={m.trazo.anillo}
          strokeDasharray={a.letra === "F" ? m.rayas.funcional : undefined}
        />
      ))}
      {m.puntoGris && d.puntosGrises.map(([x, y], i) => <circle key={`p${i}`} cx={f(x)} cy={f(y)} r={m.puntoGris!} fill={C.gris} />)}
      <g>
        <rect
          x={f(d.chipDeLaBase.x0)}
          y={f(d.chipDeLaBase.y0)}
          width={m.chipDeLaBase.ancho}
          height={m.chipDeLaBase.alto}
          rx={m.chipDeLaBase.alto / 2}
          fill={C.blanco}
          stroke={COLOR_DEL_NIVEL.F}
          strokeWidth={m.chipDeLaBase.trazo}
        />
        <text
          x={f(m.cx)}
          y={f((d.chipDeLaBase.y0 + d.chipDeLaBase.y1) / 2 + m.chipDeLaBase.baja)}
          textAnchor="middle"
          fontSize={m.chipDeLaBase.letra}
          fontWeight={600}
          fill={C.baseTexto}
        >
          La base
        </text>
      </g>

      {/* La empresa: la figura, la flecha de lo que más frena hasta su objetivo y los vértices. */}
      {d.figura.length > 1 && (
        <polygon points={puntosSvg(d.figura)} fill={C.tinta} fillOpacity={0.07} stroke={C.tinta} strokeWidth={m.trazo.figura} strokeLinejoin="round" />
      )}
      <Capa cual="sin">
        {vertFrena && <circle cx={f(vertFrena.punto[0])} cy={f(vertFrena.punto[1])} r={m.vertice.halo} fill={COLOR_DEL_NIVEL.D} fillOpacity={0.12} />}
        {d.vertices.map((v) =>
          v.noLoSe ? (
            <g key={v.clave}>
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
              cx={f(v.punto[0])}
              cy={f(v.punto[1])}
              r={v.frena ? m.vertice.rFrena : m.vertice.r}
              fill={COLOR_DEL_NIVEL[v.nivel]}
              stroke={C.blanco}
              strokeWidth={m.vertice.trazo}
            />
          ),
        )}
      </Capa>
      {conPuntajes && (
        <Capa cual="con">
          {vertFrena && m.conPuntaje.halo && (
            <circle cx={f(vertFrena.punto[0])} cy={f(vertFrena.punto[1])} r={m.conPuntaje.halo} fill={COLOR_DEL_NIVEL.D} fillOpacity={0.12} />
          )}
          {d.vertices.map((v) => (
            <g key={v.clave}>
              <circle
                cx={f(v.punto[0])}
                cy={f(v.punto[1])}
                r={m.conPuntaje.r}
                fill={C.blanco}
                stroke={COLOR_DEL_NIVEL[v.nivel]}
                strokeWidth={v.noLoSe ? m.objetivo.trazo : m.conPuntaje.trazo}
                strokeDasharray={v.noLoSe ? m.objetivo.raya : undefined}
              />
              <text x={f(v.punto[0])} y={f(v.punto[1] + m.conPuntaje.baja)} textAnchor="middle" fontSize={m.conPuntaje.letra} fontWeight={700} fill={C.tinta}>
                {v.puntaje ?? ""}
              </text>
            </g>
          ))}
        </Capa>
      )}

      {/* La flecha de lo que más frena y su objetivo, encima de los vértices: en el teléfono el disco del puntaje la tapaba. */}
      {d.objetivo && (
        <g>
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
          fontWeight={600}
          fill={C.secundario}
          stroke={C.blanco}
          strokeWidth={m.etapa.borde}
          paintOrder="stroke"
        >
          {nombreDeNivel(e.letra)}
        </text>
      ))}
      {/* El centro: el área y, en grande, su nivel (y su puntaje, con «Ver puntajes»). */}
      <circle cx={m.cx} cy={m.cy} r={m.rCentro} fill={C.centro} stroke={C.centroBorde} strokeWidth={1} />
      <text x={m.cx} y={m.cy + m.centro.yArea} textAnchor="middle" fontSize={m.centro.area} fontWeight={700} fill={C.tinta}>
        {area}
      </text>
      {m.centro.sub && resultado.nivel && (
        <>
          <Capa cual="sin">
            <text x={m.cx} y={m.cy + m.centro.ySub} textAnchor="middle" fontSize={m.centro.sub} fill={C.apagado}>
              {nombreDeNivel(resultado.nivel)}
            </text>
          </Capa>
          {conPuntajes && (
            <Capa cual="con">
              <text x={m.cx} y={m.cy + m.centro.ySub} textAnchor="middle" fontSize={m.centro.sub} fill={C.apagado}>
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
        <RotuloDeLaDimension key={`r${r.clave}`} r={r} m={m} nombreDeNivel={nombreDeNivel} />
      ))}
      {d.numeros.map((n) => (
        <g key={`c${n.clave}`}>
          <circle
            cx={f(n.punto[0])}
            cy={f(n.punto[1])}
            r={m.numeroEnLaPunta!.r}
            fill={n.frena ? C.frenaFondo : C.blanco}
            stroke={n.frena ? C.frenaTexto : n.preguntada ? C.tinta : C.noPreguntada}
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
function RotuloDeLaDimension({ r, m, nombreDeNivel }: { r: RotuloDelRadar; m: MedidasDelRadar; nombreDeNivel: (l: Letra) => string }) {
  const ro = m.rotulo!;
  const apagado = r.estado.tipo === "noPreguntada" || r.estado.tipo === "sinUbicar";
  return (
    <g>
      <text x={f(r.x)} y={f(r.yNumero)} textAnchor={r.ancla} fontSize={ro.numero} fontWeight={600} letterSpacing="0.04em" fill={C.apagado}>
        {`${r.numero} · `}
        {r.estado.tipo === "nivel" ? (
          <>
            <tspan fill={COLOR_DEL_NIVEL[r.estado.letra]}>●</tspan> <tspan fill={C.texto}>{nombreDeNivel(r.estado.letra)}</tspan>
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
          x={f(r.x)}
          y={f(l.y)}
          textAnchor={r.ancla}
          fontSize={ro.nombre}
          fontWeight={apagado ? 500 : 600}
          fill={apagado ? C.apagado : C.tinta}
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
