export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

// 移動區上緣保留角色半高；一般移動限於近景，彈射沿用完整戰場邊界。
export const DODGE_AREA_TOP = 615;
export const PLAYER_MIN_X = 46;
export const PLAYER_MAX_X = GAME_WIDTH - 46;
export const PLAYER_MIN_Y = DODGE_AREA_TOP + 60;
export const PLAYER_MAX_Y = GAME_HEIGHT - 76;

export const ROUND_DURATION_MS = 180_000;
export const PLAYER_MAX_LIVES = 3;
export const PLAYER_HIT_RADIUS = 18;
export const PLAYER_GRAZE_RADIUS = 43;
// Incoming damage keeps the small, fair core above. Intentional offensive
// contact uses the readable bun silhouette instead, so a fast swipe or launch
// cannot visibly overlap a target while missing its tiny damage core.
export const PLAYER_REFLECT_RADIUS = 46;
export const PLAYER_LAUNCH_RADIUS = 50;
export const BOSS_WEAK_POINT_RADIUS = 38;
export const PLAYER_INVULNERABLE_MS = 1_100;
export const POST_HIT_RELIEF_MS = 1_500;
export const MAX_FOLLOW_SPEED = 1_500;
export const REFLECT_MIN_SPEED = 520;

export const ENERGY_MAX = 100;
// Single, readable waves replace overlapping volleys. Eight energy per graze
// keeps a no-camera player able to charge within one to two well-played waves.
export const ENERGY_PER_GRAZE = 8;
export const ENERGY_PER_REFLECT = 18;
export const ENERGY_PER_PERFECT_WAVE = 12;
export const ENERGY_LOSS_ON_HIT = 20;
export const NEUTRAL_ENERGY_PER_SECOND = 1.4;
export const NEUTRAL_BONUS_THRESHOLD = 88;
export const FEEL_DETECTED_THRESHOLD = 70;
export const FEEL_DETECTED_HOLD_MS = 250;
export const FEEL_DETECTED_COOLDOWN_MS = 600;

export const BOSS_MAX_HP = 100;
export const MAIN_ATTACK_DAMAGE = 34;
export const REFLECT_DAMAGE = 6;

export const AIM_MAX_PULL = 160;
export const AIM_MIN_PULL = 36;
export const LAUNCH_SPEED = 1_100;
export const LAUNCH_MISS_ENERGY = 30;
export const VULNERABLE_WINDOW_MS = 4_500;
export const STAGGER_DURATION_MS = 800;

export const POSITION_STIFFNESS = 280;
export const POSITION_DAMPING = 28;
export const DEADLINE_BEAM_TELEGRAPH_MS = 750;
