// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. main.js owns the match: rounds, the player's shooting and damage, planting and
// defusing, the buy menu, grenades and the kill feed. The modules own their own jobs:
// world builds the map, bots think, weapon reloads, bomb ticks, rounds count.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SPAWNS, ZONES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE_PRICE, SMOKE_PRICE, ARMOR_PRICE, KIT_PRICE } from './weapon.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createBomb, PLANT_TIME, DEFUSE_TIME } from './bomb.js';
import { createRounds, BUY_TIME } from './rounds.js';
import { createEconomy, KILL_REWARD, PLANT_REWARD } from './economy.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const PLAYER_HEALTH = 100;
const ARMOR_ABSORB = 0.5;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 24, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world, random);
const weapon = createWeapon(camera);
const grenades = createGrenades(scene, world.colliders, world.shootables);
const bomb = createBomb(scene);
const rounds = createRounds();
const economy = createEconomy();
const hud = createHud();
const audio = createAudio();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();

// The player's own hitboxes, so bot bullets can hit the player. They render nothing
// (colour writing off) but raycast like any other mesh.
const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), hitMat);
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), hitMat);
playerTorso.userData.isPlayer = true;
playerTorso.userData.part = 'torso';
playerHead.userData.isPlayer = true;
playerHead.userData.part = 'head';
scene.add(playerTorso, playerHead);
const shootables = world.shootables.concat(bots.hitMeshes, [playerTorso, playerHead]);

// Tracer pool for the player's own shots.
const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const playerTracers = [];
for (let i = 0; i < 8; i += 1) {
  const line = new THREE.Line(
    tracerGeo.clone(),
    new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  playerTracers.push({ line, life: 0 });
}
let playerTracerIndex = 0;
const tracerEnd = new THREE.Vector3();
function playerTracer(from, to) {
  const slot = playerTracers[playerTracerIndex];
  playerTracerIndex = (playerTracerIndex + 1) % playerTracers.length;
  const attr = slot.line.geometry.getAttribute('position');
  attr.setXYZ(0, from.x, from.y, from.z);
  attr.setXYZ(1, to.x, to.y, to.z);
  attr.needsUpdate = true;
  slot.line.visible = true;
  slot.line.material.opacity = 0.8;
  slot.life = 0.07;
}

const body = player.state;
const playerState = { health: PLAYER_HEALTH, alive: true, kills: 0, deaths: 0 };
let elapsed = 0;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;
let plantProgress = 0;
let defuseProgress = 0;
let roundChecked = false;
let lastMinimapAt = -1;

// Grenade targets: the player and every bot, by reference, so a blast that lands
// between them hurts both sides. Built once per round; positions are live references.
let grenadeTargets = [];
function rebuildGrenadeTargets() {
  grenadeTargets = [{
    position: body.position,
    hurt: (amount) => damagePlayer(amount, null),
  }];
  for (const bot of bots.bots) {
    grenadeTargets.push({
      position: bot.position,
      hurt: (amount) => botHurt(bot, amount, null, 'grenade'),
    });
  }
}

// Named zones, shown in the HUD as the player moves through the yard.
function zoneName(x, z) {
  for (const zone of ZONES) {
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) return zone.name;
  }
  return 'SILO YARD';
}

// Radio: one callout line at a time, at most one every 1.2 s, so the feed never floods.
let lastRadioAt = 0;
function radio(bot, text) {
  if (elapsed - lastRadioAt < 1.2) return;
  lastRadioAt = elapsed;
  hud.radio(`${bot.name}: ${text}`);
}

// The context bots read every step. Every field is a live reference or a function,
// so the object itself is built once and never re-allocated.
const botCtx = {
  get live() { return rounds.state.phase === 'live'; },
  get playerAlive() { return playerState.alive; },
  get playerPos() { return body.position; },
  get bombPlanted() { return bomb.state.status === 'planted'; },
  get bombStatus() { return bomb.state.status; },
  get bombSite() { return bomb.state.site; },
  get bombPos() { return bomb.state.position; },
  shootables,
  zoneName,
  smokeBlocks(from, point) { return grenades.blocksVision(from, point); },
  throwSmoke(from, direction) { grenades.throwSmoke(from, direction); },
  onRadio(bot, text) { radio(bot, text); },
  onShotFired(bot, eye) { audio.enemyShot(); },
  onBotHit(victim, amount, attacker, part) { botHurt(victim, amount, attacker, part); },
  onPlayerHit(amount, attacker) { damagePlayer(amount, attacker); },
  onPlant(bot) {
    bomb.plantAt(bot.route[bot.route.length - 1] === 'aSite' ? 'A' : 'B');
    radio(bot, `Charge down on ${bomb.state.site} — hold the site`);
    hud.setBomb(`BOMB PLANTED — ${bomb.state.site} SITE`);
    hud.roundMessage('Bomb planted on site ' + bomb.state.site);
    audio.plant();
  },
  onDefuse(bot) {
    bomb.defuse();
    endRound('defend', 'Bomb defused — Vultures hold the yard.');
  },
};

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  playerTorso.position.set(body.position.x, body.position.y + 1.05, body.position.z);
  playerHead.position.set(body.position.x, body.position.y + 1.58, body.position.z);
  playerTorso.visible = playerState.alive;
  playerHead.visible = playerState.alive;
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function damagePlayer(amount, attacker) {
  if (!playerState.alive) return;
  let rest = amount;
  if (weapon.state.armor > 0) {
    const absorbed = Math.min(weapon.state.armor, Math.round(amount * ARMOR_ABSORB));
    weapon.state.armor -= absorbed;
    rest = amount - absorbed;
  }
  playerState.health -= rest;
  audio.hurt();
  hud.setHealth(playerState.health, weapon.state.armor);
  if (playerState.health > 0) return;
  playerState.health = 0;
  playerState.alive = false;
  playerState.deaths += 1;
  hud.setHealth(0, weapon.state.armor);
  if (attacker) hud.killfeed(`${attacker.name} [VULTURES]`, 'You', 'body', 'VK-7');
  hud.roundMessage('You are down — your team fights on.');
  if (document.pointerLockElement) document.exitPointerLock();
}

function botHurt(bot, amount, attacker, part) {
  if (!bot.alive) return;
  const killed = bots.hurt(bot, amount, attacker, part);
  if (!killed) return;
  const killerName = attacker === null ? '💥 Grenade' : attacker === 'player' ? 'You' : attacker.name;
  const killerWeapon = attacker === 'player' ? weapon.config().name : 'VK-7';
  const cause = part === 'head' ? 'head' : part === 'grenade' ? 'grenade' : 'body';
  hud.killfeed(killerName, `${bot.name} [${bot.team === 'attack' ? 'SANDLINE' : 'VULTURES'}]`, cause, killerWeapon);
  if (bot.team === 'attack') {
    const zone = zoneName(bot.position.x, bot.position.z);
    radio({ name: 'SANDLINE' }, `${bot.name} is down at ${zone}`);
  }
  if (attacker === 'player') {
    playerState.kills += 1;
    economy.earn(KILL_REWARD);
    hud.setMoney(economy.money);
    hud.hitMarker(true, 140);
    audio.kill();
  }
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position).addScaledVector(direction, 0.6);
  muzzle.y -= 0.12;
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  tracerEnd.copy(camera.position).addScaledVector(direction, 50);
  if (hit) tracerEnd.copy(hit.point);
  playerTracer(muzzle, tracerEnd);
  if (hit && hit.object.userData.bot) {
    const victim = hit.object.userData.bot;
    const part = hit.object.userData.part;
    const dist = hit.distance;
    const amount = Math.round(weapon.damageAt(dist) * (part === 'head' ? 2.5 : 1));
    botHurt(victim, amount, 'player', part);
    if (victim.alive) {
      hud.hitMarker(false);
      audio.hit();
    }
  } else if (hit) {
    // A wall or crate eats the shot; the tracer already shows where it went.
  }
  bots.hear(camera.position);
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot();
  hud.setAmmo(weapon.ammo().mag, weapon.ammo().reserve, weapon.config().name);
  return true;
}

function throwGrenade() {
  if (weapon.state.grenades <= 0) return;
  weapon.state.grenades -= 1;
  camera.getWorldDirection(direction);
  const origin = camera.position.clone().addScaledVector(direction, 0.5);
  grenades.throwGrenade(origin, direction);
  hud.roundMessage(`Grenade out — ${weapon.state.grenades} left`);
  refreshLoadout();
}

function throwSmoke() {
  if (weapon.state.smokes <= 0) return;
  weapon.state.smokes -= 1;
  camera.getWorldDirection(direction);
  const origin = camera.position.clone().addScaledVector(direction, 0.5);
  grenades.throwSmoke(origin, direction);
  hud.roundMessage(`Smoke out — ${weapon.state.smokes} left`);
  refreshLoadout();
}

function refreshLoadout() {
  hud.setLoadout(weapon.state.current, weapon.owned, weapon.state.grenades, weapon.state.kit, weapon.state.smokes);
}

function buy(item) {
  if (rounds.state.phase !== 'buy') return;
  if (item === 'rifle' || item === 'smg') {
    if (weapon.owned[item]) return;
    if (!economy.spend(WEAPONS[item].price)) { audio.click(); return; }
    weapon.buy(item);
    weapon.switchTo(item);
    audio.click();
  } else if (item === 'grenade') {
    if (weapon.state.grenades >= 2) return;
    if (!economy.spend(GRENADE_PRICE)) { audio.click(); return; }
    weapon.state.grenades += 1;
    audio.click();
  } else if (item === 'smoke') {
    if (weapon.state.smokes >= 2) return;
    if (!economy.spend(SMOKE_PRICE)) { audio.click(); return; }
    weapon.state.smokes += 1;
    audio.click();
  } else if (item === 'armor') {
    if (weapon.state.armor >= 100) return;
    if (!economy.spend(ARMOR_PRICE)) { audio.click(); return; }
    weapon.state.armor = 100;
    audio.click();
  } else if (item === 'kit') {
    if (weapon.state.kit) return;
    if (!economy.spend(KIT_PRICE)) { audio.click(); return; }
    weapon.state.kit = true;
    audio.click();
  }
  hud.setMoney(economy.money);
  hud.setAmmo(weapon.ammo().mag, weapon.ammo().reserve, weapon.config().name);
  hud.setHealth(playerState.health, weapon.state.armor);
  refreshLoadout();
  hud.setBuyOpen(buyOpen, weapon.owned);
}

function setBuyOpen(open) {
  if (rounds.state.phase !== 'buy' && open) return;
  buyOpen = open;
  hud.setBuyOpen(open, weapon.owned);
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (started && rounds.state.phase !== 'matchEnd') {
    input.requestLock();
  }
}

function startMatch() {
  rounds.reset();
  economy.reset();
  playerState.kills = 0;
  playerState.deaths = 0;
  weapon.state.kit = false;
  weapon.refillReserve();
  weapon.switchTo('pistol');
  refreshLoadout();
  startRound();
}

function startRound() {
  rounds.startRound();
  bomb.reset();
  grenades.clear();
  const planterRoute = bots.spawnRound(rounds.state.round);
  const planter = bots.bots.find((b) => b.isPlanter);
  if (planter) {
    const lines = [
      (site) => `go go, executing ${site}`,
      (site) => `Stacking up on ${site} — on me`,
      (site) => `Hitting ${site} hard — smoke and go`,
      (site) => `${site} push, right now — move`,
    ];
    radio(planter, lines[Math.floor(random() * lines.length)](planterRoute));
  }
  rebuildGrenadeTargets();
  const [x, z] = SPAWNS.attack[0];
  body.position.set(x, 0, z);
  body.velocity.set(0, 0, 0);
  body.yaw = Math.PI;
  body.pitch = 0;
  playerState.health = PLAYER_HEALTH;
  playerState.alive = true;
  weapon.state.armor = 0;
  weapon.refillReserve();
  plantProgress = 0;
  defuseProgress = 0;
  roundChecked = false;
  hud.setHealth(playerState.health, 0);
  hud.setMoney(economy.money);
  hud.setAmmo(weapon.ammo().mag, weapon.ammo().reserve, weapon.config().name);
  hud.setBomb('');
  hud.setProgress(null, 0);
  hud.setScore(rounds.state.scoreAttack, rounds.state.scoreDefend, rounds.state.round);
  hud.setTimer(BUY_TIME);
  hud.setAlive(bots.aliveCount('attack'), bots.aliveCount('defend'));
  document.getElementById('buy-round').textContent = String(rounds.state.round);
  hud.roundMessage(`Round ${rounds.state.round} — buy phase, press B`);
}

function endRound(winner, reason) {
  if (rounds.state.phase !== 'live' && rounds.state.phase !== 'buy') return;
  const playerWon = winner === 'attack';
  rounds.endRound(winner, reason);
  economy.roundEnd(playerWon);
  hud.setMoney(economy.money);
  hud.setScore(rounds.state.scoreAttack, rounds.state.scoreDefend, rounds.state.round);
  hud.setBomb('');
  hud.setProgress(null, 0);
  hud.roundMessage(`${playerWon ? 'Round won' : 'Round lost'} — ${reason}`, 3800);
  if (playerWon) audio.roundWin();
  if (document.pointerLockElement) document.exitPointerLock();
  setBuyOpen(false);
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const atkAlive = bots.aliveCount('attack') + (playerState.alive ? 1 : 0);
  const defAlive = bots.aliveCount('defend');
  const planted = bomb.state.status === 'planted';
  if (atkAlive === 0 && !planted) {
    endRound('defend', 'SANDLINE wiped out.');
  } else if (defAlive === 0 && !planted) {
    endRound('attack', 'Vultures wiped out.');
  } else if (defAlive === 0 && planted) {
    endRound('attack', 'No one left to defuse.');
  }
}

function explodeBomb() {
  bomb.explode();
  audio.explode();
  const center = bomb.state.position;
  for (const target of grenadeTargets) {
    const dx = target.position.x - center.x;
    const dy = (target.position.y + 1.1) - center.y;
    const dz = target.position.z - center.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 12) target.hurt(Math.round(120 * (1 - dist / 12) + 20));
  }
  endRound('attack', 'The charge detonated.');
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    if (buyOpen) setBuyOpen(false);
  } else if (rounds.state.phase === 'matchEnd') {
    // Overlay is shown by the match-end handler.
  } else if (!buyOpen) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'matchEnd') {
    startMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  input.requestLock();
});
hud.onBuy((item) => buy(item));

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;

  // The round clock only ticks while a match is running.
  if (phase !== 'matchEnd') {
    const transition = rounds.step(dt);
    if (transition === 'live') {
      hud.roundMessage('Go go go — plant the charge on A or B');
      setBuyOpen(false);
    } else if (transition === 'next') {
      if (rounds.nextRound()) startRound();
      else {
        const atk = rounds.state.scoreAttack;
        const def = rounds.state.scoreDefend;
        const won = atk > def;
        hud.showEndOverlay(
          won ? 'YARD TAKEN' : atk === def ? 'DRAW' : 'YARD LOST',
          `Final score SANDLINE ${atk} : ${def} VULTURES. ${playerState.kills} eliminations, ${playerState.deaths} deaths.`,
          'Play again',
        );
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
  }

  if (phase === 'live' || rounds.state.phase === 'live') {
    if (playerState.alive) player.step(dt, input.state.keys);
    weapon.step(dt);
    // Plant / defuse channels: hold E inside the zone or at the bomb.
    if (playerState.alive && input.state.keys.has('KeyE')) {
      const site = bomb.siteAt(body.position.x, body.position.z);
      if (bomb.state.status === 'carried' && site) {
        plantProgress += dt;
        hud.setProgress(`Planting on ${site}…`, plantProgress / PLANT_TIME);
        if (plantProgress >= PLANT_TIME) {
          bomb.plantAt(site);
          economy.earn(PLANT_REWARD);
          hud.setMoney(economy.money);
          hud.setBomb(`BOMB PLANTED — ${site} SITE`);
          hud.roundMessage('Bomb planted — hold the site');
          audio.plant();
          plantProgress = 0;
          hud.setProgress(null, 0);
        }
      } else if (bomb.state.status === 'planted') {
        const d = Math.hypot(body.position.x - bomb.state.position.x, body.position.z - bomb.state.position.z);
        if (d < 1.8) {
          const defuseTime = weapon.state.kit ? DEFUSE_TIME / 2 : DEFUSE_TIME;
          defuseProgress += dt;
          hud.setProgress(weapon.state.kit ? 'Defusing (kit)…' : 'Defusing…', defuseProgress / defuseTime);
          if (defuseProgress >= defuseTime) {
            bomb.defuse();
            defuseProgress = 0;
            hud.setProgress(null, 0);
            endRound('defend', 'Bomb defused — Vultures hold the yard.');
          }
        } else {
          defuseProgress = 0;
          hud.setProgress(null, 0);
        }
      } else {
        plantProgress = 0;
        hud.setProgress(null, 0);
      }
    } else {
      plantProgress = 0;
      defuseProgress = 0;
      hud.setProgress(null, 0);
    }
    bomb.step(dt, elapsed, (timer) => audio.beep(timer <= 10));
    if (bomb.state.status === 'planted' && bomb.state.timer <= 0) explodeBomb();
    grenades.step(dt, grenadeTargets);
    checkRoundEnd();
  }

  bots.step(dt, botCtx, elapsed);
  for (const slot of playerTracers) {
    if (slot.life <= 0) continue;
    slot.life -= dt;
    if (slot.life <= 0) slot.line.visible = false;
    else slot.line.material.opacity = slot.life * 11;
  }

  // HUD readouts, every step (the setters only touch the DOM when a value changes).
  hud.setTimer(rounds.state.timer);
  hud.setAlive(bots.aliveCount('attack') + (playerState.alive ? 1 : 0), bots.aliveCount('defend'));
  hud.setSpread(weapon.spread(player.groundSpeed()));
  hud.setLocation(zoneName(body.position.x, body.position.z));
  if (elapsed - lastMinimapAt >= 0.15) {
    lastMinimapAt = elapsed;
    hud.drawMinimap(body.position, body.yaw, bots.bots, bomb.state);
  }
  if (bomb.state.status === 'planted') {
    hud.setBomb(`BOMB PLANTED — ${bomb.state.site} SITE · ${Math.ceil(bomb.state.timer)}s`);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (input.takePress('KeyB')) setBuyOpen(!buyOpen);
    if (buyOpen) {
      if (input.takePress('Digit2')) buy('rifle');
      if (input.takePress('Digit3')) buy('smg');
      if (input.takePress('Digit4')) buy('grenade');
      if (input.takePress('Digit5')) buy('armor');
      if (input.takePress('Digit6')) buy('kit');
      if (input.takePress('Digit7')) buy('smoke');
    } else {
      if (input.takePress('Digit1')) { weapon.switchTo('pistol'); refreshLoadout(); }
      if (input.takePress('Digit2')) { weapon.switchTo('rifle'); refreshLoadout(); }
      if (input.takePress('Digit3')) { weapon.switchTo('smg'); refreshLoadout(); }
      if (input.takePress('KeyG')) throwGrenade();
      if (input.takePress('KeyQ')) throwSmoke();
    }
    if (input.state.locked && playerState.alive && rounds.state.phase === 'live') {
      if (input.state.firing && weapon.ready()) shoot(weapon.spread(player.groundSpeed()));
      if (input.state.keys.has('KeyR')) weapon.reload();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  startMatch();
  body.pitch = 0;
  if (name === 'start') {
    body.position.set(0, 0, 12);
    body.yaw = Math.PI;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -8));
    hud.showOverlay('start');
  } else if (name === 'play') {
    rounds.startLive();
    weapon.buy('rifle');
    weapon.switchTo('rifle');
    refreshLoadout();
    body.position.set(0, 0, 6);
    body.yaw = Math.PI;
    settle(30);
    // Walk two defenders into the open gantry ground south of the mill hall, so the
    // frame reads as a firefight: both in the clear, name tags readable, the hall
    // behind them for depth. They stand close enough that both fit one frame.
    const defenders = bots.bots.filter((b) => b.team === 'defend');
    defenders[0].position.set(-2.6, 0, 3.6);
    defenders[1].position.set(-0.6, 0, 3.0);
    defenders[0].yaw = Math.PI;
    defenders[1].yaw = Math.PI;
    defenders[0].group.rotation.y = Math.PI;
    defenders[1].group.rotation.y = Math.PI;
    settle(10);
    // A support bot's smoke pops left of the defenders, so the cover shows the
    // new utility in play: a grey cloud at the frame's edge, defenders visible
    // beside it, muzzle flash and tracer cutting across. The long settle lets
    // the cloud fully swell (fuse 1.1 s + ~1.4 s of growth) before the frame.
    weapon.state.smokes = 1;
    refreshLoadout();
    grenades.throwSmoke(
      new THREE.Vector3(-3.0, 1.6, 5.0),
      new THREE.Vector3(0.1, 0.2, -1).normalize(),
      3.5,
    );
    settle(150);
    aimAt(new THREE.Vector3(-2.6, 1.2, 3.6));
    shoot(0);
    settle(12);
    aimAt(new THREE.Vector3(-0.6, 1.2, 3.0));
    shoot(0);
    settle(1);
    // The staged frame is a hero shot, not a damage report: restore full health.
    playerState.health = PLAYER_HEALTH;
    hud.setHealth(playerState.health, weapon.state.armor);
    hud.radio(`${defenders[0].name}: Contact at Mill Hall — two at the gantry`);
  } else {
    rounds.state.scoreAttack = 5;
    rounds.state.scoreDefend = 3;
    rounds.state.phase = 'matchEnd';
    body.position.set(-10, 0, 2);
    body.yaw = Math.PI * 0.75;
    settle(20);
    hud.showEndOverlay(
      'YARD TAKEN',
      'Final score SANDLINE 5 : 3 VULTURES. 7 eliminations, 2 deaths.',
      'Play again',
    );
  }
  hud.setScore(rounds.state.scoreAttack, rounds.state.scoreDefend, rounds.state.round);
  hud.setAmmo(weapon.ammo().mag, weapon.ammo().reserve, weapon.config().name);
  hud.setHealth(playerState.health, weapon.state.armor);
  hud.setMoney(economy.money);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setMinimapWalls(world.minimapWalls);
hud.setHealth(playerState.health, 0);
hud.setMoney(economy.money);
hud.setAmmo(weapon.ammo().mag, weapon.ammo().reserve, weapon.config().name);
hud.setScore(0, 0, 1);
refreshLoadout();
startMatch();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
