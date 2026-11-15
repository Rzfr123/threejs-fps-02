// The armoury: four hitscan guns, one job each in the table. The player starts with
// the LX-9 sidearm; the plasma rifle, pulse SMG and railgun are bought in the buy
// menu. main.js owns the ray and the damage; this module owns the numbers, the
// view models and the reload cycle. Every gun has its own flash colour, tracer
// colour and synth voice, so each one reads and sounds different in a fight.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// mag, reserve, gap between shots, reload seconds, damage at the muzzle, damage past
// 30 m, spread standing still, spread while moving, auto fire, price in the buy menu,
// muzzle flash colour, tracer colour, synth voice id.
export const WEAPONS = {
  pistol: { name: 'LX-9 sidearm', mag: 12, reserve: 48, gap: 0.16, reload: 1.4, dmg: 34, dmgFar: 22, spreadStill: 0.004, spreadMove: 0.03, auto: false, price: 0, key: 'Digit1', flash: 0x9be8ff, tracer: 0x67e8f9, sound: 'sidearm' },
  rifle: { name: 'VX-7 plasma rifle', mag: 30, reserve: 90, gap: 0.096, reload: 2.2, dmg: 34, dmgFar: 26, spreadStill: 0.0022, spreadMove: 0.028, auto: true, price: 2700, key: 'Digit2', flash: 0x22d3ee, tracer: 0x22d3ee, sound: 'plasma' },
  smg: { name: 'PX-9 pulse SMG', mag: 28, reserve: 112, gap: 0.068, reload: 1.8, dmg: 24, dmgFar: 16, spreadStill: 0.006, spreadMove: 0.034, auto: true, price: 1500, key: 'Digit3', flash: 0xa78bfa, tracer: 0xa78bfa, sound: 'pulse' },
  railgun: { name: 'RG-1 railgun', mag: 5, reserve: 15, gap: 1.15, reload: 3.0, dmg: 95, dmgFar: 90, spreadStill: 0.0008, spreadMove: 0.05, auto: false, price: 4100, key: 'Digit4', flash: 0xf472b6, tracer: 0xf472b6, sound: 'railgun' },
};
export const GRENADE_PRICE = 300;
export const SMOKE_PRICE = 400;
export const ARMOR_PRICE = 650;
export const KIT_PRICE = 400;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });
  // Glow cells: unlit, so the gun's energy reads even in the dark deck.
  const glowCyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x22d3ee) });
  const glowViolet = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa78bfa) });
  const glowMagenta = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf472b6) });
  const glowIce = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9be8ff) });

  // One view model per gun, all parented to the camera; only the current one shows.
  const models = {};
  function buildPistol() {
    // LX-9 laser sidearm: angular slide, a glowing cell on the flank, stub barrel.
    const g = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.3), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.08), grip);
    handle.position.set(0, -0.09, 0.1);
    handle.rotation.x = 0.18;
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.03, 0.12), glowIce);
    cell.position.set(0, 0.01, 0.02);
    const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.06), dark);
    emitter.position.set(0, 0.01, -0.17);
    g.add(slide, handle, cell, emitter);
    return g;
  }
  function buildRifle() {
    // VX-7 plasma rifle: receiver, three coil rings around a glowing core rod.
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 8), glowCyan);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0.025, -0.36);
    g.add(receiver, barrel, stock, core);
    for (const z of [-0.22, -0.36, -0.5]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16), dark);
      ring.position.set(0, 0.025, z);
      g.add(ring);
    }
    return g;
  }
  function buildSmg() {
    // PX-9 pulse SMG: compact receiver, twin glowing pulse cells, short barrel.
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.34), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), grip);
    barrel.position.set(0, 0.02, -0.27);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
    mag.position.set(0, -0.11, -0.05);
    const cellL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.2), glowViolet);
    cellL.position.set(-0.045, 0.02, -0.1);
    const cellR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.2), glowViolet);
    cellR.position.set(0.045, 0.02, -0.1);
    g.add(receiver, barrel, mag, cellL, cellR);
    return g;
  }
  function buildRailgun() {
    // RG-1 railgun: long twin rails, a charge coil that burns bright the moment
    // the 1.15 s cycle ends, heavy stock. One shot, one kill through armour.
    const g = new THREE.Group();
    const railT = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.62), body);
    railT.position.set(-0.035, 0.03, -0.42);
    const railB = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.62), body);
    railB.position.set(0.035, -0.03, -0.42);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.4), dark);
    spine.position.set(0, 0, -0.05);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.24), grip);
    stock.position.set(0, -0.02, 0.28);
    const coilMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf472b6), transparent: true, opacity: 1 });
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 8, 18), coilMat);
    coil.position.set(0, 0, -0.18);
    g.add(railT, railB, spine, stock, coil);
    g.userData.coilMat = coilMat;
    return g;
  }
  models.pistol = buildPistol();
  models.rifle = buildRifle();
  models.smg = buildSmg();
  models.railgun = buildRailgun();
  for (const model of Object.values(models)) {
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
  }

  // Muzzle flash: a white radial-gradient sprite at the barrel tip, additive so it
  // blooms instead of drawing a hard quad. The sprite and its light are tinted to
  // the current gun's flash colour whenever the player switches weapons.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  const fctx = flashCanvas.getContext('2d');
  const gradient = fctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
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
  const state = { current: 'pistol', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0, smokes: 0, armor: 0, kit: false };
  models.pistol.visible = true;

  function applyWeaponFx() {
    const cfg = WEAPONS[state.current];
    flash.material.color.setHex(cfg.flash);
    flashLight.color.setHex(cfg.flash);
  }
  applyWeaponFx();

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
    // The railgun's charge coil burns bright the instant the cycle ends, so the
    // player can feel the next shot coming without looking at the ammo counter.
    if (state.current === 'railgun' && model.userData.coilMat) {
      model.userData.coilMat.opacity = state.cooldown === 0 ? 1 : 0.22;
    }
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
      applyWeaponFx();
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
