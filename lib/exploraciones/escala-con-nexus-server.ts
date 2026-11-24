import "server-only";

/**
 * lib/exploraciones/escala-con-nexus-server.ts — EL CONTRATO DE LA PÁGINA DE LA ESCALA para «✨ Pedirle a Nexus» (23 nov,
 * etapa 3 del plan maestro de «Hablar con Nexus», versión sin cajón aprobada por Elías; el contrato,
 * lib/pedirle-a-nexus/contrato.ts). SERVIDOR.
 *
 * Tres funciones que reciben a LA PERSONA y LA CUENTA, nunca la sesión del navegador: las usan la ruta de la página
 * (app/api/sales/exploraciones/[id]/escala/nexus) y, después, la herramienta `proponer_cambio` del conector de Claude.
 * Quien llama ya verificó el permiso (la guardia de la exploración: escribir); acá se verifica que la exploración sea de esa
 * cuenta (invariante 1: el modelo nunca elige la empresa) y que el área sea de esa página.
 *
 *   · `leerLaEscalaParaNexus`: la página como la ve el cliente, en piezas con nombre (./escala-con-nexus.ts).
 *   · `proponerEnLaEscala`: un pedido, una propuesta por pieza. Lee la página y lo que confirmó el equipo CORTADO PARA EL
 *     CLIENTE; llama al núcleo de «Mejorar con IA» (lib/ai/assist.ts, sin búsqueda web) una vez, medido con su corrida y su
 *     origen `pedirle:escala` dentro del tope de US$ 100 de Nexus conversando; y pasa lo propuesto por la revisión del código
 *     (lib/pedirle-a-nexus/veracidad.ts: la vara de las cifras, lo interno, lo escrito a mano). NO escribe nada.
 *   · `aplicarEnLaEscala`: aplica los cambios que la persona eligió por el MISMO camino que la edición a mano
 *     (`aplicarCambios` con las operaciones de siempre). Choca si otra persona cambió lo mismo: cada cambio trae lo que se vio
 *     antes; si la pieza ya dice otra cosa, no se aplica nada (409 con lo que dice ahora). Y la fila tiene que seguir como
 *     estaba al leerla (`sinCambiosDesde`). Deja en el historial lo de antes y «Cambiado con Nexus». NUNCA publica: el cliente
 *     ve lo publicado hasta que una persona publique. Devuelve cómo deshacerlo.
 *   · `deshacerEnLaEscala`: vuelve a la versión de antes con «Usar esta versión» del historial (exacta, con sus citas y con
 *     quién escribió cada pieza), si el documento sigue como lo dejó Nexus; si no, choca.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runDocumentAssist } from "@/lib/ai/assist";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { mensajeDelTope } from "@/lib/ai/tope-de-nexus";
import { topeDeNexusHoy } from "@/lib/ai/tope-de-nexus-server";
import {
  AVISO_SIN_PUBLICAR,
  MAX_CAMBIOS,
  MAX_PEDIDO,
  PEDIDOS_POR_DIA,
  type CambioParaAplicar,
  type Choque,
  type DeshacerDeNexus,
  type PropuestaDeNexus,
  type QuienPide,
  type ResultadoDeAplicar,
} from "@/lib/pedirle-a-nexus/contrato";
import { NOMBRES_DE_LO_INTERNO, revisarLaPropuesta, type PropuestoCrudo } from "@/lib/pedirle-a-nexus/veracidad";
import { voseoDelResumen } from "./resumen-de-la-escala";
import { inicioDelDiaCr } from "@/lib/ai/presupuesto";
import type { EstadoDeExploracion } from "./contenido";
import { conLoQueCuestaDelArea, guiaDeLaPieza, nombreDelLugar, operacionDelCambio, piezasDelArea, piezasDeLaSeccion, piezasDelResumen, type LugarEnLaEscala, type PiezaDeLaEscala } from "./escala-con-nexus";
import { paginaParaElCse, type PaginaParaElCse } from "./escala-para-el-cliente-server";
import { bloqueDeLoQueConfirmoElEquipo, paraElAlcance } from "./lo-que-confirmo-el-equipo";
import { loQueConfirmoElEquipo } from "./lo-que-confirmo-el-equipo-server";
import { aplicarCambios, escalaParaExplorar, estadoDesdeFila } from "./servidor";
import { dimensionesDeLasAreas, guardarVersionDelArea, usarVersionDelArea } from "./versiones-del-area-server";
import { fotoDelArea, huellaDelArea } from "./versiones-del-area";
import { guardarLaDeAntesDeNexus, guardarVersionDelResumen, huellaDelResumen, usarVersionDelResumen } from "./versiones-del-resumen-server";
import { seRehaceElResumen } from "./resumen-de-la-escala-server";

/** Lo que dice Nexus al llegar al tope por persona del día. */
export const topeDePedidos = () => `Hoy ya le hiciste ${PEDIDOS_POR_DIA} pedidos a Nexus, el tope del día. Mañana sigues.`;

/** El slug de la corrida y el origen del medidor (dentro del tope de Nexus conversando: lib/ai/tope-de-nexus.ts). */
export const AGENTE_DE_PEDIRLE = "pedirle-a-nexus";
export const ORIGEN_DE_LA_ESCALA = "pedirle:escala";

/** Lo que identifica el documento: la cuenta y su exploración, y el lugar dentro de la página. */
export interface DocumentoDeLaEscala {
  clientId: string;
  exploracionId: string;
  lugar: LugarEnLaEscala;
}

type Falla = { ok: false; status: number; error: string };
const noExiste = (): Falla => ({ ok: false, status: 404, error: "Esa página no existe." });

export interface LecturaDeLaEscala {
  ok: true;
  empresa: string;
  /** «Resumen» o el nombre del área. */
  lugar: string;
  piezas: PiezaDeLaEscala[];
  /** La fila como estaba al leerla: aplicar exige que siga así. */
  version: number;
  leidaEn: Date;
}

/** La página como la ve el cliente, en piezas. Verifica que la exploración sea de la cuenta y el área, de la página. */
export async function leerLaEscalaParaNexus(_quien: QuienPide, d: DocumentoDeLaEscala): Promise<LecturaDeLaEscala | Falla> {
  const fila = await prisma.exploracionDeVenta.findUnique({ where: { id: d.exploracionId }, select: { clientId: true, version: true, updatedAt: true, contenido: true, propuesta: true, areas: true, edicion: true, perfilCierre: true, perfilDespues: true, responsableEmail: true, archivadaEn: true } });
  // ⛔ Invariante 1: la exploración es de ESTA cuenta, o no existe (no se distingue «no la ves» de «no está»).
  if (!fila || fila.clientId !== d.clientId) return noExiste();
  if (fila.archivadaEn) return { ok: false, status: 409, error: "La preventa está archivada: ya no se puede cambiar." };
  const pagina = await paginaParaElCse(d.exploracionId);
  if (!pagina) return noExiste();
  const piezas = piezasDelLugar(pagina, estadoDesdeFila(fila), d.lugar);
  if (!piezas) return { ok: false, status: 404, error: "Esa área no está en la página." };
  return { ok: true, empresa: pagina.empresa, lugar: nombreDelLugar(d.lugar, pagina.areas), piezas, version: fila.version, leidaEn: fila.updatedAt };
}

/** Las piezas de un lugar de la página. null: el área no está en la página. */
function piezasDelLugar(pagina: PaginaParaElCse, estado: EstadoDeExploracion, lugar: LugarEnLaEscala): PiezaDeLaEscala[] | null {
  if (lugar.pagina === "resumen") return piezasDelResumen(pagina.resumen, pagina.textos);
  const r = pagina.resultados.find((x) => x.areaId === lugar.areaId);
  if (!r) return null;
  const c = estado.contenido;
  const guardada = c.descripcionesDeLaEscala?.[lugar.areaId];
  return piezasDelArea(r, {
    textos: pagina.textos,
    textosDelRadar: c.textosDelRadar,
    descripcion: guardada ? { origen: guardada.origen } : null,
    detalle: (id) => pagina.detalles[id] ?? null,
    conLoQueCuesta: conLoQueCuestaDelArea(pagina.resumen, lugar.areaId),
    fecha: pagina.fecha,
  });
}

/** Las reglas fijas de «Pedirle a Nexus» en La escala (van como system prompt del núcleo de «Mejorar con IA»). */
export const REGLAS_DE_PEDIRLE = `Eres Nexus, el asistente de Smarteam. Mejoras la página de La escala que ve el CLIENTE (su diagnóstico de rendimiento) según UN pedido de una persona del equipo de Smarteam. Le hablas al cliente de TÚ.

Cada sección del documento es UNA PIEZA de la página, con su clave, dónde está, lo que dice y lo que acepta. Para cambiar una pieza devuelve su clave con {"texto": "<el texto nuevo, completo>"}.
- Para QUITAR una pieza que «se puede quitar», devuelve {"texto": "", "quitar": "si"}. Sin "quitar", un texto vacío no cambia nada.
- Para AGREGAR una pieza nueva, escribe en la pieza marcada «lugar para AGREGAR» de esa lista (una por lista).
- Cambia SOLO lo que el pedido pide, lo mínimo que lo cumple. Si señala una pieza, empieza por ella.
- NUNCA inventes cifras, nombres de sistemas ni fechas: usa solo lo que dice la página, lo que el equipo confirmó (abajo) y lo que diga el pedido. Si el pedido trae una cifra, úsala tal cual.
- LO INTERNO de la venta (${NOMBRES_DE_LO_INTERNO}) va en la página SOLO si el pedido lo pide con todas sus letras: entonces escríbelo con las palabras del pedido, sin agregar nada, y dilo en "__reasoning" (el cliente lo verá al publicar). Si el pedido no lo nombra, o pide que no esté, nunca lo escribas. Cualquier otra cosa de la venta que no sea del cliente (lo que se negocia, lo que opina una persona de la empresa), tampoco.
- Las piezas «la escribió el equipo» las cambias solo si el pedido las nombra o es imposible cumplirlo sin ellas.
- Respeta el largo de cada pieza. Frases cortas y concretas, sin superlativos ni signos de exclamación.
- "__reasoning": una o dos frases para la persona del equipo (no para el cliente) de qué cambiaste y por qué.`;

/**
 * Lo que el modelo recibe y devuelve de cada pieza: su texto y, para quitarla, `quitar: "si"`. Quitar va aparte porque una
 * respuesta mal armada se lee como texto vacío (lib/ai/section-schema.ts › coerceToSchema): vacío solo, no borra nada.
 */
const ESQUEMA_DE_LA_PIEZA = { type: "object", properties: { texto: { type: "string" }, quitar: { type: "string" } } } as const;

/**
 * Un pedido, una propuesta. NO escribe en la página: la persona aplica. `foco`: la SECCIÓN desde la que se pidió (24 nov: el
 * botón del encabezado de cada sección, lib/external/secciones-de-la-escala.ts). Con foco, al modelo le llegan solo las
 * piezas de esa sección: no puede cambiar otra cosa. Si la sección ya no tiene piezas en este lugar, 409.
 */
export async function proponerEnLaEscala(quien: QuienPide, d: DocumentoDeLaEscala & { pedido: string; foco?: string | null }): Promise<{ ok: true; propuesta: PropuestaDeNexus } | Falla> {
  const pedido = d.pedido.replace(/\s+/g, " ").trim().slice(0, MAX_PEDIDO);
  if (!pedido) return { ok: false, status: 400, error: "Escribe qué quieres que Nexus cambie." };
  const tope = await topeDeNexusHoy();
  if (tope.estado === "agotado") return { ok: false, status: 429, error: mensajeDelTope(tope) };
  const lectura = await leerLaEscalaParaNexus(quien, d);
  if (!lectura.ok) return lectura;
  const foco = d.foco?.trim() || null;
  const piezas = foco ? piezasDeLaSeccion(lectura.piezas, foco) : lectura.piezas;
  if (foco && !piezas.length) return { ok: false, status: 409, error: "Esa sección ya no tiene nada que cambiar en la página: vuelve a cargarla." };

  // Lo que confirmó el equipo: CORTADO PARA EL CLIENTE para el modelo; lo interno, solo para el código: reconoce lo que no se
  // pidió y verifica que lo interno que el pedido nombra esté en lo que Nexus tiene de la cuenta (24 nov).
  const notas = await loQueConfirmoElEquipo(d.clientId, "interno");
  const paraElCliente = paraElAlcance(notas, "cliente");
  const bloque = bloqueDeLoQueConfirmoElEquipo(notas, "cliente");
  const delCliente = paraElCliente.flatMap((n) => n.hechos.map((h) => h.frase));
  const interno = notas.flatMap((n) => [n.texto, ...n.hechos.map((h) => h.frase)]);

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DE_PEDIRLE,
      clientId: d.clientId,
      status: "RUNNING",
      stepLabel: `Pedirle a Nexus · La escala › ${lectura.lugar}`,
      triggeredByEmail: quien.email,
      filters: { documento: "escala", exploracionId: d.exploracionId, lugar: d.lugar, foco, pedido } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  // El tope por persona (cada pedido es una llamada a Sonnet con la página entera). Se cuenta DESPUÉS de anotar esta corrida:
  // varios pedidos a la vez se ven entre sí y no pasan el tope (como mucho, frenan de más).
  const deHoy = await prisma.agentRun.count({ where: { agentSlug: AGENTE_DE_PEDIRLE, triggeredByEmail: quien.email, createdAt: { gte: inicioDelDiaCr(new Date()) } } });
  if (deHoy > PEDIDOS_POR_DIA) {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ omitido: "tope-por-persona" }) } }).catch(() => {});
    return { ok: false, status: 429, error: topeDePedidos() };
  }
  const ia = { agentSlug: AGENTE_DE_PEDIRLE, agentRunId: run.id, clientId: d.clientId, triggeredByEmail: quien.email, origen: ORIGEN_DE_LA_ESCALA };
  try {
    const r = await conContextoDeIA(ia, () =>
      runDocumentAssist({
        docLabel: `página de La escala de ${lectura.empresa} (${lectura.lugar}${foco ? ` › ${foco}` : ""})`,
        systemPrompt: REGLAS_DE_PEDIRLE,
        // La página (o la sección pedida) va UNA vez: cada pieza es una sección del núcleo, con lo que acepta en su guía.
        sections: piezas.map((p) => ({ key: p.clave, label: `${p.seccion} › ${p.nombre}`, brief: guiaDeLaPieza(p), schema: ESQUEMA_DE_LA_PIEZA, currentData: { texto: p.valor ?? "", quitar: "" } })),
        instruction: foco ? `${pedido}\n\n(Lo pidió desde la sección «${foco}» de la página: solo están sus partes y solo esas se cambian.)` : pedido,
        context: bloque ? `Lo que el equipo confirmó de ${lectura.empresa} y SÍ puede ir al cliente:\n${bloque}` : undefined,
        brandVoice: true,
        maxWebSearches: 0,
        permitirVacia: true,
        maxTokens: 6000,
      }),
    );
    const propuesto = Object.entries(r.proposal).flatMap(([clave, v]): PropuestoCrudo[] => {
      const x = v as { texto?: unknown; quitar?: unknown };
      const texto = typeof x.texto === "string" ? x.texto.trim() : "";
      if (texto) return [{ clave, despues: texto }];
      // Vacío solo cuenta como «quitar» si el modelo lo dijo: si no, es una respuesta mal armada y no se toca la pieza.
      return x.quitar === "si" ? [{ clave, despues: null }] : [];
    });
    // La revisión mira SOLO las piezas que vio el modelo: una clave de otra sección no llega. Las cifras que ya están en la
    // página sí valen aunque sean de otra sección (`pagina`): lo que el cliente ya ve no es inventado.
    const revisado = revisarLaPropuesta({ piezas, pagina: lectura.piezas, propuesto, pedido, delCliente, interno, voseo: voseoDelResumen });
    // Lo que «Aplicar todo» puede aplicar de una vez: lo que pasa del tope se dice, no se esconde.
    const sobran = revisado.cambios.splice(MAX_CAMBIOS);
    for (const c of sobran) revisado.descartados.push({ clave: c.clave, nombre: c.nombre, texto: c.despues ?? "(quitarla)", motivo: `Son más de ${MAX_CAMBIOS} cambios de una vez: pide este aparte.` });
    const propuesta: PropuestaDeNexus = {
      pedido,
      cambios: revisado.cambios,
      descartados: revisado.descartados,
      nota: r.reasoning ?? (revisado.cambios.length ? null : "Nexus no encontró nada que cambiar con ese pedido."),
      corrida: run.id,
    };
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", output: JSON.stringify(propuesta) } });
    return { ok: true, propuesta };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[escala-con-nexus] la propuesta no salió:", mensaje);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: mensaje }) } }).catch(() => {});
    return { ok: false, status: 502, error: `Nexus no pudo proponer (${mensaje}). Vuelve a intentarlo.` };
  }
}

const igual = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").replace(/\s+/g, " ").trim() === (b ?? "").replace(/\s+/g, " ").trim();

/**
 * Aplica lo que la persona eligió. Todo o nada: si una pieza cambió desde que se propuso, 409 con lo que dice ahora y no se
 * aplica ninguna.
 */
export async function aplicarEnLaEscala(
  quien: QuienPide,
  d: DocumentoDeLaEscala & { cambios: readonly CambioParaAplicar[]; pedido?: string | null },
): Promise<ResultadoDeAplicar> {
  if (!d.cambios.length) return { ok: false, status: 400, error: "No hay cambios para aplicar." };
  if (d.cambios.length > MAX_CAMBIOS) return { ok: false, status: 400, error: `Son demasiados cambios de una vez (más de ${MAX_CAMBIOS}).` };
  if (new Set(d.cambios.map((c) => c.clave)).size !== d.cambios.length) return { ok: false, status: 400, error: "Hay dos cambios a la misma parte." };
  const lectura = await leerLaEscalaParaNexus(quien, d);
  if (!lectura.ok) return lectura;
  const porClave = new Map(lectura.piezas.map((p) => [p.clave, p]));

  // ⛔ Choca si otra persona cambió lo mismo: cada cambio trae lo que se vio antes.
  const choques: Choque[] = [];
  for (const c of d.cambios) {
    const p = porClave.get(c.clave);
    if (!p) choques.push({ clave: c.clave, nombre: null, ahora: null });
    else if (!igual(p.valor, c.antes)) choques.push({ clave: c.clave, nombre: p.nombre, ahora: p.valor });
  }
  if (choques.length)
    return {
      ok: false,
      status: 409,
      error: choques.length === 1 ? "Esa parte cambió desde que Nexus la propuso (otra persona la editó). No se aplicó nada." : "Algunas partes cambiaron desde que Nexus las propuso (otra persona las editó). No se aplicó nada.",
      choques,
    };

  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") return { ok: false, status: 503, error: "La escala no está publicada en Nexus: sin ella no se puede validar el cambio." };
  const operaciones = d.cambios.map((c) => operacionDelCambio(porClave.get(c.clave)!, c.despues));
  // El MISMO camino que la edición a mano. La fila tiene que seguir como estaba al leerla.
  const r = await aplicarCambios(d.exploracionId, lectura.version, operaciones, escala.general, { quienPide: quien.email, sinCambiosDesde: lectura.leidaEn });
  if (r.estado === "no-existe") return noExiste();
  if (r.estado === "invalido") return { ok: false, status: 400, error: r.error };
  if (r.estado === "conflicto") return { ok: false, status: 409, error: "La página cambió mientras se aplicaba (otra persona la editó). No se aplicó nada: vuelve a pedirlo." };

  // El historial: lo de antes y lo que quedó. Después de soltar la fila (la tabla tiene una FK a la exploración). «Deshacer»
  // vuelve a la de antes si el documento sigue como lo dejó Nexus: exacto, con sus citas y con quién lo escribió.
  const despues = estadoDesdeFila(r.fila);
  const nota = `Pedido: «${(d.pedido ?? "").slice(0, 160)}${(d.pedido ?? "").length > 160 ? "…" : ""}»`;
  let deshacer: DeshacerDeNexus | null = null;
  if (d.lugar.pagina === "resumen") {
    const antesR = r.antes.contenido.resumenDeLaEscala;
    const despuesR = despues.contenido.resumenDeLaEscala;
    const textosAntes = r.antes.contenido.textosDeLaPagina;
    const textosDespues = despues.contenido.textosDeLaPagina;
    const deAntes = antesR ? await guardarLaDeAntesDeNexus(d.exploracionId, antesR, textosAntes) : null;
    if (despuesR) await guardarVersionDelResumen(d.exploracionId, despuesR, { tipo: "nexus", nota, creadaPor: quien.email, textos: textosDespues });
    const firma = huellaDelResumen(despuesR, textosDespues);
    if (deAntes?.id && firma) deshacer = { versionId: deAntes.id, firma };
  } else {
    const areaId = d.lugar.areaId;
    // Las dimensiones del área, de la MISMA fuente que el historial (el lienzo de la escala de esta exploración).
    const dims = (await dimensionesDeLasAreas(r.antes))?.get(areaId)?.map((x) => x.id) ?? [];
    const deAntes = await guardarVersionDelArea(d.exploracionId, fotoDelArea(r.antes.contenido, areaId, dims), { tipo: "antes", nota: "Así estaba antes del cambio de Nexus.", creadaPor: null, aunVacia: true });
    const fotoDespues = fotoDelArea(despues.contenido, areaId, dims);
    await guardarVersionDelArea(d.exploracionId, fotoDespues, { tipo: "nexus", nota, creadaPor: quien.email });
    if (deAntes.id) deshacer = { versionId: deAntes.id, firma: huellaDelArea(fotoDespues) };
  }
  return { ok: true, aplicados: d.cambios.length, deshacer, aviso: AVISO_SIN_PUBLICAR };
}

/**
 * «Deshacer»: vuelve a la versión de antes del cambio de Nexus por «Usar esta versión» del historial, que choca si el
 * documento ya no está como lo dejó Nexus (`firma`) y nunca publica. Verifica la cuenta como las demás.
 */
export async function deshacerEnLaEscala(quien: QuienPide, d: DocumentoDeLaEscala & DeshacerDeNexus): Promise<{ ok: true; aviso: string } | Falla> {
  const lectura = await leerLaEscalaParaNexus(quien, d);
  if (!lectura.ok) return lectura;
  const r =
    d.lugar.pagina === "resumen"
      ? await usarVersionDelResumen({ exploracionId: d.exploracionId, versionId: d.versionId, email: quien.email, firma: d.firma, enCurso: (tx) => seRehaceElResumen(tx, d.exploracionId) })
      : await usarVersionDelArea({ exploracionId: d.exploracionId, areaId: d.lugar.areaId, versionId: d.versionId, email: quien.email, firma: d.firma });
  if (!r.ok) return r;
  return { ok: true, aviso: "Volvió lo de antes del cambio de Nexus. Hay cambios que el cliente no ve si ya estaba publicado." };
}
