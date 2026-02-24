const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const { checkSession, sessions } = require('./auth');
const { sendTelegramMessage, sendTelegramToAdditionalChats, sendTelegramToManagement } = require('../utils/telegram');
const dashboardQueries = require('../utils/dashboardQueries');

// Helper function to get agent notification chat IDs from telegram_api table
// Returns all chat IDs stored in AGENT_CHATID column (for INF501-INF599 notifications)
async function getAgentNotificationChatIds() {
	try {
		// Query telegram_api table for GUEST user type with AGENT_CHATID column
		const [rows] = await pool.execute(
			'SELECT AGENT_CHATID FROM telegram_api WHERE ACTIVE = 1 AND USER = ? LIMIT 1',
			['GUEST']
		);
		
		if (rows.length === 0 || !rows[0].AGENT_CHATID) return [];
		
		const raw = String(rows[0].AGENT_CHATID).trim();
		if (!raw) return [];
		
		// Parse JSON format: ["123456", "789012", ...]
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return parsed.filter(Boolean);
			}
		} catch (e) {
			// Not JSON, try comma-separated format
			return raw.split(',').map(s => s.trim()).filter(Boolean);
		}
		
		return [];
	} catch (error) {
		// If AGENT_CHATID column doesn't exist yet, return empty array
		console.warn('Error fetching agent notification chat IDs (AGENT_CHATID column may not exist):', error.message);
		return [];
	}
}

// Helper function to send message to agent notification chat IDs
async function sendToAgentNotifications(agentCode, messageText) {
	if (!agentCode || !messageText) return;
	
	// Check if agent code is between INF501 and INF599 (case-insensitive)
	const agentCodeUpper = String(agentCode).toUpperCase();
	const isInRange = agentCodeUpper >= 'INF501' && agentCodeUpper <= 'INF599';
	
	if (!isInRange) return; // Only send notifications for INF501-INF599
	
	try {
		const chatIds = await getAgentNotificationChatIds();
		
		if (chatIds.length === 0) {
			return; // No notifications configured
		}
		
		// Send to each configured chat ID
		for (const chatId of chatIds) {
			try {
				await sendTelegramMessage(messageText, chatId);
			} catch (error) {
				console.error(`Error sending message to chat ID ${chatId} for agent ${agentCode}:`, error.message);
				// Continue sending to other chat IDs even if one fails
			}
		}
	} catch (error) {
		console.error('Error in sendToAgentNotifications:', error.message);
		// Continue execution even if notification fails
	}
}

// ======================= GAME LIST ==================

router.get("/game_list", checkSession, async function (req, res) {
	try {
	  const data = sessions(req, 'game_list');
	  data.permissions = req.session.permissions || 0;
  
	  // Load chip-related queries
	  const [
		sqlNNChipsBuyin,
		sqlNNChipsCashout,
		sqlAccountNNChips,
		sqlTotalCashOutRolling,
		sqlTotalRealRolling,
		sqlCCChipsBuyin,
		sqlCCChipsCashout,
		sqlNNChipsRolling,
		sqlCCChipsRolling,
		sqlRollerNNSubtract,
		sqlRollerNNAdd,
		sqlRollerCCSubtract,
		sqlRollerCCAdd,
		sqlNNBuyin,
		sqlNNReturn,
		// Add CC-specific queries
		sqlAccountCCChipsReturn,
		sqlCCChipsBuyinGame,
		sqlCCBuyin,
		sqlCCReturn
	  ] = await Promise.all([
		dashboardQueries.getNNChipsBuyin(),
		dashboardQueries.getNNChipsCashout(),
		dashboardQueries.getAccountNNChips(),
		dashboardQueries.getTotalCashOutRolling(),
		dashboardQueries.getTotalRealRolling(),
		dashboardQueries.getCCChipsBuyin(),
		dashboardQueries.getCCChipsCashout(),
		dashboardQueries.getNNChipsRolling(),
		dashboardQueries.getCCChipsRolling(),
		dashboardQueries.getRollerNNSubtract(),
		dashboardQueries.getRollerNNAdd(),
		dashboardQueries.getRollerCCSubtract(),
		dashboardQueries.getRollerCCAdd(),
		dashboardQueries.getNNBuyin(),
		dashboardQueries.getNNReturn(),
		// CC-specific queries
		dashboardQueries.getAccountCCChipsReturn(),
		dashboardQueries.getCCChipsBuyinGame(),
		dashboardQueries.getCCBuyin(),
		dashboardQueries.getCCReturn()
	  ]);
  
	  // Default selected day: first day AFTER last settlement. If 31 today but 30 not settled → show 30; disable 31 until 30 is settled.
	  const now = new Date();
	  const pad = (n) => String(n).padStart(2, '0');
	  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	  const firstOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
	  let defaultSettlementDate = todayStr;
	  try {
	    const [rows] = await pool.execute(
	      'SELECT MAX(SETTLEMENT_DATE) AS last_settlement FROM daily_settlement WHERE ACTIVE = 1 AND SETTLEMENT_DATE BETWEEN ? AND ?',
	      [firstOfMonth, todayStr]
	    );
	    const lastSettlement = rows[0] && rows[0].last_settlement;
	    if (lastSettlement) {
	      const last = lastSettlement instanceof Date ? lastSettlement : new Date(String(lastSettlement).slice(0, 10) + 'T12:00:00Z');
	      const nextDate = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
	      defaultSettlementDate = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;
	    }
	  } catch (e) {
	    // keep defaultSettlementDate = todayStr
	  }

	  // When opening via View Games link (e.g. /game_list?date=2026-02-03), use that date as initial
	  let initialSettlementDate = defaultSettlementDate;
	  const urlDate = req.query.date;
	  if (urlDate) {
	    if (urlDate === 'current') {
	      initialSettlementDate = defaultSettlementDate;
	    } else if (/^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
	      initialSettlementDate = urlDate;
	    }
	  }
	  const maxSettlementDate = defaultSettlementDate; // For picker max (allow navigating up to today/next)

	  // Settled dates this month (for disabling Settle button when date already settled)
	  let settledDatesForMonth = [];
	  try {
	    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	    const lastDayStr = `${lastDayOfMonth.getFullYear()}-${pad(lastDayOfMonth.getMonth() + 1)}-${pad(lastDayOfMonth.getDate())}`;
	    const [settledRows] = await pool.execute(
	      'SELECT DISTINCT SETTLEMENT_DATE FROM daily_settlement WHERE ACTIVE = 1 AND SETTLEMENT_DATE BETWEEN ? AND ? ORDER BY SETTLEMENT_DATE',
	      [firstOfMonth, lastDayStr]
	    );
	    settledDatesForMonth = (settledRows || []).map(r => {
	      const d = r.SETTLEMENT_DATE;
	      if (!d) return null;
	      const x = d instanceof Date ? d : new Date(String(d).slice(0, 10) + 'T12:00:00Z');
	      return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
	    }).filter(Boolean);
	  } catch (e) {
	    // keep settledDatesForMonth = []
	  }

	  // Attach values to `data`
	  Object.assign(data, {
		sqlNNChipsBuyin,
		sqlNNChipsCashout,
		sqlAccountNNChips,
		sqlTotalCashOutRolling,
		sqlTotalRealRolling,
		sqlCCChipsBuyin,
		sqlCCChipsCashout,
		sqlNNChipsRolling,
		sqlCCChipsRolling,
		sqlRollerNNSubtract,
		sqlRollerNNAdd,
		sqlRollerCCSubtract,
		sqlRollerCCAdd,
		sqlNNBuyin,
		sqlNNReturn,
		// Attach CC-related data
		sqlAccountCCChipsReturn,
		sqlCCChipsBuyinGame,
		sqlCCBuyin,
		sqlCCReturn,
		defaultSettlementDate,
		initialSettlementDate,
		maxSettlementDate,
		settledDatesForMonth
	  });
  
	  res.render("gamebook/game_list", data);
	} catch (err) {
	  console.error(err);
	  res.status(500).send("Error fetching game list data");
	}
});


// ADD GAME LIST
router.post('/add_game_list', async (req, res) => {
	const {
		txtAccountCode,
		txtChips,
		txtGameNo,
		txtAmount,
		txtGameType,
		txtNN,
		txtCC,
		txtRollerNN,
		txtRollerCC,
		txtTransType,
		txtCommisionType,
		txtCommisionRate,
		totalBalanceGuest1
	} = req.body;

	const date_now = new Date();

	// 🛡 Clean inputs and fallbacks
	const accountId = parseInt(txtAccountCode) || null;
	const gameType = txtGameType || 'N/A';
	const gameNo = txtGameNo || 'N/A';
	const chips = parseFloat((txtChips || '0').replace(/,/g, '')) || 0;
	const commType = txtCommisionType || null;
	const commRate = parseFloat((txtCommisionRate || '0').replace(/,/g, '')) || 0;
	const nnAmount = parseFloat((txtNN || '0').replace(/,/g, '')) || 0;
	const ccAmount = parseFloat((txtCC || '0').replace(/,/g, '')) || 0;
	const rollerNNAmount = parseFloat((txtRollerNN || '0').replace(/,/g, '')) || 0;
	const rollerCCAmount = parseFloat((txtRollerCC || '0').replace(/,/g, '')) || 0;
	const transType = parseInt(txtTransType) || null;
	const encodedBy = req.session?.user_id || null;
	const totalAmount = nnAmount + ccAmount;
	const totalBalanceGuest = parseFloat(totalBalanceGuest1 || '0') || 0;

	const initialMOP = {
		1: 'CASH',
		2: 'DEPOSIT',
		3: 'IOU'
	}[transType];

	if (!initialMOP || !accountId || !transType || encodedBy === null) {
		console.error('Invalid or missing fields');
		return res.status(400).send('Invalid input data');
	}

	try {
		// 1. Insert into game_list
		const [result] = await pool.execute(`
			INSERT INTO game_list (ACCOUNT_ID, GAME_TYPE, INITIAL_MOP, GAME_NO, WORKING_CHIPS, COMMISSION_TYPE, COMMISSION_PERCENTAGE, ENCODED_BY, ENCODED_DT)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[accountId, gameType, initialMOP, gameNo, chips, commType, commRate, encodedBy, date_now]
		);

		const gameId = result.insertId;

		// 2. Insert into game_record (CAGE_TYPE: 1 and 3)
		const gameRecordSQL = `
			INSERT INTO game_record (GAME_ID, TRADING_DATE, CAGE_TYPE, AMOUNT, NN_CHIPS, CC_CHIPS, TRANSACTION, ENCODED_BY, ENCODED_DT)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;
		const [record1Result] = await pool.execute(gameRecordSQL, [gameId, date_now, 1, 0, nnAmount, ccAmount, transType, encodedBy, date_now]);
		const gameRecordId = record1Result.insertId; // 👈 Save inserted IDNo
		await pool.execute(gameRecordSQL, [gameId, date_now, 3, 0, nnAmount, ccAmount, transType, encodedBy, date_now]);
		
		// 2b. Insert ROLLER CHIPS into game_record (CAGE_TYPE: 5) if roller chips provided
		if (rollerNNAmount > 0 || rollerCCAmount > 0) {
			const rollerChipsSQL = `
				INSERT INTO game_record (GAME_ID, TRADING_DATE, CAGE_TYPE, AMOUNT, NN_CHIPS, CC_CHIPS, ROLLER_NN_CHIPS, ROLLER_CC_CHIPS, ROLLER_TRANSACTION, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`;
			// For new games, roller chips are always treated as an ADD action (ROLLER_TRANSACTION = 1)
			await pool.execute(rollerChipsSQL, [gameId, date_now, 5, 0, 0, 0, rollerNNAmount, rollerCCAmount, 1, encodedBy, date_now]);
		}

		// 3. Insert into account_ledger (GAME_ID for direct link)
		if (transType === 2) {
			await pool.execute(`
				INSERT INTO account_ledger (ACCOUNT_ID, GAME_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[accountId, gameId, 2, transType, 'INITIAL BUY-IN', totalAmount, encodedBy, date_now]
			);
		} else if (transType === 3) {
			await pool.execute(`
				INSERT INTO account_ledger (ACCOUNT_ID, GAME_ID, TRANSACTION_ID, TRANSACTION_TYPE, AMOUNT, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[accountId, gameId, 10, transType, totalAmount, encodedBy, date_now]
			);
		}

		// 4. Get agent info
		const [agentResults] = await pool.execute(`
			SELECT agent.IDNo AS agent_id, agent.AGENT_CODE, agent.NAME
			FROM agent
			JOIN account ON account.AGENT_ID = agent.IDNo
			WHERE account.ACTIVE = 1 AND account.IDNo = ?`,
			[accountId]
		);

		if (agentResults.length === 0) {
			console.error("No AGENT_CODE or NAME found for Account Code:", accountId);
			return res.redirect('/game_list');
		}

		const { agent_id: agentId, AGENT_CODE: agentCode, NAME: agentName } = agentResults[0];

		// 5. Get telegram ID
		const [telegramIdResults] = await pool.execute(`
			SELECT agent.TELEGRAM_ID 
			FROM agent
			JOIN account ON account.AGENT_ID = agent.IDNo
			WHERE account.ACTIVE = 1 AND account.IDNo = ?`,
			[accountId]
		);

	const date_nowTG = new Date().toLocaleDateString();
	const updated_time = new Date().toLocaleTimeString();
	let text = '';

	// Function to translate game type to Korean
	const translateGameType = (gameTypeValue) => {
		if (!gameTypeValue) return gameTypeValue;
		const upperValue = gameTypeValue.toUpperCase();
		if (upperValue === 'LIVE') return '라이브';
		if (upperValue === 'TELEBET') return '텔레벳';
		return gameTypeValue;
	};

	// Check if game type is LIVE or Telebet to use Korean translations
	const isLiveGame = gameType && (gameType.toUpperCase() === 'LIVE' || gameType === '라이브' || txtGameType && (txtGameType.toUpperCase() === 'LIVE' || txtGameType === '라이브'));
	const isTelebetGame = gameType && (gameType.toUpperCase() === 'TELEBET' || gameType === '텔레벳' || txtGameType && (txtGameType.toUpperCase() === 'TELEBET' || txtGameType === '텔레벳'));
	const useKorean = isLiveGame || isTelebetGame;
	
	// Translate game type values
	const translatedGameType = translateGameType(gameType);
	const translatedTxtGameType = translateGameType(txtGameType);
	
	// Korean translations
	const labels = {
		gameStart: useKorean ? '게임 시작' : 'Game Start',
		account: useKorean ? '계정' : 'Account',
		game: useKorean ? '게임' : 'Game',
		buyIn: useKorean ? '바이인' : 'Buy-in',
		accountBalance: useKorean ? '잔고' : 'Account Balance',
		date: useKorean ? '날짜' : 'Date',
		time: useKorean ? '시간' : 'Time',
		cash: useKorean ? '현금' : 'Cash',
		deposit: useKorean ? '계좌출금' : 'Deposit',
		credit: useKorean ? '크레딧' : 'Credit'
	};

	// Bilingual labels (Korean English) for management and agent notifications
	const mgmtLabels = {
		gameStart: '게임 시작 Game Start',
		account: '계정 Account',
		game: '게임 Game',
		buyIn: '바이인 Buy-in',
		date: '날짜 Date',
		time: '시간 Time'
	};
	const gameTypeForMgmt = (val) => (val === '라이브' ? '라이브 Live' : val === '텔레벳' ? '텔레벳 Telebet' : val);

	let managementText = ''; // Message for management (without account balance)
	
	if (transType === 2) {
		const newTotalBalance = totalBalanceGuest - totalAmount;
		text = `Infinity Cage\n\n* ${labels.gameStart} *\n\n${labels.account}: ${agentCode} - ${agentName}\n${labels.game} #: ${result.insertId} - ${translatedTxtGameType}\n${labels.buyIn}: ${parseFloat(totalAmount).toLocaleString()} - ${labels.deposit}\n${labels.accountBalance}: ${parseFloat(newTotalBalance).toLocaleString()}\n\n${labels.date}: ${date_nowTG}\n${labels.time}: ${updated_time}`;
		// Management/agent message: bilingual labels, no payment type
		managementText = `Infinity Cage\n\n* ${mgmtLabels.gameStart} *\n\n${mgmtLabels.account} : ${agentCode} - ${agentName}\n${mgmtLabels.game} #: ${result.insertId} - ${gameTypeForMgmt(translatedTxtGameType)}\n${mgmtLabels.buyIn} : ${parseFloat(totalAmount).toLocaleString()}\n\n${mgmtLabels.date} : ${date_nowTG}\n${mgmtLabels.time} : ${updated_time}`;
	} else if (transType === 1) {
		text = `Infinity Cage\n\n* ${labels.gameStart} *\n\n${labels.account}: ${agentCode} - ${agentName}\n${labels.game} #: ${gameId} - ${translatedGameType}\n${labels.buyIn}: ${totalAmount.toLocaleString()} - ${labels.cash}\n\n${labels.date}: ${date_nowTG}\n${labels.time}: ${updated_time}`;
		// Management/agent message: bilingual labels, no payment type
		managementText = `Infinity Cage\n\n* ${mgmtLabels.gameStart} *\n\n${mgmtLabels.account} : ${agentCode} - ${agentName}\n${mgmtLabels.game} #: ${gameId} - ${gameTypeForMgmt(translatedGameType)}\n${mgmtLabels.buyIn} : ${totalAmount.toLocaleString()}\n\n${mgmtLabels.date} : ${date_nowTG}\n${mgmtLabels.time} : ${updated_time}`;
	} else if (transType === 3) {
		text = `Infinity Cage\n\n* ${labels.gameStart} *\n\n${labels.account}: ${agentCode} - ${agentName}\n${labels.game} #: ${gameId} - ${translatedGameType}\n${labels.buyIn}: ${totalAmount.toLocaleString()} - ${labels.credit}\n\n${labels.date}: ${date_nowTG}\n${labels.time}: ${updated_time}`;
		// Management/agent message: bilingual labels, no payment type
		managementText = `Infinity Cage\n\n* ${mgmtLabels.gameStart} *\n\n${mgmtLabels.account} : ${agentCode} - ${agentName}\n${mgmtLabels.game} #: ${gameId} - ${gameTypeForMgmt(translatedGameType)}\n${mgmtLabels.buyIn} : ${totalAmount.toLocaleString()}\n\n${mgmtLabels.date} : ${date_nowTG}\n${mgmtLabels.time} : ${updated_time}`;
	}

		if (text && agentId) {
			const telegramId = telegramIdResults.length > 0 ? telegramIdResults[0].TELEGRAM_ID : null;
			if (telegramId) {
				try {
					await sendTelegramMessage(text, telegramId);
				} catch (telegramError) {
					console.error('Failed to send Telegram message to agent:', telegramError.message);
				}
			}
			try {
				await sendToAgentNotifications(agentCode, managementText);
			} catch (telegramError) {
				console.error('Failed to send to agent notifications:', telegramError.message);
			}
			try {
				await sendTelegramToAdditionalChats(text);
			} catch (telegramError) {
				console.error('Failed to send Telegram message to additional chats:', telegramError.message);
			}
			try {
				await sendTelegramToManagement(managementText);
			} catch (telegramError) {
				console.error('Failed to send Telegram message to management:', telegramError.message);
			}
		}

		// 6. Insert cash_transaction entry for cash buy-in
		if (transType === 1 && agentId) {
			const cashTransactionQuery = `
				INSERT INTO cash_transaction (TRANSACTION_ID, AGENT_ID, AMOUNT, CATEGORY, TYPE, REMARKS, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`;
			await pool.execute(cashTransactionQuery, [
				gameId,
				agentId,
				totalAmount.toString(),
				'Game buy-in',
				1,
				`Game - ${gameId}`,
				encodedBy,
				date_now
			]);
		}

		res.redirect('/game_list');
	} catch (err) {
		console.error('Error in /add_game_list:', err);
		res.status(500).send('Internal Server Error');
	}
});


// ======================= GAME SERVICES ==================
// Get services for a game
router.get('/game_services/:gameId', checkSession, async (req, res) => {
	try {
		const gameId = parseInt(req.params.gameId, 10);
		if (Number.isNaN(gameId)) {
			return res.status(400).json({ error: 'Invalid game id' });
		}

		const [rows] = await pool.execute(
			`SELECT 
				gs.IDNo,
				gs.GAME_ID,
				gs.SERVICE_TYPE,
				gs.AMOUNT,
				gs.REMARKS,
				gs.TRANSACTION_ID,
				gs.AGENT_ID,
				gs.ACTIVE,
				gs.ENCODED_BY,
				gs.ENCODED_DT,
				COALESCE(ui.USERNAME, gs.ENCODED_BY) AS PROCESSED_BY
			FROM game_services gs
			LEFT JOIN user_info ui ON ui.IDNo = gs.ENCODED_BY
			WHERE gs.ACTIVE = 1 AND gs.GAME_ID = ?
			ORDER BY gs.ENCODED_DT DESC, gs.IDNo DESC`,
			[gameId]
		);

		return res.json(rows);
	} catch (err) {
		console.error('Error fetching game services:', err);
		return res.status(500).json({ error: 'Error fetching game services' });
	}
});

// Add a service to a game (use /add_game_services to avoid confusion with GET)
router.post('/add_game_services', checkSession, async (req, res) => {
	try {
		const { game_id, service_type, amount, remarks, transaction_id, agent_id } = req.body;
		const gameId = parseInt(game_id, 10);
		const amt = parseFloat((amount || '0').toString().replace(/,/g, '')) || 0;
		const svc = (service_type || '').toLowerCase();
		const validTypes = ['fnb', 'hotel', 'delivery'];
		let transactionId = parseInt(transaction_id, 10);
		transactionId = [2, 3].includes(transactionId) ? transactionId : 3;
		let agentId = parseInt(agent_id, 10);
		if (Number.isNaN(agentId) || agentId === 0) {
			agentId = null;
		}

		if (Number.isNaN(gameId) || !validTypes.includes(svc)) {
			return res.status(400).json({ error: 'Invalid input' });
		}

		const encodedBy = req.session?.user_id || null;
		const now = new Date();
		const [gameRows] = await pool.execute(`SELECT ACCOUNT_ID FROM game_list WHERE IDNo = ? LIMIT 1`, [gameId]);
		const accountId = (Array.isArray(gameRows) && gameRows.length > 0) ? gameRows[0].ACCOUNT_ID : null;

		const [insertResult] = await pool.execute(
			`INSERT INTO game_services (GAME_ID, SERVICE_TYPE, AMOUNT, REMARKS, TRANSACTION_ID, AGENT_ID, ACTIVE, ENCODED_BY, ENCODED_DT, SOURCE_TYPE)
			 VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
			[gameId, svc, amt, remarks || '', transactionId, agentId, encodedBy, now, 'GUEST']
		);


		const insertCashEntry = async (type) => {
			const cashTransactionQuery = `
				INSERT INTO cash_transaction (TRANSACTION_ID, AGENT_ID, AMOUNT, CATEGORY, TYPE, REMARKS, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`;

			await pool.execute(cashTransactionQuery, [
				insertResult.insertId,
				agentId,
				amt.toString(),
				svc,
				type,
				`Game - ${gameId} ${remarks ? '- ' + remarks : ''}`.trim(),
				encodedBy,
				now
			]);
		};

		// Services from game_list modal always go to Cash-In (type 1), regardless of Cash/Deposit/Commission
		await insertCashEntry(1);

		if (transactionId === 2 && accountId) {
			await pool.execute(
				`INSERT INTO account_ledger (ACCOUNT_ID, GAME_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT)
				 VALUES (?, ?, 2, 2, 'SERVICES', ?, ?, ?)`,
				[accountId, gameId, amt, encodedBy, now]
			);
		}

		// Return the refreshed list
		const [rows] = await pool.execute(
			`SELECT 
				gs.IDNo,
				gs.GAME_ID,
				gs.SERVICE_TYPE,
				gs.AMOUNT,
				gs.REMARKS,
				gs.TRANSACTION_ID,
				gs.AGENT_ID,
				gs.ACTIVE,
				gs.ENCODED_BY,
				gs.ENCODED_DT,
				COALESCE(ui.USERNAME, gs.ENCODED_BY) AS PROCESSED_BY
			FROM game_services gs
			LEFT JOIN user_info ui ON ui.IDNo = gs.ENCODED_BY
			WHERE gs.ACTIVE = 1 AND gs.GAME_ID = ?
			ORDER BY gs.ENCODED_DT DESC, gs.IDNo DESC`,
			[gameId]
		);

		return res.json(rows);
	} catch (err) {
		console.error('Error adding game service:', err);
		return res.status(500).json({ error: 'Error adding game service' });
	}
});

// Update a service
router.put('/game_services/:id', checkSession, async (req, res) => {
	try {
		const serviceId = parseInt(req.params.id, 10);
		const { game_id, service_type, amount, remarks, transaction_id } = req.body;
		const gameId = parseInt(game_id, 10);
		const amt = parseFloat((amount || '0').toString().replace(/,/g, '')) || 0;
		const svc = (service_type || '').toLowerCase();
		const validTypes = ['fnb', 'hotel', 'delivery'];
		let transactionId = parseInt(transaction_id, 10);
		transactionId = [2, 3].includes(transactionId) ? transactionId : 3;

		const [[existingService]] = await pool.execute(
			`SELECT AMOUNT, TRANSACTION_ID, ENCODED_BY, ENCODED_DT, SERVICE_TYPE, AGENT_ID, REMARKS, GAME_ID FROM game_services WHERE IDNo = ?`,
			[serviceId]
		);

		if (Number.isNaN(serviceId) || Number.isNaN(gameId) || !validTypes.includes(svc)) {
			return res.status(400).json({ error: 'Invalid input' });
		}

		const updatedBy = req.session?.user_id || null;
		const encodedBy = updatedBy;
		const now = new Date();

		await pool.execute(
			`UPDATE game_services
			 SET SERVICE_TYPE = ?, AMOUNT = ?, REMARKS = ?, TRANSACTION_ID = ?, UPDATED_BY = ?, UPDATED_DT = ?
			 WHERE IDNo = ?`,
			[svc, amt, remarks || '', transactionId, updatedBy, now, serviceId]
		);

		// delete old ledger entry if previous transaction was deposit (add GAME_ID for precise matching)
		if (existingService && parseInt(existingService.TRANSACTION_ID, 10) === 2) {
			const [gameRows] = await pool.execute(
				`SELECT ACCOUNT_ID FROM game_list WHERE IDNo = ? LIMIT 1`,
				[gameId]
			);
			const accountId = (Array.isArray(gameRows) && gameRows.length > 0) ? gameRows[0].ACCOUNT_ID : null;
			if (accountId) {
				const [ledgerRows] = await pool.execute(
					`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND (GAME_ID = ? OR GAME_ID IS NULL) AND TRANSACTION_ID = 2 AND TRANSACTION_TYPE = 2 AND TRANSACTION_DESC = 'SERVICES' AND AMOUNT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
					[accountId, gameId, existingService.AMOUNT]
				);
				if (ledgerRows.length > 0) {
					await pool.execute(
						'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
						[updatedBy, now, ledgerRows[0].IDNo]
					);
				}
			}
		}

		// insert ledger entry if now a deposit
		if (transactionId === 2) {
			const [gameRows] = await pool.execute(
				`SELECT ACCOUNT_ID FROM game_list WHERE IDNo = ? LIMIT 1`,
				[gameId]
			);
			const accountId = (Array.isArray(gameRows) && gameRows.length > 0) ? gameRows[0].ACCOUNT_ID : null;
			if (accountId) {
				await pool.execute(
					`INSERT INTO account_ledger (ACCOUNT_ID, GAME_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT)
					 VALUES (?, ?, 2, 2, 'SERVICES', ?, ?, ?)`,
					[accountId, gameId, amt, updatedBy, now]
				);
			}
		}

		await pool.execute(
			'UPDATE cash_transaction SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE TRANSACTION_ID = ? AND ACTIVE = 1',
			[updatedBy, now, serviceId]
		);

		const insertCashTransactions = async (type) => {
			const remarkText = [`Game - ${gameId}`, remarks ? remarks : ''].filter(Boolean).join(' - ');
			const cashTransactionQuery = `
				INSERT INTO cash_transaction (TRANSACTION_ID, AGENT_ID, AMOUNT, CATEGORY, TYPE, REMARKS, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`;

			await pool.execute(cashTransactionQuery, [
				serviceId,
				existingService?.AGENT_ID || null,
				amt.toString(),
				svc,
				type,
				remarkText,
				encodedBy,
				now
			]);
		};

		// Services from game_list modal always go to Cash-In (type 1), regardless of Cash/Deposit/Commission
		await insertCashTransactions(1);

		const [rows] = await pool.execute(
			`SELECT 
				gs.IDNo,
				gs.GAME_ID,
				gs.SERVICE_TYPE,
				gs.AMOUNT,
				gs.REMARKS,
				gs.TRANSACTION_ID,
				gs.AGENT_ID,
				gs.ACTIVE,
				gs.ENCODED_BY,
				gs.ENCODED_DT,
				COALESCE(ui.USERNAME, gs.ENCODED_BY) AS PROCESSED_BY
			FROM game_services gs
			LEFT JOIN user_info ui ON ui.IDNo = gs.ENCODED_BY
			WHERE gs.ACTIVE = 1 AND gs.GAME_ID = ?
			ORDER BY gs.ENCODED_DT DESC, gs.IDNo DESC`,
			[gameId]
		);

		return res.json(rows);
	} catch (err) {
		console.error('Error updating game service:', err);
		return res.status(500).json({ error: 'Error updating game service' });
	}
});

// Delete a service (soft delete)
router.delete('/game_services/:id', checkSession, async (req, res) => {
	try {
		const serviceId = parseInt(req.params.id, 10);
		const gameId = parseInt(req.body.game_id, 10);

		if (Number.isNaN(serviceId) || Number.isNaN(gameId)) {
			return res.status(400).json({ error: 'Invalid input' });
		}

		const updatedBy = req.session?.user_id || null;
		const now = new Date();

		// capture values before update for ledger cleanup
		const [[existingService]] = await pool.execute(
			`SELECT GAME_ID, AMOUNT, TRANSACTION_ID, ENCODED_BY, ENCODED_DT
			 FROM game_services
			 WHERE IDNo = ?`,
			[serviceId]
		);

		await pool.execute(
			`UPDATE game_services
			 SET ACTIVE = 0, UPDATED_BY = ?, UPDATED_DT = ?
			 WHERE IDNo = ?`,
			[updatedBy, now, serviceId]
		);

		if (existingService && parseInt(existingService.TRANSACTION_ID, 10) === 2) {
			const [gameRows] = await pool.execute(
				`SELECT ACCOUNT_ID FROM game_list WHERE IDNo = ? LIMIT 1`,
				[existingService.GAME_ID]
			);
			const accountId = (Array.isArray(gameRows) && gameRows.length > 0) ? gameRows[0].ACCOUNT_ID : null;
			if (accountId) {
				const [ledgerRows] = await pool.execute(
					`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND (GAME_ID = ? OR GAME_ID IS NULL) AND TRANSACTION_ID = 2 AND TRANSACTION_TYPE = 2 AND TRANSACTION_DESC = 'SERVICES' AND AMOUNT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
					[accountId, existingService.GAME_ID, existingService.AMOUNT]
				);
				if (ledgerRows.length > 0) {
					await pool.execute(
						'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
						[updatedBy, now, ledgerRows[0].IDNo]
					);
				}
			}
		}

		const [rows] = await pool.execute(
			`SELECT 
				gs.IDNo,
				gs.GAME_ID,
				gs.SERVICE_TYPE,
				gs.AMOUNT,
				gs.REMARKS,
				gs.TRANSACTION_ID,
				gs.AGENT_ID,
				gs.ACTIVE,
				gs.ENCODED_BY,
				gs.ENCODED_DT,
				COALESCE(ui.USERNAME, gs.ENCODED_BY) AS PROCESSED_BY
			FROM game_services gs
			LEFT JOIN user_info ui ON ui.IDNo = gs.ENCODED_BY
			WHERE gs.ACTIVE = 1 AND gs.GAME_ID = ?
			ORDER BY gs.ENCODED_DT DESC, gs.IDNo DESC`,
			[gameId]
		);

		await pool.execute(
			'UPDATE cash_transaction SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE TRANSACTION_ID = ? AND ACTIVE = 1',
			[updatedBy, now, serviceId]
		);

		return res.json(rows);
	} catch (err) {
		console.error('Error deleting game service:', err);
		return res.status(500).json({ error: 'Error deleting game service' });
	}
});

// GET GAME LIST
router.get('/game_list_data', async (req, res) => {
    let { start, end, id, date, fromDate, toDate } = req.query;

    const gameId = id ? parseInt(id, 10) : null;

    // Define baseSelect first (needed for date range and settlement queries)
    const baseSelect = `
        SELECT 
            game_list.*,
            game_list.IDNo AS game_list_id, 
            game_list.ACTIVE AS game_status, 
            account.IDNo AS account_no, 
            agent.IDNo AS AGENT_ID,
            agent.AGENT_CODE AS agent_code, 
            agent.NAME AS agent_name,  
            game_list.ENCODED_DT AS GAME_DATE_START 
        FROM game_list
        JOIN account ON game_list.ACCOUNT_ID = account.IDNo
        JOIN agent ON agent.IDNo = account.AGENT_ID
        JOIN agency ON agency.IDNo = agent.AGENCY
    `;

    // If a specific game ID is requested, bypass date filtering to ensure it shows up.
    if (gameId) {
        const queryById = `
            SELECT 
                *, 
                game_list.IDNo AS game_list_id, 
                game_list.ACTIVE AS game_status, 
                account.IDNo AS account_no, 
                agent.IDNo AS AGENT_ID,
                agent.AGENT_CODE AS agent_code, 
                agent.NAME AS agent_name,  
                game_list.ENCODED_DT AS GAME_DATE_START 
            FROM game_list
            JOIN account ON game_list.ACCOUNT_ID = account.IDNo
            JOIN agent ON agent.IDNo = account.AGENT_ID
            JOIN agency ON agency.IDNo = agent.AGENCY
            WHERE game_list.ACTIVE != 0 
              AND game_list.IDNo = ?
            ORDER BY game_list.IDNo ASC
        `;

        try {
            const [rows] = await pool.execute(queryById, [gameId]);
            
            // Add pending flag
            const todayStr = new Date().toISOString().slice(0, 10);
            const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
            const [latestSettlement] = await pool.execute(
                `SELECT RUN_AT FROM daily_settlement WHERE ACTIVE = 1 AND SETTLEMENT_DATE BETWEEN ? AND ? ORDER BY SETTLEMENT_DATE DESC, RUN_AT DESC LIMIT 1`,
                [firstOfMonth, todayStr]
            );
            
            if (latestSettlement.length > 0) {
                const settlementRunTime = latestSettlement[0].RUN_AT instanceof Date 
                    ? latestSettlement[0].RUN_AT 
                    : new Date(latestSettlement[0].RUN_AT);
                rows.forEach(row => {
                    const gameCreatedAt = row.ENCODED_DT instanceof Date ? row.ENCODED_DT : new Date(row.ENCODED_DT);
                    row.is_pending = (gameCreatedAt < settlementRunTime && row.ACTIVE != 1) ? 1 : 0;
                });
            } else {
                rows.forEach(row => { row.is_pending = 0; });
            }
            
            return res.json(rows);
        } catch (error) {
            console.error('Error fetching data by ID:', error);
            return res.status(500).json({ error: 'Error fetching data' });
        }
    }

    // Date range mode: Filter by ENCODED_DT date range
    if (fromDate && toDate) {
        const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
        if (!isValidDate(fromDate) || !isValidDate(toDate)) {
            console.error('[Game List Backend] Invalid date format - fromDate:', fromDate, 'toDate:', toDate);
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
        }

        const query = baseSelect + `
            WHERE game_list.ACTIVE != 0 
              AND DATE(game_list.ENCODED_DT) BETWEEN ? AND ?
            ORDER BY game_list.IDNo ASC
        `;

        try {
            const [rows] = await pool.execute(query, [fromDate, toDate]);
            
            // Add pending flag for games that were created before latest settlement run but are still ON GAME
            const todayStr = new Date().toISOString().slice(0, 10);
            const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
            
            const [latestSettlement] = await pool.execute(
                `SELECT RUN_AT FROM daily_settlement WHERE ACTIVE = 1 AND SETTLEMENT_DATE BETWEEN ? AND ? ORDER BY SETTLEMENT_DATE DESC, RUN_AT DESC LIMIT 1`,
                [firstOfMonth, todayStr]
            );
            
            if (latestSettlement.length > 0) {
                const settlementRunTime = latestSettlement[0].RUN_AT instanceof Date 
                    ? latestSettlement[0].RUN_AT 
                    : new Date(latestSettlement[0].RUN_AT);
                
                rows.forEach(row => {
                    const gameCreatedAt = row.ENCODED_DT instanceof Date 
                        ? row.ENCODED_DT 
                        : new Date(row.ENCODED_DT);
                    
                    row.is_pending = (gameCreatedAt < settlementRunTime && row.ACTIVE != 1) ? 1 : 0;
                });
            } else {
                rows.forEach(row => { row.is_pending = 0; });
            }
            
            return res.json(rows);
        } catch (error) {
            console.error('[Game List Backend] Error fetching data by date range:', error);
            return res.status(500).json({ error: 'Error fetching data' });
        }
    }

    // Daily settlement filter: date=current (unsettled only) or date=YYYY-MM-DD (settled that day; if today and no settlement yet, return unsettled)
    if (date !== undefined && date !== null && date !== '') {
        try {
            if (date === 'current') {
                const query = baseSelect + `
                    WHERE game_list.ACTIVE != 0 
                      AND (game_list.DAILY_SETTLEMENT = 1 OR game_list.DAILY_SETTLEMENT IS NULL)
                    ORDER BY game_list.IDNo ASC
                `;
                const [rows] = await pool.execute(query);
                
                // Add pending flag
                const todayStr = new Date().toISOString().slice(0, 10);
                const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
                const [latestSettlement] = await pool.execute(
                    `SELECT RUN_AT FROM daily_settlement WHERE ACTIVE = 1 AND SETTLEMENT_DATE BETWEEN ? AND ? ORDER BY SETTLEMENT_DATE DESC, RUN_AT DESC LIMIT 1`,
                    [firstOfMonth, todayStr]
                );
                
                if (latestSettlement.length > 0) {
                    const settlementRunTime = latestSettlement[0].RUN_AT instanceof Date 
                        ? latestSettlement[0].RUN_AT 
                        : new Date(latestSettlement[0].RUN_AT);
                    rows.forEach(row => {
                        const gameCreatedAt = row.ENCODED_DT instanceof Date ? row.ENCODED_DT : new Date(row.ENCODED_DT);
                        row.is_pending = (gameCreatedAt < settlementRunTime && row.ACTIVE != 1) ? 1 : 0;
                    });
                } else {
                    rows.forEach(row => { row.is_pending = 0; });
                }
                
                return res.json(rows);
            }
            const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
            if (isValidDate(date)) {
                const todayServer = new Date().toISOString().slice(0, 10);
                const [hasSettlement] = await pool.execute(
                    'SELECT IDNo FROM daily_settlement WHERE SETTLEMENT_DATE = ? AND ACTIVE = 1 LIMIT 1',
                    [date]
                );
                if (hasSettlement.length > 0) {
                    const query = baseSelect + `
                        JOIN daily_settlement_games dsg ON game_list.IDNo = dsg.GAME_ID
                        JOIN daily_settlement ds ON dsg.DAILY_SETTLEMENT_ID = ds.IDNo AND ds.ACTIVE = 1
                        WHERE game_list.ACTIVE != 0 
                          AND ds.SETTLEMENT_DATE = ?
                        ORDER BY game_list.IDNo ASC
                    `;
                    const [rows] = await pool.execute(query, [date]);
                    
                    // Settled games don't need pending flag (they're already settled)
                    rows.forEach(row => { row.is_pending = 0; });
                    
                    return res.json(rows);
                }
                if (date >= todayServer) {
                    const query = baseSelect + `
                        WHERE game_list.ACTIVE != 0 
                          AND (game_list.DAILY_SETTLEMENT = 1 OR game_list.DAILY_SETTLEMENT IS NULL)
                        ORDER BY game_list.IDNo ASC
                    `;
                    const [rows] = await pool.execute(query);
                    
                    // Add pending flag
                    const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
                    const [latestSettlement] = await pool.execute(
                        `SELECT RUN_AT FROM daily_settlement WHERE ACTIVE = 1 AND SETTLEMENT_DATE BETWEEN ? AND ? ORDER BY SETTLEMENT_DATE DESC, RUN_AT DESC LIMIT 1`,
                        [firstOfMonth, todayServer]
                    );
                    
                    if (latestSettlement.length > 0) {
                        const settlementRunTime = latestSettlement[0].RUN_AT instanceof Date 
                            ? latestSettlement[0].RUN_AT 
                            : new Date(latestSettlement[0].RUN_AT);
                        rows.forEach(row => {
                            const gameCreatedAt = row.ENCODED_DT instanceof Date ? row.ENCODED_DT : new Date(row.ENCODED_DT);
                            row.is_pending = (gameCreatedAt < settlementRunTime && row.ACTIVE != 1) ? 1 : 0;
                        });
                    } else {
                        rows.forEach(row => { row.is_pending = 0; });
                    }
                    
                    return res.json(rows);
                }
                // Past date, no settlement yet: show ALL unsettled games (not just that day)
                // Since the date hasn't been settled, all unsettled games are still part of that settlement batch
                const queryPastUnsettled = baseSelect + `
                    WHERE game_list.ACTIVE != 0 
                      AND (game_list.DAILY_SETTLEMENT = 1 OR game_list.DAILY_SETTLEMENT IS NULL)
                    ORDER BY game_list.IDNo ASC
                `;
                const [rowsPast] = await pool.execute(queryPastUnsettled);
                
                // Add pending flag
                const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
                const [latestSettlementPast] = await pool.execute(
                    `SELECT RUN_AT FROM daily_settlement WHERE ACTIVE = 1 AND SETTLEMENT_DATE BETWEEN ? AND ? ORDER BY SETTLEMENT_DATE DESC, RUN_AT DESC LIMIT 1`,
                    [firstOfMonth, todayServer]
                );
                
                if (latestSettlementPast.length > 0) {
                    const settlementRunTime = latestSettlementPast[0].RUN_AT instanceof Date 
                        ? latestSettlementPast[0].RUN_AT 
                        : new Date(latestSettlementPast[0].RUN_AT);
                    rowsPast.forEach(row => {
                        const gameCreatedAt = row.ENCODED_DT instanceof Date ? row.ENCODED_DT : new Date(row.ENCODED_DT);
                        row.is_pending = (gameCreatedAt < settlementRunTime && row.ACTIVE != 1) ? 1 : 0;
                    });
                } else {
                    rowsPast.forEach(row => { row.is_pending = 0; });
                }
                
                return res.json(rowsPast);
            }
        } catch (err) {
            console.error('[Daily Settlement] Error fetching game list by settlement date:', err);
            return res.status(500).json({ error: 'Error fetching data' });
        }
    }

    // Legacy: use start/end date range (ENCODED_DT)
    if (!start || !end) {
        const currentDate = new Date();
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        start = firstDayOfMonth.toISOString().slice(0, 10);
        end = currentDate.toISOString().slice(0, 10);
    }

    const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!isValidDate(start) || !isValidDate(end)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const query = baseSelect + `
        WHERE game_list.ACTIVE != 0 
          AND DATE(game_list.ENCODED_DT) BETWEEN ? AND ?
        ORDER BY game_list.IDNo ASC
    `;

    try {
        const [rows] = await pool.execute(query, [start, end]);
        
        // Add pending flag for games that were created before latest settlement run but are still ON GAME
        const todayStr = new Date().toISOString().slice(0, 10);
        const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
        
        const [latestSettlement] = await pool.execute(
            `SELECT RUN_AT FROM daily_settlement WHERE ACTIVE = 1 AND SETTLEMENT_DATE BETWEEN ? AND ? ORDER BY SETTLEMENT_DATE DESC, RUN_AT DESC LIMIT 1`,
            [firstOfMonth, todayStr]
        );
        
        if (latestSettlement.length > 0) {
            const settlementRunTime = latestSettlement[0].RUN_AT instanceof Date 
                ? latestSettlement[0].RUN_AT 
                : new Date(latestSettlement[0].RUN_AT);
            
            // Add is_pending flag to each row
            rows.forEach(row => {
                // Pending: Created before settlement run AND still ON GAME (ACTIVE != 1)
                const gameCreatedAt = row.ENCODED_DT instanceof Date 
                    ? row.ENCODED_DT 
                    : new Date(row.ENCODED_DT);
                
                row.is_pending = (gameCreatedAt < settlementRunTime && row.ACTIVE != 1) ? 1 : 0;
            });
        } else {
            // No settlement yet, no pending games
            rows.forEach(row => {
                row.is_pending = 0;
            });
        }
        
        res.json(rows);
    } catch (error) {
        console.error('Error fetching data:', error);
        return res.status(500).json({ error: 'Error fetching data' });
    }
});


// POST run daily settlement (move all unsettled games into today's settlement)
router.post('/game_list/daily_settlement/run', async (req, res) => {
    const encodedBy = req.session?.user_id;
    if (!encodedBy) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const settlementDate = (req.body && req.body.settlement_date) 
        ? req.body.settlement_date 
        : new Date().toISOString().slice(0, 10);

    const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!isValidDate(settlementDate)) {
        return res.status(400).json({ error: 'Invalid settlement_date. Use YYYY-MM-DD.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.execute(
            'SELECT IDNo FROM daily_settlement WHERE SETTLEMENT_DATE = ? AND ACTIVE = 1',
            [settlementDate]
        );
        if (existing.length > 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'Settlement for this date already exists.' });
        }

        const [insertSettlement] = await connection.execute(
            `INSERT INTO daily_settlement (SETTLEMENT_DATE, RUN_AT, ENCODED_BY, STATUS, ACTIVE)
             VALUES (?, NOW(), ?, 'finalized', 1)`,
            [settlementDate, encodedBy]
        );
        const settlementId = insertSettlement.insertId;

        const [openGames] = await connection.execute(
            `SELECT IDNo FROM game_list WHERE (ACTIVE = 1 OR ACTIVE = 3) AND (DAILY_SETTLEMENT = 1 OR DAILY_SETTLEMENT IS NULL)`
        );

        for (const row of openGames) {
            await connection.execute(
                'INSERT INTO daily_settlement_games (DAILY_SETTLEMENT_ID, GAME_ID, ADDED_AT) VALUES (?, ?, NOW())',
                [settlementId, row.IDNo]
            );
        }

        await connection.execute(
            `UPDATE game_list SET DAILY_SETTLEMENT = 2 WHERE (ACTIVE = 1 OR ACTIVE = 3) AND (DAILY_SETTLEMENT = 1 OR DAILY_SETTLEMENT IS NULL)`
        );

        await connection.commit();
        connection.release();
        res.json({
            success: true,
            settlement_date: settlementDate,
            settlement_id: settlementId,
            game_count: openGames.length
        });
    } catch (err) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
            connection.release();
        }
        console.error('Error running daily settlement:', err);
        res.status(500).json({ error: 'Error running daily settlement' });
    }
});

// GET GAME RECORD FOR A SPECIFIC GAME
router.get('/game_list/:id/record', async (req, res) => {
    const id = parseInt(req.params.id);
    const query = `SELECT AMOUNT, NN_CHIPS, CC_CHIPS, ROLLER_NN_CHIPS, ROLLER_CC_CHIPS, ROLLER_TRANSACTION, CAGE_TYPE FROM game_record
                   WHERE ACTIVE != 0 AND GAME_ID = ? 
                   ORDER BY IDNo ASC`;

    try {
        const [result] = await pool.execute(query, [id]);
        res.json(result);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).send('Error fetching data');
    }
});



// DELETE GAME LIST (Deactivate - soft delete)
router.put('/game_list/remove/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    let date_now = new Date();

    const query = `UPDATE game_list SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;

    try {
        await pool.execute(query, [0, req.session.user_id, date_now, id]);
        res.send('GAME LIST updated successfully');
    } catch (err) {
        console.error('Error updating GAME LIST:', err);
        res.status(500).send('Error updating GAME LIST');
    }
});

// DELETE GAME LIST (Super Admin only - SOFT DELETE, excludes game_services & daily_settlement)
router.delete('/game_list/delete/:id', checkSession, async (req, res) => {
	const permissions = req.session?.permissions;
	if (permissions !== 0) {
		return res.status(403).json({ error: 'Only Super Admin can delete games.' });
	}

	const gameId = parseInt(req.params.id);
	if (!gameId || isNaN(gameId)) {
		return res.status(400).json({ error: 'Invalid game ID' });
	}

	const date_now = new Date();
	const editedBy = req.session?.user_id || null;

	const connection = await pool.getConnection();
	try {
		await connection.beginTransaction();

		// 1. Get game info (ACCOUNT_ID, ENCODED_DT for account_ledger matching)
		const [gameRows] = await connection.execute(
			'SELECT ACCOUNT_ID, FNB, PAYMENT, SETTLED, ENCODED_DT FROM game_list WHERE IDNo = ? AND ACTIVE != 0',
			[gameId]
		);
		if (gameRows.length === 0) {
			await connection.rollback();
			return res.status(404).json({ error: 'Game not found' });
		}
		const accountId = gameRows[0].ACCOUNT_ID;
		const gamePayment = gameRows[0].PAYMENT != null ? gameRows[0].PAYMENT : gameRows[0].FNB;
		const isSettled = gameRows[0].SETTLED === 1;
		const gameEncodedDt = gameRows[0].ENCODED_DT;

		// 2. Get all game_record IDs (exclude game_services - not touched)
		const [recordRows] = await connection.execute(
			'SELECT IDNo FROM game_record WHERE GAME_ID = ? AND ACTIVE != 0',
			[gameId]
		);
		const recordIds = recordRows.map(r => r.IDNo);

		// 3. Soft delete cash_transaction (TRANSACTION_ID = game_record.IDNo or gameId for buy-in)
		for (const rid of recordIds) {
			await connection.execute(
				'UPDATE cash_transaction SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE TRANSACTION_ID = ? AND ACTIVE = 1',
				[editedBy, date_now, rid]
			);
		}
		await connection.execute(
			'UPDATE cash_transaction SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE TRANSACTION_ID = ? AND ACTIVE = 1',
			[editedBy, date_now, gameId]
		);
		// EXCLUDED: game_services cash_transaction (TRANSACTION_ID = service IDNo)

		// 4. Soft delete account_ledger entries (game_record-related only, EXCLUDE game_services)
		// 4a. Direct link: soft delete all entries with GAME_ID = gameId (exclude SERVICES)
		await connection.execute(
			`UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE GAME_ID = ? AND ACTIVE = 1 AND COALESCE(TRANSACTION_DESC, '') != 'SERVICES'`,
			[editedBy, date_now, gameId]
		);
		// 4b. Backward compat: match old records (GAME_ID NULL) by ACCOUNT_ID, AMOUNT, ENCODED_DT
		const [allRecords] = await connection.execute(
			'SELECT IDNo, CAGE_TYPE, NN_CHIPS, CC_CHIPS, TRANSACTION, ENCODED_DT FROM game_record WHERE GAME_ID = ? AND ACTIVE != 0',
			[gameId]
		);
		for (const rec of allRecords) {
			const nn = rec.NN_CHIPS || 0;
			const cc = rec.CC_CHIPS || 0;
			const totalAmt = parseFloat(nn) + parseFloat(cc);
			const encDt = rec.ENCODED_DT;
			const trans = rec.TRANSACTION;

			if (rec.CAGE_TYPE === 2) {
				const [ledgerRows] = await connection.execute(
					`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND GAME_ID IS NULL AND TRANSACTION_ID = 1 AND TRANSACTION_TYPE = ? AND TRANSACTION_DESC = 'Chips Returned' AND AMOUNT = ? AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
					[accountId, trans, totalAmt, encDt]
				);
				if (ledgerRows.length > 0) {
					await connection.execute(
						'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
						[editedBy, date_now, ledgerRows[0].IDNo]
					);
				}
			} else if (rec.CAGE_TYPE === 1 || rec.CAGE_TYPE === 3) {
				if (trans == 2) {
					const [ledgerRows] = await connection.execute(
						`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND GAME_ID IS NULL AND TRANSACTION_ID = 2 AND TRANSACTION_TYPE = 2 AND TRANSACTION_DESC IN ('INITIAL BUY-IN','ADDITIONAL BUY-IN') AND AMOUNT = ? AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
						[accountId, totalAmt, encDt]
					);
					if (ledgerRows.length > 0) {
						await connection.execute(
							'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
							[editedBy, date_now, ledgerRows[0].IDNo]
						);
					}
				} else if (trans == 3) {
					const [ledgerRows] = await connection.execute(
						`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND GAME_ID IS NULL AND TRANSACTION_ID = 10 AND TRANSACTION_TYPE = 3 AND AMOUNT = ? AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
						[accountId, totalAmt, encDt]
					);
					if (ledgerRows.length > 0) {
						await connection.execute(
							'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
							[editedBy, date_now, ledgerRows[0].IDNo]
						);
					}
				}
			}
		}
		// Initial buy-in from add_game_list (match by game ENCODED_DT, old records only)
		const [initLedger2] = await connection.execute(
			`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND GAME_ID IS NULL AND TRANSACTION_ID = 2 AND TRANSACTION_TYPE IN (1,2) AND TRANSACTION_DESC = 'INITIAL BUY-IN' AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 2`,
			[accountId, gameEncodedDt]
		);
		for (const row of initLedger2) {
			await connection.execute(
				'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
				[editedBy, date_now, row.IDNo]
			);
		}
		const [initLedger10] = await connection.execute(
			`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND GAME_ID IS NULL AND TRANSACTION_ID = 10 AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
			[accountId, gameEncodedDt]
		);
		if (initLedger10.length > 0) {
			await connection.execute(
				'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
				[editedBy, date_now, initLedger10[0].IDNo]
			);
		}
		// COMMISSION (settlement) - new records deleted by 4a (GAME_ID). Fallback for old records (GAME_ID NULL)
		if (isSettled) {
			const matchAmt = parseFloat(gamePayment) || parseFloat(gameRows[0].FNB || 0);
			if (matchAmt) {
				const [commRows] = await connection.execute(
					`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND GAME_ID IS NULL AND TRANSACTION_TYPE = 5 AND TRANSACTION_DESC = 'COMMISSION' AND ROUND(AMOUNT, 2) = ROUND(?, 2) AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
					[accountId, matchAmt]
				);
				if (commRows.length > 0) {
					await connection.execute(
						'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
						[editedBy, date_now, commRows[0].IDNo]
					);
				}
			}
		}
		// EXCLUDED: account_ledger for game_services (SERVICES)

		// 5. EXCLUDED: daily_settlement_games, daily_settlement

		// 6. Soft delete game_record
		await connection.execute(
			'UPDATE game_record SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE GAME_ID = ?',
			[editedBy, date_now, gameId]
		);

		// 7. EXCLUDED: game_services

		// 8. Soft delete game_list
		await connection.execute(
			'UPDATE game_list SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
			[editedBy, date_now, gameId]
		);

		await connection.commit();
		res.json({ success: true, message: 'Game and related records deleted successfully.' });
	} catch (err) {
		await connection.rollback();
		console.error('Error soft deleting game:', err);
		res.status(500).json({ error: 'Failed to delete game. ' + (err.message || '') });
	} finally {
		connection.release();
	}
});

// STATUS GAME LIST (Updated with mysql2/promise)
router.put('/game_list/change_status/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const date_now = new Date();

		const {
			txtStatus,
			txtGameId,
			txtAccountCode,
			txtCapital,
			txtFinalChips,
			txtTotalRolling,
			txtWinloss,
			txtReturnRollerNN,
			txtReturnRollerCC
		} = req.body;

		const formattedWinloss = parseFloat(txtWinloss) || 0;
		const adjustedWinloss = formattedWinloss > 0 ? -formattedWinloss : Math.abs(formattedWinloss);

		// Ensure all required parameters are defined
		if (!txtStatus) {
			return res.status(400).json({ error: 'Status is required' });
		}
		
		const editedBy = req.session.user_id || null; // Use null instead of undefined
		if (!editedBy) {
			return res.status(401).json({ error: 'User session not found' });
		}

		// ✅ Update game_list status
		await pool.execute(
			`UPDATE game_list SET ACTIVE = ?, GAME_ENDED = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`,
			[txtStatus, date_now, editedBy, date_now, id]
		);

		// ✅ If game is being closed to END GAME (status = 1), add to daily settlement
		if (txtStatus === "1") {
			// Get the game's creation date and time
			const [gameInfo] = await pool.execute(
				`SELECT ENCODED_DT FROM game_list WHERE IDNo = ?`,
				[id]
			);
			const gameEncodedDt = gameInfo.length > 0 ? gameInfo[0].ENCODED_DT : null;
			
			if (gameEncodedDt) {
				// Get latest settlement to compare DATE AND TIME
				const todayStr = new Date().toISOString().slice(0, 10);
				const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
				
				const [latestSettlement] = await pool.execute(
					`SELECT IDNo, SETTLEMENT_DATE, RUN_AT FROM daily_settlement WHERE ACTIVE = 1 AND SETTLEMENT_DATE BETWEEN ? AND ? ORDER BY SETTLEMENT_DATE DESC, RUN_AT DESC LIMIT 1`,
					[firstOfMonth, todayStr]
				);
				
				if (latestSettlement.length > 0) {
					const settlementRunAt = latestSettlement[0].RUN_AT;
					
					// Convert to Date objects for comparison
					const gameCreatedAt = gameEncodedDt instanceof Date ? gameEncodedDt : new Date(gameEncodedDt);
					const settlementRunTime = settlementRunAt instanceof Date ? settlementRunAt : new Date(settlementRunAt);
					
					// Compare DATE AND TIME directly
					// PENDING GAME: ENCODED_DT < RUN_AT (mas mababa sa RUN_AT) → add to previous settlement
					if (gameCreatedAt < settlementRunTime) {
						const settlementId = latestSettlement[0].IDNo;
						
						// Check if game is already in this settlement
						const [alreadyInSettlement] = await pool.execute(
							`SELECT COUNT(*) AS count FROM daily_settlement_games WHERE DAILY_SETTLEMENT_ID = ? AND GAME_ID = ?`,
							[settlementId, id]
						);
						
						const isAlreadyInSettlement = alreadyInSettlement.length > 0 && alreadyInSettlement[0].count > 0;
						
						if (!isAlreadyInSettlement) {
							// Add to previous settlement (pending game)
							await pool.execute(
								`INSERT INTO daily_settlement_games (DAILY_SETTLEMENT_ID, GAME_ID, ADDED_AT) VALUES (?, ?, NOW())`,
								[settlementId, id]
							);
							// Mark game as settled
							await pool.execute(
								`UPDATE game_list SET DAILY_SETTLEMENT = 2 WHERE IDNo = ?`,
								[id]
							);
						}
					} else {
						// BAGONG GAME: ENCODED_DT >= RUN_AT (mas mataas sa RUN_AT) → mark as unsettled (next settlement)
						await pool.execute(
							`UPDATE game_list SET DAILY_SETTLEMENT = 1 WHERE IDNo = ?`,
							[id]
						);
					}
				} else {
					// No settlement at all, mark as unsettled (will be included in next settlement run)
					await pool.execute(
						`UPDATE game_list SET DAILY_SETTLEMENT = 1 WHERE IDNo = ?`,
						[id]
					);
				}
			}
		}

		// ✅ If game is being closed (status = 1 or 3), insert roller chips return
		// Status 1 = END GAME (fully settled), Status 3 = PENDING (discrepancy, needs review)
		if (txtStatus === "1" || txtStatus === "3") {
			// Insert roller chips return if provided
			const returnNNAmount = parseFloat((txtReturnRollerNN || '0').replace(/,/g, '')) || 0;
			const returnCCAmount = parseFloat((txtReturnRollerCC || '0').replace(/,/g, '')) || 0;
			
			if (returnNNAmount > 0 || returnCCAmount > 0) {
				const rollerChipsReturnSQL = `
					INSERT INTO game_record (GAME_ID, TRADING_DATE, CAGE_TYPE, AMOUNT, NN_CHIPS, CC_CHIPS, ROLLER_NN_CHIPS, ROLLER_CC_CHIPS, ROLLER_TRANSACTION, ENCODED_BY, ENCODED_DT)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`;
				await pool.execute(rollerChipsReturnSQL, [
					id, 
					date_now, 
					5, // CAGE_TYPE 5 for ROLLER CHIPS
					0, // AMOUNT is 0 for roller chips
					0, // NN_CHIPS is 0 (roller chips use ROLLER_NN_CHIPS)
					0, // CC_CHIPS is 0 (roller chips use ROLLER_CC_CHIPS)
					returnNNAmount, // ROLLER_NN_CHIPS
					returnCCAmount, // ROLLER_CC_CHIPS
					2, // ROLLER_TRANSACTION: 2 = RETURN
					req.session.user_id, 
					date_now
				]);
			}
		}

		res.send('Game status updated successfully');
	} catch (error) {
		console.error('Error processing request:', error);
		res.status(500).send('Error processing request');
	}
});


// ADD SETTLEMENT
router.post('/add_settlement', async (req, res) => {
	const {
		game_id_settle,
		txtAccountIDSettle,
		txtTransType,
		txtPayment,
		txtFNB,
		txtSettlementBalance
	} = req.body;

	// Validate required fields
	if (!game_id_settle || !txtAccountIDSettle || !txtTransType || !txtPayment || !txtFNB) {
		return res.status(400).json({ success: false, message: 'Missing required fields' });
	}

	// Remove commas from txtPayment and txtFNB
	let paymentValue = txtPayment.replace(/,/g, '');
	let fnbValue = txtFNB.replace(/,/g, '');
	let date_now = new Date();

	// TRANSACTION DETAILS
	let FNBDESC = 'COMMISSION';

	try {
		// Insert settlement details into account_ledger (GAME_ID for direct link)
		const insertQuery = `INSERT INTO account_ledger (ACCOUNT_ID, GAME_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
		await pool.execute(insertQuery, [txtAccountIDSettle, game_id_settle, txtTransType, 5, FNBDESC, paymentValue, req.session.user_id, date_now]);

		// Update the settled status, FNB, PAYMENT in game_list
		const updateQuery = `UPDATE game_list SET SETTLED = 1, FNB = ?, PAYMENT = ? WHERE IDNo = ?`;
		await pool.execute(updateQuery, [fnbValue, paymentValue, game_id_settle]);

		// Fetch AGENT_CODE, NAME, and TELEGRAM_ID
		const agentQuery = `
            SELECT agent.IDNo AS agent_id, agent.AGENT_CODE, agent.NAME, agent.TELEGRAM_ID
            FROM agent
            JOIN account ON account.AGENT_ID = agent.IDNo
            WHERE account.ACTIVE = 1 AND account.IDNo = ?
        `;

		let time_now = new Date();
		time_now.setHours(time_now.getHours());
		let updated_time = time_now.toLocaleTimeString();
		let date_nowTG = new Date().toLocaleDateString();

		const [agentResults] = await pool.query(agentQuery, [txtAccountIDSettle]);

		if (agentResults.length > 0) {
			const { agent_id: agentId, AGENT_CODE: agentCode, NAME: agentName, TELEGRAM_ID: telegramId } = agentResults[0];

			// Fetch game records to calculate totals
			const gameRecordQuery = `SELECT AMOUNT, NN_CHIPS, CC_CHIPS, ROLLER_NN_CHIPS, ROLLER_CC_CHIPS, ROLLER_TRANSACTION, CAGE_TYPE FROM game_record WHERE ACTIVE != 0 AND GAME_ID = ? ORDER BY IDNo ASC`;
			const [gameRecords] = await pool.execute(gameRecordQuery, [game_id_settle]);

			// Initialize totals
			let total_nn_init = 0;
			let total_cc_init = 0;
			let total_nn = 0;
			let total_cc = 0;
			let total_cash_out_nn = 0;
			let total_cash_out_cc = 0;
			let total_rolling_nn = 0;
			let total_rolling_cc = 0;
			let total_rolling_amount = 0;
			let total_rolling_real = 0;
			let total_rolling_nn_real = 0;
			let total_rolling_cc_real = 0;
			let total_roller_return_cc = 0;

			// Calculate totals from game records
			for (const record of gameRecords) {
				const cageType = Number(record.CAGE_TYPE);

				if (cageType === 1 && (total_nn_init !== 0 || total_cc_init !== 0)) {
					total_nn += Number(record.NN_CHIPS) || 0;
					total_cc += Number(record.CC_CHIPS) || 0;
				}

				if (cageType === 1 && total_nn_init === 0 && total_cc_init === 0) {
					total_nn_init += Number(record.NN_CHIPS) || 0;
					total_cc_init += Number(record.CC_CHIPS) || 0;
				}

				if (cageType === 2) {
					total_cash_out_nn += Number(record.NN_CHIPS) || 0;
					total_cash_out_cc += Number(record.CC_CHIPS) || 0;
				}

				if (cageType === 3) {
					total_rolling_amount += Number(record.AMOUNT) || 0;
					total_rolling_nn += Number(record.NN_CHIPS) || 0;
					total_rolling_cc += Number(record.CC_CHIPS) || 0;
				}

				if (cageType === 4) {
					total_rolling_real += Number(record.AMOUNT) || 0;
					total_rolling_nn_real += Number(record.NN_CHIPS) || 0;
					total_rolling_cc_real += Number(record.CC_CHIPS) || 0;
				}

				if (cageType === 5) {
					const rollerTransaction = parseInt(record.ROLLER_TRANSACTION, 10) || 1;
					if (rollerTransaction === 2) {
						total_roller_return_cc += Number(record.ROLLER_CC_CHIPS) || 0;
					}
				}
			}

			// Calculate final values
			const total_initial = total_nn_init + total_cc_init;
			const total_buy_in_chips = total_nn + total_cc;
			const total_buy_in = total_initial + total_buy_in_chips;
			const total_cash_out = total_cash_out_nn + total_cash_out_cc;
			const total_amount = total_buy_in_chips + total_initial;
			const winlossRaw = total_amount - total_cash_out;
			// Adjust winloss: if negative (guest won), show as positive; if positive (house won), show as negative
			const winloss = winlossRaw < 0 ? Math.abs(winlossRaw) : -winlossRaw;
			// TOTAL ROLLING: Follow same logic as game_list_data (reloadData function)
			// Formula: total_rolling_nn + totalRollingCCWithReturns + total_rolling_amount + total_rolling_real + total_rolling_nn_real + total_rolling_cc_real - total_cash_out_nn
			// Note: CC chips from CAGE_TYPE == 3 (TOTAL ROLLING) should NOT be included
			// Note: CC chips from CAGE_TYPE == 4 (REAL ROLLING) SHOULD be included
			// Note: Buy-in amounts are NOT included here - they are separate from rolling transactions
			const totalRollingCCWithReturns = total_roller_return_cc;  // Only include roller return CC, exclude CC from CAGE_TYPE == 3
			const total_rolling = total_rolling_nn + totalRollingCCWithReturns + total_rolling_amount + total_rolling_real + total_rolling_nn_real + total_rolling_cc_real - total_cash_out_nn;

			// Prepare the Telegram message
			let text;
			let managementText; // Message for management (without account balance)
			if (txtTransType == 1) {
				const currentBalance = parseFloat(txtSettlementBalance.replace(/,/g, '')) + parseFloat(paymentValue);
				text = `Infinity Cage\n\n* 게임종료 / 정산 *\n\n계정: ${agentCode} - ${agentName}\n게임 #: ${game_id_settle}\n커미션: ${parseFloat(paymentValue).toLocaleString()} - 계좌입금\n잔고: ${parseFloat(currentBalance).toLocaleString()}\n\n바이인 합계: ${total_buy_in.toLocaleString()}\n캐시아웃 합계: ${total_cash_out.toLocaleString()}\n윈/로스: ${winloss.toLocaleString()}\n토탈롤링: ${total_rolling.toLocaleString()}\n\n날짜: ${date_nowTG}\n시간: ${updated_time}`;
				// Management/agent message: bilingual labels, no payment type
				managementText = `Infinity Cage\n\n* 게임종료 / 정산 End Game *\n\n계정 Account : ${agentCode} - ${agentName}\n게임 Game #: ${game_id_settle}\n커미션 Commission : ${parseFloat(paymentValue).toLocaleString()}\n\n바이인 합계 Total Buy-in : ${total_buy_in.toLocaleString()}\n캐시아웃 합계 Total Cashout: ${total_cash_out.toLocaleString()}\n윈/로스 Win/Loss : ${winloss.toLocaleString()}\n토탈롤링 Total Rolling: ${total_rolling.toLocaleString()}\n\n날짜 Date : ${date_nowTG}\n시간 Time : ${updated_time}`;
			} else {
				text = `Infinity Cage\n\n* 게임종료 / 정산 *\n\n계정: ${agentCode} - ${agentName}\n게임 #: ${game_id_settle}\n커미션: ${parseFloat(paymentValue).toLocaleString()} - 현금\n\n바이인 합계: ${total_buy_in.toLocaleString()}\n캐시아웃 합계: ${total_cash_out.toLocaleString()}\n윈/로스: ${winloss.toLocaleString()}\n토탈롤링: ${total_rolling.toLocaleString()}\n\n날짜: ${date_nowTG}\n시간: ${updated_time}`;
				// Management/agent message: bilingual labels, no payment type
				managementText = `Infinity Cage\n\n* 게임종료 / 정산 End Game *\n\n계정 Account : ${agentCode} - ${agentName}\n게임 Game #: ${game_id_settle}\n커미션 Commission : ${parseFloat(paymentValue).toLocaleString()}\n\n바이인 합계 Total Buy-in : ${total_buy_in.toLocaleString()}\n캐시아웃 합계 Total Cashout: ${total_cash_out.toLocaleString()}\n윈/로스 Win/Loss : ${winloss.toLocaleString()}\n토탈롤링 Total Rolling: ${total_rolling.toLocaleString()}\n\n날짜 Date : ${date_nowTG}\n시간 Time : ${updated_time}`;
			}

			if (telegramId) {
				try {
					await sendTelegramMessage(text, telegramId);
				} catch (telegramError) {
					console.error('Failed to send Telegram message to agent:', telegramError.message);
				}
			} else {
				console.error("No TELEGRAM_ID found for Account ID:", txtAccountIDSettle);
			}
			try {
				await sendToAgentNotifications(agentCode, managementText);
			} catch (telegramError) {
				console.error('Failed to send to agent notifications:', telegramError.message);
			}

			// Send to additional chats and management - always
			try {
				await sendTelegramToAdditionalChats(text);
			} catch (telegramError) {
				console.error('Failed to send Telegram message to additional chats:', telegramError.message);
			}
			try {
				await sendTelegramToManagement(managementText);
			} catch (telegramError) {
				console.error('Failed to send Telegram message to management:', telegramError.message);
			}

			const insertCashEntry = async (category, type, remark) => {
				if (!agentId) return;
				const cashTransactionQuery = `
					INSERT INTO cash_transaction (TRANSACTION_ID, AGENT_ID, AMOUNT, CATEGORY, TYPE, REMARKS, ENCODED_BY, ENCODED_DT)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				`;
				await pool.execute(cashTransactionQuery, [
					game_id_settle,
					agentId,
					paymentValue.toString(),
					category,
					type,
					remark,
					req.session.user_id,
					date_now
				]);
			};

			// Skip cash_transaction insert when payment amount is 0
			if (parseFloat(paymentValue) !== 0) {
				if (txtTransType == 5) {
					await insertCashEntry('Commission Cash-out', 2, `Game - ${game_id_settle}`);
				} else if (txtTransType == 1) {
					await insertCashEntry('Commission Deposit', 1, `Game - ${game_id_settle}`);
					await insertCashEntry('Commission', 2, `Game - ${game_id_settle}`);
				}
			}
		} else {
			console.error("No AGENT_CODE or NAME found for Account ID:", txtAccountIDSettle);
		}

		// Send JSON success response
		res.json({ success: true, message: 'Settlement saved and status updated' });

	} catch (err) {
		console.error('Error processing settlement:', err);
		res.status(500).json({ success: false, message: 'Error processing settlement' });
	}
});



// EDIT GAME LIST COMMISSION
router.put('/game_list/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const {
        txtExpense,
        txtActualAgent,
        txtRemarks,
        txtCashier,
        txtManager
    } = req.body;

    let date_now = new Date();

    const query = `UPDATE game_list SET EXPENSE = ?, ACTUAL_TO_AGENT = ?, REMARKS = ?, CASHIER = ?, MANAGER = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;

    try {
        await pool.execute(query, [txtExpense, txtActualAgent, txtRemarks, txtCashier, txtManager, req.session.user_id, date_now, id]);
        res.send('GAME LIST updated successfully');
    } catch (err) {
        console.error('Error updating GAME LIST:', err);
        res.status(500).send('Error updating GAME LIST');
    }
});





// ADD GAME RECORD BUYIN
router.post('/game_list/add/buyin', async (req, res) => {
	const {
		game_id,
		txtAccountCode,
		txtTransType,
		txtNN,
		txtCC,
		totalBalanceGuest2,
		txtTotalAmountBuyin
	} = req.body;

	let date_now = new Date();

	// Remove commas from NN and CC
	let txtNNamount = txtNN.split(',').join("") || 0;
	let txtCCamount = txtCC.split(',').join("") || 0;

	let AddBuyinDESC = 'ADDITIONAL BUY-IN';

	try {
		// First insert into game_record table (CAGE_TYPE = 1)
		const query1 = `INSERT INTO game_record (GAME_ID, TRADING_DATE, CAGE_TYPE, AMOUNT, NN_CHIPS, CC_CHIPS, TRANSACTION, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
		const [result1] = await pool.execute(query1, [game_id, date_now, 1, 0, txtNNamount, txtCCamount, txtTransType, req.session.user_id, date_now]);

		const gameRecordId = result1.insertId; // ✅ This is your IDNo of the inserted game_record

		// Second insert into game_record table (CAGE_TYPE = 3)
		const query2 = `INSERT INTO game_record (GAME_ID, TRADING_DATE, CAGE_TYPE, AMOUNT, NN_CHIPS, CC_CHIPS, TRANSACTION, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
		await pool.execute(query2, [game_id, date_now, 3, 0, txtNNamount, txtCCamount, txtTransType, req.session.user_id, date_now]);

		let queries = [];
		let totalAmount = parseFloat(txtNNamount) + parseFloat(txtCCamount);

		// Insert into account_ledger if transaction type is 2 or 3 (GAME_ID for direct link)
		if (txtTransType == 2) {
			const query3 = `INSERT INTO account_ledger (ACCOUNT_ID, GAME_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
			queries.push(pool.execute(query3, [txtAccountCode, game_id, 2, txtTransType, AddBuyinDESC, totalAmount, req.session.user_id, date_now]));
		}

		if (txtTransType == 3) {
			const query4 = `INSERT INTO account_ledger (ACCOUNT_ID, GAME_ID, TRANSACTION_ID, TRANSACTION_TYPE, AMOUNT, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?)`;
			queries.push(pool.execute(query4, [txtAccountCode, game_id, 10, txtTransType, totalAmount, req.session.user_id, date_now]));
		}

		// Wait for all queries to finish
		await Promise.all(queries);

		// Fetch AGENT_CODE and NAME
		const agentQuery = `
			SELECT agent.IDNo AS agent_id, agent.AGENT_CODE, agent.NAME
			FROM agent
			JOIN account ON account.AGENT_ID = agent.IDNo
			WHERE account.ACTIVE = 1 AND account.IDNo = ?
		`;
		const [agentResults] = await pool.execute(agentQuery, [txtAccountCode]);

		if (agentResults.length > 0) {
			const { agent_id: agentId, AGENT_CODE: agentCode, NAME: agentName } = agentResults[0];

			// Fetch TELEGRAM_ID
			const telegramIdQuery = `
				SELECT agent.TELEGRAM_ID 
				FROM agent
				JOIN account ON account.AGENT_ID = agent.IDNo
				WHERE account.ACTIVE = 1 AND account.IDNo = ?
			`;
			const [telegramIdResults] = await pool.execute(telegramIdQuery, [txtAccountCode]);

			let time_now = new Date();
			let updated_time = time_now.toLocaleTimeString();
			let date_nowTG = new Date().toLocaleDateString();

			// Calculate new TotalBalance after withdrawal
			const totalBuyin = parseFloat(txtTotalAmountBuyin.replace(/,/g, '')) + totalAmount;
			const newTotalBalance = totalBalanceGuest2 - totalAmount;

			// Prepare Telegram message text
			let text = '';
			let managementText = ''; // Message for management (without account balance)
			if (txtTransType == 2) {
				text = `Infinity Cage\n\n* 추가 바이인 *\n\n계정: ${agentCode} - ${agentName}\n게임 #: ${game_id}\n바이인: ${parseFloat(totalAmount).toLocaleString()} - 계좌출금\n바이인 합계: ${parseFloat(totalBuyin).toLocaleString()}\n잔고: ${parseFloat(newTotalBalance).toLocaleString()}\n\n날짜: ${date_nowTG}\n시간: ${updated_time}`;
				// Management/agent message: bilingual labels, no payment type
				managementText = `Infinity Cage\n\n* 추가 바이인 Add Buy-in *\n\n계정 Account : ${agentCode} - ${agentName}\n게임 Game #: ${game_id}\n바이인 Buy-in : ${parseFloat(totalAmount).toLocaleString()}\n바이인 합계 Total Buy-in : ${parseFloat(totalBuyin).toLocaleString()}\n\n날짜 Date : ${date_nowTG}\n시간 Time : ${updated_time}`;
			} else if (txtTransType == 1) {
				text = `Infinity Cage\n\n* 추가 바이인 *\n\n계정: ${agentCode} - ${agentName}\n게임 #: ${game_id}\n바이인: ${parseFloat(totalAmount).toLocaleString()} - 현금\n바이인 합계: ${parseFloat(totalBuyin).toLocaleString()}\n\n날짜: ${date_nowTG}\n시간: ${updated_time}`;
				// Management/agent message: bilingual labels, no payment type
				managementText = `Infinity Cage\n\n* 추가 바이인 Add Buy-in *\n\n계정 Account : ${agentCode} - ${agentName}\n게임 Game #: ${game_id}\n바이인 Buy-in : ${parseFloat(totalAmount).toLocaleString()}\n바이인 합계 Total Buy-in : ${parseFloat(totalBuyin).toLocaleString()}\n\n날짜 Date : ${date_nowTG}\n시간 Time : ${updated_time}`;
			} else if (txtTransType == 3) {
				text = `Infinity Cage\n\n* 추가 바이인 *\n\n계정: ${agentCode} - ${agentName}\n게임 #: ${game_id}\n바이인: ${parseFloat(totalAmount).toLocaleString()} - 크레딧\n바이인 합계: ${parseFloat(totalBuyin).toLocaleString()}\n\n날짜: ${date_nowTG}\n시간: ${updated_time}`;
				// Management/agent message: bilingual labels, no payment type
				managementText = `Infinity Cage\n\n* 추가 바이인 Add Buy-in *\n\n계정 Account : ${agentCode} - ${agentName}\n게임 Game #: ${game_id}\n바이인 Buy-in : ${parseFloat(totalAmount).toLocaleString()}\n바이인 합계 Total Buy-in : ${parseFloat(totalBuyin).toLocaleString()}\n\n날짜 Date : ${date_nowTG}\n시간 Time : ${updated_time}`;
			}

			// Send Telegram messages (when we have agent data)
		if (text !== '' && agentResults.length > 0) {
				const telegramId = telegramIdResults.length > 0 ? telegramIdResults[0].TELEGRAM_ID : null;
				if (telegramId) {
					try {
						await sendTelegramMessage(text, telegramId);
					} catch (telegramError) {
						console.error('Failed to send Telegram message to agent:', telegramError.message);
					}
				} else {
					console.error("No TELEGRAM_ID found for Account Code:", txtAccountCode);
				}
				try {
					await sendToAgentNotifications(agentCode, managementText);
				} catch (telegramError) {
					console.error('Failed to send to agent notifications:', telegramError.message);
				}
				try {
					await sendTelegramToAdditionalChats(text);
				} catch (telegramError) {
					console.error('Failed to send Telegram message to additional chats:', telegramError.message);
				}
				try {
					await sendTelegramToManagement(managementText);
				} catch (telegramError) {
					console.error('Failed to send Telegram message to management:', telegramError.message);
				}
			}
		}

		if (txtTransType == 1 && agentResults.length > 0 && agentResults[0].agent_id) {
			const cashTransactionQuery = `
				INSERT INTO cash_transaction (TRANSACTION_ID, AGENT_ID, AMOUNT, CATEGORY, TYPE, REMARKS, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`;

			await pool.execute(cashTransactionQuery, [
				game_id,
				agentResults[0].agent_id,
				totalAmount.toString(),
				'Additional buy-in',
				1,
				`Game - ${game_id}`,
				req.session.user_id,
				date_now
			]);
		}

		res.redirect('/game_list');
	} catch (error) {
		res.status(500).send(error);
	}
});


// ADD GAME RECORD CASH OUT
router.post('/game_list/add/cashout', async (req, res) => {
	const {
		game_id,
		txtAccountCode,
		txtTransType,
		txtNN,
		txtCC,
		txttotal_balance_cashout
	} = req.body;

	let date_now = new Date();

	// Ensure at least one of txtNN or txtCC is provided and not empty
	if ((!txtNN || txtNN.trim() === '') && (!txtCC || txtCC.trim() === '')) {
		return res.status(400).send('At least one of NN Chips or CC Chips amounts is required.');
	}

	// Ensure txtTransType is provided and not empty
	if (!txtTransType || txtTransType.trim() === '') {
		return res.status(400).send('Transaction Type is required.');
	}

	// Remove commas and convert txtNN and txtCC to numerical values
	let txtNNamount = txtNN && txtNN.trim() !== '' ? txtNN.split(',').join("") : '0';
	let txtCCamount = txtCC && txtCC.trim() !== '' ? txtCC.split(',').join("") : '0';

	// Ensure that txtNNamount and txtCCamount are valid numbers
	if (isNaN(txtNNamount) || txtNNamount < 0) {
		return res.status(400).send('Invalid NN Chips amount.');
	}
	if (isNaN(txtCCamount) || txtCCamount < 0) {
		return res.status(400).send('Invalid CC Chips amount.');
	}

	// Convert to float values
	txtNNamount = parseFloat(txtNNamount);
	txtCCamount = parseFloat(txtCCamount);

	// Calculate chips returned and current balance after cash out
	let chipsReturn = txtNNamount + txtCCamount;
	let sanitizedBalanceCashout = (txttotal_balance_cashout || '0').replace(/,/g, '');
	let currentBalanceCashout = isNaN(sanitizedBalanceCashout) ? 0 : parseFloat(sanitizedBalanceCashout) + chipsReturn;

	let CashOutDESC = 'Chips Returned'; // TRANSACTION DETAILS

	try {
		// First insert into game_record table (CAGE_TYPE = 2)
		const query1 = `INSERT INTO game_record(GAME_ID, TRADING_DATE, CAGE_TYPE, AMOUNT, NN_CHIPS, CC_CHIPS, TRANSACTION, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
		const [result1] = await pool.execute(query1, [game_id, date_now, 2, 0, txtNNamount, txtCCamount, txtTransType, req.session.user_id, date_now]);

		const gameRecordId = result1.insertId;

		// Second insert into account_ledger table (GAME_ID for direct link)
		const query2 = `INSERT INTO account_ledger(ACCOUNT_ID, GAME_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
		await pool.execute(query2, [txtAccountCode, game_id, 1, txtTransType, CashOutDESC, txtNNamount + txtCCamount, req.session.user_id, date_now]);

		// Fetch AGENT_CODE and NAME for Telegram
		const agentQuery = `
			SELECT agent.IDNo AS agent_id, agent.AGENT_CODE, agent.NAME
			FROM agent
			JOIN account ON account.AGENT_ID = agent.IDNo
			WHERE account.ACTIVE = 1 AND account.IDNo = ?
		`;
		const [agentResults] = await pool.execute(agentQuery, [txtAccountCode]);

		if (agentResults.length > 0) {
			const { agent_id: agentId, AGENT_CODE: agentCode, NAME: agentName } = agentResults[0];

			// Fetch TELEGRAM_ID for the agent
			const telegramIdQuery = `
				SELECT agent.TELEGRAM_ID 
				FROM agent
				JOIN account ON account.AGENT_ID = agent.IDNo
				WHERE account.ACTIVE = 1 AND account.IDNo = ?
			`;
			const [telegramIdResults] = await pool.execute(telegramIdQuery, [txtAccountCode]);

			let time_now = new Date();
			let updated_time = time_now.toLocaleTimeString();
			let date_nowTG = new Date().toLocaleDateString();

			// Prepare Telegram message
			let text = '';
			let managementText = ''; // Message for management (without account balance)
			if (txtTransType == 2) {
				text = `Infinity Cage\n\n* 캐시아웃 *\n\n계정: ${agentCode} - ${agentName}\n게임 #: ${game_id}\n캐시아웃: ${chipsReturn.toLocaleString()} - 계좌입금\n잔고: ${currentBalanceCashout.toLocaleString()}\n\n날짜: ${date_nowTG}\n시간: ${updated_time}`;
				// Management/agent message: bilingual labels, no payment type
				managementText = `Infinity Cage\n\n* 캐시아웃 Cash-out *\n\n계정 Account : ${agentCode} - ${agentName}\n게임 Game #: ${game_id}\n캐시아웃 Cash-out : ${chipsReturn.toLocaleString()}\n\n날짜 Date : ${date_nowTG}\n시간 Time : ${updated_time}`;
			} else if (txtTransType == 1) {
				text = `Infinity Cage\n\n* 캐시아웃 *\n\n계정: ${agentCode} - ${agentName}\n게임 #: ${game_id}\n캐시아웃: ${chipsReturn.toLocaleString()} - 현금\n\n날짜: ${date_nowTG}\n시간: ${updated_time}`;
				// Management/agent message: bilingual labels, no payment type
				managementText = `Infinity Cage\n\n* 캐시아웃 Cash-out *\n\n계정 Account : ${agentCode} - ${agentName}\n게임 Game #: ${game_id}\n캐시아웃 Cash-out : ${chipsReturn.toLocaleString()}\n\n날짜 Date : ${date_nowTG}\n시간 Time : ${updated_time}`;
			} else if (txtTransType == 4) {
				text = `Infinity Cage\n\n* 캐시아웃 *\n\n계정: ${agentCode} - ${agentName}\n게임 #: ${game_id}\n캐시아웃: ${chipsReturn.toLocaleString()} - 크레딧\n\n날짜: ${date_nowTG}\n시간: ${updated_time}`;
				// Management/agent message: bilingual labels, no payment type
				managementText = `Infinity Cage\n\n* 캐시아웃 Cash-out *\n\n계정 Account : ${agentCode} - ${agentName}\n게임 Game #: ${game_id}\n캐시아웃 Cash-out : ${chipsReturn.toLocaleString()}\n\n날짜 Date : ${date_nowTG}\n시간 Time : ${updated_time}`;
			}

			// Send Telegram messages (when we have agent data)
			if (text !== '' && agentResults.length > 0) {
				const telegramId = telegramIdResults.length > 0 ? telegramIdResults[0].TELEGRAM_ID : null;
				if (telegramId) {
					try {
						await sendTelegramMessage(text, telegramId);
					} catch (telegramError) {
						console.error('Failed to send Telegram message to agent:', telegramError.message);
					}
				} else {
					console.error("No TELEGRAM_ID found for Account Code:", txtAccountCode);
				}
				try {
					await sendToAgentNotifications(agentCode, managementText);
				} catch (telegramError) {
					console.error('Failed to send to agent notifications:', telegramError.message);
				}
				try {
					await sendTelegramToAdditionalChats(text);
				} catch (telegramError) {
					console.error('Failed to send Telegram message to additional chats:', telegramError.message);
				}
				try {
					await sendTelegramToManagement(managementText);
				} catch (telegramError) {
					console.error('Failed to send Telegram message to management:', telegramError.message);
				}
			}
		}

		if (txtTransType == 1 && agentResults.length > 0 && agentResults[0].agent_id) {
			const cashTransactionQuery = `
				INSERT INTO cash_transaction (TRANSACTION_ID, AGENT_ID, AMOUNT, CATEGORY, TYPE, REMARKS, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`;

			await pool.execute(cashTransactionQuery, [
				gameRecordId,
				agentResults[0].agent_id,
				chipsReturn.toString(),
				'Game Cash-out',
				2,
				`Game - ${game_id}`,
				req.session.user_id,
				date_now
			]);
		}

		res.redirect('/game_list');
	} catch (err) {
		console.error('Error in /game_list/add/cashout:', err);
		res.status(500).send('Internal Server Error');
	}
});


// ADD GAME RECORD ROLLING
router.post('/game_list/add/rolling', async (req, res) => {
	const { game_id, txtNN, txtCC } = req.body;
	let date_now = new Date();

	// Remove commas from NN and CC (default to 0 if not provided)
	let txtNNamount = (txtNN || '0').split(',').join("");
	let txtCCamount = (txtCC || '0').split(',').join("");

	const query = `INSERT INTO game_record(GAME_ID, TRADING_DATE, CAGE_TYPE, NN_CHIPS, CC_CHIPS, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?)`;
	try {
		await pool.execute(query, [game_id, date_now, 4, txtNNamount, txtCCamount, req.session.user_id, date_now]);
		res.redirect('/game_list');
	} catch (err) {
		console.error('Error inserting details', err);
		res.status(500).send('Error inserting details');
	}
});

router.get('/game_list/:game_id/rolling/last', async (req, res) => {
	const gameId = parseInt(req.params.game_id, 10);

	if (Number.isNaN(gameId)) {
		return res.status(400).json({ error: 'Invalid game id' });
	}

	try {
		const query = `
			SELECT IDNo, NN_CHIPS, CC_CHIPS
			FROM game_record
			WHERE GAME_ID = ? AND CAGE_TYPE = 4
			ORDER BY IDNo DESC
			LIMIT 1
		`;
		const [rows] = await pool.execute(query, [gameId]);

		if (rows.length === 0) {
			return res.json({ data: null });
		}

		return res.json({ data: rows[0] });
	} catch (error) {
		console.error('Error fetching last rolling entry:', error);
		return res.status(500).json({ error: 'Unable to fetch last rolling entry' });
	}
});

router.post('/game_list/rolling/:id/update', async (req, res) => {
	const recordId = parseInt(req.params.id, 10);
	const { txtNN, txtCC } = req.body;

	if (Number.isNaN(recordId)) {
		return res.status(400).json({ error: 'Invalid rolling record id' });
	}

	const nnAmount = parseFloat((txtNN || '0').toString().replace(/,/g, '')) || 0;
	const ccAmount = parseFloat((txtCC || '0').toString().replace(/,/g, '')) || 0;

	try {
		const query = `
			UPDATE game_record
			SET NN_CHIPS = ?, CC_CHIPS = ?
			WHERE IDNo = ? AND CAGE_TYPE = 4
		`;

		const [result] = await pool.execute(query, [nnAmount, ccAmount, recordId]);

		if (result.affectedRows === 0) {
			return res.status(404).json({ error: 'Rolling record not found' });
		}

		return res.json({ success: true });
	} catch (error) {
		console.error('Error updating rolling record:', error);
		return res.status(500).json({ error: 'Unable to update rolling entry' });
	}
});

// ADD GAME RECORD ROLLER CHIPS
router.post('/game_list/add/roller_chips', async (req, res) => {
	const { game_id, txtRollerNN, txtRollerCC, txtTransType } = req.body;
	let date_now = new Date();

	// Remove commas from NN and CC (default to 0 if not provided)
	let txtNNamount = (txtRollerNN || '0').split(',').join("");
	let txtCCamount = (txtRollerCC || '0').split(',').join("");

	// Validate that at least one value is provided
	if (parseFloat(txtNNamount) === 0 && parseFloat(txtCCamount) === 0) {
		return res.status(400).json({ error: 'Please enter at least one value: NN Chips or CC Chips' });
	}

	// Validate transaction type
	if (!txtTransType || (txtTransType !== '1' && txtTransType !== '2')) {
		return res.status(400).json({ error: 'Please select a valid Transaction Type (ADD or RETURN)' });
	}

	const query = `INSERT INTO game_record(GAME_ID, TRADING_DATE, CAGE_TYPE, AMOUNT, NN_CHIPS, CC_CHIPS, ROLLER_NN_CHIPS, ROLLER_CC_CHIPS, ROLLER_TRANSACTION, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
	try {
		await pool.execute(query, [
			game_id, 
			date_now, 
			5, // CAGE_TYPE 5 for ROLLER CHIPS
			0, // AMOUNT is 0 for roller chips
			0, // NN_CHIPS is 0 (roller chips use ROLLER_NN_CHIPS)
			0, // CC_CHIPS is 0 (roller chips use ROLLER_CC_CHIPS)
			txtNNamount, // ROLLER_NN_CHIPS
			txtCCamount, // ROLLER_CC_CHIPS
			txtTransType, // ROLLER_TRANSACTION: 1 = ADD, 2 = RETURN
			req.session.user_id, 
			date_now
		]);
		res.redirect('/game_list');
	} catch (err) {
		console.error('Error inserting roller chips details', err);
		res.status(500).json({ error: 'Error inserting roller chips details' });
	}
});


// ADD GAME RECORD
router.post('/add_game_record', checkSession, async (req, res) => {
    const {
        game_id,
        txtTradingDate,
        txtCategory,
        txtAmount,
        txtRemarks
    } = req.body;

    let date_now = new Date();

    const query = `INSERT INTO game_record(GAME_ID, TRADING_DATE, CAGE_TYPE, AMOUNT, REMARKS, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    try {
        await pool.execute(query, [game_id, date_now, txtCategory, txtAmount, txtRemarks, req.session.user_id, date_now]);
        res.redirect('/game_record/' + game_id);
    } catch (err) {
        console.error('Error inserting details', err);
        res.status(500).send('Error inserting details');
    }
});

// ======================= GAME RECORD ==================

router.get("/game_record/:id", checkSession, async (req, res) => {
	try {
	  const pageId = parseInt(req.params.id);
	  const query = `
		SELECT *
		FROM game_list  
		JOIN account ON game_list.ACCOUNT_ID = account.IDNo
		JOIN agent ON agent.IDNo = account.AGENT_ID
		JOIN agency ON agency.IDNo = agent.AGENCY
		WHERE game_list.ACTIVE != 0 AND game_list.IDNo = ?`;
		
	  const [results] = await pool.execute(query, [pageId]);
	  
	  if (!results || results.length === 0) {
		return res.status(404).send("No record found");
	  }
	  
	  res.render('gamebook/game_record', {
		username: req.session.username,
		firstname: req.session.firstname,
		lastname: req.session.lastname,
		user_id: req.session.user_id,
		page_id: pageId,
		reference: results[0].GAME_NO,
		currentPage: 'game_record'
	  });
	  
	} catch (error) {
	  console.error('Error executing MySQL query: ' + error.stack);
	  res.status(500).send("Error during login");
	}
  });

// GET GAME RECORD
router.get('/game_record_data/:id', checkSession, async (req, res) => {
	const id = parseInt(req.params.id);
	const query = `SELECT *, game_list.IDNo AS game_list_id, game_record.IDNo AS game_record_id, game_record.ENCODED_DT AS record_date, game_list.ACTIVE AS game_status, account.IDNo AS account_no, agent.AGENT_CODE AS agent_code, agent.NAME AS agent_name, game_record.ROLLER_NN_CHIPS, game_record.ROLLER_CC_CHIPS, game_record.ROLLER_TRANSACTION
					FROM game_list 
					JOIN account ON game_list.ACCOUNT_ID = account.IDNo 
					JOIN agent ON agent.IDNo = account.AGENT_ID 
					JOIN agency ON agency.IDNo = agent.AGENCY 
					JOIN game_record ON game_record.GAME_ID = game_list.IDNo 
					WHERE game_record.ACTIVE != 0 AND game_list.ACTIVE != 0 AND  game_record.GAME_ID = ?
					ORDER BY game_list.IDNo ASC`;
	try {
		const [result] = await pool.execute(query, [id]);
		res.json(result);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});

// DELETE GAME RECORD
router.put('/game_record/remove/:id', checkSession, async (req, res) => {
	const id = parseInt(req.params.id);
	let date_now = new Date();

		// First update the record based on IDNo
		const query = `UPDATE game_record SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;
	try {
		await pool.execute(query, [0, req.session.user_id, date_now, id]);

		// Now, fetch the details of the record for further query
		const recordQuery = `SELECT GAME_ID, CAGE_TYPE, NN_CHIPS, CC_CHIPS, ROLLER_NN_CHIPS, ROLLER_CC_CHIPS, ROLLER_TRANSACTION, TRANSACTION, ENCODED_DT FROM game_record WHERE IDNo = ?`;
		const [recordResult] = await pool.execute(recordQuery, [id]);

		// Ensure the result exists
		if (recordResult.length === 0) {
			return res.status(404).send('Record not found for additional deletion');
		}

		const record = recordResult[0];
		const nnChips = record.NN_CHIPS;
		const encodedDt = record.ENCODED_DT;
		const cageType = record.CAGE_TYPE;
		const gameId = record.GAME_ID;
		const transaction = record.TRANSACTION;
		const ccChips = record.CC_CHIPS || 0;

		// If CAGE_TYPE = 2 (Cash Out), delete corresponding account_ledger and cash_transaction entries
		if (cageType === 2) {
			// Get ACCOUNT_ID from game_list
			const gameListQuery = `SELECT ACCOUNT_ID FROM game_list WHERE IDNo = ? LIMIT 1`;
			const [gameListResult] = await pool.execute(gameListQuery, [gameId]);
			
			if (gameListResult.length > 0) {
				const accountId = gameListResult[0].ACCOUNT_ID;
				const totalAmount = parseFloat(nnChips) + parseFloat(ccChips);
				
				// Soft delete account_ledger (new: GAME_ID = gameId, old: GAME_ID IS NULL)
				const [ledgerRows] = await pool.execute(
					`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND (GAME_ID = ? OR GAME_ID IS NULL) AND TRANSACTION_ID = 1 AND TRANSACTION_TYPE = ? AND TRANSACTION_DESC = 'Chips Returned' AND AMOUNT = ? AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
					[accountId, gameId, transaction, totalAmount, encodedDt]
				);
				if (ledgerRows.length > 0) {
					await pool.execute(
						'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
						[req.session.user_id, date_now, ledgerRows[0].IDNo]
					);
				}
			}

			// Soft delete from cash_transaction table
			// TRANSACTION_ID in cash_transaction refers to the game_record IDNo
			await pool.execute(
				'UPDATE cash_transaction SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE TRANSACTION_ID = ? AND ACTIVE = 1',
				[req.session.user_id, new Date(), id]
			);
			return res.send('Cash out record deleted successfully');
		}

		// If CAGE_TYPE = 1 or 3 (Buy-in), delete corresponding account_ledger and cash_transaction entries
		if (cageType === 1 || cageType === 3) {
			// Get ACCOUNT_ID from game_list
			const gameListQuery = `SELECT ACCOUNT_ID FROM game_list WHERE IDNo = ? LIMIT 1`;
			const [gameListResult] = await pool.execute(gameListQuery, [gameId]);
			
			if (gameListResult.length > 0) {
				const accountId = gameListResult[0].ACCOUNT_ID;
				const totalAmount = parseFloat(nnChips) + parseFloat(ccChips);
				
				// If TRANSACTION = 1 (Cash), delete from cash_transaction
				// Check for both "Game buy-in" (initial) and "Additional buy-in"
				// TRANSACTION_ID in cash_transaction = game_id (not game_record IDNo for buy-in)
				if (transaction == 1) {
					const softDeleteBy = req.session.user_id;
					const softDeleteDt = new Date();
					// Try to soft delete "Game buy-in" first (initial buy-in)
					const updateInitial = await pool.execute(
						`UPDATE cash_transaction SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ?
						WHERE TRANSACTION_ID = ? AND ACTIVE = 1
						AND CATEGORY = 'Game buy-in' AND TYPE = 1 AND AMOUNT = ?`,
						[softDeleteBy, softDeleteDt, gameId, totalAmount]
					);
					// If no initial buy-in found, try "Additional buy-in"
					if (updateInitial[0].affectedRows === 0) {
						await pool.execute(
							`UPDATE cash_transaction SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ?
							WHERE TRANSACTION_ID = ? AND ACTIVE = 1
							AND CATEGORY = 'Additional buy-in' AND TYPE = 1 AND AMOUNT = ?`,
							[softDeleteBy, softDeleteDt, gameId, totalAmount]
						);
					}
				}
				
				// If TRANSACTION = 2 (Deposit), soft delete account_ledger (new: GAME_ID, old: GAME_ID NULL)
				if (transaction == 2) {
					const softDeleteBy = req.session.user_id;
					const softDeleteDt = date_now;
					const [initRows] = await pool.execute(
						`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND (GAME_ID = ? OR GAME_ID IS NULL) AND TRANSACTION_ID = 2 AND TRANSACTION_TYPE = 2 AND TRANSACTION_DESC = 'INITIAL BUY-IN' AND AMOUNT = ? AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
						[accountId, gameId, totalAmount, encodedDt]
					);
					if (initRows.length > 0) {
						await pool.execute(
							'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
							[softDeleteBy, softDeleteDt, initRows[0].IDNo]
						);
					} else {
						const [addRows] = await pool.execute(
							`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND (GAME_ID = ? OR GAME_ID IS NULL) AND TRANSACTION_ID = 2 AND TRANSACTION_TYPE = 2 AND TRANSACTION_DESC = 'ADDITIONAL BUY-IN' AND AMOUNT = ? AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
							[accountId, gameId, totalAmount, encodedDt]
						);
						if (addRows.length > 0) {
							await pool.execute(
								'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
								[softDeleteBy, softDeleteDt, addRows[0].IDNo]
							);
						}
					}
				}
				
				// If TRANSACTION = 3 (IOU), soft delete account_ledger (new: GAME_ID, old: GAME_ID NULL)
				if (transaction == 3) {
					const softDeleteBy = req.session.user_id;
					const softDeleteDt = date_now;
					const [iouRows] = await pool.execute(
						`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND (GAME_ID = ? OR GAME_ID IS NULL) AND TRANSACTION_ID = 10 AND TRANSACTION_TYPE = 3 AND (TRANSACTION_DESC IS NULL OR TRANSACTION_DESC = '') AND AMOUNT = ? AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
						[accountId, gameId, totalAmount, encodedDt]
					);
					if (iouRows.length > 0) {
						await pool.execute(
							'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
							[softDeleteBy, softDeleteDt, iouRows[0].IDNo]
						);
					} else {
						const [iouRows2] = await pool.execute(
							`SELECT IDNo FROM account_ledger WHERE ACCOUNT_ID = ? AND (GAME_ID = ? OR GAME_ID IS NULL) AND TRANSACTION_ID = 10 AND TRANSACTION_TYPE = 3 AND AMOUNT = ? AND ENCODED_DT = ? AND ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`,
							[accountId, gameId, totalAmount, encodedDt]
						);
						if (iouRows2.length > 0) {
							await pool.execute(
								'UPDATE account_ledger SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?',
								[softDeleteBy, softDeleteDt, iouRows2[0].IDNo]
							);
						}
					}
				}
			}
		}

		// If CAGE_TYPE = 5 (Roller Chips), delete matching roller chips record only
		// Roller chips are separate records, so we don't touch buy-in records (CAGE_TYPE 1 and 3)
		if (cageType === 5) {
			const rollerNN = record.ROLLER_NN_CHIPS || 0;
			const rollerCC = record.ROLLER_CC_CHIPS || 0;
			const rollerTransaction = record.ROLLER_TRANSACTION;
			
			// Delete matching roller chips record (same GAME_ID, ROLLER_NN_CHIPS, ROLLER_CC_CHIPS, ROLLER_TRANSACTION, ENCODED_DT)
			// This handles both ADD (ROLLER_TRANSACTION = 1) and RETURN (ROLLER_TRANSACTION = 2)
			const rollerDeleteQuery = `
				UPDATE game_record 
				SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? 
				WHERE GAME_ID = ? 
				AND CAGE_TYPE = 5 
				AND ROLLER_NN_CHIPS = ? 
				AND ROLLER_CC_CHIPS = ? 
				AND ROLLER_TRANSACTION = ? 
				AND ENCODED_DT = ?
			`;
			await pool.execute(rollerDeleteQuery, [0, req.session.user_id, date_now, gameId, rollerNN, rollerCC, rollerTransaction, encodedDt]);
			res.send('Roller chips record deleted successfully');
		} else {
			// For CAGE_TYPE 1 or 3 (Buy-in), delete matching buy-in pair
			// Update records with the same GAME_ID, NN_CHIPS, CC_CHIPS and ENCODED_DT for CAGE_TYPE 1 and 3
			// This ensures we only delete the matching pair (CAGE_TYPE 1 and 3) for the same buy-in
			const deleteQuery = `
				UPDATE game_record 
				SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? 
				WHERE GAME_ID = ? AND NN_CHIPS = ? AND CC_CHIPS = ? AND ENCODED_DT = ? AND CAGE_TYPE IN (1, 3)
			`;

			const [deleteResult] = await pool.execute(deleteQuery, [0, req.session.user_id, date_now, gameId, nnChips, ccChips, encodedDt]);

			// Also delete roller chips (CAGE_TYPE 5) if they were added together with the buy-in
			// Roller chips from new game have same GAME_ID and ENCODED_DT, and ROLLER_TRANSACTION = 1 (ADD)
			const rollerDeleteQuery = `
				UPDATE game_record 
				SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? 
				WHERE GAME_ID = ? 
				AND CAGE_TYPE = 5 
				AND ROLLER_TRANSACTION = 1 
				AND ENCODED_DT = ?
			`;
			await pool.execute(rollerDeleteQuery, [0, req.session.user_id, date_now, gameId, encodedDt]);

			// Check if any rows were updated
			if (deleteResult.affectedRows > 0) {
				res.send('GAME LIST updated successfully for IDNo and matching CAGE_TYPE 1 and 3, including roller chips if added together');
			} else {
				res.send('No matching records found for deletion with CAGE_TYPE 1 and 3');
			}
		}
	} catch (err) {
		console.error('Error updating GAME LIST:', err);
		res.status(500).send('Error updating GAME LIST');
	}
});
// Export the router
module.exports = router; 