const TelegramBot = require('node-telegram-bot-api');
const pool = require('../config/db');

let botInstance; // to avoid multiple instances

// Get active token from DB
async function getTelegramToken() {
  const [rows] = await pool.execute('SELECT TELEGRAM_API FROM telegram_api WHERE ACTIVE = 1');
  return rows.length > 0 ? rows[0].TELEGRAM_API : null;
}

// Send a message
async function sendTelegramMessage(text, telegramId) {
  const { default: fetch } = await import('node-fetch');
  const token = await getTelegramToken();
  if (!token) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramId, text })
  });
}

// Get additional chat IDs (supports comma- or semicolon-separated in CHAT_ID column)
async function getAdditionalChatIds() {
  const [rows] = await pool.execute('SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1');
  if (!rows.length || rows[0].CHAT_ID == null) return [];
  const raw = String(rows[0].CHAT_ID).trim();
  if (!raw) return [];
  return raw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
}

// Send message to all additional chat IDs (groups/channels)
async function sendTelegramToAdditionalChats(text) {
  const chatIds = await getAdditionalChatIds();
  for (const id of chatIds) {
    await sendTelegramMessage(text, id);
  }
}

// Start bot globally
async function startTelegramBot() {
  const token = await getTelegramToken();
  if (!token) {
    console.error('❌ Telegram bot token not found.');
    return;
  }

  if (botInstance) return; // Don't start twice

  const bot = new TelegramBot(token, { polling: true });
  botInstance = bot;

  console.log('✅ Telegram bot is running...');

  const shownKeyboard = new Set();

  async function sendBalanceToUser(telegramId) {
    const connection = await pool.getConnection();
    try {
      const [accountResults] = await connection.query(`
        SELECT agent.AGENT_CODE, agent.NAME, account.IDNo AS ACCOUNT_ID
        FROM agent
        JOIN account ON account.AGENT_ID = agent.IDNo
        WHERE agent.TELEGRAM_ID = ?
        LIMIT 1
      `, [telegramId]);

      if (accountResults.length === 0) {
        bot.sendMessage(telegramId, '❌ No account linked.');
        return;
      }

      const { AGENT_CODE, NAME, ACCOUNT_ID } = accountResults[0];

      const [ledgerResults] = await connection.query(`
        SELECT transaction_type.TRANSACTION, account_ledger.AMOUNT
        FROM account_ledger
        JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID
        WHERE account_ledger.TRANSACTION_TYPE IN (2, 5, 3)
        AND account_ledger.ACCOUNT_ID = ?
      `, [ACCOUNT_ID]);

      let deposit = 0, withdraw = 0, iouCash = 0, iouReturn = 0;
      ledgerResults.forEach(row => {
        const amt = parseFloat(row.AMOUNT) || 0;
        if (row.TRANSACTION === 'DEPOSIT') deposit += amt;
        if (row.TRANSACTION === 'WITHDRAW') withdraw += amt;
        if (row.TRANSACTION === 'IOU CASH') iouCash += amt;
        if (row.TRANSACTION === 'IOU RETURN DEPOSIT') iouReturn += amt;
      });

      const balance = deposit + iouCash - withdraw - iouReturn;

      const msg = `Infinity Cage\n\nAccount #: ${AGENT_CODE}\nGuest: ${NAME}\nBalance: ${balance.toLocaleString()}`;
      bot.sendMessage(telegramId, msg, { parse_mode: 'Markdown' });

    } catch (err) {
      console.error('❌ Error:', err);
      bot.sendMessage(telegramId, '❌ Error getting balance.');
    } finally {
      connection.release();
    }
  }

  // Handle /checkbalance command
  bot.onText(/\/checkbalance/i, (msg) => {
    sendBalanceToUser(msg.chat.id);
  });

  // Handle "Check Balance" button click (with or without emoji)
  bot.onText(/(💰\s*)?Check Balance/i, (msg) => {
    sendBalanceToUser(msg.chat.id);
  });

  // Get chat_id (for group or private) — type /getchatid in the chat
  bot.onText(/\/getchatid/i, (msg) => {
    const chatId = msg.chat.id;
    const chatType = msg.chat.type; // 'private', 'group', 'supergroup', 'channel'
    const title = msg.chat.title || '(private chat)';
    const reply = `Chat ID: \`${chatId}\`\nType: ${chatType}\nTitle: ${title}\n\nCopy the number above and save as CHAT_ID in telegram_api. For multiple groups, separate IDs with comma (e.g. -100111,-100222).`;
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  });

  bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Skip if already shown keyboard or if it's a balance check / getchatid command
    if (shownKeyboard.has(chatId) || !text || ["/checkbalance", "Check Balance", "💰 Check Balance", "/getchatid"].includes(text)) {
      return;
    }

    shownKeyboard.add(chatId);

    bot.sendMessage(chatId, "Welcome to Infinity Cage!", {
      reply_markup: {
        keyboard: [[{ text: "💰 Check Balance" }]],
        resize_keyboard: true,
        one_time_keyboard: false,
      }
    });
  });
}

module.exports = {
  sendTelegramMessage,
  sendTelegramToAdditionalChats,
  startTelegramBot
};
