import 'dotenv/config';

export const CFG = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  dbPath: process.env.DB_PATH || './bets.db',
  payoutZero: Number(process.env.PAYOUT_ZERO || '8.5'),
  usdtDecimals: Number(process.env.USDT_DECIMALS || '6'),
  vndPerUsdt: Number(process.env.VND_PER_USDT || '26000'),

  vietqr: {
    bankId: process.env.VIETQR_BANK_ID || '970422',
    accountNo: process.env.VIETQR_ACCOUNT_NO || '0862264376',
    template: process.env.VIETQR_TEMPLATE || 'compact',
    accountName: process.env.VIETQR_ACCOUNT_NAME || 'NGUYEN DUC NHAT'
  },

  crypto: {
    address: process.env.RECEIVING_USDT_ADDRESS || '',
    network: process.env.RECEIVING_USDT_NETWORK || 'TRC20'
  },

  channels: {
    deposit: process.env.CHANNEL_DEPOSIT_ID || '',
    withdraw: process.env.CHANNEL_WITHDRAW_ID || '',
    audit: process.env.CHANNEL_AUDIT_ID || ''
  },

  adminMention: process.env.ADMIN_MENTION || '',
  adminIds: (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
};

export const OFF_MSG = '🔒 Admin đang ngủ, xin lỗi vì sự bất tiện.';
export const isAdmin = uid => CFG.adminIds.includes(String(uid));
