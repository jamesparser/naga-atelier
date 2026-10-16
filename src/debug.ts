/** Dev-only panel (?debug=1). Not shown in production URLs without the flag. */
interface DebugApi {
  apply(raw: unknown): { ok: boolean; speech?: string };
  say(text: string): Promise<void>;
  export(): void;
  stats(): Record<string, unknown>;
  blueprints: readonly string[];
  onboarding: { start(force?: boolean): void };
}

export function mountDebugPanel(api: DebugApi): void {
  const el = document.createElement('div');
  el.id = 'debug';
  el.innerHTML = `
    <h3>Spawn</h3><div class="bps"></div>
    <h3>World</h3>
    <button data-c='{"type":"undo"}'>undo</button><button data-c='{"type":"redo"}'>redo</button>
    <button data-c='{"type":"clear"}'>clear</button><button data-c='{"type":"color","target":"roof","color":"roof_red"}'>roof red</button>
    <button data-c='{"type":"scale","scale":1.25}'>bigger</button><button data-c='{"type":"rotate","turns":1}'>rotate</button>
    <button class="exp">export html</button><button class="tut">replay tutorial</button>
    <h3>Say (text → agent)</h3><input class="say" placeholder="build a small house" />
    <h3>Raw command JSON</h3><textarea class="raw" rows="3">{"v":1,"type":"build","blueprintId":"tower","anchor":"desk_left"}</textarea>
    <button class="send">apply</button>
    <h3>Stats</h3><div class="stats"></div>`;
  document.body.appendChild(el);
  const bps = el.querySelector('.bps')!;
  for (const id of api.blueprints) {
    const b = document.createElement('button');
    b.textContent = id;
    b.dataset.c = JSON.stringify({ type: 'build', blueprintId: id });
    bps.appendChild(b);
  }
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset.c) api.apply(JSON.parse(t.dataset.c));
    if (t.classList.contains('exp')) api.export();
    if (t.classList.contains('tut')) api.onboarding.start(true);
    if (t.classList.contains('send')) {
      try {
        const r = api.apply(JSON.parse((el.querySelector('.raw') as HTMLTextAreaElement).value));
        if (!r.ok) console.warn(r.speech);
      } catch (err) {
        console.warn(err);
      }
    }
  });
  const input = el.querySelector('.say') as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      void api.say(input.value.trim());
      input.value = '';
    }
  });
  const stats = el.querySelector('.stats')!;
  setInterval(() => {
    stats.textContent = Object.entries(api.stats())
      .map(([k, v]) => `${k.padEnd(8)} ${v}`)
      .join('\n');
  }, 500);
}
