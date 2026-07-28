/**
 * lib/print/doc-types.test.ts — que el registro y la maquinaria no se separen.
 *
 * El registro es la fuente de verdad de qué se puede imprimir, pero por sí solo no imprime
 * nada: necesita un adaptador del lado cliente, una ruta que resuelva y un bypass en el
 * middleware. Prender `ready` sin una de las tres da un 404 o una hoja en blanco, que es
 * exactamente el modo de falla que este plan vino a cerrar. Acá se cruzan las cuatro piezas.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PRINT_DOC_TYPES, printDocType, printDocForPiece } from "./doc-types";
import { PIECES } from "@/lib/pieces/registry";

const raiz = path.resolve(__dirname, "../..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

/**
 * Quita comentarios: un comentario que NOMBRA un tipo no es cablearlo.
 *
 * Escanea de izquierda a derecha en vez de usar dos `replace`, porque las dos formas
 * ingenuas fallan y ya fallaron acá: un `// … /api/auth/hubspot/*` abre un bloque falso que
 * se come el archivo hasta el próximo `*&#47;` (así se rompió la comprobación del middleware),
 * y un `"https://…"` dentro de un string no es el inicio de un comentario.
 * Los strings SÍ se conservan: media prueba de este archivo es buscar literales.
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

const listos = PRINT_DOC_TYPES.filter((t) => t.ready);

describe("registro de documentos imprimibles", () => {
  it("no tiene ids ni pieceSlugs repetidos", () => {
    const ids = PRINT_DOC_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const slugs = PRINT_DOC_TYPES.map((t) => t.pieceSlug).filter(Boolean);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("cada pieceSlug existe en el registro de piezas", () => {
    const conocidos = new Set(PIECES.map((p) => p.slug));
    for (const t of PRINT_DOC_TYPES) {
      if (t.pieceSlug) expect(conocidos, `${t.id} → ${t.pieceSlug}`).toContain(t.pieceSlug);
    }
  });

  it("los tipos apagados no resuelven — ni por id ni por pieza", () => {
    for (const t of PRINT_DOC_TYPES.filter((x) => !x.ready)) {
      expect(printDocType(t.id), t.id).toBeNull();
      if (t.pieceSlug) expect(printDocForPiece(t.pieceSlug), t.pieceSlug).toBeNull();
    }
    expect(printDocType("no-existe")).toBeNull();
    expect(printDocType(null)).toBeNull();
    expect(printDocForPiece(undefined)).toBeNull();
  });

  it("todo tipo PRENDIDO tiene adaptador en PrintDocView, y al revés", () => {
    const src = soloCodigo(leer("components/print/PrintDocView.tsx"));
    const bloque = /const ADAPTADORES[\s\S]*?\n};/.exec(src)?.[0] ?? "";
    expect(bloque, "no se encontró el mapa ADAPTADORES").not.toBe("");
    const cableados = new Set(
      [...bloque.matchAll(/^\s*"?([a-z-]+)"?:\s*\{/gm)].map((m) => m[1]),
    );
    // Los dos sentidos: un tipo prendido sin adaptador imprime una hoja en blanco; un
    // adaptador sin tipo prendido es código que nunca corre.
    expect([...cableados].sort()).toEqual(listos.map((t) => t.id).sort());
  });

  it("la ruta y el endpoint existen donde el botón los llama", () => {
    expect(fs.existsSync(path.join(raiz, "app/print/doc/[type]/[id]/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(raiz, "app/api/print/[type]/[id]/export/route.ts"))).toBe(true);
  });

  it("el middleware deja pasar /print/doc/ — sin eso el token no sirve", () => {
    /* Puppeteer navega SIN cookies: si el middleware lo manda a login, el PDF sale con la
       pantalla de ingreso. El prefijo tiene que ser el de la carpeta real. */
    expect(soloCodigo(leer("middleware.ts"))).toContain('"/print/doc/"');
  });

  it("el escaneo mira el CÓDIGO, no los comentarios (meta-guarda)", () => {
    /* Un `/*` dentro de un `//` comentario NO abre un bloque —fue el bug real de la
       comprobación del middleware— y un string sí sobrevive al blanqueo. */
    const mentiroso = ["// ojo con /api/auth/hubspot/*", 'const x = "/print/doc/";'].join("\n");
    expect(soloCodigo(mentiroso)).toContain('"/print/doc/"');
    expect(soloCodigo("/* nada */ const y = 1; // \"/print/doc/\"")).not.toContain("/print/doc/");
  });

  it("la paleta interna es la de los documentos que el cliente no ve", () => {
    // Ancla el criterio, no la lista: si alguien pone Kickoff en gris, este test lo discute.
    const internos = PRINT_DOC_TYPES.filter((t) => t.palette === "internal").map((t) => t.id);
    expect(internos.sort()).toEqual(["exploration", "implementation", "planning"]);
  });
});
