"use client";

/**
 * components/external/test/LeerResultadoAnterior.tsx — abre un resultado de la APLICACIÓN VIEJA (O6 etapa 1, 2026-10-26).
 * Página del cliente: tema claro con hex literal, en tuteo.
 *
 * El resultado viejo viaja después del `#`, que el servidor nunca ve. Este componente lo lee en el navegador con el
 * mismo lector de la preventa y se va a la misma página con solo el área, las letras y la fecha
 * (lib/tests-diagnostico/resultado-anterior.ts): el resultado lo arma el servidor. Si no se puede leer, lo dice y ofrece
 * hacer el test de nuevo.
 */
import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { leerResultadoDelTest, PAGINA_DEL_RESULTADO_VIEJO } from "@/lib/tests-diagnostico/enlace-leido";
import { direccionDelResultadoAnterior } from "@/lib/tests-diagnostico/resultado-anterior";

const ACENTO = "#E8481C";
const TINTA = "#0f1b3d";
const TINTA_SUAVE = "#5b6a8a";
const fuente = "var(--font-jakarta), system-ui, sans-serif";

const escucharElHash = (avisar: () => void) => {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
};

export default function LeerResultadoAnterior({ ilegible = false, motivo = "enlace" }: { ilegible?: boolean; motivo?: "enlace" | "nexus" }) {
  // El `#` solo existe en el navegador: en el servidor es null y la pantalla dice «Abriendo…».
  const hash = useSyncExternalStore(escucharElHash, () => window.location.hash, () => null);
  const destino = useMemo(() => {
    if (ilegible || hash === null) return null;
    const comprimido = hash.slice(1);
    const leido = comprimido ? leerResultadoDelTest(`${PAGINA_DEL_RESULTADO_VIEJO}#${comprimido}`) : null;
    return leido ? direccionDelResultadoAnterior(leido) : null;
  }, [hash, ilegible]);
  const noSePudo = ilegible || (hash !== null && !destino);

  useEffect(() => {
    // `replace`: el botón «atrás» no vuelve a esta pantalla de paso.
    if (destino) window.location.replace(destino);
  }, [destino]);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "64px 20px", fontFamily: fuente, color: TINTA }}>
      {noSePudo ? (
        <>
          <h1 style={{ fontSize: 26, margin: "0 0 10px" }}>No pudimos abrir este resultado</h1>
          <p style={{ fontSize: 16, color: TINTA_SUAVE, lineHeight: 1.6, margin: "0 0 20px" }}>
            {motivo === "nexus"
              ? "No pudimos armar tu resultado en este momento. Vuelve a intentarlo en un rato, o haz el test de nuevo: toma unos minutos."
              : "El enlace llegó incompleto. Puedes hacer el test de nuevo: toma unos minutos y te muestra tu resultado con la escala de hoy."}
          </p>
          <Link href="/external/test" style={{ display: "inline-block", padding: "12px 22px", borderRadius: 10, background: ACENTO, color: "#fff", fontWeight: 700, textDecoration: "none" }}>
            Hacer el test
          </Link>
        </>
      ) : (
        <p style={{ fontSize: 16, color: TINTA_SUAVE, margin: 0 }}>Abriendo tu resultado…</p>
      )}
    </div>
  );
}
