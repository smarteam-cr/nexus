/**
 * lib/memoria/consumidores.test.ts — EL CENSO DE QUIÉN LEE LA MEMORIA.
 *
 * El modo de falla es de OMISIÓN: alguien conecta un agente nuevo a la memoria y no declara con qué alcance lee. Por eso:
 *   1. todo archivo que importa `@/lib/memoria` está en `CONSUMIDORES_DE_LA_MEMORIA`, y llama con su lector;
 *   2. el alcance de cada pieza es `cliente` si y solo si `pieceBySlug(slug).clientFacing` (salvo el handoff,
 *      `sin-lo-interno` a propósito);
 *   3. lo declarado que todavía no está conectado está en `AUN_SIN_CONECTAR`, y esa lista solo encoge (un ratchet).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pieceBySlug } from "@/lib/pieces/registry";
import { DOCUMENTOS_CON_CONTEXTO, documentoConContexto } from "@/lib/contexto/documento";
import { esSoloElegidas } from "@/lib/sessions/destinos-de-contexto";
import { CONSUMIDORES_DE_LA_MEMORIA, alcanceDeLaPieza, queCargar, type LectorDeMemoria } from "./consumidores";

const RAIZ = process.cwd();

function archivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".next")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...archivos(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

// También el import dinámico (`import("@/lib/memoria")`): si no, un lector se salta el registro por esa vía.
const IMPORTA = /(?:from |import\()"@\/lib\/memoria(?:\/[^"]*)?"/;
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const IMPORTADORES = ["app", "lib", "components"]
  .flatMap(archivos)
  .filter((f) => !f.startsWith("lib/memoria/"))
  .filter((f) => IMPORTA.test(leer(f)))
  .sort();

/**
 * Lo declarado que TODAVÍA no llama al cargador: lo conectan las etapas siguientes (DECISIONS «La memoria de la cuenta
 * y del proyecto: un solo cargador»). Al conectar uno, se BORRA de acá (el test lo pide). Nadie puede sumar.
 * Vacía desde la etapa 7: el diagnóstico y la planificación se conectaron antes de leer solo las reuniones elegidas
 * (sin la memoria, un documento sin elegidas salía vacío).
 */
const AUN_SIN_CONECTAR: ReadonlySet<LectorDeMemoria> = new Set<LectorDeMemoria>([]);

/** Lo que tiene que aparecer en el archivo para que cuente como «llama con su lector». */
const llamadaDe = (lector: LectorDeMemoria) => (lector === "lo-que-sabe-la-ia" ? "queSabeLaIA(" : `lector: "${lector}"`);

describe("⛔ quién lee la memoria", () => {
  it("todo archivo que importa @/lib/memoria está declarado", () => {
    const declarados = new Set(Object.values(CONSUMIDORES_DE_LA_MEMORIA).flatMap((c) => c.archivos));
    const sinDeclarar = IMPORTADORES.filter((f) => !declarados.has(f));
    expect(
      sinDeclarar,
      "Lector(es) de la memoria sin declarar: súmalos a CONSUMIDORES_DE_LA_MEMORIA (lib/memoria/consumidores.ts) con su " +
        "pieza y su alcance. El alcance de una pieza sale de pieceBySlug().clientFacing.",
    ).toEqual([]);
  });

  it("los archivos declarados existen", () => {
    const faltan = Object.entries(CONSUMIDORES_DE_LA_MEMORIA).flatMap(([lector, c]) =>
      c.archivos.filter((a) => !fs.existsSync(path.join(RAIZ, a))).map((a) => `${lector}: ${a}`),
    );
    expect(faltan).toEqual([]);
  });

  it("cada lector conectado llama con su lector, y la lista de los que faltan solo encoge", () => {
    const mal: string[] = [];
    for (const [lector, c] of Object.entries(CONSUMIDORES_DE_LA_MEMORIA) as [LectorDeMemoria, (typeof CONSUMIDORES_DE_LA_MEMORIA)[LectorDeMemoria]][]) {
      const conectados = c.archivos.filter((a) => IMPORTADORES.includes(a) && leer(a).includes(llamadaDe(lector)));
      if (AUN_SIN_CONECTAR.has(lector) && conectados.length) {
        mal.push(`${lector} ya está conectado (${conectados.join(", ")}): bórralo de AUN_SIN_CONECTAR`);
      }
      if (!AUN_SIN_CONECTAR.has(lector) && conectados.length !== c.archivos.length) {
        mal.push(`${lector}: ${c.archivos.filter((a) => !conectados.includes(a)).join(", ")} no llama al cargador con «${llamadaDe(lector)}»`);
      }
    }
    expect(mal).toEqual([]);
  });

  it("el alcance de cada pieza sale de clientFacing (salvo el handoff, sin-lo-interno a propósito)", () => {
    const mal: string[] = [];
    for (const [lector, c] of Object.entries(CONSUMIDORES_DE_LA_MEMORIA)) {
      if (!c.pieza) continue;
      const pieza = pieceBySlug(c.pieza);
      if (!pieza) {
        mal.push(`${lector}: la pieza «${c.pieza}» no existe`);
        continue;
      }
      if (lector === "handoff") {
        if (c.alcance !== "sin-lo-interno") mal.push("handoff: tiene que ser sin-lo-interno");
        continue;
      }
      if ((c.alcance === "cliente") !== pieza.clientFacing) mal.push(`${lector}: alcance ${c.alcance} y clientFacing ${pieza.clientFacing}`);
      if (c.alcance !== alcanceDeLaPieza(c.pieza)) mal.push(`${lector}: no usa alcanceDeLaPieza`);
    }
    expect(mal).toEqual([]);
  });

  it("lo que ve el cliente (el correo) lee recortado, y el handoff no lee lo que él mismo propone", () => {
    expect(CONSUMIDORES_DE_LA_MEMORIA.correo.alcance).toBe("cliente");
    expect(CONSUMIDORES_DE_LA_MEMORIA.handoff.excluirOrigenes).toContain("Handoff");
    expect(CONSUMIDORES_DE_LA_MEMORIA["exploracion-del-proyecto"].excluirOrigenes).toContain("Exploración");
    expect(CONSUMIDORES_DE_LA_MEMORIA.preventa.excluirOrigenes).toEqual(expect.arrayContaining(["Exploración", "Preventa"]));
  });
});

describe("⛔ un documento que lee solo las reuniones elegidas lee también la memoria (etapa 7)", () => {
  it("cada uno tiene su lector conectado: sin elegidas, no sale vacío", () => {
    /* La edición que la pone en rojo: un documento pasa a «solo las elegidas» (DESTINOS_SOLO_ELEGIDAS) sin un lector de
       la memoria conectado — o vuelve a AUN_SIN_CONECTAR. Sin elegidas saldría solo con el handoff. */
    const faltan: string[] = [];
    for (const doc of DOCUMENTOS_CON_CONTEXTO.filter((d) => esSoloElegidas(d.destino))) {
      const entrada = (Object.entries(CONSUMIDORES_DE_LA_MEMORIA) as [LectorDeMemoria, (typeof CONSUMIDORES_DE_LA_MEMORIA)[LectorDeMemoria]][]).find(
        ([, c]) => c.pieza === doc.pieza,
      );
      if (!entrada) {
        faltan.push(`${doc.pieza}: no tiene lector de la memoria`);
        continue;
      }
      const [lector, c] = entrada;
      if (AUN_SIN_CONECTAR.has(lector)) faltan.push(`${doc.pieza}: «${lector}» sigue sin conectar`);
      if (!c.archivos.every((a) => IMPORTADORES.includes(a) && leer(a).includes(llamadaDe(lector)))) faltan.push(`${doc.pieza}: «${lector}» no llama al cargador`);
    }
    expect(faltan).toEqual([]);
  });
});

describe("la X de cada documento", () => {
  it("un lector con «Contexto adicional» propio declara su destino: la memoria respeta su X", () => {
    /* La memoria del proyecto tomaba todas las reuniones del proyecto: una que el CSE sacó con la X del kickoff volvía
       al kickoff por la memoria. La edición que la pone en rojo: un lector de un documento sin `destino`, o con el de
       otro. La exploración no: la nueva no lee esa columna (lee solo la reunión de cada sesión). */
    for (const [lector, c] of Object.entries(CONSUMIDORES_DE_LA_MEMORIA)) {
      const doc = c.pieza ? documentoConContexto(c.pieza) : null;
      if (!doc || doc.pieza === "exploration") continue;
      expect(c.destino, `«${lector}» no declara el destino de su «Contexto adicional»`).toBe(doc.destino);
    }
  });
});

describe("queCargar", () => {
  it("para el cliente no se carga nada interno (las minutas en borrador no lo son: llegan marcadas)", () => {
    const { minutasSinRevisar, ...resto } = queCargar("cliente");
    expect(Object.values(resto).every((v) => v === false)).toBe(true);
    // La IA como borrador (2026-10-15): solo sus acuerdos y decisiones, sin montos ni negociación (frontera.test.ts).
    expect(minutasSinRevisar).toBe(true);
  });
  it("sin-lo-interno: lo propuesto y lo sin validar, nunca lo interno", () => {
    const q = queCargar("sin-lo-interno");
    expect(q.fichaPropuesta && q.procesosSinValidar && q.resultadosSinConfirmar && q.minutasSinRevisar).toBe(true);
    expect([q.camposInternos, q.posturaDeLasPersonas, q.fueraDeAlcance, q.preventa, q.auditoria, q.compromisos, q.minutaCompleta, q.reunionesPuertasAdentro, q.desviacionesNoVisibles, q.atribucionDeDesviaciones, q.idsDeTrato, q.hechos]).toEqual(
      Array(12).fill(false),
    );
  });
  it("interno: todo", () => {
    expect(Object.values(queCargar("interno")).every((v) => v === true)).toBe(true);
  });
});
