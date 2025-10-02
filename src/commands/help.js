import { replyEmbed } from "../ui.js";
import { CFG } from "../config.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export async function handleHelpCommand(interaction) {
    const lenh = interaction.options.getString("lenh");

    const msg = {
        bet: `**</bet:1423139688209973328> chon:<tai|xiu> sotien:<SỐ>**
• Kết quả = **chữ số cuối** của ID tin nhắn
• 0–4 = **xỉu**, 5–9 = **tài**
• Thắng trả **${100 - CFG.winFeePct}%** tiền cược (phí **${CFG.winFeePct}%**)
• Thua mất toàn bộ tiền cược
• Min bet: **0.1 USDT**`,
        nap: "💸 </nap:1423139688209973329> — Nạp tiền (💳 QR VND | ⚡ Crypto).",
        rut: "🏧 </rut:1423139688209973330> * — Rút tiền (⚡ USDT | 🏦 Ngân hàng).",
        taikhoan:
            "👤 </taikhoan:1423139688209973331> — Xem số dư và lịch sử gần nhất.",
        help: "ℹ️ </help:1423139688209973332> — Xem chi tiết 1 lệnh.",
    };

    const desc = lenh
        ? msg[lenh] || "Không có thông tin."
        : Object.values(msg).join("\n\n");

    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel("📘 Hướng dẫn nạp")
                .setURL("https://youtu.be/_dMKYsaDP4o"),
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel("📗 Hướng dẫn rút")
                .setURL("https://youtu.be/VJfRowGHduk"),
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel("📙 Hướng dẫn chơi")
                .setURL("https://youtu.be/tMwzdR1XFAc")
        ),
    ];

    return replyEmbed(interaction, {
        title: "ℹ️ Trợ giúp",
        desc,
        color: "info",
        ephemeral: true,
        components,
    });
}
