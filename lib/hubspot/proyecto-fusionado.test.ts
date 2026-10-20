/**
 * lib/hubspot/proyecto-fusionado.test.ts — el proyecto fusionado en HubSpot y el pase de cuenta que no se veía.
 *
 * Correr: `npx vitest run lib/hubspot/proyecto-fusionado.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { fusionadoEn, hayQueReleerLosProyectos } from "./proyecto-fusionado";

function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");
}
const leer = (rel: string) => soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

describe("fusionadoEn", () => {
  it("Librería: el id viejo responde con el del que sigue", () => {
    expect(fusionadoEn("505467859346", "586345112479")).toBe("586345112479");
  });
  it("el mismo id no es una fusión", () => {
    expect(fusionadoEn("586345112479", "586345112479")).toBeNull();
    expect(fusionadoEn(" 586345112479 ", "586345112479")).toBeNull();
  });
  it("sin id devuelto no se concluye nada", () => {
    expect(fusionadoEn("586345112479", undefined)).toBeNull();
    expect(fusionadoEn("586345112479", "")).toBeNull();
    expect(fusionadoEn("", "586345112479")).toBeNull();
  });
});

describe("hayQueReleerLosProyectos", () => {
  it("la corrida corrió: no hace falta", () => {
    expect(hayQueReleerLosProyectos({})).toBe(false);
    expect(hayQueReleerLosProyectos({ omitido: null })).toBe(false);
  });
  it("el piso, el cooldown o una corrida en curso: hay que releer", () => {
    expect(hayQueReleerLosProyectos({ omitido: "piso" })).toBe(true);
    expect(hayQueReleerLosProyectos({ omitido: "cooldown" })).toBe(true);
    expect(hayQueReleerLosProyectos({ omitido: "en_vuelo" })).toBe(true);
  });
});

describe("el espejo da de baja el proyecto fusionado", () => {
  const sync = leer("lib/hubspot/sync-projects.ts");
  const i = sync.indexOf("async function verifyProjectInHubspot");
  const cuerpo = sync.slice(i, sync.indexOf("\n}\n", i));

  it("la verificación mira si HubSpot devolvió otro id, ANTES de decidir el cierre", () => {
    const iFusion = cuerpo.indexOf("fusionadoEn(");
    const iCierre = cuerpo.indexOf("decidirCierre(");
    expect(iFusion, "la verificación dejó de mirar la fusión").toBeGreaterThan(-1);
    expect(iFusion, "la fusión se mira después del cierre: el del que sigue lo da por vivo").toBeLessThan(iCierre);
  });

  it("la reconciliación desactiva el fusionado", () => {
    const rec = sync.slice(sync.indexOf("const candidates = await prisma.project.findMany"));
    expect(rec).toContain("se fusionó en");
  });
});

describe("el pase de cuenta relee lo que escribió", () => {
  const ruta = leer("app/api/clients/[id]/cse-encargado/route.ts");

  it("si la sincronización se saltó, relee cada proyecto escrito", () => {
    expect(ruta).toContain("hayQueReleerLosProyectos(espejo)");
    expect(ruta).toContain("espejarProyectoRecienCreado");
  });

  it("olvida la medición de «Para ti» de quien recibe y de quien la tenía", () => {
    expect(ruta).toContain("olvidarMedicion(destino.email)");
    expect(ruta).toMatch(/olvidarMedicion\(anterior\)/);
  });
});

describe("⭐ el espejo dirigido también da de baja la fila fusionada (2026-10-19, la segunda vez)", () => {
  /* El pase de cuenta, saltado por el piso, relee proyecto por proyecto. Pedir el id fusionado devuelve el del que
     sigue: sin esto, el espejo actualizaba la fila nueva y la vieja seguía activa con Heiver. */
  const sync = leer("lib/hubspot/sync-projects.ts");
  const bloque = sync.slice(sync.indexOf("const enOtro = projects.length === 1"));

  it("compara el id pedido con el que devolvió HubSpot y da de baja SOLO la fila del id pedido", () => {
    expect(bloque).toContain("fusionadoEn(dirigido, projects[0].id)");
    expect(bloque).toContain("hubspotServiceId: dirigido, status: \"active\"");
    expect(bloque).toContain("data: { status: \"inactive\" }");
  });

  it("las dos bajas por fusión quedan anotadas para el pase de cuenta", () => {
    expect(sync.match(/fusiones\.push\(/g)?.length).toBe(2);
    expect(sync).toContain("pasarSiCambioElEncargado(");
  });
});

describe("el pase confirma antes de decir «listo»", () => {
  const ruta = leer("app/api/clients/[id]/cse-encargado/route.ts");
  it("relee quién lleva la cuenta con la regla única y, si no es la persona nueva, lo dice (409)", () => {
    expect(ruta).toContain("await encargadoDe(clientId)");
    expect(ruta).toContain("status: 409");
  });
  it("mueve lo abierto del anterior, firmado por quien hizo el pase", () => {
    expect(ruta).toContain("pasarLoDeLaCuenta(");
    expect(ruta).toContain("porEmail: quienPasa");
  });
});
