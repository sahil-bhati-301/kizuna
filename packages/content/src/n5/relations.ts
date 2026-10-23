// Kanji-to-kanji relations within the set. Undirected: each pair appears once per kind.
// A pair may appear once as `visual` and once as `semantic` (e.g. 左/右).
import type { Relation } from '../types';

const visual = (a: string, b: string, strength: number, note: string): Relation => ({
  a, b, kind: 'visual', strength, note,
});
const semantic = (a: string, b: string, strength: number, note: string): Relation => ({
  a, b, kind: 'semantic', strength, note,
});

export const relations: Relation[] = [
  // ---- visual lookalikes ---------------------------------------------------
  visual('人', '入', 0.9, '入 is 人 with the long stroke on the other side.'),
  visual('入', '八', 0.6, 'Both are two spreading strokes; in 八 they do not touch.'),
  visual('人', '八', 0.5, 'Two strokes each; 人 joins at the top, 八 stays apart.'),
  visual('日', '目', 0.8, '目 is a taller 日 with one more inner line.'),
  visual('日', '白', 0.7, '白 is 日 with a short stroke on top.'),
  visual('白', '百', 0.7, '百 is 白 with a line across the top.'),
  visual('目', '見', 0.4, '見 is 目 standing on a pair of legs.'),
  visual('木', '本', 0.8, '本 is 木 with a short line across the trunk near the root.'),
  visual('木', '来', 0.5, '来 looks like 木 with extra strokes on top.'),
  visual('十', '千', 0.6, '千 is 十 with a slanted stroke on top.'),
  visual('千', '午', 0.7, 'Both stand on 十; 午 has a bent top and an extra bar.'),
  visual('午', '年', 0.6, '年 starts like 午 and adds more horizontal bars.'),
  visual('大', '天', 0.7, '天 is 大 with a line on top.'),
  visual('右', '左', 0.8, 'Same ナ top; 右 has 口 below, 左 has 工.'),
  visual('土', '上', 0.5, 'Both are a vertical on a long base line; 上 has a short stroke to the right.'),
  visual('今', '会', 0.5, 'Both sit under the same 人 roof.'),
  visual('聞', '間', 0.7, 'Both are inside the 門 gate: 聞 has 耳 (ear), 間 has 日 (sun).'),
  visual('小', '少', 0.7, '少 is 小 with a slanted stroke below.'),
  visual('母', '毎', 0.7, '毎 has a 母-like lower part under a small hat.'),
  visual('東', '車', 0.6, 'Both have a box with a long vertical through it; 東 spreads legs, 車 has a base line.'),
  visual('出', '山', 0.5, '出 looks like one 山 stacked on another.'),
  visual('四', '西', 0.5, 'Both are a box with two inner strokes; 西 has a bar across the top.'),
  visual('力', '九', 0.4, 'Two strokes each with a hooked bend; 九 curls out at the bottom right.'),

  // ---- semantic pairs ------------------------------------------------------
  semantic('父', '母', 0.8, 'father / mother'),
  semantic('男', '女', 0.8, 'man / woman'),
  semantic('上', '下', 0.8, 'up / down'),
  semantic('左', '右', 0.8, 'left / right'),
  semantic('東', '西', 0.7, 'east / west'),
  semantic('南', '北', 0.7, 'south / north'),
  semantic('大', '小', 0.7, 'big / small'),
  semantic('多', '少', 0.7, 'many / few'),
  semantic('前', '後', 0.8, 'before, front / after, behind'),
  semantic('先', '前', 0.5, 'both can mean "earlier" or "ahead"'),
  semantic('高', '安', 0.6, '高い (expensive) / 安い (cheap)'),
  semantic('新', '古', 0.8, 'new / old'),
  semantic('入', '出', 0.8, 'enter / exit'),
  semantic('行', '来', 0.7, 'go / come'),
  semantic('食', '飲', 0.7, 'eat / drink'),
  semantic('読', '書', 0.6, 'read / write'),
  semantic('見', '聞', 0.5, 'see / hear'),
  semantic('言', '話', 0.6, 'say / talk'),
  semantic('話', '語', 0.6, 'talk / language: both about speech'),
  semantic('言', '語', 0.5, 'say / language: both about words'),
  semantic('外', '中', 0.6, 'outside / inside'),
  semantic('天', '空', 0.6, 'heaven / sky'),
  semantic('空', '雨', 0.4, 'sky / rain: weather words'),
  semantic('天', '雨', 0.4, 'heaven / rain: weather words (天気)'),
  semantic('日', '月', 0.5, 'day / month: both units of time and days of the week'),
  semantic('年', '月', 0.4, 'year / month'),
  semantic('時', '間', 0.6, 'time / interval (時間)'),
  semantic('時', '分', 0.5, 'hour / minute'),
  semantic('手', '足', 0.6, 'hand / foot'),
  semantic('目', '耳', 0.4, 'eye / ear'),
  semantic('百', '千', 0.5, 'hundred / thousand'),
  semantic('千', '万', 0.5, 'thousand / ten thousand'),
  semantic('水', '火', 0.4, 'water / fire: elements and weekdays'),
  semantic('山', '川', 0.4, 'mountain / river'),
];
