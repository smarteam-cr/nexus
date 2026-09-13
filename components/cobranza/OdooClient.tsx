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
 */
import Link from "next/link";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import EmparejadoOdoo from "./EmparejadoOdoo";
import DiferenciasOdoo from "./DiferenciasOdoo";

type Pestana = "que-es" | "emparejar" | "no-cuadra";

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

type Conteos = { facturas: number; cuentasVinculadas: number; cuentas: number; diferencias: number };

export default function OdooClient({
  corrida,
  conteos,
  puedeVerCorridas,
  puedeEditar,
}: {
  /** `cobranza.write`: decide si se dibujan los controles que cierran una línea a mano. */
  puedeEditar: boolean;
  corrida: CorridaDelEspejo | null;
  conteos: Conteos;
  /** Solo SUPER_ADMIN llega a /integrations/odoo. Sin esto el enlace sería un rebote. */
  puedeVerCorridas?: boolean;
}) {
  const [tab, setTab] = useState<Pestana>(
    /* Arranca donde está el trabajo: si falta emparejar, esa es la pestaña. Si ya está todo
       emparejado, lo que queda es resolver diferencias. */
    conteos.cuentasVinculadas < conteos.cuentas ? "emparejar" : "no-cuadra",
  );

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
            count: conteos.cuentas - conteos.cuentasVinculadas,
            title: "Decirle a Nexus qué cliente de Odoo corresponde a cada cuenta",
          },
          {
            key: "no-cuadra",
            label: "Lo que no cuadra",
            count: conteos.diferencias,
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

      {tab === "que-es" && <QueEs conteos={conteos} />}
      {tab === "emparejar" && <EmparejadoOdoo />}
      {tab === "no-cuadra" && (
        <DiferenciasOdoo puedeEditar={puedeEditar} onIrAEmparejar={() => setTab("emparejar")} />
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
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-fg">Cómo se usa</h2>
        <ol className="mt-2 space-y-2 text-sm text-fg-secondary">
          <li>
            <strong className="text-fg">1. Emparejar, una sola vez.</strong> Decile a Nexus qué cliente de Odoo
            corresponde a cada cuenta. Hace falta porque Nexus guarda el nombre comercial («Iberorutas») y Odoo la
            razón social («Servicios San Mateo y Santa Elena del Sur S.A.»), y no se parecen. Al confirmar, las
            facturas de ese cliente pasan a la cuenta en el momento, y se guarda la cédula para que la próxima vez
            se sostenga solo.
          </li>
          <li>
            <strong className="text-fg">2. Revisar lo que no cuadra.</strong> Cada línea dice cuánta plata mueve, en
            qué sistema se arregla y los pasos. Si una diferencia está bien así, se marca con el motivo y deja de
            aparecer — pero vuelve sola si los números cambian.
          </li>
          <li>
            <strong className="text-fg">3. Mirar de cuándo es la copia.</strong> El sync corre solo cada mañana,
            desde las 6. La línea de arriba de estas pestañas dice de cuándo es la última corrida buena; si falla o
            deja de correr, se pone en rojo. Mientras esté en rojo, lo facturado después no está acá.
          </li>
        </ol>
      </div>

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
          pie="Las que faltan no pueden mostrar sus facturas."
        />
        <Dato n={conteos.diferencias} etiqueta="cosas por resolver" pie="Ordenadas por la plata que mueven." />
      </div>
    </div>
  );
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
