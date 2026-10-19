/**
 * lib/operaciones/guia-server.ts — la guía de la próxima sesión de una exploración, en la capa de operaciones (validación
 * 71 del roadmap, 2026-10-18). SERVER-ONLY.
 *
 * «Mejorar con el asistente» es el chat de Nexus de la cuenta (lib/nexus-chat), no un chat nuevo: estas operaciones le
 * dan cómo leer la guía y proponer cambios (agregar, cambiar o quitar una pregunta, cambiar una repregunta). Todas llevan
 * `clientId` (el chat pone el de la cuenta del hilo) y se verifica que la exploración sea de esa empresa. Escribir pide
 * lo mismo que la pantalla: `preventa.write` en una preventa, la celda de generar la exploración en un proyecto.
 *
 * Lo que proponen se escribe con `ajustarLaGuia` (lib/exploraciones/guia-ajustes-server.ts), la misma operación de la
 * pantalla: queda en la sesión y sobrevive a «Actualizar la guía». Las preguntas que se miran son las que ve el vendedor.
 */
import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { can } from "@/lib/auth/permissions/engine";
import { formasDeVoseo } from "@/lib/ui/voseo-formas";
import { definicionEnElMarco, esTarjeta, DE_LA_PREVENTA } from "@/lib/exploraciones/marco";
import { contextoParaLaGuia } from "@/lib/exploraciones/agente";
import { ajustarLaGuia, ErrorDeLaGuia, preguntasDeLaProxima } from "@/lib/exploraciones/guia-ajustes-server";
import { repiteLoSabido, QUE_BUSCA_CADA_PASO } from "@/lib/exploraciones/plan-de-la-guia";
import {
  claveDePregunta,
  esPropia,
  lineaDelCambio,
  LARGO_DE_UNA_PREGUNTA,
  LARGO_DE_UNA_REPREGUNTA,
  MAX_REPREGUNTAS,
  nuevoIdDePropia,
  sinCitaAdelante,
  type CambioDeLaGuia,
} from "@/lib/exploraciones/ajustes-de-la-guia";
import type { PreguntaParaMostrar } from "@/lib/exploraciones/guia";
import { exigirCliente, type ContextoDeNexus } from "./contexto-server";
import type { OperacionQueLee, OperacionQuePropone, Preparada } from "./tipos";

const idDeCliente = z.string().min(1).max(60);
const idDeExploracion = z.string().min(1).max(60);
const clave = z.string().min(1).max(60).describe("La clave de la pregunta, como sale entre corchetes en la guía: «1.7:impacto», «metas:impacto», «propia:p…».");
const textoDePregunta = z.string().trim().min(1).max(LARGO_DE_UNA_PREGUNTA);
const textoDeRepregunta = z.string().trim().min(1).max(LARGO_DE_UNA_REPREGUNTA);

type Base = Awaited<ReturnType<typeof contextoParaLaGuia>>;

/** Hasta cuántas palabras una pregunta que propone el asistente (la guía pide 20; se deja un margen). */
const MAX_PALABRAS = 30;

/**
 * La guía de una exploración, armada UNA vez por contexto (validación 106). Armarla lee la escala, la exploración y sus
 * reuniones (~0,4 s), y un turno que propone cuatro preguntas la armaba cinco veces (la guía del mensaje y cada cambio al
 * prepararlo), y otras cuatro al aplicar. El contexto es de un turno o de un «Aplicar»: lo que se prepara dentro de él no
 * escribe nada, y lo que aplica arma la suya de nuevo (`ajustarLaGuia`), así que nunca se escribe sobre una guía vieja.
 */
const guiasDelContexto = new WeakMap<object, Map<string, Promise<Base>>>();
export function baseDeLaGuia(ctx: object, exploracionId: string): Promise<Base> {
  let porId = guiasDelContexto.get(ctx);
  if (!porId) guiasDelContexto.set(ctx, (porId = new Map()));
  const yaPedida = porId.get(exploracionId);
  if (yaPedida) return yaPedida;
  const b = contextoParaLaGuia(exploracionId);
  porId.set(exploracionId, b);
  // Si falla, no se guarda: el próximo intento vuelve a leer.
  b.catch(() => porId.delete(exploracionId));
  return b;
}

/** La exploración, si es de esta empresa y quien pide puede cambiarla. */
async function exigirLaExploracion(ctx: ContextoDeNexus, clientId: string, exploracionId: string, escribir: boolean): Promise<{ ok: true } | { ok: false; motivo: string }> {
  await exigirCliente(ctx, clientId);
  const f = await prisma.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { clientId: true, projectId: true, archivadaEn: true } });
  if (!f || f.clientId !== clientId) return { ok: false, motivo: "Esa exploración no es de esta empresa." };
  if (escribir) {
    if (f.archivadaEn) return { ok: false, motivo: "La exploración está archivada: ya no se puede cambiar." };
    const puede = f.projectId ? await can(ctx.persona, "exploracion", "generate") : await can(ctx.persona, "preventa", "write");
    if (!puede) return { ok: false, motivo: "No tienes permiso para cambiar esta guía." };
  }
  return { ok: true };
}

/** La exploración viva de la empresa: la preventa primero, después la de un proyecto. */
async function exploracionDeLaCuenta(clientId: string): Promise<string | null> {
  const preventa = await prisma.exploracionDeVenta.findFirst({ where: { clientId, archivadaEn: null, ...DE_LA_PREVENTA }, select: { id: true }, orderBy: { updatedAt: "desc" } });
  if (preventa) return preventa.id;
  const otra = await prisma.exploracionDeVenta.findFirst({ where: { clientId, archivadaEn: null, NOT: { projectId: null } }, select: { id: true }, orderBy: { updatedAt: "desc" } });
  return otra?.id ?? null;
}

const nombreDelTema = (base: Base, para: string) =>
  esTarjeta(para) ? definicionEnElMarco(para, base.marco).etiqueta : (base.escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === para)?.nombre ?? para);

const temaDe = (p: PreguntaParaMostrar) => p.apunta?.para ?? (p.tipo === "tarjeta" || p.tipo === "dimension" ? p.para : null);

/** Los temas que puede llevar una pregunta nueva: las tarjetas del marco y las dimensiones de las áreas en juego. */
function temasPosibles(base: Base): { id: string; nombre: string }[] {
  return [
    ...base.marco.tarjetas.map((k) => ({ id: k as string, nombre: definicionEnElMarco(k, base.marco).etiqueta })),
    ...base.escala.areas.filter((a) => base.estado.areas.includes(a.id)).flatMap((a) => a.dimensiones.filter((d) => d.aplica).map((d) => ({ id: d.id, nombre: `${d.nombre} (${a.nombre})` }))),
  ];
}

/**
 * La guía de la próxima sesión, en texto para el modelo: lo que ya sabemos, la escala de las áreas en juego, lo que falta
 * para proponer y cada pregunta con su clave. La usan `guia.leer` y el turno del chat cuando la persona lo abre desde la
 * guía (lib/nexus-chat/turno-server.ts).
 */
export async function guiaParaElChat(exploracionId: string, yaArmada?: Base): Promise<string> {
  const base = yaArmada ?? (await contextoParaLaGuia(exploracionId));
  const { preguntas } = preguntasDeLaProxima(base);
  const { ctx } = base;
  const nivel = (l: string) => base.escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
  const l: string[] = [
    `LA GUÍA DE LA PRÓXIMA SESIÓN · exploración ${exploracionId} · sesión ${ctx.proxima.numero}${ctx.proxima.titulo ? ` «${ctx.proxima.titulo}»` : ""}`,
    `Empresa: ${ctx.empresa} · ${base.marco.clave === "cs" ? "exploración de un proyecto (Customer Success)" : "preventa"} · edición de la escala: ${ctx.edicion}`,
  ];
  if (ctx.loQueYaSabemos?.length) l.push("", "Lo que ya sabemos (lo que respondió el cliente; NO se vuelve a preguntar):", ...ctx.loQueYaSabemos.map((t) => `- ${t}`));
  if (ctx.confirmado.length) l.push("", "Lo confirmado del resumen:", ...ctx.confirmado.map((t) => `- ${t}`));
  const dims = base.escala.areas
    .filter((a) => base.estado.areas.includes(a.id))
    .flatMap((a) => a.dimensiones.filter((d) => d.aplica).map((d) => ({ d, a, p: base.posiciones[d.id] })));
  if (dims.length) {
    l.push("", "La escala de las áreas en juego (dónde parece estar cada dimensión):");
    for (const { d, a, p } of dims) l.push(`- ${d.id} ${d.nombre} (${a.nombre}): ${p ? `${p.clase === "evidencia" ? "está en" : "creemos que está en"} ${nivel(p.nivel)}` : "sin dato"}`);
  }
  if (ctx.faltanAlCerrar?.length) l.push("", `Lo que falta para proponer y ninguna pregunta cubre: ${ctx.faltanAlCerrar.join(", ")}.`);
  l.push("", "Las preguntas, en orden (clave entre corchetes):");
  preguntas.forEach((p, i) => {
    const tema = temaDe(p);
    const marca = p.marca === "tuya" ? " · la escribió la persona" : p.marca === "asistente" ? " · la sumaste tú (asistente)" : p.marca === "regenerada" ? " · regenerada" : "";
    l.push(
      `${i + 1}. [${claveDePregunta(p)}] ${tema ? nombreDelTema(base, tema) : "sin tema"}${p.paso ? ` · paso ${p.paso} (${QUE_BUSCA_CADA_PASO[p.paso]})` : ""}${marca}`,
      `   «${p.pregunta}»`,
      ...(p.motivo ? [`   Parte de: «${p.motivo.texto}» (${p.motivo.de})`] : []),
      ...(p.repreguntas.length ? [`   Repreguntas: ${p.repreguntas.map((r, k) => `${k + 1}) ${r}`).join(" ")}`] : []),
    );
  });
  if (!preguntas.length) l.push("(la guía no tiene preguntas todavía)");
  l.push("", `Temas para una pregunta nueva: ${temasPosibles(base).map((t) => `${t.id} (${t.nombre})`).join(" · ")}`);
  return l.join("\n");
}

/** Lo que tiene que cumplir un texto que propone el asistente: tuteo y corto. */
function problemaDelTexto(textos: readonly string[], pregunta?: string): string | null {
  const voseo = [...new Set(textos.flatMap((t) => formasDeVoseo(t)).filter((w) => !/r[áa]s?$/i.test(w) && !/r[áa]n$/i.test(w)))];
  if (voseo.length) return `Está en voseo (${voseo.slice(0, 4).map((w) => `«${w}»`).join(", ")}): escríbelo en tuteo.`;
  if (pregunta && pregunta.split(/\s+/).length > MAX_PALABRAS) return `La pregunta es larga: déjala en ${MAX_PALABRAS - 10} palabras o menos.`;
  if (pregunta && sinCitaAdelante(pregunta) !== pregunta) return "La pregunta repite lo que dijo el cliente adelante: deja solo la pregunta.";
  return null;
}

const recortar = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

interface DatosDeLaGuia {
  exploracionId: string;
  cambio: CambioDeLaGuia;
}

/** Prepara un cambio sobre una pregunta que ya está: la busca por su clave entre las que ve el vendedor. */
async function conLaPregunta(
  ctx: ContextoDeNexus,
  e: { clientId: string; exploracionId: string; clave: string },
  armar: (base: Base, p: PreguntaParaMostrar, numero: number) => Preparada<DatosDeLaGuia>,
): Promise<Preparada<DatosDeLaGuia>> {
  const ok = await exigirLaExploracion(ctx, e.clientId, e.exploracionId, true);
  if (!ok.ok) return ok;
  const base = await baseDeLaGuia(ctx, e.exploracionId);
  const { preguntas } = preguntasDeLaProxima(base);
  const i = preguntas.findIndex((p) => claveDePregunta(p) === e.clave);
  if (i < 0) return { ok: false, motivo: `La guía no tiene la pregunta [${e.clave}]: léela otra vez con guia_leer.` };
  return armar(base, preguntas[i], i + 1);
}

export const LEER_GUIA: OperacionQueLee<{ clientId: string; exploracionId?: string }, string, ContextoDeNexus> = {
  nombre: "guia.leer",
  paraQue:
    "Lee la guía de la próxima sesión de exploración de la empresa (la preventa o la de un proyecto): lo que ya sabemos del cliente, la escala de las áreas en juego, lo que falta para proponer y cada pregunta con su clave.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente, exploracionId: idDeExploracion.optional() }).strict(),
  async leer(ctx, e) {
    const id = e.exploracionId ?? (await exploracionDeLaCuenta(e.clientId));
    if (!id) return "Esta empresa no tiene una exploración abierta.";
    const ok = await exigirLaExploracion(ctx, e.clientId, id, false);
    if (!ok.ok) return ok.motivo;
    return guiaParaElChat(id, await baseDeLaGuia(ctx, id));
  },
};

export const AGREGAR_PREGUNTA: OperacionQuePropone<
  { clientId: string; exploracionId: string; pregunta: string; repreguntas?: string[]; tema?: string },
  DatosDeLaGuia,
  { ok: true },
  ContextoDeNexus
> = {
  nombre: "guia.pregunta.agregar",
  paraQue:
    "Suma una pregunta a la guía de la próxima sesión, con su tema (una tarjeta o una dimensión de la lista de temas) y hasta tres repreguntas. Solo la pregunta, corta y en tuteo.",
  clase: "propone",
  pide: z
    .object({
      clientId: idDeCliente,
      exploracionId: idDeExploracion,
      pregunta: textoDePregunta,
      repreguntas: z.array(textoDeRepregunta).max(MAX_REPREGUNTAS).optional(),
      tema: z.string().min(1).max(40).optional().describe("El id del tema: una tarjeta («presupuesto») o una dimensión («1.4»)."),
    })
    .strict(),
  async preparar(ctx, e) {
    const ok = await exigirLaExploracion(ctx, e.clientId, e.exploracionId, true);
    if (!ok.ok) return ok;
    const problema = problemaDelTexto([e.pregunta, ...(e.repreguntas ?? [])], e.pregunta);
    if (problema) return { ok: false, motivo: problema };
    const base = await baseDeLaGuia(ctx, e.exploracionId);
    if (e.tema && !temasPosibles(base).some((t) => t.id === e.tema)) return { ok: false, motivo: `«${e.tema}» no es un tema de esta guía: usa uno de la lista de temas.` };
    // La pregunta es la misma en la lista y al aplicar: el id lo pone el aplicar (dos aplicaciones no la duplican: va en la lista una vez).
    const { preguntas } = preguntasDeLaProxima(base);
    if (preguntas.some((p) => p.pregunta.trim().toLowerCase() === e.pregunta.trim().toLowerCase())) return { ok: false, motivo: "Esa pregunta ya está en la guía." };
    return {
      ok: true,
      datos: {
        exploracionId: e.exploracionId,
        cambio: { tipo: "agregar", pregunta: { id: "", pregunta: e.pregunta, repreguntas: e.repreguntas ?? [], ...(e.tema ? { para: e.tema } : {}), origen: "asistente" } },
      },
      linea: `Guía de la sesión ${base.ctx.proxima.numero}: sumar${e.tema ? ` (${nombreDelTema(base, e.tema)})` : ""} «${recortar(e.pregunta)}»`,
    };
  },
  async aplicar(ctx, d) {
    const cambio: CambioDeLaGuia = d.cambio.tipo === "agregar" ? { ...d.cambio, pregunta: { ...d.cambio.pregunta, id: nuevoIdDePropia() } } : d.cambio;
    await ajustarLaGuia(d.exploracionId, cambio, ctx.persona.email);
    return { ok: true };
  },
};

export const CAMBIAR_PREGUNTA: OperacionQuePropone<
  { clientId: string; exploracionId: string; clave: string; pregunta?: string; repreguntas?: string[] },
  DatosDeLaGuia,
  { ok: true },
  ContextoDeNexus
> = {
  nombre: "guia.pregunta.cambiar",
  paraQue:
    "Cambia una pregunta de la guía de la próxima sesión (por su clave), sus repreguntas o las dos. «repreguntas» las REEMPLAZA todas de una vez (hasta tres), también en una pregunta que no tiene: úsala para mejorar varias repreguntas en un paso. Del mismo tema; solo la pregunta, corta y en tuteo.",
  clase: "propone",
  pide: z
    .object({ clientId: idDeCliente, exploracionId: idDeExploracion, clave, pregunta: textoDePregunta.optional(), repreguntas: z.array(textoDeRepregunta).max(MAX_REPREGUNTAS).optional() })
    .strict(),
  preparar(ctx, e) {
    return conLaPregunta(ctx, e, (base, p, numero) => {
      if (!e.pregunta && !e.repreguntas) return { ok: false, motivo: "Di qué cambia: la pregunta, las repreguntas o las dos." };
      const problema = problemaDelTexto([e.pregunta ?? "", ...(e.repreguntas ?? [])], e.pregunta);
      if (problema) return { ok: false, motivo: problema };
      const tema = temaDe(p);
      if (e.pregunta && tema && p.paso && base.ctx.saber && repiteLoSabido(e.pregunta, { para: tema, paso: p.paso }, base.ctx.saber)) {
        return { ok: false, motivo: "Vuelve a preguntar algo que el cliente ya dijo: pregunta lo que sigue." };
      }
      return {
        ok: true,
        datos: { exploracionId: e.exploracionId, cambio: { tipo: "cambiar", clave: e.clave, ...(e.pregunta ? { pregunta: e.pregunta } : {}), ...(e.repreguntas ? { repreguntas: e.repreguntas } : {}), origen: esPropia(e.clave) ? "tuya" : "asistente" } },
        linea: lineaDelCambio({ sesion: base.ctx.proxima.numero, numero, tema: tema ? nombreDelTema(base, tema) : null, pregunta: e.pregunta, repreguntas: e.repreguntas }),
      };
    });
  },
  async aplicar(ctx, d) {
    await ajustarLaGuia(d.exploracionId, d.cambio, ctx.persona.email);
    return { ok: true };
  },
};

export const QUITAR_PREGUNTA: OperacionQuePropone<{ clientId: string; exploracionId: string; clave: string }, DatosDeLaGuia, { ok: true }, ContextoDeNexus> = {
  nombre: "guia.pregunta.quitar",
  paraQue: "Quita una pregunta de la guía de la próxima sesión, por su clave.",
  clase: "propone",
  pide: z.object({ clientId: idDeCliente, exploracionId: idDeExploracion, clave }).strict(),
  preparar(ctx, e) {
    return conLaPregunta(ctx, e, (base, p, numero) => {
      const tema = temaDe(p);
      return {
        ok: true,
        datos: { exploracionId: e.exploracionId, cambio: { tipo: "quitar", clave: e.clave } },
        linea: `Guía de la sesión ${base.ctx.proxima.numero}: quitar la ${numero}${tema ? ` (${nombreDelTema(base, tema)})` : ""}: «${recortar(p.pregunta, 70)}»`,
      };
    });
  },
  async aplicar(ctx, d) {
    await ajustarLaGuia(d.exploracionId, d.cambio, ctx.persona.email);
    return { ok: true };
  },
};

interface DatosDeLaRepregunta {
  exploracionId: string;
  clave: string;
  numero: number;
  texto: string;
}

export const CAMBIAR_REPREGUNTA: OperacionQuePropone<
  { clientId: string; exploracionId: string; clave: string; numero: number; texto: string },
  DatosDeLaRepregunta,
  { ok: true },
  ContextoDeNexus
> = {
  nombre: "guia.repregunta.cambiar",
  paraQue:
    "Cambia (o suma) UNA repregunta de una pregunta de la guía, por su clave y su número (1 a 3). Para cambiar varias de la misma pregunta, usa guia_pregunta_cambiar con «repreguntas». Corta, en tuteo, un paso más hondo que la pregunta.",
  clase: "propone",
  pide: z.object({ clientId: idDeCliente, exploracionId: idDeExploracion, clave, numero: z.number().int().min(1).max(MAX_REPREGUNTAS), texto: textoDeRepregunta }).strict(),
  async preparar(ctx, e) {
    const r = await conLaPregunta(ctx, e, (base, p, numero) => {
      const problema = problemaDelTexto([e.texto]);
      if (problema) return { ok: false, motivo: problema };
      return {
        ok: true,
        datos: { exploracionId: e.exploracionId, cambio: { tipo: "restaurar", clave: e.clave } },
        linea: `Guía de la sesión ${base.ctx.proxima.numero}: en la ${numero}, la repregunta ${e.numero}: «${recortar(e.texto)}»`,
      };
    });
    return r.ok ? { ok: true, linea: r.linea, datos: { exploracionId: e.exploracionId, clave: e.clave, numero: e.numero, texto: e.texto } } : r;
  },
  /* Las repreguntas se arman al aplicar, sobre las de AHORA: dos cambios de repregunta de la misma pregunta en la misma
     lista se preparan antes de aplicar el primero, y armarlas al preparar haría que el segundo pise al primero. */
  async aplicar(ctx, d) {
    const base = await contextoParaLaGuia(d.exploracionId);
    const p = preguntasDeLaProxima(base).preguntas.find((x) => claveDePregunta(x) === d.clave);
    if (!p) throw new ErrorDeLaGuia(409, "Esa pregunta ya no está en la guía.");
    const repreguntas = [...p.repreguntas];
    repreguntas[Math.min(d.numero, repreguntas.length + 1) - 1] = d.texto;
    await ajustarLaGuia(d.exploracionId, { tipo: "cambiar", clave: d.clave, repreguntas, origen: esPropia(d.clave) ? "tuya" : "asistente" }, ctx.persona.email, base);
    return { ok: true };
  },
};
