/**
 * lib/exploraciones/agente-pedido.ts — el PEDIDO al agente de la exploración: el prompt, la
 * herramienta y la lectura de lo que devuelve. PURO (sin base, sin red): lo prueba un test.
 *
 * ⛔ El agente NUNCA escribe: lo que devuelve son PROPUESTAS, y esto las filtra antes de que lleguen
 * al lienzo. Se cae todo lo que:
 *   - nombra una casilla, una dimensión, un criterio, un área o una fuente que no existen (las
 *     listas cerradas de la herramienta lo hacen casi imposible, y acá se verifica igual);
 *   - no tiene la forma de su casilla (el validador estricto de esquemas.ts);
 *   - es un NIVEL o un «lo tiene / no lo tiene» sin una frase que aparezca, literal, en su fuente.
 * Una cita que no aparece en su fuente se quita (la fuente queda): la frase es lo que el vendedor
 * lee para decidir, y una inventada lo engañaría.
 *
 * Solo la escala PUBLICADA, con la edición de la industria: nunca la de los documentos de
 * conocimiento (5.2), porque un agente con dos escalas las mezcla. Ningún id de la escala en los
 * textos que propone: los ids van en sus campos.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Letra } from "@/lib/escala/documento/tipos";
import { CASILLAS, ETIQUETA_DEL_ROL, ROLES_EN_LA_DECISION, TIPO_DE_CASILLA, VALORES_DE_APERTURA, type ClaveDeCasilla } from "./casillas";
import {
  ETIQUETA_DEL_MOTIVO,
  ESTADOS_DEL_CRITERIO,
  idDelItem,
  MOTIVOS_PARA_EXPLORAR,
  NIVELES,
  normalizarTexto,
  type ContenidoDeExploracion,
  type DestinoDePropuesta,
  type FuenteCitada,
  type FuenteDelNivel,
  type ItemPropuesto,
} from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { VALIDADOR_ESTRICTO } from "./esquemas";
import type { Fuente } from "./fuentes-tipos";

export const MODELO_DE_LA_EXPLORACION = "claude-sonnet-4-6";
export const NOMBRE_DE_LA_HERRAMIENTA = "proponer";

/** Las casillas de texto o de lista que el agente propone con un texto. */
const CASILLAS_DE_TEXTO: ClaveDeCasilla[] = CASILLAS.filter((c) => c.tipo === "texto" || c.tipo === "lista").map((c) => c.clave);

export interface ContextoDelPedido {
  modo: "preparar" | "leer";
  empresa: string;
  industria: string | null;
  escala: EscalaDelLienzo;
  /** Las áreas en juego. Vacío = todavía no se eligieron (el agente las puede proponer). */
  areas: string[];
  perfil: string | null;
  contenido: ContenidoDeExploracion;
  fuentes: Fuente[];
}

/** Las dimensiones que el agente puede nombrar: las de las áreas en juego (o todas, si no hay). */
function dimensionesEnJuego(ctx: ContextoDelPedido) {
  const areas = ctx.areas.length ? ctx.escala.areas.filter((a) => ctx.areas.includes(a.id)) : ctx.escala.areas;
  return areas.flatMap((a) => a.dimensiones.filter((d) => d.aplica).map((d) => ({ area: a, d })));
}

/** Los criterios de Funcional de las dimensiones que se eligieron para explorar. */
function criteriosEnJuego(ctx: ContextoDelPedido) {
  return dimensionesEnJuego(ctx)
    .filter(({ d }) => d.id in ctx.contenido.aExplorar)
    .flatMap(({ d }) => d.funcional.map((c) => ({ d, c })));
}

const FUENTES_SCHEMA = (ids: string[]) => ({
  type: "array",
  description: "Las fuentes que lo respaldan. `cita`: la frase EXACTA, copiada tal cual de esa fuente (máximo 300 caracteres).",
  items: {
    type: "object",
    properties: { id: { type: "string", enum: ids }, cita: { type: "string" } },
    required: ["id"],
  },
});

export function herramienta(ctx: ContextoDelPedido): Anthropic.Messages.Tool {
  const ids = ctx.fuentes.map((f) => f.id);
  const dims = dimensionesEnJuego(ctx).map(({ d }) => d.id);
  const crits = criteriosEnJuego(ctx).map(({ c }) => c.id);
  const fuentes = FUENTES_SCHEMA(ids.length ? ids : ["E0"]);
  const properties: Record<string, unknown> = {
    textos: {
      type: "array",
      description: "Casillas de texto o de lista: una entrada por idea. En las de lista cada entrada es UN ítem.",
      items: {
        type: "object",
        properties: { casilla: { type: "string", enum: CASILLAS_DE_TEXTO }, texto: { type: "string" }, fuentes },
        required: ["casilla", "texto", "fuentes"],
      },
    },
    metas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          que: { type: "string" },
          actual: { type: "string", description: "De cuánto parte, si lo dijo, con su número." },
          objetivo: { type: "string", description: "A cuánto quiere llegar, con su número, solo si lo dijo." },
          para: { type: "string", description: "Para cuándo, si lo dijo." },
          fuentes,
        },
        required: ["que", "fuentes"],
      },
    },
    retos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          texto: { type: "string" },
          ...(dims.length ? { dimensionId: { type: "string", enum: dims } } : {}),
          fuentes,
        },
        required: ["texto", "fuentes"],
      },
    },
    personas: {
      type: "array",
      description:
        "Solo personas del CLIENTE, nunca del equipo de Smarteam. El papel (firma, decide) solo si la fuente lo dice: el cargo no alcanza. Si solo se sabe el cargo, «influye».",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          cargo: { type: "string" },
          rol: { type: "string", enum: [...ROLES_EN_LA_DECISION] },
          nota: { type: "string" },
          fuentes,
        },
        required: ["nombre", "rol", "fuentes"],
      },
    },
    apertura: {
      type: "object",
      description: "Solo si hay evidencia clara de si quiere acompañamiento para crecer o solo una implementación.",
      properties: { valor: { type: "string", enum: VALORES_DE_APERTURA.filter((v) => v !== "no_se") }, porQue: { type: "string" }, fuentes },
      required: ["valor", "fuentes"],
    },
    areas: {
      type: "array",
      description: "Áreas que deberían estar en juego y todavía no están: la del test, las que nombra o paga sin usar.",
      items: {
        type: "object",
        properties: { areaId: { type: "string", enum: ctx.escala.areas.map((a) => a.id) }, razon: { type: "string" }, fuentes },
        required: ["areaId", "razon", "fuentes"],
      },
    },
  };
  // Al preparar todavía no se acordó nada: la reunión agendada ya está a la vista en el lienzo.
  if (ctx.modo === "leer") {
    properties.siguientePaso = {
      type: "object",
      description: "Solo si se acordó un siguiente paso concreto.",
      properties: {
        que: { type: "string" },
        fecha: { type: "string", description: "AAAA-MM-DD, solo si se dijo la fecha." },
        conQuien: { type: "string" },
        fuentes,
      },
      required: ["que", "fuentes"],
    };
  }
  if (dims.length) {
    properties.niveles = {
      type: "array",
      description: "El nivel por mejor ajuste, SOLO con una frase de la fuente que lo respalde. Ante la duda entre dos, el más bajo.",
      items: {
        type: "object",
        properties: {
          dimensionId: { type: "string", enum: dims },
          nivel: { type: "string", enum: [...NIVELES] },
          evidencia: { type: "string", description: "La frase del cliente que lo respalda, tal cual." },
          riesgo: { type: "boolean", description: "true si lo que dijo deja ver que un riesgo de la dimensión está activo." },
          razon: { type: "string" },
          fuentes,
        },
        required: ["dimensionId", "nivel", "evidencia", "fuentes"],
      },
    };
    properties.aExplorar = {
      type: "array",
      description: "Dimensiones en las que conviene profundizar (máximo 4 por área).",
      items: {
        type: "object",
        properties: {
          dimensionId: { type: "string", enum: dims },
          motivo: { type: "string", enum: [...MOTIVOS_PARA_EXPLORAR] },
          razon: { type: "string" },
        },
        required: ["dimensionId", "motivo", "razon"],
      },
    };
  }
  if (crits.length) {
    properties.falta = {
      type: "array",
      description: "Lo que pide Funcional en las dimensiones elegidas: si lo tiene o no lo tiene, con su frase. Si no quedó claro, no lo mandes.",
      items: {
        type: "object",
        properties: { criterioId: { type: "string", enum: crits }, estado: { type: "string", enum: ESTADOS_DEL_CRITERIO.filter((e) => e !== "no_se") }, fuentes },
        required: ["criterioId", "estado", "fuentes"],
      },
    };
  }
  return {
    name: NOMBRE_DE_LA_HERRAMIENTA,
    description: "Propone qué va en cada casilla del lienzo. Llámala una sola vez. Lo que no tenga respaldo en las fuentes, no lo propongas.",
    input_schema: { type: "object", properties, required: ["textos", "metas", "retos", "personas", "areas"] },
  };
}

function escalaComoTexto(ctx: ContextoDelPedido): string {
  const areas = ctx.areas.length ? ctx.escala.areas.filter((a) => ctx.areas.includes(a.id)) : ctx.escala.areas;
  const nombre = (l: Letra) => ctx.escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
  return areas
    .map((a) => {
      const dims = a.dimensiones
        .filter((d) => d.aplica)
        .map((d) => {
          const niveles = d.niveles.map((n) => `  - ${nombre(n.letra)}: ${n.descripcion}`).join("\n");
          const riesgos = d.riesgos.length ? `\n  Riesgos: ${d.riesgos.map((r) => r.texto).join(" | ")}` : "";
          const funcional =
            d.id in ctx.contenido.aExplorar
              ? `\n  Lo que pide Funcional (para «falta»):\n${d.funcional.map((c) => `    · ${c.id}: ${c.texto}`).join("\n")}`
              : "";
          return `### ${d.id} ${d.nombre}\n  Pregunta: ${d.pregunta}\n${niveles}${riesgos}${funcional}`;
        })
        .join("\n");
      return `## Área ${a.id}: ${a.nombre}\n${dims}`;
    })
    .join("\n\n");
}

function confirmadoComoTexto(ctx: ContextoDelPedido): string {
  const c = ctx.contenido;
  const lineas: string[] = [];
  for (const def of CASILLAS) {
    const v = c.casillas[def.clave];
    if (v === undefined) continue;
    lineas.push(`- ${def.etiqueta}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  const niveles = Object.entries(c.chequeo).map(([id, e]) => `${id}=${e.nivel}`);
  if (niveles.length) lineas.push(`- Niveles ya estimados: ${niveles.join(", ")}`);
  const explorar = Object.keys(c.aExplorar);
  if (explorar.length) lineas.push(`- Dimensiones elegidas para explorar: ${explorar.join(", ")}`);
  return lineas.length ? lineas.join("\n") : "(todavía nada)";
}

function sistema(ctx: ContextoDelPedido): string {
  const enfoque =
    ctx.modo === "preparar"
      ? `ESTA CORRIDA: PREPARAR la primera reunión. Lo que más sirve:
- contexto: qué hace la empresa, cómo llegó y lo que ya se habló (un párrafo corto).
- hubspotActual: qué HubSpot tiene (hubs, ediciones, usuarios, quién lo configuró, renovación), si las fuentes lo dicen.
- hipotesis: de 3 a 5, cada una «Creemos que… porque…», para confirmar o descartar en la reunión.
- areas: las que deberían estar en juego y no están (la del test, lo que menciona, lo que paga sin usar).
- aExplorar: las dimensiones donde hay indicios (debajo de Funcional según el test o lo que dijo), que tocan una meta o que dejan ver un riesgo. Máximo 4 por área.
- personas: quién es quién, si las fuentes lo dicen. El papel en la decisión no se deduce del cargo.
- NO propongas niveles a partir del test: el test ya entra solo como hipótesis. Solo propón un nivel si OTRA fuente lo respalda con una frase.`
      : `ESTA CORRIDA: LEER LA REUNIÓN que acaba de pasar. Lo que más sirve, con la frase del cliente:
- niveles: el nivel de cada dimensión que la conversación deja ver, por mejor ajuste contra las descripciones.
- metas (en cifras si las dijo), planes, retos (con su dimensión), consecuencias de no actuar, implicaciones de lograrlo, presupuesto.
- tiempos: los plazos del CLIENTE (para cuándo necesita el resultado, cuándo decide, cuándo renueva). La próxima reunión no va acá: es el siguientePaso.
- personas: quién firma, quién decide, quién influye y a quién más le afecta.
- portal: lo que se vio del portal, si se miró.
- falta: de lo que pide Funcional en las dimensiones elegidas, qué tiene y qué no.
- noExplorado: lo que el cliente dijo y nadie siguió (qué dijo y qué preguntar la próxima vez). Es de lo más valioso: búscalo.
- producto: qué se mostró y para qué reto, si se mostró.
- apertura y siguientePaso, si quedaron claros.`;
  return `Eres el analista de ventas de Smarteam, una consultora que implementa HubSpot. Ayudas a un vendedor a explorar a un prospecto para cerrar la PRIMERA venta: llevar cada área en juego a Funcional en la Escala de Rendimiento de Smarteam. No escribes en el lienzo: PROPONES, y el vendedor usa o descarta cada cosa.

${enfoque}

Reglas estrictas:
- Solo lo que las fuentes dicen de forma explícita. No deduzcas, no completes, no inventes cifras, nombres ni fechas. Ante la duda, no lo propongas.
- Cada propuesta cita sus fuentes por id, y la cita es la frase EXACTA copiada de esa fuente. Una cita que no esté literal en su fuente se descarta.
- Los niveles se eligen por mejor ajuste contra las descripciones de la escala de abajo. Si hay duda entre dos niveles, el más bajo. «No sé» cuenta como el más bajo.
- No vuelvas a proponer lo que ya está confirmado (abajo).
- El equipo de Smarteam (consultores, vendedores) no es parte del cliente: nunca va en personas.
- Textos cortos, en español neutro, en tercera persona sobre el cliente. Nunca escribas los identificadores de la escala dentro de un texto: van en sus campos.
- Si una lista no tiene nada que proponer, mándala vacía. Es la respuesta correcta muchas veces.
- Estas casillas las ve el CLIENTE en la propuesta: ${CASILLAS.filter((c) => c.alCliente).map((c) => c.clave).join(", ")}. En ellas nunca pongas montos de dinero, presupuesto, opiniones sobre personas ni nada interno de Smarteam: el dinero va solo en presupuesto; las personas, en autoridad.

Las casillas: ${CASILLAS.map((c) => `${c.clave} («${c.etiqueta}»: ${c.ayuda})`).join("; ")}.
Los motivos para explorar: ${MOTIVOS_PARA_EXPLORAR.map((m) => `${m} (${ETIQUETA_DEL_MOTIVO[m]})`).join(", ")}. Los papeles en la decisión: ${ROLES_EN_LA_DECISION.map((r) => `${r} (${ETIQUETA_DEL_ROL[r]})`).join(", ")}.`;
}

/** El pedido a Claude, armado sin tocar la base. */
export function pedidoDeLaExploracion(ctx: ContextoDelPedido): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const tool = herramienta(ctx);
  const cuerpo =
    `Empresa: ${ctx.empresa}${ctx.industria ? ` · Industria en HubSpot: ${ctx.industria}` : ""}${ctx.perfil ? ` · Perfil: ${ctx.perfil}` : ""}\n` +
    `Edición de la escala: ${ctx.escala.edicion?.nombre ?? "escala general"}\n\n` +
    `=== LO QUE YA ESTÁ CONFIRMADO ===\n${confirmadoComoTexto(ctx)}\n\n` +
    `=== LA ESCALA (las áreas en juego) ===\n${escalaComoTexto(ctx)}\n\n` +
    ctx.fuentes.map((f) => `=== FUENTE ${f.id}: ${f.etiqueta} ===\n${f.texto}`).join("\n\n");
  return {
    model: MODELO_DE_LA_EXPLORACION,
    max_tokens: 8000,
    system: sistema(ctx),
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: cuerpo }],
  };
}

// ── Leer lo que devolvió ──────────────────────────────────────────────────────

/** Comparación de citas: sin mayúsculas, tildes, comillas ni signos; solo letras, números y espacios. */
export function paraCitar(s: string): string {
  return normalizarTexto(s)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿La cita aparece en la fuente? Corta (menos de 12 letras) no prueba nada: no cuenta. */
export function citaVerificable(cita: string, fuente: string): boolean {
  const c = paraCitar(cita);
  return c.length >= 12 && paraCitar(fuente).includes(c);
}

export interface Lectura {
  items: ItemPropuesto[];
  /** Cuántas propuestas se cayeron (forma, ids, o sin una frase verificable donde hacía falta). */
  descartadas: number;
}

type Crudo = Record<string, unknown>;
const esObjeto = (x: unknown): x is Crudo => typeof x === "object" && x !== null && !Array.isArray(x);
const lista = (x: unknown): Crudo[] => (Array.isArray(x) ? x.filter(esObjeto) : []);
const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim() : undefined);

/** De qué tipo de fuente sale un nivel, por el id de su primera fuente con cita. */
function fuenteDelNivel(ids: string[]): FuenteDelNivel {
  const primero = ids[0] ?? "";
  if (primero.startsWith("T")) return "test";
  if (primero.startsWith("N")) return "vendedor";
  return "reunion";
}

export function leerLaRespuesta(respuesta: Anthropic.Messages.Message, ctx: ContextoDelPedido, corridaId: string, ahora = new Date()): Lectura {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === NOMBRE_DE_LA_HERRAMIENTA);
  const input = bloque && bloque.type === "tool_use" && esObjeto(bloque.input) ? bloque.input : {};
  const porId = new Map(ctx.fuentes.map((f) => [f.id, f]));
  const dims = new Set(dimensionesEnJuego(ctx).map(({ d }) => d.id));
  const crits = new Set(criteriosEnJuego(ctx).map(({ c }) => c.id));
  const areas = new Set(ctx.escala.areas.map((a) => a.id));
  const items: ItemPropuesto[] = [];
  let descartadas = 0;

  /** Las fuentes válidas, con la cita solo si aparece en su fuente. */
  const citar = (x: unknown): FuenteCitada[] =>
    lista(x)
      .map((f) => {
        const id = str(f.id);
        const fuente = id ? porId.get(id) : undefined;
        if (!id || !fuente) return null;
        const cita = str(f.cita)?.slice(0, 300);
        return { id, etiqueta: fuente.etiqueta, ...(cita && citaVerificable(cita, fuente.texto) ? { cita } : {}) };
      })
      .filter((f): f is FuenteCitada => f !== null);

  const agregar = (destino: DestinoDePropuesta, valor: unknown, fuentes: FuenteCitada[], opciones: { razon?: string; exigeCita?: boolean; exigeFuente?: boolean } = {}) => {
    const limpio = VALIDADOR_ESTRICTO.valorDelDestino(destino, valor);
    const conCita = fuentes.filter((f) => f.cita);
    if (limpio === null || (opciones.exigeCita && conCita.length === 0) || (opciones.exigeFuente !== false && fuentes.length === 0)) {
      descartadas++;
      return;
    }
    items.push({
      id: idDelItem(destino, limpio),
      destino,
      valor: limpio,
      ...(opciones.razon ? { razon: opciones.razon.slice(0, 300) } : {}),
      fuentes: fuentes.slice(0, 6),
      corridaId,
      en: ahora.toISOString(),
    });
  };

  /* Una casilla de UN texto (contexto, su HubSpot hoy, presupuesto, producto) que llega partida en
     varias entradas se junta en una: cada entrada reemplazaría a la anterior y solo quedaría la última. */
  const deUnTexto = new Map<ClaveDeCasilla, { textos: string[]; fuentes: FuenteCitada[] }>();
  for (const t of lista(input.textos)) {
    const clave = str(t.casilla) as ClaveDeCasilla | undefined;
    if (!clave || !CASILLAS_DE_TEXTO.includes(clave)) {
      descartadas++;
      continue;
    }
    const texto = str(t.texto);
    if (TIPO_DE_CASILLA[clave] === "texto" && texto) {
      const junto = deUnTexto.get(clave) ?? { textos: [], fuentes: [] };
      junto.textos.push(texto);
      junto.fuentes.push(...citar(t.fuentes));
      deUnTexto.set(clave, junto);
      continue;
    }
    agregar({ tipo: "casilla", clave }, texto, citar(t.fuentes));
  }
  for (const [clave, { textos, fuentes }] of deUnTexto) {
    const unicas = fuentes.filter((f, i) => fuentes.findIndex((g) => g.id === f.id && g.cita === f.cita) === i);
    agregar({ tipo: "casilla", clave }, textos.join(" ").slice(0, 4000), unicas);
  }
  for (const m of lista(input.metas)) {
    agregar({ tipo: "casilla", clave: "metas" }, { que: str(m.que), actual: str(m.actual), objetivo: str(m.objetivo), para: str(m.para) }, citar(m.fuentes));
  }
  for (const r of lista(input.retos)) {
    const dimensionId = str(r.dimensionId);
    agregar({ tipo: "casilla", clave: "retos" }, { texto: str(r.texto), ...(dimensionId && dims.has(dimensionId) ? { dimensionId } : {}) }, citar(r.fuentes));
  }
  for (const p of lista(input.personas)) {
    agregar({ tipo: "casilla", clave: "autoridad" }, { nombre: str(p.nombre), cargo: str(p.cargo), rol: str(p.rol), nota: str(p.nota) }, citar(p.fuentes));
  }
  if (ctx.modo === "leer" && esObjeto(input.siguientePaso)) {
    const s = input.siguientePaso;
    const fecha = str(s.fecha);
    agregar(
      { tipo: "casilla", clave: "siguientePaso" },
      { que: str(s.que), ...(fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? { fecha } : {}), conQuien: str(s.conQuien) },
      citar(s.fuentes),
    );
  }
  // «No se sabe» es lo que ya muestra la casilla vacía: proponerlo no aporta nada.
  if (esObjeto(input.apertura) && input.apertura.valor !== "no_se") {
    const a = input.apertura;
    agregar({ tipo: "casilla", clave: "apertura" }, { valor: str(a.valor), porQue: str(a.porQue) }, citar(a.fuentes));
  }
  for (const a of lista(input.areas)) {
    const areaId = str(a.areaId);
    if (!areaId || !areas.has(areaId) || ctx.areas.includes(areaId)) {
      descartadas++;
      continue;
    }
    agregar({ tipo: "area", areaId }, { razon: str(a.razon) }, citar(a.fuentes), { razon: str(a.razon) });
  }
  for (const n of lista(input.niveles)) {
    const dimensionId = str(n.dimensionId);
    if (!dimensionId || !dims.has(dimensionId)) {
      descartadas++;
      continue;
    }
    const fuentes = citar(n.fuentes);
    const evidencia = fuentes.find((f) => f.cita)?.cita;
    agregar(
      { tipo: "nivel", dimensionId },
      {
        nivel: str(n.nivel),
        fuente: fuenteDelNivel(fuentes.filter((f) => f.cita).map((f) => f.id)),
        ...(evidencia ? { evidencia } : {}),
        ...(n.riesgo === true ? { riesgo: true } : {}),
      },
      fuentes,
      { razon: str(n.razon), exigeCita: true },
    );
  }
  for (const x of lista(input.aExplorar)) {
    const dimensionId = str(x.dimensionId);
    if (!dimensionId || !dims.has(dimensionId)) {
      descartadas++;
      continue;
    }
    agregar({ tipo: "aExplorar", dimensionId }, { motivo: str(x.motivo), razon: str(x.razon) }, [], { razon: str(x.razon), exigeFuente: false });
  }
  for (const f of lista(input.falta)) {
    const criterioId = str(f.criterioId);
    if (!criterioId || !crits.has(criterioId)) {
      descartadas++;
      continue;
    }
    if (f.estado === "no_se") continue; // el criterio sin estado ya se lee «no se sabe»
    const fuentes = citar(f.fuentes);
    agregar({ tipo: "falta", criterioId }, { estado: str(f.estado), ...(fuentes.find((y) => y.cita) ? { cita: fuentes.find((y) => y.cita)!.cita } : {}) }, fuentes, { exigeCita: true });
  }
  return { items, descartadas };
}

/**
 * Lo que entra SOLO, sin IA: el resultado del test como hipótesis. El área del test (si no está en
 * juego) y el nivel que marcó en cada dimensión, con la opción que eligió como frase. Es escala
 * anterior: la razón lo dice, y el vendedor lo valida en la primera reunión.
 */
export function propuestasDelTest(
  tests: { contacto: string; resultado: import("./test-de-marketing").ResultadoDelTest }[],
  ctx: Pick<ContextoDelPedido, "escala" | "areas" | "fuentes" | "contenido">,
  corridaId: string,
  ahora = new Date(),
): ItemPropuesto[] {
  const items: ItemPropuesto[] = [];
  tests.forEach((t, i) => {
    const fuente = ctx.fuentes.find((f) => f.id === `T${i + 1}`);
    if (!fuente) return;
    const area = ctx.escala.areas.find((a) => a.id === t.resultado.areaId);
    if (!area) return;
    const base = { corridaId, en: ahora.toISOString() };
    if (!ctx.areas.includes(area.id)) {
      const destino: DestinoDePropuesta = { tipo: "area", areaId: area.id };
      const valor = { razon: `Hizo el test de ${area.nombre}` };
      items.push({ id: idDelItem(destino, valor), destino, valor, razon: valor.razon, fuentes: [{ id: fuente.id, etiqueta: fuente.etiqueta }], ...base });
    }
    for (const r of t.resultado.respuestas) {
      const d = area.dimensiones.find((x) => x.id === r.dimensionId);
      if (!d?.aplica || ctx.contenido.chequeo[r.dimensionId]) continue;
      const destino: DestinoDePropuesta = { tipo: "nivel", dimensionId: r.dimensionId };
      const valor = { nivel: r.nivel, fuente: "test" as const, ...(r.respuesta ? { evidencia: r.respuesta.slice(0, 600) } : {}) };
      items.push({
        id: idDelItem(destino, valor),
        destino,
        valor,
        razon: "Lo marcó en el test, con la escala anterior: valídalo en la primera reunión.",
        fuentes: [{ id: fuente.id, etiqueta: fuente.etiqueta, ...(r.respuesta ? { cita: r.respuesta.slice(0, 300) } : {}) }],
        ...base,
      });
    }
  });
  return items;
}

// ── Sugerir los casos de uso del catálogo ─────────────────────────────────────

export const NOMBRE_DE_LA_HERRAMIENTA_DE_CASOS = "proponer_casos";

/** Hasta cuántos casos por área: los que caben en una primera venta. */
export const MAX_CASOS_POR_AREA = 4;

export interface CasoParaElPedido {
  id: string;
  titulo: string;
  descripcion: string;
  tags: string[];
}

export interface ContextoDeCasos {
  empresa: string;
  /** Las áreas en juego, con su nombre. */
  areas: { id: string; nombre: string }[];
  /** La exploración como la ve la propuesta (bloqueParaLaPropuesta): metas, retos, niveles, lo que falta. */
  exploracion: string;
  catalogo: CasoParaElPedido[];
}

export function pedidoDeCasos(ctx: ContextoDeCasos): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const tool: Anthropic.Messages.Tool = {
    name: NOMBRE_DE_LA_HERRAMIENTA_DE_CASOS,
    description: "Propone, por área, los casos de uso del catálogo para la propuesta. Llámala una sola vez.",
    input_schema: {
      type: "object",
      properties: {
        casos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              useCaseId: { type: "string", enum: ctx.catalogo.map((c) => c.id) },
              areaId: { type: "string", enum: ctx.areas.map((a) => a.id) },
              razon: { type: "string", description: "Una frase: qué de lo que le falta (o de su meta) cubre este caso de uso." },
            },
            required: ["useCaseId", "areaId", "razon"],
          },
        },
      },
      required: ["casos"],
    },
  };
  const sistema = `Eres el analista de ventas de Smarteam, una consultora que implementa HubSpot. Ayudas a un vendedor a armar la PRIMERA propuesta de un prospecto: llevar cada área en juego a Funcional en la Escala de Rendimiento, cubriendo lo que le falta y sus metas.

Elige del catálogo los casos de uso que lo logran, por área:
- Empieza por lo que va primero y por lo que le falta para Funcional; después, lo que toca una meta con cifras.
- Como máximo ${MAX_CASOS_POR_AREA} por área. Menos es mejor si alcanza: una primera venta que el cliente puede sostener.
- La razón, en una frase concreta, nombra qué de lo que le falta (o de su meta) cubre. Sin frases de venta.
- Si ningún caso del catálogo cubre algo, no lo fuerces: no lo propongas.
- No propongas los que ya están elegidos. Nunca inventes un caso de uso: solo los del catálogo, por su id.`;
  const cuerpo =
    `Empresa: ${ctx.empresa}\nÁreas en juego: ${ctx.areas.map((a) => `${a.id} (${a.nombre})`).join(", ")}\n\n` +
    `=== LA EXPLORACIÓN ===\n${ctx.exploracion}\n\n` +
    `=== EL CATÁLOGO DE CASOS DE USO ===\n` +
    ctx.catalogo.map((c) => `- ${c.id} · ${c.titulo}${c.tags.length ? ` [${c.tags.join(", ")}]` : ""}\n  ${c.descripcion.slice(0, 400)}`).join("\n");
  return {
    model: MODELO_DE_LA_EXPLORACION,
    max_tokens: 3000,
    system: sistema,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: cuerpo }],
  };
}

/** Lo que devolvió, filtrado: solo casos del catálogo, en áreas en juego, con razón y con el tope por área. */
export function leerLosCasos(respuesta: Anthropic.Messages.Message, ctx: ContextoDeCasos, corridaId: string, ahora = new Date()): Lectura {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === NOMBRE_DE_LA_HERRAMIENTA_DE_CASOS);
  const input = bloque && bloque.type === "tool_use" && esObjeto(bloque.input) ? bloque.input : {};
  const porId = new Map(ctx.catalogo.map((c) => [c.id, c]));
  const areas = new Set(ctx.areas.map((a) => a.id));
  const porArea = new Map<string, number>();
  const vistos = new Set<string>();
  const items: ItemPropuesto[] = [];
  let descartadas = 0;
  for (const x of lista(input.casos)) {
    const caso = porId.get(str(x.useCaseId) ?? "");
    const areaId = str(x.areaId);
    const razon = str(x.razon);
    if (!caso || !areaId || !areas.has(areaId) || !razon || vistos.has(caso.id) || (porArea.get(areaId) ?? 0) >= MAX_CASOS_POR_AREA) {
      descartadas++;
      continue;
    }
    const destino: DestinoDePropuesta = { tipo: "casoDeUso", useCaseId: caso.id };
    const valor = VALIDADOR_ESTRICTO.valorDelDestino(destino, { titulo: caso.titulo.slice(0, 200), areaId, razon: razon.slice(0, 400) });
    if (valor === null) {
      descartadas++;
      continue;
    }
    vistos.add(caso.id);
    porArea.set(areaId, (porArea.get(areaId) ?? 0) + 1);
    items.push({ id: idDelItem(destino, valor), destino, valor, razon: razon.slice(0, 300), fuentes: [], corridaId, en: ahora.toISOString() });
  }
  return { items, descartadas };
}
