// The DOM HUD: crosshair, hit marker, health and armour, ammo, money, the round timer
// and score, alive counts, the kill feed, the bomb banner, the plant/defuse bar, the
// buy menu, the minimap, the radio callout line and the location label. It never
// touches the simulation; main.js pushes numbers in and reads the play and buy
// callbacks out. Values are only written when they change; the minimap is a 2D
// canvas redrawn from the world's wall rectangles.
import { WEAPONS, GRENADE_PRICE, SMOKE_PRICE, ARMOR_PRICE, KIT_PRICE } from './weapon.js';

const COPY = {
  start: {
    title: 'VOIDLINE',
    copy: 'An orbital station at the edge of the void. Plant the void charge on A or B, or wipe the defenders out. First to 7 rounds takes the station.',
    action: 'Click to play',
  },
  paused: { title: 'VOIDLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const loadout = $('loadout');
  const healthValue = $('health-value');
  const healthBar = $('health-bar');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const aliveAtk = $('alive-atk');
  const aliveDef = $('alive-def');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bombStatus = $('bomb-status');
  const progressWrap = $('progress-wrap');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const roundMsg = $('round-msg');
  const radioLine = $('radio-line');
  const locationLabel = $('location-label');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');
  let hitTimer = 0;
  let msgTimer = 0;
  let radioTimer = 0;
  let last = {};
  let mapWalls = null;
  let mapScale = 1;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  function setWidth(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.style.width = value;
  }

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setLoadout(current, owned, grenades, kit, smokes = 0) {
      const slots = [
        { id: 'pistol', key: '1', label: 'LX-9' },
        { id: 'rifle', key: '2', label: 'VX-7' },
        { id: 'smg', key: '3', label: 'PX-9' },
        { id: 'railgun', key: '4', label: 'RG-1' },
      ].map((s) => {
        const has = !!owned[s.id];
        const active = current === s.id;
        return `<span class="slot${active ? ' active' : ''}${has ? '' : ' locked'}">${s.key} ${s.label}</span>`;
      }).join('');
      const util = `<span class="slot util">G Plasma ×${grenades}</span>`
        + (smokes > 0 ? `<span class="slot util">Q Ion veil ×${smokes}</span>` : '')
        + (kit ? '<span class="slot util">Kit</span>' : '');
      const html = slots + util;
      if (last.loadout === html) return;
      last.loadout = html;
      loadout.innerHTML = html;
    },
    setHealth(health, armor) {
      setText(healthValue, 'hp', String(Math.max(0, Math.ceil(health))));
      setWidth(healthBar, 'hpw', `${Math.max(0, health)}%`);
      setText(armorValue, 'armor', String(Math.max(0, Math.ceil(armor))));
      $('health').classList.toggle('low', health <= 30);
    },
    setMoney(value) {
      setText(moneyValue, 'money', `$${value}`);
      setText(buyMoney, 'buymoney', `$${value}`);
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerValue, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    },
    setScore(atk, def, round) {
      setText(scoreValue, 'score', `ROUND ${round}/12 — NOVA ${atk} : ${def} VOID`);
    },
    setAlive(atk, def) {
      setText(aliveAtk, 'aatk', `▲ ${atk}`);
      setText(aliveDef, 'adef', `▼ ${def}`);
    },
    setBomb(text) {
      setText(bombStatus, 'bomb', text);
      banner.classList.toggle('show', text !== '');
    },
    setProgress(label, fraction) {
      if (!label) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      setText(progressLabel, 'prog', label);
      setWidth(progressFill, 'progf', `${Math.round(fraction * 100)}%`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    setSpread(spread) {
      const px = Math.round(4 + spread * 500);
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    killfeed(killer, victim, cause, weaponName) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      const head = cause === 'head' ? ' HEADSHOT' : cause === 'grenade' ? ' 💥' : '';
      line.textContent = `${killer} ✕ ${victim} [${weaponName ?? 'VX-7'}]${head}`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    radio(text) {
      radioLine.textContent = text;
      radioLine.classList.add('show');
      clearTimeout(radioTimer);
      radioTimer = setTimeout(() => radioLine.classList.remove('show'), 4200);
    },
    setLocation(name) {
      setText(locationLabel, 'loc', name);
    },
    roundMessage(text, holdMs = 3200) {
      roundMsg.textContent = text;
      roundMsg.classList.add('show');
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => roundMsg.classList.remove('show'), holdMs);
    },
    showOverlay(mode, scoreText) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'start' ? text.copy : `${text.copy} ${scoreText ?? ''}`;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    showEndOverlay(titleText, copyText, action) {
      title.textContent = titleText;
      copy.textContent = copyText;
      play.textContent = action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    setBuyOpen(open, owned) {
      buyMenu.hidden = !open;
      if (!open) return;
      for (const id of ['rifle', 'smg', 'railgun']) {
        const btn = $(`buy-${id}`);
        btn.disabled = !!owned[id];
        btn.querySelector('.buy-price').textContent = owned[id] ? 'OWNED' : `$${WEAPONS[id].price}`;
      }
      $('buy-grenade').querySelector('.buy-price').textContent = `$${GRENADE_PRICE}`;
      $('buy-smoke').querySelector('.buy-price').textContent = `$${SMOKE_PRICE}`;
      $('buy-armor').querySelector('.buy-price').textContent = `$${ARMOR_PRICE}`;
      $('buy-kit').querySelector('.buy-price').textContent = `$${KIT_PRICE}`;
    },
    onBuy(handler) {
      buyMenu.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-buy]');
        if (!btn || btn.disabled) return;
        handler(btn.dataset.buy);
      });
    },
    // Minimap: walls and sites once, dots every call. The station is 40 x 32 m,
    // mapped onto a 168 x 134 px canvas, north at the top.
    setMinimapWalls(walls) {
      mapWalls = walls;
      mapScale = 168 / 40;
    },
    drawMinimap(playerPos, yaw, bots, bombState) {
      if (!mapWalls) return;
      const w = minimap.width;
      const h = minimap.height;
      mapCtx.clearRect(0, 0, w, h);
      mapCtx.fillStyle = 'rgba(7,8,13,0.82)';
      mapCtx.fillRect(0, 0, w, h);
      const px = (x) => (x + 20) * mapScale;
      const py = (z) => (z + 16) * mapScale;
      mapCtx.fillStyle = '#232839';
      for (const wall of mapWalls) {
        mapCtx.fillRect(px(wall.x - wall.w / 2), py(wall.z - wall.d / 2), wall.w * mapScale, wall.d * mapScale);
      }
      // Sites: cyan A west, magenta B east.
      mapCtx.font = 'bold 13px system-ui, sans-serif';
      mapCtx.textAlign = 'center';
      mapCtx.textBaseline = 'middle';
      mapCtx.fillStyle = '#22d3ee';
      mapCtx.fillRect(px(-18.5), py(-14.5), 7 * mapScale, 7 * mapScale);
      mapCtx.fillStyle = '#07080d';
      mapCtx.fillText('A', px(-15), py(-11));
      mapCtx.fillStyle = '#f472b6';
      mapCtx.fillRect(px(11.5), py(-14.5), 7 * mapScale, 7 * mapScale);
      mapCtx.fillStyle = '#07080d';
      mapCtx.fillText('B', px(15), py(-11));
      // Bomb marker when planted.
      if (bombState.status === 'planted') {
        mapCtx.fillStyle = '#f472b6';
        mapCtx.beginPath();
        mapCtx.arc(px(bombState.position.x), py(bombState.position.z), 5, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // Teammates cyan, enemies magenta, only while alive.
      for (const bot of bots) {
        if (!bot.alive) continue;
        mapCtx.fillStyle = bot.team === 'attack' ? '#22d3ee' : '#f472b6';
        mapCtx.beginPath();
        mapCtx.arc(px(bot.position.x), py(bot.position.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // The player: a white wedge pointing where they look.
      const x = px(playerPos.x);
      const y = py(playerPos.z);
      const angle = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
      mapCtx.fillStyle = '#e8f6ff';
      mapCtx.beginPath();
      mapCtx.moveTo(x + Math.cos(angle) * 7, y + Math.sin(angle) * 7);
      mapCtx.lineTo(x + Math.cos(angle + 2.5) * 5, y + Math.sin(angle + 2.5) * 5);
      mapCtx.lineTo(x + Math.cos(angle - 2.5) * 5, y + Math.sin(angle - 2.5) * 5);
      mapCtx.closePath();
      mapCtx.fill();
    },
  };
}
