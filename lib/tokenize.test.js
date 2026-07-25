import { describe, test, expect } from '@jest/globals';
import { tokenize } from './tokenize.js';

describe('tokenize', () => {
  test('splits on whitespace', () => {
    expect(tokenize('thing create dev')).toEqual(['thing', 'create', 'dev']);
  });

  test('collapses runs of whitespace without emitting empty tokens', () => {
    expect(tokenize('  thing   create  ')).toEqual(['thing', 'create']);
    expect(tokenize('thing\tcreate')).toEqual(['thing', 'create']);
  });

  test('returns nothing for blank or non-string input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize(42)).toEqual([]);
  });

  // The regression: a quoted multi-word argument used to arrive split
  // across tokens with the quote characters still attached, so handlers
  // persisted a value like `"Laptop`.
  test('keeps a double-quoted argument together and strips the quotes', () => {
    expect(tokenize('thing create dev --name "Laptop only"'))
      .toEqual(['thing', 'create', 'dev', '--name', 'Laptop only']);
  });

  test('keeps a single-quoted argument together', () => {
    expect(tokenize("thing --name 'Laptop only'"))
      .toEqual(['thing', '--name', 'Laptop only']);
  });

  test('handles several quoted arguments on one line', () => {
    expect(tokenize('thing "first arg" middle "last arg"'))
      .toEqual(['thing', 'first arg', 'middle', 'last arg']);
  });

  test('treats the other quote character as literal inside a quote', () => {
    expect(tokenize('thing "it\'s fine"')).toEqual(['thing', "it's fine"]);
    expect(tokenize("thing 'say \"hi\"'")).toEqual(['thing', 'say "hi"']);
  });

  test('quoting is positional, so it can start mid-token', () => {
    expect(tokenize('--name="two words"')).toEqual(['--name=two words']);
    expect(tokenize('two" "words')).toEqual(['two words']);
  });

  test('a backslash escapes the next character outside quotes', () => {
    expect(tokenize('thing two\\ words')).toEqual(['thing', 'two words']);
    expect(tokenize('thing \\"quoted\\"')).toEqual(['thing', '"quoted"']);
  });

  test('a backslash escapes inside double quotes', () => {
    expect(tokenize('thing "say \\"hi\\""')).toEqual(['thing', 'say "hi"']);
  });

  // sh semantics, and what makes single quotes the safe way to pass a
  // Windows path or a regex.
  test('a backslash is literal inside single quotes', () => {
    expect(tokenize("thing 'C:\\Users\\bob'")).toEqual(['thing', 'C:\\Users\\bob']);
  });

  // An interactive prompt shouldn't reject a line over a character the
  // operator can't easily see.
  test('an unterminated quote closes at end of line', () => {
    expect(tokenize('thing --name "Laptop only')).toEqual(['thing', '--name', 'Laptop only']);
    expect(tokenize("thing 'unclosed")).toEqual(['thing', 'unclosed']);
  });

  test('a trailing backslash is literal', () => {
    expect(tokenize('thing arg\\')).toEqual(['thing', 'arg\\']);
  });

  test('an explicitly empty quoted argument survives as a token', () => {
    expect(tokenize('thing set name ""')).toEqual(['thing', 'set', 'name', '']);
    expect(tokenize("thing set name ''")).toEqual(['thing', 'set', 'name', '']);
  });

  test('unquoted input is unchanged from the old split behaviour', () => {
    const line = 'display-rig switch laptop-only';
    expect(tokenize(line)).toEqual(line.split(' ').filter(Boolean));
  });
});
