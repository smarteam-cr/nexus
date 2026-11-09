import { describe, expect, it } from "vitest";
import { LETRAS } from "./documento/tipos";
import { esArrastre, letraDelArrastre, radioSobreElEje } from "./arrastre-del-radar";
import { COMPACTO, GRANDE, polarDe, radioDeLaEtapa } from "./radar-de-una-empresa";

const ejeA = (m: typeof GRANDE, grados: number) => ({
  desde: polarDe(m, grados, m.rEjeDesde),
  hasta: polarDe(m, grados, m.rEjeHasta),
});

describe("arrastrar un nivel en el radar", () => {
  it("sobre cada anillo da su nivel, en cualquier eje y en los dos tamaños", () => {
    for (const m of [GRANDE, COMPACTO])
      for (const grados of [0, 37, 90, 200, 315])
        for (const l of LETRAS) expect(letraDelArrastre(m, polarDe(m, grados, radioDeLaEtapa(m, l)), ejeA(m, grados))).toBe(l);
  });

  it("gana el anillo más cercano", () => {
    const m = GRANDE;
    const entreIyF = radioDeLaEtapa(m, "I") + m.paso * 0.4;
    expect(letraDelArrastre(m, polarDe(m, 90, entreIyF), ejeA(m, 90))).toBe("I");
    expect(letraDelArrastre(m, polarDe(m, 90, entreIyF + m.paso * 0.2), ejeA(m, 90))).toBe("F");
  });

  it("más adentro que Deficiente es Deficiente; más afuera que Óptimo, Óptimo", () => {
    const m = GRANDE;
    expect(letraDelArrastre(m, [m.cx, m.cy], ejeA(m, 45))).toBe("D");
    expect(letraDelArrastre(m, polarDe(m, 45, m.rEjeHasta + 400), ejeA(m, 45))).toBe("O");
    // Del otro lado del centro (radio negativo) también es Deficiente.
    expect(letraDelArrastre(m, polarDe(m, 225, radioDeLaEtapa(m, "E")), ejeA(m, 45))).toBe("D");
  });

  it("correrse de costado no cambia el nivel: se mide a lo largo del eje", () => {
    const m = GRANDE;
    const sobre = polarDe(m, 0, radioDeLaEtapa(m, "E"));
    const r = radioSobreElEje(m, sobre, ejeA(m, 0));
    // El eje de 0 grados: un corrimiento perpendicular no cambia la proyección.
    const de90 = polarDe(m, 90, 1);
    const perp: [number, number] = [sobre[0] + (de90[0] - m.cx) * 30, sobre[1] + (de90[1] - m.cy) * 30];
    expect(radioSobreElEje(m, perp, ejeA(m, 0))).toBeCloseTo(r, 6);
    expect(letraDelArrastre(m, perp, ejeA(m, 0))).toBe("E");
  });

  it("un toque no es un arrastre; cinco píxeles sí", () => {
    expect(esArrastre({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(false);
    expect(esArrastre({ x: 10, y: 10 }, { x: 13, y: 14 })).toBe(true);
  });
});
