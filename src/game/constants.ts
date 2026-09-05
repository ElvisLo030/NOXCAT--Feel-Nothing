export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

// The full arena stays playable. DODGE_AREA_TOP marks the visual top edge of
// the character while PLAYER_MIN_Y is its centre, leaving the Boss readable.
export const DODGE_AREA_TOP = 370;
export const PLAYER_MIN_X = 46;
export const PLAYER_MAX_X = GAME_WIDTH - 46;
export const PLAYER_MIN_Y = DODGE_AREA_TOP + 60;
export const PLAYER_MAX_Y = GAME_HEIGHT - 76;

export const ROUND_DURATION_MS = 90_000;
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
export const FINGER_OFFSET_Y = 72;
export const MAX_FOLLOW_SPEED = 1_500;
export const REFLECT_MIN_SPEED = 520;

export const ENERGY_MAX = 100;
// ~5× the original graze / reflect / wave / camera rates so a 90-second
// round can fill FEEL NOTHING from a handful of grazes.
export const ENERGY_PER_GRAZE = 40;
export const ENERGY_PER_REFLECT = 90;
export const ENERGY_PER_PERFECT_WAVE = 60;
export const ENERGY_LOSS_ON_HIT = 20;
export const NEUTRAL_ENERGY_PER_SECOND = 7;
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
export const VULNERABLE_WINDOW_MS = 5_000;
export const STAGGER_DURATION_MS = 800;

export const POSITION_STIFFNESS = 280;
export const POSITION_DAMPING = 28;
export const DEADLINE_BEAM_TELEGRAPH_MS = 750;
