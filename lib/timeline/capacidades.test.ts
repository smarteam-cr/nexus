/**
 * lib/timeline/capacidades.test.ts
 *
 * Correr: `npx vitest run lib/timeline/capacidades.test.ts --project unit`.
 *
 * ── LA GUARDA QUE JUSTIFICA EL MODULO ────────────────────────────────────────────────────────
 * Las reglas del modificador viven aca para que el chat que conversa pueda decir «eso no se
 * puede» ANTES de proponerlo — que es literalmente lo que Elias pidio. Si el prompt del
 * modificador vuelve a transcribirlas, hay dos copias; dos copias divergen calladas; y la
 * divergencia se manifiesta como el chat prometiendole al CSE algo que el modificador no hace.
 *
 * Nada falla cuando eso pasa: el JSON sigue siendo valido y el documento sale. Por eso la guarda
 * es estructural — que el prompt las INTERPOLE, no que las contenga.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  REGLAS_DURAS_DEL_CRONOGRAMA,
  ADVERTENCIAS_DEL_CRONOGRAMA,
  advertenciasParaLaInstruccion,
} from "./capacidades";
import { PROMPT_ASSIST_CRONOGRAMA } from "@/lib/agents/timeline-assist";

const MODULO_DEL_PROMPT = "lib/agents/timeline-assist.ts";

describe("una sola copia de las reglas", () => {
  it("LA GUARDA: el prompt las INTERPOLA, no las transcribe", () => {
    /* La edicion que la pone en rojo: pegar el texto de las reglas dentro del template del
       prompt en vez de interpolar la constante. El prompt sigue saliendo identico —por eso no
       falla nada— pero a partir de ahi el chat y el modificador pueden decir cosas distintas. */
    const src = fs.readFileSync(path.join(process.cwd(), MODULO_DEL_PROMPT), "utf8");
    expect(src, "el prompt dejo de importar las reglas compartidas").toContain(
      "REGLAS_DURAS_DEL_CRONOGRAMA",
    );
    expect(
      src.includes("- Conserva los ids EXACTOS"),
      "las reglas volvieron a estar transcritas dentro del prompt: son dos copias",
    ).toBe(false);
  });

  it("y el prompt sigue llevandolas de verdad", () => {
    // Interpolar mal (o interpolar otra constante) dejaria al agente sin reglas y el test de
    // arriba pasaria igual.
    expect(PROMPT_ASSIST_CRONOGRAMA).toContain(REGLAS_DURAS_DEL_CRONOGRAMA);
    expect(REGLAS_DURAS_DEL_CRONOGRAMA.length).toBeGreaterThan(1000);
  });

  it("las reglas nombran las cuatro cosas que el modificador NO puede hacer solo", () => {
    // Si alguna se afloja, el chat deja de poder advertirla y el CSE se entera despues de aplicar.
    expect(REGLAS_DURAS_DEL_CRONOGRAMA).toMatch(/ids EXACTOS/);
    expect(REGLAS_DURAS_DEL_CRONOGRAMA).toMatch(/OTRA fase/);
    expect(REGLAS_DURAS_DEL_CRONOGRAMA).toMatch(/omitir es borrar/);
    expect(REGLAS_DURAS_DEL_CRONOGRAMA).toMatch(/weekIndex/);
  });
});

describe("las advertencias que el chat puede dar antes de proponer", () => {
  it("mover una tarea avisa que pierde su estado", () => {
    const avisos = advertenciasParaLaInstruccion("move la tarea de QA a la fase de adopcion");
    expect(avisos.length).toBeGreaterThan(0);
    expect(avisos.map((a) => a.aviso).join(" ")).toMatch(/pierde su estado|RECREA/);
  });

  it("funciona con tildes y con voseo, que es como escribe el equipo", () => {
    expect(advertenciasParaLaInstruccion("mové esa tarea a otra fase").length).toBeGreaterThan(0);
    expect(advertenciasParaLaInstruccion("alargá Setup una semana").length).toBeGreaterThan(0);
    expect(advertenciasParaLaInstruccion("cambiá la fecha de arranque").length).toBeGreaterThan(0);
  });

  it("un pedido inocuo no dispara ruido", () => {
    /* Una advertencia que aparece siempre se ignora siempre. Es el mismo criterio del aviso de
       tarea repetida: el falso positivo es lo que la vuelve inutil. */
    expect(advertenciasParaLaInstruccion("cambia el titulo de la primera tarea")).toEqual([]);
  });

  it("cada advertencia dice la CONSECUENCIA, no solo que existe", () => {
    for (const a of ADVERTENCIAS_DEL_CRONOGRAMA) {
      expect(a.gatillo.length, "una advertencia sin gatillo no se dispara nunca").toBeGreaterThan(0);
      expect(
        a.aviso.length,
        `la advertencia de "${a.gatillo[0]}" es demasiado corta para decir que pasa`,
      ).toBeGreaterThan(60);
    }
  });
});
