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

  it("la descripción de la dimensión: se lee entera (aunque venga en dos líneas) y, si falta, queda vacía", () => {
    expect(t.descripcion).toBe("Si alguien ve cuando un negocio deja de avanzar.");
    expect(p.descripcion).toBeNull();
  });

  it("«Qué mide», como se llamó en la 7.6.0, se sigue leyendo como la descripción", () => {
    const vieja = parsearEscala(MINI_ESCALA.replace("*Descripción:* Si alguien", "*Qué mide:* Si alguien"));
    expect(vieja.areas[0].dimensiones[1].descripcion).toBe("Si alguien ve cuando un negocio deja de avanzar.");
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
    // Las dos marcas de la 7.7.0.
    expect(t.niveles[2].criterios[0]).toMatchObject({ id: "1.2.F1", perfil: "venta sin vendedor" });
    expect(t.niveles[3].criterios[1]).toMatchObject({ id: "1.2.E2", habito: true, perfil: "recompra" });
  });

  it("lee la prosa: riesgos, glosario, verificación, explicaciones, dependencias e historial", () => {
    expect(e.riesgos).toEqual({ "1.1.F3": "Tus reportes pueden estar inflados." });
    expect(e.glosario).toEqual([{ termino: "Hábito", significado: "Algo que el equipo repite." }]);
    expect(e.verificacion).toEqual({
      comprobable: "Está en el sistema.",
      declarado: "Lo dice el cliente.",
      evaluado: "Lo observa alguien.",
    });
    expect(e.explicaciones.evaluacion).toBe("Regla estricta.");
    expect(e.explicaciones.riesgo).toBe("Protegen algo.\n\nNo impiden llegar a Funcional.");
    expect(e.explicaciones.habito).toBe("Hábitos.\n\nTres estados.");
    expect(e.explicaciones.perfil).toContain("Cada empresa vende distinto.");
    expect(e.dependencias).toEqual([
      { capa: "Base operativa", cuando: "Ventas", orden: ["Procesos y Rutinas", "Datos"], porQue: "Porque sí." },
    ]);
    expect(e.historial).toEqual([{ version: "9.9.9", fecha: "2030-01-01", texto: "Primera de juguete." }]);
  });

  it("lee las palabras con valor fijo, una por término (dos términos pueden compartir valor)", () => {
    expect(e.palabrasConValorFijo).toEqual([
      { termino: "La mayoría", significado: "al menos 80%" },
      { termino: "Se sostiene", significado: "en 4 de 5 veces" },
      { termino: "de forma consistente", significado: "en 4 de 5 veces" },
      { termino: "sin pensarlo", significado: "sin mirar el papel" },
    ]);
    expect(e.casosDeLectura).toEqual([{ tipo: "parrafo", texto: "**Equipos chicos.** Los roles se leen como la función escrita." }]);
  });

  it("lee el perfil de negocio: las dos preguntas con la definición de cada respuesta, y el resto como notas", () => {
    expect(e.perfilDeNegocio.introduccion).toBe("Cada empresa vende distinto.");
    expect(e.perfilDeNegocio.cierre).toEqual({
      pregunta: "Cómo se cierra la venta",
      opciones: [
        { nombre: "Con equipo", definicion: "cuando una persona trabaja cada oportunidad" },
        { nombre: "transaccional", definicion: "cuando nadie la trabaja —en caja o en la web—" },
        { nombre: "mixta", definicion: "cuando conviven las dos" },
      ],
    });
    expect(e.perfilDeNegocio.despues?.opciones.map((o) => o.nombre)).toEqual(["Relación única", "recompra", "relación continua"]);
    expect(e.perfilDeNegocio.despues?.opciones[2].definicion).toBe("cuando hay contrato");
    expect(e.perfilDeNegocio.notas).toEqual([
      "Las marcas deciden. En la venta mixta aplican todos. Lo demás igual.",
      "En la venta transaccional el negocio es el pedido. Y el vendedor es el canal.",
    ]);
  });

  it("lee la regla de automatización como párrafos y puntos (un punto partido en dos líneas es uno)", () => {
    expect(e.automatizacion).toEqual([
      { tipo: "parrafo", texto: "El gradiente **manual → autónomo** desempata:" },
      { tipo: "punto", texto: "**Funcional — simple.** Un disparador." },
      { tipo: "punto", texto: "**Óptimo — la IA ejecuta.** La persona valida." },
      { tipo: "parrafo", texto: "La IA sola no define Óptimo." },
    ]);
  });

  it("lee la regla de asignación: a qué dimensiones toca cada caso, por id o por nombre genérico en negrita", () => {
    expect(e.asignacion.map((r) => r.dimensiones)).toEqual([["1.1"], ["1.1"], ["1.2"], []]);
    // Un id que la escala no tiene (1.3) no se inventa; el texto queda entero, con sus negritas.
    expect(e.asignacion[1].texto).toBe("El **forecast** se asigna a **Datos de Ventas (1.3)**, no a Procesos (1.1).");
  });

  it("sin esas secciones, la prosa queda vacía y la matriz se lee igual", () => {
    const sinProsa = MINI_ESCALA.replace(/## Cómo se leen los criterios[\s\S]*?(?=## El perfil de negocio)/, "")
      .replace(/## El perfil de negocio[\s\S]*?(?=## Qué se trabaja primero)/, "")
      .replace(/## Regla de automatización[\s\S]*?(?=---\n\n# Parte 3)/, "");
    const x = parsearEscala(sinProsa);
    expect(x.palabrasConValorFijo).toEqual([]);
    expect(x.casosDeLectura).toEqual([]);
    expect(x.perfilDeNegocio).toEqual({ introduccion: null, cierre: null, despues: null, notas: [] });
    expect(x.automatizacion).toEqual([]);
    expect(x.asignacion).toEqual([]);
    expect(todosLosCriterios(x)).toHaveLength(todosLosCriterios(e).length);
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

  it("la descripción de la dimensión después de los niveles", () => {
    expect(falla(MINI_ESCALA.replace("**Óptimo.** El sistema vigila.", "**Óptimo.** El sistema vigila.\n\n*Descripción:* Tarde."))).toMatch(
      /descripción de la dimensión está fuera de lugar/,
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
    expect(e.explicaciones.evaluacion).toBeTruthy();
    expect(e.explicaciones.evaluacion).not.toContain("**");
    expect(e.explicaciones.riesgo).toBeTruthy();
    expect(e.explicaciones.habito).toBeTruthy();
    expect(e.explicaciones.perfil).toBeTruthy();
    expect(e.capas.every((c) => c.descripcion)).toBe(true);
    expect(e.glosario.length).toBeGreaterThan(10);
    expect(e.historial[0]?.version).toBe(e.version);
  });

  it("trae las reglas de lectura que la pantalla muestra", () => {
    const criterios = todosLosCriterios(e).map((c) => c.texto.toLowerCase());
    expect(e.palabrasConValorFijo.length).toBeGreaterThan(2);
    for (const p of e.palabrasConValorFijo) expect(p.significado.length, p.termino).toBeGreaterThan(5);
    // Las palabras se subrayan en los criterios: que al menos una aparezca en ellos.
    expect(e.palabrasConValorFijo.some((p) => criterios.some((c) => c.includes(p.termino.toLowerCase())))).toBe(true);
    expect(e.casosDeLectura.length).toBeGreaterThan(0);
    expect(e.perfilDeNegocio.introduccion).toBeTruthy();
    expect(e.perfilDeNegocio.cierre?.opciones).toHaveLength(3);
    expect(e.perfilDeNegocio.despues?.opciones).toHaveLength(3);
    expect(e.perfilDeNegocio.notas.length).toBeGreaterThan(0);
    expect(e.automatizacion.filter((b) => b.tipo === "punto").length).toBeGreaterThanOrEqual(3);
  });

  it("la regla de asignación: un caso por punto de la lista, y un área que la regla no nombra no se toca", () => {
    const seccion = texto.split(/^## Regla de asignación\s*$/m)[1]?.split(/^#+ /m)[0] ?? "";
    expect(e.asignacion).toHaveLength((seccion.match(/^- /gm) ?? []).length);
    const ids = new Set(dimensiones.map((d) => d.id));
    for (const r of e.asignacion) for (const id of r.dimensiones) expect(ids.has(id), id).toBe(true);
    // La mayoría de los casos se ubican; los que no, quedan en el documento que se descarga.
    expect(e.asignacion.filter((r) => r.dimensiones.length > 0).length).toBeGreaterThan(e.asignacion.length / 2);
    const frontera = e.asignacion.find((r) => r.texto.includes("Marketing ↔ Ventas"));
    if (frontera) expect(frontera.dimensiones.filter((id) => id.startsWith("3."))).toEqual([]);
  });

  it("cada criterio de riesgo tiene el mensaje que ve el cliente", () => {
    for (const c of todosLosCriterios(e).filter((x) => x.riesgo)) expect(e.riesgos[c.id], c.id).toBeTruthy();
  });
});
