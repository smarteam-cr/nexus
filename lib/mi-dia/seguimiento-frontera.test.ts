import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/mi-dia/seguimiento-frontera.test.ts — LO QUE «SEGUIMIENTO DE CUENTAS» LE PASA A LA PANTALLA (2026-10-19).
 *
 * La página la ve el CSE, que no entra al resto de Éxito del cliente porque ahí hay plata de la cartera y datos de
 * HubSpot Partner (lib/cs/acceso.ts). La carga se arma sobre la cartera de «Para ti», que SÍ trae esos datos para quien
 * los puede ver (el monto de los negocios, el uso, la relación con HubSpot, la renovación). Este archivo congela que la
 * fila del seguimiento no los copie: si alguien suma un campo, tiene que sumarlo acá a sabiendas.
 */
const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const soloCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("⛔ la fila del seguimiento no lleva plata ni datos de Partner", () => {
  it("la fila tiene exactamente estos campos", () => {
    const src = soloCodigo(leer("lib/mi-dia/seguimiento.ts"));
    const cuerpo = /export interface FilaDeSeguimiento \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? "";
    const campos = [...cuerpo.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
    expect(campos).toEqual([
      "clientId",
      "nombre",
      "cse",
      "cseDeBaja",
      "tuya",
      "salud",
      "porque",
      "proximaSesion",
      "calendarioLeido",
      "paso",
      "pasoLleva",
      "ultimaReunion",
      "temas",
      "invitados",
    ]);
  });

  it("lo de ADENTRO de cada campo también está cerrado", () => {
    const src = soloCodigo(leer("lib/mi-dia/seguimiento.ts"));
    const camposDe = (nombre: string) => {
      const cuerpo = new RegExp(`export interface ${nombre} \\{([\\s\\S]*?)\\n\\}`).exec(src)?.[1] ?? "";
      return [...cuerpo.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
    };
    expect(camposDe("TemaDeLaCuenta")).toEqual(["texto", "completo", "origen", "fuente", "fecha", "href"]);
    expect(camposDe("SesionQueViene")).toEqual(["clientId", "titulo", "inicio", "fuente"]);
    expect(camposDe("PersonaDelSeguimiento")).toEqual(["nombre", "email"]);
    // El paso de la cartera se copia campo por campo (si la cartera le suma un dato, no viaja solo).
    const paso = /export type PasoDelSeguimiento =([\s\S]*?\})\s*;/.exec(src)?.[1] ?? "";
    expect(paso.replace(/\s+/g, " ").trim()).toBe(
      '| { tipo: "reunion"; dia: string; inicio: string; titulo: string } | { tipo: "accion"; dia: string; numero: number; titulo: string }',
    );
    expect(soloCodigo(leer("lib/mi-dia/seguimiento-server.ts"))).toContain("paso: pasoDelSeguimiento(e.paso)");
    // Y el sobre que recibe la pantalla.
    const server = soloCodigo(leer("lib/mi-dia/seguimiento-server.ts"));
    const sobre = /export interface SeguimientoDeCuentas \{([\s\S]*?)\n\}/.exec(server)?.[1] ?? "";
    expect([...sobre.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1])).toEqual(["filas", "lider", "correo", "filtros"]);
  });

  it("la carga no copia de la cartera lo que no le corresponde al CSE", () => {
    const src = soloCodigo(leer("lib/mi-dia/seguimiento-server.ts"));
    for (const campo of ["negocios", "uso", "relacion", "renovacion", "ticketsAbiertos", "contactos", "monto"]) {
      expect(src, `seguimiento-server.ts lee «${campo}»`).not.toMatch(new RegExp(`\\.${campo}\\b`));
    }
    // Sin copiar objetos enteros de la cartera a la fila.
    expect(src, "copia un objeto entero con «...»").not.toMatch(/\.\.\.(e|empresa|cartera|c)\b/);
    // De las reuniones, los correos y las tareas solo viajan el título, el asunto y el tema: nunca el texto.
    expect(src).not.toMatch(/\btranscript\s*:/);
    expect(src).not.toMatch(/\btexto\s*:\s*true/);
    expect(src).not.toMatch(/\b(cita|contexto|notas)\s*:\s*true/);
  });

  it("las reuniones salen por el dueño único (`duenoDeLaSesion`), sin las de puertas adentro", () => {
    const src = soloCodigo(leer("lib/mi-dia/seguimiento-server.ts"));
    expect(src).toContain("duenoDeLaSesion(r)");
    expect(src).toContain("esReunionDePuertasAdentro(");
    expect(src).toMatch(/OR: \[\{ resolvedClientId: \{ in: ids \} \}, \{ resolvedClientId: null, manualClientId: \{ in: ids \} \}\]/);
  });

  it("una reunión del calendario cuenta solo si es de UNA empresa (`cuentaDelEvento`)", () => {
    expect(soloCodigo(leer("lib/mi-dia/seguimiento-server.ts"))).toContain("cuentaDelEvento(r)");
  });
});
