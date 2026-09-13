/**
 * lib/finanzas/plan-de-cobranza.test.ts
 *
 * La página del plan se lee en dos minutos y se cree entera: por eso no puede prometer lo que no se
 * hizo. Esto fija que cada cosa que dice «Nexus ya hace» esté sostenida por una etapa commiteada,
 * que lo que necesita un cambio de base lo avise, que devolver los 3 cobros siga siendo de Alex y
 * que no se cuele la jerga.
 */
import { describe, expect, it } from "vitest";
import {
  DECISIONES,
  DESCRIPCION,
  ETAPAS_COMMITEADAS,
  ETAPAS_QUE_ESPERAN_LA_BASE,
  NO_SE_PUDO_LEER,
  NUMEROS_EN_VIVO,
  PERSONAS,
  QUE_HACE_AHORA,
  SIN_TAREAS,
  TAREAS,
  TITULO,
} from "./plan-de-cobranza";

const LOS_TRES = ["FAC/2026/0206", "FAC/2026/0295", "FAC/2026/0302"];

describe("qué hace Nexus ahora", () => {
  it("son de 5 a 7 renglones: se lee en dos minutos", () => {
    expect(QUE_HACE_AHORA.length).toBeGreaterThanOrEqual(5);
    expect(QUE_HACE_AHORA.length).toBeLessThanOrEqual(7);
  });

  it("cada renglón nombra al menos una etapa, y todas quedaron commiteadas", () => {
    const hechas = new Set<number>(ETAPAS_COMMITEADAS);
    for (const c of QUE_HACE_AHORA) {
      expect(c.etapas.length, `«${c.titulo}» no dice qué lo sostiene`).toBeGreaterThan(0);
      for (const e of c.etapas) {
        expect(hechas.has(e), `«${c.titulo}» nombra la etapa ${e}, que no quedó commiteada`).toBe(true);
      }
    }
  });

  it("la etapa 15 no se construyó, y las que esperan la base son de las commiteadas", () => {
    expect(ETAPAS_COMMITEADAS).not.toContain(15);
    for (const e of ETAPAS_QUE_ESPERAN_LA_BASE) expect(ETAPAS_COMMITEADAS).toContain(e);
  });

  it("lo que necesita un cambio de base lo avisa, y lo que no lo necesita no", () => {
    const esperan = new Set<number>(ETAPAS_QUE_ESPERAN_LA_BASE);
    for (const c of QUE_HACE_AHORA) {
      const necesita = c.etapas.some((e) => esperan.has(e));
      expect(c.espera !== null, `«${c.titulo}»: ${necesita ? "no avisa que espera la base" : "avisa una espera que no tiene"}`).toBe(
        necesita,
      );
    }
  });
});

describe("lo que falta y lo que espera una decisión", () => {
  it("cada tarea es de una persona de la página", () => {
    const personas = new Set(PERSONAS.map((p) => p.quien));
    for (const t of TAREAS) expect(personas.has(t.quien), t.que).toBe(true);
  });

  it("devolver los 3 cobros lo hace Alex con el diálogo, no nadie más", () => {
    const deAlex = TAREAS.filter((t) => t.quien === "Alex").map((t) => t.que).join("\n");
    const delResto = TAREAS.filter((t) => t.quien !== "Alex").map((t) => t.que).join("\n");
    expect(deAlex).toContain("«Sacar de Cobrado»");
    for (const n of LOS_TRES) {
      expect(deAlex).toContain(n);
      expect(delResto).not.toContain(n);
    }
  });

  it("las decisiones son solo de Alex y Marco", () => {
    expect(DECISIONES.length).toBeGreaterThan(0);
    for (const d of DECISIONES) expect(["Alex", "Marco"]).toContain(d.quien);
  });
});

describe("sin jerga técnica", () => {
  const JERGA = [/\bSQL\b/i, /\betapas?\b/i, /\bINV\d+/, /\.(?:ts|tsx|sql)\b/, /\bcolumnas?\b/i, /\bscripts?\b/i, /\bdeploy\b/i, /\bcommit/i];

  it("ningún texto visible nombra archivos, columnas, SQL ni etapas", () => {
    const textos = [
      TITULO,
      DESCRIPCION,
      SIN_TAREAS,
      NO_SE_PUDO_LEER,
      ...PERSONAS.map((p) => p.rol),
      ...QUE_HACE_AHORA.flatMap((c) => [c.titulo, c.consecuencia, c.espera ?? ""]),
      ...TAREAS.flatMap((t) => [t.que, t.espera ?? ""]),
      ...DECISIONES.flatMap((d) => [d.pregunta, d.mientras]),
      ...Object.values(NUMEROS_EN_VIVO).flatMap((n) => Object.values(n)),
    ];
    for (const t of textos) {
      for (const re of JERGA) expect(re.test(t), `«${t}» usa jerga (${re})`).toBe(false);
    }
  });
});
