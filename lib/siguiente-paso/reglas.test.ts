import { describe, expect, it } from "vitest";
import {
  decidirImportacion,
  equipoDelRol,
  equiposQueEscribe,
  estaVencido,
  leerDeHubspot,
  propiedadesALeer,
  valoresParaHubspot,
  type UltimoPaso,
} from "./reglas";
import { propiedadesDelSiguientePaso } from "./propiedades";

describe("quién escribe qué", () => {
  it("cada persona escribe el de su equipo; dirección, cualquiera", () => {
    expect(equiposQueEscribe("VENTAS")).toEqual(["ventas"]);
    expect(equiposQueEscribe("CSE")).toEqual(["cs"]);
    expect(equiposQueEscribe("CSL")).toEqual(["cs"]);
    expect(equiposQueEscribe("DEV")).toEqual(["dev"]);
    expect(equiposQueEscribe("SUPER_ADMIN")).toEqual(["ventas", "cs", "dev"]);
  });
  it("Marketing y Finanzas no llevan siguiente paso", () => {
    expect(equiposQueEscribe("MARKETING")).toEqual([]);
    expect(equiposQueEscribe("ADMIN")).toEqual([]);
    expect(equipoDelRol("MARKETING")).toBeNull();
  });
});

describe("vencido", () => {
  it("la fecha pasada es una señal; hoy no", () => {
    expect(estaVencido({ fecha: "2026-10-14" }, "2026-10-15")).toBe(true);
    expect(estaVencido({ fecha: "2026-10-15" }, "2026-10-15")).toBe(false);
    expect(estaVencido({ fecha: null }, "2026-10-15")).toBe(false);
  });
});

describe("HubSpot", () => {
  it("escribe las tres propiedades del equipo, y borrar las deja vacías", () => {
    expect(valoresParaHubspot("ventas", { que: " Enviar la propuesta ", fecha: "2026-10-20", responsableOwnerId: "77" })).toEqual({
      siguiente_paso_ventas: "Enviar la propuesta",
      siguiente_paso_ventas_fecha: "2026-10-20",
      siguiente_paso_ventas_responsable: "77",
    });
    expect(valoresParaHubspot("cs", null)).toEqual({ siguiente_paso_cs: "", siguiente_paso_cs_fecha: "", siguiente_paso_cs_responsable: "" });
  });
  it("lee lo que escribió, en sus dos formas de fecha", () => {
    expect(leerDeHubspot("dev", { siguiente_paso_dev: "Revisar el conector", siguiente_paso_dev_fecha: "2026-10-20", siguiente_paso_dev_responsable: "9" })).toEqual({
      que: "Revisar el conector",
      fecha: "2026-10-20",
      responsableOwnerId: "9",
    });
    expect(leerDeHubspot("dev", { siguiente_paso_dev: "x", siguiente_paso_dev_fecha: String(Date.parse("2026-10-20T00:00:00Z")) })?.fecha).toBe("2026-10-20");
    expect(leerDeHubspot("dev", { siguiente_paso_dev: "  " })).toBeNull();
  });
  it("lee las mismas propiedades que se crearon en HubSpot", () => {
    expect(propiedadesALeer().sort()).toEqual(propiedadesDelSiguientePaso().map((p) => p.name).sort());
  });
});

describe("lo que vuelve de HubSpot", () => {
  const leido = new Date("2026-10-15T12:00:00Z");
  const antes = new Date("2026-10-15T10:00:00Z");
  const despues = new Date("2026-10-15T13:00:00Z");
  const vigente = (extra: Partial<UltimoPaso> = {}): UltimoPaso => ({
    estado: "vigente",
    que: "Enviar la propuesta",
    fecha: "2026-10-20",
    responsableOwnerId: "7",
    hubspotEstado: "escrito",
    hubspotEscritoAt: antes,
    creadoAt: antes,
    cerradoAt: null,
    ...extra,
  });

  it("sin nada en Nexus, lo de HubSpot entra", () => {
    expect(decidirImportacion(null, { que: "Llamar", fecha: null, responsableOwnerId: null }, leido)).toBe("crear");
    expect(decidirImportacion(null, null, leido)).toBe("nada");
  });
  it("igual a lo de Nexus (aunque cambien los espacios) no hace nada", () => {
    expect(decidirImportacion(vigente(), { que: "Enviar  la propuesta", fecha: "2026-10-20", responsableOwnerId: "7" }, leido)).toBe("nada");
  });
  it("alguien lo cambió en HubSpot: entra como un paso nuevo", () => {
    expect(decidirImportacion(vigente(), { que: "Enviar la propuesta", fecha: "2026-10-27", responsableOwnerId: "7" }, leido)).toBe("crear");
  });
  it("alguien lo borró en HubSpot: se da por hecho", () => {
    expect(decidirImportacion(vigente(), null, leido)).toBe("cerrar");
  });
  it("si Nexus todavía no lo escribió, gana Nexus (lo reintenta)", () => {
    expect(decidirImportacion(vigente({ hubspotEstado: "pendiente" }), null, leido)).toBe("nada");
    expect(decidirImportacion(vigente({ hubspotEstado: "error" }), { que: "viejo", fecha: null, responsableOwnerId: null }, leido)).toBe("nada");
  });
  it("una lectura de antes de que Nexus escribiera es vieja", () => {
    expect(decidirImportacion(vigente({ creadoAt: despues, hubspotEscritoAt: despues }), { que: "viejo", fecha: null, responsableOwnerId: null }, leido)).toBe("nada");
  });
  it("dado por hecho en Nexus: vacío en HubSpot es lo esperado; un valor nuevo allá entra", () => {
    const hecho = vigente({ estado: "hecho", cerradoAt: antes });
    expect(decidirImportacion(hecho, null, leido)).toBe("nada");
    expect(decidirImportacion(hecho, { que: "Retomar en enero", fecha: null, responsableOwnerId: null }, leido)).toBe("crear");
    // Si borrar en HubSpot todavía no se pudo, lo que hay allá es el paso viejo: no vuelve.
    expect(decidirImportacion({ ...hecho, hubspotEstado: "error" }, { que: "Enviar la propuesta", fecha: "2026-10-20", responsableOwnerId: "7" }, leido)).toBe("nada");
  });
});
