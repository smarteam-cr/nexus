import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  avisoSinPermiso,
  CLAVES_DE_FRENTE,
  FRENTES,
  FRENTES_ACTIVOS,
  FRENTES_POR_DEFECTO,
  frente,
  frentesDe,
  puedeLlevar,
  vistaFinanzasDeFrentes,
  type ClaveDeFrente,
} from "./frentes";
import { formasDeVoseo } from "@/lib/ui/voseo";
import type { Alcance } from "./alcance-server";
import type { Fuente } from "./fuente";
import { fuentesQueAplican } from "./medir-server";
import { quienesLlevan } from "./avisos-server";

/* El equipo simulado para `quienesLlevan`: el `findMany` devuelve SOLO lo que pide el `select` (si el código deja de
   pedir `permissionOverrides`, el permiso efectivo sale vacío y la prueba se entera). El permiso efectivo es, para la
   prueba, lo que diga `permissionOverrides.sections` de cada fila. */
const equipo = vi.hoisted(() => ({ filas: [] as Record<string, unknown>[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/supabase", () => ({ requireInternalUser: vi.fn(), ForbiddenError: class extends Error {} }));
vi.mock("@/lib/auth/permissions/engine", () => ({
  can: async () => false,
  getEffectivePermissions: async (tm: { permissionOverrides?: { sections?: Record<string, Record<string, boolean>> } }) => ({
    v: 1,
    sections: tm.permissionOverrides?.sections ?? {},
  }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    teamMember: {
      findMany: async ({ select }: { select: Record<string, boolean> }) =>
        equipo.filas.map((f) => Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, f[k] ?? null]))),
    },
  },
}));
// Las fuentes reales importan cada módulo con su base: acá se prueban fuentes de mentira.
vi.mock("./registro", () => ({ FUENTES: [] }));

describe("frentesDe: lo que lleva cada persona", () => {
  it("sin elegir, salen del rol", () => {
    expect(frentesDe({ roleEnum: "CSE" })).toEqual([]);
    expect(frentesDe({ roleEnum: "CSL" })).toEqual(["LIDERAR_CS", "DOCUMENTACION"]);
    expect(frentesDe({ roleEnum: "VENTAS" })).toEqual(["VENTAS"]);
    expect(frentesDe({ roleEnum: "ADMIN" })).toEqual(["FINANZAS_REGISTRAR"]);
    expect(frentesDe({ roleEnum: "MARKETING" })).toEqual(["MARKETING"]);
    expect(frentesDe({ roleEnum: "DEV" })).toEqual([]);
  });

  it("un Super Admin sin elegir hereda lo que ya decía su vista de Finanzas", () => {
    expect(frentesDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: null })).toEqual(["FINANZAS_SUPERVISAR", "FEEDBACK"]);
    expect(frentesDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: "DIRECCION" })).toEqual(["DIRECCION", "FEEDBACK"]);
  });

  it("el responsable fijo de la Escala la lleva por defecto", () => {
    expect(frentesDe({ roleEnum: "SUPER_ADMIN", vistaFinanzas: "DIRECCION", esResponsableDeLaEscala: true })).toEqual([
      "DIRECCION",
      "ESCALA",
      "FEEDBACK",
    ]);
  });

  it("elegidos a mano mandan, aunque la lista esté vacía (vacía = solo lo mío)", () => {
    const editados = new Date("2026-10-04T12:00:00Z");
    expect(frentesDe({ roleEnum: "CSL", frentes: [], frentesEditadosAt: editados })).toEqual([]);
    expect(
      frentesDe({ roleEnum: "SUPER_ADMIN", frentes: ["ESCALA", "DIRECCION", "SISTEMA"], frentesEditadosAt: editados }),
    ).toEqual(["DIRECCION", "ESCALA", "SISTEMA"]);
  });

  it("una clave que ya no existe se ignora", () => {
    expect(frentesDe({ roleEnum: "CSE", frentes: ["NO_EXISTE", "VENTAS"], frentesEditadosAt: new Date() })).toEqual(["VENTAS"]);
  });

  it("todo rol del enum tiene su default declarado", () => {
    for (const rol of ["CSE", "VENTAS", "CSL", "MARKETING", "DEV", "ADMIN", "SUPER_ADMIN"]) {
      expect(FRENTES_POR_DEFECTO[rol], rol).toBeDefined();
    }
  });
});

describe("la vista de Finanzas se desprende de los frentes", () => {
  it("un Super Admin con «Finanzas: supervisar» ve el panel completo; sin él, los reportes", () => {
    expect(vistaFinanzasDeFrentes("SUPER_ADMIN", ["FINANZAS_SUPERVISAR", "DIRECCION"])).toBeNull();
    expect(vistaFinanzasDeFrentes("SUPER_ADMIN", ["DIRECCION", "ESCALA"])).toBe("DIRECCION");
    expect(vistaFinanzasDeFrentes("SUPER_ADMIN", [])).toBe("DIRECCION");
  });
  it("para el resto no cuenta", () => {
    expect(vistaFinanzasDeFrentes("ADMIN", ["FINANZAS_SUPERVISAR"])).toBeNull();
  });
});

describe("puedeLlevar: un frente no da acceso, pero se avisa si no va a poder abrir lo que le llegue", () => {
  const acceso = (role: string, sections: Record<string, Record<string, boolean>> = {}, escala = false) => ({
    role,
    email: null,
    permissions: { sections },
    esResponsableDeLaEscala: escala,
  });

  it("liderar Customer Success pide CSL o Super Admin", () => {
    expect(puedeLlevar(frente("LIDERAR_CS"), acceso("CSL"))).toBe(true);
    expect(puedeLlevar(frente("LIDERAR_CS"), acceso("SUPER_ADMIN"))).toBe(true);
    expect(puedeLlevar(frente("LIDERAR_CS"), acceso("CSE", { clientes: { viewAll: true } }))).toBe(false);
  });

  it("los frentes de permiso miran la celda efectiva", () => {
    expect(puedeLlevar(frente("FINANZAS_REGISTRAR"), acceso("ADMIN", { cobranza: { read: true } }))).toBe(true);
    expect(puedeLlevar(frente("FINANZAS_REGISTRAR"), acceso("CSE"))).toBe(false);
    expect(puedeLlevar(frente("VENTAS"), acceso("VENTAS", { ventas: { read: true } }))).toBe(true);
  });

  it("la Escala se decide en Feedback: pide Super Admin (desde el 2026-10-05)", () => {
    expect(puedeLlevar(frente("ESCALA"), acceso("SUPER_ADMIN"))).toBe(true);
    expect(puedeLlevar(frente("ESCALA"), acceso("CSL", {}, true))).toBe(false);
  });

  it("Dirección no pide nada", () => {
    expect(puedeLlevar(frente("DIRECCION"), acceso("CSE"))).toBe(true);
  });
});

describe("el catálogo", () => {
  it("una clave, un frente, y todos con nombre y qué llega", () => {
    expect(new Set(FRENTES.map((f) => f.clave)).size).toBe(FRENTES.length);
    expect(FRENTES.map((f) => f.clave)).toEqual([...CLAVES_DE_FRENTE]);
    for (const f of FRENTES) {
      expect(f.nombre.trim(), f.clave).not.toBe("");
      expect(f.queLlega.trim(), f.clave).not.toBe("");
      if (f.requisito.tipo !== "ninguno") expect(f.requisitoTexto.trim(), f.clave).not.toBe("");
    }
  });

  it("⭐ Feedback se encendió con el módulo (2026-10-04): solo lo lleva Super Admin", () => {
    const f = FRENTES_ACTIVOS.find((x) => x.clave === "FEEDBACK");
    expect(f?.requisito).toEqual({ tipo: "roles", roles: ["SUPER_ADMIN"] });
  });

  it("tuteo en los textos que ve el equipo (el detector por FORMA de lib/ui/voseo.ts, no una lista cerrada)", () => {
    expect(FRENTES.length, "no pasa en vacío").toBeGreaterThanOrEqual(8);
    const conVoseo = FRENTES.flatMap((f) =>
      [f.nombre, f.queLlega, f.requisitoTexto].flatMap((t) => formasDeVoseo(t).map((w) => `${f.clave}: «${w}» en «${t}»`)),
    );
    expect(conVoseo).toEqual([]);
  });
});

describe("⛔ un frente que llevas sin permiso se calla: ni pendientes ni avisos (Elías, 2026-10-05)", () => {
  const alcance = (rol: string, frentes: ClaveDeFrente[], sections: Record<string, Record<string, boolean>> = {}): Alcance => ({
    email: "ana@smarteamcr.com",
    nombre: "Ana",
    rol,
    teamMemberId: "tm-ana",
    frentes,
    permisos: { v: 1, sections },
    veTodaLaCartera: false,
    proyectos: [],
  });
  const fuente = (clave: string, delFrente: ClaveDeFrente | null, aplica?: Fuente["aplica"]): Fuente => ({
    clave,
    frente: delFrente,
    alDia: clave,
    aplica,
    medir: async () => [],
  });
  const FUENTES = [
    fuente("personal", null),
    fuente("ventas", "VENTAS"),
    fuente("registrar", "FINANZAS_REGISTRAR"),
    fuente("feedback", "FEEDBACK"),
    fuente("direccion", "DIRECCION"),
  ];
  const medidas = (a: Alcance) => fuentesQueAplican(a, FUENTES).map((f) => f.clave);

  it("lleva Ventas y Finanzas sin ver Ventas ni Cobranza: de esos frentes no se mide nada", () => {
    expect(medidas(alcance("CSE", ["VENTAS", "FINANZAS_REGISTRAR", "DIRECCION"]))).toEqual(["personal", "direccion"]);
  });

  it("con el permiso, el mismo frente vuelve a llegar", () => {
    const a = alcance("CSE", ["VENTAS", "FINANZAS_REGISTRAR"], { ventas: { read: true }, cobranza: { read: true } });
    expect(medidas(a)).toEqual(["personal", "ventas", "registrar"]);
  });

  it("un frente de rol (Feedback es de Super Admin) no llega a otro rol aunque lo marquen a mano", () => {
    expect(medidas(alcance("CSL", ["FEEDBACK"]))).toEqual(["personal"]);
    expect(medidas(alcance("SUPER_ADMIN", ["FEEDBACK"]))).toEqual(["personal", "feedback"]);
  });

  it("lo personal no depende de los frentes ni de su permiso", () => {
    expect(medidas(alcance("DEV", []))).toEqual(["personal"]);
  });

  it("los avisos de un frente le llegan solo a quien lo lleva Y puede abrirlo", async () => {
    const editados = new Date("2026-10-04T12:00:00Z");
    equipo.filas = [
      // Lleva Feedback por su rol.
      { email: "sa@smarteamcr.com", roleEnum: "SUPER_ADMIN", frentes: [], frentesEditadosAt: null, vistaFinanzas: null },
      // Lo marcó a mano sin ser Super Admin: el reporte (hasta 280 caracteres) no le llega.
      { email: "csl@smarteamcr.com", roleEnum: "CSL", frentes: ["FEEDBACK"], frentesEditadosAt: editados, vistaFinanzas: null },
      // Lleva «Finanzas: registrar» por su rol, con y sin Cobranza.
      {
        email: "conta@smarteamcr.com",
        roleEnum: "ADMIN",
        frentes: [],
        frentesEditadosAt: null,
        vistaFinanzas: null,
        permissionOverrides: { sections: { cobranza: { read: true } } },
      },
      { email: "sin-cobranza@smarteamcr.com", roleEnum: "ADMIN", frentes: [], frentesEditadosAt: null, vistaFinanzas: null },
    ];
    expect(await quienesLlevan("FEEDBACK")).toEqual(["sa@smarteamcr.com"]);
    expect(await quienesLlevan("FINANZAS_REGISTRAR")).toEqual(["conta@smarteamcr.com"]);
  });

  it("Equipo lo dice en ámbar: no le va a llegar nada de ese tema hasta que tenga el permiso", () => {
    const t = avisoSinPermiso(frente("VENTAS"));
    expect(t).toContain(frente("VENTAS").requisitoTexto);
    expect(t).toContain("no le va a llegar nada de este tema");
    expect(formasDeVoseo(t)).toEqual([]);
    const componente = readFileSync(join(__dirname, "..", "..", "components", "team", "FrentesDelMiembro.tsx"), "utf8");
    expect(componente, "el aviso ámbar de Equipo sale de avisoSinPermiso").toMatch(/\{avisoSinPermiso\(f\)\}/);
  });
});
