import { CFG } from "./config.js";

// Nội bộ: micro-USDT (1e6). Hiển thị/nhập: 2 chữ số thập phân, luôn cắt xuống.
export const U_SCALE = 1_000_000n;
export const CENT_U = 10_000n; // 0.01 USDT

export function floor2(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * 100) / 100;
}

// Float USDT -> micro-USDT (đã cắt xuống 2 số)
export function toU(x) {
  const y = floor2(x);
  return BigInt(Math.trunc(y * 1e6));
}

// Cắt xuống bội số 0.01 USDT
export function floorToCentU(uBig) {
  const u = BigInt(uBig);
  return (u / CENT_U) * CENT_U;
}

// Định dạng USDT 2 chữ số, đã cắt xuống
export function fmtU(uBig) {
  const u = BigInt(uBig);
  const cents = Number(u / CENT_U); // bậc 0.01
  return (cents / 100).toFixed(2);
}

// Tỉ lệ -> micro
export function ratioToU(r) {
  return BigInt(Math.round(Number(r) * Number(U_SCALE)));
}

// Nhân theo tỉ lệ rồi cắt xuống 0.01
export function mulRatioU(uBig, ratioUBig) {
  const u = BigInt(uBig);
  const ratio = BigInt(ratioUBig);
  const prod = (u * ratio) / U_SCALE; // micro
  return floorToCentU(prod);
}

// Parser: cho phép , hoặc . là dấu thập phân
export function parseUSDT(input) {
  const s = String(input ?? "")
    .trim()
    .replace(/,/g, ".");
  const cleaned = s.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const norm =
    parts.length > 1 ? parts[0] + "." + parts.slice(1).join("") : parts[0];
  const n = Number(norm);
  return floor2(Number.isFinite(n) ? n : 0);
}

// VND luôn nguyên
export function parseVND(input) {
  const digits = String(input ?? "").replace(/\D/g, "");
  const n = Number(digits || "0");
  return Math.max(0, Math.floor(n));
}

export const MIN_BET_U = toU(0.1);
