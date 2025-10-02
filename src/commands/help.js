import { replyEmbed } from "../ui.js";
import { CFG } from "../config.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export async function handleHelpCommand(interaction) {
  const lenh = interaction.options.getString("lenh");

  const msg = {
    bet: `🎰 **/bet chon:<tai|xiu> sotien:<SỐ>**
• Kết quả = **chữ số cuối** của ID tin nhắn
• 0–4 = **xỉu**, 5–9 = **tài**
• Thắng trả **${100 - CFG.winFeePct}%** tiền cược (phí **${CFG.winFeePct}%**)
• Thua mất toàn bộ tiền cược
• Min bet: **0.1 USDT**`,
    nap: "💸 **/nap** — Nạp tiền (💳 QR VND | 🪙 Crypto).",
    rut: "🏧 **/rut** — Rút tiền (🪙 USDT | 🏦 Ngân hàng).",
    taikhoan: "👤 **/taikhoan** — Xem số dư và lịch sử gần nhất.",
    help: "ℹ️ **/help {lenh}** — Xem chi tiết 1 lệnh.",
  };

  const desc = lenh
    ? msg[lenh] || "Không có thông tin."
    : Object.values(msg).join("\n\n");

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("📘 Hướng dẫn nạp")
        .setURL("http://example.com/"),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("📗 Hướng dẫn rút")
        .setURL("http://example.com/"),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("📙 Hướng dẫn chơi")
        .setURL("http://example.com/")
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
