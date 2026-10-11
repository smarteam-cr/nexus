---
name: cuestionario
description: Convierte una decisión que no puedes tomar solo en un cuestionario para quien sí puede.
disable-model-invocation: true
---

Convierte algo que Elías no puede contestar solo en un **cuestionario**: un documento en Markdown que le pasa a una persona para que lo llene a su ritmo, o que llenan juntos en una reunión. Esa persona sabe lo que a Elías le falta; el cuestionario se lo saca.

**Pregunta por el envío, no por el tema.** A Elías solo le preguntas por el _envío_, que siempre sabe contestar: a quién va y qué necesita de vuelta. Las preguntas del documento apuntan a la **brecha** entre lo que sabe esa persona y lo que Elías necesita.

1. **¿A quién va?** Pregunta, en un solo intercambio, el rol de la persona, qué sabe y qué relación tiene con Elías. Eso fija el tono y cuánto contexto tiene que traer el cuestionario. Si el tema ya está en `docs/DECISIONS.md` como pendiente de alguien («Pendiente de Elías», «hasta que Marco y Claudia contesten»), léelo antes: ahí suele estar quién decide y qué falta. Terminado cuando sabes quién es y qué sabe que Elías no.

2. **¿Qué necesitas de vuelta?** Pregunta, en un solo intercambio, las decisiones o los datos concretos que Elías no puede resolver solo. Terminado cuando tienes una lista concreta de lo que Elías tiene que poder decidir o hacer con las respuestas.

3. **Escribe el cuestionario.** Preguntas que apunten a la brecha de los pasos 1 y 2, con la estructura de abajo. Guárdalo en `docs/cuestionarios/AAAA-MM-DD-<tema>.md` (fecha de hoy, tema en minúsculas con guiones) y di la ruta. Terminado cuando el archivo existe y cada cosa que Elías nombró en el paso 2 tiene su pregunta.

4. **Ofrece cómo mandarlo.** Si la persona lo va a leer fuera del repo, ofrece pasarlo a un documento para compartir. Cuando vuelvan las respuestas, la decisión se escribe en `docs/DECISIONS.md` con su porqué, y se saca el «pendiente» que la esperaba.

## Cómo escribirlo

- En español, con **tuteo**.
- Quien lo recibe casi nunca es técnico (dirección, Finanzas, Ventas, la CSL). Nombra las pantallas y los botones como se ven en Nexus; nunca tablas, columnas, archivos ni nombres de variables. Si una pregunta depende de un número, ponlo con su moneda y de dónde sale.
- Cada pregunta es una sola idea. Nunca dos en una.
- De la más importante a la menos: a su ritmo, puede que haya una sola vuelta.
- Ofrece opciones cuando las hay, con lo que pasa con cada una, y deja siempre lugar para otra respuesta.

## Estructura

Arma el documento como un **cuestionario de descubrimiento**: a Elías le falta contexto y la persona lo tiene. Agrupa las preguntas bajo `##` por tema cuando son más de un puñado. Usa esta plantilla:

<plantilla>

# <Título del cuestionario>

**Para qué:** por qué existe este cuestionario y qué decisión depende de él.

**De:** Elías · **Para:** <la persona> · **Qué se hace con tus respuestas:** <a dónde van>

## Contexto

Un párrafo para orientar a quien no estuvo en la cabeza de Elías. Lo justo para contestar bien, no una página.

## Cómo contestar

Para cuándo y cuánto tiempo toma más o menos. Las respuestas a medias y «no sé» sirven: marca lo que no tengas claro en vez de saltarlo.

## <Tema>

Una sección `##` por tema. Debajo, sus preguntas, de la más importante a la menos. Cada pregunta es una sola idea, con el espacio para contestar justo debajo, y una línea de _por qué importa_ solo donde la pregunta se podría malinterpretar o invitar a una respuesta al pasar.

<ejemplo>
### ¿Lo que pagan los aliados cuenta para cubrir el punto de equilibrio?

_Por qué importa: si cuenta, cambia cuánto falta vender cada mes para cubrir los gastos._

- [ ] Sí, cuenta
- [ ] No, solo cuenta lo que se le vende a clientes
- [ ] Otra:

>
</ejemplo>

## ¿Algo más?

Para cerrar: ¿algo que no preguntamos y deberíamos saber?

</plantilla>
