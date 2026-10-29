import { addStroke, clampPoint, createBoard, deserializeBoard, moveToken, PEN_COLORS, ROLE_COLORS, serializeBoard, strokeDistance } from './board';
import type { Formation, Point, Stroke } from './board';
import './style.css';

type Arena = { length: number; width: number; height: number };
type Tool = 'move' | 'line' | 'arrow' | 'erase';
export function mountTactics(container: HTMLElement, getArena: () => Arena): { setActive(active: boolean): void; refresh(): void } {
  container.innerHTML = `<section class="tactics-workspace" aria-label="드론축구 전술판">
    <header class="tactics-heading"><div><p class="tactics-eyebrow">TEAM PLAY / STRATEGY BOARD</p><h1>함께 그리는 다음 작전</h1><p>말을 옮기고, 우리 팀의 움직임을 그려 보세요.</p></div><button type="button" data-action="png">PNG로 저장 ↓</button></header>
    <div class="tactics-toolbar" aria-label="전술 도구">
      <div class="tactics-tool-group"><button type="button" data-tool="move" aria-pressed="true">↖ 말 이동</button><button type="button" data-tool="line" aria-pressed="false">╱ 펜</button><button type="button" data-tool="arrow" aria-pressed="false">↗ 화살표</button><button type="button" data-tool="erase" aria-pressed="false">획 지우개</button></div>
      <div class="tactics-tool-group tactics-colors" aria-label="펜 색상">${PEN_COLORS.map((color, i) => `<button type="button" data-color="${color}" style="--ink:${color}" aria-label="${['흰색', '노랑', '초록'][i]} 펜" aria-pressed="${i === 0}"><span></span></button>`).join('')}</div>
      <button type="button" data-action="clear">그림 모두 지우기</button>
    </div>
    <div class="tactics-field-wrap"><canvas class="tactics-field" aria-label="전술 경기장. 말 이동 도구로 말을 끌거나 키보드 말 선택 후 방향키로 이동하세요."></canvas></div>
    <div class="tactics-field-caption"><span class="tactics-arena-size"></span><span>파랑 공격 → &nbsp; ← 빨강 공격</span></div>
    <footer class="tactics-controls"><div><span class="tactics-label">대형 배치</span><div class="tactics-tool-group"><button type="button" data-formation="default">기본 배치</button><button type="button" data-formation="attack">공격 대형</button><button type="button" data-formation="defend">수비 대형</button></div></div>
      <div><span class="tactics-label">작전 보관함</span><div class="tactics-slots">${[1, 2, 3].map(slot => `<div><button type="button" data-save="${slot}">저장 ${slot}</button><button type="button" data-load="${slot}">불러오기 ${slot}</button></div>`).join('')}</div></div>
    </footer>
    <div class="tactics-legend">${Object.entries(ROLE_COLORS).map(([role, color], i) => `<span><i style="background:${color}"></i>${role === 'S' ? '★ ' : ''}${role} ${['스트라이커', '가이드', '리베로', '스위퍼', '키퍼'][i]}</span>`).join('')}<span>★ 득점하는 드론</span></div>
    <div class="tactics-keyboard"><label>키보드 말 선택 <select aria-label="키보드로 이동할 말">${createBoard().tokens.map(token => `<option value="${token.id}">${token.team === 'blue' ? '파랑' : '빨강'} ${token.role}</option>`).join('')}</select></label><span>선택 후 방향키로 이동 · Shift로 크게 이동</span></div>
    <p class="tactics-status" role="status" aria-live="polite">말 이동 도구로 시작하세요. 그림은 말 위에 겹쳐 그릴 수 있어요.</p>
  </section>`;
  const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
  const context = canvas.getContext('2d')!;
  const status = container.querySelector<HTMLElement>('.tactics-status')!;
  const select = container.querySelector<HTMLSelectElement>('select')!;
  let board = createBoard();
  let active = false, tool: Tool = 'move', color = PEN_COLORS[0];
  let drag: string | null = null, pending: Stroke | null = null, pointer: number | null = null;
  let width = 1000, height = 440;
  const inset = 32;
  const fieldWidth = () => width - inset * 2;
  const fieldHeight = () => height - inset * 2;
  const pixel = (p: Point) => ({ x: inset + p.x * fieldWidth(), y: inset + p.y * fieldHeight() });
  const notify = (message: string) => { status.textContent = message; };
  function drawStroke(stroke: Stroke) {
    const points = stroke.points.map(pixel);
    context.strokeStyle = stroke.color; context.fillStyle = stroke.color; context.lineWidth = 3; context.lineJoin = 'round'; context.lineCap = 'round';
    context.beginPath(); points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.stroke();
    if (stroke.arrow && points.length > 1) {
      const last = points[points.length - 1];
      let before = points[points.length - 2];
      for (let i = points.length - 2; i >= 0; i--) { before = points[i]; if (Math.hypot(last.x - before.x, last.y - before.y) > 10) break; }
      const angle = Math.atan2(last.y - before.y, last.x - before.x);
      context.beginPath(); context.moveTo(last.x, last.y);
      context.lineTo(last.x - 15 * Math.cos(angle - .45), last.y - 15 * Math.sin(angle - .45));
      context.lineTo(last.x - 15 * Math.cos(angle + .45), last.y - 15 * Math.sin(angle + .45)); context.closePath(); context.fill();
    }
  }
  function draw() {
    const arena = getArena(), fw = fieldWidth(), fh = fieldHeight();
    context.clearRect(0, 0, width, height); context.fillStyle = '#091827'; context.fillRect(0, 0, width, height);
    context.fillStyle = '#102e45'; context.fillRect(inset, inset, fw / 2, fh);
    context.fillStyle = '#302332'; context.fillRect(width / 2, inset, fw / 2, fh);
    context.strokeStyle = '#3d566b'; context.lineWidth = 1;
    for (let x = 0; x <= arena.length; x += 2) { const px = inset + x / arena.length * fw; context.beginPath(); context.moveTo(px, inset); context.lineTo(px, height - inset); context.stroke(); }
    for (let y = 0; y <= arena.width; y += 2) { const py = inset + y / arena.width * fh; context.beginPath(); context.moveTo(inset, py); context.lineTo(width - inset, py); context.stroke(); }
    context.strokeStyle = '#829bb0'; context.lineWidth = 2; context.strokeRect(inset, inset, fw, fh);
    context.setLineDash([8, 8]); context.beginPath(); context.moveTo(width / 2, inset); context.lineTo(width / 2, height - inset); context.stroke(); context.setLineDash([]);
    context.beginPath(); context.arc(width / 2, height / 2, Math.min(32, fh / 6), 0, Math.PI * 2); context.stroke();
    for (const [x, teamColor] of [[1.5 / arena.length, '#65c8ff'], [1 - 1.5 / arena.length, '#ff8d9c']] as const) {
      const p = pixel({ x, y: .5 }); context.strokeStyle = teamColor; context.lineWidth = 6;
      context.beginPath(); context.moveTo(p.x, p.y - fh * .12); context.lineTo(p.x, p.y + fh * .12); context.stroke();
    }
    context.font = '600 12px system-ui'; context.textAlign = 'left'; context.fillStyle = '#8acdf5'; context.fillText('BLUE / 파랑 진영', inset, 21);
    context.textAlign = 'right'; context.fillStyle = '#ffa0af'; context.fillText('RED / 빨강 진영', width - inset, 21);
    board.strokes.forEach(drawStroke); if (pending) drawStroke(pending);
    const radius = Math.max(15, Math.min(24, fw / 28));
    for (const token of board.tokens) {
      const p = pixel(token); context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2);
      context.fillStyle = token.team === 'blue' ? '#1766b5' : '#b73c52'; context.fill();
      context.strokeStyle = ROLE_COLORS[token.role]; context.lineWidth = 4; context.stroke();
      context.fillStyle = '#fff'; context.font = `800 ${radius * .8}px system-ui`; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(token.role, p.x, p.y + 1);
      if (token.role === 'S') { context.fillStyle = ROLE_COLORS.S; context.font = 'bold 17px system-ui'; context.fillText('★', p.x, p.y - radius - 10); }
    }
    context.textBaseline = 'alphabetic';
  }
  function refresh() {
    if (!active) return;
    const arena = getArena(); width = Math.max(80, canvas.parentElement!.clientWidth || 1000); height = Math.round((width - 64) * arena.width / arena.length + 64);
    const ratio = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    canvas.style.height = `${height}px`; context.setTransform(ratio, 0, 0, ratio, 0, 0);
    container.querySelector('.tactics-arena-size')!.textContent = `${arena.length} × ${arena.width} m · 위에서 본 경기장`;
    draw();
  }
  function point(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return clampPoint({ x: ((event.clientX - rect.left) * width / rect.width - inset) / fieldWidth(), y: ((event.clientY - rect.top) * height / rect.height - inset) / fieldHeight() });
  }
  function erase(p: Point) {
    for (let i = board.strokes.length - 1; i >= 0; i--) {
      if (strokeDistance(board.strokes[i], p, fieldWidth(), fieldHeight()) < 18) { board = { ...board, strokes: board.strokes.filter((_, index) => index !== i) }; break; }
    }
  }
  function cancelGesture() {
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    pointer = null; drag = null; pending = null;
  }
  canvas.addEventListener('pointerdown', event => {
    if (!active || pointer !== null || event.button !== 0) return;
    pointer = event.pointerId; canvas.setPointerCapture(pointer); event.preventDefault(); const p = point(event);
    if (tool === 'move') {
      const hit = [...board.tokens].reverse().find(token => Math.hypot((token.x - p.x) * fieldWidth(), (token.y - p.y) * fieldHeight()) < 30);
      drag = hit?.id ?? null; if (drag) select.value = drag;
    } else if (tool === 'erase') erase(p);
    else pending = { color, arrow: tool === 'arrow', points: [p] };
    draw();
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return; event.preventDefault(); const p = point(event);
    if (drag) board = moveToken(board, drag, p);
    else if (pending) pending.points.push(p);
    else if (tool === 'erase') erase(p);
    draw();
  });
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    if (pending) { pending.points.push(point(event)); board = addStroke(board, pending); }
    cancelGesture(); draw();
  });
  canvas.addEventListener('pointercancel', () => { cancelGesture(); draw(); });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; drag = null; pending = null; draw(); });
  select.addEventListener('keydown', event => {
    if (!active || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const token = board.tokens.find(item => item.id === select.value)!; const step = event.shiftKey ? .05 : .01;
    board = moveToken(board, token.id, { x: token.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y: token.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }); draw();
  });
  container.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
    cancelGesture();
    if (button.dataset.tool) {
      tool = button.dataset.tool as Tool;
      container.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      canvas.style.cursor = tool === 'move' ? 'grab' : 'crosshair';
    }
    if (button.dataset.color) { color = button.dataset.color; container.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); }
    if (button.dataset.formation) { board = { ...createBoard(button.dataset.formation as Formation), strokes: board.strokes }; notify(`${button.textContent} 적용 · 빨강은 파랑과 좌우 대칭이에요.`); }
    if (button.dataset.action === 'clear') { board = { ...board, strokes: [] }; notify('그림을 모두 지웠어요. 말 배치는 그대로예요.'); }
    if (button.dataset.save) {
      try { localStorage.setItem(`drone-tactics-slot-${button.dataset.save}`, serializeBoard(board)); notify(`보관함 ${button.dataset.save}에 저장했어요.`); }
      catch { notify('저장 공간을 사용할 수 없어요. PNG로 저장해 주세요.'); }
    }
    if (button.dataset.load) {
      try { const raw = localStorage.getItem(`drone-tactics-slot-${button.dataset.load}`); const loaded = raw ? deserializeBoard(raw) : null; if (loaded) { board = loaded; notify(`보관함 ${button.dataset.load}을 불러왔어요.`); } else notify('저장된 작전이 없거나 읽을 수 없어요.'); }
      catch { notify('이 브라우저에서 보관함을 읽을 수 없어요.'); }
    }
    draw();
    if (button.dataset.action === 'png') {
      canvas.toBlob(blob => {
        if (!blob) { notify('이미지를 만들지 못했어요. 다시 시도해 주세요.'); return; }
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = '드론축구-전술판.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('현재 전술판 PNG를 저장했어요.');
      }, 'image/png');
    }
  });
  new ResizeObserver(refresh).observe(canvas.parentElement!);
  return { setActive(value) { active = value; if (!value) cancelGesture(); else refresh(); }, refresh };
}
