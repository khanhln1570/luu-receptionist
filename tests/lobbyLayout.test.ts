import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOBBY_LAYOUTS, ROOM } from '../src/render/lobbyLayout';

describe.each(Object.entries(LOBBY_LAYOUTS))('LOBBY layout %s', (_theme, LOBBY) => {
  it('mọi model được tham chiếu đều có file .gltf trong public/assets', () => {
    const missing = LOBBY.filter(
      (p) => !existsSync(join(__dirname, '..', 'public', 'assets', p.pack, `${p.model}.gltf`)),
    ).map((p) => `${p.pack}/${p.model}`);
    expect(missing).toEqual([]);
  });

  it('mọi vật đặt nằm trong phòng', () => {
    const outside = LOBBY.filter(
      (p) => Math.abs(p.x) > ROOM.halfWidth || p.z < ROOM.farZ || p.z > ROOM.nearZ,
    );
    expect(outside).toEqual([]);
  });
});
