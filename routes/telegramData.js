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