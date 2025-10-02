import {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

import { CFG, isAdmin, OFF_MSG } from "./config.js";
import { setBool, getBool, q, db, qtx, walCheckpointTruncate } from "./db.js";
import { toU, fmtU } from "./money.js";
import { logDeposit, logWithdraw, logAudit } from "./logging.js";
import { replyEmbed, makeEmbed } from "./ui.js";

import { handleBetCommand } from "./commands/bet.js";
import {
  handleDepositCommand,
  handleDepositButtons,
  handleDepositModals,
} from "./commands/deposit.js";
import {
  handleWithdrawCommand,
  handleWithdrawButtons,
  handleWithdrawModals,
} from "./commands/withdraw.js";
import { handleAccountCommand } from "./commands/account.js";
import { handleHelpCommand } from "./commands/help.js";

/* ========= Hardening ========= */
process.on("unhandledRejection", (reason) =>
  console.error("[unhandledRejection]", reason)
);
process.on("uncaughtException", (err) =>
  console.error("[uncaughtException]", err)
);
process.on("SIGINT", () => {
  console.log("SIGINT");
  process.exit(0);
});

/* ========= Client ========= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
client.on("error", (e) => console.error("[client error]", e));
client.on("warn", (w) => console.warn("[client warn]", w));
client.on("shardError", (e) => console.error("[shard error]", e));

/* ========= Cooldown ========= */
const CD = new Map();
function hitCooldown(uid, key, ms) {
  const now = Date.now();
  const k = `${uid}:${key}`;
  const last = CD.get(k) || 0;
  if (now - last < ms) return true;
  CD.set(k, now);
  return false;
}

/* ========= Ready + auto deploy ========= */
function validateEnv() {
  const miss = [];
  if (!CFG.token) miss.push("DISCORD_TOKEN");
  if (!CFG.clientId) miss.push("CLIENT_ID");
  if (!CFG.guildId) miss.push("GUILD_ID");
  if (!(Number(CFG.vndPerUsdt) > 0)) miss.push("VND_PER_USDT");
  const fee = Number(CFG.winFeePct);
  if (!(fee >= 0 && fee <= 100)) miss.push("WIN_FEE_PCT(0-100)");
  if (miss.length) {
    console.error("ENV thiếu:", miss.join(", "));
    process.exit(1);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  validateEnv();
  walCheckpointTruncate();
  setInterval(walCheckpointTruncate, 24 * 60 * 60 * 1000);
  await safeRegisterCommands().catch(console.error);
});

async function safeRegisterCommands() {
  const bet = new SlashCommandBuilder()
    .setName("bet")
    .setDescription("Cược tài/xỉu theo chữ số cuối của ID tin nhắn")
    .addStringOption((o) =>
      o
        .setName("chon")
        .setDescription("tai | xiu")
        .setRequired(true)
        .addChoices(
          { name: "tai", value: "tai" },
          { name: "xiu", value: "xiu" }
        )
    )
    .addNumberOption((o) =>
      o
        .setName("sotien")
        .setDescription("Số USDT (≥ 0.1)")
        .setRequired(true)
        .setMinValue(0.1)
    );

  const nap = new SlashCommandBuilder()
    .setName("nap")
    .setDescription("Nạp tiền (QR VND | Crypto USDT)");
  const rut = new SlashCommandBuilder()
    .setName("rut")
    .setDescription("Rút tiền (USDT | Ngân hàng)");
  const taikhoan = new SlashCommandBuilder()
    .setName("taikhoan")
    .setDescription("Xem số dư và lịch sử gần nhất");
  const help = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Trợ giúp")
    .addStringOption((o) =>
      o
        .setName("lenh")
        .setDescription("nap | rut | bet | taikhoan")
        .addChoices(
          { name: "nap", value: "nap" },
          { name: "rut", value: "rut" },
          { name: "bet", value: "bet" },
          { name: "taikhoan", value: "taikhoan" }
        )
    );

  const body = [bet, nap, rut, taikhoan, help].map((c) => c.toJSON());
  const rest = new REST({ version: "10" }).setToken(CFG.token);
  await rest.put(Routes.applicationGuildCommands(CFG.clientId, CFG.guildId), {
    body,
  });
  console.log("[commands] Registered to guild:", CFG.guildId);
}

/* ========= Small helpers ========= */
async function notifyUser(client, userId, { title, desc, color = "info" }) {
  const eb = makeEmbed({ title, desc, color });
  const u = await client.users.fetch(userId).catch(() => null);
  if (u) {
    try {
      await u.send({ embeds: [eb] });
      return true;
    } catch {}
  }
  await logAudit(client, `DM fail -> <@${userId}>: ${title}\n${desc}`);
  return false;
}
function disabledRow(...labels) {
  const row = new ActionRowBuilder();
  row.addComponents(
    ...labels.map((l, i) =>
      new ButtonBuilder()
        .setCustomId(`disabled_${Date.now()}_${i}`)
        .setLabel(l)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    )
  );
  return row;
}

/* ========= Interaction ========= */
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;
      const uid = interaction.user.id;
      if (
        ["bet", "nap", "rut"].includes(name) &&
        hitCooldown(uid, name, 2000)
      ) {
        return replyEmbed(interaction, {
          title: "⏳ Chậm thôi",
          desc: "Đợi 2s rồi thử lại.",
          color: "warn",
          ephemeral: true,
        });
      }
      if (name === "bet") return handleBetCommand(interaction);
      if (name === "nap") return handleDepositCommand(interaction);
      if (name === "rut") return handleWithdrawCommand(interaction);
      if (name === "taikhoan") return handleAccountCommand(interaction);
      if (name === "help") return handleHelpCommand(interaction);
    }

    if (interaction.isButton()) {
      // user flows
      if (interaction.customId.startsWith("dep_"))
        return handleDepositButtons(interaction);
      if (interaction.customId.startsWith("wd_"))
        return handleWithdrawButtons(interaction);

      // admin confirmations
      if (interaction.customId.startsWith("adm_")) {
        if (!isAdmin(interaction.user.id)) {
          return interaction.reply({
            embeds: [makeEmbed({ title: "⛔ Không có quyền", color: "error" })],
            flags: 64,
          });
        }
        const [kind, ref] = interaction.customId.split(":");
        const tx = qtx.getByRef.get(ref);
        if (!tx) {
          return interaction.reply({
            embeds: [
              makeEmbed({
                title: "❗ Không tìm thấy giao dịch",
                desc: ref,
                color: "error",
              }),
            ],
            flags: 64,
          });
        }

        if (kind === "adm_dep_cfm") {
          if (tx.type !== "deposit")
            return interaction.reply({
              embeds: [
                makeEmbed({
                  title: "Sai loại",
                  desc: "Không phải deposit.",
                  color: "warn",
                }),
              ],
              flags: 64,
            });
          if (tx.status !== "PENDING")
            return interaction.reply({
              embeds: [
                makeEmbed({
                  title: "Đã xử lý",
                  desc: `Trạng thái: ${tx.status}`,
                  color: "warn",
                }),
              ],
              flags: 64,
            });

          // credit + chuyển trạng thái bảo vệ bằng expect_status
          const res = qtx.setStatusByRefFromStatus.run({
            reference: ref,
            next_status: "APPROVED",
            destination: null,
            expect_status: "PENDING",
          });
          if (!res.changes)
            return interaction.reply({
              embeds: [
                makeEmbed({ title: "Đã xử lý trước đó", color: "warn" }),
              ],
              flags: 64,
            });

          db.transaction(() => {
            const cur = q.getPlayer.get(tx.discord_id);
            if (!cur)
              q.upsertPlayer.run({
                discord_id: tx.discord_id,
                username: tx.username,
                balance_u: 0,
              });
            q.updateBalU.run({
              discord_id: tx.discord_id,
              delta_u: Number(tx.amount_u),
            });
          })();

          await interaction.update({
            embeds: [
              {
                title: "DEPOSIT ✅ APPROVED",
                color: 0x22c55e,
                fields: [
                  {
                    name: "👤 User",
                    value: `<@${tx.discord_id}> (${tx.username})`,
                  },
                  {
                    name: "💰 Số tiền",
                    value: `${fmtU(BigInt(tx.amount_u))} USDT`,
                    inline: true,
                  },
                  { name: "🧾 Mã GD", value: ref, inline: true },
                  { name: "🏷️ Trạng thái", value: "APPROVED", inline: true },
                ],
              },
            ],
            components: [disabledRow("Đã duyệt")],
          });

          await notifyUser(client, tx.discord_id, {
            title: "✅ Nạp đã duyệt",
            desc: `+${fmtU(BigInt(tx.amount_u))} USDT\nMã GD: \`${ref}\``,
            color: "ok",
          });
          await logAudit(client, `adm_dep_approve ref=${ref}`);
          return;
        }

        if (kind === "adm_wd_cfm") {
          if (tx.type !== "withdraw")
            return interaction.reply({
              embeds: [
                makeEmbed({
                  title: "Sai loại",
                  desc: "Không phải withdraw.",
                  color: "warn",
                }),
              ],
              flags: 64,
            });
          if (tx.status !== "HELD")
            return interaction.reply({
              embeds: [
                makeEmbed({
                  title: "Đã xử lý",
                  desc: `Trạng thái: ${tx.status}`,
                  color: "warn",
                }),
              ],
              flags: 64,
            });

          const res = qtx.setStatusByRefFromStatus.run({
            reference: ref,
            next_status: "APPROVED",
            destination: null,
            expect_status: "HELD",
          });
          if (!res.changes)
            return interaction.reply({
              embeds: [
                makeEmbed({ title: "Đã xử lý trước đó", color: "warn" }),
              ],
              flags: 64,
            });

          await interaction.update({
            embeds: [
              {
                title: "WITHDRAW ✅ APPROVED",
                color: 0x22c55e,
                fields: [
                  {
                    name: "👤 User",
                    value: `<@${tx.discord_id}> (${tx.username})`,
                  },
                  {
                    name: "💰 Số tiền",
                    value: `${fmtU(BigInt(tx.amount_u))} USDT`,
                    inline: true,
                  },
                  { name: "🧾 Mã GD", value: ref, inline: true },
                  { name: "🏷️ Trạng thái", value: "APPROVED", inline: true },
                ],
              },
            ],
            components: [disabledRow("Đã duyệt", "Đã khóa")],
          });

          await notifyUser(client, tx.discord_id, {
            title: "✅ Rút đã duyệt",
            desc: `-${fmtU(
              BigInt(tx.amount_u)
            )} USDT (đã thanh toán)\nMã GD: \`${ref}\``,
            color: "ok",
          });
          await logAudit(client, `adm_wd_approve ref=${ref}`);
          return;
        }

        if (kind === "adm_wd_rej") {
          if (tx.type !== "withdraw")
            return interaction.reply({
              embeds: [
                makeEmbed({
                  title: "Sai loại",
                  desc: "Không phải withdraw.",
                  color: "warn",
                }),
              ],
              flags: 64,
            });
          if (tx.status !== "HELD")
            return interaction.reply({
              embeds: [
                makeEmbed({
                  title: "Đã xử lý",
                  desc: `Trạng thái: ${tx.status}`,
                  color: "warn",
                }),
              ],
              flags: 64,
            });

          const res = qtx.setStatusByRefFromStatus.run({
            reference: ref,
            next_status: "REJECTED",
            destination: "ADMIN_BUTTON",
            expect_status: "HELD",
          });
          if (!res.changes)
            return interaction.reply({
              embeds: [
                makeEmbed({ title: "Đã xử lý trước đó", color: "warn" }),
              ],
              flags: 64,
            });

          db.transaction(() => {
            q.updateBalU.run({
              discord_id: tx.discord_id,
              delta_u: Number(tx.amount_u),
            }); // hoàn tiền HOLD
          })();

          await interaction.update({
            embeds: [
              {
                title: "WITHDRAW ⛔ REJECTED",
                color: 0xff3b30,
                fields: [
                  {
                    name: "👤 User",
                    value: `<@${tx.discord_id}> (${tx.username})`,
                  },
                  {
                    name: "💰 Hoàn",
                    value: `${fmtU(BigInt(tx.amount_u))} USDT`,
                    inline: true,
                  },
                  { name: "🧾 Mã GD", value: ref, inline: true },
                  { name: "🏷️ Trạng thái", value: "REJECTED", inline: true },
                ],
              },
            ],
            components: [disabledRow("Đã từ chối", "Đã hoàn")],
          });

          await notifyUser(client, tx.discord_id, {
            title: "⛔ Rút bị từ chối",
            desc: `Đã hoàn lại ${fmtU(
              BigInt(tx.amount_u)
            )} USDT\nMã GD: \`${ref}\``,
            color: "warn",
          });
          await logAudit(client, `adm_wd_reject ref=${ref}`);
          return;
        }
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("modal_dep_"))
        return handleDepositModals(interaction);
      if (interaction.customId.startsWith("modal_wd_"))
        return handleWithdrawModals(interaction);
    }
  } catch (e) {
    console.error("[InteractionCreate catch]", e);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await replyEmbed(interaction, {
          title: "❗ Lỗi",
          desc: "Lỗi không xác định.",
          color: "error",
        });
      }
    } catch {}
  }
});

/* ===== Admin prefix: -on/-off/-napid/-rutid ===== */
client.on(Events.MessageCreate, async (msg) => {
  try {
    if (msg.author.bot || !msg.guild) return;
    const content = (msg.content || "").trim();
    if (!content.startsWith("-")) return;
    if (!isAdmin(msg.author.id)) return;

    const [cmd, ...rest] = content.slice(1).split(/\s+/);

    if (cmd === "on") {
      const target = (rest[0] || "all").toLowerCase();
      if (target === "deposit" || target === "all")
        setBool("deposit_enabled", true);
      if (target === "withdraw" || target === "all")
        setBool("withdraw_enabled", true);
      return msg.reply(`Đã bật: ${target}`);
    }
    if (cmd === "off") {
      const target = (rest[0] || "all").toLowerCase();
      if (target === "deposit" || target === "all")
        setBool("deposit_enabled", false);
      if (target === "withdraw" || target === "all")
        setBool("withdraw_enabled", false);
      return msg.reply(`Đã tắt: ${target}`);
    }

    if (cmd === "napid") {
      const [id, usdtStr, ...noteArr] = rest;
      const usdt = Number(usdtStr);
      const note = noteArr.join(" ") || "ADMIN-ADJUST";
      if (!/^\d{10,}$/.test(id) || !Number.isFinite(usdt) || usdt <= 0)
        return msg.reply(
          "Sai cú pháp. Dùng: `-napid <discord_id> <usdt> [note]`"
        );

      let username = "unknown#0000";
      try {
        const u = await client.users.fetch(id);
        username = `${u.username}#${u.discriminator ?? "0"}`;
      } catch {}
      const amount_u = toU(usdt);
      const ref = `ADMIN-DEP-${id}-${Date.now()}`;

      const afterU = db.transaction(() => {
        const cur = q.getPlayer.get(id);
        if (!cur)
          q.upsertPlayer.run({ discord_id: id, username, balance_u: 0 });
        q.updateBalU.run({ discord_id: id, delta_u: Number(amount_u) });
        // ghi log tx
        q.insertTx.run({
          discord_id: id,
          username,
          type: "deposit",
          method: "ADMIN",
          amount_u: Number(amount_u),
          amount_vnd: 0,
          status: "APPROVED",
          destination: note,
          reference: ref,
        });
        const end = q.getPlayer.get(id);
        return BigInt(end?.balance_u ?? 0);
      })();

      await logDeposit(client, {
        title: "ADMIN DEPOSIT",
        fields: [
          { name: "👤", value: `<@${id}> (${username})` },
          { name: "💰", value: `${fmtU(amount_u)} USDT`, inline: true },
          { name: "🧾 Mã GD", value: ref, inline: true },
        ],
      });
      await logAudit(client, `admin_deposit uid=${id} usdt=${usdt} ref=${ref}`);
      return msg.reply(
        `✅ Cộng ${fmtU(amount_u)} USDT cho <@${id}>. Số dư: **${fmtU(
          afterU
        )}**. Ref: ${ref}`
      );
    }

    if (cmd === "rutid") {
      const [id, usdtStr, forceStr, ...noteArr] = rest;
      const usdt = Number(usdtStr);
      const force = String(forceStr || "").toLowerCase() === "true";
      const note =
        (force ? noteArr : [forceStr, ...noteArr]).filter(Boolean).join(" ") ||
        "ADMIN-ADJUST";
      if (!/^\d{10,}$/.test(id) || !Number.isFinite(usdt) || usdt <= 0)
        return msg.reply(
          "Sai cú pháp. Dùng: `-rutid <discord_id> <usdt> [force] [note]`"
        );

      let username = "unknown#0000";
      try {
        const u = await client.users.fetch(id);
        username = `${u.username}#${u.discriminator ?? "0"}`;
      } catch {}
      const amount_u = toU(usdt);
      const p = q.getPlayer.get(id) || { balance_u: 0 };
      const balU = BigInt(p.balance_u ?? 0);
      if (!force && balU < amount_u)
        return msg.reply(
          `❗ Balance: ${fmtU(balU)} < ${fmtU(
            amount_u
          )}. Dùng \`true\` nếu muốn force.`
        );

      const ref = `ADMIN-WD-${id}-${Date.now()}`;
      const afterU = db.transaction(() => {
        const cur = q.getPlayer.get(id);
        if (!cur)
          q.upsertPlayer.run({ discord_id: id, username, balance_u: 0 });
        q.updateBalU.run({ discord_id: id, delta_u: -Number(amount_u) });
        q.insertTx.run({
          discord_id: id,
          username,
          type: "withdraw",
          method: "ADMIN",
          amount_u: Number(amount_u),
          amount_vnd: 0,
          status: "APPROVED",
          destination: note,
          reference: ref,
        });
        const end = q.getPlayer.get(id);
        return BigInt(end?.balance_u ?? 0);
      })();

      await logWithdraw(client, {
        title: "ADMIN WITHDRAW",
        fields: [
          { name: "👤", value: `<@${id}> (${username})` },
          { name: "💰", value: `${fmtU(amount_u)} USDT`, inline: true },
          { name: "🧾 Mã GD", value: ref, inline: true },
        ],
      });
      await logAudit(
        client,
        `admin_withdraw uid=${id} usdt=${usdt} ref=${ref}`
      );
      return msg.reply(
        `✅ Trừ ${fmtU(amount_u)} USDT của <@${id}>. Số dư: **${fmtU(
          afterU
        )}**. Ref: ${ref}`
      );
    }
  } catch (e) {
    console.error("[MessageCreate catch]", e);
  }
});

client.login(CFG.token);
