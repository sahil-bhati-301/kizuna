import { describe, expect, it } from 'vitest';
import { PLACEHOLDER } from './index.js';

describe('placeholder', () => {
  it('exports its name', () => {
    expect(PLACEHOLDER).toBe('kizuna');
  });
});
