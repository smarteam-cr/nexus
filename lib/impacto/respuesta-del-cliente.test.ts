/** Presentado y aceptado (./respuesta-del-cliente.ts): el plegado de los hitos, qué se puede anotar y lo que lee el agente. */
import { describe, expect, it } from "vitest";
import { bloqueDeLoAceptado, diaEnCostaRica, plegarHitos, porQueNoSeAnota, type HitoGuardado } from "./respuesta-del-cliente";
import { NuevoHitoSchema } from "./respuesta-del-cliente-esquema";
import { ESCALERA_DE_PESO, mandaSobre } from "./escalera";

const hito = (h: Partial<HitoGuardado> & Pick<HitoGuardado, "tipo" | "en">): HitoGuardado => ({ fecha: null, nota: null, loQueSeVio: null, publicadaEn: null, porEmail: "liz@smarteamcr.com", ...h });

describe("el plegado", () => {
  it("sin hitos, nada", () => {
    expect(plegarHitos([])).toEqual({ presentadaEl: null, presentadaPor: null, respuesta: null, aceptado: null });
  });

  it("presentada y aceptada: lo aceptado con lo que se vio, quién y cuándo", () => {
    const e = plegarHitos([
      hito({ tipo: "acepto", en: "2026-11-19T10:00:00Z", loQueSeVio: "- [Titular] A" }),
      hito({ tipo: "presentada", fecha: "2026-11-18", en: "2026-11-18T10:00:00Z" }),
    ]);
    expect(e.presentadaEl).toBe("2026-11-18");
    expect(e.respuesta).toMatchObject({ tipo: "acepto", por: "liz@smarteamcr.com" });
    expect(e.aceptado).toEqual({ en: "2026-11-19T10:00:00Z", nota: null, loQueSeVio: "- [Titular] A", conCambios: false });
  });

  it("aceptó con cambios: cuenta como aceptado, con su nota", () => {
    const e = plegarHitos([
      hito({ tipo: "presentada", fecha: "2026-11-18", en: "2026-11-18T10:00:00Z" }),
      hito({ tipo: "acepto-con-cambios", nota: "La cifra de cartera es 600, no 800", en: "2026-11-19T10:00:00Z" }),
    ]);
    expect(e.aceptado).toMatchObject({ conCambios: true, nota: "La cifra de cartera es 600, no 800" });
  });

  it("pedir ajustes no es aceptar; lo aceptado antes sigue siendo lo de más peso", () => {
    const e = plegarHitos([
      hito({ tipo: "presentada", fecha: "2026-11-10", en: "2026-11-10T10:00:00Z" }),
      hito({ tipo: "acepto", en: "2026-11-11T10:00:00Z", loQueSeVio: "v1" }),
      hito({ tipo: "presentada", fecha: "2026-11-18", en: "2026-11-18T10:00:00Z" }),
      hito({ tipo: "pidio-ajustes", nota: "Falta Servicio", en: "2026-11-19T10:00:00Z" }),
    ]);
    expect(e.respuesta?.tipo).toBe("pidio-ajustes");
    expect(e.aceptado?.loQueSeVio).toBe("v1");
  });

  it("una presentación nueva espera su respuesta: la de antes respondía a otra versión", () => {
    const e = plegarHitos([
      hito({ tipo: "presentada", fecha: "2026-11-10", en: "2026-11-10T10:00:00Z" }),
      hito({ tipo: "acepto", en: "2026-11-11T10:00:00Z" }),
      hito({ tipo: "presentada", fecha: "2026-11-18", en: "2026-11-18T10:00:00Z" }),
    ]);
    expect(e.presentadaEl).toBe("2026-11-18");
    expect(e.respuesta).toBeNull();
    expect(e.aceptado).not.toBeNull();
  });

  it("lo aceptado es lo que se vio en SU presentación, no lo publicado después", () => {
    const e = plegarHitos([
      hito({ tipo: "presentada", fecha: "2026-11-18", loQueSeVio: "versión 1", en: "2026-11-18T10:00:00Z" }),
      hito({ tipo: "acepto", loQueSeVio: "versión 2 (publicada el 19)", en: "2026-11-20T10:00:00Z" }),
    ]);
    expect(e.aceptado?.loQueSeVio).toBe("versión 1");
  });

  it("el día de la aceptación es el de Costa Rica: a las 7 p. m. del 19 sigue siendo el 19", () => {
    expect(diaEnCostaRica("2026-11-20T01:00:00Z")).toBe("2026-11-19");
  });

  it("una respuesta sin presentación no cuenta", () => {
    expect(plegarHitos([hito({ tipo: "acepto", en: "2026-11-11T10:00:00Z" })]).aceptado).toBeNull();
  });
});

describe("qué se puede anotar", () => {
  const vacio = plegarHitos([]);
  const presentada = plegarHitos([hito({ tipo: "presentada", fecha: "2026-11-18", en: "2026-11-18T10:00:00Z" })]);
  it("sin nada publicado, nada", () => {
    expect(porQueNoSeAnota({ tipo: "presentada", fecha: "2026-11-18" }, vacio, "2026-11-21", { publicada: false })).toMatch(/publicado/);
  });
  it("la presentación es de hoy o antes", () => {
    expect(porQueNoSeAnota({ tipo: "presentada", fecha: "2026-11-21" }, vacio, "2026-11-21", { publicada: true })).toBeNull();
    expect(porQueNoSeAnota({ tipo: "presentada", fecha: "2026-11-22" }, vacio, "2026-11-21", { publicada: true })).toMatch(/hoy o antes/);
  });
  it("una respuesta pide una presentación anotada", () => {
    expect(porQueNoSeAnota({ tipo: "acepto" }, vacio, "2026-11-21", { publicada: true })).toMatch(/Primero/);
    expect(porQueNoSeAnota({ tipo: "acepto" }, presentada, "2026-11-21", { publicada: true })).toBeNull();
  });
  it("con cambios o pidiendo ajustes, la nota es obligatoria", () => {
    expect(NuevoHitoSchema.safeParse({ tipo: "pidio-ajustes" }).success).toBe(false);
    expect(NuevoHitoSchema.safeParse({ tipo: "acepto-con-cambios", nota: "" }).success).toBe(false);
    expect(NuevoHitoSchema.safeParse({ tipo: "pidio-ajustes", nota: "Falta Servicio" }).success).toBe(true);
    expect(NuevoHitoSchema.safeParse({ tipo: "acepto" }).success).toBe(true);
    expect(NuevoHitoSchema.safeParse({ tipo: "presentada", fecha: "ayer" }).success).toBe(false);
    expect(NuevoHitoSchema.safeParse({ tipo: "presentada", fecha: "2026-02-31" }).success).toBe(false);
    expect(NuevoHitoSchema.safeParse({ tipo: "presentada", fecha: "2026-13-01" }).success).toBe(false);
    expect(NuevoHitoSchema.safeParse({ tipo: "presentada", fecha: "2026-11-18" }).success).toBe(true);
  });
});

describe("lo aceptado es lo de más peso", () => {
  it("la escalera: aceptado > presentado > equipo > reunión > deducido", () => {
    expect(ESCALERA_DE_PESO).toEqual(["aceptado", "presentado", "equipo", "reunion", "deducido"]);
    expect(mandaSobre("aceptado", "equipo")).toBe(true);
    expect(mandaSobre("equipo", "reunion")).toBe(true);
    expect(mandaSobre("reunion", "equipo")).toBe(false);
  });
  it("el bloque para el agente y el handoff dice cuándo, lo que se vio y lo que dijo", () => {
    const e = plegarHitos([
      hito({ tipo: "presentada", fecha: "2026-11-18", en: "2026-11-18T10:00:00Z" }),
      hito({ tipo: "acepto-con-cambios", nota: "Son 600 clientes", loQueSeVio: "- [Titular] La cartera no se cobra", en: "2026-11-19T10:00:00Z" }),
    ]);
    const b = bloqueDeLoAceptado(e, "su escala");
    expect(b).toContain("ACEPTÓ de su escala el 2026-11-19 (con cambios)");
    expect(b).toContain("La cartera no se cobra");
    expect(b).toContain("Son 600 clientes");
    // Al handoff (escribe para el cliente) no va la nota que escribió a mano el vendedor.
    const alHandoff = bloqueDeLoAceptado(e, "su escala", { conNota: false });
    expect(alHandoff).toContain("La cartera no se cobra");
    expect(alHandoff).not.toContain("Son 600 clientes");
    expect(bloqueDeLoAceptado(plegarHitos([]), "x")).toBe("");
  });
});
