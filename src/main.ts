import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import * as store from './storage';
import { PACKS } from './samples';
import { toast } from './ui';
import { currentRoute } from './router';
import { libraryView } from './views/library';
import { editorView } from './views/editor';
import { playView } from './views/play';

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

function render() {
  cleanup?.();
  app.replaceChildren();
  window.scrollTo(0, 0);
  const [view, id] = currentRoute();
  if (view === 'edit' && id) cleanup = editorView(app, id);
  else if (view === 'play' && id) cleanup = playView(app, id);
  else cleanup = libraryView(app);
}

const added = store.addNewPacks(PACKS);
if (added && store.loadAll().length > added) setTimeout(() => toast(`Added ${added} new positions to your library`, 3500), 300);
store.requestPersistence();
window.addEventListener('hashchange', render);
render();
registerSW({ immediate: true });
