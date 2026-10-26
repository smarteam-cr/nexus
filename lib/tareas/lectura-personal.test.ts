import { describe, expect, it } from "vitest";
import { MAX_TITULO } from "./reglas";
import { SERIE_PERSONAL, esFuentePersonal, personasDelPiloto, seLeePersonal, soloParaElPiloto, tituloDeRevision, type PropuestaDelPiloto } from "./lectura-personal";

describe("personasDelPiloto", () => {
  it("lee los correos de la bandera, en minúscula y sin repetir; vacía = nadie", () => {
    expect(personasDelPiloto({ TAREAS_LECTURA_PERSONAL: " EGonzalez@smarteamcr.com, egonzalez@smarteamcr.com,no-es-correo" })).toEqual(["egonzalez@smarteamcr.com"]);
    expect(personasDelPiloto({})).toEqual([]);
    expect(personasDelPiloto({ TAREAS_LECTURA_PERSONAL: "" })).toEqual([]);
  });
});

describe("esFuentePersonal", () => {
  it("solo la fuente sin equipo con la serie personal; la de un sprint no", () => {
    expect(esFuentePersonal({ equipo: null, serie: SERIE_PERSONAL })).toBe(true);
    expect(esFuentePersonal({ equipo: "cs", serie: SERIE_PERSONAL })).toBe(false);
    expect(esFuentePersonal({ equipo: null, serie: "07iqe725" })).toBe(false);
    expect(esFuentePersonal(null)).toBe(false);
  });
});

describe("seLeePersonal", () => {
  const ahora = new Date("2026-10-27T18:00:00Z");
  const prendida = new Date("2026-10-27T00:00:00Z");
  const r = { puertasAdentro: true, estuvo: true, serie: null, inicio: new Date("2026-10-27T16:00:00Z"), fin: new Date("2026-10-27T17:00:00Z") };

  it("una interna en la que estuviste, que terminó hace un rato, se lee", () => {
    expect(seLeePersonal(r, new Set(), prendida, ahora)).toBe(true);
  });
  it("con alguien de afuera, sin ti, o recién terminada (las notas tardan), no", () => {
    expect(seLeePersonal({ ...r, puertasAdentro: false }, new Set(), prendida, ahora)).toBe(false);
    expect(seLeePersonal({ ...r, estuvo: false }, new Set(), prendida, ahora)).toBe(false);
    expect(seLeePersonal({ ...r, fin: new Date("2026-10-27T17:50:00Z") }, new Set(), prendida, ahora)).toBe(false);
  });
  it("la de una serie que lee un sprint la lee el sprint", () => {
    expect(seLeePersonal({ ...r, serie: "sprint-cs" }, new Set(["sprint-cs"]), prendida, ahora)).toBe(false);
    expect(seLeePersonal({ ...r, serie: "otra" }, new Set(["sprint-cs"]), prendida, ahora)).toBe(true);
  });
  it("lo de más de 24 horas, o de antes de prenderla, no se lee solo", () => {
    expect(seLeePersonal({ ...r, inicio: new Date("2026-10-26T15:00:00Z"), fin: new Date("2026-10-26T16:00:00Z") }, new Set(), new Date("2026-10-20T00:00:00Z"), ahora)).toBe(false);
    expect(seLeePersonal(r, new Set(), new Date("2026-10-29T00:00:00Z"), ahora)).toBe(false);
  });
});

describe("soloParaElPiloto", () => {
  const p = (lineaId: string, responsableEmail: string | null, extra: Partial<PropuestaDelPiloto> = {}): PropuestaDelPiloto => ({
    lineaId,
    titulo: `Tarea ${lineaId}`,
    contexto: "Para la propuesta de SAP.",
    responsableEmail,
    equipo: "marketing",
    semana: "2026-10-26",
    pedidaPorEmail: "elias@x.com",
    pedidaPorEquipo: null,
    porAsignar: false,
    sugerido: {},
    ...extra,
  });
  const nombre = (e: string) => (e === "lidia@x.com" ? "Lidia" : e);
  const piloto = { email: "elias@x.com", equipo: "direccion", organiza: true };

  it("lo tuyo queda igual; lo de otra persona, como tu revisión si organizaste; lo sin dueño, nada", () => {
    const r = soloParaElPiloto([p("1", "elias@x.com"), p("2", "lidia@x.com"), p("3", null, { porAsignar: true })], piloto, nombre);
    expect(r.map((x) => x.lineaId)).toEqual(["1", "2:revision"]);
    expect(r[0]).toEqual(p("1", "elias@x.com"));
    expect(r[1]).toMatchObject({
      titulo: "Revisar con Lidia: Tarea 2",
      responsableEmail: "elias@x.com",
      equipo: "direccion",
      pedidaPorEmail: null,
      sugerido: { revisionDe: "lidia@x.com" },
    });
    expect(r[1]!.contexto).toBe("En la reunión le quedó a Lidia; esta es tu revisión de que quede hecho. Para la propuesta de SAP.");
  });

  it("si no organizaste la reunión, lo de otra persona no te deja nada", () => {
    expect(soloParaElPiloto([p("1", "elias@x.com"), p("2", "lidia@x.com")], { ...piloto, organiza: false }, nombre).map((x) => x.lineaId)).toEqual(["1"]);
  });

  it("el título de una revisión no pasa el largo de un título", () => {
    const largo = tituloDeRevision("Lidia", "x".repeat(MAX_TITULO));
    expect(largo.length).toBe(MAX_TITULO);
    expect(largo.endsWith("…")).toBe(true);
  });
});

describe("la lectura aplica el filtro del piloto en sus dos caminos", () => {
  it("las notas y la conversación pasan por soloParaElPiloto antes de escribir, y sin proyectos sugeridos", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "lectura.ts"), "utf8");
    // Uno en las notas (procesar) y otro en la conversación (leerLaConversacion).
    expect(src.split("soloParaElPiloto(armado.propuestas").length - 1).toBe(2);
    expect(src.split("const gruposFinales = ").length - 1).toBe(2);
    // Lo que se escribe es lo filtrado, nunca `armado.propuestas` entero.
    expect(src).not.toMatch(/const propuestas = armado\.propuestas\.map/);
  });
});
