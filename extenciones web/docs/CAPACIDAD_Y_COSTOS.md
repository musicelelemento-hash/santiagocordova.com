# Capacidad y costos: cuánto entra y cuándo hay que crecer

Documento corto para responder con números, no con sensaciones: **¿cuántos
clientes más entran?** y **¿para qué sirve R2?**

---

## 1 · La cuenta (está en el código)

`services/capacity.ts` (web) y el chip del popup de la 04 usan la misma base:

| Dato | Valor | Dónde se cambia |
| :--- | :--- | :--- |
| Peso de una anulación | **~420 B** (fila + índices) | `PESO_ANULACION_BYTES` |
| Base de datos gratis (Supabase) | **500 MB** | `DB_FREE_MB` |
| Archivos gratis (Supabase Storage) | **1 GB** | `STORAGE_FREE_MB` |
| Ritmo de referencia | **3 anulaciones/cliente/mes** | `RITMO_POR_CLIENTE` |

De ahí sale el margen:

```
500 MB ÷ 420 B  ≈  1.248.000 anulaciones
÷ 3 por cliente ≈  416.000 clientes-mes
```

O sea: **la tabla de anulaciones no es el problema**. Un estudio con 200 clientes
que anula 5 comprobantes al mes genera 12.000 filas al año: ~5 MB, el **1 %** de
la base.

### Dónde se ve

- **Cobranza**: tarjeta *“Capacidad de la base”* con la barra dorada, el
  porcentaje y el margen en clientes.
- **Popup de la 04**: `☁ nube OK · 12:30 · 14 envíos · 6 KB` (acumulado real de
  lo que subió esa máquina).

El número es honesto: cuenta sólo las anulaciones. La base también guarda
clientes, declaraciones y comprobantes, pero esos pesan mucho menos que los
archivos (ver abajo).

---

## 2 · Lo que sí ocupa: los archivos, no las filas

| Qué | Peso típico | Dónde vive hoy |
| :--- | :--- | :--- |
| Fila de anulación | 420 B | Supabase (tabla) |
| PDF de comprobante | 80–400 KB | Supabase Storage |
| XML de factura | 3–10 KB | Supabase Storage |
| Firma `.p12` | 3–5 KB | Supabase Storage |

1000 comprobantes al mes ≈ **200 MB**. Ahí sí se llena el 1 GB gratuito en unos
5 meses si no se archiva.

---

## 3 · R2: para qué sirve y para qué no

**R2 guarda archivos, no filas.** Para las anulaciones no aporta nada: son
kilobytes en la base.

Donde R2 gana es en **archivos con muchas descargas**:

| | Supabase Storage (free) | Cloudflare R2 (free) |
| :--- | :--- | :--- |
| Espacio | 1 GB | **10 GB** |
| Descargas (egress) | 2 GB/mes | **sin costo** |
| Operaciones | incluidas con límite | 1M escrituras/mes |
| Costo al pasarse | plan Pro | ~USD 0,015/GB-mes |

**Recomendación:** no mover nada todavía. Hoy el volumen es chico y Supabase
alcanza. R2 entra cuando pase alguna de estas:

1. Más de ~800 MB de comprobantes (te avisa la tarjeta de capacidad).
2. El bot/app empiece a servir PDFs a clientes (egress).
3. Quieras guardar los PDFs de por vida sin pagar almacenamiento.

Cuando toque, el cambio es de una capa: `fileService` sube a R2 y guarda la URL;
la tabla de anulaciones no se toca.

---

## 4 · La versión “motivadora”

La tarjeta está pensada para eso: **barra llena = señal de crecer**, no de
problema. Con 200 clientes la barra se ve casi vacía y el texto dice el margen
(“~400.000 clientes”). El día que marque 10 %, ahí sí conviene mirar R2 o un
plan pago.
