import { describe, expect, it } from 'vitest';

import {
  ENERGY_MAX,
  ENERGY_PER_GRAZE,
  MAIN_ATTACK_DAMAGE,
  PLAYER_INVULNERABLE_MS,
} from '../src/game/constants';
import { BattleState } from '../src/game/events';
import {
  GameSession,
  classifyProjectileContact,
  type GrazeableProjectile,
} from '../src/state/GameSession';

function landMainAttack(session: GameSession): void {
  session.setEnergyForDebug(ENERGY_MAX);
  expect(session.openVulnerability()).toBe(true);
  expect(session.beginAim()).toBe(true);
  expect(session.releaseAim(100)).toBe(true);
  session.resolveLaunch(true);
}

describe('GameSession combat rules', () => {
  it('clamps energy between zero and the maximum', () => {
    const session = new GameSession({ energy: -100 });

    expect(session.energy).toBe(0);
    expect(session.addEnergy(1_000)).toBe(ENERGY_MAX);
    expect(session.addEnergy(-1_000)).toBe(0);
  });

  it('registers each projectile graze only once', () => {
    const session = new GameSession();
    session.startBattle();
    const projectile: GrazeableProjectile = { hasGrazedPlayer: false };

    expect(session.registerGraze(projectile)).toBe(true);
    expect(session.registerGraze(projectile)).toBe(false);
    expect(session.energy).toBe(ENERGY_PER_GRAZE);
    expect(session.grazeCount).toBe(1);
  });

  it('lets reflected documents damage but not deliver the state-machine final blow', () => {
    const session = new GameSession({ bossHp: 6 });
    session.startBattle();

    expect(session.applyReflectedBossHit()).toBe(1);
    expect(session.reflectCount).toBe(1);
    expect(session.state).toBe(BattleState.DODGING);
  });

  it('distinguishes hit, graze, and safe distances at their exact boundaries', () => {
    expect(classifyProjectileContact(28, 10)).toBe('hit');
    expect(classifyProjectileContact(29, 10)).toBe('graze');
    expect(classifyProjectileContact(53, 10)).toBe('graze');
    expect(classifyProjectileContact(54, 10)).toBe('none');
  });

  it('does not deduct consecutive lives during invulnerability', () => {
    const session = new GameSession({ energy: 50 });
    session.startBattle();

    expect(session.takePlayerHit(1_000)).toBe(true);
    expect(session.takePlayerHit(1_000 + PLAYER_INVULNERABLE_MS - 1)).toBe(false);
    expect(session.lives).toBe(2);
    expect(session.energy).toBe(30);

    expect(session.takePlayerHit(1_000 + PLAYER_INVULNERABLE_MS)).toBe(true);
    expect(session.lives).toBe(1);
  });

  it(`wins after three ${MAIN_ATTACK_DAMAGE}-damage main attacks`, () => {
    const session = new GameSession();
    session.startBattle();

    landMainAttack(session);
    expect(session.bossHp).toBe(66);
    expect(session.state).toBe(BattleState.STAGGERED);
    session.endStagger();

    landMainAttack(session);
    expect(session.bossHp).toBe(32);
    session.endStagger();

    landMainAttack(session);
    expect(session.bossHp).toBe(0);
    expect(session.mainAttackHits).toBe(3);
    expect(session.state).toBe(BattleState.WON);
  });

  it('rejects illegal state transitions', () => {
    const session = new GameSession();

    expect(() => session.transition(BattleState.AIMING)).toThrow(/Invalid battle transition/);
  });

  it('closes an unused vulnerability window without consuming stored energy', () => {
    const session = new GameSession({ energy: ENERGY_MAX });
    session.startBattle();

    expect(session.openVulnerability()).toBe(true);
    expect(session.expireVulnerability()).toBe(true);
    expect(session.state).toBe(BattleState.DODGING);
    expect(session.energy).toBe(ENERGY_MAX);
    expect(session.transitions.at(-1)?.reason).toBe('vulnerability-expired');
  });

  it('loses cleanly when the round timer expires', () => {
    const session = new GameSession({ roundDurationMs: 1_000 });
    session.startBattle();

    session.advanceTime(999);
    expect(session.state).toBe(BattleState.DODGING);
    session.advanceTime(1);
    expect(session.state).toBe(BattleState.LOST);
    expect(session.remainingMs).toBe(0);
  });
});
