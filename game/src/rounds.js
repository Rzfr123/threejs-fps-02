// The match: first to 5 rounds, at most 9. A round is a buy freeze, then live play
// against a 100 s clock, then a short end card. The round ends on elimination, on a
// detonation, on a defuse, or on the clock running out with the bomb unplanted.
export const ROUNDS_TO_WIN = 7;
export const MAX_ROUNDS = 12;
export const ROUND_TIME = 100;
export const BUY_TIME = 6;
export const END_TIME = 4;

export function createRounds() {
  const state = {
    phase: 'buy', // buy | live | roundEnd | matchEnd
    round: 1,
    scoreAttack: 0,
    scoreDefend: 0,
    timer: BUY_TIME,
    endReason: '',
    winner: null,
  };

  return {
    state,
    reset() {
      state.phase = 'buy';
      state.round = 1;
      state.scoreAttack = 0;
      state.scoreDefend = 0;
      state.timer = BUY_TIME;
      state.endReason = '';
      state.winner = null;
    },
    startRound() {
      state.phase = 'buy';
      state.timer = BUY_TIME;
      state.endReason = '';
    },
    startLive() {
      state.phase = 'live';
      state.timer = ROUND_TIME;
    },
    endRound(winner, reason) {
      if (state.phase !== 'live' && state.phase !== 'buy') return;
      state.phase = 'roundEnd';
      state.timer = END_TIME;
      state.endReason = reason;
      if (winner === 'attack') state.scoreAttack += 1;
      else if (winner === 'defend') state.scoreDefend += 1;
      state.winner = winner;
    },
    nextRound() {
      if (state.scoreAttack >= ROUNDS_TO_WIN || state.scoreDefend >= ROUNDS_TO_WIN || state.round >= MAX_ROUNDS) {
        state.phase = 'matchEnd';
        state.winner = state.scoreAttack > state.scoreDefend ? 'attack'
          : state.scoreDefend > state.scoreAttack ? 'defend' : 'draw';
        return false;
      }
      state.round += 1;
      this.startRound();
      return true;
    },
    step(dt) {
      if (state.phase === 'matchEnd') return 'matchEnd';
      state.timer -= dt;
      if (state.phase === 'buy' && state.timer <= 0) {
        this.startLive();
        return 'live';
      }
      if (state.phase === 'live' && state.timer <= 0) {
        this.endRound('defend', 'Time expired — the bomb was never planted.');
        return 'roundEnd';
      }
      if (state.phase === 'roundEnd' && state.timer <= 0) return 'next';
      return state.phase;
    },
  };
}
