import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { hayPendienteDeSubir, huellaDeLoComunicable } from "./pendiente-de-subir";

/**
 * lib/timeline/pendiente-de-subir.test.ts — LA PANTALLA CUYO ÚNICO TRABAJO ES AVISAR.
 *
 * El cliente no lee la base: lee un SNAPSHOT congelado al «Subir al cliente». Lo único que le
 * dice al CSE «esto todavía no lo vio» es el renglón «Listo para subir» del Gantt — y comparaba
 * SUMAS DE SEMANAS, que es ciego a casi todo:
 *
 *  · dar por resuelta una desviación no mueve ni una semana (a propósito: el plan ya se corrió),
 *    o sea que el cambio más nuevo del sistema era justo el invisible;
 *  · corregir un título o una atribución tampoco;
 *  · y dos cambios que se compensan se anulaban entre sí.
 *
 * En los tres casos la pantalla decía «todo comunicado» con el cliente leyendo otra cosa. Sin
 * error, sin log, sin cartel: la falla más cara posible para algo cuyo único trabajo es avisar.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const atraso = (title: string, semanas: number, estado?: string) => ({
  kind: "ATRASO",
  title,
  weeksImpact: semanas,
  party: "CLIENTE",
  ...(estado ? { estado } : {}),
});

describe("⭐ lo que la suma de semanas NO veía", () => {
  it("cerrar una desviación enciende el aviso, aunque las semanas no cambien", () => {
    /* ES EL PUNTO. `totalWeeks` es idéntico antes y después de cerrar —por diseño—, así que con
       la comparación vieja el CSE cerraba y la pantalla seguía diciendo «todo comunicado». */
    const publicadas = [atraso("Atraso por licencia", 3)];
    const visibles = [atraso("Atraso por licencia", 3, "CERRADA")];
    expect(hayPendienteDeSubir(visibles, publicadas)).toBe(true);
  });

  it("corregir el título también", () => {
    expect(
      hayPendienteDeSubir([atraso("Atraso por la licencia", 3)], [atraso("Atraso por licencia", 3)]),
    ).toBe(true);
  });

  it("y dos cambios que se compensan dejan de anularse", () => {
    /* Sumas iguales (5 y 5), contenido distinto. La comparación vieja daba «sin cambios». */
    const publicadas = [atraso("A", 2), atraso("B", 3)];
    const visibles = [atraso("A", 4), atraso("B", 1)];
    expect(hayPendienteDeSubir(visibles, publicadas)).toBe(true);
  });
});

describe("⛔ y lo que NO tiene que encender el aviso", () => {
  it("⚠ un snapshot VIEJO sin el campo `estado` no cuenta como cambio", () => {
    /* El falso positivo del día del deploy: los snapshots congelados antes de que el estado
       existiera no traen el campo. Sin normalizar, TODO proyecto publicado habría amanecido
       diciendo «falta subir» sin que nadie tocara nada — y un aviso que grita siempre se ignora,
       que es exactamente cómo se pierde el caso que importa. */
    const publicadas = [atraso("Atraso por licencia", 3)]; // sin `estado`
    const visibles = [atraso("Atraso por licencia", 3, "ABIERTA")];
    expect(hayPendienteDeSubir(visibles, publicadas)).toBe(false);
  });

  it("reordenar la lista tampoco", () => {
    const a = [atraso("A", 1), atraso("B", 2)];
    const b = [atraso("B", 2), atraso("A", 1)];
    expect(hayPendienteDeSubir(a, b)).toBe(false);
  });

  it("ni los espacios de más en el título", () => {
    expect(hayPendienteDeSubir([atraso("  Atraso  ", 1)], [atraso("Atraso", 1)])).toBe(false);
  });

  it("las dos listas vacías son iguales", () => {
    expect(hayPendienteDeSubir([], [])).toBe(false);
    expect(huellaDeLoComunicable([])).toBe("");
  });

  it("pero agregar una a una lista vacía SÍ enciende", () => {
    expect(hayPendienteDeSubir([atraso("A", 1)], [])).toBe(true);
    expect(hayPendienteDeSubir([], [atraso("A", 1)])).toBe(true);
  });
});

describe("⭐ el Gantt USA el helper — si no, todo lo de arriba es decorativo", () => {
  const GANTT = "components/canvas/TimelineGantt.tsx";

  it("la señal sale del helper, no de comparar sumas", () => {
    const src = sinComentarios(GANTT);
    expect(src, "el Gantt dejó de usar el helper").toContain("hayPendienteDeSubir(");
    expect(src, "volvió la comparación por suma de semanas").not.toMatch(
      /const\s+\w*[pP]endienteDeSubir\s*=\s*listo\s*!==\s*comunicado/,
    );
  });

  it("⚠ y lo alimenta con las VISIBLES, no con todas", () => {
    /* Comparar todas contra las publicadas encendería el aviso por filas internas que el cliente
       nunca va a ver — el aviso se volvería permanente y por lo tanto inútil. */
    const src = sinComentarios(GANTT);
    const i = src.indexOf("hayPendienteDeSubir(");
    expect(src.slice(i, i + 200)).toContain("p.visibleExternal");
  });
});

describe("⛔ el estado CRUZA al cliente, y la cerrada NO se esconde", () => {
  const CHOKE = "lib/external/timeline-view.ts";
  const CLIENTE = "components/canvas/TimelineSection.tsx";

  it("el chokepoint trae el estado", () => {
    const src = sinComentarios(CHOKE);
    const i = src.indexOf("prisma.particularidad.findMany");
    expect(src.slice(i, i + 700), "el estado dejó de cruzar: no se puede marcar resuelta").toContain(
      "estado: true",
    );
  });

  it("⚠ pero su `where` NO filtra por estado", () => {
    /* Filtrarlas era la lectura intuitiva del plan, y produce un documento que miente hacia
       abajo: el Gantt sigue corrido y la frase de al lado cuenta menos semanas. Peor, si se
       cierran todas el bloque entero deja de renderizarse y el cliente pierde la fecha de cierre
       nueva. Se comunican marcadas. */
    const src = sinComentarios(CHOKE);
    const i = src.indexOf("where: { timelineId: tl.id");
    expect(i, "cambió el where del chokepoint").toBeGreaterThan(-1);
    expect(src.slice(i, i + 120), "el chokepoint empezó a esconder las cerradas").not.toContain(
      "estado",
    );
  });

  it("y la vista del cliente la marca «Resuelta»", () => {
    const src = leer(CLIENTE);
    expect(src).toContain('pt.estado === "CERRADA"');
    expect(src).toContain("Resuelta");
  });
});
