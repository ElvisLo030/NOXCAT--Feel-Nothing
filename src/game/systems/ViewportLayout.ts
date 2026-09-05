import { GAME_HEIGHT, GAME_WIDTH } from '../constants';

export interface BattleViewportLayout {
  readonly zoom: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Fits the complete 540x960 authored battlefield, then exposes extra world
 * space on whichever axis the device has more of. The canvas itself always
 * fills the browser viewport, so no letterbox bars or non-uniform stretching
 * are needed.
 */
export function calculateBattleViewportLayout(
  displayWidth: number,
  displayHeight: number,
): BattleViewportLayout {
  const safeWidth = Math.max(1, Number.isFinite(displayWidth) ? displayWidth : GAME_WIDTH);
  const safeHeight = Math.max(1, Number.isFinite(displayHeight) ? displayHeight : GAME_HEIGHT);
  const zoom = Math.max(
    0.001,
    Math.min(safeWidth / GAME_WIDTH, safeHeight / GAME_HEIGHT),
  );
  const width = safeWidth / zoom;
  const height = safeHeight / zoom;
  const centerX = GAME_WIDTH / 2;
  const centerY = GAME_HEIGHT / 2;
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  return {
    zoom,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    centerX,
    centerY,
  };
}

/** Maps a pointer measured in canvas CSS pixels into the extended game world. */
export function viewportPointToWorld(
  layout: BattleViewportLayout,
  displayX: number,
  displayY: number,
): WorldPoint {
  return {
    x: layout.left + displayX / layout.zoom,
    y: layout.top + displayY / layout.zoom,
  };
}
