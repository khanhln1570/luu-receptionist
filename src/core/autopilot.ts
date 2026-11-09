import type { Game } from './game';

/** Điểm của một lựa chọn tình huống: ưu tiên khách hài lòng, tiền chỉ là phụ (20.000đ ≈ 1 điểm hài lòng). */
const optionValue = (e: { satisfaction?: number; money?: number }): number => (e.satisfaction ?? 0) + (e.money ?? 0) / 20_000;

/**
 * Lễ tân tự động: mỗi lần gọi làm một bước (giao việc cho phòng bẩn/hỏng, gọi khách kế tiếp hoặc phục vụ khách ở quầy).
 * Không mời nước hay đuổi người trong sảnh. Dùng khi người chơi bật "Tự động làm việc".
 */
export function autoStep(g: Game): void {
  if (g.isOver) return;
  if (g.knock) {
    g.answerKnock(true);
    return;
  }
  if (g.sleepPrompt) {
    g.sleep();
    return;
  }
  for (const r of g.rooms) {
    if (r.status === 'dirty') g.assignTask(r.id, 'cleaning');
    else if (r.status === 'broken') g.assignTask(r.id, 'repair');
  }
  const cur = g.queue.current;
  if (!cur) {
    g.callNext();
    return;
  }
  const a = cur.arrival;
  const free = (type: string) => g.rooms.find((r) => r.status === 'vacant_clean' && r.type === type);
  const res = g.reservations.find((r) => r.code === a.reservationCode);
  switch (a.kind) {
    case 'checkin': {
      const room = free(res?.roomType ?? a.roomType);
      if (res && room && g.attemptCheckIn(res.id, room.id).ok) return;
      g.dismissCurrent();
      return;
    }
    case 'walkin': {
      const room = free(a.roomType);
      if (room && g.attemptWalkIn(room.id).ok) return;
      g.dismissCurrent();
      return;
    }
    case 'checkout': {
      if (res?.roomId && g.startCheckOut(res.id, res.roomId).ok) g.settleBill(false);
      return;
    }
    default: {
      const view = g.currentScenario();
      if (!view) return;
      const sc = g.scenarioFor(a);
      const best = view.options
        .map((o, i) => ({ i, o, v: sc ? optionValue(sc.options[i]!.effects) : 0 }))
        .filter((x) => x.o.enabled)
        .sort((x, y) => y.v - x.v)[0];
      if (best) g.chooseOption(best.i);
    }
  }
}
