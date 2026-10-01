/**
 * lib/exploraciones/para-la-propuesta.test.ts — lo que la exploración le pasa a la propuesta.
 * Correr: `npx vitest run lib/exploraciones/para-la-propuesta.test.ts --project unit`.
 *
 * Con la escala de verdad (el archivo del repo): la posición sale del chequeo con nombres de nivel
 * y el nombre GENERAL de la dimensión que frena, la lee el mismo lector que usa el kickoff, y el
 * bloque de contexto no lleva nada interno ni un id de la escala.
 */
import { describe, expect, it } from "vitest";
import { calcularChequeo } from "@/lib/escala/chequeo";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import type { Letra } from "@/lib/escala/documento/tipos";
import { leerPosicion } from "@/lib/escala/posicion";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion } from "./contenido";
import { escalaParaElLienzo, type EscalaDelLienzo } from "./escala-del-lienzo";
import { bloqueParaElHandoff, TOPE_DEL_BLOQUE_DEL_HANDOFF } from "./para-el-handoff";
import { bloqueParaLaPropuesta, posicionDesdeElChequeo } from "./para-la-propuesta";

const general = parsearEscala(leerArchivoDeLaEscala("escala"));
const PERFIL = { cierre: "con equipo" as const, despues: "continua" as const };

function estadoCon(niveles: Record<string, Letra>, extra: Partial<EstadoDeExploracion["contenido"]> = {}): EstadoDeExploracion {
  const contenido = { ...contenidoVacio(), ...extra };
  for (const [id, nivel] of Object.entries(niveles)) contenido.chequeo[id] = { nivel, fuente: "reunion" };
  return {
    contenido,
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: PERFIL.cierre,
    perfilDespues: PERFIL.despues,
    responsableEmail: null,
    archivada: false,
  };
}

function chequeoDe(escala: EscalaDelLienzo, e: EstadoDeExploracion) {
  const areas = e.areas.map((id) => escala.areas.find((a) => a.id === id)!.paraChequeo);
  return calcularChequeo(areas, Object.fromEntries(Object.entries(e.contenido.chequeo).map(([id, x]) => [id, { nivel: x.nivel }])));
}

/** Las dimensiones de Ventas que aplican, con un nivel cada una: la más baja de la base es la indicada. */
function nivelesDeVentas(escala: EscalaDelLienzo, masBajaDeLaBase: string): Record<string, Letra> {
  const out: Record<string, Letra> = {};
  for (const d of escala.areas.find((a) => a.id === "1")!.dimensiones) {
    if (!d.aplica) continue;
    out[d.id] = d.id === masBajaDeLaBase ? "D" : d.capa === "base" ? "F" : "I";
  }
  return out;
}

describe("la posición en la escala, desde el chequeo", () => {
  const escala = escalaParaElLienzo(general, null, PERFIL);
  const base = escala.areas.find((a) => a.id === "1")!.dimensiones.find((d) => d.capa === "base" && d.aplica)!;
  const e = estadoCon(nivelesDeVentas(escala, base.id));

  it("en español: nombres de nivel, la dimensión que frena, la meta y la capa que frena", () => {
    const p = posicionDesdeElChequeo(chequeoDe(escala, e), escala, "es");
    expect(p.areas).toHaveLength(1);
    expect(p.areas[0]).toMatchObject({
      area: escala.areas.find((a) => a.id === "1")!.nombre,
      base: "Deficiente",
      basePiso: base.nombre,
      produccion: "Inicial",
      meta: "Funcional",
      cercania: "",
    });
    expect(p.areas[0].brecha).toMatch(/base operativa/);
    expect(p.intro).toMatch(/estimado/);
    // El mismo lector que usa el kickoff la entiende.
    expect(leerPosicion(p)?.areas[0].base).toBe("Deficiente");
  });

  it("en inglés: los niveles y el área en el idioma de la propuesta", () => {
    const p = posicionDesdeElChequeo(chequeoDe(escala, e), escala, "en");
    expect(p.areas[0]).toMatchObject({ area: "Sales", base: "Deficient", produccion: "Initial", meta: "Functional" });
    expect(p.remedicion).toMatch(/60 to 90 days/);
  });

  it("con una edición, la dimensión que frena va con su nombre GENERAL, nunca el de la edición", () => {
    let caso: { edicion: string; areaId: string; id: string; capa: "base" | "produccion"; general: string; deLaEdicion: string } | null = null;
    for (const ed of general.ediciones) {
      const vista = escalaParaElLienzo(general, ed.slug, PERFIL);
      for (const a of vista.areas) {
        const d = a.dimensiones.find((x) => x.aplica && x.nombreGeneral);
        if (d && !caso) caso = { edicion: ed.slug, areaId: a.id, id: d.id, capa: d.capa, general: d.nombreGeneral!, deLaEdicion: d.nombre };
      }
    }
    expect(caso, "ninguna edición renombra una dimensión: el caso no se puede probar").not.toBeNull();
    const vista = escalaParaElLienzo(general, caso!.edicion, PERFIL);
    const niveles: Record<string, Letra> = {};
    for (const d of vista.areas.find((a) => a.id === caso!.areaId)!.dimensiones) if (d.aplica) niveles[d.id] = d.id === caso!.id ? "D" : "F";
    const e2 = { ...estadoCon(niveles), areas: [caso!.areaId], edicion: caso!.edicion };
    const p = posicionDesdeElChequeo(chequeoDe(vista, e2), vista, "es");
    const piso = caso!.capa === "base" ? p.areas[0].basePiso : p.areas[0].produccionPiso;
    expect(piso).toBe(caso!.general);
    expect(piso).not.toBe(caso!.deLaEdicion);
  });

  it("un área sin ninguna capa estimada no aparece", () => {
    const p = posicionDesdeElChequeo(chequeoDe(escala, estadoCon({})), escala, "es");
    expect(p).toEqual({ intro: "", areas: [], remedicion: "" });
  });
});

describe("el bloque de contexto para la generación", () => {
  const escala = escalaParaElLienzo(general, null, PERFIL);
  const base = escala.areas.find((a) => a.id === "1")!.dimensiones.find((d) => d.capa === "base" && d.aplica)!;
  const criterio = base.funcional[0];
  const e = estadoCon(nivelesDeVentas(escala, base.id), {
    casillas: {
      metas: [{ que: "Subir la tasa de cierre", actual: "dos de cada diez", objetivo: "cuatro de cada diez", para: "junio" }],
      retos: [{ texto: "Cada vendedor anota en su planilla", dimensionId: base.id }],
      consecuencias: ["Recortan el presupuesto de marketing"],
      hipotesis: ["Creemos que HIPOTESIS_INTERNA"],
      presupuesto: "PRESUPUESTO_INTERNO",
      autoridad: [{ nombre: "PERSONA_INTERNA", rol: "firma" }],
      noExplorado: ["NO_EXPLORADO_INTERNO"],
      contexto: "CONTEXTO_INTERNO",
      siguientePaso: { que: "PASO_INTERNO" },
    },
    falta: { [criterio.id]: { estado: "no_tiene" } },
    casosDeUso: { uc1: { titulo: "Pipeline de ventas", areaId: "1", razon: "Deja las etapas definidas" } },
  });
  const chequeo = chequeoDe(escala, e);

  it("lleva las metas con cifras, los retos, lo que falta (por su texto) y para qué va cada caso de uso", () => {
    const b = bloqueParaLaPropuesta({ estado: e, escala, chequeo, conEscala: true });
    expect(b).toContain("- Subir la tasa de cierre: de dos de cada diez a cuatro de cada diez, para junio");
    expect(b).toContain(`- Cada vendedor anota en su planilla (${base.nombre})`);
    expect(b).toContain("Recortan el presupuesto de marketing");
    expect(b).toContain(criterio.texto);
    expect(b).toContain("- Pipeline de ventas (");
    expect(b).toMatch(/base operativa Deficiente/);
  });

  it("nada interno y ningún id de la escala: la propuesta la ve el cliente", () => {
    const b = bloqueParaLaPropuesta({ estado: e, escala, chequeo, conEscala: true });
    for (const interno of ["HIPOTESIS_INTERNA", "PRESUPUESTO_INTERNO", "PERSONA_INTERNA", "NO_EXPLORADO_INTERNO", "CONTEXTO_INTERNO", "PASO_INTERNO"]) {
      expect(b).not.toContain(interno);
    }
    expect(b).not.toContain(criterio.id);
    expect(b).not.toMatch(/\b\d\.\d\b/);
  });

  it("con «Sin Escala» no nombra niveles ni la escala", () => {
    const b = bloqueParaLaPropuesta({ estado: e, escala, chequeo, conEscala: false });
    expect(b).not.toMatch(/Deficiente|Funcional|Inicial|nivel|Escala/);
    expect(b).toContain("Lo que le falta hoy");
  });
});

describe("el bloque del handoff", () => {
  const escala = escalaParaElLienzo(general, null, PERFIL);
  const base = escala.areas.find((a) => a.id === "1")!.dimensiones.find((d) => d.capa === "base" && d.aplica)!;
  const e = estadoCon(nivelesDeVentas(escala, base.id), {
    casillas: {
      metas: [{ que: "Subir la tasa de cierre", actual: "dos de cada diez", objetivo: "cuatro de cada diez" }],
      consecuencias: ["Recortan el presupuesto de marketing"],
      hipotesis: ["Creemos que HIPOTESIS_INTERNA"],
      presupuesto: "PRESUPUESTO_INTERNO",
      autoridad: [{ nombre: "Ana", rol: "firma", nota: "NOTA_INTERNA" }],
      apertura: { valor: "si", porQue: "APERTURA_INTERNA" },
    },
  });
  e.contenido.chequeo[base.id] = { nivel: "D", fuente: "reunion", evidencia: "Cada vendedor en su planilla" };
  const b = bloqueParaElHandoff({ estado: e, escala, chequeo: chequeoDe(escala, e) });

  it("va rotulado ESTIMADO, con el nivel de cada dimensión y de dónde salió", () => {
    expect(b.split("\n")[0]).toMatch(/ESTIMADO: sirve para saber dónde mirar, no es evidencia/);
    expect(b).toContain(`· ${base.nombre}: Deficiente (`);
    expect(b).toContain("«Cada vendedor en su planilla»");
    expect(b).toContain("Subir la tasa de cierre: de dos de cada diez a cuatro de cada diez");
  });

  it("lo interno va al final, debajo de «SOLO INTERNO», y en ningún otro lado", () => {
    const corte = b.indexOf("## SOLO INTERNO");
    expect(corte).toBeGreaterThan(0);
    for (const interno of ["HIPOTESIS_INTERNA", "PRESUPUESTO_INTERNO", "NOTA_INTERNA", "APERTURA_INTERNA"]) {
      expect(b.indexOf(interno), interno).toBeGreaterThan(corte);
    }
  });

  it("tiene tope", () => {
    const largo = estadoCon({}, { casillas: { consecuencias: Array.from({ length: 40 }, (_, i) => `Consecuencia ${i} ${"x".repeat(300)}`) } });
    expect(bloqueParaElHandoff({ estado: largo, escala, chequeo: chequeoDe(escala, largo) }).length).toBeLessThanOrEqual(TOPE_DEL_BLOQUE_DEL_HANDOFF + 20);
  });
});
