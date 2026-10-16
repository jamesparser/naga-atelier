/** In-headset "how to play" card: a canvas panel that stands on the desk next to a game. */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

export function helpCard(title: string, sections: Array<{ head: string; lines: string[] }>, width = 0.17): Mesh {
  const c = document.createElement('canvas');
  c.width = 640;
  const g0 = c.getContext('2d')!;
  // measure height first
  g0.font = '500 30px system-ui, sans-serif';
  const wrap = (text: string, max: number): string[] => {
    const words = text.split(' ');
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (g0.measureText(t).width > max && cur) {
        out.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  };
  const blocks = sections.map((s) => ({ head: s.head, lines: s.lines.flatMap((l) => wrap(l, 560)) }));
  const h = 90 + blocks.reduce((a, b) => a + 56 + b.lines.length * 38 + 14, 0);
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,18,28,0.82)';
  g.beginPath();
  g.roundRect(4, 4, c.width - 8, h - 8, 32);
  g.fill();
  g.strokeStyle = 'rgba(255,209,102,0.6)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#ffd166';
  g.font = '800 40px system-ui, sans-serif';
  g.fillText(title, 32, 62);
  let y = 112;
  for (const b of blocks) {
    g.fillStyle = '#7fd8ff';
    g.font = '700 32px system-ui, sans-serif';
    g.fillText(b.head.toUpperCase(), 32, y);
    y += 42;
    g.fillStyle = '#eaf6ff';
    g.font = '500 30px system-ui, sans-serif';
    for (const l of b.lines) {
      g.fillText(l, 40, y);
      y += 38;
    }
    y += 14;
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new Mesh(new PlaneGeometry(width, (width * h) / c.width), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.renderOrder = 12;
  return m;
}
