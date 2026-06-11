import { getHistory, clearHistory as clearHistoryLib, getStats } from '../../lib/history.js';
import { createDispatcher } from '../../lib/command-registry.js';

export const metadata = {
  name: 'History',
  prefix: 'history',
  description: 'View and manage command history'
};

export const commands = {
  list: {
    description: 'Show command history',
    handler: () => list()
  },
  clear: {
    description: 'Clear all history',
    handler: () => clear()
  },
  stats: {
    description: 'Show history statistics',
    handler: () => stats()
  }
};

const dispatcher = createDispatcher({
  prefix: 'history',
  commands,
  defaultCommand: 'list'
});

export const handle = dispatcher.handle;
export const autocomplete = dispatcher.autocomplete;

function list() {
  const history = getHistory();

  if (history.length === 0) {
    console.log('No command history');
    return true;
  }

  console.log('\nCommand History:');
  console.log('─────────────────────────────────────────────');

  history.forEach((cmd, index) => {
    console.log(`${(index + 1).toString().padStart(4)}. ${cmd}`);
  });

  console.log(`\nTotal: ${history.length} command(s)`);
  return true;
}

function clear() {
  clearHistoryLib();
  console.log('Command history cleared');
  return true;
}

function stats() {
  const historyStats = getStats();

  console.log('\nHistory Statistics:');
  console.log('─────────────────────────────────────────────');
  console.log(`Current entries: ${historyStats.count}`);
  console.log(`Maximum entries: ${historyStats.maxSize}`);
  console.log(`History file:    ${historyStats.file}`);

  return true;
}
