// Small DOM helpers shared by the views.

type Attrs = Record<string, string | number | boolean | ((e: any) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function toast(msg: string, ms = 2500): void {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/** Modal dialog; resolves with the value of the button pressed (or null if dismissed). */
export function dialog<T>(title: string, body: Node | string, buttons: { label: string; value: T; primary?: boolean; danger?: boolean }[]): Promise<T | null> {
  return new Promise(resolve => {
    const close = (v: T | null) => {
      overlay.remove();
      resolve(v);
    };
    const overlay = h(
      'div',
      { class: 'overlay', onclick: (e: Event) => e.target === overlay && close(null) },
      h(
        'div',
        { class: 'dialog' },
        h('h2', {}, title),
        typeof body === 'string' ? h('p', {}, body) : body,
        h(
          'div',
          { class: 'dialog-buttons' },
          ...buttons.map(b => h('button', { class: b.primary ? 'primary' : b.danger ? 'danger' : '', onclick: () => close(b.value) }, b.label)),
        ),
      ),
    );
    document.body.append(overlay);
  });
}

export function confirmDialog(title: string, msg: string, okLabel = 'OK', danger = false): Promise<boolean> {
  return dialog(title, msg, [
    { label: 'Cancel', value: false },
    { label: okLabel, value: true, primary: !danger, danger },
  ]).then(v => v === true);
}

/** Saves text as a file. On iPad this opens the share/save sheet. */
export async function saveFile(name: string, text: string, type = 'text/plain'): Promise<void> {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function pickFile(accept: string): Promise<string | null> {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    });
    input.click();
  });
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Couldn’t copy');
  }
}
