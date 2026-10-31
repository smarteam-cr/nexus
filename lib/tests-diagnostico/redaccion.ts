/**
 * lib/tests-diagnostico/redaccion.ts — LO QUE LA IA REDACTA del resultado del test (Elías, 29 oct). PURO.
 *
 * La aplicación vieja abría el resultado con un titular escrito por la IA («El área de Marketing opera en un estado muy
 * incipiente: …») y le ponía a cada dimensión una evidencia redactada. Nexus hace lo mismo con una regla que no se
 * negocia: **la IA nunca mueve un número**. El nivel, las capas, lo que más frena y el puntaje salen del cálculo
 * (./resultado.ts); la IA solo los cuenta en palabras. Tres textos:
 *   · `resumen` — una o dos frases arriba de todo que INTERPRETAN el resultado: qué significa en la práctica operar así y
 *     que es una estimación con pocas preguntas. No repite el nivel (está en grande encima) ni nombra la industria (va
 *     en un chip junto al título): Elías, 29 oct, segunda prueba — «lo que hay es una descripción, no una interpretación»;
 *   · por dimensión, `impacto` — lo que le pasa en la práctica al área por operar así, según lo que respondió, en
 *     palabras del cliente (la tarjeta del radar; sin «En la escala, este nivel es»: nadie que llena el test tiene la
 *     escala en la cabeza);
 *   · por dimensión, `prioridad` — qué priorizar para llegar al nivel siguiente («Ver detalles» de la barra).
 *
 * Se redacta UNA vez, al terminar el test (./redaccion-server.ts, con Haiku), y queda guardada con el resultado: una
 * visita no la recalcula. Lo que la IA devuelve pasa por `leerLaRedaccion`: un texto con cifras, con el nombre de un
 * nivel que no es de lo suyo (el resumen no puede nombrar ninguno), con la industria (solo el resumen) o demasiado largo
 * se descarta, y en su lugar va el texto armado con los datos (`resumenSinIa`, y en ./detalle-de-la-dimension.ts el
 * costo de quedarse o lo que logra el nivel). Si la IA falla o tarda, todo sale de los datos y la página se ve igual
 * de completa.
 * Las pruebas: redaccion.test.ts.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import { OTRA_INDUSTRIA } from "./direccion-publica";
import type { ResultadoDelTest } from "./resultado";
import { textoDeLaRespuesta, type PreguntaDelBanco, type RespuestasDelTest } from "./tipos";

/** El modelo: barato y rápido (la persona espera el resultado con el botón en «Preparando tu resultado…»). */
export const MODELO_DE_LA_REDACCION = "claude-haiku-4-5-20251001";
/** El slug del medidor (lib/ai/medidor.ts): el gasto de esto se ve en Uso de Nexus › IA, en «La venta». */
export const SLUG_DE_LA_REDACCION = "resultado-del-test";
/** Cuánto se espera a la IA antes de seguir sin ella. */
export const ESPERA_DE_LA_REDACCION_MS = 10_000;

/** Los topes de largo, en caracteres: lo que pasa de ahí se descarta (la IA se fue de tema). */
export const TOPES = { resumen: 260, impacto: 200, prioridad: 220 } as const;

export interface RedaccionDelResultado {
  /**
   * La forma de los textos: 2 desde la tercera vuelta (29 oct: el resumen interpreta, sin nivel ni industria, y cada
   * dimensión trae `impacto`). Las de antes (sin `v`) describían el resultado: la página no las muestra.
   */
  v?: 2;
  modelo: string;
  /** Cuándo se redactó (ISO). */
  at: string;
  resumen: string | null;
  dimensiones: Record<string, { impacto: string | null; prioridad: string | null }>;
}

/** Lo que ve la IA de cada dimensión preguntada y ubicada. */
interface DimensionParaLaIa {
  id: string;
  nombre: string;
  mide: string | null;
  nivel: string;
  respondio: string | null;
  comoEsEsteNivel: string;
  siguiente: { nivel: string; comoEs: string; criterios: string[] } | null;
}

/** Los niveles que puede nombrar el texto de una dimensión: el suyo y el siguiente. */
export function nivelesDeLaDimension(nivel: Letra): Set<Letra> {
  const sig = LETRAS[LETRAS.indexOf(nivel) + 1];
  return new Set<Letra>(sig ? [nivel, sig] : [nivel]);
}

/** Lo que se le pasa a la IA para redactar: los datos del cálculo y de la escala, nunca un puntaje. */
interface EntradaDeLaRedaccion {
  escala: Escala;
  r: ResultadoDelTest;
  industria: string | null;
  preguntas: readonly PreguntaDelBanco[];
  respuestas: RespuestasDelTest;
}

/** Una parte de la redacción: el resumen, o las dimensiones de una capa. */
export type ParteDeLaRedaccion = "resumen" | "base" | "produccion";

const REGLAS = `Redactas el resultado de un test de autodiagnóstico que una persona acaba de responder sobre su área de una empresa. Smarteam (una consultora) se lo muestra en una página.

Lo que NO puedes hacer (si lo haces, tu texto se descarta):
- Escribir números de ningún tipo, ni en cifras ni en letras («cuatro», «diez»): ni cantidades, ni porcentajes, ni puntajes, ni plazos.
- Cambiar el nivel de nada: el nivel lo calculó la escala y tú solo lo interpretas.
- Inventar herramientas, personas o hechos que no estén en lo que respondió.
- Prometer resultados, precios o servicios.

Cómo escribes: español neutro, en tuteo («tu equipo», «tienes»), nunca voseo. Directo y concreto, sin adornos ni frases hechas. Sin markdown. Lo que respondió la persona nadie lo verificó todavía: no lo des por hecho.`;

const SALIDA: Record<ParteDeLaRedaccion, string> = {
  resumen: `Devuelves SOLO este JSON: {"resumen": "..."}
- resumen: UNA frase corta (hasta 30 palabras) que INTERPRETA el resultado para quien lo lee, en palabras simples: qué significa en la práctica que su área opere así hoy (lo que le pasa, lo que le cuesta), con lo que respondió y lo que más la frena. En presente y con frases naturales («lo que más te frena es…»). No digas que es una estimación: la página lo agrega después de tu frase.
- No describas el resultado: el nivel ya se ve en grande encima. NO nombres ningún nivel de la escala ni uses esas palabras («deficiente», «inicial», «funcional», «eficiente», «óptimo») en ningún sentido.
- NO nombres la industria (ya se muestra al lado del título); úsala solo para elegir de qué hablar.`,
  base: "",
  produccion: "",
};
SALIDA.base = SALIDA.produccion = `Devuelves SOLO este JSON: {"dimensiones": [{"id": "...", "impacto": "...", "prioridad": "..."}]}, una entrada por cada dimensión de los datos.
- impacto: una o dos frases cortas (hasta 25 palabras), en palabras del cliente, de lo que le pasa en la práctica a su área por operar así, según lo que respondió (ejemplo de tono: «Si se va un vendedor, se lleva lo que sabe de cada negocio.»). No describas el nivel ni uses palabras de la escala.
- prioridad: una frase en imperativo (hasta 22 palabras) con lo primero que conviene trabajar para llegar al nivel siguiente, sacada de cómo es ese nivel y sus criterios. Si la dimensión no tiene nivel siguiente, null.
- Cada texto nombra, como mucho, el nivel de su propia dimensión o el siguiente: nunca el de otra.
- No uses los nombres de los niveles como palabras comunes («un proceso eficiente», «un CRM funcional»).`;

/** Las dimensiones preguntadas y ubicadas, con lo que respondió y lo que dice la escala de su nivel y del siguiente. */
function dimensionesParaLaIa(o: EntradaDeLaRedaccion): (DimensionParaLaIa & { capa: string })[] {
  const { escala, r } = o;
  const area = escala.areas.find((a) => a.id === r.areaId);
  const n = (l: Letra) => nombreDeNivel(escala, l);
  const out: (DimensionParaLaIa & { capa: string })[] = [];
  for (const d of r.dimensiones) {
    if (!d.preguntada || !d.nivel) continue;
    const dim = area?.dimensiones.find((x) => x.id === d.id);
    if (!dim) continue;
    const nivel = dim.niveles.find((x) => x.letra === d.nivel);
    const letraSig = LETRAS[LETRAS.indexOf(d.nivel) + 1];
    const sig = letraSig ? dim.niveles.find((x) => x.letra === letraSig) : undefined;
    const p = o.preguntas.find((x) => x.dimensionId === d.id);
    const resp = p ? o.respuestas[p.id] : undefined;
    out.push({
      capa: d.capa,
      id: d.id,
      nombre: d.nombre,
      mide: dim.descripcion,
      nivel: n(d.nivel),
      respondio: p && resp ? textoDeLaRespuesta(p, resp) : null,
      comoEsEsteNivel: nivel?.descripcion ?? "",
      siguiente: letraSig && sig ? { nivel: n(letraSig), comoEs: sig.descripcion, criterios: sig.criterios.slice(0, 4).map((c) => c.texto) } : null,
    });
  }
  return out;
}

/**
 * Los pedidos a Claude, en paralelo (redaccion-server.ts): el resumen y las dimensiones de cada capa por separado. Uno
 * solo con todo tardaba once segundos (medido el 29 oct: casi mil palabras de salida) y la persona espera su resultado;
 * así cada uno sale en pocos segundos, y si uno falla, los otros se quedan.
 */
export function pedidosDeLaRedaccion(o: EntradaDeLaRedaccion): { parte: ParteDeLaRedaccion; pedido: Anthropic.Messages.MessageCreateParamsNonStreaming }[] {
  const { r } = o;
  const dims = dimensionesParaLaIa(o);
  const comun = {
    area: r.areaNombre,
    industria: o.industria,
    nivelDelArea: r.nivelNombre,
    capas: r.capas.map((c) => ({ capa: c.nombre, nivel: c.nivelNombre ?? "no se midió" })),
    loQueMasFrena: r.recomendacion?.tipo === "trabajar" ? { dimension: r.recomendacion.dimensionNombre, llevarA: r.recomendacion.objetivoNombre } : null,
  };
  const pedido = (parte: ParteDeLaRedaccion, datos: unknown, max: number) => ({
    parte,
    pedido: {
      model: MODELO_DE_LA_REDACCION,
      max_tokens: max,
      system: `${REGLAS}\n\n${SALIDA[parte]}`,
      messages: [{ role: "user" as const, content: `Los datos del resultado:\n${JSON.stringify(datos, null, 1)}` }],
    },
  });
  const out = [
    pedido(
      "resumen",
      {
        ...comun,
        dimensionesNoPreguntadas: r.dimensiones.filter((d) => !d.preguntada).map((d) => d.nombre),
        dimensiones: dims.map((d) => ({ nombre: d.nombre, capa: d.capa, nivel: d.nivel, respondio: d.respondio })),
      },
      300,
    ),
  ];
  for (const capa of ["base", "produccion"] as const) {
    const deLaCapa = dims.filter((d) => d.capa === capa);
    if (deLaCapa.length) out.push(pedido(capa, { ...comun, dimensiones: deLaCapa }, 900));
  }
  return out;
}

const limpio = (x: unknown): string | null => {
  if (typeof x !== "string") return null;
  const t = x.replace(/\s+/g, " ").trim();
  return t || null;
};
const minus = (x: string) => x.toLocaleLowerCase("es");

/**
 * Cantidades y plazos en letras que la IA no puede haber sacado de los datos («revisa cuatro a seis métricas», visto el
 * 29 oct; «cada catorce días», «en dos semanas», «la mitad de tus vendedores», de la revisión). «Uno» y «dos» solos no:
 * son demasiado comunes («las dos capas»); sí cuando cuentan días, semanas, meses o años.
 */
const CANTIDADES = [
  "tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci\\p{L}+|veinte|veinti\\p{L}+",
  "treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|(?:dos|tres|cuatro|quinie|seis|sete|ocho|nove)cient\\p{L}*",
  "mil|mill[oó]n|millones|docenas?|mitad|doble|triple|por ciento|porcentaje",
  "(?:un|una|uno|dos|medio|media)\\s+(?:d[ií]as?|semanas?|mes|meses|años?|trimestres?|horas?)",
].join("|");
const NUMEROS_EN_LETRAS = new RegExp(`(^|[^\\p{L}])(?:${CANTIDADES})($|[^\\p{L}])`, "u");

/** ¿El texto pasa las reglas? Sin cifras ni cantidades en letras, sin niveles ajenos al resultado y dentro de su tope. */
export function textoValido(texto: string | null, o: { tope: number; permitidos: ReadonlySet<string>; todos: readonly string[] }): string | null {
  // `permitidos` y `todos` son NOMBRES de nivel («Inicial»); un nombre que no es de lo suyo descarta el texto entero.
  if (!texto || texto.length > o.tope) return null;
  if (/\d/.test(texto)) return null;
  const t = minus(texto);
  if (NUMEROS_EN_LETRAS.test(t)) return null;
  for (const nombre of o.todos) {
    if (o.permitidos.has(nombre)) continue;
    if (new RegExp(`(^|[^\\p{L}])${minus(nombre)}($|[^\\p{L}])`, "u").test(t)) return null;
  }
  return texto;
}

/**
 * Lo que la IA devolvió, ya revisado: cada texto que no pasa queda en null (y la página usa el de los datos). Null
 * entero si no hay nada usable.
 */
export function leerLaRedaccion(
  respuestas: readonly (Pick<Anthropic.Messages.Message, "content"> | null)[],
  o: { escala: Escala; r: ResultadoDelTest; parse: (texto: string) => Record<string, unknown>; ahora: Date; industria?: string | null },
): RedaccionDelResultado | null {
  // Cada respuesta trae su parte (el resumen o las dimensiones de una capa); una que falló llega en null.
  const partes = respuestas.flatMap((x) => (x ? [o.parse(x.content.map((b) => (b.type === "text" ? b.text : "")).join(""))] : []));
  const crudo = {
    resumen: partes.find((x) => typeof x.resumen === "string")?.resumen,
    dimensiones: partes.flatMap((x) => (Array.isArray(x.dimensiones) ? (x.dimensiones as unknown[]) : [])),
  };
  const todos = o.escala.niveles.map((x) => x.nombre);
  const nombres = (letras: Set<Letra>) => new Set([...letras].map((l) => nombreDeNivel(o.escala, l)));
  const nivelDe = new Map(o.r.dimensiones.flatMap((d) => (d.preguntada && d.nivel ? [[d.id, d.nivel] as const] : [])));
  const dimensiones: RedaccionDelResultado["dimensiones"] = {};
  for (const x of crudo.dimensiones) {
    if (!x || typeof x !== "object") continue;
    const d = x as Record<string, unknown>;
    const id = typeof d.id === "string" ? d.id : "";
    const nivel = nivelDe.get(id);
    if (!nivel || dimensiones[id]) continue;
    const regla = (tope: number) => ({ tope, permitidos: nombres(nivelesDeLaDimension(nivel)), todos });
    const impacto = textoValido(limpio(d.impacto), regla(TOPES.impacto));
    // En el nivel más alto no hay qué priorizar: la página dice que lo que sigue es sostenerlo.
    const prioridad = LETRAS[LETRAS.indexOf(nivel) + 1] ? textoValido(limpio(d.prioridad), regla(TOPES.prioridad)) : null;
    if (impacto || prioridad) dimensiones[id] = { impacto, prioridad };
  }
  // El resumen no nombra ningún nivel (ya está en grande encima), ni la industria (va en el chip), ni dice que es una
  // estimación (la página lo agrega: dicho dos veces, se leía repetido).
  const crudoDelResumen = limpio(crudo.resumen);
  const resumen =
    crudoDelResumen && (nombraLaIndustria(crudoDelResumen, o.industria ?? null) || /estimaci[oó]n|estimad[oa]/i.test(crudoDelResumen))
      ? null
      : textoValido(crudoDelResumen, { tope: TOPES.resumen, permitidos: new Set(), todos });
  if (!resumen && !Object.keys(dimensiones).length) return null;
  return { v: 2, modelo: MODELO_DE_LA_REDACCION, at: o.ahora.toISOString(), resumen, dimensiones };
}

// ── Sin IA ──────────────────────────────────────────────────────────────────────

const sinTildes = (x: string) => minus(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/**
 * Palabras de una industria que no la delatan: aparecen solas en cualquier texto del resultado («tu equipo», «Equipo y
 * Gobierno», «Tecnología y Automatización», «los servicios»).
 */
const PALABRAS_COMUNES = new Set(["servicios", "equipo", "especializado", "gobierno", "tecnologia", "institucion", "pesado"]);

/**
 * ¿El texto nombra la industria? Por cada palabra que la distingue («Banca y servicios financieros» → banca,
 * financieros) y no por el nombre entero: «para una empresa de banca» pasaba (revisión del 29 oct). Una palabra corta
 * (hasta seis letras) cuenta entera o en plural; una larga, por su raíz sin la última letra («alimentos» → «alimento»,
 * así «nadie alimenta el CRM» no cuenta). Con raíces más cortas, «a pesar de» contaba como «pesado» y «saludable» como
 * «salud». «Otra» no se nombra nunca.
 */
export function nombraLaIndustria(texto: string, industria: string | null): boolean {
  if (!industria || industria.trim() === OTRA_INDUSTRIA) return false;
  const distintivas = sinTildes(industria)
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !PALABRAS_COMUNES.has(w));
  const palabras = sinTildes(texto).split(/[^a-z]+/);
  return distintivas.some((d) =>
    palabras.some((w) => (d.length <= 6 ? w === d || w === `${d}s` || w === `${d}es` : w.startsWith(d.slice(0, -1)))),
  );
}

/** Lo que una capa en un nivel bajo (Deficiente o Inicial) significa en la práctica, sin nombrar el nivel. */
const esBaja = (l: Letra | null) => l !== null && LETRAS.indexOf(l) < LETRAS.indexOf("F");

/**
 * La interpretación armada con los datos, para cuando no hay la de la IA: qué significa operar así, por cómo están sus
 * dos capas, y qué es lo que más frena. Sin el nivel ni la industria, igual que la de la IA.
 */
export function interpretacionSinIa(r: Pick<ResultadoDelTest, "capas" | "recomendacion">, inicio = "Por lo que respondiste"): string {
  const base = r.capas.find((c) => c.clave === "base")?.nivel ?? null;
  const prod = r.capas.find((c) => c.clave === "produccion")?.nivel ?? null;
  const practica =
    base && prod
      ? esBaja(base) && esBaja(prod)
        ? "tu área depende más del esfuerzo de cada persona que de un sistema, y eso se nota en lo que entrega hacia afuera"
        : esBaja(base)
          ? "tu área entrega hacia afuera, pero se sostiene en el esfuerzo de cada persona más que en un sistema"
          : esBaja(prod)
            ? "tu área tiene su base montada, pero todavía no se traduce en lo que entrega hacia afuera"
            : "tu área tiene su base montada y entrega bien hacia afuera; lo que sigue es afinarla"
      : esBaja(base ?? prod)
        ? "tu área depende más del esfuerzo de cada persona que de un sistema"
        : "tu área tiene su base montada";
  const rec = r.recomendacion;
  return `${inicio}, ${practica}.${rec?.tipo === "trabajar" ? ` Lo que más la frena es «${rec.dimensionNombre}».` : ""}`;
}

/** Lo que el resumen dice SIEMPRE al final, con o sin IA: que es una estimación con pocas preguntas. */
export const fraseDeLaEstimacion = (r: Pick<ResultadoDelTest, "preguntadas">) =>
  `Es una estimación con solo ${r.preguntadas} preguntas: hay vacíos de información que conviene explorar para afinarla.`;

/**
 * El resumen sin IA: la interpretación de los datos y la frase de la estimación. Lo guarda el resultado (`sintesis`) y lo
 * usa la página para todo resultado sin `redaccion.resumen`.
 */
export function resumenSinIa(r: Pick<ResultadoDelTest, "areaNombre" | "nivel" | "capas" | "recomendacion" | "preguntadas">): string {
  if (!r.nivel) return `Con lo que respondiste todavía no alcanza para ubicar tu área de ${r.areaNombre}: en una sesión lo completamos juntos.`;
  return `${interpretacionSinIa(r)} ${fraseDeLaEstimacion(r)}`;
}

/** El resumen de la página: la interpretación de la IA (si pasó las reglas) con la frase de la estimación, o el de los datos. */
export function resumenDelResultado(r: ResultadoDelTest): string {
  // Solo la de la forma nueva: una de antes describía el resultado (el nivel, la industria) y se leía repetida.
  const ia = r.redaccion?.v === 2 ? r.redaccion.resumen : null;
  return ia && r.nivel ? `${ia} ${fraseDeLaEstimacion(r)}` : resumenSinIa(r);
}
