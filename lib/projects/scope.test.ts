/**
 * lib/projects/scope.test.ts — el FRAGMENTO y el PREDICADO tienen que decir lo mismo.
 *
 * ── LA FALLA QUE ATACA, que estaba VIVA ──────────────────────────────────────
 * El rail de proyectos filtraba en SQL y la pestaña inicial en JavaScript, y no coincidían:
 * en Postgres `serviceType <> '__strategy__'` vale NULL cuando la columna es NULL, y una
 * fila con predicado NULL **no entra** en el resultado; en JavaScript `null !== "__strategy__"`
 * es `true` y sí entra. Un proyecto con `serviceType` nulo podía ser elegido como pestaña
 * inicial sin existir en el rail. Esta guarda lo habría atrapado el día uno.
 *
 * ── CÓMO SE PRUEBA SIN BASE DE DATOS ─────────────────────────────────────────
 * Se evalúa el `Prisma.ProjectWhereInput` con **la lógica de tres valores de SQL**
 * (TRUE / FALSE / NULL) sobre filas sintéticas, y se compara contra el predicado en
 * memoria. El evaluador cubre solo el subconjunto que estos fragmentos usan, y falla
 * ruidosamente ante cualquier forma que no conozca — así nadie agrega una condición nueva
 * y se queda sin cobertura sin darse cuenta.
 *
 * No reemplaza a `scripts/check-project-scope-parity.ts`, que compara los conjuntos contra
 * la base de verdad: eso mide los datos reales, esto mide la LÓGICA, y hacen falta los dos.
 * Este corre en cada `vitest`; aquel necesita la base.
 */
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  ATOMOS_POR_CRITERIO,
  PROYECTO_CLASIFICABLE_WHERE,
  PROYECTO_DE_CARTERA_WHERE,
  PROYECTO_DE_PIPELINE_CS_WHERE,
  PROYECTO_FACTURABLE_WHERE,
  PROYECTO_NAVEGABLE_WHERE,
  esProyectoClasificable,
  esProyectoDeCartera,
  esProyectoDePipelineCS,
  esProyectoFacturable,
  esProyectoNavegable,
  proyectoNavegableWhere,
  type ClienteParaFiltro,
  type ProyectoParaFiltro,
} from "./scope";
import { SENTINEL_SERVICE_TYPE } from "./kind";
import { ESTADOS_DE_ALTA, altaEnCurso, parseEstadoDeAlta } from "./alta";

// ── El evaluador con semántica de SQL ────────────────────────────────────────

/** TRUE / FALSE / NULL (desconocido). En SQL, un WHERE solo deja pasar TRUE. */
type Tri = true | false | null;

const y = (vs: Tri[]): Tri => (vs.includes(false) ? false : vs.includes(null) ? null : true);
const o = (vs: Tri[]): Tri => (vs.includes(true) ? true : vs.includes(null) ? null : false);

/** Una fila: el proyecto más las columnas del cliente que la relación alcanza. */
interface Fila {
  p: ProyectoParaFiltro;
  c: ClienteParaFiltro;
}

function evaluar(where: Prisma.ProjectWhereInput, fila: Fila): Tri {
  const partes: Tri[] = [];

  for (const [clave, valor] of Object.entries(where) as Array<[string, unknown]>) {
    if (clave === "AND") {
      partes.push(y((valor as Prisma.ProjectWhereInput[]).map((w) => evaluar(w, fila))));
      continue;
    }
    if (clave === "OR") {
      partes.push(o((valor as Prisma.ProjectWhereInput[]).map((w) => evaluar(w, fila))));
      continue;
    }
    if (clave === "client") {
      partes.push(evaluarCliente(valor as Record<string, unknown>, fila.c));
      continue;
    }

    const enFila = (fila.p as unknown as Record<string, unknown>)[clave];
    if (!(clave in fila.p)) {
      throw new Error(
        `El evaluador no conoce la columna "${clave}". Agregala a ProyectoParaFiltro y a las ` +
          `filas sintéticas de este test, o el fragmento nuevo queda sin cobertura.`,
      );
    }
    partes.push(comparar(clave, enFila, valor));
  }

  return y(partes);
}

function comparar(clave: string, enFila: unknown, cond: unknown): Tri {
  // { campo: null } → IS NULL. Nunca da NULL: es un predicado de dos valores.
  if (cond === null) return enFila === null;
  // { campo: valor } → igualdad. Con la columna en NULL, el resultado es NULL.
  if (typeof cond !== "object") return enFila === null ? null : enFila === cond;

  const c = cond as Record<string, unknown>;
  if ("not" in c) {
    // { campo: { not: null } } → IS NOT NULL (dos valores).
    if (c.not === null) return enFila !== null;
    // { campo: { not: X } } → `campo <> X`, que con la columna en NULL vale NULL.
    // ES EL BUG: acá se caía el proyecto con serviceType nulo.
    return enFila === null ? null : enFila !== c.not;
  }
  if ("notIn" in c) {
    // NOT IN comparte la trampa de `<>`.
    return enFila === null ? null : !(c.notIn as unknown[]).includes(enFila);
  }
  if ("in" in c) {
    return enFila === null ? null : (c.in as unknown[]).includes(enFila);
  }
  throw new Error(`El evaluador no conoce el operador de "${clave}": ${JSON.stringify(cond)}`);
}

/** La única relación que estos fragmentos atraviesan: Project → Client. */
function evaluarCliente(cond: Record<string, unknown>, c: ClienteParaFiltro): Tri {
  const partes: Tri[] = [];
  for (const [clave, valor] of Object.entries(cond)) {
    if (clave === "hubspotCompanyId") {
      partes.push(comparar(clave, c.hubspotCompanyId, valor));
    } else if (clave === "hubspotAccount") {
      // { hubspotAccount: { is: null } } → el cliente NO tiene cuenta propia.
      const v = valor as Record<string, unknown>;
      if (!("is" in v) || v.is !== null) {
        throw new Error(`El evaluador solo conoce { hubspotAccount: { is: null } }`);
      }
      partes.push(!c.tieneHubspotAccount);
    } else {
      throw new Error(`El evaluador no conoce la condición de cliente "${clave}"`);
    }
  }
  return y(partes);
}

// ── Las filas sintéticas ─────────────────────────────────────────────────────

const CS = "826270797";
const DEV = "922785384";
const WEB = "922688687";
const DESCONOCIDO = "default-onboarding-pipeline";

const PROYECTO_BASE: ProyectoParaFiltro = {
  status: "active",
  serviceType: "loop_sales",
  hubspotServiceId: "123",
  hubspotPipelineId: CS,
  proyectoInterno: false,
  hermanoCsProjectId: null,
  altaEstado: null,
};

const CLIENTE_CON_PORTAL: ClienteParaFiltro = { hubspotCompanyId: "co1", tieneHubspotAccount: false };
const CLIENTE_SIN_PORTAL: ClienteParaFiltro = { hubspotCompanyId: null, tieneHubspotAccount: false };
const CLIENTE_CON_CUENTA: ClienteParaFiltro = { hubspotCompanyId: null, tieneHubspotAccount: true };

/**
 * El producto cartesiano de todo lo que mueve una decisión. Incluye a propósito los casos
 * que en la base real hoy no existen —un `serviceType` nulo, un hermano sobre un pipeline
 * desconocido— porque el sentido de esto es cubrir lo que los datos de hoy NO ejercitan.
 */
function todasLasFilas(): Fila[] {
  const filas: Fila[] = [];
  for (const status of ["active", "inactive", "paused"]) {
    for (const serviceType of ["loop_sales", SENTINEL_SERVICE_TYPE, null]) {
      for (const hubspotServiceId of ["123", null]) {
        for (const hubspotPipelineId of [CS, DEV, WEB, DESCONOCIDO, null]) {
          for (const proyectoInterno of [true, false]) {
            for (const hermanoCsProjectId of ["otro-proyecto", null]) {
              /* Los CUATRO valores del alta, `null` incluido y primero. `null` es el 99% de la
                 base real —todo lo anterior a la Tanda C y todo lo que entra por el espejo—,
                 así que es el que de verdad tiene que coincidir entre el SQL y la memoria: un
                 `notIn` mal escrito lo trata como "no cumple" y vacía cobranza entera. */
              for (const altaEstado of [null, ...ESTADOS_DE_ALTA]) {
                for (const c of [CLIENTE_CON_PORTAL, CLIENTE_SIN_PORTAL, CLIENTE_CON_CUENTA]) {
                  filas.push({
                    p: {
                      ...PROYECTO_BASE,
                      status,
                      serviceType,
                      hubspotServiceId,
                      hubspotPipelineId,
                      proyectoInterno,
                      hermanoCsProjectId,
                      altaEstado,
                    },
                    c,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return filas;
}

const FILAS = todasLasFilas();

// ── Las pruebas ──────────────────────────────────────────────────────────────

const CRITERIOS = [
  { nombre: "navegable", where: PROYECTO_NAVEGABLE_WHERE, predicado: esProyectoNavegable },
  { nombre: "cartera", where: PROYECTO_DE_CARTERA_WHERE, predicado: esProyectoDeCartera },
  { nombre: "facturable", where: PROYECTO_FACTURABLE_WHERE, predicado: esProyectoFacturable },
  {
    nombre: "clasificable",
    where: PROYECTO_CLASIFICABLE_WHERE,
    predicado: (p: ProyectoParaFiltro) => esProyectoClasificable(p),
  },
  {
    nombre: "pipeline-cs",
    where: PROYECTO_DE_PIPELINE_CS_WHERE,
    predicado: (p: ProyectoParaFiltro) => esProyectoDePipelineCS(p),
  },
] as const;

describe("el fragmento SQL y el predicado en memoria coinciden en TODAS las combinaciones", () => {
  it("hay suficientes filas como para que esto signifique algo", () => {
    expect(FILAS.length).toBeGreaterThan(500);
  });

  for (const { nombre, where, predicado } of CRITERIOS) {
    it(`${nombre}: ${FILAS.length} filas, cero discrepancias`, () => {
      const discrepancias: string[] = [];
      for (const fila of FILAS) {
        const porSql = evaluar(where, fila) === true; // un WHERE solo deja pasar TRUE
        const porMemoria = predicado(fila.p, fila.c);
        if (porSql !== porMemoria) {
          discrepancias.push(
            `SQL=${porSql} memoria=${porMemoria} · ${JSON.stringify({ ...fila.p, cliente: fila.c })}`,
          );
        }
      }
      expect(
        discrepancias.slice(0, 8),
        `El criterio "${nombre}" filtra distinto en SQL que en memoria. Es EL bug que este ` +
          `archivo existe para atrapar: en SQL un predicado NULL descarta la fila, en ` +
          `JavaScript no. Escribí la condición en POSITIVO o agregale su rama de null.\n` +
          `${discrepancias.length} discrepancias en total.`,
      ).toEqual([]);
    });
  }
});

describe("los fragmentos son seguros de spreadear", () => {
  for (const { nombre, where } of CRITERIOS) {
    it(`${nombre} tiene UNA sola clave de primer nivel, y es AND`, () => {
      /* Con una sola clave, un caller que spreadee sus propias condiciones (`clientId`,
         un `in` de ids) no puede pisar el criterio por accidente. */
      expect(Object.keys(where), nombre).toEqual(["AND"]);
    });
  }

  it("la versión función mete lo del caller DENTRO del AND (no lo puede pisar)", () => {
    const conExtra = proyectoNavegableWhere({ clientId: "c1" });
    expect(Object.keys(conExtra)).toEqual(["AND"]);
    const clausulas = (conExtra as { AND: unknown[] }).AND;
    // Una cláusula más que el fragmento pelado, y es la del caller.
    expect(clausulas.length).toBe(ATOMOS_POR_CRITERIO.navegable.length + 1);
    expect(clausulas[clausulas.length - 1]).toEqual({ clientId: "c1" });
  });
});

describe("cada criterio dice de qué está hecho", () => {
  it("navegable es el más ancho: cartera y facturable están CONTENIDOS en él", () => {
    /* No es cosmético: garantiza que un proyecto que se factura o que suma a la cartera
       SIEMPRE tenga pestaña. Si cartera dejara de estar contenida en navegable, habría un
       proyecto que cobra y al que nadie puede entrar.
     *
     * ── SE COMPRUEBA EL CONJUNTO, NO LOS NOMBRES DE LOS ÁTOMOS ─────────────────
     * Antes esto exigía que cada átomo de navegable apareciera TAMBIÉN en cartera y en
     * facturable. Era un proxy barato, y la Tanda C lo rompió sin romper la propiedad: para
     * que un alta a medio hacer se vea, navegable pasó a usar `regla-hubspot-o-alta-en-curso`
     * mientras cartera y facturable siguen con `regla-hubspot` (más `alta-terminada`). La
     * contención sigue valiendo —quien cumple `regla-hubspot` cumple la versión con el `O`—
     * pero los nombres ya no calzan.
     *
     * Comprobar el conjunto sobre todas las filas sintéticas es estrictamente más fuerte:
     * mide lo que el párrafo de arriba promete, y no se puede engañar renombrando un átomo
     * ni componiendo el mismo criterio de otra forma. */
    for (const fila of todasLasFilas()) {
      const navegable = esProyectoNavegable(fila.p, fila.c);
      const donde = JSON.stringify(fila);
      if (esProyectoDeCartera(fila.p, fila.c)) {
        expect(navegable, `es de CARTERA pero no navegable: ${donde}`).toBe(true);
      }
      if (esProyectoFacturable(fila.p, fila.c)) {
        expect(navegable, `es FACTURABLE pero no navegable: ${donde}`).toBe(true);
      }
    }
  });

  it("clasificable NO lleva la regla de HubSpot — es la decisión, no un olvido", () => {
    // Un proyecto creado a mano en Nexus es un destino válido para una sesión.
    expect(ATOMOS_POR_CRITERIO.clasificable).not.toContain("regla-hubspot");
    expect(ATOMOS_POR_CRITERIO.clasificable).not.toContain("no-es-interno");
  });

  it("facturable es el único que mira al hermano", () => {
    expect(ATOMOS_POR_CRITERIO.facturable).toContain("no-es-hermano-de-cs");
    expect(ATOMOS_POR_CRITERIO.cartera).not.toContain("no-es-hermano-de-cs");
    expect(ATOMOS_POR_CRITERIO.navegable).not.toContain("no-es-hermano-de-cs");
  });
});

// Atajos de los tres criterios sobre la fila base. En scope de módulo —y no dentro de un
// `describe`— porque los usan los dos bloques de casos con nombre.
const nav = (p: Partial<ProyectoParaFiltro>, c = CLIENTE_CON_PORTAL) =>
  esProyectoNavegable({ ...PROYECTO_BASE, ...p }, c);
const fact = (p: Partial<ProyectoParaFiltro>, c = CLIENTE_CON_PORTAL) =>
  esProyectoFacturable({ ...PROYECTO_BASE, ...p }, c);
const cart = (p: Partial<ProyectoParaFiltro>, c = CLIENTE_CON_PORTAL) =>
  esProyectoDeCartera({ ...PROYECTO_BASE, ...p }, c);
const pipCs = (p: Partial<ProyectoParaFiltro>) => esProyectoDePipelineCS({ ...PROYECTO_BASE, ...p });

describe("casos con nombre y apellido", () => {
  it("el proyecto con serviceType NULO es navegable (no es el centinela)", () => {
    expect(nav({ serviceType: null })).toBe(true);
  });

  it("el centinela nunca es nada", () => {
    expect(nav({ serviceType: SENTINEL_SERVICE_TYPE })).toBe(false);
    expect(cart({ serviceType: SENTINEL_SERVICE_TYPE })).toBe(false);
    expect(fact({ serviceType: SENTINEL_SERVICE_TYPE })).toBe(false);
    expect(esProyectoClasificable({ ...PROYECTO_BASE, serviceType: SENTINEL_SERVICE_TYPE })).toBe(false);
  });

  it("un desarrollo tiene pestaña pero NO es cartera de CS", () => {
    expect(nav({ hubspotPipelineId: DEV })).toBe(true);
    expect(cart({ hubspotPipelineId: DEV })).toBe(false);
  });

  it("⭐ el CSE de la cuenta sale del pipeline de HubSpot, NUNCA de development/web", () => {
    /* Elías, 2026-08-21: "las cuentas tienen que estar en el ownership de las personas del
       pipeline de hubspot". Un desarrollador dueño del hijo/hermano de development NO es
       dueño de la cuenta — ni para la columna CSE de /clients ni para lib/auth/access.ts. */
    expect(pipCs({ hubspotPipelineId: CS })).toBe(true);
    expect(pipCs({ hubspotPipelineId: DEV })).toBe(false);
    expect(pipCs({ hubspotPipelineId: WEB })).toBe(false);
  });

  it("un pipeline desconocido cuenta como CS (degrada a legacy, como el resto)", () => {
    expect(pipCs({ hubspotPipelineId: DESCONOCIDO })).toBe(true);
    expect(pipCs({ hubspotPipelineId: null })).toBe(true);
  });

  it("pipeline-cs es CIEGO a status/interno/alta — un dueño no deja de serlo por eso", () => {
    /* A diferencia de cartera/facturable, este criterio decide UNA cosa sola: de qué
       pipeline es el proyecto. Un proyecto pausado o con el alta en curso sigue marcando a
       su dueño como el CSE de la cuenta — lo contrario sería una cuenta sin CSE mientras el
       alta termina. */
    expect(pipCs({ status: "paused" })).toBe(true);
    expect(pipCs({ proyectoInterno: true })).toBe(true);
    expect(pipCs({ altaEstado: "pendiente_crm" })).toBe(true);
  });

  it("un desarrollo APARTE se factura (Judesur); HERMANO no", () => {
    expect(fact({ hubspotPipelineId: DEV, hermanoCsProjectId: null })).toBe(true);
    expect(fact({ hubspotPipelineId: DEV, hermanoCsProjectId: "cs-1" })).toBe(false);
    expect(fact({ hubspotPipelineId: WEB, hermanoCsProjectId: "cs-1" })).toBe(false);
  });

  it("un interno no se factura ni suma a la cartera, pero sigue navegable", () => {
    expect(fact({ proyectoInterno: true })).toBe(false);
    expect(cart({ proyectoInterno: true })).toBe(false);
    expect(nav({ proyectoInterno: true })).toBe(true);
  });

  it("un pipeline desconocido se comporta como siempre", () => {
    expect(nav({ hubspotPipelineId: DESCONOCIDO })).toBe(true);
    expect(cart({ hubspotPipelineId: DESCONOCIDO })).toBe(true);
    expect(fact({ hubspotPipelineId: DESCONOCIDO })).toBe(true);
    // Y un hermano sobre un pipeline no declarado NO apaga la cobranza.
    expect(fact({ hubspotPipelineId: DESCONOCIDO, hermanoCsProjectId: "cs-1" })).toBe(true);
    expect(fact({ hubspotPipelineId: null, hermanoCsProjectId: "cs-1" })).toBe(true);
  });

  it("la regla de HubSpot es del CLIENTE, no del proyecto", () => {
    // Cliente con portal: solo proyectos sincronizados.
    expect(nav({ hubspotServiceId: null }, CLIENTE_CON_PORTAL)).toBe(false);
    // Cliente con su propia cuenta: idem.
    expect(nav({ hubspotServiceId: null }, CLIENTE_CON_CUENTA)).toBe(false);
    // Cliente sin nada de HubSpot: cualquier proyecto activo.
    expect(nav({ hubspotServiceId: null }, CLIENTE_SIN_PORTAL)).toBe(true);
  });

  it("clasificable ignora la regla de HubSpot", () => {
    expect(esProyectoClasificable({ ...PROYECTO_BASE, hubspotServiceId: null })).toBe(true);
    expect(esProyectoClasificable({ ...PROYECTO_BASE, proyectoInterno: true })).toBe(true);
    expect(esProyectoClasificable({ ...PROYECTO_BASE, hubspotPipelineId: DEV })).toBe(true);
  });
});

describe("el ALTA en curso: se ve, y no cobra (Tanda C)", () => {
  /** Un alta a medio hacer, en el estado más crudo: sin id de HubSpot todavía. */
  const enCurso = { hubspotServiceId: null, altaEstado: "pendiente_crm" as const };

  it("se VE aunque el cliente tenga portal y el proyecto no tenga id de HubSpot", () => {
    /* Es LA razón de existir del átomo. Sin él, el proyecto que acabás de crear es invisible
       justo en la única pantalla desde la que se puede apretar "Reintentar", y el usuario
       cree que se perdió. */
    expect(nav(enCurso, CLIENTE_CON_PORTAL)).toBe(true);
    expect(nav(enCurso, CLIENTE_CON_CUENTA)).toBe(true);
    expect(nav(enCurso, CLIENTE_SIN_PORTAL)).toBe(true);
  });

  it("NO cobra y NO suma a la cartera, en los dos estados en curso", () => {
    for (const altaEstado of ESTADOS_DE_ALTA.filter(altaEnCurso)) {
      expect(fact({ altaEstado }), altaEstado).toBe(false);
      expect(cart({ altaEstado }), altaEstado).toBe(false);
    }
  });

  it("`listo` y `null` se comportan IDÉNTICO — es lo que hace invisible el deploy", () => {
    /* La invariante más importante de la migración: los ~100 proyectos que ya existen quedan
       en NULL. Si NULL no diera exactamente lo mismo que 'listo', aplicar el SQL sacaría a
       todos los proyectos de cobranza y de la cartera al mismo tiempo. */
    for (const c of [CLIENTE_CON_PORTAL, CLIENTE_SIN_PORTAL, CLIENTE_CON_CUENTA]) {
      expect(nav({ altaEstado: null }, c)).toBe(nav({ altaEstado: "listo" }, c));
    }
    expect(fact({ altaEstado: null })).toBe(fact({ altaEstado: "listo" }));
    expect(cart({ altaEstado: null })).toBe(cart({ altaEstado: "listo" }));
  });

  /**
   * LA INVARIANTE DE TRES LADOS, y no de dos.
   *
   * La tentación es escribir "navegable ⟺ el alta terminó", y sería falso: el contenedor
   * "Información del cliente" (`SENTINEL_SERVICE_TYPE`) es un Project ACTIVO, sin id de
   * HubSpot y con el alta en NULL — o sea, indistinguible de un alta terminada por esas dos
   * columnas— y NO tiene que verse. Lo saca `NO_ES_SENTINEL`, que sigue en NAVEGABLE.
   *
   * Escrito como dos lados, la primera vez que alguien "simplifique" el átomo del alta se
   * llevaría puesto el sentinel y el contenedor aparecería como un proyecto más en el rail.
   */
  it("no es navegable ⟺ (el alta está en curso) O (no es un proyecto de verdad) O (la regla de HubSpot)", () => {
    const sentinel = { serviceType: SENTINEL_SERVICE_TYPE, altaEstado: null };
    expect(nav(sentinel, CLIENTE_SIN_PORTAL)).toBe(false);
    // …y con el alta en curso TAMPOCO: el atajo del alta no puede resucitarlo.
    expect(nav({ ...sentinel, altaEstado: "pendiente_crm" }, CLIENTE_SIN_PORTAL)).toBe(false);
    // Un proyecto de verdad con el alta en curso sí se ve. Los tres lados son independientes.
    expect(nav({ serviceType: "loop_sales", ...enCurso }, CLIENTE_CON_PORTAL)).toBe(true);
  });

  it("el estado que llega de la base se valida: basura NO cuenta como alta en curso", () => {
    /* `altaEstado` es TEXT sin enum de Postgres. Un valor que el código no conoce tiene que
       degradar a "terminada" —el comportamiento de siempre— y no a "en curso", que sacaría al
       proyecto de cobranza sin que nadie lo haya pedido. */
    expect(parseEstadoDeAlta("pendiente_de_algo")).toBeNull();
    expect(fact({ altaEstado: "pendiente_de_algo" })).toBe(true);
    expect(cart({ altaEstado: "pendiente_de_algo" })).toBe(true);
  });
});
