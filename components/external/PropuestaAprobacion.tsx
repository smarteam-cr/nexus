"use client";

/**
 * components/external/PropuestaAprobacion.tsx
 *
 * La barra con la que el PROSPECTO aprueba la propuesta. Sin login: deja su correo
 * (y el nombre si quiere) y queda registrado quién dijo que sí y cuándo.
 *
 * Vive FUERA del motor de landing a propósito: no toca templates ni configs, y por eso
 * tampoco aparece en el PDF (que se arma por /print/doc/... desde las mismas secciones).
 * Un botón "Aprobar" impreso en un PDF sería un botón muerto en la única copia del
 * documento que el cliente se guarda.
 *
 * Solo React + estilos inline (mismo criterio que el resto de /external: cero recursos de
 * otros orígenes en una página cuya URL lleva el token).
 */
import { useState, type FormEvent } from "react";
import { landingLang, t } from "@/components/landing/i18n";
import type { BusinessCaseApproval } from "@/lib/external/business-case-view";

/* Validación deliberadamente laxa: acá no se autentica a nadie, se registra un contacto.
   Una regex estricta rechaza correos válidos raros y el costo de eso —el cliente no puede
   aprobar y llama por teléfono— es peor que el de guardar un correo mal tipeado. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const AZUL = "#0B58D3";
const NARANJA = "#E8481C";

export default function PropuestaAprobacion({
  token,
  approval,
  lang: rawLang,
}: {
  token: string;
  approval: BusinessCaseApproval | null;
  lang?: string | null;
}) {
  const lang = landingLang(rawLang);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecha, setHecha] = useState<BusinessCaseApproval | null>(approval);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!EMAIL_RE.test(email.trim())) {
      setError(t(lang, "aprobarCorreoInvalido"));
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/external/business-case/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: email.trim(), name: name.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      // 409 = ya estaba aprobada (otra persona se adelantó, o doble click). No es un
      // error para el cliente: se le muestra la aprobación que ya existe.
      if (res.ok || res.status === 409) {
        if (body?.approval) setHecha(body.approval as BusinessCaseApproval);
        else setHecha({ approvedAt: new Date().toISOString(), approvedByEmail: email.trim(), approvedByName: name.trim() || null });
        return;
      }
      setError(t(lang, "aprobarFallo"));
    } catch {
      setError(t(lang, "aprobarFallo"));
    } finally {
      setSending(false);
    }
  };

  if (hecha) {
    const fecha = new Date(hecha.approvedAt).toLocaleDateString(lang === "en" ? "en-US" : "es-CR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const quien = hecha.approvedByName || hecha.approvedByEmail;
    return (
      <section style={wrap}>
        <div style={{ ...card, borderColor: "#a7f3d0", background: "#f0fdf9" }}>
          <h2 style={{ ...titulo, color: "#065f46" }}>✓ {t(lang, "aprobarListoTitulo")}</h2>
          <p style={{ ...bajada, color: "#047857" }}>
            {t(lang, "aprobarListoDetalle")} {fecha}
            {quien ? ` ${t(lang, "aprobarListoPor")} ${quien}` : ""}.
          </p>
          <p style={{ ...bajada, color: "#047857", marginTop: 4 }}>{t(lang, "aprobarListoPie")}</p>
        </div>
      </section>
    );
  }

  return (
    <section style={wrap}>
      <form onSubmit={submit} style={card}>
        <h2 style={titulo}>{t(lang, "aprobarTitulo")}</h2>
        <p style={bajada}>{t(lang, "aprobarBajada")}</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          <label style={{ flex: "1 1 220px", minWidth: 0 }}>
            <span style={rotulo}>{t(lang, "aprobarCorreo")}</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
              style={input}
            />
          </label>
          <label style={{ flex: "1 1 220px", minWidth: 0 }}>
            <span style={rotulo}>{t(lang, "aprobarNombre")}</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={sending}
              style={input}
            />
          </label>
        </div>

        {error && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#b91c1c" }} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={sending} style={{ ...boton, opacity: sending ? 0.6 : 1 }}>
          {sending ? t(lang, "aprobarEnviando") : t(lang, "aprobarBoton")}
        </button>
      </form>
    </section>
  );
}

// ── Estilos (inline: esta superficie no comparte hoja con la app interna) ──────
const wrap: React.CSSProperties = {
  maxWidth: "var(--stl-w-pagina, 1280px)",
  margin: "0 auto",
  padding: "40px 24px 56px",
  fontFamily: "var(--font-jakarta), system-ui, sans-serif",
};
const card: React.CSSProperties = {
  border: "1px solid #dbe6f7",
  borderRadius: 18,
  background: "#fff",
  padding: "28px 26px",
  boxShadow: "0 1px 2px rgba(11,88,211,0.05)",
};
const titulo: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 700, color: "#0b1f44" };
const bajada: React.CSSProperties = { margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "#41527a" };
const rotulo: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#6b7a99",
  marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd8ee",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: "#0b1f44",
  background: "#fff",
  fontFamily: "inherit",
};
const boton: React.CSSProperties = {
  marginTop: 18,
  border: "none",
  borderRadius: 10,
  padding: "12px 22px",
  fontSize: 14,
  fontWeight: 700,
  color: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
  background: `linear-gradient(90deg, ${NARANJA}, ${AZUL})`,
};
