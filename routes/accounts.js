const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const { checkSession, sessions } = require('./auth');
const { sendTelegramMessage } = require('../utils/telegram');

const multer = require('multer');
const ExcelJS = require('exceljs');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const mapDirection = (txtTrans) => {
	switch (String(txtTrans)) {
		case '1':
			return 'DEPOSIT';
		case '2':
			return 'WITHDRAW';
		case '3':
			return 'CREDIT';
		case 'TRANSFER_OUT':
		case 'TRANSFER_IN':
			return txtTrans;
		default:
			return 'UNKNOWN';
	}
};

const getTransactionName = async (transactionId) => {
	if (!transactionId) return null;
	try {
		const [rows] = await pool.query('SELECT TRANSACTION FROM transaction_type WHERE IDNo = ?', [transactionId]);
		return rows[0]?.TRANSACTION || null;
	} catch (err) {
		console.error('Failed to fetch transaction name:', err);
		return null;
	}
};

// Compute balance from ledger (shared)
const getCurrentBalance = async (accountId) => {
	const balanceQuery = `
		SELECT transaction_type.TRANSACTION, account_ledger.AMOUNT
		FROM account_ledger
		JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID
		WHERE account_ledger.TRANSACTION_TYPE IN (2, 5, 3) AND account_ledger.ACCOUNT_ID = ?
	`;
	const [rows] = await pool.query(balanceQuery, [accountId]);

	let deposit_amount = 0;
	let withdraw_amount = 0;
	let marker_issue_amount = 0;
	let marker_return_deposit = 0;

	rows.forEach((row) => {
		const amount = parseFloat(row.AMOUNT) || 0;
		if (row.TRANSACTION === 'DEPOSIT') deposit_amount += amount;
		if (row.TRANSACTION === 'WITHDRAW') withdraw_amount += amount;
		if (row.TRANSACTION === 'IOU CASH') marker_issue_amount += amount;
		if (row.TRANSACTION === 'IOU RETURN DEPOSIT') marker_return_deposit += amount;
	});

	return deposit_amount + marker_issue_amount - withdraw_amount - marker_return_deposit;
};

const recordHistory = async ({
	ledgerId = null,
	accountId,
	transactionId = null,
	transactionName = null,
	amount = 0,
	balanceBefore = null,
	balanceAfter = null,
	remarks = null,
	transferAccountId = null,
	direction = 'UNKNOWN',
	encodedBy = null,
	encodedDate = new Date()
}) => {
	const query = `
		INSERT INTO account_transaction_history
		(ledger_id, account_id, transaction_id, transaction_name, amount, balance_before, balance_after, remarks, transfer_account_id, direction, encoded_by, encoded_dt)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;

	try {
		await pool.query(query, [
			ledgerId,
			accountId,
			transactionId,
			transactionName,
			amount,
			balanceBefore,
			balanceAfter,
			remarks,
			transferAccountId,
			direction,
			encodedBy,
			encodedDate
		]);
	} catch (err) {
		// Do not block the main flow if history insert fails, but log for follow-up.
		console.error('account_transaction_history insert failed:', err);
	}
};

// Set up multer for multiple file uploads
const storage = multer.diskStorage({
	destination: 'PassportUpload/',
	filename: (req, file, cb) => {
		const uniqueName = `${Date.now()}-${file.originalname}`; // Unique filename
		cb(null, uniqueName);
	}
});


const uploadPassportImg = multer({
	storage: storage,
	limits: {
		fileSize: 5 * 1024 * 1024 // Limit file size to 5MB
	},
	fileFilter(req, file, cb) {
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
		if (!allowedTypes.includes(file.mimetype)) {
			return cb(new Error('File type not allowed'));
		}
		cb(null, true);
	}
});


router.get("/agency", checkSession, function (req, res) {

	const permissions = req.session.permissions;

	res.render("accounts/agency", {
		...sessions(req, 'agency'),
		permissions: permissions
	});
});

router.get("/agent", checkSession, function (req, res) {

	const permissions = req.session.permissions;

	res.render("accounts/agent", {
		...sessions(req, 'agent'),
		permissions: permissions
	});


});

router.get("/account_ledger", checkSession, function (req, res) {

	const permissions = req.session.permissions;

	res.render("accounts/account_ledger", {
		...sessions(req, 'account_ledger'),
		permissions: permissions
	});

});

// ADD AGENCY
router.post('/add_agency', async (req, res) => {
	try {
		const { txtAgency } = req.body;
		const date_now = new Date();

		const query = `INSERT INTO agency (AGENCY, ENCODED_BY, ENCODED_DT, ACTIVE) VALUES (?, ?, ?, ?)`;
		await pool.execute(query, [txtAgency, req.session.user_id, date_now, 1]);

		res.redirect('/agency');
	} catch (err) {
		console.error('Error inserting agency:', err);
		res.status(500).send('Error inserting agency');
	}
});

// GET AGENCY DATA
router.get('/agency_data', async (req, res) => {
	try {
		const query = `SELECT * FROM agency WHERE ACTIVE = 1 ORDER BY AGENCY ASC`;
		const [results] = await pool.execute(query);

		res.json(results);
	} catch (err) {
		console.error('Error fetching data:', err);
		res.status(500).send('Error fetching data');
	}
});

// EDIT AGENCY
router.put('/agency/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { txtAgency } = req.body;
		const date_now = new Date();

		const query = `UPDATE agency SET AGENCY = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;
		await pool.execute(query, [txtAgency, req.session.user_id, date_now, id]);

		res.send('Agency updated successfully');
	} catch (err) {
		console.error('Error updating agency:', err);
		res.status(500).send('Error updating agency');
	}
});

// ARCHIVE AGENCY
router.put('/agency/remove/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const date_now = new Date();

		const query = `UPDATE agency SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;
		await pool.execute(query, [0, req.session.user_id, date_now, id]);

		res.send('Agency updated successfully');
	} catch (err) {
		console.error('Error updating agency:', err);
		res.status(500).send('Error updating agency');
	}
});


// ADD AGENT
router.post('/add_agent', uploadPassportImg.single('photo'), async (req, res) => {
	try {
		const { txtAgencyLine, txtAgenctCode, txtName, txtRemarks, txtTelegram, txtContact } = req.body;
		const date_now = new Date();
		const photoPath = req.file ? req.file.filename : null;

		const insertAgentQuery = `
			INSERT INTO agent (AGENCY, AGENT_CODE, NAME, CONTACTNo, TELEGRAM_ID, REMARKS, PHOTO, ENCODED_BY, ENCODED_DT)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
		const agentParams = [txtAgencyLine, txtAgenctCode, txtName, txtContact, txtTelegram, txtRemarks, photoPath, req.session.user_id, date_now];

		const [agentResult] = await pool.execute(insertAgentQuery, agentParams);
		const agent_id = agentResult.insertId;

		const insertAccountQuery = `
			INSERT INTO account (AGENT_ID, GUESTNo, MEMBERSHIPNo, ENCODED_BY, ENCODED_DT)
			VALUES (?, ?, ?, ?, ?)`;
		await pool.execute(insertAccountQuery, [agent_id, '', '', req.session.user_id, date_now]);

		res.redirect('/agent');
	} catch (error) {
		console.error('❌ Error in /add_agent:', error);
		res.status(500).json({ error: 'Internal Server Error' });
	}
});


// GET AGENT
router.get('/agent_data', async (req, res) => {
	try {
		const query = `
			SELECT *, agency.AGENCY AS agency_name, agency.IDNo AS agency_id,
			agent.AGENT_CODE AS agent_code, agent.IDNo AS agent_id, agent.ACTIVE AS active
			FROM agent
			JOIN agency ON agent.AGENCY = agency.IDNo
			WHERE agent.ACTIVE = 1`;
		const [results] = await pool.execute(query);
		res.json(results);
	} catch (error) {
		console.error('❌ Error fetching agent data:', error);
		res.status(500).send('Error fetching data');
	}
});


// GET AGENT DATA BY ID
router.get('/agent_data/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const query = `
			SELECT CONCAT_WS(" ", FIRSTNAME, MIDDLENAME, LASTNAME) AS agent_name,
				   agent.IDNo AS agent_id,
				   agency.AGENCY AS agency,
				   agency.IDNo AS agency_id
			FROM agent
			JOIN agency ON agent.AGENCY = agency.IDNo
			WHERE agent.IDNo = ? AND agent.ACTIVE = 1`;
		const [results] = await pool.execute(query, [id]);
		res.json(results);
	} catch (error) {
		console.error('❌ Error fetching agent by ID:', error);
		res.status(500).send('Error fetching data');
	}
});


// EDIT AGENT
router.put('/agent/:id', uploadPassportImg.single('photo'), async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { txtAgenctCode, txtName, txtRemarks, txtTelegram, txtContact } = req.body;
		const date_now = new Date();
		const photoPath = req.file ? req.file.filename : null;

		let query = `
			UPDATE agent SET AGENT_CODE = ?, NAME = ?, CONTACTNo = ?, TELEGRAM_ID = ?, REMARKS = ?, EDITED_BY = ?, EDITED_DT = ?`;
		const params = [txtAgenctCode, txtName, txtContact, txtTelegram, txtRemarks, req.session.user_id, date_now];

		if (photoPath) {
			query += `, PHOTO = ?`;
			params.push(photoPath);
		}

		query += ` WHERE IDNo = ?`;
		params.push(id);

		await pool.execute(query, params);
		res.send('Agent updated successfully');
	} catch (error) {
		console.error('❌ Error updating agent:', error);
		res.status(500).send('Error updating agent');
	}
});


// REMOVE AGENT
router.put('/agent/remove/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const date_now = new Date();

		const queryAgent = `UPDATE agent SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;
		const queryAccount = `UPDATE account SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE AGENT_ID = ?`;

		await pool.execute(queryAgent, [0, req.session.user_id, date_now, id]);
		await pool.execute(queryAccount, [0, req.session.user_id, date_now, id]);

		console.log('✅ Agent and account archived successfully');
		res.send('Updated successfully');
	} catch (error) {
		console.error('❌ Error removing agent:', error);
		res.status(500).send('Error removing agent');
	}
});


//GET ACCOUNT
router.get('/account_data', async (req, res) => {
	try {
		const agencyIdParam = req.query.agencyId;
		const agencyId = agencyIdParam !== undefined && agencyIdParam !== '' ? Number(agencyIdParam) : null;
		const hasAgencyFilter = agencyId !== null && !Number.isNaN(agencyId);

		const ledgerTotalsSubquery = `
			SELECT 
				al.ACCOUNT_ID,
				SUM(
					CASE
						WHEN tt.TRANSACTION IN ('DEPOSIT', 'IOU CASH') THEN al.AMOUNT
						WHEN tt.TRANSACTION IN ('WITHDRAW', 'IOU RETURN DEPOSIT') THEN -al.AMOUNT
						ELSE 0
					END
				) AS total_balance
			FROM account_ledger al
			LEFT JOIN transaction_type tt ON tt.IDNo = al.TRANSACTION_ID
			WHERE al.ACTIVE = 1
			  AND al.TRANSACTION_TYPE IN (2, 3, 5)
			GROUP BY al.ACCOUNT_ID
		`;

		const latestGameSubquery = `
			SELECT ACCOUNT_ID, MAX(ENCODED_DT) AS LATEST_GAME_DATE
			FROM game_list
			GROUP BY ACCOUNT_ID
		`;

		let baseQuery = `
			SELECT 
				acc.IDNo AS account_id,
				acc.AGENT_ID AS AGENT_ID,
				ag.IDNo AS agent_id,
				ag.AGENT_CODE AS agent_code,
				ag.NAME AS agent_name,
				ag.CONTACTNo AS agent_contact,
				ag.TELEGRAM_ID AS agent_telegram,
				ag.REMARKS AS agent_remarks,
				ag.PHOTO AS PASSPORTPHOTO,
				CAST(acc.ACTIVE AS UNSIGNED) AS active,
				CAST(ag.ACTIVE AS UNSIGNED) AS agent_active,
				agency.AGENCY AS agency_name,
				agency.IDNo AS agency_id,
				COALESCE(led.total_balance, 0) AS total_balance,
				COALESCE(led.total_balance, 0) AS total_ledger_amount,
				lg.LATEST_GAME_DATE
			FROM account acc
			JOIN agent ag ON ag.IDNo = acc.AGENT_ID
			JOIN agency ON agency.IDNo = ag.AGENCY
			LEFT JOIN (${ledgerTotalsSubquery}) AS led ON led.ACCOUNT_ID = acc.IDNo
			LEFT JOIN (${latestGameSubquery}) AS lg ON lg.ACCOUNT_ID = acc.IDNo
			WHERE acc.ACTIVE = 1
			  AND ag.ACTIVE = 1
		`;

		const params = [];

		if (hasAgencyFilter) {
			baseQuery += ` AND agency.IDNo = ?`;
			params.push(agencyId);
		}

		baseQuery += ` ORDER BY ag.NAME ASC`;

		const [results] = await pool.execute(baseQuery, params);
		res.json(results);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});


// Get agency name by ID (for modal title)
router.get('/agency_data/:id', async (req, res) => {
	const agencyId = parseInt(req.params.id);

	const query = `SELECT IDNo AS agency_id, AGENCY AS agency_name FROM agency WHERE IDNo = ?`;

	try {
		const [results] = await pool.execute(query, [agencyId]);

		if (results.length === 0) {
			return res.status(404).json({ error: 'Agency not found' });
		}

		res.json(results);
	} catch (err) {
		console.error('❌ Error in /agency_data/:id:', err);
		res.status(500).json({ error: 'Internal Server Error' });
	}
});



// EDIT ACCOUNT
router.put('/account/:id', async (req, res) => {
	const id = parseInt(req.params.id);
	const { txtGuestNo, txtMembershipNo } = req.body;
	const date_now = new Date();

	// Helper: compute current balance from ledger
	const getCurrentBalance = async (accountId) => {
		const balanceQuery = `
			SELECT transaction_type.TRANSACTION, account_ledger.AMOUNT
			FROM account_ledger
			JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID
			WHERE account_ledger.TRANSACTION_TYPE IN (2, 5, 3) AND account_ledger.ACCOUNT_ID = ?
		`;
		const [rows] = await pool.query(balanceQuery, [accountId]);

		let deposit_amount = 0;
		let withdraw_amount = 0;
		let marker_issue_amount = 0;
		let marker_return_deposit = 0;

		rows.forEach((row) => {
			const amount = parseFloat(row.AMOUNT) || 0;
			if (row.TRANSACTION === 'DEPOSIT') deposit_amount += amount;
			if (row.TRANSACTION === 'WITHDRAW') withdraw_amount += amount;
			if (row.TRANSACTION === 'IOU CASH') marker_issue_amount += amount;
			if (row.TRANSACTION === 'IOU RETURN DEPOSIT') marker_return_deposit += amount;
		});

		return deposit_amount + marker_issue_amount - withdraw_amount - marker_return_deposit;
	};

	const query = `UPDATE account SET GUESTNo = ?, MEMBERSHIPNo = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;

	try {
		await pool.execute(query, [txtGuestNo, txtMembershipNo, req.session.user_id, date_now, id]);
		res.send('Account updated successfully');
	} catch (err) {
		console.error('Error updating account:', err);
		res.status(500).send('Error updating account');
	}
});

// REMOVE ACCOUNT
router.put('/account/remove/:id', async (req, res) => {
	const id = parseInt(req.params.id);
	const date_now = new Date();

	const query = `UPDATE account SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;

	try {
		await pool.execute(query, [0, req.session.user_id, date_now, id]);
		res.send('Agency updated successfully');
	} catch (err) {
		console.error('Error updating agency:', err);
		res.status(500).send('Error updating agency');
	}
});

// ADD ACCOUNT DETAILS 
router.post('/add_account_details', async (req, res) => {
	const {
		txtAccountId,
		txtTrans,
		txtAmount,
		txtRemarks,
		sendToTelegram, // Added to handle checkbox value
		totalBalanceGuest
	} = req.body;
	let date_now = new Date();


	const amountRaw = (txtAmount || '0').split(',').join('');
	const amountNumber = parseFloat(amountRaw) || 0;
	let txtAmountNum = amountRaw;
	const balanceBefore = await getCurrentBalance(txtAccountId);

	// Set transaction description
	let transacDesc = 'ACCOUNT DETAILS';


	const insertQuery = `INSERT INTO  account_ledger(ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, REMARKS, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

	try {
		const transactionType = (txtTrans === '1' || txtTrans === '2') ? 2 : 3;
		const [insertResult] = await pool.query(insertQuery, [txtAccountId, txtTrans, transactionType, transacDesc, txtAmountNum, txtRemarks, req.session.user_id, date_now]);

		const transactionQuery = `
            SELECT transaction_type.TRANSACTION
            FROM account_ledger
            JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID
            WHERE account_ledger.IDNo = ?
        `;

		const [transactionResults] = await pool.query(transactionQuery, [insertResult.insertId]);

		if (transactionResults.length > 0) {
			const transaction = transactionResults[0].TRANSACTION;
			const balanceAfter = await getCurrentBalance(txtAccountId);

			await recordHistory({
				ledgerId: insertResult.insertId,
				accountId: parseInt(txtAccountId, 10),
				transactionId: parseInt(txtTrans, 10),
				transactionName: transaction,
				amount: amountNumber,
				balanceBefore,
				balanceAfter,
				remarks: txtRemarks || null,
				direction: mapDirection(txtTrans),
				encodedBy: req.session.user_id,
				encodedDate: date_now
			});

			const guestAccountNumQuery = `
                SELECT agent.AGENT_CODE 
                FROM agent
                JOIN account ON account.AGENT_ID = agent.IDNo
                JOIN account_ledger ON account_ledger.ACCOUNT_ID = account.IDNo 
                WHERE account.ACTIVE = 1 
                AND account_ledger.ACCOUNT_ID = ?
            `;
			const [guestAccountNumResults] = await pool.query(guestAccountNumQuery, [txtAccountId]);

			const guestNameQuery = `
                SELECT agent.NAME 
                FROM agent
                JOIN account ON account.AGENT_ID = agent.IDNo
                JOIN account_ledger ON account_ledger.ACCOUNT_ID = account.IDNo 
                WHERE account.ACTIVE = 1 
                AND account_ledger.ACCOUNT_ID = ?
            `;
			const [guestNameResults] = await pool.query(guestNameQuery, [txtAccountId]);

			// Fetch the TELEGRAM_ID based on txtAccountId
			const telegramIdQuery = `
                SELECT agent.TELEGRAM_ID 
                FROM agent
                JOIN account ON account.AGENT_ID = agent.IDNo
                JOIN account_ledger ON account_ledger.ACCOUNT_ID = account.IDNo 
                WHERE account.ACTIVE = 1 
                AND account_ledger.ACCOUNT_ID = ?
            `;


			const [telegramIdResults] = await pool.query(telegramIdQuery, [txtAccountId]);

			let time_now = new Date();
			time_now.setHours(time_now.getHours());
			let updated_time = time_now.toLocaleTimeString();
			let date_nowTG = new Date().toLocaleDateString();

			// Assuming these are your inputs
			let totalBalanceGuest = parseFloat(req.body.totalBalanceGuest.replace(/,/g, '')) || 0; // Ensure it's a number
			

			// Determine totalBalance based on transaction type
			let totalBalance;
			if (txtTrans === '1') { // Deposit
				totalBalance = totalBalanceGuest + amountNumber;
			} else if (txtTrans === '2') { // Withdraw
				totalBalance = totalBalanceGuest - amountNumber;
			} else if (txtTrans === '3') { // Other
				totalBalance = totalBalanceGuest + amountNumber;
			}

			// Adjust for display
			const displayWithdraw = (txtTrans === '2') ? -amountNumber : amountNumber;

			if (telegramIdResults.length > 0 && guestAccountNumResults.length > 0 && guestNameResults.length > 0) {
				const telegramId = telegramIdResults[0].TELEGRAM_ID;
				const guestAccountNum = guestAccountNumResults[0].AGENT_CODE;
				const guestName = guestNameResults[0].NAME;

				// Reformat the amount with commas
				const formattedAmount = amountNumber.toLocaleString();

				const text = `Demo Cage\n\nAccount #: ${guestAccountNum}\nGuest: ${guestName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nTransaction: ${transaction}\nCurrency: PHP\nRemarks: ${txtRemarks}\n\nAmount: ${parseFloat(displayWithdraw).toLocaleString()}\nAccount Balance: ${parseFloat(totalBalance).toLocaleString()}`;

				if (sendToTelegram) {
					// Send the message to the guest's Telegram ID
					await sendTelegramMessage(text, telegramId);

					// Fetch additional CHAT_ID from telegram_api table
					const chatIdQuery = `SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1`;
					const [chatIdResults] = await pool.query(chatIdQuery);

					if (chatIdResults.length > 0) {
						const additionalChatId = chatIdResults[0].CHAT_ID;

						// Send the message to the additional CHAT_ID
						await sendTelegramMessage(text, additionalChatId);
					} else {
						console.error("No CHAT_ID found in telegram_api table.");
					}
				}

				res.send('Form submitted and message sent successfully!');
			} else {
				res.status(404).send('Telegram ID not found.');
			}
		} else {
			res.status(404).send('Transaction not found.');
		}
	} catch (error) {
		console.error('Error executing query or sending message:', error);
		res.status(500).send('Error processing request.');
	}
});

//ACCOUNT BUTTON CHECK BALANCE
router.post('/check_balance/:accountId', async (req, res) => {
	const { accountId } = req.params;

	try {
		// Get agent info for the account
		const [results] = await pool.query(`
			SELECT agent.TELEGRAM_ID, agent.AGENT_CODE, agent.NAME
			FROM account
			JOIN agent ON agent.IDNo = account.AGENT_ID
			WHERE account.IDNo = ?
		`, [accountId]);

		if (results.length === 0) return res.json({ success: false });

		const { TELEGRAM_ID, AGENT_CODE, NAME } = results[0];

		// Calculate balance from ledger entries
		const [ledgerResults] = await pool.query(`
			SELECT transaction_type.TRANSACTION, account_ledger.AMOUNT
			FROM account_ledger
			JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID
			WHERE account_ledger.TRANSACTION_TYPE IN (2, 5, 3) AND account_ledger.ACCOUNT_ID = ?
		`, [accountId]);

		let deposit_amount = 0;
		let withdraw_amount = 0;
		let marker_issue_amount = 0;
		let marker_return_deposit = 0;

		ledgerResults.forEach(row => {
			const amount = parseFloat(row.AMOUNT) || 0;
			if (row.TRANSACTION === 'DEPOSIT') deposit_amount += amount;
			if (row.TRANSACTION === 'WITHDRAW') withdraw_amount += amount;
			if (row.TRANSACTION === 'IOU CASH') marker_issue_amount += amount;
			if (row.TRANSACTION === 'IOU RETURN DEPOSIT') marker_return_deposit += amount;
		});

		const currentBalance = deposit_amount + marker_issue_amount - withdraw_amount - marker_return_deposit;
		const balanceFormatted = currentBalance.toLocaleString(undefined, { maximumFractionDigits: 0 });

		let date_now = new Date().toLocaleDateString();
		let time_now = new Date().toLocaleTimeString();

		const message = `Demo Cage\n\nBalance Check\n\nAccount: ${AGENT_CODE} - ${NAME}\nDate: ${date_now}\nTime: ${time_now}\n\nCurrent Balance: ${balanceFormatted}`;

		await sendTelegramMessage(message, TELEGRAM_ID);

		// Also notify admin if any
		const [adminChat] = await pool.query(`SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1`);
		if (adminChat.length > 0) {
			await sendTelegramMessage(message, adminChat[0].CHAT_ID);
		}

		res.json({ success: true });
	} catch (err) {
		console.error('Balance check error:', err);
		res.status(500).json({ success: false });
	}
});


// ADD ACCOUNT DETAILS TRANSFER

router.post('/add_account_details/transfer', async (req, res) => {
	const {
		txtAccountId,
		txtAccount,
		txtAmount,
		txtTransferToBalance,
		txtTransferFromBalance
	} = req.body;

	const date_now = new Date();

	// Normalize numeric inputs and default to 0 to avoid NaN in Telegram messages
	const normalizeNumber = (val) => {
		if (val === null || val === undefined) return 0;
		return parseFloat(String(val).split(',').join('')) || 0;
	};

	const totalAmount = normalizeNumber(txtAmount);
	const transferFromBalance = normalizeNumber(txtTransferFromBalance);
	const transferToBalance = normalizeNumber(txtTransferToBalance);

	const query = `INSERT INTO account_ledger(ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, AMOUNT, TRANSFER, TRANSFER_AGENT, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

	try {
		// Fetch live balances to use in Telegram messages
		const senderBalanceBefore = await getCurrentBalance(txtAccountId);
		const receiverBalanceBefore = await getCurrentBalance(txtAccount);

		// Insert transaction details for both accounts
		const [withdrawResult] = await pool.query(query, [txtAccountId, 2, 2, totalAmount, 1, txtAccount, req.session.user_id, date_now]);
		const [depositResult] = await pool.query(query, [txtAccount, 1, 2, totalAmount, 1, txtAccountId, req.session.user_id, date_now]);

		const transactionNameWithdraw = await getTransactionName(2);
		const transactionNameDeposit = await getTransactionName(1);
		const senderBalanceAfter = senderBalanceBefore - totalAmount;
		const receiverBalanceAfter = receiverBalanceBefore + totalAmount;

		await recordHistory({
			ledgerId: withdrawResult.insertId,
			accountId: parseInt(txtAccountId, 10),
			transactionId: 2,
			transactionName: transactionNameWithdraw,
			amount: totalAmount,
			balanceBefore: senderBalanceBefore,
			balanceAfter: senderBalanceAfter,
			remarks: `Transfer to account ${txtAccount}`,
			transferAccountId: parseInt(txtAccount, 10),
			direction: mapDirection('TRANSFER_OUT'),
			encodedBy: req.session.user_id,
			encodedDate: date_now
		});

		await recordHistory({
			ledgerId: depositResult.insertId,
			accountId: parseInt(txtAccount, 10),
			transactionId: 1,
			transactionName: transactionNameDeposit,
			amount: totalAmount,
			balanceBefore: receiverBalanceBefore,
			balanceAfter: receiverBalanceAfter,
			remarks: `Transfer from account ${txtAccountId}`,
			transferAccountId: parseInt(txtAccountId, 10),
			direction: mapDirection('TRANSFER_IN'),
			encodedBy: req.session.user_id,
			encodedDate: date_now
		});

		// Fetch Telegram IDs, AGENT_CODE, and NAME for the account from which the transfer is made
		const telegramIdQueryFrom = `
            SELECT agent.TELEGRAM_ID, agent.AGENT_CODE, agent.NAME
            FROM agent
            JOIN account ON account.AGENT_ID = agent.IDNo
            WHERE account.IDNo = ?
        `;
		const [telegramIdResultsFrom] = await pool.query(telegramIdQueryFrom, [txtAccountId]);

		// Fetch Telegram IDs, AGENT_CODE, and NAME for the account to which the transfer is made
		const telegramIdQueryTo = `
            SELECT agent.TELEGRAM_ID, agent.AGENT_CODE, agent.NAME
            FROM agent
            JOIN account ON account.AGENT_ID = agent.IDNo
            WHERE account.IDNo = ?
        `;
		const [telegramIdResultsTo] = await pool.query(telegramIdQueryTo, [txtAccount]);

		// Fetch additional CHAT_ID from telegram_api table
		const chatIdQuery = `SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1`;
		const [chatIdResults] = await pool.query(chatIdQuery);
		const additionalChatId = chatIdResults.length > 0 ? chatIdResults[0].CHAT_ID : null;

		// Prepare and send messages for the account from which the transfer is made
		if (telegramIdResultsFrom.length > 0) {
			for (const resultFrom of telegramIdResultsFrom) {
				const { TELEGRAM_ID: TELEGRAM_ID_FROM, AGENT_CODE: AGENT_CODE_FROM, NAME: NAME_FROM } = resultFrom;

				// Recompute based on server-side balance to avoid relying on client values
				const SenderCurrentBalance = senderBalanceBefore - totalAmount;

				let time_now = new Date();
				time_now.setHours(time_now.getHours());
				let updated_time = time_now.toLocaleTimeString();
				let date_nowTG = new Date().toLocaleDateString();

				// Prepare message with "From" account details and "To" account details
				const textFrom = `Demo Cage\n\nTransfer Details:\n\nTransferred to Account: ${telegramIdResultsTo.length > 0 ? telegramIdResultsTo[0].AGENT_CODE : 'N/A'} - ${telegramIdResultsTo.length > 0 ? telegramIdResultsTo[0].NAME : 'N/A'}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nAmount Transferred: -${totalAmount.toLocaleString()}\nAccount Balance: ${SenderCurrentBalance.toLocaleString()}`;

				await sendTelegramMessage(textFrom, TELEGRAM_ID_FROM);

				if (additionalChatId) {
					await sendTelegramMessage(textFrom, additionalChatId);
				}
			}
		}

		// Prepare and send messages for the account to which the transfer is made																												
		if (telegramIdResultsTo.length > 0) {
			for (const resultTo of telegramIdResultsTo) {
				const { TELEGRAM_ID: TELEGRAM_ID_TO, AGENT_CODE: AGENT_CODE_TO, NAME: NAME_TO } = resultTo;

				const ReceiverCurrentBalance = receiverBalanceBefore + totalAmount;

				let time_now = new Date();
				time_now.setHours(time_now.getHours());
				let updated_time = time_now.toLocaleTimeString();
				let date_nowTG = new Date().toLocaleDateString();

				// Prepare message with "From" account details and "To" account details
				const textTo = `Demo Cage\n\nTransfer Details:\n\nTransferred from Account: ${telegramIdResultsFrom.length > 0 ? telegramIdResultsFrom[0].AGENT_CODE : 'N/A'} - ${telegramIdResultsFrom.length > 0 ? telegramIdResultsFrom[0].NAME : 'N/A'}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nAmount Transferred: ${totalAmount.toLocaleString()}\nAccount Balance: ${ReceiverCurrentBalance.toLocaleString()}`;

				await sendTelegramMessage(textTo, TELEGRAM_ID_TO);

				if (additionalChatId) {
					await sendTelegramMessage(textTo, additionalChatId);
				}
			}
		}

		res.redirect('/account_ledger');
	} catch (error) {
		console.error('Error inserting details or sending message:', error);
		res.status(500).send('Error processing request.');
	}
});

// ACTIVITY LOGS ACCOUNT MODAL LEDGER

router.get('/ledger/:id', async (req, res) => {
	try {
	  const ledgerId = parseInt(req.params.id);
	  const [rows] = await pool.execute(
		'SELECT ACCOUNT_ID FROM account_ledger WHERE IDNo = ?',
		[ledgerId]
	  );
	  if (rows.length) {
		return res.json({ account_id: rows[0].ACCOUNT_ID });
	  } else {
		return res.status(404).json({ error: 'Ledger not found' });
	  }
	} catch (error) {
	  console.error('Error in /ledger/:id', error);
	  res.status(500).send('Server error');
	}
  });

// Transaction history (all or by account)
router.get('/account_transaction_history', async (req, res) => {
	const { accountId } = req.query;
	try {
		let query = `
			SELECT
				h.*,
				agent.NAME AS agent_name,
				agent.AGENT_CODE AS agent_code,
				COALESCE(CONCAT(ui.FIRSTNAME, ' ', ui.LASTNAME), ui.USERNAME, '') AS processed_by
			FROM account_transaction_history h
			JOIN account ON account.IDNo = h.account_id
			JOIN agent ON agent.IDNo = account.AGENT_ID
			LEFT JOIN user_info ui ON ui.IDNo = h.encoded_by
			WHERE 1 = 1
		`;
		const params = [];
		if (accountId) {
			query += ` AND h.account_id = ?`;
			params.push(accountId);
		}
		query += ` ORDER BY h.encoded_dt DESC`;

		const [rows] = await pool.execute(query, params);
		res.json(rows);
	} catch (error) {
		console.error('Error fetching transaction history:', error);
		res.status(500).json({ error: 'Error fetching transaction history' });
	}
});
  

router.get('/account_details_data/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const query = `
			SELECT *, account_ledger.IDNo AS account_details_id, account_ledger.ENCODED_DT AS encoded_date, 
				agent.AGENT_CODE, agent.NAME
			FROM account_ledger 
			JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID 
			JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID 
			JOIN agent ON agent.IDNo = account.AGENT_ID 
			WHERE account_ledger.ACTIVE = 1 AND account_ledger.ACCOUNT_ID = ? 
			ORDER BY account_ledger.IDNo DESC
		`;
		const [result] = await pool.execute(query, [id]);
		res.json(result);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});



// GET ACCOUNT DETAILS DEPOSIT
router.get('/account_details_data_deposit/:id', async (req, res) => {
	try {
	  const id = parseInt(req.params.id);
	  const { startDate, endDate } = req.query;
  
	  let query = `
		SELECT *, 
		  account_ledger.IDNo AS account_details_id, 
		  account_ledger.ENCODED_DT AS encoded_date 
		FROM account_ledger 
		JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID
		WHERE account_ledger.ACTIVE = 1 
		  AND account_ledger.TRANSACTION_TYPE IN (2, 5, 3) 
		  AND account_ledger.ACCOUNT_ID = ?
	  `;
  
	  const params = [id];
  
	  if (startDate && endDate) {
		query += ` AND DATE(account_ledger.ENCODED_DT) BETWEEN ? AND ? `;
		params.push(startDate, endDate);
	  }
  
	  query += ` ORDER BY account_ledger.IDNo DESC`;
  
	  const [result] = await pool.execute(query, params);
	  res.json(result);
	} catch (error) {
	  console.error('❌ Error fetching data:', error);
	  res.status(500).send('Error fetching data');
	}
  });
  
  



// GET ACCOUNT DETAILS PASSPORTPHOTO

router.get('/account_passportphoto_data/:account_id', async (req, res) => {
	try {
		const accountId = req.params.account_id;
		const query = `
			SELECT 
				account.*, 
				agent.NAME AS account_name, 
				agent.AGENT_CODE AS agent_code,
				agent.PHOTO AS PASSPORTPHOTO 
			FROM account 
			LEFT JOIN agent ON agent.IDNo = account.AGENT_ID 
			WHERE account.IDNo = ?
		`;
		const [result] = await pool.execute(query, [accountId]);
		res.json(result);
	} catch (error) {
		console.error('Error fetching account data:', error);
		res.status(500).send('Error fetching account data');
	}
});


// DELETE ACCOUNT DETAILS
router.put('/account_details/remove/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		let date_now = new Date();

		const query = `UPDATE account_ledger SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;
		await pool.execute(query, [0, req.session.user_id, date_now, id]);

		res.send('Details updated successfully');
	} catch (err) {
		console.error('Error updating Details:', err);
		res.status(500).send('Error updating Details');
	}
});

// Get Transfer Agent Name
router.get('/get-transfer-agent-name', async (req, res) => {
	const transferAgentId = req.query.transferAgentId;

	const sql = `
		SELECT agent.AGENT_CODE, agent.NAME AS transfer_agent_name 
		FROM account 
		JOIN agent ON account.AGENT_ID = agent.IDNo 
		WHERE account.IDNO = ?
	`;

	try {
		const [results] = await pool.execute(sql, [transferAgentId]);

		if (results.length > 0) {
			const { transfer_agent_name, AGENT_CODE } = results[0];
			res.json({ transfer_agent_name, agent_code: AGENT_CODE });
		} else {
			res.json({ transfer_agent_name: null, agent_code: null });
		}
	} catch (error) {
		console.error('Database error:', error);
		res.status(500).send('Server error');
	}
});

//EXPORT ACCOUNT DETAILS

router.get('/export', async (req, res) => {
	const accountId = req.query.id; // Assuming `id` is passed as a query parameter

	try {
		// Perform the query to fetch data from account_ledger table
		const [rows] = await pool.execute(`
		SELECT 
		  account_ledger.ENCODED_DT, 
		  transaction_type.TRANSACTION, 
		  account_ledger.AMOUNT, 
		  account_ledger.REMARKS  
		FROM account_ledger 
		JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID
		WHERE account_ledger.ACTIVE=1 AND account_ledger.ACCOUNT_ID= ? 
		ORDER BY account_ledger.IDNo DESC`, [accountId]);

		// Create a new workbook and worksheet
		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('Data');

		// Define the columns
		worksheet.columns = [{
			header: 'Date',
			key: 'ENCODED_DT',
			width: 20
		},
		{
			header: 'Transaction',
			key: 'TRANSACTION',
			width: 30
		},
		{
			header: 'Amount',
			key: 'AMOUNT',
			width: 15
		},
		{
			header: 'Remarks',
			key: 'REMARKS',
			width: 30
		},
		];

		// Add rows from the database query
		rows.forEach(row => {
			worksheet.addRow(row);
		});

		// Write the workbook to a buffer
		const buffer = await workbook.xlsx.writeBuffer();

		// Get agent details (name and code) to include in filename
		const [agents] = await pool.execute(`
		SELECT NAME, AGENT_CODE FROM agent
		JOIN account ON account.AGENT_ID = agent.IDNo
		WHERE account.IDNo = ?`, [accountId]);

		let filename = 'Account Details - ';

		if (agents.length > 0) {
			const agent = agents[0];

			filename = 'Account Details - ' + agent.NAME + '(' + agent.AGENT_CODE + ')';
		}

		// Set headers for file download
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', 'attachment; filename=' + filename + '.xlsx');

		// Send the buffer as the response to trigger file download
		res.send(buffer);
	} catch (error) {
		console.error('Error exporting data:', error);
		res.status(500).send('Error exporting data');
	}
});


// Export the router
module.exports = router; 