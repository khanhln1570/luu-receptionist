// Xuất portrait ra public/assets/portraits/<look>/<pose>.png (nền trong suốt).
// Cần: `npm run dev` đang chạy (mặc định cổng 5173) và Chrome/Chromium có WebGL.
// Biến môi trường: CHROME_PATH (đường dẫn chrome), DEV_URL (mặc định http://localhost:5173).
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const url = (process.env.DEV_URL ?? 'http://localhost:5173') + '/tools/portrait.html';
const out = join(import.meta.dirname, '..', 'public', 'assets', 'portraits');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => document.title === 'ready', null, { timeout: 180000 });
const { looks, poses } = await page.evaluate(() => ({ looks: window.portrait.looks, poses: window.portrait.poses }));
for (const look of looks) {
  await mkdir(join(out, look), { recursive: true });
  for (const pose of poses) {
    const data = await page.evaluate(([l, p]) => window.portrait.render(l, p), [look, pose]);
    await writeFile(join(out, look, `${pose}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
}
// Avatar cận mặt chính diện của lễ tân Lưu (màn phố)
await mkdir(join(out, 'le-tan'), { recursive: true });
const face = await page.evaluate(() => window.portrait.render('le-tan', 'binh-thuong', 'face'));
await writeFile(join(out, 'le-tan', 'mat.png'), Buffer.from(face.split(',')[1], 'base64'));
await browser.close();
console.log(`Đã xuất ${looks.length * poses.length} ảnh vào ${out}`);
