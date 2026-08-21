/**
 * lib/asistente/contexto.test.ts — EL CHAT NO SE COME EL CONTEXTO DEL EDITOR.
 *
 * Correr: `npx vitest run lib/asistente/contexto.test.ts --project unit`.
 *
 * ── LA DECISIÓN QUE ESTO PROTEGE ─────────────────────────────────────────────────────────────
 * ⭐ «El chat entiende la INTENCIÓN; el editor tiene el CONTEXTO.» El asistente carga la forma
 * del documento y qué se puede pedir — nunca el handoff, las minutas ni el cronograma entero.
 *
 * ⚠ **El modo de falla es MUDO, y por eso hace falta un test y no un comentario.** Sumarle
 * `loadHandoffContext` al prefijo no rompe nada: el chat sigue contestando, incluso un poco
 * mejor. Lo que cambia es que el prefijo se re-arma en CADA turno, así que veinte turnos por
 * conversación × quince conversaciones por día convierten «un poco mejor» en varios dólares
 * diarios que salen del mismo tope que comparten handoff, kickoff, cronograma y briefs. Eso se
 * descubre en la factura tres semanas después, no en una pantalla roja.
 *
 * La segunda familia es de privacidad: el chat es una superficie NUEVA que no está en ningún
 * censo, y los datos del programa de partner (UUS, seats, MRR) están declarados confidenciales
 * por los términos con HubSpot. La prohibición se escribe ANTES de que exista un campo donde
 * meterlos — que es cuando todavía es barata.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, listarTsx } from "@/lib/ui/scan-source";
import { TECHO_DEL_PREFIJO_CHARS } from "./contexto";

/** Blanquea comentarios conservando offsets: NOMBRAR algo para prohibirlo no es usarlo. */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");
}

function archivosDelAsistente(): string[] {
  return listarTsx(path.join("lib", "asistente")).filter((f) => !f.endsWith(".test.ts"));
}

/**
 * Los cargadores PESADOS. Cada uno trae miles de caracteres y todos tienen su dueño legítimo:
 * el editor que ejecuta la instrucción, no la conversación que la acuerda.
 */
const CARGADORES_PESADOS = [
  "loadHandoffContext",
  "loadTimelineContext",
  "loadDesarrolloContext",
  "loadCanvasContext",
  "cargarContextoDelAssist",
  "cargarContextoDelDetalle",
  "renderDetalleDeCronograma",
  "fetchTranscriptContent",
  "getProjectMemberSessions",
  "planHandoffSessionBudget",
];

describe("el contexto del chat se mantiene liviano", () => {
  it("⛔ el asistente no importa ningún cargador de contexto pesado", () => {
    /* La edición que la pone en rojo: `import { loadHandoffContext } from "@/lib/canvas/..."`
       en contexto.ts — que es exactamente el gesto de «démosle todo, total entiende mejor». */
    const infracciones: string[] = [];
    for (const archivo of archivosDelAsistente()) {
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      for (const cargador of CARGADORES_PESADOS) {
        if (src.includes(cargador)) {
          infracciones.push(`${archivo.split(path.sep).join("/")} → ${cargador}`);
        }
      }
    }
    expect(
      infracciones,
      "El chat cargó contexto pesado. El prefijo se re-arma en CADA turno: lo que acá parece " +
        "«un poco más de contexto» son dólares por día que aparecen en la factura, no en una " +
        "pantalla. El contexto pesado es del EDITOR que ejecuta la instrucción.",
    ).toEqual([]);
  });

  it("⛔ tampoco lee las tablas de contenido crudo (transcripts, bloques, tareas)", () => {
    /* El otro camino al mismo lugar: en vez de importar el cargador, consultar la tabla. */
    const infracciones: string[] = [];
    for (const archivo of archivosDelAsistente()) {
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      for (const tabla of ["firefliesSession", "handoffSource", "canvasBlock"]) {
        if (src.includes(`prisma.${tabla}.`)) {
          infracciones.push(`${archivo.split(path.sep).join("/")} → prisma.${tabla}`);
        }
      }
    }
    expect(
      infracciones,
      "El chat fue a buscar contenido crudo directo a la base. Mismo problema que la guarda " +
        "anterior con otra puerta: la forma del documento alcanza para conversar.",
    ).toEqual([]);
  });

  it("el techo del prefijo sigue siendo una decisión chica, no un número que creció solo", () => {
    /* Si alguien lo sube, que sea un diff que se lee — que es exactamente lo que pasó el
       2026-08-21: subió de 6.000 a 13.000 porque entraron las TAREAS, sin las cuales el chat
       tenía tres operaciones que no podía emitir. Medido sobre los 51 cronogramas reales, con el
       handle de 5 caracteres el más grande queda en ~11.000 y ninguno se pasa.

       El límite de acá arriba es el que impide que el próximo agregado entre sin medirlo. */
    expect(TECHO_DEL_PREFIJO_CHARS).toBeLessThanOrEqual(15_000);
  });
});

describe("ningún dato de partner ni de costos cruza al asistente", () => {
  /* ⚠ El chat es una superficie NUEVA: no está en el censo `LECTORES` de handoff-al-cliente ni
     en el de la Entrega. Los datos del programa de partner están declarados CONFIDENCIALES por
     los términos con HubSpot (`prisma/schema.prisma`, PartnerUsageSnapshot). Y los costos son
     del negocio de Smarteam, no de la conversación sobre el proyecto del cliente. */
  const PROHIBIDOS = [
    "PartnerUsageSnapshot",
    "ClientPartnerSnapshot",
    "partnerUsageSnapshot",
    "clientPartnerSnapshot",
    "uusScore",
    "uusTrend",
    "mrrTotal",
    "marketingContactsUsed",
    "consumptionScore",
    "servicioContratado",
    "ServicioContratado",
    "bitacoraCobro",
    "montoUsd",
  ];

  it("⛔ allowlist VACÍA, a propósito: levantarla tiene que ser un diff en castellano", () => {
    /* La edición que la pone en rojo: leer `prisma.partnerUsageSnapshot` desde el contexto del
       chat «para que sepa cuánto paga el cliente». */
    const infracciones: string[] = [];
    for (const archivo of archivosDelAsistente()) {
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      for (const prohibido of PROHIBIDOS) {
        if (src.includes(prohibido)) {
          infracciones.push(`${archivo.split(path.sep).join("/")} → ${prohibido}`);
        }
      }
    }
    expect(
      infracciones,
      "Datos de partner o de cobranza en el contexto del asistente. Los de partner son " +
        "confidenciales por los términos con HubSpot; los de cobranza son del negocio de " +
        "Smarteam y no de la conversación sobre el proyecto del cliente.",
    ).toEqual([]);
  });
});

describe("el contexto del cronograma dice lo que el chat necesita para hablar de fechas", () => {
  const src = fs.readFileSync(path.join(RAIZ, "lib/asistente/contexto.ts"), "utf8");

  it("⚠ trae el cierre proyectado: sin eso el chat no puede avisar que una fecha se mueve", () => {
    /* Decisión de Elías: «toda propuesta que mueva una fecha lo DICE. Y si no la mueve, también».
       El silencio se lee como «no cambió nada». La edición que la pone en rojo: sacar
       `projectedEnd` del contexto — el chat seguiría contestando, mudo sobre las fechas. */
    expect(src).toContain("projectedEnd(");
    expect(src).toContain("cierreActual");
  });

  it("⛔ las reglas duras se INTERPOLAN del único lugar donde viven, no se transcriben", () => {
    /* Dos copias divergen calladas, y la divergencia se manifiesta como el chat prometiéndole al
       CSE algo que el modificador no puede hacer — el problema que el chat vino a resolver, pero
       peor: ahora afirmado por escrito. */
    expect(src).toContain("REGLAS_DURAS_DEL_CRONOGRAMA");
    expect(
      src.includes("Conserva los ids EXACTOS"),
      "las reglas duras están transcritas en vez de interpoladas: la copia va a divergir",
    ).toBe(false);
  });

  it("⛔ las NOTAS de las tareas nunca cruzan — el título sí, y es la tercera línea", () => {
    /* ⚠ ESTA GUARDA SE MOVIÓ DOS VECES, Y EL RECORRIDO ES LA LECCIÓN.

       v1 (2026-08-19): «no toques `tasks`». El contexto daba solo el total por fase. Elías pidió
       «en Integraciones hay semanas sin tareas, quítalas» y el chat no podía verlo.
       v2 (2026-08-20): «solo contadores» — entraron `weekIndex` y `status`. Elías pidió «pasá la
       sesión de cierre al final» y «borrá la última base»: el chat no tenía con qué nombrarlas.
       v3 (2026-08-21, esta): entran `id` y `title`. Medido: de nueve pedidos distintos que hizo
       de verdad, seis morían acá.

       Las dos veces la guarda defendió una línea que el uso corrió. Lo que NO se movió nunca es
       lo que separa la FORMA del cronograma de su CONTENIDO de negocio, y ahí siguen las notas:
       son texto libre del CSE, no hacen falta para conversar sobre estructura, y el modificador
       ya las lee cuando ejecuta.

       La edición que la pone en rojo: sumar `notes: true` al select de tareas. */
    /* ⚠ `source` entró el 2026-08-21 y NO es contenido: es la procedencia, un enum de tres
       valores. Sin ella el chat no podía saber que una tarea pendiente la cargó una persona —y
       por lo tanto está protegida— así que proponía borrarla para que el ejecutor la rechazara
       después. Las que crea el propio chat nacen HUMAN: no podía deshacer lo que acababa de hacer. */
    expect(src).toContain(
      "select: { id: true, title: true, weekIndex: true, status: true, source: true }",
    );
    expect(
      src.includes("notes: true"),
      "el contexto del chat pasó a traer las NOTAS de las tareas: eso es contenido de negocio, " +
        "no la forma del cronograma — y el modificador ya las lee cuando le toca ejecutar",
    ).toBe(false);
  });

  it("⛔ y las tareas se nombran por HANDLE, no por el cuid entero", () => {
    /* Es lo único que hace que el cronograma más grande entre en el techo: el id completo son 25
       caracteres × 98 tareas. Medido, con cuids enteros 7 de los 51 cronogramas se pasaban.
       Y el handle NO puede salir del principio del id: las tareas de un cronograma nacen en el
       mismo `createMany` y comparten prefijo — 1.063 colisiones medidas con 8 caracteres.

       La edición que la pone en rojo: interpolar `t.id` en vez de `handleDeTarea(t.id)`. */
    expect(src).toContain("handleDeTarea(t.id)");
    expect(
      /\$\{t\.id\}/.test(src),
      "el contexto interpola el id crudo de una tarea: son 20 caracteres de más por tarea",
    ).toBe(false);
  });

  it("⭐ y sí trae el reparto por semana, que es lo que deja pedir «sacá las vacías»", () => {
    /* Sin esto vuelve el caso exacto del 2026-08-20: el CSE ve cuatro semanas vacías en pantalla
       y el asistente no. La edición que la pone en rojo: volver al total por fase. */
    expect(src).toContain("semanas VACÍAS");
    expect(src).toContain("porSemana");
  });
});
