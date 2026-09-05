import type { PatternId } from '../../ai/bossSchema';

export const ATTACK_CUES = {
  paper_rain: { name: '透視紙雨', instruction: '避開紅色扇面・移入暗道' },
  top_downpour: { name: '正上方暴雨', instruction: '雨幕直落・左右找缺口' },
  comment_crossfire: { name: '註解交叉火力', instruction: '避開紅色箭頭・移到綠色光圈' },
  pulse_barrage: { name: '脈衝齊射', instruction: '整批齊射・空檔調整位置' },
  alternating_zipper: { name: '左右拉鍊連射', instruction: '左右交替加速・保持在暗道' },
  closing_walls: { name: '收縮文件牆', instruction: '文件左右夾擊・上下跟隨缺口' },
  revision_homing: { name: '追蹤改稿便條', instruction: '紅圈追蹤・鎖定後移開' },
  returnable_burst: { name: '退件反彈', instruction: '先閃避紅色路線・再高速反彈' },
  deadline_beam: { name: '截止雷射', instruction: '紅色橫線將開火・上下閃避' },
} as const satisfies Record<PatternId, { name: string; instruction: string }>;
