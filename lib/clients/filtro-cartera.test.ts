import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CLIENT_KINDS, CLIENT_KIND_META } from "./kind";
import type { ResumenDeProyectos } from "./resumen-proyectos";
import {
  VISTAS_DE_CARTERA,
  aplicarVista,
  contarVistas,
  vistasVisibles,
  describirVista,
  explicarListaVacia,
  contarConPlural,
  resumirPotencial,
  type FilaFiltrable,
  type VistaDeCartera,
} from "./filtro-cartera";

/**
 * lib/clients/filtro-cartera.test.ts — LAS PÍLDORAS NO MIENTEN.
 *
 * Un contador a 8px de una tabla que muestra otra cosa es peor que no tener contador: la
 * persona confía en el número y saca conclusiones sobre la cartera. Estas guardas fijan que
 * el número de cada píldora sea LITERALMENTE la cantidad de filas que se verían al clickearla.
 */

interface Fila extends FilaFiltrable {
  nombre: string;
}

const fila = (nombre: string, r: Partial<ResumenDeProyectos>): Fila => ({
  nombre,
  resumen: { abiertos: 0, cerrados: 0, internos: 0, ...r },
});

/** Una empresa de cada forma medida en producción el 2026-08-05. */
const POBLACION: Fila[] = [
  fila("Wherex", { abiertos: 2 }), //             entrega en curso
  fila("Judesur", { abiertos: 1, cerrados: 1 }), // uno abierto, uno cerrado
  fila("Smarteam", { abiertos: 3, internos: 2 }), // trabajo interno + uno que no lo es
  fila("SmartAgro", { abiertos: 1, internos: 1 }), // SOLO trabajo interno
  fila("Ficha vacía", {}), //                      ni un proyecto
  fila("Solo contenedor", {}), //                  solo «Información del cliente»
  fila("Terminado", { cerrados: 2 }), //           trabajó con nosotros y cerró
];

const RAIZ = process.cwd();
const sinComentarios = (rel: string) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");

/** El cuerpo de un bloque, con llaves balanceadas desde el ancla. */
function bloqueDesde(src: string, ancla: string): string {
  const i = src.indexOf(ancla);
  if (i < 0) return "";
  const abre = src.indexOf("{", i);
  if (abre < 0) return "";
  let nivel = 1;
  let j = abre + 1;
  while (j < src.length && nivel > 0) {
    if (src[j] === "{") nivel++;
    else if (src[j] === "}") nivel--;
    j++;
  }
  return src.slice(abre, j);
}

describe("el contador de una píldora ES la cantidad de filas", () => {
  it("para cada vista, el contador == aplicarVista().length", () => {
    for (const sub of [POBLACION, POBLACION.slice(0, 3), [] as Fila[]]) {
      const c = contarVistas(sub);
      for (const v of VISTAS_DE_CARTERA) {
        expect(
          c[v.key],
          `«${v.label}»: el contador dejó de ser la cantidad de filas (${sub.length} de entrada)`,
        ).toBe(aplicarVista(sub, v.key).length);
      }
    }
  });

  /**
   * ── LA GUARDA DEL TRAMO, y por qué es estructural y no de comportamiento ───
   * La "optimización" tentadora es contar en una sola pasada sin reevaluar los predicados:
   *
   *     -  for (const v of VISTAS_DE_CARTERA) if (v.cumple(f.resumen)) acc[v.key]++;
   *     +  acc.todos++;
   *     +  if (f.resumen.abiertos > 0) acc["con-proyecto"]++; else acc["sin-proyecto"]++;
   *     +  if (f.resumen.internos > 0) acc["trabajo-interno"]++;
   *
   * ⚠ **Ese cambio pasa el test de arriba en verde.** Lo verifiqué aplicándolo: da idéntico
   * hoy, porque la copia y el original todavía dicen lo mismo. Divergen recién el día que
   * alguien toque un predicado — y ese día el número y la lista se separan sin un solo error.
   * O sea que el assert de comportamiento, solo, es DECORATIVO para este bug.
   *
   * Lo único que no puede ser cierto a la vez que el bug es que el contador PASE por `cumple`.
   * Por eso se afirma sobre la estructura: es la diferencia entre una regla y su copia.
   */
  it("LA guarda: contarVistas evalúa los predicados, no los reescribe", () => {
    const cuerpo = bloqueDesde(sinComentarios("lib/clients/filtro-cartera.ts"), "export function contarVistas");
    expect(cuerpo.length, "se movió contarVistas; revisar esta guarda").toBeGreaterThan(80);
    expect(
      cuerpo,
      "contarVistas dejó de llamar a cumple: hay una segunda copia de la regla, y el contador " +
        "va a divergir de la lista el día que alguien toque un predicado",
    ).toContain("cumple(");
    expect(
      cuerpo,
      "contarVistas escribe las claves a mano en vez de recorrer el registro",
    ).toContain("VISTAS_DE_CARTERA");
  });

  it("«Todos» es exactamente el largo de lo que se le pasó", () => {
    /* Es también el "de M" de la línea de verdad. Si el componente le pasara el array
       equivocado, el M se contradiría a la vista con la píldora de al lado. */
    expect(contarVistas(POBLACION).todos).toBe(POBLACION.length);
    expect(aplicarVista(POBLACION, "todos")).toBe(POBLACION); // misma referencia
  });

  it("«Con proyecto abierto» y «Sin proyecto abierto» son complementarios EXACTOS", () => {
    /* La edición que lo rompe: `cumple: (r) => r.abiertos + r.cerrados === 0`, que es lo que
       uno escribe sin pensar. Las dos empresas que solo tienen el contenedor sentinel se caen
       de las dos píldoras y la suma deja de dar el total — sin ningún error. */
    const c = contarVistas(POBLACION);
    expect(
      c["con-proyecto"] + c["sin-proyecto"],
      "las dos vistas dejaron de partir el universo: hay filas que no caen en ninguna",
    ).toBe(c.todos);
  });

  it("el trabajo interno también cuenta como proyecto abierto", () => {
    /* SmartAgro tiene SOLO trabajo interno. Si «Con proyecto abierto» lo excluyera caería en
       «Sin proyecto abierto», que es la mentira exacta que hay que evitar: es trabajo que
       estamos haciendo. */
    expect(aplicarVista(POBLACION, "con-proyecto").map((f) => (f as Fila).nombre)).toContain(
      "SmartAgro",
    );
    expect(aplicarVista(POBLACION, "sin-proyecto").map((f) => (f as Fila).nombre)).not.toContain(
      "SmartAgro",
    );
  });
});

describe("la pantalla cuenta DESPUÉS de la búsqueda", () => {
  const PANTALLA = "app/(shell)/clients/ClientsGrid.tsx";

  /**
   * El motor no puede defenderse solo de esto: `contarVistas` cuenta bien lo que le den. Si el
   * componente le pasa el array de ANTES de la búsqueda, cada píldora dice un número correcto
   * sobre un universo que no es el que está en pantalla — que es exactamente el pecado que
   * esta tanda vino a matar, reintroducido a un metro de distancia.
   *
   * La edición que la pone en rojo: `contarVistas(enPertenencia)`. Verificado rompiéndola.
   */
  it("LA guarda: contarVistas recibe lo YA buscado", () => {
    const src = sinComentarios(PANTALLA);
    const linea = src.split("\n").find((l) => l.includes("contarVistas("));
    expect(linea, "desapareció la llamada a contarVistas").toBeTruthy();
    expect(
      linea,
      "los contadores se calculan antes de la búsqueda: van a decir un número y la tabla otro",
    ).toContain("contarVistas(buscados)");
  });

  it("y <Table> ya NO es dueño del buscador", () => {
    /**
     * ⚠ NO con `bloqueDesde`: `indexOf("<Table")` engancha `<Table.IdentityCell`, que aparece
     * mucho antes que el `<Table>` real, y el balanceo de llaves terminaba evaluando 53
     * caracteres de un `leading={<Avatar …/>}`. La guarda no podía fallar.
     *
     * El regex `(?!\.)` salta los sub-componentes y mira los primeros 600 caracteres del
     * elemento, que es donde van sus props.
     */
    const src = sinComentarios("app/(shell)/clients/ClientsGrid.tsx");
    expect(src, "ya no se renderiza ninguna <Table>; revisar esta guarda").toMatch(/<Table\b(?!\.)/);
    expect(
      src,
      "<Table> volvió a ser dueño del buscador: el toolbar desaparece con la lista vacía",
    ).not.toMatch(/<Table\b(?!\.)[\s\S]{0,600}?\bsearch=/);
  });
});

describe("ningún control decorativo", () => {
  /**
   * Una píldora que deja pasar a todos y una que no deja pasar a nadie se ven IDÉNTICAS a una
   * que funciona. Las dos son un control muerto, y con la segunda el usuario concluye que "los
   * filtros siguen sin servir" — que es literalmente el punto de partida de esta tanda.
   *
   * La edición que la pone en rojo:
   *     -  export function vistasVisibles(universo) { … filtra … }
   *     +  export function vistasVisibles() { return VISTAS_DE_CARTERA; }
   */
  /**
   * ⚠ Se itera el REGISTRO COMPLETO, no `vistasVisibles(POBLACION)`. Con la lista filtrada el
   * assert es una tautología —`vistasVisibles` ya excluye justamente lo que se está
   * afirmando— y un predicado roto a `() => true` desaparecería de la barra en silencio en vez
   * de poner nada en rojo. Escrito así la primera vez, cazado rompiéndolo.
   *
   * La población de referencia tiene una empresa de cada forma medida en producción, así que
   * las cuatro vistas TIENEN que partirla.
   */
  it("LA guarda: cada vista declarada parte la población de referencia", () => {
    for (const v of VISTAS_DE_CARTERA) {
      if (v.key === "todos") continue;
      const n = aplicarVista(POBLACION, v.key).length;
      expect(n, `«${v.label}» no deja pasar a nadie: es un control muerto`).toBeGreaterThan(0);
      expect(n, `«${v.label}» no deja a nadie afuera: no está filtrando`).toBeLessThan(
        POBLACION.length,
      );
    }
  });

  it("una cartera donde todos tienen proyecto no ofrece «Sin proyecto abierto»", () => {
    /* El caso del CSE con cartera acotada. Sin esto abre una barra donde la mitad de los
       controles no hace nada, y aprende a ignorarla. */
    const todosConProyecto = [fila("A", { abiertos: 1 }), fila("B", { abiertos: 2 })];
    const keys = vistasVisibles(todosConProyecto).map((v) => v.key);
    expect(keys).not.toContain("sin-proyecto");
    expect(keys).not.toContain("con-proyecto"); // tampoco: no parte nada
  });

  it("si queda una sola opción no se renderiza el grupo, y con universo vacío tampoco", () => {
    expect(vistasVisibles([fila("A", { abiertos: 1 })])).toEqual([]);
    expect(vistasVisibles([])).toEqual([]);
  });
});

describe("la línea de verdad", () => {
  const base = {
    totalDeCategoria: 155,
    contableDeCategoria: CLIENT_KIND_META.CLIENTE.contable,
    pertenencia: null,
    vista: "todos" as VistaDeCartera,
    busqueda: "",
  };

  it("no se pinta cuando no hay nada filtrando", () => {
    expect(describirVista({ ...base, visibles: 155 })).toBeNull();
  });

  it("nombra los ejes activos, en orden de cascada", () => {
    expect(
      describirVista({
        ...base,
        visibles: 1,
        pertenencia: "mine",
        vista: "sin-proyecto",
        busqueda: "agro",
      })?.texto,
    ).toBe("Mostrando 1 de 155 clientes · Mis clientes · Sin proyecto abierto · «agro»");
  });

  it("«Todos» de pertenencia no se nombra: no filtra nada", () => {
    expect(describirVista({ ...base, visibles: 2, pertenencia: "all", vista: "sin-proyecto" })
      ?.texto).toBe("Mostrando 2 de 155 clientes · Sin proyecto abierto");
  });

  it("dice la verdad aunque el resultado sea cero", () => {
    expect(
      describirVista({
        ...base,
        visibles: 0,
        totalDeCategoria: 9,
        contableDeCategoria: CLIENT_KIND_META.PROSPECTO.contable,
        vista: "sin-proyecto",
      })?.texto,
    ).toBe("Mostrando 0 de 9 prospectos · Sin proyecto abierto");
  });

  it("nunca dice «1 clientes»", () => {
    expect(contarConPlural(1, CLIENT_KIND_META.CLIENTE.contable)).toBe("1 cliente");
    expect(contarConPlural(0, CLIENT_KIND_META.CLIENTE.contable)).toBe("0 clientes");
    expect(contarConPlural(1, CLIENT_KIND_META.ALIADO.contable)).toBe("1 aliado");
    // El caso que la prueba clickeada destapó: quitarle la "s" al plural daba "somos smarteam".
    expect(contarConPlural(1, CLIENT_KIND_META.INTERNO.contable)).toBe("1 empresa nuestra");
    expect(contarConPlural(3, CLIENT_KIND_META.INTERNO.contable)).toBe("3 empresas nuestras");
  });
});

describe("el vacío explica y ofrece salida", () => {
  const base = {
    enCategoria: 155,
    enPertenencia: 155,
    enVista: 155,
    pertenencia: null,
    vista: "todos" as VistaDeCartera,
    busqueda: "",
  };

  it("gana la PRIMERA etapa de la cascada que vació la lista", () => {
    /* Si ganara la última, el mensaje culparía a la búsqueda con la categoría ya en cero, y
       la persona borraría el término sin que pase nada. */
    const categoriaVacia = explicarListaVacia({
      ...base,
      kind: "ALIADO",
      enCategoria: 0,
      enPertenencia: 0,
      enVista: 0,
      vista: "sin-proyecto",
      busqueda: "agro",
    });
    expect(categoriaVacia.titulo).toBe("Sin aliados aún");

    const pertenenciaVacia = explicarListaVacia({
      ...base,
      kind: "CLIENTE",
      enPertenencia: 0,
      enVista: 0,
      pertenencia: "mine",
      busqueda: "agro",
    });
    expect(pertenenciaVacia.titulo).toBe("No sos owner de ningún cliente");
    expect(pertenenciaVacia.acciones).toEqual([{ tipo: "ver-todos", label: "Ver todos" }]);
  });

  it("la vista vacía ofrece quitar el filtro", () => {
    const v = explicarListaVacia({
      ...base,
      kind: "CLIENTE",
      enPertenencia: 12,
      enVista: 0,
      vista: "sin-proyecto",
    });
    expect(v.titulo).toBe("Ningún cliente pasa el filtro «Sin proyecto abierto»");
    expect(v.acciones).toEqual([{ tipo: "quitar-filtro", label: "Quitar filtro" }]);
  });

  it("la búsqueda vacía conserva el término y saca el filtro", () => {
    /* Es lo que la persona quiere el 90% de las veces: buscó algo que sabe que existe. */
    const v = explicarListaVacia({
      ...base,
      kind: "CLIENTE",
      enVista: 2,
      vista: "sin-proyecto",
      busqueda: "agro",
    });
    expect(v.titulo).toBe("Sin resultados para «agro»");
    expect(v.detalle).toBe("Ninguno de los 2 clientes con el filtro «Sin proyecto abierto» coincide.");
    expect(v.acciones[0]).toEqual({ tipo: "buscar-sin-filtro", label: "Buscar «agro» sin el filtro" });
  });
});

describe("las dos etiquetas no vuelven a colisionar", () => {
  /**
   * El defecto que originó el pedido: «Internos 0» arriba y «Con trabajo interno 2» abajo, a
   * 40px de distancia, misma raíz y números distintos. Se leen como contadores rotos, y la
   * lectura natural —"Internos son los clientes con proyectos internos"— es la equivocada.
   *
   * La edición que la pone en rojo: devolver `plural: "Internos"` en `kind.ts`.
   */
  it("LA guarda: la pestaña de categoría no se llama como el filtro", () => {
    expect(
      CLIENT_KIND_META.INTERNO.plural.toLowerCase(),
      "la pestaña volvió a llamarse «Internos» y colisiona con el filtro «Sin proyecto abierto»",
    ).not.toMatch(/intern/);
  });

  it("ninguna etiqueta de vista es igual a una de categoría", () => {
    const categorias = CLIENT_KINDS.map((k) => CLIENT_KIND_META[k].plural.toLowerCase());
    for (const v of VISTAS_DE_CARTERA) {
      expect(categorias, `«${v.label}» duplica el nombre de una pestaña`).not.toContain(
        v.label.toLowerCase(),
      );
    }
  });
});

describe("el potencial estimado nunca dice $0", () => {
  /* `formatTamUsd(0)` devuelve "$0", y el propio kind.ts documenta que la ausencia de dato es
     "—" y nunca "$0". Con 165 de 165 empresas sin TAM, la pantalla venía afirmando que la
     cartera vale cero dólares cuando la verdad es "no se sabe". */
  it("LA guarda: sin ningún TAM cargado el total es null, no 0", () => {
    expect(resumirPotencial([null, null, null])).toEqual({ total: null, sinEstimar: 3 });
  });

  it("con al menos uno, suma los cargados y cuenta aparte los que faltan", () => {
    expect(resumirPotencial([12_000, null, 8_000])).toEqual({ total: 20_000, sinEstimar: 1 });
  });

  it("un TAM de 0 es una decisión de Ventas, no una ausencia", () => {
    expect(resumirPotencial([0])).toEqual({ total: 0, sinEstimar: 0 });
  });
});

describe("⭐ E3.5 — la empresa existe, pero en otra pestaña", () => {
  /**
   * ── EL INCIDENTE QUE ESTA ETAPA EVITA (REMPRO, 2026-08-18) ────────────────────────────
   * El índice abre SIEMPRE en «Clientes» y la búsqueda solo mira la categoría abierta. Un CSE
   * buscó una empresa que estaba en «Prospectos», recibió cero, y concluyó lo único razonable:
   * que el proyecto que acababa de crear no se había asociado al cliente. Lo creó de nuevo.
   * Quedaron dos proyectos sobre el mismo trato y un record huérfano en HubSpot.
   *
   * ⚠ El vacío NO era mudo: E4 ya decía «ninguno DE ESTA PESTAÑA». Pero decir dónde NO está no
   * es lo mismo que decir dónde SÍ está, y esa diferencia costó un duplicado en producción.
   */
  const base = {
    kind: "CLIENTE" as const,
    enCategoria: 60,
    enPertenencia: 60,
    enVista: 60,
    pertenencia: null,
    vista: "todos" as const,
  };

  it("dice DÓNDE está y ofrece el salto", () => {
    const v = explicarListaVacia({
      ...base,
      busqueda: "REMPRO",
      coincidenEnOtraCategoria: { PROSPECTO: 1 },
    });
    expect(v.detalle, "no dice dónde SÍ está — el vacío sigue siendo media respuesta").toContain(
      CLIENT_KIND_META.PROSPECTO.plural.toLowerCase(),
    );
    expect(v.acciones).toHaveLength(1);
    expect(v.acciones[0].tipo).toBe("ir-a-categoria");
    expect((v.acciones[0] as { kind: string }).kind).toBe("PROSPECTO");
  });

  it("con coincidencias en VARIAS categorías las lista todas, la mayor primero", () => {
    const v = explicarListaVacia({
      ...base,
      busqueda: "grupo",
      coincidenEnOtraCategoria: { PROSPECTO: 2, ALIADO: 5 },
    });
    expect(v.acciones).toHaveLength(2);
    expect((v.acciones[0] as { kind: string }).kind, "no priorizó la categoría con más coincidencias").toBe("ALIADO");
  });

  it("⛔ NO cuenta la categoría abierta como «otra»", () => {
    /* Si se contara a sí misma, la etapa se dispararía sobre un vacío causado por la VISTA o la
       pertenencia y mandaría a la persona a la pestaña en la que ya está. */
    const v = explicarListaVacia({ ...base, busqueda: "algo", coincidenEnOtraCategoria: { CLIENTE: 3 } });
    expect(v.titulo, "se disparó E3.5 contando la propia pestaña").toContain("Sin resultados");
    expect(v.acciones.some((a) => a.tipo === "ir-a-categoria")).toBe(false);
  });

  it("sin coincidencias en ningún lado cae a E4, como siempre", () => {
    const v = explicarListaVacia({ ...base, busqueda: "noexiste", coincidenEnOtraCategoria: { PROSPECTO: 0 } });
    expect(v.acciones.some((a) => a.tipo === "ir-a-categoria")).toBe(false);
    expect(v.detalle).toContain("de esta pestaña");
  });

  it("⚠ la VISTA gana: si el filtro dejó la lista en cero, el problema es el filtro", () => {
    /* La cascada la gana la PRIMERA causa real. Si E3.5 se adelantara a E3, mandaría a la persona
       a otra pestaña cuando lo que la vació fue un filtro que sigue puesto — y allá también
       vería cero. */
    const v = explicarListaVacia({
      ...base,
      enVista: 0,
      vista: VISTAS_DE_CARTERA[1].key,
      busqueda: "REMPRO",
      coincidenEnOtraCategoria: { PROSPECTO: 1 },
    });
    expect(v.acciones[0].tipo, "E3.5 se adelantó a la vista").toBe("quitar-filtro");
  });

  it("sin término de búsqueda no se dispara", () => {
    const v = explicarListaVacia({ ...base, enCategoria: 0, busqueda: "", coincidenEnOtraCategoria: { PROSPECTO: 9 } });
    expect(v.acciones.some((a) => a.tipo === "ir-a-categoria")).toBe(false);
  });
});

describe("⭐ vender asciende al prospecto — LAS DOS PUERTAS", () => {
  /**
   * ── EL MODO DE FALLA ─────────────────────────────────────────────────────────────────
   * Toda empresa que entra por un caso de negocio nace PROSPECTO. Un proyecto puede llegarle por
   * DOS caminos: el botón «Nuevo proyecto» y el sync de HubSpot, que corre solo cada 10 minutos.
   * Arreglar uno solo deja la falla viva por el otro — y por el sync es peor, porque llega sin
   * que nadie apriete nada.
   *
   * ⛔ La segunda assert de cada puerta es la que importa: si alguien «simplifica» esto a
   * `data: { kind: "CLIENTE" }` sin el filtro en el WHERE, un ALIADO o un proyecto INTERNO se
   * volverían CLIENTE al abrirles un proyecto, y entrarían a cartera y a cobranza sin que nadie
   * lo decida. La regla «solo sube» vive en el WHERE, no en un `if` que se puede mover.
   */
  const PUERTAS = [
    { archivo: "app/api/projects/route.ts", cual: "el botón «Nuevo proyecto»" },
    { archivo: "lib/hubspot/sync-projects.ts", cual: "el sync de HubSpot" },
  ];

  for (const p of PUERTAS) {
    it(`${p.cual} asciende, y SOLO hacia arriba`, () => {
      const src = fs.readFileSync(path.join(process.cwd(), p.archivo), "utf8");
      const i = src.indexOf("client.updateMany");
      expect(i, `${p.archivo}: dejó de ascender al prospecto`).toBeGreaterThan(-1);
      const bloque = src.slice(i, i + 220);
      expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(60);
      expect(
        bloque,
        `${p.archivo}: el filtro kind salió del WHERE — un ALIADO o un INTERNO se vuelven CLIENTE`,
      ).toContain('kind: "PROSPECTO"');
      expect(bloque, `${p.archivo}: dejó de escribir CLIENTE`).toContain('kind: "CLIENTE"');
    });
  }
});
