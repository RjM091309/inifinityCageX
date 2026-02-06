const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkSession, sessions } = require('./auth');


//=============== TELEGRAM API =============
router.get("/telegramAPI", checkSession, function (req, res) {

	const permissions = req.session.permissions;

	res.render("telegram/telegram", {
		...sessions(req, 'telegramAPI'),
		permissions: permissions
	});

});
//Get TELEGRAM API
router.get('/telegramAPI_data', async (req, res) => {
	try {
		const [results] = await pool.execute('SELECT * FROM telegram_api WHERE ACTIVE = 1');
		res.json(results);
	} catch (error) {
		console.error('Error fetching Telegram API data:', error);
		res.status(500).send('Error fetching Telegram API data');
	}
});

// Get Telegram bot details (bot profile + admin chat ID)
router.get('/telegramAPI/details', checkSession, async (req, res) => {
	try {
		const [rows] = await pool.execute('SELECT TELEGRAM_API, CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1');

		if (rows.length === 0) {
			return res.status(404).json({ message: 'No active Telegram bot configured' });
		}

		const { TELEGRAM_API: token, CHAT_ID: chatId } = rows[0];
		if (!token) {
			return res.status(400).json({ message: 'Telegram bot token is missing' });
		}

		try {
			const { default: fetch } = await import('node-fetch');
			const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
			const payload = await response.json();

			if (!payload.ok) {
				console.error('Telegram getMe failed:', payload);
				return res.status(502).json({ message: 'Failed to fetch bot details', details: payload });
			}

			return res.json({
				bot: payload.result,
				chatId: chatId || null
			});
		} catch (err) {
			console.error('Error fetching bot details:', err);
			return res.status(500).json({ message: 'Error fetching bot details' });
		}
	} catch (error) {
		console.error('Error retrieving Telegram bot settings:', error);
		return res.status(500).json({ message: 'Error retrieving Telegram bot settings' });
	}
});

// Get chat information from Telegram API
router.get('/telegramAPI/chat-info/:chatId', checkSession, async (req, res) => {
	try {
		const chatId = req.params.chatId;
		if (!chatId) {
			return res.status(400).json({ message: 'Chat ID is required' });
		}

		const [rows] = await pool.execute('SELECT TELEGRAM_API FROM telegram_api WHERE ACTIVE = 1 LIMIT 1');

		if (rows.length === 0 || !rows[0].TELEGRAM_API) {
			return res.status(404).json({ message: 'No active Telegram bot configured' });
		}

		const token = rows[0].TELEGRAM_API;

		try {
			const { default: fetch } = await import('node-fetch');
			const response = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${chatId}`);
			const payload = await response.json();

			if (!payload.ok) {
				console.error('Telegram getChat failed:', payload);
				return res.status(502).json({ message: 'Failed to fetch chat details', details: payload });
			}

			return res.json({
				chat: payload.result
			});
		} catch (err) {
			console.error('Error fetching chat details:', err);
			return res.status(500).json({ message: 'Error fetching chat details' });
		}
	} catch (error) {
		console.error('Error retrieving Telegram bot settings:', error);
		return res.status(500).json({ message: 'Error retrieving Telegram bot settings' });
	}
});

// --------------- Chat IDs (groups/channels) — must be before /telegramAPI/:id ---------------
function parseChatIds(raw) {
	if (raw == null || typeof raw !== 'string') return [];
	const trimmed = String(raw).trim();
	if (!trimmed) return [];
	return trimmed.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
}

router.get('/telegramAPI/chat-ids', checkSession, async (req, res) => {
	try {
		const [rows] = await pool.execute('SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1');
		const chatIds = rows.length && rows[0].CHAT_ID != null ? parseChatIds(rows[0].CHAT_ID) : [];
		res.json({ chatIds });
	} catch (err) {
		console.error('Error fetching chat IDs:', err);
		res.status(500).json({ error: 'Error fetching chat IDs' });
	}
});

router.put('/telegramAPI/chat-ids', checkSession, async (req, res) => {
	try {
		let chatIds = req.body.chatIds;
		if (!Array.isArray(chatIds)) chatIds = [];
		const value = chatIds.map(s => String(s).trim()).filter(Boolean).join(',');
		await pool.execute(
			'UPDATE telegram_api SET CHAT_ID = ?, EDITED_BY = ?, EDITED_DT = ? WHERE ACTIVE = 1',
			[value || null, req.session.user_id, new Date()]
		);
		res.json({ success: true, chatIds: value ? value.split(',') : [] });
	} catch (err) {
		console.error('Error updating chat IDs:', err);
		res.status(500).json({ error: 'Error updating chat IDs' });
	}
});

// --------------- Employee Chat IDs ---------------
router.get('/telegramAPI/employee-chat-ids', checkSession, async (req, res) => {
	try {
		const [rows] = await pool.execute('SELECT EMPLOYEE_CHATID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1');
		const chatIds = rows.length && rows[0].EMPLOYEE_CHATID != null ? parseChatIds(rows[0].EMPLOYEE_CHATID) : [];
		res.json({ chatIds });
	} catch (err) {
		console.error('Error fetching employee chat IDs:', err);
		res.status(500).json({ error: 'Error fetching employee chat IDs' });
	}
});

router.put('/telegramAPI/employee-chat-ids', checkSession, async (req, res) => {
	try {
		let chatIds = req.body.chatIds;
		if (!Array.isArray(chatIds)) chatIds = [];
		const value = chatIds.map(s => String(s).trim()).filter(Boolean).join(',');
		await pool.execute(
			'UPDATE telegram_api SET EMPLOYEE_CHATID = ?, EDITED_BY = ?, EDITED_DT = ? WHERE ACTIVE = 1',
			[value || null, req.session.user_id, new Date()]
		);
		res.json({ success: true, chatIds: value ? value.split(',') : [] });
	} catch (err) {
		console.error('Error updating employee chat IDs:', err);
		res.status(500).json({ error: 'Error updating employee chat IDs' });
	}
});

// --------------- Management Chat IDs ---------------
router.get('/telegramAPI/management-chat-ids', checkSession, async (req, res) => {
	try {
		const [rows] = await pool.execute('SELECT MANAGEMENT_CHATID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1');
		const chatIds = rows.length && rows[0].MANAGEMENT_CHATID != null ? parseChatIds(rows[0].MANAGEMENT_CHATID) : [];
		res.json({ chatIds });
	} catch (err) {
		console.error('Error fetching management chat IDs:', err);
		res.status(500).json({ error: 'Error fetching management chat IDs' });
	}
});

router.put('/telegramAPI/management-chat-ids', checkSession, async (req, res) => {
	try {
		let chatIds = req.body.chatIds;
		if (!Array.isArray(chatIds)) chatIds = [];
		const value = chatIds.map(s => String(s).trim()).filter(Boolean).join(',');
		await pool.execute(
			'UPDATE telegram_api SET MANAGEMENT_CHATID = ?, EDITED_BY = ?, EDITED_DT = ? WHERE ACTIVE = 1',
			[value || null, req.session.user_id, new Date()]
		);
		res.json({ success: true, chatIds: value ? value.split(',') : [] });
	} catch (err) {
		console.error('Error updating management chat IDs:', err);
		res.status(500).json({ error: 'Error updating management chat IDs' });
	}
});

// EDIT TELEGRAM API
router.put('/telegramAPI/:id', async (req, res) => {
	const id = parseInt(req.params.id);
	const { txtTelegramAPI } = req.body;
	const date_now = new Date();

	const query = `
		UPDATE telegram_api 
		SET TELEGRAM_API = ?, EDITED_BY = ?, EDITED_DT = ? 
		WHERE IDNo = ?
	`;

	try {
		await pool.execute(query, [txtTelegramAPI, req.session.user_id, date_now, id]);
		res.send('Telegram API updated successfully');
	} catch (err) {
		console.error('Error updating Telegram API:', err);
		res.status(500).send('Error updating Telegram API');
	}
});

module.exports = router; 