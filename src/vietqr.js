import { CFG } from "./config.js";

export function vietqrUrlVND({ amountVND, description }) {
    const base = `https://img.vietqr.io/image/${encodeURIComponent(
        CFG.vietqr.bankId
    )}-${encodeURIComponent(CFG.vietqr.accountNo)}-${encodeURIComponent(
        CFG.vietqr.template
    )}.png`;
    const qs = new URLSearchParams({
        amount: String(Math.max(1, Math.floor(Number(amountVND) || 0))),
        addInfo: (description || "").replace(/ /g, "+"),
        accountName: CFG.vietqr.accountName.replace(/ /g, "+"),
    }).toString();
    return `${base}?${qs}`;
}
