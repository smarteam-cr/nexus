/**
 * lib/exploraciones/guardas.test.ts — las reglas de la exploración de venta que no son de una función.
 *
 * ⛔ Tuteo, nunca voseo, en todo lo que el vendedor lee: las pantallas, los mensajes de la API y los
 * textos del guion y de las casillas. Mira los TEXTOS con el AST (lib/ui/voseo.ts): un comentario
 * que cita el voseo no cuenta.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";
import { crearSeguimiento, type CorridaEnCurso } from "./seguimiento-de-corrida";

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

const DE_LA_EXPLORACION = [
  ...archivos("lib/exploraciones", (f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")),
  ...archivos("components/exploraciones", (f) => /\.tsx?$/.test(f)),
  ...archivos("app/(shell)/sales/exploraciones", (f) => /\.tsx?$/.test(f)),
  ...archivos("app/api/sales/exploraciones", (f) => /\.tsx?$/.test(f)),
  "components/ui/Segmentado.tsx",
  "lib/clients/cliente-de-la-empresa-de-ventas.ts",
];

describe("⛔ la exploración de venta habla en tuteo, nunca en voseo", () => {
  it("hay archivos que revisar", () => {
    expect(DE_LA_EXPLORACION.length).toBeGreaterThan(15);
  });

  it("ni una forma de voseo en los textos que se leen", () => {
    const hallados: string[] = [];
    for (const rel of DE_LA_EXPLORACION) {
      const fuente = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      for (const { linea, texto } of textosDelFuente(fuente, rel)) {
        for (const w of formasDeVoseo(texto)) hallados.push(`${rel}:${linea} «${w}»`);
      }
    }
    expect(hallados, "volvió el voseo (si una palabra es tuteo de verdad, súmala a su lista en lib/ui/voseo.ts)").toEqual([]);
  });
});

describe("quién lleva la preventa: la celda compara con lo último que confirmó el servidor", () => {
  it("ElegirResponsable no decide solo con la prop: elegir B y volver a A antes del refresco dejaba B", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "components", "exploraciones", "ElegirResponsable.tsx"), "utf8");
    expect(codigo, "compara con la prop, que el refresco todavía no actualizó").not.toMatch(/email === actual\b/);
    expect(codigo, "guarda quién la lleva y la versión que devolvió el PATCH").toMatch(/confirmado\.current = \{ email: /);
  });
});

// ── Un solo seguimiento de la corrida (lib/exploraciones/seguimiento-de-corrida.ts) ──

function corrida(id: string, estado: CorridaEnCurso["estado"], cambios: Partial<CorridaEnCurso> = {}): CorridaEnCurso {
  return { id, modo: "leer", estado, etiqueta: null, fase: null, empezo: "2026-10-05T15:00:00.000Z", propuestos: null, nadaNuevo: false, error: null, ...cambios };
}

/**
 * Un servidor de mentira: contesta en orden lo que se le da, y después repite lo último. Anota
 * cuántas consultas hubo en vuelo a la vez (`maxEnVuelo`): con un solo seguimiento, nunca más de una.
 */
function servidor(respuestas: (CorridaEnCurso | null)[]) {
  let i = 0;
  let enVuelo = 0;
  let maxEnVuelo = 0;
  const consultar = vi.fn(async (): Promise<CorridaEnCurso | null> => {
    enVuelo += 1;
    maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    await Promise.resolve();
    enVuelo -= 1;
    return respuestas[Math.min(i++, respuestas.length - 1)];
  });
  Object.defineProperty(consultar, "maxEnVuelo", { get: () => maxEnVuelo });
  return consultar as typeof consultar & { readonly maxEnVuelo: number };
}

/** Deja correr todo lo que está en vuelo (las consultas y la espera de mentira son inmediatas). */
const asentar = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

function conectado(consultar: ReturnType<typeof servidor>) {
  const s = crearSeguimiento({ consultar, esperar: async () => {} });
  const recargar = vi.fn(async () => {});
  const avisos = { success: vi.fn(), error: vi.fn() };
  s.conectar({ recargar, avisos });
  return { s, recargar, avisos };
}

describe("⛔ un solo seguimiento de la corrida por exploración (no uno por pieza montada)", () => {
  it("useCorrida lee el seguimiento compartido: no consulta ni espera por su cuenta", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "components", "exploraciones", "useCorrida.ts"), "utf8");
    expect(codigo).toMatch(/seguimientoDe\(exp\.id\)/);
    expect(codigo, "volvió un seguimiento por pieza").not.toMatch(/setTimeout|\/agente`\)/);
  });

  it("cuatro piezas montadas: una consulta por vuelta, una recarga y un aviso al terminar", async () => {
    const consultar = servidor([corrida("r1", "RUNNING"), corrida("r1", "RUNNING"), corrida("r1", "DONE", { propuestos: 2 })]);
    const { s, recargar, avisos } = conectado(consultar);
    for (let i = 0; i < 4; i++) s.montar("2026-10-05T14:00:00.000Z");
    await asentar();
    // 1 al montar (compartida por las cuatro) + 2 vueltas del único seguimiento.
    expect(consultar).toHaveBeenCalledTimes(3);
    expect(consultar.maxEnVuelo).toBe(1);
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(avisos.success).toHaveBeenCalledTimes(1);
    expect(avisos.success).toHaveBeenCalledWith("El agente propuso 2 cosas: están en su lugar.");
    expect(s.foto().corrida?.estado).toBe("DONE");
  });

  it("si otra pieza pide seguir mientras ya se sigue, no abre otro seguimiento ni repite el aviso", async () => {
    const consultar = servidor([null, corrida("r2", "RUNNING"), corrida("r2", "RUNNING"), corrida("r2", "ERROR", { error: "Se cortó" })]);
    const { s, avisos } = conectado(consultar);
    s.montar("2026-10-05T14:00:00.000Z");
    s.montar("2026-10-05T14:00:00.000Z");
    await asentar();
    // Dos botones lanzan casi a la vez: los dos piden seguir.
    void s.seguir();
    void s.seguir();
    await asentar();
    expect(consultar.maxEnVuelo, "dos seguimientos consultando a la vez").toBe(1);
    expect(avisos.error).toHaveBeenCalledTimes(1);
    expect(avisos.error).toHaveBeenCalledWith("Se cortó");
    // Lo que ve cualquier pieza es lo mismo: la corrida que lanzó la otra.
    expect(s.foto().corrida?.id).toBe("r2");
  });

  it("al montar, una corrida que terminó después de lo que tenía el lienzo recarga una vez y sin aviso", async () => {
    const consultar = servidor([corrida("r3", "DONE", { empezo: "2026-10-05T16:00:00.000Z", propuestos: 1 })]);
    const { s, recargar, avisos } = conectado(consultar);
    s.montar("2026-10-05T15:30:00.000Z");
    s.montar("2026-10-05T15:30:00.000Z");
    await asentar();
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(avisos.success).not.toHaveBeenCalled();
  });

  it("sin piezas montadas, el seguimiento se detiene", async () => {
    const consultar = servidor([corrida("r4", "RUNNING")]);
    const s = crearSeguimiento({ consultar, esperar: async () => {} });
    const desmontar = s.montar("2026-10-05T14:00:00.000Z");
    await asentar();
    desmontar();
    const antes = consultar.mock.calls.length;
    await asentar();
    expect(consultar.mock.calls.length - antes).toBeLessThanOrEqual(1);
    expect(s.foto().corrida).toBeNull();
  });

  it("lo que lanza una pieza lo ven todas", () => {
    const s = crearSeguimiento({ consultar: async () => null });
    const oyente = vi.fn();
    s.suscribir(oyente);
    s.ponerLanzando(true);
    expect(s.foto().lanzando).toBe(true);
    expect(oyente).toHaveBeenCalledTimes(1);
  });
});
