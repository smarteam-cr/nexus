/**
 * lib/timeline/particularidad-to-task.test.ts
 *
 * Lo que se fija: los cuatro títulos reales del proyecto que originó esto se traducen bien, y —lo
 * más importante— que lo que NO matchea pasa intacto. Una mutilación automática es peor que una
 * frase larga: el CSE la puede editar, pero primero tiene que entenderla.
 */
import { test, expect } from "vitest";
import {
  taskTitleFromParticularidad,
  esConvertible,
  esCompromisoPendiente,
  grupoDeParticularidad,
} from "./particularidad-to-task";

test("compromiso → encargo, sin el nombre de quien lo dijo", () => {
  expect(taskTitleFromParticularidad("Wherex se comprometió a enviar una base de datos de prueba para validar la migración"))
    .toBe("Enviar una base de datos de prueba para validar la migración");
  expect(taskTitleFromParticularidad("Smarteam se comprometió a enviar un comunicado formal al cliente con el plan de acción"))
    .toBe("Enviar un comunicado formal al cliente con el plan de acción");
});

test("insumo del cliente → ir a buscarlo", () => {
  expect(taskTitleFromParticularidad("Se necesitan los criterios de calificación de leads para avanzar con Marketing Hub"))
    .toBe("Conseguir los criterios de calificación de leads para avanzar con Marketing Hub");
  expect(taskTitleFromParticularidad("Se necesita confirmar la fecha de vencimiento de la licencia de Salesforce"))
    .toBe("Conseguir confirmar la fecha de vencimiento de la licencia de Salesforce");
});

// El caso que más importa: no romper lo que no entiende.
test("lo que no matchea pasa tal cual", () => {
  const t = "La integración con Jira requiere desarrollo vía API y aún no tiene fecha de entrega definida";
  expect(taskTitleFromParticularidad(t)).toBe(t);
});

test("normaliza espacios, punto final y mayúscula inicial", () => {
  expect(taskTitleFromParticularidad("  se debe   revisar el acceso.  ")).toBe("Revisar el acceso");
});

test("título vacío no explota", () => {
  expect(taskTitleFromParticularidad("")).toBe("");
  expect(taskTitleFromParticularidad("   ")).toBe("");
});

/**
 * El bug que fija este test: el panel decía "6 compromisos sin tarea" y el grupo al que llevaba el
 * botón mostraba 4. Los 2 de diferencia eran atrasos sin cuantificar — que SON convertibles, pero
 * ya se cuentan en su propia línea ("2 atrasos sin semanas"). Contarlos en las dos partes daba un
 * número que no coincidía con ningún grupo de la pantalla, y encima los contaba dos veces.
 */
test("el contador de compromisos NO incluye atrasos sin cuantificar (no se cuentan dos veces)", () => {
  const lista = [
    { kind: "COMPROMISO" as const },
    { kind: "SOLICITUD" as const },
    { kind: "ATRASO" as const, weeksImpact: null },
    { kind: "ATRASO" as const, weeksImpact: null },
  ];
  // El botón se ofrece en las 4…
  expect(lista.filter(esConvertible)).toHaveLength(4);
  // …pero el contador (y el grupo) son solo los 2 compromisos.
  expect(lista.filter(esCompromisoPendiente)).toHaveLength(2);
});

test("un compromiso ya convertido sale de los dos criterios", () => {
  const p = { kind: "COMPROMISO", convertedTaskId: "t1" };
  expect(esCompromisoPendiente(p)).toBe(false);
  expect(esConvertible(p)).toBe(false);
});

test("convertible: compromisos, solicitudes legacy y atrasos sin cuantificar", () => {
  expect(esConvertible({ kind: "COMPROMISO" })).toBe(true);
  expect(esConvertible({ kind: "SOLICITUD" })).toBe(true);
  expect(esConvertible({ kind: "ATRASO", weeksImpact: null })).toBe(true);
  // Un atraso cuantificado es historia: explica el corrimiento, no pide nada.
  expect(esConvertible({ kind: "ATRASO", weeksImpact: 3 })).toBe(false);
  // Ya hay una tarea persiguiéndolo.
  expect(esConvertible({ kind: "COMPROMISO", convertedTaskId: "t1" })).toBe(false);
});

// Un AVISO no es un compromiso ni un pendiente: no se convierte a tarea ni engrosa el contador
// de "Compromisos sin dueño" (es una nota informativa, no algo que alguien deba perseguir).
test("un AVISO no es convertible ni compromiso pendiente", () => {
  expect(esConvertible({ kind: "AVISO", weeksImpact: null })).toBe(false);
  expect(esCompromisoPendiente({ kind: "AVISO" })).toBe(false);
});

/**
 * El bug que fija este test: dar por resuelta una desviación ATRASO sin semanas la dejaba
 * "atascada" en el grupo "Filas para arreglar" para siempre — el predicado de ese grupo miraba
 * `kind`/`weeksImpact` pero nunca `estado`, así que cerrarla no la sacaba de ahí. La fila no
 * pedía nada, pero el CSE la seguía viendo en el grupo que dice "esto pide algo".
 */
test("una desviación ATRASO sin semanas se va a «historia» al cerrarla, no se queda en «arreglar»", () => {
  const abierta = { id: "p1", kind: "ATRASO", weeksImpact: null, estado: "ABIERTA" };
  expect(grupoDeParticularidad(abierta, new Set())).toBe("arreglar");

  const cerrada = { ...abierta, estado: "CERRADA" };
  expect(grupoDeParticularidad(cerrada, new Set())).toBe("historia");
});

test("grupoDeParticularidad: compromiso pendiente gana sobre cualquier otro criterio", () => {
  const p = { id: "p2", kind: "COMPROMISO", weeksImpact: null, estado: "ABIERTA" };
  expect(grupoDeParticularidad(p, new Set())).toBe("compromisos");
  // Cerrado, deja de ser un compromiso pendiente — cae a historia.
  expect(grupoDeParticularidad({ ...p, estado: "CERRADA" }, new Set())).toBe("historia");
});

test("grupoDeParticularidad: una gemela (dupIds) va a «arreglar» aunque no sea ATRASO ni tenga tarea convertida", () => {
  // AVISO no dispara ni la rama de compromiso ni la de ATRASO/convertedTaskId: sin ser gemela,
  // el único camino a "arreglar" que le queda es `dupIds`.
  const p = { id: "p3", kind: "AVISO", convertedTaskId: null, weeksImpact: null, estado: "ABIERTA" };
  expect(grupoDeParticularidad(p, new Set())).toBe("historia");
  expect(grupoDeParticularidad(p, new Set(["p3"]))).toBe("arreglar");
  // Cerrada, ni siquiera una gemela se ofrece para arreglar: CERRADA es siempre historia.
  expect(grupoDeParticularidad({ ...p, estado: "CERRADA" }, new Set(["p3"]))).toBe("historia");
});
