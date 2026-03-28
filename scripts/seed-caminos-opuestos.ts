import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CONTENT = `# Caminos opuestos según tipo de cliente

El mismo diagnóstico no sirve para todos. El tamaño y madurez del cliente determinan qué tipo de valor genera impacto. Usar el enfoque equivocado destruye credibilidad.

---

## Cliente grande (>200 empleados, equipos de marketing/ventas/servicio establecidos)

**Lo que YA saben:**
- Tienen procesos documentados (aunque no siempre los sigan)
- Conocen sus métricas principales (aunque no siempre confíen en ellas)
- Han trabajado con consultores antes
- Saben que tienen problemas de adopción y alineación

**Lo que NO quieren escuchar:**
- "Su proceso de ventas tiene estas etapas..." — ya lo saben
- "Necesitan lead scoring" — ya lo han intentado
- Descripciones genéricas de sus dolores — quieren causas raíz

**Lo que genera valor:**
- Insights contraintuitivos: "Su tasa de conversión del 3% no es un problema de volumen, es un problema de velocidad — sus leads se enfrían porque el SLA marketing→ventas no existe formalmente"
- Benchmarks que desafíen supuestos: "Empresas similares en educación superior logran 2x con la mitad de leads porque priorizan nutrición sobre captación"
- Oportunidades invisibles: "Tienen 4,000 contactos en lifecycle stage 'Customer' sin ninguna campaña de cross-sell activa — eso es revenue dormido"
- Contradicciones entre gerencia y operación: "La gerencia dice que el proceso funciona, pero el focus group reveló que el 60% de los leads se asignan manualmente porque el workflow no cubre el canal de LinkedIn"

**Tono:** Directo, basado en evidencia, sin rodeos. El cliente grande respeta al consultor que le dice lo que no quiere escuchar.

---

## Cliente pequeño (<30 empleados, fundador o equipo reducido)

**Lo que NO saben:**
- Nunca han visto su proceso mapeado visualmente
- No distinguen entre marketing y ventas como funciones separadas
- No saben qué métricas deberían medir
- No entienden qué es un lifecycle stage ni por qué importa

**Lo que NO quieren escuchar:**
- Jerga técnica sin contexto: "lead scoring", "attribution model", "SLA"
- Comparaciones con empresas grandes — se sienten fuera de liga
- Listas interminables de problemas — se paralizan

**Lo que genera valor:**
- El mapeo visual del proceso: "Así es como llega un cliente desde que los encuentra hasta que les paga — ¿lo habían visto así?" → Momento de revelación
- Diagnóstico simple y priorizado: "De todo lo que encontramos, estos 3 puntos son los que más impactan sus ingresos. Los demás pueden esperar."
- Quick wins concretos: "Con solo configurar un formulario y una secuencia de 3 emails, pueden capturar leads que hoy se pierden por WhatsApp"
- Lenguaje de negocio, no de tecnología: "Esto significa que por cada 10 personas interesadas, solo 2 les llegan al vendedor — las otras 8 se pierden sin registro"

**Tono:** Educativo pero no condescendiente. El fundador quiere entender, no que le hablen como a un estudiante.

---

## Cliente mediano (30-200 empleados, 1-3 personas en marketing/ventas)

**Contexto:**
- Tienen procesos pero informales (el equipo sabe qué hacer, no está escrito)
- Algunas métricas existen pero no se revisan sistemáticamente
- Han usado el CRM pero con adopción parcial
- Conocen algunos problemas pero no sus causas

**Equilibrio correcto:**
- 50% mapeo detallado (les ayuda a ver lo que hacen vs lo que creen que hacen)
- 50% propuestas accionables (no solo diagnóstico, sino "con esto pasamos de nivel 1 a nivel 2")
- Priorización clara: máximo 5 hallazgos principales, ordenados por impacto
- Comparar "proceso teórico" vs "rutina real" — el contraste genera insights inmediatos

**Tono:** Colaborativo. El cliente mediano quiere un socio, no un auditor.

---

## Reglas para los agentes

1. **Antes de generar un diagnóstico**, verificar el tamaño del cliente (campo \`tamano\` en el canvas de empresa) y la escala de rendimiento.
2. **Si el tamaño es grande** (o la escala general ≥3): priorizar insights sobre mapeo. No describir lo obvio.
3. **Si el tamaño es pequeño** (o la escala general ≤1): priorizar mapeo visual y explicaciones. Cada hallazgo necesita contexto de por qué importa.
4. **Si es mediano** (o escala 2): equilibrar ambos enfoques.
5. **Nunca usar jerga sin definirla** para clientes pequeños.
6. **Nunca repetir lo que el cliente ya dijo** para clientes grandes — usar sus palabras solo como evidencia para conclusions nuevas.
`;

async function main() {
  const doc = await prisma.knowledgeDocument.upsert({
    where: { id: "caminos-opuestos-cliente" },
    create: {
      id: "caminos-opuestos-cliente",
      type: "BEST_PRACTICE",
      status: "PUBLISHED",
      title: "Caminos opuestos según tipo de cliente",
      summary: "Guía para calibrar el enfoque del diagnóstico según el tamaño y madurez del cliente: grandes (insights contraintuitivos), pequeños (mapeo visual), medianos (equilibrio).",
      content: CONTENT,
      version: 1,
    },
    update: {
      content: CONTENT,
      summary: "Guía para calibrar el enfoque del diagnóstico según el tamaño y madurez del cliente: grandes (insights contraintuitivos), pequeños (mapeo visual), medianos (equilibrio).",
      version: { increment: 1 },
    },
  });

  console.log("✓ Documento creado/actualizado:", doc.id, "-", doc.title, "(v" + doc.version + ")");
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
