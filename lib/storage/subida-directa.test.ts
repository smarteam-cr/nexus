import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/storage/subida-directa.test.ts — ⛔ LOS ARCHIVOS NO PASAN POR EL VPS.
 *
 * El nginx del VPS corta todo cuerpo de más de 1 MB (413, medido contra producción el 2026-09-28).
 * La decisión de Elías fue no tocar nginx —ese VPS es de todos los proyectos de Smarteam— y
 * estandarizar: toda subida va del navegador DIRECTO a Supabase (lib/storage/subida-directa.ts).
 *
 * El modo de falla es de OMISIÓN: alguien escribe una ruta nueva con `req.formData()` y un
 * `<input type=file>`, anda con el archivo de prueba de 200 KB y se rompe con el primer PDF real.
 * Por eso esto DESCUBRE las rutas, no las transcribe.
 */

const RAIZ = process.cwd();

/**
 * Las que siguen recibiendo el archivo en el cuerpo, con su motivo. Son todas de logos y fotos con
 * tope propio MUY por debajo de 1 MB, así que el corte del VPS no las alcanza. Ampliar esta lista
 * es una decisión: el tope de la ruta tiene que quedar por debajo de 1 MB.
 */
const EXCEPCIONES: Record<string, string> = {
  "app/api/clients/[id]/logo/route.ts": "logo del cliente, tope 300 KB (MAX_LOGO_SIZE)",
  "app/api/system/brand-logos/[brand]/route.ts": "logos de marca, tope 300 KB (MAX_LOGO_SIZE)",
  "app/api/system/smarteam-logo/route.ts": "logo de Smarteam, tope 300 KB (MAX_LOGO_SIZE)",
  "app/api/team/[id]/photo/route.ts": "foto del equipo, tope 1 MB (MAX_PHOTO_SIZE) — el borde, se muestra a 140 px",
};

function rutas(dir: string): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (e.name === "route.ts") out.push(path.relative(RAIZ, p).split(path.sep).join("/"));
    }
  };
  rec(path.join(RAIZ, dir));
  return out.sort();
}

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("⛔ ningún archivo sube a través del VPS", () => {
  const todas = rutas("app");

  it("el escaneo encuentra el árbol", () => {
    expect(todas.length).toBeGreaterThan(100);
  });

  it("ninguna ruta lee un archivo del cuerpo, salvo las excepciones declaradas", () => {
    const ofensoras = todas.filter((r) => {
      const src = sinComentarios(fs.readFileSync(path.join(RAIZ, r), "utf8"));
      return /\.formData\(\)/.test(src) && !EXCEPCIONES[r];
    });
    expect(
      ofensoras,
      "Estas rutas reciben el archivo en el cuerpo: el nginx del VPS lo corta arriba de 1 MB. Usá " +
        "preparar/confirmar con lib/storage/subida-directa.ts (el navegador sube con lib/storage/subir-directo.ts).",
    ).toEqual([]);
  });

  it("las excepciones siguen existiendo y siguen teniendo tope por debajo de 1 MB", () => {
    for (const r of Object.keys(EXCEPCIONES)) {
      const src = fs.readFileSync(path.join(RAIZ, r), "utf8");
      expect(/MAX_LOGO_SIZE|MAX_PHOTO_SIZE/.test(src), `${r} ya no tiene su tope chico: sacala de EXCEPCIONES`).toBe(true);
    }
    const topes = fs.readFileSync(path.join(RAIZ, "lib/storage/public-assets.ts"), "utf8");
    expect(topes).toContain("export const MAX_LOGO_SIZE = 300 * 1024;");
    expect(topes).toContain("export const MAX_PHOTO_SIZE = 1024 * 1024;");
  });

  it("el confirmar valida lo REAL antes de registrar o devolver una URL", () => {
    const comun = fs.readFileSync(path.join(RAIZ, "lib/storage/subida-directa.ts"), "utf8");
    expect(comun, "validarSubido tiene que borrar lo que no cumple").toMatch(/borrarSubido\(almacen, path\)/);
    for (const f of ["lib/documents/subida-de-documento.ts", "lib/storage/subida-de-imagen.ts"]) {
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      expect(src, `${f}: el confirmar no revisa que el path sea de su carpeta`).toContain("startsWith(`${carpeta}/`)");
      expect(src, `${f}: el confirmar no valida el objeto subido`).toContain("validarSubido(");
    }
  });

  it("el navegador sube con el permiso y nunca con una clave", () => {
    const src = fs.readFileSync(path.join(RAIZ, "lib/storage/subir-directo.ts"), "utf8");
    expect(src).toContain('method: "PUT"');
    expect(/apikey|authorization|ANON_KEY|SECRET/i.test(sinComentarios(src)), "el PUT no lleva claves: el permiso ES la llave").toBe(false);
  });
});

describe("el confirmar lleva el nombre original del archivo", () => {
  /* Visto en la auditoría previa al push (2026-09-28): el confirmar iba sin `nombre`. El import de
     cobranza lo exige (extensión .csv/.xlsx) y respondía 415 SIEMPRE, dejando el archivo en el bucket;
     los documentos quedaban con el título «saneado». La edición que la pone en rojo: sacar
     `nombre: archivo.name` del cuerpo del confirmar. */
  const fetchOriginal = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it("preparar y confirmar mandan el mismo nombre, con tildes y espacios", async () => {
    const cuerpos: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("https://almacen.test/")) return new Response("{}", { status: 200 });
      const cuerpo = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      cuerpos.push(cuerpo);
      if (cuerpo.accion === "preparar") {
        return new Response(JSON.stringify({ signedUrl: "https://almacen.test/subir", path: "imports/1_x.xlsx" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const { subirDirecto } = await import("./subir-directo");
    const archivo = new File(["contenido"], "Libro de Alex — Diagnóstico Q3.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const r = await subirDirecto({ ruta: "/api/cobranza/import", archivo });
    expect(r.ok).toBe(true);
    const confirmar = cuerpos.find((c) => c.accion === "confirmar");
    expect(confirmar, "no hubo confirmar").toBeTruthy();
    expect(confirmar?.path).toBe("imports/1_x.xlsx");
    expect(confirmar?.nombre, "el confirmar no lleva el nombre original").toBe("Libro de Alex — Diagnóstico Q3.xlsx");
  });
});

