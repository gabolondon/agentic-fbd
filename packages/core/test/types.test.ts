import { describe, expect, it } from 'vitest';
import type { TypeExpr } from '../src/format.ts';
import { compat, describeType, parseType, typeToString, undefinedNames } from '../src/index.ts';

const types: Record<string, TypeExpr> = {
  OptionId: 'number',
  UserId: 'number',
  QuestionId: 'string',
  Answer: {
    oneOf: [
      { kind: "'option'", optionId: 'OptionId' },
      { kind: "'text'", text: 'string' },
    ],
  },
  Answers: 'Record<QuestionId, Answer>',
  Point: { x: 'number', y: 'number' },
  Role: { oneOf: ["'admin'", "'reader'"] },
};

describe('parseType', () => {
  it.each([
    ['string', 'string'],
    ['OptionId', 'OptionId'],
    ['OptionId?', 'OptionId?'],
    ['Answer[]', 'Answer[]'],
    ['Answer[]?', 'Answer[]?'],
    ["'option'", "'option'"],
    ['Record<QuestionId, Answer>', 'Record<QuestionId, Answer>'],
    ["'a' | 'b'", "'a' | 'b'"],
    ['(string | number)[]', '(string | number)[]'],
  ])('round-trips %s', (input, expected) => {
    expect(typeToString(parseType(input))).toBe(expected);
  });

  it('treats an object with only oneOf as a union and any other object as a struct', () => {
    expect(parseType({ oneOf: ['string', 'number'] }).k).toBe('union');
    expect(parseType({ kind: "'text'", text: 'string' }).k).toBe('struct');
  });

  it('marks garbage as unknown', () => {
    expect(parseType('Map<').k).toBe('unknown');
    expect(parseType('foo bar').k).toBe('unknown');
  });
});

describe('compat', () => {
  it.each<[TypeExpr, TypeExpr, string]>([
    // ok
    ['OptionId', 'OptionId', 'ok'],
    ['number', 'number', 'ok'],
    ['Answer', 'Answer', 'ok'],
    ['OptionId', 'OptionId?', 'ok'],
    ["'option'", 'string', 'ok'],
    [{ x: 'number', y: 'number', z: 'number' }, { x: 'number', y: 'number' }, 'ok'],
    ['string', 'string | number', 'ok'],
    // warning: shape fits, meaning differs (the motivating bug)
    ['number', 'OptionId', 'warning'],
    ['OptionId', 'number', 'warning'],
    ['UserId', 'OptionId', 'warning'],
    [{ x: 'number', y: 'number' }, 'Point', 'warning'],
    ['OptionId?', 'OptionId', 'warning'],
    ['string', "'option'", 'warning'],
    // error: incompatible shape
    ['string', 'number', 'error'],
    ['string', 'OptionId', 'error'],
    [{ a: 'string' }, 'number', 'error'],
    ['Answer', 'number', 'error'],
    ['number[]', 'number', 'error'],
    [{ x: 'number' }, { x: 'number', y: 'number' }, 'error'],
    // unknown: never a false red
    ['Mystery', 'number', 'unknown'],
    ['number', 'Mystery', 'unknown'],
    ['Map<', 'string', 'unknown'],
    ['Record<string, number>', { a: 'number' }, 'unknown'],
  ])('%j -> %j is %s', (source, target, expected) => {
    expect(compat(source, target, types)).toBe(expected);
  });

  it('accepts the text branch of a union into the union', () => {
    expect(compat({ kind: "'text'", text: 'string' }, 'Answer', types)).toBe('warning');
    expect(compat({ kind: "'text'", text: 'string' }, { oneOf: [{ kind: "'text'", text: 'string' }] }, types)).toBe(
      'ok',
    );
  });

  it('handles recursive types without looping', () => {
    const rec = { Tree: { value: 'number', children: 'Tree[]' }, Other: { value: 'number', children: 'Other[]' } };
    expect(['warning', 'unknown']).toContain(compat('Tree', 'Other', rec));
  });
});

describe('describeType', () => {
  it('expands a named type one level', () => {
    expect(describeType('Answer', types)).toBe(
      "Answer = { kind: 'option', optionId: OptionId } | { kind: 'text', text: string }",
    );
    expect(describeType('number', types)).toBe('number');
  });
});

describe('undefinedNames', () => {
  it('lists names missing from the type table', () => {
    expect(undefinedNames('Record<QuestionId, Mystery>', types)).toEqual(['Mystery']);
  });
});
