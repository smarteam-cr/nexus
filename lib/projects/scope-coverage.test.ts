/**
 * lib/projects/scope-coverage.test.ts — TRES CANDADOS fs-scan sobre el alcance de proyectos.
 *
 *   1. COBERTURA OBLIGATORIA — todo archivo que consulte varios proyectos está declarado en
 *      `scope-coverage.ts`, y su declaración no miente.
 *   2. RATCHET ANTI-COPIA — el filtro no vuelve a escribirse a mano, ni en su forma literal
 *      ni disfrazada de constante.
 *   3. ESCRITOR ÚNICO — solo el espejo de HubSpot puede asignar las columnas que declaran de
 *      qué clase es un proyecto.
 *
 * Molde: lib/ui/skeleton-coverage.test.ts (cobertura), lib/pieces/no-name-lookups.test.ts
 * (ratchet) y lib/pieces/enabled-filter.test.ts (candado con motivo por entrada).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SCOPE_COVERAGE, type Criterio } from "./scope-coverage";

const RAIZ = process.cwd();

/**
 * Quita comentarios escaneando de izquierda a derecha. Las dos formas ingenuas
 * (`replace(/\/\*[\s\S]*?\*\//g)` + `replace(/^\s*\/\/.*$/gm)`) FALLAN y ya fallaron en este
 * repo: un `// … /api/auth/hubspot/*` abre un bloque falso que se come el archivo hasta el
 * próximo cierre. Los strings se conservan: media prueba de acá es buscar literales.
 */
function soloCodigo(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const fin = src.indexOf("\n", i);
      i = fin === -1 ? src.length : fin;
    } else if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      i = fin === -1 ? src.length : fin + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const codigoDe = (rel: string) => soloCodigo(leer(rel));

// ── El escáner ───────────────────────────────────────────────────────────────

function archivosFuente(dir: string, acc: string[] = []): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      archivosFuente(rel, acc);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

const FUENTES = [...archivosFuente("lib"), ...archivosFuente("app"), ...archivosFuente("components")];

/**
 * Consultas de VARIOS proyectos. `findUnique` queda afuera a propósito: pedir UN proyecto por
 * su id no necesita criterio de alcance — no hay nada que filtrar.
 */
const CONSULTA_MULTIPLE = /(?:prisma|tx|db)\.project\.(?:findMany|count|groupBy|findFirst|updateMany|aggregate)\b/;

const CONSULTAN_PROYECTOS = FUENTES.filter((rel) => CONSULTA_MULTIPLE.test(codigoDe(rel)));

// ── 1 · COBERTURA OBLIGATORIA ────────────────────────────────────────────────

describe("cobertura — todo el que consulta varios proyectos declara su criterio", () => {
  it("el escáner encontró archivos (no quedó vacío por un cambio de estructura)", () => {
    expect(CONSULTAN_PROYECTOS.length).toBeGreaterThan(20);
  });

  it("TODO archivo que consulta varios proyectos está en SCOPE_COVERAGE", () => {
    const sinDeclarar = CONSULTAN_PROYECTOS.filter((rel) => !SCOPE_COVERAGE[rel]);
    expect(
      sinDeclarar,
      `Archivos que preguntan "¿qué proyectos?" sin declarar con qué criterio. Agregalos a ` +
        `lib/projects/scope-coverage.ts:\n` +
        `  · criterio  → usa un fragmento de lib/projects/scope.ts (lo normal)\n` +
        `  · sentinel  → va a buscar el contenedor de "Información del cliente"\n` +
        `  · escritor  → es el espejo de HubSpot\n` +
        `  · exento    → no necesita criterio, CON la razón escrita\n` +
        `Así nacieron las cuatro copias que esta tanda vino a borrar: nadie tuvo que ` +
        `declarar nada.\n${sinDeclarar.join("\n")}`,
    ).toEqual([]);
  });

  it("el registro no tiene entradas muertas", () => {
    const muertas = Object.keys(SCOPE_COVERAGE).filter((k) => !CONSULTAN_PROYECTOS.includes(k));
    expect(
      muertas,
      `Entradas de archivos que ya no consultan proyectos (o que se movieron). Borralas o ` +
        `actualizá la ruta — un registro con basura deja de leerse:\n${muertas.join("\n")}`,
    ).toEqual([]);
  });

  it("las declaraciones `criterio` no MIENTEN: el archivo importa el fragmento", () => {
    /* La parte que hace que el registro valga algo. Sin esto, alguien declara
       `criterio: "cartera"` y sigue filtrando a mano: la lista diría que está cubierto. */
    const marcadores: Record<Criterio, string[]> = {
      navegable: ["proyectoNavegableWhere", "PROYECTO_NAVEGABLE_WHERE", "esProyectoNavegable"],
      cartera: ["proyectoDeCarteraWhere", "PROYECTO_DE_CARTERA_WHERE", "esProyectoDeCartera"],
      facturable: ["proyectoFacturableWhere", "PROYECTO_FACTURABLE_WHERE", "esProyectoFacturable"],
      clasificable: [
        "proyectoClasificableWhere",
        "PROYECTO_CLASIFICABLE_WHERE",
        "esProyectoClasificable",
      ],
    };
    const mentirosas: string[] = [];
    for (const [rel, cob] of Object.entries(SCOPE_COVERAGE)) {
      if (cob.modo !== "criterio") continue;
      const codigo = codigoDe(rel);
      if (!marcadores[cob.criterio].some((m) => codigo.includes(m))) {
        mentirosas.push(`${rel} declara "${cob.criterio}" pero no importa ninguno de sus helpers`);
      }
    }
    expect(mentirosas, mentirosas.join("\n")).toEqual([]);
  });

  it("las declaraciones `sentinel` usan la constante, no el literal", () => {
    const conLiteral: string[] = [];
    for (const [rel, cob] of Object.entries(SCOPE_COVERAGE)) {
      if (cob.modo !== "sentinel") continue;
      const codigo = codigoDe(rel);
      if (codigo.includes('"__strategy__"')) conLiteral.push(rel);
      if (!codigo.includes("SENTINEL")) conLiteral.push(`${rel} (no importa la constante)`);
    }
    expect(
      conLiteral,
      `Escriben el sentinel a mano. Importalo de lib/projects/kind.ts:\n${conLiteral.join("\n")}`,
    ).toEqual([]);
  });

  it("los `exento` y `escritor` traen su razón escrita", () => {
    const sinRazon = Object.entries(SCOPE_COVERAGE)
      .filter(([, c]) => (c.modo === "exento" || c.modo === "escritor") && c.razon.trim().length < 40)
      .map(([rel]) => rel);
    expect(
      sinRazon,
      `Una exención sin motivo escrito es una exención que nadie va a poder revisar:\n${sinRazon.join("\n")}`,
    ).toEqual([]);
  });
});

// ── 2 · RATCHET ANTI-COPIA ───────────────────────────────────────────────────

/**
 * Las formas de escribir el filtro a mano. Se busca la LITERAL y la DISFRAZADA: cuando se
 * migró el registro de piezas, un guard que solo miraba el literal dejó pasar dos
 * find-or-create que usaban `NOMBRE.name` — la misma consulta, por referencia.
 */
function copiasDelFiltro(rel: string): string[] {
  const codigo = codigoDe(rel);
  const hits: string[] = [];
  // El literal del sentinel dentro de una condición de serviceType.
  hits.push(...(codigo.match(/serviceType:\s*\{?\s*not:\s*"__strategy__"/g) ?? []));
  hits.push(...(codigo.match(/serviceType:\s*"__strategy__"/g) ?? []));
  // La disfrazada: por la constante, pero escribiendo la condición otra vez en vez de
  // importar el fragmento. Es la forma que más cuesta ver en un diff.
  hits.push(...(codigo.match(/serviceType:\s*\{\s*not:\s*SENTINEL[A-Z_]*\s*\}/g) ?? []));
  // La regla de HubSpot copiada: el par company/account que solo tiene sentido junto.
  if (/hubspotCompanyId:\s*null/.test(codigo) && /hubspotAccount:\s*\{\s*is:\s*null\s*\}/.test(codigo)) {
    hits.push("regla-hubspot copiada");
  }
  return hits;
}

/**
 * Archivos donde una copia NO es deuda cosmética: son los cuatro criterios canónicos más
 * los que deciden plata o navegación. Tienen que quedar en CERO.
 */
const CRITICOS = [
  "lib/portfolio/load.ts", // la cartera de CS
  "lib/cobranza/queries.ts", // el panel de cobranza (plata)
  "lib/cs/watchdog.ts", // las alertas de éxito del cliente
  "app/(shell)/clients/[id]/layout.tsx", // la pestaña inicial
  "app/(shell)/clients/[id]/page.tsx", // el rail de proyectos
  "lib/sessions/classify-session-project.ts", // a qué proyecto va una sesión
];

/**
 * DEUDA tolerada, con su cuenta exacta. Solo puede ENCOGER: si un archivo baja, hay que
 * actualizar el número, y cuando llega a 0 se borra la entrada. Nadie puede subir una.
 *
 * `load-canvas-context.ts` compone el átomo a mano a propósito (necesita incluir los
 * proyectos terminados, que `clasificable` excluye) — está en la lista con su razón en
 * scope-coverage.ts, y por eso su cuenta es 1 y no 0.
 */
const DEUDA: Record<string, number> = {
  "lib/canvas/load-canvas-context.ts": 1,
};

describe("ratchet — el filtro no vuelve a escribirse a mano", () => {
  for (const rel of CRITICOS) {
    it(`${rel} importa el criterio en vez de copiarlo`, () => {
      expect(
        copiasDelFiltro(rel),
        `${rel} volvió a escribir el filtro de "proyecto real" a mano. Importalo de ` +
          `lib/projects/scope.ts. Cuando estaba copiado en cuatro lugares, dos ya habían ` +
          `divergido y el rail no coincidía con la pestaña inicial.`,
      ).toEqual([]);
    });
  }

  it("la deuda declarada no creció", () => {
    const peor: string[] = [];
    for (const [rel, tope] of Object.entries(DEUDA)) {
      const n = copiasDelFiltro(rel).length;
      if (n > tope) peor.push(`${rel}: ${n} copias (el tope declarado es ${tope})`);
      if (n < tope) peor.push(`${rel}: bajó a ${n} — actualizá DEUDA (o borrá la entrada si es 0)`);
    }
    expect(peor, peor.join("\n")).toEqual([]);
  });

  it("no apareció deuda nueva fuera de la lista", () => {
    const nuevos = FUENTES.filter(
      (rel) =>
        // El módulo del alcance es DONDE vive el filtro: acusarlo sería acusar a la solución.
        !rel.startsWith("lib/projects/") &&
        !CRITICOS.includes(rel) &&
        !(rel in DEUDA) &&
        copiasDelFiltro(rel).length > 0,
    );
    expect(
      nuevos,
      `Archivos que escriben el filtro a mano y no están declarados. Usá el fragmento de ` +
        `lib/projects/scope.ts, o —si de verdad necesitás una variante— agregalo a DEUDA con ` +
        `su cuenta y explicá por qué en scope-coverage.ts:\n${nuevos.join("\n")}`,
    ).toEqual([]);
  });
});

// ── 3 · ESCRITOR ÚNICO ───────────────────────────────────────────────────────

/**
 * Las cuatro columnas que declaran de qué clase es un proyecto. Las escribe HubSpot y las
 * espeja el sync: NADIE MÁS.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Alguien agrega un interruptor "Interno" en la ficha del proyecto —parece obvio y útil—, el
 * CSE lo prende, y diez minutos después el sync lo revierte porque en HubSpot el checkbox
 * sigue en blanco. Sobre un campo que decide si el proyecto se factura. El interruptor tiene
 * que escribir en HUBSPOT, no en Nexus.
 */
const COLUMNAS_DE_CLASE = [
  "hubspotPipelineId",
  "proyectoInterno",
  "hubspotRelatedProjectIds",
  "hermanoCsProjectId",
];

/** Los únicos autorizados, cada uno con su motivo. */
const ESCRITORES_AUTORIZADOS: Array<{ archivo: string; porque: string }> = [
  {
    archivo: "lib/hubspot/sync-projects.ts",
    porque: "es el espejo: lee las propiedades y las asociaciones de HubSpot y las materializa",
  },
  {
    archivo: "scripts/backfill-project-pipeline.ts",
    porque: "completa de una vez lo que el tramo SQL de la migración no pudo resolver",
  },
];

/**
 * Los bloques `data: { … }` de un archivo, con las llaves BALANCEADAS.
 *
 * Buscar la columna en todo el archivo no sirve: aparece en anotaciones de tipo
 * (`hubspotPipelineId: string`), en condiciones de un `where` (`hubspotPipelineId: null`) y al
 * pasar props (`hubspotPipelineId: p.hubspotPipelineId`) — nada de eso escribe en la base.
 * Y buscar `col: <algo que no sea true>` deja un agujero al revés: `proyectoInterno: true`
 * dentro de un `data` SÍ es una escritura, y se vería igual que un `select`.
 *
 * Por eso se recorta el `data:` de verdad. Es la única forma de que el candado no tenga ni
 * falsos positivos ni falsos negativos.
 */
function bloquesData(codigo: string): string[] {
  const bloques: string[] = [];
  const re = /\bdata\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo))) {
    let i = m.index + m[0].length - 1; // sobre la `{`
    let nivel = 0;
    const desde = i;
    for (; i < codigo.length; i++) {
      if (codigo[i] === "{") nivel++;
      else if (codigo[i] === "}") {
        nivel--;
        if (nivel === 0) break;
      }
    }
    bloques.push(codigo.slice(desde, i + 1));
  }
  return bloques;
}

/** Una ASIGNACIÓN de la columna: la columna nombrada DENTRO de un `data:` de Prisma. */
function asignaciones(rel: string): string[] {
  const codigo = codigoDe(rel);
  // Si el archivo no escribe proyectos, no hay nada que revisar.
  if (!/(?:prisma|tx|db)\.project\.(?:create|update|updateMany|upsert|createMany)\b/.test(codigo)) {
    return [];
  }
  const hits: string[] = [];
  for (const bloque of bloquesData(codigo)) {
    for (const col of COLUMNAS_DE_CLASE) {
      // `col:` o el shorthand `col,` / `col }`.
      if (new RegExp(`(?:^|[\\s{,])${col}\\s*[:,}]`).test(bloque)) hits.push(col);
    }
  }
  return [...new Set(hits)];
}

describe("escritor único — solo el espejo de HubSpot declara la clase de un proyecto", () => {
  const autorizados = new Set(ESCRITORES_AUTORIZADOS.map((e) => e.archivo));

  it("los autorizados son exactamente dos, y cada uno dice por qué", () => {
    expect(ESCRITORES_AUTORIZADOS.length).toBe(2);
    for (const e of ESCRITORES_AUTORIZADOS) {
      expect(e.porque.length, e.archivo).toBeGreaterThan(30);
      expect(fs.existsSync(path.join(RAIZ, e.archivo)), `${e.archivo} no existe`).toBe(true);
    }
  });

  it("nadie más asigna hubspotPipelineId / proyectoInterno / los del hermano", () => {
    const intrusos: string[] = [];
    for (const rel of FUENTES) {
      if (autorizados.has(rel)) continue;
      const hits = asignaciones(rel);
      if (hits.length) intrusos.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(
      intrusos,
      `Estos archivos escriben una columna que solo HubSpot decide:\n${intrusos.join("\n")}\n\n` +
        `Si es un interruptor de UI, tiene que escribir en HUBSPOT — si escribe en Nexus, el ` +
        `próximo sync lo revierte en diez minutos, sobre un campo que decide facturación.`,
    ).toEqual([]);
  });
});

// ── 4 · PARIDAD ENTRE CREAR Y ACTUALIZAR ─────────────────────────────────────

/**
 * El candado de arriba es un NOT-EXISTS: pregunta *quién más* escribe estas columnas. Nunca
 * pregunta si el escritor autorizado las escribe en **todas** sus ramas — y ése fue
 * exactamente el agujero.
 *
 * ── LO QUE PASÓ ──────────────────────────────────────────────────────────────
 * El sync tenía dos listas de campos escritas a mano, una por rama. La de ACTUALIZAR llevaba
 * `hubspotPipelineId`, `proyectoInterno` y `hubspotRelatedProjectIds`; la de CREAR no. Los
 * proyectos que NACEN entran por la rama de creación, así que en su primera sincronización
 * quedaban sin clase: cartera, vigilante y cobranza los trataban como Customer Success.
 *
 * Ninguna de las guardas lo vio, y vale entender por qué: **todas prueban la traducción
 * (hechos → decisiones); ninguna probaba la ingesta (HubSpot → hechos).** Peor, la fila
 * "SIN pipeline (sin backfill)" de `kind.test.ts` *bendice* el estado exacto que producía el
 * bug y lo declara idéntico al comportamiento de siempre.
 *
 * ── LA REGLA QUE CONGELA ESTO ────────────────────────────────────────────────
 * Hay UN objeto `espejo` con todo lo que se copia de HubSpot, y las dos ramas lo spreadean.
 * Este test verifica las dos mitades: que el espejo esté completo, y que nadie escriba un
 * proyecto "entero" sin usarlo.
 */
const COLUMNAS_ESPEJO = [
  "hubspotServiceId",
  "hubspotPipelineId",
  "proyectoInterno",
  "hubspotPipelineName",
  "hubspotPipelineStageId",
  "hubspotPipelineStageLabel",
  "hubspotOwnerId",
  "hubspotOwnerEmail",
  "serviceType",
  "projectType",
];

/**
 * Escrituras que a propósito NO son el espejo: tocan una sola cosa. Si un `data:` escribe
 * SOLO estas claves, no tiene por qué traer el espejo entero.
 *   · `status`             — apagar un proyecto terminado o fantasma.
 *   · `hermanoCsProjectId` — `resolverHermanos`, que corre al final con todo ya en la base.
 */
const CLAVES_DE_ESCRITURA_PARCIAL = new Set(["status", "hermanoCsProjectId"]);

/** El objeto literal de una `const <nombre> = { … }`, con llaves balanceadas. */
function objetoLiteral(codigo: string, nombre: string): string | null {
  const m = new RegExp(`\\bconst\\s+${nombre}\\s*=\\s*\\{`).exec(codigo);
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  let nivel = 0;
  const desde = i;
  for (; i < codigo.length; i++) {
    if (codigo[i] === "{") nivel++;
    else if (codigo[i] === "}") {
      nivel--;
      if (nivel === 0) break;
    }
  }
  return codigo.slice(desde, i + 1);
}

/**
 * Las claves de primer nivel de un bloque `{ … }` (ignora lo anidado y los spreads).
 *
 * ⚠ El detalle que se me escapó la primera vez: la llave de APERTURA del propio bloque no
 * puede contar como "abrí algo anidado". Si apaga el flag de inicio-de-clave, la primera
 * clave nunca se captura y un `{ status: "inactive" }` se lee como un objeto sin claves —
 * que es justo la forma que este test tiene que reconocer como escritura parcial.
 */
function clavesDePrimerNivel(bloque: string): string[] {
  const claves: string[] = [];
  let nivel = 0;
  let esperandoClave = false;
  let token = "";
  for (let i = 0; i < bloque.length; i++) {
    const c = bloque[i];
    if (c === "{" || c === "[" || c === "(") {
      nivel++;
      // Solo la llave EXTERNA abre el nivel donde viven las claves que buscamos.
      if (nivel === 1) { esperandoClave = true; token = ""; }
      else esperandoClave = false;
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      nivel--;
      if (nivel === 1) { esperandoClave = false; token = ""; }
      continue;
    }
    if (nivel !== 1) continue;
    if (c === ",") {
      esperandoClave = true;
      token = "";
      continue;
    }
    if (c === ":") {
      if (esperandoClave && token.trim()) claves.push(token.trim());
      esperandoClave = false;
      token = "";
      continue;
    }
    if (/\s/.test(c)) continue;
    if (esperandoClave) token += c;
  }
  return claves;
}

/** Cada llamada `project.create(…)` / `project.update(…)` con su argumento balanceado. */
function escriturasDeProyecto(codigo: string): Array<{ tipo: string; cuerpo: string }> {
  const out: Array<{ tipo: string; cuerpo: string }> = [];
  const re = /(?:prisma|tx|db)\.project\.(create|update|updateMany|upsert)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo))) {
    let i = m.index + m[0].length - 1; // sobre el `(`
    let nivel = 0;
    const desde = i;
    for (; i < codigo.length; i++) {
      if (codigo[i] === "(") nivel++;
      else if (codigo[i] === ")") {
        nivel--;
        if (nivel === 0) break;
      }
    }
    out.push({ tipo: m[1], cuerpo: codigo.slice(desde, i + 1) });
  }
  return out;
}

describe("paridad crear/actualizar — el espejo de HubSpot es UNO solo", () => {
  const ESPEJO_EN = "lib/hubspot/sync-projects.ts";

  it("existe un objeto `espejo` y trae TODAS las columnas que se copian de HubSpot", () => {
    const literal = objetoLiteral(codigoDe(ESPEJO_EN), "espejo");
    expect(
      literal,
      `No encontré \`const espejo = { … }\` en ${ESPEJO_EN}. Es el objeto que las dos ramas ` +
        `spreadean; sin él vuelven las dos listas escritas a mano que ya divergieron una vez.`,
    ).not.toBeNull();

    const faltantes = COLUMNAS_ESPEJO.filter(
      (col) => !new RegExp(`(?:^|[\\s{,])${col}\\s*[:,}]`).test(literal!),
    );
    expect(
      faltantes,
      `El objeto \`espejo\` no copia: ${faltantes.join(", ")}. Un campo que HubSpot manda y ` +
        `el espejo no trae queda sin escribirse en NINGUNA de las dos ramas.`,
    ).toEqual([]);
  });

  it("toda escritura de un proyecto ENTERO spreadea el espejo", () => {
    const codigo = codigoDe(ESPEJO_EN);
    const culpables: string[] = [];
    for (const { tipo, cuerpo } of escriturasDeProyecto(codigo)) {
      const data = bloquesData(cuerpo)[0];
      if (!data) continue;
      if (cuerpo.includes("...espejo")) continue;
      // Una escritura parcial (solo `status`, solo el hermano) no necesita el espejo.
      const claves = clavesDePrimerNivel(data);
      const soloParciales = claves.length > 0 && claves.every((k) => CLAVES_DE_ESCRITURA_PARCIAL.has(k));
      if (soloParciales) continue;
      culpables.push(`project.${tipo} con claves [${claves.join(", ")}]`);
    }
    expect(
      culpables,
      `Estas escrituras arman el proyecto a mano en vez de spreadear \`espejo\`:\n` +
        `${culpables.join("\n")}\n\n` +
        `Es exactamente cómo la rama de creación se quedó sin hubspotPipelineId, ` +
        `proyectoInterno y hubspotRelatedProjectIds: dos listas a mano que divergieron. Si de ` +
        `verdad es una escritura parcial, sus únicas claves tienen que estar en ` +
        `CLAVES_DE_ESCRITURA_PARCIAL, con su motivo.`,
    ).toEqual([]);
  });

  it("las dos ramas —crear y actualizar— lo usan", () => {
    const codigo = codigoDe(ESPEJO_EN);
    const conEspejo = escriturasDeProyecto(codigo).filter((e) => e.cuerpo.includes("...espejo"));
    const tipos = new Set(conEspejo.map((e) => e.tipo));
    expect(
      [...tipos].sort(),
      `El espejo tiene que usarse en la rama de CREAR y en la de ACTUALIZAR. Encontré: ` +
        `${[...tipos].join(", ") || "ninguna"}. Los proyectos que NACEN entran por create — ` +
        `si esa rama no lo usa, el bug vuelve exactamente igual y es invisible.`,
    ).toEqual(["create", "update"]);
  });

  it("las asociaciones NO se pisan cuando la lectura de HubSpot falló", () => {
    /* `leerProyectosAsociados` devuelve `null` si no pudo preguntar. Escribir `[]` en ese
       caso desvincula a todos los hermanos del cliente y los vuelve FACTURABLES, en
       silencio y auto-sanándose después — o sea, indiagnosticable. */
    const codigo = codigoDe(ESPEJO_EN);
    expect(
      codigo,
      "`leerProyectosAsociados` tiene que poder devolver null (no pude preguntar ≠ no hay).",
    ).toMatch(/Promise<Map<string,\s*string\[\]>\s*\|\s*null>/);
    expect(
      codigo,
      "`hubspotRelatedProjectIds` tiene que OMITIRSE cuando `asociados` es null, no escribirse vacío.",
    ).toMatch(/\.\.\.\(asociados\s*\?/);
  });
});
