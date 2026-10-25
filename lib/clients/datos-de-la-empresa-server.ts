/**
 * lib/clients/datos-de-la-empresa-server.ts — el ÚNICO lugar que cambia un dato de la empresa (R1, 2026-10-24). SERVIDOR.
 *
 * Todo valor que llega (una persona en la ficha, la investigación, HubSpot, la carga inicial, el TAM que recalcula Nexus)
 * pasa por `proponerDatoEnTx`, que le pregunta a `quienManda` (lib/clients/datos-de-la-empresa.ts) y, en la MISMA
 * transacción, escribe la columna con su fuente y su fecha y deja su fila en `PropuestaDeDato` (la historia: R9). Si no
 * le toca aplicarlo, lo deja como propuesta pendiente. Un escritor que fuera directo a la columna dejaría una fuente que
 * miente: `datos-de-la-empresa-escritores.test.ts` lo frena.
 *
 * Efectos encadenados, en la misma transacción: la industria de Smarteam deriva la edición de la escala, y cambiar algo
 * de lo que lee el TAM estimado v1 lo recalcula (lib/clients/tam-v1.ts).
 *
 * Decisión: DECISIONS › «Los datos de la empresa».
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  CATALOGO_DE_DATOS,
  columnasDelDato,
  SELECT_DE_LOS_DATOS,
  datoDeLaEmpresa,
  edicionDeLaIndustria,
  esFuenteDeDato,
  leerValor,
  quienManda,
  type ClaveDeDato,
  type EstadoDePropuesta,
  type FuenteDeDato,
  type ValorDeDato,
  type Veredicto,
} from "./datos-de-la-empresa";
import { calcularTamV1, citaDelTam, type CalculoDelTam, type EntradaDelTam } from "./tam-v1";


type Tx = Prisma.TransactionClient;

export class ErrorDeDato extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** Lo que el TAM v1 lee: cambiar cualquiera de estos lo recalcula. */
const LO_QUE_LEE_EL_TAM: readonly ClaveDeDato[] = [
  "empleados",
  "estructura",
  "filiales",
  "industriaSmarteam",
  "aQuienVende",
  "perfilCierre",
  "perfilDespues",
  "baseConsentimiento",
  "calificaInsider",
];

export interface ValorConFuente {
  valor: ValorDeDato | null;
  fuente: FuenteDeDato | null;
  at: Date | null;
}

/** Una fila de `Client` (con `SELECT_DE_LOS_DATOS`) a sus datos, con los Decimal cruzados a number. */
export function datosDeLaFila(fila: Record<string, unknown>): Record<ClaveDeDato, ValorConFuente> {
  const out = {} as Record<ClaveDeDato, ValorConFuente>;
  for (const d of CATALOGO_DE_DATOS) {
    const c = columnasDelDato(d.clave);
    const crudo = fila[c.valor];
    const valor =
      crudo === null || crudo === undefined
        ? null
        : d.tipo === "dinero" || d.tipo === "entero"
          ? Number(crudo)
          : String(crudo);
    const fuente = fila[c.fuente];
    const at = fila[c.at];
    // Un valor de antes de que existiera su fuente toma la de su catálogo (el TAM viejo lo puso una persona).
    const deDonde = esFuenteDeDato(fuente) ? fuente : valor !== null ? (d.fuenteDeLoViejo ?? null) : null;
    out[d.clave] = { valor, fuente: deDonde, at: at instanceof Date ? at : null };
  }
  return out;
}

/**
 * La fila de la empresa, bloqueada hasta que termine la transacción: dos cambios del mismo dato a la vez (la
 * investigación y una persona) se hacen uno después del otro, y el segundo ve lo que dejó el primero. Sin esto, los dos
 * leían «vacío» y el último en escribir ganaba, aunque fuera la IA pisando a la persona. Reentrante: los efectos que
 * corren en la misma transacción no se bloquean a sí mismos.
 */
async function bloquearEmpresaEnTx(tx: Tx, clientId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Client" WHERE "id" = ${clientId} FOR UPDATE`;
}

async function leerDatosEnTx(tx: Tx, clientId: string): Promise<Record<ClaveDeDato, ValorConFuente>> {
  const fila = await tx.client.findUnique({ where: { id: clientId }, select: SELECT_DE_LOS_DATOS });
  if (!fila) throw new ErrorDeDato("La empresa no existe.", 404);
  return datosDeLaFila(fila as Record<string, unknown>);
}

async function escribirEnTx(tx: Tx, clientId: string, clave: ClaveDeDato, valor: ValorDeDato | null, fuente: FuenteDeDato, ahora: Date, extra: Record<string, unknown> = {}) {
  const c = columnasDelDato(clave);
  // Las columnas salen del catálogo, que el test cruza con el esquema: el tipo dinámico se afirma en esta frontera.
  const data = { [c.valor]: valor, [c.fuente]: fuente, [c.at]: ahora, ...extra } as Prisma.ClientUncheckedUpdateInput;
  await tx.client.update({ where: { id: clientId }, data });
}

const aJson = (v: ValorDeDato | null): Prisma.InputJsonValue => (v === null ? { __vacio: true } : v);

/** El valor guardado en una fila de `PropuestaDeDato` (el vacío se guarda como `{__vacio:true}`: `null` en Json es ambiguo). */
export function valorDeLaFila(v: unknown): ValorDeDato | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  return null;
}

export interface PedidoDeDato {
  clientId: string;
  clave: ClaveDeDato;
  /** El valor crudo: se lee con el tipo del catálogo. */
  valor: unknown;
  fuente: FuenteDeDato;
  /** La persona que lo propone o lo decide (TeamMember). */
  autorId?: string | null;
  cita?: string | null;
  enlace?: string | null;
  /** Solo cuenta con fuente `persona`: tiene `clientes.decidirDatos`. */
  puedeDecidir?: boolean;
  ahora?: Date;
}

export interface ResultadoDelDato {
  clave: ClaveDeDato;
  veredicto: Veredicto;
  /** La fila que dejó (la aplicada o la pendiente), si dejó una. */
  propuestaId: string | null;
}

/**
 * Un valor para un dato: lo aplica, lo deja como propuesta o no hace nada, según `quienManda`. Devuelve lo que hizo,
 * más lo que hicieron los efectos (la edición de la escala, el TAM) a continuación.
 */
export async function proponerDatoEnTx(tx: Tx, p: PedidoDeDato): Promise<ResultadoDelDato[]> {
  const dato = datoDeLaEmpresa(p.clave);
  const lectura = leerValor(dato, p.valor);
  if (!lectura.ok) throw new ErrorDeDato(lectura.error);
  const ahora = p.ahora ?? new Date();
  await bloquearEmpresaEnTx(tx, p.clientId);
  const actuales = await leerDatosEnTx(tx, p.clientId);
  const actual = actuales[p.clave];
  const veredicto = quienManda({
    dato,
    actual: { valor: actual.valor, fuente: actual.fuente },
    propuesta: { valor: lectura.valor, fuente: p.fuente },
    puedeDecidir: p.puedeDecidir === true,
  });
  if (veredicto.accion === "nada") return [{ clave: p.clave, veredicto, propuestaId: null }];

  const esPersona = p.fuente === "persona";
  if (veredicto.accion === "proponer") {
    // Una propuesta nueva de la misma fuente (y la misma persona) reemplaza a la que esperaba.
    await tx.propuestaDeDato.updateMany({
      where: { clientId: p.clientId, campo: p.clave, estado: "pendiente", fuente: p.fuente, ...(esPersona ? { autorId: p.autorId ?? null } : {}) },
      data: { estado: "reemplazada" satisfies EstadoDePropuesta },
    });
    const fila = await tx.propuestaDeDato.create({
      data: {
        clientId: p.clientId,
        campo: p.clave,
        valor: aJson(lectura.valor),
        fuente: p.fuente,
        autorId: esPersona ? (p.autorId ?? null) : null,
        cita: p.cita?.slice(0, 2000) ?? null,
        enlace: p.enlace?.slice(0, 1000) ?? null,
        estado: "pendiente",
      },
      select: { id: true },
    });
    return [{ clave: p.clave, veredicto, propuestaId: fila.id }];
  }

  // aplicar
  const extra = p.clave === "tamUsd" && p.fuente !== "nexus" ? { tamCalculo: null } : {};
  await escribirEnTx(tx, p.clientId, p.clave, lectura.valor, p.fuente, ahora, extra);
  const fila = await tx.propuestaDeDato.create({
    data: {
      clientId: p.clientId,
      campo: p.clave,
      valor: aJson(lectura.valor),
      valorAnterior: aJson(actual.valor),
      valorDecidido: aJson(lectura.valor),
      fuente: p.fuente,
      autorId: esPersona ? (p.autorId ?? null) : null,
      cita: p.cita?.slice(0, 2000) ?? null,
      enlace: p.enlace?.slice(0, 1000) ?? null,
      estado: "aplicada",
      decididaPorId: esPersona ? (p.autorId ?? null) : null,
      decididaAt: ahora,
    },
    select: { id: true },
  });
  await cerrarPendientesEnTx(tx, p.clientId, p.clave, lectura.valor, esPersona);
  const efectos = await efectosEnTx(tx, p.clientId, p.clave, lectura.valor, ahora);
  return [{ clave: p.clave, veredicto, propuestaId: fila.id }, ...efectos];
}

/**
 * Después de aplicar un valor: si lo decidió una persona, las pendientes de ese dato ya no tienen sentido; si no, solo
 * las que proponían el mismo valor que quedó.
 */
async function cerrarPendientesEnTx(tx: Tx, clientId: string, clave: ClaveDeDato, valor: ValorDeDato | null, todas: boolean) {
  const pendientes = await tx.propuestaDeDato.findMany({ where: { clientId, campo: clave, estado: "pendiente" }, select: { id: true, valor: true } });
  const ids = pendientes.filter((x) => todas || valorDeLaFila(x.valor) === valor).map((x) => x.id);
  if (ids.length) await tx.propuestaDeDato.updateMany({ where: { id: { in: ids } }, data: { estado: "reemplazada" } });
}

async function efectosEnTx(tx: Tx, clientId: string, clave: ClaveDeDato, valor: ValorDeDato | null, ahora: Date): Promise<ResultadoDelDato[]> {
  const out: ResultadoDelDato[] = [];
  if (clave === "industriaSmarteam") {
    out.push(
      ...(await proponerDatoEnTx(tx, {
        clientId,
        clave: "edicionEscala",
        valor: edicionDeLaIndustria(typeof valor === "string" ? valor : null),
        fuente: "nexus",
        cita: "Sale de la industria de Smarteam.",
        ahora,
      })),
    );
  }
  if (LO_QUE_LEE_EL_TAM.includes(clave)) out.push(...(await recalcularTamEnTx(tx, clientId, ahora)));
  return out;
}

/** Lo que el TAM v1 lee de una empresa. */
export function entradaDelTam(d: Record<ClaveDeDato, ValorConFuente>): EntradaDelTam {
  const n = (k: ClaveDeDato) => (typeof d[k].valor === "number" ? (d[k].valor as number) : null);
  const s = (k: ClaveDeDato) => (typeof d[k].valor === "string" ? (d[k].valor as string) : null);
  return {
    empleados: n("empleados"),
    estructura: s("estructura"),
    filiales: n("filiales"),
    industriaSmarteam: s("industriaSmarteam"),
    aQuienVende: s("aQuienVende"),
    perfilCierre: s("perfilCierre"),
    perfilDespues: s("perfilDespues"),
    baseConsentimiento: s("baseConsentimiento"),
    calificaInsider: s("calificaInsider"),
  };
}

/**
 * Recalcula el TAM estimado v1 con lo que tiene la empresa. Si Nexus manda, lo aplica y guarda cómo lo calculó; si una
 * persona lo corrigió, queda como propuesta. Sin empleados no hay TAM y no se toca nada.
 */
export async function recalcularTamEnTx(tx: Tx, clientId: string, ahora = new Date()): Promise<ResultadoDelDato[]> {
  const calculo = calcularTamV1(entradaDelTam(await leerDatosEnTx(tx, clientId)));
  if (calculo.total === null) return [];
  const r = await proponerDatoEnTx(tx, { clientId, clave: "tamUsd", valor: calculo.total, fuente: "nexus", cita: citaDelTam(calculo), ahora });
  const aplicado = r[0]?.veredicto.accion === "aplicar";
  // El cálculo se guarda también cuando el monto no cambió (otra explicación, otro supuesto): describe el valor que hay.
  const fila = await tx.client.findUnique({ where: { id: clientId }, select: { tamFuente: true } });
  if (aplicado || (r[0]?.veredicto.accion === "nada" && fila?.tamFuente === "nexus")) {
    await tx.client.update({ where: { id: clientId }, data: { tamCalculo: calculo as unknown as Prisma.InputJsonValue } });
  }
  return r;
}

/**
 * Los datos con que NACE una ficha: el valor con su fuente y su fecha (HubSpot, o la persona que la crea a mano). Al
 * nacer no hay nada que decidir ni un valor anterior, así que no deja fila: la historia empieza con el primer cambio.
 */
export function datosAlNacerDesdeHubspot(
  d: { industry?: string | null },
  ahora = new Date(),
  fuente: FuenteDeDato = "hubspot",
): { industry: string | null; industryFuente?: FuenteDeDato; industryAt?: Date } {
  const industry = d.industry?.trim() || null;
  return industry ? { industry, industryFuente: fuente, industryAt: ahora } : { industry: null };
}

export function proponerDato(p: PedidoDeDato): Promise<ResultadoDelDato[]> {
  return prisma.$transaction((tx) => proponerDatoEnTx(tx, p));
}

// ── Decidir una propuesta ────────────────────────────────────────────────────────────────────────

export type DecisionDePropuesta = { accion: "usar" } | { accion: "editar"; valor: unknown } | { accion: "descartar" };

/**
 * Usar, editar o descartar una propuesta pendiente. Quien llama ya verificó `clientes.decidirDatos` y el acceso a la
 * empresa. Si otra persona la decidió primero, 409.
 */
export async function decidirPropuesta(args: { clientId: string; propuestaId: string; decision: DecisionDePropuesta; decidePorId: string; ahora?: Date }): Promise<ResultadoDelDato[]> {
  const ahora = args.ahora ?? new Date();
  return prisma.$transaction(async (tx) => {
    await bloquearEmpresaEnTx(tx, args.clientId);
    const p = await tx.propuestaDeDato.findFirst({ where: { id: args.propuestaId, clientId: args.clientId } });
    if (!p) throw new ErrorDeDato("Esa propuesta no existe.", 404);
    if (p.estado !== "pendiente") throw new ErrorDeDato("Esa propuesta ya la decidió alguien. Vuelve a cargar la ficha.", 409);
    const clave = p.campo as ClaveDeDato;
    const dato = datoDeLaEmpresa(clave);

    const estado: EstadoDePropuesta = args.decision.accion === "usar" ? "usada" : args.decision.accion === "editar" ? "editada" : "descartada";
    let valor: ValorDeDato | null = null;
    if (args.decision.accion === "editar") {
      const l = leerValor(dato, args.decision.valor);
      if (!l.ok) throw new ErrorDeDato(l.error);
      valor = l.valor;
    } else if (args.decision.accion === "usar") {
      valor = valorDeLaFila(p.valor);
    }

    const actual = (await leerDatosEnTx(tx, args.clientId))[clave];
    const tomada = await tx.propuestaDeDato.updateMany({
      where: { id: p.id, estado: "pendiente" },
      data: {
        estado,
        decididaPorId: args.decidePorId,
        decididaAt: ahora,
        valorAnterior: aJson(actual.valor),
        ...(args.decision.accion === "descartar" ? {} : { valorDecidido: aJson(valor) }),
      },
    });
    if (tomada.count !== 1) throw new ErrorDeDato("Esa propuesta ya la decidió alguien. Vuelve a cargar la ficha.", 409);
    if (args.decision.accion === "descartar") return [];

    /* Usarla o editarla es una DECISIÓN de una persona: el dato queda con fuente «persona» y desde ahí no lo pisan ni
       HubSpot ni Nexus (lo proponen). De dónde salió la idea queda en la fila (la investigación, una reunión…). La única
       excepción es usar lo que calcula Nexus (el TAM, la edición de la escala): eso le devuelve el dato a Nexus. */
    const fuente: FuenteDeDato = args.decision.accion === "usar" && p.fuente === "nexus" ? "nexus" : "persona";
    const extra = clave === "tamUsd" && fuente !== "nexus" ? { tamCalculo: null } : {};
    await escribirEnTx(tx, args.clientId, clave, valor, fuente, ahora, extra);
    await cerrarPendientesEnTx(tx, args.clientId, clave, valor, true);
    const efectos = await efectosEnTx(tx, args.clientId, clave, valor, ahora);
    // Usar el TAM que propuso Nexus lo devuelve a Nexus: se guarda también cómo lo calculó.
    if (clave === "tamUsd" && fuente === "nexus") efectos.push(...(await recalcularTamEnTx(tx, args.clientId, ahora)));
    return [{ clave, veredicto: { accion: "aplicar", motivo: estado }, propuestaId: p.id }, ...efectos];
  });
}

// ── Leer para la pantalla ────────────────────────────────────────────────────────────────────────

export interface DatoParaLaPantalla extends ValorConFuente {
  clave: ClaveDeDato;
  /** Quién lo decidió por última vez (si fue una persona) y qué hizo. */
  /** Quién lo decidió por última vez y qué hizo; `origen` es de dónde salió la propuesta que usó (si usó una). */
  decidio: { nombre: string; estado: string; origen: FuenteDeDato | null } | null;
}

export interface PropuestaParaLaPantalla {
  id: string;
  clave: ClaveDeDato;
  valor: ValorDeDato | null;
  fuente: FuenteDeDato;
  autor: string | null;
  cita: string | null;
  enlace: string | null;
  creadaAt: Date;
}

export interface DatosDeLaEmpresa {
  datos: DatoParaLaPantalla[];
  propuestas: PropuestaParaLaPantalla[];
  /** Cuántos DATOS tienen al menos una propuesta pendiente. */
  porRevisar: number;
  tamCalculo: CalculoDelTam | null;
  /** Lo que lee el TAM v1 hoy, para decir qué hubs le faltan aunque una persona haya corregido el monto. */
  entradaDelTam: EntradaDelTam;
}

export async function leerDatosDeLaEmpresa(clientId: string): Promise<DatosDeLaEmpresa | null> {
  const fila = await prisma.client.findUnique({ where: { id: clientId }, select: SELECT_DE_LOS_DATOS });
  if (!fila) return null;
  const valores = datosDeLaFila(fila as Record<string, unknown>);
  const [pendientes, decididas] = await Promise.all([
    prisma.propuestaDeDato.findMany({
      where: { clientId, estado: "pendiente" },
      orderBy: { createdAt: "desc" },
      select: { id: true, campo: true, valor: true, fuente: true, cita: true, enlace: true, createdAt: true, autor: { select: { name: true } } },
    }),
    prisma.propuestaDeDato.findMany({
      where: { clientId, estado: { in: ["usada", "editada", "aplicada"] }, decididaPorId: { not: null } },
      orderBy: { decididaAt: "desc" },
      distinct: ["campo"],
      select: { campo: true, estado: true, fuente: true, decididaPor: { select: { name: true } } },
    }),
  ]);
  const decidioPor = new Map(
    decididas.map((d) => [d.campo, d.decididaPor ? { nombre: d.decididaPor.name, estado: d.estado, origen: esFuenteDeDato(d.fuente) && d.estado === "usada" ? d.fuente : null } : null]),
  );
  const propuestas = pendientes.flatMap((p): PropuestaParaLaPantalla[] =>
    CATALOGO_DE_DATOS.some((d) => d.clave === p.campo) && esFuenteDeDato(p.fuente)
      ? [{ id: p.id, clave: p.campo as ClaveDeDato, valor: valorDeLaFila(p.valor), fuente: p.fuente, autor: p.autor?.name ?? null, cita: p.cita, enlace: p.enlace, creadaAt: p.createdAt }]
      : [],
  );
  return {
    datos: CATALOGO_DE_DATOS.map((d) => ({ clave: d.clave, ...valores[d.clave], decidio: decidioPor.get(d.clave) ?? null })),
    propuestas,
    porRevisar: new Set(propuestas.map((p) => p.clave)).size,
    tamCalculo: (fila as { tamCalculo: unknown }).tamCalculo as CalculoDelTam | null,
    entradaDelTam: entradaDelTam(valores),
  };
}
