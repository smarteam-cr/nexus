/**
 * lib/exploraciones/guardas.test.ts — las reglas de la exploración de venta que no son de una función.
 *
 * ⛔ Tuteo, nunca voseo, en todo lo que el vendedor lee: las pantallas, los mensajes de la API y los
 * textos del guion y de las casillas. Mira los TEXTOS con el AST (lib/ui/voseo.ts): un comentario
 * que cita el voseo no cuenta.
 */
import fs from "node:fs";
import path from "node:path";
import type { TeamRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";
import { debePrepararSola, estadoDeLaPreparacion, ultimaPreparacion } from "./preparar-sola";
import { equipoParaLaPreventa, errorDelResponsable } from "./responsable";
import { crearSeguimiento, type CorridaEnCurso } from "./seguimiento-de-corrida";

/* Para «quién puede llevar una preventa» (responsable.ts): un equipo de mentira, sin base, y los
   permisos con la matriz REAL por defecto (lib/auth/permissions/defaults.ts) más los ajustes de cada uno. */
const EQUIPO = vi.hoisted(() => [
  { email: "ana@smarteam.test", name: "Ana", roleEnum: "VENTAS", permissionOverrides: null as unknown, deactivatedAt: null as Date | null },
  { email: "carla@smarteam.test", name: "Carla", roleEnum: "CSE", permissionOverrides: null, deactivatedAt: null },
  { email: "mario@smarteam.test", name: "Mario", roleEnum: "MARKETING", permissionOverrides: null, deactivatedAt: null },
  { email: "sofia@smarteam.test", name: "Sofía", roleEnum: "MARKETING", permissionOverrides: { v: 1, sections: { preventa: { read: true } } }, deactivatedAt: null },
  { email: "beto@smarteam.test", name: "Beto", roleEnum: "VENTAS", permissionOverrides: null, deactivatedAt: new Date("2026-09-01T00:00:00.000Z") },
]);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => {
  // Sin `deactivatedAt: null` en el where, trae también a los dados de baja (como Prisma).
  const activo = (where: { deactivatedAt?: unknown }, m: (typeof EQUIPO)[number]) => where.deactivatedAt !== null || m.deactivatedAt === null;
  return {
    prisma: {
      teamMember: {
        findMany: async ({ where }: { where: { deactivatedAt?: unknown } }) => EQUIPO.filter((m) => activo(where, m)),
        findFirst: async ({ where }: { where: { email: { equals: string }; deactivatedAt?: unknown } }) =>
          EQUIPO.find((m) => m.email.toLowerCase() === where.email.equals.toLowerCase() && activo(where, m)) ?? null,
      },
    },
  };
});
vi.mock("@/lib/auth/permissions/engine", async () => {
  const { computeEffective } = await import("@/lib/auth/permissions/defaults");
  const { parsePermissionMapLoose } = await import("@/lib/auth/permissions/schema");
  return {
    can: async (tm: { roleEnum: TeamRole; permissionOverrides?: unknown }, seccion: string, accion: string) => {
      const secciones = computeEffective(tm.roleEnum, null, parsePermissionMapLoose(tm.permissionOverrides ?? null)).sections as Record<string, Record<string, boolean> | undefined>;
      return secciones[seccion]?.[accion] === true;
    },
  };
});

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

// ── La preparación que se lanza sola (lib/exploraciones/preparar-sola.ts) ──

describe("⛔ si la preparación automática falla, no se reintenta sola: espera el botón (Elías, 2026-10-05)", () => {
  const prep = (estado: CorridaEnCurso["estado"], cambios: Partial<CorridaEnCurso> = {}) => corrida("p1", estado, { modo: "preparar", ...cambios });
  const base = { puedeEditar: true, archivada: false, preparadaEn: null, ocupado: false };

  it("una preventa sin preparar se prepara sola, pero recién cuando el servidor contestó", () => {
    expect(debePrepararSola({ ...base, alAbrir: undefined }), "decidió antes de la primera consulta").toBe(false);
    expect(debePrepararSola({ ...base, alAbrir: null }), "sin respuesta del servidor no se lanza").toBe(false);
    expect(debePrepararSola({ ...base, alAbrir: { corrida: null, preparacion: null } })).toBe(true);
  });

  it("si la última preparación falló, no se lanza sola, aunque después haya corrido otra cosa", () => {
    const fallida = prep("ERROR", { error: "Se cortó" });
    expect(debePrepararSola({ ...base, alAbrir: { corrida: fallida, preparacion: fallida } })).toBe(false);
    expect(debePrepararSola({ ...base, alAbrir: { corrida: corrida("l1", "DONE", { empezo: "2026-10-05T16:00:00.000Z" }), preparacion: fallida } })).toBe(false);
  });

  it("tampoco si ya hay una corriendo, si ya se preparó con la radiografía, si no puede editar o si está archivada", () => {
    const nada = { corrida: null, preparacion: null };
    expect(debePrepararSola({ ...base, alAbrir: { corrida: corrida("l1", "RUNNING"), preparacion: null } })).toBe(false);
    expect(debePrepararSola({ ...base, ocupado: true, alAbrir: nada })).toBe(false);
    expect(debePrepararSola({ ...base, preparadaEn: "2026-10-03T12:00:00.000Z", alAbrir: nada })).toBe(false);
    expect(debePrepararSola({ ...base, puedeEditar: false, alAbrir: nada })).toBe(false);
    expect(debePrepararSola({ ...base, archivada: true, alAbrir: nada })).toBe(false);
    // Preparada bien ANTES de la radiografía: se prepara de nuevo, como siempre.
    expect(debePrepararSola({ ...base, preparadaEn: "2026-10-01T12:00:00.000Z", alAbrir: { corrida: null, preparacion: prep("DONE", { empezo: "2026-10-01T11:58:00.000Z" }) } })).toBe(true);
  });

  it("la pantalla dice cuándo se actualizó la información y, si la última falló, cuándo falló", () => {
    const fallo = prep("ERROR", { empezo: "2026-10-05T15:00:00.000Z", termino: "2026-10-05T15:02:00.000Z", error: "Se cortó" });
    expect(estadoDeLaPreparacion({ preparadaEn: "2026-10-03T12:00:00.000Z", ultima: fallo })).toEqual({
      actualizadaEn: "2026-10-03T12:00:00.000Z",
      fallo: { en: "2026-10-05T15:02:00.000Z", error: "Se cortó" },
    });
    // Alguien apretó el botón y salió bien: la falla ya no se ve.
    const buena = prep("DONE", { id: "p2", empezo: "2026-10-05T15:10:00.000Z" });
    const ultima = ultimaPreparacion(fallo, buena);
    expect(ultima?.id).toBe("p2");
    expect(estadoDeLaPreparacion({ preparadaEn: "2026-10-05T15:11:00.000Z", ultima }).fallo).toBeNull();
    // Una lectura que corrió después no tapa la preparación que falló.
    expect(ultimaPreparacion(fallo, corrida("l1", "DONE", { empezo: "2026-10-05T16:00:00.000Z" }))?.id).toBe("p1");
  });

  it("la pieza Preparación decide con esto (no con lo guardado) y muestra las dos líneas", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "components", "exploraciones", "PasoPreparacion.tsx"), "utf8");
    expect(codigo).toMatch(/debePrepararSola\(\{/);
    expect(codigo).toMatch(/Información actualizada el \$\{diaYHora\(/);
    expect(codigo).toMatch(/La última actualización falló el \$\{diaYHora\(fallo\.en\)\}/);
    const ruta = fs.readFileSync(path.join(RAIZ, "app", "api", "sales", "exploraciones", "[id]", "agente", "route.ts"), "utf8");
    expect(ruta, "el GET dice cuál fue la última preparación").toMatch(/ultimaCorrida\(id, lectura\.fila\.clientId, undefined, "preparar"\)/);
  });
});

// ── Quién lleva la preventa (lib/exploraciones/responsable.ts) ──

describe("⛔ una preventa solo la lleva alguien con acceso a Preventa (Elías, 2026-10-05 y 2026-10-06)", () => {
  it("la lista de «La lleva» es el equipo activo con `preventa.read` (por su rol —Ventas o Customer Success— o por su ajuste), nadie más", async () => {
    expect((await equipoParaLaPreventa()).map((p) => p.email)).toEqual(["ana@smarteam.test", "carla@smarteam.test", "sofia@smarteam.test"]);
  });

  it("el PATCH rechaza, con un mensaje claro, a quien no tiene acceso a Preventa, a quien se dio de baja y a quien no es del equipo", async () => {
    for (const email of ["mario@smarteam.test", "beto@smarteam.test", "nadie@otra.test"]) {
      expect(await errorDelResponsable([{ op: "responsable", email }]), email).toBe(`${email} no puede llevar la preventa: solo la lleva alguien del equipo con acceso a Preventa.`);
    }
  });

  it("acepta a quien tiene acceso (sin importar mayúsculas), dejarla sin responsable y lo que no toca al responsable", async () => {
    expect(await errorDelResponsable([{ op: "responsable", email: "Ana@Smarteam.test" }])).toBeNull();
    expect(await errorDelResponsable([{ op: "responsable", email: "sofia@smarteam.test" }])).toBeNull();
    expect(await errorDelResponsable([{ op: "responsable", email: "carla@smarteam.test" }]), "un CSE la puede llevar").toBeNull();
    expect(await errorDelResponsable([{ op: "responsable", email: null }])).toBeNull();
    expect(await errorDelResponsable([{ op: "archivar" }])).toBeNull();
  });

  it("el PATCH valida antes de aplicar el cambio (y antes de avisarle a nadie)", () => {
    const ruta = fs.readFileSync(path.join(RAIZ, "app", "api", "sales", "exploraciones", "[id]", "route.ts"), "utf8");
    expect(ruta).toMatch(/const sinAcceso = await errorDelResponsable\(/);
    expect(ruta.indexOf("errorDelResponsable(cuerpo")).toBeLessThan(ruta.indexOf("aplicarCambios(id"));
  });
});

// ── Las reuniones de HubSpot que ya pasaron (lib/exploraciones/lectura.ts › agendaRenovada) ──

describe("⛔ una reunión de HubSpot sin resumen se sigue avisando como pendiente de leer (Elías, 2026-10-05)", () => {
  it("el agente guarda la foto con la agenda RENOVADA, no solo con lo que trae esta lectura", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "lib", "exploraciones", "agente.ts"), "utf8");
    expect(codigo).toMatch(/agenda: agendaRenovada\(\{ anterior: leerLoLeido\(fila\.test\)\.agenda, nueva: leido\.foto\.agenda/);
    expect(codigo, "volvió a escribir la foto tal cual la leyó la corrida").not.toMatch(/test: \{ \.\.\.leido\.foto, leidoEn/);
  });

  it("«sin leer» compara las de HubSpot con TODAS las de Meet: una que ya se leyó en Meet no queda sin leer en HubSpot", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "lib", "exploraciones", "fuentes.ts"), "utf8");
    const sinLeer = codigo.slice(codigo.indexOf("export async function reunionesSinLeer"));
    expect(sinLeer).toMatch(/agendadasQueYaPasaron\(opts\.leido\.agenda, opts\.propuesta\.leidas\.hubspot, deMeet, ahora\)/);
    expect(sinLeer).not.toMatch(/s\.date >= desde && !leidas\.has\(s\.id\)/);
  });

  it("«Ya agendó» en Preparación mira solo lo que viene, no las que la foto conserva", () => {
    const ruta = fs.readFileSync(path.join(RAIZ, "app", "api", "sales", "exploraciones", "[id]", "preparacion", "route.ts"), "utf8");
    expect(ruta).toMatch(/loQueVieneDeLaAgenda\(leerLoLeido\(lectura\.fila\.test\)\)/);
  });
});
