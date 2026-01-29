const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkSession, sessions } = require('./auth');

const validServiceTypes = ['fnb', 'hotel', 'delivery'];
const validTransactionIds = [1, 2, 3];
const validSourceTypes = ['JUNKET', 'GUEST'];



	router.get('/fnb-hotel', checkSession, async (req, res) => {
		const permissions = req.session.permissions;

		try {
			const [gameServices] = await pool.query(`
				SELECT 
					gs.IDNo,
					agent.NAME AS agent_name,
					gs.GAME_ID,
					gs.SERVICE_TYPE,
					gs.SOURCE_TYPE,
					gs.AMOUNT,
					gs.REMARKS,
					gs.ENCODED_BY,
					gs.TRANSACTION_ID,
					user_info.FIRSTNAME AS encoded_by_name,
					gs.ENCODED_DT
				FROM game_services gs
				LEFT JOIN agent ON agent.IDNo = gs.AGENT_ID
				LEFT JOIN user_info ON user_info.IDNo = gs.ENCODED_BY
				WHERE gs.ACTIVE = 1
				ORDER BY gs.ENCODED_DT DESC
			`);

			res.render('junket/fnb_hotel', {
				...sessions(req, 'fnb-hotel'),
				permissions,
				gameServices
			});
		} catch (err) {
			console.error('Error loading F&B / Hotel data:', err);
			res.status(500).send('Internal Server Error');
		}
	});

	router.get('/fnb-hotel/accounts', checkSession, async (req, res) => {
	try {
		const [rows] = await pool.query(`
			SELECT 
				a.IDNo AS account_id,
				a.AGENT_ID AS agent_id,
				agent.NAME AS agent_name,
				agent.AGENT_CODE AS agent_code,
					(
						SELECT IFNULL(SUM(CASE 
							WHEN TRANSACTION_ID = 2 THEN AMOUNT 
							WHEN TRANSACTION_ID = 1 THEN -AMOUNT 
							ELSE 0 
						END), 0)
						FROM account_ledger al
						WHERE al.ACTIVE = 1 AND al.ACCOUNT_ID = a.IDNo
					) AS balance
			FROM account a
			LEFT JOIN agent ON agent.IDNo = a.AGENT_ID
			WHERE a.ACTIVE = 1
			ORDER BY agent.NAME ASC, a.IDNo DESC
		`);

		res.json(rows);
	} catch (err) {
		console.error('Error fetching F&B / Hotel accounts list:', err);
		res.status(500).json({ error: 'Failed to load accounts.' });
	}
});

router.post('/fnb-hotel/service', checkSession, async (req, res) => {
	try {
		const {
			account_id,
			agent_id,
			service_type,
			amount,
			remarks,
			transaction_id,
			game_id,
			source_type
		} = req.body;

		const parsedAccountId = parseInt(account_id, 10);
		const parsedAgentId = parseInt(agent_id, 10);
		const parsedGameId = parseInt(game_id, 10);
		const parsedTransactionId = parseInt(transaction_id, 10);
		const amt = parseFloat((amount || '0').toString().replace(/,/g, '')) || 0;
		const svc = (service_type || '').toLowerCase();
		const sourceType = (source_type || '').toString().trim().toUpperCase();

		if (!validServiceTypes.includes(svc) || !validTransactionIds.includes(parsedTransactionId) || !validSourceTypes.includes(sourceType)) {
			return res.status(400).json({ error: 'Invalid input' });
		}
		if (sourceType === 'GUEST' && !parsedAccountId) {
			return res.status(400).json({ error: 'Account is required for guest payment' });
		}

		const resolvedGameId = Number.isNaN(parsedGameId) ? null : parsedGameId;
		const resolvedAgentId = !Number.isNaN(parsedAgentId)
			? parsedAgentId
			: (sourceType === 'JUNKET' ? 0 : null);

		const encodedBy = req.session?.user_id || null;
		const now = new Date();

		const [insertResult] = await pool.execute(
			`INSERT INTO game_services (GAME_ID, SERVICE_TYPE, AMOUNT, REMARKS, TRANSACTION_ID, AGENT_ID, SOURCE_TYPE, ACTIVE, ENCODED_BY, ENCODED_DT)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
			[resolvedGameId || null, svc, amt, remarks || '', parsedTransactionId, resolvedAgentId, sourceType, encodedBy, now]
		);

		if (parsedTransactionId === 1 || parsedTransactionId === 2) {
			const cashTransactionQuery = `
				INSERT INTO cash_transaction (TRANSACTION_ID, AGENT_ID, AMOUNT, CATEGORY, TYPE, REMARKS, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`;
			const cashType = sourceType === 'GUEST' ? 1 : 2;

			await pool.execute(cashTransactionQuery, [
				insertResult.insertId,
				resolvedAgentId,
				amt.toString(),
				svc,
				cashType,
				remarks || '',
				encodedBy,
				now
			]);
		}

		if (parsedTransactionId === 2 && sourceType === 'GUEST' && parsedAccountId) {
			await pool.execute(
				`INSERT INTO account_ledger (ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT)
				 VALUES (?, 2, 2, 'SERVICES', ?, ?, ?)`,
				[parsedAccountId, amt, encodedBy, now]
			);
		}

		return res.json({ success: true });
	} catch (err) {
		console.error('Error adding F&B / Hotel service record:', err);
		return res.status(500).json({ error: 'Failed to save the record.' });
	}
});

module.exports = router;

