/**
 * lib/cobranza/odoo/guardas.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/odoo --project unit`.
 *
 * Guardas de ARMADO: no prueban qué calcula el espejo, prueban que siga siendo la clase de
 * módulo que se decidió que fuera. Son las que se rompen dentro de seis meses, cuando alguien
 * necesite un campo más y llame al ERP desde el motor.
 *
 * ⚠ Todas leen el fuente con los COMENTARIOS QUITADOS. Sin eso una guarda se cumple a sí
 * misma con el párrafo que explica por qué existe — ya pasó una vez en este repo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";

const DIR = __dirname;

/** Quita bloques de comentario y líneas `//` para que ninguna guarda matchee su propia prosa. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const archivos = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const fuente = (f: string) => sinComentarios(readFileSync(join(DIR, f), "utf8"));

/**
 * Los CINCO archivos que tienen permitido tocar el mundo: uno habla HTTP y cuatro hablan con la
 * base. Todo lo demás decide, y por eso se puede probar.
 *
 * ⚠ La lista se afirma abajo, así que un archivo impuro nuevo no entra sin que alguien lo
 * agregue a mano y explique por qué en el commit.
 *
 * `atribucion.ts` entró el 2026-09-12: vincular un cliente atribuye sus facturas en el acto, y
 * esa escritura la comparten la pantalla (servicio.ts, `server-only`) y un script de una sola vez
 * que no puede importar un módulo `server-only`. Escribe UNA columna: lo vigila el bloque de abajo.
 *
 * `marcas.ts` entró el 2026-09-25 por lo mismo: las marcas «está bien así» fila por fila y el cierre
 * «Ya está anulada» los escribe la pantalla, y también el traspaso de la marca de grupo de las notas
 * de crédito y la reapertura de las facturas cerradas sin motivo (scripts/odoo-*.ts). Nunca borra una
 * marca: lo vigila su bloque.
 */
const IMPUROS = ["servicio.ts", "sync.ts", "transporte-xmlrpc.ts", "atribucion.ts", "marcas.ts"];
const puros = archivos.filter((f) => !IMPUROS.includes(f));
const TOCAN_LA_BASE = ["servicio.ts", "sync.ts", "atribucion.ts", "marcas.ts"];

describe("la frontera entre decidir y tocar el mundo", () => {
  it("sigue habiendo exactamente cinco archivos impuros", () => {
    expect(archivos.filter((f) => IMPUROS.includes(f)).sort()).toEqual([...IMPUROS].sort());
    expect(puros.length).toBeGreaterThanOrEqual(3);
  });

  it("⛔ solo transporte-xmlrpc.ts habla HTTP", () => {
    /* El protocolo se eligió por un PERMISO del ERP —REST devuelve 403 en los nueve modelos—
       y ese permiso puede cambiar sin avisarnos. Si el motor llama a Odoo por su cuenta,
       cambiar de transporte deja de ser escribir otra implementación. */
    for (const f of archivos) {
      if (f === "transporte-xmlrpc.ts") continue;
      expect(fuente(f), `${f} habla HTTP directo`).not.toMatch(/node:https|node:http\b|\bfetch\s*\(/);
    }
  });

  it("⛔ solo servicio.ts, sync.ts, atribucion.ts y marcas.ts tocan la base", () => {
    for (const f of archivos) {
      if (TOCAN_LA_BASE.includes(f)) continue;
      expect(fuente(f), `${f} importa la base`).not.toMatch(/@prisma\/client|from\s+["']@\/lib\/db/);
    }
  });

  it("el puerto no sabe de HTTP en absoluto", () => {
    expect(fuente("transporte.ts")).not.toMatch(/https?:\/\/|xmlrpc|jsonrpc/i);
  });

  it("⛔ ningún módulo puro lee el reloj", () => {
    /* Una decisión que consulta `new Date()` no se puede probar contra una fecha fija: el
       test pasa hoy y falla el primero del mes. Las fechas entran como argumento. */
    for (const f of puros) {
      expect(fuente(f), `${f} lee el reloj`).not.toMatch(/new Date\(\s*\)|Date\.now\(/);
    }
  });
});

describe("el espejo no convierte moneda", () => {
  it("⛔ ningún archivo importa el motor de equilibrio ni nombra el tipo de cambio", () => {
    /* `convertir()` de lib/finanzas/equilibrio.ts es el ÚNICO punto de conversión del
       sistema, y el test §K de equilibrio.test.ts ya lo custodia para los otros motores.
       El espejo guarda el monto en la moneda nativa del documento: cuando el cobro y la
       factura no coinciden se MARCAN las dos cifras, nunca se cuadran. */
    for (const f of archivos) {
      const src = fuente(f);
      expect(src, `${f} importa el motor de equilibrio`).not.toMatch(/from\s+["'].*finanzas\/equilibrio/);
      expect(src, `${f} nombra el tipo de cambio`).not.toMatch(/crcPorUsd|TipoCambioMes/);
    }
  });
});

describe("ningún cobro se toca desde acá (INV25)", () => {
  it("⛔ nada del módulo escribe en la tabla Cobro", () => {
    /* `COBRADO` exige `confirmadoPor` de una persona (INV3). El espejo PROPONE; confirmar la
       plata sigue siendo de alguien con nombre, por el chokepoint `cambiarEstadoCobro`.

       ⚠ Se busca la ESCRITURA y no la palabra `confirmadoPor`: el vínculo de emparejado
       tiene su propio `confirmadoPor` —quién dijo que este partner es esta cuenta—, que es
       otra cosa y sí se escribe acá. Una guarda por la palabra suelta habría prohibido lo
       que no era. */
    for (const f of archivos) {
      expect(fuente(f), `${f} escribe en Cobro`).not.toMatch(/prisma\.cobro\.(update|create|upsert|delete)/);
      expect(fuente(f), `${f} escribe en Cobro`).not.toMatch(/tx\.cobro\.(update|create|upsert|delete)/);
    }
  });

  it("⛔ y no importa el chokepoint de estado por la puerta de atrás", () => {
    for (const f of archivos) {
      expect(fuente(f), `${f} importa cambiarEstadoCobro`).not.toMatch(/cambiarEstadoCobro/);
    }
  });
});

const ESCRITURAS = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];

/** Cada llamada `.<modelo>.<escritura>(…)` con su argumento entero, contando paréntesis. */
function escriturasA(src: string, modelo: string): string[] {
  const re = new RegExp(`\\.${modelo}\\.(${ESCRITURAS.join("|")})\\(`, "g");
  const out: string[] = [];
  for (const m of src.matchAll(re)) {
    const inicio = m.index ?? 0;
    let i = inicio + m[0].length;
    for (let prof = 1; i < src.length && prof > 0; i++) {
      if (src[i] === "(") prof++;
      else if (src[i] === ")") prof--;
    }
    out.push(src.slice(inicio, i));
  }
  return out;
}

/**
 * ── ⛔ VINCULAR SOLO PUEDE ESCRIBIR LA CUENTA DE UNA FACTURA ────────────────────
 * Desde el 2026-09-12 confirmar un vínculo toca el espejo. Es la puerta por la que un día
 * alguien «aprovecha» para corregir un monto o marcar una factura pagada desde la pantalla de
 * emparejado — y el espejo deja de ser lo que dice Odoo. Montos, estados y fechas son del sync;
 * los cobros, de una persona con nombre (INV25).
 */
describe("⛔ vincular solo escribe la cuenta de las facturas", () => {
  it("atribucion.ts escribe `cuentaId` y nada más en FacturaOdoo", () => {
    const escrituras = escriturasA(fuente("atribucion.ts"), "facturaOdoo");
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) {
      expect(e, "nunca crea ni borra facturas").toMatch(/^\.facturaOdoo\.(update|updateMany)\(/);
      const data = e.match(/data:\s*\{([^{}]*)\}/)?.[1] ?? "";
      const claves = data.split(",").map((s) => s.split(":")[0]?.trim()).filter(Boolean);
      expect(claves, e).toEqual(["cuentaId"]);
    }
  });

  it("y en la bitácora solo agrega filas CUENTA", () => {
    const escrituras = escriturasA(fuente("atribucion.ts"), "facturaOdooCambio");
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) {
      expect(e, "la bitácora es append-only").toMatch(/^\.facturaOdooCambio\.(create|createMany)\(/);
      expect(e.match(/tipo:\s*"([A-Z_]+)"/g), e).toEqual(['tipo: "CUENTA"']);
    }
  });

  it("servicio.ts no escribe el espejo por su cuenta: pasa por atribucion.ts, dentro de la transacción", () => {
    const src = fuente("servicio.ts");
    expect(escriturasA(src, "facturaOdoo")).toEqual([]);
    expect(escriturasA(src, "facturaOdooCambio")).toEqual([]);
    expect(src.match(/atribuirFacturasDelPartner\(tx,/g)).toHaveLength(2);
  });

  it("⚠ el sync lee los vínculos DESPUÉS de las facturas guardadas y no escribe la cuenta en cada fila", () => {
    /* La edición que lo pone en rojo: volver a leer los vínculos al principio «porque es más
       prolijo», o poner `cuentaId` en `datos`. Las dos pisan una atribución hecha a mitad de corrida. */
    const src = fuente("sync.ts");
    const previas = src.indexOf("const previas = await prisma.facturaOdoo.findMany");
    expect(previas).toBeGreaterThan(0);
    expect(src.indexOf("prisma.odooPartnerVinculo.findMany")).toBeGreaterThan(previas);
    const desde = src.indexOf("const datos = {");
    expect(desde).toBeGreaterThan(0);
    expect(src.slice(desde, src.indexOf("};", desde))).not.toMatch(/cuentaId/);
    expect(src).toMatch(/reatribuciones\(/);
  });
});

/**
 * ── ⚠ LA EVIDENCIA DEL TIPO DE CAMBIO LLEGA A LA BASE ──────────────────────────
 * `evidenciaDesactualizada` tiene su test en espejo.test.ts, pero la decisión de escribir la vive
 * en sync.ts. Medido el 2026-09-12: borrar `!evidenciaVieja` de la condición de «sin cambios»
 * dejaba las 5229 pruebas en verde, y con eso un tipo de cambio corregido en Odoo —o una fila que
 * el código anterior dejó sin colones— no llega nunca, porque `calcularDeltas` no mira esa columna.
 */
describe("⚠ el sync escribe la evidencia del tipo de cambio aunque no haya deltas", () => {
  it("la condición de «sin cambios» exige que la evidencia esté al día", () => {
    const src = fuente("sync.ts");
    const desde = src.indexOf("const evidenciaVieja = evidenciaDesactualizada(");
    expect(desde, "el sync dejó de comparar la evidencia").toBeGreaterThan(0);
    const hasta = src.indexOf("sinCambio.push(previa.id)", desde);
    expect(hasta).toBeGreaterThan(desde);
    expect(src.slice(desde, hasta)).toMatch(/if\s*\([^)]*!evidenciaVieja[^)]*\)\s*\{/);
  });

  it("`datos` —el mismo objeto del alta y de la actualización— lleva las dos columnas", () => {
    const src = fuente("sync.ts");
    const desde = src.indexOf("const datos = {");
    expect(desde).toBeGreaterThan(0);
    const datos = src.slice(desde, src.indexOf("};", desde));
    expect(datos).toMatch(/montoTotalSigned:\s*f\.montoTotalSigned/);
    expect(datos).toMatch(/montoMonedaCompania:\s*f\.montoMonedaCompania/);
  });
});

/**
 * ── ⛔ UNA MARCA NO SE BORRA, Y MARCAR NO TOCA NADA MÁS ──────────────────────────
 * Elías (2026-09-25): cada marca de «Lo que no cuadra» dice quién, cuándo y por qué, se ve y se deshace, y deshacer
 * queda registrado. Hasta ese día «Volver a abrir» borraba la marca del grupo sin dejar rastro. Y marcar solo saca una
 * fila de la lista: nunca cambia un cobro ni nada del espejo de Odoo (esas dos las cuidan los bloques de arriba).
 */
describe("⛔ las marcas de «Lo que no cuadra» no se borran", () => {
  const clavesDeData = (e: string) =>
    (e.match(/data:\s*\{([^{}]*)\}/)?.[1] ?? "")
      .split(",")
      .map((s) => s.split(":")[0]?.trim())
      .filter(Boolean);

  it("marcas.ts solo crea marcas y firma su «Deshacer»: nunca las borra ni les cambia el motivo", () => {
    const escrituras = escriturasA(fuente("marcas.ts"), "diferenciaOdooMarca");
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) {
      expect(e, "nunca borra").toMatch(/^\.diferenciaOdooMarca\.(create|createMany|updateMany)\(/);
      if (e.startsWith(".diferenciaOdooMarca.updateMany(")) expect(clavesDeData(e), e).toEqual(["deshechaPor", "deshechaEn"]);
    }
  });

  it("de una factura soltada, marcas.ts solo escribe su cierre: cuándo, quién y el motivo", () => {
    const escrituras = escriturasA(fuente("marcas.ts"), "facturaLiberada");
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) {
      expect(e, "nunca crea ni borra una factura soltada").toMatch(/^\.facturaLiberada\.(update|updateMany)\(/);
      expect(clavesDeData(e).sort(), e).toEqual(["motivo", "resueltaEn", "resueltaPor"]);
    }
  });

  it("nadie más del módulo escribe una marca ni cierra una factura soltada: pasan por marcas.ts", () => {
    for (const f of archivos) {
      if (f === "marcas.ts") continue;
      expect(escriturasA(fuente(f), "diferenciaOdooMarca"), f).toEqual([]);
      expect(escriturasA(fuente(f), "facturaLiberada"), f).toEqual([]);
    }
  });

  it("⛔ el traspaso de las notas y la reapertura también pasan por marcas.ts, detrás del guard, y la marca de grupo no se toca", () => {
    /* Los dos scripts de una sola vez de la decisión de Elías (2026-09-25). La edición que lo pone en rojo: «arreglar»
       una marca con un update a mano desde el script, o borrar la marca de grupo después de traspasarla. */
    for (const s of ["odoo-traspasar-marcas-de-notas.ts", "odoo-reabrir-liberadas-sin-motivo.ts"]) {
      const src = sinComentarios(readFileSync(join(DIR, "..", "..", "..", "scripts", s), "utf8"));
      expect(escriturasA(src, "diferenciaOdooMarca"), s).toEqual([]);
      expect(escriturasA(src, "facturaLiberada"), s).toEqual([]);
      expect(escriturasA(src, "diferenciaOdooAceptada"), s).toEqual([]);
      expect(src, `${s} no pasa por el guard`).toMatch(/resolverApply\(\{\s*tablas:/);
    }
  });

  it("⛔ sin --apply los dos scripts no escriben: la conexión nace de solo lectura y cortan antes de la primera escritura", () => {
    /* El simulacro se corre contra producción para decidir (docs/RUNBOOK.md › Cobranza). La edición que lo pone en rojo:
       quitar el PGOPTIONS de solo lectura del simulacro, o mover el «if (!apply) return» debajo de lo que escribe (el
       respaldo o la transacción), o sacarle su `return`. */
    for (const s of ["odoo-traspasar-marcas-de-notas.ts", "odoo-reabrir-liberadas-sin-motivo.ts"]) {
      const src = sinComentarios(readFileSync(join(DIR, "..", "..", "..", "scripts", s), "utf8"));
      expect(src, `${s}: el simulacro no fija la conexión de solo lectura`).toMatch(
        /if \(!QUIERE_ESCRIBIR\) \{\s*process\.env\.PGOPTIONS = [^;]*default_transaction_read_only=on/,
      );
      const corte = src.search(/if \(!apply\) \{[^}]*\breturn;\s*\}/);
      expect(corte, `${s}: no corta sin --apply`).toBeGreaterThan(0);
      for (const escritura of [/\bprisma\.\$transaction\(/, /(?<!function )\bguardarRespaldo\(/]) {
        const donde = src.search(escritura);
        expect(donde, `${s}: no encuentra ${escritura}`).toBeGreaterThan(0);
        expect(donde, `${s}: ${escritura} va antes del corte sin --apply`).toBeGreaterThan(corte);
      }
    }
  });
});

/**
 * ── ⛔ LA SECCIÓN HABLA EN TUTEO, NUNCA EN VOSEO ────────────────────────────────
 * Regla del repo. Hasta el 2026-09-25 la sección tenía unas 100 palabras en voseo: casi todas en los pasos de «Lo que
 * no cuadra» («Andá», «Abrí», «Buscá», «Marcala», «por vos»), 6 en «Emparejar» y 5 mensajes de error del servidor que
 * llegan tal cual al toast. Casi la mitad eran del pronombre pegado («pasale», «corregilo»), que no lleva tilde: por
 * eso el detector (lib/ui/voseo.ts) mira también esa forma, además de la de las agudas.
 * Mira los TEXTOS —cadenas, plantillas y JSX, con el AST—: un comentario que cita el voseo no cuenta.
 * La edición que la pone en rojo: volver a escribir cualquiera de esas formas en un texto de la sección.
 */
describe("⛔ la sección Odoo de Cobranza habla en tuteo, nunca en voseo", () => {
  const RAIZ = join(DIR, "..", "..", "..");
  const leerDeLaRaiz = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
  /* Las tres pestañas, la página, las dos rutas y todo el módulo: los pasos, títulos y avisos los arma diferencias.ts,
     las evidencias emparejado.ts y los rechazos servicio.ts. La vía firmada (via-cobro.ts) escribe la bitácora. */
  const DE_LA_SECCION = [
    "components/cobranza/OdooClient.tsx",
    "components/cobranza/EmparejadoOdoo.tsx",
    "components/cobranza/DiferenciasOdoo.tsx",
    "app/(shell)/cobranza/odoo/page.tsx",
    "app/api/cobranza/odoo/diferencias/route.ts",
    "app/api/cobranza/odoo/emparejado/route.ts",
    "lib/cobranza/via-cobro.ts",
    ...archivos.map((f) => `lib/cobranza/odoo/${f}`),
  ];
  /* lib/cobranza/schema.ts lo comparten todas las rutas de Cobranza: acá cuentan solo los esquemas de estas dos, cuyo
     primer mensaje de error la ruta devuelve tal cual. */
  const ESQUEMA_DE_ESTAS_RUTAS = (nombre: string) => nombre.startsWith("odoo") || nombre === "codigoDeLinea" || nombre === "idDeBase";
  const textosDeLosEsquemas = () =>
    textosDelFuente(leerDeLaRaiz("lib/cobranza/schema.ts"), "lib/cobranza/schema.ts", { soloDeclaraciones: ESQUEMA_DE_ESTAS_RUTAS });

  it("ni una forma de voseo en los textos que se leen", () => {
    const hallados: string[] = [];
    for (const rel of DE_LA_SECCION) {
      for (const { linea, texto } of textosDelFuente(leerDeLaRaiz(rel), rel)) {
        for (const w of formasDeVoseo(texto)) hallados.push(`${rel}:${linea} «${w}»`);
      }
    }
    for (const { linea, texto } of textosDeLosEsquemas()) {
      for (const w of formasDeVoseo(texto)) hallados.push(`lib/cobranza/schema.ts:${linea} «${w}»`);
    }
    expect(hallados, "volvió el voseo a la sección (si una palabra es tuteo de verdad, súmala a su lista en lib/ui/voseo.ts)").toEqual([]);
  });

  it("y mira donde tiene que mirar (si no, la guarda de arriba es decorativa)", () => {
    /* Los textos salen de verdad de cada archivo, y de los esquemas llegan los de estas rutas y no los de otras. */
    const textos = (rel: string) => textosDelFuente(leerDeLaRaiz(rel), rel).map((t) => t.texto);
    expect(textos("components/cobranza/EmparejadoOdoo.tsx")).toContain("Está en Mercury");
    expect(textos("lib/cobranza/odoo/diferencias.ts")).toContain("Ve a la pestaña «Emparejar» de esta misma pantalla.");
    const esquemas = textosDeLosEsquemas().map((t) => t.texto);
    expect(esquemas).toContain("Escribe por qué está bien así (al menos 5 letras)");
    expect(esquemas).toContain("Escribe cómo se anuló (al menos 5 letras)");
    expect(esquemas, "el filtro dejó entrar los esquemas de otra ruta").not.toContain("Escribí el nombre como sale en la factura");
    /* Y el comentario no cuenta: el de arriba de este bloque cita el voseo y no es un texto. */
    expect(textosDelFuente("/* Andá y marcala */ const x = 1;", "x.ts")).toEqual([]);
  });

  it("el detector caza el voseo que tenía la sección, y deja pasar el tuteo que lo reemplazó", () => {
    for (const texto of [
      // Las agudas
      "Andá a la pestaña «Emparejar»", "Abrí en Odoo cada par", "Buscá en el banco el depósito", "confirmá el cliente",
      "Si entró la plata, registrá el pago", "decidí qué pasa con ella", "Solo si sabés que se facturaron",
      "Probá de nuevo en un momento.", "Actualizá desde Odoo primero.", "Volvé acá", "revertí su factura",
      // El pronombre pegado, sin tilde
      "Marcala solo después", "Buscalo a mano.", "Pasale la lista", "corregilo en el cronograma", "fijate a qué razón social",
      "anotale la suya", "Desvinculalo primero.", "Cambiales la sociedad", "vinculala también", "Decile a Nexus",
      "confirmalo al anotarles el número", "cancelalas o borralas", "Completalos antes",
      // Y el que no tiene forma
      "nada lo verifica por vos",
    ]) {
      expect(formasDeVoseo(texto), texto).not.toEqual([]);
    }
    for (const texto of [
      "Ve a la pestaña «Emparejar»", "Abre en Odoo cada par", "Busca en el banco el depósito", "confirma el cliente",
      "Si entró la plata, registra el pago", "decide qué pasa con ella", "Solo si sabes que se facturaron",
      "Prueba de nuevo en un momento.", "Actualiza la lista desde Odoo primero.", "Vuelve acá", "revierte su factura",
      "Márcala solo después", "Búscalo a mano.", "Pásale la lista", "corrígelo en el cronograma", "fíjate a qué razón social",
      "anótale la suya", "Desvincúlalo primero.", "Cámbiales la sociedad", "vincúlala también", "Dile a Nexus",
      "confírmalo al anotarles el número", "cancélalas o bórralas", "Complétalos antes", "nada lo verifica por ti",
      // Lo que tiene la forma y no es voseo
      "Mientras esté en rojo", "no hay otra combinación que dé lo mismo", "su gemela exacta en colones",
      "3 cuentas internacionales", "los totales de Odoo", "Faltan emparejar 7 de 34", "¿Qué más está pendiente? Así quedará",
      "paymentState", "SOS",
    ]) {
      expect(formasDeVoseo(texto), texto).toEqual([]);
    }
  });
});

/**
 * ── «CÓMO FUNCIONA» EXPLICA LO QUE LA LISTA NO MUESTRA ─────────────────────────
 * Pedido de Elías (2026-09-25): lo que queda fuera por regla —historia, exentas de años anteriores, pagadas sin cuenta,
 * las diferencias del IVA— sigue fuera, contado en el texto de su línea y explicado en «Cómo funciona». La línea puede
 * no estar (sin filas pendientes no se muestra), así que la explicación que queda siempre es esa. Y las reglas del día
 * —«Está en Mercury», la marca por fila, «Marcadas», que una fila vuelve sola, cómo se cuentan los pendientes— son las
 * preguntas de quien abre la pantalla cada varias semanas.
 * La edición que la pone en rojo: sacar una de esas explicaciones, o escribir a mano el 13 % o los 15 días en vez de
 * usar las constantes que aplican la regla.
 */
describe("«Cómo funciona» explica las reglas de la lista", () => {
  const rel = "components/cobranza/OdooClient.tsx";
  const fuenteDeLaPantalla = readFileSync(join(DIR, "..", "..", "..", rel), "utf8");
  const texto = textosDelFuente(fuenteDeLaPantalla, rel)
    .map((t) => t.texto)
    .join(" ")
    .replace(/\s+/g, " ");

  it("nombra lo que queda fuera por regla, cada cosa con su porqué", () => {
    for (const regla of ["Historia.", "Exentas de años anteriores.", "Pagadas sin cuenta.", "Diferencias de exactamente el", "Lo recién facturado."]) {
      expect(texto, regla).toContain(regla);
    }
    expect(texto).toContain("No son filas: no se marcan ni cuentan en la pestaña.");
    expect(sinComentarios(fuenteDeLaPantalla), "el IVA y la gracia salen de las constantes que aplican la regla").toMatch(
      /exactamente el \{IVA_EN_PORCENTAJE\} %[\s\S]*\{DIAS_DE_GRACIA_DEL_ESPEJO\} días antes de la última copia buena/,
    );
  });

  it("y explica «Está en Mercury», la marca por fila, «Marcadas» y cómo se cuentan los pendientes", () => {
    for (const frase of [
      "«Está en Mercury»",
      "«En Mercury»",
      "con todo lo que tenía",
      "No se marca una cuenta que ya tiene su cliente de Odoo",
      "El botón de la línea marca una por una las filas que ves",
      "Vuelve sola si cambia uno de sus números",
      "Vale solo en esa línea",
      "«Marcadas»",
      "ninguna marca se borra",
      "filas pendientes",
      "sin recargar la página",
    ]) {
      expect(texto, frase).toContain(frase);
    }
  });
});
