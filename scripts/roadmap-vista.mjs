// Arma la vista publicable del roadmap: docs/roadmap-vista.html con docs/roadmap.md adentro.
// Uso: node scripts/roadmap-vista.mjs [salida]   (por defecto, .roadmap/roadmap.html, fuera de git)
// Después se publica ese archivo como artefacto, siempre en la misma dirección.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const raiz = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const md = readFileSync(resolve(raiz, "docs/roadmap.md"), "utf8");
if (/<\/script/i.test(md)) throw new Error("roadmap.md no puede contener «</script»");
const plantilla = readFileSync(resolve(raiz, "docs/roadmap-vista.html"), "utf8");
if (!plantilla.includes("@@ROADMAP_MD@@")) throw new Error("Falta el marcador @@ROADMAP_MD@@ en la plantilla");

const salida = resolve(raiz, process.argv[2] ?? ".roadmap/roadmap.html");
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, plantilla.replace("@@ROADMAP_MD@@", () => md), "utf8");
console.log(`Vista armada: ${salida}`);
