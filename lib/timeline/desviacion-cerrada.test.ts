import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { esAbierta, esCerrada, partitionByEstado } from "./particularidad-state";
import { summarizeParticularidades } from "./particularidades-summary";
import { esCompromisoPendiente } from "./particularidad-to-task";
import { findDuplicateGroups } from "./particularidad-identity";

/**
 * lib/timeline/desviacion-cerrada.test.ts — CERRAR NO DEVUELVE CALENDARIO.
 *
 * ── LA DECISIÓN QUE ESTE ARCHIVO PROTEGE ─────────────────────────────────────
 * Una desviación cerrada NO deja de haber ocurrido. Un atraso de 3 semanas que se resolvió movió
 * el plan 3 semanas igual: el Gantt ya está corrido y cerrarlo no lo devuelve. Lo que se apaga es
 * la ACCIÓN — dejar de perseguir el compromiso, dejar de pedir las semanas que faltan.
 *
 * La lectura equivocada es tentadora y se lee como coherencia: «si está resuelta, que no cuente».
 * Aplicada, produce una publicación al cliente que dice «el plan se movió 3 semanas» con el Gantt
 * al lado corrido 8, y si se cierran todas, el cliente pierde la única frase donde ve la fecha de
 * cierre nueva. El número mentiría hacia abajo, que es la peor dirección para un documento que el
 * cliente archiva.
 *
 * ── Y EL OTRO MODO DE FALLA, QUE ES MUDO ────────────────────────────────────
 * Que el filtro exista y el DATO no llegue. `estado` se lee en cuatro funciones puras, pero si el
 * `select` de Prisma no lo trae, llega `undefined`, se lee como abierta —fail-open, a propósito,
 * por los snapshots viejos— y cerrar deja de apagar nada. Cero errores, cero tests rojos, y el
 * botón que el CSE aprieta no hace absolutamente nada. Por eso la mitad de abajo es un escaneo.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const atraso = (id: string, semanas: number, estado?: string) => ({
  id,
  kind: "ATRASO",
  title: `Atraso ${id}`,
  party: "CLIENTE",
  weeksImpact: semanas,
  ...(estado ? { estado } : {}),
});

describe("los dos ejes se preguntan por separado", () => {
  it("ABIERTA, CERRADA y el campo ausente", () => {
    expect(esAbierta({ estado: "ABIERTA" })).toBe(true);
    expect(esAbierta({ estado: "CERRADA" })).toBe(false);
    expect(esCerrada({ estado: "CERRADA" })).toBe(true);
    expect(esCerrada({ estado: "ABIERTA" })).toBe(false);
  });

  it("⚠ el campo AUSENTE cuenta como abierta (los snapshots viejos)", () => {
    /* La columna es NOT NULL con default, así que la BASE nunca devuelve nulo. Lo que llega sin
       el campo son los snapshots publicados antes de este cambio, que se leen tal cual quedaron
       congelados: tratarlos como cerrados borraría la bitácora de todo cronograma ya entregado. */
    expect(esAbierta({})).toBe(true);
    expect(esAbierta({ estado: null })).toBe(true);
    expect(esCerrada({})).toBe(false);
  });

  it("la partición preserva el orden dentro de cada grupo", () => {
    const r = partitionByEstado([
      atraso("a", 1),
      atraso("b", 1, "CERRADA"),
      atraso("c", 1),
      atraso("d", 1, "CERRADA"),
    ]);
    expect(r.abiertas.map((p) => p.id)).toEqual(["a", "c"]);
    expect(r.cerradas.map((p) => p.id)).toEqual(["b", "d"]);
  });
});

describe("⛔ cerrar NO cambia las semanas — es EL punto de la tanda", () => {
  it("un atraso cerrado sigue sumando al corrimiento", () => {
    /* Si esto se pone en verde con el número más chico, alguien «arregló» el filtro para que las
       cerradas no cuenten. Eso hace que el total contradiga al Gantt que está justo arriba. */
    const abierto = summarizeParticularidades([atraso("a", 3), atraso("b", 5)]);
    const cerrado = summarizeParticularidades([atraso("a", 3, "CERRADA"), atraso("b", 5)]);
    expect(cerrado.totalWeeks).toBe(8);
    expect(cerrado.totalWeeks).toBe(abierto.totalWeeks);
  });

  it("ni la atribución por responsable", () => {
    const s = summarizeParticularidades([atraso("a", 3, "CERRADA")]);
    expect(s.byParty.CLIENTE).toBe(3);
  });

  it("ni el conteo de la bitácora", () => {
    expect(summarizeParticularidades([atraso("a", 3, "CERRADA")]).count).toBe(1);
  });

  it("⭐ lo único que se mueve es cuántas siguen VIGENTES", () => {
    const s = summarizeParticularidades([
      atraso("a", 3, "CERRADA"),
      atraso("b", 5),
      atraso("c", 2, "CERRADA"),
    ]);
    expect(s.abiertas).toBe(1);
    expect(s.count).toBe(3);
    expect(s.totalWeeks).toBe(10);
  });

  it("y con todas cerradas el total sigue siendo el mismo", () => {
    /* El caso que hay que probar de punta a punta y no solo con una cerrada: si el total cayera
       a cero, el bloque «qué cambió en el plan» dejaría de renderizarse entero y el cliente se
       quedaría con un Gantt corrido, sin explicación y sin la fecha de cierre nueva. */
    const s = summarizeParticularidades([atraso("a", 3, "CERRADA"), atraso("b", 5, "CERRADA")]);
    expect(s.totalWeeks).toBe(8);
    expect(s.abiertas).toBe(0);
  });
});

describe("⭐ lo que SÍ se apaga: la acción pendiente", () => {
  it("un compromiso cerrado deja de ser «un compromiso que nadie persigue»", () => {
    const vivo = { kind: "COMPROMISO", convertedTaskId: null, estado: "ABIERTA" };
    expect(esCompromisoPendiente(vivo)).toBe(true);
    expect(esCompromisoPendiente({ ...vivo, estado: "CERRADA" })).toBe(false);
  });

  it("⚠ el estado vive DENTRO del predicado compartido, no en cada caller", () => {
    /* El contador del panel y el grupo al que lleva su botón tienen que dar el MISMO número. Si
       el filtro se aplicara afuera, uno se acordaría y el otro no — y el botón llevaría a un
       grupo vacío. Lo afirma el propio docblock de la función. */
    const src = sinComentarios("lib/timeline/particularidad-to-task.ts");
    const i = src.indexOf("export function esCompromisoPendiente");
    expect(src.slice(i, i + 500), "el predicado dejó de mirar el estado").toContain("esAbierta(p)");
  });

  it("uno ya convertido en tarea sigue sin contar, cerrado o no", () => {
    expect(esCompromisoPendiente({ kind: "COMPROMISO", convertedTaskId: "t1" })).toBe(false);
    expect(
      esCompromisoPendiente({ kind: "COMPROMISO", convertedTaskId: "t1", estado: "CERRADA" }),
    ).toBe(false);
  });

  it("un ATRASO cerrado deja de pedir sus semanas", () => {
    const src = sinComentarios("lib/timeline/project-actions-input.ts");
    const i = src.indexOf("sinCuantificar:");
    expect(src.slice(i, i + 220), "sinCuantificar volvió a contar las cerradas").toContain(
      "esAbierta(p)",
    );
  });
});

describe("⛔ historia y presente no se fusionan", () => {
  const conTitulo = (id: string, title: string, estado?: string) => ({
    id,
    kind: "ATRASO",
    title,
    ...(estado ? { estado } : {}),
  });

  it("una cerrada y su gemela vigente NO son un grupo de repetidas", () => {
    /* Un hecho que se cerró y volvió a pasar deja dos filas casi idénticas, y eso es la historia,
       no un error de carga. Agruparlas hace dos daños: la pantalla le pide al CSE que fusione
       historia con presente, y el script de saneo —que elige ganadora por «más semanas → tiene
       cita»— suele quedarse con la CERRADA y BORRAR la vigente. */
    const g = findDuplicateGroups([
      conTitulo("vieja", "Atraso por migracion de licencia pendiente", "CERRADA"),
      conTitulo("nueva", "Atraso por migracion de licencia pendiente"),
    ]);
    expect(g).toEqual([]);
  });

  it("pero dos ABIERTAS del mismo hecho siguen siendo repetidas", () => {
    /* El corte no puede apagar la detección que ya existía: ése era su trabajo original. */
    const g = findDuplicateGroups([
      conTitulo("a", "Atraso por migracion de licencia pendiente"),
      conTitulo("b", "Atraso por migracion de licencia pendiente"),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("y dos CERRADAS entre sí también", () => {
    const g = findDuplicateGroups([
      conTitulo("a", "Atraso por migracion de licencia pendiente", "CERRADA"),
      conTitulo("b", "Atraso por migracion de licencia pendiente", "CERRADA"),
    ]);
    expect(g).toHaveLength(1);
  });
});

describe("⭐ el dato LLEGA — si no, todo lo de arriba es decorativo", () => {
  const LECTURAS: Array<[string, string]> = [
    ["lib/timeline/project-actions-loader.ts", "la bandeja de cartera y el panel «qué hacer acá»"],
    ["app/api/projects/[projectId]/timeline/route.ts", "el GET del cronograma que ve el CSE"],
  ];

  /**
   * Los bloques `particularidades: { … }` con llaves BALANCEADAS.
   *
   * ⚠ Un `indexOf` pelado no sirve y lo cazó correr esto por primera vez: el GET del cronograma
   * declara arriba un tipo `particularidades: ParticularidadDTO[]`, así que el ancla caía ahí y
   * el escaneo miraba una porción del archivo donde ningún `select` podía estar.
   */
  const bloquesDeParticularidades = (src: string): string[] => {
    const out: string[] = [];
    const re = /particularidades:\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      let i = m.index + m[0].length;
      let nivel = 1;
      const desde = i;
      while (i < src.length && nivel > 0) {
        if (src[i] === "{") nivel++;
        else if (src[i] === "}") nivel--;
        i++;
      }
      out.push(src.slice(desde, i));
    }
    return out;
  };

  it.each(LECTURAS)("%s trae `estado` en su select", (archivo) => {
    /* EL modo de falla mudo: el filtro está escrito, el `select` no lo trae, llega `undefined`,
       se lee como abierta (fail-open a propósito por los snapshots) y cerrar no apaga nada.
       Ni un error, ni un test rojo — el botón simplemente no hace nada. */
    const bloques = bloquesDeParticularidades(sinComentarios(archivo)).filter((b) =>
      b.includes("select:"),
    );
    expect(bloques.length, `${archivo} dejó de leer particularidades con un select`).toBeGreaterThan(
      0,
    );
    for (const b of bloques) {
      expect(b, `${archivo}: un select de particularidades perdió \`estado\``).toContain(
        "estado: true",
      );
    }
  });
});

describe("la migración no puede dejar una sola fila sin estado", () => {
  const SQL = "scripts/sql/2026-08-16-particularidad-estado.sql";

  it("la columna nace NOT NULL con default", () => {
    /* Nullable dejaría el 100% del corpus en NULL el día del deploy, y `estado = 'ABIERTA'` no
       matchea NULL en SQL: ninguna fila legacy cruzaría al cliente, el PDF se vaciaría, y el
       agente dejaría de ver lo ya registrado y lo re-propondría. Con NOT NULL no existe el caso
       raro que alguien se pueda olvidar. */
    const sql = leer(SQL);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "estado"[\s\S]{0,80}NOT NULL DEFAULT 'ABIERTA'/);
  });

  it("y el enum se crea sin reventar si ya existe", () => {
    const sql = leer(SQL);
    expect(sql).toContain('CREATE TYPE "ParticularidadEstado"');
    expect(sql, "re-aplicar el .sql tiene que ser inofensivo").toContain("duplicate_object");
  });

  it("el schema declara el campo NO nullable", () => {
    const schema = leer("prisma/schema.prisma");
    expect(schema).toMatch(/estado\s+ParticularidadEstado\s+@default\(ABIERTA\)/);
    expect(schema, "el estado se volvió opcional en el schema").not.toMatch(
      /estado\s+ParticularidadEstado\?/,
    );
  });
});
