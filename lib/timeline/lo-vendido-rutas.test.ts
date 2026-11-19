/**
 * lib/timeline/lo-vendido-rutas.test.ts — las guardas de las RUTAS de «el cronograma sale de lo vendido» (2026-11-18,
 * pedidas por la revisión): lo que un test puro no ve porque vive en el texto de la ruta.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const ESTRUCTURA = "app/api/projects/[projectId]/timeline/estructura/route.ts";
const ANALYZE = "app/api/clients/[id]/analyze/route.ts";

describe("el paso 1 junta fases solo con un límite confirmado, y con la foto de ANTES del modelo", () => {
  const src = leer(ESTRUCTURA);

  it("`puedeJuntar` sale de `pasaUnLimiteConfirmado` y llega al armador", () => {
    /* La edición que la pone en rojo: pasar `puedeJuntar: true` fijo, o sacarlo del armador. */
    expect(src).toContain("const puedeJuntar = !!revision && pasaUnLimiteConfirmado(revision);");
    const iArmado = src.indexOf("construirPropuestaDeEstructura({");
    expect(src.slice(iArmado, src.indexOf("});", iArmado))).toContain("puedeJuntar,");
  });

  it("la foto de la fase que se va se lee ANTES de llamar al modelo (lo editado mientras piensa, choca)", () => {
    const iFoto = src.indexOf("const fotoConTareas = await prisma.timelinePhase.findMany(");
    const iModelo = src.indexOf("anthropic.messages.create(");
    expect(iFoto).toBeGreaterThan(0);
    expect(iFoto).toBeLessThan(iModelo);
    expect(src).toContain("vivoDeLaBase(tl.anchorStartDate, fotoConTareas)");
    expect(src).toContain('tipo: "fase-se-va",');
  });
});

describe("el handoff lee propuestas publicadas de SU cliente, y no las de un ciclo anterior", () => {
  const src = leer(ANALYZE);
  const i = src.indexOf("LA PROPUESTA COMERCIAL DE ESTOS TRATOS");
  const bloque = src.slice(i, src.indexOf("textoDeLaPropuestaParaElHandoff({", i));

  it("filtra por el cliente (invariante 1) y solo lo publicado", () => {
    expect(i).toBeGreaterThan(0);
    expect(bloque).toContain('where: { clientId, hubspotDealId: { in: [...nombreDelTrato.keys()] }, status: "PUBLISHED"');
  });

  it("deja afuera el trato del hermano mayor, el de otro proyecto y el de otro ciclo", () => {
    expect(bloque).toContain("esDealDelMayor(d.id)");
    expect(bloque).toContain("isForeignProjectDeal(nombre)");
    expect(bloque).toContain("esTratoDeOtroCiclo(");
  });
});

describe("las horas de las tareas viajan hasta el aviso", () => {
  it("la pantalla conserva `horasEstimadas` al cargar las fases (sin esto el aviso nunca compara)", () => {
    expect(leer("components/canvas/CronogramaCanvas.tsx")).toContain("horasEstimadas: t.horasEstimadas ?? null,");
  });

  it("aplicar una propuesta escribe las horas de las tareas nuevas", () => {
    expect(leer("lib/timeline/escribir-tareas.ts")).toContain('typeof n.tarea.horas === "number" ? { horasEstimadas: n.tarea.horas } : {}');
  });

  it("el chat lee las mismas horas que la pantalla", () => {
    expect(leer("lib/asistente/contexto.ts")).toContain("horasEstimadas: true, party: true");
  });

  it("la vista del cliente NO lleva las horas", () => {
    expect(leer("lib/external/timeline-view.ts")).not.toContain("horasEstimadas");
  });
});
