# El analizador de reuniones de venta — plan

> Pedido de Elías del 2026-10-23: Ventas va muy directo a la solución y explora poco. La propuesta es un analizador de
> reuniones con prospectos que le diga a cada vendedor qué tan consultiva fue su reunión y cómo mejorar, empezando por
> Andrés Pinzón como líder de Ventas. **Es una herramienta de coaching, no de control.** Revisado contra el código y la
> base de producción en solo lectura el mismo día. **Nada construido.** En el roadmap es el área S.

## Lo que hay hoy

- **Las reuniones con prospectos:** en los últimos 90 días hubo 71 y solo 31 tienen transcripción (44 %). Que falte la
  transcripción ya es un dato.
- **La preventa ya lee cada sesión** (`lib/exploraciones/lectura.ts`) y sabe qué preguntas de la guía se respondieron
  (`que-cubre-la-guia.ts`). Lo que se supo alimenta el lienzo de la exploración.
- **Lo que no existe:**
  - juzgar qué tan consultiva fue la reunión;
  - medir quién habló más;
  - ver si se transmitió el posicionamiento;
  - ver en qué posición quedó el vendedor;
  - recomendar algo para la siguiente reunión;
  - ver la tendencia de cada vendedor.
- **Las referencias:**
  - «Camosa l Exploración de retos operativos» (23 oct) tiene transcripción completa: sirve para probar.
  - La sesión de **Grupo Avis** («AVIS + SMARTEAM | DIGITAL», 20 oct) **no tiene transcripción ni notas en Nexus**: hay
    que conseguir su texto antes de usarla como referencia.
- **El criterio** está a medias:
  - la guía de la preventa y la escala existen;
  - las etapas del proceso consultivo (identificar, investigar, conectar, explorar y asesorar) no están escritas como una
    lista en Nexus;
  - el position statement todavía no existe (roadmap K3).

## Decisiones

- **Es coaching.** El análisis es una propuesta: el vendedor lo lee, lo comenta y discrepa. Nada queda como evaluación
  oficial sin que una persona lo confirme. No hay puntaje ni ranking entre vendedores.
- **Cada juicio trae su cita textual** de la transcripción. Sin cita, no hay juicio.
- **Quién habló más se calcula, no lo adivina la IA.** Se cuentan las palabras de cada persona en la transcripción, y se
  sabe quién es de Smarteam y quién del cliente por su correo o su nombre en el equipo.
- **El criterio sale de lo que ya tiene Nexus:**
  - el proceso consultivo, escrito una vez como una lista con qué se espera en cada etapa;
  - la guía de la preventa y lo que cubrió;
  - las dimensiones de la escala del área en juego;
  - el position statement, cuando exista (K3). Mientras tanto, esa parte dice «sin posicionamiento escrito».
- **Una reunión de referencia** se marca a mano. El analizador la usa como ejemplo de lo que sí es consultivo, con sus
  citas.
- **Solo reuniones con prospectos** (y con clientes en una conversación de venta, como una expansión). Las de entrega de
  Customer Success no entran.
- **Se analiza solo** cada reunión con prospecto que tiene transcripción, al llegar. El costo es bajo: unas 30 reuniones
  cada 90 días.

## Qué responde el análisis de cada reunión

En lenguaje sencillo, con sus citas:
1. Qué tan consultiva fue, con una lectura corta, no un número.
2. Cuánto se habló de los problemas y los resultados del cliente, frente a licencias, precio o producto.
3. Quién habló más: el vendedor o el cliente (calculado).
4. Si se siguió la guía de la preventa, y qué partes.
5. Si se usó la escala o el diagnóstico.
6. Si se transmitió el posicionamiento (cuando exista).
7. Qué se exploró y qué quedó sin explorar, según las dimensiones de la escala del área en juego.
8. En qué posición quedó el vendedor: como asesor o como vendedor de licencias.
9. Cuál quedó como siguiente paso, y si tiene fecha y dueño.
10. Dos o tres recomendaciones concretas para la siguiente reunión.

## Las vistas

1. **Por prospecto** (la empresa): todas sus reuniones con fecha y vendedor. Las que no tienen transcripción se ven
   claramente, con el motivo si se sabe (no se activó Gemini, la organizó el cliente). Al lado, cómo avanza la
   conversación de reunión en reunión: qué se exploró en cada una y qué sigue sin explorar.
2. **Por reunión:** el análisis, las citas, las recomendaciones, y los comentarios del vendedor («No estoy de acuerdo
   porque…»).
3. **Por vendedor:** la tendencia en el tiempo (cuánto explora, cuánto habla, cuántas reuniones dejan el siguiente paso
   con fecha, cuántas tienen transcripción). La ve el vendedor y su líder.
4. **En la exploración:** lo que se aprendió en la reunión alimenta el lienzo de la preventa de esa empresa, como ya lo
   hace la lectura de hoy, sin duplicarla.

## Etapas

1. **S1 · El criterio escrito:**
   - el proceso consultivo como lista (qué se espera en identificar, investigar, conectar, explorar y asesorar);
   - el marcador de reunión de referencia;
   - lo revisan Elías y Andrés.
2. **S2 · Quién habló y la vista por prospecto:**
   - el conteo de palabras por persona;
   - la lista de reuniones por empresa, con las que no tienen transcripción a la vista.

   No usa IA y sirve desde el primer día.
3. **S3 · El análisis de cada reunión:**
   - el agente con su prompt en la base (editable), que lee la transcripción, la guía, la escala y la referencia;
   - lo que responde, con citas, guardado como propuesta;
   - se mide su costo.
4. **S4 · Comentar y confirmar:** el vendedor lo lee, comenta o discrepa, y una persona lo confirma. Lo confirmado
   alimenta la tendencia.
5. **S5 · La vista por vendedor:** la tendencia en el tiempo, solo para el vendedor y su líder. La reunión se atribuye
   por el calendario y por quién habló en la transcripción, nunca por la asistencia ni los minutos de la API de Meet.
6. **S6 · Probar con Andrés:** cinco reuniones reales, entre ellas la de Camosa, revisadas con Andrés antes de abrirlo al
   resto de Ventas.

## Se cruza con

- **K7** (la siguiente pregunta de calidad) y **K1** (la exploración por departamento): el analizador dice qué quedó sin
  explorar, y la guía de la siguiente sesión lo pregunta.
- **K3** (el position statement), para el punto 6.
- **H y P5** (leer todas las sesiones): misma lectura de reuniones, otro fin.

## Respuestas de Elías (2026-10-23)

1. **La referencia:** en el pedido era la sesión de Grupo Avis con Pablo Bogantes. Fue presencial, se grabó con un
   teléfono y todavía no está. **Mientras tanto se prueba con Camosa** («Exploración de retos operativos», 23 oct), y
   Elías y Andrés deciden después de verla si sirve como referencia. Cuando llegue la grabación de Avis entra por T5
   (`docs/reuniones-pieza-angular-plan.md`) y se marca como referencia.
2. **Quién lo ve:** todos, al final. Primero solo los super admin, para probar; después se abre a Ventas.
3. **Pablo Bogantes** es del lado del cliente: un lead, que toma decisiones e influye en Avis y en una junta que administra
   Nissan. El analizador lo cuenta como cliente; queda unido a su empresa cuando existan los leads (B3) y las personas
   con su rol (R6).
4. **Las reuniones de expansión con clientes que ya lo son** (por ejemplo, «Fase 2: Marketing» con CEMACO) son
   conversaciones de venta. Recomendación: entran desde el principio, porque la venta cruzada también se explora.
   Pendiente de que Elías lo confirme.

## Respuestas de Elías (2026-10-24)

- **Primero lo ven los super admin**, y después todo Ventas, cada uno con sus análisis.
- **Además, un analizador por cliente (S7):** cómo se ha tratado a un cliente a lo largo de todas sus reuniones (qué se
  exploró y qué no, quién habló, qué siguientes pasos se cumplieron). Es para el líder y los super admin; el de cada
  reunión es el ejercicio del vendedor.

## A quién se le atribuye una reunión

Hoy Nexus guarda solo al organizador. La de Camosa la organizó Liz Navarro, y Marco y Andrés fueron invitados. El
analizador atribuye la reunión a todos los de Smarteam que estuvieron, con su papel (organizó o asistió), y la tendencia
de cada vendedor cuenta las suyas. Va con T7 del plan de las reuniones. Quién estuvo sale del calendario y de quién habló
en la transcripción, nunca de la asistencia ni de los minutos de la API de Meet: Google pide no usarla para medir
desempeño.
