import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ATOMOS_POR_CRITERIO, type ProyectoParaFiltro } from "@/lib/projects/scope";
import { SENTINEL_SERVICE_TYPE, pipelineByKey } from "@/lib/projects/kind";
import {
  resumirProyectos,
  estaEnEjecucion,
  tieneTrabajoInterno,
  tituloDeProyectos,
} from "./resumen-proyectos";

/**
 * lib/clients/resumen-proyectos.test.ts — EL FILTRO NUEVO NO SE APAGA SOLO.
 *
 * El modo de falla que estas guardas cazan: **una píldora que dice 0 es indistinguible de una
 * píldora rota.** La pantalla se ve perfecta, `tsc` compila, el build pasa, y el pedido queda
 * desactivado sin un solo error. Ningún invariante (INV1–INV13) mira `proyectoInterno`.
 */

const RAIZ = process.cwd();

/**
 * El fuente SIN comentarios.
 *
 * ⚠ No es cosmético: la prosa que explica cada uno de estos bugs NOMBRA el símbolo que la
 * guarda vigila (`_count`, las 7 columnas, `where`). Escaneando el archivo crudo, las guardas
 * pasan en verde con el bug ya reintroducido — ya me pasó cuatro veces esta semana.
 */
function fuenteSinComentarios(rel: string): string {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
}

/** Un proyecto de prueba con los 7 campos que exige `ProyectoParaFiltro`. */
function proyecto(over: Partial<ProyectoParaFiltro> = {}): ProyectoParaFiltro {
  return {
    status: "active",
    serviceType: null,
    hubspotServiceId: "hs-1",
    hubspotPipelineId: pipelineByKey("customer-success").hubspotPipelineId,
    proyectoInterno: false,
    hermanoCsProjectId: null,
    altaEstado: null,
    ...over,
  };
}

describe("el trabajo interno cuenta como proyecto abierto", () => {
  /**
   * ── LA GUARDA DE LA TENSIÓN CENTRAL ────────────────────────────────────────
   * `DE_CARTERA` incluye el átomo `no-es-interno`. Si el resumen se calculara con ESE
   * criterio —que es la deriva natural, "que sea el mismo número que el portafolio"— la
   * píldora «Con trabajo interno» daría 0 **por construcción**, Smarteam y SmartAgro
   * caerían en «Sin proyecto abierto», y el filtro que motivó toda esta tanda quedaría
   * apagado sin que nada avise.
   *
   * La edición que la pone en rojo, en `resumen-proyectos.ts`:
   *     -  if (esProyectoClasificable(p)) {
   *     +  if (esProyectoDeCartera(p, cliente)) {   // "alinearlo con el resto de la app"
   * Verificado rompiéndola.
   */
  it("LA guarda: un cliente cuyo único proyecto es interno tiene 1 abierto", () => {
    const r = resumirProyectos([proyecto({ proyectoInterno: true })]);
    expect(r.abiertos, "el trabajo interno dejó de contar como proyecto abierto").toBe(1);
    expect(r.internos, "el trabajo interno dejó de contarse aparte").toBe(1);
    expect(estaEnEjecucion(r)).toBe(true);
    expect(tieneTrabajoInterno(r), "«Con trabajo interno» quedaría en 0 para siempre").toBe(true);
  });

  it("y el criterio elegido es CLASIFICABLE, no el de cartera", () => {
    /* Se afirma sobre la tabla de átomos y no sobre el comportamiento: es lo único que dice
       DÓNDE se rompió. Si alguien agrega `no-es-interno` a CLASIFICABLE (para "limpiar" el
       criterio), el test de arriba también cae, pero éste nombra la causa. */
    expect(
      ATOMOS_POR_CRITERIO.clasificable,
      "CLASIFICABLE cambió de átomos: revisar si el filtro de trabajo interno sigue vivo",
    ).toEqual(["activo", "no-es-sentinel"]);
    expect(ATOMOS_POR_CRITERIO.cartera).toContain("no-es-interno");
  });
});

describe("el contenedor «Información del cliente» no es un proyecto", () => {
  it("no cuenta ni como abierto ni como cerrado", () => {
    /* Hoy `_count` lo cuenta: hay fichas que muestran "1" teniendo cero proyectos. Si contara
       como cerrado, dirían "0 abiertos · 1 cerrado" y parecería que perdieron uno. */
    const r = resumirProyectos([proyecto({ serviceType: SENTINEL_SERVICE_TYPE })]);
    expect(r).toEqual({ abiertos: 0, cerrados: 0, internos: 0 });
  });

  it("un serviceType nulo SÍ es un proyecto de verdad", () => {
    // El bug del encabezado de scope.ts: `not: "__strategy__"` descarta los NULL en SQL.
    expect(resumirProyectos([proyecto({ serviceType: null })]).abiertos).toBe(1);
  });

  it("los pausados y terminados van a cerrados", () => {
    const r = resumirProyectos([
      proyecto({ status: "active" }),
      proyecto({ status: "paused" }),
      proyecto({ status: "completed" }),
      proyecto({ serviceType: SENTINEL_SERVICE_TYPE }),
    ]);
    expect(r).toEqual({ abiertos: 1, cerrados: 2, internos: 0 });
  });
});

describe("el título de la columna dice lo que el número no muestra", () => {
  it("singular y plural, sin «1 abiertos»", () => {
    expect(tituloDeProyectos({ abiertos: 1, cerrados: 1, internos: 1 })).toBe(
      "1 abierto · 1 cerrado · 1 es interno",
    );
    expect(tituloDeProyectos({ abiertos: 3, cerrados: 0, internos: 0 })).toBe("3 abiertos");
    expect(tituloDeProyectos({ abiertos: 0, cerrados: 2, internos: 0 })).toBe(
      "0 abiertos · 2 cerrados",
    );
  });
});

describe("el resumen se calcula sobre TODOS los proyectos del cliente", () => {
  const RUTA = "app/(shell)/clients/ClientsTable.tsx";

  /**
   * ── LA GUARDA DE LA COSTURA ────────────────────────────────────────────────
   * Si alguien le mete un `where` al `select` anidado de `projects` "para aliviar el payload",
   * el resumen se calcula sobre un subconjunto y **las cuatro píldoras mienten a la vez**.
   * Compila, no rompe tipos, y la pantalla se ve perfecta.
   *
   * La edición exacta que la pone en rojo:
   *     projects: { where: { status: "active" }, select: { … } },
   * Verificado rompiéndola.
   */
  it("LA guarda: el select anidado de projects no lleva `where`", () => {
    const src = fuenteSinComentarios(RUTA);
    const i = src.indexOf("projects: {");
    expect(i, "se movió el select anidado de projects; revisar esta guarda").toBeGreaterThan(0);
    const bloque = src.slice(i, src.indexOf("},", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(40);
    expect(
      bloque,
      "el select de projects se acotó: el resumen ahora se calcula sobre un subconjunto y las píldoras mienten",
    ).not.toContain("where");
  });

  it("y trae las 7 columnas que el criterio necesita", () => {
    /* `esProyectoClasificable` hoy solo mira dos, pero el tipo exige las siete: el día que un
       átomo nuevo entre a CLASIFICABLE, el criterio leería `undefined` y devolvería cualquier
       cosa en silencio. Se afirma sobre el CÓDIGO, no sobre los comentarios: la prosa de
       arriba nombra varias de estas columnas. */
    const src = fuenteSinComentarios(RUTA);
    const i = src.indexOf("projects: {");
    const bloque = src.slice(i, src.indexOf("},", i));
    for (const col of [
      "status",
      "serviceType",
      "hubspotServiceId",
      "hubspotPipelineId",
      "proyectoInterno",
      "hermanoCsProjectId",
      "altaEstado",
    ]) {
      expect(bloque, `el select dejó de traer ${col}`).toContain(col);
    }
  });

  it("y la columna «Proyectos» ya no sale de _count", () => {
    /* `_count` cuenta los contenedores sentinel. Con él, la píldora diría «Sin proyecto
       abierto» y la columna de esa misma fila mostraría «1»: la pantalla contradiciéndose a
       sí misma en el mismo renglón. */
    expect(
      fuenteSinComentarios(RUTA),
      "volvió el _count de proyectos, que cuenta los contenedores",
    ).not.toContain("_count");
  });
});
