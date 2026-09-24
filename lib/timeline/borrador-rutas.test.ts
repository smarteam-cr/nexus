/**
 * lib/timeline/borrador-rutas.test.ts — las RUTAS del borrador del cronograma (E1): lo que la lógica
 * pura no puede asegurar solo porque vive en el cableado.
 *
 * Correr: `npx vitest run lib/timeline/borrador-rutas.test.ts --project unit`.
 *
 * Son escaneos del código (sin comentarios): montar una ruta de Next con Prisma para leer una
 * condición cuesta más de lo que protege. Cada tramo se verifica PRIMERO no vacío (si cambió la
 * forma del archivo, la guarda no puede pasar en verde por no estar mirando nada) y recién después
 * las negaciones. Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
/** Blanquea comentarios conservando saltos: NOMBRAR un problema para explicarlo no es causarlo. */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");

const APLICAR = "app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts";
const TIMELINE = "app/api/projects/[projectId]/timeline/route.ts";

describe("POST /timeline/borrador/aplicar", () => {
  const ruta = soloCodigo(leer(APLICAR));

  it("⛔ el token es obligatorio y se valida ANTES de abrir la transacción", () => {
    /* La edición que la pone en rojo: aceptar un cuerpo sin `token` (se aplicaría «la que haya»). */
    const iToken = ruta.indexOf('if (!("token" in body)');
    const iTx = ruta.indexOf("prisma.$transaction(");
    expect(iToken, "no se exige el token").toBeGreaterThan(-1);
    expect(iTx, "la ruta ya no abre una transacción").toBeGreaterThan(-1);
    expect(iToken).toBeLessThan(iTx);
    const bloque = ruta.slice(iToken, ruta.indexOf("\n  }", iToken));
    expect(bloque.length).toBeGreaterThan(40);
    expect(bloque).toContain("status: 400");
    expect(ruta, "falta exigir la huella").toContain('typeof body.huella !== "string"');
    expect(ruta, "falta exigir la lista de lo desmarcado").toContain("!Array.isArray(body.sin)");
  });

  it("⭐ el plan se calcula y se compara DENTRO de la transacción, con el núcleo compartido", () => {
    /* La edición que la pone en rojo: planear o escribir en la ruta, fuera del cuerpo probado con el
       `tx` falso y contra la base (escribir-estructura.test.ts / borrador-aplicar.int.test.ts). */
    const tx = ruta.slice(ruta.indexOf("prisma.$transaction("), ruta.indexOf("} catch (e) {"));
    expect(tx.length, "la guarda no está mirando la transacción").toBeGreaterThan(80);
    expect(tx).toContain("aplicarBorradorEnTx(tx,");
    expect(tx).toContain("timeout: 30000");
    expect(ruta, "la ruta planea por su cuenta").not.toContain("planDeAplicacion(");
    expect(ruta, "la ruta escribe fases por su cuenta").not.toMatch(/timelinePhase\.(update|create|updateMany)\(/);
    // Los motivos para no aplicar salen con su código y su status.
    expect(ruta).toContain("if (e instanceof ErrorAlAplicar) {");
    expect(ruta).toContain("{ error: e.codigo, message: e.message }, { status: e.status }");
  });

  it("la auditoría, el evento del arranque y el desenlace van DESPUÉS de la transacción", () => {
    /* La edición que la pone en rojo: meterlos adentro (alarga la transacción contra el pooler) o
       perder el evento del arranque (el watchdog no se entera de que se movieron todas las fechas). */
    const iTx = ruta.indexOf("prisma.$transaction(");
    const iAudit = ruta.indexOf("prisma.timelineChange.create(");
    const iEvento = ruta.indexOf("emitTimelineEventsSafe(");
    expect(iAudit).toBeGreaterThan(iTx);
    expect(iEvento).toBeGreaterThan(iTx);
    expect(ruta.slice(iEvento, iEvento + 900)).toContain('action: "ANCHOR_CHANGED"');
    expect(ruta, "la razón dejó de decir el corrimiento del cierre").toContain("describeEndShift(");
    // Anotar el desenlace no reaviva la corrida en el feed (`updatedAt` es @updatedAt).
    const iDesenlace = ruta.indexOf('desenlace: "resuelta"');
    expect(iDesenlace).toBeGreaterThan(iTx);
    const update = ruta.slice(ruta.lastIndexOf("prisma.agentRun.update(", iDesenlace), ruta.indexOf("});", iDesenlace));
    expect(update).toContain("updatedAt: run.updatedAt");
  });

  it("la respuesta dice cuántos se aplicaron, que no queda nada pendiente, el origen y las tareas corridas", () => {
    /* Sin `pendientes` y `origen` la pantalla no encadena el paso 2 de «Regenerar todo». */
    const respuesta = ruta.slice(ruta.lastIndexOf("return NextResponse.json({"));
    expect(respuesta.length).toBeGreaterThan(50);
    expect(respuesta).toContain("aplicadas,");
    expect(respuesta).toContain("pendientes: 0,");
    expect(respuesta).toMatch(/\borigen,/);
    expect(respuesta).toMatch(/avisos:\s*avisosDeReubicacion/);
  });
});

describe("PUT /timeline con motivo, con una propuesta abierta", () => {
  const ruta = soloCodigo(leer(TIMELINE));
  const put = ruta.slice(ruta.indexOf("export async function PUT("), ruta.indexOf("// 5. Re-cargar el estado final"));

  it("⛔ responde 409 en vez de borrar la propuesta en silencio; el autoguardado sigue igual", () => {
    /* La edición que la pone en rojo: volver a limpiar `pendingProposal` en el upsert, o chequear
       también en el autoguardado (editar a mano con una propuesta abierta está permitido). */
    expect(put.length, "la guarda no encontró el PUT").toBeGreaterThan(2000);
    const iChequeo = put.indexOf("if (!skipAudit) {");
    const iUpsert = put.indexOf("tx.projectTimeline.upsert(");
    expect(iChequeo, "el PUT con motivo ya no mira si hay una propuesta abierta").toBeGreaterThan(-1);
    expect(iChequeo).toBeLessThan(iUpsert);
    const chequeo = put.slice(iChequeo, iUpsert);
    expect(chequeo).toContain("pendingProposal: { not: Prisma.DbNull }");
    expect(chequeo).toContain("statusCode: 409");
    expect(chequeo).toContain("MENSAJE_PROPUESTA_ABIERTA");
    // El upsert existe y ya no toca la propuesta.
    const upsert = put.slice(iUpsert, put.indexOf("timelineId = tl.id", iUpsert));
    expect(upsert.length).toBeGreaterThan(200);
    expect(upsert).not.toContain("pendingProposal");
    // Y el 409 llega a la pantalla con el texto en `error` (lo que muestran la pantalla y el chat).
    expect(put).toContain('if (status === 409) {');
    expect(put).toContain('{ error: (err as Error).message, code: "PROPUESTA_ABIERTA" }, { status: 409 }');
  });
});
