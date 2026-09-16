// <crystal-3d> — escultura obsidiana con anillos de oro, reacciona al scroll.
// three.js cargado dinámicamente desde CDN ESM.
class Crystal3D extends HTMLElement {
  connectedCallback() {
    if (this._booted) return;
    this._booted = true;
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';
    this._boot();
  }
  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    if (this._wake) window.removeEventListener('scroll', this._wake, { capture: true });
    if (this._renderer) this._renderer.dispose();
  }
  async _boot() {
    const THREE = await import('https://esm.sh/three@0.166.0');
    const w = this.clientWidth || 600, h = this.clientHeight || 600;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    // Gama baja: sin suavizado y menos píxeles por punto — el cristal ocupa poco en pantalla.
    const lowPower = innerWidth < 720 || (navigator.hardwareConcurrency || 8) <= 4;
    const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
    renderer.setSize(w, h);
    this.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    this._renderer = renderer;

    const root = new THREE.Group();
    scene.add(root);

    // Cristal obsidiana
    const crystal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.55, 0),
      new THREE.MeshPhysicalMaterial({
        color: 0x061423, metalness: 0.35, roughness: 0.12,
        clearcoat: 1, clearcoatRoughness: 0.05,
        reflectivity: 0.9, flatShading: true,
      })
    );
    root.add(crystal);

    // Aristas luminosas teal
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(crystal.geometry),
      new THREE.LineBasicMaterial({ color: 0x00a896, transparent: true, opacity: 0.85 })
    );
    root.add(edges);

    // Anillos de oro
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xc9a96e, metalness: 1, roughness: 0.22,
      emissive: 0x3a2c12, emissiveIntensity: 0.6,
    });
    const rings = [];
    [[2.5, 0.014], [3.05, 0.01], [3.55, 0.008]].forEach(([r, t], i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 12, 220), ringMat);
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.28;
      ring.rotation.y = i * 0.22;
      root.add(ring);
      rings.push(ring);
    });

    // Halo de partículas
    const N = 700, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 3.2 + Math.random() * 2.6;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.45;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0x8fd8cf, size: 0.022, transparent: true, opacity: 0.55,
    }));
    root.add(dust);

    scene.add(new THREE.AmbientLight(0x2b6aff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 5, 5); scene.add(key);
    const teal = new THREE.PointLight(0x00a896, 26, 14); teal.position.set(-3.4, -1.6, 2.6); scene.add(teal);
    const gold = new THREE.PointLight(0xc9a96e, 18, 14); gold.position.set(3.2, 2.4, -2.4); scene.add(gold);

    this._onResize = () => {
      const ww = this.clientWidth, hh = this.clientHeight;
      if (!ww || !hh) return;
      camera.aspect = ww / hh; camera.updateProjectionMatrix(); renderer.setSize(ww, hh);
    };
    window.addEventListener('resize', this._onResize, { passive: true });

    let p = 0, offAt = 0;
    const loop = (t) => {
      const rect = this.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > innerHeight + 200) {
        // fuera de pantalla: no gastamos GPU; tras 1s dejamos de programar frames
        if (!offAt) offAt = t;
        if (t - offAt > 1000) {
          this._raf = 0;
          if (!this._wake) {
            this._wake = () => {
              const r = this.getBoundingClientRect();
              if (r.bottom > -200 && r.top < innerHeight + 200 && !this._raf) {
                offAt = 0;
                this._raf = requestAnimationFrame(loop);
              }
            };
            window.addEventListener('scroll', this._wake, { passive: true, capture: true });
          }
          return;
        }
        this._raf = requestAnimationFrame(loop);
        return;
      }
      offAt = 0;
      const target = Math.min(1, Math.max(0, (innerHeight - rect.top) / (innerHeight + rect.height)));
      p += (target - p) * 0.08;
      const s = t * 0.001;
      root.rotation.y = s * 0.22 + p * Math.PI * 1.4;
      root.rotation.x = Math.sin(s * 0.3) * 0.12 + p * 0.35;
      crystal.rotation.y = -s * 0.35;
      crystal.scale.setScalar(0.92 + p * 0.22);
      rings.forEach((r, i) => { r.rotation.z = s * (0.12 + i * 0.06) + p * 0.9; });
      dust.rotation.y = -s * 0.08;
      renderer.render(scene, camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
}
if (!customElements.get('crystal-3d')) customElements.define('crystal-3d', Crystal3D);
