// Sound without assets: a tiny oscillator synth for shots, hits, beeps and clicks.
// Everything is guarded, so a browser without audio still plays the game silently.
export function createAudio() {
  let ctx = null;
  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      return null;
    }
    return ctx;
  }
  function tone(freq, dur, type, gain, slideTo) {
    const ac = ensure();
    if (!ac || ac.state === 'suspended') return;
    try {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
      g.gain.setValueAtTime(gain, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + dur);
    } catch { /* silent */ }
  }
  return {
    unlock() { ensure(); },
    // One voice per gun, so a fight reads by ear: the LX-9 chirps, the VX-7
    // growls down, the PX-9 blips, the RG-1 booms with a crack on top.
    shot(kind = 'plasma') {
      if (kind === 'sidearm') tone(1400, 0.07, 'sine', 0.12, 900);
      else if (kind === 'pulse') tone(1200, 0.05, 'square', 0.1, 800);
      else if (kind === 'railgun') { tone(70, 0.35, 'sawtooth', 0.22, 40); tone(1800, 0.06, 'square', 0.12, 900); }
      else tone(880, 0.12, 'sawtooth', 0.14, 220);
    },
    enemyShot() { tone(140, 0.07, 'square', 0.05, 70); },
    hit() { tone(900, 0.05, 'sine', 0.12); },
    kill() { tone(660, 0.12, 'sine', 0.14, 990); },
    hurt() { tone(110, 0.15, 'sawtooth', 0.14, 70); },
    beep(urgent) { tone(urgent ? 1250 : 950, 0.06, 'sine', 0.1); },
    plant() { tone(520, 0.1, 'sine', 0.12, 780); },
    explode() { tone(90, 0.7, 'sawtooth', 0.22, 30); },
    click() { tone(700, 0.04, 'sine', 0.08); },
    roundWin() { tone(523, 0.14, 'sine', 0.12); tone(784, 0.22, 'sine', 0.12); },
  };
}
