import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { describirDestino, resolverApply } from "./lib/guard";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { prisma } from "@/lib/db/prisma";
import { CLAVES_DE_DATO, columnasDelDato, plegarDatosDeLaEmpresa, SELECT_DE_LOS_DATOS } from "@/lib/clients/datos-de-la-empresa";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { detectarFusion, type VeredictoDeFusion } from "@/lib/hubspot/empresa-fusionada";
import { crDateParts } from "@/lib/jobs/time";
import {
  DE_LA_CUENTA,
  SE_MUDAN,
  SE_QUEDAN_A_PROPOSITO,
  SIN_CHOCAR,
  TABLAS_DE_LA_FUSION,
  UNO_A_UNO,
  destinoUnoAUno,
  idDeHubspotFinal,
  plegarClasificacion,
  plegarCuenta,
  plegarFicha,
  repartirSinChocar,
  resolverChoques,
  tablaDe,
  textoDeFusionDeCuenta,
  type CuentaParaFusionar,
  type FichaParaFusionar,
  type ChoqueResuelto,
  type PliegueDeClasificacion,
} from "@/lib/clients/fusion-de-empresas";

/**
 * scripts/merge-duplicate-clients.ts
 *
 * Fusiona dos `Client` que son la MISMA empresa: a la ficha que sigue (el canónico) le pasa TODO lo que cuelga de la
 * otra y después borra la otra, ya vacía. Qué datos quedan lo decide lib/clients/fusion-de-empresas.ts (puro, con
 * pruebas); este archivo mide, muestra y, con permiso, mueve las filas en UNA transacción.
 *
 * Reasigna (absorbida → canónico). QUÉ tablas y con qué regla lo declaran las listas de lib/clients/fusion-de-empresas.ts
 * (SE_MUDAN, SIN_CHOCAR, UNO_A_UNO, DE_LA_CUENTA…), y lib/clients/fusion-cubre-el-esquema.test.ts se pone rojo si una
 * relación hacia la ficha no está en ninguna (2026-10-09: se perdían en cascada las solicitudes fuera de alcance, las
 * licencias, la clasificación, las correcciones del color, las preguntas de tiempo y los clientes de Mercury):
 *   · Todo lo que apunta a la ficha: proyectos, handoffs, documentos, tarjetas de contexto, conocimiento, auditorías,
 *     corridas de agentes, business cases, exploraciones de venta, usuarios externos, tareas, sugerencias, alertas de
 *     CS, correcciones del color, preguntas de tiempo, ingresos variables, comisiones, ventas ganadas, filas de
 *     importación, comentarios de la escala, y los punteros sin relación (sesiones —automático y manual—, eventos,
 *     llamadas a la IA, uso de partners).
 *   · Notas de etapa, asignaciones, solicitudes fuera de alcance y licencias sin chocar con sus únicos: lo que choca se
 *     queda el del canónico, y el de la absorbida va entero al respaldo.
 *   · Lo uno a uno (cuenta de HubSpot, señales de CS, snapshot de CS360, brief, clasificación de la cartera): se muda
 *     si el canónico no lo tiene. La clasificación, si las dos tienen, toma de la otra lo que el canónico no confirmó.
 *   · ⭐ La CUENTA DE COBRO (2026-10-01). Si solo la absorbida tiene, se muda entera. Si las dos, la del canónico
 *     recibe servicios, cobros, alertas, bitácora, facturas soltadas, clientes de Odoo y de Mercury y sus facturas, toma
 *     de la otra los datos que le faltan, anota la fusión en su bitácora, y la otra se borra ya vacía. Hasta ese día el
 *     script se negaba: borrar la ficha se llevaba la cuenta en cascada con su plata (caso real: Librería Internacional).
 *   · Lo que se queda A PROPÓSITO apuntando a la absorbida (SE_QUEDAN_A_PROPOSITO: la foto semanal de Tareas) se cuenta
 *     y se avisa.
 *
 * Y en la ficha que sigue: suma los dominios de correo (las reuniones siguen llegando: INV2), junta las notas, toma lo
 * que le falta y apunta a la empresa de HubSpot VIVA. Si las dos empresas se fusionaron en HubSpot en una tercera
 * —Librería: seis fichas dentro de 58805575479—, la que sigue apunta a esa, y los business cases y ventas que guardaban
 * un id viejo también. HubSpot se lee con el cliente del sistema (`getSystemHubspotClient`): si el token venció, se
 * renueva y se guarda. En el simulacro la base está en solo lectura: el token renovado no se puede guardar, se usa
 * igual (lib/hubspot/client.ts lo avisa) y el simulacro no escribe nada.
 *
 * ⛔ POR DEFECTO ES UN SIMULACRO: la base se abre en solo lectura y se imprime el plan. Para escribir hacen falta
 * `--apply`, `--firma=<correo del equipo>` y `ALLOW_PROD_WRITE=1`. Antes de la primera escritura deja un respaldo JSON
 * propio en `backups/<fecha>-merge-duplicate-clients/` (las dos fichas y las dos cuentas enteras, lo que se borra
 * entero, y el id de cada fila que se muda), además del pg_dump del guard cuando la PC lo tiene.
 *
 *   npx tsx scripts/merge-duplicate-clients.ts --canonico <id> --dup <id> [--nombre "Nombre final"]
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/merge-duplicate-clients.ts <lo mismo> --firma <correo> --apply
 *
 * Sin `--canonico`/`--dup` revisa los pares del incidente de julio (ya fusionados: salen como saltados).
 *
 * VERIFICAR después: `npm run check:invariants` (INV1, INV2, INV13) y `npx tsx scripts/backfill-resolved-client.ts`
 * (simulacro → changed=0).
 */

const QUIERE_ESCRIBIR = process.argv.includes("--apply");
/* ⚠ Antes de la primera consulta: `pg` lee PGOPTIONS al abrir cada conexión. Sin --apply la base no se puede escribir
   ni por error. */
if (!QUIERE_ESCRIBIR) {
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=30000"]
    .filter(Boolean)
    .join(" ");
}

/* Las listas de QUÉ se muda y con qué regla (SE_MUDAN, SIN_CHOCAR, UNO_A_UNO, DE_LA_CUENTA, SE_QUEDAN_A_PROPOSITO)
   viven en lib/clients/fusion-de-empresas.ts: ahí las cubre lib/clients/fusion-cubre-el-esquema.test.ts contra el
   esquema. Este archivo solo las recorre. */

/**
 * Lo que se muda EN ESTA BASE: lo de SE_MUDAN cuya tabla existe. Una tabla que todavía no está (producción antes de
 * aplicar el SQL de un módulo nuevo, como Tareas el 2026-10-09) no tiene filas que mudar, y contarla reventaba el
 * script entero. Se arma en `main` con el catálogo.
 */
let seMudanAqui: readonly (typeof SE_MUDAN)[number][] = SE_MUDAN;
/** Las tablas de la fusión que existen en esta base (lo mismo que `seMudanAqui`, para las demás listas). */
let tablasAqui: ReadonlySet<string> | null = null;
const estaAqui = (modelo: string) => !tablasAqui || tablasAqui.has(tablaDe(modelo));

/** Las tablas de la lista que existen en la base (una consulta al catálogo, solo lectura). */
async function tablasQueExisten(nombres: readonly string[]): Promise<Set<string>> {
  const filas = await prisma.$queryRaw<{ nombre: string }[]>`
    SELECT t.nombre FROM unnest(${[...nombres]}::text[]) AS t(nombre)
    WHERE to_regclass(format('public.%I', t.nombre)) IS NOT NULL`;
  return new Set(filas.map((f) => f.nombre));
}

/** Las tablas que puede escribir una corrida con --apply (salen de las listas): el guard las respalda con pg_dump. */
const TABLAS = TABLAS_DE_LA_FUSION;

/* La forma común de los delegados de Prisma que se usan por nombre. `as unknown as`: TypeScript no puede seguir un
   índice dinámico sobre el cliente. Los modelos de SE_MUDAN, SIN_CHOCAR y DE_LA_CUENTA tienen `id` de texto
   (verificado en el esquema); los de UNO_A_UNO se buscan por `clientId`; los de SE_QUEDAN_A_PROPOSITO solo se cuentan. */
type Fila = { id: string } & Record<string, unknown>;
type Delegado = {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  findMany(args: { where: Record<string, unknown>; select?: Record<string, true> }): Promise<Fila[]>;
  findUnique(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
};
type Db = typeof prisma | Prisma.TransactionClient;
const delegado = (db: Db, modelo: string) => (db as unknown as Record<string, Delegado>)[modelo]!;

// Pares {canónico, dup} del incidente de julio, por id. Quedan como registro: un par nuevo va por argumento.
const PAIRS: { label: string; canonicalId: string; dupId: string }[] = [
  { label: "Bluesat", canonicalId: "cmpc0e02z008bxgij4ksityv4", dupId: "cmpc0dyr5007kxgijyjan7j2c" },
  { label: "Cicadex", canonicalId: "cmoi1jte2000rl8ijeh2d4jx9", dupId: "cmpc0dr1k003txgijkhh2jwrg" },
  { label: "Construtecho", canonicalId: "cmpc0edm200ftxgij3bi1vsmp", dupId: "cmpc0ec8k00f2xgijtd7a2c5o" },
  { label: "Ministerio de Economía", canonicalId: "cmpc0du6h005bxgij30eodfxe", dupId: "cmpc0e44900akxgijla2vd9ah" },
];

const CUENTA_SELECT = {
  id: true,
  tipo: true,
  viaCobro: true,
  moneda: true,
  terminosPago: true,
  estadoCuenta: true,
  excluidaOperacion: true,
  diaCobroAncla: true,
  creditoDias: true,
  responsableCobroTerceros: true,
  notas: true,
  correoCobro: true,
  razonSocial: true,
  cedulaJuridica: true,
} as const;

async function cargarFicha(id: string) {
  const c = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      company: true,
      industry: true,
      notes: true,
      hubspotCompanyId: true,
      emailDomains: true,
      logoUrl: true,
      logoDarkUrl: true,
      logoScale: true,
      kind: true,
      isProspect: true,
      ignoredHubspotServiceIds: true,
      canvas: true,
      canvasConfidence: true,
      ficha: true,
      tamUsd: true,
      ...SELECT_DE_LOS_DATOS,
      cuentaFinanciera: { select: CUENTA_SELECT },
    },
  });
  if (!c) return null;
  const ficha: FichaParaFusionar = { ...c, tamUsd: c.tamUsd === null ? null : Number(c.tamUsd) };
  // Los datos de la empresa (R1) tal cual vienen de la base, para plegarlos con su fuente y su fecha.
  const datos = c as unknown as Record<string, unknown>;
  return { ficha, datos, cuenta: c.cuentaFinanciera as CuentaParaFusionar | null, hubspotCompanyId: c.hubspotCompanyId };
}

/** Sesiones + proyectos: con cuál quedarse si nadie lo dice. Se exige que el canónico no tenga MENOS. */
async function puntaje(clientId: string) {
  const [sesiones, manuales, proyectos] = await Promise.all([
    prisma.firefliesSession.count({ where: { resolvedClientId: clientId } }),
    prisma.firefliesSession.count({ where: { manualClientId: clientId } }),
    prisma.project.count({ where: { clientId } }),
  ]);
  return { sesiones, manuales, proyectos, total: sesiones + manuales + proyectos };
}

/**
 * HubSpot, para saber en qué empresa quedó cada id. Con el cliente del sistema: su `apiRequest` va por el transporte
 * (renueva el token ante un 401 y espera ante un 429). Si el token vence, se renueva y se guarda como en el resto de
 * Nexus; en el simulacro (base en solo lectura) se renueva sin guardarse y se usa igual.
 */
async function veredictosDeHubspot(ids: string[]): Promise<Map<string, VeredictoDeFusion>> {
  const out = new Map<string, VeredictoDeFusion>();
  if (!ids.length) return out;
  try {
    const hs = await getSystemHubspotClient();
    for (const id of ids) out.set(id, await detectarFusion(hs, id));
  } catch (e) {
    console.warn(`  ⚠ No se pudo consultar HubSpot (${e instanceof Error ? e.message : e}): los ids se toman tal cual.`);
  }
  return out;
}

/** Escribe un JSON en la carpeta de respaldo y dice dónde quedó. */
function guardarRespaldo(nombre: string, datos: unknown): string {
  const carpeta = join("backups", `${crDateParts(new Date()).dateKey}-merge-duplicate-clients`);
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, `${new Date().toISOString().replace(/[:.]/g, "-")}-${nombre}.json`);
  writeFileSync(ruta, JSON.stringify(datos, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  return ruta;
}

async function processPair(p: (typeof PAIRS)[number], opciones: { nombre: string | null; firma: string | null; apply: boolean }) {
  const [canon, dup] = await Promise.all([cargarFicha(p.canonicalId), cargarFicha(p.dupId)]);
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`PAR: ${p.label}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  if (!canon || !dup) {
    console.log(`  ⚠ SALTADO: ${!canon ? `el canónico ${p.canonicalId} no existe` : ""}${!dup ? ` la absorbida ${p.dupId} no existe` : ""} (¿ya se fusionaron?)`);
    return { applied: false };
  }
  const [sc, sd] = await Promise.all([puntaje(canon.ficha.id), puntaje(dup.ficha.id)]);
  console.log(`  sigue:     «${canon.ficha.name}» (${canon.ficha.id}) · sesiones ${sc.sesiones}+${sc.manuales} · proyectos ${sc.proyectos}`);
  console.log(`  absorbida: «${dup.ficha.name}» (${dup.ficha.id}) · sesiones ${sd.sesiones}+${sd.manuales} · proyectos ${sd.proyectos}`);
  if (sd.total > sc.total) {
    console.log(`  ⛔ NO SE TOCA: la absorbida tiene más sesiones y proyectos (${sd.total} > ${sc.total}). Pásalas al revés.`);
    return { applied: false };
  }

  /* ⛔ «Información del cliente» es UNA por empresa (el proyecto contenedor, SENTINEL_SERVICE_TYPE): si las dos fichas
     tienen, la que sigue quedaría con dos y ensureClientInfoProject elige con un findFirst sin orden, así que podría abrir
     el vacío (2026-10-11, CAV). Se queda la de la ficha que sigue: la de la absorbida se borra si está vacía (sin bloques
     ni documentos) y, si tiene algo, decide una persona. */
  const contenedores = await prisma.project.findMany({
    where: { clientId: { in: [canon.ficha.id, dup.ficha.id] }, serviceType: SENTINEL_SERVICE_TYPE },
    select: { id: true, clientId: true },
  });
  const contenedorDeLaAbsorbida = contenedores.find((c) => c.clientId === dup.ficha.id) ?? null;
  const hayContenedorQueSigue = contenedores.some((c) => c.clientId === canon.ficha.id);
  let contenedorABorrar: string | null = null;
  if (contenedorDeLaAbsorbida && hayContenedorQueSigue) {
    const [bloques, documentos] = await Promise.all([
      prisma.canvasBlock.count({ where: { section: { canvas: { projectId: contenedorDeLaAbsorbida.id } } } }),
      prisma.clientDocument.count({ where: { projectId: contenedorDeLaAbsorbida.id } }),
    ]);
    if (bloques > 0 || documentos > 0) {
      console.log(
        `  ⛔ NO SE TOCA: las dos tienen «Información del cliente» y la de la absorbida tiene contenido (${bloques} bloques, ` +
          `${documentos} documentos). Pasa a mano lo que haga falta y vuelve.`,
      );
      return { applied: false };
    }
    contenedorABorrar = contenedorDeLaAbsorbida.id;
    console.log(`  «Información del cliente»: la de la absorbida está vacía y se borra; queda la de la ficha que sigue.`);
  }

  /* ── Lo que se muda ──────────────────────────────────────────────────────────── */
  const mueven: Record<string, string[]> = {};
  for (const [modelo, columna] of seMudanAqui) {
    const filas = (await delegado(prisma, modelo).findMany({ where: { [columna]: dup.ficha.id }, select: { id: true } })).filter(
      (f) => !(modelo === "project" && f.id === contenedorABorrar),
    );
    if (filas.length) mueven[`${modelo}.${columna}`] = filas.map((f) => f.id);
  }
  /* ⛔ Una sola exploración VIVA por empresa (índice único parcial): si las dos tienen, decide una persona. */
  const vivas = await prisma.exploracionDeVenta.count({ where: { clientId: { in: [canon.ficha.id, dup.ficha.id] }, archivadaEn: null, projectId: null } });
  const vivasDeLaAbsorbida = await prisma.exploracionDeVenta.count({ where: { clientId: dup.ficha.id, archivadaEn: null, projectId: null } });
  if (vivasDeLaAbsorbida > 0 && vivas > vivasDeLaAbsorbida) {
    console.log("  ⛔ NO SE TOCA: las dos tienen una exploración de venta abierta. Archiva una y vuelve.");
    return { applied: false };
  }
  /* Lo que tiene un único compuesto con la ficha (SIN_CHOCAR): lo que choca con una fila del canónico se queda la del
     canónico, y la de la absorbida va entera al respaldo. */
  const sinChocar: Record<string, { etiqueta: string; total: number; pasan: Fila[]; chocan: Fila[]; choques: ChoqueResuelto<Fila>[] }> = {};
  for (const s of SIN_CHOCAR) {
    if (!estaAqui(s.modelo)) continue;
    const [deDup, deCanon] = await Promise.all([
      delegado(prisma, s.modelo).findMany({ where: { clientId: dup.ficha.id } }),
      delegado(prisma, s.modelo).findMany({ where: { clientId: canon.ficha.id } }),
    ]);
    const { pasan, chocan } = repartirSinChocar(deDup, deCanon, s.clave);
    /* Lo que choca no siempre es «queda la del canónico»: una solicitud que alguien decidió en la absorbida le gana a
       una sin decidir, y una licencia se completa con lo que le falta (resolverChoques). */
    const choques = resolverChoques(s.modelo, chocan, deCanon, s.clave);
    sinChocar[s.modelo] = { etiqueta: s.etiqueta, total: deDup.length, pasan, chocan, choques };
  }
  const frenos = Object.values(sinChocar).flatMap((r) => r.choques.filter((c) => c.accion === "frenar"));
  if (frenos.length) {
    console.log(`  ⛔ NO SE TOCA: ${frenos.map((c) => c.motivo).join("; ")}. Decide a mano con cuál se queda y vuelve.`);
    return { applied: false };
  }

  const unoAUno: Record<string, { destino: ReturnType<typeof destinoUnoAUno>; filaDeLaAbsorbida: Record<string, unknown> | null }> = {};
  let pliegueClasificacion: PliegueDeClasificacion | null = null;
  for (const modelo of UNO_A_UNO) {
    if (!estaAqui(modelo)) continue;
    const [deCanon, deDup] = await Promise.all([
      delegado(prisma, modelo).findUnique({ where: { clientId: canon.ficha.id } }),
      delegado(prisma, modelo).findUnique({ where: { clientId: dup.ficha.id } }),
    ]);
    unoAUno[modelo] = { destino: destinoUnoAUno(!!deCanon, !!deDup), filaDeLaAbsorbida: deDup };
    /* La clasificación la confirmó una persona: si las dos tienen, la del canónico toma lo que no tiene confirmado. */
    if (modelo === "clasificacionDeCuenta" && deCanon && deDup) pliegueClasificacion = plegarClasificacion(deCanon, deDup);
  }
  /* ⛔ Si las dos tienen cuenta de HubSpot propia, la de la absorbida se borra con la ficha y se lleva en cascada el
     conocimiento y las auditorías que le cuelgan por `accountId` (aunque ya se hayan mudado de ficha). */
  const cuentaHsDup = unoAUno.hubspotAccount?.destino === "queda-el-de-la-que-sigue" ? unoAUno.hubspotAccount.filaDeLaAbsorbida : null;
  if (cuentaHsDup) {
    const accountId = String(cuentaHsDup.id);
    const colgados = (await prisma.knowledge.count({ where: { accountId } })) + (await prisma.audit.count({ where: { accountId } }));
    if (colgados > 0) {
      console.log(`  ⛔ NO SE TOCA: las dos tienen cuenta de HubSpot propia y la de la absorbida tiene ${colgados} conocimiento(s) o auditoría(s) colgados: borrarla se los llevaría. Decide a mano a qué cuenta pasan.`);
      return { applied: false };
    }
  }

  /* Lo que se queda A PROPÓSITO apuntando a la absorbida: se cuenta para decirlo. */
  const seQuedan: Record<string, number> = {};
  for (const clave of Object.keys(SE_QUEDAN_A_PROPOSITO)) {
    const [modelo, columna] = clave.split(".") as [string, string];
    if (!estaAqui(modelo)) continue;
    const n = await delegado(prisma, modelo).count({ where: { [columna]: dup.ficha.id } });
    if (n) seQuedan[clave] = n;
  }

  /* ── La cuenta de cobro ──────────────────────────────────────────────────────── */
  const fecha = crDateParts(new Date()).dateKey;
  const deLaCuenta: Record<string, string[]> = {};
  const deLaCuentaAqui = DE_LA_CUENTA.filter(estaAqui);
  if (canon.cuenta && dup.cuenta) {
    for (const modelo of deLaCuentaAqui) {
      const filas = await delegado(prisma, modelo).findMany({ where: { cuentaId: dup.cuenta.id }, select: { id: true } });
      if (filas.length) deLaCuenta[modelo] = filas.map((f) => f.id);
    }
  }
  const pliegueCuenta = canon.cuenta && dup.cuenta ? plegarCuenta(canon.cuenta, dup.cuenta, dup.ficha.name, fecha) : null;

  /* ── La ficha y su empresa de HubSpot ────────────────────────────────────────── */
  const pliegue = plegarFicha(canon.ficha, dup.ficha, fecha);
  const ids = [canon.hubspotCompanyId, dup.hubspotCompanyId].filter((x): x is string => !!x);
  const hub = idDeHubspotFinal(canon.hubspotCompanyId, dup.hubspotCompanyId, await veredictosDeHubspot(ids));
  const copiasDelIdViejo = hub.id && hub.reemplaza.length
    ? {
        businessCases: await prisma.businessCase.count({ where: { hubspotCompanyId: { in: hub.reemplaza } } }),
        ventas: await prisma.ventaGanada.count({ where: { hubspotCompanyId: { in: hub.reemplaza } } }),
      }
    : { businessCases: 0, ventas: 0 };

  /* ── El plan, en palabras ────────────────────────────────────────────────────── */
  console.log("\n  Pasa a la ficha que sigue:");
  const etiquetas = Object.entries(mueven).map(([k, v]) => `${k.replace(/\.(clientId|clienteId)$/, "")} ${v.length}`);
  console.log(`    ${etiquetas.join(" · ") || "nada"}`);
  for (const r of Object.values(sinChocar)) {
    if (!r.total) console.log(`    ${r.etiqueta}: la absorbida no tiene`);
    else {
      const n = (a: string) => r.choques.filter((c) => c.accion === a).length;
      const partes = [
        n("borrar-absorbida") ? `${n("borrar-absorbida")} chocan y queda la del canónico` : null,
        n("reemplazar") ? `${n("reemplazar")} chocan y queda la de la absorbida (la decidió una persona)` : null,
        n("plegar") ? `${n("plegar")} chocan y la del canónico toma de la otra lo que le falta` : null,
      ].filter(Boolean);
      console.log(`    ${r.etiqueta}: ${r.pasan.length} pasan${partes.length ? `, ${partes.join(", ")}` : ""}`);
      for (const c of r.choques) if (c.motivo) console.log(`      ⚠ ${c.motivo}`);
    }
  }
  const sinUnoAUno = Object.entries(unoAUno).filter(([, u]) => u.destino === "nada").map(([m]) => m);
  if (sinUnoAUno.length) console.log(`    la absorbida no tiene: ${sinUnoAUno.join(", ")}`);
  for (const [modelo, u] of Object.entries(unoAUno)) {
    if (u.destino === "mover") console.log(`    ${modelo}: se muda`);
    if (u.destino === "queda-el-de-la-que-sigue") {
      const toma = modelo === "clasificacionDeCuenta" && pliegueClasificacion?.tomados.length ? ` (toma de la otra: ${pliegueClasificacion.tomados.join(", ")})` : "";
      console.log(`    ${modelo}: las dos tienen; queda el del canónico${toma} y el otro se va`);
    }
  }
  for (const [clave, n] of Object.entries(seQuedan)) {
    console.log(`    ⚠ ${clave}: ${n} fila(s) siguen con el id de la absorbida, a propósito: ${SE_QUEDAN_A_PROPOSITO[clave]}`);
  }
  console.log("\n  Cuenta de cobro:");
  if (!dup.cuenta) console.log("    la absorbida no tiene: nada que mover");
  else if (!canon.cuenta) console.log(`    solo la absorbida tiene (${dup.cuenta.id}): se muda entera a la ficha que sigue`);
  else {
    console.log(`    las dos tienen: a ${canon.cuenta.id} pasan ${Object.entries(deLaCuenta).map(([k, v]) => `${k} ${v.length}`).join(" · ") || "nada"}`);
    if (Object.keys(pliegueCuenta!.cambios).length) console.log(`    toma de la otra: ${Object.keys(pliegueCuenta!.cambios).join(", ")}`);
    for (const d of pliegueCuenta!.diferencias) console.log(`    ⚠ ${d}`);
    console.log(`    después se borra la cuenta ${dup.cuenta.id}, ya vacía, y queda la fusión anotada en la bitácora`);
  }
  console.log("\n  Ficha que sigue:");
  if (opciones.nombre) console.log(`    nombre: «${canon.ficha.name}» → «${opciones.nombre}»`);
  if (pliegue.dominiosNuevos.length) console.log(`    dominios: + ${pliegue.dominiosNuevos.join(", ")}`);
  const otros = Object.keys(pliegue.cambios).filter((k) => k !== "emailDomains");
  if (otros.length) console.log(`    toma de la otra: ${otros.join(", ")}`);
  // Los datos de la empresa los pliega la regla nueva (con su fuente): el simulacro los muestra igual que lo escribirá.
  const datosPlegados = plegarDatosDeLaEmpresa(canon.datos, dup.datos);
  const datosQueToma = CLAVES_DE_DATO.filter((c) => c in datosPlegados).map((c) => `${c} = ${String(datosPlegados[c])} (${String(datosPlegados[columnasDelDato(c).fuente] ?? "sin fuente")})`);
  if (datosQueToma.length) console.log(`    datos de la empresa que toma de la otra: ${datosQueToma.join(" · ")}`);
  console.log(`    HubSpot: ${canon.hubspotCompanyId ?? "—"} → ${hub.id ?? "—"} · ${hub.motivo}`);
  if (copiasDelIdViejo.businessCases || copiasDelIdViejo.ventas) {
    console.log(`    y el id viejo se cambia en ${copiasDelIdViejo.businessCases} business case(s) y ${copiasDelIdViejo.ventas} venta(s)`);
  }
  console.log(`\n  → Se BORRA «${dup.ficha.name}» (${dup.ficha.id}), ya vacía.`);

  if (!opciones.apply) return { applied: false };

  /* ── Aplicar ─────────────────────────────────────────────────────────────────── */
  const [fichaCanonEntera, fichaDupEntera, cuentaCanonEntera, cuentaDupEntera] = await Promise.all([
    prisma.client.findUnique({ where: { id: canon.ficha.id } }),
    prisma.client.findUnique({ where: { id: dup.ficha.id } }),
    canon.cuenta ? prisma.cuentaFinanciera.findUnique({ where: { id: canon.cuenta.id } }) : null,
    dup.cuenta ? prisma.cuentaFinanciera.findUnique({ where: { id: dup.cuenta.id } }) : null,
  ]);
  const antes = guardarRespaldo("antes", {
    par: p,
    firma: opciones.firma,
    fichas: { sigue: fichaCanonEntera, absorbida: fichaDupEntera },
    cuentas: { sigue: cuentaCanonEntera, absorbida: cuentaDupEntera },
    mueven,
    sinChocarPasan: Object.fromEntries(Object.entries(sinChocar).filter(([, r]) => r.pasan.length).map(([m, r]) => [m, r.pasan.map((f) => f.id)])),
    unoAUnoSeMudan: Object.entries(unoAUno).filter(([, u]) => u.destino === "mover").map(([m]) => m),
    clasificacionTomaDeLaOtra: pliegueClasificacion?.tomados ?? [],
    deLaCuenta,
    seBorranEnteras: {
      sinChocar: Object.fromEntries(Object.entries(sinChocar).filter(([, r]) => r.chocan.length).map(([m, r]) => [m, r.chocan])),
      // Lo de la que sigue que se reemplaza (queda la de la absorbida) o se completa (las licencias), como estaba.
      sinChocarDeLaQueSigue: Object.fromEntries(
        Object.entries(sinChocar)
          .filter(([, r]) => r.choques.some((c) => c.accion === "reemplazar" || c.accion === "plegar"))
          .map(([m, r]) => [m, r.choques.filter((c) => c.accion === "reemplazar" || c.accion === "plegar").map((c) => c.sigue)]),
      ),
      unoAUno: Object.fromEntries(Object.entries(unoAUno).filter(([, u]) => u.destino === "queda-el-de-la-que-sigue").map(([m, u]) => [m, u.filaDeLaAbsorbida])),
    },
    seQuedanConElIdDeLaAbsorbida: seQuedan,
    hubspot: hub,
  });
  console.log(`\n  respaldo: ${antes}`);

  await prisma.$transaction(
    async (tx) => {
      const a = { canon: canon.ficha.id, dup: dup.ficha.id };
      // Antes de mudar los proyectos: el contenedor vacío de la absorbida no pasa (ver arriba). Se lleva su canvas vacío.
      if (contenedorABorrar) await tx.project.delete({ where: { id: contenedorABorrar } });
      /* El siguiente paso de la CUENTA apunta a la ficha por `objetoId` (sin FK). Un vigente por objeto y equipo: si las
         dos tienen el del mismo equipo, queda el de la que sigue y el otro pasa a «reemplazado» (sigue en la historia). */
      if (estaAqui("siguientePaso")) {
        const deLaQueSigue = await tx.siguientePaso.findMany({ where: { objeto: "empresa", objetoId: a.canon, estado: "vigente" }, select: { equipo: true } });
        if (deLaQueSigue.length) {
          await tx.siguientePaso.updateMany({
            where: { objeto: "empresa", objetoId: a.dup, estado: "vigente", equipo: { in: deLaQueSigue.map((x) => x.equipo) } },
            data: { estado: "reemplazado", cerradoAt: new Date(), cerradoPor: opciones.firma! },
          });
        }
        await tx.siguientePaso.updateMany({ where: { objeto: "empresa", objetoId: a.dup }, data: { objetoId: a.canon } });
      }
      for (const [modelo, columna] of seMudanAqui) {
        await delegado(tx, modelo).updateMany({ where: { [columna]: a.dup }, data: { [columna]: a.canon } });
      }
      for (const [modelo, r] of Object.entries(sinChocar)) {
        if (r.pasan.length) await delegado(tx, modelo).updateMany({ where: { id: { in: r.pasan.map((f) => f.id) } }, data: { clientId: a.canon } });
        for (const c of r.choques) {
          const idSigue = String(c.sigue.id);
          if (c.accion === "reemplazar") {
            // Primero se borra la del canónico: las dos tienen la misma clave única.
            await delegado(tx, modelo).deleteMany({ where: { id: { in: [idSigue] } } });
            await delegado(tx, modelo).updateMany({ where: { id: { in: [c.absorbida.id] } }, data: { clientId: a.canon } });
            continue;
          }
          if (c.accion === "plegar" && c.cambios && Object.keys(c.cambios).length) {
            await delegado(tx, modelo).updateMany({ where: { id: { in: [idSigue] } }, data: c.cambios });
          }
          await delegado(tx, modelo).deleteMany({ where: { id: { in: [c.absorbida.id] } } });
        }
      }
      for (const [modelo, u] of Object.entries(unoAUno)) {
        if (u.destino === "mover") await delegado(tx, modelo).updateMany({ where: { clientId: a.dup }, data: { clientId: a.canon } });
      }
      if (pliegueClasificacion && Object.keys(pliegueClasificacion.cambios).length) {
        await tx.clasificacionDeCuenta.update({
          where: { clientId: a.canon },
          data: pliegueClasificacion.cambios as Prisma.ClasificacionDeCuentaUpdateInput,
        });
      }

      /* La cuenta de cobro, ANTES de borrar la ficha: borrarla se la llevaría en cascada con sus cobros. */
      if (dup.cuenta && !canon.cuenta) {
        await tx.cuentaFinanciera.update({ where: { id: dup.cuenta.id }, data: { clientId: a.canon } });
        await tx.bitacoraCobro.create({
          data: {
            cuentaId: dup.cuenta.id,
            tipo: "NOTA",
            contenido: `${opciones.firma} fusionó «${dup.ficha.name}» en «${opciones.nombre ?? canon.ficha.name}», que era la misma empresa: la cuenta pasó entera a esa ficha.`,
            usuarioEmail: opciones.firma!,
          },
        });
      } else if (dup.cuenta && canon.cuenta) {
        for (const modelo of deLaCuentaAqui) {
          await delegado(tx, modelo).updateMany({ where: { cuentaId: dup.cuenta.id }, data: { cuentaId: canon.cuenta.id } });
        }
        if (Object.keys(pliegueCuenta!.cambios).length) {
          await tx.cuentaFinanciera.update({ where: { id: canon.cuenta.id }, data: pliegueCuenta!.cambios as Prisma.CuentaFinancieraUpdateInput });
        }
        const n = (m: string) => deLaCuenta[m]?.length ?? 0;
        await tx.bitacoraCobro.create({
          data: {
            cuentaId: canon.cuenta.id,
            tipo: "NOTA",
            contenido: textoDeFusionDeCuenta(
              opciones.firma!,
              dup.ficha.name,
              {
                servicios: n("servicioContratado"),
                cobros: n("cobro"),
                alertas: n("alertaCobro"),
                bitacora: n("bitacoraCobro"),
                facturasSoltadas: n("facturaLiberada"),
                clientesDeOdoo: n("odooPartnerVinculo"),
                facturasDeOdoo: n("facturaOdoo"),
                clientesDeMercury: n("clienteMercury"),
              },
              pliegueCuenta!.diferencias,
            ),
            usuarioEmail: opciones.firma!,
          },
        });
        await tx.cuentaFinanciera.delete({ where: { id: dup.cuenta.id } });
      }

      if (hub.id && hub.reemplaza.length) {
        await tx.businessCase.updateMany({ where: { hubspotCompanyId: { in: hub.reemplaza } }, data: { hubspotCompanyId: hub.id } });
        await tx.ventaGanada.updateMany({ where: { hubspotCompanyId: { in: hub.reemplaza } }, data: { hubspotCompanyId: hub.id } });
      }
      /* Borrar la absorbida, ya vacía, y DESPUÉS dejar la ficha que sigue con su nombre final: así nunca hay dos
         empresas con el mismo nombre, ni siquiera dentro de la transacción. */
      await tx.client.delete({ where: { id: a.dup } });
      await tx.client.update({
        where: { id: a.canon },
        data: {
          ...(pliegue.cambios as Prisma.ClientUpdateInput),
          ...(plegarDatosDeLaEmpresa(canon.datos, dup.datos) as Prisma.ClientUpdateInput),
          hubspotCompanyId: hub.id,
          ...(opciones.nombre ? { name: opciones.nombre } : {}),
        },
      });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  const despues = guardarRespaldo("despues", {
    sigue: canon.ficha.id,
    absorbidaBorrada: dup.ficha.id,
    cuentaQueSigue: canon.cuenta?.id ?? dup.cuenta?.id ?? null,
    cuentaBorrada: canon.cuenta && dup.cuenta ? dup.cuenta.id : null,
    hubspotCompanyId: hub.id,
    comoDeshacer:
      "Recrear la ficha absorbida (y su cuenta, si se borró) con los datos y los ids del respaldo «antes»; devolver a la " +
      "absorbida cada id de «mueven», de «sinChocarPasan» y de «deLaCuenta», y lo uno a uno de «unoAUnoSeMudan»; " +
      "recrear lo de «seBorranEnteras»; quitarle a la clasificación de la que sigue lo de «clasificacionTomaDeLaOtra»; y " +
      "dejar la ficha que sigue con los dominios, notas, nombre e id de HubSpot de «antes».",
  });
  console.log(`  ✓ Fusionada: «${dup.ficha.name}» → «${opciones.nombre ?? canon.ficha.name}». Respaldo de lo hecho: ${despues}`);
  return { applied: true };
}

function argValue(flag: string): string | null {
  const conIgual = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (conIgual) return conIgual.slice(flag.length + 1).trim() || null;
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith("--") ? process.argv[i + 1]! : null;
}

/** Resuelve una ficha por id o por nombre. Aborta ante la ambigüedad en vez de elegir. */
async function resolverFicha(arg: string): Promise<{ id: string; name: string }> {
  const porId = await prisma.client.findUnique({ where: { id: arg }, select: { id: true, name: true } });
  if (porId) return porId;
  const exactos = await prisma.client.findMany({
    where: { name: { equals: arg, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) throw new Error(`"${arg}" coincide con ${exactos.length} fichas con ese nombre exacto. Pasa el id.`);
  const parciales = await prisma.client.findMany({
    where: { name: { contains: arg, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (parciales.length === 1) return parciales[0];
  if (parciales.length === 0) throw new Error(`Ninguna ficha coincide con "${arg}".`);
  throw new Error(`"${arg}" coincide con ${parciales.length} fichas (${parciales.map((c) => c.name).join(", ")}). Pasa el id.`);
}

async function main() {
  const firma = argValue("--firma");
  const nombre = argValue("--nombre");
  /* ⛔ El guard de siempre: con --apply exige ALLOW_PROD_WRITE=1 contra producción y respalda las tablas con pg_dump
     antes de devolver. */
  // Solo lo que existe en esta base: el respaldo de una tabla que no está haría fallar el pg_dump y no escribir nada.
  const existen = await tablasQueExisten([...TABLAS, ...Object.keys(SE_QUEDAN_A_PROPOSITO).map((k) => tablaDe(k.split(".")[0]!))]);
  const noEstan = TABLAS.filter((t) => !existen.has(t));
  seMudanAqui = SE_MUDAN.filter(([m]) => existen.has(tablaDe(m)));
  tablasAqui = existen;
  if (noEstan.length) console.log(`(esta base no tiene ${noEstan.join(", ")}: ahí no hay nada que mudar ni respaldar)`);
  const APPLY = resolverApply({ tablas: TABLAS.filter((t) => existen.has(t)) });
  if (APPLY !== QUIERE_ESCRIBIR) throw new Error("--apply y el guard no dicen lo mismo: no se escribe nada.");
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "APLICAR" : "SIMULACRO (no escribe)"}`);
  if (APPLY) {
    if (!firma) throw new Error("--firma=<correo del equipo> es obligatoria con --apply: la fusión queda firmada.");
    const persona = await prisma.teamMember.findUnique({ where: { email: firma }, select: { name: true } });
    if (!persona) throw new Error(`--firma=${firma} no es de nadie del equipo.`);
  }

  const argCanon = argValue("--canonico");
  const argDup = argValue("--dup");
  if ((argCanon === null) !== (argDup === null)) throw new Error("--canonico y --dup van juntos.");
  let pares = PAIRS;
  if (argCanon && argDup) {
    const [c, d] = await Promise.all([resolverFicha(argCanon), resolverFicha(argDup)]);
    if (c.id === d.id) throw new Error("El canónico y la absorbida son la misma ficha.");
    pares = [{ label: `${c.name} ← ${d.name}`, canonicalId: c.id, dupId: d.id }];
  } else if (nombre) {
    throw new Error("--nombre va con un par (--canonico y --dup).");
  }

  let aplicados = 0;
  for (const p of pares) {
    const r = await processPair(p, { nombre, firma, apply: APPLY });
    if (r.applied) aplicados++;
  }

  console.log(`\n───────────────────────────────────────────────────────────────`);
  if (!APPLY) {
    console.log("Simulacro: no se escribió nada. Revisa el plan y los ⚠; para aplicar, el mismo comando con --firma y --apply.");
  } else {
    console.log(`✓ ${aplicados}/${pares.length} pares fusionados.`);
    console.log("VERIFICAR ahora:");
    console.log("  npm run check:invariants                         # INV1, INV2 e INV13");
    console.log("  npx tsx scripts/backfill-resolved-client.ts      # simulacro → changed=0");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? `\n✗ ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
