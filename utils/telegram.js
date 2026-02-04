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

// Get employee chat IDs (supports comma- or semicolon-separated in EMPLOYEE_CHATID column)
async function getEmployeeChatIds() {
  const [rows] = await pool.execute('SELECT EMPLOYEE_CHATID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1');
  if (!rows.length || rows[0].EMPLOYEE_CHATID == null) return [];
  const raw = String(rows[0].EMPLOYEE_CHATID).trim();
  if (!raw) return [];
  return raw.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
}

// Send message to all employee chat IDs
async function sendTelegramToEmployees(text) {
  const chatIds = await getEmployeeChatIds();
  if (chatIds.length === 0) {
    console.log('No employee chat IDs found in EMPLOYEE_CHATID');
    return;
  }
  
  for (const id of chatIds) {
    try {
      await sendTelegramMessage(text, id);
    } catch (error) {
      console.error(`Error sending Telegram message to employee chat ID ${id}:`, error);
      // Continue sending to other chat IDs even if one fails
    }
  }
}

// Compress image to fit Telegram's 10MB photo limit
async function compressImage(buffer, targetSize = 9 * 1024 * 1024) {
  try {
    // Try to use sharp if available, otherwise return original buffer
    const sharp = await import('sharp').catch(() => null);
    if (!sharp || !sharp.default) {
      console.warn('Sharp not available, cannot compress image');
      return buffer; // Return original if sharp not available
    }

    let compressed = buffer;
    let quality = 80;
    let attempts = 0;
    const maxAttempts = 10;
    const originalSize = buffer.length;

    // Get image metadata first
    const image = sharp.default(buffer);
    const metadata = await image.metadata();
    let currentWidth = metadata.width || 1920;
    let currentHeight = metadata.height || 1080;

    // Calculate initial scale based on file size
    const sizeRatio = targetSize / originalSize;
    let initialScale = Math.sqrt(sizeRatio); // Square root because we're reducing both width and height
    
    // Try compressing with decreasing quality and size until we're under the limit
    while (compressed.length > targetSize && attempts < maxAttempts) {
      // Calculate scale - more aggressive reduction
      const scale = Math.max(0.3, initialScale - (attempts * 0.1)); // Start aggressive, reduce more each time
      const newWidth = Math.floor(currentWidth * scale);
      const newHeight = Math.floor(currentHeight * scale);
      
      // Reduce quality more aggressively
      const currentQuality = Math.max(30, 85 - (attempts * 8)); // Start at 85, reduce by 8 each time, min 30
      
      try {
        // Always use original buffer as source, not the compressed one
        compressed = await sharp.default(buffer)
          .resize(newWidth, newHeight, { 
            fit: 'inside', 
            withoutEnlargement: true 
          })
          .jpeg({ 
            quality: currentQuality, 
            mozjpeg: true,
            progressive: true
          })
          .toBuffer();
        
        console.log(`Compression attempt ${attempts + 1}: ${(compressed.length / 1024 / 1024).toFixed(2)}MB (${newWidth}x${newHeight}, quality: ${currentQuality})`);
        
        // Update dimensions for next iteration
        currentWidth = newWidth;
        currentHeight = newHeight;
        
        // If we're under the limit, we're done
        if (compressed.length <= targetSize) {
          break;
        }
      } catch (compressError) {
        console.warn(`Compression attempt ${attempts + 1} failed:`, compressError.message);
        // If compression fails, try with even lower quality/size
        attempts++;
        continue;
      }
      
      attempts++;
    }

    // If still too large after all attempts, use sendDocument as fallback
    if (compressed.length > targetSize) {
      console.warn(`Could not compress below ${(targetSize / 1024 / 1024).toFixed(2)}MB, final size: ${(compressed.length / 1024 / 1024).toFixed(2)}MB`);
    } else {
      console.log(`Successfully compressed from ${(originalSize / 1024 / 1024).toFixed(2)}MB to ${(compressed.length / 1024 / 1024).toFixed(2)}MB`);
    }

    return compressed;
  } catch (error) {
    console.warn('Image compression failed, using original:', error.message);
    return buffer; // Return original if compression fails
  }
}

// Send photo with caption (accepts buffer or file path)
// Automatically compresses images > 10MB to fit Telegram's photo limit
async function sendTelegramPhoto(photoBufferOrPath, filename, caption, telegramId) {
  const { default: fetch } = await import('node-fetch');
  const FormData = (await import('form-data')).default;
  const token = await getTelegramToken();
  if (!token) {
    console.error('Telegram token not found');
    return;
  }

  try {
    const TELEGRAM_PHOTO_LIMIT = 10 * 1024 * 1024; // 10MB
    let fileBuffer;
    let fileSize;

    // Get buffer and size
    if (Buffer.isBuffer(photoBufferOrPath)) {
      fileBuffer = photoBufferOrPath;
      fileSize = fileBuffer.length;
    } else {
      // Fallback for file path (if needed in future)
      const fs = await import('fs');
      fileBuffer = fs.readFileSync(photoBufferOrPath);
      fileSize = fileBuffer.length;
    }

    // Compress if file is too large
    if (fileSize > TELEGRAM_PHOTO_LIMIT) {
      console.log(`Compressing image from ${(fileSize / 1024 / 1024).toFixed(2)}MB...`);
      fileBuffer = await compressImage(fileBuffer, TELEGRAM_PHOTO_LIMIT);
      fileSize = fileBuffer.length;
    }

    // If still too large after compression, use sendDocument
    const useDocument = fileSize > TELEGRAM_PHOTO_LIMIT;
    const endpoint = useDocument ? 'sendDocument' : 'sendPhoto';
    const fieldName = useDocument ? 'document' : 'photo';

    const url = `https://api.telegram.org/bot${token}/${endpoint}`;
    const form = new FormData();
    form.append('chat_id', String(telegramId));
    form.append('caption', caption || '');
    form.append(fieldName, fileBuffer, {
      filename: filename || 'photo.jpg',
      contentType: 'image/jpeg'
    });

    const response = await fetch(url, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const result = await response.json();
    if (!result.ok) {
      const errorMsg = result.description || 'Telegram API error';
      console.error('Telegram API error:', result);
      throw new Error(errorMsg);
    }
    return result;
  } catch (error) {
    console.error('Error sending photo via Telegram:', error);
    throw error;
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

  const bot = new TelegramBot(token, { 
    polling: {
      interval: 1000,
      autoStart: true,
      params: {
        timeout: 10
      }
    }
  });
  botInstance = bot;

  console.log('✅ Telegram bot is running...');

  // Handle polling errors (network issues, connection resets, etc.)
  bot.on('polling_error', (error) => {
    console.error('⚠️ Telegram polling error:', error.message);
    
    // ECONNRESET, ETIMEDOUT, etc. are usually temporary network issues
    if (error.code === 'EFATAL' || error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
      console.log('🔄 Network issue detected. Bot will continue trying to reconnect...');
      // The bot will automatically retry, no need to restart manually
    } else {
      console.error('❌ Fatal polling error:', error);
    }
  });

  // Handle general errors
  bot.on('error', (error) => {
    console.error('❌ Telegram bot error:', error.message);
  });

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

  // Handle /start command - show welcome message with keyboard
  bot.onText(/\/start/i, async (msg) => {
    const chatId = msg.chat.id;
    const connection = await pool.getConnection();
    
    try {
      // Get AGENT_CODE from database
      const [accountResults] = await connection.query(`
        SELECT agent.AGENT_CODE
        FROM agent
        WHERE agent.TELEGRAM_ID = ?
        LIMIT 1
      `, [chatId]);

      const agentCode = accountResults.length > 0 ? accountResults[0].AGENT_CODE : 'N/A';

      const welcomeMessage = `안녕하세요 INFINITY 입니다.

INFINITY 를 이용해 주셔서 감사합니다.

고객님의 어카운트 번호는 INF${agentCode} 입니다.

✅아래는 어카운트 이용 시 유의사항입니다.

1. 어카운트 생성 후 INFINITY 에서 입·출금 및 게임 이용이 가능합니다.

2. 어카운트는 본인 외 입·출금, 내역 열람 및 게임 이용은 제한됩니다.

✅공식 텔레그램 공지 채널을 통해

INFINITY 의 최신 이벤트 및 정보를 확인하실 수 있습니다.

https://t.me/InfinityClark

✅문의사항

INFINITY 플로어
📱 @INF_FLOOR
📞 +63 920 237 9003

INFINITY 케이지
📱 @INF_CAGE
📞 +63 962 688 4227

INFINITY 컨시어지
📱 @INF_CONCIERGE
📞 +63 947 745 1088

감사합니다.`;

      bot.sendMessage(chatId, welcomeMessage, {
        reply_markup: {
          keyboard: [[{ text: "💰 Check Balance" }]],
          resize_keyboard: true,
          one_time_keyboard: false,
        }
      });
    } catch (err) {
      console.error('❌ Error sending welcome message:', err);
      bot.sendMessage(chatId, "Welcome to Infinity Cage!", {
        reply_markup: {
          keyboard: [[{ text: "💰 Check Balance" }]],
          resize_keyboard: true,
          one_time_keyboard: false,
        }
      });
    } finally {
      connection.release();
    }
  });
}

module.exports = {
  sendTelegramMessage,
  sendTelegramToAdditionalChats,
  sendTelegramToEmployees,
  getEmployeeChatIds,
  sendTelegramPhoto,
  startTelegramBot
};
