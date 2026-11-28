import { describe, expect, it } from 'vitest';
import { captionKey, readingMs, splitCaptions } from './captions';

describe('splitCaptions', () => {
  it('splits prose into sentences', () => {
    expect(splitCaptions('안녕하세요. 오늘 날씨는 맑습니다! 우산은 필요 없어요?')).toEqual([
      '안녕하세요.',
      '오늘 날씨는 맑습니다!',
      '우산은 필요 없어요?',
    ]);
  });

  it('treats each markdown line as its own caption and strips markup', () => {
    const md = '## 주요 특징\n- **거래대금**: 13.5조 원\n1. 물 한 잔과 스트레칭 🥤';
    expect(splitCaptions(md)).toEqual(['주요 특징.', '거래대금: 13.5조 원.', '물 한 잔과 스트레칭.']);
  });

  it('does not split on decimal points', () => {
    expect(splitCaptions('코스피는 4,915.68로 마감했습니다.')).toEqual(['코스피는 4,915.68로 마감했습니다.']);
  });

  it('replaces code blocks with a short note', () => {
    expect(splitCaptions('예시입니다.\n```js\nconst a = 1;\nconst b = 2;\n```')).toEqual([
      '예시입니다.',
      '(코드 생략)',
    ]);
  });

  it('breaks very long sentences near a comma', () => {
    const long = `${'가'.repeat(50)}, ${'나'.repeat(50)}.`;
    const out = splitCaptions(long);
    expect(out.length).toBe(2);
    expect(out[0].endsWith(',')).toBe(true);
    expect(out.every((s) => s.length <= 90)).toBe(true);
  });

  it('drops think blocks and empty lines', () => {
    expect(splitCaptions('<think>계획</think>\n\n좋아요.')).toEqual(['좋아요.']);
  });
});

describe('captionKey', () => {
  it('is equal for the same content regardless of markdown noise', () => {
    expect(captionKey(splitCaptions('**좋아요.**'))).toBe(captionKey(splitCaptions('좋아요.')));
  });
});

describe('readingMs', () => {
  it('scales with length within bounds', () => {
    expect(readingMs('짧음')).toBe(2200);
    expect(readingMs('가'.repeat(200))).toBe(9000);
    expect(readingMs('가'.repeat(40))).toBeGreaterThan(2200);
  });
});
