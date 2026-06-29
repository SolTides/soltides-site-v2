import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

  const canvas = document.getElementById("goldDnaCanvas");
  const wrap = document.querySelector(".dna-three-wrap");

  if (canvas && wrap) {
    const scene = new THREE.Scene();

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.25));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.26;

    const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
    camera.position.set(0, 0, 15.2);
    camera.lookAt(0, 0, 0);

    const group = new THREE.Group();
    group.rotation.z = 0.01;
    scene.add(group);

    function makeGoldGradientTexture() {
      const c = document.createElement("canvas");
      c.width = 96;
      c.height = 1024;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, c.height);

      // Metallic gold transition: bronze -> base gold -> bright gold -> white glare -> bright gold -> shadow gold.
      g.addColorStop(0.00, "#9b7126");
      g.addColorStop(0.15, "#d4af37");
      g.addColorStop(0.31, "#ffe891");
      g.addColorStop(0.42, "#ffffff");
      g.addColorStop(0.49, "#fff6c7");
      g.addColorStop(0.60, "#ffe891");
      g.addColorStop(0.78, "#c59b27");
      g.addColorStop(1.00, "#d4af37");

      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);

      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 1);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      return texture;
    }

    function makeReflectionTexture() {
      const c = document.createElement("canvas");
      c.width = 1024;
      c.height = 512;
      const ctx = c.getContext("2d");

      const bg = ctx.createLinearGradient(0, 0, c.width, c.height);
      bg.addColorStop(0.00, "#050505");
      bg.addColorStop(0.35, "#121212");
      bg.addColorStop(0.55, "#f7e8a8");
      bg.addColorStop(0.66, "#ffffff");
      bg.addColorStop(0.78, "#d4af37");
      bg.addColorStop(1.00, "#070707");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);

      ctx.globalAlpha = 0.72;
      for (const [x, w, color] of [
        [90, 26, "#ffffff"],
        [245, 46, "#ffe891"],
        [470, 34, "#ffffff"],
        [690, 58, "#d4af37"],
        [860, 28, "#ffffff"]
      ]) {
        const stripe = ctx.createLinearGradient(x - w, 0, x + w, 0);
        stripe.addColorStop(0, "rgba(255,255,255,0)");
        stripe.addColorStop(0.5, color);
        stripe.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = stripe;
        ctx.fillRect(x - w, 0, w * 2, c.height);
      }
      ctx.globalAlpha = 1;

      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.needsUpdate = true;
      return texture;
    }

    const goldGradient = makeGoldGradientTexture();
    scene.environment = makeReflectionTexture();

    // Polished metallic gradient instead of one flat color.
    const railMaterialA = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: goldGradient,
      metalness: 0.96,
      roughness: 0.022,
      clearcoat: 1.0,
      clearcoatRoughness: 0.004,
      reflectivity: 1.0,
      envMapIntensity: 1.55,
      specularIntensity: 1.0,
      specularColor: new THREE.Color(0xffffff)
    });

    const railMaterialB = railMaterialA.clone();

    const rungMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: goldGradient,
      metalness: 0.94,
      roughness: 0.027,
      clearcoat: 1.0,
      clearcoatRoughness: 0.006,
      reflectivity: 1.0,
      envMapIntensity: 1.42,
      specularIntensity: 1.0,
      specularColor: new THREE.Color(0xffffff)
    });

    const turns = 3.55;
    const height = 9.55;
    const radius = 0.64;
    const strandOffsetY = 0.34;

    function pointOnHelix(t, phase = 0, yShift = 0) {
      const a = t * Math.PI * 2 * turns + phase;
      const subtleRadius = radius + 0.02 * Math.sin(t * Math.PI * 2 * 0.9 + phase * 0.35);
      return new THREE.Vector3(
        Math.cos(a) * subtleRadius,
        (t - 0.5) * height + yShift,
        Math.sin(a) * subtleRadius
      );
    }

    function helixCurve(phase = 0, yShift = 0) {
      return new THREE.CatmullRomCurve3(
        Array.from({ length: 860 }, (_, i) => {
          const t = i / 859;
          return pointOnHelix(t, phase, yShift);
        })
      );
    }

    // Higher geometry density for smoother rails and cleaner specular highlights.
    const strand1 = new THREE.Mesh(
      new THREE.TubeGeometry(helixCurve(0, 0), 1550, 0.135, 192, false),
      railMaterialA
    );

    const strand2 = new THREE.Mesh(
      new THREE.TubeGeometry(helixCurve(Math.PI, strandOffsetY), 1550, 0.135, 192, false),
      railMaterialB
    );

    group.add(strand1, strand2);

    function capsuleBetween(p1, p2, radius, material, embed = 0.038) {
      const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
      const start = p1.clone().addScaledVector(dir, -embed);
      const end = p2.clone().addScaledVector(dir, embed);
      const fullDir = new THREE.Vector3().subVectors(end, start);
      const len = fullDir.length();
      const body = Math.max(0.001, len - radius * 2);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, body, 36, 96), material);
      mesh.position.addVectors(start, end).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fullDir.normalize());
      group.add(mesh);
      return mesh;
    }

    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const p1 = pointOnHelix(t, 0, 0);
      const p2 = pointOnHelix(t, Math.PI, strandOffsetY);
      capsuleBetween(p1, p2, 0.064, rungMaterial, 0.055);
    }

    const angle = THREE.MathUtils.degToRad(15);
    function rotateRight(x, y, z) {
      const v = new THREE.Vector3(x, y, z);
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      return v;
    }

    // Mostly neutral light now. The metallic color comes from the gradient/material, not brown lighting.
    const key = new THREE.DirectionalLight(0xffffff, 5.6);
    key.position.copy(rotateRight(4.2, 5.0, 7.6));
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 1.85);
    fill.position.copy(rotateRight(-4.4, 2.4, 5.7));
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 2.2);
    rim.position.copy(rotateRight(0.7, -1.6, 8.2));
    scene.add(rim);

    const topSpark = new THREE.DirectionalLight(0xffffff, 1.3);
    topSpark.position.copy(rotateRight(0.0, 7.5, 2.8));
    scene.add(topSpark);

    const sideSpark = new THREE.PointLight(0xffffff, 0.95, 16);
    sideSpark.position.copy(rotateRight(2.6, 0.2, 5.8));
    scene.add(sideSpark);

    const bounce = new THREE.PointLight(0xfff2b8, 0.55, 14);
    bounce.position.copy(rotateRight(-0.9, 0.4, 3.9));
    scene.add(bounce);

    const ambient = new THREE.AmbientLight(0xffffff, 0.84);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x111111, 0.78);
    scene.add(hemi);

    let targetRot = 0;
    let currentRot = 0;
    let lastScrollY = window.scrollY;

    function resize() {
      const rect = wrap.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      const visibleHeight = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visibleWidth = visibleHeight * camera.aspect;
      const horizontalFit = visibleWidth / 2.35;
      const preferredScale = THREE.MathUtils.mapLinear(rect.width, 92, 240, 0.34, 0.72);
      const dnaScale = THREE.MathUtils.clamp(Math.min(preferredScale, horizontalFit), 0.30, 0.72);
      group.scale.set(dnaScale, dnaScale, dnaScale);
      camera.updateProjectionMatrix();
    }

    function onScroll() {
      targetRot = window.scrollY * 0.0017;
      lastScrollY = window.scrollY;
    }

    function animate() {
      currentRot += (targetRot - currentRot) * 0.05;
      group.rotation.y = currentRot;
      group.rotation.x = -0.02 + Math.sin(lastScrollY * 0.0009) * 0.010;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });

    resize();
    onScroll();
    animate();
  }
