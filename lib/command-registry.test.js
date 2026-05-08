/**
 * Tests for lib/command-registry.js
 */

import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach } from '@jest/globals';

import { createDispatcher, flattenCommands } from './command-registry.js';

describe('createDispatcher — validation', () => {
  test('throws when prefix is missing or empty', () => {
    expect(() => createDispatcher({ commands: { x: { handler: () => true } } }))
      .toThrow(/prefix/);
    expect(() => createDispatcher({ prefix: '', commands: { x: { handler: () => true } } }))
      .toThrow(/prefix/);
  });

  test('throws when commands is missing or wrong type', () => {
    expect(() => createDispatcher({ prefix: 'a' })).toThrow(/commands/);
    expect(() => createDispatcher({ prefix: 'a', commands: 'nope' })).toThrow(/commands/);
  });

  test('throws when entry has neither handler nor subcommands', () => {
    expect(() => createDispatcher({
      prefix: 'a',
      commands: { foo: { description: 'no handler' } }
    })).toThrow(/handler or subcommands/);
  });

  test('throws when handler is not a function', () => {
    expect(() => createDispatcher({
      prefix: 'a',
      commands: { foo: { handler: 'not-a-fn' } }
    })).toThrow(/handler must be a function/);
  });

  test('throws when autocomplete is not an array', () => {
    expect(() => createDispatcher({
      prefix: 'a',
      commands: { foo: { handler: () => true, autocomplete: () => [] } }
    })).toThrow(/autocomplete must be an array/);
  });

  test('throws when command key contains a space', () => {
    expect(() => createDispatcher({
      prefix: 'a',
      commands: { 'bad key': { handler: () => true } }
    })).toThrow(/must not contain spaces/);
  });

  test('throws when defaultCommand is not in registry', () => {
    expect(() => createDispatcher({
      prefix: 'a',
      commands: { foo: { handler: () => true } },
      defaultCommand: 'nope'
    })).toThrow(/defaultCommand 'nope'/);
  });

  test('validates nested subcommands', () => {
    expect(() => createDispatcher({
      prefix: 'a',
      commands: {
        group: {
          subcommands: {
            broken: { description: 'no handler' }
          }
        }
      }
    })).toThrow(/handler or subcommands/);
  });
});

describe('createDispatcher — handle', () => {
  let listFn, addFn, saveFn, fallbackFn;
  let dispatcher;

  beforeEach(() => {
    listFn = jest.fn(() => true);
    addFn = jest.fn(() => true);
    saveFn = jest.fn(() => true);
    fallbackFn = jest.fn(() => false);

    dispatcher = createDispatcher({
      prefix: 'mod',
      commands: {
        list: { description: 'list', handler: listFn },
        add: { description: 'add', handler: addFn },
        config: {
          description: 'config',
          subcommands: {
            save: { description: 'save', handler: saveFn }
          },
          handler: jest.fn(() => true)
        }
      },
      fallback: fallbackFn
    });
  });

  test('dispatches a known top-level command', async () => {
    const result = await dispatcher.handle(['list']);
    expect(listFn).toHaveBeenCalledWith([]);
    expect(result).toBe(true);
  });

  test('passes args to handler', async () => {
    await dispatcher.handle(['add', 'one', 'two']);
    expect(addFn).toHaveBeenCalledWith(['one', 'two']);
  });

  test('uses defaultCommand when args are empty', async () => {
    const d = createDispatcher({
      prefix: 'mod',
      commands: { list: { handler: listFn } },
      defaultCommand: 'list'
    });
    await d.handle([]);
    expect(listFn).toHaveBeenCalled();
  });

  test('infers defaultCommand from list/info/status if not specified', async () => {
    const infoFn = jest.fn(() => true);
    const d = createDispatcher({
      prefix: 'mod',
      commands: { info: { handler: infoFn } }
    });
    await d.handle([]);
    expect(infoFn).toHaveBeenCalled();
  });

  test('prefers list over info over status when inferring', async () => {
    const listSpy = jest.fn(() => true);
    const infoSpy = jest.fn(() => true);
    const d = createDispatcher({
      prefix: 'mod',
      commands: {
        list: { handler: listSpy },
        info: { handler: infoSpy }
      }
    });
    await d.handle([]);
    expect(listSpy).toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  test('prints available and returns false when no default is inferable', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const d = createDispatcher({
      prefix: 'mod',
      commands: { foo: { handler: jest.fn() } }
    });
    const result = await d.handle([]);
    expect(result).toBe(false);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('descends into a matching subcommand', async () => {
    await dispatcher.handle(['config', 'save', 'profile-name']);
    expect(saveFn).toHaveBeenCalledWith(['profile-name']);
  });

  test('falls through to entry handler when no subcommand matches', async () => {
    const configHandler = dispatcher.commands.config.handler;
    await dispatcher.handle(['config', 'fftSize', '1024']);
    expect(saveFn).not.toHaveBeenCalled();
    expect(configHandler).toHaveBeenCalledWith(['fftSize', '1024']);
  });

  test('returns "exit" passthrough from handler', async () => {
    const exitHandler = jest.fn(() => 'exit');
    const d = createDispatcher({
      prefix: 'mod',
      commands: { quit: { handler: exitHandler } }
    });
    const result = await d.handle(['quit']);
    expect(result).toBe('exit');
  });

  test('calls fallback when no command matches', async () => {
    const fb = jest.fn(() => true);
    const d = createDispatcher({
      prefix: 'mod',
      commands: { foo: { handler: jest.fn() } },
      fallback: fb
    });
    const result = await d.handle(['unknown', 'arg']);
    expect(fb).toHaveBeenCalledWith(['unknown', 'arg']);
    expect(result).toBe(true);
  });

  test('emits unknown-command error when fallback returns falsy', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await dispatcher.handle(['nope']);
    expect(result).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/Unknown mod command/));
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('subcommand-only entry prints available subcommands when called bare', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const d = createDispatcher({
      prefix: 'mod',
      commands: {
        group: {
          subcommands: {
            list: { handler: jest.fn() }
          }
        }
      }
    });
    const result = await d.handle(['group']);
    expect(result).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/mod group list/));
    logSpy.mockRestore();
  });

  test('subcommand-only entry errors on unknown subcommand', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const d = createDispatcher({
      prefix: 'mod',
      commands: {
        group: {
          subcommands: {
            list: { handler: jest.fn() }
          }
        }
      }
    });
    const result = await d.handle(['group', 'nope']);
    expect(result).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/Unknown command: mod group nope/));
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('createDispatcher — autocomplete', () => {
  let dispatcher;

  beforeEach(() => {
    dispatcher = createDispatcher({
      prefix: 'mod',
      commands: {
        list: { description: 'list', handler: () => true },
        load: { description: 'load', handler: () => true },
        add: {
          description: 'add',
          handler: () => true,
          autocomplete: [p => ['alpha', 'beta'].filter(x => x.startsWith(p))]
        },
        config: {
          description: 'config',
          subcommands: {
            save: {
              handler: () => true,
              autocomplete: [p => ['profile-a', 'profile-b'].filter(x => x.startsWith(p))]
            },
            load: { handler: () => true }
          },
          handler: () => true,
          autocomplete: [p => ['fftSize', 'smoothing'].filter(x => x.startsWith(p))]
        },
        patch: {
          handler: () => true,
          autocomplete: [
            p => ['universe-a', 'universe-b'].filter(x => x.startsWith(p)),
            p => ['fixture-rgb', 'fixture-rgbw'].filter(x => x.startsWith(p)),
            null, // address: no completion
            null // name: no completion
          ]
        }
      }
    });
  });

  test('completes top-level command names by prefix', () => {
    const [completions] = dispatcher.autocomplete(['mod', 'l'], 'mod l');
    expect(completions).toEqual(['mod list', 'mod load']);
  });

  test('returns all top-level commands on empty partial', () => {
    const [completions] = dispatcher.autocomplete(['mod', ''], 'mod ');
    expect(completions).toContain('mod list');
    expect(completions).toContain('mod add');
    expect(completions).toContain('mod config');
    expect(completions).toContain('mod patch');
  });

  test('preserves the line argument', () => {
    const [, line] = dispatcher.autocomplete(['mod', 'l'], 'mod l');
    expect(line).toBe('mod l');
  });

  test('completes first positional argument', () => {
    const [completions] = dispatcher.autocomplete(['mod', 'add', 'a'], 'mod add a');
    expect(completions).toEqual(['mod add alpha']);
  });

  test('returns empty when no completer at the cursor position', () => {
    const [completions] = dispatcher.autocomplete(['mod', 'list', 'foo'], 'mod list foo');
    expect(completions).toEqual([]);
  });

  test('completes both subcommand names AND parameter values at the same position', () => {
    const [completions] = dispatcher.autocomplete(['mod', 'config', 's'], 'mod config s');
    expect(completions).toContain('mod config save');
    expect(completions).toContain('mod config smoothing');
  });

  test('descends into a chosen subcommand for further completion', () => {
    const [completions] = dispatcher.autocomplete(['mod', 'config', 'save', 'pro'], 'mod config save pro');
    expect(completions).toEqual(['mod config save profile-a', 'mod config save profile-b']);
  });

  test('completes second positional argument with prior arg preserved in path', () => {
    const [completions] = dispatcher.autocomplete(['mod', 'patch', 'universe-a', 'fixture-r'], 'mod patch universe-a fixture-r');
    expect(completions).toEqual([
      'mod patch universe-a fixture-rgb',
      'mod patch universe-a fixture-rgbw'
    ]);
  });

  test('returns empty when path falls off a leaf entry', () => {
    const [completions] = dispatcher.autocomplete(['mod', 'unknown', 'x'], 'mod unknown x');
    expect(completions).toEqual([]);
  });

  test('returns empty when called with no parts', () => {
    const [completions] = dispatcher.autocomplete([], '');
    expect(completions).toEqual([]);
  });

  test('passes previousArgs to completers so position N can depend on earlier positions', () => {
    const connectorCompleter = jest.fn((partial, previousArgs) => {
      // Pretend the available connectors depend on source + destination
      if (previousArgs[0] === 'src-a' && previousArgs[1] === 'dest-x') {
        return ['conn-ax-1', 'conn-ax-2'].filter(c => c.startsWith(partial));
      }
      if (previousArgs[0] === 'src-b' && previousArgs[1] === 'dest-y') {
        return ['conn-by-1'].filter(c => c.startsWith(partial));
      }
      return [];
    });
    const d = createDispatcher({
      prefix: 'route',
      commands: {
        add: {
          handler: jest.fn(),
          autocomplete: [
            p => ['src-a', 'src-b'].filter(x => x.startsWith(p)),
            p => ['dest-x', 'dest-y'].filter(x => x.startsWith(p)),
            connectorCompleter
          ]
        }
      }
    });
    const [completionsAX] = d.autocomplete(['route', 'add', 'src-a', 'dest-x', 'conn'], 'route add src-a dest-x conn');
    expect(connectorCompleter).toHaveBeenLastCalledWith('conn', ['src-a', 'dest-x']);
    expect(completionsAX).toEqual([
      'route add src-a dest-x conn-ax-1',
      'route add src-a dest-x conn-ax-2'
    ]);

    const [completionsBY] = d.autocomplete(['route', 'add', 'src-b', 'dest-y', ''], 'route add src-b dest-y ');
    expect(connectorCompleter).toHaveBeenLastCalledWith('', ['src-b', 'dest-y']);
    expect(completionsBY).toEqual(['route add src-b dest-y conn-by-1']);
  });

  test('passes empty previousArgs to position-0 completer for consistency', () => {
    const completer = jest.fn(() => ['alpha']);
    const d = createDispatcher({
      prefix: 'mod',
      commands: { add: { handler: jest.fn(), autocomplete: [completer] } }
    });
    d.autocomplete(['mod', 'add', 'a'], 'mod add a');
    expect(completer).toHaveBeenCalledWith('a', []);
  });
});

describe('createDispatcher — fallbackAutocomplete', () => {
  test('throws when fallbackAutocomplete is not a function', () => {
    expect(() => createDispatcher({
      prefix: 'mod',
      commands: { list: { handler: () => true } },
      fallbackAutocomplete: 'not-a-fn'
    })).toThrow(/fallbackAutocomplete must be a function/);
  });

  test('appends fallback contributions to registry matches at position 0', () => {
    const screenNames = ['leftscreen', 'centerscreen', 'rightscreen'];
    const d = createDispatcher({
      prefix: 'screen',
      commands: {
        list: { handler: jest.fn() },
        detect: { handler: jest.fn() }
      },
      fallbackAutocomplete: parts => {
        const partial = parts[1] || '';
        const matches = screenNames.filter(n => n.startsWith(partial)).map(n => `screen ${n}`);
        return [matches, parts.join(' ')];
      }
    });
    const [completions] = d.autocomplete(['screen', ''], 'screen ');
    expect(completions).toContain('screen list');
    expect(completions).toContain('screen detect');
    expect(completions).toContain('screen leftscreen');
    expect(completions).toContain('screen centerscreen');
    expect(completions).toContain('screen rightscreen');
  });

  test('filters fallback contributions by partial just like registry matches', () => {
    const d = createDispatcher({
      prefix: 'screen',
      commands: { list: { handler: jest.fn() } },
      fallbackAutocomplete: parts => {
        const partial = parts[1] || '';
        const all = ['leftscreen', 'rightscreen'];
        return [all.filter(n => n.startsWith(partial)).map(n => `screen ${n}`), parts.join(' ')];
      }
    });
    const [completions] = d.autocomplete(['screen', 'l'], 'screen l');
    expect(completions).toContain('screen list');
    expect(completions).toContain('screen leftscreen');
    expect(completions).not.toContain('screen rightscreen');
  });

  test('delegates entirely to fallback when first arg is not a registry command', () => {
    const fallbackFn = jest.fn(() => [['screen leftscreen terminal'], 'screen leftscreen ']);
    const d = createDispatcher({
      prefix: 'screen',
      commands: { list: { handler: jest.fn() } },
      fallbackAutocomplete: fallbackFn
    });
    const [completions] = d.autocomplete(['screen', 'leftscreen', ''], 'screen leftscreen ');
    expect(fallbackFn).toHaveBeenCalledWith(
      ['screen', 'leftscreen', ''],
      'screen leftscreen '
    );
    expect(completions).toEqual(['screen leftscreen terminal']);
  });

  test('does not invoke fallback when first arg matches a registry command', () => {
    const fallbackFn = jest.fn(() => [['should-not-appear'], 'x']);
    const d = createDispatcher({
      prefix: 'mod',
      commands: {
        cfg: {
          handler: jest.fn(),
          autocomplete: [p => ['option-a', 'option-b'].filter(x => x.startsWith(p))]
        }
      },
      fallbackAutocomplete: fallbackFn
    });
    const [completions] = d.autocomplete(['mod', 'cfg', 'opt'], 'mod cfg opt');
    expect(fallbackFn).not.toHaveBeenCalled();
    expect(completions).toEqual(['mod cfg option-a', 'mod cfg option-b']);
  });

  test('handles fallback returning null/undefined gracefully', () => {
    const d = createDispatcher({
      prefix: 'mod',
      commands: { list: { handler: jest.fn() } },
      fallbackAutocomplete: () => null
    });
    const [completions] = d.autocomplete(['mod', 'unknown', 'x'], 'mod unknown x');
    expect(completions).toEqual([]);
  });
});

describe('flattenCommands', () => {
  test('flattens a flat registry to one entry per command', () => {
    const flat = flattenCommands({
      list: { description: 'list things' },
      add: { usage: 'add <n>', description: 'add a thing' }
    });
    expect(flat).toEqual([
      { command: 'list', usage: 'list', description: 'list things' },
      { command: 'add', usage: 'add <n>', description: 'add a thing' }
    ]);
  });

  test('walks subcommands recursively with full prefix', () => {
    const flat = flattenCommands({
      group: {
        description: 'group',
        subcommands: {
          list: { description: 'list groups' },
          add: { usage: 'add <slug>', description: 'create a group' }
        }
      }
    });
    expect(flat).toEqual([
      { command: 'group', usage: 'group', description: 'group' },
      { command: 'group list', usage: 'group list', description: 'list groups' },
      { command: 'group add', usage: 'group add <slug>', description: 'create a group' }
    ]);
  });

  test('skips entries with neither handler nor description', () => {
    // A pure namespace shell — no help line of its own, only subcommands
    const flat = flattenCommands({
      group: {
        subcommands: {
          list: { description: 'list groups', handler: () => {} }
        }
      }
    });
    expect(flat).toEqual([
      { command: 'group list', usage: 'group list', description: 'list groups' }
    ]);
  });

  test('uses the explicit prefix argument when given', () => {
    const flat = flattenCommands(
      { list: { description: 'list' } },
      'audio'
    );
    expect(flat).toEqual([
      { command: 'audio list', usage: 'audio list', description: 'list' }
    ]);
  });
});
