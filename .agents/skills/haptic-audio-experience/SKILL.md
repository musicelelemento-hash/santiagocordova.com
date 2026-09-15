---
name: haptic-audio-experience
description: Master agent for synthesized spatial audio, Web Audio API oscillators, zero-bandwidth tactile micro-feedback, and sensory enhancement for luxury web applications.
---

# 🎧 Haptic & Audio Experience — Specification & Operational Protocol

Este agente diseña e implementa la dimensión auditiva y sensorial de interfaces digitales premium, siguiendo la filosofía de Apple y teenage engineering: sonido minimalista, elegante, sintético y de latencia cero.

---

## 🔊 1. Principios del Sonido Sintético en la Web

1. **Cero Dependencia de Archivos de Audio Pesados:**
   - Prohibido descargar archivos `.mp3` o `.wav` de cientos de kilobytes para micro-sonidos.
   - Toda retroalimentación acústica se sintetiza en tiempo real utilizando la **Web Audio API** nativa (`AudioContext`, `OscillatorNode`, `GainNode`).
   - Peso total en código: **menos de 1.5 KB**.

2. **Respeto a la Privacidad y el Silencio:**
   - El audio debe estar silenciado por defecto o activarse tras la primera interacción consciente del usuario (`user gesture`).
   - Siempre debe existir un interruptor visible e intuitivo (icono de altavoz en el HUD / Dynamic Island) para silenciar o reactivar el sonido.
   - El estado de preferencia de audio se persiste en `localStorage`.

3. **Curvas de Ganancia Exponenciales (Click & Pop Prevention):**
   - Nunca cortar abruptamente un oscilador para evitar artefactos acústicos (*clicks / pops*).
   - Utilizar `exponentialRampToValueAtTime(0.0001, endTime)`.

---

## 🎹 2. Tipos de Retroalimentación Acústica

### A. Clic Táctil Ultrasónico (`hapticClick`)
- **Uso:** Al presionar botones principales, pasar de un acto de scroll a otro, o abrir modales.
- **Frecuencia:** Rampa rápida de 1200 Hz a 400 Hz en 18 milisegundos con onda triangular (`triangle`).
- **Sensación:** Clic mecánico certero, similar a la corona digital del Apple Watch.

### B. Resonancia de Cristal 3D (`crystalResonance`)
- **Uso:** Al arrastrar o rotar la escultura 3D en el viewport WebGL.
- **Frecuencia:** Frecuencia pura de 880 Hz (La5) con modulación sutil y rampa de caída en 180 ms con onda sinusoidal (`sine`).
- **Sensación:** Zumbido armónico de vidrio y cuarzo.

### C. Éxito de Validación Fiscal (`taxSuccessChord`)
- **Uso:** Al verificar un RUC correctamente o calcular un ahorro en el simulador.
- **Frecuencia:** Acorde arpegiado rápido (Mi mayor: E5, G#5, B5) con reverberación suave.
