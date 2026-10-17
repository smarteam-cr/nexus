import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CIERRE_DEL_SISTEMA,
  LARGO_DE_LA_NOTA,
  avisosQueYaNoCorresponden,
  diaDelCierre,
  esAvisoDeRenovacion,
  esLlaveViejaDelAviso,
  evidenciaJuntoALaRegla,
  idsDeLaEvidencia,
  juntarEvidencia,
  llaveDelAviso,
  llaveDelVigia,
  llavesViejasDelAviso,
  mismaCitaVerificada,
  razonJuntoALaRegla,
  notaDeCierre,
  queHacerConLaRedeteccion,
  textoDelCierre,
  traeEvidenciaNueva,
} from "./alertas-reglas";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const reunion = (...ids: string[]) => ({ note: "x", sessionIds: ids });

describe("⭐ una alerta cerrada vuelve SOLO con una señal nueva (Elías, 2026-10-07)", () => {
  /* Antes una alerta cerrada se callaba 7 días y después nacía otra igual aunque nada hubiera
     cambiado: el feed se volvía a llenar solo (105 abiertas, ninguna cerrada nunca). */
  it("sin alerta previa con esa llave → se crea", () => {
    expect(queHacerConLaRedeteccion(null, { severity: "HIGH", evidence: reunion("s1") })).toBe("crear");
  });

  it("abierta o vista → se actualiza la misma, no se duplica", () => {
    for (const status of ["OPEN", "SEEN"]) {
      expect(queHacerConLaRedeteccion({ status, severity: "HIGH", evidence: reunion("s1") }, { severity: "HIGH", evidence: reunion("s2") })).toBe("actualizar");
    }
  });

  it("⭐ cerrada y el agente vuelve a ver lo mismo → se calla, por más días que pasen", () => {
    for (const status of ["RESOLVED", "DISMISSED"]) {
      expect(queHacerConLaRedeteccion({ status, severity: "HIGH", evidence: reunion("s1") }, { severity: "HIGH", evidence: reunion("s1") })).toBe("suprimir");
    }
  });

  it("⭐ cerrada y aparece evidencia que no estaba (otra reunión) → vuelve", () => {
    expect(queHacerConLaRedeteccion({ status: "RESOLVED", severity: "MEDIUM", evidence: reunion("s1") }, { severity: "MEDIUM", evidence: reunion("s1", "s9") })).toBe("crear");
  });

  it("cerrada y el agente la ve más grave → vuelve aunque la evidencia sea la misma", () => {
    expect(queHacerConLaRedeteccion({ status: "DISMISSED", severity: "MEDIUM", evidence: reunion("s1") }, { severity: "HIGH", evidence: reunion("s1") })).toBe("crear");
  });

  it("menos grave o con menos evidencia no es una señal nueva", () => {
    expect(queHacerConLaRedeteccion({ status: "RESOLVED", severity: "HIGH", evidence: reunion("s1", "s2") }, { severity: "LOW", evidence: reunion("s2") })).toBe("suprimir");
  });

  it("la evidencia se compara por tipo e id: la misma cadena en otra lista es otra cosa", () => {
    expect([...idsDeLaEvidencia({ sessionIds: ["a", " "], taskIds: ["a"], note: "a" })].sort()).toEqual(["sessionIds:a", "taskIds:a"]);
    expect(traeEvidenciaNueva({ eventIds: ["a"] }, { sessionIds: ["a"] })).toBe(true);
    expect(traeEvidenciaNueva(null, { sessionIds: ["a"] })).toBe(false);
    expect(traeEvidenciaNueva("basura", null)).toBe(false);
  });

  it("el agente vigía usa esta regla al guardar lo que encontró", () => {
    const src = leer("lib/cs/watchdog.ts");
    expect(src).toContain("queHacerConLaRedeteccion(existing,");
    expect(src, "volvió la ventana fija de 7 días").not.toContain("existing.updatedAt.getTime() > now.getTime() - 7 * DAY_MS");
  });
});

describe("la nota al cerrar", () => {
  it("es opcional: vacía o sin texto → null", () => {
    expect(notaDeCierre(undefined)).toBeNull();
    expect(notaDeCierre("   ")).toBeNull();
    expect(notaDeCierre(42)).toBeNull();
  });

  it("queda en una línea y sin espacios de más", () => {
    expect(notaDeCierre("  Llamé a Mariana.\n  Renueva igual.  ")).toBe("Llamé a Mariana. Renueva igual.");
  });

  it("se recorta al largo máximo con «…»", () => {
    const n = notaDeCierre("a".repeat(LARGO_DE_LA_NOTA + 50))!;
    expect(n.length).toBe(LARGO_DE_LA_NOTA);
    expect(n.endsWith("…")).toBe(true);
  });

  it("la ruta la guarda al resolver o descartar, y la borra al volver a abrir", () => {
    const ruta = leer("app/api/cs/alerts/[alertId]/route.ts");
    expect(ruta).toContain("resolutionNote: notaDeCierre(body.nota)");
    expect(ruta).toMatch(/status === "OPEN"[^\n]*resolutionNote: null/);
  });
});

describe("cómo se dice un cierre", () => {
  const HOY = "2026-10-07";
  it("quién, cuándo y la nota", () => {
    expect(textoDelCierre({ estado: "RESOLVED", fecha: "2026-10-03", nota: "Llamé a Mariana", quien: "aarrieta@smarteamcr.com" }, HOY)).toBe(
      "Resuelta el 3 oct por aarrieta: «Llamé a Mariana»",
    );
    expect(textoDelCierre({ estado: "DISMISSED", fecha: "2026-10-03", nota: null, quien: null }, HOY)).toBe("Descartada el 3 oct");
  });

  it("lo que cerró Nexus solo se dice así", () => {
    expect(textoDelCierre({ estado: "RESOLVED", fecha: "2026-10-03", nota: null, quien: CIERRE_DEL_SISTEMA }, HOY)).toBe("Se cerró sola el 3 oct");
  });

  it("el día es el de Costa Rica: a las 8 de la noche todavía es el mismo día", () => {
    expect(diaDelCierre("2026-10-04T02:00:00.000Z")).toBe("2026-10-03");
    expect(diaDelCierre(null)).toBe("");
  });
});

describe("⭐ los avisos de renovación que ya no corresponden se cierran solos", () => {
  /* Sin esto, una renovación juntaba el aviso de 90, el de 60 y el de 30 días en el feed. */
  it("se cierran los abiertos cuya llave no es la de ningún aviso de hoy", () => {
    const hoy = new Set(["renovacion:c1:sales:2026-11-05:30"]);
    const abiertos = [
      { id: "a", dedupeKey: "renovacion:c1:sales:2026-11-05:60" },
      { id: "b", dedupeKey: "renovacion:c1:sales:2026-11-05:30" },
      { id: "c", dedupeKey: "renovacion:c2:service:2026-09-01:30" },
    ];
    expect(avisosQueYaNoCorresponden(abiertos, hoy)).toEqual(["a", "c"]);
  });

  it("el job los cierra firmados por el sistema y con su porqué", () => {
    const src = leer("lib/cs/avisos-de-renovacion.ts");
    expect(src).toContain("avisosQueYaNoCorresponden(abiertos, llavesDeHoy)");
    expect(src).toContain("resolvedByEmail: CIERRE_DEL_SISTEMA");
  });
});

describe("⭐ una alerta por cita: la lectura y el vigía no duplican la misma queja", () => {
  const cita = (id: string, verificada = true) => ({ cita: { texto: "No nos están respondiendo a tiempo", fuente: "reunion", id, verificada } });
  it("misma cita verificada (cliente, categoría y reunión) → gemelas", () => {
    expect(mismaCitaVerificada({ clientId: "c1", category: "QUEJA", evidence: cita("s1") }, { clientId: "c1", category: "QUEJA", evidence: { detector: "lectura", ...cita("s1") } })).toBe(true);
  });
  it("otro cliente, otra categoría, otra reunión o una cita sin verificar → no", () => {
    const a = { clientId: "c1", category: "QUEJA", evidence: cita("s1") };
    expect(mismaCitaVerificada(a, { ...a, clientId: "c2" })).toBe(false);
    expect(mismaCitaVerificada(a, { ...a, category: "TIMELINE_OVERDUE" })).toBe(false);
    expect(mismaCitaVerificada(a, { ...a, evidence: cita("s2") })).toBe(false);
    expect(mismaCitaVerificada(a, { ...a, evidence: cita("s1", false) })).toBe(false);
    expect(mismaCitaVerificada({ ...a, evidence: {} }, { ...a, evidence: {} })).toBe(false);
  });
  it("dos quejas DISTINTAS de la misma reunión no son gemelas; la misma frase cortada distinto, sí", () => {
    const a = { clientId: "c1", category: "QUEJA", evidence: cita("s1") };
    const otra = { ...a, evidence: { cita: { texto: "El reporte de ventas sale con datos viejos", fuente: "reunion", id: "s1", verificada: true } } };
    expect(mismaCitaVerificada(a, otra)).toBe(false);
    const recortada = { ...a, evidence: { cita: { texto: "«no nos están respondiendo…»", fuente: "reunion", id: "s1", verificada: true } } };
    expect(mismaCitaVerificada(a, recortada)).toBe(true);
  });
  it("los dos escritores la usan antes de crear; el vigía, solo para la queja (un retraso es de su proyecto)", () => {
    const vigia = leer("lib/cs/watchdog.ts");
    expect(vigia).toContain("mismaCitaVerificada(");
    expect(vigia).toContain('if (a.category === "QUEJA") {');
    expect(leer("lib/cs/alertas-de-la-lectura-server.ts")).toContain("mismaCitaVerificada(");
  });
});

describe("juntarEvidencia: actualizar una alerta no pierde lo que ya tenía", () => {
  it("las reuniones y los hechos se acumulan; la cita queda la más reciente", () => {
    const vieja = { detector: "lectura", hechoIds: ["h1"], sessionIds: ["s1"], cita: { texto: "a", id: "s1" } };
    const nueva = { detector: "lectura", hechoIds: ["h2"], sessionIds: ["s2"], cita: { texto: "b", id: "s2" } };
    const j = juntarEvidencia(vieja, nueva);
    expect(j.hechoIds).toEqual(["h1", "h2"]);
    expect(j.sessionIds).toEqual(["s1", "s2"]);
    expect(j.cita).toEqual({ texto: "b", id: "s2" });
    // Volver a ver la reunión vieja ya no es evidencia nueva.
    expect(traeEvidenciaNueva({ sessionIds: ["s1"] }, j)).toBe(false);
  });
  it("sin cita nueva, conserva la vieja", () => {
    expect(juntarEvidencia({ cita: { id: "s1" } }, { hechoIds: ["h2"] }).cita).toEqual({ id: "s1" });
  });
});

describe("⭐ una alerta por cuenta y categoría, no una por corrida (2026-10-16, fase 1.2)", () => {
  it("la huella del agente ya no va en la llave; la queja sigue una por cita", () => {
    expect(llaveDelVigia("c1", "ADOPTION_RISK", "uso-bajo-octubre")).toBe("c1:ADOPTION_RISK");
    expect(llaveDelVigia("c1", "ADOPTION_RISK", "otra-huella")).toBe(llaveDelVigia("c1", "ADOPTION_RISK", "uso-bajo-octubre"));
    expect(llaveDelVigia("c1", "QUEJA", "h1")).not.toBe(llaveDelVigia("c1", "QUEJA", "h2"));
  });
  it("el vigía actualiza la abierta sobre lo mismo antes de crear, con la llave que tenga", () => {
    const src = leer("lib/cs/watchdog.ts");
    expect(src).toContain("llaveDelVigia(scopeId, a.category, a.fingerprint)");
    expect(src).toContain("const sobreLoMismo");
    expect(src, "volvió la huella a la llave").not.toContain("`${scopeId}:${a.category}:${a.fingerprint}`");
  });
  it("⭐ un cierre del sistema no suprime: si el agente lo vuelve a ver, vuelve", () => {
    const cerrada = { status: "RESOLVED", severity: "MEDIUM", evidence: { sessionIds: ["s1"] }, resolvedByEmail: CIERRE_DEL_SISTEMA };
    expect(queHacerConLaRedeteccion(cerrada, { severity: "MEDIUM", evidence: { sessionIds: ["s1"] } })).toBe("crear");
    expect(queHacerConLaRedeteccion({ ...cerrada, resolvedByEmail: "avanegas@smarteamcr.com" }, { severity: "MEDIUM", evidence: { sessionIds: ["s1"] } })).toBe("suprimir");
  });
  it("juntar dos veces lo mismo no pierde de dónde salieron las citas de antes", () => {
    const a = { cita: { texto: "x", id: "s1", verificada: true } };
    const b = { cita: { texto: "y", id: "s2", verificada: true } };
    const j = juntarEvidencia(a, b);
    expect(j.citaIds).toEqual(["s1", "s2"]);
    expect(idsDeLaEvidencia(j).has("cita:s1")).toBe(true);
    expect(traeEvidenciaNueva(a, j), "la reunión de la cita vieja no es evidencia nueva").toBe(false);
  });
});

describe("⭐ la renovación: un aviso por fecha, y el vigía se junta con él", () => {
  it("la llave de hoy es por fecha; las de antes, por hub", () => {
    expect(llaveDelAviso("c1", "2026-12-01", 60)).toBe("renovacion:c1:2026-12-01:60");
    expect(llavesViejasDelAviso("c1", ["sales", "service"], "2026-12-01", 60)).toEqual([
      "renovacion:c1:sales:2026-12-01:60",
      "renovacion:c1:service:2026-12-01:60",
    ]);
    expect(esLlaveViejaDelAviso("renovacion:c1:sales:2026-12-01:60")).toBe(true);
    expect(esLlaveViejaDelAviso("renovacion:c1:2026-12-01:60")).toBe(false);
    expect(esAvisoDeRenovacion({ dedupeKey: "renovacion:c1:2026-12-01:60" })).toBe(true);
    expect(esAvisoDeRenovacion({ dedupeKey: "c1:RENEWAL_RISK" })).toBe(false);
  });
  it("la razón dice la línea de la regla y lo que vio el agente, una vez", () => {
    const linea = "Sales Hub Professional renueva el 2026-12-01 (en 45 días)";
    const una = razonJuntoALaRegla(linea, "El uso cayó a la mitad desde septiembre.");
    expect(una).toBe("Sales Hub Professional renueva el 2026-12-01 (en 45 días). El uso cayó a la mitad desde septiembre.");
    expect(razonJuntoALaRegla(linea, "")).toBe(`${linea}.`);
  });
  it("la evidencia suma lo del agente y conserva lo de la regla", () => {
    const regla = { hubs: ["sales"], renovacion: "2026-12-01", umbral: 60, lineaDeLaRegla: "Sales renueva" };
    const j = evidenciaJuntoALaRegla(regla, { sessionIds: ["s1"], renovacion: "otra" }, "Sales renueva");
    expect(j.renovacion).toBe("2026-12-01");
    expect(j.sessionIds).toEqual(["s1"]);
    expect(j.lineaDeLaRegla).toBe("Sales renueva");
  });
  it("la regla y el vigía se buscan antes de crear", () => {
    expect(leer("lib/cs/avisos-de-renovacion.ts")).toContain("const delVigia = await prisma.csAlert.findFirst(");
    expect(leer("lib/cs/watchdog.ts")).toContain('a.category === "RENEWAL_RISK"');
  });
});
