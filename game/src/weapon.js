// The armoury: three hitscan guns, one job each in the table. The player starts with the
// pistol; the rifle and SMG are bought in the buy menu. main.js owns the ray and the
// damage; this module owns the numbers, the view models and the reload cycle.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// mag, reserve, gap between shots, reload seconds, damage at the muzzle, damage past
// 30 m, spread standing still, spread while moving, auto fire, price in the buy menu.
export const WEAPONS = {
  pistol: { name: 'P9 sidearm', mag: 12, reserve: 48, gap: 0.16, reload: 1.4, dmg: 34, dmgFar: 22, spreadStill: 0.004, spreadMove: 0.03, auto: false, price: 0, key: 'Digit1' },
  rifle: { name: 'VK-7 rifle', mag: 30, reserve: 90, gap: 0.096, reload: 2.2, dmg: 34, dmgFar: 26, spreadStill: 0.0022, spreadMove: 0.028, auto: true, price: 2700, key: 'Digit2' },
  smg: { name: 'RAT-9 SMG', mag: 28, reserve: 112, gap: 0.068, reload: 1.8, dmg: 24, dmgFar: 16, spreadStill: 0.006, spreadMove: 0.034, auto: true, price: 1500, key: 'Digit3' },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const KIT_PRICE = 400;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });

  // One view model per gun, all parented to the camera; only the current one shows.
  const models = {};
  function buildPistol() {
    const g = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.3), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.08), grip);
    handle.position.set(0, -0.09, 0.1);
    g.add(slide, handle);
    return g;
  }
  function buildRifle() {
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.08), dark);
    sight.position.set(0, 0.08, -0.05);
    g.add(receiver, barrel, stock, sight);
    return g;
  }
  function buildSmg() {
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), grip);
    barrel.position.set(0, 0.02, -0.27);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
    mag.position.set(0, -0.11, -0.05);
    g.add(receiver, barrel, mag);
    return g;
  }
  models.pistol = buildPistol();
  models.rifle = buildRifle();
  models.smg = buildSmg();
  for (const model of Object.values(models)) {
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
  }

  // Muzzle flash: a small radial-gradient sprite at the barrel tip, additive so it
  // blooms instead of drawing a hard quad.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const fctx = flashCanvas.getContext('2d');
  const gradient = fctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,240,200,1)');
  gradient.addColorStop(0.4, 'rgba(240,168,48,0.9)');
  gradient.addColorStop(1, 'rgba(240,168,48,0)');
  fctx.fillStyle = gradient;
  fctx.fillRect(0, 0, 64, 64);
  const flashTexture = new THREE.CanvasTexture(flashCanvas);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flashTexture, transparent: true, opacity: 0.95, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  flash.scale.set(0.3, 0.3, 1);
  flash.position.set(0.24, -0.15, -0.85);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  const state = { current: 'pistol', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0, armor: 0, kit: false };
  models.pistol.visible = true;

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.material.opacity = state.flash > 0 ? 0.95 : 0;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (WEAPONS[state.current].reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const cfg = WEAPONS[state.current];
        const slot = owned[state.current];
        const take = Math.min(cfg.mag - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    config() { return WEAPONS[state.current]; },
    ammo() { return owned[state.current]; },
    step,
    ready() {
      return owned[state.current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPONS[state.current].gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (owned[state.current].mag <= 0) return false;
      owned[state.current].mag -= 1;
      return true;
    },
    reload() {
      const cfg = WEAPONS[state.current];
      const slot = owned[state.current];
      if (state.reloadLeft > 0 || slot.mag === cfg.mag || slot.reserve === 0) return;
      state.reloadLeft = cfg.reload;
    },
    spread(speed) {
      const cfg = WEAPONS[state.current];
      return cfg.spreadStill + Math.min(1, speed / 5.2) * cfg.spreadMove;
    },
    damageAt(distance) {
      const cfg = WEAPONS[state.current];
      if (distance <= 12) return cfg.dmg;
      if (distance >= 30) return cfg.dmgFar;
      return cfg.dmg + (cfg.dmgFar - cfg.dmg) * ((distance - 12) / 18);
    },
    switchTo(id) {
      if (!owned[id] || id === state.current) return false;
      state.reloadLeft = 0;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      return true;
    },
    buy(id) {
      if (owned[id]) return false;
      owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return true;
    },
    refillReserve() {
      for (const id of Object.keys(owned)) {
        owned[id].mag = WEAPONS[id].mag;
        owned[id].reserve = WEAPONS[id].reserve;
      }
      state.reloadLeft = 0;
      state.cooldown = 0;
    },
  };
}
