/**
 * lib/cuestionario/estrategia.ts — el cuestionario de ESTRATEGIA (decisión de Elías, 2026-10-11). PURO.
 *
 * Le pregunta al cliente hacia dónde va su negocio: el desafío central, los resultados que necesita (en cifras y para
 * cuándo), lo que le impide llegar, qué pasa si no lo resuelve, cómo mide hoy el éxito, sus prioridades del año y lo que
 * ya intentó. Va al cliente como los otros dos (una persona, su enlace, publicar, cerrar) y Nexus lo prellena con lo que
 * ya sabe de la estrategia de la cuenta (lib/cuestionario/prellenar.ts), con las mismas reglas de frontera que el táctico.
 *
 * ⛔ UNA RESPUESTA PRELLENADA QUE NADIE CONFIRMÓ ES UNA SUPOSICIÓN DE NEXUS, NO UN DATO DEL CLIENTE. Por eso:
 *   · el bloque que leen los agentes (`bloqueDeEstrategia`) no la muestra como respuesta: la pone en lo pendiente.
 *     Ese bloque es la fuente Q0 de la exploración del proyecto, que cuenta como «lo dijo el cliente»;
 *   · a la ficha solo va lo que la persona escribió o confirmó (`propuestaDeEstrategiaParaLaFicha`).
 *
 * Los ids de pregunta son ESTABLES (`est-*`): la respuesta se guarda por id y la ficha lee por id. Se agregan, no se
 * renombran. A qué tarjeta de la exploración apunta cada pregunta vive en `ref`, que el cliente nunca ve
 * (`preguntaParaElCliente` lo quita).
 */
import { campoDeFicha, valorVigente, type ClaveDeFicha, type FichaGuardada } from "@/lib/clients/ficha";
import type { PestanaData, Pregunta, Respuesta, Respuestas } from "./tipos";

/** A qué apunta cada pregunta del lado nuestro. Las tres primeras son las tarjetas de la exploración del proyecto. */
export type RefDeEstrategia = "retos" | "metas" | "obstaculos" | "consecuencias" | "medicion" | "prioridades";

/** El rótulo de cada `ref` en el bloque que leen los agentes: así la exploración sabe a qué tarjeta va cada respuesta. */
export const ROTULO_DEL_REF: Record<RefDeEstrategia, string> = {
  retos: "Retos",
  metas: "Resultados que persigue",
  obstaculos: "Obstáculos",
  consecuencias: "Qué está en juego",
  medicion: "Cómo mide hoy el éxito",
  prioridades: "Prioridades del año",
};

export const TOPE_DE_PREGUNTAS_DE_ESTRATEGIA = 8;

export const KEY_DE_ESTRATEGIA = "estrategia";

const PREGUNTAS: readonly (Omit<Pregunta, "momento"> & { ref: RefDeEstrategia })[] = [
  {
    id: "est-desafio",
    ref: "retos",
    categoria: "El desafío central",
    texto: "¿Cuál es el desafío más importante que tiene hoy tu negocio?",
    ejemplo: "Crecer en ventas sin tener que contratar más vendedores.",
  },
  {
    id: "est-resultados",
    ref: "metas",
    categoria: "Los resultados que necesitan",
    texto: "¿Qué resultados necesitan lograr y para cuándo? Si puedes, dilo en cifras.",
    ejemplo: "Pasar de 40 a 60 ventas al mes antes de junio de 2027.",
  },
  {
    id: "est-obstaculos",
    ref: "obstaculos",
    categoria: "Lo que les impide llegar",
    texto: "¿Qué les impide hoy llegar a esos resultados?",
    ejemplo: "Los prospectos se enfrían porque nadie les da seguimiento a tiempo.",
  },
  {
    id: "est-intentos",
    ref: "obstaculos",
    categoria: "Lo que ya intentaron",
    texto: "¿Qué han intentado antes para resolverlo y qué pasó?",
    ejemplo: "Contratamos dos vendedores más, pero el seguimiento siguió igual.",
    opcional: true,
  },
  {
    id: "est-si-no",
    ref: "consecuencias",
    categoria: "Qué está en juego",
    texto: "¿Qué pasa si no lo resuelven este año?",
    ejemplo: "Perdemos la temporada alta y tenemos que recortar el equipo.",
  },
  {
    id: "est-medicion",
    ref: "medicion",
    categoria: "Cómo miden el éxito",
    texto: "¿Cómo saben hoy si al negocio le va bien? ¿Qué números revisan y cada cuánto?",
    ejemplo: "Ventas cerradas y margen por producto; los revisamos cada lunes.",
  },
  {
    id: "est-prioridades",
    ref: "prioridades",
    categoria: "Las prioridades del año",
    texto: "¿Cuáles son las tres prioridades del negocio para este año?",
    ejemplo: "Abrir Guatemala, lanzar la línea premium y bajar la rotación del equipo.",
  },
];

export const IDS_DE_ESTRATEGIA: ReadonlySet<string> = new Set(PREGUNTAS.map((p) => p.id));

/**
 * ¿Esta edición entra en un cuestionario de estrategia? Sus preguntas se editan, pero NO se le agregan pestañas: el
 * bloque que leen los agentes toma todas sus pestañas como estrategia del cliente, y una pestaña de la plantilla táctica
 * (o de etapas) mezclaría lo táctico ahí y perdería las etapas en silencio. Devuelve el porqué, o null si entra.
 */
export function porQueNoEntraEnEstrategia(ops: readonly { op: string }[]): string | null {
  return ops.some((o) => o.op === "agregar_pestana")
    ? "El cuestionario de estrategia tiene una sola pestaña: puedes editar sus preguntas, pero no agregarle pestañas."
    : null;
}

/** La pestaña del cuestionario de estrategia, lista para crear. Una sola: son pocas preguntas. */
export function pestanasDeEstrategia(): PestanaData[] {
  return [
    {
      key: KEY_DE_ESTRATEGIA,
      titulo: "Estrategia del negocio",
      descripcion:
        "Hacia dónde va tu negocio y qué lo frena. Nos ayuda a enfocar el proyecto en lo que más te importa.",
      tipo: "normal",
      preguntas: PREGUNTAS.map((p) => ({ ...p, momento: "previo" as const })),
    },
  ];
}

function esRef(v: unknown): v is RefDeEstrategia {
  return typeof v === "string" && v in ROTULO_DEL_REF;
}

/**
 * ¿Esta respuesta la dio el CLIENTE? Sí si la escribió la persona, o si confirmó lo que prellenó Nexus. Lo prellenado
 * sin confirmar no; lo que cargó el CSE tampoco (lo escribió el equipo, no la persona).
 */
export function esRespuestaDelCliente(r: Respuesta | undefined): boolean {
  if (!r || !r.valor.trim()) return false;
  if (r.origen === "cliente") return true;
  return r.origen === "prellenado" && r.confirmada === true;
}

/** Una pestaña de estrategia como la recibe el bloque: de quién es, si se envió, sus preguntas y respuestas. */
export interface EstrategiaDeUnaPersona {
  quien: string;
  enviada: boolean;
  preguntas: Pregunta[];
  respuestas: Respuestas;
  /** Lo demás de la pestaña (el contexto adicional, las correcciones pedidas, los adjuntos), ya escrito. */
  extras?: string[];
}

/**
 * Lo que contestó cada persona en el cuestionario de estrategia, para el bloque que leen los agentes (la exploración del
 * proyecto como Q0, el diagnóstico para el desafío central y los objetivos, la ficha). Cada respuesta va con el rótulo de
 * a qué apunta. Lo prellenado sin confirmar NO va como respuesta: va a `pendientes`, dicho así.
 */
export function bloqueDeEstrategia(personas: readonly EstrategiaDeUnaPersona[]): { bloques: string[]; pendientes: string[] } {
  const bloques: string[] = [];
  const pendientes: string[] = [];
  for (const p of personas) {
    const lineas: string[] = [];
    for (const q of p.preguntas) {
      const r = p.respuestas[q.id];
      const rotulo = esRef(q.ref) ? ROTULO_DEL_REF[q.ref] : q.categoria || "Estrategia";
      if (esRespuestaDelCliente(r)) {
        lineas.push(`- [${rotulo}] ${q.texto}\n  → ${r!.valor.trim()}${r!.origen === "prellenado" ? " (Nexus lo prellenó y la persona lo CONFIRMÓ)" : ""}${r!.enSesion ? " [quiere ampliarlo en sesión]" : ""}`);
      } else if (r && r.origen === "cse" && r.valor.trim()) {
        lineas.push(`- [${rotulo}] ${q.texto}\n  → ${r.valor.trim()} (cargado por el CSE: no lo escribió la persona)`);
      } else if (r && r.origen === "prellenado" && r.valor.trim()) {
        pendientes.push(`[${p.quien} · Estrategia] ${q.texto} (Nexus la prellenó y la persona no la confirmó: es una suposición, no un dato del cliente)`);
      } else if (!q.opcional) {
        pendientes.push(`[${p.quien} · Estrategia] ${q.texto}${r?.enSesion ? " (pidió verlo en sesión)" : ""}`);
      }
    }
    lineas.push(...(p.extras ?? []));
    if (lineas.length) bloques.push(`## Estrategia — contestó ${p.quien} · ${p.enviada ? "ENVIADA" : "en borrador"}\n${lineas.join("\n")}`);
  }
  return { bloques, pendientes };
}

/** El encabezado del bloque de estrategia: dice a dónde va cada cosa. */
export const ENCABEZADO_DE_ESTRATEGIA =
  "=== ESTRATEGIA — lo que cada persona del cliente contestó o confirmó sobre su negocio ===\n" +
  "Es la voz del cliente para sus retos, los resultados que persigue y sus obstáculos (las tarjetas de estrategia de la " +
  "exploración), y para el desafío central y los objetivos del diagnóstico. Lo que Nexus prellenó y nadie confirmó no está acá.";

// ── A la ficha ────────────────────────────────────────────────────────────────────────────────

/** El `origen` de esta puerta en la ficha (lib/clients/ficha.ts › ORIGENES_DE_LA_FICHA). */
export const ORIGEN_DEL_CUESTIONARIO = "Cuestionario";

/** La fuente de lo propuesto, como la ve el CSE. Empieza con «Cuestionario ·»: así la reconoce la ficha. */
export function fuenteDelCuestionario(quien: string): string {
  return `Cuestionario · Estrategia · ${quien.trim() || "sin persona"}`;
}

/**
 * Qué pregunta le suma a «Retos estratégicos», y con qué prefijo. Los RESULTADOS (`est-resultados`) no van: la ficha no
 * los acepta desde afuera (salen de los resultados confirmados de cada proyecto), ni como campo propio ni escondidos acá
 * con otro rótulo. Se quedan en la exploración y el diagnóstico.
 */
const A_LOS_RETOS: Record<string, string> = {
  "est-desafio": "",
  "est-obstaculos": "Obstáculo: ",
  "est-prioridades": "Prioridad del año: ",
};

const CAMPO: ClaveDeFicha = "retosEstrategicos";

/** Para comparar si una línea ya está dicha: sin tildes, sin viñetas, en minúscula y con un espacio. */
function normal(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * LO QUE VA A LA PROPUESTA DE LA FICHA desde el cuestionario de estrategia: solo «Retos estratégicos», con lo que la
 * persona escribió o confirmó del desafío, los obstáculos y las prioridades (los resultados no: ver `A_LOS_RETOS`). Lo
 * prellenado sin confirmar no va. Suma a lo que la ficha ya tiene (lo propuesto, o lo confirmado) sin repetir lo que ya
 * dice. Lo listo para `fusionarPropuesta`; vacío si no hay nada nuevo.
 */
export function propuestaDeEstrategiaParaLaFicha(
  ficha: FichaGuardada,
  respuestas: Respuestas,
  quien: string,
): { clave: ClaveDeFicha; valor: string; fuentes: string[] }[] {
  if (campoDeFicha(CAMPO).deLosResultados) return [];
  const lineas: string[] = [];
  for (const [id, prefijo] of Object.entries(A_LOS_RETOS)) {
    const r = respuestas[id];
    if (!esRespuestaDelCliente(r)) continue;
    const t = r!.valor.replace(/\s+/g, " ").trim();
    if (t) lineas.push(`- ${prefijo}${t}`);
  }
  if (!lineas.length) return [];
  const vigente = valorVigente(ficha, CAMPO).trim();
  const dicho = normal(vigente);
  const nuevas: string[] = [];
  for (const l of lineas) {
    const n = normal(l);
    if (!n || dicho.includes(n) || nuevas.some((x) => normal(x) === n)) continue;
    nuevas.push(l);
  }
  if (!nuevas.length) return [];
  return [{ clave: CAMPO, valor: [vigente, ...nuevas].filter(Boolean).join("\n"), fuentes: [fuenteDelCuestionario(quien)] }];
}
