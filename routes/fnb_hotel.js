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
					gs.AGENT_ID,
					user_info.FIRSTNAME AS encoded_by_name,
					gs.ENCODED_DT,
					game_list.SETTLED AS game_settled
				FROM game_services gs
				LEFT JOIN agent ON agent.IDNo = gs.AGENT_ID
				LEFT JOIN user_info ON user_info.IDNo = gs.ENCODED_BY
				LEFT JOIN game_list ON game_list.IDNo = gs.GAME_ID
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

	// JSON endpoint for reloading F&B / Hotel table data (used by DataTables)
	router.get('/fnb-hotel/data', checkSession, async (req, res) => {
		try {
			const [rows] = await pool.query(`
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
					gs.AGENT_ID,
					user_info.FIRSTNAME AS encoded_by_name,
					gs.ENCODED_DT,
					game_list.SETTLED AS game_settled
				FROM game_services gs
				LEFT JOIN agent ON agent.IDNo = gs.AGENT_ID
				LEFT JOIN user_info ON user_info.IDNo = gs.ENCODED_BY
				LEFT JOIN game_list ON game_list.IDNo = gs.GAME_ID
				WHERE gs.ACTIVE = 1
				ORDER BY gs.ENCODED_DT DESC
			`);

			res.json(rows);
		} catch (err) {
			console.error('Error loading F&B / Hotel data (JSON):', err);
			res.status(500).json({ error: 'Failed to load F&B / Hotel data.' });
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

// Update service (only for services without game_id)
router.put('/fnb-hotel/service/:id', checkSession, async (req, res) => {
	try {
		const serviceId = parseInt(req.params.id, 10);
		const {
			account_id,
			agent_id,
			service_type,
			amount,
			remarks,
			transaction_id,
			source_type
		} = req.body;

		if (Number.isNaN(serviceId)) {
			return res.status(400).json({ error: 'Invalid service ID' });
		}

		// Check if service exists and has no game_id
		const [[existingService]] = await pool.execute(
			`SELECT GAME_ID, TRANSACTION_ID, AMOUNT, AGENT_ID, SOURCE_TYPE FROM game_services WHERE IDNo = ? AND ACTIVE = 1`,
			[serviceId]
		);

		if (!existingService) {
			return res.status(404).json({ error: 'Service not found' });
		}

		if (existingService.GAME_ID) {
			return res.status(400).json({ error: 'Cannot edit service with game ID. Please edit from gamebook.' });
		}

		// Get existing account_id if it was a GUEST payment
		let existingAccountId = null;
		if (existingService.SOURCE_TYPE === 'GUEST' && existingService.AGENT_ID) {
			const [accountRows] = await pool.execute(
				`SELECT IDNo FROM account WHERE AGENT_ID = ? AND ACTIVE = 1 LIMIT 1`,
				[existingService.AGENT_ID]
			);
			if (accountRows.length > 0) {
				existingAccountId = accountRows[0].IDNo;
			}
		}

		const parsedAccountId = parseInt(account_id, 10);
		const parsedAgentId = parseInt(agent_id, 10);
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

		const resolvedAgentId = !Number.isNaN(parsedAgentId)
			? parsedAgentId
			: (sourceType === 'JUNKET' ? 0 : null);

		const updatedBy = req.session?.user_id || null;
		const now = new Date();

		// Delete old cash_transaction if exists
		if (existingService.TRANSACTION_ID === 1 || existingService.TRANSACTION_ID === 2) {
			await pool.execute(
				`DELETE FROM cash_transaction WHERE TRANSACTION_ID = ? LIMIT 1`,
				[serviceId]
			);
		}

		// Delete old account_ledger entry if was deposit (use existing account_id if available, otherwise use new one)
		const accountIdToDelete = existingAccountId || parsedAccountId;
		if (existingService.TRANSACTION_ID === 2 && accountIdToDelete) {
			await pool.execute(
				`DELETE FROM account_ledger 
				 WHERE ACCOUNT_ID = ? AND TRANSACTION_ID = 2 AND TRANSACTION_TYPE = 2 AND TRANSACTION_DESC = 'SERVICES' AND AMOUNT = ?
				 ORDER BY IDNo DESC LIMIT 1`,
				[accountIdToDelete, existingService.AMOUNT]
			);
		}

		// Update service
		await pool.execute(
			`UPDATE game_services 
			 SET SERVICE_TYPE = ?, AMOUNT = ?, REMARKS = ?, TRANSACTION_ID = ?, AGENT_ID = ?, SOURCE_TYPE = ?, UPDATED_BY = ?, UPDATED_DT = ?
			 WHERE IDNo = ?`,
			[svc, amt, remarks || '', parsedTransactionId, resolvedAgentId, sourceType, updatedBy, now, serviceId]
		);

		// Create new cash_transaction if needed
		if (parsedTransactionId === 1 || parsedTransactionId === 2) {
			const cashTransactionQuery = `
				INSERT INTO cash_transaction (TRANSACTION_ID, AGENT_ID, AMOUNT, CATEGORY, TYPE, REMARKS, ENCODED_BY, ENCODED_DT)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`;
			const cashType = sourceType === 'GUEST' ? 1 : 2;

			await pool.execute(cashTransactionQuery, [
				serviceId,
				resolvedAgentId,
				amt.toString(),
				svc,
				cashType,
				remarks || '',
				updatedBy,
				now
			]);
		}

		// Create new account_ledger entry if deposit
		if (parsedTransactionId === 2 && sourceType === 'GUEST' && parsedAccountId) {
			await pool.execute(
				`INSERT INTO account_ledger (ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DESC, AMOUNT, ENCODED_BY, ENCODED_DT)
				 VALUES (?, 2, 2, 'SERVICES', ?, ?, ?)`,
				[parsedAccountId, amt, updatedBy, now]
			);
		}

		return res.json({ success: true });
	} catch (err) {
		console.error('Error updating F&B / Hotel service record:', err);
		return res.status(500).json({ error: 'Failed to update the record.' });
	}
});

// Delete service (only for services without game_id) - Soft delete only
router.delete('/fnb-hotel/service/:id', checkSession, async (req, res) => {
	try {
		const serviceId = parseInt(req.params.id, 10);

		if (Number.isNaN(serviceId)) {
			return res.status(400).json({ error: 'Invalid service ID' });
		}

		// Check if service exists and has no game_id (get fields needed for account_ledger cleanup)
		const [[existingService]] = await pool.execute(
			`SELECT GAME_ID, TRANSACTION_ID, AMOUNT, AGENT_ID, SOURCE_TYPE FROM game_services WHERE IDNo = ? AND ACTIVE = 1`,
			[serviceId]
		);

		if (!existingService) {
			return res.status(404).json({ error: 'Service not found' });
		}

		if (existingService.GAME_ID) {
			return res.status(400).json({ error: 'Cannot delete service with game ID. Please delete from gamebook.' });
		}

		const updatedBy = req.session?.user_id || null;
		const now = new Date();

		// Soft delete service - just set ACTIVE = 0
		await pool.execute(
			`UPDATE game_services SET ACTIVE = 0, UPDATED_BY = ?, UPDATED_DT = ? WHERE IDNo = ?`,
			[updatedBy, now, serviceId]
		);

		// Remove matching account_ledger entry when this was GUEST + deposit (transaction_id 2)
		const transId = parseInt(existingService.TRANSACTION_ID, 10);
		if (transId === 2 && (existingService.SOURCE_TYPE || '').toUpperCase() === 'GUEST' && existingService.AGENT_ID) {
			const [accountRows] = await pool.execute(
				`SELECT IDNo FROM account WHERE AGENT_ID = ? AND ACTIVE = 1 LIMIT 1`,
				[existingService.AGENT_ID]
			);
			const accountId = (Array.isArray(accountRows) && accountRows.length > 0) ? accountRows[0].IDNo : null;
			if (accountId) {
				await pool.execute(
					`DELETE FROM account_ledger
					 WHERE ACCOUNT_ID = ? AND TRANSACTION_ID = 2 AND TRANSACTION_TYPE = 2 AND TRANSACTION_DESC = 'SERVICES' AND AMOUNT = ?
					 ORDER BY IDNo DESC
					 LIMIT 1`,
					[accountId, existingService.AMOUNT]
				);
			}
		}

		// Remove cash_transaction rows linked to this service (transaction_id 1 or 2 create them)
		if (transId === 1 || transId === 2) {
			await pool.execute('DELETE FROM cash_transaction WHERE TRANSACTION_ID = ?', [serviceId]);
		}

		return res.json({ success: true });
	} catch (err) {
		console.error('Error deleting F&B / Hotel service record:', err);
		return res.status(500).json({ error: 'Failed to delete the record.' });
	}
});

module.exports = router;

