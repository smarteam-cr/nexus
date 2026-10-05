import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MATRIX } from "./permissions/defaults";
import { sectionByKey } from "./permissions/registry";
import { ROLES_DE_EXITO_DEL_CLIENTE, esLiderDeCs } from "@/lib/cs/acceso";

/**
 * lib/auth/customer-success-propio.test.ts — ÉXITO DEL CLIENTE ES DE LA CSL Y DE DIRECCIÓN.
 *
 * ── QUÉ CAMBIÓ (2026-10-04) ──────────────────────────────────────────────────
 * Del 2026-08-16 al 2026-10-04 el área colgó de la celda `customerSuccess.read` y el CSE entraba a
 * ver sus cuentas. Con el rediseño el índice pasó a mostrar la cartera entera en dinero (MRR
 * gestionado, comisión, puntos de partner) y Elías decidió que las dos pantallas son de la líder de
 * Customer Success (CSL) y de dirección (SUPER_ADMIN), por ROL, como Roles: no se delega por
 * plantilla. La lista vive en `lib/cs/acceso.ts`.
 *
 * ── LOS ERRORES QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ─────────────────────────
 *
 * 1. **Volver a colgarla de una celda.** Sea `customerSuccess.read` o `clientes.viewAll`, una celda
 *    se reparte por plantilla y le abriría el dinero de la cartera a roles que no lo tienen que ver.
 *    `clientes.viewAll` además lo tienen Ventas, Desarrollo y Marketing por default.
 *
 * 2. **Abrir UNA de las tres puertas y no las otras.** Las páginas, las APIs que leen o escriben
 *    por cuenta y el menú tienen que decir lo mismo: un menú que muestra lo que la página rechaza,
 *    o una API que contesta a quien la página echa, son el mismo error con otra cara.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** MENCIONAR NO ES USAR: varias de estas pantallas EXPLICAN en comentarios de dónde venía el gate
 *  viejo. Ese texto haría fallar un escaneo ingenuo, dejándolo verde solo si alguien borra la
 *  explicación — o sea, premiando lo contrario de lo que se quiere. */
const sinComentarios = (src: string) =>
  leer(src)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const PANTALLAS = [
  "app/(shell)/customer-success/page.tsx",
  "app/(shell)/customer-success/[clientId]/page.tsx",
];
const APIS = [
  "app/api/cs/account-brief/[clientId]/route.ts",
  "app/api/cs/alerts/route.ts",
  "app/api/cs/alerts/[alertId]/route.ts",
];
const AREA = [...PANTALLAS, ...APIS];

/**
 * Lo que se quedó en `seeAllClients` A PROPÓSITO, cada uno con su motivo. Son barridos caros que
 * recorren la cartera entera; las pantallas los ofrecen solo con `puedeCurar`.
 */
const SE_QUEDAN: Array<{ ruta: string; porque: string }> = [
  {
    ruta: "app/api/cs/watchdog/run/route.ts",
    porque: "barrido con LLM sobre la cartera entera: es caro y no es por cuenta",
  },
  {
    ruta: "app/api/cs/partner/refresh/route.ts",
    porque: "trae los datos de partner de toda la cartera desde HubSpot",
  },
  {
    ruta: "app/api/cs/signals/refresh/route.ts",
    porque: "recálculo masivo de señales, no una lectura por cuenta",
  },
];

describe("el área es de la CSL y dirección, por rol", () => {
  it("la lista es exactamente esa", () => {
    expect([...ROLES_DE_EXITO_DEL_CLIENTE]).toEqual(["CSL", "SUPER_ADMIN"]);
    for (const rol of ["CSL", "SUPER_ADMIN"]) expect(esLiderDeCs(rol), rol).toBe(true);
    for (const rol of ["CSE", "VENTAS", "DEV", "MARKETING", "ADMIN", "", null, undefined]) {
      expect(esLiderDeCs(rol), `${rol} entra a Éxito del cliente`).toBe(false);
    }
  });

  it("las dos pantallas preguntan el rol ANTES de cargar nada", () => {
    for (const p of PANTALLAS) {
      const src = sinComentarios(p);
      const gate = src.indexOf("if (!ctx || !esLiderDeCs(ctx.role)) redirect(");
      expect(gate, `${p} dejó de pedir el rol`).toBeGreaterThan(0);
      const carga = Math.min(
        ...["cargarCarteraDeLaCsl(", "loadCsAccount("].map((f) => src.indexOf(f)).filter((i) => i > 0),
      );
      expect(gate, `${p} carga datos antes de mirar el rol`).toBeLessThan(carga);
    }
  });

  it("las tres APIs por cuenta piden el mismo rol", () => {
    const sinGuard = APIS.filter((r) => !sinComentarios(r).includes("await guardLiderDeCs()"));
    expect(sinGuard, `estas APIs dejaron de pedir el rol:\n${sinGuard.join("\n")}`).toEqual([]);
  });

  it("el ítem del sidebar también, con la MISMA lista", () => {
    expect(sinComentarios("components/layout/nav-config.tsx")).toContain(
      'gate: { kind: "roles", roles: ROLES_DE_EXITO_DEL_CLIENTE }',
    );
  });

  it("⚠ la celda vieja quedó apagada, para que nadie crea que abre algo", () => {
    /* `enforced:false` hace que el modal de /team la oculte: un switch que no abre nada es un
       switch que miente. Si algún día se vuelve a usar, hay que volver a encenderla y decidir. */
    const accion = sectionByKey("customerSuccess")?.actions.find((a) => a.key === "read");
    expect(accion, "desapareció la sección customerSuccess").toBeDefined();
    expect(accion?.enforced, "la celda vieja volvió a mostrarse en el modal").toBe(false);
    const usos = AREA.filter((r) => sinComentarios(r).includes('"customerSuccess"'));
    expect(usos, `estas puertas volvieron a colgar de la celda:\n${usos.join("\n")}`).toEqual([]);
  });
});

describe("⭐ ninguna puerta pide «ver todos los clientes» para ENTRAR", () => {
  it("ningún gate de entrada usa esa celda", () => {
    /* Lo prohibido es el GATE, no la mención. Las dos pantallas PREGUNTAN por esa celda
       —`can(...)`— para decidir si pintan los controles que ESCRIBEN (refrescar señales, correr el
       vigía, fijar la salud), cuyos endpoints siguen en el gate viejo a propósito. */
    const GATES = [
      /(guardCapability|requireCapability|withCapability)\(\s*"seeAllClients"/,
      /(requirePermission|guardPermission)\(\s*"clientes",\s*"viewAll"/,
    ];
    const reatadas = AREA.filter((r) => GATES.some((re) => re.test(sinComentarios(r))));
    expect(
      reatadas,
      "Estas puertas volvieron a colgar de «ver todos los clientes», que Ventas, Desarrollo y " +
        `Marketing tienen por default:\n${reatadas.join("\n")}`,
    ).toEqual([]);
  });

  it("⚠ y la única mención sobreviviente es la PREGUNTA, no un gate sin nombrar", () => {
    /* La regla de arriba nombra los verbos de gate CONOCIDOS, así que un verbo nuevo se le
       escaparía. Esto cierra por el otro lado: en el área, toda aparición de esa celda tiene que
       ser exactamente la derivación de la bandera. */
    const DERIVACION = 'can(ctx.teamMember, "clientes", "viewAll")';
    const raras: string[] = [];
    for (const r of AREA) {
      const src = sinComentarios(r);
      const menciones = (src.match(/seeAllClients|"clientes",\s*"viewAll"/g) ?? []).length;
      const derivaciones = src.split(DERIVACION).length - 1;
      if (menciones !== derivaciones) {
        raras.push(`${r} (${menciones} menciones, ${derivaciones} derivaciones)`);
      }
    }
    expect(
      raras,
      `Estas puertas nombran «ver todos los clientes» de una forma que no es la pregunta:\n${raras.join("\n")}`,
    ).toEqual([]);
  });
});

describe("abrir el área no le abre la cartera al CSE", () => {
  it("⚠ al CSE no se le abrió `clientes.viewAll` de paso", () => {
    const m = (
      DEFAULT_MATRIX as unknown as Record<
        string,
        { sections?: Record<string, Record<string, boolean>> }
      >
    )["CSE"];
    expect(m?.sections?.clientes?.viewAll ?? false, "el CSE pasó a ver la cartera entera").toBe(
      false,
    );
  });
});

describe("lo que se quedó afuera está declarado, no olvidado", () => {
  it("las excepciones existen, siguen en el gate viejo y traen motivo", () => {
    for (const s of SE_QUEDAN) {
      const src = leer(s.ruta);
      expect(src, `${s.ruta} ya no usa seeAllClients: sácalo de SE_QUEDAN`).toContain(
        "seeAllClients",
      );
      expect(s.porque.length, `${s.ruta}: excepción sin motivo escrito`).toBeGreaterThan(20);
    }
  });
});
