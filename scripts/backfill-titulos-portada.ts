/**
 * scripts/backfill-titulos-portada.ts
 *
 * Le pone TÍTULO CORTO a las portadas de los documentos del motor que ya tienen
 * contenido escrito — sin regenerar el documento.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Las portadas ganaron un campo de título corto, y el respaldo hace que ninguna quede
 * sin título: mientras no tenga uno propio, se muestra su titular. El problema es que
 * ese titular suele ser largo ("Requerimiento técnico: Migración Salesforce → HubSpot +
 * Integraciones Slack, Jira y Aircall"), que es justo lo que se quería dejar de ver
 * arriba.
 *
 * La alternativa era regenerar cada documento entero. Eso cuesta caro, reescribe TODAS
 * las secciones y pisaría lo que alguien haya curado a mano. Este script hace lo mínimo:
 * lee lo que la portada YA dice y escribe una sola clave, `titulo`. Ninguna otra sección
 * se toca, ningún otro campo se toca.
 *
 * ── QUÉ NO HACE ──────────────────────────────────────────────────────────────
 * · No inventa contenido: si la portada está vacía (sin titular ni resumen) la SALTEA.
 *   Ahí no hay nada que resumir y lo que corresponde es correr el agente del documento.
 * · No pisa un título ya escrito.
 * · No cambia `source` del bloque: un bloque curado a mano sigue marcado como tal.
 * · No re-publica nada — CON UNA EXCEPCIÓN QUE HAY QUE SABER. Los documentos compartidos
 *   con el CLIENTE guardan una foto congelada y siguen mostrando su portada anterior hasta
 *   que alguien los vuelva a subir. Pero el requerimiento técnico (`tech-requirements`) NO
 *   tiene foto: el desarrollador externo lo lee EN VIVO contra la base, así que un título
 *   escrito acá le aparece al instante. No es dañino —solo se agrega un título donde no
 *   había— pero cambia lo que ve alguien de afuera sin que nadie apriete "publicar".
 *
 * Ensayo primero, como todo saneo del repo:
 *   npx tsx scripts/backfill-titulos-portada.ts                  # muestra qué escribiría
 *   npx tsx scripts/backfill-titulos-portada.ts --apply
 *   npx tsx scripts/backfill-titulos-portada.ts --slug=kickoff   # acota a un tipo
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import type { Prisma } from "@prisma/client";
import { anthropic } from "@/lib/anthropic";
import { loadCanvasContext } from "@/lib/canvas/load-canvas-context";
import { HERO_TITLE_MAX_CHARS } from "@/lib/landing/hero-title";

// Presupuesto de conexiones ACOTADO (scripts/lib/db.ts): el pooler comparte ~15 slots
// con producción y las dos PCs de dev; un pool sin tope se comía 10 él solo.
const { prisma, close } = createScriptDb();

const MODEL = "claude-sonnet-4-6";
const APPLY = resolverApply();
const SLUG_FILTRO = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1] ?? null;
/**
 * Portadas VACÍAS cuyo documento SÍ tiene cuerpo escrito: se les redacta la portada
 * resumiendo lo que el propio documento ya dice.
 *
 * Va detrás de una bandera y no en la corrida normal porque escribe TRES campos
 * (título, titular y resumen) en vez de uno, y eso ya es redactar la portada, no
 * rotularla. Sigue sin inventar: todo sale del texto que ese documento tiene adentro
 * y que alguien ya revisó. Un documento sin cuerpo se saltea igual — ahí no hay nada
 * que resumir y lo que corresponde es correr su agente.
 */
const DESDE_CUERPO = process.argv.includes("--desde-cuerpo");

/**
 * La portada de cada documento: su clave de sección y el EJEMPLO de título que se le
 * muestra al modelo.
 *
 * ⚠ El ejemplo NO es el rótulo de la sección. Para cuatro documentos coinciden, pero
 * para dos no: el rótulo del Kickoff es "¡Arranquemos juntos!" (un saludo) y el de
 * Exploración es "Qué hay que entender de este proyecto" (una frase). Pasarle esos como
 * ejemplo le pide al modelo, literalmente, que escriba una frase en vez de un nombre —
 * y eso fue exactamente lo que devolvió en la primera pasada ("Lo que está en juego en
 * la cuenta después de 11 semanas"). Acá va el nombre del documento, el mismo que usan
 * las guías de las defs.
 */
const PORTADAS: Record<string, { key: string; ejemplo: string }> = {
  kickoff: { key: "bienvenida", ejemplo: "Kickoff del proyecto" },
  "tech-requirements": { key: "requerimiento", ejemplo: "Requerimiento técnico" },
  exploration: { key: "exploracion", ejemplo: "Exploración del negocio" },
  diagnosis: { key: "diagnostico", ejemplo: "Diagnóstico de rendimiento" },
  planning: { key: "planificacion", ejemplo: "Plan de implementación" },
  implementation: { key: "implementacion", ejemplo: "Guía de construcción" },
};

interface Fila {
  blockId: string;
  canvasId: string;
  projectId: string;
  slug: string;
  proyecto: string;
  titular: string;
  resumen: string;
  /** La portada está vacía y hay que redactarla desde el cuerpo del documento. */
  vacia: boolean;
  data: Record<string, unknown>;
}

interface PortadaRedactada {
  titulo: string;
  headline: string;
  subhead: string;
}

/**
 * Redacta la portada de un documento cuyo cuerpo YA está escrito pero cuya portada
 * quedó en blanco (típico de los documentos generados antes de que la portada existiera).
 *
 * No inventa: el único material es el texto que ese mismo documento tiene adentro. Si el
 * cuerpo viene vacío, devuelve null y el documento se saltea — ahí sí hay que correr su
 * agente.
 */
async function redactarPortada(f: Fila, apretar?: string): Promise<PortadaRedactada | null> {
  const { ejemplo } = PORTADAS[f.slug];
  const cuerpo = (await loadCanvasContext(f.projectId, f.slug)).slice(0, 9000);
  if (cuerpo.trim().length < 200) {
    console.warn(`    ⚠ el documento no tiene cuerpo del que redactar (${cuerpo.trim().length} caracteres)`);
    return null;
  }

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    system:
      `Redactás la PORTADA de un documento a partir de su propio contenido. Devolvés JSON ` +
      `con exactamente tres claves:
` +
      `"titulo": el nombre del documento, máximo ${HERO_TITLE_MAX_CHARS} caracteres, sintagma ` +
      `nominal del tipo "${ejemplo}", pudiendo precisar de qué trata este caso.
` +
      `"headline": UNA frase con lo principal que dice el documento.
` +
      `"subhead": una o dos frases de resumen.
` +
      `REGLA DURA: todo tiene que salir del contenido que te paso. No agregues datos, cifras ` +
      `ni promesas que no estén ahí. Si algo no está, no lo digas.
` +
      `No nombres al cliente ("${f.proyecto}").
` +
      `Respondé SOLO el JSON, sin explicación ni bloque de código.`,
    messages: [
      {
        role: "user",
        content:
          `Contenido del documento:

${cuerpo}` +
          (apretar
            ? `

Tu "titulo" anterior fue "${apretar}" (${apretar.length} caracteres): pasa el tope de ` +
              `${HERO_TITLE_MAX_CHARS}. Devolvé el JSON otra vez con un "titulo" más corto.`
            : ""),
      },
    ],
  });
  const crudo = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  // Cada motivo de descarte se DICE. Callarlos los volvía indistinguibles entre sí:
  // "sin cuerpo del que redactar" se mostraba igual cuando el documento tenía 22.000
  // caracteres y lo que había fallado era el formato de la respuesta.
  let json: Partial<PortadaRedactada>;
  try {
    json = JSON.parse(crudo.replace(/^```(?:json)?|```$/g, "").trim()) as Partial<PortadaRedactada>;
  } catch {
    console.warn(`    ⚠ la respuesta no vino en el formato esperado (${crudo.length} caracteres, ` +
      `${msg.stop_reason === "max_tokens" ? "se quedó sin espacio" : String(msg.stop_reason)})`);
    return null;
  }
  const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const titulo = t(json.titulo);
  if (!titulo) {
    console.warn(`    ⚠ la respuesta no trajo título`);
    return null;
  }
  if (titulo.length > HERO_TITLE_MAX_CHARS) {
    if (apretar) {
      console.warn(`    ⚠ dos intentos pasados de largo (${apretar.length} y ${titulo.length}): "${titulo}"`);
      return null;
    }
    // Un solo reintento, diciéndole por cuánto se pasó. Mismo criterio que el camino
    // del título suelto: descartar dejaría la portada vacía, que es peor.
    return redactarPortada(f, titulo);
  }
  return { titulo, headline: t(json.headline), subhead: t(json.subhead) };
}

/** Una sola llamada al modelo. `apretar` = segundo intento pidiendo que lo acorte. */
async function unIntento(f: Fila, apretar?: string): Promise<string> {
  const { ejemplo } = PORTADAS[f.slug];
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 100,
    system:
      `Escribís el TÍTULO de una página de documento. Máximo ${HERO_TITLE_MAX_CHARS} caracteres. ` +
      `Es un sintagma nominal —el nombre del documento, del tipo "${ejemplo}"— y puede precisar ` +
      `de qué trata este caso concreto (los sistemas involucrados, el objeto del trabajo). ` +
      `No es un titular de venta: sin verbos conjugados, sin promesas y sin dos puntos seguidos ` +
      `de una enumeración.\n` +
      // El nombre del cliente se prohíbe CON NOMBRE Y APELLIDO, no en abstracto: la regla
      // genérica se incumplía 1 de cada 5 veces, y cada "para <cliente>" se come caracteres
      // que le hacen falta al sistema o al objeto del trabajo. Además el documento ya vive
      // dentro del proyecto de ese cliente: repetirlo no agrega nada.
      `PROHIBIDO nombrar al cliente: no escribas "${f.proyecto}" ni ninguna de sus palabras, ` +
      `ni fórmulas del tipo "para <cliente>".\n` +
      `Respondé SOLO con el título, sin comillas ni explicación.`,
    messages: [
      {
        role: "user",
        content:
          `Tipo de documento: ${ejemplo}\n` +
          `Titular actual: ${f.titular || "(vacío)"}\n` +
          `Resumen actual: ${f.resumen || "(vacío)"}\n\n` +
          (apretar
            ? `Tu intento anterior fue "${apretar}" (${apretar.length} caracteres): pasa el tope. ` +
              `Escribilo de nuevo en ${HERO_TITLE_MAX_CHARS} caracteres o menos, sacando lo accesorio ` +
              `y conservando lo que identifica al documento.\n\nEl título corto:`
            : `El título corto:`),
      },
    ],
  });
  return msg.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim()
    .replace(/^["'«»]|["'«»]$/g, "")
    .trim();
}

/**
 * Pide UN título corto a partir de lo que la portada ya dice.
 *
 * Un título más largo que el tope NO se recorta con puntos suspensivos —cortar una frase
 * a la mitad se lee peor que una larga— y tampoco se acepta: reintroduciría justo el
 * problema que este backfill corrige. Se pide de nuevo una vez, diciendo por cuánto se
 * pasó; si el segundo intento tampoco entra, se salta y queda para hacerlo a mano.
 */
async function pedirTitulo(f: Fila): Promise<string | null> {
  let texto = await unIntento(f);
  if (texto.length > HERO_TITLE_MAX_CHARS) {
    const largo = texto;
    texto = await unIntento(f, largo);
    if (texto.length > HERO_TITLE_MAX_CHARS) {
      console.warn(`    ⚠ dos intentos pasados de largo (${largo.length} y ${texto.length}): "${texto}"`);
      return null;
    }
  }
  return texto || null;
}

async function main() {
  const slugs = SLUG_FILTRO ? [SLUG_FILTRO] : Object.keys(PORTADAS);
  const desconocido = slugs.find((s) => !PORTADAS[s]);
  if (desconocido) {
    console.error(`Slug desconocido: ${desconocido}. Opciones: ${Object.keys(PORTADAS).join(", ")}`);
    process.exit(1);
  }

  const filas: Fila[] = [];
  for (const slug of slugs) {
    const { key } = PORTADAS[slug];
    const bloques = await prisma.canvasBlock.findMany({
      // blockType CARD y en ORDEN a propósito: la portada podría tener más de un bloque
      // (pasa: hay una con dos, uno editado a mano y uno del agente). Sin filtrar, se le
      // escribiría un título distinto a cada uno; y como la pantalla toma el primer CARD
      // y la impresión toma el primer bloque a secas, papel y pantalla dirían cosas
      // distintas del mismo documento.
      where: {
        blockType: "CARD",
        section: { key, canvas: { slug, projectId: { not: null } } },
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        data: true,
        section: {
          select: {
            canvasId: true,
            canvas: { select: { slug: true, projectId: true, project: { select: { name: true } } } },
          },
        },
      },
    });
    for (const b of bloques) {
      const data = (b.data ?? {}) as Record<string, unknown>;
      const txt = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
      if (txt("titulo")) continue; // ya tiene título propio: no se pisa
      const titular = txt("headline");
      const resumen = txt("subhead");
      const vacia = !titular && !resumen;
      // Portada vacía: solo entra si se pidió redactarla desde el cuerpo (--desde-cuerpo).
      if (vacia && !DESDE_CUERPO) continue;
      filas.push({
        blockId: b.id,
        canvasId: b.section.canvasId,
        projectId: b.section.canvas.projectId ?? "",
        vacia,
        slug: b.section.canvas.slug ?? slug,
        proyecto: b.section.canvas.project?.name ?? "?",
        titular,
        resumen,
        data,
      });
    }
  }

  if (filas.length === 0) {
    console.log("Ninguna portada con contenido y sin título. Nada que hacer.");
    return;
  }

  console.log(`${filas.length} portada(s) con contenido y sin título corto:\n`);
  let escritas = 0;
  for (const f of filas) {
    let titulo: string | null;
    let redaccion: PortadaRedactada | null = null;
    if (f.vacia) {
      redaccion = await redactarPortada(f);
      titulo = redaccion?.titulo ?? null;
      if (!titulo) {
        console.log(`  ·  ${f.proyecto} — ${f.slug}: no se pudo redactar la portada (motivo arriba), se salta`);
        continue;
      }
    } else {
      titulo = await pedirTitulo(f);
      if (!titulo) {
        console.log(`  ·  ${f.proyecto} — ${f.slug}: sin título utilizable, se salta`);
        continue;
      }
    }
    console.log(`  ${APPLY ? "ESCRIBE" : "escribiría"}  ${f.proyecto} — ${f.slug}${f.vacia ? "  (portada redactada desde el cuerpo)" : ""}`);
    console.log(`      título:  "${titulo}"`);
    if (redaccion) {
      console.log(`      titular: "${redaccion.headline.slice(0, 80)}"`);
      console.log(`      resumen: "${redaccion.subhead.slice(0, 80)}"`);
    } else {
      console.log(`      pasa a bajada:  "${f.titular.slice(0, 70)}${f.titular.length > 70 ? "…" : ""}"`);
    }
    if (APPLY) {
      // Se RE-LEE el bloque justo antes de escribir. Entre la lectura inicial y este
      // momento pasaron una o dos llamadas al modelo por fila —minutos, en una tanda—
      // y en esa ventana alguien pudo haber editado el documento desde la pantalla.
      // Escribir la copia vieja le borraría ese trabajo, y como CanvasBlock no guarda
      // fecha de modificación, el pisado sería invisible.
      const fresco = await prisma.canvasBlock.findUnique({
        where: { id: f.blockId },
        select: { data: true },
      });
      if (!fresco) {
        console.log(`      (el bloque ya no existe, se salta)`);
        continue;
      }
      const dataFresca = (fresco.data ?? {}) as Record<string, unknown>;
      const escrito = (k: string) => typeof dataFresca[k] === "string" && (dataFresca[k] as string).trim().length > 0;
      if (escrito("titulo")) {
        console.log(`      (le escribieron un título mientras tanto, se respeta el suyo)`);
        continue;
      }
      /* La re-lectura tiene que cubrir TODO lo que esta fila va a escribir, no solo el
         título. Con `--desde-cuerpo` también se escriben `headline` y `subhead`, y esos
         se redactan justamente porque la portada estaba vacía: si en la ventana de la
         llamada al modelo alguien la llenó a mano, es la mano la que gana. Chequear solo
         `titulo` dejaba pasar ese caso —el título seguía vacío— y le borraba el titular
         y el resumen recién escritos. */
      if (redaccion && (escrito("headline") || escrito("subhead"))) {
        console.log(`      (redactaron la portada a mano mientras tanto, se respeta la suya)`);
        continue;
      }
      // Solo la clave `titulo`. El resto de la data —y el `source` del bloque— quedan igual.
      await prisma.canvasBlock.update({
        where: { id: f.blockId },
        data: {
          data: {
            ...dataFresca,
            titulo,
            ...(redaccion ? { headline: redaccion.headline, subhead: redaccion.subhead } : {}),
          } as Prisma.InputJsonValue,
        },
      });
      // Marca el canvas como cambiado: es lo que hace que un documento ya compartido
      // muestre "cambios sin subir" en vez de decir "Al día" mintiendo. Escribir por
      // fuera de las rutas normales se saltea esa marca (la ponen las rutas de bloques
      // vía lib/canvas/touch-content.ts), y una barra que dice "Al día" sobre contenido
      // que el cliente todavía no vio es peor que no tener barra. Pasó: el kickoff de
      // JUDESUR quedó diciendo "Al día" con el título nuevo sin publicar.
      // Se escribe con el cliente de este script en vez de reusar el helper para no
      // abrir una segunda conexión a la base desde una tanda.
      await prisma.projectCanvas.update({
        where: { id: f.canvasId },
        data: { contentUpdatedAt: new Date() },
      });
    }
    escritas++;
  }

  console.log(
    `\n${APPLY ? `Listo: ${escritas} título(s) escrito(s).` : `Ensayo: ${escritas} se escribirían. Corré con --apply.`}`,
  );
  if (!APPLY) console.log("(El ensayo YA consultó al modelo: los textos de arriba son los que se escribirían.)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => close());
