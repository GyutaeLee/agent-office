import { useEffect, useRef } from 'react';
import type { Session } from '../types';
import { activityZone, isVisibleSession, needsInput, projectName, sessionName } from '../types';
import { startGameLoop } from './gameLoop';
import art from './assets/layout.json';

const artUrls = import.meta.glob('./assets/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const imageCache = new Map<string, HTMLImageElement>();
const colors = ['#7b9c86', '#cb8d6e', '#6e94af', '#b293b2', '#ba9c5c', '#6c9f9c'];
type Zone = ReturnType<typeof activityZone>;
type Pose = 'think' | 'read' | 'command' | 'work';
interface Slot { session: Session; x: number; y: number; zone: Zone; crowded: boolean }
interface Character { x: number; y: number; tx: number; ty: number; persona: number; direction: number }

function imageFor(name: string) {
  let image = imageCache.get(name);
  if (!image) {
    image = new Image(); image.src = artUrls['./assets/' + name]; imageCache.set(name, image);
  }
  return image;
}
function personaFor(id: string) {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(hash) % art.sprites.count;
}
function slotsFor(sessions: Session[]): Slot[] {
  const sorted = [...sessions].sort((a, b) => projectName(a.project).localeCompare(projectName(b.project), 'ko') || sessionName(a).localeCompare(sessionName(b), 'ko') || a.id.localeCompare(b.id));
  const counts: Record<Zone, number> = { library: 0, servers: 0, workspace: 0 };
  const totals = { ...counts };
  for (const session of sorted) totals[activityZone(session)]++;
  return sorted.map(session => {
    const zone = activityZone(session), i = counts[zone]++, pool = art.slots[zone];
    let [x, y] = pool[i % pool.length];
    if (i >= pool.length) {
      const centerX = pool.reduce((sum, point) => sum + point[0], 0) / pool.length;
      const lastRow = Math.max(...pool.map(point => point[1]));
      const overflow = i - pool.length, columns = 6;
      const rows = Math.ceil((totals[zone] - pool.length) / columns);
      const rowSpacing = Math.min(58, Math.max(24, (610 - lastRow) / Math.max(1, rows)));
      x = centerX + (overflow % columns - (columns - 1) / 2) * 64;
      y = lastRow + (Math.floor(overflow / columns) + 1) * rowSpacing;
    }
    return { session, zone, x, y, crowded: i >= pool.length };
  });
}
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, fill: string, stroke?: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

export function OfficeCanvas({ sessions, selected, onSelect, animate = true, zoom = 1, onZoomChange }: { sessions: Session[]; selected: string | null; onSelect: (id: string) => void; animate?: boolean; zoom?: number; onZoomChange: (factor: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const current = useRef({ sessions, selected, onSelect, zoom, onZoomChange });
  current.current = { sessions, selected, onSelect, zoom, onZoomChange };
  const characters = useRef(new Map<string, Character>());
  const hitboxes = useRef<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const redraw = useRef<() => void>(() => {});
  const elapsed = useRef(0);

  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext('2d')!;
    const images = ['room.png', ...art.layers.map(layer => layer.image), ...Array.from({ length: art.sprites.count }, (_, i) => 'agent-' + i + '.png')].map(imageFor);
    const update = (dt: number) => {
      elapsed.current += dt;
      const slots = slotsFor(current.current.sessions.filter(isVisibleSession));
      const ids = new Set(slots.map(slot => slot.session.id));
      for (const id of characters.current.keys()) if (!ids.has(id)) characters.current.delete(id);
      for (const slot of slots) {
        let c = characters.current.get(slot.session.id);
        if (!c) {
          const [x, y] = slot.session.parent_id ? art.entry : [slot.x, slot.y];
          const used = new Set([...characters.current.values()].map(character => character.persona));
          let persona = personaFor(slot.session.id);
          if (used.size < art.sprites.count) while (used.has(persona)) persona = (persona + 1) % art.sprites.count;
          c = { x, y, tx: slot.x, ty: slot.y, persona, direction: 0 };
          characters.current.set(slot.session.id, c);
        }
        c.tx = slot.x; c.ty = slot.y;
        const dx = c.tx - c.x, dy = c.ty - c.y, distance = Math.hypot(dx, dy), step = 115 * dt;
        if (distance > step && distance > .5) {
          c.direction = dy >= 0 ? dx >= 0 ? 1 : 0 : dx >= 0 ? 2 : 3;
          c.x += dx / distance * step; c.y += dy / distance * step;
        } else { c.x = c.tx; c.y = c.ty; }
      }
    };
    const render = () => {
      const slots = slotsFor(current.current.sessions.filter(isVisibleSession));
      const rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const compact = rect.width < 620;
      const view = compact ? { x: 40, y: 0, w: 1200, h: 640 } : { x: 0, y: 0, w: art.width, h: art.height };
      const scale = Math.min(width / view.w, height / view.h) * current.current.zoom;
      const ox = (width - view.w * scale) / 2 - view.x * scale, oy = (height - view.h * scale) / 2 - view.y * scale;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.translate(ox, oy); ctx.scale(scale, scale);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const room = imageFor('room.png');
      if (room.complete && room.naturalWidth) ctx.drawImage(room, 0, 0, art.width, art.height);
      const text = (value: string, x: number, y: number, size: number, color: string, weight = 500) => {
        ctx.font = weight + ' ' + size + 'px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(value, x, y);
      };
      const drawAgent = (slot: Slot) => {
        const c = characters.current.get(slot.session.id); if (!c) return;
        const moving = Math.hypot(c.tx - c.x, c.ty - c.y) > 1;
        const activeTool = slot.session.status === 'tool' || slot.session.activity.startsWith('도구 실행 기록');
        const pose: Pose = !activeTool ? 'think' : slot.zone === 'library' ? 'read' : slot.zone === 'servers' ? 'command' : 'work';
        const key = moving ? 'walk-' + c.direction + ':' + Math.floor(elapsed.current * 8) % 6 : pose + ':' + Math.floor(elapsed.current * 4) % 4;
        const frame = (art.sprites.frames as Record<string, number>)[key] ?? 0;
        const [sw, sh] = art.sprites.cell, [ax, ay] = art.sprites.anchor;
        const spriteScale = art.sprites.scale * (slot.crowded ? .58 : 1);
        const sprite = imageFor('agent-' + c.persona + '.png'), picked = current.current.selected === slot.session.id;
        ctx.beginPath(); ctx.ellipse(c.x, c.y + 1, picked ? 18 : 12, picked ? 7 : 4.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = picked ? '#77978344' : '#334c4029'; ctx.fill();
        if (picked) { ctx.strokeStyle = '#5f8676'; ctx.lineWidth = 1.5; ctx.stroke(); }
        if (sprite.complete && sprite.naturalWidth) ctx.drawImage(sprite, frame % art.sprites.columns * sw, Math.floor(frame / art.sprites.columns) * sh, sw, sh, c.x - ax * spriteScale, c.y - ay * spriteScale, sw * spriteScale, sh * spriteScale);
        if (!moving && pose === 'think' && !needsInput(slot.session)) {
          for (let i = 0; i < 3; i++) {
            ctx.beginPath(); ctx.arc(c.x + 18 + i * 5, c.y - 59 - i * 3, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(93, 118, 104,' + (.35 + ((Math.floor(elapsed.current * 3) + i) % 3) * .2) + ')'; ctx.fill();
          }
        }
        if (needsInput(slot.session)) {
          rounded(ctx, c.x + 15, c.y - 65, 19, 20, 8, '#f4d59c', '#fdf6e5');
          text('?', c.x + 24.5, c.y - 55, 12, '#7e5f2b', 700);
        }
        hitboxes.current.push({ id: slot.session.id, x: ox + (c.x - 28) * scale, y: oy + (c.y - 75) * scale, w: 56 * scale, h: 82 * scale });
      };
      // Redraw foreground furniture by depth to occlude characters behind it.
      hitboxes.current = [];
      if (current.current.selected) for (const slot of slots) {
        if (!slot.session.parent_id || (slot.session.id !== current.current.selected && slot.session.parent_id !== current.current.selected)) continue;
        const child = characters.current.get(slot.session.id), parent = characters.current.get(slot.session.parent_id);
        if (!child || !parent) continue;
        ctx.save(); ctx.beginPath(); ctx.moveTo(parent.x, parent.y);
        ctx.quadraticCurveTo((parent.x + child.x) / 2, Math.min(parent.y, child.y) - 24, child.x, child.y);
        ctx.setLineDash([4, 5]); ctx.strokeStyle = '#6e93816b'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.restore();
      }
      const ordered = [
        ...art.layers.map(layer => ({ depth: layer.depth, draw: () => {
          const image = imageFor(layer.image), [x, y, w, h] = layer.rect;
          if (image.complete && image.naturalWidth) ctx.drawImage(image, x, y, w, h);
        } })),
        ...slots.map(slot => ({ depth: characters.current.get(slot.session.id)?.y ?? slot.y, draw: () => drawAgent(slot) })),
      ].sort((a, b) => a.depth - b.depth);
      ordered.forEach(item => item.draw());
      if (slots.some(slot => slot.zone === 'servers')) art.signals.forEach(([x, y], i) => {
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = (Math.floor(elapsed.current * 2) + i) % 4 === 0 ? '#c5f5dc' : '#a1c9c5'; ctx.fill();
      });
      if (!compact && slots.length <= 10) {
        const placed: { x: number; y: number; w: number }[] = [];
        for (const slot of slots.filter(slot => !slot.crowded)) {
          const c = characters.current.get(slot.session.id); if (!c) continue;
          const full = Array.from(sessionName(slot.session)), label = full.slice(0, 12).join('') + (full.length > 12 ? '…' : '');
          ctx.font = '600 10.5px -apple-system, BlinkMacSystemFont, sans-serif';
          const w = Math.min(155, Math.max(76, ctx.measureText(label).width + 28));
          const x = Math.max(w / 2 + 10, Math.min(art.width - w / 2 - 10, c.x));
          let y = c.y - 83;
          for (let i = 0; i < 4 && placed.some(p => Math.abs(p.x - x) < (p.w + w) / 2 + 5 && Math.abs(p.y - y) < 25); i++) y -= 25;
          placed.push({ x, y, w });
          const picked = current.current.selected === slot.session.id;
          if (y < c.y - 85) {
            ctx.beginPath(); ctx.moveTo(x, y + 11); ctx.lineTo(c.x, c.y - 64);
            ctx.strokeStyle = '#8c9a8c66'; ctx.lineWidth = 1; ctx.stroke();
          }
          ctx.save(); ctx.shadowColor = '#213b2f18'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
          rounded(ctx, x - w / 2, y - 11, w, 22, 8, picked ? '#365b4c' : '#fffefa', picked ? '#365b4c' : '#e0e3d8'); ctx.restore();
          ctx.beginPath(); ctx.arc(x - w / 2 + 11, y, 2.7, 0, Math.PI * 2);
          ctx.fillStyle = needsInput(slot.session) ? '#d1a554' : colors[c.persona]; ctx.fill();
          text(label, x + 5, y, 10.5, picked ? '#fffdf5' : '#43564b', 600);
          hitboxes.current.push({ id: slot.session.id, x: ox + (x - w / 2) * scale, y: oy + (y - 12) * scale, w: w * scale, h: 24 * scale });
        }
      }
      if (!slots.length && !compact) text('사무실이 잠시 조용해요', art.width / 2, 619, 12, '#899286');
    };
    const repaint = () => { update(0); render(); };
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      current.current.onZoomChange(Math.exp(-event.deltaY * 0.001));
    };
    redraw.current = repaint;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    for (const image of images) image.addEventListener('load', repaint);
    const resizeObserver = new ResizeObserver(repaint); resizeObserver.observe(canvas);
    repaint();
    const stop = animate && !document.hidden ? startGameLoop(canvas, { update, render }) : undefined;
    return () => {
      stop?.(); resizeObserver.disconnect(); canvas.removeEventListener('wheel', handleWheel); redraw.current = () => {};
      for (const image of images) image.removeEventListener('load', repaint);
    };
  }, [animate]);
  useEffect(() => { redraw.current(); }, [sessions, selected, zoom]);

  return <canvas ref={ref} className="office-canvas" role="img" aria-label={'미니어처 사무실 · ' + sessions.filter(isVisibleSession).length + '개 진행 중 세션'} onClick={e => {
    const canvas = ref.current!, rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * canvas.width / rect.width, y = (e.clientY - rect.top) * canvas.height / rect.height;
    const hit = [...hitboxes.current].reverse().find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (hit) current.current.onSelect(hit.id);
  }} />;
}
