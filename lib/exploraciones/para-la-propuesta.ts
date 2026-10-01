/**
 * lib/exploraciones/para-la-propuesta.ts — lo que la exploración le pasa a la Propuesta de Nexus. PURO.
 *
 * Dos cosas:
 *   - el BLOQUE de contexto para la generación: la fuente principal de la propuesta. Solo lleva lo
 *     que puede llegar al cliente (la propuesta la ve él): ni hipótesis, ni presupuesto, ni quién
 *     decide, ni lo que nadie exploró, ni la apertura a la asesoría. Sin ids de la escala.
 *   - la POSICIÓN en la escala, escrita desde el chequeo y no por la IA: la sección «Dónde está tu
 *     operación hoy» alimenta el bloque de la Escala del kickoff, así que lleva solo nombres de
 *     nivel, el nombre GENERAL de la dimensión que frena (nunca el de la edición) y texto neutro, en
 *     el idioma de la propuesta.
 */
import type { ResultadoDelChequeo } from "@/lib/escala/chequeo";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import type { AreaEnLaEscala, PosicionEnLaEscala } from "@/lib/escala/posicion";
import { CASILLAS, type Meta, type Reto } from "./casillas";
import type { EstadoDeExploracion } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";

/**
 * Lo que recibe la generación en lugar del resumen de la Escala cuando la posición sale de la
 * exploración: la sección ya está escrita, y si otra sección nombra un nivel, que sea el mismo.
 */
export const AVISO_DE_LA_ESCALA_DESDE_LA_EXPLORACION = [
  "=== ESCALA DE RENDIMIENTO ===",
  "La sección «Dónde está tu operación hoy» ya viene escrita desde la exploración de venta: no la escribas. " +
    "Si en otra sección nombras el nivel de un área, usa el que trae la exploración; no estimes otro.",
].join("\n");

/**
 * El título y la antetítulo de la sección en inglés: como la IA no la escribe, tampoco traduce sus
 * títulos, y una propuesta en inglés la mostraría en español.
 */
export const TITULOS_DE_LA_SECCION_EN = { titulo: "Where your operation stands today", antetitulo: "Performance scale" } as const;

const ORDEN: Letra[] = ["D", "I", "F", "E", "O"];
const NIVEL_EN: Record<Letra, string> = { D: "Deficient", I: "Initial", F: "Functional", E: "Efficient", O: "Optimal" };
const AREA_EN: Record<string, string> = { ventas: "Sales", marketing: "Marketing", servicio: "Service" };

const TEXTOS = {
  es: {
    intro: "Esto es lo que vemos desde las conversaciones: es un estimado, y el diagnóstico lo confirma con evidencia.",
    remedicion: "Lo confirmamos en el diagnóstico y lo volvemos a medir entre 60 y 90 días después de la entrega.",
    frena: (capa: string) => `La que frena hoy es la ${capa}: por ahí empieza el trabajo.`,
    pareja: "Las dos capas están en el mismo nivel: se trabajan juntas.",
    capa: { base: "base operativa", produccion: "producción" } as Record<ClaveDeCapa, string>,
  },
  en: {
    intro: "This is what we see from our conversations: it is an estimate, and the diagnostic confirms it with evidence.",
    remedicion: "We confirm it in the diagnostic and measure it again 60 to 90 days after delivery.",
    frena: (capa: string) => `What holds it back today is the ${capa}: that is where the work starts.`,
    pareja: "Both layers are at the same level: they are worked on together.",
    capa: { base: "operational base", produccion: "production layer" } as Record<ClaveDeCapa, string>,
  },
};

const idioma = (lang: string | null | undefined): "es" | "en" => (lang?.toLowerCase().startsWith("en") ? "en" : "es");

/** El nombre del nivel en el idioma de la propuesta (en español, el de la escala publicada). */
function nombreDelNivel(escala: EscalaDelLienzo, l: Letra, lang: "es" | "en"): string {
  return lang === "en" ? NIVEL_EN[l] : (escala.niveles.find((n) => n.letra === l)?.nombre ?? l);
}

/** La dimensión que marca el piso de una capa (las más débiles, en el orden de dependencias), por su nombre GENERAL. */
function pisoDeLaCapa(chequeo: ResultadoDelChequeo, escala: EscalaDelLienzo, areaId: string, capa: ClaveDeCapa): string {
  const area = chequeo.areas.find((a) => a.id === areaId);
  const delLienzo = escala.areas.find((a) => a.id === areaId);
  const nivel = area?.capas[capa].nivel;
  if (!area || !delLienzo || !nivel) return "";
  const orden = delLienzo.paraChequeo.orden[capa];
  const lugar = (id: string) => (orden ? orden.indexOf(id) : -1);
  return area.dimensiones
    .filter((d) => d.capa === capa && d.aplica && d.nivel === nivel)
    .sort((a, b) => lugar(a.id) - lugar(b.id) || a.id.localeCompare(b.id))
    .slice(0, 2)
    .map((d) => {
      const dl = delLienzo.dimensiones.find((x) => x.id === d.id);
      return dl?.nombreGeneral ?? dl?.nombre ?? d.nombre;
    })
    .join(" · ");
}

/** La posición de la sección «Dónde está tu operación hoy», desde el chequeo de la exploración. */
export function posicionDesdeElChequeo(chequeo: ResultadoDelChequeo, escala: EscalaDelLienzo, lang: string | null | undefined): PosicionEnLaEscala {
  const l = idioma(lang);
  const t = TEXTOS[l];
  const areas: AreaEnLaEscala[] = [];
  for (const a of chequeo.areas) {
    const base = a.capas.base.nivel;
    const produccion = a.capas.produccion.nivel;
    if (!base && !produccion) continue;
    const delLienzo = escala.areas.find((x) => x.id === a.id);
    const general = delLienzo?.nombreGeneral ?? delLienzo?.nombre ?? a.nombre;
    let brecha = "";
    if (base && produccion) {
      const ib = ORDEN.indexOf(base);
      const ip = ORDEN.indexOf(produccion);
      brecha = ib === ip ? t.pareja : t.frena(ib < ip ? t.capa.base : t.capa.produccion);
    }
    const meta = a.objetivo ?? (a.nivel === "O" ? "O" : null);
    areas.push({
      area: l === "en" ? (AREA_EN[general.toLowerCase()] ?? general) : general,
      base: base ? nombreDelNivel(escala, base, l) : "",
      basePiso: pisoDeLaCapa(chequeo, escala, a.id, "base"),
      produccion: produccion ? nombreDelNivel(escala, produccion, l) : "",
      produccionPiso: pisoDeLaCapa(chequeo, escala, a.id, "produccion"),
      brecha,
      cercania: "",
      meta: meta ? nombreDelNivel(escala, meta, l) : "",
    });
  }
  return { intro: areas.length ? t.intro : "", areas, remedicion: areas.length ? t.remedicion : "" };
}

// ── El bloque de contexto para la generación ───────────────────────────────────

function lineaDeMeta(m: Meta): string {
  const tramo = [m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`].filter(Boolean).join(" ");
  return `- ${m.que}${tramo ? `: ${tramo}` : ""}${m.para ? `, para ${m.para}` : ""}`;
}

/**
 * La exploración como FUENTE de la propuesta. `conEscala` es `usaEscala(tags)` del trato: con «Sin
 * Escala» no se nombran niveles ni la escala (lo que falta se cuenta como brechas, sin la vara).
 */
export function bloqueParaLaPropuesta(o: {
  estado: EstadoDeExploracion;
  escala: EscalaDelLienzo;
  chequeo: ResultadoDelChequeo;
  conEscala: boolean;
}): string {
  const { estado, escala, chequeo, conEscala } = o;
  const c = estado.contenido;
  const nombreDim = (id: string) => {
    for (const a of escala.areas) {
      const d = a.dimensiones.find((x) => x.id === id);
      if (d) return d.nombre;
    }
    return null;
  };
  const partes: string[] = [
    "# Exploración de venta: la fuente principal de esta propuesta",
    "Lo que el vendedor confirmó con el prospecto en las reuniones de exploración." +
      (conEscala ? " El nivel de cada área es un ESTIMADO de la venta: sirve para la propuesta, no es una medición." : ""),
  ];
  // Sin nada abajo del encabezado, no hay bloque: la generación no puede contar un encabezado como fuente.
  const encabezado = partes.length;

  const metas = (c.casillas.metas ?? []) as Meta[];
  if (metas.length) {
    partes.push(
      "",
      "## Las metas del cliente",
      ...metas.map(lineaDeMeta),
      "Usa las metas con cifras como el criterio de éxito de la propuesta y como la base del retorno. No inventes otras cifras.",
    );
  }

  const retos = (c.casillas.retos ?? []) as Reto[];
  if (retos.length) {
    partes.push("", "## Sus retos", ...retos.map((r) => `- ${r.texto}${r.dimensionId && nombreDim(r.dimensionId) ? ` (${nombreDim(r.dimensionId)})` : ""}`));
  }

  // Las casillas de texto y de lista que pueden llegar al cliente, en el orden del lienzo.
  for (const def of CASILLAS) {
    if (!def.alCliente || def.clave === "metas" || def.clave === "retos") continue;
    if (def.tipo !== "texto" && def.tipo !== "lista") continue;
    const v = c.casillas[def.clave];
    if (v === undefined) continue;
    const lineas = Array.isArray(v) ? (v as string[]).map((x) => `- ${x}`) : [String(v)];
    if (lineas.length) partes.push("", `## ${def.etiqueta}`, ...lineas);
  }

  if (conEscala) {
    const areas = chequeo.areas.filter((a) => a.capas.base.nivel || a.capas.produccion.nivel);
    if (areas.length) {
      const nivel = (l: Letra | null) => (l ? nombreDelNivel(escala, l, "es") : "sin estimar");
      partes.push(
        "",
        "## El nivel estimado de cada área (la sección de la Escala ya viene escrita: no la recalcules)",
        ...areas.map((a) => {
          const piso = (capa: ClaveDeCapa) => pisoDeLaCapa(chequeo, escala, a.id, capa);
          return (
            `- ${a.nombre}: base operativa ${nivel(a.capas.base.nivel)}${piso("base") ? ` (la frena: ${piso("base")})` : ""}; ` +
            `producción ${nivel(a.capas.produccion.nivel)}${piso("produccion") ? ` (la frena: ${piso("produccion")})` : ""}.` +
            (a.objetivo ? ` Con la propuesta llega a ${nivel(a.objetivo)}.` : "")
          );
        }),
      );
      const r = chequeo.recomendacion;
      if (r?.tipo === "trabajar") {
        const area = chequeo.areas.find((x) => x.id === r.areaId);
        const dim = nombreDim(r.dimensionId);
        if (area && dim) partes.push(`Qué va primero: ${dim}, en ${area.nombre}.`);
      }
    }
  }

  // Lo que le falta: los criterios que NO tiene, por dimensión (el texto, nunca el id).
  const porDimension = new Map<string, string[]>();
  for (const a of escala.areas) {
    if (!estado.areas.includes(a.id)) continue;
    for (const d of a.dimensiones) {
      const faltan = d.funcional.filter((cr) => c.falta[cr.id]?.estado === "no_tiene").map((cr) => cr.texto);
      if (faltan.length) porDimension.set(`${d.nombre} (${a.nombre})`, faltan);
    }
  }
  if (porDimension.size) {
    partes.push(
      "",
      conEscala ? "## Lo que le falta para llegar a Funcional (lo que la propuesta tiene que cubrir)" : "## Lo que le falta hoy (lo que la propuesta tiene que cubrir)",
      ...[...porDimension].map(([dim, faltan]) => `- ${dim}: ${faltan.join("; ")}`),
    );
  }

  const casos = Object.values(c.casosDeUso);
  if (casos.length) {
    const nombreDeArea = (id: string | null) => (id ? (escala.areas.find((a) => a.id === id)?.nombre ?? null) : null);
    partes.push(
      "",
      "## Para qué va cada caso de uso elegido",
      ...casos.map(
        (k) => `- ${k.titulo}${nombreDeArea(k.areaId) ? ` (${nombreDeArea(k.areaId)})` : ""}${k.razon ? `: ${k.razon}` : ""}${k.descripcion ? ` Qué es: ${k.descripcion}` : ""}`,
      ),
    );
  }

  return partes.length === encabezado ? "" : partes.join("\n");
}
