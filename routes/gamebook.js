const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const { checkSession, sessions } = require('./auth');
const { sendTelegramMessage } = require('../utils/telegram');
const dashboardQueries = require('../utils/dashboardQueries');

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
		sqlCCReturn
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

		// 3. Insert into account_ledger
		if (transType === 2) {
			await pool.execute(`
				INSERT INTO account_ledger (ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[accountId, 2, transType, 'INITIAL BUY-IN', totalAmount, encodedBy, date_now]
			);
		} else if (transType === 3) {
			await pool.execute(`
				INSERT INTO account_ledger (ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, AMOUNT, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?)`,
				[accountId, 10, transType, totalAmount, encodedBy, date_now]
			);
		}

		// 4. Get agent info
		const [agentResults] = await pool.execute(`
			SELECT agent.AGENT_CODE, agent.NAME
			FROM agent
			JOIN account ON account.AGENT_ID = agent.IDNo
			WHERE account.ACTIVE = 1 AND account.IDNo = ?`,
			[accountId]
		);

		if (agentResults.length === 0) {
			console.error("No AGENT_CODE or NAME found for Account Code:", accountId);
			return res.redirect('/game_list');
		}

		const { AGENT_CODE: agentCode, NAME: agentName } = agentResults[0];

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

		if (transType === 2) {
			const newTotalBalance = totalBalanceGuest - totalAmount;
			text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nGame Start \nGame #: ${result.insertId} - ${txtGameType} \nBuy-in: -${parseFloat(totalAmount).toLocaleString()}\nAccount Balance: ${parseFloat(newTotalBalance).toLocaleString()}`;
		} else if (transType === 1) {
			text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nGame Start - Cash\nGame #: ${gameId} - ${gameType}\nBuy-in: ${totalAmount.toLocaleString()}`;
		} else if (transType === 3) {
			text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nGame Start - IOU\nGame #: ${gameId} - ${gameType}\nBuy-in: ${totalAmount.toLocaleString()}`;
		}

		if (text && telegramIdResults.length > 0) {
			const telegramId = telegramIdResults[0].TELEGRAM_ID;

			const [chatIdResults] = await pool.execute(`SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1`);
			const additionalChatId = chatIdResults.length > 0 ? chatIdResults[0].CHAT_ID : null;

			await sendTelegramMessage(text, telegramId);
			if (additionalChatId) {
				await sendTelegramMessage(text, additionalChatId);
			}
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
		const { game_id, service_type, amount, remarks } = req.body;
		const gameId = parseInt(game_id, 10);
		const amt = parseFloat((amount || '0').toString().replace(/,/g, '')) || 0;
		const svc = (service_type || '').toLowerCase();
		const validTypes = ['fnb', 'hotel'];

		if (Number.isNaN(gameId) || !validTypes.includes(svc)) {
			return res.status(400).json({ error: 'Invalid input' });
		}

		const encodedBy = req.session?.user_id || null;
		const now = new Date();

		await pool.execute(
			`INSERT INTO game_services (GAME_ID, SERVICE_TYPE, AMOUNT, REMARKS, ACTIVE, ENCODED_BY, ENCODED_DT)
			 VALUES (?, ?, ?, ?, 1, ?, ?)`,
			[gameId, svc, amt, remarks || '', encodedBy, now]
		);

		// Return the refreshed list
		const [rows] = await pool.execute(
			`SELECT 
				gs.IDNo,
				gs.GAME_ID,
				gs.SERVICE_TYPE,
				gs.AMOUNT,
				gs.REMARKS,
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
		const { game_id, service_type, amount, remarks } = req.body;
		const gameId = parseInt(game_id, 10);
		const amt = parseFloat((amount || '0').toString().replace(/,/g, '')) || 0;
		const svc = (service_type || '').toLowerCase();
		const validTypes = ['fnb', 'hotel'];

		if (Number.isNaN(serviceId) || Number.isNaN(gameId) || !validTypes.includes(svc)) {
			return res.status(400).json({ error: 'Invalid input' });
		}

		const updatedBy = req.session?.user_id || null;
		const now = new Date();

		await pool.execute(
			`UPDATE game_services
			 SET SERVICE_TYPE = ?, AMOUNT = ?, REMARKS = ?, UPDATED_BY = ?, UPDATED_DT = ?
			 WHERE IDNo = ?`,
			[svc, amt, remarks || '', updatedBy, now, serviceId]
		);

		const [rows] = await pool.execute(
			`SELECT 
				gs.IDNo,
				gs.GAME_ID,
				gs.SERVICE_TYPE,
				gs.AMOUNT,
				gs.REMARKS,
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

		await pool.execute(
			`UPDATE game_services
			 SET ACTIVE = 0, UPDATED_BY = ?, UPDATED_DT = ?
			 WHERE IDNo = ?`,
			[updatedBy, now, serviceId]
		);

		const [rows] = await pool.execute(
			`SELECT 
				gs.IDNo,
				gs.GAME_ID,
				gs.SERVICE_TYPE,
				gs.AMOUNT,
				gs.REMARKS,
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
		console.error('Error deleting game service:', err);
		return res.status(500).json({ error: 'Error deleting game service' });
	}
});

// GET GAME LIST
router.get('/game_list_data', async (req, res) => {
    let { start, end, id } = req.query;

    const gameId = id ? parseInt(id, 10) : null;

    // If a specific game ID is requested, bypass date filtering to ensure it shows up.
    if (gameId) {
        const queryById = `
            SELECT 
                *, 
                game_list.IDNo AS game_list_id, 
                game_list.ACTIVE AS game_status, 
                account.IDNo AS account_no, 
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
            return res.json(rows);
        } catch (error) {
            console.error('Error fetching data by ID:', error);
            return res.status(500).json({ error: 'Error fetching data' });
        }
    }

    // Use default dates if start or end is not provided
    if (!start || !end) {
        const currentDate = new Date();
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

        start = firstDayOfMonth.toISOString().slice(0, 10); // YYYY-MM-DD
        end = currentDate.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    // Validate date format
    const isValidDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);
    if (!isValidDate(start) || !isValidDate(end)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    // SQL query with date filtering
    const query = `
        SELECT 
            *, 
            game_list.IDNo AS game_list_id, 
            game_list.ACTIVE AS game_status, 
            account.IDNo AS account_no, 
            agent.AGENT_CODE AS agent_code, 
            agent.NAME AS agent_name,  
            game_list.ENCODED_DT AS GAME_DATE_START 
        FROM game_list
        JOIN account ON game_list.ACCOUNT_ID = account.IDNo
        JOIN agent ON agent.IDNo = account.AGENT_ID
        JOIN agency ON agency.IDNo = agent.AGENCY
        WHERE game_list.ACTIVE != 0 
          AND DATE(game_list.ENCODED_DT) BETWEEN ? AND ?
        ORDER BY game_list.IDNo ASC
    `;

    try {
        // Execute the query with start and end dates
        const [rows] = await pool.execute(query, [start, end]);

        // Return the results as JSON
        res.json(rows);
    } catch (error) {
        console.error('Error fetching data:', error);
        return res.status(500).json({ error: 'Error fetching data' });
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



// DELETE GAME LIST (Deactivate)
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


// STATUS GAME LIST
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
			
			// ✅ Only send Telegram notification for status = 1 (END GAME), not for status = 3 (PENDING)
			if (txtStatus === "1") {
				const [agentResults] = await pool.execute(`
					SELECT agent.AGENT_CODE, agent.NAME
					FROM agent
					JOIN account ON account.AGENT_ID = agent.IDNo
					WHERE account.ACTIVE = 1 AND account.IDNo = ?
				`, [txtAccountCode]);

				if (agentResults.length > 0) {
					const agentCode = agentResults[0].AGENT_CODE;
					const agentName = agentResults[0].NAME;

					const [telegramIdResults] = await pool.execute(`
						SELECT agent.TELEGRAM_ID 
						FROM agent
						JOIN account ON account.AGENT_ID = agent.IDNo
						WHERE account.ACTIVE = 1 AND account.IDNo = ?
					`, [txtAccountCode]);

					const updated_time = new Date().toLocaleTimeString();
					const date_nowTG = new Date().toLocaleDateString();

					const text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nGame #: ${txtGameId}\nCapital: ${parseFloat(txtCapital).toLocaleString()}\nFinal Chips: ${parseFloat(txtFinalChips).toLocaleString()}\nWin/Loss: ${parseFloat(adjustedWinloss).toLocaleString()}\nTotal Rolling: ${parseFloat(txtTotalRolling).toLocaleString()}`;

					if (telegramIdResults.length > 0) {
						const telegramId = telegramIdResults[0].TELEGRAM_ID;
						await sendTelegramMessage(text, telegramId);
					} else {
						console.warn("No TELEGRAM_ID found for Account:", txtAccountCode);
					}

					const [chatIdResults] = await pool.execute(`SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1`);
					if (chatIdResults.length > 0) {
						await sendTelegramMessage(text, chatIdResults[0].CHAT_ID);
					}
				} else {
					console.warn("No agent info found for Account:", txtAccountCode);
				}
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
		// Insert settlement details into account_ledger
		const insertQuery = `INSERT INTO account_ledger (ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?)`;
		await pool.query(insertQuery, [txtAccountIDSettle, txtTransType, 5, FNBDESC, paymentValue, req.session.user_id, date_now]);

		// Update the settled status and FNB in the game_list table
		const updateQuery = `UPDATE game_list SET SETTLED = 1, FNB = ? WHERE IDNo = ?`;
		await pool.query(updateQuery, [fnbValue, game_id_settle]);

		// Fetch AGENT_CODE, NAME, and TELEGRAM_ID
		const agentQuery = `
            SELECT agent.AGENT_CODE, agent.NAME, agent.TELEGRAM_ID
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
			const agentCode = agentResults[0].AGENT_CODE;
			const agentName = agentResults[0].NAME;
			const telegramId = agentResults[0].TELEGRAM_ID;

			// Fetch additional CHAT_ID from telegram_api table
			const chatIdQuery = `SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1`;
			const [chatIdResults] = await pool.query(chatIdQuery);
			const additionalChatId = chatIdResults.length > 0 ? chatIdResults[0].CHAT_ID : null;

			// Prepare the Telegram message
			let text;
			if (txtTransType == 1) {
				const currentBalance = parseFloat(txtSettlementBalance.replace(/,/g, '')) + parseFloat(paymentValue);
				text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nTransaction: ${game_id_settle} - Commission\nAmount: ${parseFloat(paymentValue).toLocaleString()}\nAccount Balance: ${parseFloat(currentBalance).toLocaleString()}`;
			} else {
				text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nTransaction: ${game_id_settle} - Commission\nAmount: ${parseFloat(paymentValue).toLocaleString()}`;
			}

			// Send the Telegram message
			if (telegramId) {
				await sendTelegramMessage(text, telegramId);

				if (additionalChatId) {
					await sendTelegramMessage(text, additionalChatId);
				}
			} else {
				console.error("No TELEGRAM_ID found for Account ID:", txtAccountIDSettle);
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

		// Insert into account_ledger if transaction type is 2 or 3
		if (txtTransType == 2) {
			const query3 = `INSERT INTO account_ledger (ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?)`;
			queries.push(pool.execute(query3, [txtAccountCode, 2, txtTransType, AddBuyinDESC, totalAmount, req.session.user_id, date_now]));
		}

		if (txtTransType == 3) {
			const query4 = `INSERT INTO account_ledger (ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, AMOUNT, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?)`;
			queries.push(pool.execute(query4, [txtAccountCode, 10, txtTransType, totalAmount, req.session.user_id, date_now]));
		}

		// Wait for all queries to finish
		await Promise.all(queries);

		// Fetch AGENT_CODE and NAME
		const agentQuery = `
			SELECT agent.AGENT_CODE, agent.NAME
			FROM agent
			JOIN account ON account.AGENT_ID = agent.IDNo
			WHERE account.ACTIVE = 1 AND account.IDNo = ?
		`;
		const [agentResults] = await pool.execute(agentQuery, [txtAccountCode]);

		if (agentResults.length > 0) {
			const agentCode = agentResults[0].AGENT_CODE;
			const agentName = agentResults[0].NAME;

			// Fetch TELEGRAM_ID
			const telegramIdQuery = `
				SELECT agent.TELEGRAM_ID 
				FROM agent
				JOIN account ON account.AGENT_ID = agent.IDNo
				WHERE account.ACTIVE = 1 AND account.IDNo = ?
			`;
			const [telegramIdResults] = await pool.execute(telegramIdQuery, [txtAccountCode]);

			// Fetch additional CHAT_ID from telegram_api table
			const chatIdQuery = `SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1`;
			const [chatIdResults] = await pool.execute(chatIdQuery);
			const additionalChatId = chatIdResults.length > 0 ? chatIdResults[0].CHAT_ID : null;

			let time_now = new Date();
			let updated_time = time_now.toLocaleTimeString();
			let date_nowTG = new Date().toLocaleDateString();

			// Calculate new TotalBalance after withdrawal
			const totalBuyin = parseFloat(txtTotalAmountBuyin.replace(/,/g, '')) + totalAmount;
			const newTotalBalance = totalBalanceGuest2 - totalAmount;

			// Prepare Telegram message text
			let text = '';
			if (txtTransType == 2) {
				text = `Demo Cage\n\nAccount: ${agentCode} (${agentName})\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nAdditional Buy-in\nGame #: ${game_id}\nBuy-in: ${parseFloat(totalAmount).toLocaleString()}\nTotal Buy-in: ${parseFloat(totalBuyin).toLocaleString()}\nAccount Balance: ${parseFloat(newTotalBalance).toLocaleString()}`;
			} else if (txtTransType == 1) {
				text = `Demo Cage\n\nAccount: ${agentCode} (${agentName})\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nAdditional Buy-in - Cash\nGame #: ${game_id}\nBuy-in: ${parseFloat(totalAmount).toLocaleString()}\nTotal Buy-in: ${parseFloat(totalBuyin).toLocaleString()}`;
			} else if (txtTransType == 3) {
				text = `Demo Cage\n\nAccount: ${agentCode} (${agentName})\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nAdditional Buy-in - IOU\nGame #: ${game_id}\nBuy-in: ${parseFloat(totalAmount).toLocaleString()}\nTotal Buy-in: ${parseFloat(totalBuyin).toLocaleString()}`;
			}

			// Send Telegram messages
			if (text !== '' && telegramIdResults.length > 0) {
				const telegramId = telegramIdResults[0].TELEGRAM_ID;
				await sendTelegramMessage(text, telegramId); // Send to agent's Telegram ID

				if (additionalChatId) {
					await sendTelegramMessage(text, additionalChatId); // Send to additional CHAT_ID
				}
			} else {
				console.error("No TELEGRAM_ID found for Account Code:", txtAccountCode);
			}
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

		// Second insert into account_ledger table
		const query2 = `INSERT INTO account_ledger(ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?)`;
		await pool.execute(query2, [txtAccountCode, 1, txtTransType, CashOutDESC, txtNNamount + txtCCamount, req.session.user_id, date_now]);

		// Fetch AGENT_CODE and NAME for Telegram
		const agentQuery = `
			SELECT agent.AGENT_CODE, agent.NAME
			FROM agent
			JOIN account ON account.AGENT_ID = agent.IDNo
			WHERE account.ACTIVE = 1 AND account.IDNo = ?
		`;
		const [agentResults] = await pool.execute(agentQuery, [txtAccountCode]);

		if (agentResults.length > 0) {
			const agentCode = agentResults[0].AGENT_CODE;
			const agentName = agentResults[0].NAME;

			// Fetch TELEGRAM_ID for the agent
			const telegramIdQuery = `
				SELECT agent.TELEGRAM_ID 
				FROM agent
				JOIN account ON account.AGENT_ID = agent.IDNo
				WHERE account.ACTIVE = 1 AND account.IDNo = ?
			`;
			const [telegramIdResults] = await pool.execute(telegramIdQuery, [txtAccountCode]);

			// Fetch additional CHAT_ID from telegram_api table
			const chatIdQuery = `SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1`;
			const [chatIdResults] = await pool.execute(chatIdQuery);
			const additionalChatId = chatIdResults.length > 0 ? chatIdResults[0].CHAT_ID : null;

			let time_now = new Date();
			let updated_time = time_now.toLocaleTimeString();
			let date_nowTG = new Date().toLocaleDateString();

			// Prepare Telegram message
			let text = '';
			if (txtTransType == 2) {
				text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nChips Return\nGame #: ${game_id}\nChips Return: ${chipsReturn.toLocaleString()}\nAccount Balance: ${currentBalanceCashout.toLocaleString()}`;
			} else if (txtTransType == 1) {
				text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nChips Return - Cash\nGame #: ${game_id}\nChips Return: ${chipsReturn.toLocaleString()}`;
			} else if (txtTransType == 4) {
				text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nChips Return - IOU\nGame #: ${game_id}\nChips Return: ${chipsReturn.toLocaleString()}`;
			}

			// Send Telegram message if TELEGRAM_ID is found
			if (text !== '' && telegramIdResults.length > 0) {
				const telegramId = telegramIdResults[0].TELEGRAM_ID;
				await sendTelegramMessage(text, telegramId); // Send to agent's Telegram ID

				if (additionalChatId) {
					await sendTelegramMessage(text, additionalChatId); // Send to additional CHAT_ID
				}
			} else {
				console.error("No TELEGRAM_ID found for Account Code:", txtAccountCode);
			}
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
router.post('/add_game_record', async (req, res) => {
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

router.get("/game_record/:id", async (req, res) => {
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
router.get('/game_record_data/:id', async (req, res) => {
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
router.put('/game_record/remove/:id', async (req, res) => {
	const id = parseInt(req.params.id);
	let date_now = new Date();

	// First update the record based on IDNo
	const query = `UPDATE game_record SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;
	try {
		await pool.execute(query, [0, req.session.user_id, date_now, id]);

		// Now, fetch the details of the record for further query
		const recordQuery = `SELECT NN_CHIPS, ENCODED_DT FROM game_record WHERE IDNo = ?`;
		const [recordResult] = await pool.execute(recordQuery, [id]);

		// Ensure the result exists
		if (recordResult.length === 0) {
			return res.status(404).send('Record not found for additional deletion');
		}

		const nnChips = recordResult[0].NN_CHIPS;
		const encodedDt = recordResult[0].ENCODED_DT;

		// Update records with the same NN_CHIPS and ENCODED_DT for CAGE_TYPE 1 and 3
		const deleteQuery = `
			UPDATE game_record 
			SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? 
			WHERE NN_CHIPS = ? AND ENCODED_DT = ? AND CAGE_TYPE IN (1, 3)
		`;

		const [deleteResult] = await pool.execute(deleteQuery, [0, req.session.user_id, date_now, nnChips, encodedDt]);

		// Note: GAME_RECORD_ID column doesn't exist in account_ledger table
		// If ledger entries need to be deleted, use another method to identify them

		// Check if any rows were updated
		if (deleteResult.affectedRows > 0) {
			res.send('GAME LIST updated successfully for IDNo and matching CAGE_TYPE 1 and 3');
		} else {
			res.send('No matching records found for deletion with CAGE_TYPE 1 and 3');
		}
	} catch (err) {
		console.error('Error updating GAME LIST:', err);
		res.status(500).send('Error updating GAME LIST');
	}
});
// Export the router
module.exports = router; 