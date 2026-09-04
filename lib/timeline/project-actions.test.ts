/**
 * lib/timeline/project-actions.test.ts
 *
 * El panel "qué hacer acá". Lo que se fija: proyecto sano → lista vacía (el panel dice "todo al día",
 * no inventa alarmas), y cada señal produce UNA acción accionable en el grupo correcto.
 */
import { test, expect } from "vitest";
import { buildProjectActions, groupActions, splitBlocking, type ProjectActionsInput } from "./project-actions";
import { DIAS_PARA_AVISAR, avanceSinConfirmarVencido, diasSinConfirmar, rotuloDeAvanceSinConfirmar } from "./avance-sin-confirmar";
import fs from "node:fs";
import path from "node:path";

const sano: ProjectActionsInput = {
  pendingProgress: false,
  pendingParticularidades: 0,
  pendingProposal: false,
  sugerenciasDelEquipo: 0,
  anchorStartDate: "2026-06-01T00:00:00.000Z",
  detailConfirmedAt: "2026-06-02T00:00:00.000Z",
  hasTasks: true,
  sinCuantificar: 0,
  duplicados: { hechos: 0, filas: 0 },
  compromisosSinTarea: 0,
  compromisosVencidos: 0,
  pendientesDelClienteVencidos: 0,
  tareasVencidas: 0,
  alarmasDeEtapa: [],
  alcanceExcedido: null,
  estancadoDias: null,
};

test("proyecto al día → ninguna acción (el panel no inventa alarmas)", () => {
  expect(buildProjectActions(sano)).toEqual([]);
  expect(groupActions([])).toEqual([]);
});

test("borradores del agente → grupo Decidir", () => {
  const a = buildProjectActions({ ...sano, pendingProgress: true, pendingParticularidades: 3 });
  expect(a.map((x) => x.id)).toEqual(["draft-progress", "draft-particularidades"]);
  expect(a.every((x) => x.group === "decidir")).toBe(true);
  expect(a[1].title).toContain("3 particularidades detectadas");
});

// El bug que originó todo esto: repetidas que inflan el total de atraso.
// Y el título dice los DOS números: filas es lo que el CSE va a VER al abrir el grupo destino,
// hechos es lo que tiene que resolver. Antes decía solo el excedente y no coincidía con el destino.
test("repetidas: el título dice filas Y hechos", () => {
  const a = buildProjectActions({ ...sano, duplicados: { hechos: 2, filas: 5 } });
  expect(a[0].id).toBe("duplicados");
  expect(a[0].title).toBe("5 filas repiten 2 hechos ya cargados");
  expect(a[0].why).toContain("inflado");
  // "Fusionar" no existe todavía como gesto: el botón no lo promete.
  expect(a[0].cta).not.toContain("usionar");
});

test("singular vs plural", () => {
  expect(buildProjectActions({ ...sano, duplicados: { hechos: 1, filas: 2 } })[0].title)
    .toBe("2 filas repiten 1 hecho ya cargado");
  expect(buildProjectActions({ ...sano, sinCuantificar: 1 })[0].title)
    .toBe("1 atraso no dice cuánto movió el plan");
});

test("sin fecha de arranque tapa al detalle sin confirmar (una cosa a la vez)", () => {
  const a = buildProjectActions({ ...sano, anchorStartDate: null, detailConfirmedAt: null });
  expect(a.map((x) => x.id)).toContain("sin-anchor");
  expect(a.map((x) => x.id)).not.toContain("detalle-sin-confirmar");
});

/**
 * La regla de negocio del rediseño: **publicar es de la barra amarilla, no del panel.**
 * El motor emitía "El cronograma no está publicado" y "Hay cambios que el cliente no vio"
 * mientras el `PublishBar` decía lo mismo dos centímetros más arriba, con el botón de verdad.
 * El grupo `publicar` se borró del TIPO, así que esto no puede volver sin romper `tsc` — pero
 * el test lo deja escrito donde alguien lo va a leer.
 */
test("el motor no habla de publicar: eso es de la barra amarilla", () => {
  const enLlamas = buildProjectActions({
    ...sano,
    pendingProgress: true,
    anchorStartDate: null,
    pendientesDelClienteVencidos: 3,
    estancadoDias: 40,
  });
  for (const x of enLlamas) {
    expect(x.id, `"${x.id}" volvió a hablar de publicar`).not.toMatch(/publicar/);
    expect(x.cta ?? "").not.toContain("Subir al cliente");
  }
});

// Los dos que sobrevivieron al grupo borrado son decisiones del CSE, no publicaciones.
test("el arranque y el detalle son decisiones, no publicaciones", () => {
  expect(buildProjectActions({ ...sano, anchorStartDate: null })
    .find((x) => x.id === "sin-anchor")!.group).toBe("decidir");
  expect(buildProjectActions({ ...sano, detailConfirmedAt: null })
    .find((x) => x.id === "detalle-sin-confirmar")!.group).toBe("decidir");
});

// Del otro lado hay una PERSONA esperando respuesta, no un borrador del agente.
test("lo que reporta el equipo técnico entra al panel", () => {
  const a = buildProjectActions({ ...sano, sugerenciasDelEquipo: 2 });
  expect(a[0].id).toBe("sugerencias-equipo");
  expect(a[0].group).toBe("decidir");
  expect(a[0].tone).toBe("warn");
  expect(a[0].title).toBe("2 sugerencias del equipo técnico sin responder");
  // No puede decir "Revisar sugerencias": ese texto ya es el de `draft-proposal`, y dos botones
  // con el mismo label en la misma lista es el ruido que estamos sacando.
  expect(a[0].cta).not.toBe(
    buildProjectActions({ ...sano, pendingProposal: true })[0].cta,
  );
  expect(buildProjectActions(sano).map((x) => x.id)).not.toContain("sugerencias-equipo");
});

test("riesgo del cliente y alcance excedido van a Atender", () => {
  const a = buildProjectActions({
    ...sano,
    pendientesDelClienteVencidos: 2,
    alcanceExcedido: { addedTasks: 3, weeksDelta: 2 },
  });
  const atender = a.filter((x) => x.group === "atender");
  expect(atender.map((x) => x.id)).toEqual(["blockers-cliente", "alcance"]);
  expect(atender[1].title).toContain("+3 tareas");
  expect(atender[1].title).toContain("+2 semanas");
});

// El caso que originó esta tanda: compromisos anotados que nadie está haciendo.
test("compromisos sin tarea van a Decidir, antes que la higiene de datos", () => {
  const a = buildProjectActions({ ...sano, compromisosSinTarea: 4, duplicados: { hechos: 1, filas: 2 } });
  expect(a.map((x) => x.id)).toEqual(["compromisos-sin-tarea", "duplicados"]);
  expect(a[0].title).toContain("4 compromisos que nadie está persiguiendo");
  expect(a[0].why).toContain("no vencen");
});

test("compromiso vencido va a Atender y es riesgo", () => {
  const a = buildProjectActions({ ...sano, compromisosVencidos: 1 });
  expect(a[0].id).toBe("compromisos-vencidos");
  expect(a[0].group).toBe("atender");
  expect(a[0].tone).toBe("risk");
  expect(a[0].title).toContain("1 compromiso vencido sin cumplir");
});

test("alarmas de etapa se pasan tal cual con su antigüedad", () => {
  const a = buildProjectActions({
    ...sano,
    alarmasDeEtapa: [{ key: "kickoff_sin_publicar", label: "Kickoff sin publicar", days: 9 }],
  });
  expect(a[0].id).toBe("etapa-kickoff_sin_publicar");
  expect(a[0].title).toBe("Kickoff sin publicar hace 9 días");
  expect(a[0].cta).toBe("Ir a la etapa");
});

test("el orden es decidir → atender", () => {
  const a = buildProjectActions({
    ...sano,
    pendingProgress: true,
    pendientesDelClienteVencidos: 1,
  });
  expect(groupActions(a).map((g) => g.group)).toEqual(["decidir", "atender"]);
});

test("cada acción trae qué pasa, por qué importa y qué hacer", () => {
  const a = buildProjectActions({ ...sano, pendingProgress: true, duplicados: { hechos: 1, filas: 2 }, pendientesDelClienteVencidos: 1 });
  for (const x of a) {
    expect(x.title.length).toBeGreaterThan(0);
    expect(x.why.length).toBeGreaterThan(0);
    // `cta` puede ser null a propósito (la fila informa y no lleva a ningún lado); lo que NO puede
    // ser es una cadena vacía, que sería un botón sin texto.
    expect(x.cta === null || x.cta.length > 0).toBe(true);
  }
});

// Las alarmas de etapa eran la única familia que emitía N filas por dato — el panel es un índice,
// no una lista: crece con las CLASES de problema, no con los datos.
test("varias alarmas de etapa colapsan en UNA fila con la más vieja", () => {
  const a = buildProjectActions({
    ...sano,
    alarmasDeEtapa: [
      { key: "kickoff_sin_publicar", label: "Kickoff sin publicar", days: 9 },
      { key: "sin_baseline", label: "Cronograma sin línea base", days: 31 },
    ],
  });
  const etapa = a.filter((x) => x.id.startsWith("etapa-"));
  expect(etapa).toHaveLength(1);
  expect(etapa[0].title).toBe("2 validaciones de etapa sin cerrar");
  expect(etapa[0].why).toContain("Cronograma sin línea base");
  expect(etapa[0].why).toContain("31 días");
});

// Sin fecha de arranque no se calcula ningún atraso: el resto del panel es ruido hasta resolverlo.
test("sin-anchor es bloqueante y sale de los grupos", () => {
  const a = buildProjectActions({ ...sano, anchorStartDate: null, pendingProgress: true });
  const { blocking, rest } = splitBlocking(a);
  expect(blocking.map((x) => x.id)).toEqual(["sin-anchor"]);
  expect(rest.map((x) => x.id)).not.toContain("sin-anchor");
  expect(groupActions(rest).flatMap((g) => g.items.map((x) => x.id))).not.toContain("sin-anchor");
});

// Un botón que no cumple es peor que no tener botón.
test("alcance informa sin CTA (no tiene destino en esta pantalla)", () => {
  const a = buildProjectActions({ ...sano, alcanceExcedido: { addedTasks: 3, weeksDelta: 2 } });
  const alcance = a.find((x) => x.id === "alcance")!;
  expect(alcance.cta).toBeNull();
  expect(alcance.title).toContain("+3 tareas");
});

// ── D-12 (2026-09-04): el borrador de avance tiene edad, y a los 7 días grita ────────────────
/* La acción decía «hay avance que no confirmaste» el día 1 igual que el día 40, y la cartera no lo
   decía en absoluto. Un borrador de semanas es peor que ninguno: el cliente mira un avance más
   viejo que el real y el vigilante de CS razona sobre ese avance viejo. */

test("D-12 · diasSinConfirmar: generatedAt manda, la corrida es el respaldo, y sin fecha no se inventa edad", () => {
  const ahora = new Date("2026-09-04T12:00:00.000Z");
  expect(diasSinConfirmar(null, new Date("2026-08-01"), ahora), "sin borrador no hay edad").toBeNull();
  expect(diasSinConfirmar({ generatedAt: "2026-08-25T12:00:00.000Z" }, new Date("2026-01-01"), ahora), "generatedAt gana sobre la corrida").toBe(10);
  expect(diasSinConfirmar({}, new Date("2026-08-31T12:00:00.000Z"), ahora), "un borrador viejo se fecha por su corrida").toBe(4);
  expect(diasSinConfirmar({}, null, ahora), "sin ninguna fecha: null, no 0").toBeNull();
  expect(diasSinConfirmar({ generatedAt: "2026-09-10T00:00:00.000Z" }, null, ahora), "nunca negativo").toBe(0);
  expect(avanceSinConfirmarVencido(DIAS_PARA_AVISAR - 1)).toBe(false);
  expect(avanceSinConfirmarVencido(DIAS_PARA_AVISAR)).toBe(true);
  expect(avanceSinConfirmarVencido(null)).toBe(false);
  expect(rotuloDeAvanceSinConfirmar(1)).toBe("Avance sin confirmar · 1 día");
});

test("D-12 · a los 7 días la acción pasa a ámbar y dice desde cuándo; antes, igual que siempre", () => {
  const joven = buildProjectActions({ ...sano, pendingProgress: true, pendingProgressDias: 3 }).find((x) => x.id === "draft-progress")!;
  expect(joven.tone).toBe("info");
  expect(joven.title).toBe("Hay avance detectado que no confirmaste");
  const viejo = buildProjectActions({ ...sano, pendingProgress: true, pendingProgressDias: 9 }).find((x) => x.id === "draft-progress")!;
  expect(viejo.tone, "a los 7 días deja de ser una nota informativa").toBe("warn");
  expect(viejo.title).toBe("Hay avance detectado sin confirmar desde hace 9 días");
  const sinFecha = buildProjectActions({ ...sano, pendingProgress: true, pendingProgressDias: null }).find((x) => x.id === "draft-progress")!;
  expect(sinFecha.tone, "sin fecha conocida no se grita: no se avisa lo que no se sabe").toBe("info");
});

test("D-12 · LA guarda: el borrador nace con fecha, los dos cargadores la leen, y la cartera la PINTA y la CUENTA", () => {
  /* La edición que lo pone en rojo: sacar `generatedAt` del borrador «porque el tipo ya tiene runId»
     (la fecha de la corrida es el respaldo de los viejos, no la fuente); o dejar la edad en el
     summary sin pintarla — un dato que llega y no se pinta es idéntico a un dato que no llega. */
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  expect(leer("lib/timeline/regenerate-progress.ts"), "el borrador nace con fecha").toContain("generatedAt: new Date().toISOString(),");
  for (const rel of ["lib/timeline/project-actions-loader.ts", "lib/portfolio/load.ts"]) {
    const src = leer(rel);
    expect(src, `${rel}: trae la corrida para fechar los borradores viejos`).toContain("pendingProgressRunId: true");
    expect(src, `${rel}: la edad sale del único calculador`).toContain("diasSinConfirmar(");
  }
  const cartera = leer("components/dashboard/PortfolioGrid.tsx");
  expect(cartera, "la pill de la tarjeta").toContain('<SetupPill state="draft" label={rotuloDeAvanceSinConfirmar(r.avanceSinConfirmarDias)} />');
  expect(cartera, "el contador de tareas vencidas de la cartera").toContain('plural(tareasVencidas, "tarea vencida", "tareas vencidas")');
  expect(cartera, "el contador de avances sin confirmar").toContain('plural(avancesSinConfirmar, "avance sin confirmar", "avances sin confirmar")');
});
