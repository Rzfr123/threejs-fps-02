// The economy: money earned each round and spent in the buy menu. A pistol round
// starts at $800; a round win pays $3250, a loss $1400, a kill $300, a plant $300.
// Prices live in weapon.js; this module only moves the numbers and remembers the buys.
export const START_MONEY = 800;
export const WIN_BONUS = 3250;
export const LOSS_BONUS = 1400;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;

export function createEconomy() {
  let money = START_MONEY;
  return {
    get money() { return money; },
    reset() { money = START_MONEY; },
    earn(amount) { money += amount; },
    spend(amount) {
      if (money < amount) return false;
      money -= amount;
      return true;
    },
    roundEnd(won) { money += won ? WIN_BONUS : LOSS_BONUS; },
  };
}
