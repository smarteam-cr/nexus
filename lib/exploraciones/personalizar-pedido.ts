/**
 * lib/exploraciones/personalizar-pedido.ts — el pedido al agente que PERSONALIZA un caso de uso aceptado, y la lectura
 * de «Revisar». PURO (sin base ni red): lo usan agente-personalizar.ts, el simulacro y las pruebas.
 *
 * Pedido de Elías (2026-11-08, lib/casos-de-uso/personalizar.ts): «tiene que ser un agente que revise el contexto, las
 * actividades y los casos de uso, y personalice esto». Una llamada por caso aceptado. Lee:
 *   - el caso como se aceptó (título, descripción, por qué) y su ficha del catálogo con sus actividades por defecto;
 *   - la biblioteca de actividades (las únicas que puede usar);
 *   - lo que se sabe de la empresa: lo que puede ver el cliente (`exploracion`), lo interno de la preventa (`interno`) y
 *     las minutas de sus reuniones, que llegan del chokepoint de sesiones (invariante 1: nunca de otro cliente).
 * Devuelve las actividades para esta empresa, qué cambió frente a la ficha en dos o tres líneas, cómo se arma y cómo subir
 * el ticket. NADA de eso llega a la propuesta del cliente (lo interno puede entrar aquí por eso): el título y la
 * descripción del caso, que sí llegan, no se tocan.
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  cambiosRespectoDeLaFicha,
  lineaDeCambios,
  recortarSinCortarFrases,
  validarParaVentasDelAgente,
  validarValorDelAgente,
  type ActividadDelCaso,
  type ActividadLigera,
  type ParaVentas,
  type ValorDeVenta,
} from "@/lib/casos-de-uso/armado";
import { laPersonalizacionSeUsaSola, validarCambiosDelAgente, validarRevisionDelAgente, type CambioDeLaRevision, type Personalizacion } from "@/lib/casos-de-uso/personalizar";
import {
  actividadesParaElAgente,
  armarConLaBiblioteca,
  bibliotecaParaElAgente,
  MODELO_DE_LA_EXPLORACION,
  NOMBRE_DE_LA_HERRAMIENTA_DE_CASOS,
  PALANCAS_DE_VALOR,
  type ContextoDeCasos,
} from "./agente-pedido";
import { idDelItem, type CasoDeUsoElegido, type DestinoDePropuesta, type EstadoDeExploracion, type ItemPropuesto } from "./contenido";

export const NOMBRE_DE_LA_HERRAMIENTA_DE_PERSONALIZAR = "personalizar_caso";

export interface ContextoDePersonalizar {
  empresa: string;
  /** El caso como se aceptó. */
  caso: { useCaseId: string; titulo: string; descripcion: string; porQue: string; area: string | null };
  /** Su ficha del catálogo, con la promesa y sus actividades por defecto. null: es un caso propio del agente. */
  ficha: { texto: string; actividades: ActividadDelCaso[] } | null;
  /** Las actividades que tiene hoy, si son suyas (al volver a personalizar): se parte de ahí. */
  actuales: ActividadDelCaso[] | null;
  biblioteca: readonly ActividadLigera[];
  /** Lo que puede ver el cliente: dónde está cada equipo, lo que le falta, sus metas y retos. */
  exploracion: string;
  /** Lo interno de la preventa: lo que dijo cada reunión leída, los hallazgos, «Lo que ya sabemos». */
  interno: string;
  /** Las minutas de sus reuniones más recientes (del chokepoint de sesiones). */
  reuniones: string;
  /** Las instrucciones adicionales del vendedor, ya como bloque, o "". */
  instrucciones: string;
}

/** Todo lo que leyó, para validar las cifras: un número que no está aquí no salió del cliente. */
export function textoQueLeyo(ctx: ContextoDePersonalizar): string {
  return [ctx.exploracion, ctx.interno, ctx.reuniones, ctx.caso.descripcion, ctx.caso.porQue, ...ctx.biblioteca.map((a) => a.nombre), ctx.ficha?.texto ?? ""].join("\n");
}

export function pedidoDePersonalizar(ctx: ContextoDePersonalizar): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const tool: Anthropic.Messages.Tool = {
    name: NOMBRE_DE_LA_HERRAMIENTA_DE_PERSONALIZAR,
    description: "Las actividades del caso de uso para esta empresa, qué cambió frente a la ficha y cómo subir el ticket. Llámala una sola vez.",
    input_schema: {
      type: "object",
      properties: {
        actividades: {
          type: "array",
          description: "Las actividades del caso, SOLO de la biblioteca.",
          items: {
            type: "object",
            properties: {
              actividadId: { type: "string", enum: ctx.biblioteca.map((a) => a.id) },
              nombre: { type: "string", description: "Cómo se llama en este caso: la acción concreta («Configurar la aprobación de cotizaciones»)." },
              veces: { type: "integer", minimum: 1, maximum: 20 },
              sobreQue: { type: "string", description: "De qué trata cuando se comparte por «sobre qué» («WhatsApp»). Vacío si no aplica." },
            },
            required: ["actividadId", "nombre", "veces"],
          },
        },
        sinActividad: { type: "string", description: "Lo que el caso necesita y NINGUNA actividad de la biblioteca cubre. Vacío si todas calzan." },
        cambios: {
          type: "array",
          items: { type: "string" },
          description:
            "De una a tres líneas, 15 palabras como mucho cada una: qué cambiaste frente a la ficha y el HECHO de esta empresa que lo explica, con el nombre de la actividad (nunca su id). Si no cambiaste nada, una línea que lo diga. En un caso propio, cómo lo armaste.",
        },
        comoSeArma: { type: "string", description: "40 palabras como mucho: qué actividades lleva y cuáles no, y por qué, nombrándolas por su nombre de la biblioteca (nunca por su id)." },
        palanca: { type: "string", enum: [...PALANCAS_DE_VALOR] },
        argumento: {
          type: "string",
          description: "Cómo subir el ticket: dos frases cortas, 45 palabras como mucho, sin jerga: qué le cuesta hoy no tenerlo y cómo se lo muestras. Con SUS números si los hay.",
        },
        numeros: {
          type: "array",
          description: "Los números del cliente que usaste, copiados tal cual de abajo, con la frase donde aparecen. Ninguno inventado.",
          items: { type: "object", properties: { dato: { type: "string" }, fuente: { type: "string" } }, required: ["dato", "fuente"] },
        },
        falta: { type: "array", items: { type: "string" }, description: "Los datos que hay que preguntarle al cliente para hacer la cuenta, como preguntas cortas. Máximo tres." },
      },
      required: ["actividades", "cambios", "comoSeArma", "palanca", "argumento", "numeros", "falta"],
    },
  };
  const sistema = `Eres el analista de ventas de Smarteam, una consultora que implementa HubSpot. El vendedor aceptó un caso de uso para la propuesta de un prospecto y te pide PERSONALIZARLO: dejar sus actividades a la medida de esta empresa, decir qué cambió y por qué, y cómo subir el ticket. Lo que escribes lo lee el vendedor; el cliente no lo ve.

Reglas:
- Solo actividades de la BIBLIOTECA (abajo), por su id: son el plan que ejecuta Customer Success y de ahí sale el precio. No inventes actividades: si el caso necesita algo que ninguna cubre, dilo en «sinActividad».
- ${ctx.ficha ? "Parte de las actividades de la FICHA DEL CATÁLOGO" : "Es un caso propio, sin ficha: ármalo solo con actividades de la biblioteca"}${ctx.actuales ? " (o de las que tiene HOY, si están abajo)" : ""} y ajústalas con lo que sabes de esta empresa: quita lo que no aplica, suma lo que pide, cambia las veces. Cada cambio se apoya en un HECHO de la empresa (algo que contó en una reunión, cómo trabaja hoy, su meta). Sin un hecho, deja la actividad como está: no cambies por cambiar.
- El nombre de cada actividad dice la acción concreta en este caso, SIN cambiarle lo que es: es la misma actividad de la biblioteca, con el mismo tiempo. Si el trabajo es más grande que esa actividad (una integración con un ERP no es «Configurar en HubSpot»), no la uses: dilo en «sinActividad».
- «cambios» es lo primero que lee el vendedor: de una a tres líneas de 15 palabras como mucho, cada una con lo que cambió y el hecho que lo explica («Sin importar datos: ya trabajan en HubSpot.»). Solo lo que de verdad hiciste en «actividades».
- En los textos, las actividades van por su NOMBRE («Limpiar los datos»), nunca por su id («limpiar-los-datos»): el id va solo en «actividadId».
- Para subir el ticket: los números del cliente copiados tal cual de abajo, con su fuente. Si no hay números para la cuenta, NO inventes ni estimes una cifra: en «falta» van las preguntas para conseguirlos.
- Palabras simples, como le hablarías a un vendedor nuevo. Nada de opiniones sobre personas. Sin cifras que no estén escritas abajo.`;
  const fichaTexto = ctx.ficha
    ? `=== LA FICHA DEL CATÁLOGO ===\n${ctx.ficha.texto}\nActividades por defecto: ${actividadesParaElAgente(ctx.ficha.actividades) || "(ninguna)"}\n\n`
    : "";
  const actuales = ctx.actuales ? `=== LAS ACTIVIDADES QUE TIENE HOY ===\n${actividadesParaElAgente(ctx.actuales) || "(ninguna)"}\n\n` : "";
  const cuerpo =
    `Empresa: ${ctx.empresa}\n\n` +
    (ctx.instrucciones ?? "") +
    `=== EL CASO QUE ACEPTÓ EL VENDEDOR ===\n${ctx.caso.titulo}${ctx.caso.area ? ` (área: ${ctx.caso.area})` : ""}\n${ctx.caso.descripcion}${ctx.caso.porQue ? `\nPor qué se propuso: ${ctx.caso.porQue}` : ""}\n\n` +
    fichaTexto +
    actuales +
    `=== LO QUE SE SABE (lo que puede ver el cliente) ===\n${ctx.exploracion || "(nada)"}\n\n` +
    `=== LO QUE SE SABE (interno) ===\n${ctx.interno || "(nada)"}\n\n` +
    `=== SUS REUNIONES MÁS RECIENTES (minutas) ===\n${ctx.reuniones || "(ninguna con minuta)"}\n\n` +
    `=== LA BIBLIOTECA DE ACTIVIDADES (las únicas que se pueden usar) ===\n${bibliotecaParaElAgente(ctx.biblioteca)}`;
  return {
    model: MODELO_DE_LA_EXPLORACION,
    // Un caso: sus actividades (~30 tokens cada una), tres líneas, cómo se arma y el valor.
    max_tokens: 4000,
    system: sistema,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: cuerpo }],
  };
}

export interface LoPersonalizado {
  actividades: ActividadDelCaso[];
  sinActividad?: string;
  armado: string;
  paraVentas?: ParaVentas;
  valorDeVenta?: ValorDeVenta;
  personalizado: Personalizacion;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Los ids de la biblioteca que se colaron en un texto, cambiados por su nombre («limpiar-los-datos» → «Limpiar los datos»):
 * el simulacro con Centauro (2026-11-08) los escribió aunque el pedido dice que no. Los más largos primero.
 */
export function idsPorNombres(t: unknown, biblioteca: readonly Pick<ActividadLigera, "id" | "nombre">[]): unknown {
  if (typeof t !== "string") return t;
  let out = t;
  for (const a of [...biblioteca].sort((x, y) => y.id.length - x.id.length)) {
    // Los ids son kebab-case ([a-z0-9-], lo exige el esquema): no llevan nada que escapar en una regex.
    if (!a.id.includes("-") || !/^[a-z0-9-]+$/.test(a.id)) continue;
    out = out.replace(new RegExp(`(?<![\\w-])${a.id}(?![\\w-])`, "g"), `«${a.nombre}»`);
  }
  return out;
}

/**
 * Lo que devolvió el agente, validado: actividades solo de la biblioteca (sin ninguna, quedan las de partida), las líneas
 * de «qué cambió» (sin ninguna, las calcula el código frente a la ficha), «cómo se arma» y el valor sin cifras inventadas.
 * El porqué del caso no se toca: es el de la sugerencia que aceptó el vendedor.
 */
export function leerLaPersonalizacion(respuesta: Anthropic.Messages.Message, ctx: ContextoDePersonalizar, ahora = new Date()): LoPersonalizado {
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === NOMBRE_DE_LA_HERRAMIENTA_DE_PERSONALIZAR);
  const x = bloque && bloque.type === "tool_use" && esObjeto(bloque.input) ? bloque.input : {};
  const porId = new Map(ctx.biblioteca.map((a) => [a.id, a]));
  const base = ctx.actuales ?? ctx.ficha?.actividades ?? [];
  const armado = armarConLaBiblioteca(x, porId, base, ahora);
  const leyo = textoQueLeyo(ctx);
  const cambios = validarCambiosDelAgente(Array.isArray(x.cambios) ? x.cambios.map((c) => idsPorNombres(c, ctx.biblioteca)) : x.cambios, leyo);
  const calculados = cambiosRespectoDeLaFicha(armado.actividades, ctx.ficha?.actividades, (id) => porId.get(id)?.nombre);
  const paraVentas = validarParaVentasDelAgente({ porQue: ctx.caso.porQue, comoSeArma: idsPorNombres(x.comoSeArma, ctx.biblioteca) }, leyo);
  const valorDeVenta = validarValorDelAgente(x, leyo);
  return {
    ...armado,
    ...(paraVentas ? { paraVentas } : {}),
    ...(valorDeVenta ? { valorDeVenta } : {}),
    personalizado: {
      en: ahora.toISOString(),
      cambios: cambios.length ? cambios : [calculados ? lineaDeCambios(calculados) : "Armado con actividades de la biblioteca para esta empresa."],
    },
  };
}

/**
 * El caso aceptado con lo personalizado encima: mismo título, descripción, porqué y lugar en el plan (lo que puede ver el
 * cliente no cambia); actividades, cómo se arma, valor y «qué cambió» nuevos. Ya no es «a mano»: es la versión del agente.
 */
export function casoPersonalizado(caso: CasoDeUsoElegido, p: LoPersonalizado): CasoDeUsoElegido {
  const { aMano: _aMano, sinActividad: _sin, valorDeVenta: _valor, ...resto } = caso;
  void _aMano;
  void _sin;
  void _valor;
  return {
    ...resto,
    actividades: p.actividades,
    ...(p.sinActividad ? { sinActividad: p.sinActividad } : {}),
    armado: p.armado,
    ...(p.paraVentas ? { paraVentas: { porQue: caso.paraVentas?.porQue ?? p.paraVentas.porQue, comoSeArma: p.paraVentas.comoSeArma } } : {}),
    ...(p.valorDeVenta ? { valorDeVenta: p.valorDeVenta } : {}),
    personalizado: p.personalizado,
  };
}

/**
 * La versión personalizada como propuesta del caso, sobre lo guardado AHORA (la fila releída y bloqueada): se arma sobre
 * el caso como está hoy, así que un título o un área que el vendedor cambió mientras el agente trabajaba se quedan.
 * Reemplaza a la versión que hubiera (el destino del caso es uno solo) y, sin pasar por las lápidas a propósito, se lleva
 * la de su mismo id: la pidió el vendedor ahora (lo descartó y lo volvió a elegir). null si el caso ya no está elegido o
 * la preventa se archivó mientras tanto: no se guarda nada.
 */
export function conLaVersionPersonalizada(
  estado: EstadoDeExploracion,
  useCaseId: string,
  armar: (actual: CasoDeUsoElegido) => CasoDeUsoElegido,
  corridaId: string,
  en: string,
): { item: ItemPropuesto; items: ItemPropuesto[]; descartadas: string[] | null; seUsaSola: boolean } | null {
  const actual = estado.contenido.casosDeUso[useCaseId];
  if (!actual || estado.archivada) return null;
  const destino: DestinoDePropuesta = { tipo: "casoDeUso", useCaseId };
  const valor = armar(actual);
  const item: ItemPropuesto = { id: idDelItem(destino, valor), destino, valor, ...(actual.razon ? { razon: actual.razon.slice(0, 300) } : {}), fuentes: [], corridaId, en };
  const items = [...estado.propuesta.items.filter((it) => !(it.destino.tipo === "casoDeUso" && it.destino.useCaseId === useCaseId)), item];
  const descartadas = estado.contenido.descartadas.includes(item.id) ? estado.contenido.descartadas.filter((d) => d !== item.id) : null;
  return { item, items, descartadas, seUsaSola: laPersonalizacionSeUsaSola(actual) };
}

/** Lo que dijo «Revisar» de los casos que ya estaban (`ctx.revisar`). Sin revisar, ninguno. */
export function leerLaRevision(respuesta: Anthropic.Messages.Message, ctx: Pick<ContextoDeCasos, "revisar" | "exploracion">): CambioDeLaRevision[] {
  if (!ctx.revisar?.length) return [];
  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === NOMBRE_DE_LA_HERRAMIENTA_DE_CASOS);
  const x = bloque && bloque.type === "tool_use" && esObjeto(bloque.input) ? bloque.input : {};
  return validarRevisionDelAgente(x.revision, ctx.revisar, ctx.exploracion);
}

/** El porqué corto de un caso para que lo lea el agente: el suyo para el vendedor o, si no, su razón. */
export function porQueDelCaso(caso: Pick<CasoDeUsoElegido, "paraVentas" | "razon">): string {
  return recortarSinCortarFrases(caso.paraVentas?.porQue || caso.razon || "", 260);
}
