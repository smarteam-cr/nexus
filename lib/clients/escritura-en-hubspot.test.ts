/**
 * lib/clients/escritura-en-hubspot.test.ts — qué se escribe en HubSpot después de una decisión (R2), la copia que vuelve
 * de HubSpot y quién escribe las columnas de la escritura.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { planDeEscritura, propiedadesALeer, textoDeLaEscritura, type DatoParaEscribir } from "./escritura-en-hubspot";
import { cambioDesde, huellaDeValor, pedidosDeLaCopia } from "./copia-de-hubspot";
import { fechaParaHubspot } from "@/lib/hubspot/empresa";

const AT = new Date("2026-10-25T15:00:00Z");
const dato = (x: Partial<DatoParaEscribir> & Pick<DatoParaEscribir, "clave" | "valor" | "fuente">): DatoParaEscribir => ({ propuestaId: "p1", at: AT, ...x });

describe("planDeEscritura", () => {
  it("el TAM arrastra de dónde salió y cuándo, y guarda lo que había para volver atrás", () => {
    const plan = planDeEscritura([dato({ clave: "tamUsd", valor: 41760, fuente: "nexus" })], { tam__potencial: "30000" });
    expect(plan).toEqual([
      { propiedad: "tam__potencial", valor: "41760", anterior: "30000", propuestaId: "p1", clave: "tamUsd" },
      { propiedad: "nexus_tam_fuente", valor: "nexus", anterior: "", propuestaId: null, clave: null },
      { propiedad: "nexus_tam_fecha", valor: "2026-10-25", anterior: "", propuestaId: null, clave: null },
    ]);
  });

  it("el TAM que corrigió una persona dice «persona»; lo que ya está igual no se escribe", () => {
    const plan = planDeEscritura([dato({ clave: "tamUsd", valor: 50000, fuente: "persona" })], { tam__potencial: "50000", nexus_tam_fuente: "persona", nexus_tam_fecha: "2026-10-25" });
    expect(plan).toEqual([]);
  });

  it("lo que vino de HubSpot no vuelve; lo de la IA en lo estándar solo si allá está vacío", () => {
    expect(planDeEscritura([dato({ clave: "empleados", valor: 240, fuente: "hubspot" })], {})).toEqual([]);
    expect(planDeEscritura([dato({ clave: "empleados", valor: 240, fuente: "investigacion" })], { numberofemployees: "100" })).toEqual([]);
    expect(planDeEscritura([dato({ clave: "empleados", valor: 240, fuente: "investigacion" })], { numberofemployees: "" })).toHaveLength(1);
  });

  it("una propiedad calculada sin dato (la fecha de la investigación) se escribe si cambió", () => {
    const extras = [{ propiedad: "nexus_investigacion_fecha", valor: "2026-10-25" }];
    expect(planDeEscritura([], {}, extras)).toEqual([{ propiedad: "nexus_investigacion_fecha", valor: "2026-10-25", anterior: "", propuestaId: null, clave: null }]);
    expect(planDeEscritura([], { nexus_investigacion_fecha: "2026-10-25" }, extras)).toEqual([]);
  });

  it("la fecha es el día de Costa Rica: las 7 de la noche del 24 en Costa Rica no es el 25", () => {
    expect(fechaParaHubspot(new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-24");
    expect(fechaParaHubspot(new Date("2026-10-25T07:00:00Z"))).toBe("2026-10-25");
  });

  it("lee justo lo que necesita: la propiedad del dato y, con el TAM, su fuente y su fecha", () => {
    expect(propiedadesALeer(["empleados", "tamUsd", "segmento"], ["nexus_investigacion_fecha"]).sort()).toEqual(
      ["nexus_investigacion_fecha", "nexus_tam_fecha", "nexus_tam_fuente", "numberofemployees", "tam__potencial"].sort(),
    );
  });

  it("la ficha dice qué pasó solo si escribió o falló", () => {
    expect(textoDeLaEscritura({ estado: "apagada" })).toBeNull();
    expect(textoDeLaEscritura({ estado: "escrita", propiedades: ["a"] })).toBe("También quedó en HubSpot.");
    expect(textoDeLaEscritura({ estado: "fallo", error: "400: Property does not exist" })).toContain("Quedó en Nexus");
  });
});

describe("la copia que vuelve de HubSpot", () => {
  const sinFiltros = { escritoPorNexus: new Set<string>(), yaDicho: new Set<string>() };

  it("pide lo que se lee, con su cita, y no pide lo vacío ni lo que no es un dato", () => {
    const pedidos = pedidosDeLaCopia({ numberofemployees: "310", country: "", industry: "RETAIL", tam__potencial: "1", hs_object_id: "9" }, sinFiltros);
    expect(pedidos).toEqual([
      { clave: "empleados", valor: 310, cita: "HubSpot · numberofemployees" },
      { clave: "industry", valor: "RETAIL", cita: "HubSpot · industry" },
    ]);
  });

  it("el eco: lo que escribió Nexus no vuelve; lo que ya se propuso o se descartó, tampoco", () => {
    const escritoPorNexus = new Set([huellaDeValor("empleados", 310)]);
    expect(pedidosDeLaCopia({ numberofemployees: "310" }, { escritoPorNexus, yaDicho: new Set() })).toEqual([]);
    const yaDicho = new Set([huellaDeValor("industriaSmarteam", "Turismo")]);
    expect(pedidosDeLaCopia({ industria__smarteam_: "Turismo" }, { escritoPorNexus: new Set(), yaDicho })).toEqual([]);
  });

  it("solo mira las empresas que cambiaron allá desde la corrida anterior, con una hora de solape", () => {
    const desde = Date.parse("2026-10-25T12:00:00Z");
    expect(cambioDesde("2026-10-25T11:30:00Z", desde)).toBe(true);
    expect(cambioDesde("2026-10-25T10:30:00Z", desde)).toBe(false);
    expect(cambioDesde(null, desde)).toBe(true);
    expect(cambioDesde("2026-01-01T00:00:00Z", null)).toBe(true);
  });
});

describe("quién escribe lo que se escribió en HubSpot", () => {
  const RAIZ = join(__dirname, "..", "..");
  function archivos(dir: string): string[] {
    const out: string[] = [];
    for (const n of readdirSync(dir)) {
      if (n === "node_modules" || n.startsWith(".")) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) out.push(...archivos(p));
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
    }
    return out;
  }

  it("solo lib/clients/escritura-en-hubspot-server.ts escribe hubspotAnterior y hubspotEscritaAt (el script de vuelta los lee)", () => {
    const ofensores = ["lib", "app", "components", "scripts"]
      .flatMap((d) => archivos(join(RAIZ, d)))
      .map((f) => relative(RAIZ, f).replace(/\\/g, "/"))
      .filter((f) => f !== "lib/clients/escritura-en-hubspot-server.ts" && !f.startsWith("scripts/archive/"))
      // Una escritura de PropuestaDeDato con esas columnas (leerlas en un `where`/`select` no es escribirlas; otras tablas
      // tienen su propio `hubspotError`).
      .filter((f) => /propuestaDeDato\.(create|update|updateMany|upsert)\([\s\S]{0,400}?\bhubspot(Propiedad|Anterior|EscritaAt|Error)\s*:/.test(readFileSync(join(RAIZ, f), "utf8")));
    expect(ofensores).toEqual([]);
  });
});
