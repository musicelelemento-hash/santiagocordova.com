# ⚡ Cloudflare R2 Vault Worker — SantiagoCordova.com

Microservicio en el Edge de Cloudflare para almacenamiento ultrarrápido de PDFs tributarios, comprobantes y firmas electrónicas con **$0 costo de salida (Zero Egress)** y **10 GB de almacenamiento gratuito**.

---

## 🚀 Despliegue en 1 Solo Paso

Para desplegar este worker a tu cuenta de Cloudflare:

```bash
# Desde la carpeta cloudflare-r2-worker:
CLOUDFLARE_API_TOKEN=<TU_CLOUDFLARE_API_TOKEN> npx wrangler deploy
```

O en Windows PowerShell:

```powershell
$env:CLOUDFLARE_API_TOKEN="<TU_CLOUDFLARE_API_TOKEN>"
npx wrangler deploy
```

---

## 📡 Endpoints Disponibles

| Método | Endpoint | Descripción |
|---|---|---|
| `POST / PUT` | `/upload/:categoria/:archivo.pdf` | Sube un archivo a R2 y devuelve su URL pública en el edge. |
| `GET` | `/files/:categoria/:archivo.pdf` | Entrega el PDF con caché inmutable y ultra-baja latencia. |
| `HEAD` | `/files/:categoria/:archivo.pdf` | Verifica la existencia del archivo sin descargarlo. |
| `DELETE` | `/files/:categoria/:archivo.pdf` | Elimina el archivo de R2. |
| `GET` | `/health` | Chequeo de estado del servicio. |

---

## 🛡️ Compatibilidad Multi-Tier
- **Tier 1:** Cloudflare R2 Vault (Prioritario / $0 Egress).
- **Tier 2:** Supabase Storage (`clients-vault` / `sri_proofs`).
- **Tier 3:** Respaldo Base64 persistente en base de datos.
