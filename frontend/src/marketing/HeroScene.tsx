import { useEffect, useRef } from 'react';

// The content always stays in HTML. This optional canvas is decorative only.
export default function HeroScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compact = window.matchMedia('(max-width: 767px)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    let cancelled = false;
    let disposeScene = () => {};
    let generation = 0;
    const setup = async () => {
      const current = ++generation;
      disposeScene();
      disposeScene = () => {};
      if (reduced.matches || compact.matches || connection?.saveData) return;
      try {
        const THREE = await import('three');
        if (cancelled || current !== generation) return;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'low-power' });
        if (!context) return;
        const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: false, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 1, 16);
        const columns = new THREE.Group();
        scene.add(columns);
        const geometry = new THREE.CylinderGeometry(0.25, 0.25, 1, 18);
        const materials = [
          new THREE.MeshStandardMaterial({ color: '#24556e', metalness: 0.3, roughness: 0.28 }),
          new THREE.MeshStandardMaterial({ color: '#286977', metalness: 0.3, roughness: 0.28 }),
        ];
        for (let i = 0; i < 41; i++) {
          const x = (i - 20) * 0.53;
          const height = 1.6 + Math.pow(Math.abs(x) / 10.6, 1.35) * 7;
          const mesh = new THREE.Mesh(geometry, materials[i % 5 === 0 ? 1 : 0]);
          mesh.scale.y = height;
          mesh.position.set(x, -5.5 + height / 2, Math.cos(x / 5) * -1);
          mesh.rotation.y = -0.24;
          columns.add(mesh);
        }
        scene.add(new THREE.AmbientLight('#cbdde9', 2));
        const jadeLight = new THREE.PointLight('#83d8c8', 180, 35);
        jadeLight.position.set(0, -1, 5);
        scene.add(jadeLight);
        const key = new THREE.DirectionalLight('#e8f6ff', 3);
        key.position.set(-5, 6, 8);
        scene.add(key);
        element.appendChild(canvas);
        let visible = true;
        let pointerX = 0;
        let pointerY = 0;
        let lastFrame = 0;
        const render = (time: number) => {
          if (time - lastFrame < 1000 / 30) return;
          lastFrame = time;
          columns.rotation.y += (pointerX * 0.035 - columns.rotation.y) * 0.04;
          columns.position.y = Math.sin(time * 0.00035) * 0.09 + pointerY * 0.04;
          renderer.render(scene, camera);
        };
        const sync = () => renderer.setAnimationLoop(visible && !document.hidden ? render : null);
        const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
        observer.observe(element);
        const resize = new ResizeObserver(() => {
          const { width, height } = element.getBoundingClientRect();
          if (!width || !height) return;
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        });
        resize.observe(element);
        const pointer = (event: PointerEvent) => {
          pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
          pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
        };
        const lost = (event: Event) => { event.preventDefault(); renderer.setAnimationLoop(null); canvas.style.opacity = '0'; };
        canvas.addEventListener('webglcontextlost', lost);
        window.addEventListener('pointermove', pointer, { passive: true });
        document.addEventListener('visibilitychange', sync);
        sync();
        disposeScene = () => {
          observer.disconnect(); resize.disconnect();
          window.removeEventListener('pointermove', pointer);
          document.removeEventListener('visibilitychange', sync);
          canvas.removeEventListener('webglcontextlost', lost);
          renderer.setAnimationLoop(null);
          geometry.dispose(); materials.forEach(material => material.dispose());
          renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
        };
      } catch {
        // Keep the CSS architectural backdrop if WebGL or the chunk is unavailable.
      }
    };
    const timer = window.setTimeout(setup, 400);
    reduced.addEventListener('change', setup);
    compact.addEventListener('change', setup);
    return () => {
      cancelled = true; generation++;
      window.clearTimeout(timer);
      reduced.removeEventListener('change', setup); compact.removeEventListener('change', setup);
      disposeScene();
    };
  }, []);
  return <div ref={host} className="mk-three-scene" aria-hidden="true" />;
}
