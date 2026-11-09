import { describe, expect, it } from 'vitest';
import { fill, higherType, lowerType, validateScenarios, variablesFor } from '../src/core/scenarios';
import data from '../src/data/scenarios.json';

const good = {
  id: 'x',
  type: 'incident',
  lines: ['Phòng {phong} bị hỏng.'],
  options: [{ text: 'Sửa', result: 'Xong, {ten}.', effects: { task: 'fix', satisfaction: 5 } }],
};
const bad = (patch: object) => [{ ...good, ...patch }];
const opt = (patch: object) => bad({ options: [{ ...good.options[0], ...patch }] });

describe('dữ liệu kịch bản thật', () => {
  const scenarios = validateScenarios(data);
  it('hợp lệ và đủ số lượng cho từng loại', () => {
    const count = (t: string) => scenarios.filter((s) => s.type === t).length;
    expect(scenarios.length).toBeGreaterThanOrEqual(15);
    expect(count('incident')).toBeGreaterThanOrEqual(5);
    expect(count('overbooking')).toBeGreaterThanOrEqual(2);
    expect(count('special')).toBeGreaterThanOrEqual(4);
  });
  it('mỗi tình huống có ít nhất một lựa chọn luôn dùng được (không đòi phòng)', () => {
    for (const s of scenarios) {
      expect(s.options.some((o) => !o.requires), s.id).toBe(true);
    }
  });
});

describe('validateScenarios', () => {
  it('chấp nhận dữ liệu đúng', () => {
    expect(validateScenarios([good])).toHaveLength(1);
  });
  it('báo lỗi kèm id tình huống', () => {
    expect(() => validateScenarios(bad({ type: 'khac' }))).toThrow(/x.*type không hợp lệ/s);
    expect(() => validateScenarios(bad({ lines: [] }))).toThrow(/lines/);
    expect(() => validateScenarios(bad({ options: [] }))).toThrow(/từ 1 đến 4/);
    expect(() => validateScenarios([good, good])).toThrow(/trùng id/);
    expect(() => validateScenarios({})).toThrow(/mảng/);
  });
  it('bắt biến lạ trong lời thoại và kết quả', () => {
    expect(() => validateScenarios(bad({ lines: ['Xin chào {ban}'] }))).toThrow(/biến lạ \{ban\}/);
    expect(() => validateScenarios(opt({ result: 'ok {gi}' }))).toThrow(/biến lạ \{gi\}/);
  });
  it('bắt hiệu ứng sai: effect lạ, ngoài khoảng, sai loại tình huống', () => {
    expect(() => validateScenarios(opt({ effects: { bay: 1 } }))).toThrow(/effect lạ/);
    expect(() => validateScenarios(opt({ effects: { satisfaction: 99 } }))).toThrow(/satisfaction/);
    expect(() => validateScenarios(bad({ type: 'special' }))).toThrow(/task chỉ dùng cho incident/);
    expect(() => validateScenarios(opt({ effects: { cancel: true } }))).toThrow(/chỉ dùng cho overbooking/);
  });
  it('bắt đổi phòng thiếu điều kiện phòng, và overbooking không có đường lui', () => {
    expect(() => validateScenarios(opt({ effects: { moveRoom: 'same' } }))).toThrow(/spareRoom/);
    expect(() => validateScenarios(opt({ effects: { oldRoom: 'dirty' } }))).toThrow(/moveRoom/);
    const ob = { id: 'o', type: 'overbooking', lines: ['a'], options: [{ text: 't', result: 'r', requires: 'upgradeRoom', effects: { checkIn: 'upgrade' } }] };
    expect(() => validateScenarios([ob])).toThrow(/cancel/);
  });
});

describe('fill và biến', () => {
  it('thay biến, giữ nguyên biến không có giá trị', () => {
    const v = variablesFor('Lê Văn Nam', '103', 'don');
    expect(fill('{ten} ở {phong}, {loai}, lên {loaiCao}', v)).toBe('Lê Văn Nam ở 103, phòng đơn, lên phòng đôi');
    expect(fill('{khong_co}', v)).toBe('{khong_co}');
  });
  it('loại cao/thấp theo bậc đơn < đôi < vip', () => {
    expect(higherType('vip')).toBeUndefined();
    expect(higherType('don')).toBe('doi');
    expect(lowerType('vip')).toBe('doi');
    expect(lowerType('don')).toBeUndefined();
    expect(variablesFor('A', undefined, 'vip').loaiCao).toBe('');
  });
});
