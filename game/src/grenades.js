// Grenades: a plasma charge and an ion veil, both thrown with an arc. The charge
// bounces once, then a timed blast that hurts through a radius with falloff,
// blocked by walls. The veil pops on landing into a violet cloud that lives ~12 s:
// it blocks line of sight for every bot on both teams (vision checks ask
// blocksVision), so a push can cross an open lane unseen, but bullets still fly
// through it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FUSE = 1.6;
const BLAST_RADIUS = 7;
const BLAST_MAX = 95;
const GRAVITY = 14;
const SMOKE_FUSE = 1.1;
const SMOKE_LIFE = 12;
const SMOKE_RADIUS = 2.6;
const SMOKE_PUFFS = 7;

export function createGrenades(scene, colliders, shootables) {
  const items = [];
  const clouds = [];
  const ray = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const seg = new THREE.Vector3();

  const shellGeo = new THREE.SphereGeometry(0.09, 10, 8);
  // Plasma charge: a cyan orb with its own glow. Ion veil: a violet canister.
  const shellMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3 });
  const veilShellMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.violet), emissive: new THREE.Color(PALETTE.violet), emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.3 });
  const smokeGeo = new THREE.SphereGeometry(1, 12, 9);
  const smokeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8b5cf6), transparent: true, opacity: 0.4, depthWrite: false });
  const blastGeo = new THREE.SphereGeometry(1, 20, 14);
  const blastMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9be8ff), transparent: true, opacity: 0.55, depthWrite: false });

  function throwShell(origin, direction, speed, fuse, kind) {
    const mesh = new THREE.Mesh(shellGeo, kind === 'smoke' ? veilShellMat : shellMat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    items.push({
      mesh,
      velocity: direction.clone().multiplyScalar(speed).add(new THREE.Vector3(0, 4.5, 0)),
      fuse,
      bounced: false,
      blast: null,
      blastAge: 0,
      kind,
    });
  }

  function throwGrenade(origin, direction, speed = 11) {
    throwShell(origin, direction, speed, FUSE, 'frag');
  }

  function throwSmoke(origin, direction, speed = 10) {
    throwShell(origin, direction, speed, SMOKE_FUSE, 'smoke');
  }

  // An ion veil: a cluster of soft violet puffs around a centre, swelling in the
  // first second, drifting up slowly, fading out over its last three seconds.
  function deploySmoke(center) {
    const puffs = [];
    for (let i = 0; i < SMOKE_PUFFS; i += 1) {
      const puff = new THREE.Mesh(smokeGeo, smokeMat.clone());
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * SMOKE_RADIUS * 0.55;
      puff.position.set(
        center.x + Math.cos(a) * r,
        Math.max(0.5, center.y + 0.9 + (Math.random() - 0.5) * 1.2),
        center.z + Math.sin(a) * r,
      );
      puff.scale.setScalar(0.7 + Math.random() * 0.5);
      puff.userData.grow = 0.9 + Math.random() * 0.4;
      puff.userData.drift = 0.12 + Math.random() * 0.15;
      scene.add(puff);
      puffs.push(puff);
    }
    clouds.push({ center: center.clone(), puffs, age: 0, life: SMOKE_LIFE });
  }

  // True when a smoke cloud sits between two points: the closest approach of the
  // segment to the cloud centre is inside its radius. Clouds younger than half a
  // second are still popping, and dying clouds no longer hide anyone. Plain
  // arithmetic only — this runs on every bot vision scan, so it allocates nothing.
  function blocksVision(a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const lenSq = abx * abx + aby * aby + abz * abz;
    if (lenSq < 0.0001) return false;
    for (const cloud of clouds) {
      if (cloud.age < 0.5 || cloud.age > cloud.life - 0.5) continue;
      const acx = cloud.center.x - a.x;
      const acy = cloud.center.y - a.y;
      const acz = cloud.center.z - a.z;
      let t = (acx * abx + acy * aby + acz * abz) / lenSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = acx - abx * t;
      const dy = acy - aby * t;
      const dz = acz - abz * t;
      if (dx * dx + dy * dy + dz * dz < SMOKE_RADIUS * SMOKE_RADIUS) return true;
    }
    return false;
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
        if (g.kind === 'smoke') {
          deploySmoke(center);
          items.splice(i, 1);
          continue;
        }
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
    for (let i = clouds.length - 1; i >= 0; i -= 1) {
      const cloud = clouds[i];
      cloud.age += dt;
      const fade = cloud.age > cloud.life - 3 ? Math.max(0, (cloud.life - cloud.age) / 3) : 1;
      const grow = Math.min(1, cloud.age / 1.2);
      for (const puff of cloud.puffs) {
        puff.scale.setScalar(puff.userData.grow * (0.55 + 0.45 * grow));
        puff.position.y += puff.userData.drift * dt;
        puff.material.opacity = 0.4 * fade;
      }
      if (cloud.age >= cloud.life) {
        for (const puff of cloud.puffs) scene.remove(puff);
        clouds.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const g of items) {
      scene.remove(g.mesh);
      if (g.blast) scene.remove(g.blast);
    }
    items.length = 0;
    for (const cloud of clouds) {
      for (const puff of cloud.puffs) scene.remove(puff);
    }
    clouds.length = 0;
  }

  return { throwGrenade, throwSmoke, blocksVision, step, clear, active: items, clouds };
}
