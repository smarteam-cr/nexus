/**
 * lib/seguimiento/guardas.test.ts — lo que «Lo que dejó esta reunión» NO puede hacer (DECISIONS, «Una sola revisión
 * por reunión», 2026-10-09). Escaneos del TEXTO del código: si una guarda desaparece, la suite se pone roja. Se
 * arreglan restituyendo la guarda, nunca relajando el regex.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const soloCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function fuentes(dir: string, filtro: RegExp): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...fuentes(rel, filtro));
    else if (filtro.test(e.name)) out.push(rel);
  }
  return out;
}

describe("⛔ las rutas de una reunión piden quién eres (app/api/sessions/[id]/**)", () => {
  const RUTAS = fuentes("app/api/sessions/[id]", /^route\.ts$/);
  const GUARDA = /guardInternalUser\(|guardAccessToProject\(|guardAccessToClient\(|guardAccesoALaReunion\(|requireConsultantSession\(|withAuth\(/;
  /** Mira el cliente de la reunión (o el del proyecto, en las que cambian un vínculo; la tarjeta lo mira adentro). */
  const MIRA_EL_CLIENTE = /requireAccessToClient\(|guardAccessToClient\(|guardAccessToProject\(|guardAccesoALaReunion\(|cargarTarjeta\(/;
  /**
   * Deuda conocida: piden sesión pero no miran el cliente de la reunión. La lista solo encoge. (Hasta el 2026-10-10 la
   * guarda daba por buena cualquier ruta con `withAuth(`, y GET /api/sessions/[id] servía la transcripción de cualquier
   * reunión a cualquier usuario interno.)
   */
  const SIN_ACCESO_AL_CLIENTE = new Set(["app/api/sessions/[id]/enrich/route.ts", "app/api/sessions/[id]/summarize/route.ts"]);

  it("la guarda mira algo", () => {
    expect(RUTAS.length).toBeGreaterThan(4);
  });

  it("cada ruta llama a una guarda de usuario", () => {
    const sin = RUTAS.filter((r) => !GUARDA.test(soloCodigo(leer(r))));
    expect(sin, `Rutas de una reunión sin guarda:\n${sin.join("\n")}`).toEqual([]);
  });

  it("cada ruta que no está en la deuda mira el cliente de la reunión (la transcripción no se sirve a cualquiera)", () => {
    const sin = RUTAS.filter((r) => !SIN_ACCESO_AL_CLIENTE.has(r) && !MIRA_EL_CLIENTE.test(soloCodigo(leer(r))));
    expect(sin, `Rutas de una reunión que no miran su cliente:\n${sin.join("\n")}`).toEqual([]);
    expect(soloCodigo(leer("app/api/sessions/[id]/route.ts")), "el GET de la transcripción").toContain("guardAccesoALaReunion(");
    expect(soloCodigo(leer("app/api/sessions/[id]/projects/route.ts")), "el GET de los proyectos de una reunión").toContain("guardAccesoALaReunion(");
  });

  it("⭐ una sola regla para las puertas de una reunión: con dueño, acceso a ese cliente (404); sin dueño, cualquier interno", () => {
    const regla = soloCodigo(leer("lib/sessions/acceso-a-la-reunion.ts"));
    expect(regla).toContain("guardInternalUser(");
    expect(regla).toContain("duenoDeLaSesion(");
    expect(regla).toContain("requireAccessToClient(");
    expect(regla, "sin acceso, 404").toContain("reunionNoEncontrada()");
    expect(regla, "sin dueño no es un 404: la reunión sigue abierta para el equipo").not.toMatch(/if \(!dueno\) return/);
    for (const r of ["app/api/sessions/[id]/minute/route.ts", "app/api/sessions/[id]/post-process/route.ts"]) {
      expect(soloCodigo(leer(r)), r).toContain("guardAccesoALaReunion(");
    }
  });

  it("la minuta y «Lo que dejó esta reunión» piden acceso al cliente dueño de la reunión (404 sin acceso)", () => {
    const minuta = soloCodigo(leer("app/api/sessions/[id]/minute/route.ts"));
    expect(minuta).toContain("guardAccesoALaReunion(");
    expect(minuta, "el cuerpo se valida con Zod").toContain("CambioDeMinuta.safeParse(");
    const loQueDejo = soloCodigo(leer("app/api/sessions/[id]/lo-que-dejo/route.ts"));
    expect(loQueDejo).toContain("guardInternalUser(");
    expect(loQueDejo).toContain("cargarTarjeta(");
    expect(soloCodigo(leer("lib/seguimiento/tarjeta-server.ts"))).toContain("requireAccessToClient(");
  });

  it("la deuda solo encoge: si una ruta de la lista ya mira el cliente, sácala", () => {
    for (const r of SIN_ACCESO_AL_CLIENTE) {
      const src = soloCodigo(leer(r));
      expect(/requireAccessToClient\(|guardAccessToClient\(|guardAccessToProject\(/.test(src), `${r} ya mira el cliente: sácala de la deuda`).toBe(false);
    }
  });
});

describe("⛔ la página de una reunión", () => {
  const PAGINA = soloCodigo(leer("app/(shell)/sessions/[id]/page.tsx"));

  it("toma el dueño de resolvedClientId (sin recategorizar) y pide acceso a ese cliente", () => {
    expect(PAGINA).not.toContain("categorizeSession(");
    expect(PAGINA).toContain("duenoDeLaSesion(");
    expect(PAGINA).toContain("requireAccessToClient(");
    expect(PAGINA).toContain("notFound()");
  });

  it("«Leer esta reunión»: el camino de una persona para releer una reunión sin minuta (el remedio de INV44)", () => {
    expect(PAGINA).toContain("<LeerEstaReunion");
    expect(soloCodigo(leer("components/seguimiento/LeerEstaReunion.tsx"))).toContain("/post-process");
  });
});

describe("⛔ lib/seguimiento", () => {
  const DE_SEGUIMIENTO = fuentes("lib/seguimiento", /\.ts$/).filter((r) => !r.endsWith(".test.ts"));

  it("no lee reuniones por su cuenta: pasa por lib/sessions/reuniones-para-seguimiento.ts", () => {
    const malos = DE_SEGUIMIENTO.filter((r) => /\.(firefliesSession|sessionProject)\./.test(soloCodigo(leer(r))));
    expect(malos).toEqual([]);
  });

  it("nadie lee ActionItem: los compromisos salen de Tareas, por la consulta de Tareas (etapa 2)", () => {
    const lectores = DE_SEGUIMIENTO.filter((r) => /\.actionItem\./.test(soloCodigo(leer(r))));
    expect(lectores).toEqual([]);
    const adaptador = soloCodigo(leer("lib/seguimiento/compromisos-server.ts"));
    expect(adaptador).toContain("cargarTareasDeLaReunion(");
    expect(adaptador, "el adaptador no lee las tablas de Tareas por su cuenta").not.toMatch(/\.(tarea|tareaEvento)\./);
  });

  it("«Usar todo» nunca toca la ficha, la etapa, la fecha del diagnóstico ni las alertas, y no escribe tareas por su cuenta", () => {
    const src = soloCodigo(leer("lib/seguimiento/usar-todo-server.ts"));
    for (const prohibido of [/\.client\.update/, /etapaPropuesta/, /diagnosticoPresentacion/, /\.csAlert\./, /\.actionItem\./, /\.tarea\.(update|create|delete)/]) {
      expect(src, `usar-todo-server.ts no puede tocar ${prohibido}`).not.toMatch(prohibido);
    }
    expect(src).toContain("cambiarSolicitud(");
    expect(src).toContain("decidirTarea(");
  });
});

describe("⛔ «Lo que dejó esta reunión» habla en tuteo", () => {
  const ARCHIVOS = [
    ...fuentes("components/seguimiento", /\.tsx?$/),
    ...fuentes("lib/seguimiento", /\.ts$/).filter((r) => !r.endsWith(".test.ts")),
    ...fuentes("lib/lo-propuesto", /\.ts$/).filter((r) => !r.endsWith(".test.ts")),
    "lib/para-ti/fuentes/reuniones.ts",
    "app/api/sessions/[id]/lo-que-dejo/route.ts",
    "app/api/sessions/[id]/minute/route.ts",
  ];

  it("ni una forma de voseo en los textos que se leen", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(8);
    const hallados: string[] = [];
    for (const rel of ARCHIVOS) {
      for (const { linea, texto } of textosDelFuente(leer(rel), rel)) {
        for (const w of formasDeVoseo(texto)) hallados.push(`${rel}:${linea} «${w}»`);
      }
    }
    expect(hallados, `Voseo. Pásalo a tuteo:\n${hallados.join("\n")}`).toEqual([]);
  });
});
