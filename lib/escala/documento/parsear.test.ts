/**
 * lib/escala/documento/parsear.test.ts — que la escala se lea ENTERA y que lo raro se rechace.
 *
 * El riesgo de un lector de documentos no es que falle: es que lea de MENOS y nadie lo note. Por
 * eso el archivo real se cuenta contra sus propias etiquetas (sin escribir acá cuántas son: una
 * versión nueva no tiene que tocar este test), y la escala de juguete fija cada regla.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./archivos";
import { MINI_ESCALA } from "./mini-escala.fixture";
import { leerEncabezado, parsearEscala, slugDe, todosLosCriterios } from "./parsear";
import { ErrorDeFormato, LETRAS } from "./tipos";

describe("la escala de juguete", () => {
  const e = parsearEscala(MINI_ESCALA);
  const [p, t] = e.areas[0].dimensiones;

  it("lee el encabezado, los niveles y las capas", () => {
    expect(e.version).toBe("9.9.9");
    expect(e.estado).toBe("De juguete");
    expect(e.niveles.map((n) => `${n.codigo}${n.letra} ${n.nombre}`)).toEqual([
      "1D Deficiente",
      "2I Inicial",
      "3F Funcional",
      "4E Eficiente",
      "5O Óptimo",
    ]);
    expect(e.capas).toEqual([
      { clave: "base", nombre: "Base operativa", descripcion: "cómo está montado por dentro" },
      { clave: "produccion", nombre: "Producción", descripcion: "qué entrega hacia afuera" },
    ]);
  });

  it("lee el área, sus dimensiones y la panorámica", () => {
    const a = e.areas[0];
    expect(a).toMatchObject({ id: "1", nombre: "Ventas", slug: "ventas", descripcion: "Mide Ventas." });
    expect(a.panoramica).toEqual({ D: "Caos.", I: "Algo.", F: "Base.", E: "Método.", O: "Sistema." });
    expect(p).toMatchObject({
      id: "1.1",
      capa: "base",
      pregunta: "¿La operación sigue sin la persona clave?",
      costoDeQuedarse: "Se pierde el proceso.",
      generica: { nombre: "Procesos y Rutinas", descripcion: "si se ejecuta por sistema." },
    });
    expect(t).toMatchObject({ id: "1.2", capa: "produccion", generica: { nombre: "Alcance" } });
  });

  it("cada dimensión trae los cinco niveles, con resultado solo desde Funcional", () => {
    expect(p.niveles.map((n) => n.id)).toEqual(["1.1.D", "1.1.I", "1.1.F", "1.1.E", "1.1.O"]);
    expect(p.niveles.map((n) => n.resultado !== null)).toEqual([false, false, true, true, true]);
    expect(p.niveles[2].descripcion).toBe("Maquinaria base.");
    expect(p.niveles[2].resultado).toBe("Nada depende de una persona.");
  });

  it("lee cada marca de la etiqueta", () => {
    const f = p.niveles[2].criterios;
    expect(f[0]).toEqual({
      id: "1.1.F1",
      texto: "Hay un pipeline configurado.",
      verificacion: "comprobable",
      riesgo: false,
      habito: false,
      perfil: null,
    });
    expect(f[1]).toMatchObject({ id: "1.1.F2", verificacion: "declarado", habito: true, perfil: "venta con equipo" });
    expect(f[2]).toMatchObject({ id: "1.1.F3", riesgo: true, habito: false, perfil: null });
    expect(p.niveles[3].criterios[0].perfil).toBe("cliente recurrente");
    expect(p.niveles[4].criterios[0].perfil).toBe("relación continua");
  });

  it("lee la prosa: riesgos, glosario, verificación, explicaciones, dependencias e historial", () => {
    expect(e.riesgos).toEqual({ "1.1.F3": "Tus reportes pueden estar inflados." });
    expect(e.glosario).toEqual([{ termino: "Hábito", significado: "Algo que el equipo repite." }]);
    expect(e.verificacion).toEqual({
      comprobable: "Está en el sistema.",
      declarado: "Lo dice el cliente.",
      evaluado: "Lo observa alguien.",
    });
    expect(e.explicaciones.riesgo).toBe("Protegen algo.\n\nNo impiden llegar a Funcional.");
    expect(e.explicaciones.habito).toBe("Hábitos.\n\nTres estados.");
    expect(e.explicaciones.perfil).toContain("Con equipo o no.");
    expect(e.dependencias).toEqual([
      { capa: "Base operativa", cuando: "Ventas", orden: ["Procesos y Rutinas", "Datos"], porQue: "Porque sí." },
    ]);
    expect(e.historial).toEqual([{ version: "9.9.9", fecha: "2030-01-01", texto: "Primera de juguete." }]);
  });

  it("con CRLF lee exactamente lo mismo (los archivos llegan así desde Windows)", () => {
    expect(parsearEscala(MINI_ESCALA.replace(/\n/g, "\r\n"))).toEqual(e);
  });

  it("un párrafo partido en dos líneas se lee como uno", () => {
    const partido = MINI_ESCALA.replace(
      "¿La operación sigue sin la persona clave?",
      "¿La operación sigue\nsin la persona clave?",
    );
    expect(parsearEscala(partido).areas[0].dimensiones[0].pregunta).toBe("¿La operación sigue sin la persona clave?");
  });
});

describe("lo que el lector rechaza, con su línea", () => {
  const falla = (texto: string) => {
    try {
      parsearEscala(texto);
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorDeFormato);
      return (err as ErrorDeFormato).message;
    }
    throw new Error("se esperaba un ErrorDeFormato");
  };

  it("una marca que la etiqueta no conoce (el Python la saltaría en silencio)", () => {
    const msg = falla(MINI_ESCALA.replace("`[1.1.F1 · comprobable]`", "`[1.1.F1 · comprobable · industria]`"));
    expect(msg).toMatch(/^Línea \d+: la etiqueta de este criterio/);
  });

  it("un punto de la lista sin etiqueta", () => {
    expect(falla(MINI_ESCALA.replace("- Nada escrito. `[1.1.D1 · declarado]`", "- Nada escrito."))).toMatch(/sin etiqueta/);
  });

  it("una forma de verificación que no existe", () => {
    expect(falla(MINI_ESCALA.replace("`[1.1.D1 · declarado]`", "`[1.1.D1 · supuesto]`"))).toMatch(/no es una forma de verificación/);
  });

  it("un criterio con el id de otro nivel", () => {
    expect(falla(MINI_ESCALA.replace("`[1.1.I1 · evaluado]`", "`[1.1.F7 · evaluado]`"))).toMatch(/está en 1\.1\.I/);
  });

  it("una línea de resultado en Deficiente", () => {
    expect(falla(MINI_ESCALA.replace("**Deficiente.** Sin proceso.", "**Deficiente.** Sin proceso.\n\n*Resultado:* Nada."))).toMatch(
      /desde Funcional/,
    );
  });

  it("una dimensión sin costo de quedarse", () => {
    expect(falla(MINI_ESCALA.replace("*Costo de quedarse:* Se pierde el proceso.\n", ""))).toMatch(/no tiene «Costo de quedarse»/);
  });

  it("un nivel que falta", () => {
    const sinInicial = MINI_ESCALA.replace("**Inicial.** Algo de estructura.\n\n- Etapas de palabra. `[1.1.I1 · evaluado]`\n", "");
    expect(falla(sinInicial)).toMatch(/van los cinco, en orden/);
  });

  it("una línea que no es nada de lo que la matriz admite", () => {
    expect(falla(MINI_ESCALA.replace("**Óptimo.** El sistema vigila.", "**Óptimo.** El sistema vigila.\n\n> una cita"))).toMatch(
      /no admite esta línea/,
    );
  });

  it("sin versión en el encabezado", () => {
    expect(falla(MINI_ESCALA.replace("version: 9.9.9\n", ""))).toMatch(/no dice la versión/);
  });
});

describe("utilidades", () => {
  it("slug sin tildes ni espacios", () => {
    expect(slugDe("Servicio")).toBe("servicio");
    expect(slugDe("Éxito del Cliente")).toBe("exito-del-cliente");
  });

  it("el encabezado de la especificación trae la escala con la que va", () => {
    expect(leerEncabezado("---\nversion: 1.0.0\nescala: 7.0.0\n---\n# x")).toEqual({ version: "1.0.0", escala: "7.0.0" });
  });
});

describe("el archivo real (docs/escala/escala_rendimiento_smarteam.md)", () => {
  const texto = leerArchivoDeLaEscala("escala");
  const e = parsearEscala(texto);
  const dimensiones = e.areas.flatMap((a) => a.dimensiones);

  it("no lee de menos: tantos criterios como etiquetas tiene el texto", () => {
    const etiquetas = texto.match(/`\[\d+\.\d+\.[DIFEO]\d+ · /g) ?? [];
    expect(etiquetas.length).toBeGreaterThan(0);
    expect(todosLosCriterios(e)).toHaveLength(etiquetas.length);
  });

  it("tantas dimensiones como títulos de dimensión tiene la matriz", () => {
    expect(dimensiones).toHaveLength((texto.match(/^#### \d+\.\d+ /gm) ?? []).length);
  });

  it("cada dimensión trae pregunta, costo, nombre genérico y los cinco niveles", () => {
    for (const d of dimensiones) {
      expect(d.pregunta.length, d.id).toBeGreaterThan(10);
      expect(d.costoDeQuedarse.length, d.id).toBeGreaterThan(10);
      expect(d.generica, d.id).not.toBeNull();
      expect(d.niveles.map((n) => n.letra), d.id).toEqual([...LETRAS]);
    }
  });

  it("tantas líneas de resultado y de costo como el texto", () => {
    const resultados = dimensiones.flatMap((d) => d.niveles).filter((n) => n.resultado).length;
    expect(resultados).toBe((texto.match(/^\*Resultado:\* /gm) ?? []).length);
    expect(dimensiones.filter((d) => d.costoDeQuedarse).length).toBe((texto.match(/^\*Costo de quedarse:\* /gm) ?? []).length);
  });

  it("cada área trae su descripción y su panorámica en los cinco niveles", () => {
    for (const a of e.areas) {
      expect(a.descripcion.length, a.nombre).toBeGreaterThan(10);
      expect(Object.keys(a.panoramica).sort(), a.nombre).toEqual([...LETRAS].sort());
    }
  });

  it("trae la prosa que la pantalla usa", () => {
    expect(Object.keys(e.verificacion).sort()).toEqual(["comprobable", "declarado", "evaluado"]);
    expect(e.explicaciones.riesgo).toBeTruthy();
    expect(e.explicaciones.habito).toBeTruthy();
    expect(e.explicaciones.perfil).toBeTruthy();
    expect(e.capas.every((c) => c.descripcion)).toBe(true);
    expect(e.glosario.length).toBeGreaterThan(10);
    expect(e.historial[0]?.version).toBe(e.version);
  });

  it("cada criterio de riesgo tiene el mensaje que ve el cliente", () => {
    for (const c of todosLosCriterios(e).filter((x) => x.riesgo)) expect(e.riesgos[c.id], c.id).toBeTruthy();
  });
});
