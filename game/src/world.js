// The map: "Helix Station", an orbital station at the edge of the void. Attackers
// spawn south, defenders north; site A sits west, site B east, and a core hall
// links them. Two reactor towers and a mag-rail beam are the landmarks: the station
// reads at a glance, and every box is a collider for players and bots and a surface
// a bullet stops on. Plain geometry only, no models and no textures except the
// painted site letters, which are drawn on a canvas at load time.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Named zones, shown in the HUD as the player moves through the station.
export const ZONES = [
  { name: 'SITE A — REACTOR ROW', minX: -20, maxX: -11, minZ: -16, maxZ: -7 },
  { name: 'SITE B — DOCK ROW', minX: 11, maxX: 20, minZ: -16, maxZ: -7 },
  { name: 'CORE HALL', minX: -8, maxX: 8, minZ: -4, maxZ: 2 },
  { name: 'MAG-RAIL', minX: -8, maxX: 8, minZ: 2, maxZ: 8 },
  { name: 'DOCKING BAY', minX: -20, maxX: 20, minZ: 8, maxZ: 16 },
  { name: 'WEST CONDUIT', minX: -20, maxX: -8, minZ: -7, maxZ: 8 },
  { name: 'EAST CONDUIT', minX: 8, maxX: 20, minZ: -7, maxZ: 8 },
];

// Site zones: a planted bomb must sit inside one of these rectangles.
export const SITES = {
  A: { minX: -18.5, maxX: -11.5, minZ: -14.5, maxZ: -7.5, cx: -15, cz: -11 },
  B: { minX: 11.5, maxX: 18.5, minZ: -14.5, maxZ: -7.5, cx: 15, cz: -11 },
};

export const SPAWNS = {
  attack: [
    [-5, 13.5], [-2.5, 13.5], [0, 13.5], [2.5, 13.5], [5, 13.5],
  ],
  defend: [
    [-14, -13.5], [-6, -13.5], [0, -13.5], [6, -13.5], [14, -13.5],
  ],
};

// Node id -> [x, z]. Edges are listed per node; bots walk them in either direction.
export const WAYPOINTS = {
  atkSpawn: [0, 13.5],
  atkWest: [-13, 8],
  atkEast: [13, 8],
  atkMid: [0, 8],
  midDoor: [0, 2],
  midNorth: [0, -4],
  aLong: [-14, 0],
  aApproach: [-14, -5],
  aSite: [-15, -11],
  bLong: [14, 0],
  bApproach: [14, -5],
  bSite: [15, -11],
  defSpawn: [0, -13.5],
  defA: [-10, -10],
  defB: [10, -10],
  defMid: [0, -8],
  defWest: [-8, -2],
  defEast: [8, -2],
};

export const EDGES = {
  atkSpawn: ['atkWest', 'atkMid', 'atkEast'],
  atkWest: ['atkSpawn', 'aLong'],
  atkEast: ['atkSpawn', 'bLong'],
  atkMid: ['atkSpawn', 'midDoor'],
  midDoor: ['atkMid', 'midNorth', 'defWest', 'defEast'],
  midNorth: ['midDoor', 'aApproach', 'bApproach', 'defMid'],
  aLong: ['atkWest', 'aApproach'],
  aApproach: ['aLong', 'midNorth', 'aSite'],
  aSite: ['aApproach', 'defA'],
  bLong: ['atkEast', 'bApproach'],
  bApproach: ['bLong', 'midNorth', 'bSite'],
  bSite: ['bApproach', 'defB'],
  defSpawn: ['defA', 'defB', 'defMid'],
  defA: ['defSpawn', 'aSite', 'defMid'],
  defB: ['defSpawn', 'bSite', 'defMid'],
  defMid: ['defSpawn', 'defA', 'defB', 'midNorth'],
  defWest: ['midDoor', 'defA'],
  defEast: ['midDoor', 'defB'],
};

// Attacker routes to each site, as waypoint ids. A bot picks one at round start.
export const ATTACK_ROUTES = {
  A: ['atkSpawn', 'atkWest', 'aLong', 'aApproach', 'aSite'],
  B: ['atkSpawn', 'atkEast', 'bLong', 'bApproach', 'bSite'],
  M: ['atkSpawn', 'atkMid', 'midDoor', 'midNorth', 'aApproach', 'aSite'],
};

// Defender hold points: where a defender walks to and holds.
export const DEFEND_HOLDS = ['defA', 'defB', 'defMid', 'defWest', 'defEast'];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' || name === 'teal' ? 0.55 : 0.92,
      metalness: 0.03,
    });
    // The neon tech glows: site pads, reactor towers and void trim carry their own
    // light so the station reads at a glance even in the dark deck.
    if (name === 'accent' || name === 'teal') {
      mat.emissive = new THREE.Color(PALETTE[name]);
      mat.emissiveIntensity = 0.85;
    } else if (name === 'rust') {
      mat.emissive = new THREE.Color(PALETTE[name]);
      mat.emissiveIntensity = 0.5;
    }
    materials[name] = mat;
  }

  const colliders = [];
  const shootables = [];
  const minimapWalls = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    minimapWalls.push({ x, z, w: width, d: depth });
    return mesh;
  }

  // A painted site letter: a canvas texture, drawn at load time, no network.
  function siteSign(letter, color, x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 240, 240);
    ctx.fillStyle = color;
    ctx.font = 'bold 150px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 128, 118);
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('SITE ' + letter, 128, 208);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }),
    );
    sign.position.set(x, 2.6, z);
    group.add(sign);
    return sign;
  }

  // Floor and perimeter: a 40 x 32 m station deck, 5 m walls, open to the void sky.
  box(40.4, 0.4, 32.4, 0, -0.2, 0, 'sandDark');
  box(0.4, 5, 32.4, -20.2, 2.5, 0, 'surface');
  box(0.4, 5, 32.4, 20.2, 2.5, 0, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, -16.2, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, 16.2, 'surface');

  // Lane walls: the west and east lanes are walled off from mid except at the gaps,
  // so each lane is its own sightline with corners worth holding.
  box(0.5, 3.4, 12, -8, 1.7, 6, 'surface');
  box(0.5, 3.4, 12, 8, 1.7, 6, 'surface');
  box(0.5, 3.4, 8, -8, 1.7, -8, 'surface');
  box(0.5, 3.4, 8, 8, 1.7, -8, 'surface');
  // Mid hall: two broken walls with a doorway at x = 0.
  box(6, 3.4, 0.5, -5, 1.7, 2, 'surface');
  box(6, 3.4, 0.5, 5, 1.7, 2, 'surface');
  box(6, 3.4, 0.5, -5, 1.7, -4, 'surface');
  box(6, 3.4, 0.5, 5, 1.7, -4, 'surface');

  // Site markers: glowing holo pads so the objective reads at a glance. The thin
  // neon frame around each pad is decoration only — it adds no collider.
  const siteA = new THREE.Mesh(new THREE.BoxGeometry(7, 0.06, 7), materials.accent);
  siteA.position.set(SITES.A.cx, 0.03, SITES.A.cz);
  siteA.receiveShadow = true;
  group.add(siteA);
  const siteB = new THREE.Mesh(new THREE.BoxGeometry(7, 0.06, 7), materials.teal);
  siteB.position.set(SITES.B.cx, 0.03, SITES.B.cz);
  siteB.receiveShadow = true;
  group.add(siteB);
  function holoFrame(cx, cz, colorHex) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex) });
    const edges = [
      [7.4, 0.04, 0.14, cx, 0.07, cz - 3.6],
      [7.4, 0.04, 0.14, cx, 0.07, cz + 3.6],
      [0.14, 0.04, 7.4, cx - 3.6, 0.07, cz],
      [0.14, 0.04, 7.4, cx + 3.6, 0.07, cz],
    ];
    for (const [w, h, d, x, y, z] of edges) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      edge.position.set(x, y, z);
      group.add(edge);
    }
  }
  holoFrame(SITES.A.cx, SITES.A.cz, PALETTE.accent);
  holoFrame(SITES.B.cx, SITES.B.cz, PALETTE.teal);

  // Neon trim: thin emissive strips along the walls and the mag-rail, decoration
  // only — no colliders, so the map plays exactly as before.
  function neon(w, h, d, x, y, z, colorHex) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex) }),
    );
    strip.position.set(x, y, z);
    group.add(strip);
    return strip;
  }
  neon(40.4, 0.08, 0.08, 0, 5.05, -16.2, PALETTE.accent);
  neon(40.4, 0.08, 0.08, 0, 5.05, 16.2, PALETTE.teal);
  neon(0.08, 0.08, 12, -8, 3.45, 6, PALETTE.accent);
  neon(0.08, 0.08, 12, 8, 3.45, 6, PALETTE.teal);

  // Landmarks: two reactor towers behind the sites and a mag-rail beam over the
  // core hall. The reactors are cylinders with box colliders and a glowing ring
  // and core; the beam sits above head height and its legs are the cover.
  function reactor(x, z, ringColor) {
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 9, 20),
      materials.rust,
    );
    tower.position.set(x, 4.5, z);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.12, 8, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(ringColor) }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 9.1, z);
    group.add(ring);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.0, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(ringColor) }),
    );
    core.position.set(x, 9.4, z);
    group.add(core);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 2.2, 0, z - 2.2), new THREE.Vector3(x + 2.2, 9, z + 2.2)));
    shootables.push(tower);
    minimapWalls.push({ x, z, w: 4.4, d: 4.4 });
  }
  reactor(-17.5, -14.5, PALETTE.accent);
  reactor(17.5, -14.5, PALETTE.teal);
  box(16, 0.7, 0.9, 0, 4.6, 2, 'hairline');
  box(0.7, 4.6, 0.9, -7.6, 2.3, 2, 'hairline');
  box(0.7, 4.6, 0.9, 7.6, 2.3, 2, 'hairline');
  neon(16, 0.1, 0.1, 0, 5.02, 2, PALETTE.cyan);

  // Painted site letters on the north wall, facing the yard.
  siteSign('A', PALETTE.accent, -15, -15.9);
  siteSign('B', PALETTE.teal, 15, -15.9);

  // Cover: crates and low walls to crouch behind, placed to break the long sightlines.
  box(1.6, 1.1, 1.6, -14, 0.55, 4, 'sand');
  box(1.6, 1.1, 1.6, 14, 0.55, 4, 'sand');
  box(2.4, 1.0, 1.2, -4, 0.5, 10, 'sand');
  box(2.4, 1.0, 1.2, 4, 0.5, 10, 'sand');
  box(1.2, 2.2, 1.2, 0, 1.1, -1, 'hairline');
  box(3.2, 1.1, 1.2, -12, 0.55, -11, 'sand');
  box(3.2, 1.1, 1.2, 12, 0.55, -11, 'sand');
  box(1.2, 1.1, 3.2, -18, 0.55, -4, 'sand');
  box(1.2, 1.1, 3.2, 18, 0.55, -4, 'sand');
  box(1.6, 0.7, 1.6, -4, 0.35, -12, 'hairline');
  box(1.6, 0.7, 1.6, 4, 0.35, -12, 'hairline');
  box(2.0, 2.6, 0.6, -10.5, 1.3, 0, 'surface');
  box(2.0, 2.6, 0.6, 10.5, 1.3, 0, 'surface');

  // Light: a cold cyan key from the west, a magenta fill, and a violet-tinged
  // sky/ground gradient — the station's own glow does the rest.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.dusk), new THREE.Color(PALETTE.rust), 1.1);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 2.2);
  sun.position.set(-18, 16, 10);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.teal), 0.5);
  fill.position.set(14, 10, -12);
  scene.add(fill);

  return { colliders, shootables, group, minimapWalls };
}
