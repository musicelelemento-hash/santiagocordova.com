// crystal3d.js - Elite 3D WebGL Obsidian & Gold Interactive Sculpture
// Compatible with <crystal-3d> Custom Element, <x-import>, and global window scope.

(function() {
    function loadThreeScript() {
        return new Promise((resolve, reject) => {
            if (window.THREE) return resolve(window.THREE);
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            s.async = true;
            s.onload = () => resolve(window.THREE);
            s.onerror = (e) => reject(new Error('Failed to load Three.js: ' + e));
            document.head.appendChild(s);
        });
    }

    function initCrystalCanvas(container) {
        if (!container || container._threeInit) return;
        container._threeInit = true;

        loadThreeScript().then((THREE) => {
            const width = container.clientWidth || 400;
            const height = container.clientHeight || 450;

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
            camera.position.z = 5.2;

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.35;
            renderer.domElement.style.width = '100%';
            renderer.domElement.style.height = '100%';
            renderer.domElement.style.display = 'block';
            container.appendChild(renderer.domElement);

            // Group for crystal + rings
            const rootGroup = new THREE.Group();
            scene.add(rootGroup);

            // 1. Obsidian Outer Crystal (Double-pyramid Octahedron)
            const crystalGeo = new THREE.OctahedronGeometry(1.4, 0);
            const crystalMat = new THREE.MeshPhysicalMaterial({
                color: 0x050c14,
                emissive: 0x001418,
                roughness: 0.12,
                metalness: 0.88,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1,
                transmission: 0.25,
                ior: 1.6,
                transparent: true,
                opacity: 0.94,
                wireframe: false
            });
            const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
            rootGroup.add(crystalMesh);

            // Wireframe accent overlay for quantum luxury look
            const wireGeo = new THREE.WireframeGeometry(crystalGeo);
            const wireMat = new THREE.LineBasicMaterial({
                color: 0x00A896,
                transparent: true,
                opacity: 0.45,
                blending: THREE.AdditiveBlending
            });
            const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
            rootGroup.add(wireMesh);

            // 2. Inner Glowing Emerald Core
            const coreGeo = new THREE.IcosahedronGeometry(0.55, 1);
            const coreMat = new THREE.MeshBasicMaterial({
                color: 0x00A896,
                wireframe: true,
                transparent: true,
                opacity: 0.85
            });
            const coreMesh = new THREE.Mesh(coreGeo, coreMat);
            rootGroup.add(coreMesh);

            // 3. Orbital Gold Ring 1
            const ring1Geo = new THREE.TorusGeometry(1.85, 0.024, 16, 100);
            const goldMat = new THREE.MeshStandardMaterial({
                color: 0xC9A96E,
                emissive: 0x47371a,
                roughness: 0.25,
                metalness: 0.95
            });
            const ring1 = new THREE.Mesh(ring1Geo, goldMat);
            ring1.rotation.x = Math.PI / 3;
            ring1.rotation.y = Math.PI / 6;
            rootGroup.add(ring1);

            // 4. Orbital Emerald Ring 2
            const ring2Geo = new THREE.TorusGeometry(2.15, 0.018, 16, 100);
            const tealMat = new THREE.MeshStandardMaterial({
                color: 0x00A896,
                emissive: 0x002e29,
                roughness: 0.2,
                metalness: 0.9
            });
            const ring2 = new THREE.Mesh(ring2Geo, tealMat);
            ring2.rotation.x = -Math.PI / 4;
            ring2.rotation.z = Math.PI / 4;
            rootGroup.add(ring2);

            // 5. Surrounding Quantum Stardust Dust Particles (Dual-Tone Gold & Emerald)
            const pCount = 240;
            const pGeo = new THREE.BufferGeometry();
            const pPos = new Float32Array(pCount * 3);
            const pCols = new Float32Array(pCount * 3);
            const colGold = new THREE.Color(0xC9A96E);
            const colTeal = new THREE.Color(0x4edea3);

            for (let i = 0; i < pCount; i++) {
                pPos[i * 3] = (Math.random() - 0.5) * 8;
                pPos[i * 3 + 1] = (Math.random() - 0.5) * 8;
                pPos[i * 3 + 2] = (Math.random() - 0.5) * 8;

                const c = Math.random() > 0.4 ? colGold : colTeal;
                pCols[i * 3] = c.r;
                pCols[i * 3 + 1] = c.g;
                pCols[i * 3 + 2] = c.b;
            }
            pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
            pGeo.setAttribute('color', new THREE.BufferAttribute(pCols, 3));

            const pMat = new THREE.PointsMaterial({
                size: 0.045,
                vertexColors: true,
                transparent: true,
                opacity: 0.75,
                blending: THREE.AdditiveBlending
            });
            const particles = new THREE.Points(pGeo, pMat);
            scene.add(particles);

            // Lighting Setup
            const ambLight = new THREE.AmbientLight(0xffffff, 0.75);
            scene.add(ambLight);

            const dirLightGold = new THREE.DirectionalLight(0xC9A96E, 2.8);
            dirLightGold.position.set(4, 5, 4);
            scene.add(dirLightGold);

            const dirLightTeal = new THREE.DirectionalLight(0x00A896, 3.2);
            dirLightTeal.position.set(-4, -3, -2);
            scene.add(dirLightTeal);

            const pointLight = new THREE.PointLight(0x4edea3, 3.5, 12);
            pointLight.position.set(0, 0, 0);
            scene.add(pointLight);

            // Interaction & Animation
            let mouseX = 0;
            let mouseY = 0;
            let targetRotX = 0;
            let targetRotY = 0;

            const onMouseMove = (e) => {
                const rect = container.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - 0.5;
                const y = (e.clientY - rect.top) / rect.height - 0.5;
                targetRotY = x * 1.5;
                targetRotX = y * 1.5;
            };
            window.addEventListener('mousemove', onMouseMove, { passive: true });

            // Mobile gyroscope / device orientation tilt (Apple Parallax)
            const onDeviceOrientation = (e) => {
                if (e.gamma !== null && e.beta !== null) {
                    const clampGamma = Math.max(-30, Math.min(30, e.gamma));
                    const clampBeta = Math.max(-30, Math.min(30, e.beta - 45));
                    targetRotY = (clampGamma / 30) * 1.2;
                    targetRotX = (clampBeta / 30) * 1.2;
                }
            };
            if (window.DeviceOrientationEvent) {
                window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
            }

            const onResize = () => {
                const w = container.clientWidth || 400;
                const h = container.clientHeight || 450;
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                renderer.setSize(w, h);
            };
            window.addEventListener('resize', onResize, { passive: true });

            let clock = new THREE.Clock();
            let animId;

            function animate() {
                animId = requestAnimationFrame(animate);
                const t = clock.getElapsedTime();

                // Gentle organic breathing and rotation
                crystalMesh.rotation.y += 0.009;
                crystalMesh.rotation.x = Math.sin(t * 0.7) * 0.15;
                wireMesh.rotation.copy(crystalMesh.rotation);

                coreMesh.rotation.y -= 0.015;
                coreMesh.rotation.z += 0.008;
                const scale = 0.55 + Math.sin(t * 2.4) * 0.06;
                coreMesh.scale.set(scale, scale, scale);

                ring1.rotation.z += 0.012;
                ring2.rotation.y += 0.016;

                particles.rotation.y -= 0.002;
                particles.rotation.x = Math.sin(t * 0.3) * 0.05;

                // Mouse/Gyro smoothing (LERP)
                rootGroup.rotation.y += (targetRotY - rootGroup.rotation.y) * 0.06;
                rootGroup.rotation.x += (targetRotX - rootGroup.rotation.x) * 0.06;

                // Floating bob
                rootGroup.position.y = Math.sin(t * 1.2) * 0.12;

                renderer.render(scene, camera);
            }

            animate();
        }).catch(err => {
            console.warn('Three.js failed to initialize in crystal3d:', err);
        });
    }

    // Custom Element <crystal-3d>
    class Crystal3DElement extends HTMLElement {
        connectedCallback() {
            initCrystalCanvas(this);
        }
    }

    if (!customElements.get('crystal-3d')) {
        customElements.define('crystal-3d', Crystal3DElement);
    }

    // Also support <x-import> containers if they exist
    if (!customElements.get('x-import')) {
        class XImportElement extends HTMLElement {
            connectedCallback() {
                const comp = this.getAttribute('component-from-global-scope');
                if (comp === 'crystal-3d' || this.getAttribute('from')?.includes('crystal3d')) {
                    initCrystalCanvas(this);
                }
            }
        }
        customElements.define('x-import', XImportElement);
    }

    // Export to global scope
    window['crystal-3d'] = Crystal3DElement;
    window.Crystal3D = Crystal3DElement;
    window.initCrystalCanvas = initCrystalCanvas;

    // Auto mount if container exists on page load
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('crystal-3d, x-import[component-from-global-scope="crystal-3d"]').forEach(initCrystalCanvas);
    });
})();
