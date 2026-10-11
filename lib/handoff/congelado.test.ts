/**
 * lib/handoff/congelado.test.ts — EL HANDOFF SE CONGELA (etapa 3b, DECISIONS «El handoff se congela»).
 *
 * Las reglas puras (el estado desde los hitos, qué hace /analyze con cada pedido, qué cuenta como cambio del
 * handoff) y los candados de las puertas: la puerta del congelado va entre el veto y el trabajo de la
 * generación, «Buscar lo nuevo» no toca el cronograma ni lo demás que toca la generación, aplicar el cronograma
 * del handoff congela, y congelar y «Buscar lo nuevo» piden su propia celda (`handoff.congelar`, 2026-10-10).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SIN_CONGELAR,
  TIPO_CONGELADO,
  TIPO_REHECHO,
  MOTIVO_MINIMO,
  contenidoComparable,
  esSugerenciaPendiente,
  estadoDelHandoff,
  fechaCorta,
  leerPedidoDelHandoff,
  lineaDelCongelado,
  llevaMarcaDeSugerencia,
  modoDeGeneracion,
  motivoDelHito,
  razonDeHandoffAplicado,
  respuestaDelModo,
  sinBorradores,
  ultimoCambioReal,
  viaDelMotivo,
  VIAS_DEL_CONGELADO,
  type HitoDelCongelado,
} from "./congelado";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";

const RAIZ = process.cwd();
const hito = (tipo: string, iso: string, over: Partial<HitoDelCongelado> = {}): HitoDelCongelado => ({
  tipo,
  createdAt: iso,
  porEmail: "elias@smarteamcr.com",
  motivo: tipo === TIPO_CONGELADO ? motivoDelHito("cronograma") : "Ciclo 2: arranca el área de Servicio",
  fotoId: tipo === TIPO_CONGELADO ? "foto-1" : null,
  ...over,
});

describe("estadoDelHandoff — el último «congelado» o «rehecho» manda", () => {
  it("sin hitos, sin congelar", () => {
    expect(estadoDelHandoff([])).toEqual(SIN_CONGELAR);
  });

  it("un «congelado»: congelado, con cuándo, quién, cómo y la foto", () => {
    expect(estadoDelHandoff([hito(TIPO_CONGELADO, "2026-09-02T15:00:00.000Z")])).toEqual({
      congelado: true,
      at: "2026-09-02T15:00:00.000Z",
      porEmail: "elias@smarteamcr.com",
      via: "cronograma",
      fotoId: "foto-1",
    });
  });

  it("los hitos del diagnóstico (presentado, aprobado, reabierto) no cuentan", () => {
    expect(estadoDelHandoff([hito("presentado", "2026-09-05T00:00:00.000Z"), hito("aprobado", "2026-09-06T00:00:00.000Z")])).toEqual(
      SIN_CONGELAR,
    );
  });

  it("un «rehecho» posterior sin su «congelado» deja sin congelar", () => {
    const e = estadoDelHandoff([hito(TIPO_CONGELADO, "2026-09-02T00:00:00.000Z"), hito(TIPO_REHECHO, "2026-09-10T00:00:00.000Z")]);
    expect(e.congelado).toBe(false);
  });

  it("rehacer escribe «rehecho» y enseguida «congelado»: vuelve a estar congelado, con la vía de rehacer", () => {
    const e = estadoDelHandoff([
      hito(TIPO_CONGELADO, "2026-09-02T00:00:00.000Z"),
      hito(TIPO_REHECHO, "2026-09-10T12:00:00.000Z"),
      hito(TIPO_CONGELADO, "2026-09-10T12:00:00.001Z", { motivo: motivoDelHito("rehacer"), fotoId: "foto-2" }),
    ]);
    expect(e).toMatchObject({ congelado: true, via: "rehacer", fotoId: "foto-2" });
  });

  it("ante un empate de fecha gana «congelado» (el orden de la lista no importa)", () => {
    const t = "2026-09-10T12:00:00.000Z";
    expect(estadoDelHandoff([hito(TIPO_CONGELADO, t), hito(TIPO_REHECHO, t)]).congelado).toBe(true);
    expect(estadoDelHandoff([hito(TIPO_REHECHO, t), hito(TIPO_CONGELADO, t)]).congelado).toBe(true);
  });

  it("una fecha ilegible no cuenta", () => {
    expect(estadoDelHandoff([hito(TIPO_CONGELADO, "no es una fecha")])).toEqual(SIN_CONGELAR);
  });
});

describe("la vía se lee del texto del hito", () => {
  it("cada vía vuelve igual", () => {
    for (const via of VIAS_DEL_CONGELADO) expect(viaDelMotivo(motivoDelHito(via))).toBe(via);
  });
  it("un texto que no se reconoce es null (y el estado lo muestra sin la frase)", () => {
    expect(viaDelMotivo("otra cosa")).toBeNull();
    expect(viaDelMotivo(null)).toBeNull();
    expect(lineaDelCongelado({ congelado: true, at: "2026-09-02T15:00:00.000Z", via: null })).toBe("Congelado el 2 sep 2026");
  });
  it("la línea de la pantalla dice cuándo y cómo, en hora de Costa Rica", () => {
    expect(lineaDelCongelado({ congelado: true, at: "2026-09-02T15:00:00.000Z", via: "cronograma" })).toBe(
      "Congelado el 2 sep 2026, al aplicar el cronograma",
    );
    // 2 a. m. del 3 de septiembre en UTC es todavía el 2 en Costa Rica (UTC-6).
    expect(fechaCorta("2026-09-03T02:00:00.000Z")).toBe("2 sep 2026");
    expect(lineaDelCongelado({ congelado: false, at: null, via: null })).toBeNull();
  });
});

describe("leerPedidoDelHandoff", () => {
  it("sin nada es la generación de siempre", () => {
    expect(leerPedidoDelHandoff(undefined)).toBeNull();
    expect(leerPedidoDelHandoff(null)).toBeNull();
  });
  it("sugerir y rehacer (con el motivo recortado)", () => {
    expect(leerPedidoDelHandoff({ modo: "sugerir" })).toEqual({ modo: "sugerir" });
    expect(leerPedidoDelHandoff({ modo: "rehacer", motivo: "  Ciclo 2: arranca Servicio  " })).toEqual({
      modo: "rehacer",
      motivo: "Ciclo 2: arranca Servicio",
    });
  });
  it("lo que no se entiende es inválido (400)", () => {
    expect(leerPedidoDelHandoff("sugerir")).toBe("invalido");
    expect(leerPedidoDelHandoff({ modo: "otro" })).toBe("invalido");
    expect(leerPedidoDelHandoff({ modo: "rehacer" })).toBe("invalido");
    expect(leerPedidoDelHandoff([])).toBe("invalido");
  });
});

describe("modoDeGeneracion — qué hace /analyze con el handoff", () => {
  const motivo = "x".repeat(MOTIVO_MINIMO);
  it("sin congelar: la generación de siempre", () => {
    expect(modoDeGeneracion({ congelado: false, pedido: null })).toBe("generar");
    expect(modoDeGeneracion({ congelado: false, pedido: { modo: "rehacer", motivo } })).toBe("generar");
  });
  it("⛔ sin congelar, «Buscar lo nuevo» no corre la generación completa (pestaña vieja)", () => {
    expect(modoDeGeneracion({ congelado: false, pedido: { modo: "sugerir" } })).toEqual({ error: "NO_CONGELADO" });
  });
  it("⛔ congelado y sin modo (una pestaña de antes): 409, nunca regenera", () => {
    expect(modoDeGeneracion({ congelado: true, pedido: null })).toEqual({ error: "HANDOFF_CONGELADO" });
    expect(respuestaDelModo("HANDOFF_CONGELADO").status).toBe(409);
  });
  it("congelado: sugerir; rehacer con motivo de 10 caracteres o más", () => {
    expect(modoDeGeneracion({ congelado: true, pedido: { modo: "sugerir" } })).toBe("sugerir");
    expect(modoDeGeneracion({ congelado: true, pedido: { modo: "rehacer", motivo } })).toBe("rehacer");
    expect(modoDeGeneracion({ congelado: true, pedido: { modo: "rehacer", motivo: "corto" } })).toEqual({ error: "FALTA_MOTIVO" });
    expect(modoDeGeneracion({ congelado: true, pedido: { modo: "rehacer", motivo: "   ".padEnd(20) } })).toEqual({ error: "FALTA_MOTIVO" });
    expect(respuestaDelModo("FALTA_MOTIVO").status).toBe(400);
  });
  it("sin nada nuevo desde el congelado: 409 con la fecha", () => {
    const r = respuestaDelModo("SIN_NOVEDADES", "2026-09-02T15:00:00.000Z");
    expect(r.status).toBe(409);
    expect(r.body.message).toContain("2 sep 2026");
  });
  it("los mensajes van en tuteo", () => {
    for (const c of ["HANDOFF_CONGELADO", "FALTA_MOTIVO", "NO_CONGELADO", "SIN_NOVEDADES"] as const) {
      expect(respuestaDelModo(c).body.message).not.toMatch(/\b(recargá|escribí|usá|podés|tenés|volvé)\b/i);
    }
  });
});

describe("las sugerencias pendientes no son lo vendido", () => {
  const marca = { sugerenciaDelHandoff: { cita: "x" } };
  it("borrador con la marca: pendiente; usada (CONFIRMED) ya es contenido", () => {
    expect(esSugerenciaPendiente({ status: "DRAFT", data: marca })).toBe(true);
    expect(esSugerenciaPendiente({ status: "CONFIRMED", data: marca })).toBe(false);
  });
  it("un borrador sin la marca (un handoff viejo) no es una sugerencia: sigue entrando como antes", () => {
    expect(esSugerenciaPendiente({ status: "DRAFT", data: null })).toBe(false);
    expect(esSugerenciaPendiente({ status: "DRAFT", data: { rows: [] } })).toBe(false);
    expect(llevaMarcaDeSugerencia([])).toBe(false);
  });
});

describe("cuándo cambió el handoff (el aviso de «desactualizado»)", () => {
  const G = "2026-09-01T00:00:00.000Z";
  const C = "2026-09-02T00:00:00.000Z";
  const DESPUES = "2026-09-20T00:00:00.000Z";
  const ANTES = "2026-09-01T12:00:00.000Z";

  it("sin congelar: la última generación, como siempre", () => {
    expect(ultimoCambioReal({ generadoAt: G, congeladoAt: null, contenidoAt: DESPUES, cambioDesdeElCongelado: true })?.toISOString()).toBe(G);
  });
  it("congelado: una edición posterior que cambió lo que dice cuenta", () => {
    expect(ultimoCambioReal({ generadoAt: G, congeladoAt: C, contenidoAt: DESPUES, cambioDesdeElCongelado: true })?.toISOString()).toBe(
      DESPUES,
    );
  });
  it("congelado: tocar el documento sin cambiar lo vendido (descartar una sugerencia) no cuenta", () => {
    expect(ultimoCambioReal({ generadoAt: G, congeladoAt: C, contenidoAt: DESPUES, cambioDesdeElCongelado: false })?.toISOString()).toBe(G);
  });
  it("congelado: una edición anterior al congelado no cuenta", () => {
    expect(ultimoCambioReal({ generadoAt: G, congeladoAt: C, contenidoAt: ANTES, cambioDesdeElCongelado: true })?.toISOString()).toBe(G);
  });
  it("sin generación registrada, la edición posterior igual cuenta", () => {
    expect(ultimoCambioReal({ generadoAt: null, congeladoAt: C, contenidoAt: DESPUES, cambioDesdeElCongelado: true })?.toISOString()).toBe(
      DESPUES,
    );
    expect(ultimoCambioReal({ generadoAt: null, congeladoAt: null, contenidoAt: null, cambioDesdeElCongelado: false })).toBeNull();
  });
  it("lo que se compara deja afuera los borradores", () => {
    const s = [
      {
        key: "alcance_contratado",
        label: "¿Qué vendimos?",
        order: 1,
        titleOverride: null,
        eyebrowOverride: null,
        blocks: [
          { blockType: "TEXT", content: "lo vendido", data: null, order: 0, colSpan: 4, colStart: null, rowSpan: 1, source: "AGENT", status: "CONFIRMED" },
          { blockType: "TEXT", content: "sugerencia", data: null, order: 1, colSpan: 4, colStart: null, rowSpan: 1, source: "AGENT", status: "DRAFT" },
        ],
      },
    ];
    expect(sinBorradores(s)[0].blocks.map((b) => b.content)).toEqual(["lo vendido"]);
  });
  it("⛔ la foto vuelve de la base con las claves en otro orden (jsonb): eso no es un cambio", () => {
    /* La edición que la pone en rojo: comparar `JSON.stringify` o la huella de la foto. Con jsonb el orden de las
       claves cambia y el aviso saltaría con cualquier edición del documento, aunque no cambiara nada. */
    const fresco = [
      { key: "a", label: "A", order: 1, titleOverride: null, eyebrowOverride: null, blocks: [
        { blockType: "TEXT", content: "x", data: { b: 1, a: 2 }, order: 0, colSpan: 4, colStart: null, rowSpan: 1, source: "AGENT", status: "CONFIRMED" },
      ] },
    ];
    const deLaBase = JSON.parse(
      '[{"blocks":[{"data":{"a":2,"b":1},"order":0,"source":"AGENT","status":"CONFIRMED","colSpan":4,"content":"x","rowSpan":1,"colStart":null,"blockType":"TEXT"}],"key":"a","label":"A","order":1,"titleOverride":null,"eyebrowOverride":null}]',
    );
    expect(contenidoComparable(deLaBase)).toBe(contenidoComparable(fresco));
    expect(contenidoComparable(fresco)).not.toBe(
      contenidoComparable([{ ...fresco[0], blocks: [{ ...fresco[0].blocks[0], content: "y" }] }]),
    );
  });
});

describe("razonDeHandoffAplicado — los handoffs que ya existían", () => {
  it("la razón de hoy, con algo aplicado", () => {
    expect(razonDeHandoffAplicado("Propuesta de fases del handoff aplicada: 3 de 5 cambios.")).toBe(true);
    expect(razonDeHandoffAplicado("Propuesta de fases del handoff aplicada: 0 de 5 cambios (5 quedaron fuera).")).toBe(false);
  });
  it("la de antes de E4", () => {
    expect(razonDeHandoffAplicado("Sugerencias del handoff aceptadas por ítem (4 aceptadas, 1 descartadas).")).toBe(true);
    expect(razonDeHandoffAplicado("Sugerencias del handoff aceptadas por ítem (0 aceptadas, 3 descartadas).")).toBe(false);
  });
  it("las otras propuestas no cuentan", () => {
    expect(razonDeHandoffAplicado("Propuesta de «Regenerar todo» aplicada: 3 de 5 cambios.")).toBe(false);
    expect(razonDeHandoffAplicado("Sugerencias de las reuniones y notas elegidas aceptadas por ítem (2 aceptadas, 0 descartadas).")).toBe(
      false,
    );
    expect(razonDeHandoffAplicado(null)).toBe(false);
  });
});

// ── Candados de las puertas ─────────────────────────────────────────────────────────────────────────────

const codigoDe = (rel: string): string =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
    .join("\n")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?[ \t]*$/gm, "");

describe("candado: la puerta del congelado en /analyze", () => {
  const ANALYZE = "app/api/clients/[id]/analyze/route.ts";

  it("va DESPUÉS del veto y ANTES de cualquier trabajo de la generación", () => {
    /* La edición que la pone en rojo: mover la puerta debajo de `computeHandoffReadiness` (una pestaña vieja
       pagaría la lectura de HubSpot antes del 409) o arriba del veto (un hermano sabría si el handoff ajeno
       está congelado). */
    const src = codigoDe(ANALYZE);
    const i = src.indexOf('agent.agentGroup === "handoff" && bodyProjectId');
    expect(i, "no encontré la rama del handoff en analyze").toBeGreaterThan(-1);
    const veto = src.indexOf("vetoSiElHandoffEsDeOtro(bodyProjectId)", i);
    const puerta = src.indexOf("modoDeGeneracion(", i);
    const leer = src.indexOf("leerCongelado(bodyProjectId)", i);
    const readiness = src.indexOf("computeHandoffReadiness(bodyProjectId)", i);
    expect(veto, "falta el veto").toBeGreaterThan(-1);
    expect(puerta, "falta la puerta del congelado").toBeGreaterThan(-1);
    expect(veto < leer && leer < puerta && puerta < readiness, "la puerta del congelado quedó fuera de su lugar").toBe(true);
  });

  it("⛔ «Buscar lo nuevo» corta antes de la persistencia: nunca propone fases ni sella el handoff", () => {
    /* La edición que la pone en rojo: mover el corto de «sugerir» debajo de la persistencia de bloques, o
       borrarlo y dejar que la generación corra con otro mensaje. */
    const src = codigoDe(ANALYZE);
    const corto = src.indexOf('modoDelHandoff === "sugerir" && bodyProjectId && congeladoDesde');
    expect(corto, "desapareció el corto de «Buscar lo nuevo»").toBeGreaterThan(-1);
    const tramo = src.slice(corto, src.indexOf("}", src.indexOf("return NextResponse.json", corto)));
    expect(tramo, "el corto ya no llama al runner de las sugerencias").toContain("runSugerenciasDelHandoff(");
    expect(tramo, "el corto tiene que devolver la respuesta, no seguir").toContain("return NextResponse.json");
    const primeraPersistencia = src.indexOf("persistTimelineFromAgentOutput(bodyProjectId");
    expect(primeraPersistencia, "no encontré la persistencia del cronograma").toBeGreaterThan(-1);
    expect(corto < primeraPersistencia, "«Buscar lo nuevo» llega a la persistencia del cronograma").toBe(true);
  });

  it("«Rehacer desde cero» vuelve a congelar después de escribir el documento", () => {
    const src = codigoDe(ANALYZE);
    const persistencia = src.indexOf("persistTimelineFromAgentOutput(bodyProjectId");
    const congelar = src.indexOf('congelarHandoff(bodyProjectId, { via: "rehacer"');
    expect(congelar, "rehacer ya no vuelve a congelar").toBeGreaterThan(-1);
    expect(congelar > persistencia, "rehacer congela antes de escribir").toBe(true);
  });

  it("la corrida de «Buscar lo nuevo» nace con su paso (no cuenta como corrida del documento)", () => {
    const src = codigoDe(ANALYZE);
    expect(src).toContain('stepLabel:    modoDelHandoff === "sugerir" ? PASO_DE_LAS_SUGERENCIAS : bodyStepLabel');
  });
});

describe("candado: el runner de «Buscar lo nuevo» solo deja sugerencias", () => {
  it("no toca el cronograma, las etiquetas, el sello, el resumen, los resultados, la ficha ni el desarrollo", () => {
    /* Lo que hace la generación completa y una sugerencia NUNCA: si alguien «reusa» la persistencia, el handoff
       congelado vuelve a proponer fases y a pisar etiquetas. */
    const src = codigoDe("lib/handoff/sugerencias-server.ts");
    for (const prohibido of [
      "persistTimelineFromAgentOutput",
      "guardarPropuestaDelHandoff",
      "proponerFichaDesdeHandoff",
      "generarResumenDeHandoff",
      "leerOProponerResultados",
      "runDesarrolloGeneration",
      "handoffGeneratedAt",
      "tags:",
      "contentUpdatedAt",
    ]) {
      expect(src, `el runner de sugerencias toca «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it("escribe solo borradores del agente y solo reemplaza los pendientes con la marca", () => {
    const src = codigoDe("lib/handoff/sugerencias-server.ts");
    expect(src).toContain('status: "DRAFT"');
    expect(src).toContain("llevaMarcaDeSugerencia(b.data)");
    expect(src, "las reuniones salen del chokepoint (materialDesdeElCongelado), nunca de una consulta propia").not.toMatch(
      /firefliesSession\.findMany|sessionProject\.findMany/,
    );
  });
});

describe("candado: congelar al aplicar el cronograma del handoff, y con la celda de congelar", () => {
  it("aplicar una propuesta del handoff congela, después de la transacción y solo si se aplicó algo", () => {
    const src = codigoDe("app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts");
    const tx = src.indexOf("prisma.$transaction(");
    const congelar = src.indexOf('congelarHandoff(projectId, { via: "cronograma"');
    expect(congelar, "aplicar el cronograma del handoff ya no congela").toBeGreaterThan(-1);
    expect(congelar > tx, "congela dentro o antes de la transacción").toBe(true);
    const condicion = src.lastIndexOf("if (", congelar);
    expect(src.slice(condicion, congelar)).toContain('origen === "handoff" && aplicadas > 0');
  });

  it("la ruta «Congelar» pide el acceso al proyecto, la celda de CONGELAR el handoff y el veto de dueño", () => {
    /* 2026-10-10: congelar pide `handoff.congelar` y no `regenerate`, que el CSE no tiene. La edición que la pone
       en rojo: volver a pedir `regenerate` (el CSE ya no podría congelar). */
    const src = codigoDe("app/api/projects/[projectId]/handoff/congelar/route.ts");
    expect(src).toContain("guardAccessToProject(projectId)");
    expect(src).toContain('guardPermission("handoff", "congelar")');
    expect(src).not.toContain('guardPermission("handoff", "regenerate")');
    expect(src).toContain("vetoSiElHandoffEsDeOtro(projectId)");
  });

  it("«Buscar lo nuevo» pide la celda de congelar en /analyze; el gate de siempre queda para generar y rehacer", () => {
    const src = codigoDe("app/api/clients/[id]/analyze/route.ts");
    const gate = src.indexOf("gateDelPedidoDelHandoff(");
    expect(gate, "/analyze ya no pasa el pedido del handoff por su celda").toBeGreaterThan(-1);
    expect(src.slice(gate, gate + 300)).toContain("resolveArtifactGate(agent, clientId");
    const guard = src.indexOf("guardPermission(artifactGate.section, artifactGate.action)");
    expect(guard > gate, "el chequeo de permiso corre antes de elegir la celda").toBe(true);
  });

  it("la celda `handoff.congelar` existe, y por defecto la tiene el CSE (que no regenera el handoff)", () => {
    /* Decisión del 2026-10-10 (DECISIONS «El handoff se congela»): antes congelaba quien podía regenerar, y el CSE
       quedaba afuera. La celda la tienen el CSE, la CSL, Ventas y dirección. */
    const registry = fs.readFileSync(path.join(RAIZ, "lib/auth/permissions/registry.ts"), "utf8");
    expect(registry).toMatch(/key:\s*"congelar"/);
    const cse = DEFAULT_MATRIX.CSE.sections.handoff;
    expect(cse.congelar, "el CSE no congela").toBe(true);
    expect(cse.regenerate, "el CSE pasó a regenerar el handoff").toBe(false);
  });
});

describe("candado: lo pendiente no llega a los agentes, y el aviso sale del último cambio", () => {
  it("el loader del canvas deja afuera las sugerencias pendientes del handoff", () => {
    const src = codigoDe("lib/canvas/load-canvas-context.ts");
    const i = src.indexOf("export async function loadCanvasContext");
    const cuerpo = src.slice(i, src.indexOf("export ", i + 10));
    expect(cuerpo).toContain("esSugerenciaPendiente(b)");
  });

  it("las dos pantallas del aviso usan la misma función", () => {
    for (const rel of ["app/api/projects/[projectId]/canvases/route.ts", "app/(shell)/clients/[id]/page.tsx"]) {
      const src = codigoDe(rel);
      expect(src, `${rel} dejó de usar ultimoCambioDelHandoff`).toContain("ultimoCambioDelHandoff(projectId)");
      expect(src, `${rel} volvió a mirar solo handoffGeneratedAt`).not.toContain("handoffGeneratedAt");
    }
  });
});
