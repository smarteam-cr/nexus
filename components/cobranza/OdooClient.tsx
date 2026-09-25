"use client";

/**
 * components/cobranza/OdooClient.tsx
 *
 * Las tres pestañas de la integración con Odoo: **qué es**, **emparejar**, **lo que no cuadra**.
 *
 * ── POR QUÉ HAY UNA PESTAÑA QUE SOLO EXPLICA ────────────────────────────────────
 * Esta pantalla la abre alguien que no la construyó, cada varias semanas, para hacer un
 * trabajo puntual. Sin una página que diga qué hace la integración —y sobre todo **qué NO
 * hace**— cada visita empieza reconstruyendo el modelo mental desde cero, y las dos preguntas
 * que aparecen siempre son las mismas: «¿esto le escribe a Odoo?» y «¿esto mueve mis cobros?».
 *
 * Las dos respuestas son que no, y están escritas grandes.
 *
 * ── LA LÍNEA DE ARRIBA DICE SI LA COPIA ES VIEJA ────────────────────────────────
 * Hasta el 2026-09-12 decía «Espejo actualizado el 2-sep» con la fecha de la ÚLTIMA corrida,
 * aunque esa corrida hubiera fallado, y no decía nada cuando el sync directamente dejó de correr.
 * Así pasaron diez días. Ahora distingue la última corrida de la última BUENA, y cuando la copia
 * es más vieja que `espejoVencido()` (la misma regla que INV31) se pone en rojo.
 *
 * ── «CÓMO FUNCIONA» TAMBIÉN DICE LO QUE LA LISTA NO MUESTRA (2026-09-25) ────────
 * Lo que queda fuera por regla (historia, exentas de años anteriores, pagadas sin cuenta, el IVA, lo recién
 * facturado) se cuenta en el texto de su línea, pero una línea sin filas pendientes no se muestra, y con ella se va
 * la cuenta. La explicación que queda siempre es la de esta pestaña. Lo vigila guardas.test.ts.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui";
import EmparejadoOdoo from "./EmparejadoOdoo";
import DiferenciasOdoo from "./DiferenciasOdoo";
// ⚠ Viven en un módulo neutral: la página (servidor) también las lee, y de un "use client" no podría.
import type { Pestana } from "@/lib/cobranza/odoo/pestanas";
/* «Cómo funciona» dice las reglas con los mismos números que las aplican: si la gracia o el IVA cambian allá, el
   texto cambia solo. */
import { DIAS_DE_GRACIA_DEL_ESPEJO } from "@/lib/cobranza/odoo/diferencias";
import { IVA_COSTA_RICA } from "@/lib/cobranza/montos";

const IVA_EN_PORCENTAJE = Math.round((IVA_COSTA_RICA - 1) * 100);

interface CorridaDelEspejo {
  iniciadaEn: string;
  terminadaEn: string | null;
  ok: boolean;
  parcial: boolean;
  error: string | null;
  /** Cuándo empezó la última corrida BUENA; null = nunca hubo una. */
  ultimaOkEn: string | null;
  horasDesdeLaUltimaBuena: number | null;
  /** `espejoVencido()` calculado en el servidor, con su reloj. */
  vencido: boolean;
}

/**
 * Los contadores del emparejado, todos de `resumenDelEmparejado` (lib/cobranza/odoo/emparejado.ts): la pestaña,
 * la pestaña con que abre y «Cómo funciona» cuentan lo mismo que la lista. Viven en estado porque «Emparejar»
 * los devuelve después de cada cambio: marcar «Está en Mercury» baja el número de la pestaña sin recargar.
 */
type ConteosEmparejado = {
  cuentas: number;
  cuentasVinculadas: number;
  /** Vía Odoo y sin cliente de Odoo: el número de la pestaña. */
  porEmparejar: number;
  enMercury: number;
  enOtra: number;
};
type Conteos = ConteosEmparejado & { facturas: number; diferencias: number };

export default function OdooClient({
  corrida,
  conteos,
  puedeVerCorridas,
  puedeEditar,
  pestanaInicial,
}: {
  /** `cobranza.write`: decide si se dibujan los controles que cierran una línea a mano. */
  puedeEditar: boolean;
  corrida: CorridaDelEspejo | null;
  conteos: Conteos;
  /** Solo SUPER_ADMIN llega a /integrations/odoo. Sin esto el enlace sería un rebote. */
  puedeVerCorridas?: boolean;
  /**
   * La pestaña que pidió el enlace (`?pestana=no-cuadra`). La usa «Rendimiento de cobranza» del punto de
   * equilibrio: sin esto, «Revisalas en Lo que no cuadra» abría en «Emparejar» mientras falte emparejar.
   */
  pestanaInicial?: Pestana;
}) {
  const [tab, setTab] = useState<Pestana>(
    /* Arranca donde está el trabajo: si falta emparejar, esa es la pestaña. Si ya está todo
       emparejado, lo que queda es resolver diferencias. Un enlace que pide una pestaña manda.
       ⚠ Con la regla única: hasta el 2026-09-25 comparaba vinculadas contra TODAS las cuentas, y como las
       de Mercury nunca se vinculan, abría en «Emparejar» para siempre. */
    pestanaInicial ?? (conteos.porEmparejar > 0 ? "emparejar" : "no-cuadra"),
  );
  const [emparejado, setEmparejado] = useState<ConteosEmparejado>(() => ({
    cuentas: conteos.cuentas,
    cuentasVinculadas: conteos.cuentasVinculadas,
    porEmparejar: conteos.porEmparejar,
    enMercury: conteos.enMercury,
    enOtra: conteos.enOtra,
  }));
  /* ⭐ Las filas pendientes de «Lo que no cuadra»: arranca con las del servidor y «Lo que no cuadra» las actualiza
     después de cada carga, así marcar una fila baja el número de la pestaña y el de «Cómo funciona» sin recargar.
     Hasta el 2026-09-25 contaba LÍNEAS y quedaba fijo hasta recargar la página entera. */
  const [diferencias, setDiferencias] = useState(conteos.diferencias);
  const vivos: Conteos = { ...conteos, ...emparejado, diferencias };

  return (
    <div className="space-y-4">
      <Tabs
        aria-label="Secciones de la integración con Odoo"
        variant="underline"
        value={tab}
        onChange={(k) => setTab(k as Pestana)}
        items={[
          { key: "que-es", label: "Cómo funciona" },
          {
            key: "emparejar",
            label: "Emparejar",
            count: vivos.porEmparejar,
            title: "Decirle a Nexus qué cliente de Odoo corresponde a cada cuenta",
          },
          {
            key: "no-cuadra",
            label: "Lo que no cuadra",
            count: vivos.diferencias,
            title: "Diferencias entre lo que Nexus planificó y lo que Odoo facturó",
          },
        ]}
      />

      {corrida && <EstadoDelEspejo corrida={corrida} facturas={conteos.facturas} puedeVerCorridas={puedeVerCorridas} />}
      {/* Si nunca corrió, el enlace igual sirve: ahí se ve la conexión y las banderas. */}
      {!corrida && puedeVerCorridas && (
        <p className="text-xs text-fg-muted">
          El sync no corrió todavía.{" "}
          <Link href="/integrations/odoo" className="text-brand underline hover:no-underline">
            Ver el estado de la conexión →
          </Link>
        </p>
      )}

      {tab === "que-es" && <QueEs conteos={vivos} />}
      {tab === "emparejar" && <EmparejadoOdoo puedeEditar={puedeEditar} onConteos={setEmparejado} />}
      {tab === "no-cuadra" && (
        <DiferenciasOdoo puedeEditar={puedeEditar} onIrAEmparejar={() => setTab("emparejar")} onPendientes={setDiferencias} />
      )}
    </div>
  );
}

/* ── La línea de arriba: de cuándo es la copia ──────────────────────────────────── */

const utc = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;
const hace = (horas: number | null) =>
  horas === null ? "" : horas < 48 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} días`;

function EstadoDelEspejo({
  corrida,
  facturas,
  puedeVerCorridas,
}: {
  corrida: CorridaDelEspejo;
  facturas: number;
  puedeVerCorridas?: boolean;
}) {
  /* El historial completo: cuándo corrió cada vez, qué trajo, qué falló. Es donde se va cuando
     esta línea dice algo raro. */
  const enlace = puedeVerCorridas ? (
    <Link href="/integrations/odoo" className="text-brand underline hover:no-underline">
      Ver todas las corridas →
    </Link>
  ) : null;
  const sinTerminar = corrida.terminadaEn === null;
  const queFallo =
    !corrida.ok && !sinTerminar
      ? `La última corrida (${utc(corrida.iniciadaEn)}) ${corrida.parcial ? "quedó incompleta" : "falló"}${corrida.error ? `: ${corrida.error}` : "."}`
      : null;

  if (corrida.vencido) {
    return (
      <div
        role="alert"
        className="space-y-1 rounded-lg border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger-ink"
      >
        <p className="font-semibold">
          {corrida.ultimaOkEn
            ? `⚠ El espejo está viejo: la última corrida buena es del ${utc(corrida.ultimaOkEn)} (${hace(corrida.horasDesdeLaUltimaBuena)}).`
            : "⚠ El espejo nunca tuvo una corrida buena."}
        </p>
        <p>
          Lo facturado en Odoo después no está acá: ni al lado de los cobros ni en «Lo que no cuadra».{" "}
          {queFallo ??
            (sinTerminar
              ? `Hay una corrida sin terminar desde el ${utc(corrida.iniciadaEn)}.`
              : "El sync no volvió a correr desde entonces.")}
        </p>
        {enlace && <p>{enlace}</p>}
      </div>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
      {corrida.ultimaOkEn && (
        <span>
          Espejo actualizado el {utc(corrida.ultimaOkEn)} · {facturas} facturas
        </span>
      )}
      {queFallo && <span className="text-danger-ink">· ⚠ {queFallo}</span>}
      {sinTerminar && (
        <span className="text-warn-ink">· la corrida del {utc(corrida.iniciadaEn)} sigue sin terminar</span>
      )}
      {enlace}
    </p>
  );
}

/* ── La pestaña que explica ──────────────────────────────────────────────────────── */

function QueEs({ conteos }: { conteos: Conteos }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Para qué existe</h2>
        <p className="mt-2 text-sm text-fg-secondary">
          Hasta ahora la misma información vivía en cuatro lugares: el banco, Odoo, Nexus y una hoja de cálculo.
          Cuando se emitía una factura había que anotarla en Odoo y volver a Nexus a marcar el cobro como facturado.
          Cuando entraba un pago, lo mismo. Nadie hacía nada mal — simplemente los dos sistemas no se hablaban, y la
          única conexión entre ellos era una persona copiando datos.
        </p>
        <p className="mt-2 text-sm text-fg-secondary">
          El costo caro no era el tiempo: era que <strong className="text-fg">los dos sistemas se separaban sin que
          nadie se enterara</strong>. Nexus podía decir que un cliente debe plata que ya pagó, y eso subía hasta la
          reunión de dirección.
        </p>
        <p className="mt-2 text-sm text-fg-secondary">
          Ahora Nexus lee Odoo una vez por día —cuando el sync está encendido en el servidor— y pone las facturas
          reales al lado de los cobros de las cuentas emparejadas. Lo que no coincide aparece en una lista, con su
          monto y con quién lo puede cerrar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-success-line bg-success-surface p-5">
          <h3 className="text-sm font-semibold text-success-ink">Lo que sí hace</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-fg-secondary">
            <li>· Trae las facturas de venta de Odoo, una vez por día.</li>
            <li>· En las cuentas emparejadas, las muestra al lado del cobro que les corresponde, con su número y su estado real.</li>
            <li>· Lista lo que no cuadra, ordenado por la plata que mueve.</li>
            <li>· Guarda el monto sin impuesto y el total, porque los cobros de Nexus están cargados sin IVA.</li>
          </ul>
        </div>

        {/* ⛔ Estas dos son LAS preguntas que aparecen siempre. Van grandes y en negativo. */}
        <div className="rounded-lg border border-danger-line bg-danger-surface p-5">
          <h3 className="text-sm font-semibold text-danger-ink">Lo que NO hace, a propósito</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-fg-secondary">
            <li>
              · <strong className="text-fg">Nunca escribe en Odoo.</strong> Ni una línea. Es solo lectura, siempre.
            </li>
            <li>
              · <strong className="text-fg">Nunca marca un cobro como cobrado.</strong> Puede mostrar que Odoo dice
              que la factura está pagada, pero pasar un cobro a verde lo sigue haciendo una persona con nombre.
            </li>
            <li>· Nunca convierte moneda: si el cobro está en dólares y la factura en colones, muestra las dos.</li>
            <li>· No reemplaza el plan de pago. Odoo no sabe en cuántas cuotas se le cobra a cada cliente; eso vive acá.</li>
            <li>
              · Marcar una fila «Está bien así» no toca el cobro ni Odoo: solo la saca de la lista. Y «Está en
              Mercury» cambia la vía de cobro de la cuenta en Nexus, no en Odoo.
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Cómo se usa</h2>
        <ol className="mt-2 space-y-2 text-sm text-fg-secondary">
          <li>
            <strong className="text-fg">1. Emparejar, una sola vez.</strong> Dile a Nexus qué cliente de Odoo
            corresponde a cada cuenta. Hace falta porque Nexus guarda el nombre comercial («Iberorutas») y Odoo la
            razón social («Servicios San Mateo y Santa Elena del Sur S.A.»), y no se parecen. Al confirmar, las
            facturas de ese cliente pasan a la cuenta en el momento, y se guarda la cédula para que la próxima vez
            se sostenga solo. Queda por emparejar toda cuenta que factura por Odoo y todavía no tiene su cliente de
            Odoo: ese es el número de la pestaña. Las que facturan por Mercury o QuickBooks no cuentan.
          </li>
          <li>
            <strong className="text-fg">2. Revisar lo que no cuadra.</strong> Cada línea dice cuánta plata mueve, en
            qué sistema se arregla y los pasos. Lo que ya revisaste y está bien así se marca fila por fila, con su
            motivo.
          </li>
          <li>
            <strong className="text-fg">3. Mirar de cuándo es la copia.</strong> El sync corre solo cada mañana,
            desde las 6. La línea de arriba de estas pestañas dice de cuándo es la última corrida buena; si falla o
            deja de correr, se pone en rojo. Mientras esté en rojo, lo facturado después no está acá.
          </li>
        </ol>
      </div>

      {/* ⭐ 2026-09-25: lo que cambió en esta pantalla ese día, explicado para quien la abre cada varias semanas. Cada
          bloque responde una pregunta que aparece siempre: «¿dónde quedó esta cuenta?», «¿dónde quedó lo que
          marqué?», «¿por qué este número no es el de la semana pasada?» y «¿por qué esta factura no está?». */}
      <Bloque titulo="Las cuentas que facturan por Mercury">
        <li>
          · En su tarjeta de «Emparejar», <strong className="text-fg">«Está en Mercury»</strong> pasa su vía de cobro
          a Mercury en todo Cobranza, también en su ficha, con tu nombre y la fecha. La cuenta sale de la lista y del
          número de la pestaña en el momento.
        </li>
        <li>
          · Desde ahí Nexus no le busca cliente en Odoo, no le ofrece facturas de Odoo al marcar un cobro como
          facturado y no compara sus cobros con Odoo. Lo que no depende de Odoo sigue: «falta anotar el número de
          Mercury» y «venta contada dos veces».
        </li>
        <li>
          · La lista <strong className="text-fg">«En Mercury»</strong>, debajo de las tarjetas, dice quién marcó cada
          cuenta y cuándo. Las que ya decían Mercury desde la importación o desde su alta aparecen «sin firma», para que
          alguien las confirme o las deshaga.
        </li>
        <li>
          · <strong className="text-fg">«Deshacer»</strong> devuelve la vía a Odoo, y la cuenta vuelve a «Emparejar»
          con todo lo que tenía. Sirve también el día que una cuenta pase a facturar por Odoo.
        </li>
        <li>
          · No se marca una cuenta que ya tiene su cliente de Odoo: sus facturas vienen de Odoo. Primero se desvincula
          ese cliente en «Ya vinculadas».
        </li>
        <li>· QuickBooks no tiene botón: se elige en la ficha de la cuenta, y la cuenta también sale de «Emparejar».</li>
      </Bloque>

      <Bloque titulo="«Está bien así», fila por fila">
        <li>
          · Cada fila de «Lo que no cuadra» tiene su «Está bien así», con motivo, y te propone el último motivo que
          usaste. El botón de la línea marca una por una las filas que ves, con el mismo motivo.
        </li>
        <li>
          · Se marca con los números que ves. Si una fila cambió antes de tu clic —por ejemplo, porque llegó una copia
          nueva de Odoo—, esa no se marca y te avisa; las demás sí.
        </li>
        <li>
          · <strong className="text-fg">Vuelve sola si cambia uno de sus números</strong>: un monto, un saldo, un
          estado o el número del documento. Vuelve a su línea diciendo que volvió y con qué marca. Que Odoo cambie el
          nombre de un cliente no trae nada de vuelta.
        </li>
        <li>
          · Vale solo en esa línea: si el mismo documento aparece en otra, ahí sigue a la vista. En las filas que juntan
          varias facturas de un cliente, la marca queda en cada factura, así que una factura nueva de ese cliente
          aparece sola, sin traer las ya revisadas.
        </li>
        <li>
          · <strong className="text-fg">«Marcadas»</strong>, al final de la pestaña, muestra todo lo marcado con su
          motivo, quién y cuándo, y «Deshacer». Sigue ahí aunque la línea se quede sin filas. Deshacer también queda
          anotado: ninguna marca se borra.
        </li>
        <li>
          · «Ya está anulada», en las facturas soltadas que ninguna copia puede verificar, también pide motivo y también
          se deshace desde «Marcadas».
        </li>
        <li>· Marcar «Está bien así» o «Está en Mercury», y deshacerlos, piden permiso para editar Cobranza.</li>
      </Bloque>

      <Bloque titulo="Cómo se cuenta lo pendiente">
        <li>
          · Cada línea muestra, cuenta y suma solo sus filas pendientes. Si se queda sin ninguna, sale de la lista; lo
          que tenía marcado sigue en «Marcadas».
        </li>
        <li>
          · El número de la pestaña y «cosas por resolver» cuentan{" "}
          <strong className="text-fg">filas pendientes</strong>, no líneas, y bajan apenas marcas una, sin recargar
          la página.
        </li>
        <li>
          · Lo que corriges en Nexus sale la próxima vez que abres la pestaña. Lo que se corrige en Odoo sale con la
          próxima copia de Odoo.
        </li>
        <li>
          · La suma de arriba va por moneda y sin IVA, y cuenta cada documento una sola vez aunque lo miren varias
          líneas.
        </li>
        <li>· «Ocultar» solo pliega la lista de una línea en tu pantalla: no saca filas ni cambia ningún número.</li>
      </Bloque>

      {/* ⚠ Estas reglas viven en lib/cobranza/odoo/diferencias.ts. Si una cambia allá, cambia acá: la guarda de
          «Cómo funciona» en guardas.test.ts pide que cada una siga nombrada. */}
      <Bloque
        titulo="Lo que queda fuera por regla, y por qué"
        intro="Hay cosas que no van a cuadrar nunca y no son un problema. No son filas: no se marcan ni cuentan en la pestaña. La línea donde caerían dice cuántas dejó fuera."
      >
        <li>
          · <strong className="text-fg">Historia.</strong> Facturas ya pagadas de antes del primer cobro que Nexus
          tiene de su cuenta, o de años anteriores si la cuenta no tiene cobros. Son de antes de que Nexus planificara
          la cuenta: no hay cobro que las explique ni plata que cobrar. ⚠ Una factura que Odoo sigue dando por cobrar
          nunca es historia, sea del año que sea.
        </li>
        <li>
          · <strong className="text-fg">Exentas de años anteriores.</strong> Solo se revisan las facturas sin impuesto
          del año de la última copia de Odoo. Las de antes eran casi todas historia ya pagada, y la pregunta que importa
          —si al cliente le faltó el IVA— es sobre lo que se está cobrando ahora.
        </li>
        <li>
          · <strong className="text-fg">Pagadas sin cuenta.</strong> Facturas ya pagadas de clientes de Odoo que no
          están emparejados, y también sus notas de crédito y los documentos anulados. No son plata por cobrar. Al
          emparejar el cliente pasan a su cuenta y se cruzan como las demás. Un cliente sin emparejar que solo tiene de
          estas no aparece en «Lo que no cuadra».
        </li>
        <li>
          · <strong className="text-fg">Diferencias de exactamente el {IVA_EN_PORCENTAJE} %.</strong> Es el IVA:
          Nexus guarda los cobros sin IVA, y si la factura dice lo mismo con IVA (o al revés) no falta plata. Lo decidió
          Alex.
        </li>
        <li>
          · <strong className="text-fg">Lo recién facturado.</strong> Un
          cobro marcado facturado en los {DIAS_DE_GRACIA_DEL_ESPEJO} días antes de la última copia buena de Odoo, o
          después, todavía puede no estar en la copia. Si pasado ese plazo sigue sin factura, recién ahí se acusa.
        </li>
      </Bloque>

      {/* ⚠ Esta tabla existe porque la pantalla muestra «pagada, falta conciliar» en cada
          cobro y nunca decía qué significa. El vocabulario es de Odoo, no del negocio, y
          quien lo lee no tiene por qué conocerlo. */}
      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Qué quiere decir cada estado</h2>
        <p className="mt-1 text-sm text-fg-secondary">
          Odoo le hace a cada factura una sola pregunta: <em>¿cuánto de esto ya se saldó, y cómo?</em> Hay cinco
          respuestas posibles, y Nexus las muestra tal cual vienen.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-muted">
                <th className="py-1.5 pr-4 font-medium">Odoo dice</th>
                <th className="py-1.5 pr-4 font-medium">En cristiano</th>
                <th className="py-1.5 font-medium">¿Entró la plata?</th>
              </tr>
            </thead>
            <tbody>
              <Estado codigo="not_paid" que="Sin pagar. Se emitió y no entró nada." plata="No" />
              <Estado codigo="partial" que="Pagada a medias. Entró una parte." plata="En parte" />
              <Estado
                codigo="in_payment"
                que="Pagada, falta cuadrarla con el banco. Está registrado que el cliente pagó, pero nadie ató todavía ese pago a la línea del extracto."
                plata="Sí"
              />
              <Estado codigo="paid" que="Pagada y cuadrada contra el extracto bancario." plata="Sí" />
              <Estado
                codigo="reversed"
                que="Saldada, pero con una nota de crédito. La factura ya no debe nada porque se anuló, no porque alguien pagara."
                plata="NO"
                alerta
              />
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-fg-muted">
          ⚠ <strong className="text-fg">«Saldo cero» no es lo mismo que «cobrada».</strong> Las anuladas por nota de
          crédito también quedan en cero, y ahí no entró un peso. Por eso Nexus las trata aparte y nunca las propone
          como cobradas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Dato n={conteos.facturas} etiqueta="facturas espejadas" pie="Solo lectura desde Odoo." />
        <Dato
          n={conteos.cuentasVinculadas}
          de={conteos.cuentas}
          etiqueta="cuentas emparejadas"
          pie={pieDelEmparejado(conteos)}
        />
        <Dato
          n={conteos.diferencias}
          etiqueta="cosas por resolver"
          pie="Las filas pendientes de «Lo que no cuadra», ordenadas por la plata que mueven. Lo marcado «está bien así» no cuenta."
        />
      </div>
    </div>
  );
}

/** Un bloque de «Cómo funciona»: un título, una frase opcional y una lista de puntos. */
function Bloque({ titulo, intro, children }: { titulo: string; intro?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-base font-semibold text-fg">{titulo}</h2>
      {intro && <p className="mt-1 text-sm text-fg-secondary">{intro}</p>}
      <ul className="mt-2 space-y-1.5 text-sm text-fg-secondary">{children}</ul>
    </div>
  );
}

/** El pie del dato de «Cómo funciona»: cuántas faltan y cuántas no se emparejan porque facturan por otra vía. */
function pieDelEmparejado(c: ConteosEmparejado): string {
  const partes = [
    c.porEmparejar > 0 ? `Faltan ${c.porEmparejar}: no pueden mostrar sus facturas.` : "No falta ninguna por emparejar.",
  ];
  if (c.enMercury > 0) partes.push(`${c.enMercury} facturan por Mercury y no se emparejan.`);
  if (c.enOtra > 0) partes.push(`${c.enOtra} facturan por QuickBooks y tampoco.`);
  return partes.join(" ");
}

function Estado({
  codigo,
  que,
  plata,
  alerta,
}: {
  codigo: string;
  que: string;
  plata: string;
  alerta?: boolean;
}) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-1.5 pr-4 align-top">
        <code className="text-xs text-fg-secondary">{codigo}</code>
      </td>
      <td className="py-1.5 pr-4 align-top text-fg-secondary">{que}</td>
      <td className={`py-1.5 align-top font-medium ${alerta ? "text-danger-ink" : "text-fg"}`}>{plata}</td>
    </tr>
  );
}

function Dato({ n, de, etiqueta, pie }: { n: number; de?: number; etiqueta: string; pie: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-2xl font-bold tabular-nums text-fg">
        {n}
        {de !== undefined && <span className="text-base font-normal text-fg-muted"> / {de}</span>}
      </p>
      <p className="text-sm text-fg-secondary">{etiqueta}</p>
      <p className="mt-0.5 text-xs text-fg-muted">{pie}</p>
    </div>
  );
}
