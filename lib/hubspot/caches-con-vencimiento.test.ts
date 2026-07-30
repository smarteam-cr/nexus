/**
 * lib/hubspot/caches-con-vencimiento.test.ts — ningún cache del sync guarda para siempre.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Los caches de pipelines y de owners viven en memoria del proceso. Sin vencimiento se
 * comportan como si el portal de HubSpot fuera inmutable, y no lo es: el 2026-07-30 a las
 * 16:17 UTC se renombraron tres etapas del pipeline de Customer Success, y un sync de las
 * **16:27** —con el proceso vivo desde antes— materializó igual los rótulos viejos. La base
 * quedó diciendo "Arquitectura/Estructuración" cuando el portal ya decía "Configuración
 * técnica", y así hasta el siguiente reinicio.
 *
 * No falla, no loguea y se auto-explica como "todavía no sincronizó". Es exactamente la
 * clase de bug que solo se encuentra mirando el reloj de dos sistemas a la vez.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SYNC = path.join(process.cwd(), "lib/hubspot/sync-projects.ts");

/** El código sin comentarios: el encabezado explica la historia y menciona `new Map` en prosa. */
function soloCodigo(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const fin = src.indexOf("\n", i);
      i = fin === -1 ? src.length : fin;
    } else if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      i = fin === -1 ? src.length : fin + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

describe("los caches del sync vencen", () => {
  const codigo = soloCodigo(fs.readFileSync(SYNC, "utf8"));

  it("ningún cache de módulo es un Map pelado", () => {
    /* Se buscan las declaraciones a nivel de MÓDULO (sin indentación): un `new Map` adentro
       de una función es un acumulador de una corrida, no un cache, y esos están bien. */
    const pelados = [...codigo.matchAll(/^const (\w*[Cc]ache\w*)\s*=\s*new Map/gm)].map((m) => m[1]);
    expect(
      pelados,
      "Un cache de módulo sin vencimiento sobrevive a los cambios del portal: el proceso se " +
        "queda con el dato viejo hasta que alguien reinicie el servidor, sin error y sin log. " +
        "Usá `cacheConVencimiento()`.",
    ).toEqual([]);
  });

  it("los tres caches se crean con vencimiento", () => {
    for (const nombre of ["ownerCache", "pipelineNameCache", "pipelineStagesCache"]) {
      expect(
        codigo,
        `${nombre} dejó de usar cacheConVencimiento()`,
      ).toContain(`const ${nombre} = cacheConVencimiento`);
    }
  });

  it("el vencimiento se guarda JUNTO al valor y se compara contra el reloj", () => {
    /* Un TTL declarado que nadie compara es decoración. Estas dos líneas son las que hacen
       que el cache de verdad expire. */
    expect(codigo).toContain("vence: Date.now() + TTL_CACHE_MS");
    expect(codigo).toContain("hit.vence <= Date.now()");
  });

  it("la ventana es de minutos, no de horas", () => {
    const m = /const TTL_CACHE_MS = ([^;]+);/.exec(codigo);
    expect(m, "no encontré TTL_CACHE_MS").not.toBeNull();
    const ms = Function(`"use strict";return (${m![1]})`)() as number;
    expect(ms).toBeGreaterThanOrEqual(60 * 1000); // menos de un minuto no ahorraría nada
    expect(ms, "más de una hora ya es convivir con el dato viejo").toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("un `null` cacheado sigue distinguiéndose de un miss", () => {
    /* `resolvePipelineName` cachea `null` cuando el fetch falla, para no reintentar el mismo
       pipeline en cada proyecto de la corrida. Con un chequeo truthy ese negativo se pierde y
       vuelven los N round-trips fallidos. */
    expect(codigo).toContain("cacheado !== undefined");
    expect(codigo).not.toContain("pipelineNameCache.has(");
  });
});
