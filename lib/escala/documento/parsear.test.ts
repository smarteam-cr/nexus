/**
 * lib/escala/documento/parsear.test.ts — que la escala se lea ENTERA y que lo raro se rechace.
 *
 * El riesgo de un lector de documentos no es que falle: es que lea de MENOS y nadie lo note. Por
 * eso el archivo real se cuenta contra sus propias etiquetas (sin escribir acá cuántas son: una
 * versión nueva no tiene que tocar este test), y la escala de juguete fija cada regla.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./archivos";
import { MINI_EDICION, MINI_ESCALA, MINI_ESCALA_CON_EDICION } from "./mini-escala.fixture";
import { criteriosPropios, leerEncabezado, parsearEscala, slugDe, todosLosCriterios } from "./parsear";
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

describe("una versión anterior a la 7.7.0 se lee como cuando se publicó", () => {
  const vieja = MINI_ESCALA.replace("version: 9.9.9", "version: 7.6.1").replace(
    "- Las ventas sin vendedor entran solas al sistema. `[1.2.F1 · comprobable · venta sin vendedor]`",
    "- Si la empresa vende sin vendedor, esas ventas entran solas al sistema. `[1.2.F1 · comprobable]`",
  );

  it("«vende sin vendedor» era una regla de texto: se lee como la marca «venta sin vendedor»", () => {
    expect(vieja).toContain("Si la empresa vende sin vendedor");
    expect(parsearEscala(vieja).areas[0].dimensiones[1].niveles[2].criterios[0]).toMatchObject({ id: "1.2.F1", perfil: "venta sin vendedor" });
  });

  it("desde la 7.7.0 la frase sola ya no marca nada", () => {
    const nueva = vieja.replace("version: 7.6.1", "version: 7.7.0");
    expect(parsearEscala(nueva).areas[0].dimensiones[1].niveles[2].criterios[0].perfil).toBeNull();
  });
});

describe("las ediciones por industria", () => {
  const falla = (texto: string) => {
    try {
      parsearEscala(texto);
    } catch (err) {
      expect(err).toBeInstanceOf(ErrorDeFormato);
      return (err as ErrorDeFormato).message;
    }
    throw new Error("se esperaba un ErrorDeFormato");
  };
  const con = (cambio: (s: string) => string) => MINI_ESCALA + cambio(MINI_EDICION);

  it("no cambian nada de la escala general: la matriz y la prosa se leen igual con ediciones que sin ellas", () => {
    const sin = parsearEscala(MINI_ESCALA);
    const e = parsearEscala(MINI_ESCALA_CON_EDICION);
    expect({ ...e, ediciones: [], edicionesIntro: null }).toEqual(sin);
  });

  it("lee lo que la edición cambia de una dimensión, y nada más", () => {
    const d = parsearEscala(MINI_ESCALA_CON_EDICION).ediciones[0].areas[0].dimensiones[0];
    expect(d).toEqual({
      id: "1.2",
      nombre: "Carrito y recompra",
      pregunta: "¿Qué pasa con quien no terminó de comprar?",
      descripcion: "Si la tienda recupera los carritos.",
      costoDeQuedarse: "Los carritos se pierden.",
      niveles: {
        D: { descripcion: null, resultado: null },
        F: { descripcion: "Ningún carrito se pierde en silencio.", resultado: "Los carritos se recuperan." },
        E: { descripcion: null, resultado: null },
      },
      textos: { "1.2.D1": "Nadie mira los carritos.", "1.2.F1": "Cada venta de la tienda entra sola al sistema." },
      propios: [
        { id: "1.2.F101", texto: "El carrito abandonado recibe un recordatorio.", verificacion: "comprobable", riesgo: false, habito: true, perfil: null },
        { id: "1.2.E101", texto: "El recordatorio sale cuando toca a cada producto.", verificacion: "comprobable", riesgo: false, habito: false, perfil: "recompra" },
      ],
      noAplican: ["1.2.I1"],
      seLeenIgual: ["1.2.F2", "1.2.E1", "1.2.E2", "1.2.O1"],
    });
  });

  it("con CRLF lee exactamente lo mismo", () => {
    expect(parsearEscala(MINI_ESCALA_CON_EDICION.replace(/\n/g, "\r\n"))).toEqual(parsearEscala(MINI_ESCALA_CON_EDICION));
  });

  it("una edición sin «Clave» no tiene identidad", () => {
    expect(falla(con((s) => s.replace("*Clave:* tiendas\n", "")))).toMatch(/no dice su «Clave»/);
  });

  it("una clave con mayúsculas o espacios", () => {
    expect(falla(con((s) => s.replace("*Clave:* tiendas", "*Clave:* Tiendas de Juguete")))).toMatch(/va en minúsculas/);
  });

  it("una marca mal escrita no termina, en silencio, como parte de la descripción", () => {
    expect(falla(con((s) => s.replace("*Perfil habitual:*", "*Perfil habitual :*")))).toMatch(/^Línea \d+: una edición no admite esta línea/);
  });

  it("un perfil habitual que no es un perfil", () => {
    expect(falla(con((s) => s.replace("transaccional · recompra.", "tiendas chicas.")))).toMatch(/«Perfil habitual» tiene que decir/);
  });

  it("un criterio propio con el id de uno de la matriz", () => {
    expect(falla(con((s) => s.replace("`[1.2.F101 · comprobable · hábito]`", "`[1.2.F2 · comprobable · hábito]`")))).toMatch(
      /1\.2\.F2 ya es un criterio de la escala general/,
    );
  });

  it("un criterio propio fuera del bloque de su edición, o sin que la edición haya dicho su bloque", () => {
    expect(falla(con((s) => s.replace("`[1.2.F101 · comprobable · hábito]`", "`[1.2.F7 · comprobable · hábito]`")))).toMatch(/los numera del 101 al 199/);
    expect(falla(con((s) => s.replace("*Criterios propios:* desde el 101.\n", "")))).toMatch(/sin haber dicho desde qué número van/);
    expect(falla(con((s) => s.replace("desde el 101.", "desde el 50.")))).toMatch(/en bloques de cien/);
  });

  it("un criterio reescrito que la matriz no tiene, o que está en otro nivel", () => {
    expect(falla(con((s) => s.replace("`[1.2.D1]`", "`[1.2.D9]`")))).toMatch(/1\.2\.D9 no es un criterio de 1\.2\.D en la escala general/);
    expect(falla(con((s) => s.replace("`[1.2.D1]`", "`[1.2.F1]`")))).toMatch(/1\.2\.F1 no es un criterio de 1\.2\.D/);
  });

  it("un criterio propio repetido", () => {
    const dos = con((s) =>
      s.replace("- El carrito abandonado recibe un recordatorio. `[1.2.F101 · comprobable · hábito]`", "- Uno. `[1.2.F101 · comprobable]`\n- Otro. `[1.2.F101 · comprobable]`"),
    );
    expect(falla(dos)).toMatch(/1\.2\.F101 ya es un criterio propio de la edición «Tiendas de juguete»/);
  });

  it("un área o una dimensión que la escala no tiene", () => {
    expect(falla(con((s) => s.replace("### Área 1 — Ventas", "### Área 7 — Logística")))).toMatch(/no tiene un área 7/);
    expect(falla(con((s) => s.replace("#### 1.2 Carrito y recompra", "#### 1.9 Carrito y recompra")))).toMatch(/no tiene una dimensión 1\.9/);
  });

  it("«No aplican» y «Se leen igual» solo nombran criterios de su dimensión", () => {
    expect(falla(con((s) => s.replace("*No aplican:* `1.2.I1`.", "*No aplican:* `1.1.I1`.")))).toMatch(/«No aplican» nombra 1\.1\.I1/);
    expect(falla(con((s) => s.replace("*Se leen igual:* `1.2.F2`", "*Se leen igual:* `1.2.F9`")))).toMatch(/«Se leen igual» nombra 1\.2\.F9/);
  });

  it("después de las ediciones no puede venir otra parte, ni otra sección después de una edición", () => {
    expect(falla(MINI_ESCALA_CON_EDICION + "\n# Parte 6 — Anexos\n")).toMatch(/van al final del documento/);
    expect(falla(MINI_ESCALA_CON_EDICION + "\n## Notas sueltas\n")).toMatch(/solo puede venir otra edición/);
  });

  it("dos ediciones conviven: cada una con su clave y su bloque", () => {
    const otra = MINI_EDICION.split("## Edición — Tiendas de juguete")[1]
      .replace("*Clave:* tiendas", "*Clave:* colegios")
      .replace("desde el 101.", "desde el 201.")
      .replace("1.2.F101", "1.2.F201")
      .replace("1.2.E101", "1.2.E201");
    const e = parsearEscala(MINI_ESCALA_CON_EDICION + "\n## Edición — Colegios de juguete" + otra);
    expect(e.ediciones.map((x) => `${x.slug}:${x.bloque}`)).toEqual(["tiendas:101", "colegios:201"]);
    expect(criteriosPropios(e).map((p) => p.criterio.id)).toEqual(["1.2.F101", "1.2.E101", "1.2.F201", "1.2.E201"]);
    // La misma clave dos veces, no.
    expect(falla(MINI_ESCALA_CON_EDICION + "\n## Edición — Colegios de juguete" + otra.replace("*Clave:* colegios", "*Clave:* tiendas"))).toMatch(
      /dos ediciones tienen la clave «tiendas»/,
    );
  });

  // Lo que va antes de la primera edición es prosa, y la prosa se lee con tolerancia. Un título con
  // guion en vez de raya pasaba por prosa: la edición entera desaparecía y todas las pruebas daban
  // verde (la única red era la prueba 5, y solo si la versión publicada ya traía sus criterios).
  describe("una edición no puede desaparecer en silencio", () => {
    it("el título de la PRIMERA edición con guion, sin tilde o pegado a la raya", () => {
      for (const titulo of ["## Edición - Tiendas de juguete", "## Edicion — Tiendas de juguete", "## Edición —Tiendas de juguete", "### Edición — Tiendas de juguete", "## edición – Tiendas de juguete"]) {
        expect(falla(con((s) => s.replace("## Edición — Tiendas de juguete", titulo)))).toMatch(/^Línea \d+: el título de una edición va como «## Edición — Nombre»/);
      }
    });

    it("el título de la parte con guion: sin él no hay ediciones, y todo lo demás se leería como prosa", () => {
      for (const titulo of ["# Parte 5 - Ediciones por industria", "# Parte 5 – Ediciones por industria", "# Parte cinco — Ediciones por industria", "# Ediciones por industria"]) {
        expect(falla(con((s) => s.replace("# Parte 5 — Ediciones por industria", titulo)))).toMatch(/^Línea \d+: el título de la parte de las ediciones va como/);
      }
    });

    it("una edición fuera de la parte de las ediciones", () => {
      const suelta = MINI_ESCALA + MINI_EDICION.replace("# Parte 5 — Ediciones por industria", "# Parte 5 — Industrias");
      expect(falla(suelta)).toMatch(/^Línea \d+: una edición va dentro de la parte de las ediciones/);
    });

    it("un título que no se parece a nada: lo delata lo que solo una edición puede traer", () => {
      const sinTitulo = con((s) => s.replace("## Edición — Tiendas de juguete", "## Tiendas de juguete"));
      expect(falla(sinTitulo)).toMatch(/^Línea \d+: esto es de una edición y está antes de su título/);
      // Y un criterio suelto en la prosa de la parte, igual.
      const criterioSuelto = con((s) => s.replace("- Lo que no dice, vale como está en la matriz.", "- Lo que no dice, vale como está en la matriz. `[1.2.F1]`"));
      expect(falla(criterioSuelto)).toMatch(/esto es de una edición y está antes de su título/);
    });

    it("la prosa de la parte sí admite sus títulos y sus puntos", () => {
      const e = parsearEscala(con((s) => s.replace("## Qué cambia una edición y qué no", "## Qué cambia una edición y qué no\n\n- **Criterios propios.** Del 101 al 199.\n\n## Cómo se escribe una edición")));
      expect(e.ediciones.map((x) => x.slug)).toEqual(["tiendas"]);
    });
  });

  it("lo que una edición dice una sola vez: su clave, su perfil, su bloque y cada nivel del vistazo", () => {
    expect(falla(con((s) => s.replace("*Clave:* tiendas\n", "*Clave:* tiendas\n\n*Clave:* otras\n")))).toMatch(/dice su «Clave» dos veces/);
    expect(falla(con((s) => s.replace("*Perfil habitual:* transaccional · recompra.\n", "*Perfil habitual:* transaccional · recompra.\n\n*Perfil habitual:* mixta · única.\n")))).toMatch(
      /dice su «Perfil habitual» dos veces/,
    );
    expect(falla(con((s) => s.replace("*Criterios propios:* desde el 101.\n", "*Criterios propios:* desde el 101.\n\n*Criterios propios:* desde el 201.\n")))).toMatch(
      /dice sus «Criterios propios» dos veces/,
    );
    expect(falla(con((s) => s.replace("**Funcional.** La tienda vende sola.\n", "**Funcional.** La tienda vende sola.\n\n**Funcional.** La tienda vende más.\n")))).toMatch(
      /el vistazo de «Funcional» aparece dos veces en el área 1/,
    );
  });

  it("el último número del bloque es el 199: el 200 ya es de otra edición", () => {
    expect(parsearEscala(con((s) => s.replace("1.2.E101", "1.2.E199"))).ediciones[0].areas[0].dimensiones[0].propios.map((c) => c.id)).toContain("1.2.E199");
    expect(falla(con((s) => s.replace("1.2.E101", "1.2.E200")))).toMatch(/los numera del 101 al 199/);
  });
});

describe("lo que el lector tolera en la prosa, y avisa", () => {
  it("una palabra entre «» en «Cómo se leen los criterios» sin su valor: se lee, y queda el aviso", () => {
    const e = parsearEscala(MINI_ESCALA.replace("«La mayoría» quiere decir al menos 80%.", "«La mayoría» significa al menos 80%."));
    expect(e.palabrasConValorFijo.map((p) => p.termino)).toEqual(["Se sostiene", "de forma consistente", "sin pensarlo"]);
    expect(e.avisosDeLectura).toHaveLength(1);
    expect(e.avisosDeLectura[0]).toMatch(/«La mayoría» está entre comillas .* no se le encuentra su valor/);
  });

  it("con la prosa como la escala la escribe no hay avisos", () => {
    expect(parsearEscala(MINI_ESCALA).avisosDeLectura).toEqual([]);
    expect(parsearEscala(leerArchivoDeLaEscala("escala")).avisosDeLectura).toEqual([]);
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
  const entero = leerArchivoDeLaEscala("escala").replace(/\r\n?/g, "\n");
  const e = parsearEscala(entero);
  // La escala general es todo lo que va antes de las ediciones por industria, que van al final.
  const texto = entero.split(/^# Parte \d+ — Ediciones/m)[0];
  const ediciones = entero.slice(texto.length);
  const dimensiones = e.areas.flatMap((a) => a.dimensiones);

  it("no lee de menos: tantos criterios como etiquetas tiene el texto", () => {
    const etiquetas = texto.match(/`\[\d+\.\d+\.[DIFEO]\d+ · /g) ?? [];
    expect(etiquetas.length).toBeGreaterThan(0);
    expect(todosLosCriterios(e)).toHaveLength(etiquetas.length);
  });

  it("en las ediciones tampoco: tantos criterios propios como etiquetas completas, y tantos reescritos como etiquetas de solo el id", () => {
    const propias = ediciones.match(/`\[\d+\.\d+\.[DIFEO]\d+ · /g) ?? [];
    const reescritas = ediciones.match(/`\[\d+\.\d+\.[DIFEO]\d+\]`$/gm) ?? [];
    const dims = e.ediciones.flatMap((ed) => ed.areas.flatMap((a) => a.dimensiones));
    expect(e.ediciones).toHaveLength((ediciones.match(/^## Edición — /gm) ?? []).length);
    expect(criteriosPropios(e)).toHaveLength(propias.length);
    expect(dims.flatMap((d) => Object.keys(d.textos))).toHaveLength(reescritas.length);
    expect(dims).toHaveLength((ediciones.match(/^#### \d+\.\d+ /gm) ?? []).length);
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
