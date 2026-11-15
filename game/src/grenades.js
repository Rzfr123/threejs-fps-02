// Grenades: thrown with an arc, one floor bounce, then a timed blast. The blast hurts
// through a radius with falloff and is blocked by walls: a target counts only when a
// ray from the blast point to its chest reaches it before any wall does.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FUSE = 1.6;
const BLAST_RADIUS = 7;
const BLAST_MAX = 95;
const GRAVITY = 14;

export function createGrenades(scene, colliders, shootables) {
  const items = [];
  const ray = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const shellGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const shellMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, metalness: 0.4 });
  const blastGeo = new THREE.SphereGeometry(1, 20, 14);
  const blastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, depthWrite: false });

  function throwGrenade(origin, direction, speed = 11) {
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    items.push({
      mesh,
      velocity: direction.clone().multiplyScalar(speed).add(new THREE.Vector3(0, 4.5, 0)),
      fuse: FUSE,
      bounced: false,
      blast: null,
      blastAge: 0,
    });
  }

  function step(dt, damageTargets) {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const g = items[i];
      if (g.blast) {
        g.blastAge += dt;
        const scale = 1 + g.blastAge * 22;
        g.blast.scale.setScalar(Math.min(scale, BLAST_RADIUS));
        g.blast.material.opacity = Math.max(0, 0.55 - g.blastAge * 1.6);
        if (g.blastAge > 0.35) {
          scene.remove(g.blast);
          items.splice(i, 1);
        }
        continue;
      }
      g.fuse -= dt;
      g.velocity.y -= GRAVITY * dt;
      g.mesh.position.addScaledVector(g.velocity, dt);
      if (g.mesh.position.y < 0.09) {
        if (!g.bounced) {
          g.mesh.position.y = 0.09;
          g.velocity.y = Math.abs(g.velocity.y) * 0.45;
          g.velocity.x *= 0.7;
          g.velocity.z *= 0.7;
          g.bounced = true;
        } else {
          g.mesh.position.y = 0.09;
          g.velocity.y = 0;
        }
      }
      if (g.fuse <= 0) {
        const center = g.mesh.position.clone();
        scene.remove(g.mesh);
        const blast = new THREE.Mesh(blastGeo, blastMat.clone());
        blast.position.copy(center);
        scene.add(blast);
        g.blast = blast;
        g.blastAge = 0;
        // Damage every living target in radius with a clear line from the blast.
        for (const target of damageTargets) {
          const dx = target.position.x - center.x;
          const dy = (target.position.y + 1.1) - center.y;
          const dz = target.position.z - center.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist > BLAST_RADIUS) continue;
          from.copy(center);
          to.set(target.position.x, target.position.y + 1.1, target.position.z);
          dir.copy(to).sub(from);
          const len = dir.length();
          if (len < 0.01) continue;
          dir.divideScalar(len);
          ray.set(from, dir);
          ray.far = len;
          const blocked = ray.intersectObjects(shootables, false)[0];
          if (blocked) continue;
          const amount = Math.round(BLAST_MAX * (1 - dist / BLAST_RADIUS) + 15);
          target.hurt(amount, null, 'grenade');
        }
      }
    }
  }

  function clear() {
    for (const g of items) {
      scene.remove(g.mesh);
      if (g.blast) scene.remove(g.blast);
    }
    items.length = 0;
  }

  return { throwGrenade, step, clear, active: items };
}
