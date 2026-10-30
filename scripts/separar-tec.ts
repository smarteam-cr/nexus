/**
 * scripts/separar-tec.ts — el TEC pasa a ser DOS fichas: «TEC · AE» y «TEC · TAE» (2026-10-29).
 *
 * Elías, 29 oct: «Que el TEC se separe en dos clientes, uno para el AE y otro para el TAE, cada uno con sus sesiones y
 * proyectos. Hoy Nexus los mezcla y no se puede ver bien cómo va cada uno.» Plan: docs/empresas-con-dominio-compartido-plan.md;
 * la regla de las reuniones: DECISIONS «Dos fichas que comparten dominio».
 *
 * Lo que hace:
 *   · La ficha «TEC» (la vieja, con los dominios itcr.ac.cr y tec.ac.cr y la empresa de HubSpot del ITCR) pasa a llamarse
 *     «TEC · TAE», con la sigla «TAE». Se queda con el proyecto de TAE, su «Información del cliente» y todo lo de la cuenta
 *     (contactos, correos y tickets de HubSpot, negocios): HubSpot tiene UNA empresa para las dos.
 *   · La ficha «TEC- AE» (creada el 22 jul, vacía) pasa a llamarse «TEC · AE», con la sigla «AE», y COMPARTE el dominio
 *     de «TEC · TAE» (`comparteDominioConId`). Se queda SIN empresa de HubSpot: la suya (56463266574) está fusionada en el
 *     ITCR y responde con sus datos, así que cada lector y escritor de la empresa cruzaba con TAE, y la del ITCR ya es de
 *     TAE (una empresa es de una sola ficha, R7b). Su registro de Partner (el portal de AE) y su cuenta de cobro ya están en
 *     esta ficha y no dependen de eso.
 *   · El proyecto «AE | RE-IMPLEMENTACION HUBSPOT» pasa a «TEC · AE», con todo lo que cuelga de él con `clientId`
 *     (el handoff, las alertas, las tareas, los hechos, la telemetría…): cada tabla con `clientId` y `projectId`, leída
 *     del schema al correr. Lo que cuelga solo por `projectId` (canvases, cronograma) viaja solo.
 *   · La propuesta «AE - Smartloop» y su preventa (`ExploracionDeVenta`) pasan a AE con todo lo que cuelga de la preventa:
 *     no tienen proyecto, pero son de AE. Si se quedaran en TAE, leerían las reuniones de TAE. La propuesta suelta la
 *     empresa del ITCR: con ella, regenerarla metería en el prompt la actividad de HubSpot de todo el instituto.
 *   · Lo que se redactó con la cuenta unida y se queda en TAE: el resumen de la cuenta queda marcado como desactualizado, y
 *     la propuesta pendiente de «Información del cliente» se descarta (cita reuniones de AE y de TAE; se puede volver a pedir).
 *
 * Lo que NO hace: mover reuniones. Eso es scripts/reubicar-reuniones-compartidas.ts, y va JUSTO DESPUÉS de este: entre
 * los dos, el proyecto de AE no ve reuniones (el chokepoint solo deja pasar las de su ficha) e INV1 marca sus vínculos.
 *
 * ⚠ ORDEN: el SQL 2026-10-29-dominio-compartido.sql → el deploy → este script → reubicar-reuniones-compartidas.
 * Antes del deploy no sirve: el código viejo no conoce la regla y las reuniones seguirían yendo a la ficha más vieja.
 *
 *   npx tsx scripts/separar-tec.ts                                                  (simulacro: solo lee)
 *   ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/separar-tec.ts --apply        (escribe; respaldo en JSON)
 * Con pg_dump en la PC, sin SIN_RESPALDO: el guard respalda además las tablas enteras.
 * Se puede correr dos veces: lo que ya está hecho no se vuelve a escribir.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import type { Prisma } from "@prisma/client";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { guardarRespaldoJson } from "./lib/respaldo-json";
import { SEPARACION_TEC, columnasDelEsquema, comparteDominioGuardado, conSigla, hayColumnaComparteDominio } from "./lib/separacion-tec";
import { prisma } from "@/lib/db/prisma";

const TEC_ID = SEPARACION_TEC.duenaId; // «TEC» → «TEC · TAE»
const AE_ID = SEPARACION_TEC.entidadId; // «TEC- AE» → «TEC · AE»
const PROYECTO_AE_ID = SEPARACION_TEC.proyectoDeLaEntidadId; // «AE | RE-IMPLEMENTACION HUBSPOT»
const TAE = SEPARACION_TEC.duena;
const AE = SEPARACION_TEC.entidad;

/** Las tablas con `clientId` y `projectId`, del schema (una tabla nueva entra sola). `Project` va aparte. */
const ESQUEMA = columnasDelEsquema();
const TABLAS_POR_PROYECTO = [...ESQUEMA]
  .filter(([m, cols]) => m !== "Project" && cols.has("clientId") && cols.has("projectId"))
  .map(([m]) => m);

/** Las tablas con `clientId` que cuelgan de la preventa de AE (entre ellas, su propuesta). */
const TABLAS_POR_PREVENTA = [...ESQUEMA]
  .filter(([, cols]) => cols.has("clientId") && cols.has("exploracionId"))
  .map(([m]) => m);

const APPLY = resolverApply({ tablas: ["Client", "Project", "ExploracionDeVenta", "CsAccountBrief", "BusinessCase", ...new Set([...TABLAS_POR_PROYECTO, ...TABLAS_POR_PREVENTA])] });

type Delegado = {
  count(a: { where: Record<string, unknown> }): Promise<number>;
  findMany(a: { where: Record<string, unknown> }): Promise<Record<string, unknown>[]>;
  updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
};
const delegado = (db: unknown, modelo: string) =>
  (db as Record<string, Delegado>)[modelo.charAt(0).toLowerCase() + modelo.slice(1)]!;

/* Sin `comparteDominioConId`: antes del SQL la columna no existe y el simulacro igual tiene que correr. */
const CAMPOS_DE_LA_FICHA = { id: true, name: true, company: true, emailDomains: true, siglas: true, hubspotCompanyId: true, ficha: true } as const;

async function main() {
  imprimirDestino();
  console.log(APPLY ? "=== APPLY (escribe) ===" : "=== SIMULACRO (no escribe) ===");

  const hayColumna = await hayColumnaComparteDominio();
  const comparte = await comparteDominioGuardado();
  if (!hayColumna) console.log("⚠ La base todavía no tiene Client.comparteDominioConId (falta el SQL 2026-10-29-dominio-compartido.sql): solo simulacro.");
  const [tecSinMarca, aeSinMarca, proyecto] = await Promise.all([
    prisma.client.findUnique({ where: { id: TEC_ID }, select: CAMPOS_DE_LA_FICHA }),
    prisma.client.findUnique({ where: { id: AE_ID }, select: CAMPOS_DE_LA_FICHA }),
    prisma.project.findUnique({ where: { id: PROYECTO_AE_ID } }),
  ]);
  const tec = tecSinMarca && { ...tecSinMarca, comparteDominioConId: comparte.get(TEC_ID) ?? null };
  const ae = aeSinMarca && { ...aeSinMarca, comparteDominioConId: comparte.get(AE_ID) ?? null };
  const abortar = (m: string): never => {
    console.error(`\n⛔ ${m}`);
    process.exit(1);
  };
  if (!tec || !ae || !proyecto) return abortar("Falta la ficha del TEC, la de AE o el proyecto de AE: revisa los ids del encabezado.");
  if (!tec.emailDomains.includes("itcr.ac.cr")) return abortar(`«${tec.name}» ya no tiene el dominio itcr.ac.cr: no es la ficha que esperaba.`);
  if (tec.comparteDominioConId) return abortar(`«${tec.name}» comparte el dominio de otra ficha: la dueña no puede ser entidad.`);
  if (ae.emailDomains.length > 0) return abortar(`«${ae.name}» tiene dominios propios (${ae.emailDomains.join(", ")}): una entidad comparte el de su dueña.`);
  if (ae.comparteDominioConId && ae.comparteDominioConId !== TEC_ID) return abortar(`«${ae.name}» ya comparte el dominio de otra ficha.`);
  if (proyecto.clientId !== TEC_ID && proyecto.clientId !== AE_ID) return abortar(`El proyecto «${proyecto.name}» es de otra ficha (${proyecto.clientId}).`);
  const colgadasDeAe = [...comparte.values()].filter((c) => c === AE_ID).length;
  if (colgadasDeAe > 0) return abortar(`Hay ${colgadasDeAe} ficha(s) que comparten el dominio de «${ae.name}»: no puede ser entidad.`);

  const cambiosTec = { name: TAE.nombre, siglas: conSigla(tec.siglas, TAE.sigla) };
  const cambiosAe = { name: AE.nombre, siglas: conSigla(ae.siglas, AE.sigla), comparteDominioConId: TEC_ID, hubspotCompanyId: null };
  /* `ficha.propuesta`: lo que propuso la IA y nadie confirmó (lib/clients/ficha.ts). */
  const fichaDelTec = (tec.ficha ?? {}) as Record<string, unknown>;
  /* Solo la primera vez: una propuesta que TAE genere después de separar ya no mezcla nada y no se toca. */
  const hayPropuestaEnLaFicha = !ae.comparteDominioConId && !!fichaDelTec.propuesta;

  console.log("\n── Las dos fichas ──");
  console.log(`  «${tec.name}» → «${cambiosTec.name}»   siglas ${JSON.stringify(tec.siglas)} → ${JSON.stringify(cambiosTec.siglas)}`);
  console.log(`      dominios ${JSON.stringify(tec.emailDomains)} · empresa de HubSpot ${tec.hubspotCompanyId ?? "(ninguna)"}  ← no se tocan`);
  console.log(`  «${ae.name}» → «${cambiosAe.name}»   siglas ${JSON.stringify(ae.siglas)} → ${JSON.stringify(cambiosAe.siglas)}`);
  console.log(`      comparte el dominio de «${cambiosTec.name}» · empresa de HubSpot ${ae.hubspotCompanyId ?? "(ninguna)"} → (ninguna)`);
  if (hayPropuestaEnLaFicha) console.log(`  «${cambiosTec.name}»: la propuesta pendiente de «Información del cliente» se descarta (mezcla AE y TAE).`);

  const proyectosTec = await prisma.project.findMany({
    where: { clientId: { in: [TEC_ID, AE_ID] } },
    select: { id: true, name: true, clientId: true, status: true, serviceType: true },
    orderBy: { name: "asc" },
  });
  console.log("\n── Proyectos ──");
  for (const p of proyectosTec) {
    const despues = p.id === PROYECTO_AE_ID ? AE.nombre : p.clientId === TEC_ID ? TAE.nombre : AE.nombre;
    const marca = p.id === PROYECTO_AE_ID && p.clientId !== AE_ID ? "  ← SE MUEVE" : "";
    console.log(`  · ${p.name} [${p.status}] → «${despues}»${marca}`);
  }

  const dondeMover = { clientId: TEC_ID, projectId: PROYECTO_AE_ID };
  const porTabla: { tabla: string; n: number }[] = [];
  for (const tabla of TABLAS_POR_PROYECTO) {
    const n = await delegado(prisma, tabla).count({ where: dondeMover });
    if (n > 0) porTabla.push({ tabla, n });
  }
  console.log(`\n── Lo que cuelga del proyecto de AE y sigue en «${tec.name}» (pasa a «${AE.nombre}») ──`);
  if (porTabla.length === 0) console.log("  (nada)");
  for (const t of porTabla) console.log(`  · ${t.tabla}: ${t.n}`);

  const preventaId = SEPARACION_TEC.exploracionDeLaEntidadId;
  const [propuesta, preventa] = await Promise.all([
    prisma.businessCase.findUnique({ where: { id: SEPARACION_TEC.propuestaDeLaEntidadId }, select: { id: true, name: true, clientId: true, exploracionId: true, hubspotCompanyId: true } }),
    prisma.exploracionDeVenta.findUnique({ where: { id: preventaId }, select: { id: true, clientId: true } }),
  ]);
  if (!propuesta || !preventa) return abortar("Falta la propuesta o la preventa de AE: revisa los ids de scripts/lib/separacion-tec.ts.");
  if (propuesta.exploracionId !== preventaId) return abortar(`La propuesta «${propuesta.name}» ya no cuelga de la preventa esperada.`);
  const dondePreventa = { clientId: TEC_ID, exploracionId: preventaId };
  const porPreventa: { tabla: string; n: number }[] = [];
  for (const tabla of TABLAS_POR_PREVENTA) {
    const n = await delegado(prisma, tabla).count({ where: dondePreventa });
    if (n > 0) porPreventa.push({ tabla, n });
  }
  const preventaEnTec = preventa.clientId === TEC_ID;
  console.log(`\n── La propuesta «${propuesta.name}» y su preventa (pasan a «${AE.nombre}») ──`);
  console.log(`  · ExploracionDeVenta: ${preventaEnTec ? 1 : 0}`);
  for (const t of porPreventa) console.log(`  · ${t.tabla}: ${t.n}`);

  /* Lo que se queda en TAE por ser de la cuenta: la ficha de AE no lo tendrá. Solo informativo. */
  const deLaCuenta: { tabla: string; n: number }[] = [];
  for (const [modelo, cols] of ESQUEMA) {
    if (modelo === "Project" || modelo === "Client" || !cols.has("clientId")) continue;
    const proyecto = cols.get("projectId"); // undefined: sin columna · true: acepta null · false: obligatoria
    if (proyecto === false) continue;
    const where = proyecto === undefined ? { clientId: TEC_ID } : { clientId: TEC_ID, projectId: null };
    const conPreventa = modelo === "ExploracionDeVenta" ? (preventaEnTec ? 1 : 0) : (porPreventa.find((t) => t.tabla === modelo)?.n ?? 0);
    const n = (await delegado(prisma, modelo).count({ where })) - conPreventa;
    if (n > 0) deLaCuenta.push({ tabla: modelo, n });
  }
  console.log(`\n── Sin proyecto: se queda en «${TAE.nombre}» (HubSpot tiene UNA empresa para las dos) ──`);
  for (const t of deLaCuenta) console.log(`  · ${t.tabla}: ${t.n}`);
  console.log("  Salvo lo que cuelga de una reunión (hechos, tareas…): eso lo reparte scripts/reubicar-reuniones-compartidas.ts.");

  const yaEsta =
    tec.name === cambiosTec.name &&
    tec.siglas.length === cambiosTec.siglas.length &&
    ae.name === cambiosAe.name &&
    ae.siglas.length === cambiosAe.siglas.length &&
    ae.comparteDominioConId === TEC_ID &&
    !ae.hubspotCompanyId &&
    !propuesta.hubspotCompanyId &&
    !hayPropuestaEnLaFicha &&
    proyecto.clientId === AE_ID &&
    porTabla.length === 0 &&
    porPreventa.length === 0 &&
    !preventaEnTec;
  if (yaEsta) {
    console.log("\n✓ Ya está separado. Nada que escribir.");
    return;
  }
  if (!APPLY) {
    console.log("\nPara aplicarlo (después del deploy): ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/separar-tec.ts --apply");
    console.log("Y justo después: ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/reubicar-reuniones-compartidas.ts --apply");
    return;
  }

  if (!hayColumna) return abortar("Primero el SQL 2026-10-29-dominio-compartido.sql y el deploy: sin la columna no hay dónde marcar a AE.");
  const filas: Record<string, unknown[]> = {};
  for (const t of porTabla) filas[t.tabla] = await delegado(prisma, t.tabla).findMany({ where: dondeMover });
  const filasDePreventa: Record<string, unknown[]> = {};
  for (const t of porPreventa) filasDePreventa[t.tabla] = await delegado(prisma, t.tabla).findMany({ where: dondePreventa });
  const clientes = await prisma.client.findMany({ where: { id: { in: [TEC_ID, AE_ID] } } });
  const resumenDeLaCuenta = await prisma.csAccountBrief.findMany({ where: { clientId: TEC_ID } });
  const ruta = guardarRespaldoJson({ clientes, proyecto, filas, resumenDeLaCuenta, preventa: await prisma.exploracionDeVenta.findUnique({ where: { id: preventaId } }), filasDePreventa });
  console.log(`\n[respaldo] ${ruta}`);

  const movidas = await prisma.$transaction(async (tx) => {
    await tx.client.update({ where: { id: TEC_ID }, data: cambiosTec });
    await tx.client.update({ where: { id: AE_ID }, data: cambiosAe });
    await tx.project.update({ where: { id: PROYECTO_AE_ID }, data: { clientId: AE_ID } });
    const out: string[] = [];
    for (const t of porTabla) {
      const r = await delegado(tx, t.tabla).updateMany({ where: dondeMover, data: { clientId: AE_ID } });
      out.push(`${t.tabla}: ${r.count}`);
    }
    if (preventaEnTec) await tx.exploracionDeVenta.update({ where: { id: preventaId }, data: { clientId: AE_ID } });
    await tx.businessCase.update({ where: { id: propuesta.id }, data: { hubspotCompanyId: null } });
    if (hayPropuestaEnLaFicha) {
      await tx.client.update({ where: { id: TEC_ID }, data: { ficha: { ...fichaDelTec, propuesta: null } as Prisma.InputJsonValue } });
    }
    for (const t of porPreventa) {
      const r = await delegado(tx, t.tabla).updateMany({ where: dondePreventa, data: { clientId: AE_ID } });
      out.push(`${t.tabla} (de la preventa): ${r.count}`);
    }
    /* El resumen de la cuenta se redactó con la cuenta unida: queda marcado como desactualizado, no se borra. */
    const resumen = await tx.csAccountBrief.updateMany({ where: { clientId: TEC_ID }, data: { staleAt: new Date() } });
    if (resumen.count) out.push("resumen de la cuenta marcado como desactualizado");
    return out;
  }, { timeout: 60_000 });
  console.log(`\n✓ Separado. «${TAE.nombre}» y «${AE.nombre}»; el proyecto de AE y lo que cuelga de él: ${movidas.join(" · ") || "nada más"}.`);
  console.log("Ahora: ALLOW_PROD_WRITE=1 SIN_RESPALDO=1 npx tsx scripts/reubicar-reuniones-compartidas.ts --apply");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
