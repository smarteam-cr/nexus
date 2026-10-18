/**
 * components/external/RutaDelServicioLanding.tsx — la RUTA DEL SERVICIO que ve el cliente: los ciclos de su servicio
 * recurrente y sus casos de uso como Gantt (SmartLoop, docs/smartloop-plan.md, etapa 7).
 *
 * Recibe la foto ya resuelta y filtrada por el chokepoint (lib/external/ciclos-view.ts): read-only, sin nada interno.
 * Server component sin JS: no hay nada que mover.
 *
 * Es una página del CLIENTE, así que va con la línea gráfica de Smarteam en hex literal (navy #051849, royal #0B58D3,
 * crema #FBF1E4) y no con los tokens de la app: nunca flipea claro/oscuro, igual que el cronograma externo. No monta
 * TimelineSection a propósito: su lista de montajes está congelada (lib/ui/pdf-mode-coverage.test.ts) y su forma es la
 * de un cronograma por fases, no la de ciclos con casos de uso. Sin scroll horizontal: las barras van en porcentaje y en
 * un teléfono el nombre del caso sube arriba de su barra. Se le habla de TÚ.
 */
import {
  ejeDeLaRuta,
  hoyEnElEje,
  posicionEnElEje,
  ROTULO_DEL_ESTADO,
  type CasoEnLaRuta,
  type CicloEnLaRuta,
  type EstadoDelCasoEnLaRuta,
  type RutaDelServicio,
} from "@/lib/servicios/ruta-del-servicio";
import { logoHeightCalc, logoScaleStyle, resolveLogoScale } from "@/lib/ui/logo-scale";

const NAVY = "#051849";
const ROYAL = "#0B58D3";
const TEXTO_SUAVE = "#4b5563";
const LINEA = "#e5e7eb";
const CREMA = "#FBF1E4";

const COLOR: Record<EstadoDelCasoEnLaRuta, { barra: string; texto: string }> = {
  sin_fechas: { barra: "#e5e7eb", texto: "#4b5563" },
  pendiente: { barra: "#c7d7f2", texto: NAVY },
  en_curso: { barra: ROYAL, texto: "#ffffff" },
  hecho: { barra: "#15803d", texto: "#ffffff" },
  cumplido: { barra: "#15803d", texto: "#ffffff" },
  no_cumplido: { barra: "#9ca3af", texto: "#ffffff" },
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fecha(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}
function tramo(desde: string | null, hasta: string | null): string {
  if (!desde && !hasta) return "Sin fechas todavía";
  return `${fecha(desde)} – ${fecha(hasta)}`;
}

const RESULTADO: Record<NonNullable<CicloEnLaRuta["resultado"]>, string> = {
  cumplida: "La meta se cumplió",
  parcial: "La meta se cumplió en parte",
  no_cumplida: "La meta no se cumplió",
};

/* Estilos de la página: clases con prefijo propio para que no se crucen con las del shell externo. */
const CSS = `
.rds { font-family: var(--font-jakarta), system-ui, sans-serif; color: ${NAVY}; background: #ffffff; }
.rds-wrap { max-width: 1040px; margin: 0 auto; padding: clamp(32px, 5vw, 56px) 16px 64px; }
.rds-fila { display: grid; grid-template-columns: minmax(180px, 280px) minmax(0, 1fr); gap: 16px; align-items: center; }
.rds-pista { position: relative; height: 28px; border-radius: 8px; background: #f8fafc; }
.rds-barra { position: absolute; top: 4px; bottom: 4px; border-radius: 6px; display: flex; align-items: center; padding: 0 8px; overflow: hidden; white-space: nowrap; font-size: 11px; font-weight: 600; }
.rds-eje { position: relative; height: 20px; }
.rds-hoy { position: absolute; top: -6px; bottom: -6px; width: 2px; background: #E8481C; border-radius: 1px; }
@media (max-width: 640px) {
  .rds-fila { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .rds-vacio-movil { display: none; }
}
`;

function Barra({ caso, eje }: { caso: CasoEnLaRuta; eje: NonNullable<ReturnType<typeof ejeDeLaRuta>> }) {
  const pos = posicionEnElEje(eje, caso.desde, caso.hasta);
  const c = COLOR[caso.estado];
  return (
    <div className="rds-pista" aria-hidden={pos ? undefined : true}>
      {pos ? (
        <div
          className="rds-barra"
          title={`${caso.titulo} · ${tramo(caso.desde, caso.hasta)} · ${ROTULO_DEL_ESTADO[caso.estado]}`}
          style={{ left: `${pos.izquierda * 100}%`, width: `${pos.ancho * 100}%`, background: c.barra, color: c.texto }}
        >
          {pos.ancho > 0.12 ? ROTULO_DEL_ESTADO[caso.estado] : ""}
        </div>
      ) : (
        <span style={{ position: "absolute", left: 10, top: 6, fontSize: 12, color: TEXTO_SUAVE }}>Por agendar</span>
      )}
    </div>
  );
}

function Ciclo({ ciclo, eje, hoy }: { ciclo: CicloEnLaRuta; eje: NonNullable<ReturnType<typeof ejeDeLaRuta>>; hoy: number | null }) {
  const pos = posicionEnElEje(eje, ciclo.desde, ciclo.hasta);
  const estado = ciclo.cerrado ? (ciclo.resultado ? RESULTADO[ciclo.resultado] : "Cerrado") : ciclo.etapa ? `En ${ciclo.etapa.toLowerCase()}` : "En curso";
  return (
    <section style={{ borderTop: `1px solid ${LINEA}`, padding: "20px 0 8px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="rds-fila">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
            Ciclo {ciclo.numero}
            {ciclo.nombre ? <span style={{ fontWeight: 500 }}> · {ciclo.nombre}</span> : null}
          </h2>
          <span style={{ fontSize: 12.5, color: TEXTO_SUAVE }}>{tramo(ciclo.desde, ciclo.hasta)}</span>
          <span
            style={{
              alignSelf: "flex-start",
              fontSize: 11.5,
              fontWeight: 600,
              borderRadius: 999,
              padding: "2px 10px",
              background: ciclo.cerrado ? "#f1f5f9" : "#e8f0fd",
              color: ciclo.cerrado ? TEXTO_SUAVE : ROYAL,
            }}
          >
            {estado}
          </span>
        </div>
        <div className="rds-pista" style={{ background: "transparent" }}>
          {pos && (
            <div
              style={{
                position: "absolute",
                top: 10,
                height: 8,
                left: `${pos.izquierda * 100}%`,
                width: `${pos.ancho * 100}%`,
                borderRadius: 4,
                background: ciclo.cerrado ? "#cbd5e1" : NAVY,
              }}
            />
          )}
          {hoy !== null && <div className="rds-hoy" style={{ left: `${hoy * 100}%` }} title="Hoy" />}
        </div>
      </div>
      {ciclo.meta && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, background: CREMA, borderRadius: 10, padding: "10px 14px" }}>
          <strong>La meta del ciclo:</strong> {ciclo.meta}
        </p>
      )}
      {ciclo.casos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: TEXTO_SUAVE }}>Los casos de uso de este ciclo se definen en su planificación.</p>
      ) : (
        ciclo.casos.map((caso, i) => {
          const pendientes = caso.delCliente.filter((d) => !d.hecha);
          return (
            <div key={`${ciclo.numero}-${i}`} className="rds-fila">
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{caso.titulo}</span>
                {caso.resultado && <span style={{ fontSize: 12.5, color: TEXTO_SUAVE, lineHeight: 1.4 }}>{caso.resultado}</span>}
                <span style={{ fontSize: 12, color: TEXTO_SUAVE }}>
                  {tramo(caso.desde, caso.hasta)} · {ROTULO_DEL_ESTADO[caso.estado]}
                </span>
                {pendientes.length > 0 && (
                  <span style={{ fontSize: 12, color: "#b45309", lineHeight: 1.4 }}>
                    De tu parte: {pendientes.map((d) => `${d.titulo}${d.vence ? ` (para el ${fecha(d.vence)})` : ""}`).join(" · ")}
                  </span>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <Barra caso={caso} eje={eje} />
                {hoy !== null && <div className="rds-hoy" style={{ left: `${hoy * 100}%` }} aria-hidden="true" />}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

export default function RutaDelServicioLanding({
  clientName,
  clientLogoUrl,
  clientLogoScale,
  ruta,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoScale?: number | null;
  ruta: RutaDelServicio;
}) {
  const eje = ejeDeLaRuta(ruta);
  const hoyISO = new Date().toISOString().slice(0, 10);
  const hoy = eje ? hoyEnElEje(eje, hoyISO) : null;
  const n = ruta.ciclos.length;

  return (
    <div className="rds">
      <style>{CSS}</style>
      <div className="rds-wrap">
        {clientLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clientLogoUrl}
            alt={clientName}
            style={{
              ...logoScaleStyle(resolveLogoScale(clientLogoScale)),
              height: logoHeightCalc(40),
              width: "auto",
              maxWidth: logoHeightCalc(180),
              objectFit: "contain",
              display: "block",
              marginBottom: 18,
            }}
          />
        )}
        <h1 style={{ fontSize: "clamp(26px, 3.6vw, 38px)", lineHeight: 1.15, margin: 0, fontWeight: 800 }}>
          Ruta del servicio
          <span style={{ color: "#9ca3af", fontWeight: 400, margin: "0 10px" }}>·</span>
          <span style={{ color: ROYAL }}>{clientName}</span>
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.55, color: TEXTO_SUAVE, maxWidth: 720 }}>
          Tu servicio {ruta.servicio} avanza por ciclos: cada uno arranca con un diagnóstico, se enfoca en unos pocos casos de uso
          y cierra con lo que aprendimos juntos. {n === 1 ? "Este es tu primer ciclo." : `Llevamos ${n} ciclos.`} Actualizada el{" "}
          {fecha(ruta.publicadaEl.slice(0, 10))}.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, margin: "22px 0 8px", fontSize: 12, color: TEXTO_SUAVE }}>
          {(["pendiente", "en_curso", "hecho", "no_cumplido"] as const).map((e) => (
            <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 8, borderRadius: 3, background: COLOR[e].barra, display: "inline-block" }} />
              {ROTULO_DEL_ESTADO[e]}
            </span>
          ))}
          {hoy !== null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 2, height: 12, background: "#E8481C", display: "inline-block" }} />
              Hoy
            </span>
          )}
        </div>

        {eje ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div className="rds-fila" style={{ marginBottom: 4 }}>
              <span className="rds-vacio-movil" />
              <div className="rds-eje" aria-hidden="true">
                {eje.meses.map((m) => (
                  <span key={m.etiqueta + m.inicio} style={{ position: "absolute", left: `${m.inicio * 100}%`, fontSize: 11, color: TEXTO_SUAVE, borderLeft: `1px solid ${LINEA}`, paddingLeft: 4 }}>
                    {m.etiqueta}
                  </span>
                ))}
              </div>
            </div>
            {ruta.ciclos.map((c) => (
              <Ciclo key={c.numero} ciclo={c} eje={eje} hoy={hoy} />
            ))}
          </div>
        ) : (
          <p style={{ margin: "24px 0 0", fontSize: 14, color: TEXTO_SUAVE }}>
            Todavía no hay fechas en la ruta: aparecen cuando se planifica el primer ciclo.
          </p>
        )}
      </div>
    </div>
  );
}
