/**
 * components/external/EstadoDeCuentaClientView.tsx — la página del estado de cuenta que ve el cliente (pedido 17,
 * 2026-11-13). Server component, sin JS: una página sobria con la marca, en hex literal como toda superficie del
 * cliente (nunca flipea a oscuro: se comparte, se imprime y se proyecta). Le habla de TÚ.
 *
 * Solo pinta lo que trae `EstadoDeCuentaViewData`; qué cruza lo decide el chokepoint
 * (lib/external/estado-de-cuenta-view.ts) y las reglas, lib/cobranza/estado-de-cuenta.ts.
 */
import type { ReactNode } from "react";
import type { EstadoDeCuentaViewData } from "@/lib/external/estado-de-cuenta-view";
import { fechaCorta, type FacturaDelEstado, type TotalesDeMoneda } from "@/lib/cobranza/estado-de-cuenta";
import { fmtMontoLibro } from "@/lib/cobranza/montos";

const TINTA = "#0f1b3d";
const TINTA_SUAVE = "#6b7a99";
const BORDE = "#eaeff8";
const FONDO_SUAVE = "#f7f9fd";
const ROYAL = "#0B58D3";
const ROJO = "#c2410c";
const ROJO_FONDO = "#fff4ed";
const VERDE = "#15803d";
const VERDE_FONDO = "#effaf3";
const FUENTE = "var(--font-jakarta), system-ui, sans-serif";

const monto = (n: number, moneda: string) => fmtMontoLibro(n, moneda);

function actualizado(isoInstante: string): string {
  return new Date(isoInstante).toLocaleString("es-CR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Costa_Rica",
  });
}

function Cifra({ rotulo, valor, tono }: { rotulo: string; valor: string; tono?: "rojo" | "verde" }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: TINTA_SUAVE, marginBottom: 4 }}>{rotulo}</div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: tono === "rojo" ? ROJO : tono === "verde" ? VERDE : TINTA,
          fontVariantNumeric: "tabular-nums",
          overflowWrap: "anywhere",
        }}
      >
        {valor}
      </div>
    </div>
  );
}

function BloqueDeMoneda({ t, varias }: { t: TotalesDeMoneda; varias: boolean }) {
  return (
    <section style={{ border: `1px solid ${BORDE}`, borderRadius: 12, padding: "16px 18px", background: "#fff" }}>
      {varias && <div style={{ fontSize: 12, fontWeight: 700, color: TINTA_SUAVE, letterSpacing: "0.06em", marginBottom: 10 }}>EN {t.moneda === "CRC" ? "COLONES" : t.moneda === "USD" ? "DÓLARES" : t.moneda}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <Cifra rotulo="Facturado" valor={monto(t.facturado, t.moneda)} />
        <Cifra rotulo="Pagado" valor={monto(t.pagado, t.moneda)} tono={t.pagado > 0 ? "verde" : undefined} />
        <Cifra rotulo="Por pagar" valor={monto(t.porPagar, t.moneda)} />
        <Cifra rotulo={t.nVencidas === 0 ? "Vencido" : t.nVencidas === 1 ? "Vencido (1 factura)" : `Vencido (${t.nVencidas} facturas)`} valor={monto(t.vencido, t.moneda)} tono={t.vencido > 0 ? "rojo" : undefined} />
      </div>
    </section>
  );
}

function Etiqueta({ f }: { f: FacturaDelEstado }) {
  const base = { display: "inline-block", fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" as const };
  if (f.estado === "pagada") return <span style={{ ...base, color: VERDE, background: VERDE_FONDO }}>Pagada{f.pagada ? ` el ${fechaCorta(f.pagada)}` : ""}</span>;
  if (f.estado === "vencida")
    return (
      <span style={{ ...base, color: ROJO, background: ROJO_FONDO }}>
        Vencida{f.diasVencida ? ` hace ${f.diasVencida} ${f.diasVencida === 1 ? "día" : "días"}` : ""}
      </span>
    );
  return <span style={{ ...base, color: ROYAL, background: "#eef4fe" }}>Por vencer</span>;
}

const celda = { padding: "10px 12px", borderBottom: `1px solid ${BORDE}`, textAlign: "left" as const, verticalAlign: "top" as const };
const cabecera = { ...celda, fontSize: 12, fontWeight: 600, color: TINTA_SUAVE, background: FONDO_SUAVE, whiteSpace: "nowrap" as const };

function TablaDeFacturas({ facturas, conVencimiento }: { facturas: FacturaDelEstado[]; conVencimiento: boolean }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${BORDE}`, borderRadius: 12 }}>
      <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 14, color: TINTA }}>
        <thead>
          <tr>
            <th style={cabecera}>Factura</th>
            <th style={cabecera}>Concepto</th>
            <th style={cabecera}>Emitida</th>
            {conVencimiento && <th style={cabecera}>Vence</th>}
            <th style={{ ...cabecera, textAlign: "right" }}>Monto</th>
            <th style={cabecera}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((f, i) => (
            <tr key={`${f.numero ?? "s"}-${f.periodo}-${i}`}>
              <td style={{ ...celda, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{f.numero ?? "—"}</td>
              <td style={celda}>
                {f.concepto}
                <div style={{ fontSize: 12, color: TINTA_SUAVE }}>{f.periodo}</div>
              </td>
              <td style={{ ...celda, whiteSpace: "nowrap" }}>{fechaCorta(f.emitida)}</td>
              {conVencimiento && <td style={{ ...celda, whiteSpace: "nowrap" }}>{fechaCorta(f.vence)}</td>}
              <td style={{ ...celda, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{monto(f.monto, f.moneda)}</td>
              <td style={celda}>
                <Etiqueta f={f} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: TINTA }}>{children}</h2>;
}

export default function EstadoDeCuentaClientView({ data }: { data: EstadoDeCuentaViewData }) {
  const { estado } = data;
  const varias = estado.totales.length > 1;
  const nada = estado.porPagar.length === 0 && estado.pagadas.length === 0;
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px 56px", fontFamily: FUENTE, color: TINTA }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: ROYAL }}>TU ESTADO DE CUENTA</div>
        <h1 style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 700, lineHeight: 1.25 }}>{data.empresa}</h1>
        {data.razonSocial && data.razonSocial !== data.empresa && <div style={{ marginTop: 2, fontSize: 14, color: TINTA_SUAVE }}>{data.razonSocial}</div>}
        <p style={{ margin: "10px 0 0", fontSize: 13, color: TINTA_SUAVE, lineHeight: 1.6 }}>
          Al {actualizado(data.actualizadoEn)} (hora de Costa Rica). Esta página está siempre al día: cada vez que la abres ves lo de hoy.
        </p>
      </header>

      {nada ? (
        <section style={{ border: `1px dashed ${BORDE}`, borderRadius: 12, padding: "28px 18px", textAlign: "center", color: TINTA_SUAVE, fontSize: 14 }}>
          Todavía no tienes facturas emitidas.
        </section>
      ) : (
        <div style={{ display: "grid", gap: 28 }}>
          <div style={{ display: "grid", gap: 12 }}>
            {estado.totales.map((t) => (
              <BloqueDeMoneda key={t.moneda} t={t} varias={varias} />
            ))}
          </div>

          <section>
            <Titulo>Facturas por pagar</Titulo>
            {estado.porPagar.length ? (
              <TablaDeFacturas facturas={estado.porPagar} conVencimiento />
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: VERDE }}>Estás al día: no tienes facturas pendientes.</p>
            )}
          </section>

          {estado.pagadas.length > 0 && (
            <section>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 16, fontWeight: 700, color: TINTA, marginBottom: 12 }}>
                  Facturas pagadas ({estado.pagadas.length})
                </summary>
                <TablaDeFacturas facturas={estado.pagadas} conVencimiento={false} />
              </details>
            </section>
          )}
        </div>
      )}

      <footer style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${BORDE}`, fontSize: 13, color: TINTA_SUAVE, lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>
          Los montos son los del servicio, sin impuestos: tu factura puede incluir el IVA. Cada factura vence {estado.creditoDias} días después de emitida.
          Cada moneda se muestra por separado, sin convertir.
        </p>
        <p style={{ margin: "6px 0 0" }}>¿Algo no cuadra? Escríbele a tu contacto en Smarteam y lo revisamos contigo.</p>
      </footer>
    </main>
  );
}

/** El enlace existe pero pasó su fecha. No dice de qué empresa es: para eso habría que tener un enlace vigente. */
export function EstadoDeCuentaVencido() {
  return (
    <main style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "48px 16px", fontFamily: FUENTE }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: TINTA }}>Este enlace venció</h1>
        <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: TINTA_SUAVE }}>
          Por seguridad, el enlace a tu estado de cuenta tiene fecha de vencimiento y ya pasó. Escríbele a tu contacto en Smarteam y te lo renueva.
        </p>
      </div>
    </main>
  );
}
