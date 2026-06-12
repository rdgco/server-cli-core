/**
 * Tests for modules/help/help-commands.js — the `help` module.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { handle, autocomplete } from './help-commands.js';
import { setModules, clearModules } from '../../lib/module-registry.js';

// A module that exposes a `commands` registry (new shape).
const registryModule = {
  metadata: { name: 'Demo', description: 'A demo module' },
  commands: {
    run: { usage: 'run <x>', description: 'Run it', handler: () => true },
    stop: { description: 'Stop it', handler: () => true }
  }
};

// A module that declares commands the old way, via metadata.commands.
const legacyModule = {
  metadata: {
    name: 'Legacy',
    description: 'Old-style module',
    commands: { ping: 'Ping the thing' }
  }
};

// A module with neither commands shape.
const bareModule = {
  metadata: { name: 'Bare', description: 'Nothing here' }
};

describe('modules/help/help-commands.js', () => {
  let logSpy;

  beforeEach(() => {
    setModules({ demo: registryModule, legacy: legacyModule, bare: bareModule });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    clearModules();
    jest.restoreAllMocks();
  });

  const output = () => logSpy.mock.calls.flat().join('\n');

  describe('handle() — summary', () => {
    test('lists built-in commands and available modules when no module is given', async () => {
      expect(await handle([])).toBe(true);
      const text = output();
      expect(text).toContain('Built-in commands:');
      expect(text).toContain('Available modules:');
      expect(text).toContain('demo');
      expect(text).toContain('A demo module');
    });

    test('sorts modules alphabetically', async () => {
      await handle([]);
      const text = output();
      expect(text.indexOf('bare')).toBeLessThan(text.indexOf('demo'));
      expect(text.indexOf('demo')).toBeLessThan(text.indexOf('legacy'));
    });
  });

  describe('handle() — module detail', () => {
    test('renders a registry-style module\'s commands', async () => {
      expect(await handle(['demo'])).toBe(true);
      const text = output();
      expect(text).toContain('Demo - A demo module');
      expect(text).toContain('demo run <x>');
      expect(text).toContain('Run it');
    });

    test('renders a legacy metadata.commands module', async () => {
      expect(await handle(['legacy'])).toBe(true);
      const text = output();
      expect(text).toContain('legacy ping');
      expect(text).toContain('Ping the thing');
    });

    test('handles a module with no declared commands', async () => {
      expect(await handle(['bare'])).toBe(true);
      expect(output()).toContain('(no commands declared)');
    });

    test('is case-insensitive on the module name', async () => {
      expect(await handle(['DEMO'])).toBe(true);
      expect(output()).toContain('Demo - A demo module');
    });

    test('reports an unknown module and returns false', async () => {
      expect(await handle(['nope'])).toBe(false);
      expect(output()).toContain('Unknown module: nope');
    });
  });

  describe('autocomplete()', () => {
    test('completes module names at the second word', () => {
      const [completions] = autocomplete(['help', 'de'], 'help de');
      expect(completions).toContain('help demo');
    });

    test('returns nothing outside the module-name position', () => {
      expect(autocomplete(['help'], 'help')[0]).toEqual([]);
      expect(autocomplete(['help', 'demo', 'extra'], 'help demo extra')[0]).toEqual([]);
    });
  });
});
