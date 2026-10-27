import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Procedural, articulated 3D athlete hero.
 * The rig is a lightweight hierarchy of pivots so it works without downloading
 * a large GLB file. It is a stylized David Goggins-inspired character, not a
 * photorealistic scan or an exact likeness.
 */
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
    renderer.domElement.setAttribute("aria-label", "Rigged animated 3D athlete character");
    renderer.domElement.setAttribute("role", "img");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, Math.max(root.clientWidth, 1) / Math.max(root.clientHeight, 1), 0.1, 100);
    camera.position.set(0, -0.72, 10.9);

    const character = new THREE.Group();
    character.scale.setScalar(1.16);
    scene.add(character);

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
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.28 });
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xd7d0b9, roughness: 0.45 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: 0x20291f, roughness: 0.82 });

    const add = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      pos: [number, number, number],
      scale?: [number, number, number]
    ) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      if (scale) mesh.scale.set(...scale);
      parent.add(mesh);
      return mesh;
    };

    // Torso and broad shoulders.
    const torso = new THREE.Group();
    torso.position.y = -0.1;
    character.add(torso);
    add(torso, new THREE.CapsuleGeometry(0.78, 1.18, 6, 18), shirt, [0, -1.1, 0], [1.05, 1.0, 0.63]);
    add(torso, new THREE.SphereGeometry(0.48, 28, 20), shirt, [-0.72, -0.52, 0], [1.0, 0.82, 0.78]);
    add(torso, new THREE.SphereGeometry(0.48, 28, 20), shirt, [0.72, -0.52, 0], [1.0, 0.82, 0.78]);
    add(torso, new THREE.BoxGeometry(0.65, 0.045, 0.035), trim, [0, -0.9, 0.62]);

    // Pelvis, running shorts, and articulated legs make this a full-body model.
    const pelvis = new THREE.Group();
    pelvis.position.set(0, -2.05, 0);
    character.add(pelvis);
    add(pelvis, new THREE.SphereGeometry(0.49, 32, 24), shirt, [0, 0, 0], [1.15, 0.62, 0.78]);
    add(pelvis, new THREE.BoxGeometry(0.92, 0.36, 0.74), shortsMat, [0, -0.12, 0], [1, 1, 1]);
    add(pelvis, new THREE.BoxGeometry(0.94, 0.055, 0.77), trim, [0, 0.09, 0.015]);
    add(pelvis, new THREE.BoxGeometry(0.94, 0.035, 0.76), dark, [0, -0.28, 0.005]);

    const makeLeg = (side: -1 | 1) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.29, -0.08, 0);
      pelvis.add(hip);
      add(hip, new THREE.CapsuleGeometry(0.22, 0.63, 7, 16), skin, [0, -0.48, 0], [1.0, 1.0, 1.02]);
      const knee = new THREE.Group();
      knee.position.set(0, -0.92, 0.015);
      hip.add(knee);
      add(knee, new THREE.SphereGeometry(0.19, 22, 18), skin, [0, 0, 0], [1.0, 0.95, 0.95]);
      add(knee, new THREE.CapsuleGeometry(0.155, 0.55, 7, 16), skin, [0, -0.42, 0], [1.0, 1.0, 0.95]);
      const foot = new THREE.Group();
      foot.position.set(0, -0.77, 0.04);
      knee.add(foot);
      add(foot, new THREE.BoxGeometry(0.24, 0.16, 0.48), dark, [0, -0.02, 0.12], [1, 1, 1]);
      add(foot, new THREE.BoxGeometry(0.25, 0.045, 0.49), trim, [0, -0.105, 0.13], [1, 1, 1]);
      add(foot, new THREE.BoxGeometry(0.12, 0.025, 0.19), skinLight, [0, 0.065, 0.30], [1, 1, 1]);
      return { hip, knee, foot };
    };
    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);

    // Head pivot: separate from torso so the neck/head can turn naturally.
    const head = new THREE.Group();
    head.position.set(0, 0.1, 0);
    character.add(head);
    add(head, new THREE.CylinderGeometry(0.23, 0.31, 0.55, 20), skin, [0, -0.05, 0]);
    add(head, new THREE.SphereGeometry(0.58, 48, 36), skin, [0, 0.73, 0.02], [0.82, 1.0, 0.78]);
    // Bald scalp, strong jaw and close-cropped beard shading.
    add(head, new THREE.SphereGeometry(0.44, 40, 28), beard, [0, 0.43, 0.27], [0.84, 0.56, 0.67]);
    add(head, new THREE.SphereGeometry(0.37, 36, 26), skinLight, [0, 0.52, 0.43], [0.88, 0.52, 0.43]);
    add(head, new THREE.SphereGeometry(0.16, 24, 18), skinLight, [-0.47, 0.70, 0], [0.65, 0.85, 0.6]);
    add(head, new THREE.SphereGeometry(0.16, 24, 18), skinLight, [0.47, 0.70, 0], [0.65, 0.85, 0.6]);
    add(head, new THREE.TorusGeometry(0.085, 0.025, 8, 18), skinLight, [-0.49, 0.70, 0.11], [0.75, 1.2, 0.8]).rotation.y = Math.PI / 2;
    add(head, new THREE.TorusGeometry(0.085, 0.025, 8, 18), skinLight, [0.49, 0.70, 0.11], [0.75, 1.2, 0.8]).rotation.y = Math.PI / 2;
    add(head, new THREE.SphereGeometry(0.19, 24, 18), skinLight, [-0.31, 0.52, 0.38], [1, 0.65, 0.45]);
    add(head, new THREE.SphereGeometry(0.19, 24, 18), skinLight, [0.31, 0.52, 0.38], [1, 0.65, 0.45]);
    add(head, new THREE.BoxGeometry(0.27, 0.075, 0.08), dark, [-0.2, 0.81, 0.58]);
    add(head, new THREE.BoxGeometry(0.27, 0.075, 0.08), dark, [0.2, 0.81, 0.58]);
    // Layered sclera, iris, and pupils make the face readable at hero size.
    add(head, new THREE.SphereGeometry(0.066, 24, 18), eyeWhite, [-0.19, 0.73, 0.625], [1.05, 0.72, 0.55]);
    add(head, new THREE.SphereGeometry(0.066, 24, 18), eyeWhite, [0.19, 0.73, 0.625], [1.05, 0.72, 0.55]);
    add(head, new THREE.SphereGeometry(0.036, 20, 16), irisMat, [-0.19, 0.73, 0.674], [1, 0.92, 0.6]);
    add(head, new THREE.SphereGeometry(0.036, 20, 16), irisMat, [0.19, 0.73, 0.674], [1, 0.92, 0.6]);
    add(head, new THREE.SphereGeometry(0.019, 16, 12), eyeMat, [-0.19, 0.73, 0.695]);
    add(head, new THREE.SphereGeometry(0.019, 16, 12), eyeMat, [0.19, 0.73, 0.695]);
    const nose = add(head, new THREE.ConeGeometry(0.105, 0.29, 18), skinLight, [0, 0.57, 0.66], [0.8, 1, 0.85]);
    nose.rotation.z = Math.PI;
    add(head, new THREE.SphereGeometry(0.06, 16, 12), skinLight, [-0.065, 0.46, 0.68], [1, 0.65, 0.8]);
    add(head, new THREE.SphereGeometry(0.06, 16, 12), skinLight, [0.065, 0.46, 0.68], [1, 0.65, 0.8]);
    // Moustache, defined lips, chin beard and nostrils add stronger facial character.
    add(head, new THREE.SphereGeometry(0.105, 24, 16), beard, [-0.075, 0.405, 0.67], [1.0, 0.43, 0.45]);
    add(head, new THREE.SphereGeometry(0.105, 24, 16), beard, [0.075, 0.405, 0.67], [1.0, 0.43, 0.45]);
    add(head, new THREE.SphereGeometry(0.045, 16, 12), dark, [-0.055, 0.475, 0.73], [1.0, 0.55, 0.45]);
    add(head, new THREE.SphereGeometry(0.045, 16, 12), dark, [0.055, 0.475, 0.73], [1.0, 0.55, 0.45]);
    add(head, new THREE.BoxGeometry(0.23, 0.025, 0.035), lip, [0, 0.38, 0.69]);
    add(head, new THREE.BoxGeometry(0.18, 0.018, 0.025), skinLight, [0, 0.345, 0.69]);
    add(head, new THREE.SphereGeometry(0.24, 28, 20), beard, [0, 0.29, 0.37], [0.72, 0.42, 0.62]);

    // Shoulder/elbow pivots form a simple reusable arm rig.
    const makeArm = (side: -1 | 1) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.76, -0.56, 0.02);
      torso.add(shoulder);
      add(shoulder, new THREE.SphereGeometry(0.29, 24, 18), skin, [0, -0.05, 0], [1, 1.0, 0.95]);
      add(shoulder, new THREE.CapsuleGeometry(0.205, 0.54, 6, 14), skin, [side * 0.035, -0.42, 0], [1, 1.0, 1]);
      const elbow = new THREE.Group();
      elbow.position.set(side * 0.045, -0.72, 0);
      shoulder.add(elbow);
      add(elbow, new THREE.SphereGeometry(0.18, 20, 16), skin, [0, 0, 0], [1, 0.9, 0.95]);
      add(elbow, new THREE.CapsuleGeometry(0.16, 0.48, 6, 14), skin, [side * 0.025, -0.34, 0], [1, 1, 1]);
      add(elbow, new THREE.SphereGeometry(0.17, 20, 16), skin, [side * 0.04, -0.68, 0.02], [1, 0.9, 0.75]);
      return { shoulder, elbow };
    };
    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);

    // Subtle green-lit ground shadow.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -2.25, 0);
    shadow.scale.set(1.1, 0.38, 1);
    scene.add(shadow);

    const resize = () => {
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
        character.rotation.y = Math.sin(t * 0.48) * 0.12;
        character.position.y = Math.sin(t * 1.15) * 0.035;
        torso.scale.y = 1 + Math.sin(t * 1.7) * 0.008;
        head.rotation.y = Math.sin(t * 0.62) * 0.055;
        head.rotation.x = Math.sin(t * 0.85) * 0.025;
        leftArm.shoulder.rotation.z = -0.08 + Math.sin(t * 1.1) * 0.07;
        rightArm.shoulder.rotation.z = 0.08 - Math.sin(t * 1.1) * 0.07;
        leftArm.elbow.rotation.z = -0.05 + Math.max(0, Math.sin(t * 0.9)) * 0.12;
        rightArm.elbow.rotation.z = 0.05 - Math.max(0, Math.sin(t * 0.9 + 1)) * 0.12;
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
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="hero3d" ref={host} aria-label="Rigged animated 3D motivational athlete" />;
}
