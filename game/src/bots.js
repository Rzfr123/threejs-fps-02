// The bots: nine of them, four teammates and five opponents, all running the same brain.
// A bot walks a waypoint route to a site or a hold point, scans for enemies with a real
// line-of-sight ray, and when it sees one it stops, aims with a reaction delay and fires
// bursts with spread, like the player. It hears nearby gunfire and investigates it, it
// plants the bomb when it reaches a site, and it walks to a planted bomb to defuse it.
// One job per function, no objects made in the hot loop: vectors and the ray are reused.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, EDGES, ATTACK_ROUTES, DEFEND_HOLDS, SPAWNS } from './world.js';
import { createMover } from './player.js';

const BOT_SPEED = 3.6;
const BOT_HEALTH = 100;
const VISION_RANGE = 42;
const VISION_HALF_FOV = 1.15;
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.75;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.13;
const BURST_COOLDOWN = 0.85;
const BOT_SPREAD = 0.035;
const BOT_DMG = 24;
const BOT_HEAD_MULT = 2.5;

const NAMES = ['Dune', 'Vex', 'Sable', 'Rook', 'Fennec', 'Mira', 'Jolt', 'Pike', 'Nadir', 'Onyx'];

// Breadth-first path over the waypoint graph, from the node nearest `from` to `to`.
export function findPath(from, to) {
  let start = null;
  let best = Infinity;
  for (const [id, [x, z]] of Object.entries(WAYPOINTS)) {
    const d = (x - from.x) ** 2 + (z - from.z) ** 2;
    if (d < best) { best = d; start = id; }
  }
  if (start === to) return [to];
  const prev = { [start]: null };
  const queue = [start];
  while (queue.length) {
    const node = queue.shift();
    for (const next of EDGES[node] ?? []) {
      if (prev[next] !== undefined) continue;
      prev[next] = node;
      if (next === to) {
        const path = [to];
        let at = node;
        while (at !== null) { path.unshift(at); at = prev[at]; }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

export function createBots(scene, world, random) {
  const mover = createMover(world.colliders, 0.36);
  const ray = new THREE.Raycaster();
  ray.far = 60;
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tmpEnd = new THREE.Vector3();

  const teamMat = {
    attack: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.7 }),
    defend: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.7 }),
  };
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 14, 10);
  const legGeo = new THREE.BoxGeometry(0.42, 0.55, 0.26);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  // Tracer pool: fading lines from a muzzle to a hit point, reused, never allocated per shot.
  const tracers = [];
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  for (let i = 0; i < 24; i += 1) {
    const line = new THREE.Line(
      tracerGeo.clone(),
      new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
    );
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;
  function tracer(from, to) {
    const slot = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const attr = slot.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    slot.line.visible = true;
    slot.line.material.opacity = 0.8;
    slot.life = 0.09;
  }

  const bots = [];
  const hitMeshes = [];

  function buildBot(index, team) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, teamMat[team]);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.58;
    const legs = new THREE.Mesh(legGeo, darkMat);
    legs.position.y = 0.28;
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.15, -0.25);
    group.add(torso, head, legs, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    // Name tag: a small canvas sprite above the head, team-coloured, so a firefight
    // reads as named bots fighting, not anonymous shapes.
    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 256;
    nameCanvas.height = 64;
    const nctx = nameCanvas.getContext('2d');
    nctx.font = 'bold 34px system-ui, sans-serif';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.lineWidth = 6;
    nctx.strokeStyle = 'rgba(10,10,14,0.9)';
    nctx.strokeText(NAMES[index % NAMES.length], 128, 32);
    nctx.fillStyle = team === 'attack' ? PALETTE.accent : PALETTE.teal;
    nctx.fillText(NAMES[index % NAMES.length], 128, 32);
    const nameTexture = new THREE.CanvasTexture(nameCanvas);
    nameTexture.colorSpace = THREE.SRGBColorSpace;
    const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture, transparent: true, depthWrite: false }));
    nameSprite.scale.set(1.7, 0.42, 1);
    nameSprite.position.y = 2.05;
    group.add(nameSprite);
    scene.add(group);
    const bot = {
      id: index,
      name: NAMES[index % NAMES.length],
      team,
      group,
      torso,
      head,
      nameSprite,
      position: group.position,
      velocity: new THREE.Vector3(),
      yaw: 0,
      health: BOT_HEALTH,
      alive: true,
      route: [],
      routeIndex: 0,
      state: 'advance',
      holdNode: null,
      scanAt: random() * 0.12,
      reactionAt: 0,
      burstLeft: 0,
      nextShotAt: 0,
      target: null,
      lastSeen: new THREE.Vector3(),
      investigate: null,
      investigateUntil: 0,
      channel: 0,
      channelKind: null,
      isPlanter: false,
      radioAt: 0,
      fall: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) bots.push(buildBot(i, 'attack'));
  for (let i = 0; i < 5; i += 1) bots.push(buildBot(4 + i, 'defend'));

  function spawnRound() {
    const routes = ['A', 'B', 'M', 'A'];
    let planterSet = false;
    let planterRoute = 'A';
    bots.forEach((bot, i) => {
      bot.alive = true;
      bot.health = BOT_HEALTH;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.nameSprite.visible = true;
      bot.channel = 0;
      bot.channelKind = null;
      bot.target = null;
      bot.investigate = null;
      bot.state = 'advance';
      bot.burstLeft = 0;
      bot.radioAt = 0;
      if (bot.team === 'attack') {
        const [x, z] = SPAWNS.attack[i];
        bot.position.set(x, 0, z);
        bot.yaw = Math.PI;
        const key = routes[i % routes.length];
        bot.route = [...ATTACK_ROUTES[key]];
        bot.routeIndex = 1;
        bot.isPlanter = !planterSet && key === 'A';
        if (bot.isPlanter) { planterSet = true; planterRoute = key; }
      } else {
        const [x, z] = SPAWNS.defend[i - 4];
        bot.position.set(x, 0, z);
        bot.yaw = 0;
        bot.holdNode = DEFEND_HOLDS[i - 4];
        bot.route = findPath(bot.position, bot.holdNode);
        bot.routeIndex = 0;
        bot.isPlanter = false;
      }
    });
    if (!planterSet) { bots[0].isPlanter = true; planterRoute = 'A'; }
    return planterRoute;
  }

  function eyeOf(bot) {
    tmpEye.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
    return tmpEye;
  }

  // True if nothing but air sits between the bot's eyes and the point.
  function hasLineOfSight(from, point) {
    tmpDir.copy(point).sub(from);
    const len = tmpDir.length();
    if (len < 0.01) return true;
    tmpDir.divideScalar(len);
    ray.set(from, tmpDir);
    ray.far = len;
    return !ray.intersectObjects(world.shootables, false)[0];
  }

  function sees(bot, point, eye) {
    tmpTo.copy(point).sub(eye);
    const dist = tmpTo.length();
    if (dist > VISION_RANGE) return false;
    if (dist > 6) {
      const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      tmpTo.y = 0;
      tmpTo.normalize();
      if (forward.dot(tmpTo) < Math.cos(VISION_HALF_FOV)) return false;
    }
    return hasLineOfSight(eye, point);
  }

  // The nearest visible enemy: the player, or an enemy bot. Scans are staggered so
  // nine bots never all raycast on the same frame.
  function acquire(bot, ctx, now) {
    bot.scanAt = now + 0.12;
    const eye = eyeOf(bot);
    let best = null;
    let bestDist = Infinity;
    if (ctx.playerAlive) {
      tmpTarget.set(ctx.playerPos.x, ctx.playerPos.y + 1.1, ctx.playerPos.z);
      if (sees(bot, tmpTarget, eye)) {
        best = { kind: 'player' };
        bestDist = tmpTarget.distanceTo(eye);
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      tmpTarget.set(other.position.x, other.position.y + 1.1, other.position.z);
      const dist = tmpTarget.distanceTo(eye);
      if (dist >= bestDist) continue;
      if (sees(bot, tmpTarget, eye)) {
        best = { kind: 'bot', bot: other };
        bestDist = dist;
      }
    }
    if (best) {
      bot.target = best;
      bot.lastSeen.copy(best.kind === 'player' ? ctx.playerPos : best.bot.position);
      bot.lastSeen.y += 1.1;
      if (bot.state !== 'engage') {
        bot.reactionAt = now + REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
        bot.burstLeft = 0;
        // Radio callout on first contact, throttled per bot: a named voice, a place.
        if (ctx.onRadio && now >= bot.radioAt) {
          bot.radioAt = now + 9;
          const zone = ctx.zoneName ? ctx.zoneName(bot.position.x, bot.position.z) : 'mid';
          ctx.onRadio(bot, `Contact at ${zone} — engaging`);
        }
      }
      bot.state = 'engage';
      bot.channel = 0;
      bot.channelKind = null;
      return true;
    }
    return false;
  }

  function aimYawAt(bot, point) {
    const dx = point.x - bot.position.x;
    const dz = point.z - bot.position.z;
    return Math.atan2(-dx, -dz);
  }

  function stepBot(bot, ctx, dt, now) {
    if (!bot.alive) {
      bot.nameSprite.visible = false;
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
      }
      return;
    }

    // Tracers fade on their own clock.
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) slot.line.visible = false;
      else slot.line.material.opacity = slot.life * 8;
    }

    // A planted bomb pulls every living defender to it; the nearest becomes the defuser.
    if (ctx.bombPlanted && bot.team === 'defend' && bot.state !== 'engage') {
      if (bot.channelKind !== 'defuse') {
        const siteNode = ctx.bombSite === 'A' ? 'aSite' : 'bSite';
        bot.route = findPath(bot.position, siteNode);
        bot.routeIndex = 0;
        bot.state = 'advance';
        bot.channelKind = null;
      }
    }

    if (now >= bot.scanAt && ctx.live) {
      const found = acquire(bot, ctx, now);
      if (!found && bot.state === 'engage') {
        // Lost sight: hold the last seen spot briefly, then go back to the route.
        bot.state = 'advance';
        bot.target = null;
      }
    }

    if (ctx.live && bot.state === 'engage' && bot.target) {
      const targetPos = bot.target.kind === 'player'
        ? tmpTarget.set(ctx.playerPos.x, ctx.playerPos.y + 1.1, ctx.playerPos.z)
        : tmpTarget.set(bot.target.bot.position.x, bot.target.bot.position.y + 1.1, bot.target.bot.position.z);
      const wantYaw = aimYawAt(bot, targetPos);
      let diff = wantYaw - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.yaw += diff * Math.min(1, dt * 10);
      bot.group.rotation.y = bot.yaw;
      bot.velocity.x = 0;
      bot.velocity.z = 0;
      // Fire only once the aim has settled past the reaction delay, in bursts.
      if (now >= bot.reactionAt && Math.abs(diff) < 0.12) {
        if (bot.burstLeft === 0 && now >= bot.nextShotAt) {
          bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
          bot.nextShotAt = now + BURST_COOLDOWN + random() * 0.4;
        }
        if (bot.burstLeft > 0 && now >= bot.nextShotAt - BURST_COOLDOWN) {
          // Burst pacing: one shot per SHOT_GAP while the burst lasts.
          if (!bot.shotAt || now - bot.shotAt >= SHOT_GAP) {
            bot.shotAt = now;
            bot.burstLeft -= 1;
            fireAt(bot, targetPos, ctx);
          }
        }
      }
      return;
    }

    // Planting: the planter channels at its site while nobody watches it.
    if (ctx.live && bot.isPlanter && bot.team === 'attack' && ctx.bombStatus === 'carried'
      && bot.routeIndex >= bot.route.length && bot.state !== 'engage') {
      bot.state = 'plant';
      bot.channelKind = 'plant';
      bot.channel += dt;
      if (bot.channel >= 3) {
        bot.channel = 0;
        bot.channelKind = null;
        ctx.onPlant(bot);
      }
      return;
    }

    // Defusing: channel at the bomb while nobody watches.
    if (ctx.live && bot.team === 'defend' && ctx.bombPlanted && bot.channelKind === 'defuse') {
      bot.channel += dt;
      if (bot.channel >= 5) {
        bot.channel = 0;
        bot.channelKind = null;
        ctx.onDefuse(bot);
      }
      return;
    }
    if (bot.team === 'defend' && ctx.bombPlanted && ctx.live) {
      const d = Math.hypot(bot.position.x - ctx.bombPos.x, bot.position.z - ctx.bombPos.z);
      if (d < 1.4 && bot.state !== 'engage') {
        bot.state = 'defuse';
        bot.channelKind = 'defuse';
        bot.channel = 0;
        return;
      }
    }

    // Walk the route: steer at the next waypoint, advance when close.
    let goal = null;
    if (bot.investigate && now < bot.investigateUntil) {
      goal = bot.investigate;
    } else if (bot.routeIndex < bot.route.length) {
      const [x, z] = WAYPOINTS[bot.route[bot.routeIndex]];
      goal = tmpTo.set(x, 0, z);
      const d = Math.hypot(goal.x - bot.position.x, goal.z - bot.position.z);
      if (d < 0.7) {
        bot.routeIndex += 1;
        if (bot.routeIndex >= bot.route.length) {
          bot.state = 'hold';
          bot.velocity.x = 0;
          bot.velocity.z = 0;
          return;
        }
      }
    } else {
      bot.state = 'hold';
      bot.velocity.x = 0;
      bot.velocity.z = 0;
      return;
    }
    if (!goal) return;
    const dx = goal.x - bot.position.x;
    const dz = goal.z - bot.position.z;
    const len = Math.hypot(dx, dz) || 1;
    bot.velocity.x = (dx / len) * BOT_SPEED;
    bot.velocity.z = (dz / len) * BOT_SPEED;
    bot.velocity.y -= 20 * dt;
    bot.yaw = Math.atan2(-dx, -dz);
    bot.group.rotation.y = bot.yaw;
    mover.move(bot.position, bot.velocity, dt, 1.72);
  }

  function fireAt(bot, targetPos, ctx) {
    const eye = eyeOf(bot);
    tmpDir.copy(targetPos).sub(eye).normalize();
    tmpDir.x += (random() * 2 - 1) * BOT_SPREAD;
    tmpDir.y += (random() * 2 - 1) * BOT_SPREAD;
    tmpDir.z += (random() * 2 - 1) * BOT_SPREAD;
    tmpDir.normalize();
    ray.set(eye, tmpDir);
    ray.far = 60;
    const hits = ray.intersectObjects(ctx.shootables, false);
    const hit = hits[0];
    tmpEnd.copy(eye).addScaledVector(tmpDir, 40);
    const end = hit ? hit.point : tmpEnd;
    tracer(eye, end);
    ctx.onShotFired(bot, eye);
    if (!hit) return;
    if (hit.object.userData.bot) {
      const victim = hit.object.userData.bot;
      const mult = hit.object.userData.part === 'head' ? BOT_HEAD_MULT : 1;
      ctx.onBotHit(victim, Math.round(BOT_DMG * mult), bot, hit.object.userData.part);
    } else if (ctx.playerAlive && hit.object.userData.isPlayer) {
      ctx.onPlayerHit(Math.round(BOT_DMG * (hit.object.userData.part === 'head' ? BOT_HEAD_MULT : 1)), bot);
    }
  }

  function hurt(bot, amount, attacker, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      // A hit bot turns toward the shooter and answers back.
      if (attacker && attacker.position) {
        bot.lastSeen.copy(attacker.position);
        bot.investigate = null;
      }
      return false;
    }
    bot.alive = false;
    bot.fall = 0;
    bot.velocity.set(0, 0, 0);
    return true;
  }

  function hear(pos) {
    for (const bot of bots) {
      if (!bot.alive || bot.state === 'engage') continue;
      const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
      if (d < 22) {
        bot.investigate = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, 0, pos.z);
        bot.investigateUntil = performance.now() / 1000 + 6;
      }
    }
  }

  return {
    bots,
    hitMeshes,
    spawnRound,
    hurt,
    hear,
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
    step(dt, ctx, now) {
      for (const bot of bots) stepBot(bot, ctx, dt, now);
    },
  };
}
