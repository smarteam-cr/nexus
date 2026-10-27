/**
 * components/external/test/ResultadoDelTestVista.tsx — LA PÁGINA DE RESULTADOS del test del diagnóstico (área O,
 * 2026-10-26). Server component, sin JS: la curva, el radar y las barras son SVG estático (§1-WEB: también sirve para
 * PDF). Tema claro con hex literal, en tuteo.
 *
 * Lo que dice, en este orden: dónde está el área (marcado como ESTIMADO: lo dijo quien respondió), la curva de los cinco
 * niveles, el radar y las barras de cada dimensión, UNA sola recomendación con su razón y lo que cuesta quedarse, los
 * riesgos activos, los casos de uso que lo mueven (sin precio) y la invitación a conversarlo.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";

const ACENTO = "#E8481C";
const ROYAL = "#0B58D3";
const TINTA = "#0f1b3d";
const TINTA_SUAVE = "#5b6a8a";
const BORDE = "#dfe5f1";
const FONDO_SUAVE = "#f6f8fc";
const fuente = "var(--font-jakarta), system-ui, sans-serif";
const LETRAS = ["D", "I", "F", "E", "O"] as const;

const tarjeta: CSSProperties = { border: `1px solid ${BORDE}`, borderRadius: 16, padding: 24, background: "#fff" };
const titulo2: CSSProperties = { fontSize: 18, margin: "0 0 14px", color: TINTA };

/** La posición 0..1 de un nivel con su puntaje (0..100). Sin puntaje, la mitad de su tramo. */
function posicion(letra: string | null, puntaje: number | null): number {
  if (puntaje != null) return Math.max(0, Math.min(1, puntaje / 100));
  const i = letra ? LETRAS.indexOf(letra as (typeof LETRAS)[number]) : -1;
  return i < 0 ? 0 : (i + 0.5) / LETRAS.length;
}

function Curva({ r }: { r: ResultadoDelTest }) {
  const w = 640;
  const h = 170;
  const x = (t: number) => 20 + t * (w - 40);
  const y = (t: number) => h - 40 - Math.pow(t, 1.6) * (h - 70);
  const puntos = Array.from({ length: 41 }, (_, k) => k / 40);
  const d = puntos.map((t, k) => `${k ? "L" : "M"}${x(t).toFixed(1)},${y(t).toFixed(1)}`).join(" ");
  const p = posicion(r.nivel, r.puntaje);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`Curva de madurez: ${r.areaNombre} en ${r.nivelNombre ?? "sin ubicar"}`}>
      <defs>
        <linearGradient id="curva-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={ACENTO} />
          <stop offset="1" stopColor={ROYAL} />
        </linearGradient>
      </defs>
      {r.niveles.map((n, i) => (
        <g key={n.letra}>
          <line x1={x(i / 5)} x2={x(i / 5)} y1={20} y2={h - 30} stroke={BORDE} strokeDasharray="3 4" />
          <text
            x={x((i + 0.5) / 5)}
            y={h - 10}
            textAnchor="middle"
            fontSize="12"
            fill={r.nivel === n.letra ? TINTA : TINTA_SUAVE}
            fontWeight={r.nivel === n.letra ? 700 : 400}
          >
            {n.nombre}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="url(#curva-grad)" strokeWidth="4" strokeLinecap="round" />
      {r.nivel && (
        <g>
          <circle cx={x(p)} cy={y(p)} r="10" fill="#fff" stroke={ACENTO} strokeWidth="4" />
          <text x={x(p)} y={y(p) - 18} textAnchor="middle" fontSize="12" fontWeight="700" fill={ACENTO}>
            Tú, hoy
          </text>
        </g>
      )}
    </svg>
  );
}

function Radar({ r }: { r: ResultadoDelTest }) {
  const dims = r.dimensiones.filter((d) => d.preguntada);
  if (dims.length < 3) return null;
  const c = 150;
  const radio = 100;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / dims.length;
  const pt = (i: number, t: number) => [c + Math.cos(ang(i)) * radio * t, c + Math.sin(ang(i)) * radio * t] as const;
  const poligono = dims.map((d, i) => pt(i, Math.max(0.06, posicion(d.nivel, d.puntaje))).join(",")).join(" ");
  return (
    <svg viewBox="0 0 300 300" width="100%" style={{ maxWidth: 340 }} role="img" aria-label="Radar de las dimensiones">
      {[0.2, 0.4, 0.6, 0.8, 1].map((t) => (
        <polygon key={t} points={dims.map((_, i) => pt(i, t).join(",")).join(" ")} fill="none" stroke={BORDE} />
      ))}
      {dims.map((_, i) => {
        const [px, py] = pt(i, 1);
        return <line key={i} x1={c} y1={c} x2={px} y2={py} stroke={BORDE} />;
      })}
      <polygon points={poligono} fill="rgba(11,88,211,0.16)" stroke={ROYAL} strokeWidth="2" />
      {dims.map((d, i) => {
        const [px, py] = pt(i, 1.18);
        return (
          <text key={d.id} x={px} y={py} fontSize="9" textAnchor="middle" dominantBaseline="middle" fill={TINTA_SUAVE}>
            {d.nombre.length > 22 ? `${d.nombre.slice(0, 21)}…` : d.nombre}
          </text>
        );
      })}
    </svg>
  );
}

function Barras({ r }: { r: ResultadoDelTest }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {r.dimensiones
        .filter((d) => d.preguntada)
        .map((d) => {
          const p = posicion(d.nivel, d.puntaje);
          const frena = r.recomendacion?.tipo === "trabajar" && r.recomendacion.dimensionId === d.id;
          return (
            <div key={d.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
                <span style={{ color: TINTA, fontWeight: frena ? 700 : 500 }}>
                  {d.nombre}
                  {frena && <span style={{ marginLeft: 8, fontSize: 11, color: ACENTO, fontWeight: 700 }}>LO QUE MÁS FRENA</span>}
                </span>
                <span style={{ color: TINTA_SUAVE, whiteSpace: "nowrap" }}>{d.noLoSe ? "No lo sabías" : (d.nivelNombre ?? "—")}</span>
              </div>
              <svg viewBox="0 0 100 6" width="100%" height="8" preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", marginTop: 6 }}>
                <rect x="0" y="0" width="100" height="6" rx="3" fill={FONDO_SUAVE} />
                <rect x="0" y="0" width={Math.max(3, p * 100)} height="6" rx="3" fill={frena ? ACENTO : ROYAL} />
              </svg>
            </div>
          );
        })}
    </div>
  );
}

export default function ResultadoDelTestVista({
  r,
  nombre,
  empresa,
  agenda,
  sinCorreo = false,
}: {
  r: ResultadoDelTest;
  /** Null en un resultado reabierto de la aplicación vieja (O6): su dirección no se usa para escribir un nombre. */
  nombre: string | null;
  empresa: string | null;
  /** El enlace para agendar la sesión (`TESTS_ENLACE_DE_AGENDA`); sin él, se le dice que le escribimos. */
  agenda: string | null;
  /**
   * Un resultado reabierto de la app vieja (O6): Nexus no tiene el correo de quien lo mira, así que sin agenda no se le
   * promete escribirle; se le ofrece hacer el test de nuevo.
   */
  sinCorreo?: boolean;
}) {
  const parcial = r.preguntadas < r.total;
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 72px", fontFamily: fuente, color: TINTA, display: "grid", gap: 24 }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: ACENTO }}>
          Diagnóstico de Rendimiento · {r.areaNombre}
        </p>
        <h1 style={{ margin: "8px 0 6px", fontSize: 30, lineHeight: 1.2 }}>
          {nombre ? `${nombre.split(" ")[0]}, tu área` : "Tu área"} de {r.areaNombre} está en {r.nivelNombre ?? "un punto que todavía no podemos ubicar"}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: TINTA_SUAVE }}>
          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: "#fff4ef", color: ACENTO, fontWeight: 700, marginRight: 8 }}>
            Estimado
          </span>
          {empresa ? `${empresa} · ` : ""}con lo que respondiste{parcial ? ` (${r.preguntadas} de ${r.total} dimensiones)` : ""}
        </p>
        <p style={{ margin: "16px 0 0", fontSize: 16, lineHeight: 1.65, color: TINTA }}>{r.sintesis}</p>
      </div>

      <section style={tarjeta}>
        <h2 style={titulo2}>Dónde estás en el camino</h2>
        <Curva r={r} />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
          {r.capas.map((c) => (
            <div key={c.clave} style={{ flex: "1 1 220px", background: FONDO_SUAVE, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: TINTA_SUAVE }}>{c.nombre}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{c.nivelNombre ?? "Sin ubicar"}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={tarjeta}>
        <h2 style={titulo2}>Cómo está cada parte de tu área</h2>
        <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Radar r={r} />
          </div>
          <Barras r={r} />
        </div>
      </section>

      {r.recomendacion && (
        <section style={{ ...tarjeta, border: `2px solid ${ACENTO}` }}>
          <h2 style={titulo2}>Por dónde empezar</h2>
          {r.recomendacion.tipo === "trabajar" ? (
            <>
              <p style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>
                Llevar {r.recomendacion.dimensionNombre.toLowerCase()} a {r.recomendacion.objetivoNombre}
              </p>
              <p style={{ margin: "0 0 12px", fontSize: 15, lineHeight: 1.6, color: TINTA }}>{r.recomendacion.razon}</p>
              {r.recomendacion.costoDeQuedarse && (
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: TINTA_SUAVE }}>
                  <strong style={{ color: TINTA }}>Lo que cuesta quedarse así: </strong>
                  {r.recomendacion.costoDeQuedarse}
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{r.recomendacion.razon}</p>
          )}
        </section>
      )}

      {r.riesgos.length > 0 && (
        <section style={tarjeta}>
          <h2 style={titulo2}>Lo que hoy pone en riesgo a tu área</h2>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 15, lineHeight: 1.55 }}>
            {r.riesgos.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}

      {r.casos.length > 0 && (
        <section style={tarjeta}>
          <h2 style={titulo2}>Lo que lo mueve</h2>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {r.casos.map((c) => (
              <div key={c.id} style={{ background: FONDO_SUAVE, borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{c.titulo}</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: TINTA }}>{c.promesa}</div>
                {c.razon && <div style={{ fontSize: 13, lineHeight: 1.5, color: TINTA_SUAVE, marginTop: 8 }}>{c.razon}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ ...tarjeta, background: TINTA, border: `1px solid ${TINTA}`, color: "#fff" }}>
        <h2 style={{ ...titulo2, color: "#fff" }}>Conversémoslo</h2>
        <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.6, color: "#d7def0" }}>
          En una sesión de 30 minutos confirmamos este resultado con tu equipo y armamos el primer paso. Sin costo.
        </p>
        {agenda ? (
          <a
            href={agenda}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", padding: "12px 22px", borderRadius: 10, background: ACENTO, color: "#fff", fontWeight: 700, textDecoration: "none" }}
          >
            Agendar la sesión
          </a>
        ) : sinCorreo ? (
          <p style={{ margin: 0, fontSize: 15, color: "#fff", fontWeight: 600 }}>
            Para coordinarla,{" "}
            <Link href="/external/test" style={{ color: "#fff", textDecoration: "underline" }}>
              haz el test de nuevo
            </Link>{" "}
            y te escribimos al correo que dejes.
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 15, color: "#fff", fontWeight: 600 }}>Te escribimos al correo que dejaste para coordinarla.</p>
        )}
      </section>
    </div>
  );
}
