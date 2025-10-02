import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { CFG, OFF_MSG } from "../config.js";
import { q, getBool } from "../db.js";
import { toU, floor2, parseUSDT, parseVND } from "../money.js";
import { vietqrUrlVND } from "../vietqr.js";
import { logDeposit, logAudit } from "../logging.js";
import { replyEmbed } from "../ui.js";

export async function handleDepositCommand(interaction) {
    if (!getBool("deposit_enabled", true)) {
        return replyEmbed(interaction, {
            title: "⏳ Admin đang ngủ",
            desc: OFF_MSG,
            color: "warn",
            ephemeral: true,
        });
    }

    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("dep_qr")
                .setLabel("💳 Nạp qua QR (VND)")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("dep_crypto")
                .setLabel("⚡ Nạp Crypto (USDT)")
                .setStyle(ButtonStyle.Primary)
        ),
    ];

    return replyEmbed(interaction, {
        title: "💸 Nạp tiền",
        fields: [
            {
                name: "Phương thức",
                value: "Chọn **QR (VND)** hoặc **Crypto (USDT)**.",
            },
        ],
        color: "info",
        components,
        ephemeral: true,
    });
}

export async function handleDepositButtons(interaction) {
    if (!getBool("deposit_enabled", true)) {
        return replyEmbed(interaction, {
            title: "⏳ Admin đang ngủ",
            desc: OFF_MSG,
            color: "warn",
            ephemeral: true,
        });
    }

    if (interaction.customId === "dep_qr") {
        const modal = new ModalBuilder()
            .setCustomId("modal_dep_qr")
            .setTitle("Nạp VietQR (nhập số tiền dưới dạng VND)");
        const amountVnd = new TextInputBuilder()
            .setCustomId("amount_vnd")
            .setLabel(
                `Số tiền VND (1 USDT = ${CFG.vndPerUsdt.toLocaleString(
                    "vi-VN"
                )} VND)`
            )
            .setPlaceholder("VD: 100000")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(amountVnd));
        return interaction.showModal(modal);
    }

    if (interaction.customId === "dep_crypto") {
        const modal = new ModalBuilder()
            .setCustomId("modal_dep_crypto")
            .setTitle("Nạp Crypto (USDT)");
        const amount = new TextInputBuilder()
            .setCustomId("amount_usdt")
            .setLabel("Số USDT")
            .setPlaceholder("VD: 10, 20")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(amount));
        return interaction.showModal(modal);
    }
}

export async function handleDepositModals(interaction) {
    if (!getBool("deposit_enabled", true)) {
        return replyEmbed(interaction, {
            title: "⏳ Admin đang ngủ",
            desc: OFF_MSG,
            color: "warn",
            ephemeral: true,
        });
    }

    const discordId = interaction.user.id;
    const username = `${interaction.user.username}#${
        interaction.user.discriminator ?? "0"
    }`;

    if (interaction.customId === "modal_dep_qr") {
        const vnd = parseVND(
            interaction.fields.getTextInputValue("amount_vnd")
        );
        if (!Number.isFinite(vnd) || vnd <= 0) {
            return replyEmbed(interaction, {
                title: "❗ Lỗi",
                desc: "Số VND không hợp lệ.",
                color: "error",
                ephemeral: true,
            });
        }
        const usdt = floor2(vnd / CFG.vndPerUsdt);
        const amount_u = toU(usdt);
        const ref = `GD-DEP-${discordId}-${Date.now()}`;

        q.insertTx.run({
            discord_id: discordId,
            username,
            type: "deposit",
            method: "VND_QR",
            amount_u: Number(amount_u),
            amount_vnd: vnd,
            status: "PENDING",
            destination: `${CFG.vietqr.bankId}-${CFG.vietqr.accountNo}`,
            reference: ref,
        });

        const img = vietqrUrlVND({ amountVND: vnd, description: discordId });

        await replyEmbed(interaction, {
            title: "💳 Nạp qua VietQR",
            desc: `Quét mã bên dưới hoặc chuyển khoản tới số tài khoản.`,
            fields: [
                {
                    name: "VND",
                    value: `${vnd.toLocaleString("vi-VN")} VND`,
                    inline: true,
                },
                { name: "≈ USDT", value: `${usdt.toFixed(2)}`, inline: true },
                { name: "Ngân hàng", value: "MB Bank", inline: true },
                {
                    name: "Số TK",
                    value: `\`${CFG.vietqr.accountNo}\``,
                    inline: true,
                },
                { name: "Nội dung", value: `\`${discordId}\``, inline: true },
                { name: "Mã GD", value: `\`${ref}\`` },
            ],
            image: img,
            footer: `Tỉ giá: 1 USDT = ${CFG.vndPerUsdt.toLocaleString(
                "vi-VN"
            )} VND`,
            color: "info",
            ephemeral: true,
        });

        // log tới kênh admin + nút duyệt
        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`adm_dep_cfm:${ref}`)
                    .setLabel("✅ Confirm nạp")
                    .setStyle(ButtonStyle.Success)
            ),
        ];
        await logDeposit(interaction.client, {
            title: "DEPOSIT PENDING",
            fields: [
                { name: "👤 User", value: `<@${discordId}> (${username})` },
                {
                    name: "💰 Số tiền",
                    value: `${usdt.toFixed(2)} USDT (${vnd.toLocaleString(
                        "vi-VN"
                    )} VND)`,
                },
                { name: "🧾 Mã GD", value: ref },
            ],
            components,
        });

        await logAudit(
            interaction.client,
            `deposit_qr uid=${discordId} vnd=${vnd} usdt≈${usdt} ref=${ref}`
        );
        return;
    }

    if (interaction.customId === "modal_dep_crypto") {
        const usdt = parseUSDT(
            interaction.fields.getTextInputValue("amount_usdt")
        );
        if (!Number.isFinite(usdt) || usdt <= 0) {
            return replyEmbed(interaction, {
                title: "❗ Lỗi",
                desc: "Số USDT không hợp lệ.",
                color: "error",
                ephemeral: true,
            });
        }
        const amount_u = toU(usdt);
        const ref = `GD-DEP-${discordId}-${Date.now()}`;

        q.insertTx.run({
            discord_id: discordId,
            username,
            type: "deposit",
            method: "USDT",
            amount_u: Number(amount_u),
            amount_vnd: 0,
            status: "PENDING",
            destination: CFG.crypto.address,
            reference: ref,
        });

        await replyEmbed(interaction, {
            title: "⚡ Nạp Crypto (USDT)",
            desc: "Chuyển USDT theo thông tin bên dưới.",
            fields: [
                { name: "Số USDT", value: usdt.toFixed(2), inline: true },
                { name: "Mạng", value: CFG.crypto.network, inline: true },
                {
                    name: "Ví nhận",
                    value: `\`${CFG.crypto.address || "Chưa cấu hình"}\``,
                },
                { name: "Mã GD", value: `\`${ref}\`` },
            ],
            color: "info",
            ephemeral: true,
        });

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`adm_dep_cfm:${ref}`)
                    .setLabel("✅ Confirm nạp")
                    .setStyle(ButtonStyle.Success)
            ),
        ];
        await logDeposit(interaction.client, {
            title: "DEPOSIT PENDING",
            fields: [
                { name: "👤 User", value: `<@${discordId}> (${username})` },
                {
                    name: "💰 Số tiền",
                    value: `${usdt.toFixed(2)} USDT • ${CFG.crypto.network}`,
                },
                { name: "📍 Ví", value: CFG.crypto.address || "N/A" },
                { name: "🧾 Mã GD", value: ref },
            ],
            components,
        });

        await logAudit(
            interaction.client,
            `deposit_crypto uid=${discordId} usdt=${usdt} ref=${ref}`
        );
        return;
    }
}
