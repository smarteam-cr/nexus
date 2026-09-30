/**
 * lib/db/salud-del-esquema.test.ts — el chequeo de esquema de `/api/health`: barato, y solo falla con prueba.
 *
 * Correr: `npx vitest run lib/db/salud-del-esquema.test.ts --project unit`.
 *
 * ── LO QUE ESTE ARCHIVO CUIDA ────────────────────────────────────────────────
 * `/api/health` es de alto riesgo: el healthcheck del compose lo llama cada 15 s y `deploy.sh`
 * decide con él si revierte. El chequeo de esquema que se le sumó el 2026-09-30 tiene que cumplir
 * cuatro cosas a la vez, y cada una se rompe con una edición chica:
 *   1. en verde no vuelve a consultar (una consulta por proceso, no una cada 15 s);
 *   2. nunca dos consultas a la vez, y quien pregunta espera como mucho el tope;
 *   3. un error de red NO es «falta la columna»: no apaga la salud ni revierte un deploy;
 *   4. un atraso probado no parpadea a verde — un solo healthcheck bueno le alcanza a Docker para
 *      dar por sano el contenedor.
 * Más tres guardas sobre el repo de verdad: el dmmf del cliente generado sigue trayendo los
 * modelos, ningún enum está mapeado, y la ruta apaga el `ok` solo con el atraso probado.
 */
import fs from "node:fs";
import path from "node:path";
import { $Enums, Prisma, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PIVOTES_IMPLICITAS, esquemaDesdeCatalogo, type Esquema } from "./esquema-esperado";
import {
  AVISO_SIN_VERIFICAR_CADA_MS,
  MAX_EN_LA_SALUD,
  REINTENTO_ATRASADO_MS,
  REINTENTO_SIN_VERIFICAR_MS,
  TOPE_MS,
  crearVerificadorDeEsquema,
  esperadoDeEsteCliente,
  leerEsquemaDeLaBase,
  textoDeLaSalud,
} from "./salud-del-esquema";

const esquema = (tablas: Record<string, string[]>, enums: Record<string, string[]> = {}): Esquema => ({
  tablas: new Map(Object.entries(tablas).map(([t, cols]) => [t, new Set(cols)])),
  enums: new Map(Object.entries(enums).map(([e, vals]) => [e, new Set(vals)])),
});

const ESPERADO = esquema({ SessionProject: ["id", "planningOverride"] }, { Fuente: ["AGENT"] });
const AL_DIA = esquema({ SessionProject: ["id", "planningOverride", "deMas"] }, { Fuente: ["AGENT", "HUMAN"] });
const SIN_EL_SQL = esquema({ SessionProject: ["id"] }, { Fuente: ["AGENT"] });
const FALTA = { estado: "atrasado", faltantes: [{ clase: "columna", tabla: "SessionProject", columna: "planningOverride" }] };

/** Una lectura que se resuelve cuando el test lo decide: así se prueba qué pasa MIENTRAS está en vuelo. */
function lecturaManual() {
  const pendientes: Array<{ resolver: (e: Esquema) => void; rechazar: (e: unknown) => void }> = [];
  const leer = vi.fn(() => new Promise<Esquema>((resolver, rechazar) => pendientes.push({ resolver, rechazar })));
  return { leer, pendientes };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("crearVerificadorDeEsquema — en verde", () => {
  it("⛔ consulta UNA vez y guarda el verde para todo el proceso", async () => {
    /* La edición que lo pone en rojo: ponerle vencimiento al verde. El healthcheck llama cada 15 s;
       con un vencimiento, cada contenedor sumaría una consulta al catálogo por cada uno, para siempre. */
    const leer = vi.fn(async () => AL_DIA);
    const avisos: string[] = [];
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: (l) => avisos.push(l) });

    expect(await verificar()).toEqual({ estado: "ok" });
    await vi.advanceTimersByTimeAsync(24 * 3_600_000);
    expect(await verificar()).toEqual({ estado: "ok" });
    expect(await verificar()).toEqual({ estado: "ok" });
    expect(leer).toHaveBeenCalledTimes(1);
    expect(avisos).toEqual([]);
  });

  it("lo que espera el código se calcula una sola vez", async () => {
    const esperado = vi.fn(() => ESPERADO);
    const leer = vi.fn(async () => SIN_EL_SQL);
    const verificar = crearVerificadorDeEsquema({ esperado, leer, avisar: () => {} });
    await verificar();
    await vi.advanceTimersByTimeAsync(REINTENTO_ATRASADO_MS);
    await verificar();
    expect(leer).toHaveBeenCalledTimes(2);
    expect(esperado).toHaveBeenCalledTimes(1);
  });
});

describe("crearVerificadorDeEsquema — con la base atrasada", () => {
  it("dice qué falta, lo anota en el log y no vuelve a consultar hasta el reintento", async () => {
    const leer = vi.fn(async () => SIN_EL_SQL);
    const avisos: string[] = [];
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: (l) => avisos.push(l) });

    expect(await verificar()).toEqual(FALTA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("[esquema] 2026-09-30T12:00:00.000Z ⛔ la base está ATRÁS del código: faltan 1");
    expect(avisos[0]).toContain("columna SessionProject.planningOverride");
    expect(avisos[0]).toContain("scripts/sql/");

    await vi.advanceTimersByTimeAsync(REINTENTO_ATRASADO_MS - 1);
    expect(await verificar()).toEqual(FALTA);
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("el log nombra TODO lo que falta (no es público); la salud, pocos", async () => {
    /* Es lo que deploy.sh imprime antes de revertir: con la lista cortada, quien despliega no sabe
       qué SQL le falta. */
    const columnas = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const avisos: string[] = [];
    const verificar = crearVerificadorDeEsquema({
      esperado: () => esquema({ T: ["id", ...columnas] }),
      leer: async () => esquema({ T: ["id"] }),
      avisar: (l) => avisos.push(l),
    });
    const salud = await verificar();
    expect(avisos[0]).toContain("faltan 30");
    for (const c of columnas) expect(avisos[0]).toContain(`columna T.${c}`);
    expect(avisos[0]).not.toContain(" más.");
    expect(textoDeLaSalud(salud)).toContain(`y ${30 - MAX_EN_LA_SALUD} más`);
  });

  it("al correr el SQL que faltaba se pone en verde sola, sin reiniciar, y queda guardada", async () => {
    let base = SIN_EL_SQL;
    const leer = vi.fn(async () => base);
    const avisos: string[] = [];
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: (l) => avisos.push(l) });

    expect((await verificar()).estado).toBe("atrasado");
    base = AL_DIA;
    await vi.advanceTimersByTimeAsync(REINTENTO_ATRASADO_MS);
    expect(await verificar()).toEqual({ estado: "ok" });
    expect(avisos.at(-1)).toContain("✓ la base ya tiene todo lo que este código espera");

    await vi.advanceTimersByTimeAsync(10 * REINTENTO_ATRASADO_MS);
    expect(await verificar()).toEqual({ estado: "ok" });
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it("⛔ un atraso probado no lo levanta un error de red: solo otra lectura que lo desmienta", async () => {
    /* La edición que lo pone en rojo: guardar «sin verificar» encima del atraso. Durante un deploy,
       un solo healthcheck que responda 200 le alcanza a Docker para dar por sano el contenedor:
       `deploy.sh` seguiría de largo con la base atrasada. */
    const leer = vi
      .fn<() => Promise<Esquema>>()
      .mockResolvedValueOnce(SIN_EL_SQL)
      .mockRejectedValueOnce(new Error("Connection terminated unexpectedly"))
      .mockResolvedValueOnce(AL_DIA);
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: () => {} });

    expect(await verificar()).toEqual(FALTA);
    await vi.advanceTimersByTimeAsync(REINTENTO_ATRASADO_MS);
    expect(await verificar()).toEqual(FALTA);
    // Tras el error sigue esperando su reintento de 30 s, no el de 1 s de «sin verificar».
    await vi.advanceTimersByTimeAsync(REINTENTO_SIN_VERIFICAR_MS);
    expect(await verificar()).toEqual(FALTA);
    expect(leer).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(REINTENTO_ATRASADO_MS);
    expect(await verificar()).toEqual({ estado: "ok" });
  });

  it("⛔ tampoco parpadea si la relectura tarda más que el tope", async () => {
    const { leer, pendientes } = lecturaManual();
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: () => {} });

    const primera = verificar();
    pendientes[0].resolver(SIN_EL_SQL);
    expect(await primera).toEqual(FALTA);

    await vi.advanceTimersByTimeAsync(REINTENTO_ATRASADO_MS);
    const segunda = verificar();
    await vi.advanceTimersByTimeAsync(TOPE_MS);
    expect(await segunda).toEqual(FALTA);
  });
});

describe("crearVerificadorDeEsquema — cuando no se puede mirar", () => {
  it("⛔ un error de la base es «sin verificar», no «atrasada», y no lanza", async () => {
    /* La edición que lo pone en rojo: tratar el error como atraso (o dejarlo salir). Un corte de red
       de un segundo durante un deploy lo revertiría, y en el healthcheck marcaría el contenedor. */
    const leer = vi.fn(async (): Promise<Esquema> => {
      throw new Error("Can't reach database server at `db.ejemplo.supabase.co:5432`");
    });
    const avisos: string[] = [];
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: (l) => avisos.push(l) });

    const salud = await verificar();
    expect(salud).toEqual({
      estado: "sin_verificar",
      motivo: "no se pudo leer el catálogo de la base",
      detalle: "Can't reach database server at `db.ejemplo.supabase.co:5432`",
    });
    // El error crudo (que trae el host) va al log y NO al texto de la salud, que es pública.
    expect(avisos[0]).toContain("db.ejemplo.supabase.co");
    expect(textoDeLaSalud(salud)).toBe("sin verificar: no se pudo leer el catálogo de la base");
  });

  it("reintenta en la llamada siguiente (pasado un segundo): el smoke de deploy.sh tiene su segunda oportunidad", async () => {
    const leer = vi
      .fn<() => Promise<Esquema>>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(SIN_EL_SQL);
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: () => {} });

    expect((await verificar()).estado).toBe("sin_verificar");
    expect((await verificar()).estado).toBe("sin_verificar");
    expect(leer).toHaveBeenCalledTimes(1);
    // deploy.sh espera 2 s entre que el contenedor queda healthy y el smoke.
    expect(REINTENTO_SIN_VERIFICAR_MS).toBeLessThan(2_000);
    await vi.advanceTimersByTimeAsync(REINTENTO_SIN_VERIFICAR_MS);
    expect(await verificar()).toEqual(FALTA);
  });

  it("«sin verificar» se anota como mucho una vez por minuto", async () => {
    const leer = vi.fn(async (): Promise<Esquema> => {
      throw new Error("timeout");
    });
    const avisos: string[] = [];
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: (l) => avisos.push(l) });
    for (let i = 0; i < 20; i++) {
      await verificar();
      await vi.advanceTimersByTimeAsync(REINTENTO_SIN_VERIFICAR_MS);
    }
    expect(leer).toHaveBeenCalledTimes(20);
    expect(avisos).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(AVISO_SIN_VERIFICAR_CADA_MS);
    await verificar();
    expect(avisos).toHaveLength(2);
  });

  it("si el cliente Prisma no expone sus modelos, no afirma nada y ni consulta", async () => {
    // Una versión de Prisma sin dmmf no puede convertir «no sé qué espero» en «falta todo».
    const leer = vi.fn(async () => AL_DIA);
    const verificar = crearVerificadorDeEsquema({ esperado: () => esquema({}), leer, avisar: () => {} });
    expect(await verificar()).toEqual({ estado: "sin_verificar", motivo: "el cliente Prisma no expone su modelo de datos" });
    expect(leer).not.toHaveBeenCalled();
  });

  it("⛔ un catálogo sin ninguna tabla es no haber visto la base, no que falte todo", async () => {
    const leer = vi.fn(async () => esquema({}));
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: () => {} });
    expect(await verificar()).toEqual({ estado: "sin_verificar", motivo: "el catálogo de la base no devolvió ninguna tabla" });
  });

  it("un aviso que falla no deja la verificación colgada", async () => {
    const verificar = crearVerificadorDeEsquema({
      esperado: () => ESPERADO,
      leer: async () => SIN_EL_SQL,
      avisar: () => {
        throw new Error("stderr cerrado");
      },
    });
    expect(await verificar()).toEqual(FALTA);
  });
});

describe("crearVerificadorDeEsquema — una sola consulta a la vez, con tope", () => {
  it("dos llamadas simultáneas comparten la misma consulta", async () => {
    const { leer, pendientes } = lecturaManual();
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: () => {} });
    const a = verificar();
    const b = verificar();
    expect(leer).toHaveBeenCalledTimes(1);
    pendientes[0].resolver(AL_DIA);
    expect(await a).toEqual({ estado: "ok" });
    expect(await b).toEqual({ estado: "ok" });
  });

  it("⛔ quien pregunta espera como mucho el tope; la consulta sigue y su resultado queda guardado", async () => {
    /* El healthcheck del compose corta a los 5 s: un catálogo lento no puede volver lenta la salud. */
    expect(TOPE_MS).toBeLessThan(5_000);
    const { leer, pendientes } = lecturaManual();
    const avisos: string[] = [];
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: (l) => avisos.push(l) });

    const primera = verificar();
    await vi.advanceTimersByTimeAsync(TOPE_MS);
    expect(await primera).toEqual({ estado: "sin_verificar", motivo: `la consulta al catálogo tardó más de ${TOPE_MS} ms` });
    expect(avisos[0]).toContain(`⚠ no se pudo comparar el esquema con la base: la consulta al catálogo tardó más de ${TOPE_MS} ms`);

    // La consulta sigue en vuelo; cuando termina, lo que encontró queda para la llamada siguiente.
    pendientes[0].resolver(SIN_EL_SQL);
    await vi.advanceTimersByTimeAsync(0);
    expect(await verificar()).toEqual(FALTA);
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("quien llega con la consulta ya en vuelo espera solo lo que le queda al tope", async () => {
    const { leer } = lecturaManual();
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: () => {} });
    void verificar();
    await vi.advanceTimersByTimeAsync(TOPE_MS - 500);
    let respondio = false;
    const tardia = verificar().then((r) => {
      respondio = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(respondio).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(respondio).toBe(true);
    expect((await tardia).estado).toBe("sin_verificar");
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("⛔ una consulta colgada no se vuelve a esperar: el healthcheck siguiente responde al instante", async () => {
    /* La edición que lo pone en rojo: esperar el tope ENTERO en cada llamada. Con una conexión medio
       abierta con el pooler, cada healthcheck pagaría 3 de sus 5 s, para siempre. Y tampoco se lanza
       otra consulta al lado: cada una dejaría otra conexión tomada. */
    const { leer } = lecturaManual();
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: () => {} });

    const primera = verificar();
    await vi.advanceTimersByTimeAsync(TOPE_MS);
    expect((await primera).estado).toBe("sin_verificar");

    let respondio = false;
    const segunda = verificar().then((r) => {
      respondio = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(respondio, "la segunda llamada volvió a esperar la consulta colgada").toBe(true);
    expect((await segunda).estado).toBe("sin_verificar");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await verificar();
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("los plazos no dependen de la hora del sistema: si NTP la atrasa, el reintento no se congela", async () => {
    let base = SIN_EL_SQL;
    const leer = vi.fn(async () => base);
    const verificar = crearVerificadorDeEsquema({ esperado: () => ESPERADO, leer, avisar: () => {} });

    expect((await verificar()).estado).toBe("atrasado");
    base = AL_DIA;
    // La hora del sistema salta una hora hacia atrás; el tiempo de verdad sigue corriendo.
    vi.setSystemTime(new Date(Date.now() - 3_600_000));
    await vi.advanceTimersByTimeAsync(REINTENTO_ATRASADO_MS);
    expect(await verificar()).toEqual({ estado: "ok" });
    expect(leer).toHaveBeenCalledTimes(2);
  });
});

describe("textoDeLaSalud — lo que sale en `checks.esquema`", () => {
  it("ok, lo que falta, o por qué no se pudo mirar", () => {
    expect(textoDeLaSalud({ estado: "ok" })).toBe("ok");
    expect(
      textoDeLaSalud({
        estado: "atrasado",
        faltantes: [
          { clase: "columna", tabla: "SessionProject", columna: "planningOverride" },
          { clase: "columna", tabla: "SessionProject", columna: "implementationOverride" },
        ],
      }),
    ).toBe(
      "faltan 2 en la base: columna SessionProject.planningOverride, columna SessionProject.implementationOverride — ¿se corrió el SQL antes del deploy?",
    );
  });

  it("el endpoint es público: nombra pocos y dice cuántos más", () => {
    // Pocos a propósito: cualquiera puede leer la salud, y `deploy.sh` imprime ese JSON en una línea.
    expect(MAX_EN_LA_SALUD).toBeLessThanOrEqual(10);
    const faltantes = Array.from({ length: 30 }, (_, i) => ({ clase: "tabla" as const, tabla: `T${i}` }));
    const texto = textoDeLaSalud({ estado: "atrasado", faltantes });
    expect(texto).toContain("faltan 30 en la base");
    expect(texto).toContain(`tabla T${MAX_EN_LA_SALUD - 1} y ${30 - MAX_EN_LA_SALUD} más`);
    expect(texto).not.toContain(`tabla T${MAX_EN_LA_SALUD},`);
  });
});

describe("leerEsquemaDeLaBase — UNA consulta de solo lectura al catálogo", () => {
  it("una sola consulta, que solo lee, sobre el schema `public`", async () => {
    const consultas: string[] = [];
    const db = {
      $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
        expect(valores).toEqual([]);
        consultas.push(partes.join(""));
        return [
          { clase: "c", objeto: "SessionProject", miembro: "id" },
          { clase: "e", objeto: "Fuente", miembro: "AGENT" },
        ];
      },
    } as unknown as Pick<PrismaClient, "$queryRaw">;

    const leido = await leerEsquemaDeLaBase(db);
    expect(leido).toEqual(esquemaDesdeCatalogo([
      { clase: "c", objeto: "SessionProject", miembro: "id" },
      { clase: "e", objeto: "Fuente", miembro: "AGENT" },
    ]));
    expect(consultas).toHaveLength(1);
    const sql = consultas[0];
    expect(sql.trimStart().startsWith("SELECT")).toBe(true);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT)\b/i);
    expect(sql.match(/n\.nspname = 'public'/g)).toHaveLength(2);
    // Columnas dadas de baja (attisdropped) y columnas de sistema (attnum <= 0) no son columnas.
    expect(sql).toContain("a.attnum > 0");
    expect(sql).toContain("NOT a.attisdropped");
  });
});

// ── Guardas sobre el repo de verdad ─────────────────────────────────────────

describe("el cliente Prisma generado de este repo", () => {
  it("⛔ el dmmf trae los modelos con sus campos: si un día viene vacío, el chequeo queda ciego", () => {
    /* Con el dmmf vacío `/api/health` diría «sin verificar» para siempre y nada avisaría. Si una
       versión nueva de Prisma lo quita, este test es el aviso: hay que sacar «lo que espera el
       código» de otro lado antes de subirla. */
    const e = esperadoDeEsteCliente();
    expect(e.tablas.size).toBeGreaterThan(100);
    const sesionProyecto = e.tablas.get("SessionProject");
    expect(sesionProyecto, "falta el modelo SessionProject en el dmmf").toBeDefined();
    expect(sesionProyecto!.has("id")).toBe(true);
    expect(sesionProyecto!.has("sessionId")).toBe(true);
    expect(sesionProyecto!.has("projectId")).toBe(true);
    // Las relaciones del modelo no son columnas.
    expect(sesionProyecto!.has("session")).toBe(false);
    expect(sesionProyecto!.has("project")).toBe(false);
    // Los enums salen de `$Enums` (el dmmf de este cliente trae `enums: []`).
    expect(e.enums.size).toBeGreaterThan(50);
    expect(e.enums.get("TeamRole")?.has("SUPER_ADMIN")).toBe(true);
  });

  it("todo campo del dmmf es `scalar`, `enum` u `object`: una clase nueva obliga a decidir si es columna", () => {
    const clases = new Set(Prisma.dmmf.datamodel.models.flatMap((m) => m.fields.map((f) => f.kind as string)));
    expect([...clases].sort()).toEqual(["enum", "object", "scalar"]);
  });

  it("todo enum del cliente lo usa alguna columna (ninguno queda fuera de la comparación)", () => {
    expect(esperadoDeEsteCliente().enums.size).toBe(Object.keys($Enums).length);
  });

  it("⛔ toda relación N:N implícita del schema está en PIVOTES_IMPLICITAS, y se espera su tabla", () => {
    /* Una N:N implícita (lista de los dos lados, sin modelo en el medio) tiene una tabla pivote que
       el dmmf no trae. Si aparece una nueva y no se suma a `PIVOTES_IMPLICITAS`
       (lib/db/esquema-esperado.ts), `/api/health` no vería que falta su tabla. Lo que pide
       ARCHITECTURE §2 (regla 5) es declarar el modelo pivote: así entra sola, como cualquier modelo. */
    const schema = fs.readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const modelos = new Map([...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((m) => [m[1], m[2]]));
    expect(modelos.size).toBeGreaterThan(100);
    const listas: Array<{ modelo: string; campo: string; tipo: string; relacion: string | null }> = [];
    for (const [modelo, cuerpo] of modelos) {
      for (const linea of cuerpo.split(/\r?\n/)) {
        const campo = linea.trim().match(/^(\w+)\s+(\w+)\[\]\s*(.*)$/);
        if (!campo || !modelos.has(campo[2])) continue;
        listas.push({ modelo, campo: campo[1], tipo: campo[2], relacion: campo[3].match(/@relation\(\s*(?:name:\s*)?"([^"]+)"/)?.[1] ?? null });
      }
    }
    expect(listas.length).toBeGreaterThan(50);
    /* N:N implícita = DOS campos lista, uno de cada lado, con la misma relación. El nombre por
       defecto es `AToB`, en orden alfabético. Una relación de un modelo consigo mismo (el árbol de
       páginas) tiene UN solo campo lista y no cuenta: el otro lado es singular y lleva la FK. */
    const pivotes = new Set<string>();
    for (const a of listas) {
      for (const b of listas) {
        const primero = a.modelo < b.modelo || (a.modelo === b.modelo && a.campo < b.campo);
        if (primero && a.modelo === b.tipo && a.tipo === b.modelo && a.relacion === b.relacion) {
          pivotes.add(`_${a.relacion ?? `${a.modelo}To${b.modelo}`}`);
        }
      }
    }
    expect([...pivotes].sort()).toEqual(Object.keys(PIVOTES_IMPLICITAS).sort());
    for (const tabla of Object.keys(PIVOTES_IMPLICITAS)) {
      expect([...(esperadoDeEsteCliente().tablas.get(tabla) ?? [])], tabla).toEqual(["A", "B"]);
    }
  });

  it("⛔ ningún modelo vive fuera de `public` (`@@schema`) ni el datasource declara `schemas`", () => {
    /* La consulta al catálogo mira solo `public`, y el dmmf del cliente no dice en qué schema vive
       cada modelo: uno con `@@schema("otro")` saldría como una tabla que falta y `/api/health`
       revertiría cada deploy. Antes de usar varios schemas, enseñárselo a `leerEsquemaDeLaBase` y a
       `esperadoDelCliente`. */
    const schema = fs.readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    expect(schema).not.toMatch(/@@schema\(/);
    expect(schema).not.toMatch(/^\s*schemas\s*=/m);
  });

  it("⛔ ningún enum del schema lleva `@map` ni `@@map`", () => {
    /* Los valores de enum se leen de `$Enums`, que no sabe de mapeos. Con un enum mapeado, el
       nombre que conoce el código y el de la base dejan de coincidir: `/api/health` diría que
       falta y revertiría cada deploy. Antes de mapear uno, enseñarle el mapeo a
       `esperadoDelCliente` (lib/db/esquema-esperado.ts). */
    const schema = fs.readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const enums = [...schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
    expect(enums.length).toBeGreaterThan(50);
    const mapeados = enums.filter(([, , cuerpo]) => /@@?map\(/.test(cuerpo)).map(([, nombre]) => nombre);
    expect(mapeados).toEqual([]);
  });
});

describe("/api/health apaga el `ok` por el esquema SOLO con el atraso probado", () => {
  const soloCodigo = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).filter((l) => !l.trimStart().startsWith("//")).join("\n");
  const ruta = () => soloCodigo(fs.readFileSync(path.join(process.cwd(), "app/api/health/route.ts"), "utf8"));

  it("⛔ el verificador se crea UNA vez, al cargar la ruta, y no adentro de GET", () => {
    /* La edición que lo pone en rojo: crearlo dentro del handler. Cada llamada nacería sin memoria
       y consultaría el catálogo: una consulta cada 15 s por el healthcheck, en un pool de 10. */
    const src = ruta();
    expect(src).toContain('from "@/lib/db/salud-del-esquema"');
    const creado = src.indexOf("const saludDelEsquema = crearVerificadorDeEsquema(");
    const handler = src.indexOf("export async function GET(");
    expect(creado, "falta el verificador del proceso").toBeGreaterThan(-1);
    expect(creado, "el verificador tiene que crearse fuera del handler").toBeLessThan(handler);
    expect(src.match(/crearVerificadorDeEsquema\(/g)).toHaveLength(1);
    expect(src.slice(creado, handler)).toContain("leer: () => leerEsquemaDeLaBase(prisma)");
  });

  it("pregunta solo si la base responde", () => {
    const src = ruta();
    const bloque = src.slice(src.indexOf('if (checks.db === "ok")'), src.indexOf("leerInvariantesOk()"));
    expect(bloque, "el chequeo de esquema va detrás de `checks.db === \"ok\"`").toContain("await saludDelEsquema()");
    expect(src.match(/await saludDelEsquema\(\)/g)).toHaveLength(1);
  });

  it("⛔ «sin verificar» no apaga nada, y `ESQUEMA_NO_BLOQUEA=1` lo deja en aviso", () => {
    /* Las ediciones que lo ponen en rojo: apagar el `ok` con cualquier estado que no sea "ok"
       (un corte de red revertiría el deploy), o sacar el interruptor que deja seguir desplegando
       si el chequeo alguna vez se equivoca. */
    const src = ruta();
    const bloque = src.slice(src.indexOf("await saludDelEsquema()"), src.indexOf("leerInvariantesOk()"));
    expect(bloque).toMatch(
      /if \(esquema\.estado === "atrasado"\) \{\s*if \(process\.env\.ESQUEMA_NO_BLOQUEA === "1"\) [^\n]*\n\s*else ok = false;\s*\}/,
    );
    expect((bloque.match(/ok = false/g) ?? []).length).toBe(1);
    expect(bloque).not.toContain("sin_verificar");
  });
});
