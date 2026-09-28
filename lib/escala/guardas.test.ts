/**
 * lib/escala/guardas.test.ts — las guardas de la sección de la escala, congeladas.
 *
 *   · Toda ruta de `app/api/escala/` pide usuario interno (los comentarios son del equipo).
 *   · Cambiar el estado y exportar llaman `esResponsable(`: el estado es solo del responsable.
 *   · Ningún id se valida con `.cuid()` (hay filas UUID).
 *   · Los agentes no leen los comentarios: «por ahora, nada de análisis con IA» (Elías).
 *   · El SQL deja las tres tablas cerradas para `anon` (RLS + RESTRICTIVE).
 *   · FUENTE ÚNICA: ningún texto de la escala aparece escrito en el código de la sección. Todo sale
 *     del documento publicado; si alguien pega un criterio en un componente, esto se pone rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./documento/archivos";
import { parsearEscala, todasLasDimensiones, todosLosCriterios } from "./documento/parsear";

const RAIZ = process.cwd();

function archivos(dir: string, filtro: (f: string) => boolean): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(rel, filtro));
    else if (filtro(e.name)) out.push(rel);
  }
  return out;
}

/** Sin comentarios: una regla citada en un comentario no cuenta como código. */
function soloCodigo(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const RUTAS = archivos("app/api/escala", (f) => f === "route.ts");

describe("las rutas de la escala", () => {
  it("existen (si no, el resto pasa por vacío)", () => {
    expect(RUTAS.length).toBeGreaterThanOrEqual(7);
  });

  it.each(RUTAS)("%s pide usuario interno", (rel) => {
    expect(soloCodigo(leer(rel))).toMatch(/guardInternalUser\(\)/);
  });

  it("cambiar el estado y exportar son del responsable", () => {
    for (const rel of ["app/api/escala/comentarios/[id]/estado/route.ts", "app/api/escala/comentarios/exportar/route.ts"]) {
      expect(soloCodigo(leer(rel.replace(/\//g, path.sep))), rel).toMatch(/esResponsable\(/);
    }
  });

  it("ningún id se valida con .cuid()", () => {
    for (const rel of [...RUTAS, ...archivos("lib/escala", (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))]) {
      expect(soloCodigo(leer(rel)), rel).not.toMatch(/\.cuid\(\)/);
    }
  });
});

describe("los agentes no leen los comentarios", () => {
  it("lib/agents, lib/canvas, lib/knowledge y lib/ai no importan lib/escala/comentarios", () => {
    for (const dir of ["lib/agents", "lib/canvas", "lib/knowledge", "lib/ai"]) {
      for (const rel of archivos(dir, (f) => f.endsWith(".ts") || f.endsWith(".tsx"))) {
        expect(leer(rel), rel).not.toMatch(/escala\/comentarios|escalaComentario/);
      }
    }
  });
});

describe("el SQL deja todo cerrado para anon", () => {
  const sql = leer(path.join("scripts", "sql", "2026-09-27-escala-lector-y-comentarios.sql"));
  const tablas = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]);

  it("crea las tres tablas", () => {
    expect(tablas).toEqual(["EscalaDocumento", "EscalaComentario", "EscalaRespuesta"]);
  });

  it.each(tablas)("%s: RLS encendido y política RESTRICTIVE que niega todo", (t) => {
    expect(sql).toContain(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
    expect(sql).toContain(`CREATE POLICY deny_all_non_superuser ON "${t}" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);`);
  });

  it("y prisma/policies.sql las espeja", () => {
    const politicas = leer(path.join("prisma", "policies.sql"));
    for (const t of tablas) expect(politicas, t).toContain(`CREATE POLICY deny_all_non_superuser ON "${t}"`);
  });
});

describe("fuente única: la escala no está escrita en el código", () => {
  const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
  // Textos largos y propios de la escala: criterios, descripciones de nivel, preguntas y costos, y
  // la prosa que la pantalla muestra (reglas de lectura, perfil, asignación, dependencias).
  const perfil = escala.perfilDeNegocio;
  const textos = [
    ...todosLosCriterios(escala).map((c) => c.texto),
    ...todasLasDimensiones(escala).flatMap((d) => [d.pregunta, d.costoDeQuedarse, ...d.niveles.map((n) => n.descripcion)]),
    ...Object.values(escala.riesgos),
    ...(escala.explicaciones.evaluacion?.split("\n\n") ?? []),
    ...escala.casosDeLectura.map((b) => b.texto),
    ...escala.automatizacion.map((b) => b.texto),
    ...escala.asignacion.map((r) => r.texto),
    ...escala.dependencias.map((d) => d.porQue),
    ...[perfil.introduccion ?? "", ...perfil.notas],
    ...[perfil.cierre, perfil.despues].flatMap((p) => p?.opciones.map((o) => o.definicion) ?? []),
  ].filter((t) => t.length >= 40);

  const codigo = [
    ...archivos("lib/escala", (f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts") && !f.includes(".fixture.")),
    ...archivos("components/escala", (f) => /\.tsx?$/.test(f)),
    ...archivos("app/(shell)/escala", (f) => /\.tsx?$/.test(f)),
    ...archivos("app/api/escala", (f) => /\.tsx?$/.test(f)),
  ];

  it("hay textos y hay código que revisar", () => {
    expect(textos.length).toBeGreaterThan(300);
    expect(codigo.length).toBeGreaterThan(10);
  });

  it("ningún archivo de la sección contiene un texto de la escala", () => {
    const pegados: string[] = [];
    for (const rel of codigo) {
      const fuente = leer(rel);
      for (const t of textos) if (fuente.includes(t)) pegados.push(`${rel}: «${t.slice(0, 60)}…»`);
    }
    expect(pegados).toEqual([]);
  });
});
