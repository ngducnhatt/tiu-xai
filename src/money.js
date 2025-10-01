import { CFG } from './config.js';
const SCALE = 10 ** CFG.usdtDecimals;

export const toU = n => BigInt(Math.round(Number(n) * SCALE));
export const fromU = u => Number(u) / SCALE;
export const fmtU = u => fromU(u).toLocaleString('vi-VN', { maximumFractionDigits: CFG.usdtDecimals });

const U = BigInt(SCALE);
export const ratioToU = r => BigInt(Math.round(Number(r) * SCALE));
export const mulRatioU = (amountU, ratioU) => (amountU * ratioU) / U;

export const MIN_BET_U = toU(0.1);

export const usdtToVnd = usdt => Math.max(1, Math.floor(Number(usdt) * CFG.vndPerUsdt));
export const usdtUToVnd = u => usdtToVnd(fromU(u));
