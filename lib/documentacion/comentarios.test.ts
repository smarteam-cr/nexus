import { describe, expect, it } from "vitest";
import {
  buscarCita,
  contextoDe,
  haceCuanto,
  puedeBorrarComentario,
  puedeEditarComentario,
  puedeResolver,
} from "./comentarios";

describe("quién resuelve", () => {
  it("solo Súper admin y CSL", () => {
    expect(puedeResolver("SUPER_ADMIN")).toBe(true);
    expect(puedeResolver("CSL")).toBe(true);
    for (const rol of ["CSE", "VENTAS", "DEV", "MARKETING", "ADMIN", "", null, undefined]) {
      expect(puedeResolver(rol), String(rol)).toBe(false);
    }
  });
});

describe("quién edita y quién borra un comentario", () => {
  it("edita solo quien lo escribió (sin importar mayúsculas del correo)", () => {
    expect(puedeEditarComentario("ana@smarteamcr.com", "Ana@SmarteamCR.com")).toBe(true);
    expect(puedeEditarComentario("luis@smarteamcr.com", "ana@smarteamcr.com")).toBe(false);
  });

  it("borra quien lo escribió, y también quien resuelve", () => {
    expect(puedeBorrarComentario("ana@smarteamcr.com", "CSE", "ana@smarteamcr.com")).toBe(true);
    expect(puedeBorrarComentario("luis@smarteamcr.com", "CSE", "ana@smarteamcr.com")).toBe(false);
    expect(puedeBorrarComentario("jefa@smarteamcr.com", "CSL", "ana@smarteamcr.com")).toBe(true);
    expect(puedeBorrarComentario("dir@smarteamcr.com", "SUPER_ADMIN", "ana@smarteamcr.com")).toBe(true);
  });
});

describe("volver a encontrar el texto comentado", () => {
  const texto = "El cliente firma. Después el cliente paga, y el cliente usa lo que compró.";

  it("una cita que aparece una vez", () => {
    expect(buscarCita(texto, { cita: "firma", antes: "", despues: "" })).toBe(texto.indexOf("firma"));
  });

  it("con repetidos, gana la que tiene el mismo contexto", () => {
    const segunda = texto.indexOf("el cliente", texto.indexOf("el cliente") + 1);
    const { antes, despues } = contextoDe(texto, segunda, segunda + "el cliente".length);
    expect(buscarCita(texto, { cita: "el cliente", antes, despues })).toBe(segunda);
  });

  it("si el texto de alrededor cambió un poco, igual la ubica por la parte que coincide", () => {
    const editado = texto.replace("Después", "Luego");
    const tercera = texto.lastIndexOf("el cliente");
    const { antes, despues } = contextoDe(texto, tercera, tercera + "el cliente".length);
    expect(buscarCita(editado, { cita: "el cliente", antes, despues })).toBe(editado.lastIndexOf("el cliente"));
  });

  it("si la cita ya no está, o está vacía, no la ubica", () => {
    expect(buscarCita(texto, { cita: "factura", antes: "", despues: "" })).toBe(-1);
    expect(buscarCita(texto, { cita: "", antes: "", despues: "" })).toBe(-1);
  });

  it("el contexto no se sale del texto", () => {
    expect(contextoDe("hola mundo", 0, 4)).toEqual({ antes: "", despues: " mundo" });
  });
});

describe("hace cuánto", () => {
  const ahora = new Date("2026-09-13T12:00:00Z");
  const antes = (ms: number) => new Date(ahora.getTime() - ms);

  it("dice el tiempo en palabras", () => {
    expect(haceCuanto(antes(20_000), ahora)).toBe("recién");
    expect(haceCuanto(antes(5 * 60_000), ahora)).toBe("hace 5 min");
    expect(haceCuanto(antes(3 * 3_600_000), ahora)).toBe("hace 3 h");
    expect(haceCuanto(antes(30 * 3_600_000), ahora)).toBe("ayer");
    expect(haceCuanto(antes(4 * 86_400_000), ahora).toString()).toBe("hace 4 días");
  });

  it("pasado un mes, la fecha", () => {
    expect(haceCuanto(antes(60 * 86_400_000), ahora)).toMatch(/2026/);
  });

  it("acepta la fecha como texto ISO (así viaja por JSON)", () => {
    expect(haceCuanto(antes(5 * 60_000).toISOString(), ahora)).toBe("hace 5 min");
  });
});
