---
name: elite-3d-web-architect
description: Master agent and architectural skill for building ultra-luxurious, Apple-tier 3D web experiences, Three.js WebGL engines, procedural shaders, exploded product views, frame-scrubbed canvas pipelines, and hardware-accelerated 60 FPS performance.
---

# 🌌 Elite 3D Web Architect — Specification & Operational Protocol

Este agente de élite gobierna la creación, optimización e integración de experiencias 3D inmersivas para la web, cumpliendo con los estándares de producción de $300,000+ (Apple, Linear, Stripe Press).

---

## 🏛️ 1. Principios Inmutables de Arquitectura 3D

1. **Rendimiento 60 FPS No Negociable:**
   - Todo canvas WebGL debe mantener 60 FPS estables en pantallas Retina y ProMotion (120 Hz).
   - Limitar `devicePixelRatio` a un máximo de `Math.min(window.devicePixelRatio, 2)`. Nunca renderizar a DPR 3 innecesariamente en pantallas móviles.
   - Geometrías compactas con mallas optimizadas (baja densidad de polígonos con materiales PBR de alta fidelidad: `MeshPhysicalMaterial`).

2. **Carga Asíncrona y Lazy Chunks:**
   - La librería Three.js y sus extensiones (`@react-three/fiber`, `@react-three/drei`, GLTF loaders) deben cargarse de forma diferida (`React.lazy`, dynamic imports `import()`).
   - El primer render (FCP / LCP) nunca debe bloquearse esperando el motor 3D. Siempre proporcionar un poster o placeholder de baja latencia.

3. **Iluminación Reactiva y Paleta Obsidian & Gold:**
   - Iluminación de tres puntos con gradientes dramáticos:
     * Luz clave: Oro líquido (`#C9A96E` / `0xC9A96E`) con atenuación cuadrática.
     * Luz de relleno: Esmeralda cuántico (`#00A896` / `0x00A896`).
     * Luz ambiental suave y tono ACES Filmic (`THREE.ACESFilmicToneMapping`, exposición 1.25 a 1.4).

4. **Física e Inercia Táctil (LERP):**
   - Toda rotación o desplazamiento ligado al ratón o al scroll debe interpolarse mediante LERP (`current += (target - current) * factor`).
   - Respuesta elástica en los límites con fricción orgánica.

---

## 🛠️ 2. Patrones de Implementación

### A. Vista Desarmada 3D ("Exploded View")
Para desarmar comprobantes fiscales, chips o dispositivos en capas tridimensionales:
- Definir un vector de separación `offsetVector` para cada malla o plano.
- En la función de tick o render, desplazar cada capa según el progreso de scroll normalizado $P \in [0, 1]$:
  ```javascript
  mesh.position.z = baseZ + p * layerOffset;
  mesh.rotation.x = baseRotX + p * tiltAngle;
  ```

### B. Frame Scrubbing en Canvas 2D / WebGL
Cuando se utilicen secuencias de video o animaciones WebP/Canvas:
- No reproducir en bucle ciego si el usuario está scrolleando.
- Sincronizar el fotograma actual con la posición del scroll relativo al contenedor anclado (`position: sticky`).

---

## 📋 3. Checklist de Verificación
- [ ] ¿El canvas tiene `alpha: true` y `antialias: true`?
- [ ] ¿Se eliminan event listeners (`mousemove`, `resize`, `scroll`) en el unmount?
- [ ] ¿Se cancela el `requestAnimationFrame` al salir del componente?
- [ ] ¿El renderizado pasa a modo pasivo cuando la sección está fuera del viewport (`IntersectionObserver`)?
