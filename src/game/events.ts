export enum BattleState {
  INTRO = 'INTRO',
  DODGING = 'DODGING',
  VULNERABLE = 'VULNERABLE',
  AIMING = 'AIMING',
  LAUNCHED = 'LAUNCHED',
  STAGGERED = 'STAGGERED',
  WON = 'WON',
  LOST = 'LOST',
}

export const GAME_EVENTS = {
  stateChanged: 'battle:state-changed',
  energyChanged: 'battle:energy-changed',
  playerHit: 'battle:player-hit',
  projectileGrazed: 'battle:projectile-grazed',
  projectileReflected: 'battle:projectile-reflected',
  bossHit: 'battle:boss-hit',
  battleEnded: 'battle:ended',
  neutralChanged: 'face:neutral-changed',
} as const;

export type GameEventName = (typeof GAME_EVENTS)[keyof typeof GAME_EVENTS];

export function isTerminalBattleState(state: BattleState): boolean {
  return state === BattleState.WON || state === BattleState.LOST;
}
