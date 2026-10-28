/**
 * components/external/test/RadarDelResultado.tsx — EL RADAR SIMPLE de la empresa en la página de resultado del test, el
 * que se ve en el CELULAR. SVG estático, sin JS. Hex literal (página del cliente).
 *
 * En escritorio y en el PDF va la rueda de la escala (components/escala/RadarDeUnaEmpresa.tsx, la del Mapa interno),
 * pero sus textos se leen desde unos 700 px de ancho: en un teléfono quedan de 5 px. Este radar sí se lee ahí: cada eje
 * es una dimensión que se preguntó y cada anillo un nivel, de Deficiente al centro a Óptimo en el borde; el anillo
 * punteado verde es Funcional, la base, y el punto de cada dimensión cae sobre el anillo de su nivel. La dimensión que
 * más frena va con el punto naranja. resultado.css decide cuál de los dos se ve.
 */
import { lineasDelNombre, radioDelNivel } from "@/lib/tests-diagnostico/pagina-del-resultado";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";

const LETRAS = ["D", "I", "F", "E", "O"] as const;
const COLOR_DEL_NIVEL: Record<string, string> = { D: "#F87171", I: "#FB923C", F: "#FBBF24", E: "#60A5FA", O: "#42E4B3" };
const ROYAL = "#0B58D3";
const ACENTO = "#E8481C";
const TINTA = "#051849";
const SUAVE = "#6B7AA0";
const ANILLO = "#D6E2F5";
const VERDE = "#16A34A";

export default function RadarDelResultado({ r }: { r: ResultadoDelTest }) {
  const dims = r.dimensiones.filter((d) => d.preguntada);
  if (dims.length < 3) return null;
  const W = 560;
  const H = 480;
  const cx = W / 2;
  const cy = H / 2;
  const radio = 165;
  const frena = r.recomendacion?.tipo === "trabajar" ? r.recomendacion.dimensionId : null;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / dims.length;
  const pt = (i: number, t: number) => [cx + Math.cos(ang(i)) * radio * t, cy + Math.sin(ang(i)) * radio * t] as const;
  const anillo = (t: number) => dims.map((_, i) => pt(i, t).map((v) => v.toFixed(1)).join(",")).join(" ");
  const puntos = dims.map((d, i) => pt(i, radioDelNivel(d.nivel)));
  const nombreDelNivel = (l: string) => r.niveles.find((n) => n.letra === l)?.nombre ?? l;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Radar de ${r.areaNombre}: ${dims.map((d) => `${d.nombre}, ${d.nivelNombre ?? "sin nivel"}`).join("; ")}`}>
      {LETRAS.map((l, k) => (
        <polygon key={l} points={anillo((k + 1) / LETRAS.length)} fill={k === 4 ? "rgba(255,255,255,0.55)" : "none"} stroke={ANILLO} strokeWidth="1" />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke={ANILLO} strokeWidth="1" />;
      })}
      {/* La base: Funcional. */}
      <polygon points={anillo(3 / 5)} fill="none" stroke={VERDE} strokeWidth="1.6" strokeDasharray="5 4" />
      <polygon points={puntos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="rgba(11,88,211,0.16)" stroke={ROYAL} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Los nombres de los niveles, sobre el eje de arriba. */}
      {LETRAS.map((l, k) => (
        <text key={l} x={cx + 5} y={cy - radio * ((k + 1) / LETRAS.length) + 12} fontSize="11.5" fill={l === "F" ? VERDE : SUAVE} fontWeight={l === "F" ? 700 : 400}>
          {nombreDelNivel(l)}
        </text>
      ))}
      {dims.map((d, i) => {
        const [x, y] = puntos[i];
        const esFrena = d.id === frena;
        return (
          <circle
            key={d.id}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r={esFrena ? 7 : 5.5}
            fill={esFrena ? ACENTO : d.nivel ? COLOR_DEL_NIVEL[d.nivel] : SUAVE}
            stroke="#fff"
            strokeWidth="2"
          />
        );
      })}
      {dims.map((d, i) => {
        const [x, y] = pt(i, 1.13);
        const c = Math.cos(ang(i));
        const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
        const lineas = lineasDelNombre(d.nombre);
        const arriba = Math.sin(ang(i)) < -0.5;
        const y0 = arriba ? y - (lineas.length - 1) * 17 : Math.sin(ang(i)) > 0.5 ? y + 8 : y - ((lineas.length - 1) * 17) / 2 + 5;
        return (
          <text key={d.id} x={x.toFixed(1)} y={y0.toFixed(1)} textAnchor={anchor} fontSize="15" fill={d.id === frena ? ACENTO : TINTA} fontWeight={d.id === frena ? 700 : 500}>
            {lineas.map((t, k) => (
              <tspan key={k} x={x.toFixed(1)} dy={k ? 17 : 0}>
                {t}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
