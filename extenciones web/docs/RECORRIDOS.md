# Recorridos reales por extensión

Mapa de la evidencia de campo (Burp Suite) y de dónde está cada cosa cuando
hay que pulir un módulo. Nace de una regla simple: **un ajuste sin respuesta
real del portal es una suposición**.

---

## 1 · Dónde vive cada cosa

| Extensión | Copia de trabajo | Qué tiene | Estado |
| :--- | :--- | :--- | :--- |
| **01 · IVA** | `01_Nueva_Luz_3.0/recorridos/` | 12 trazas · 8 documentos · 13 capturas · 4 PDFs · 3 diccionarios (112 MB) | 🟢 completa |
| **02 · Claves** | `02_Cambio_Claves_SRI/recorridos/` | `cambio_de_clave_obligatorio_ID.xml` (36 ítems) | 🟡 parcial (falta el “después” de guardar) |
| **03 · Gastos** | `03_Anexo_Gastos_Personales/recorridos/` | sólo `LEEME.md` con qué capturar | 🔴 falta |
| **04 · Anulador** | `04_Anulador_Comprobantes_SRI/recorridos/` | sólo `LEEME.md` con qué capturar | 🟡 opcional: el motor v2.5 ya funciona, la traza es para blindarlo |
| Fuente | `_EVIDENCIA_SRI/` | Todo, más los diccionarios y el índice | 🟢 |

Cada `recorridos/` trae su propio `LEEME.md` con el detalle: qué archivo abrir
primero y qué buscar en cada uno. Este documento es el mapa; el `LEEME` es el
manual de esa carpeta.

---

## 2 · Qué abrir primero (01, el caso completo)

1. **`documentacion/BIBLIA_PANTALLAS_SRI.md`** — el catálogo de pantallas y
   selectores confirmados. Si un selector no está ahí, no está confirmado.
2. **`documentacion/BIBLIA_FORMULARIO_IVA_2011.md`** — casilleros y
   validaciones del 2011.
3. **`documentacion/INFORME_BURP_vs_EXTENSION.md`** — por qué el bot se
   quedaba en “recargar comprobantes”.
4. **`trazas_burp/recorrido_manual_sri.xml`** — la referencia de 189 ítems.
5. El resto: cuando la biblia manda a una traza puntual.

Regla: **biblia primero, traza después**. La biblia dice *qué* se concluyó; la
traza dice *por qué*.

---

## 3 · Lo que falta (y es lo que traba a 03 y 04)

| Módulo | Traza que falta | Qué desbloquea |
| :--- | :--- | :--- |
| 03 | Anexo de gastos: `sriservicios…/anexo-gastos-personales/facturas-electronicas.jsf` | Cambiar la heurística de la grilla por selectores reales y validar el guardado |
| 04 | Anulación: `…/solicitud/anulacion/menuAnulacion.jsf` | Blindar el motor v2.5 (el que funciona) contra cambios del portal; ya no es un bloqueo |

Los `LEEME.md` de cada carpeta tienen el paso a paso de captura y la lista de
los 6-7 datos que hay que mirar en la traza. No hace falta nada más que un
recorrido con un contribuyente/comprobante de prueba.

---

## 4 · Cómo agregar una traza nueva (5 pasos)

1. Capturar en Burp: **Proxy → HTTP history** → seleccionar el rango → clic
   derecho → **Save items** → **XML**.
2. Nombrar `AAAA-MM-<flujo>_<referencia>.xml` (ej.
   `2026-11-anexo-gastos_prueba.xml`).
3. Guardar el original en `_EVIDENCIA_SRI/` y anotarlo en
   `EVIDENCIA_INDEX.md` §2 (ítems, logins, citas).
4. Copiarlo a `<extensión>/recorridos/trazas_burp/`.
5. Si cambia una conclusión, actualizar la biblia **en el mismo commit** que
   la traza: la evidencia sin conclusión escrita no sirve para decidir.

---

## 5 · Reglas de seguridad (no negociables)

- **Contienen datos reales.** Once de las doce trazas del 01 llevan las
  credenciales del login de Keycloak (base64 en el cuerpo del POST), además de
  RUC y nombres de contribuyentes.
- **No se commitean.** `extenciones web/*/recorridos/` está en `.gitignore`;
  `git check-ignore` lo confirma.
- **Chrome las carga con la extensión.** No empiezan con `_` a propósito:
  Chrome **rechaza** la extensión entera si una carpeta de la raíz empieza con
  guion bajo (`Cannot load extension with file or directory name _recorridos`).
  Si algún día se arma un ZIP para publicar, hay que excluir `recorridos/`.
- **No se comparten** por chat, correo ni capturas de pantalla del árbol.
- La fuente es `_EVIDENCIA_SRI/`; las copias son de lectura.

---

## 6 · Por qué duplicar 112 MB

Porque el objetivo es que al abrir `01_Nueva_Luz_3.0` esté **todo lo necesario
para trabajar en ese módulo**, sin saltar entre carpetas ni recordar dónde
estaba la traza. El costo es espacio en disco (112 MB de 546 GB libres) y la
disciplina de no editarlas.

Si algún día molesta: se borran las copias y queda el original, sin perder
nada. No hay nada en `recorridos/` que no esté en `_EVIDENCIA_SRI/`.
