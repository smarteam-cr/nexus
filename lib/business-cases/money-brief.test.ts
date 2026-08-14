/**
 * lib/business-cases/money-brief.test.ts
 *
 * El bug que este guard existe para que no vuelva: el 2026-08-12 la regla de precios se
 * escribió como "NO pongas montos … en NINGÚN texto que generes — ni en el titular, ni en
 * la solución, ni en el ROI, ni en el cierre", y el brief del ROI seguía pidiendo "'$[X]k'
 * valor estimado de [oportunidad/año]". Dos instrucciones opuestas sobre lo mismo, así que
 * el modelo desempataba solo y distinto cada vez: medido contra las 9 propuestas de la
 * base, 5 de 53 dolores traían alguna cifra y UNO SOLO traía plata.
 *
 * Lo que se congela acá no es la redacción —el prompt se calibra— sino la DISTINCIÓN:
 * el precio es nuestro y no lo escribe el agente; el impacto es del cliente y es el
 * argumento. Y las dos reglas anti-fabricación que cazaron corridas reales del arnés:
 * el rango que se vuelve su extremo alto (infla un tercio) y el "el año pasado" que se
 * convierte en un año concreto y equivocado.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MONEY_RULE_BRIEF } from "./money-brief";
import { BC_SECTION_DEFS } from "@/components/landing/configs/business-case.defs";

const briefDe = (key: string) => {
  const def = BC_SECTION_DEFS.find((d) => d.key === key);
  expect(def, `la sección "${key}" desapareció del template`).toBeTruthy();
  return def!.brief ?? "";
};

describe("la regla de dinero distingue PRECIO de IMPACTO", () => {
  it("nombra las dos y dice de quién es cada una", () => {
    expect(MONEY_RULE_BRIEF).toContain("PRECIO");
    expect(MONEY_RULE_BRIEF).toContain("IMPACTO");
    // Sin el "SÍ va" el impacto queda como una aclaración y no como un permiso.
    expect(MONEY_RULE_BRIEF).toMatch(/IMPACTO[^\n]*SÍ va/);
  });

  it("NO vuelve a prohibir los montos en bloque", () => {
    // La forma exacta que tenía la prohibición colapsada. Si reaparece, el brief del ROI
    // y el de dolores quedan contradichos otra vez y nadie se entera hasta ver el output.
    expect(MONEY_RULE_BRIEF).not.toMatch(/NING[ÚU]N texto/i);
  });

  it("exige que la cuenta esté escrita, que es lo que la hace verificable", () => {
    expect(MONEY_RULE_BRIEF).toMatch(/ESCRITA|escrita/);
    expect(MONEY_RULE_BRIEF).toMatch(/JAMÁS inventes/);
  });

  it("un rango se reporta como rango, no como su extremo alto", () => {
    // Cazado en el arnés: «entre 15% y 20%» salió como «$480.000» — un tercio de más.
    expect(MONEY_RULE_BRIEF).toMatch(/RANGO/);
  });

  it("una fecha relativa no se convierte en un año concreto", () => {
    // Cazado en el arnés: «el año pasado» salió como «2024» estando en 2026.
    expect(MONEY_RULE_BRIEF).toMatch(/FECHAS/);
    expect(MONEY_RULE_BRIEF).toContain("el año pasado");
  });
});

describe("el preámbulo del generate usa la constante, no una copia", () => {
  it("importa MONEY_RULE_BRIEF en vez de re-escribir la regla adentro", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/business-cases/[id]/generate/route.ts"),
      "utf8",
    );
    expect(route).toContain("MONEY_RULE_BRIEF");
    // Una copia inline volvería a envejecer aparte del arnés y de este guard.
    expect(route).not.toMatch(/# (Precios|Dinero):/);
  });
});

describe("las dos secciones que llevan cifras piden lo mismo", () => {
  const dolores = () => briefDe("dolores");
  const roi = () => briefDe("roi");

  it("dolores manda a cuantificar y saca el número del título", () => {
    expect(dolores()).toMatch(/CUANTIFIC/);
    expect(dolores()).toMatch(/`title` NUNCA ES UN NÚMERO/);
    // La cifra suma al dolor, no lo reemplaza ni abre una tarjeta propia.
    expect(dolores()).toMatch(/UN PROBLEMA = UNA TARJETA/);
  });

  it("el ROI pide métricas operativas Y económicas", () => {
    expect(roi()).toMatch(/OPERATIVAS/);
    expect(roi()).toMatch(/ECONÓMICAS/);
    expect(roi()).toMatch(/al menos una|Al menos UNA/i);
  });

  it("ninguna de las dos habilita inventar", () => {
    for (const b of [dolores(), roi()]) expect(b).toMatch(/NUNCA inventes|jamás la inventes|JAMÁS/i);
  });

  it("las dos declaran que la plata es del CLIENTE, no el precio de la propuesta", () => {
    for (const b of [dolores(), roi()]) expect(b).toMatch(/plata del CLIENTE/);
  });
});
