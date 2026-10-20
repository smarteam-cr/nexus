/**
 * lib/cuentas/encargado.test.ts — quién lleva una cuenta, en un solo lugar (2026-10-19).
 * Correr: `npx vitest run lib/cuentas --project unit`.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { encargadoDeLaCuenta, llevaLaCuenta, proyectoQueLleva, quienesLlevanLaCuenta, type ProyectoQueLleva } from "./encargado";

const p = (email: string | null, o: Partial<ProyectoQueLleva> = {}): ProyectoQueLleva => ({
  activo: true,
  deCs: true,
  deHubspot: true,
  email,
  nombre: email ? email.split("@")[0] : null,
  creadoAt: null,
  ...o,
});

describe("encargadoDeLaCuenta", () => {
  it("es quien lleva más proyectos de CS activos", () => {
    const e = encargadoDeLaCuenta([p("caroline@x.com"), p("caroline@x.com"), p("heiver@x.com")]);
    expect(e.email).toBe("caroline@x.com");
    expect(e.otros.map((o) => o.email)).toEqual(["heiver@x.com"]);
  });

  it("con empate gana el proyecto creado más recién en HubSpot (un dato fijo), en cualquier orden", () => {
    const vieja = p("hgomez@x.com", { creadoAt: "2025-03-01T00:00:00Z" });
    const viva = p("cbersot@x.com", { creadoAt: "2025-11-26T20:51:46Z" });
    expect(encargadoDeLaCuenta([vieja, viva]).email).toBe("cbersot@x.com");
    expect(encargadoDeLaCuenta([viva, vieja]).email).toBe("cbersot@x.com");
  });

  it("un proyecto de Desarrollo, uno cerrado o uno sin registro en HubSpot no definen el encargado", () => {
    const e = encargadoDeLaCuenta([
      p("cbersot@x.com"),
      p("bsalas@x.com", { deCs: false }),
      p("bsalas@x.com", { deCs: false }),
      p("lorena@x.com", { activo: false }),
      p("otro@x.com", { deHubspot: false }),
    ]);
    expect(e.email).toBe("cbersot@x.com");
    expect(e.otros).toEqual([]);
  });

  it("dos proyectos con encargados distintos: el de más proyectos, y el otro en `otros`", () => {
    const e = encargadoDeLaCuenta([p("a@x.com"), p("b@x.com"), p("b@x.com")]);
    expect(e.email).toBe("b@x.com");
    expect(quienesLlevanLaCuenta([p("a@x.com"), p("b@x.com"), p("b@x.com")]).map((x) => x.email)).toEqual(["b@x.com", "a@x.com"]);
  });

  it("quien se fue no lleva nada: sin nadie activo, queda sin encargado y se dice de quién era", () => {
    const deBaja = new Map([["lorena@x.com", "Lorena Osorio"]]);
    expect(encargadoDeLaCuenta([p("lorena@x.com")], deBaja)).toEqual({ email: null, nombre: null, deBaja: "Lorena Osorio", otros: [] });
    expect(encargadoDeLaCuenta([p("lorena@x.com"), p("lorena@x.com"), p("cbersot@x.com")], deBaja).email).toBe("cbersot@x.com");
  });

  it("una cuenta sin proyectos no tiene encargado", () => {
    expect(encargadoDeLaCuenta([]).email).toBeNull();
    expect(encargadoDeLaCuenta([]).deBaja).toBeNull();
  });

  it("el nombre de Nexus gana sobre el de HubSpot, y el correo no distingue mayúsculas", () => {
    const e = encargadoDeLaCuenta([p("HGomez@X.com", { nombre: "Heiver Gómez" })], new Map(), new Map([["hgomez@x.com", "Heiver Gomez"]]));
    expect(e).toMatchObject({ email: "hgomez@x.com", nombre: "Heiver Gomez" });
  });

  it("llevaLaCuenta: el encargado o quien lleva un proyecto de CS activo, nunca uno cerrado", () => {
    const ps = [p("a@x.com"), p("b@x.com"), p("c@x.com", { activo: false })];
    expect(llevaLaCuenta(ps, "B@x.com")).toBe(true);
    expect(llevaLaCuenta(ps, "c@x.com")).toBe(false);
    expect(llevaLaCuenta(ps, null)).toBe(false);
  });
});

describe("proyectoQueLleva (una fila de Project)", () => {
  const fila = {
    status: "active",
    serviceType: "proyecto_temporal",
    hubspotServiceId: "1",
    hubspotPipelineId: "826270797",
    proyectoInterno: false,
    hermanoCsProjectId: null,
    altaEstado: null,
    esPrueba: false,
    hubspotOwnerEmail: "cbersot@x.com",
    hubspotOwnerName: "Caroline Bersot",
    hubspotCreatedAt: null,
  };
  it("implementación: define; Desarrollo y prueba: no", () => {
    expect(proyectoQueLleva(fila).deCs).toBe(true);
    expect(proyectoQueLleva({ ...fila, hubspotPipelineId: "922785384" }).deCs).toBe(false);
    expect(proyectoQueLleva({ ...fila, esPrueba: true }).deCs).toBe(false);
    expect(proyectoQueLleva({ ...fila, status: "inactive" }).activo).toBe(false);
  });
});

describe("⛔ una sola fuente: nadie vuelve a contar dueños por su cuenta", () => {
  const leer = (f: string) => fs.readFileSync(path.join(RAIZ, f), "utf8");
  it.each([
    ["app/(shell)/clients/ClientsTable.tsx", "encargadoDeLaCuenta("],
    ["lib/cs/cartera-reglas.ts", "encargadoDeLaCuenta("],
    ["lib/carga/queries.ts", "encargadoDeLaCuenta("],
    ["lib/lecturas/personas.ts", "encargadoDe("],
    ["lib/mi-dia/inicio-server.ts", "encargadoDeLaCuenta("],
    ["lib/mi-dia/cartera-cs-server.ts", "encargadoDeLaCuenta("],
    ["lib/cs/adopcion-del-cse-server.ts", "llevaLaCuentaDe("],
  ])("%s usa la regla de lib/cuentas/encargado.ts", (archivo, llamada) => {
    expect(leer(archivo)).toContain(llamada);
  });

  it("la celda «CSE encargado» recibe UN encargado, no una lista de nombres", () => {
    const celda = leer("components/clients/CseEncargadoSelect.tsx");
    expect(celda).toContain("encargado: { nombre: string; email: string | null } | null");
    expect(celda).not.toMatch(/\bnombres:\s*string\[\]/);
  });
});
