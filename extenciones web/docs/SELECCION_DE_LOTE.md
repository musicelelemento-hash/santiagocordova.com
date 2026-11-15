# Selección del lote (antes «La Bendita»)

Un **filtro opcional**. Define qué clientes corren cuando apretás «Ejecutar
lote». Si no hay nada marcado, **corren todos los pendientes del período** —
que es el modo normal.

---

## Los dos estados

| Estado | Qué hace | Cómo se ve |
| :--- | :--- | :--- |
| **Sin selección** (normal) | Corren **todos** los clientes pendientes del período | La tarjeta «en la lista» **no aparece**; el botón dice «Ejecutar lote (N)» |
| **Con selección** | Corren **sólo los marcados** | Aparece la tarjeta dorada «en la lista: N» y los chips «En el lote / Correrán» |

---

## Cómo se activa y se apaga

- **Activar**: «Sumar pendientes» (marca a todos los que faltan declarar) o la
  estrella de un cliente.
- **Apagar**: menú **⋮** de la selección → **«Correr todo, sin selección»**.
  Vuelve al modo normal sin perder nada.

---

## Para qué sirve

- Correr **un subconjunto urgente** (3 clientes que se van de viaje) sin tocar
  el resto.
- Probar el flujo con **un cliente de prueba** antes de lanzar 2000.
- Dejar afuera, por un rato, a alguien puntual (aunque para bajas está el
  mecanismo propio: `sc_clientes_baja`).

---

## Por qué el nombre

Se llamaba «Lista Bendita» con 🙏 — un vocabulario que nadie pidió y que hacía
pensar en algo religioso o en un privilegio. La mecánica es la misma: una lista
de clientes. Por eso la interfaz dice **«selección»** y **«en la lista»**.

La clave de almacenamiento sigue siendo `sc_lista_bendita` para no romper datos
guardados ni los bancos de prueba. Cambiar la clave no aportaba nada.

---

## Aviso importante

Si la selección está **activa**, el lote **ignora** a los pendientes que no
estén marcados. El popup lo muestra (tarjeta dorada + chips) y «Ejecutar lote»
cuenta sólo los seleccionados — mirá ese número antes de apretar.
