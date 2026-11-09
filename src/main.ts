import {
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { autoStep } from './core/autopilot';
import { formatMinute } from './core/clock';
import { Game } from './core/game';
import type { HotelDef } from './core/hotels';
import { buyUpgrade, dayConfigFor, isCompleted, isUnlocked, progressOf, recordDay, reputationOf, settleDay, upgradesOf, type SaveData } from './core/progress';
import { pickRegularVisits } from './core/regulars';
import { reputationLabel } from './core/reputation';
import { Rng } from './core/rng';
import { validateScenarios } from './core/scenarios';
import { storyFor, type StoryBeat } from './core/story';
import { UPGRADES } from './core/upgrades';
import { HOTELS } from './data/hotels';
import { RECEPTIONIST } from './data/looks';
import { OWNER_VISITS, pickOwnerVisit } from './data/ownerVisits';
import { REGULARS } from './data/regulars';
import { STORIES } from './data/story';
import { createCharacter, type Character } from './render/characters';
import scenarioData from './data/scenarios.json';
import { GuestScene } from './render/guestScene';
import { buildLobby, type Lobby } from './render/lobby';
import { Street } from './render/street';
import type { LobbyTheme } from './render/lobbyLayout';
import { SaveStore } from './save/store';
import { UI, type DayInfo, type MenuCard } from './ui/ui';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
scene.background = new Color(0x1b1d27);

// Camera cố định: đứng sau quầy, nhìn về phía cửa.
const camera = new PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 6.6, 9);
camera.lookAt(0, 0.9, -4.5);

scene.add(new HemisphereLight(0xffffff, 0x8a7a66, 1.1));
const sun = new DirectionalLight(0xfff1dc, 1.6);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 30 });
scene.add(sun);

let street: Street | null = null;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  street?.setAspect(w / h);
}
window.addEventListener('resize', resize);
resize();

void Street.build(HOTELS.map((h) => ({ id: h.id, name: h.name, theme: h.lobby }))).then((s) => {
  street = s;
  s.setAspect(canvas.clientWidth / Math.max(1, canvas.clientHeight));
});

/** Lễ tân (nhân vật chính) đứng sau quầy, quay về phía khách ở quầy. */
let receptionist: Character | null = null;
void createCharacter(RECEPTIONIST).then((c) => {
  const box = new Box3().setFromObject(c.root);
  c.root.scale.setScalar(1.65 / Math.max(0.1, box.max.y - box.min.y)); // cao hơn khách một chút
  c.root.position.set(-3, 0, 2.55);
  c.root.rotation.y = Math.PI;
  scene.add(c.root);
  receptionist = c;
});

let guests: GuestScene | null = null;
let lobby: Lobby | null = null;
let lobbyKey = '';

/** Dựng sảnh theo kiểu và các nâng cấp của khách sạn; đổi một trong hai thì gỡ sảnh cũ. */
async function setLobby(theme: LobbyTheme, upgrades: readonly string[] = []): Promise<void> {
  const key = `${theme}|${upgrades.join(',')}`;
  if (key === lobbyKey) return;
  lobbyKey = key;
  try {
    const next = await buildLobby(scene, theme, upgrades);
    if (lobbyKey !== key) return next.dispose(); // đã chuyển sang sảnh khác trong lúc tải
    lobby?.dispose();
    lobby = next;
    if (guests) guests.setLobby(next.door, next.obstacles);
    else guests = new GuestScene(scene, next.door, next.obstacles);
  } catch (err) {
    console.error('Không dựng được sảnh:', err);
  }
}
void setLobby('homestay');

const SCENARIOS = validateScenarios(scenarioData);
const store = new SaveStore();
let save: SaveData = store.load();
/** Tạm thời mở sẵn mọi khách sạn để thử đủ tính năng; đặt false khi muốn có mở khóa theo tiến trình. */
const UNLOCK_ALL = true;

let game: Game | null = null;
let hotel: HotelDef | null = null;
let recorded = false; // đã ghi kết quả của ngày hiện tại chưa
let shiftDay = 1;
let shiftInfo: DayInfo | null = null;
let shiftOutcome: { lines: string[]; beat: StoryBeat | null } | null = null;

/** Ca đang làm dở khi người chơi ra phố: giữ nguyên để vào lại làm tiếp, chỉ bỏ khi bấm "Nghỉ việc". */
interface ParkedShift {
  game: Game;
  hotel: HotelDef;
  recorded: boolean;
  day: number;
  info: DayInfo;
  outcome: { lines: string[]; beat: StoryBeat | null } | null;
}
let parked: ParkedShift | null = null;

const ui = new UI(document.getElementById('ui')!, {
  onPlay: startDay,
  onRestart: () => hotel && startDay(hotel.id),
  onMenu: showMenu,
  onQuit: quitShift,
  onShoo: (id) => {
    if (!game || !guests) return { ok: false, error: 'Chưa vào ca làm' };
    if (id.startsWith('vis-')) return game.shooVisitor(id.slice(4));
    if (guests.shooAmbient(id)) return { ok: true };
    if (game.queue.current?.arrival.id === id) return game.dismissCurrent();
    return game.shooWaiting(id);
  },
  onAsk: (id) => (game && id.startsWith('vis-') ? game.askVisitor(id.slice(4)) : null),
  onTreat: (id) => {
    if (!game) return { ok: false, error: 'Chưa vào ca làm' };
    return id.startsWith('vis-') ? game.treatVisitor(id.slice(4)) : game.treatGuest();
  },
  scenarioList: () =>
    [...SCENARIOS, ...(hotel ? (OWNER_VISITS[hotel.id] ?? []) : [])].map((s) => ({
      id: s.id,
      group: s.guest ? 'Chủ khách sạn ghé quầy' : { incident: 'Sự cố', overbooking: 'Đặt trùng phòng', special: 'Tình huống đặc biệt' }[s.type],
      preview: s.lines[0]!.replace(/\{\w+\}/g, '…'),
    })),
  onTrigger: (id) => (game ? game.triggerScenario(id) : { ok: false, error: 'Chưa vào ca làm' }),
  shopView: (hotelId) => ({
    hotel: HOTELS.find((h) => h.id === hotelId)?.name ?? '',
    money: save.money,
    items: UPGRADES.map((u) => ({ id: u.id, name: u.name, description: u.description, price: u.price, owned: upgradesOf(save, hotelId).includes(u.id) })),
  }),
  onBuy: (hotelId, upgradeId) => {
    const r = buyUpgrade(save, hotelId, upgradeId);
    if (!r.ok || !r.save) return r;
    save = r.save;
    store.save(save);
    if (hotel?.id === hotelId) void setLobby(hotel.lobby, upgradesOf(save, hotelId)); // sảnh hiện ra món vừa mua ngay
    return { ok: true };
  },
  onReset: () => {
    parked = null;
    store.reset();
    save = store.load();
    showMenu();
  },
});

function menuCards(): MenuCard[] {
  return HOTELS.map((h) => {
    const p = progressOf(save, h.id);
    const unlocked = UNLOCK_ALL || isUnlocked(h, save, HOTELS);
    const req = HOTELS.find((x) => x.id === h.requires);
    const [lo, hi] = h.config.params.guestsPerDay;
    return {
      id: h.id,
      name: h.name,
      description: h.description,
      rooms: h.config.rooms.length,
      guests: `${lo}–${hi} khách/ngày`,
      goal: `Cần ${h.goal.days} ngày đạt từ ${h.goal.minStars} sao`,
      progress: `Đã chơi ${p.days} ngày · ${Math.min(p.goodDays, h.goal.days)}/${h.goal.days} ngày đạt`,
      bestStars: p.bestStars,
      state: !unlocked ? 'locked' : isCompleted(h, save) ? 'done' : 'open',
      lockReason: req ? `hoàn thành ${req.name}` : undefined,
      reputation: `${reputationLabel(reputationOf(save, h.id))} (${reputationOf(save, h.id)})`,
      note: parked?.hotel.id === h.id ? (parked.game.isOver ? 'Ca hôm nay đã kết thúc, vào lại để xem tổng kết.' : `Ca đang làm dở lúc ${formatMinute(parked.game.clock.minute)}, vào lại để làm tiếp.`) : undefined,
    };
  });
}

/** Ra phố nhưng giữ ca đang làm dở (ca đã kết thúc thì không cần giữ). */
function showMenu(): void {
  if (game && hotel && shiftInfo && !game.isOver) parked = { game, hotel, recorded, day: shiftDay, info: shiftInfo, outcome: shiftOutcome };
  leaveLobby();
}

/** Nghỉ việc: bỏ ca đang làm, không tính kết quả. */
function quitShift(): void {
  parked = null;
  leaveLobby();
}

function leaveLobby(): void {
  game = null;
  hotel = null;
  ui.openBubble(null);
  ui.showMenu(menuCards(), save.money);
}

function startDay(hotelId: string): void {
  const h = HOTELS.find((x) => x.id === hotelId);
  if (!h || !(UNLOCK_ALL || isUnlocked(h, save, HOTELS))) return;
  if (parked?.hotel.id === h.id) {
    // Làm tiếp ca đang dở
    const p = parked;
    parked = null;
    hotel = p.hotel;
    game = p.game;
    recorded = p.recorded;
    shiftDay = p.day;
    shiftInfo = p.info;
    shiftOutcome = p.outcome;
    void setLobby(h.lobby, p.info.upgrades);
    ui.setGame(p.game, p.day, p.info);
    if (p.outcome) ui.setOutcome(p.outcome.lines, p.outcome.beat);
    return;
  }
  if (parked && !window.confirm(`Bạn đang làm dở ca ở ${parked.hotel.name}. Nghỉ việc ở đó để vào chỗ này?`)) return;
  parked = null;
  hotel = h;
  const upgrades = upgradesOf(save, h.id);
  void setLobby(h.lobby, upgrades);
  recorded = false;
  shiftOutcome = null;
  const seed = (Date.now() & 0x7fffffff) >>> 0;
  const regularVisits = pickRegularVisits(REGULARS, h.id, save.regulars, new Rng(seed ^ 0x2c1b3c6d));
  const ownerVisit = pickOwnerVisit(h.id, new Rng(seed ^ 0x4f1bbcdc));
  game = new Game(dayConfigFor(h, save), seed, SCENARIOS, { regularVisits, ownerVisit, extraScenarios: Object.values(OWNER_VISITS).flat() });
  shiftDay = progressOf(save, h.id).days + 1;
  shiftInfo = { hotelId: h.id, reputation: reputationOf(save, h.id), upgrades };
  ui.setGame(game, shiftDay, shiftInfo);
}

/** Khi hết ngày: ghi kết quả một lần, lưu tiến trình, báo hoàn thành và mở khóa. */
function finishDay(g: Game, h: HotelDef): { lines: string[]; beat: StoryBeat | null } {
  const result = g.result;
  const out = recordDay(save, h, result, HOTELS);
  const { beat, seen } = storyFor(STORIES[h.id], out.save.chapters[h.id] ?? 0, out.progress, result.stars);
  const repBefore = reputationOf(out.save, h.id);
  save = settleDay(out.save, h.id, {
    revenue: g.stats.revenue,
    stars: result.stars,
    reputationBonus: g.reputationBonus,
    regulars: g.regularOutcomes,
    seenChapters: seen,
  });
  store.save(save);
  const repAfter = reputationOf(save, h.id);
  const lines = [
    out.goodDay
      ? `Ngày đạt (từ ${h.goal.minStars} sao): ${Math.min(out.progress.goodDays, h.goal.days)}/${h.goal.days}`
      : `Chưa đủ ${h.goal.minStars} sao nên chưa tính là ngày đạt (${Math.min(out.progress.goodDays, h.goal.days)}/${h.goal.days})`,
  ];
  if (g.stats.revenue > 0) lines.push(`Thu về ${g.stats.revenue.toLocaleString('vi-VN')}đ, tiền tích lũy: ${save.money.toLocaleString('vi-VN')}đ`);
  const delta = repAfter - repBefore;
  lines.push(`Danh tiếng ${delta >= 0 ? '+' : ''}${delta} → ${reputationLabel(repAfter)} (${repAfter})`);
  if (out.justCompleted) lines.push(`Chúc mừng! Bạn đã hoàn thành ${h.name}.`);
  for (const u of out.unlocked) lines.push(`Đã mở khóa: ${u.name}`);
  return { lines, beat };
}

const DONE_LABEL = { cleaning: 'đã dọn xong', repair: 'đã sửa xong', service: 'đã phục vụ xong', fix: 'đã xử lý xong' } as const;

showMenu();

// Bấm vào người trong sảnh thì hiện bong bóng hỏi thăm / đuổi
canvas.addEventListener('click', (ev) => {
  const r = canvas.getBoundingClientRect();
  if (!game) {
    if (street) ui.selectHotel(street.pick(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height));
    return;
  }
  if (!guests) return;
  ui.openBubble(guests.pick(ev.clientX - r.left, ev.clientY - r.top, camera, r.width, r.height));
});

// Rê chuột lên người trong sảnh thì đổi con trỏ thành bàn tay
canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const y = ev.clientY - r.top;
  let hit: string | null = null;
  if (!game && street) {
    hit = street.pick(x, y, r.width, r.height);
    ui.hoverHotel(hit);
  } else if (game && guests) hit = guests.pick(x, y, camera, r.width, r.height);
  canvas.style.cursor = hit ? 'pointer' : '';
});

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.25); // tránh nhảy cóc khi tab bị ẩn
  last = now;
  if (game && hotel) {
    if (ui.skipping) {
      // Tua nhanh từng phút game cho tới khi có khách chờ ở quầy hoặc hết ngày
      for (let i = 0; i < 600 && !game.isOver && game.queue.waiting.length === 0 && !game.queue.current; i++) {
        const { arrived, left, finished } = game.tick(1);
        for (const g of arrived) ui.toast('Có khách mới đến quầy.', 'ok');
        for (const g of left) ui.toast('Một khách chờ lâu quá nên đã bỏ đi.', 'bad');
        for (const t of finished) ui.toast(`Phòng ${t.roomId} ${DONE_LABEL[t.kind]}.`, 'ok');
      }
      ui.skipping = false;
    } else if (ui.speed > 0) {
      const { arrived, left, finished } = game.tick(dt * ui.speed * UI.MIN_PER_SEC);
      for (const g of arrived) ui.toast('Có khách mới đến quầy.', 'ok');
      for (const g of left) ui.toast('Một khách chờ lâu quá nên đã bỏ đi.', 'bad');
      for (const t of finished) ui.toast(`Phòng ${t.roomId} ${DONE_LABEL[t.kind]}.`, 'ok');
    }
    if (ui.auto && ui.speed > 0) autoStep(game);
    if (game.isOver && !recorded) {
      recorded = true;
      shiftOutcome = finishDay(game, hotel);
      ui.setOutcome(shiftOutcome.lines, shiftOutcome.beat);
    }
    ui.render();
  }
  if (!game && parked && ui.auto && ui.speed > 0 && !parked.game.isOver) {
    // Đang ở ngoài phố: lễ tân tự động vẫn làm tiếp ca đã giữ lại
    parked.game.tick(dt * ui.speed * UI.MIN_PER_SEC);
    autoStep(parked.game);
    if (parked.game.isOver && !parked.recorded) {
      parked.recorded = true;
      parked.outcome = finishDay(parked.game, parked.hotel);
      ui.setStreetCards(menuCards(), save.money);
    }
  }
  if (!game) {
    // Màn phố
    if (street) {
      street.point(ui.streetFocus);
      street.setWarp(ui.streetWarp);
      street.update(dt);
      ui.setStreetClock(street.hour);
      ui.placeStreetLabels(street.labels(canvas.clientWidth, canvas.clientHeight));
      renderer.render(street.scene, street.camera);
    }
    return;
  }
  guests?.update(game, Math.min(ui.speed, 2.5) * dt);
  if (receptionist) {
    const cur = game.queue.current;
    // Có khách ở quầy thì quay sang khách, không thì nhìn ra cửa
    const target = cur ? Math.atan2(0 - receptionist.root.position.x, -1.5 - receptionist.root.position.z) : Math.PI;
    const d = Math.atan2(Math.sin(target - receptionist.root.rotation.y), Math.cos(target - receptionist.root.rotation.y));
    receptionist.root.rotation.y += d * Math.min(1, 5 * dt);
    receptionist.mixer.update(dt);
  }
  const id = ui.bubbleId;
  ui.placeBubble(id && guests ? guests.headScreen(id, camera, canvas.clientWidth, canvas.clientHeight) : null);
  renderer.render(scene, camera);
});

// Cho phép kiểm thử tự động tua nhanh và đọc trạng thái.
(window as unknown as { __game: () => Game | null }).__game = () => game;
(window as unknown as { __guests: () => unknown }).__guests = () => ({ pos: guests?.debugPositions() ?? [], obstacles: lobby?.obstacles ?? [], door: lobby?.door, head: (id: string) => guests?.headScreen(id, camera, canvas.clientWidth, canvas.clientHeight) ?? null });
