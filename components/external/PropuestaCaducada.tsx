/**
 * components/external/PropuestaCaducada.tsx
 *
 * Hermano de NoAccess, para el ÚNICO fallo del módulo externo que se distingue del resto:
 * el link existe y es válido, pero la ventana venció.
 *
 * Que este mensaje sea distinto es una excepción deliberada al "todos los fallos se ven
 * igual" (ver el encabezado de lib/external/business-case-view.ts). El motivo es de
 * negocio: un cliente que abre la propuesta a los 40 días tiene que entender que se venció
 * y a quién escribirle, no leer un error que parece de Smarteam. Lo que la hace aceptable
 * es que para llegar acá hay que tener un token válido en la mano.
 */
export default function PropuestaCaducada({ contactEmail }: { contactEmail?: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "48px 16px",
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#111827", fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}>
          Esta propuesta caducó
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: "#6b7280" }}>
          El enlace tenía una fecha de vencimiento y ya pasó. Escribile a tu contacto en
          Smarteam y te comparte una versión al día.
        </p>
        {contactEmail && (
          <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6 }}>
            {/* Un mailto es el único "recurso" de la página y no sale a la red: no filtra
                el token por Referer, a diferencia de un link http a otro origen. */}
            <a href={`mailto:${contactEmail}`} style={{ color: "#0B58D3", fontWeight: 600 }}>
              {contactEmail}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
