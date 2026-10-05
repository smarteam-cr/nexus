/**
 * lib/navegacion/ruta-interna.test.ts — un enlace guardado nunca lleva afuera de Nexus.
 *
 * La regla es UNA (lib/navegacion/ruta-interna.ts) y la usan el feedback (la dirección de «dónde estabas»,
 * que la bandeja muestra como enlace) y los avisos de «Para ti». El censo del final exige que ninguno
 * vuelva a tener su propia copia.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CrearPedido, CrearReporte } from "@/lib/feedback/schema";
import { esRutaInterna } from "./ruta-interna";

const RAIZ = path.resolve(__dirname, "../..");

const AFUERA = [
  "/\\evil.com",
  "/\\/evil.com",
  "\\\\evil.com",
  "//evil.com",
  "///evil.com",
  "/\t/evil.com",
  "/\n/evil.com",
  "/a\r\nb",
  "/a\u0000b",
  "javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  "https://evil.com",
  "data:text/html,hola",
  "clients",
  "",
];
const ADENTRO = ["/", "/clients/x", "/clients/abc?tab=x", "/para-ti", "/feedback?reporte=r1#arriba"];

describe("esRutaInterna", () => {
  it.each(AFUERA)("⭐ rechaza %j", (href) => {
    expect(esRutaInterna(href)).toBe(false);
  });

  it.each(ADENTRO)("acepta %j", (href) => {
    expect(esRutaInterna(href)).toBe(true);
  });
});

describe("el feedback guarda solo rutas de Nexus (lo que la bandeja muestra como enlace)", () => {
  const reporte = (ruta: string) => CrearReporte.safeParse({ tipo: "falla", cuerpo: "Se rompió la tabla", pantalla: "Clientes", ruta });
  const pedido = (ruta: string) => CrearPedido.safeParse({ paraEmails: ["ana@smarteamcr.com"], pantalla: "Clientes", ruta, pregunta: "¿Se entiende?" });

  it.each(["/\\evil.com", "//evil.com", "javascript:alert(1)", "https://evil.com", "/\t/evil.com"])("⭐ un reporte con %j no entra", (ruta) => {
    const r = reporte(ruta);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain("La dirección no es de Nexus.");
  });

  it.each(["/\\evil.com", "//evil.com", "javascript:alert(1)"])("⭐ un pedido con %j no entra", (ruta) => {
    expect(pedido(ruta).success).toBe(false);
  });

  it("una ruta de Nexus sí entra", () => {
    expect(reporte("/clients/x").success).toBe(true);
    expect(pedido("/clients/x").success).toBe(true);
  });
});

describe("una sola regla para las rutas internas", () => {
  /** Los archivos de lib/ y app/ que no son tests. */
  function fuentes(dir: string): string[] {
    const salida: string[] = [];
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        salida.push(...fuentes(rel));
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) salida.push(rel);
    }
    return salida;
  }

  it("⭐ nadie más copia la regla «empieza con / y no con //»", () => {
    const archivos = [...fuentes("lib"), ...fuentes("app"), ...fuentes("components")];
    expect(archivos.length).toBeGreaterThan(300);
    const copias = archivos.filter(
      (f) => f !== "lib/navegacion/ruta-interna.ts" && /startsWith\(\s*["'`]\/\/["'`]\s*\)/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")),
    );
    expect(copias, "usa esRutaInterna de lib/navegacion/ruta-interna.ts").toEqual([]);
  });

  it("el feedback y los avisos usan la compartida", () => {
    const schema = fs.readFileSync(path.join(RAIZ, "lib/feedback/schema.ts"), "utf8");
    const avisos = fs.readFileSync(path.join(RAIZ, "lib/para-ti/avisos.ts"), "utf8");
    expect(schema).toMatch(/from\s+["']@\/lib\/navegacion\/ruta-interna["']/);
    expect(avisos).toMatch(/from\s+["']@\/lib\/navegacion\/ruta-interna["']/);
  });
});
