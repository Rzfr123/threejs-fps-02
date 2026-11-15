// The objective: a void charge the attackers carry, plant on a site, and the
// defenders defuse. Plant takes 3 s holding E inside a site zone; defuse takes
// 5 s holding E at the charge. Once planted the charge ticks for 35 s and beeps
// faster as it runs down; the round ends on detonation (attackers win), on a
// defuse (defenders win), or on elimination.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './world.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const BOMB_TIMER = 35;

export function createBomb(scene) {
  const group = new THREE.Group();
  // Angular dark casing, a magenta void core that burns through the casing, and
  // three small status lights along the edge.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.5, metalness: 0.6 }),
  );
  body.castShadow = true;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal) }),
  );
  light.position.set(0, 0.12, 0);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  for (const lx of [-0.11, 0, 0.11]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), lampMat);
    lamp.position.set(lx, 0.11, 0.1);
    group.add(lamp);
  }
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const state = {
    status: 'carried', // carried | planted | exploded | defused
    site: null,
    position: new THREE.Vector3(),
    timer: BOMB_TIMER,
    plantProgress: 0,
    defuseProgress: 0,
    beepAt: 0,
  };

  function siteAt(x, z) {
    for (const [name, site] of Object.entries(SITES)) {
      if (x >= site.minX && x <= site.maxX && z >= site.minZ && z <= site.maxZ) return name;
    }
    return null;
  }

  return {
    state,
    siteAt,
    reset() {
      state.status = 'carried';
      state.site = null;
      state.timer = BOMB_TIMER;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      group.visible = false;
    },
    plantAt(siteName) {
      state.status = 'planted';
      state.site = siteName;
      const site = SITES[siteName];
      state.position.set(site.cx, 0.1, site.cz);
      state.timer = BOMB_TIMER;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      group.position.copy(state.position);
      group.visible = true;
    },
    step(dt, now, onBeep) {
      if (state.status !== 'planted') return;
      state.timer -= dt;
      const interval = state.timer > 20 ? 1 : state.timer > 10 ? 0.5 : 0.25;
      if (now >= state.beepAt) {
        state.beepAt = now + interval;
        light.material.color.setHex(state.timer <= 10 ? 0xff3b30 : 0xf472b6);
        if (onBeep) onBeep(state.timer);
      }
    },
    explode() {
      state.status = 'exploded';
      group.visible = false;
    },
    defuse() {
      state.status = 'defused';
      group.visible = false;
    },
  };
}
