import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Hero3D() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let frame = 0;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      root.classList.add("hero3d-fallback");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(root.clientWidth, root.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    root.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Animated 3D athlete character");
    renderer.domElement.setAttribute("role", "img");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, root.clientWidth / root.clientHeight, 0.1, 100);
    camera.position.set(0, 1.15, 7.8);
    const group = new THREE.Group();
    scene.add(group);

    scene.add(new THREE.HemisphereLight(0xd9f6d0, 0x111711, 2.2));
    const key = new THREE.DirectionalLight(0xe5ffd8, 3.2);
    key.position.set(3, 5, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0xa7ef79, 3, 12);
    rim.position.set(-3, 2.5, -2);
    scene.add(rim);

    const skin = new THREE.MeshStandardMaterial({ color: 0x704a35, roughness: 0.76 });
    const skinLight = new THREE.MeshStandardMaterial({ color: 0x875a40, roughness: 0.72 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x101510, roughness: 0.88 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x7da85f, roughness: 0.5, metalness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.95 });
    const beard = new THREE.MeshStandardMaterial({ color: 0x241b15, roughness: 1 });
    const lip = new THREE.MeshStandardMaterial({ color: 0x503126, roughness: 0.85 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x090b08, roughness: 0.3 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      if (scale) mesh.scale.set(...scale);
      group.add(mesh);
      return mesh;
    };
    // Broad shoulders and torso
    add(new THREE.CapsuleGeometry(0.78, 1.18, 6, 14), shirt, [0, -1.2, 0], [1.05, 1.0, 0.63]);
    add(new THREE.SphereGeometry(0.48, 24, 18), shirt, [-0.72, -0.62, 0], [1.0, 0.82, 0.78]);
    add(new THREE.SphereGeometry(0.48, 24, 18), shirt, [0.72, -0.62, 0], [1.0, 0.82, 0.78]);
    // Neck and head
    add(new THREE.CylinderGeometry(0.23, 0.31, 0.55, 20), skin, [0, 0.05, 0]);
    add(new THREE.SphereGeometry(0.58, 40, 32), skin, [0, 0.83, 0.02], [0.82, 1.0, 0.78]);
    // Sculpted jaw and short beard shading give the face a more lifelike silhouette.
    add(new THREE.SphereGeometry(0.43, 32, 22), beard, [0, 0.53, 0.27], [0.84, 0.56, 0.67]);
    add(new THREE.SphereGeometry(0.37, 32, 22), skinLight, [0, 0.62, 0.43], [0.88, 0.52, 0.43]);
    add(new THREE.SphereGeometry(0.16, 20, 14), skinLight, [-0.47, 0.8, 0.0], [0.65, 0.85, 0.6]);
    add(new THREE.SphereGeometry(0.16, 20, 14), skinLight, [0.47, 0.8, 0.0], [0.65, 0.85, 0.6]);
    // Ear folds, cheek planes, and a modeled nose bridge.
    add(new THREE.TorusGeometry(0.085, 0.025, 8, 16), skinLight, [-0.49, 0.8, 0.11], [0.75, 1.2, 0.8]).rotation.y = Math.PI / 2;
    add(new THREE.TorusGeometry(0.085, 0.025, 8, 16), skinLight, [0.49, 0.8, 0.11], [0.75, 1.2, 0.8]).rotation.y = Math.PI / 2;
    add(new THREE.SphereGeometry(0.19, 20, 16), skinLight, [-0.31, 0.62, 0.38], [1, 0.65, 0.45]);
    add(new THREE.SphereGeometry(0.19, 20, 16), skinLight, [0.31, 0.62, 0.38], [1, 0.65, 0.45]);
    // Brow ridge, eyes, nose and mouth add readable facial structure
    add(new THREE.BoxGeometry(0.27, 0.075, 0.08), dark, [-0.2, 0.91, 0.58], [1, 1, 1]);
    add(new THREE.BoxGeometry(0.27, 0.075, 0.08), dark, [0.2, 0.91, 0.58], [1, 1, 1]);
    add(new THREE.SphereGeometry(0.047, 12, 10), eyeMat, [-0.19, 0.83, 0.63]);
    add(new THREE.SphereGeometry(0.047, 12, 10), eyeMat, [0.19, 0.83, 0.63]);
    const nose = add(new THREE.ConeGeometry(0.105, 0.29, 16), skinLight, [0, 0.67, 0.66], [0.8, 1, 0.85]);
    nose.rotation.z = Math.PI;
    add(new THREE.SphereGeometry(0.06, 12, 10), skinLight, [-0.065, 0.56, 0.68], [1, 0.65, 0.8]);
    add(new THREE.SphereGeometry(0.06, 12, 10), skinLight, [0.065, 0.56, 0.68], [1, 0.65, 0.8]);
    add(new THREE.BoxGeometry(0.23, 0.025, 0.035), lip, [0, 0.48, 0.69]);
    add(new THREE.BoxGeometry(0.18, 0.018, 0.025), skinLight, [0, 0.445, 0.69]);
    // Arms: slightly angled down to give the character a strong stance
    const leftArm = add(new THREE.CapsuleGeometry(0.19, 0.86, 5, 12), skin, [-0.96, -1.18, 0.02]);
    leftArm.rotation.z = -0.15;
    const rightArm = add(new THREE.CapsuleGeometry(0.19, 0.86, 5, 12), skin, [0.96, -1.18, 0.02]);
    rightArm.rotation.z = 0.15;
    add(new THREE.BoxGeometry(0.65, 0.045, 0.035), trim, [0, -1.0, 0.62]);
    // Simple ground shadow
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -2.25, 0);
    shadow.scale.set(1.1, 0.38, 1);
    scene.add(shadow);

    const resize = () => {
      if (!root) return;
      const width = Math.max(root.clientWidth, 1);
      const height = Math.max(root.clientHeight, 1);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = performance.now() * 0.001;
      if (!reduced) {
        group.rotation.y = Math.sin(t * 0.55) * 0.14;
        group.position.y = Math.sin(t * 1.25) * 0.045;
        group.rotation.x = Math.sin(t * 0.7) * 0.018;
      }
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="hero3d" ref={host} aria-label="Animated 3D motivational athlete" />;
}
