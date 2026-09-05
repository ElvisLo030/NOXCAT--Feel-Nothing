import type { PatternId } from '../../ai/bossSchema';

export const DANGER_INSTRUCTION = '離開紅色區域';

export const ATTACK_CUES = {
  paper_rain: { name: '透視紙雨', instruction: DANGER_INSTRUCTION },
  top_downpour: { name: '正上方暴雨', instruction: DANGER_INSTRUCTION },
  comment_crossfire: { name: '註解交叉火力', instruction: DANGER_INSTRUCTION },
  pulse_barrage: { name: '脈衝齊射', instruction: DANGER_INSTRUCTION },
  alternating_zipper: { name: '左右拉鍊連射', instruction: DANGER_INSTRUCTION },
  closing_walls: { name: '收縮文件牆', instruction: DANGER_INSTRUCTION },
  revision_homing: { name: '追蹤改稿便條', instruction: DANGER_INSTRUCTION },
  returnable_burst: { name: '退件反彈', instruction: DANGER_INSTRUCTION },
  deadline_beam: { name: '截止雷射', instruction: DANGER_INSTRUCTION },
} as const satisfies Record<PatternId, { name: string; instruction: string }>;
