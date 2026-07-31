import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ESTADOS_DE_ALTA, altaEnCurso } from "@/lib/projects/alta";

/**
 * lib/hubspot/espejo-dirigido.test.ts — el espejo de UN solo proyecto no puede portarse como la
 * corrida completa.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * El espejo dirigido REUSA el recorrido entero del sync con una entrada más angosta. Eso es lo
 * que hace que escriba exactamente las mismas columnas —no hay dos implementaciones que puedan
 * divergir—, pero trae un peligro: al final del recorrido hay pasos que asumen "vinieron TODOS
 * los proyectos del cliente". Con uno solo adentro:
 *
 *  · la RECONCILIACIÓN desactivaría todo el resto de la cartera del cliente;
 *  · la RECLASIFICACIÓN de sesiones (~US$1) se pagaría en cada reintento del alta.
 *
 * Y uno que SÍ tiene que correr: resolver el hermano. Es lo que el motor del alta necesita para
 * dar el alta por terminada, así que apagarlo dejaría todas las altas de hermanos trabadas.
 *
 * Se verifica sobre el CÓDIGO porque son tres condiciones dentro de una función de 1.200 líneas
 * que habla con HubSpot: montarla entera para probar tres `if` costaría más de lo que protege.
 */

const RAIZ = process.cwd();
const SYNC = "lib/hubspot/sync-projects.ts";
const codigo = fs.readFileSync(path.join(RAIZ, SYNC), "utf8");

/** Sin comentarios: lo que explica una regla no es la regla. */
const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * El bloque `{ … }` balanceado que empieza en la primera aparición de `marca`.
 * Misma técnica que `bloquesData` en `lib/projects/scope-coverage.test.ts`: recortar y mirar
 * adentro no depende del formato ni del orden, que es donde las regex se rompen.
 */
function bloqueDesde(marca: string, src = sinComentarios): string {
  const i = src.indexOf(marca);
  expect(i, `no encontré «${marca}» en ${SYNC}`).toBeGreaterThan(-1);
  const abre = src.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < src.length; j++) {
    if (src[j] === "{") nivel++;
    else if (src[j] === "}") {
      nivel--;
      if (nivel === 0) return src.slice(abre, j + 1);
    }
  }
  throw new Error(`llaves sin cerrar desde «${marca}»`);
}

describe("el espejo dirigido apaga lo que asume la corrida completa", () => {
  it("NO reconcilia — o desactivaría el resto de la cartera del cliente", () => {
    /* La reconciliación apaga todo proyecto activo que no vino en `projectIds`. En el espejo
       dirigido ese set tiene UN elemento. Sin este candado, crear un proyecto desactivaría a
       todos sus hermanos: no es una optimización, es la diferencia entre traer uno y borrar del
       mapa a los demás. */
    expect(sinComentarios).toMatch(/if\s*\(\s*projectIds\.length\s*>\s*0\s*&&\s*!dirigido\s*\)/);
  });

  it("NO dispara la reclasificación de sesiones — la paga el motor del alta, una vez", () => {
    expect(sinComentarios).toMatch(/if\s*\(\s*result\.created\s*>\s*0\s*&&\s*!dirigido\s*\)/);
  });

  it("SÍ resuelve el hermano — sin eso, toda alta de un hermano queda trabada", () => {
    /* El motor solo da el alta por terminada cuando la hermandad quedó resuelta. Si este paso
       se apagara "por simetría" con los otros dos, el alta esperaría para siempre algo que nadie
       va a escribir. */
    const llamada = sinComentarios.match(/await\s+resolverHermanos\([^)]*\)/);
    expect(llamada, "resolverHermanos ya no se llama").not.toBeNull();
    // Y no está adentro de un `if (!dirigido)`: se busca que no haya un guard entre medio.
    const antes = sinComentarios.slice(0, sinComentarios.indexOf(llamada![0]));
    const ultimoIf = antes.lastIndexOf("if (");
    const trozo = antes.slice(ultimoIf);
    expect(trozo, "resolverHermanos quedó detrás de un guard de `dirigido`").not.toContain("dirigido");
  });

  it("no reclama el cooldown — un alta no puede dejar la ficha 10 min desactualizada", () => {
    expect(sinComentarios).toMatch(/if\s*\(\s*!dirigido\s*\)\s*lastSyncByClient\.set/);
  });

  it("lee SIEMPRE del portal del sistema, nunca del portal propio del cliente", () => {
    /* El record lo acaba de crear el alta en el portal de Smarteam. Si un cliente tuviera portal
       propio, la rama normal lo mandaría a buscarlo al CRM equivocado y el alta quedaría trabada
       para siempre con un 404 que en realidad significa "estás mirando otro portal". */
    const i = sinComentarios.indexOf("if (dirigido) {");
    expect(i, "desapareció la rama del portal del sistema para el espejo dirigido").toBeGreaterThan(-1);
    expect(sinComentarios.slice(i, i + 400)).toContain("getSystemHubspotClient");
  });
});

describe("la adopción por nombre está acotada", () => {
  /**
   * Adoptar por nombre existe para no duplicar un proyecto que Nexus creó y todavía no tiene su
   * id de HubSpot. Sin acotar, hacía dos cosas malas en silencio:
   *  1. adoptaba un proyecto INACTIVO y lo resucitaba con su cobranza vieja (la rama de update
   *     escribe `status: "active"`);
   *  2. se quedaba con el proyecto de un ALTA EN CURSO y le pegaba el record equivocado.
   */
  /* Se ancla en la LLAMADA y no en una de sus condiciones: anclar en `hubspotServiceId: null`
     recortaba desde la primera `{` posterior —la del `OR`— y el bloque salía de tres palabras.
     El test pasaba a rojo por la razón equivocada, que es la versión suave de pasar a verde por
     la razón equivocada. */
  const bloque = bloqueDesde("prisma.project.findFirst(");

  it("el bloque recortado ES la adopción por nombre (y no otra consulta)", () => {
    expect(bloque).toContain("name: projectName");
    expect(bloque).toContain("hubspotServiceId: null");
  });

  it("solo adopta proyectos ACTIVOS", () => {
    expect(bloque, `la adopción por nombre no filtra por status en ${SYNC}`).toMatch(
      /status:\s*["']active["']/,
    );
  });

  it("no le roba el record a un alta en curso", () => {
    expect(bloque, `la adopción por nombre no mira altaEstado en ${SYNC}`).toContain("altaEstado");
  });

  it("trata el NULL de forma explícita, no con un `notIn`", () => {
    /* Casi todas las filas tienen `altaEstado` en NULL. Un `notIn` sobre una columna NULL vale
       NULL en SQL y descarta la fila, así que la adopción no encontraría NUNCA a un proyecto
       creado a mano — y volverían los duplicados que esta búsqueda existe para evitar. */
    expect(bloque).toContain("altaEstado: null");
    expect(bloque).not.toMatch(/altaEstado:\s*\{\s*notIn/);
  });

  it("los estados en curso siguen siendo dos (si aparece un tercero, hay que revisar acá)", () => {
    // La lista del filtro se DERIVA de la tabla; este assert es el recordatorio de que un estado
    // nuevo cambia quién puede ser adoptado.
    expect(ESTADOS_DE_ALTA.filter(altaEnCurso)).toEqual(["pendiente_crm", "pendiente_espejo"]);
  });
});
