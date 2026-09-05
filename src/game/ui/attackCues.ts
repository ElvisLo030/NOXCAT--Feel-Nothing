import type { PatternId } from '../../ai/bossSchema';

export const DANGER_INSTRUCTION = '離開紅色區域';

export const ATTACK_NAMES: Readonly<Record<PatternId, string>> = {
  paper_rain: '透視紙雨',
  top_downpour: '正上方暴雨',
  comment_crossfire: '註解交叉火力',
  pulse_barrage: '脈衝齊射',
  alternating_zipper: '左右拉鍊連射',
  closing_walls: '收縮文件牆',
  revision_homing: '追蹤改稿便條',
  returnable_burst: '退件反彈',
  deadline_beam: '截止雷射',
};
