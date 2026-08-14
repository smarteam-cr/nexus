/**
 * lib/delivery/privacidad.test.ts — NINGÚN DATO DE PARTNER CRUZA A LA ENTREGA.
 *
 * El documento de Entrega es de cara al cliente y desde EN-7 tiene una ruta pública
 * (`/external/entrega`) que un cliente abre con su contraseña. Los datos del programa de
 * partner —UUS, seats, MRR, la foto semanal de consumo— están declarados CONFIDENCIALES por
 * los términos con HubSpot (`prisma/schema.prisma`, modelos `ClientPartnerSnapshot` y
 * `PartnerUsageSnapshot`): jamás pueden aparecer en una vista del cliente.
 *
 * Hoy el diseño lo impide por construcción (el `ctx` de la Entrega es deliberadamente flaco:
 * no hay campo donde meterlo). Pero «no hay campo» es una propiedad del código de hoy, y
 * agregar uno son treinta segundos. Esto es lo que FRENA ese diff: un comentario que dice
 * «nunca acá» no frena nada.
 *
 * ⚠ Allowlist VACÍA, a propósito y con la razón escrita: levantarla tiene que ser un diff en
 * castellano que alguien lea, no un flag que se agrega al pasar.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..", "..");

/**
 * La superficie de la Entrega: todo lo que puede leer datos y todo lo que los pinta, incluido
 * el camino externo. Se declara a mano —y se verifica que cada entrada EXISTA— porque un glob
 * silencioso que deja de matchear es indistinguible de un glob que no encuentra nada.
 */
const SUPERFICIE = [
  "lib/delivery",
  "lib/canvas/entrega-generate.ts",
  "lib/external/entrega-view.ts",
  "components/canvas/EntregaWorkspace.tsx",
  "components/canvas/entrega-landing-adapter.ts",
  "components/landing/configs/entrega.ts",
  "components/landing/configs/entrega.defs.ts",
  "components/landing/sections-impacto.tsx",
  "components/external/EntregaClientView.tsx",
  "app/external/entrega",
  "app/api/projects/[projectId]/publish-entrega",
  "app/api/projects/[projectId]/delivery",
];

/** Los identificadores reales del schema. No frases sueltas: nombres que se pueden escribir. */
const PROHIBIDOS = [
  "PartnerUsageSnapshot",
  "ClientPartnerSnapshot",
  "partnerUsageSnapshot",
  "clientPartnerSnapshot",
  "uusScore",
  "uusTrend",
  "mrrTotal",
  "marketingContactsUsed",
  "marketingContactsLimit",
  "consumptionScore",
  "nextRenewalAt",
];

/** El código SIN comentarios ni strings de literal, conservando offsets (blanquea, no borra). */
function soloCodigo(src: string): string {
  const out = src.split("");
  const blanquear = (desde: number, hasta: number) => {
    for (let k = desde; k < hasta && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const fin = src.indexOf("\n", i);
      blanquear(i, fin === -1 ? src.length : fin);
      i = fin === -1 ? src.length : fin;
    } else if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      blanquear(i, fin === -1 ? src.length : fin + 2);
      i = fin === -1 ? src.length : fin + 2;
    } else {
      i++;
    }
  }
  return out.join("");
}

function archivosDe(entrada: string): string[] {
  const abs = path.join(RAIZ, entrada);
  const st = fs.statSync(abs);
  if (st.isFile()) return [abs];
  const out: string[] = [];
  const rec = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(p);
    }
  };
  rec(abs);
  return out;
}

describe("privacidad de partner en la Entrega", () => {
  it("la superficie declarada existe entera (una lista que apunta a la nada no protege nada)", () => {
    const faltan = SUPERFICIE.filter((e) => !fs.existsSync(path.join(RAIZ, e)));
    expect(faltan, "entradas de SUPERFICIE que ya no existen — ¿se renombró un archivo?").toEqual(
      [],
    );
  });

  it("ningún archivo de la Entrega nombra un dato de partner", () => {
    const hallazgos: string[] = [];
    for (const entrada of SUPERFICIE) {
      for (const abs of archivosDe(entrada)) {
        const codigo = soloCodigo(fs.readFileSync(abs, "utf8"));
        for (const tok of PROHIBIDOS) {
          if (codigo.includes(tok)) {
            hallazgos.push(`${path.relative(RAIZ, abs)} → ${tok}`);
          }
        }
      }
    }
    expect(
      hallazgos,
      "Datos de partner (UUS/seats/MRR) son CONFIDENCIALES por los términos con HubSpot y la " +
        "Entrega se le comparte al cliente por un enlace público. Si esto hace falta de verdad, " +
        "la decisión se toma y se escribe acá — no se agrega el import y ya.",
    ).toEqual([]);
  });

  it("mencionar en un comentario NO cuenta como usar", () => {
    // Si no, explicar POR QUÉ algo está prohibido pondría la guarda en rojo — y se aprendería
    // a no escribir la explicación, que es justo lo que hace entendible la prohibición.
    expect(soloCodigo("// nunca leer uusScore acá").includes("uusScore")).toBe(false);
    expect(soloCodigo("const x = snap.uusScore;").includes("uusScore")).toBe(true);
  });
});
