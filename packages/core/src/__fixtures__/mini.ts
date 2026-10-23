// A small but rich content fixture for unit tests: families (日, 言, 木, 大), lookalike and
// related-meaning relations, and aligned words. Independent of the real dataset.
import type {
  Component,
  ContentSet,
  Kanji,
  KanjiPart,
  Reading,
  Relation,
  SemanticField,
  Word,
  WordPartPhenomenon,
} from '@kizuna/content';

function readings(id: string, on: string[], kun: string[]): Reading[] {
  const mk = (kind: 'on' | 'kun', spec: string, i: number): Reading => {
    const [kana, okurigana = ''] = spec.split('.');
    return { id: `${id}:${kind}:${spec}`, kanji: id, kind, kana, okurigana, primary: i === 0 };
  };
  return [...on.map((s, i) => mk('on', s, i)), ...kun.map((s, i) => mk('kun', s, i))];
}

let rank = 0;
function k(
  id: string,
  keyword: string,
  meanings: string[],
  strokes: number,
  radical: string,
  parts: Array<[string, KanjiPart['role'], KanjiPart['position']]>,
  on: string[],
  kun: string[],
  field: SemanticField,
): Kanji {
  rank++;
  return {
    id,
    keyword,
    meanings,
    strokes,
    frequencyRank: rank,
    radical,
    parts: parts.map(([component, role, position]) => ({ component, role, position })),
    readings: readings(id, on, kun),
    semanticField: field,
  };
}

const whole = (id: string): Array<[string, KanjiPart['role'], KanjiPart['position']]> => [[id, 'radical', 'whole']];

const kanji: Kanji[] = [
  k('日', 'sun, day', ['sun', 'day'], 4, '日', whole('日'), ['にち', 'じつ'], ['ひ', 'か'], 'time'),
  k('人', 'person', ['person', 'people'], 2, '人', whole('人'), ['じん', 'にん'], ['ひと'], 'person'),
  k('大', 'big', ['big', 'large', 'great'], 3, '大', whole('大'), ['だい', 'たい'], ['おお.きい'], 'size_amount'),
  k('上', 'up', ['up', 'above', 'top'], 3, '一', whole('上'), ['じょう'], ['うえ', 'かみ', 'あ.がる'], 'direction'),
  k('下', 'down', ['down', 'below', 'under'], 3, '一', whole('下'), ['か', 'げ'], ['した', 'さ.がる'], 'direction'),
  k('本', 'book, origin', ['book', 'origin', 'main'], 5, '木', [['木', 'radical', 'other'], ['一', 'form', 'bottom']], ['ほん'], ['もと'], 'other'),
  k('月', 'moon, month', ['moon', 'month'], 4, '月', whole('月'), ['げつ', 'がつ'], ['つき'], 'time'),
  k('時', 'time', ['time', 'hour'], 10, '日', [['日', 'radical', 'left'], ['寺', 'phonetic', 'right']], ['じ'], ['とき'], 'time'),
  k('木', 'tree', ['tree', 'wood'], 4, '木', whole('木'), ['もく', 'ぼく'], ['き'], 'nature'),
  k('山', 'mountain', ['mountain'], 3, '山', whole('山'), ['さん'], ['やま'], 'nature'),
  k('入', 'enter', ['enter', 'insert', 'put in'], 2, '入', whole('入'), ['にゅう'], ['はい.る', 'い.れる'], 'action'),
  k('目', 'eye', ['eye'], 5, '目', whole('目'), ['もく'], ['め'], 'body'),
  k('話', 'talk', ['talk', 'speak', 'story'], 13, '言', [['言', 'radical', 'left'], ['舌', 'form', 'right']], ['わ'], ['はな.す', 'はなし'], 'language'),
  k('語', 'language, word', ['language', 'word', 'tell'], 14, '言', [['言', 'radical', 'left'], ['五', 'phonetic', 'other'], ['口', 'form', 'bottom']], ['ご'], ['かた.る'], 'language'),
  k('言', 'say', ['say', 'word', 'speech'], 7, '言', whole('言'), ['げん', 'ごん'], ['い.う', 'こと'], 'language'),
  k('読', 'read', ['read'], 14, '言', [['言', 'radical', 'left'], ['売', 'phonetic', 'right']], ['どく', 'とく'], ['よ.む'], 'language'),
  k('明', 'bright', ['bright', 'light', 'clear'], 8, '日', [['日', 'radical', 'left'], ['月', 'semantic', 'right']], ['めい', 'みょう'], ['あか.るい', 'あ.ける'], 'other'),
  k('白', 'white', ['white'], 5, '白', whole('白'), ['はく', 'びゃく'], ['しろ', 'しろ.い'], 'other'),
  k('休', 'rest', ['rest', 'holiday', 'day off'], 6, '亻', [['亻', 'radical', 'left'], ['木', 'semantic', 'right']], ['きゅう'], ['やす.む'], 'action'),
  k('天', 'heaven', ['heaven', 'sky'], 4, '大', [['一', 'form', 'top'], ['大', 'radical', 'bottom']], ['てん'], ['あめ', 'あま'], 'nature'),
  k('父', 'father', ['father'], 4, '父', whole('父'), ['ふ'], ['ちち'], 'person'),
  k('母', 'mother', ['mother'], 5, '母', whole('母'), ['ぼ'], ['はは'], 'person'),
  k('川', 'river', ['river', 'stream'], 3, '川', whole('川'), ['せん'], ['かわ'], 'nature'),
  k('体', 'body', ['body'], 7, '亻', [['亻', 'radical', 'left'], ['本', 'form', 'right']], ['たい', 'てい'], ['からだ'], 'body'),
  k('早', 'early', ['early', 'fast'], 6, '日', [['日', 'radical', 'top'], ['十', 'form', 'bottom']], ['そう', 'さっ'], ['はや.い'], 'time'),
  k('太', 'fat, thick', ['fat', 'thick', 'plump'], 4, '大', [['大', 'radical', 'other'], ['丶', 'form', 'other']], ['たい', 'た'], ['ふと.い'], 'size_amount'),
  k('犬', 'dog', ['dog'], 4, '犬', [['大', 'form', 'other'], ['丶', 'form', 'other']], ['けん'], ['いぬ'], 'nature'),
  k('林', 'grove', ['grove', 'woods'], 8, '木', [['木', 'radical', 'left'], ['木', 'radical', 'right']], ['りん'], ['はやし'], 'nature'),
  k('間', 'interval, between', ['interval', 'between', 'space'], 12, '門', [['門', 'radical', 'enclosure'], ['日', 'form', 'other']], ['かん', 'けん'], ['あいだ', 'ま'], 'time'),
  k('晴', 'clear weather', ['clear weather', 'sunny'], 12, '日', [['日', 'radical', 'left'], ['青', 'phonetic', 'right']], ['せい'], ['は.れる'], 'nature'),
  k('曜', 'weekday', ['weekday'], 18, '日', [['日', 'radical', 'left'], ['羽', 'form', 'top'], ['隹', 'form', 'bottom']], ['よう'], [], 'time'),
];

const extraComponents: Component[] = [
  { id: '亻', glyph: '亻', keyword: 'person (side)', isKanji: false },
  { id: '一', glyph: '一', keyword: 'one', isKanji: false },
  { id: '寺', glyph: '寺', keyword: 'temple', isKanji: false },
  { id: '舌', glyph: '舌', keyword: 'tongue', isKanji: false },
  { id: '五', glyph: '五', keyword: 'five', isKanji: false },
  { id: '口', glyph: '口', keyword: 'mouth', isKanji: false },
  { id: '売', glyph: '売', keyword: 'sell', isKanji: false },
  { id: '十', glyph: '十', keyword: 'ten', isKanji: false },
  { id: '丶', glyph: '丶', keyword: 'dot', isKanji: false },
  { id: '羽', glyph: '羽', keyword: 'feathers', isKanji: false },
  { id: '隹', glyph: '隹', keyword: 'bird', isKanji: false },
  { id: '門', glyph: '門', keyword: 'gate', isKanji: false },
  { id: '青', glyph: '青', keyword: 'blue', isKanji: false },
];

const components: Component[] = [
  ...kanji.map((x) => ({ id: x.id, glyph: x.id, keyword: x.keyword.split(',')[0], isKanji: true })),
  ...extraComponents,
];

type P = [string, string | null, string, WordPartPhenomenon?];
function w(text: string, kana: string, meaning: string, parts: P[]): Word {
  return {
    id: text,
    text,
    kana,
    meaning,
    parts: parts.map(([kj, reading, surface, phenomenon]) => ({
      kanji: kj,
      readingId: reading ? `${kj}:${reading}` : null,
      surface,
      phenomenon: phenomenon ?? (reading ? 'regular' : 'special'),
    })),
  };
}

const words: Word[] = [
  w('日本', 'にほん', 'Japan', [['日', 'on:にち', 'に', 'sound_change'], ['本', 'on:ほん', 'ほん']]),
  w('大人', 'おとな', 'adult', [['大', null, 'お'], ['人', null, 'とな']]),
  w('木曜日', 'もくようび', 'Thursday', [['木', 'on:もく', 'もく'], ['曜', 'on:よう', 'よう'], ['日', 'kun:ひ', 'び', 'sound_change']]),
  w('月曜日', 'げつようび', 'Monday', [['月', 'on:げつ', 'げつ'], ['曜', 'on:よう', 'よう'], ['日', 'kun:ひ', 'び', 'sound_change']]),
  w('上下', 'じょうげ', 'up and down', [['上', 'on:じょう', 'じょう'], ['下', 'on:げ', 'げ']]),
  w('父母', 'ふぼ', 'parents', [['父', 'on:ふ', 'ふ'], ['母', 'on:ぼ', 'ぼ']]),
  w('休日', 'きゅうじつ', 'day off', [['休', 'on:きゅう', 'きゅう'], ['日', 'on:じつ', 'じつ']]),
  w('大木', 'たいぼく', 'big tree', [['大', 'on:たい', 'たい'], ['木', 'on:ぼく', 'ぼく']]),
  w('本日', 'ほんじつ', 'today (formal)', [['本', 'on:ほん', 'ほん'], ['日', 'on:じつ', 'じつ']]),
  w('月日', 'つきひ', 'time, days', [['月', 'kun:つき', 'つき'], ['日', 'kun:ひ', 'ひ']]),
  w('話す', 'はなす', 'to speak', [['話', 'kun:はな.す', 'はな']]),
  w('読む', 'よむ', 'to read', [['読', 'kun:よ.む', 'よ']]),
  w('休む', 'やすむ', 'to rest', [['休', 'kun:やす.む', 'やす']]),
  w('入る', 'はいる', 'to enter', [['入', 'kun:はい.る', 'はい']]),
  w('言う', 'いう', 'to say', [['言', 'kun:い.う', 'い']]),
  w('明るい', 'あかるい', 'bright', [['明', 'kun:あか.るい', 'あか']]),
  w('大きい', 'おおきい', 'big', [['大', 'kun:おお.きい', 'おお']]),
  w('日本語', 'にほんご', 'Japanese language', [['日', 'on:にち', 'に', 'sound_change'], ['本', 'on:ほん', 'ほん'], ['語', 'on:ご', 'ご']]),
  w('言語', 'げんご', 'language', [['言', 'on:げん', 'げん'], ['語', 'on:ご', 'ご']]),
  w('木目', 'もくめ', 'wood grain', [['木', 'on:もく', 'もく'], ['目', 'kun:め', 'め']]),
  w('母語', 'ぼご', 'mother tongue', [['母', 'on:ぼ', 'ぼ'], ['語', 'on:ご', 'ご']]),
  w('父の日', 'ちちのひ', "Father's Day", [['父', 'kun:ちち', 'ちち'], ['日', 'kun:ひ', 'ひ']]),
  w('川上', 'かわかみ', 'upstream', [['川', 'kun:かわ', 'かわ'], ['上', 'kun:かみ', 'かみ']]),
  w('白人', 'はくじん', 'white person', [['白', 'on:はく', 'はく'], ['人', 'on:じん', 'じん']]),
  w('早い', 'はやい', 'early', [['早', 'kun:はや.い', 'はや']]),
  w('時計', 'とけい', 'clock', [['時', null, 'と'], ['計', null, 'けい']]),
  w('天気', 'てんき', 'weather', [['天', 'on:てん', 'てん'], ['気', null, 'き']]),
  w('体力', 'たいりょく', 'stamina', [['体', 'on:たい', 'たい'], ['力', null, 'りょく']]),
  w('山川', 'やまかわ', 'mountains and rivers', [['山', 'kun:やま', 'やま'], ['川', 'kun:かわ', 'かわ']]),
  w('林道', 'りんどう', 'forest road', [['林', 'on:りん', 'りん'], ['道', null, 'どう']]),
  w('子犬', 'こいぬ', 'puppy', [['子', null, 'こ'], ['犬', 'kun:いぬ', 'いぬ']]),
  w('太い', 'ふとい', 'thick', [['太', 'kun:ふと.い', 'ふと']]),
  w('人間', 'にんげん', 'human being', [['人', 'on:にん', 'にん'], ['間', 'on:けん', 'げん', 'sound_change']]),
  w('晴れ', 'はれ', 'fine weather', [['晴', 'kun:は.れる', 'は']]),
  w('時間', 'じかん', 'time, hours', [['時', 'on:じ', 'じ'], ['間', 'on:かん', 'かん']]),
];

const relations: Relation[] = [
  { a: '人', b: '入', kind: 'visual', strength: 0.9, note: '入 is 人 with the long stroke on the other side.' },
  { a: '犬', b: '太', kind: 'visual', strength: 0.9, note: 'Same dot, different place: top right in 犬, bottom in 太.' },
  { a: '休', b: '体', kind: 'visual', strength: 0.85, note: '体 has an extra stroke at the bottom of 木 (making 本).' },
  { a: '大', b: '犬', kind: 'visual', strength: 0.8, note: '犬 is 大 with a dot at the top right.' },
  { a: '大', b: '太', kind: 'visual', strength: 0.8, note: '太 is 大 with a dot underneath.' },
  { a: '日', b: '目', kind: 'visual', strength: 0.8, note: '目 has two inner strokes; 日 has one.' },
  { a: '木', b: '本', kind: 'visual', strength: 0.7, note: '本 adds a short stroke near the base of 木.' },
  { a: '日', b: '白', kind: 'visual', strength: 0.7, note: '白 has a small tick on top of 日.' },
  { a: '大', b: '天', kind: 'visual', strength: 0.7, note: '天 adds a line above 大.' },
  { a: '人', b: '大', kind: 'visual', strength: 0.6, note: '大 is 人 with arms stretched out.' },
  { a: '話', b: '語', kind: 'visual', strength: 0.6, note: 'Both start with 言; 話 has 舌 (tongue), 語 has 吾.' },
  { a: '父', b: '母', kind: 'semantic', strength: 0.8, note: 'Father and mother.' },
  { a: '上', b: '下', kind: 'semantic', strength: 0.8, note: 'Up and down: 上 points up, 下 points down.' },
  { a: '話', b: '言', kind: 'semantic', strength: 0.7, note: '言 is to say; 話 is to talk or a story.' },
  { a: '日', b: '月', kind: 'semantic', strength: 0.6, note: 'Sun and moon.' },
  { a: '山', b: '川', kind: 'semantic', strength: 0.5, note: 'Mountain and river.' },
  { a: '読', b: '語', kind: 'semantic', strength: 0.5, note: 'To read vs. language.' },
  { a: '早', b: '時', kind: 'semantic', strength: 0.4, note: 'Early vs. time.' },
];

export const mini: ContentSet = {
  version: 'test-mini',
  level: 'N5',
  kanji,
  components,
  words,
  relations,
};
