import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import * as store from '../storage';
import { scenariosFromPgn, toPgn, fenParts } from '../chessutil';
import { h, confirmDialog, dialog, pickFile, saveFile, toast } from '../ui';
import { navigate } from '../router';

export function libraryView(root: HTMLElement): () => void {
  let boards: Api[] = [];
  let query = '';

  const list = h('div', { class: 'cards' });
  const search = h('input', {
    type: 'search',
    placeholder: 'Search title, source, tags…',
    oninput: (e: Event) => {
      query = (e.target as HTMLInputElement).value.toLowerCase();
      renderList();
    },
  });

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('h1', {}, 'Chess Scenarios'),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'primary', onclick: () => navigate('edit/new') }, '+ New position'),
        h('button', { onclick: doImport }, 'Import'),
        h('button', { onclick: doExport }, 'Export'),
      ),
    ),
    h('div', { class: 'library' }, search, list),
  );

  function destroyBoards() {
    boards.forEach(b => b.destroy());
    boards = [];
  }

  function renderList() {
    destroyBoards();
    list.replaceChildren();
    const items = store.loadAll().filter(s => !query || [s.title, s.source, s.goal, s.notes, ...s.tags].join(' ').toLowerCase().includes(query));
    if (!items.length) {
      list.append(h('p', { class: 'empty' }, query ? 'No positions match your search.' : 'No positions yet. Tap “New position” to set one up.'));
      return;
    }
    for (const s of items) {
      const boardEl = h('div', { class: 'thumb' });
      const card = h(
        'div',
        { class: 'card' },
        h('div', { class: 'thumb-wrap', onclick: () => navigate(`play/${s.id}`) }, boardEl),
        h(
          'div',
          { class: 'card-body' },
          h('h3', { onclick: () => navigate(`play/${s.id}`) }, s.title),
          s.goal ? h('div', { class: 'goal' }, s.goal) : null,
          s.source ? h('div', { class: 'source' }, s.source) : null,
          s.tags.length ? h('div', { class: 'tags' }, ...s.tags.map(t => h('span', { class: 'tag' }, t))) : null,
          h(
            'div',
            { class: 'card-actions' },
            h('button', { class: 'primary small', onclick: () => navigate(`play/${s.id}`) }, 'Play'),
            h('button', { class: 'small', onclick: () => navigate(`edit/${s.id}`) }, 'Edit'),
            h(
              'button',
              {
                class: 'small danger-text',
                onclick: async () => {
                  if (await confirmDialog('Delete position?', `“${s.title}” will be removed from your library.`, 'Delete', true)) {
                    store.remove(s.id);
                    renderList();
                  }
                },
              },
              'Delete',
            ),
          ),
        ),
      );
      list.append(card);
      boards.push(
        Chessground(boardEl, {
          fen: s.fen,
          viewOnly: true,
          coordinates: false,
          orientation: fenParts(s.fen).turn === 'b' ? 'black' : 'white',
          animation: { enabled: false },
          drawable: { enabled: false },
        }),
      );
    }
  }

  async function doImport() {
    const text = await pickFile('.json,.pgn,.txt,application/json,application/x-chess-pgn,text/plain');
    if (!text) return;
    const trimmed = text.trim();
    if (trimmed.startsWith('[{') || trimmed.startsWith('{') || trimmed === '[]') {
      try {
        const data = JSON.parse(trimmed);
        const items = Array.isArray(data) ? data : data.scenarios;
        const n = store.importMany(items ?? []);
        toast(`Imported ${n} position${n === 1 ? '' : 's'}`);
      } catch {
        toast('That file isn’t a valid backup');
      }
    } else {
      const choice = await dialog(
        'Import PGN',
        'For each game in the file, which position do you want to save?',
        [
          { label: 'Cancel', value: null },
          { label: 'Final position', value: 'final' },
          { label: 'Starting position', value: 'start', primary: true },
        ],
      );
      if (!choice) return;
      const { items, errors } = scenariosFromPgn(text, choice === 'final');
      const n = store.importMany(items);
      toast(`Imported ${n} position${n === 1 ? '' : 's'}${errors ? ` (${errors} couldn’t be read)` : ''}`, 3500);
    }
    renderList();
  }

  async function doExport() {
    const all = store.loadAll();
    if (!all.length) return toast('Nothing to export yet');
    const choice = await dialog(
      'Export library',
      'A backup file can be imported back into this app. PGN works with other chess apps such as Lichess.',
      [
        { label: 'Cancel', value: null },
        { label: 'PGN', value: 'pgn' },
        { label: 'Backup file', value: 'json', primary: true },
      ],
    );
    const date = new Date().toISOString().slice(0, 10);
    if (choice === 'json') await saveFile(`chess-scenarios-${date}.json`, JSON.stringify({ version: 1, scenarios: all }, null, 2), 'application/json');
    else if (choice === 'pgn') await saveFile(`chess-scenarios-${date}.pgn`, all.map(s => toPgn(s)).join('\n'), 'application/x-chess-pgn');
  }

  renderList();
  return destroyBoards;
}
