import { portraitPath, type Pose } from '../data/looks';
import { dateOf } from '../core/calendar';
import { formatMinute } from '../core/clock';
import { greeting } from '../core/dialogue';
import type { Game } from '../core/game';
import { ROOM_STATUS_LABEL, ROOM_TYPE_LABEL } from '../core/labels';
import { findReservations, type Reservation } from '../core/reservations';
import type { Result } from '../core/result';
import { PAID_LABEL } from '../core/pricing';
import { reputationLabel } from '../core/reputation';
import { SHOO_REPLIES, shuffleBag, talkPool } from '../core/smalltalk';
import type { StoryBeat } from '../core/story';
import './ui.css';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const money = (n: number): string => `${(n / 1000).toLocaleString('vi-VN')}k`;
const vnd = (n: number): string => `${n.toLocaleString('vi-VN')}đ`;

export interface MenuCard {
  id: string;
  name: string;
  description: string;
  rooms: number;
  guests: string; // "6–8 khách/ngày"
  goal: string; // "Cần 3 ngày đạt ≥ 3★"
  progress: string; // "Đã chơi 2 ngày · 1/3 ngày tốt"
  bestStars: number;
  state: 'locked' | 'open' | 'done';
  lockReason?: string;
  note?: string; // ví dụ: ca đang làm dở
  reputation: string; // "Được yêu thích (64)"
}

/** Kết quả một hành động với người trong sảnh; message (nếu có) hiện trong bong bóng thoại. */
export type BubbleResult = { ok: true; message?: string; good?: boolean } | { ok: false; error: string };

export interface ShopView {
  hotel: string;
  money: number;
  items: Array<{ id: string; name: string; description: string; price: number; owned: boolean }>;
}

/** Thông tin về khách sạn đang chơi, do main.ts truyền vào khi bắt đầu ngày. */
export interface DayInfo {
  hotelId: string;
  reputation: number;
  upgrades: readonly string[];
}

export interface UIActions {
  onRestart: () => void; // chơi ngày tiếp theo ở cùng khách sạn
  onMenu: () => void; // ra phố, giữ nguyên ca đang làm
  onQuit: () => void; // nghỉ việc: bỏ ca, không tính kết quả
  onPlay: (hotelId: string) => void;
  onReset: () => void;
  onShoo: (id: string) => BubbleResult; // đuổi một người trong sảnh (id nhân vật 3D)
  onAsk: (id: string) => string | null; // câu trả lời riêng của người đó (null = dùng câu chung)
  onTreat: (id: string) => BubbleResult; // mời nước một người ngồi chơi ở sảnh
  scenarioList: () => Array<{ id: string; group: string; preview: string }>; // kho tình huống để thử
  onTrigger: (id: string) => Result; // cho tình huống đó xảy ra ngay
  shopView: (hotelId: string) => ShopView;
  onBuy: (hotelId: string, upgradeId: string) => Result;
}

export class UI {
  /** Số phút game trôi qua mỗi giây thật ở tốc độ 1x. */
  static readonly MIN_PER_SEC = 1.1;
  speed = 1; // 0 = tạm dừng
  private calOpen = false;
  /** Màn phố: thẻ khách sạn, tòa đang chọn / đang rê chuột, hướng dẫn. */
  private cards: MenuCard[] = [];
  private wallet = 0;
  private selectedHotel: string | null = null;
  private hoveredHotel: string | null = null;
  private tutorial = true;
  private tutorialStep = 0;
  private nextTalk = shuffleBag(talkPool([]), Math.random);
  private nextShoo = shuffleBag(SHOO_REPLIES, Math.random);
  /** Bong bóng thoại trên đầu một người trong sảnh: chưa có text thì hiện hai lựa chọn. */
  private bubble: { id: string; text: string | null; until: number } | null = null;
  private hidden = { left: false, right: false }; // thu sổ đặt phòng / bảng phòng
  auto = false; // lễ tân tự động làm việc (main.ts xử lý)
  private menuOpen = false;
  private pickerOpen = false;
  private bellOpen = false;
  private knownNeeds: Set<string> | null = null; // phòng đã báo trên chuông, để chỉ báo phòng mới
  private bellTimer = 0;
  private quote: string | null = null; // phòng đang được báo giá dịch vụ
  skipping = false; // đang tua nhanh tới khách kế tiếp (main.ts xử lý)

  private game: Game | null = null;
  private day = 1;
  private outcome: string[] = [];
  private story: StoryBeat | null = null;
  private info: DayInfo | null = null;
  private shopHotel: string | null = null; // đang mở cửa hàng nâng cấp của khách sạn nào
  private summaryHidden = false; // người chơi đã tắt bảng tổng kết để ngắm sảnh
  private selectedRes: string | null = null;
  /** Bước hỏi chuyện với khách ở quầy: 0 chưa hỏi gì, 1 đã hỏi đã đặt trước chưa, 2 đã biết thông tin khách. */
  private talk = { id: '', step: 0 };
  private query = '';
  private toastTimer = 0;
  private streetMenu = false; // menu ☰ ngoài phố đang mở
  private warp = false; // ngoài phố đang tua ngày đêm
  private sig: Record<string, string> = {};
  private el: Record<string, HTMLElement> = {};

  constructor(
    private root: HTMLElement,
    private actions: UIActions,
  ) {
    root.innerHTML = `
      <div class="hud"><div class="panel">
        ${clockHtml()}</span>
        <span class="name"><span data-k="hotel"></span> · <span data-k="day"></span></span>
        <span class="stat">Hàng chờ: <b data-k="waiting"></b></span>
        <span class="stat">Đã nhận phòng: <b data-k="checked"></b></span>
        <span class="stat">Đã trả phòng: <b data-k="out"></b></span>
        <span class="stat">Doanh thu: <b data-k="revenue"></b> / <span data-k="target"></span></span>
        <span class="stat">Hài lòng: <b data-k="sat"></b></span>
        <span class="stat" title="Danh tiếng cao thì đông khách và khách kiên nhẫn hơn">Danh tiếng: <b data-k="rep"></b></span>
        <span class="stat">Khách bỏ đi: <b data-k="left"></b></span>
      </div>
      <div class="speed panel" data-k="speedbox">
        <button class="bell" data-act="bell-toggle" title="Phòng cần dọn hoặc sửa" aria-label="Thông báo phòng cần dọn hoặc sửa"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg><b class="badge" data-k="badge"></b></button>
        <div class="bell-pop" data-k="bell"></div>
        <button data-act="menu-toggle" title="Tạm dừng, tua nhanh, tự động làm việc, ra phố, nghỉ việc">☰ Menu</button>
        <div class="menu-pop">
          <div class="menu-row"><button data-speed="0">Dừng</button><button data-speed="1">1x</button><button data-speed="3">3x</button><button data-speed="10">10x</button></div>
          <button data-act="skip" title="Tua nhanh tới khi có khách kế tiếp hoặc hết ngày">Tua nhanh tới khách kế »</button>
          <button data-act="pick-open" title="Chọn một tình huống để nó xảy ra ngay">Chọn tình huống…</button>
          <button data-act="calendar" title="Lịch đặt phòng 7 ngày tới">Lịch đặt phòng</button>
          <button data-act="auto" title="Lễ tân tự nhận phòng, trả phòng, xử lý khách và giao việc dọn phòng">Tự động làm việc: Tắt</button>
          <button data-act="street" title="Ra phố nhưng giữ nguyên ca đang làm; vào lại cùng khách sạn để làm tiếp">Ra phố (giữ ca)</button>
          <button class="quit" data-act="quit" title="Bỏ ca đang làm, không tính kết quả">Nghỉ việc</button>
        </div>
      </div></div>
      <div class="queue" data-k="queue"></div>
      <div class="left panel"><h2><span>Sổ đặt phòng</span><button class="collapse" data-act="toggle-left" title="Thu nhỏ sổ đặt phòng">–</button></h2>
        <input data-k="search" placeholder="Tìm theo tên hoặc mã (vd: HM-004)" />
        <div class="list" data-k="reslist"></div>
      </div>
      <div class="right panel"><h2><span>Bảng phòng</span><button class="collapse" data-act="toggle-right" title="Thu nhỏ bảng phòng">–</button></h2><div data-k="rooms"></div>
        <div class="room-key">${(['vacant_clean', 'occupied', 'dirty', 'cleaning', 'broken', 'repairing'] as const).map((st) => `<span><i class="cell ${st}"></i>${ROOM_STATUS_LABEL[st]}</span>`).join('')}</div>
        <div class="staff" data-k="staff"></div>
        <div class="legend">Khách đặt trước hoặc trả phòng: chọn đặt phòng ở sổ rồi bấm phòng. Khách vãng lai: bấm thẳng phòng trống. Phòng chưa dọn hoặc hỏng: bấm để giao việc.</div>
      </div>
      <button class="dock dock-left" data-act="toggle-left" title="Mở sổ đặt phòng" aria-label="Mở sổ đặt phòng"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 8h7M8 12h7M8 16h4"/></svg></button>
      <button class="dock dock-right" data-act="toggle-right" title="Mở bảng phòng" aria-label="Mở bảng phòng"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></button>
      <div class="bubble" data-k="bubble"></div>
      <div class="dialog panel" data-k="dialog"></div>
      <div class="toast" data-k="toast"></div>
      <div data-k="cal"></div>
      <div data-k="overlay"></div>
      <div data-k="shop"></div>
      <div data-k="picker"></div>
      <div data-k="quote"></div>
      <div data-k="menu"></div>`;
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => (this.el[e.dataset.k!] = e));

    try {
      Object.assign(this.hidden, JSON.parse(localStorage.getItem('luu-receptionist-ui') ?? '{}'));
    } catch {
      /* không đọc được thì dùng mặc định */
    }
    this.applyPanels();
    root.addEventListener('click', (ev) => this.onClick(ev.target as HTMLElement));
    (this.el.search as HTMLInputElement).addEventListener('input', (ev) => {
      this.query = (ev.target as HTMLInputElement).value;
    });
  }

  setGame(game: Game, day: number, info: DayInfo): void {
    this.game = game;
    this.day = day;
    this.info = info;
    this.nextTalk = shuffleBag(talkPool(info.upgrades), Math.random);
    this.story = null;
    this.closeShop();
    this.menuOpen = false;
    this.bellOpen = false;
    this.knownNeeds = null;
    this.quote = null;
    this.pickerOpen = false;
    this.set('picker', '');
    this.outcome = [];
    this.summaryHidden = false;
    this.hideMenu();
    this.selectedRes = null;
    this.bubble = null;
    this.query = '';
    (this.el.search as HTMLInputElement).value = '';
    this.sig = {};
    this.speed = 1;
  }

  /** Dòng tiến trình và lời kể của chủ khách sạn hiện ở màn tổng kết. */
  setOutcome(lines: string[], story: StoryBeat | null = null): void {
    this.outcome = lines;
    this.story = story;
    this.sig.overlay = '';
  }

  /** Cửa hàng nâng cấp của một khách sạn (mở từ màn phố hoặc màn tổng kết). */
  openShop(hotelId: string): void {
    this.shopHotel = hotelId;
    this.renderShop();
  }

  /** Danh sách tình huống để thử, gom theo loại; bấm một dòng thì tình huống đó xảy ra ngay. */
  private renderPicker(): void {
    if (!this.pickerOpen) return this.set('picker', '');
    const groups = new Map<string, Array<{ id: string; preview: string }>>();
    for (const sc of this.actions.scenarioList()) groups.set(sc.group, [...(groups.get(sc.group) ?? []), sc]);
    const body = [...groups]
      .map(([g, items]) => `<h3>${esc(g)} <small>(${items.length})</small></h3><ul>${items.map((it) => `<li><div>${esc(it.preview)}</div><button data-trigger="${esc(it.id)}">Thử</button></li>`).join('')}</ul>`)
      .join('');
    this.set('picker', `<div class="overlay shop-overlay"><div class="panel shop picker"><button class="b-x" data-act="pick-close" aria-label="Đóng">×</button><h1>Chọn tình huống</h1><p class="shop-note">Bấm “Thử” để khách mang tình huống đó đến quầy ngay. Sự cố cần có khách đang ở khách sạn.</p>${body}</div></div>`);
  }

  private closeShop(): void {
    this.shopHotel = null;
    this.renderShop();
  }

  private renderShop(): void {
    if (!this.shopHotel) return this.set('shop', '');
    const v = this.actions.shopView(this.shopHotel);
    const items = v.items
      .map((it) => {
        const can = !it.owned && v.money >= it.price;
        const btn = it.owned ? '<span class="owned">Đã có</span>' : `<button class="${can ? 'primary' : ''}" data-buy="${esc(it.id)}" ${can ? '' : 'disabled'}>${vnd(it.price)}</button>`;
        return `<li><div><b>${esc(it.name)}</b><small>${esc(it.description)}</small></div>${btn}</li>`;
      })
      .join('');
    this.set('shop', `<div class="overlay shop-overlay"><div class="panel shop"><button class="b-x" data-act="shop-close" aria-label="Đóng">×</button><h1>Nâng cấp · ${esc(v.hotel)}</h1><div class="total">Tiền tích lũy: <b>${vnd(v.money)}</b></div><ul>${items}</ul><p class="shop-note">Tiền thu được mỗi ngày làm việc được cộng vào đây. Nâng cấp áp dụng từ ngày kế tiếp.</p></div></div>`);
  }

  /** Màn phố: nhãn trên từng tòa, khung hướng dẫn, thẻ thông tin của tòa đang chọn. */
  showMenu(cards: MenuCard[], wallet = 0): void {
    this.cards = cards;
    this.wallet = wallet;
    this.tutorial = true; // mỗi lần ra phố Lưu đều hướng dẫn lại
    this.tutorialStep = 0;
    this.root.classList.add('in-menu');
    this.renderStreet();
  }

  /** Cập nhật thẻ khách sạn và tiền khi đang ở màn phố (ví dụ ca giữ lại vừa tự kết thúc). */
  setStreetCards(cards: MenuCard[], wallet: number): void {
    this.cards = cards;
    this.wallet = wallet;
    if (this.root.classList.contains('in-menu')) this.renderStreet();
  }

  private renderStreet(): void {
    const stars = (n: number) => (n > 0 ? `${'★'.repeat(n)}${'☆'.repeat(5 - n)}` : 'chưa có sao');
    const stateLabel = (c: MenuCard) => (c.state === 'locked' ? 'Chưa mở' : c.state === 'done' ? 'Đã hoàn thành' : 'Đang tuyển lễ tân');
    const labels = this.cards
      .map((c) => `<button class="street-label ${c.state} ${c.id === this.selectedHotel ? 'sel' : ''}" data-pick="${esc(c.id)}" title="${esc(c.name)}"><small>${c.state === 'locked' ? '🔒 ' : ''}${stateLabel(c)}${c.bestStars > 0 ? ` · ${stars(c.bestStars)}` : ''}</small></button>`)
      .join('');
    const c = this.cards.find((x) => x.id === this.selectedHotel);
    const card = c
      ? `<div class="street-card panel"><button class="b-x" data-act="card-close" aria-label="Đóng">×</button>
          <h3>${esc(c.name)}${c.state === 'done' ? ' <span class="tick">đã hoàn thành</span>' : ''}</h3>
          <p>${esc(c.description)}</p>
          <div class="meta">${c.rooms} phòng · ${esc(c.guests)}</div>
          <div class="meta">${esc(c.goal)}</div>
          <div class="meta">${esc(c.progress)} · tốt nhất: ${stars(c.bestStars)}</div>
          <div class="meta">Danh tiếng: ${esc(c.reputation)}</div>
          ${c.note ? `<div class="meta note">${esc(c.note)}</div>` : ''}
          ${c.state === 'locked' ? `<div class="lock">Chưa mở: ${esc(c.lockReason ?? '')}</div>` : `<button class="primary" data-play="${esc(c.id)}">Vào làm ở đây</button> <button data-shop="${esc(c.id)}">Nâng cấp</button>`}
        </div>`
      : `<div class="street-hint panel">Bấm vào một tòa khách sạn trên phố để xem thông tin.</div>`;
    const names = this.cards.map((x) => x.name);
    const story: Array<{ text: string }> = [
      { text: 'Chào bạn! Tôi là Lưu, làm lễ tân đã 10 năm. Vậy mà khách sạn cũ vừa đóng cửa, giờ tôi thất nghiệp rồi…' },
      { text: `Con phố này đang có ${names.length} chỗ tuyển lễ tân: ${names.join(', ')}. Bạn giúp tôi tìm nơi làm việc phù hợp nhé!` },
      { text: `Bấm vào một tòa nhà (hoặc nhãn trên nóc) để xem thông tin, rồi bấm “Vào làm ở đây”. Tôi nghĩ nên thử ${names[0] ?? 'chỗ nhỏ nhất'} trước cho quen việc.` },
      { text: 'Vào sảnh rồi thì gọi khách, hỏi họ đã đặt phòng chưa, tra sổ và giao phòng. Muốn đổi chỗ thì bấm “Ra phố”. Cùng cố gắng nhé!' },
    ];
    const step = Math.min(this.tutorialStep, story.length - 1);
    const last = step === story.length - 1;
    const tut = this.tutorial
      ? `<div class="tutorial panel"><img class="portrait" src="${import.meta.env.BASE_URL}assets/portraits/le-tan/mat.png" alt="Lưu" />
          <div class="tut-body"><div class="who">Lưu <small>lễ tân 10 năm kinh nghiệm</small></div>
          <div class="line">“${esc(story[step]!.text)}”</div>
          <div class="actions"><button class="primary" data-act="${last ? 'tut-ok' : 'tut-next'}">${last ? 'Bắt đầu thôi!' : 'Tiếp »'}</button>${last ? '' : '<button data-act="tut-ok">Bỏ qua</button>'}<span class="tut-dots">${story.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</span></div></div></div>`
      : '';
    this.el.menu!.innerHTML = `<div class="street">
      <div class="street-title"><div><h1>Luu Receptionist</h1><p>Phố khách sạn · chọn nơi làm việc hôm nay · Tiền tích lũy: <b>${vnd(this.wallet)}</b></p></div>
        <div class="street-tools"><span class="panel street-clock${this.warp ? ' warping' : ''}">${clockHtml()}${this.warp ? '<span class="warp-tag">»» Đang tua</span>' : ''}</span>${this.tutorial ? '' : '<button data-act="tut-open" title="Nghe Lưu hướng dẫn lại">? Hướng dẫn</button>'}
          <div class="street-menu"><button class="hamburger" data-act="street-menu" aria-label="Menu" aria-expanded="${this.streetMenu}">☰</button>${
            this.streetMenu
              ? `<div class="street-pop panel"><button data-act="warp">${this.warp ? '■ Dừng tua (về giờ thật)' : '»» Tua ngày đêm'}</button><button class="danger" data-act="reset">Xóa tiến trình</button></div>`
              : ''
          }</div></div></div>
      ${tut}<div class="street-labels">${labels}</div>${card}</div>`;
  }

  /** Ngoài phố đang tua nhanh ngày đêm (main đọc để đổi giờ của trời). */
  get streetWarp(): boolean {
    return this.warp;
  }

  /** Cập nhật đồng hồ ngoài phố mỗi khung hình theo giờ của trời (giờ thập phân 0–24). */
  setStreetClock(hour: number): void {
    const el = this.el.menu!.querySelector('.street-clock');
    if (el) setClock(el, Math.floor(hour * 60) % (24 * 60));
  }

  /** Bấm vào một tòa trên phố (null = bấm ra chỗ trống). */
  selectHotel(id: string | null): void {
    if (id === this.selectedHotel) return;
    this.selectedHotel = id;
    if (this.root.classList.contains('in-menu')) this.renderStreet();
  }

  hoverHotel(id: string | null): void {
    this.hoveredHotel = id;
  }

  /** Tòa cần chỉ mũi tên: đang rê chuột, không thì đang chọn. */
  get streetFocus(): string | null {
    return this.hoveredHotel ?? this.selectedHotel;
  }

  /** Đặt nhãn tên lên nóc từng tòa mỗi khung hình. */
  placeStreetLabels(items: Array<{ id: string; x: number; y: number }>): void {
    for (const it of items) {
      const el = this.el.menu!.querySelector<HTMLElement>(`[data-pick="${CSS.escape(it.id)}"]`);
      if (!el) continue;
      el.style.left = `${it.x}px`;
      el.style.top = `${it.y}px`;
    }
  }

  hideMenu(): void {
    this.root.classList.remove('in-menu');
    this.el.menu!.innerHTML = '';
  }

  /** Mở bong bóng cho người vừa được bấm trong sảnh (null = bấm ra ngoài, đóng bong bóng). */
  openBubble(id: string | null): void {
    this.bubble = id ? { id, text: null, until: Infinity } : null;
  }

  get bubbleId(): string | null {
    return this.bubble?.id ?? null;
  }

  /** Đặt bong bóng lên đầu nhân vật mỗi khung hình; pos null (người đã đi khỏi) thì đóng. */
  placeBubble(pos: { x: number; y: number } | null): void {
    const el = this.el.bubble!;
    if (this.bubble && (!pos || performance.now() > this.bubble.until)) this.bubble = null;
    if (!this.bubble || !pos) {
      this.set('bubble', '');
      el.style.display = 'none';
      return;
    }
    const b = this.bubble;
    this.set(
      'bubble',
      b.text === null
        ? `<button class="b-x" data-act="b-close" aria-label="Đóng">×</button><div class="b-opts"><button class="primary" data-act="b-ask">Hỏi thăm</button>${/^(amb|vis)-/.test(b.id) ? `<button data-act="b-treat" title="Tốn ${vnd(20_000)}">Mời nước</button>` : ''}<button class="shoo" data-act="b-shoo">Đuổi</button></div>`
        : `<div class="b-text">${b.text.startsWith('(') ? `<i style="color:var(--muted)">${esc(b.text)}</i>` : `“${esc(b.text)}”`}</div>`,
    );
    el.style.display = 'block';
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
  }

  toast(text: string, kind: 'ok' | 'bad'): void {
    const t = this.el.toast!;
    t.textContent = text;
    t.className = `toast show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (t.className = 'toast'), 3500);
  }

  private onClick(target: HTMLElement): void {
    const btn = target.closest<HTMLElement>('button');
    if (!btn) return;
    if (btn.dataset.play) return this.actions.onPlay(btn.dataset.play);
    if (btn.dataset.shop) return this.openShop(btn.dataset.shop);
    if (btn.dataset.buy && this.shopHotel) {
      const r = this.actions.onBuy(this.shopHotel, btn.dataset.buy);
      if (!r.ok) this.toast(r.error, 'bad');
      return this.renderShop();
    }
    if (btn.dataset.act === 'shop-close') return this.closeShop();
    if (btn.dataset.act === 'shop-open' && this.info) return this.openShop(this.info.hotelId);
    if (btn.dataset.act === 'menu') return this.actions.onMenu();
    if (btn.dataset.act === 'street-menu') {
      this.streetMenu = !this.streetMenu;
      return this.renderStreet();
    }
    if (btn.dataset.act === 'warp') {
      this.warp = !this.warp;
      this.streetMenu = false;
      return this.renderStreet();
    }
    if (btn.dataset.act === 'reset') {
      this.streetMenu = false;
      if (this.root.classList.contains('in-menu')) this.renderStreet();
      if (window.confirm('Xóa toàn bộ tiến trình và mở khóa?')) this.actions.onReset();
      return;
    }
    if (this.streetMenu) {
      // Bấm nút khác ngoài phố thì đóng menu
      this.streetMenu = false;
      this.renderStreet();
    }
    if (btn.dataset.pick) return this.selectHotel(btn.dataset.pick);
    if (btn.dataset.act === 'card-close') return this.selectHotel(null);
    if (btn.dataset.act === 'tut-next') {
      this.tutorialStep += 1;
      return this.renderStreet();
    }
    if (btn.dataset.act === 'tut-ok' || btn.dataset.act === 'tut-open') {
      this.tutorial = btn.dataset.act === 'tut-open';
      this.tutorialStep = 0;
      return this.renderStreet();
    }
    const g = this.game;
    if (!g) return;
    if (btn.dataset.act === 'menu-toggle') {
      this.menuOpen = !this.menuOpen;
      this.bellOpen = false;
      return;
    }
    if (btn.dataset.act === 'bell-toggle') {
      this.bellOpen = !this.bellOpen;
      this.menuOpen = false;
      return;
    }
    if (btn.dataset.quote) {
      this.quote = btn.dataset.quote;
      this.bellOpen = false;
      return;
    }
    if (btn.dataset.act === 'quote-cancel') {
      this.quote = null;
      return;
    }
    if (btn.dataset.act === 'quote-ok' && this.quote) {
      const q = g.quoteService(this.quote);
      const r = q ? g.assignTask(q.roomId, q.kind) : { ok: false as const, error: 'Phòng này không còn cần dịch vụ' };
      this.quote = null;
      return this.toast(r.ok ? `Đã giao việc ${q!.kind === 'cleaning' ? 'dọn phòng' : 'sửa chữa'} cho phòng ${q!.roomId}, phí ${vnd(q!.price)} trừ vào doanh thu.` : r.error, r.ok ? 'ok' : 'bad');
    }
    if (btn.dataset.act === 'pick-open' || btn.dataset.act === 'pick-close') {
      this.menuOpen = false;
      this.pickerOpen = btn.dataset.act === 'pick-open';
      return this.renderPicker();
    }
    if (btn.dataset.trigger !== undefined) {
      const r = this.actions.onTrigger(btn.dataset.trigger);
      if (!r.ok) return this.toast(r.error, 'bad');
      this.pickerOpen = false;
      this.renderPicker();
      return this.toast('Tình huống đã xảy ra ở quầy.', 'ok');
    }
    if (btn.dataset.act === 'auto') {
      this.auto = !this.auto;
      return;
    }
    if (btn.closest('.menu-pop')) this.menuOpen = false;
    if (btn.dataset.act === 'street') return this.actions.onMenu();
    if (btn.dataset.act === 'quit') {
      if (!g.isOver && !window.confirm('Nghỉ việc sẽ bỏ ca đang làm và không tính kết quả. Vẫn nghỉ?')) return;
      return this.actions.onQuit();
    }
    if (btn.dataset.act === 'toggle-left' || btn.dataset.act === 'toggle-right') {
      const side = btn.dataset.act === 'toggle-left' ? 'left' : 'right';
      this.hidden[side] = !this.hidden[side];
      this.applyPanels();
      try {
        localStorage.setItem('luu-receptionist-ui', JSON.stringify(this.hidden));
      } catch {
        /* bỏ qua nếu không lưu được */
      }
      return;
    }
    if (btn.dataset.act === 'b-ask' && this.bubble) {
      this.bubble = { ...this.bubble, text: this.actions.onAsk(this.bubble.id) ?? this.nextTalk(), until: performance.now() + 4000 };
      return;
    }
    if (btn.dataset.act === 'b-treat' && this.bubble) {
      const r = this.actions.onTreat(this.bubble.id);
      if (r.ok) this.bubble = { ...this.bubble, text: r.message ?? 'Cảm ơn bạn!', until: performance.now() + 3500 };
      else {
        this.toast(r.error, 'bad');
        this.bubble = null;
      }
      return;
    }
    if (btn.dataset.act === 'b-shoo' && this.bubble) {
      const r = this.actions.onShoo(this.bubble.id);
      if (r.ok) this.bubble = { ...this.bubble, text: r.message ?? this.nextShoo(), until: performance.now() + 3500 };
      else {
        this.toast(r.error, 'bad');
        this.bubble = null;
      }
      return;
    }
    if (btn.dataset.act === 'summary-close' || btn.dataset.act === 'summary-open') {
      this.summaryHidden = btn.dataset.act === 'summary-close';
      return;
    }
    if (btn.dataset.act === 'b-close') {
      this.bubble = null;
      return;
    }
    if (btn.dataset.act === 'calendar') this.calOpen = !this.calOpen;
    else if (btn.dataset.act === 'skip') this.skipping = true;
    else if (btn.dataset.speed !== undefined) {
      this.speed = Number(btn.dataset.speed);
      this.skipping = false;
    }
    else if (btn.dataset.act === 'ask') this.talk = { id: g.queue.current?.arrival.id ?? '', step: this.talkStep() + 1 };
    else if (btn.dataset.res) this.selectedRes = btn.dataset.res === this.selectedRes ? null : btn.dataset.res;
    else if (btn.dataset.room) this.onRoomClick(btn.dataset.room);
    else if (btn.dataset.opt !== undefined) {
      const r = g.chooseOption(Number(btn.dataset.opt));
      this.toast(r.ok ? r.message : r.error, r.ok && r.satisfaction >= 0 ? 'ok' : 'bad');
    } else if (btn.dataset.act === 'next') g.callNext();
    else if (btn.dataset.act === 'dismiss') {
      const r = g.dismissCurrent();
      this.toast(r.ok ? 'Đã từ chối khách.' : r.error, r.ok ? 'ok' : 'bad');
    } else if (btn.dataset.act === 'settle' || btn.dataset.act === 'waive') {
      const waive = btn.dataset.act === 'waive';
      const r = g.settleBill(waive);
      this.selectedRes = null;
      this.toast(r.ok ? (waive ? 'Đã thu tiền phòng, miễn phụ phí.' : 'Đã thu tiền.') : r.error, r.ok ? 'ok' : 'bad');
    } else if (btn.dataset.act === 'cancelbill') g.cancelBill();
    else if (btn.dataset.act === 'restart') this.actions.onRestart();
  }

  private talkStep(): number {
    const cur = this.game?.queue.current;
    return cur && this.talk.id === cur.arrival.id ? this.talk.step : 0;
  }

  private onRoomClick(roomId: string): void {
    const g = this.game!;
    const target = g.rooms.find((r) => r.id === roomId);
    if (target && (target.status === 'dirty' || target.status === 'broken')) {
      if (g.tasks.taskFor(roomId)) return this.toast(`Phòng ${roomId} đã được giao việc, đang chờ nhân viên.`, 'bad');
      this.quote = roomId; // báo giá trước, người chơi xác nhận mới giao việc
      return;
    }
    if (target && (target.status === 'cleaning' || target.status === 'repairing')) {
      const left = Math.ceil(g.tasks.taskFor(roomId)?.minutesLeft ?? 0);
      return this.toast(`Phòng ${roomId} đang được ${target.status === 'cleaning' ? 'dọn' : 'sửa'}, còn khoảng ${left} phút.`, 'bad');
    }
    const cur = g.queue.current;
    if (!cur) return this.toast('Chưa có khách ở quầy. Hãy gọi khách tiếp theo.', 'bad');
    if (g.billing) return this.toast('Hãy thu tiền hoặc hủy hóa đơn đang mở trước.', 'bad');
    const kind = cur.arrival.kind;
    if (kind === 'incident' || kind === 'overbooking' || kind === 'special') {
      return this.toast('Hãy chọn một cách xử lý trong hộp thoại.', 'bad');
    }
    if ((kind === 'walkin' || kind === 'checkin') && this.talkStep() < 2) return this.toast('Hãy hỏi khách trước: đã đặt phòng chưa, và cần phòng nào.', 'bad');
    if (kind !== 'walkin' && !this.selectedRes) return this.toast('Hãy chọn đặt phòng của khách trong sổ trước.', 'bad');

    if (kind === 'walkin') {
      const r = g.attemptWalkIn(roomId);
      return this.toast(r.ok ? `Đã cho thuê phòng ${roomId}.` : r.error, r.ok ? 'ok' : 'bad');
    }
    if (kind === 'checkin') {
      const r = g.attemptCheckIn(this.selectedRes!, roomId);
      if (r.ok) this.selectedRes = null;
      return this.toast(r.ok ? `Đã nhận phòng ${roomId}.` : r.error, r.ok ? 'ok' : 'bad');
    }
    const r = g.startCheckOut(this.selectedRes!, roomId);
    if (!r.ok) this.toast(r.error, 'bad');
  }

  /** Chỉ ghi lại DOM khi nội dung đổi, để không làm mất focus ô tìm kiếm. */
  private set(key: string, html: string): void {
    if (this.sig[key] === html) return;
    this.sig[key] = html;
    this.el[key]!.innerHTML = html;
  }

  private setText(key: string, text: string): void {
    if (this.el[key]!.textContent !== text) this.el[key]!.textContent = text;
  }

  /** Ô phòng đổi theo từng phút game (đếm ngược việc), nên cập nhật tại chỗ để không làm mất cú click. */
  private renderRooms(): void {
    const g = this.game!;
    const floors = [...new Set(g.rooms.map((r) => r.floor))].sort((a, b) => a - b);
    this.set(
      'rooms',
      floors
        .map(
          (f) =>
            `<div class="floor"><span>Tầng ${f}</span><div class="cells">${g.rooms
              .filter((r) => r.floor === f)
              .map((r) => `<button class="cell" data-room="${r.id}"></button>`)
              .join('')}</div></div>`,
        )
        .join(''),
    );
    const byRoom = new Map<string, Reservation>();
    for (const r of g.reservations) if (r.roomId && r.status === 'checked_in') byRoom.set(r.roomId, r);

    this.el.rooms!.querySelectorAll<HTMLElement>('button[data-room]').forEach((btn) => {
      const r = g.rooms.find((x) => x.id === btn.dataset.room)!;
      const guest = byRoom.get(r.id);
      const task = g.tasks.taskFor(r.id);
      let sub = ROOM_TYPE_LABEL[r.type].replace('phòng ', '');
      let info = `${ROOM_STATUS_LABEL[r.status]} · ${money(r.price)}`;
      if (guest) {
        sub = guest.code;
        info = `${guest.guestName} · ${guest.code}`;
      } else if (task?.status === 'working') {
        sub = `${Math.ceil(task.minutesLeft)} phút`;
        info = `${ROOM_STATUS_LABEL[r.status]}, còn ${sub}`;
      } else if (task?.status === 'queued') {
        sub = 'chờ người';
        info = 'Đã giao việc, đang chờ nhân viên rảnh';
      } else if (r.status === 'dirty' || r.status === 'broken') {
        info += ' · bấm để giao việc';
      }
      const cls = `cell ${r.status}`;
      const html = `${r.id}<small>${esc(sub)}</small>`;
      if (btn.className !== cls) btn.className = cls;
      if (btn.innerHTML !== html) btn.innerHTML = html;
      if (btn.title !== info) btn.title = info;
    });
  }

  private renderStaff(): void {
    const t = this.game!.tasks;
    const queued = t.queued('housekeeping') + t.queued('maintenance');
    this.setText(
      'staff',
      `Buồng phòng: ${t.busy('housekeeping')}/${t.crew('housekeeping')} bận · Bảo trì: ${t.busy('maintenance')}/${t.crew('maintenance')} bận${queued ? ` · ${queued} việc chờ` : ''}`,
    );
  }

  /** Bảng lịch 7 đêm: mỗi loại phòng có bao nhiêu phòng đã được giữ, cộng số khách đến và đi mỗi ngày. */
  private calendarHtml(g: Game): string {
    const days = 7;
    const rows = g.calendar(days);
    const all = [...g.reservations, ...g.futureBookings];
    const head = Array.from({ length: days }, (_, d) => {
      const dt = dateOf(this.day, d);
      return `<th class="${d === 0 ? 'today' : ''}">${dt.weekday}<br><small>${dt.text}${d === 0 ? ' · nay' : ''}</small></th>`;
    }).join('');
    const body = rows
      .map((r) => {
        const cells = r.taken
          .map((t) => {
            const ratio = t / r.total;
            const cls = t > r.total ? 'over' : ratio >= 1 ? 'full' : ratio >= 0.7 ? 'hi' : ratio >= 0.4 ? 'mid' : 'lo';
            return `<td class="${cls}">${t}/${r.total}</td>`;
          })
          .join('');
        return `<tr><th class="rowh">${ROOM_TYPE_LABEL[r.type][0]!.toUpperCase()}${ROOM_TYPE_LABEL[r.type].slice(1)}</th>${cells}</tr>`;
      })
      .join('');
    const count = (f: (x: Reservation) => boolean, d: number) => all.filter((x) => x.status !== 'cancelled' && f(x)).length;
    const arrive = Array.from({ length: days }, (_, d) => `<td>${count((x) => x.arrivalDay === d && (x.status === 'booked' || x.status === 'checked_in'), d)}</td>`).join('');
    const leave = Array.from({ length: days }, (_, d) => `<td>${count((x) => x.departDay === d && (x.status === 'checked_in' || x.status === 'checked_out'), d)}</td>`).join('');
    return `<div class="overlay"><div class="cal-box"><h2>Lịch đặt phòng</h2><table class="cal"><tr><th></th>${head}</tr>${body}<tr class="sum"><th class="rowh">Khách đến</th>${arrive}</tr><tr class="sum"><th class="rowh">Khách trả phòng</th>${leave}</tr></table><p class="cal-note">Ô ghi số phòng đã giữ / tổng số phòng của loại đó trong đêm. Đỏ là gần hết hoặc đã hết phòng.</p><p><button class="primary" data-act="calendar">Đóng</button></p></div></div>`;
  }

  private applyPanels(): void {
    this.root.classList.toggle('hide-left', this.hidden.left);
    this.root.classList.toggle('hide-right', this.hidden.right);
  }

  private portrait(name: string, pose: Pose): string {
    return `<img class="portrait" src="${import.meta.env.BASE_URL}${portraitPath(name, pose)}" alt="${esc(name)}" />`;
  }

  render(): void {
    const g = this.game;
    if (!g) return;
    // Đồng hồ hiện giờ local của máy cho khớp với trời ngoài phố; ca làm vẫn chạy theo g.clock
    const now = new Date();
    setClock(this.root.querySelector('.hud')!, now.getHours() * 60 + now.getMinutes());
    this.setText('hotel', g.config.name);
    this.setText('day', `Ngày ${this.day} · ${dateOf(this.day).weekday} ${dateOf(this.day).text}`);
    this.setText('target', vnd(g.revenueTarget));
    this.setText('waiting', String(g.queue.waiting.length));
    this.setText('checked', String(g.stats.checkedIn));
    this.setText('out', String(g.stats.checkedOut));
    this.setText('revenue', vnd(g.stats.revenue));
    this.setText('sat', String(g.satisfaction));
    this.renderBell(g);
    if (this.info) this.setText('rep', `${reputationLabel(this.info.reputation)} (${this.info.reputation})`);
    this.setText('left', String(g.stats.left));
    this.el.speedbox!.classList.toggle('open', this.menuOpen);
    const autoBtn = this.root.querySelector<HTMLElement>('[data-act="auto"]')!;
    autoBtn.classList.toggle('active', this.auto);
    autoBtn.textContent = `Tự động làm việc: ${this.auto ? 'Bật' : 'Tắt'}`;
    this.root.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.speed) === this.speed);
    });

    this.set(
      'queue',
      g.queue.waiting
        .map((w, i) => {
          const pct = Math.max(0, Math.round((w.patienceLeft / w.arrival.patienceMinutes) * 100));
          return `<div class="chip ${pct < 30 ? 'low' : ''}"><small>Khách ${i + 1}</small><div class="bar"><i style="width:${pct}%"></i></div></div>`;
        })
        .join(''),
    );

    const rows: Reservation[] = this.query.trim() ? findReservations(g.reservations, this.query) : g.reservations;
    this.set(
      'reslist',
      rows
        .map((r) => {
          const done = r.status !== 'booked' && r.status !== 'checked_in';
          const cls = `res ${r.id === this.selectedRes ? 'sel' : ''} ${done ? 'done' : ''}`;
          return `<button class="${cls}" data-res="${done ? '' : r.id}" ${done ? 'disabled' : ''}>${esc(r.guestName)}<small>${esc(r.code)} · ${ROOM_TYPE_LABEL[r.roomType]} · ${dateOf(this.day, r.arrivalDay ?? 0).text} → ${dateOf(this.day, r.departDay ?? r.nights).text} (${r.nights} đêm)${r.roomId ? ` · <b class="inroom">→ phòng ${r.roomId}</b>` : ''}${r.status === 'checked_out' ? ' · đã trả' : ''}</small></button>`;
        })
        .join('') || '<small style="color:var(--muted)">Không tìm thấy đặt phòng.</small>',
    );

    this.set('cal', this.calOpen ? this.calendarHtml(g) : '');
    this.renderRooms();
    this.renderStaff();

    const cur = g.queue.current;
    const bill = g.billing;
    if (g.isOver && this.summaryHidden) {
      this.set('dialog', `<div><div class="who">Hết ngày</div><div class="actions"><button class="primary" data-act="summary-open">Xem tổng kết</button><button data-act="restart">Chơi ngày tiếp theo</button></div></div>`);
    } else if (cur && bill) {
      const lines = [`${bill.nights} đêm × ${vnd(bill.nightlyRate)} = ${vnd(bill.base)}`, ...bill.charges.map((c) => `${c.label}: ${vnd(c.amount)}`)];
      this.set(
        'dialog',
        `<div><div class="who">Hóa đơn phòng ${esc(bill.roomId)} · ${esc(bill.guestName)}</div><div class="line">${lines.map(esc).join('<br>')}<br><b>Tổng: ${vnd(bill.total)}</b></div><div class="actions"><button class="primary" data-act="settle">Thu ${vnd(bill.total)}</button>${bill.chargesTotal > 0 ? `<button data-act="waive">Miễn phụ phí (thu ${vnd(bill.base)})</button>` : ''}<button data-act="cancelbill">Quay lại</button></div></div>`,
      );
    } else if (cur && g.currentScenario()) {
      const a = cur.arrival;
      const sc = g.currentScenario()!;
      this.set(
        'dialog',
        `${this.portrait(a.guestName, 'hoi')}<div><div class="who">${esc(a.guestName)}</div><div class="line">${sc.lines.map(esc).join('<br>')}</div><div class="opts">${sc.options
          .map((o, i) => `<button data-opt="${i}" ${o.enabled ? '' : `disabled title="${esc(o.reason ?? '')}"`}>${esc(o.text)}${o.enabled ? '' : ' (không còn phòng)'}</button>`)
          .join('')}</div></div>`,
      );
    } else if (cur) {
      const a = cur.arrival;
      const step = this.talkStep();
      const pose = cur.patienceLeft < cur.arrival.patienceMinutes * 0.35 ? 'buc' : 'binh-thuong';
      let body: string;
      if (a.kind === 'checkout') {
        body = `<div class="who">${esc(a.guestName)}</div><div class="line">${esc(greeting(a))}</div><div class="hint">Chọn đặt phòng của khách trong sổ, rồi bấm vào phòng khách đang ở để lập hóa đơn.</div>`;
      } else {
        const booked = a.kind === 'checkin';
        const dismiss = `<div class="actions"><button data-act="dismiss">Từ chối khách</button></div>`;
        const ask = (text: string) => `<button class="primary" data-act="ask">${text}</button>`;
        if (step === 0) {
          body = `<div class="who">Khách mới</div><div class="line">“Xin chào!”</div><div class="actions">${ask('Anh/chị đã đặt phòng trước chưa ạ?')}<button data-act="dismiss">Từ chối khách</button></div>`;
        } else if (step === 1) {
          body = `<div class="who">Khách mới</div><div class="line">${booked ? '“Rồi, tôi đã đặt phòng từ trước.”' : '“Chưa, tôi chưa đặt trước.”'}</div><div class="actions">${ask(booked ? 'Anh/chị đặt phòng nào ạ? Cho tôi xin tên hoặc mã đặt phòng.' : 'Anh/chị cần loại phòng nào ạ?')}<button data-act="dismiss">Từ chối khách</button></div>`;
        } else {
          const hint = booked
            ? 'Tìm đặt phòng trong sổ, chọn nó, rồi bấm vào phòng phù hợp.'
            : 'Khách vãng lai: bấm vào phòng trống, sạch, đúng loại để cho thuê.';
          body = `<div class="who">${esc(a.guestName)}</div><div class="line">${esc(greeting(a))}</div><div class="hint">${hint}</div>${dismiss}`;
        }
      }
      this.set('dialog', `${this.portrait(a.guestName, pose)}<div>${body}</div>`);
    } else if (g.queue.waiting.length > 0) {
      this.set('dialog', `<button class="primary" data-act="next">Gọi khách tiếp theo (${g.queue.waiting.length} đang chờ)</button>`);
    } else {
      this.set('dialog', `<span style="color:var(--muted)">Chưa có khách ở quầy.</span>`);
    }

    this.set('overlay', g.isOver && !this.summaryHidden ? this.summaryHtml() : '');
  }

  /** Chuông thông báo: danh sách phòng cần dọn/sửa kèm giá; có phòng mới thì rung chuông và báo. */
  private renderBell(g: Game): void {
    const needs = g.needsService();
    const ids = new Set(needs.map((n) => n.roomId));
    if (this.knownNeeds) {
      const fresh = needs.filter((n) => !this.knownNeeds!.has(n.roomId));
      if (fresh.length > 0) {
        this.toast(`Phòng ${fresh.map((n) => n.roomId).join(', ')} cần ${fresh[0]!.kind === 'cleaning' ? 'dọn' : 'sửa'}.`, 'bad');
        const bell = this.root.querySelector<HTMLElement>('.bell');
        bell?.classList.add('ring');
        clearTimeout(this.bellTimer);
        this.bellTimer = window.setTimeout(() => bell?.classList.remove('ring'), 1500);
      }
    }
    this.knownNeeds = ids;
    if (this.quote && !g.quoteService(this.quote)) this.quote = null;
    this.setText('badge', needs.length ? String(needs.length) : '');
    const rows = needs
      .map((n) => `<li><span><b>${esc(n.roomId)}</b> · ${ROOM_TYPE_LABEL[n.type]} · ${n.kind === 'cleaning' ? 'Chưa dọn' : 'Hỏng'}</span><button data-quote="${esc(n.roomId)}">${n.kind === 'cleaning' ? 'Dọn' : 'Sửa'} · ${vnd(n.price)}</button></li>`)
      .join('');
    this.set('bell', `<h4>Phòng cần dọn / sửa</h4>${rows ? `<ul>${rows}</ul>` : '<p class="empty">Không có phòng nào cần dọn hoặc sửa.</p>'}`);
    this.el.speedbox!.classList.toggle('bell-open', this.bellOpen);
    const q = this.quote ? g.quoteService(this.quote) : null;
    this.set(
      'quote',
      q
        ? `<div class="overlay quote-overlay"><div class="panel quote"><h2>Báo giá dịch vụ</h2><div class="q-title">${PAID_LABEL[q.kind]} ${esc(q.roomId)} <small>(${ROOM_TYPE_LABEL[q.type]})</small></div><div class="q-price">${vnd(q.price)}</div><p>Thời gian khoảng ${q.minutes} phút. Khoản này <b>trừ vào doanh thu</b> hôm nay.</p><div class="actions"><button class="primary" data-act="quote-ok">Xác nhận</button><button data-act="quote-cancel">Hủy</button></div></div></div>`
        : '',
    );
  }

  private summaryHtml(): string {
    const g = this.game!;
    const r = g.result;
    const st = g.stats;
    const stars = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
    const events = g.events.slice(-6);
    const row = (label: string, value: string) => `<tr><td>${label}</td><td>${value}</td></tr>`;
    return `<div class="overlay"><div class="panel summary">
      <button class="b-x" data-act="summary-close" aria-label="Đóng" title="Đóng">×</button>
      <h1>Hết ngày</h1>
      <div class="stars" aria-label="${r.stars} sao">${stars}</div>
      <div class="total">${r.score} điểm</div>
      <table>
        ${row('Hài lòng trung bình', `<b>${r.satisfaction}</b> / 100`)}
        ${row('Doanh thu', `<b>${vnd(r.revenue)}</b> / mục tiêu ${vnd(r.revenueTarget)} (${r.revenueScore}%)${st.waived > 0 ? ` <small>đã miễn ${vnd(st.waived)}</small>` : ''}`)}
        ${row('Nhận / trả phòng', `${st.checkedIn} / ${st.checkedOut}`)}
        ${row('Tình huống đã xử lý', String(st.scenarios))}
        ${row('Từ chối · bỏ đi · chưa kịp phục vụ', `${st.turnedAway} · ${st.left} · ${g.unserved}`)}
        ${row('Sai sót', String(st.mistakes))}
        ${st.serviceCost > 0 ? row('Chi phí dọn phòng và sửa chữa', `<b>−${vnd(st.serviceCost)}</b> <small>đã trừ vào doanh thu</small>`) : ''}
      </table>
      ${events.length ? `<h3>Đáng nhớ</h3><ul>${events.map((e) => `<li class="${e.kind}">${esc(e.text)}</li>`).join('')}</ul>` : ''}
      ${this.outcome.length ? `<h3>Tiến trình</h3><ul class="progress">${this.outcome.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${this.storyHtml()}
      <p><button class="primary" data-act="restart">Chơi ngày tiếp theo</button> <button data-act="shop-open">Nâng cấp</button> <button data-act="menu">Ra phố</button></p>
    </div></div>`;
  }

  private storyHtml(): string {
    const b = this.story;
    if (!b) return '';
    return `<div class="story">${b.chapter ? `<div class="chapter">${esc(b.chapter)}</div>` : ''}<img class="portrait" src="${import.meta.env.BASE_URL}${portraitPath(b.owner.name, 'binh-thuong')}" alt="${esc(b.owner.name)}" /><div class="story-body"><div class="who">${esc(b.owner.name)} <small>${esc(b.owner.title)}</small></div>${b.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div></div>`;
  }
}

/** Đồng hồ kim + nhãn buổi/giờ, dùng chung cho thanh trạng thái trong sảnh và ngoài phố. */
function clockHtml(): string {
  const ticks = Array.from({ length: 12 }, (_, i) => `<line x1="20" y1="3.5" x2="20" y2="${i % 3 === 0 ? 7 : 5.5}" transform="rotate(${i * 30} 20 20)"/>`).join('');
  return `<span class="clock" title="Giờ trên máy"><svg viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="18.5" class="face"/><g class="ticks">${ticks}</g><line data-k="hh" class="hand hh" x1="20" y1="20" x2="20" y2="10.5"/><line data-k="mh" class="hand mh" x1="20" y1="20" x2="20" y2="6"/><circle cx="20" cy="20" r="1.6" class="pin"/></svg><span class="cl-text"><b data-k="part"></b><span data-k="time"></span></span></span>`;
}

/** Đặt kim, nhãn buổi và giờ cho một đồng hồ dựng bằng clockHtml(). */
function setClock(root: ParentNode, minute: number): void {
  const q = (k: string) => root.querySelector<SVGElement | HTMLElement>(`[data-k="${k}"]`);
  const part = minute < 12 * 60 ? 'Sáng' : minute < 18 * 60 ? 'Chiều' : 'Tối';
  const time = formatMinute(minute);
  const p = q('part');
  const t = q('time');
  if (p && p.textContent !== part) p.textContent = part;
  if (t && t.textContent !== time) t.textContent = time;
  q('hh')?.setAttribute('transform', `rotate(${((minute / 60) % 12) * 30} 20 20)`);
  q('mh')?.setAttribute('transform', `rotate(${(minute % 60) * 6} 20 20)`);
}
