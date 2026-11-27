/**
 * Checked-in table of radical variant forms → Kangxi radical number 1–214
 * (W01-4 AC 4, content.md §3.1). Owner-approved set (W01-4 OPEN-Q-1).
 * Position-dependent forms map each position to its own radical.
 */

export interface PositionalRadical {
  left: number;
  right: number;
}

export const RADICAL_VARIANTS: Readonly<Record<string, number | PositionalRadical>> = {
  亻: 9, // 人
  刂: 18, // 刀
  忄: 61, // 心
  扌: 64, // 手
  氵: 85, // 水
  灬: 86, // 火
  犭: 94, // 犬
  王: 96, // 玉
  礻: 113, // 示
  糸: 120, // 糸
  纟: 120, // 糸 (simplified form)
  罒: 122, // 网
  '⺼': 130, // 肉 (U+2EBC, the 月 form of 肉; plain 月 stays 74)
  艹: 140, // 艸
  衤: 145, // 衣
  辶: 162, // 辵
  釒: 167, // 金
  飠: 184, // 食
  阝: { left: 170, right: 163 }, // left 阜, right 邑
};
