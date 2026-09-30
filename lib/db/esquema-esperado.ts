/**
 * lib/db/esquema-esperado.ts — lo que el CÓDIGO espera de la base, contra lo que la base TIENE.
 *
 * ── EL HUECO QUE ESTO TAPA ───────────────────────────────────────────────────
 * Los cambios de esquema son SQL a mano que una persona corre ANTES del deploy (ARCHITECTURE
 * Parte 0 · cap. D). Si se olvida, el contenedor nuevo arranca, `SELECT 1` responde, el canario
 * `roleProfile.count()` también, `deploy.sh` imprime «DEPLOY OK»… y toda pantalla que lea la
 * columna que falta revienta con P2022. Caso del 2026-09-30: `e4fd8594` sumó dos columnas a
 * `SessionProject` que `lib/sessions/project-sources.ts` selecciona en cada lectura; desplegado
 * sin su SQL habría roto la ficha del cliente, el cronograma y el clasificador, con el deploy en
 * verde.
 *
 * Esta es la parte PURA: arma lo que el cliente Prisma generado necesita encontrar (tablas,
 * columnas, enums y sus valores, y las tablas pivote de sus relaciones N:N implícitas) y lo
 * compara contra lo que dice el catálogo de Postgres. La
 * consulta y el guardado por proceso viven en `salud-del-esquema.ts`. La usan `/api/health` (la
 * red: con la base atrasada el deploy se revierte solo) y `scripts/check-esquema.ts` (el aviso
 * ANTES del deploy, desde una PC).
 *
 * ── SOLO LO QUE FALTA ────────────────────────────────────────────────────────
 * Lo que la base tiene DE MÁS no es un error y ni se reporta: la columna pgvector
 * `KnowledgeEmbedding.embedding` (el schema de Prisma no la declara), las tablas de una tanda
 * cuyo SQL ya se corrió y cuyo código todavía no salió, y los índices creados por SQL (no se
 * miran). Tampoco se compara el TIPO de una columna ni si admite nulos: el esquema es solo
 * aditivo (RUNBOOK, invariante #2), así que el atraso real es siempre «falta algo».
 *
 * ── DE DÓNDE SALE «LO QUE ESPERA EL CÓDIGO» ──────────────────────────────────
 * Del cliente GENERADO, que es lo que de verdad corre en la imagen: los modelos de
 * `Prisma.dmmf.datamodel` y los valores de `$Enums`.
 * ⚠ Con Prisma 7.4.2 el dmmf del cliente trae los modelos con sus campos y `enums: []` (por eso
 * INV4 anotaba «viene vacío»): los enums salen de `$Enums`, que no sabe de `@map`. El schema no
 * mapea ningún enum y `salud-del-esquema.test.ts` lo congela — con un `@map` en un enum, el
 * nombre que conoce el código y el de la base dejarían de coincidir y esto daría un falso atraso.
 */

/** Lo mínimo que se lee de un modelo del dmmf. Estructural: no ata este archivo a los tipos internos de Prisma. */
export interface ModeloDelCliente {
  name: string;
  /** El nombre de la tabla cuando el modelo lleva `@@map`. */
  dbName?: string | null;
  fields: ReadonlyArray<{
    name: string;
    /** `scalar` y `enum` son columnas; `object` es una relación (su columna es el campo `…Id`, que viene aparte). */
    kind: string;
    /** El tipo: para un campo `enum`, el nombre del enum. */
    type: string;
    /** El nombre de la columna cuando el campo lleva `@map`. */
    dbName?: string | null;
    /** En un campo `object`, el nombre de la relación (el de su tabla pivote, si es N:N implícita). */
    relationName?: string | null;
  }>;
}

/**
 * Las tablas pivote de las relaciones N:N IMPLÍCITAS (una lista de cada lado, sin modelo en el
 * medio): Prisma las crea y las consulta, pero no son un modelo, y el dmmf del cliente no las trae
 * ni dice qué relación es lista de los dos lados. Por eso van escritas a mano, con el nombre que
 * les pone Prisma (`_` + el nombre de la relación; columnas `A` y `B`).
 *
 * `salud-del-esquema.test.ts` las compara contra el schema: una N:N implícita nueva pone el test
 * en rojo hasta que se sume acá. La regla del repo es la pivote EXPLÍCITA (ARCHITECTURE §2, regla
 * 5), así que esta lista no debería crecer. Una entrada cuya relación ya no existe en el cliente
 * no se espera (ver `esperadoDelCliente`): un nombre viejo acá no puede inventar un atraso.
 */
export const PIVOTES_IMPLICITAS: Readonly<Record<string, readonly string[]>> = {
  _KnowledgeDocumentToKnowledgeTag: ["A", "B"],
};

/** Tablas con sus columnas y enums con sus valores. Sirve para los dos lados de la comparación. */
export interface Esquema {
  tablas: Map<string, Set<string>>;
  enums: Map<string, Set<string>>;
}

/** Algo que el código usa y la base no tiene. */
export type Faltante =
  | { clase: "tabla"; tabla: string }
  | { clase: "columna"; tabla: string; columna: string }
  | { clase: "enum"; tipo: string }
  | { clase: "valor"; tipo: string; valor: string };

/** Una fila del catálogo: `c` = columna de una tabla, `e` = valor de un enum (ver `leerEsquemaDeLaBase`). */
export interface FilaDelCatalogo {
  clase: string;
  objeto: string;
  miembro: string;
}

/**
 * Lo que el cliente Prisma necesita encontrar en la base.
 *
 * Un enum entra solo si alguna columna lo usa: uno declarado y sin usar no puede faltarle al
 * código. Un campo de una clase que no sea `scalar` ni `enum` no se espera como columna — ante
 * una clase desconocida, esto prefiere no mirar antes que inventar un atraso. Una tabla pivote
 * de `pivotes` entra solo si su relación sigue existiendo en el cliente.
 */
export function esperadoDelCliente(
  modelos: ReadonlyArray<ModeloDelCliente>,
  enums: Readonly<Record<string, Readonly<Record<string, string>>>>,
  pivotes: Readonly<Record<string, readonly string[]>> = {},
): Esquema {
  const tablas = new Map<string, Set<string>>();
  const enumsEnUso = new Set<string>();
  const relaciones = new Set<string>();
  for (const modelo of modelos) {
    const columnas = new Set<string>();
    for (const campo of modelo.fields) {
      if (campo.kind === "object" && campo.relationName) relaciones.add(campo.relationName);
      if (campo.kind !== "scalar" && campo.kind !== "enum") continue;
      columnas.add(campo.dbName ?? campo.name);
      if (campo.kind === "enum") enumsEnUso.add(campo.type);
    }
    tablas.set(modelo.dbName ?? modelo.name, columnas);
  }
  for (const [tabla, columnas] of Object.entries(pivotes)) {
    if (relaciones.has(tabla.replace(/^_/, ""))) tablas.set(tabla, new Set(columnas));
  }
  const enumsEsperados = new Map<string, Set<string>>();
  for (const [tipo, valores] of Object.entries(enums)) {
    if (enumsEnUso.has(tipo)) enumsEsperados.set(tipo, new Set(Object.values(valores)));
  }
  return { tablas, enums: enumsEsperados };
}

/** De las filas del catálogo a tablas y enums. Una clase que no se conoce se ignora. */
export function esquemaDesdeCatalogo(filas: ReadonlyArray<FilaDelCatalogo>): Esquema {
  const esquema: Esquema = { tablas: new Map(), enums: new Map() };
  for (const fila of filas) {
    const destino = fila.clase === "c" ? esquema.tablas : fila.clase === "e" ? esquema.enums : null;
    if (!destino) continue;
    const miembros = destino.get(fila.objeto) ?? new Set<string>();
    miembros.add(fila.miembro);
    destino.set(fila.objeto, miembros);
  }
  return esquema;
}

/**
 * Lo que el código espera y la base no tiene, en el orden del schema (primero tablas y columnas,
 * después enums). Una tabla ausente se reporta UNA vez, sin listar sus columnas; lo mismo un enum.
 */
export function compararEsquema(esperado: Esquema, real: Esquema): Faltante[] {
  const faltantes: Faltante[] = [];
  for (const [tabla, columnas] of esperado.tablas) {
    const enLaBase = real.tablas.get(tabla);
    if (!enLaBase) {
      faltantes.push({ clase: "tabla", tabla });
      continue;
    }
    for (const columna of columnas) {
      if (!enLaBase.has(columna)) faltantes.push({ clase: "columna", tabla, columna });
    }
  }
  for (const [tipo, valores] of esperado.enums) {
    const enLaBase = real.enums.get(tipo);
    if (!enLaBase) {
      faltantes.push({ clase: "enum", tipo });
      continue;
    }
    for (const valor of valores) {
      if (!enLaBase.has(valor)) faltantes.push({ clase: "valor", tipo, valor });
    }
  }
  return faltantes;
}

/** `columna SessionProject.planningOverride`, `tabla Cuestionario`, `valor CobranzaOrigenCobro.ODOO`. */
export function describirFaltante(f: Faltante): string {
  switch (f.clase) {
    case "tabla":
      return `tabla ${f.tabla}`;
    case "columna":
      return `columna ${f.tabla}.${f.columna}`;
    case "enum":
      return `enum ${f.tipo}`;
    case "valor":
      return `valor ${f.tipo}.${f.valor}`;
  }
}

/** Los primeros `max`, y cuántos más quedan: una línea que entra en un log y en el JSON de la salud. */
export function listarFaltantes(faltantes: ReadonlyArray<Faltante>, max: number): string {
  const visibles = faltantes.slice(0, max).map(describirFaltante).join(", ");
  const resto = faltantes.length - max;
  return resto > 0 ? `${visibles} y ${resto} más` : visibles;
}

/** Escapa un nombre para usarlo dentro de una expresión regular. */
const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * ¿Qué archivos de `scripts/sql/` CREAN esto que falta? Es una pista para quien va a desplegar,
 * no una prueba: no hay registro de qué SQL ya corrió (ARCHITECTURE Parte 0 · cap. D). Se busca
 * la SENTENCIA que lo crea —la tabla y la columna en el mismo `ALTER TABLE`, el enum y el valor en
 * el mismo `ALTER TYPE`—, no dos menciones sueltas en el archivo. Mira también las líneas
 * comentadas: un `ALTER TYPE … ADD VALUE` no corre dentro de una transacción y varios archivos lo
 * dejan escrito como comentario para correr aparte.
 */
export function sqlQueNombran(
  f: Faltante,
  archivos: ReadonlyArray<{ nombre: string; texto: string }>,
): string[] {
  const SI_NO_EXISTE = String.raw`(?:IF\s+NOT\s+EXISTS\s+)?`;
  const PUBLIC = String.raw`(?:"public"\.)?`;
  const patron = (() => {
    switch (f.clase) {
      case "tabla":
        return String.raw`CREATE\s+TABLE\s+${SI_NO_EXISTE}${PUBLIC}"${literal(f.tabla)}"`;
      case "columna":
        // `[^;]*?`: dentro de la misma sentencia, que puede agregar varias columnas.
        return (
          String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${PUBLIC}"${literal(f.tabla)}"` +
          String.raw`[^;]*?\bADD\s+(?:COLUMN\s+)?${SI_NO_EXISTE}"${literal(f.columna)}"`
        );
      case "enum":
        return String.raw`CREATE\s+TYPE\s+${PUBLIC}"${literal(f.tipo)}"`;
      case "valor":
        return String.raw`ALTER\s+TYPE\s+${PUBLIC}"${literal(f.tipo)}"\s+ADD\s+VALUE\s+${SI_NO_EXISTE}'${literal(f.valor)}'`;
    }
  })();
  const sentencia = new RegExp(patron, "i");
  return archivos.filter((a) => sentencia.test(a.texto)).map((a) => a.nombre);
}

/**
 * ¿Los dos textos son el mismo schema? El generador de Prisma guarda su copia REFORMATEADA
 * (`node_modules/.prisma/client/schema.prisma`: alinea columnas, cambia espacios), así que se
 * compara sin espacios de más ni líneas vacías. Distintos = el cliente generado es de otro schema
 * y lo que «espera el código» sería lo de antes: hay que correr `npx prisma generate`.
 */
export function mismoSchema(a: string, b: string): boolean {
  const normal = (s: string) =>
    s
      .split(/\r?\n/)
      .map((linea) => linea.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  return normal(a) === normal(b);
}
