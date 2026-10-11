/**
 * lib/clients/fusion-cubre-el-esquema.test.ts — FUSIONAR DOS FICHAS NO BORRA MEMORIA EN SILENCIO.
 *
 * Correr: `npx vitest run lib/clients/fusion-cubre-el-esquema.test.ts`.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * scripts/merge-duplicate-clients.ts muda a la ficha que sigue lo que cuelga de la otra y después BORRA la otra. Lo
 * que todavía le apunta en ese momento Postgres lo borra en cascada o lo deja sin cliente, sin un solo error. Hasta el
 * 2026-10-09 se perdían así las solicitudes fuera de alcance, las licencias, la clasificación de la cartera, las
 * correcciones del color, las preguntas de tiempo y los clientes de Mercury de la cuenta: tablas nuevas que nadie
 * sumó a la lista del script.
 *
 * Este test lee prisma/schema.prisma, junta TODAS las relaciones hacia `Client` (y hacia la cuenta de cobro, que la
 * fusión también borra) más los ids de una ficha guardados sin relación, y exige que cada una esté declarada en UNA
 * lista de lib/clients/fusion-de-empresas.ts. Una tabla nueva entra sola: si nadie decide qué pasa con ella al
 * fusionar, la suite se pone roja.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CON_REGLA_PROPIA,
  DE_LA_CUENTA,
  SE_BORRAN_A_PROPOSITO,
  SE_MUDAN,
  SE_QUEDAN_A_PROPOSITO,
  SIN_CHOCAR,
  TABLAS_DE_LA_FUSION,
  UNO_A_UNO,
  tablaDe,
} from "./fusion-de-empresas";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8").replace(/\r/g, "");
const LIB = "lib/clients/fusion-de-empresas.ts";

/**
 * Campos cuyo NOMBRE parece un id de una ficha (la heurística de `pareceIdDeFicha`) y no lo son. Clave «modelo.columna».
 * Solo para la heurística de este test: lo que SÍ es un id de una ficha va en una lista de la librería.
 */
const NO_APUNTAN_A_LA_FICHA: Readonly<Record<string, string>> = {
  "clientPartnerSnapshot.hubspotPartnerClientId": "es el id del registro de Partner Clients en HubSpot, no una ficha de Nexus",
  "partnerUsageSnapshot.hubspotPartnerClientId": "es el id del registro de Partner Clients en HubSpot, no una ficha de Nexus",
  "cuotaComisionVendedor.cliente": "es el nombre del cliente tal como lo escribe la tabla de comisiones, no un id",
};

/* ── El lector del esquema ─────────────────────────────────────────────────────── */

interface Campo {
  nombre: string;
  tipo: string;
  lista: boolean;
  atributos: string;
}
interface Modelo {
  nombre: string;
  campos: Campo[];
  /** Las líneas `@@…` del modelo. */
  bloque: string[];
}

/** Saca el comentario `//` de una línea, sin cortar adentro de un texto entre comillas. */
function sinComentario(linea: string): string {
  let enTexto = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"' && linea[i - 1] !== "\\") enTexto = !enTexto;
    else if (!enTexto && c === "/" && linea[i + 1] === "/") return linea.slice(0, i);
  }
  return linea;
}

function leerModelos(): Map<string, Modelo> {
  const esquema = leer("prisma/schema.prisma");
  const modelos = new Map<string, Modelo>();
  for (const m of esquema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const modelo: Modelo = { nombre: m[1]!, campos: [], bloque: [] };
    for (const cruda of m[2]!.split("\n")) {
      const linea = sinComentario(cruda).trim();
      if (!linea) continue;
      if (linea.startsWith("@@")) {
        modelo.bloque.push(linea);
        continue;
      }
      const f = linea.match(/^(\w+)\s+(\w+)(\[\]|\?)?(?:\s+(.*))?$/);
      if (f) modelo.campos.push({ nombre: f[1]!, tipo: f[2]!, lista: f[3] === "[]", atributos: f[4] ?? "" });
    }
    modelos.set(modelo.nombre, modelo);
  }
  return modelos;
}

const MODELOS = leerModelos();
/** `StageNote` → `stageNote`: el nombre del delegado de Prisma, que es como lo nombran las listas. */
const delegadoDe = (modelo: string) => modelo.charAt(0).toLowerCase() + modelo.slice(1);
const columnasDe = (atributos: string) =>
  (atributos.match(/fields:\s*\[([^\]]*)\]/)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

interface Relacion {
  /** «modelo.columna», como en las listas. */
  clave: string;
  modelo: string;
  columna: string;
  onDelete: string;
}

/** Las relaciones que apuntan a `destino` desde OTROS modelos (el lado que guarda la columna). */
function relacionesHacia(destino: string): Relacion[] {
  const out: Relacion[] = [];
  for (const m of MODELOS.values()) {
    if (m.nombre === destino) continue;
    for (const c of m.campos) {
      if (c.tipo !== destino || c.lista) continue;
      const columnas = columnasDe(c.atributos);
      if (!columnas.length) continue; // el otro lado de un uno a uno: la columna vive en `destino`
      const onDelete = c.atributos.match(/onDelete:\s*(\w+)/)?.[1] ?? "sin declarar";
      for (const columna of columnas) out.push({ clave: `${delegadoDe(m.nombre)}.${columna}`, modelo: m.nombre, columna, onDelete });
    }
  }
  return out;
}

/** El nombre parece un id de una ficha: `clientId`, `clienteId`, `manualClientId`, `fotoCliente`… */
const pareceIdDeFicha = (nombre: string) => /^cliente?(?:Id)?$|Cliente?(?:Id)?$/.test(nombre);

/** Campos de texto que parecen un id de una ficha y NO son la columna de ninguna relación de su modelo. */
function punterosSinRelacion(): Relacion[] {
  const out: Relacion[] = [];
  for (const m of MODELOS.values()) {
    if (m.nombre === "Client") continue;
    const deRelaciones = new Set(m.campos.flatMap((c) => columnasDe(c.atributos)));
    for (const c of m.campos) {
      if (c.tipo !== "String" || c.lista || deRelaciones.has(c.nombre) || !pareceIdDeFicha(c.nombre)) continue;
      out.push({ clave: `${delegadoDe(m.nombre)}.${c.nombre}`, modelo: m.nombre, columna: c.nombre, onDelete: "sin relación" });
    }
  }
  return out;
}

const HACIA_LA_FICHA = relacionesHacia("Client");
const HACIA_LA_CUENTA = relacionesHacia("CuentaFinanciera");
const PUNTEROS = punterosSinRelacion();

/* ── Lo declarado en la librería ───────────────────────────────────────────────── */

const DECLARADAS: Array<{ clave: string; lista: string }> = [
  ...SE_MUDAN.map(([m, c]) => ({ clave: `${m}.${c}`, lista: "SE_MUDAN" })),
  ...SIN_CHOCAR.map((s) => ({ clave: `${s.modelo}.clientId`, lista: "SIN_CHOCAR" })),
  ...UNO_A_UNO.map((m) => ({ clave: `${m}.clientId`, lista: "UNO_A_UNO" })),
  ...DE_LA_CUENTA.map((m) => ({ clave: `${m}.cuentaId`, lista: "DE_LA_CUENTA" })),
  ...Object.keys(CON_REGLA_PROPIA).map((clave) => ({ clave, lista: "CON_REGLA_PROPIA" })),
  ...Object.keys(SE_BORRAN_A_PROPOSITO).map((clave) => ({ clave, lista: "SE_BORRAN_A_PROPOSITO" })),
  ...Object.keys(SE_QUEDAN_A_PROPOSITO).map((clave) => ({ clave, lista: "SE_QUEDAN_A_PROPOSITO" })),
];
const LISTA_DE = new Map(DECLARADAS.map((d) => [d.clave, d.lista]));

const queLePasa = (onDelete: string, de: "ficha" | "cuenta" = "ficha") =>
  onDelete === "Cascade"
    ? "fusionar dos fichas BORRA esas filas en silencio"
    : onDelete === "SetNull"
      ? `fusionar dos fichas deja esas filas SIN ${de === "ficha" ? "cliente" : "cuenta de cobro"}`
      : "fusionar dos fichas deja esas filas apuntando a una ficha que ya no existe";

describe("el lector del esquema encuentra todo (si no, la guarda pasa por vacío)", () => {
  it("encuentra las relaciones hacia la ficha y hacia la cuenta", () => {
    expect(MODELOS.size, "no se leyó ningún modelo de prisma/schema.prisma").toBeGreaterThan(100);
    expect(HACIA_LA_FICHA.length, "el lector dejó de encontrar las relaciones hacia Client").toBeGreaterThan(30);
    expect(HACIA_LA_CUENTA.length, "el lector dejó de encontrar las relaciones hacia CuentaFinanciera").toBeGreaterThan(5);
    expect(PUNTEROS.length, "el lector dejó de encontrar los ids de una ficha sin relación").toBeGreaterThan(3);
  });

  it("cada lista del otro lado (en Client y en CuentaFinanciera) tiene su relación leída", () => {
    /* Una relación escrita en varias líneas, o con una forma que el lector no conoce, se saltearía sin aviso. Los dos
       lados tienen que coincidir: lo que Client lista como suyo es lo que el lector encontró apuntándole. */
    for (const [destino, leidas] of [
      ["Client", HACIA_LA_FICHA],
      ["CuentaFinanciera", HACIA_LA_CUENTA],
    ] as const) {
      const otroLado = new Set(
        MODELOS.get(destino)!
          .campos.filter((c) => MODELOS.has(c.tipo) && c.tipo !== destino && !columnasDe(c.atributos).length)
          .map((c) => c.tipo),
      );
      const encontradas = new Set(leidas.map((r) => r.modelo));
      const faltan = [...otroLado].filter((t) => !encontradas.has(t));
      const sobran = [...encontradas].filter((t) => !otroLado.has(t));
      expect(faltan, `${destino} lista estas relaciones y el lector no las encontró: arregla el lector`).toEqual([]);
      expect(sobran, `el lector encontró relaciones hacia ${destino} que ${destino} no lista: arregla el lector`).toEqual([]);
    }
  });
});

describe("⛔ fusionar dos fichas no borra memoria en silencio", () => {
  it("LA guarda: toda relación hacia Client está en una lista de la librería", () => {
    const faltan = HACIA_LA_FICHA.filter((r) => !LISTA_DE.has(r.clave)).map(
      (r) =>
        `· "${r.clave}" (${r.modelo}.${r.columna} → Client, onDelete: ${r.onDelete}): ${queLePasa(r.onDelete)}.`,
    );
    expect(
      faltan,
      `Estas tablas apuntan a la ficha y nadie decidió qué pasa con ellas al fusionar dos:\n${faltan.join("\n")}\n\n` +
        `Decláralas en ${LIB}: SE_MUDAN si se muda cambiando la columna, SIN_CHOCAR si tiene un @@unique con ` +
        `clientId, UNO_A_UNO si es una por ficha, o SE_BORRAN_A_PROPOSITO con el motivo.`,
    ).toEqual([]);
  });

  it("todo id de una ficha guardado sin relación está en una lista", () => {
    const faltan = PUNTEROS.filter((r) => !LISTA_DE.has(r.clave) && !(r.clave in NO_APUNTAN_A_LA_FICHA)).map(
      (r) => `· "${r.clave}" (${r.modelo}.${r.columna}, sin relación): ${queLePasa(r.onDelete)}.`,
    );
    expect(
      faltan,
      `Estos campos parecen el id de una ficha y nadie decidió qué pasa con ellos al fusionar dos:\n${faltan.join("\n")}\n\n` +
        `Si son el id de una ficha, decláralos en ${LIB} (SE_MUDAN para mudarlos, SE_QUEDAN_A_PROPOSITO con el motivo ` +
        `para dejarlos). Si no lo son (un nombre, un id de HubSpot), en NO_APUNTAN_A_LA_FICHA de este test.`,
    ).toEqual([]);
  });

  it("toda relación hacia la cuenta de cobro está en DE_LA_CUENTA o en SE_BORRAN_A_PROPOSITO", () => {
    /* Cuando las dos fichas tienen cuenta, la de la absorbida se borra al final, ya vacía. Lo que no se mudó se va con
       ella (los clientes de Mercury quedaban desvinculados hasta el 2026-10-09). */
    const faltan = HACIA_LA_CUENTA.filter((r) => LISTA_DE.get(r.clave) !== "DE_LA_CUENTA" && LISTA_DE.get(r.clave) !== "SE_BORRAN_A_PROPOSITO").map(
      (r) => `· "${delegadoDe(r.modelo)}" (${r.modelo}.${r.columna} → CuentaFinanciera, onDelete: ${r.onDelete}): ${queLePasa(r.onDelete, "cuenta")}.`,
    );
    expect(
      faltan,
      `Estas tablas cuelgan de la cuenta de cobro y la fusión no las muda:\n${faltan.join("\n")}\n\n` +
        `Súmalas a DE_LA_CUENTA en ${LIB} (o a SE_BORRAN_A_PROPOSITO con el motivo, por «modelo.cuentaId»).`,
    ).toEqual([]);
  });

  it("lo declarado existe en el esquema: una entrada vieja o mal escrita no tapa nada", () => {
    const deLaFicha = new Set([...HACIA_LA_FICHA, ...PUNTEROS].map((r) => r.clave));
    const deLaCuenta = new Set(HACIA_LA_CUENTA.map((r) => r.clave));
    const malas: string[] = [];
    for (const d of DECLARADAS) {
      const existe =
        d.lista === "DE_LA_CUENTA"
          ? deLaCuenta.has(d.clave)
          : d.lista === "SE_BORRAN_A_PROPOSITO"
            ? deLaFicha.has(d.clave) || deLaCuenta.has(d.clave)
            : deLaFicha.has(d.clave);
      if (!existe) malas.push(`${d.lista}: "${d.clave}"`);
    }
    for (const clave of Object.keys(NO_APUNTAN_A_LA_FICHA)) {
      if (!PUNTEROS.some((r) => r.clave === clave)) malas.push(`NO_APUNTAN_A_LA_FICHA (este test): "${clave}"`);
    }
    expect(malas, `Estas entradas no son una relación ni un id de una ficha en el esquema. Corrígelas o sácalas:\n${malas.join("\n")}`).toEqual([]);
  });

  it("ninguna tabla está en dos listas", () => {
    const vistas = new Map<string, string>();
    const repetidas: string[] = [];
    for (const d of DECLARADAS) {
      const antes = vistas.get(d.clave);
      if (antes) repetidas.push(`"${d.clave}" está en ${antes} y en ${d.lista}`);
      else vistas.set(d.clave, d.lista);
    }
    expect(repetidas, "Una tabla va en UNA sola lista: dos reglas para la misma tabla no se pueden cumplir juntas").toEqual([]);
  });

  it("cada motivo dice algo", () => {
    const motivos = { ...CON_REGLA_PROPIA, ...SE_BORRAN_A_PROPOSITO, ...SE_QUEDAN_A_PROPOSITO, ...NO_APUNTAN_A_LA_FICHA };
    const cortos = Object.entries(motivos).filter(([, m]) => m.trim().length < 20).map(([k]) => k);
    expect(cortos, "Estas entradas no dicen por qué: el motivo es lo que se lee antes de cambiarlas").toEqual([]);
  });
});

describe("cada lista calza con la forma de su tabla", () => {
  /* Un modelo que no existe lo reporta «lo declarado existe en el esquema»: acá se saltea para no tapar ese mensaje. */
  const existe = (delegado: string) => MODELOS.has(tablaDe(delegado));
  const campo = (delegado: string, nombre: string) => MODELOS.get(tablaDe(delegado))?.campos.find((c) => c.nombre === nombre);
  /** Las columnas de cada @@unique / @@id del modelo. */
  const unicosCompuestos = (delegado: string) =>
    (MODELOS.get(tablaDe(delegado))?.bloque ?? [])
      .filter((l) => /^@@(?:unique|id)\(/.test(l))
      .map((l) => (l.match(/\[([^\]]*)\]/)?.[1] ?? "").split(",").map((s) => s.trim().split("(")[0]!));
  const esUnica = (delegado: string, columna: string) => {
    const c = campo(delegado, columna);
    return !!c && /@(?:unique|id)\b/.test(c.atributos);
  };

  it("SE_MUDAN y DE_LA_CUENTA: la columna que se cambia no está en ningún único (si no, el updateMany choca)", () => {
    const malas: string[] = [];
    for (const [m, c] of [...SE_MUDAN, ...DE_LA_CUENTA.map((m) => [m, "cuentaId"] as const)]) {
      if (esUnica(m, c)) malas.push(`${m}.${c} es @unique o @id: va en UNO_A_UNO`);
      if (unicosCompuestos(m).some((u) => u.includes(c))) malas.push(`${m}.${c} está en un @@unique: va en SIN_CHOCAR`);
    }
    expect(malas, `Mudar estas columnas en bloque puede chocar con un único y tirar la transacción:\n${malas.join("\n")}`).toEqual([]);
  });

  it("SIN_CHOCAR: su clave es exactamente un @@unique de la tabla con clientId", () => {
    const malas: string[] = [];
    for (const s of SIN_CHOCAR.filter((x) => existe(x.modelo))) {
      const esperado = new Set(["clientId", ...s.clave]);
      const calza = unicosCompuestos(s.modelo).some((u) => u.length === esperado.size && u.every((c) => esperado.has(c)));
      if (!calza) malas.push(`${s.modelo}: no tiene @@unique([${[...esperado].join(", ")}])`);
    }
    expect(malas, `La clave de SIN_CHOCAR tiene que ser la del único, o lo que «choca» no es lo que la base rechaza:\n${malas.join("\n")}`).toEqual([]);
  });

  it("UNO_A_UNO: clientId es @unique o @id (una por ficha de verdad)", () => {
    const malas = UNO_A_UNO.filter((m) => existe(m) && !esUnica(m, "clientId"));
    expect(malas, "Estas no son una por ficha: si la absorbida tiene varias, el script solo vería una").toEqual([]);
  });

  it("SE_MUDAN, SIN_CHOCAR y DE_LA_CUENTA tienen `id` de texto (el script las cuenta, muda y respalda por id)", () => {
    const modelos = [...SE_MUDAN.map(([m]) => m), ...SIN_CHOCAR.map((s) => s.modelo), ...DE_LA_CUENTA];
    const malas = [...new Set(modelos)].filter(existe).filter((m) => {
      const id = campo(m, "id");
      return !id || id.tipo !== "String" || !/@id\b/.test(id.atributos);
    });
    expect(malas, "Estas tablas no tienen `id String @id`: necesitan una regla propia en el script").toEqual([]);
  });

  it("el respaldo cubre todas las tablas que escribe la fusión, y existen", () => {
    const escribe = [
      "Client",
      "CuentaFinanciera",
      ...SE_MUDAN.map(([m]) => tablaDe(m)),
      ...SIN_CHOCAR.map((s) => tablaDe(s.modelo)),
      ...UNO_A_UNO.map(tablaDe),
      ...DE_LA_CUENTA.map(tablaDe),
    ];
    expect(escribe.filter((t) => !TABLAS_DE_LA_FUSION.includes(t)), "el pg_dump no respaldaría estas tablas").toEqual([]);
    expect(TABLAS_DE_LA_FUSION.filter((t) => !MODELOS.has(t)), "estas tablas del respaldo no existen en el esquema").toEqual([]);
  });
});

describe("el script recorre las listas de la librería", () => {
  /* Si el script volviera a tener sus propias listas, este test cubriría unas listas que nadie usa. */
  const src = leer("scripts/merge-duplicate-clients.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const LISTAS = ["SE_MUDAN", "SIN_CHOCAR", "UNO_A_UNO", "DE_LA_CUENTA", "SE_QUEDAN_A_PROPOSITO", "TABLAS_DE_LA_FUSION"];

  it("las importa de la librería y no las vuelve a declarar", () => {
    const importa = src.match(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/clients\/fusion-de-empresas"/)?.[1] ?? "";
    for (const lista of LISTAS) {
      expect(importa, `el script dejó de importar ${lista} de la librería`).toMatch(new RegExp(`\\b${lista}\\b`));
      expect(src, `el script volvió a declarar su propia ${lista}`).not.toMatch(new RegExp(`\\b(?:const|let|var)\\s+${lista}\\b`));
      expect(src.split(lista).length - 1, `el script importa ${lista} y no la usa`).toBeGreaterThanOrEqual(2);
    }
  });

  it("la cuenta de cobro tiene su regla propia en el script", () => {
    expect(src, "la cuenta de la absorbida ya no se muda entera").toContain("tx.cuentaFinanciera.update");
    expect(src, "la cuenta de la absorbida ya no se borra, ya vacía").toContain("tx.cuentaFinanciera.delete");
  });
});
