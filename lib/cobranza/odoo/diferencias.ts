/**
 * lib/cobranza/odoo/diferencias.ts
 *
 * Todo lo que no cuadra entre Nexus y Odoo, en una sola lista ordenada por plata. Es la mesa
 * de trabajo con el CFO: «son estas cosas, en este orden, y estas las decidís vos».
 *
 * PURO: cero Prisma, cero red, cero `new Date()`. Entra lo medido, sale la lista.
 *
 * Reusa el contrato de `lib/finanzas/inconsistencias.ts` —y por lo tanto su pantalla— con sus
 * dos reglas, que acá valen igual:
 *   1. **Todo se DETECTA, nada se escribe a mano.** Una lista hardcodeada de hallazgos
 *      envejece sola: sigue mostrando lo arreglado y calla lo nuevo.
 *   2. **Cada línea dice cuánta plata mueve y quién la resuelve.** Sin monto no se prioriza;
 *      sin dueño no se cierra nunca.
 *
 * ⚠⚠ **Este módulo NO convierte moneda.** Cuando hay dólares y colones en la misma línea se
 * muestran por separado, nunca sumados. `convertir()` de lib/finanzas/equilibrio.ts sigue
 * siendo el único punto de conversión del sistema.
 */
import type { Inconsistencia, ItemInconsistencia } from "@/lib/finanzas/inconsistencias";

/* ── Cómo se cierra cada línea ──────────────────────────────────────────────────── */

/**
 * En qué sistema se arregla. Es la primera pregunta que hace quien mira la lista, y sin
 * respuesta cada línea obliga a abrir los dos sistemas para averiguarlo.
 */
export type DondeSeArregla =
  | "ODOO" // hay que tocar el ERP
  | "NEXUS" // se arregla acá adentro
  | "PREGUNTANDO"; // no lo resuelve nadie tecleando: falta un dato de negocio

/**
 * Una diferencia con su salida. Extiende el contrato de `inconsistencias.ts` —así la lista
 * sigue ordenándose por plata y sumando sin doble conteo— y le agrega lo único que ese
 * contrato no tiene: **los pasos concretos**.
 *
 * ⚠ `queHacer` del contrato original es UNA oración. Alcanza para un titular y no para
 * ejecutar: quien abre esta pantalla necesita saber en qué sistema entrar, qué buscar, y qué
 * hacer con lo que encuentre. Sin eso la lista se lee, se asiente, y no se cierra nunca.
 */
export interface DiferenciaOdoo extends Inconsistencia {
  donde: DondeSeArregla;
  /** Los pasos, en orden. Cada uno una acción, no una explicación. */
  pasos: string[];
  /** A dónde ir dentro de Nexus, cuando la salida está acá mismo. */
  atajo?: { etiqueta: string; tab: "emparejar" };
  /** Qué significa aceptarla, para que «está bien así» no sea un botón a ciegas. */
  queSignificaAceptar: string;
  /**
   * `true` = alguien la marcó «está bien así» y sus números no cambiaron desde entonces.
   *
   * ⚠ Sigue viniendo en la lista, marcada, en vez de desaparecer. Si se filtrara acá **no
   * habría forma de volver a abrirla**: quedaría cerrada para siempre por un clic. Quien la
   * consume decide dónde ponerla; quien la calcula no le esconde nada.
   */
  aceptada: boolean;
}

/* ── Lo que entra ───────────────────────────────────────────────────────────────── */

export interface CobroParaCruzar {
  id: string;
  cuentaId: string;
  cuentaNombre: string;
  periodo: string;
  fechaProgramada: string;
  monto: number;
  moneda: string;
  estado: string;
  facturado: boolean;
}

export interface FacturaParaCruzar {
  id: string;
  odooMoveId: number;
  numero: string;
  cuentaId: string | null;
  odooPartnerId: number;
  odooPartnerNombre: string;
  invoiceDate: string;
  montoNeto: number;
  montoTotal: number;
  montoImpuesto: number;
  moneda: string;
  moveType: string;
  paymentState: string;
  state: string;
}

export interface EstadoDelCruce {
  cobros: CobroParaCruzar[];
  facturas: FacturaParaCruzar[];
  /** Cuentas de Nexus sin cliente de Odoo asignado todavía. */
  cuentasSinVinculo: number;
  cuentasTotales: number;
  /** Claves de diferencias que alguien ya marcó «está bien así», con su huella. */
  aceptadas: ReadonlyMap<string, string>;
}

/* ── El cruce ───────────────────────────────────────────────────────────────────── */

export interface ParCobroFactura {
  cobroId: string;
  facturaId: string;
  cuentaNombre: string;
  monto: number;
  moneda: string;
}

export interface MontoDistinto {
  cobroId: string;
  facturaId: string;
  cuentaNombre: string;
  numero: string;
  montoCobro: number;
  montoFactura: number;
  moneda: string;
  diferencia: number;
}

export interface ResultadoCruce {
  pares: ParCobroFactura[];
  cobrosSolos: CobroParaCruzar[];
  facturasSolas: FacturaParaCruzar[];
  montosDistintos: MontoDistinto[];
}

const CENTAVOS = (n: number) => Math.round(n * 100);
const DIA = 86_400_000;
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA;

/**
 * Ventana en la que una factura puede corresponder a un cobro programado.
 *
 * ⚠ Son DOS, y la diferencia importa. El monto exacto es evidencia fuerte, así que se le da
 * medio año: un cobro programado en enero que se facturó en abril es normal. El monto
 * aproximado es evidencia débil y se queda en 45 días, o una factura de enero se aparea con un
 * cobro de diciembre y la lista reporta una «diferencia de monto» que son dos hechos distintos.
 *
 * ⛔ Y la ventana del exacto NO puede ser infinita, que es como estaba: sin límite, un cobro
 * recurrente de USD 2.000 se apareaba con la factura de 2.000 de hace tres años, dejando al
 * cobro de este mes sin factura y sin que nada lo dijera.
 */
const VENTANA_EXACTO_DIAS = 180;
const VENTANA_APROX_DIAS = 45;

/**
 * Cruza cobros contra facturas de la MISMA cuenta.
 *
 * ⚠ El monto se compara **en centavos**, no en flotante: los importes de Odoo llegan con
 * ruido (2260.0000000000002) y un par que no matchea por el decimal 15 es el error que nadie
 * encuentra mirando la pantalla.
 *
 * ⚠ Y se exige la MISMA MONEDA para aparear. Un cobro de USD 2.000 y una factura de CRC 2.000
 * no son el mismo hecho aunque el número coincida: son 500 veces distintos. Esos casos salen
 * como «solos», que es la verdad.
 *
 * ⛔ Las notas de crédito (`out_refund`) NO se aparean con cobros. Una nota corrige una
 * factura, no cubre una cuota, y aparearla haría desaparecer un cobro que sigue pendiente.
 */
/**
 * Más cerca en el tiempo primero, y **con desempate por id**.
 *
 * ⚠ El desempate no es cosmético: sin él, dos facturas del mismo día por el mismo monto se
 * ordenaban según el orden en que Postgres devolvió las filas — que sin `ORDER BY` no está
 * garantizado. La misma consulta podía aparear cobros con facturas distintas en dos corridas
 * seguidas, y la lista del CFO cambiaba sin que nadie hubiera tocado nada.
 */
const porCercania = (c: CobroParaCruzar) => (a: FacturaParaCruzar, b: FacturaParaCruzar) =>
  dias(a.invoiceDate, c.fechaProgramada) - dias(b.invoiceDate, c.fechaProgramada) ||
  a.odooMoveId - b.odooMoveId;

export function cruzar(cobros: readonly CobroParaCruzar[], facturas: readonly FacturaParaCruzar[]): ResultadoCruce {
  /* Y el recorrido de los cobros también es determinista: el orden de entrada decide quién
     se queda con una factura que dos podrían reclamar. */
  const enOrden = [...cobros].sort((x, y) => x.fechaProgramada.localeCompare(y.fechaProgramada) || x.id.localeCompare(y.id));
  const facturables = facturas.filter((f) => f.cuentaId && f.moveType !== "out_refund" && f.state !== "cancel");
  const usadas = new Set<string>();
  const pares: ParCobroFactura[] = [];
  const montosDistintos: MontoDistinto[] = [];
  const cobrosSolos: CobroParaCruzar[] = [];

  const porCuenta = new Map<string, FacturaParaCruzar[]>();
  for (const f of facturables) {
    const k = f.cuentaId!;
    (porCuenta.get(k) ?? porCuenta.set(k, []).get(k)!).push(f);
  }

  /* Primera pasada: monto exacto. Se hace ENTERA antes de la aproximada para que una
     coincidencia perfecta nunca pierda su factura contra una parecida de otro cobro. */
  for (const c of enOrden) {
    const cands = (porCuenta.get(c.cuentaId) ?? [])
      .filter(
        (f) =>
          !usadas.has(f.id) &&
          f.moneda === c.moneda &&
          CENTAVOS(f.montoNeto) === CENTAVOS(c.monto) &&
          dias(f.invoiceDate, c.fechaProgramada) <= VENTANA_EXACTO_DIAS,
      )
      .sort(porCercania(c));
    const hit = cands[0];
    if (hit) {
      usadas.add(hit.id);
      pares.push({ cobroId: c.id, facturaId: hit.id, cuentaNombre: c.cuentaNombre, monto: c.monto, moneda: c.moneda });
    }
  }

  /* Segunda: misma cuenta, misma moneda, fecha cerca, monto distinto. Es la línea más útil
     de todas — no dice «falta algo», dice «esto no coincide y son X pesos». */
  const apareados = new Set(pares.map((p) => p.cobroId));
  for (const c of enOrden) {
    if (apareados.has(c.id)) continue;
    const cands = (porCuenta.get(c.cuentaId) ?? [])
      .filter(
        (f) => !usadas.has(f.id) && f.moneda === c.moneda && dias(f.invoiceDate, c.fechaProgramada) <= VENTANA_APROX_DIAS,
      )
      .sort(porCercania(c));
    const hit = cands[0];
    if (!hit) {
      cobrosSolos.push(c);
      continue;
    }
    usadas.add(hit.id);
    montosDistintos.push({
      cobroId: c.id,
      facturaId: hit.id,
      cuentaNombre: c.cuentaNombre,
      numero: hit.numero,
      montoCobro: c.monto,
      montoFactura: hit.montoNeto,
      moneda: c.moneda,
      diferencia: Math.round((hit.montoNeto - c.monto) * 100) / 100,
    });
  }

  return { pares, cobrosSolos, facturasSolas: facturables.filter((f) => !usadas.has(f.id)), montosDistintos };
}

/* ── La lista ───────────────────────────────────────────────────────────────────── */

const fmt = (n: number, moneda: string) =>
  `${moneda} ${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Suma por moneda, SIN convertir. Devuelve el total de la moneda que más plata mueve, que es
 * lo que va en `montoEnJuego` para poder ordenar la lista — y el desglose completo va en el
 * detalle, para que nadie lea el titular como si fuera el total del mundo.
 */
function porMoneda(xs: ReadonlyArray<{ monto: number; moneda: string }>): { texto: string; principal: number } {
  const sumas = new Map<string, number>();
  for (const x of xs) sumas.set(x.moneda, (sumas.get(x.moneda) ?? 0) + x.monto);
  const orden = [...sumas.entries()].sort((a, b) => b[1] - a[1]);
  return {
    texto: orden.map(([m, v]) => fmt(v, m)).join(" + "),
    principal: orden[0]?.[1] ?? 0,
  };
}

/**
 * ⭐ El mismo cliente con el MISMO monto exacto en dos monedas distintas.
 *
 * Con un tipo de cambio de ~500 eso no puede ser una coincidencia: es una factura emitida en
 * la moneda equivocada. Medido: **6 casos**, uno de ellos de 11.541.250 — que en dólares es
 * el 95,8 % de toda la facturación USD del espejo y distorsiona cualquier lectura en dólares.
 *
 * ⚠ Se detecta por REGLA y no por una lista de números: una lista se queda vieja y sigue
 * mostrando lo que ya se arregló.
 */
export function montosEnDosMonedas(facturas: readonly FacturaParaCruzar[]): Array<{
  odooPartnerNombre: string;
  monto: number;
  monedas: string[];
  numeros: string[];
}> {
  const grupos = new Map<string, { nombre: string; monto: number; monedas: Set<string>; numeros: string[] }>();
  for (const f of facturas) {
    const k = `${f.odooPartnerId}|${CENTAVOS(f.montoNeto)}`;
    const g = grupos.get(k) ?? { nombre: f.odooPartnerNombre, monto: f.montoNeto, monedas: new Set<string>(), numeros: [] };
    g.monedas.add(f.moneda);
    g.numeros.push(`${f.numero} (${f.moneda}, ${f.paymentState})`);
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .filter((g) => g.monedas.size > 1)
    .map((g) => ({ odooPartnerNombre: g.nombre, monto: g.monto, monedas: [...g.monedas], numeros: g.numeros }))
    .sort((a, b) => b.monto - a.monto);
}

/**
 * La lista completa. El orden lo decide la plata, salvo lo que no se puede cuantificar, que
 * va al final.
 */
export function detectarDiferenciasOdoo(estado: EstadoDelCruce): DiferenciaOdoo[] {
  const out: DiferenciaOdoo[] = [];
  const cruce = cruzar(estado.cobros, estado.facturas);

  /* ⚠ La huella se calcula SIEMPRE con `huellaDe`, sobre la línea ya armada. Tener una
     segunda definición acá —aunque sea equivalente hoy— hace que la pantalla acepte con una
     huella y el detector compare con otra: la aceptación no surte efecto nunca y nadie
     entiende por qué. Ya pasó al escribir esto; lo cazó `diferencias.test.ts`. */
  const agregar = (inc: Omit<DiferenciaOdoo, "aceptada">) => {
    out.push({ ...inc, aceptada: estado.aceptadas.get(inc.codigo) === huellaDe(inc) });
  };

  /* ⚠ ODOO-SIN-CUENTA es el BALDE: mientras falte emparejar, casi todas las facturas caen
     ahí, y las líneas más finas —moneda equivocada, exentas, in_payment— son subconjuntos
     suyos. Sumarlas todas contaría la misma plata tres veces, que es el error que ya se
     cometió una vez en el módulo del que sale este contrato: el titular decía «$437.579,78
     en juego» y sumaba $28.880 dos veces porque una categoría era un tercio de la otra.

     `yaContadoEn` existe justamente para eso: la línea conserva su monto —sirve para
     dimensionarla— pero `resumirInconsistencias` la deja fuera del total. */
  const idsSinCuenta = new Set(estado.facturas.filter((f) => !f.cuentaId).map((f) => f.id));
  const contenidaEnSinCuenta = (fs: readonly FacturaParaCruzar[]) =>
    fs.length > 0 && fs.every((f) => idsSinCuenta.has(f.id)) ? "ODOO-SIN-CUENTA" : undefined;

  /* ── 1. La moneda equivocada ─────────────────────────────────────────────────── */
  const dosMonedas = montosEnDosMonedas(estado.facturas);
  if (dosMonedas.length) {
    const enJuego = dosMonedas.reduce((a, x) => a + x.monto, 0);
    agregar({
      codigo: "ODOO-MONEDA",
      severidad: "ALTA",
      titulo: `${dosMonedas.length} montos facturados al mismo cliente en DOS monedas distintas`,
      detalle:
        "El mismo cliente tiene facturas por el importe exacto en dólares y en colones. Con un tipo de cambio de ~500 eso no puede ser casualidad: alguna de las dos salió en la moneda equivocada. La más grande sola representa el 95,8 % de toda la facturación en dólares del espejo, así que cualquier número que se mire en dólares está distorsionado hasta que se resuelva.",
      montoEnJuego: enJuego,
      yaContadoEn: contenidaEnSinCuenta(
        estado.facturas.filter((f) => dosMonedas.some((d) => CENTAVOS(d.monto) === CENTAVOS(f.montoNeto))),
      ),
      donde: "ODOO",
      pasos: [
        "Abrí en Odoo cada par de facturas de la lista de abajo (los números están en cada línea).",
        "Mirá cuál de las dos salió en la moneda que no era. La pista: el importe idéntico en dólares y en colones no puede ser correcto con un tipo de cambio de ~500.",
        "Anulá en Odoo la que está mal y, si hace falta, reemitila en la moneda correcta.",
        "Al día siguiente el sync la trae anulada y la línea desaparece sola.",
      ],
      queSignificaAceptar:
        "Que estos pares en dos monedas son correctos y no hay nada que anular. La línea vuelve si aparece un par nuevo o cambia un monto.",
      queHacer: "Revisar cada par en Odoo y anular la que salió en la moneda que no era.",
      resuelve: "DIRECCION",
      items: dosMonedas.map((x) => ({
        texto: `${x.odooPartnerNombre} — ${x.monto.toLocaleString("es-CR")} en ${x.monedas.join(" y ")}`,
        monto: x.monto,
        nota: x.numeros.join(" · "),
      })),
    });
  }

  /* ── 2. Facturas que no se sabe de quién son ─────────────────────────────────── */
  const sinCuenta = estado.facturas.filter((f) => !f.cuentaId);
  if (sinCuenta.length) {
    const s = porMoneda(sinCuenta.map((f) => ({ monto: f.montoNeto, moneda: f.moneda })));
    agregar({
      codigo: "ODOO-SIN-CUENTA",
      severidad: sinCuenta.length > estado.facturas.length / 2 ? "ALTA" : "MEDIA",
      titulo: `${sinCuenta.length} facturas de Odoo no están atribuidas a ninguna cuenta`,
      detalle:
        `Odoo las emitió pero Nexus todavía no sabe a qué cuenta corresponden, porque falta emparejar ${estado.cuentasSinVinculo} de ${estado.cuentasTotales} clientes. Hasta que se emparejen, el semáforo de cobranza no puede usarlas. Suman ${s.texto}.` +
        (dosMonedas.length
          ? ` ⚠ Ese total está INFLADO: incluye las facturas de la línea «mismo monto en dos monedas», donde un importe en colones salió marcado en dólares. La cifra real en dólares es mucho menor.`
          : ""),
      montoEnJuego: s.principal,
      donde: "NEXUS",
      atajo: { etiqueta: "Ir a emparejar", tab: "emparejar" },
      pasos: [
        "Andá a la pestaña «Emparejar» de esta misma pantalla.",
        "Para cada cuenta, confirmá el cliente de Odoo que le corresponde. Las que ya tienen candidato traen la evidencia a la vista; el resto se busca por nombre o cédula.",
        "Si un cliente de Odoo no es cliente nuestro, marcalo como ajeno para que deje de aparecer.",
        "A medida que emparejás, estas facturas se atribuyen solas — el sync recalcula la cuenta en cada corrida.",
      ],
      queSignificaAceptar:
        "Que estas facturas pueden quedar sin atribuir. Casi nunca es lo correcto: lo que corresponde es emparejar.",
      queHacer: "Emparejar los clientes de Odoo con las cuentas de Nexus en /cobranza/odoo.",
      resuelve: "COBRANZA",
      items: agruparPorPartner(sinCuenta),
    });
  }

  /* ── 3. Montos que no coinciden ──────────────────────────────────────────────── */
  if (cruce.montosDistintos.length) {
    const s = porMoneda(cruce.montosDistintos.map((d) => ({ monto: Math.abs(d.diferencia), moneda: d.moneda })));
    agregar({
      codigo: "ODOO-MONTO",
      severidad: "ALTA",
      titulo: `${cruce.montosDistintos.length} cobros con un monto distinto al de su factura`,
      detalle: `Nexus dice una cifra y Odoo otra para el mismo cobro. La diferencia total es ${s.texto}. Puede ser un descuento que se aplicó al facturar, o un error de carga en el plan de pago.`,
      montoEnJuego: s.principal,
      donde: "NEXUS",
      pasos: [
        "Abrí el cliente en Cobranza y compará su plan de pago contra la factura de Odoo (el número está en cada línea).",
        "Si el descuento o el ajuste se aplicó al facturar y el plan quedó viejo, corregí el plan en Nexus.",
        "Si el plan estaba bien y la factura salió con otro monto, la corrección va del lado de Odoo.",
        "⚠ Ojo con el impuesto: Nexus guarda el monto SIN IVA. Si la diferencia es del 13 %, el problema es de comparación, no de plata.",
      ],
      queSignificaAceptar:
        "Que estas diferencias de monto son esperadas —un descuento pactado, un redondeo— y no hay que corregir nada. Si el monto cambia, la línea vuelve.",
      queHacer: "Comparar cada par y corregir el que esté mal: el plan en Nexus o la factura en Odoo.",
      resuelve: "COBRANZA",
      items: cruce.montosDistintos
        .slice()
        .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
        .map((d) => ({
          texto: `${d.cuentaNombre} — Nexus ${fmt(d.montoCobro, d.moneda)} vs Odoo ${fmt(d.montoFactura, d.moneda)}`,
          monto: Math.abs(d.diferencia),
          nota: `factura ${d.numero} · diferencia ${d.diferencia > 0 ? "+" : ""}${d.diferencia.toFixed(2)}`,
        })),
    });
  }

  /* ── 4. Cobros sin factura — la línea que Alexander pidió primero ─────────────── */
  const cobrosSinFactura = cruce.cobrosSolos.filter((c) => c.facturado || c.estado === "COBRADO");
  if (cobrosSinFactura.length) {
    const s = porMoneda(cobrosSinFactura.map((c) => ({ monto: c.monto, moneda: c.moneda })));
    agregar({
      codigo: "ODOO-COBRO-SIN-FACTURA",
      severidad: "ALTA",
      titulo: `${cobrosSinFactura.length} cobros marcados facturados que no tienen factura en Odoo`,
      detalle: `Nexus los da por facturados —o hasta por cobrados— y en Odoo no hay ningún documento que les corresponda. O la factura no se emitió, o se emitió a un cliente que todavía no está emparejado. Suman ${s.texto}.`,
      montoEnJuego: s.principal,
      donde: "ODOO",
      pasos: [
        "Buscá en Odoo si la factura existe con otro nombre de cliente. Si aparece, el problema es el emparejado: arreglalo en la pestaña «Emparejar».",
        "Si no existe, hay que emitirla en Odoo.",
        "Si no correspondía facturarla, sacale la marca de facturado al cobro en Nexus.",
        "⚠ Los cobros marcados COBRADO que no tienen factura son los más urgentes: significa que entró plata sin documento.",
      ],
      queSignificaAceptar:
        "Que estos cobros pueden estar marcados facturados sin respaldo en Odoo. Solo tiene sentido si sabés que se facturaron por fuera del ERP.",
      queHacer: "Verificar en Odoo si la factura existe; si no existe, emitirla o revertir la marca en Nexus.",
      resuelve: "COBRANZA",
      items: cobrosSinFactura
        .slice()
        .sort((a, b) => b.monto - a.monto)
        .map((c) => ({
          texto: `${c.cuentaNombre} — ${fmt(c.monto, c.moneda)}`,
          monto: c.monto,
          nota: `${c.periodo} · programado ${c.fechaProgramada} · ${c.estado}`,
        })),
    });
  }

  /* ── 5. Facturas atribuidas sin cobro que las explique ───────────────────────── */
  const facturasSinCobro = cruce.facturasSolas.filter((f) => f.cuentaId);
  if (facturasSinCobro.length) {
    const s = porMoneda(facturasSinCobro.map((f) => ({ monto: f.montoNeto, moneda: f.moneda })));
    agregar({
      codigo: "ODOO-FACTURA-SIN-COBRO",
      severidad: "MEDIA",
      titulo: `${facturasSinCobro.length} facturas de Odoo sin un cobro que las explique`,
      detalle: `Se le facturó a un cliente que Nexus conoce, pero no hay ningún cobro planificado que corresponda. Puede ser facturación de años anteriores —el plan de pago de Nexus solo cubre lo vigente— o algo que se facturó fuera del plan. Suman ${s.texto}.`,
      montoEnJuego: s.principal,
      donde: "NEXUS",
      pasos: [
        "Fijate la fecha de cada factura. Si es de un año que Nexus no cubre, es historia y no hay nada que hacer — aceptala.",
        "Si es de un servicio vigente, falta cargar ese servicio o su plan de pago en Cobranza.",
        "Si el cliente está mal emparejado, la factura es de otro: arreglalo en «Emparejar».",
      ],
      queSignificaAceptar:
        "Que estas facturas son de años anteriores o de cosas que Nexus no planifica. Es la aceptación más común y legítima de la lista.",
      queHacer: "Revisar si falta cargar el servicio en Nexus, o si es facturación vieja que no hace falta espejar.",
      resuelve: "COBRANZA",
      items: facturasSinCobro
        .slice()
        .sort((a, b) => b.montoNeto - a.montoNeto)
        .slice(0, 60)
        .map((f) => ({
          texto: `${f.odooPartnerNombre} — ${fmt(f.montoNeto, f.moneda)}`,
          monto: f.montoNeto,
          nota: `${f.numero} · ${f.invoiceDate} · ${f.paymentState}`,
        })),
    });
  }

  /* ── 6. El estado que nadie sabe qué significa ───────────────────────────────── */
  const enPago = estado.facturas.filter((f) => f.paymentState === "in_payment");
  if (enPago.length) {
    const s = porMoneda(enPago.map((f) => ({ monto: f.montoNeto, moneda: f.moneda })));
    agregar({
      codigo: "ODOO-IN-PAYMENT",
      severidad: "ALTA",
      titulo: `${enPago.length} facturas en un estado de pago que este Odoo no debería poder asignar`,
      detalle: `Odoo 17 Community nunca marca «in_payment» —su código devuelve «paid» directamente—, así que o esta base viene de Enterprise, o tiene un módulo de terceros. En Enterprise significa «ya pagaron, falta conciliar contra el banco», que es justo lo que hace falta para poner esos cobros en verde. Si significa otra cosa, encender la promoción pondría ${enPago.length} cobros en verde de golpe sin que la plata haya entrado. Suman ${s.texto}.`,
      montoEnJuego: s.principal,
      yaContadoEn: contenidaEnSinCuenta(enPago),
      donde: "PREGUNTANDO",
      pasos: [
        "Preguntale a quien administra Odoo de dónde sale el estado «in_payment» en esta base.",
        "Si significa «ya pagaron, falta conciliar contra el banco» —que es lo que significa en Odoo Enterprise—, se puede encender la promoción a verde.",
        "Si viene de un módulo de terceros con otro significado, hay que entenderlo antes de tocar nada.",
        "Con la respuesta, la promoción se enciende poniendo ODOO_PROMOCION_VERDE=1 en el servidor.",
      ],
      queSignificaAceptar:
        "Que ya se sabe qué significa y no hace falta seguir viéndolo. ⚠ Aceptarlo NO enciende la promoción a verde: eso es una bandera aparte.",
      queHacer: "Preguntarle al administrador de Odoo de dónde sale ese estado. Hasta entonces la promoción a verde queda apagada.",
      resuelve: "DIRECCION",
      items: [
        {
          texto: `${enPago.length} facturas esperan esta respuesta para poder pasar a verde solas`,
          nota: "La promoción está apagada por bandera; el espejo ya las trae marcadas.",
        },
      ],
    });
  }

  /* ── 7. Las exentas ──────────────────────────────────────────────────────────── */
  const exentas = estado.facturas.filter((f) => f.moveType === "out_invoice" && f.montoImpuesto === 0);
  if (exentas.length) {
    const s = porMoneda(exentas.map((f) => ({ monto: f.montoNeto, moneda: f.moneda })));
    agregar({
      codigo: "ODOO-EXENTAS",
      severidad: "BAJA",
      titulo: `${exentas.length} facturas salieron sin impuesto`,
      detalle: `Pueden ser exenciones legítimas o impuesto que faltó cargar. No se puede decidir por país: las exentas medidas son de empresas costarricenses igual que las que sí lo llevan. Importa porque el borrador de cobro le dice al cliente un monto sin impuesto, y la factura que recibe puede traerlo. Suman ${s.texto}.`,
      montoEnJuego: s.principal,
      yaContadoEn: contenidaEnSinCuenta(exentas),
      donde: "PREGUNTANDO",
      pasos: [
        "Pasale la lista al contador y confirmá cuáles son exenciones reales.",
        "Si alguna debía llevar impuesto, hay que corregir la factura en Odoo.",
        "⚠ No se puede decidir por país: las exentas medidas son de empresas costarricenses igual que las que sí lo llevan.",
      ],
      queSignificaAceptar:
        "Que las exenciones están confirmadas por el contador. La línea vuelve si aparece una factura exenta nueva.",
      queHacer: "Confirmar con el contador cuáles son exenciones reales.",
      resuelve: "DIRECCION",
      items: agruparPorPartner(exentas),
    });
  }

  /* Las aceptadas van al final: siguen a la vista para poder reabrirlas, pero no compiten con
     lo que todavía hay que resolver. */
  return out.sort(
    (a, b) => Number(a.aceptada) - Number(b.aceptada) || (b.montoEnJuego ?? -1) - (a.montoEnJuego ?? -1),
  );
}

/** Agrupa por cliente para que una lista de 347 filas sea legible. */
function agruparPorPartner(facturas: readonly FacturaParaCruzar[]): ItemInconsistencia[] {
  const g = new Map<string, { monto: number; n: number; moneda: string }>();
  for (const f of facturas) {
    const k = `${f.odooPartnerNombre}|${f.moneda}`;
    const p = g.get(k) ?? { monto: 0, n: 0, moneda: f.moneda };
    p.monto += f.montoNeto;
    p.n++;
    g.set(k, p);
  }
  return [...g.entries()]
    .sort((a, b) => b[1].monto - a[1].monto)
    .map(([k, v]) => ({
      texto: `${k.split("|")[0]} — ${fmt(v.monto, v.moneda)}`,
      monto: v.monto,
      nota: `${v.n} factura${v.n === 1 ? "" : "s"}`,
    }));
}

/**
 * La huella de una diferencia aceptada. Se acepta ESA diferencia, no «este par para siempre»:
 * si los números cambian, la línea vuelve sola.
 *
 * ⚠ Una aceptación no puede convertirse en el lugar donde se esconde un problema nuevo.
 */
export function huellaDe(inc: Pick<Inconsistencia, "items">): string {
  return inc.items.map((i) => `${i.texto}=${i.monto ?? ""}`).join("|");
}
