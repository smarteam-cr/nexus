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
 *   · una síntesis armada con los datos, sin IA (`resumenSinIa`); la de la IA va aparte, en `redaccion`.
 * La versión de Marketing pregunta 4 dimensiones: las que no preguntó no cuentan (no aplican al cálculo) y el resultado
 * lo dice («estimado con 4 de 8»).
 */
import { calcularChequeo, type AreaParaChequeo, type Estimado, type RazonDeLaRecomendacion } from "@/lib/escala/chequeo";
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import type { ClaveDeCapa, Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import { casosParaElArea, type AreaParaElCamino } from "@/lib/casos-de-uso/camino";
import { casosQueNoCalzanConSuCrm } from "@/lib/casos-de-uso/capas";
import { resumenSinIa, type RedaccionDelResultado } from "./redaccion";
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
  /**
   * El resumen sin IA (`resumenSinIa` de ./redaccion.ts). Lo que ve el prospecto arriba de su página es
   * `resumenDelResultado` (el de la IA, o este): quien muestre un resumen, que use ese.
   */
  sintesis: string;
  /**
   * Los textos que redactó la IA al terminar (./redaccion.ts): el resumen de arriba y, por dimensión, cómo está y qué
   * priorizar. Opcional: los resultados de antes del 29 oct no lo traen, y sin él la página usa los textos de los datos.
   */
  redaccion?: RedaccionDelResultado | null;
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
  /** ¿Trabaja en HubSpot? (lo que marcó en el formulario). null: no se sabe. */
  usaHubspot?: boolean | null;
}): ResultadoDelTest | null {
  return resultadoDeLosNiveles({
    escala: o.escala,
    areaId: o.areaId,
    version: o.version,
    usaHubspot: o.usaHubspot ?? null,
    preguntadas: new Set(o.preguntas.map((p) => p.dimensionId)),
    niveles: nivelesDeLasRespuestas(o.preguntas, o.respuestas),
  });
}

/** El nivel de una dimensión. `riesgo`: dejó ver un riesgo (en la escala de una empresa; el test no lo sabe). */
export type NivelDeLaDimension = { nivel: Letra; noLoSe: boolean; riesgo?: boolean };

/**
 * El resultado de un área con el nivel de cada dimensión, venga de donde venga: las respuestas del test o lo medido en la
 * escala de una empresa (lib/exploraciones/escala-para-el-cliente.ts). `preguntadas`: las que cuentan.
 */
export function resultadoDeLosNiveles(o: {
  escala: Escala;
  areaId: string;
  version: VersionDelTest;
  preguntadas: ReadonlySet<string>;
  niveles: Record<string, NivelDeLaDimension>;
  /** El orden de dependencias de cada capa (desempata lo que más frena). El test no lo sabe: va por identificador. */
  orden?: AreaParaChequeo["orden"];
  /**
   * ¿Trabaja en HubSpot? Sin confirmarlo (null) o sin usarlo, los casos no ofrecen «Reactivar el uso del HubSpot que ya
   * pagas» (10 nov, Centauro); usándolo, no ofrecen migrar a HubSpot (`casosQueNoCalzanConSuCrm`).
   */
  usaHubspot?: boolean | null;
}): ResultadoDelTest | null {
  const { escala, niveles, preguntadas } = o;
  const area = escala.areas.find((a) => a.id === o.areaId);
  if (!area) return null;
  const nombre = (l: Letra | null) => (l ? nombreDeNivel(escala, l) : null);

  // Las dimensiones que no se preguntaron no cuentan: la de Marketing ubica la capa base, y el área por ella.
  const estimados: Record<string, Estimado> = Object.fromEntries(Object.entries(niveles).map(([id, v]) => [id, { nivel: v.nivel, ...(v.riesgo ? { riesgoALaVista: true } : {}) }]));
  const chequeo = calcularChequeo(
    [
      {
        id: area.id,
        nombre: area.nombre,
        dimensiones: area.dimensiones.map((d) => ({ id: d.id, nombre: d.nombre, capa: d.capa, aplica: preguntadas.has(d.id) })),
        orden: o.orden ?? { base: null, produccion: null },
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
    // El de la dimensión, no el dicho: un riesgo a la vista lo topa en Funcional.
    const nivel = dimensiones.find((x) => x.id === d.id)?.nivel;
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
  const casos = casosParaElArea(paraElCamino, { max: 3, nombreDeNivel: (l) => nombreDeNivel(escala, l), excluir: casosQueNoCalzanConSuCrm({ usa: o.usaHubspot ?? null }) }).map((c) => ({
    id: c.caso.id,
    titulo: c.caso.titulo,
    promesa: c.caso.promesa,
    razon: c.razon,
  }));

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
    // La misma síntesis sin IA que muestra la página (./redaccion.ts): una sola, para que no haya dos resúmenes distintos.
    sintesis: resumenSinIa({ areaNombre: area.nombre, nivel: a.nivel, capas, recomendacion, preguntadas: preguntadas.size }),
    preguntadas: preguntadas.size,
    total: area.dimensiones.length,
  };
}
