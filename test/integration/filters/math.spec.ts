import { test, liquid, render } from '../../stub/render'

describe('filters/math', function () {
  describe('abs', function () {
    it('should return 3 for -3', () => test('{{ -3 | abs }}', '3'))
    it('should return 2 for arr[0]', () => test('{{ arr[0] | abs }}', { arr: [-2, 'a'] }, '2'))
    it('should return convert string', () => test('{{ "-3" | abs }}', '3'))
  })
  describe('at_least', function () {
    it('{{4 | at_least: 5}} == 5', () => test('{{ 4 | at_least: 5 }}', '5'))
    it('{{4 | at_least: 3}} == 4', () => test('{{ 4 | at_least: 3 }}', '4'))
  })
  describe('at_most', function () {
    it('{{4 | at_most: 5}} == 4', () => test('{{ 4 | at_most: 5 }}', '4'))
    it('{{4 | at_most: 3}} == 3', () => test('{{ 4 | at_most: 3 }}', '3'))
  })
  describe('ceil', function () {
    it('should return "2" for 1.2', () => test('{{ 1.2 | ceil }}', '2'))
    it('should return "2" for 2.0', () => test('{{ 2.0 | ceil }}', '2'))
    it('should return "4" for 3.5', () => test('{{ "3.5" | ceil }}', '4'))
    it('should return "184" for 183.357', () => test('{{ 183.357 | ceil }}', '184'))
  })
  describe('divided_by', function () {
    it('should return 2 for 4,2', () => test('{{4 | divided_by: 2}}', '2'))
    it('should return 4 for 16,4', () => test('{{16 | divided_by: 4}}', '4'))
    it('F13: should divide integers as integers', () => test('{{5 | divided_by: 3}}', '1'))
    it('F13: should floor integer division', () => test('{{ -5 | divided_by: 3}}', '-2'))
    it('F14: should keep a decimal divisor decimal', () => test('{{5 | divided_by: 2.0}}', '2.5'))
    it('F16: should reject integer division by zero', () =>
      expect(render('{{5 | divided_by: 0}}')).rejects.toThrow('divided by 0'))
    it('F16: should yield Infinity for a decimal divisor of zero', () => test('{{5 | divided_by: 0.0}}', 'Infinity'))
    it('should convert string to number', () => test('{{"6" | divided_by: "3"}}', '2'))
  })
  describe('floor', function () {
    it('should return "1" for 1.2', () => test('{{ 1.2 | floor }}', '1'))
    it('should return "2" for 2.0', () => test('{{ 2.0 | floor }}', '2'))
    it('should return "183" for 183.357', () => test('{{ 183.357 | floor }}', '183'))
    it('should return "3" for 3.5', () => test('{{ "3.5" | floor }}', '3'))
  })
  describe('minus', function () {
    it('should return "2" for 4,2', () => test('{{ 4 | minus: 2 }}', '2'))
    it('should return "12" for 16,4', () => test('{{ 16 | minus: 4 }}', '12'))
    it('should return "171.357" for 183.357,12', () => test('{{ 183.357 | minus: 12 }}', '171.357'))
    it('should convert first arg as number', () => test('{{ "4" | minus: 1 }}', '3'))
    it('should convert both args as number', () => test('{{ "4" | minus: "1" }}', '3'))
  })
  describe('modulo', function () {
    it('should return "1" for 3,2', () => test('{{ 3 | modulo: 2 }}', '1'))
    it('should return "3" for 24,7', () => test('{{ 24 | modulo: 7 }}', '3'))
    it('should return "3.357" for 183.357,12', async () => {
      const html = await liquid.parseAndRender('{{ 183.357 | modulo: 12 }}')
      expect(Number(html)).toBeCloseTo(3.357, 3)
    })
    it('should convert string', () => test('{{ "24" | modulo: "7" }}', '3'))
    it('should follow divisor sign for negative dividend', () => test('{{ -7 | modulo: 3 }}', '2'))
    it('should follow divisor sign for negative divisor', () => test('{{ 7 | modulo: -3 }}', '-2'))
    it('should follow divisor sign for negative float', () => test('{{ -4.5 | modulo: 3 }}', '1.5'))
  })
  describe('plus', function () {
    it('should return "6" for 4,2', () => test('{{ 4 | plus: 2 }}', '6'))
    it('should return "20" for 16,4', () => test('{{ 16 | plus: 4 }}', '20'))
    it('should return "195.357" for 183.357,12', () => test('{{ 183.357 | plus: 12 }}', '195.357'))
    it('should convert first arg to number', () => test('{{ "4" | plus: 2 }}', '6'))
    it('should convert both args to numbers', () => test('{{ "4" | plus: "2" }}', '6'))
    it('should convert invalid string to 0', () => test('{{ "abc" | plus: "2" }}', '2'))
    it('should support variable', () => test('{{ 4 | plus: b }}', { b: 2 }, '6'))
  })

  describe('round', function () {
    it.each([
      ['4503599627370495', '0', '4503599627370495'],
      ['9007199254740993', '2', '9007199254740993'],
      ['99999999999999999999', '-1', '100000000000000000000'],
      ['12.5', '-1', '10'],
      ['1.5', '1000', '1.5'],
      ['1.5', '-1000', '0'],
      ['1.55', '1.9', '1.6'],
      ['-0.001', '2', '-0.0']
    ])('rounds %s at precision %s without losing integer or decimal digits', (input, precision, expected) =>
      test(`{{ ${input} | round: ${precision} }}`, expected)
    )
    it('should return "1" for 1.2', () => test('{{1.2|round}}', '1'))
    it('should return "3" for 2.7', () => test('{{2.7|round}}', '3'))
    it('should return "-3" for -2.5 (away from zero)', () => test('{{num|round}}', { num: -2.5 }, '-3'))
    it('should return "-2" for -2.49 (closest integer)', () => test('{{num|round}}', { num: -2.49 }, '-2'))
    it('should return "183.36" for 183.357,2', () => test('{{183.357|round: 2}}', '183.36'))
    it('should convert string to number', () => test('{{"2.7"|round}}', '3'))
    it('odd number 1.005 should round correctly', () => test('{{1.005|round:2}}', '1.01'))
    it('odd number -1.005 should round correctly', () => test('{{num|round:2}}', { num: -1.005 }, '-1.01'))
    it('odd number 9.075 should round correctly', () => test('{{9.075|round:2}}', '9.08'))
    it('odd number -9.075 should round correctly', () => test('{{num|round:2}}', { num: -9.075 }, '-9.08'))
  })
  describe('times', function () {
    it('should return "6" for 3,2', () => test('{{ 3 | times: 2 }}', '6'))
    it('should return "168" for 24,7', () => test('{{ 24 | times: 7 }}', '168'))
    it('should return "2200.284" for 183.357,12', () => test('{{ 183.357 | times: 12 }}', '2200.284'))
    it('should convert string to number', () => test('{{ "24" | times: "7" }}', '168'))
  })
})
