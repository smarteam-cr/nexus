/**
 * lib/seguimiento/hechos-internos.test.ts — GUARDA PERMANENTE de «los hechos de las reuniones son INTERNOS» (memoria de
 * la cuenta, etapa 6; DECISIONS «Hechos, enrutador y novedades»).
 *
 * Un hecho trae la cita literal de una reunión, y en una reunión se dicen precios, lo que el equipo piensa del cliente y
 * lo que nadie revisó. Nada de lo que ve el cliente puede leerlos sin pasar por una persona: ni las páginas externas,
 * ni el PDF, ni el motor de los documentos (que renderiza en /external y en el PDF), ni el correo al cliente. Escanea
 * el árbol REAL (el molde es lib/canvas/exploracion-internal.test.ts). Si algún día un documento del cliente necesita un
 * hecho, entra como una novedad que una persona aplica con el chat, no leyendo la tabla.
 *
 * Y una sola mano escribe la tabla: lib/seguimiento/hechos-server.ts (las novedades deciden un destino con su
 * `decidirDestinoDeHecho`).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function walk(dir: string, acc: string[] = []): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".next")) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, acc);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(rel);
  }
  return acc;
}

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const soloCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** Lo que ve el cliente, directo o por el motor de los documentos. */
const LO_QUE_VE_EL_CLIENTE = ["app/external", "app/api/external", "lib/external", "app/print", "components/landing", "lib/landing"];

/** Leer un hecho: la tabla (por Prisma o en SQL) o los módulos que la leen. */
const LEE_HECHOS = /\bhechoDeReunion\b|\bHechoDeReunion\b|@\/lib\/seguimiento\/hechos|@\/lib\/seguimiento\/novedades-server|@\/lib\/cs\/alertas-de-la-lectura/;

describe("⛔ nada de lo que ve el cliente lee los hechos de las reuniones", () => {
  it("el escaneo mira algo (si no, se aprueba solo)", () => {
    const n = LO_QUE_VE_EL_CLIENTE.flatMap((d) => walk(d)).length;
    expect(n).toBeGreaterThan(20);
  });

  for (const dir of LO_QUE_VE_EL_CLIENTE) {
    it(`${dir}/** no nombra la tabla ni importa los módulos de los hechos`, () => {
      const ofensores = walk(dir).filter((f) => LEE_HECHOS.test(soloCodigo(leer(f))));
      expect(ofensores, `Estos archivos de lo que ve el cliente leen hechos: ${ofensores.join(", ")}`).toEqual([]);
    });
  }

  it("el correo al cliente (lo arma la IA y lo manda una persona) tampoco", () => {
    const correo = walk("lib/exploraciones").filter((f) => f.includes("correo-de-seguimiento"));
    expect(correo.length).toBeGreaterThan(0);
    const ofensores = correo.filter((f) => LEE_HECHOS.test(soloCodigo(leer(f))));
    expect(ofensores).toEqual([]);
  });
});

describe("⛔ una sola mano escribe los hechos", () => {
  const ESCRIBE = /\.hechoDeReunion\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\(/;
  /**
   * Los que pueden escribir. La fusión de dos fichas los muda con el delegado genérico (no lo nombra), así que no está.
   * Si las novedades (lib/seguimiento/novedades-server.ts) llegan a escribir, que sea por `decidirDestinoDeHecho`.
   */
  const ESCRITORES = new Set(["lib/seguimiento/hechos-server.ts"]);

  it("solo lib/seguimiento/hechos-server.ts escribe la tabla", () => {
    const todos = ["lib", "app", "components", "scripts"].flatMap((d) => walk(d));
    const escriben = todos.filter((f) => ESCRIBE.test(soloCodigo(leer(f))));
    expect(escriben.filter((f) => !ESCRITORES.has(f)), "Un escritor nuevo de HechoDeReunion: pásalo por lib/seguimiento/hechos-server.ts").toEqual([]);
    expect(escriben).toContain("lib/seguimiento/hechos-server.ts");
  });

  it("los hechos entran a la memoria solo en el alcance interno", () => {
    const consumidores = soloCodigo(leer("lib/memoria/consumidores.ts"));
    expect(consumidores).toContain("hechos: interno,");
    const armar = soloCodigo(leer("lib/memoria/armar.ts"));
    expect(armar).toContain("q.hechos ? recortarAlTope(parteDeHechos(");
  });

  it("la lectura de hechos no lee reuniones por su cuenta y respeta la bandera y el SQL", () => {
    const src = soloCodigo(leer("lib/seguimiento/hechos-server.ts"));
    expect(src).not.toMatch(/\.(firefliesSession|sessionProject)\./);
    expect(src).toContain("textoParaHechos(sessionId, clientId)");
    expect(src).toContain("if (!hechosPrendidos(process.env)) return { estado: \"apagado\" };");
    expect(src).toContain("if (!(await hechosDisponible())) return { estado: \"sin_sql\" };");
    // Toda llamada a Claude queda atribuida a la reunión y al agente.
    expect(src).toContain("conLaReunion(sessionId, () => leer(sessionId, opts))");
    expect(src).toContain("agentSlug: AGENT_SLUG_DE_HECHOS");
  });
});
