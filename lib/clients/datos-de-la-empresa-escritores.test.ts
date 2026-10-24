/**
 * lib/clients/datos-de-la-empresa-escritores.test.ts — la fuente y la fecha de un dato de la empresa las escribe UN
 * solo lugar (R1, 2026-10-24).
 *
 * `lib/clients/datos-de-la-empresa-server.ts` escribe el valor, su fuente, su fecha y su fila de historia en la misma
 * transacción. Un archivo que escribiera la fuente o la fecha por su cuenta dejaría una fuente que miente (o una sin
 * historia). Este escaneo busca las columnas de fuente y fecha (y el cálculo del TAM) en todo `app/`, `lib/`,
 * `components/` y `scripts/`: solo pueden aparecer en el motor, sus pruebas y los archivos de abajo, que solo las LEEN
 * o las copian al fusionar dos fichas. Decisión: DECISIONS › «Los datos de la empresa» (punto 2).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGO_DE_DATOS, columnasDelDato } from "./datos-de-la-empresa";

const RAIZ = join(__dirname, "..", "..");

/** Los que pueden nombrar las columnas, y por qué. Un archivo nuevo entra acá con su razón, o no entra. */
const PERMITIDOS: Readonly<Record<string, string>> = {
  "lib/clients/datos-de-la-empresa.ts": "el catálogo: arma los nombres",
  "lib/clients/datos-de-la-empresa-server.ts": "el motor: el único que escribe",
  "lib/cs/cartera.ts": "lee `tamFuente` para la razón del potencial",
  "lib/cs/cartera-reglas.ts": "el tipo de la cuenta de cartera (`tamFuente`)",
  "lib/cs/clasificacion.ts": "la razón del potencial dice de dónde salió el TAM",
  "components/clients/DatosDeLaEmpresa.tsx": "la pantalla muestra cómo se calculó el TAM (lo lee de la respuesta)",
  "scripts/cargar-datos-de-la-empresa.ts": "lee `tamFuente` para el potencial de después del simulacro",
};

/** El texto desde `abre` (en `desde`) hasta el que lo cierra, contando anidados. Aproximado (no mira comillas): alcanza
 *  para los objetos de Prisma, que no llevan llaves sueltas en sus textos. */
function balanceado(src: string, desde: number, abre: string, cierra: string): string {
  let n = 0;
  for (let i = desde; i < src.length; i++) {
    if (src[i] === abre) n++;
    else if (src[i] === cierra && --n === 0) return src.slice(desde, i + 1);
  }
  return src.slice(desde);
}

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) out.push(...archivos(ruta));
    else if (/\.(ts|tsx)$/.test(nombre) && !/\.test\.ts$/.test(nombre)) out.push(ruta);
  }
  return out;
}

describe("la fuente y la fecha de los datos de la empresa", () => {
  it("solo las nombra el motor (y los que leen, con su razón)", () => {
    const columnas = [...CATALOGO_DE_DATOS.flatMap((d) => {
      const c = columnasDelDato(d.clave);
      return [c.fuente, c.at];
    }), "tamCalculo"];
    const patron = new RegExp(`\\b(${columnas.join("|")})\\b`);
    const ofensores: string[] = [];
    for (const carpeta of ["app", "lib", "components", "scripts"]) {
      for (const ruta of archivos(join(RAIZ, carpeta))) {
        const rel = relative(RAIZ, ruta).replace(/\\/g, "/");
        if (PERMITIDOS[rel] || rel.startsWith("scripts/archive/")) continue;
        const m = readFileSync(ruta, "utf8").match(patron);
        if (m) ofensores.push(`${rel} (${m[1]})`);
      }
    }
    expect(ofensores, "escribe la fuente o la fecha de un dato por su cuenta: pásalo por proponerDatoEnTx").toEqual([]);
  });

  /* El VALOR tampoco (revisión de R1, 2026-10-24): un `client.update/create` que escribe `industry: …` a mano deja el
     valor sin fuente ni historia, y la próxima importación lo pisa como si fuera de HubSpot. Se mira el texto de cada
     escritura de `Client` (lo que sigue a `client.create(`, `update(`, `updateMany(`, `upsert(`) y se buscan las claves de
     los datos del catálogo escritas a mano. Las altas que nacen con un dato lo ponen con `datosAlNacerDesdeHubspot`. */
  it("nadie escribe el valor de un dato de la empresa en Client por su cuenta", () => {
    const claves = CATALOGO_DE_DATOS.map((d) => d.clave);
    const alternativas = claves.join("|");
    // `industry: x`, y también la forma corta `{ industry }` (así escribía la importación del sistema hasta este cambio).
    const clave = new RegExp(`\\b(${alternativas})\\s*:\\s*(?!true\\b)|[{,]\\s*(${alternativas})\\s*(?=[,}])`);
    // `data.tamUsd = …` sobre el objeto que después se escribe (así escribía Clasificación hasta este cambio).
    const asignacion = new RegExp(`\\b(?:data|datos|cambios)\\.(${alternativas})\\s*=(?!=)`);
    const escritura = /\b(?:tx|prisma|db)\.client\.(?:create|update|updateMany|upsert)\(/g;
    const VALORES_PERMITIDOS: Readonly<Record<string, string>> = {
      "lib/clients/datos-de-la-empresa-server.ts": "el motor: escribe con su fuente, su fecha y su fila",
      "scripts/merge-duplicate-clients.ts": "la fusión pliega los datos con su fuente (plegarDatosDeLaEmpresa) y el TAM viejo de la ficha",
      "scripts/seed-fixture.ts": "el mundo ficticio de la base local",
      "scripts/seed-demo.ts": "un demo ficticio de la base local",
    };
    const ofensores: string[] = [];
    for (const carpeta of ["app", "lib", "components", "scripts"]) {
      for (const ruta of archivos(join(RAIZ, carpeta))) {
        const rel = relative(RAIZ, ruta).replace(/\\/g, "/");
        if (VALORES_PERMITIDOS[rel] || rel.startsWith("scripts/archive/")) continue;
        const src = readFileSync(ruta, "utf8");
        const asignada = src.match(asignacion);
        if (asignada) {
          ofensores.push(`${rel} (${asignada[1]})`);
          continue;
        }
        for (const m of src.matchAll(escritura)) {
          // Solo lo que se ESCRIBE: el objeto de `data:` (o `create:`/`update:` de un upsert), sin lo que va adentro de la
          // ayuda que pone la fuente al nacer.
          const llamada = balanceado(src, m.index! + m[0].length - 1, "(", ")");
          const bloques = [...llamada.matchAll(/\b(?:data|create|update)\s*:\s*\{/g)].map((b) => balanceado(llamada, b.index! + b[0].length - 1, "{", "}"));
          const tramo = bloques.join("\n").replace(/datosAlNacerDesdeHubspot\([^)]*\)/g, "");
          const hit = tramo.match(clave);
          if (hit) {
            ofensores.push(`${rel} (${hit[1] ?? hit[2]})`);
            break;
          }
        }
      }
    }
    expect(ofensores, "escribe un dato de la empresa sin pasar por el motor: usa proponerDatoEnTx (o datosAlNacerDesdeHubspot al crear)").toEqual([]);
  });
});
