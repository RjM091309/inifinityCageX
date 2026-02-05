const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkSession, sessions } = require('./auth');
const multer = require('multer');
const { sendTelegramToEmployees } = require('../utils/telegram');
// I-setup ang multer para sa multiple file uploads (para sa receipts)
const receiptStorage = multer.diskStorage({
	destination: 'ReceiptUpload/',
	filename: (req, file, cb) => {
		const uniqueName = `${Date.now()}-${file.originalname}`; // Gumawa ng unique filename
		cb(null, uniqueName);
	}
});

const uploadReceiptImg = multer({
	storage: receiptStorage,
	limits: {
		fileSize: 5 * 1024 * 1024 // Limit file size sa 5MB
	},
	fileFilter(req, file, cb) {
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
		if (!allowedTypes.includes(file.mimetype)) {
			return cb(new Error('File type not allowed'));
		}
		cb(null, true);
	}
});

router.get("/house_expense", checkSession, function (req, res) {

	const permissions = req.session.permissions;

	res.render("junket/house_expense", {
		...sessions(req, 'house_expense'),
		permissions: permissions
	});
});


router.get("/expense_category", checkSession, function (req, res) {

	const permissions = req.session.permissions;

	res.render("popups/expense_category", {
		...sessions(req, 'expense_category'),
		permissions: permissions
	});

});

// GET EXPENSE CATEGORY
router.get('/expense_category_data', async (req, res) => {
	try {
		const [result] = await pool.execute('SELECT * FROM expense_category WHERE ACTIVE = 1 ORDER BY CATEGORY ASC');
		res.json(result);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});


// ADD EXPENSE CATEGORY
router.post('/add_expense_category', async (req, res) => {
	const { txtCategory, txtType } = req.body;
	const date_now = new Date();

	const categoryType = parseInt(txtType, 10);
	const normalizedType = categoryType === 2 ? 2 : 1;
	const query = `INSERT INTO expense_category(CATEGORY, TYPE, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?)`;

	try {
		await pool.execute(query, [txtCategory, normalizedType, req.session.user_id, date_now]);
		res.redirect('/expense_category');
	} catch (err) {
		console.error('Error inserting Expense Category:', err);
		res.status(500).send('Error inserting Expense Category');
	}
});

// EDIT EXPENSE CATEGORY
router.put('/expense_category/:id', async (req, res) => {
	const id = parseInt(req.params.id);
	const { txtCategory, txtType } = req.body;
	const date_now = new Date();

	const categoryType = parseInt(txtType, 10);
	const normalizedType = categoryType === 2 ? 2 : 1;

	const query = `UPDATE expense_category SET CATEGORY = ?, TYPE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;

	try {
		await pool.execute(query, [txtCategory, normalizedType, req.session.user_id, date_now, id]);
		res.send('Expense category updated successfully');
	} catch (err) {
		console.error('Error updating Expense category:', err);
		res.status(500).send('Error updating Expense category');
	}
});

// DELETE EXPENSE CATEGORY
router.put('/expense_category/remove/:id', async (req, res) => {
	const id = parseInt(req.params.id);
	const date_now = new Date();

	const query = `UPDATE expense_category SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;

	try {
		await pool.execute(query, [0, req.session.user_id, date_now, id]);
		res.send('Expense category updated successfully');
	} catch (err) {
		console.error('Error deleting Expense category:', err);
		res.status(500).send('Error deleting Expense category');
	}
});
// ADD JUNKET EXPENSE
router.post('/add_junket_house_expense', uploadReceiptImg.single('photo'), async (req, res) => {
	try {
		const {
			txtCategory,
			txtReceiptNo,
			txtDateandTime,
			txtDescription,
			txtAmount
		} = req.body;

		const date_now = new Date();
		const category = txtCategory || null;
		const receiptNo = txtReceiptNo || null;
		const dateTime = txtDateandTime || null;
		const description = txtDescription || null;
		const amount = txtAmount ? parseFloat(txtAmount.replace(/,/g, '')) : 0;
		const encodedBy = req.session?.user_id || null;
		const receiptFileName = req.file ? req.file.filename : null;

		const query = `
			INSERT INTO junket_house_expense 
			(CATEGORY_ID, RECEIPT_NO, DATE_TIME, DESCRIPTION, AMOUNT, PHOTO, ENCODED_BY, ENCODED_DT)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`;

		const [insertResult] = await pool.execute(query, [
			category,
			receiptNo,
			dateTime,
			description,
			amount,
			receiptFileName,
			encodedBy,
			date_now
		]);

		const [categoryRows] = await pool.execute('SELECT CATEGORY FROM expense_category WHERE IDNo = ? LIMIT 1', [
			category
		]);
		const expenseCategoryName = (categoryRows[0] && categoryRows[0].CATEGORY) ? categoryRows[0].CATEGORY : '-';

		const cashTransactionQuery = `
			INSERT INTO cash_transaction (TRANSACTION_ID, AGENT_ID, AMOUNT, CATEGORY, TYPE, REMARKS, ENCODED_BY, ENCODED_DT)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`;

		await pool.execute(cashTransactionQuery, [
			insertResult.insertId,
			null,
			amount.toString(),
			'Expenses',
			2,
			expenseCategoryName,
			encodedBy,
			date_now
		]);

		// Get encoded by user name
		const [userRows] = await pool.execute('SELECT FIRSTNAME FROM user_info WHERE IDNo = ? LIMIT 1', [encodedBy]);
		const encodedByName = userRows.length > 0 
			? (userRows[0].FIRSTNAME || 'Unknown')
			: 'Unknown';

		// Format date and time
		const dateFormatted = date_now.toLocaleDateString('en-US', { 
			year: 'numeric', 
			month: '2-digit', 
			day: '2-digit' 
		});
		const timeFormatted = date_now.toLocaleTimeString('en-US', { 
			hour: '2-digit', 
			minute: '2-digit' 
		});

		// Create Telegram message
		const telegramMessage = `Infinity Cage\n\n* Junket Expense *\n\n` +
			`Category: ${expenseCategoryName}\n` +
			`Receipt No: ${receiptNo || 'N/A'}\n` +
			`Description: ${description || 'N/A'}\n` +
			`Amount: ₱${amount.toLocaleString()}\n\n` +
			`Encoded By: ${encodedByName}\n` +
			`Date: ${dateFormatted}\n` +
			`Time: ${timeFormatted}`;

		// Send Telegram notification to EMPLOYEE_CHATID
		try {
			await sendTelegramToEmployees(telegramMessage);
		} catch (telegramError) {
			console.error('Error sending Telegram notification:', telegramError);
			// Don't fail the request if Telegram fails
		}

		res.redirect('/house_expense');
	} catch (err) {
		console.error('Error inserting junket:', err);
		res.status(500).send('Error inserting junket');
	}
});


// GET JUNKET EXPENSE
router.get('/junket_house_expense_data', async (req, res) => {
	try {
		let { fromDate, toDate } = req.query;

		if (!fromDate || !toDate) {
			const currentDate = new Date();
			const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
			fromDate = firstDayOfMonth.toISOString().slice(0, 10);
			toDate = currentDate.toISOString().slice(0, 10);
		}

		const isValidDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);
		if (!isValidDate(fromDate) || !isValidDate(toDate)) {
			return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
		}

		const query = `
			SELECT 
				e.IDNo,
				e.CATEGORY_ID,
				e.RECEIPT_NO COLLATE utf8mb4_unicode_ci AS RECEIPT_NO,
				e.DATE_TIME,
				e.DESCRIPTION COLLATE utf8mb4_unicode_ci AS DESCRIPTION,
				e.AMOUNT,
				e.PHOTO COLLATE utf8mb4_unicode_ci AS PHOTO,
				e.ENCODED_BY,
				e.ENCODED_DT,
				e.EDITED_BY,
				e.EDITED_DT,
				e.ACTIVE,
				e.RESET,
				e.IDNo AS expense_id,
				ec.IDNo AS expense_category_id,
				ec.CATEGORY COLLATE utf8mb4_unicode_ci AS expense_category,
				ec.TYPE AS expense_type,
				u.FIRSTNAME COLLATE utf8mb4_unicode_ci AS FIRSTNAME,
				'expense' COLLATE utf8mb4_unicode_ci AS record_type
			FROM junket_house_expense e
			JOIN expense_category ec ON ec.IDNo = e.CATEGORY_ID
			JOIN user_info u ON u.IDNo = e.ENCODED_BY
			WHERE e.ACTIVE = 1
				AND DATE(e.ENCODED_DT) BETWEEN ? AND ?
			
			UNION ALL
			
			SELECT 
				rm.IDNo,
				NULL AS CATEGORY_ID,
				CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci AS RECEIPT_NO,
				NULL AS DATE_TIME,
				rm.DESCRIPTION COLLATE utf8mb4_unicode_ci AS DESCRIPTION,
				rm.AMOUNT,
				CAST(NULL AS CHAR) COLLATE utf8mb4_unicode_ci AS PHOTO,
				rm.ENCODED_BY,
				rm.ENCODED_DT,
				rm.EDITED_BY,
				rm.EDITED_DT,
				rm.ACTIVE,
				NULL AS RESET,
				rm.IDNo AS expense_id,
				NULL AS expense_category_id,
				'Return Money' COLLATE utf8mb4_unicode_ci AS expense_category,
				0 AS expense_type,
				COALESCE(u2.FIRSTNAME, CONCAT('User ID: ', rm.ENCODED_BY)) COLLATE utf8mb4_unicode_ci AS FIRSTNAME,
				'return_money' COLLATE utf8mb4_unicode_ci AS record_type
			FROM junket_return_money rm
			LEFT JOIN user_info u2 ON u2.IDNo = rm.ENCODED_BY AND u2.ACTIVE = 1
			WHERE rm.ACTIVE = 1
				AND DATE(rm.ENCODED_DT) BETWEEN ? AND ?
			
			ORDER BY ENCODED_DT DESC
		`;

		const [result] = await pool.execute(query, [fromDate, toDate, fromDate, toDate]);

		const updatedResult = result.map(expense => ({
			...expense,
			photoUrl: expense.PHOTO ? '/ReceiptUpload/' + expense.PHOTO : null
		}));

		res.json(updatedResult);
	} catch (err) {
		console.error('Error executing query:', err);
		console.error('Query:', query);
		console.error('Parameters:', [fromDate, toDate, fromDate, toDate]);
		res.status(500).json({ error: 'Internal Server Error', details: err.message });
	}
});

// EDIT JUNKET EXPENSE
router.put('/junket_house_expense/:id', uploadReceiptImg.single('photo'), async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const {
			txtCategory,
			txtReceiptNo,
			txtDateandTime,
			txtDescription,
			txtAmount
		} = req.body;

		const date_now = new Date();
		const editXAmount = parseFloat(txtAmount.replace(/,/g, ''));

		let query = `
			UPDATE junket_house_expense 
			SET CATEGORY_ID = ?, RECEIPT_NO = ?, DATE_TIME = ?, DESCRIPTION = ?, AMOUNT = ?, EDITED_BY = ?, ENCODED_DT = ?
		`;
		const params = [txtCategory, txtReceiptNo, txtDateandTime, txtDescription, editXAmount, req.session.user_id, date_now];

		if (req.file) {
			query += `, PHOTO = ?`;
			params.push(req.file.filename);
		}

		query += ` WHERE IDNo = ?`;
		params.push(id);

		await pool.execute(query, params);
		const [categoryRows] = await pool.execute('SELECT CATEGORY FROM expense_category WHERE IDNo = ? LIMIT 1', [
			txtCategory
		]);
		const expenseCategoryName = (categoryRows[0] && categoryRows[0].CATEGORY) ? categoryRows[0].CATEGORY : '-';

		const cashTransactionUpdateQuery = `
			UPDATE cash_transaction
			SET AMOUNT = ?, CATEGORY = ?, REMARKS = ?, ENCODED_BY = ?, ENCODED_DT = ?
			WHERE TRANSACTION_ID = ? AND CATEGORY = 'Expenses'
		`;
		await pool.execute(cashTransactionUpdateQuery, [editXAmount.toString(), 'Expenses', expenseCategoryName, req.session.user_id, date_now, id]);

		res.send('Junket updated successfully');
	} catch (err) {
		console.error('Error updating Junket:', err);
		res.status(500).send('Error updating Junket');
	}
});

// DELETE JUNKET EXPENSE
router.put('/junket_house_expense/remove/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const date_now = new Date();

		const query = `
			UPDATE junket_house_expense 
			SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? 
			WHERE IDNo = ?
		`;

		await pool.execute(query, [0, req.session.user_id, date_now, id]);
		await pool.execute('DELETE FROM cash_transaction WHERE TRANSACTION_ID = ? AND CATEGORY = ?', [id, 'Expenses']);
		res.send('Junket updated successfully');
	} catch (err) {
		console.error('Error updating Junket:', err);
		res.status(500).send('Error updating Junket');
	}
});

// ADD RETURN MONEY
router.post('/add_return_money', async (req, res) => {
	try {
		const {
			txtDescription,
			txtAmount
		} = req.body;

		const date_now = new Date();
		const description = txtDescription || null;
		// Remove commas and parse to float
		const amountStr = txtAmount ? String(txtAmount).replace(/,/g, '').trim() : '0';
		const amount = parseFloat(amountStr) || 0;
		const encodedBy = req.session?.user_id || null;

		const query = `
			INSERT INTO junket_return_money
			(DESCRIPTION, AMOUNT, ENCODED_BY, ENCODED_DT)
			VALUES (?, ?, ?, ?)
		`;

		const [insertResult] = await pool.execute(query, [
			description,
			amount,
			encodedBy,
			date_now
		]);

		res.json({ success: true, message: 'Return money added successfully' });
	} catch (err) {
		console.error('Error inserting return money:', err);
		res.status(500).json({ error: 'Error inserting return money' });
	}
});

// EDIT RETURN MONEY
router.put('/edit_return_money/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const {
			txtDescription,
			txtAmount
		} = req.body;

		const date_now = new Date();
		const description = txtDescription || null;
		const amount = txtAmount ? parseFloat(txtAmount.replace(/,/g, '')) : 0;

		const query = `
			UPDATE junket_return_money 
			SET DESCRIPTION = ?, AMOUNT = ?, EDITED_BY = ?, EDITED_DT = ?
			WHERE IDNo = ?
		`;

		await pool.execute(query, [
			description,
			amount,
			req.session.user_id,
			date_now,
			id
		]);

		res.json({ success: true, message: 'Return money updated successfully' });
	} catch (err) {
		console.error('Error updating return money:', err);
		res.status(500).json({ error: 'Error updating return money' });
	}
});

// DELETE RETURN MONEY
router.put('/remove_return_money/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const date_now = new Date();

		const query = `
			UPDATE junket_return_money 
			SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? 
			WHERE IDNo = ?
		`;

		await pool.execute(query, [0, req.session.user_id, date_now, id]);
		res.json({ success: true, message: 'Return money deleted successfully' });
	} catch (err) {
		console.error('Error deleting return money:', err);
		res.status(500).json({ error: 'Error deleting return money' });
	}
});

// Export the router
module.exports = router; 