const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkSession, sessions } = require('./auth');
const multer = require('multer');
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

		await pool.execute(query, [
			category,
			receiptNo,
			dateTime,
			description,
			amount,
			receiptFileName,
			encodedBy,
			date_now
		]);

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
				junket_house_expense.*, 
				junket_house_expense.IDNo AS expense_id, 
				expense_category.IDNo AS expense_category_id, 
				expense_category.CATEGORY AS expense_category,
				expense_category.TYPE AS expense_type,
				user_info.FIRSTNAME AS FIRSTNAME
			FROM junket_house_expense
			JOIN expense_category ON expense_category.IDNo = junket_house_expense.CATEGORY_ID
			JOIN user_info ON user_info.IDNo = junket_house_expense.ENCODED_BY
			WHERE junket_house_expense.ACTIVE = 1
				AND DATE(junket_house_expense.ENCODED_DT) BETWEEN ? AND ?
			ORDER BY junket_house_expense.IDNo DESC
		`;

		const [result] = await pool.execute(query, [fromDate, toDate]);

		const updatedResult = result.map(expense => ({
			...expense,
			photoUrl: expense.PHOTO ? '/ReceiptUpload/' + expense.PHOTO : null
		}));

		res.json(updatedResult);
	} catch (err) {
		console.error('Error executing query:', err);
		res.status(500).send('Internal Server Error');
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
		res.send('Junket updated successfully');
	} catch (err) {
		console.error('Error updating Junket:', err);
		res.status(500).send('Error updating Junket');
	}
});



// Export the router
module.exports = router; 