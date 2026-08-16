import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MATRIX } from "./permissions/defaults";
import { sectionByKey } from "./permissions/registry";

/**
 * lib/auth/customer-success-propio.test.ts — VER TODOS LOS CLIENTES ≠ HACER ÉXITO DEL CLIENTE.
 *
 * ── QUÉ CAMBIÓ (2026-08-16) ──────────────────────────────────────────────────
 * El área de Éxito del cliente no tenía celda propia: cabalgaba sobre `clientes.viewAll` vía el
 * compat de `seeAllClients`. El resultado era exactamente al revés de lo que hace falta — el CSE,
 * que ES quien hace éxito del cliente, era el único rol operativo que no podía entrar a su propia
 * pantalla, mientras Ventas, Desarrollo y Marketing entraban por ser roles «que ven todo».
 *
 * ── LOS DOS ERRORES QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ─────────────────────
 *
 * 1. **Volver a atarlas.** Es el atajo tentador cuando algo del área no carga para un rol: darle
 *    `clientes.viewAll` «para que ande». Eso le abre la CARTERA ENTERA de la empresa a alguien
 *    que solo tenía que ver sus cuentas, y no rompe nada visible — la pantalla anda mejor.
 *
 * 2. **Confundir el acceso al área con el acceso al DATO DE PARTNER.** Uso, UUS y MRR de partner
 *    son confidenciales por los términos con HubSpot. Su chequeo es por ROL (`CSL`/`SUPER_ADMIN`)
 *    y vive en la página, no en esta celda. Si alguien lo reemplazara por la celda nueva
 *    «para unificar», todo CSE pasaría a ver los términos comerciales del partner.
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

const AREA = [
  "app/(shell)/customer-success/page.tsx",
  "app/(shell)/customer-success/[clientId]/page.tsx",
  "app/api/cs/account-brief/[clientId]/route.ts",
  "app/api/cs/alerts/route.ts",
  "app/api/cs/alerts/[alertId]/route.ts",
];

/**
 * Lo que se quedó en `seeAllClients` A PROPÓSITO, cada uno con su motivo. Son barridos caros o
 * sobre datos que la celda nueva no destraba; abrirlos es una decisión aparte, no un olvido.
 */
const SE_QUEDAN: Array<{ ruta: string; porque: string }> = [
  {
    ruta: "app/api/cs/watchdog/run/route.ts",
    porque: "barrido con LLM sobre la cartera entera: es caro y no es por cuenta",
  },
  {
    ruta: "app/api/cs/partner/refresh/route.ts",
    porque: "trae datos de partner, que siguen siendo de CSL y SUPER_ADMIN",
  },
  {
    ruta: "app/api/cs/signals/refresh/route.ts",
    porque: "recálculo masivo de señales, no una lectura por cuenta",
  },
];

describe("el área tiene celda propia y la exige", () => {
  it("la celda existe y está exigida de verdad", () => {
    const accion = sectionByKey("customerSuccess")?.actions.find((a) => a.key === "read");
    expect(accion, "desapareció la sección customerSuccess").toBeDefined();
    expect(accion?.enforced, "la celda quedó decorativa").toBe(true);
  });

  it("las cinco puertas del área piden la celda nueva", () => {
    const sinCelda = AREA.filter((r) => !leer(r).includes('"customerSuccess", "read"'));
    expect(sinCelda, `estas puertas del área dejaron de pedir la celda:\n${sinCelda.join("\n")}`)
      .toEqual([]);
  });

  it("⭐ y NINGUNA volvió a pedir «ver todos los clientes»", () => {
    /* El atajo que este test existe para cazar: re-atar el área a `clientes.viewAll` porque algo
       «no carga». Le abre la cartera entera de la empresa a quien solo tenía que ver sus cuentas,
       y no rompe nada visible.
       ⚠ Lo prohibido es el GATE, no la mención. Desde el 2026-08-16 las dos pantallas PREGUNTAN
       por esa celda —`can(...)`— para decidir si pintan los controles que ESCRIBEN (refrescar
       señales, correr el watchdog, fijar la salud), cuyos endpoints siguen en el gate viejo a
       propósito. Esa pregunta es lo que mantiene la escritura cerrada: prohibirla obligaría a
       ofrecer botones que rebotan con 403. Lo que no puede volver es exigirla para ENTRAR. */
    const GATES = [
      /(guardCapability|requireCapability|withCapability)\(\s*"seeAllClients"/,
      /requirePermission\(\s*"clientes",\s*"viewAll"/,
    ];
    const reatadas = AREA.filter((r) => GATES.some((re) => re.test(sinComentarios(r))));
    expect(
      reatadas,
      "Estas puertas volvieron a colgar de «ver todos los clientes». Eso le abre la cartera " +
        `entera a roles acotados:\n${reatadas.join("\n")}`,
    ).toEqual([]);
  });

  it("⚠ y la única mención sobreviviente es la PREGUNTA, no un gate sin nombrar", () => {
    /* La regla de arriba nombra los verbos de gate CONOCIDOS, así que un verbo nuevo se le
       escaparía. Esto cierra por el otro lado: en el área, toda aparición de esa celda tiene que
       ser exactamente la derivación de la bandera. Cualquier otra forma —conocida o inventada—
       queda desconocida y se pone roja hasta que alguien venga a declararla acá. */
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

  it("el ítem del sidebar también", () => {
    expect(leer("components/layout/nav-config.tsx")).toContain(
      'section: "customerSuccess", action: "read"',
    );
  });
});

describe("⚠ la celda NO destraba los datos de partner", () => {
  for (const p of [
    "app/(shell)/customer-success/page.tsx",
    "app/(shell)/customer-success/[clientId]/page.tsx",
  ]) {
    it(`${p} sigue decidiendo partner por ROL`, () => {
      /* Uso/UUS/MRR son confidenciales por los términos con HubSpot. Reemplazar este chequeo por
         la celda del área «para unificar» se leería como una simplificación y le mostraría los
         términos comerciales del partner a todo CSE. */
      const src = leer(p);
      expect(src, "el chequeo de partner dejó de ser por rol").toContain(
        'role === "CSL" || role === "SUPER_ADMIN"',
      );
      expect(src).toContain("canSeePartnerData");
    });
  }
});

describe("quién tiene la celda", () => {
  const celdas = (rol: string) => {
    const m = (
      DEFAULT_MATRIX as unknown as Record<
        string,
        { sections?: Record<string, Record<string, boolean>> }
      >
    )[rol];
    return Object.entries(m?.sections?.customerSuccess ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => k);
  };

  it("el CSE, que es de quien se trata", () => {
    expect(celdas("CSE")).toContain("read");
  });

  it("y ningún rol que la tenía PERDIÓ el acceso", () => {
    /* Los cuatro que entraban por `clientes.viewAll` la conservan: separar las celdas no puede
       sacarle el área a nadie, o sería una regresión disfrazada de refactor. */
    for (const rol of ["VENTAS", "DEV", "CSL", "MARKETING"]) {
      expect(celdas(rol), `${rol} perdió el acceso al área`).toContain("read");
    }
  });

  it("⚠ y al CSE no se le abrió `clientes.viewAll` de paso", () => {
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
      expect(src, `${s.ruta} ya no usa seeAllClients: sacalo de SE_QUEDAN`).toContain(
        "seeAllClients",
      );
      expect(s.porque.length, `${s.ruta}: excepción sin motivo escrito`).toBeGreaterThan(20);
    }
  });
});
