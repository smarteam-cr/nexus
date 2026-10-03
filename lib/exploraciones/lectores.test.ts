/**
 * lib/exploraciones/lectores.test.ts — QUIÉN lee una exploración de venta, y para qué.
 * Correr: `npx vitest run lib/exploraciones/lectores.test.ts --project unit`.
 *
 * La exploración tiene cosas que el cliente nunca puede ver (hipótesis, presupuesto, quién decide,
 * lo que nadie exploró, la apertura a la asesoría). La defensa no es el prompt: es que cada lector
 * use la puerta que corresponde a su destino.
 *   · La PROPUESTA (la ve el cliente) solo por `paraLaPropuesta`, que devuelve el bloque sin lo
 *     interno ni ids de la escala y la posición desde el chequeo: nunca el estado.
 *   · El HANDOFF con `exploracionParaElHandoff`, SIN lo interno: ese agente escribe también lo que
 *     leen los documentos del cliente. Lo interno solo llega a la columna del contexto (pantalla).
 *   · Ningún documento del cliente (kickoff, entrega, diagnóstico…) la lee directo: le llega, si
 *     acaso, por el handoff y con sus listas de siempre.
 *
 * El modo de falla es de OMISIÓN: alguien suma un lector nuevo y no se acuerda. Por eso es un
 * censo: un archivo que importa de lib/exploraciones o toca la tabla y no está declarado acá pone
 * esto en rojo hasta que alguien escriba para qué la lee y por qué puerta.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

type Destino = "ventas" | "propuesta-al-cliente" | "handoff-interno" | "disparo" | "cuestionario-al-cliente";

const CENSO: Record<string, { destino: Destino; motivo: string }> = {
  "app/(shell)/sales/exploraciones/page.tsx": { destino: "ventas", motivo: "La lista de exploraciones." },
  "app/(shell)/sales/exploraciones/[id]/page.tsx": { destino: "ventas", motivo: "El lienzo." },
  "app/api/sales/exploraciones/route.ts": { destino: "ventas", motivo: "Abrir una exploración." },
  "app/api/sales/exploraciones/[id]/route.ts": { destino: "ventas", motivo: "Leer y cambiar el lienzo." },
  "app/api/sales/exploraciones/[id]/agente/route.ts": { destino: "ventas", motivo: "Lanzar y seguir al agente." },
  "app/api/sales/exploraciones/[id]/propuesta/route.ts": { destino: "ventas", motivo: "Armar la propuesta desde el lienzo." },
  "app/api/sales/exploraciones/[id]/documentos/route.ts": { destino: "ventas", motivo: "Sumar a mano una sesión o un documento, y listarlos." },
  "app/api/sales/exploraciones/[id]/documentos/[documentoId]/route.ts": { destino: "ventas", motivo: "Quitar lo que se sumó a mano." },
  "app/api/sales/exploraciones/empresas/route.ts": { destino: "ventas", motivo: "Buscar la empresa." },
  "app/api/sales/exploraciones/sugerencias/route.ts": { destino: "ventas", motivo: "«Llegaron por el test»." },
  "app/api/business-cases/[id]/generate/route.ts": { destino: "propuesta-al-cliente", motivo: "La exploración como fuente de la propuesta y su posición en la escala." },
  "app/api/business-cases/[id]/canvas-sections/[sectionId]/blocks/regenerate/route.ts": {
    destino: "propuesta-al-cliente",
    motivo: "Regenerar la sección de la escala desde el chequeo.",
  },
  "app/api/clients/[id]/analyze/route.ts": { destino: "handoff-interno", motivo: "El bloque de la exploración en el handoff de Customer Success." },
  "app/api/projects/[projectId]/exploracion-de-venta/route.ts": { destino: "handoff-interno", motivo: "La cuarta columna del contexto del handoff." },
  "lib/sessions/post-process.ts": { destino: "disparo", motivo: "Lanza la lectura automática de una reunión; no lee contenido." },
  "lib/cuestionario/escala.ts": {
    destino: "cuestionario-al-cliente",
    motivo: "El cuestionario de escala llega con el nivel ya ubicado marcado, para que la persona lo confirme. Solo niveles.",
  },
};

/** Lo que cada destino puede importar de lib/exploraciones (además de tipos). */
const PUERTAS: Record<Exclude<Destino, "ventas">, { permitidas: RegExp; prohibidas: RegExp }> = {
  "propuesta-al-cliente": {
    permitidas: /\bparaLaPropuesta\b/,
    prohibidas: /exploracionParaLaPropuesta|bloqueParaElHandoff|exploracionParaElHandoff|internoParaElCse|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|\.estado\b/,
  },
  "handoff-interno": {
    permitidas: /exploracionParaElHandoff|exploracionDelProyecto|exploracionParaLaPropuesta/,
    prohibidas: /\.exploracionDeVenta\b/,
  },
  "cuestionario-al-cliente": {
    permitidas: /\bubicacionPreviaDelProyecto\b/,
    prohibidas: /exploracionParaLaPropuesta|bloqueParaElHandoff|exploracionParaElHandoff|internoParaElCse|leerContenido|leerExploracion\b|\.exploracionDeVenta\b|\.estado\b/,
  },
  disparo: {
    permitidas: /leerReunionNueva/,
    prohibidas: /exploracionParaElHandoff|bloqueParaLaPropuesta|\.exploracionDeVenta\b/,
  },
};

function archivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".next")) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel.split(path.sep).join("/"));
  }
  return out;
}

/* Por import, por la tabla en Prisma (también por sus relaciones: `client.exploracionesDeVenta`,
   `businessCase.exploracion`) y por SQL crudo. */
const LEE = /@\/lib\/exploraciones\/|\.exploracionDeVenta\b|\bexploracionesDeVenta\b|\bexploracion\s*:\s*\{|"ExploracionDeVenta"/;

describe("⛔ quién lee una exploración de venta", () => {
  const lectores = ["app", "lib", "components"]
    .flatMap(archivos)
    .filter((f) => !f.startsWith("lib/exploraciones/") && !f.startsWith("components/exploraciones/"))
    .filter((f) => LEE.test(fs.readFileSync(path.join(RAIZ, f), "utf8")))
    .sort();

  it("cada lector está en el censo, con su destino", () => {
    const sinDeclarar = lectores.filter((f) => !(f in CENSO));
    expect(
      sinDeclarar,
      "Lector(es) de la exploración sin declarar en lib/exploraciones/lectores.test.ts. Escribe a qué documento alimenta y por qué puerta: " +
        "lo que ve el cliente solo con bloqueParaLaPropuesta / posicionDesdeElChequeo; el handoff con exploracionParaElHandoff.",
    ).toEqual([]);
  });

  it("no quedan entradas muertas en el censo", () => {
    const muertas = Object.keys(CENSO).filter((f) => !lectores.includes(f));
    expect(muertas, "Estas entradas ya no leen la exploración: bórralas").toEqual([]);
  });

  it("cada lector usa la puerta de su destino, y ninguna otra", () => {
    const mal: string[] = [];
    for (const f of lectores) {
      const d = CENSO[f]?.destino;
      if (!d || d === "ventas") continue;
      const fuente = fs.readFileSync(path.join(RAIZ, f), "utf8");
      const { permitidas, prohibidas } = PUERTAS[d];
      if (!permitidas.test(fuente)) mal.push(`${f}: no usa ninguna puerta de «${d}»`);
      if (prohibidas.test(fuente)) mal.push(`${f}: usa algo que «${d}» no puede leer (${fuente.match(prohibidas)?.[0]})`);
    }
    expect(mal).toEqual([]);
  });

  it("ningún documento del cliente la lee directo (kickoff, entrega, diagnóstico, cronograma)", () => {
    const deDocumentos = lectores.filter((f) => /kickoff|entrega|diagnostic|timeline|cronograma|external/i.test(f));
    expect(deDocumentos).toEqual([]);
  });
});
