# 📚 DOCUMENTACIÓN TÉCNICA OFICIAL: RUTAS Y SELECTORES SRI Y ECUAFACT

Este documento mapea la secuencia completa de automatización, selectores HTML exactos y endpoints oficiales utilizados por las extensiones de Chrome del ecosistema **Santiago Córdova PRO**.

---

## 📌 1. Portal Oficial del SRI (Secuencia Completa de Ingreso & Cambio)

### Paso A: Portada de Inicio
- **URL**: `https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT`
- **Menú de Opciones (Puntitos)**: `<em class="material-icons">more_vert</em>`
- **Item Iniciar Sesión**: `<p class="topbar-item-name">Iniciar sesión</p>` o enlace a `openid-connect`.

### Paso B: Formulario SSO de Autenticación
- **URL**: `https://srienlinea.sri.gob.ec/auth/realms/Internet/protocol/openid-connect/auth?client_id=app-sri-claves-angular...`
- **Campo Identificación**: `<input id="usuario" name="usuario" placeholder="1700000000001">`
- **Campo Clave Actual**: `<input id="password" name="password" placeholder="Clave">`
- **Botonera Ingresar**: `<input id="kc-login" name="login" type="submit" value="Ingresar">`

### Paso C: Aviso Intermedio de Clave Expirada
- **Banner Alerta**: `<div class="ui-messages-warn">Su clave expirará en 0 días</div>`
- **Botonera de Enlace**: `a[href*="actualizar"]` / `button[title*="actualizar"]` / `.ui-messages-detail`
- *Acción*: Auto-clic instantáneo para avanzar sin requerir intervención manual.

### Paso D: Formulario de Actualización de Clave SRI (Angular Reactive Forms)
- **URL**: `https://srienlinea.sri.gob.ec/sri-en-linea/SriClaves/Generacion/internet/actualizar`
- **Clave Anterior**: `<input id="actual" formcontrolname="actual" type="password">`
- **Clave Nueva**: `<input id="nuevo" formcontrolname="nuevo" type="password">`
- **Confirmar Clave Nueva**: `<input id="confirmacion" formcontrolname="confirmacion" type="password">`
- **Botón Guardar**: `<span class="ui-button-text ui-clickable">Guardar</span>`

---

## 📌 2. Portal de Ecuafact (Autenticación y Configuración)

### Paso A: Login Principal
- **URL**: `https://app.ecuafact.com/auth`
- **Identificación / RUC**: `<input id="userid" name="Username">`
- **Contraseña**: `<input id="userpass" name="Password">`
- **Términos**: Checkbox `span` / `input[type="checkbox"]`
- **Botón Iniciar Sesión**: `<button id="loginButton" class="kt-login__btn-primary">`

### Paso B: Vincular Clave SRI en Ecuafact
- **URL**: `https://app.ecuafact.com/Config`
- **Botón Modal**: `<button class="conectar-sri">Cambiar Clave</button>`
- **Campo Clave Nueva**: `<input id="password2" name="UserPass">`
- **Checkbox Términos**: `<input id="checkme" name="checkme">`
- **Botón Conectar**: `<button class="login-sri" name="boton">Conectar</button>`

---

## 🛠️ Regla Universal de Transformación de Contraseñas SRI
```javascript
function transformPassword(oldPass) {
  if (!oldPass) return '';
  const trimmed = oldPass.trim();
  if (trimmed.endsWith('*')) {
    return trimmed.slice(0, -1) + '@';
  } else if (trimmed.endsWith('@')) {
    return trimmed;
  } else {
    return trimmed + '@';
  }
}
```
