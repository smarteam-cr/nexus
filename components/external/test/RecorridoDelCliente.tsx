/**
 * components/external/test/RecorridoDelCliente.tsx — LOS TRASPASOS DEL RECORRIDO DEL CLIENTE (24 nov, Elías eligió este
 * diagrama). Va en el Resumen de la escala que ve el cliente y en su PDF, DEBAJO de la lista de pasos de siempre (que no
 * cambia ni se esconde: su ícono, su detalle y lo que corrigió quien presenta siguen ahí).
 *
 * Cada traspaso es una fila: el equipo que entrega → el que recibe, con una flecha, cuánto pasa si la empresa lo dijo
 * («180 leads al mes») y qué pasa al pasar. Abajo, si hay dos cifras o más, el volumen de punta a punta («180 leads al mes
 * → 25 cierres al mes»): lo que se pierde por el camino, sin restar nada (las dos cifras las dijo la empresa; la resta no).
 *
 * ⛔ SVG ESTÁTICO: sin JS, sin animación y con hex literal (la página del cliente y el PDF no tienen el tema de la app).
 * Angosto (400 de ancho) para que en el celular la letra no baje de unos 12 px. Solo pinta: qué traspasos hay y con qué
 * citas lo decide `resumenParaLaPagina` (lib/exploraciones/resumen-de-la-escala.ts). Los nombres de los equipos son los
 * que ve el cliente (`quienes`: con lo que corrigió quien presenta).
 */
import type { EtapaDeLaPagina } from "@/lib/external/pagina-del-resumen";
import { partirEnLineas } from "@/lib/escala/rueda";

const ANCHO = 400;
const CAJA = 128;
const ALTO_DE_LA_CAJA = 40;
/** Letras por línea del texto del traspaso (14 px a lo ancho del dibujo). */
const LETRAS_POR_LINEA = 50;
const COLOR = {
  caja: "#ffffff",
  borde: "#d6deef",
  tinta: "#14204a",
  tenue: "#5b6684",
  azul: "#1f3fbf",
  flecha: "#8a9cc9",
  fondo: "#eef2fb",
} as const;

/** Hasta `lineas` líneas de `max` letras, por palabras; la última con «…» si no cabe todo. */
export function enLineas(texto: string, max: number, lineas: number): string[] {
  const todas = partirEnLineas(texto, max);
  if (todas.length <= lineas) return todas;
  const cortadas = todas.slice(0, lineas);
  cortadas[lineas - 1] = `${cortadas[lineas - 1].replace(/[.,;:]$/, "")}…`;
  return cortadas;
}

const palabras = (x: string | null | undefined) => (x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Un traspaso dibujable: entre un paso y el SIGUIENTE, y solo si va al equipo de ese paso (si no, la flecha mentiría). */
export interface TraspasoDibujable {
  id: string;
  de: string;
  a: string;
  texto: string;
  volumen: string | null;
}

/**
 * Los traspasos que se dibujan, en el orden de los pasos. `quienes`: el «quien» que ve el cliente de cada paso (con lo que
 * corrigió quien presenta). Un traspaso cuyo «a» no es el equipo del paso que le sigue en la página (se quitó o se metió un
 * paso en el medio) no se dibuja.
 */
export function traspasosDibujables(pasos: readonly EtapaDeLaPagina[], quienes: Readonly<Record<string, string | null>> = {}): TraspasoDibujable[] {
  return pasos.slice(0, -1).flatMap((e, i) => {
    const t = e.traspaso;
    const siguiente = pasos[i + 1];
    if (!t || !siguiente.quien) return [];
    // Por palabras enteras («Soporte + Customer Success» tiene a «Soporte»); «TI» no está en «Logística» (revisión del 24 nov).
    const a = palabras(t.a);
    const suyo = palabras(siguiente.quien);
    if (!a.length || !(a.every((p) => suyo.includes(p)) || suyo.every((p) => a.includes(p)))) return [];
    return [{ id: e.id, de: quienes[e.id] || e.quien || t.de, a: quienes[siguiente.id] || siguiente.quien, texto: t.texto, volumen: t.cifra ? `${t.cifra}${t.rotulo ? ` ${t.rotulo}` : ""}` : null }];
  });
}

/** El alto de una fila: las dos cajas con la flecha, su volumen y el texto debajo. */
const altoDeLaFila = (t: TraspasoDibujable) => ALTO_DE_LA_CAJA + 12 + enLineas(t.texto, LETRAS_POR_LINEA, 3).length * 19 + 20;

/** Hay algo que dibujar: por lo menos un traspaso que va al paso siguiente. */
export function conTraspasos(pasos: readonly EtapaDeLaPagina[], quienes: Readonly<Record<string, string | null>> = {}): boolean {
  return traspasosDibujables(pasos, quienes).length > 0;
}

/** Una caja con el nombre de un equipo. */
function Caja({ x, y, nombre }: { x: number; y: number; nombre: string }) {
  return (
    <g>
      <rect x={x} y={y} width={CAJA} height={ALTO_DE_LA_CAJA} rx={10} fill={COLOR.caja} stroke={COLOR.borde} />
      <text x={x + CAJA / 2} y={y + 26} textAnchor="middle" fontSize={15} fontWeight={700} fill={COLOR.tinta}>
        {enLineas(nombre, 15, 1)[0]}
      </text>
    </g>
  );
}

/** El dibujo. `pasos`: los de la línea, en orden; `quienes`: el «quien» que ve el cliente de cada paso. */
export default function RecorridoDelCliente({ pasos, quienes = {} }: { pasos: readonly EtapaDeLaPagina[]; quienes?: Readonly<Record<string, string | null>> }) {
  const filas = traspasosDibujables(pasos, quienes);
  if (!filas.length) return null;
  const volumenes = filas.flatMap((t) => (t.volumen ? [t.volumen] : []));
  const deCabo = volumenes.length >= 2 ? enLineas(`${volumenes[0]} → ${volumenes[volumenes.length - 1]}`, 44, 2) : [];
  const altos = filas.map(altoDeLaFila);
  const inicio = (i: number) => altos.slice(0, i).reduce((s, a) => s + a, 0);
  const fin = inicio(filas.length);
  const altoTotal = fin + (deCabo.length ? 22 + deCabo.length * 22 : 0);
  return (
    <figure className="re-recorrido-traspasos" style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${ANCHO} ${altoTotal}`}
        width="100%"
        role="img"
        aria-label={`Lo que pasa entre tus equipos: ${filas.map((t) => `${t.de} a ${t.a}${t.volumen ? `, ${t.volumen}` : ""}`).join("; ")}.`}
        style={{ display: "block", maxWidth: 460, fontFamily: "inherit" }}
      >
        <defs>
          <marker id="re-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 Z" fill={COLOR.flecha} />
          </marker>
        </defs>
        {filas.map((t, i) => {
          const y = inicio(i);
          return (
            <g key={t.id}>
              <Caja x={1} y={y} nombre={t.de} />
              <line x1={CAJA + 8} y1={y + ALTO_DE_LA_CAJA / 2} x2={ANCHO - CAJA - 10} y2={y + ALTO_DE_LA_CAJA / 2} stroke={COLOR.flecha} strokeWidth={2} markerEnd="url(#re-punta)" />
              {t.volumen && (
                <text x={ANCHO / 2} y={y + ALTO_DE_LA_CAJA / 2 - 7} textAnchor="middle" fontSize={13} fontWeight={700} fill={COLOR.azul}>
                  {enLineas(t.volumen, 18, 1)[0]}
                </text>
              )}
              <Caja x={ANCHO - CAJA - 1} y={y} nombre={t.a} />
              {enLineas(t.texto, LETRAS_POR_LINEA, 3).map((linea, k) => (
                <text key={k} x={2} y={y + ALTO_DE_LA_CAJA + 24 + k * 19} fontSize={14} fill={COLOR.tenue}>
                  {linea}
                </text>
              ))}
            </g>
          );
        })}
        {deCabo.length > 0 && (
          <g>
            <rect x={1} y={fin + 4} width={ANCHO - 2} height={deCabo.length * 22 + 14} rx={10} fill={COLOR.fondo} />
            {deCabo.map((linea, k) => (
              <text key={k} x={ANCHO / 2} y={fin + 26 + k * 22} textAnchor="middle" fontSize={15} fontWeight={700} fill={COLOR.azul}>
                {linea}
              </text>
            ))}
          </g>
        )}
      </svg>
    </figure>
  );
}
