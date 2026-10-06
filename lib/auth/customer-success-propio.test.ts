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
 * 2. **Abrir UNA de las puertas y no las otras.** Las páginas, las APIs que leen o escriben por
 *    cuenta, el menú y el atajo «Ver portal del cliente» de la ficha del cliente tienen que decir lo
 *    mismo: un menú o un botón que muestra lo que la página rechaza, o una API que contesta a quien
 *    la página echa, son el mismo error con otra cara.
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
    /* Desde el 2026-10-05 (D14) la ruta tiene DOS puertas. La corrida de UN cliente o proyecto la
       pide cualquier interno con acceso a ese cliente («lo puede correr quien sea»), con el freno
       de una a la vez y 10 min entre pedidos. Lo que se queda en `seeAllClients` es solo el barrido. */
    porque:
      "solo el BARRIDO (sin cliente ni proyecto): hasta 10 llamadas a Claude sobre la cartera entera, " +
      "no es por cuenta. La corrida de un cliente la pide cualquier interno con acceso a él (D14)",
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
      const cargadores = ["cargarCarteraDeLaCsl(", "loadCsAccount("].map((f) => src.indexOf(f)).filter((i) => i > 0);
      /* Sin esto la comparación de abajo no podía fallar: si se renombra el cargador, la lista
         queda vacía, Math.min() da Infinity y «gate < Infinity» pasa siempre. */
      expect(
        cargadores.length,
        `${p} ya no llama a ningún cargador conocido: si se renombró, agrégalo a esta lista`,
      ).toBeGreaterThan(0);
      const carga = Math.min(...cargadores);
      expect(gate, `${p} carga datos antes de mirar el rol`).toBeLessThan(carga);
    }
  });

  it("⭐ la cuarta puerta: el atajo «Ver portal del cliente» de la ficha del cliente pide lo mismo que la página", () => {
    /* Colgaba de «ver todos los clientes» (`seeAllClients`), que Ventas, Desarrollo y Marketing
       tienen por default: les mostraba un botón que los mandaba a una página que los rebota. */
    const LAYOUT = "app/(shell)/clients/[id]/layout.tsx";
    const src = sinComentarios(LAYOUT);
    const atajo = /\{(\w+) && \(\s*<AccionDeCabecera href=\{`\/customer-success\/\$\{id\}`\}/.exec(src);
    expect(atajo, `${LAYOUT}: no encuentro el atajo condicionado a /customer-success/[id]`).not.toBeNull();
    const condicion = new RegExp(`const ${atajo![1]} = ([^;]+);`).exec(src)?.[1] ?? "";
    expect(condicion, `${LAYOUT}: «${atajo![1]}» tiene que salir del rol, como la página`).toContain("esLiderDeCs(");
    expect(condicion, `${LAYOUT}: el atajo volvió a colgar de «ver todos los clientes»`).not.toMatch(
      /seeAllClients|"clientes",\s*"viewAll"/,
    );
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

  it("⭐ el vigía de UN cliente lo pide cualquiera con acceso a ese cliente; solo el barrido sigue en seeAllClients (D14)", () => {
    /* Elías, 2026-10-05: «lo puede correr quien sea». La edición que pone esto en rojo: volver a
       poner `guardCapability("seeAllClients")` al principio del POST, antes de mirar si el pedido es
       de un cliente — la corrida por cliente quedaría otra vez solo para quien ve toda la cartera. */
    const RUTA = "app/api/cs/watchdog/run/route.ts";
    const src = sinComentarios(RUTA);
    const porCliente = src.indexOf("await guardAccessToClient(");
    const porProyecto = src.indexOf("await guardAccessToProject(");
    const barrido = src.indexOf('guardCapability("seeAllClients")');
    expect(porCliente, `${RUTA}: la corrida de un cliente dejó de pedir acceso a ESE cliente`).toBeGreaterThan(0);
    expect(porProyecto, `${RUTA}: la corrida de un proyecto dejó de pedir acceso a su cliente`).toBeGreaterThan(0);
    expect(barrido, `${RUTA}: el barrido dejó de pedir «ver todos los clientes»`).toBeGreaterThan(0);
    expect(
      Math.max(porCliente, porProyecto) < barrido,
      `${RUTA}: la corrida de un cliente quedó detrás del gate del barrido`,
    ).toBe(true);
    // Y el disparo al entrar, igual: quien abre la ficha del cliente.
    expect(sinComentarios("app/api/cs/watchdog/al-entrar/route.ts")).toContain("await guardAccessToClient(");
  });
});
