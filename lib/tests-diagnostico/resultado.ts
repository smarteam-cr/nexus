/**
 * lib/tests-diagnostico/resultado.ts — EL RESULTADO DEL TEST, calculado por Nexus. PURO.
 *
 * O3 del roadmap (2026-10-26). El nivel y el puntaje salen del CHEQUEO de la escala vigente (lib/escala/chequeo.ts), el
 * mismo cálculo del cuestionario del cliente: cada dimensión a mitad de su tramo y la capa y el área por su dimensión
 * más débil con el avance hacia el siguiente. La IA nunca mueve un número (la app vieja dejaba que la IA moviera el
 * puntaje dentro de la banda).
 *
 * Lo que trae, para la página de resultados y la preventa:
 *   · el nivel del área, sus dos capas y cada dimensión, marcado como ESTIMADO (lo dijo el prospecto, nadie lo verificó);
 *   · UNA sola recomendación con su razón (la del chequeo) y el costo de quedarse de esa dimensión;
 *   · los riesgos activos: los criterios de riesgo de los niveles que la dimensión todavía no alcanza (hasta 3);
 *   · los casos de uso que lo mueven (lib/casos-de-uso/camino.ts), sin precio;
 *   · una síntesis armada con los datos, sin IA (la de la IA, si se prende, solo la redacta).
 * La versión de Marketing pregunta 4 dimensiones: las que no preguntó no cuentan (no aplican al cálculo) y el resultado
 * lo dice («estimado con 4 de 8»).
 */
import { calcularChequeo, type Estimado, type RazonDeLaRecomendacion } from "@/lib/escala/chequeo";
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import type { ClaveDeCapa, Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import { casosParaElArea, type AreaParaElCamino } from "@/lib/casos-de-uso/camino";
import { NO_LO_SE, type PreguntaDelBanco, type RespuestasDelTest, type VersionDelTest } from "./tipos";

export interface DimensionDelResultado {
  id: string;
  nombre: string;
  capa: ClaveDeCapa;
  preguntada: boolean;
  nivel: Letra | null;
  nivelNombre: string | null;
  puntaje: number | null;
  /** Contestó «No lo sé» (cuenta como el nivel más bajo). */
  noLoSe: boolean;
}

export interface ResultadoDelTest {
  /** La forma de este Json: si cambia, sube. */
  v: 1;
  escalaVersion: string;
  edicion: string | null;
  areaId: string;
  areaNombre: string;
  version: VersionDelTest;
  nivel: Letra | null;
  nivelNombre: string | null;
  puntaje: number | null;
  capas: { clave: ClaveDeCapa; nombre: string; nivel: Letra | null; nivelNombre: string | null; puntaje: number | null }[];
  dimensiones: DimensionDelResultado[];
  /** Los cinco niveles, en orden, para dibujar la curva. */
  niveles: { letra: Letra; nombre: string }[];
  recomendacion:
    | { tipo: "trabajar"; dimensionId: string; dimensionNombre: string; objetivo: Letra; objetivoNombre: string; razon: string; costoDeQuedarse: string }
    | { tipo: "sostener"; razon: string }
    | null;
  riesgos: string[];
  casos: { id: string; titulo: string; promesa: string; razon: string }[];
  sintesis: string;
  preguntadas: number;
  total: number;
}

/** Las letras elegidas por dimensión. «No lo sé» = el nivel más bajo. Una opción que no existe no cuenta. */
export function nivelesDeLasRespuestas(
  preguntas: readonly PreguntaDelBanco[],
  respuestas: RespuestasDelTest,
): Record<string, { nivel: Letra; noLoSe: boolean }> {
  const out: Record<string, { nivel: Letra; noLoSe: boolean }> = {};
  for (const p of preguntas) {
    const r = respuestas[p.id];
    if (!r) continue;
    if (r.opcion === NO_LO_SE) {
      out[p.dimensionId] = { nivel: "D", noLoSe: true };
      continue;
    }
    const o = p.opciones.find((x) => x.id === r.opcion);
    if (o) out[p.dimensionId] = { nivel: o.nivel, noLoSe: false };
  }
  return out;
}

const RAZON_DEL_AREA: Record<RazonDeLaRecomendacion["capa"], string> = {
  "unica-con-pendientes": "es la única parte del área con algo por subir",
  "la-mas-baja": "es la parte del área que está más abajo",
  "empate-base": "con las dos partes del área parejas, primero va la base: cómo está montado el equipo por dentro",
  "empate-produccion": "con la base ya en su lugar, lo que sigue es lo que el equipo entrega hacia afuera",
};

const idx = (l: Letra) => LETRAS.indexOf(l);

/** El resultado del test, contra la escala ya vista por la edición de la industria. */
export function resultadoDelTest(o: {
  escala: Escala;
  areaId: string;
  version: VersionDelTest;
  preguntas: readonly PreguntaDelBanco[];
  respuestas: RespuestasDelTest;
}): ResultadoDelTest | null {
  const { escala } = o;
  const area = escala.areas.find((a) => a.id === o.areaId);
  if (!area) return null;
  const niveles = nivelesDeLasRespuestas(o.preguntas, o.respuestas);
  const preguntadas = new Set(o.preguntas.map((p) => p.dimensionId));
  const nombre = (l: Letra | null) => (l ? nombreDeNivel(escala, l) : null);

  // Las dimensiones que no se preguntaron no cuentan: la de Marketing ubica la capa base, y el área por ella.
  const estimados: Record<string, Estimado> = Object.fromEntries(Object.entries(niveles).map(([id, v]) => [id, { nivel: v.nivel }]));
  const chequeo = calcularChequeo(
    [
      {
        id: area.id,
        nombre: area.nombre,
        dimensiones: area.dimensiones.map((d) => ({ id: d.id, nombre: d.nombre, capa: d.capa, aplica: preguntadas.has(d.id) })),
        orden: { base: null, produccion: null },
      },
    ],
    estimados,
  );
  const a = chequeo.areas[0];
  const dimensiones: DimensionDelResultado[] = a.dimensiones.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    capa: d.capa,
    preguntada: d.aplica,
    nivel: d.nivel,
    nivelNombre: nombre(d.nivel),
    puntaje: d.puntaje,
    noLoSe: niveles[d.id]?.noLoSe ?? false,
  }));

  const capas = (["base", "produccion"] as const).map((clave) => ({
    clave,
    nombre: escala.capas.find((c) => c.clave === clave)?.nombre ?? clave,
    nivel: a.capas[clave].nivel,
    nivelNombre: nombre(a.capas[clave].nivel),
    puntaje: a.capas[clave].puntaje,
  }));

  // La recomendación del chequeo, en palabras: qué dimensión, a qué nivel y por qué.
  let recomendacion: ResultadoDelTest["recomendacion"] = null;
  const rec = chequeo.recomendacion;
  if (rec?.tipo === "trabajar") {
    const dim = area.dimensiones.find((d) => d.id === rec.dimensionId);
    const capaNombre = capas.find((c) => c.clave === rec.capa)?.nombre ?? "";
    recomendacion = {
      tipo: "trabajar",
      dimensionId: rec.dimensionId,
      dimensionNombre: dim?.nombre ?? rec.dimensionId,
      objetivo: rec.objetivo,
      objetivoNombre: nombreDeNivel(escala, rec.objetivo),
      razon: `Es lo que más frena a ${area.nombre} hoy: ${capaNombre ? `en ${capaNombre.toLowerCase()}, ` : ""}${RAZON_DEL_AREA[rec.razon.capa]}, y dentro de ella es lo que está más abajo.`,
      costoDeQuedarse: dim?.costoDeQuedarse ?? "",
    };
  } else if (rec?.tipo === "sostener") {
    recomendacion = { tipo: "sostener", razon: `${area.nombre} ya llegó a donde apunta: lo que sigue es sostenerlo y volver a medir.` };
  }

  // Los riesgos activos: los criterios de riesgo de los niveles que cada dimensión preguntada todavía no alcanza.
  const riesgos: string[] = [];
  for (const d of area.dimensiones) {
    const nivel = niveles[d.id]?.nivel;
    if (!nivel) continue;
    for (const n of d.niveles) {
      if (idx(n.letra) <= idx(nivel)) continue;
      for (const c of n.criterios) {
        const msg = c.riesgo ? escala.riesgos[c.id] : undefined;
        if (msg && !riesgos.includes(msg)) riesgos.push(msg);
      }
    }
  }

  // Los casos de uso que lo mueven, desde donde está hoy (sin precio: el catálogo del público no lo tiene).
  const paraElCamino: AreaParaElCamino = {
    id: area.id,
    nombre: area.nombre,
    nivel: a.nivel,
    objetivo: a.objetivo,
    frena:
      rec?.tipo === "trabajar"
        ? { capa: rec.capa, nivel: a.capas[rec.capa].nivel ?? "D", dimensiones: dimensiones.filter((d) => d.capa === rec.capa && d.nivel === a.capas[rec.capa].nivel).map((d) => d.id) }
        : null,
    capas: { base: { nombre: capas[0].nombre, nivel: capas[0].nivel }, produccion: { nombre: capas[1].nombre, nivel: capas[1].nivel } },
    dimensiones: dimensiones.map((d) => ({ id: d.id, nombre: d.nombre, aplica: d.preguntada, nivel: d.nivel, clase: d.nivel ? ("hipotesis" as const) : null })),
  };
  const casos = casosParaElArea(paraElCamino, { max: 3, nombreDeNivel: (l) => nombreDeNivel(escala, l) }).map((c) => ({
    id: c.caso.id,
    titulo: c.caso.titulo,
    promesa: c.caso.promesa,
    razon: c.razon,
  }));

  const contestadas = Object.keys(niveles).length;
  return {
    v: 1,
    escalaVersion: escala.version,
    edicion: escala.edicion?.slug ?? null,
    areaId: area.id,
    areaNombre: area.nombre,
    version: o.version,
    nivel: a.nivel,
    nivelNombre: nombre(a.nivel),
    puntaje: a.puntaje,
    capas,
    dimensiones,
    niveles: escala.niveles.map((n) => ({ letra: n.letra, nombre: n.nombre })),
    recomendacion,
    riesgos: riesgos.slice(0, 3),
    casos,
    sintesis: sintesisDelResultado({ areaNombre: area.nombre, nivelNombre: nombre(a.nivel), dimensiones, recomendacion, contestadas, total: area.dimensiones.length }),
    preguntadas: preguntadas.size,
    total: area.dimensiones.length,
  };
}

/** La síntesis armada con los datos, sin IA: lo más fuerte, lo que frena y el alcance de la estimación. */
export function sintesisDelResultado(o: {
  areaNombre: string;
  nivelNombre: string | null;
  dimensiones: readonly DimensionDelResultado[];
  recomendacion: ResultadoDelTest["recomendacion"];
  contestadas: number;
  total: number;
}): string {
  const conNivel = o.dimensiones.filter((d) => d.nivel);
  if (!o.nivelNombre || !conNivel.length) {
    return `Con lo que respondiste todavía no alcanza para ubicar a ${o.areaNombre}: en una sesión lo completamos juntos.`;
  }
  const mejor = [...conNivel].sort((a, b) => idx(b.nivel!) - idx(a.nivel!))[0];
  const partes = [
    `Por lo que respondiste, ${o.areaNombre} está hoy en ${o.nivelNombre}.`,
    mejor && mejor.nivel && idx(mejor.nivel) >= idx("F") ? `Lo más sólido es ${mejor.nombre.toLowerCase()}.` : "",
    o.recomendacion?.tipo === "trabajar"
      ? `Lo que más te frena es ${o.recomendacion.dimensionNombre.toLowerCase()}: llevarlo a ${o.recomendacion.objetivoNombre} es lo primero.`
      : "",
    o.contestadas < o.total
      ? `Es un estimado con ${o.contestadas} de las ${o.total} dimensiones del área; el resto se mira en la sesión.`
      : "Es un estimado con lo que tú nos dijiste: en la sesión lo confirmamos con evidencia.",
  ];
  return partes.filter(Boolean).join(" ");
}
