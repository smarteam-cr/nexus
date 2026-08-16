/**
 * lib/cs/hubspot-ops-block.test.ts — EL CABLE LLEGA A LOS DOS REDACTORES.
 *
 * El estado del proyecto en HubSpot (retrasado / bloqueado / en pausa / en riesgo, con su motivo
 * y su detalle escrito a mano) estaba espejado en `Project` desde hacía meses y lo leían SOLO los
 * dos vigilantes de Éxito del Cliente. Ningún redactor de documentos lo veía: el handoff describía
 * un proyecto trabado sin decir que estaba trabado, y el agente de avance proponía progreso sin
 * saber que había un bloqueo.
 *
 * ── POR QUÉ UN ESCANEO DEL FUENTE Y NO UN TEST DE COMPORTAMIENTO ─────────────
 * Los dos call sites viven en código acoplado a base de datos y a Claude: uno en un route de
 * 3.500 líneas, el otro en el runner del agente de avance. Ninguno se puede ejecutar en un test
 * unitario. Y el modo de falla que importa no es que el helper calcule mal —eso ya está cubierto
 * arriba— sino que alguien lo DESCONECTE: el helper sigue existiendo, sus tests siguen verdes, y
 * el prompt vuelve silenciosamente a no mencionar el bloqueo. Ya pasó en este repo con otros
 * registros; el escaneo es lo único que lo caza.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { bloqueDeOperativa, hayOperativa, ROTULO_OPERATIVA } from "./hubspot-ops-block";

const RAIZ = path.resolve(__dirname, "..", "..");

/**
 * Los redactores que TIENEN que ver el estado, y **dónde se CONSUME** el bloque en cada uno.
 * Solo puede crecer.
 *
 * ⚠ El `consumo` no es adorno. La primera versión de esta guarda solo miraba que el archivo
 * dijera `bloqueDeOperativa(` — y al romperla a propósito quedó VERDE, porque el fallo que
 * importa no es que desaparezca la llamada: es que alguien saque la interpolación del prompt y
 * deje la constante calculándose para nadie. Eso no lo caza `tsc` (una variable sin usar es un
 * warning), no lo caza ningún test de comportamiento, y el síntoma es que los documentos vuelven
 * a no mencionar el bloqueo sin que nada falle.
 */
const REDACTORES = [
  {
    quien: "el handoff",
    rel: "app/api/clients/[id]/analyze/route.ts",
    // El bloque interpolado dentro del template del userMessage.
    consumo: /\$\{operativaBlock \? `\$\{operativaBlock\}/,
  },
  {
    quien: "el agente de avance",
    rel: "lib/timeline/regenerate-progress.ts",
    // El campo leído dentro del builder puro del prompt.
    consumo: /i\.operativaBlock/,
  },
] as const;

describe("⭐ el estado de HubSpot llega a los redactores", () => {
  for (const { quien, rel, consumo } of REDACTORES) {
    it(`${quien} arma el bloque con el helper compartido`, () => {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      expect(
        src,
        `${rel} dejó de importar bloqueDeOperativa: el prompt vuelve a no mencionar el bloqueo`,
      ).toContain("bloqueDeOperativa");
      expect(src, `${rel} importa el helper pero no lo llama`).toMatch(/bloqueDeOperativa\(/);
    });

    it(`${quien} LO METE en el prompt (no solo lo calcula)`, () => {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      expect(
        src,
        `${rel} calcula el bloque y no lo interpola: el estado se computa para nadie`,
      ).toMatch(consumo);
    });

    it(`${quien} pide las cinco columnas a la base`, () => {
      /* Sin el select, el helper recibe `undefined` en todo, `hayOperativa` da false y el bloque
         sale vacío SIEMPRE — con el cable puesto y sin que nada falle. Es la forma más silenciosa
         de que esto deje de funcionar. */
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      for (const col of [
        "hubspotStatus",
        "hubspotPriority",
        "hubspotBlockReason",
        "hubspotBlockDetail",
        "hubspotAdoptionState",
      ]) {
        expect(src, `${rel} no trae ${col} de la base`).toContain(col);
      }
    });
  }

  it("nadie más reimplementa el serializador", () => {
    /* Había DOS copias (el vigilante mandaba el crudo, el resumen de cuenta traducía) y por eso
       el modelo recibía `on_track` en una y «A tiempo» en la otra. Una tercera copia es cómo
       vuelve esa divergencia.

       ⚠ Este test afirmaba `ROTULO_OPERATIVA.toContain(...)` — o sea, que una constante contiene
       su propio texto. No escaneaba a NADIE y habría pasado con cinco copias del serializador.
       Ahora busca de verdad: quien arme el rótulo sin importarlo de acá está copiando el bloque. */
    const raiz = process.cwd();
    const culpables: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(p);
        else if (/\.tsx?$/.test(e.name)) {
          const rel = path.relative(raiz, p).split(path.sep).join("/");
          if (rel.startsWith("lib/cs/hubspot-ops-block")) continue;
          /* Los TESTS quedan afuera: un golden que afirma sobre el texto producido contiene
             el rótulo por definición, y es justamente lo que queremos que exista. Lo que se
             busca acá es código de PRODUCCIÓN armando el bloque por su cuenta. */
          if (/\.test\.tsx?$/.test(e.name)) continue;
          const src = fs.readFileSync(p, "utf8");
          if (src.includes("ESTADO DEL PROYECTO EN HUBSPOT")) culpables.push(rel);
        }
      }
    };
    for (const d of ["lib", "app", "components", "scripts"]) recorrer(path.join(raiz, d));
    expect(
      culpables,
      `Estos archivos arman el rótulo de operativa por su cuenta en vez de importar ` +
        `bloqueDeOperativa. Ya pasó una vez: el modelo recibía \`on_track\` en un documento y ` +
        `«A tiempo» en otro.\n${culpables.join("\n")}`,
    ).toEqual([]);
  });
});

describe("el bloque dice lo justo", () => {
  const lleno = {
    hubspotStatus: "delayed",
    hubspotPriority: "medium",
    hubspotBlockReason: "Atraso por cliente",
    hubspotBlockDetail: "Falta que confirmen las propiedades del formulario",
    hubspotAdoptionState: "Medio",
  };
  const vacio = {
    hubspotStatus: null,
    hubspotPriority: null,
    hubspotBlockReason: null,
    hubspotBlockDetail: null,
    hubspotAdoptionState: null,
  };

  it("traduce estado y prioridad al castellano que usa el equipo", () => {
    const b = bloqueDeOperativa(lleno);
    expect(b).toContain("Estado: Retrasado");
    expect(b).toContain("Prioridad: Media");
    expect(b).not.toContain("delayed");
    expect(b).not.toContain("medium");
  });

  it("el motivo y su detalle van juntos, en la misma línea", () => {
    /* Separados, el modelo puede citar el motivo tipificado («Atraso por cliente») sin el detalle
       que lo explica, que es justo la parte que un humano escribió a mano. */
    const b = bloqueDeOperativa(lleno);
    const linea = b.split("\n").find((l) => l.includes("Atraso por cliente"));
    expect(linea).toContain("Falta que confirmen");
  });

  it("sin nada cargado no emite bloque", () => {
    expect(hayOperativa(vacio)).toBe(false);
    expect(bloqueDeOperativa(vacio)).toBe("");
  });

  it("un valor que HubSpot agregue después no se pierde: cae al crudo", () => {
    /* La lista de valores la define HubSpot y puede crecer sin avisarnos. Preferimos mandar el
       crudo antes que tragarnos la señal. */
    const b = bloqueDeOperativa({ ...vacio, hubspotStatus: "valor_nuevo_de_hubspot" });
    expect(b).toContain("valor_nuevo_de_hubspot");
  });

  it("sin rótulo cuando el prompt arma sus propias cabeceras", () => {
    const b = bloqueDeOperativa(lleno, { incluirRotulo: false });
    expect(b).not.toContain("===");
    expect(b).toContain("Estado: Retrasado");
  });
});
