const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkSession, sessions } = require('./auth');

function parseId(v) {
	const n = parseInt(v, 10);
	return !Number.isNaN(n) && n > 0 ? n : null;
}

function parseAmount(v) {
	const clean = String(v || '').replace(/,/g, '');
	const n = Number(clean);
	return clean === '' || Number.isNaN(n) ? null : n;
}

function parseOptionalDate(v) {
	if (!v) return null;
	const s = String(v).slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseOptionalRate(v) {
	if (v === undefined || v === null || v === '') return null;
	const n = Number(String(v).replace(/,/g, ''));
	return Number.isNaN(n) ? null : n;
}

function num(v) {
	return Number(v) || 0;
}

function parseDateRange(req) {
	const dateFrom = parseOptionalDate(req.query.dateFrom);
	const dateTo = parseOptionalDate(req.query.dateTo);
	return {
		dateFrom,
		dateTo,
		active: !!(dateFrom && dateTo)
	};
}

function appendDateFilter(sql, column, range, params) {
	if (!range.active) return sql;
	params.push(range.dateFrom, range.dateTo);
	return sql + ` AND DATE(${column}) BETWEEN ? AND ?`;
}

function computeCashAfterFixedPurchases(capital, netIncome, fixedPurchases) {
	let remaining = Math.max(0, fixedPurchases);
	let cashFromNetIncome = netIncome;
	let cashFromCapital = capital;

	if (remaining > 0 && cashFromNetIncome > 0) {
		const deducted = Math.min(cashFromNetIncome, remaining);
		cashFromNetIncome -= deducted;
		remaining -= deducted;
	}
	if (remaining > 0 && cashFromCapital > 0) {
		const deducted = Math.min(cashFromCapital, remaining);
		cashFromCapital -= deducted;
		remaining -= deducted;
	}

	return { cashFromCapital, cashFromNetIncome };
}

async function getOrCreateIncomeStatement(userId) {
	const [rows] = await pool.execute(
		`SELECT IDNo, SALES, COST_OF_SALES, ENCODED_DT, EDITED_DT FROM income_statement WHERE ACTIVE = 1 ORDER BY IDNo DESC LIMIT 1`
	);
	if (rows.length) return rows[0];

	const now = new Date();
	const [result] = await pool.execute(
		`INSERT INTO income_statement (SALES, COST_OF_SALES, ENCODED_BY, ENCODED_DT) VALUES (0, 0, ?, ?)`,
		[userId || null, now]
	);
	return { IDNo: result.insertId, SALES: 0, COST_OF_SALES: 0 };
}

async function getCapitalAmount(dateRange) {
	const params = [];
	let sql = `SELECT COALESCE(SUM(AMOUNT), 0) AS TOTAL FROM company_capital WHERE ACTIVE = 1`;
	sql = appendDateFilter(sql, 'ENCODED_DT', dateRange, params);
	const [rows] = await pool.execute(sql, params);
	return num(rows[0]?.TOTAL);
}

async function computeNetIncome(stmt, dateRange) {
	let sales = 0;
	let cogs = 0;

	if (!dateRange.active) {
		sales = num(stmt.SALES);
		cogs = num(stmt.COST_OF_SALES);
	} else {
		const [stmtRows] = await pool.execute(
			`SELECT SALES, COST_OF_SALES FROM income_statement
			 WHERE IDNo = ? AND ACTIVE = 1 AND DATE(COALESCE(EDITED_DT, ENCODED_DT)) BETWEEN ? AND ?`,
			[stmt.IDNo, dateRange.dateFrom, dateRange.dateTo]
		);
		if (stmtRows.length) {
			sales = num(stmtRows[0].SALES);
			cogs = num(stmtRows[0].COST_OF_SALES);
		}
	}

	const opexParams = [stmt.IDNo];
	let opexSql = `SELECT COALESCE(SUM(AMOUNT), 0) AS TOTAL FROM income_statement_opex WHERE INCOME_STATEMENT_ID = ? AND ACTIVE = 1`;
	opexSql = appendDateFilter(opexSql, 'ENCODED_DT', dateRange, opexParams);
	const [opexRows] = await pool.execute(opexSql, opexParams);
	const opexTotal = num(opexRows[0]?.TOTAL);
	return sales - cogs - opexTotal;
}

// ----- Page -----

router.get('/asset_management', checkSession, function (req, res) {
	const data = sessions(req, 'asset_management');
	data.permissions = req.session.permissions;
	res.render('asset_management/asset_management', data);
});

// ----- Assets -----

router.get('/company_asset_data', async (req, res) => {
	try {
		const range = parseDateRange(req);
		const params = [];
		let sql = `
			SELECT ca.*, CONCAT_WS(' ', ui.FIRSTNAME, ui.LASTNAME) AS ENCODED_BY_NAME
			FROM company_asset ca
			LEFT JOIN user_info ui ON ui.IDNo = ca.ENCODED_BY
			WHERE ca.ACTIVE = 1`;
		sql = appendDateFilter(sql, 'ca.ENCODED_DT', range, params);
		sql += ` ORDER BY ca.ASSET_TYPE ASC, ca.ENCODED_DT DESC`;
		const [rows] = await pool.execute(sql, params);
		res.json(rows);
	} catch (error) {
		console.error('Error fetching company assets:', error);
		res.status(500).json({ message: 'Failed to fetch assets' });
	}
});

router.post('/add_company_asset', async (req, res) => {
	try {
		const {
			txtAssetName, txtAssetType, txtCategory, txtSerialNo, txtPurchaseDate,
			txtPurchaseCost, txtCurrentValue, txtDepreciationRate, txtLocation,
			txtInCharge, txtStatus, txtRemarks
		} = req.body;

		const purchaseCost = parseAmount(txtPurchaseCost);
		const currentValue = parseAmount(txtCurrentValue);

		if (!txtAssetName || !txtAssetType || purchaseCost === null || currentValue === null) {
			return res.status(400).json({ message: 'Invalid payload' });
		}

		await pool.execute(`
			INSERT INTO company_asset (
				ASSET_NAME, ASSET_TYPE, CATEGORY, SERIAL_NO, PURCHASE_DATE,
				PURCHASE_COST, CURRENT_VALUE, DEPRECIATION_RATE, LOCATION,
				IN_CHARGE, STATUS, REMARKS, ENCODED_BY, ENCODED_DT
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, [
			String(txtAssetName).trim(),
			String(txtAssetType).trim(),
			txtCategory ? String(txtCategory).trim() : null,
			txtSerialNo ? String(txtSerialNo).trim() : null,
			parseOptionalDate(txtPurchaseDate),
			purchaseCost,
			currentValue,
			parseOptionalRate(txtDepreciationRate),
			txtLocation ? String(txtLocation).trim() : null,
			txtInCharge ? String(txtInCharge).trim() : null,
			txtStatus ? String(txtStatus).trim() : 'Active',
			txtRemarks ? String(txtRemarks).trim() : null,
			req.session.user_id,
			new Date()
		]);

		res.json({ message: 'Saved successfully' });
	} catch (error) {
		console.error('Error inserting company asset:', error);
		res.status(500).json({ message: 'Failed to save asset' });
	}
});

router.put('/company_asset/:id', async (req, res) => {
	try {
		const id = parseId(req.params.id);
		const {
			txtAssetName, txtAssetType, txtCategory, txtSerialNo, txtPurchaseDate,
			txtPurchaseCost, txtCurrentValue, txtDepreciationRate, txtLocation,
			txtInCharge, txtStatus, txtRemarks
		} = req.body;

		const purchaseCost = parseAmount(txtPurchaseCost);
		const currentValue = parseAmount(txtCurrentValue);

		if (!id || !txtAssetName || !txtAssetType || purchaseCost === null || currentValue === null) {
			return res.status(400).json({ message: 'Invalid payload' });
		}

		await pool.execute(`
			UPDATE company_asset SET
				ASSET_NAME = ?, ASSET_TYPE = ?, CATEGORY = ?, SERIAL_NO = ?, PURCHASE_DATE = ?,
				PURCHASE_COST = ?, CURRENT_VALUE = ?, DEPRECIATION_RATE = ?, LOCATION = ?,
				IN_CHARGE = ?, STATUS = ?, REMARKS = ?, EDITED_BY = ?, EDITED_DT = ?
			WHERE IDNo = ? AND ACTIVE = 1
		`, [
			String(txtAssetName).trim(),
			String(txtAssetType).trim(),
			txtCategory ? String(txtCategory).trim() : null,
			txtSerialNo ? String(txtSerialNo).trim() : null,
			parseOptionalDate(txtPurchaseDate),
			purchaseCost,
			currentValue,
			parseOptionalRate(txtDepreciationRate),
			txtLocation ? String(txtLocation).trim() : null,
			txtInCharge ? String(txtInCharge).trim() : null,
			txtStatus ? String(txtStatus).trim() : 'Active',
			txtRemarks ? String(txtRemarks).trim() : null,
			req.session.user_id,
			new Date(),
			id
		]);

		res.json({ message: 'Updated successfully' });
	} catch (error) {
		console.error('Error updating company asset:', error);
		res.status(500).json({ message: 'Failed to update asset' });
	}
});

router.put('/company_asset/remove/:id', async (req, res) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'Invalid ID' });

		await pool.execute(
			`UPDATE company_asset SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`,
			[req.session.user_id, new Date(), id]
		);

		res.json({ message: 'Archived successfully' });
	} catch (error) {
		console.error('Error archiving company asset:', error);
		res.status(500).json({ message: 'Failed to archive asset' });
	}
});

// ----- Liabilities (debts only) -----

router.get('/company_liability_data', async (req, res) => {
	try {
		const range = parseDateRange(req);
		const params = [];
		let sql = `
			SELECT cl.*, CONCAT_WS(' ', ui.FIRSTNAME, ui.LASTNAME) AS ENCODED_BY_NAME
			FROM company_liability cl
			LEFT JOIN user_info ui ON ui.IDNo = cl.ENCODED_BY
			WHERE cl.ACTIVE = 1`;
		sql = appendDateFilter(sql, 'cl.ENCODED_DT', range, params);
		sql += ` ORDER BY cl.ENCODED_DT DESC`;
		const [rows] = await pool.execute(sql, params);
		res.json(rows);
	} catch (error) {
		console.error('Error fetching company liabilities:', error);
		res.status(500).json({ message: 'Failed to fetch liabilities' });
	}
});

router.post('/add_company_liability', async (req, res) => {
	try {
		const {
			txtDescription, txtCreditor, txtLiabilityType, txtCategory,
			txtAmount, txtAmountPaid, txtInterestRate,
			txtRemarks
		} = req.body;

		const amount = parseAmount(txtAmount);
		const amountPaid = parseAmount(txtAmountPaid) ?? 0;

		if (!txtDescription || !txtLiabilityType || amount === null) {
			return res.status(400).json({ message: 'Invalid payload' });
		}

		await pool.execute(`
			INSERT INTO company_liability (
				DESCRIPTION, CREDITOR, LIABILITY_TYPE, CATEGORY,
				AMOUNT, AMOUNT_PAID, DUE_DATE, INTEREST_RATE,
				STATUS, REMARKS, ENCODED_BY, ENCODED_DT
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, [
			String(txtDescription).trim(),
			txtCreditor ? String(txtCreditor).trim() : null,
			String(txtLiabilityType).trim(),
			txtCategory ? String(txtCategory).trim() : null,
			amount,
			amountPaid,
			null,
			parseOptionalRate(txtInterestRate),
			'Outstanding',
			txtRemarks ? String(txtRemarks).trim() : null,
			req.session.user_id,
			new Date()
		]);

		res.json({ message: 'Saved successfully' });
	} catch (error) {
		console.error('Error inserting company liability:', error);
		res.status(500).json({ message: 'Failed to save liability' });
	}
});

router.put('/company_liability/:id', async (req, res) => {
	try {
		const id = parseId(req.params.id);
		const {
			txtDescription, txtCreditor, txtLiabilityType, txtCategory,
			txtAmount, txtAmountPaid, txtInterestRate,
			txtRemarks
		} = req.body;

		const amount = parseAmount(txtAmount);
		const amountPaid = parseAmount(txtAmountPaid) ?? 0;

		if (!id || !txtDescription || !txtLiabilityType || amount === null) {
			return res.status(400).json({ message: 'Invalid payload' });
		}

		await pool.execute(`
			UPDATE company_liability SET
				DESCRIPTION = ?, CREDITOR = ?, LIABILITY_TYPE = ?, CATEGORY = ?,
				AMOUNT = ?, AMOUNT_PAID = ?, INTEREST_RATE = ?,
				REMARKS = ?, EDITED_BY = ?, EDITED_DT = ?
			WHERE IDNo = ? AND ACTIVE = 1
		`, [
			String(txtDescription).trim(),
			txtCreditor ? String(txtCreditor).trim() : null,
			String(txtLiabilityType).trim(),
			txtCategory ? String(txtCategory).trim() : null,
			amount,
			amountPaid,
			parseOptionalRate(txtInterestRate),
			txtRemarks ? String(txtRemarks).trim() : null,
			req.session.user_id,
			new Date(),
			id
		]);

		res.json({ message: 'Updated successfully' });
	} catch (error) {
		console.error('Error updating company liability:', error);
		res.status(500).json({ message: 'Failed to update liability' });
	}
});

router.put('/company_liability/remove/:id', async (req, res) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'Invalid ID' });

		await pool.execute(
			`UPDATE company_liability SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`,
			[req.session.user_id, new Date(), id]
		);

		res.json({ message: 'Archived successfully' });
	} catch (error) {
		console.error('Error archiving company liability:', error);
		res.status(500).json({ message: 'Failed to archive liability' });
	}
});

// ----- Capital -----

router.get('/company_capital_data', async (req, res) => {
	try {
		const range = parseDateRange(req);
		const params = [];
		let sql = `
			SELECT cc.*, CONCAT_WS(' ', ui.FIRSTNAME, ui.LASTNAME) AS ENCODED_BY_NAME
			FROM company_capital cc
			LEFT JOIN user_info ui ON ui.IDNo = cc.ENCODED_BY
			WHERE cc.ACTIVE = 1`;
		sql = appendDateFilter(sql, 'cc.ENCODED_DT', range, params);
		sql += ` ORDER BY cc.ENCODED_DT DESC`;
		const [rows] = await pool.execute(sql, params);
		res.json(rows);
	} catch (error) {
		console.error('Error fetching capital:', error);
		res.status(500).json({ message: 'Failed to fetch capital' });
	}
});

router.post('/add_company_capital', async (req, res) => {
	try {
		const description = String(req.body.txtDescription || '').trim();
		const amount = parseAmount(req.body.txtAmount);
		if (!description || amount === null) {
			return res.status(400).json({ message: 'Invalid payload' });
		}

		await pool.execute(
			`INSERT INTO company_capital (DESCRIPTION, AMOUNT, REMARKS, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?)`,
			[
				description,
				amount,
				req.body.txtRemarks ? String(req.body.txtRemarks).trim() : null,
				req.session.user_id,
				new Date()
			]
		);

		res.json({ message: 'Capital saved successfully' });
	} catch (error) {
		console.error('Error saving capital:', error);
		res.status(500).json({ message: 'Failed to save capital' });
	}
});

router.put('/company_capital/:id', async (req, res) => {
	try {
		const id = parseId(req.params.id);
		const description = String(req.body.txtDescription || '').trim();
		const amount = parseAmount(req.body.txtAmount);
		if (!id || !description || amount === null) {
			return res.status(400).json({ message: 'Invalid payload' });
		}

		await pool.execute(
			`UPDATE company_capital SET DESCRIPTION = ?, AMOUNT = ?, REMARKS = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ? AND ACTIVE = 1`,
			[
				description,
				amount,
				req.body.txtRemarks ? String(req.body.txtRemarks).trim() : null,
				req.session.user_id,
				new Date(),
				id
			]
		);

		res.json({ message: 'Capital updated successfully' });
	} catch (error) {
		console.error('Error updating capital:', error);
		res.status(500).json({ message: 'Failed to update capital' });
	}
});

router.put('/company_capital/remove/:id', async (req, res) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'Invalid ID' });

		await pool.execute(
			`UPDATE company_capital SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`,
			[req.session.user_id, new Date(), id]
		);

		res.json({ message: 'Capital archived successfully' });
	} catch (error) {
		console.error('Error archiving capital:', error);
		res.status(500).json({ message: 'Failed to archive capital' });
	}
});

// ----- Income Statement -----

router.get('/income_statement_data', async (req, res) => {
	try {
		const range = parseDateRange(req);
		const stmt = await getOrCreateIncomeStatement(req.session?.user_id);
		const opexParams = [stmt.IDNo];
		let opexSql = `
			SELECT IDNo, DESCRIPTION, AMOUNT, SORT_ORDER
			FROM income_statement_opex
			WHERE INCOME_STATEMENT_ID = ? AND ACTIVE = 1`;
		opexSql = appendDateFilter(opexSql, 'ENCODED_DT', range, opexParams);
		opexSql += ` ORDER BY SORT_ORDER ASC, IDNo ASC`;
		const [opex] = await pool.execute(opexSql, opexParams);

		let sales = 0;
		let costOfSales = 0;
		if (!range.active) {
			sales = num(stmt.SALES);
			costOfSales = num(stmt.COST_OF_SALES);
		} else {
			const [stmtRows] = await pool.execute(
				`SELECT SALES, COST_OF_SALES FROM income_statement
				 WHERE IDNo = ? AND ACTIVE = 1 AND DATE(COALESCE(EDITED_DT, ENCODED_DT)) BETWEEN ? AND ?`,
				[stmt.IDNo, range.dateFrom, range.dateTo]
			);
			if (stmtRows.length) {
				sales = num(stmtRows[0].SALES);
				costOfSales = num(stmtRows[0].COST_OF_SALES);
			}
		}

		const grossProfit = sales - costOfSales;
		const opexTotal = opex.reduce((sum, row) => sum + num(row.AMOUNT), 0);
		const netIncome = grossProfit - opexTotal;

		res.json({
			id: stmt.IDNo,
			sales,
			costOfSales,
			grossProfit,
			opex,
			opexTotal,
			netIncome,
			dateFrom: range.dateFrom,
			dateTo: range.dateTo
		});
	} catch (error) {
		console.error('Error fetching income statement:', error);
		res.status(500).json({ message: 'Failed to fetch income statement' });
	}
});

router.post('/save_income_statement', async (req, res) => {
	try {
		const sales = parseAmount(req.body.txtSales);
		const costOfSales = parseAmount(req.body.txtCostOfSales);
		if (sales === null || costOfSales === null) {
			return res.status(400).json({ message: 'Invalid payload' });
		}

		const stmt = await getOrCreateIncomeStatement(req.session.user_id);
		await pool.execute(
			`UPDATE income_statement SET SALES = ?, COST_OF_SALES = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`,
			[sales, costOfSales, req.session.user_id, new Date(), stmt.IDNo]
		);

		res.json({ message: 'Income statement saved successfully' });
	} catch (error) {
		console.error('Error saving income statement:', error);
		res.status(500).json({ message: 'Failed to save income statement' });
	}
});

router.post('/add_income_opex', async (req, res) => {
	try {
		const description = String(req.body.txtDescription || '').trim();
		const amount = parseAmount(req.body.txtAmount);
		if (!description || amount === null) {
			return res.status(400).json({ message: 'Invalid payload' });
		}

		const stmt = await getOrCreateIncomeStatement(req.session.user_id);
		await pool.execute(
			`INSERT INTO income_statement_opex (INCOME_STATEMENT_ID, DESCRIPTION, AMOUNT, ENCODED_BY, ENCODED_DT)
			 VALUES (?, ?, ?, ?, ?)`,
			[stmt.IDNo, description, amount, req.session.user_id, new Date()]
		);

		res.json({ message: 'Expense added successfully' });
	} catch (error) {
		console.error('Error adding opex:', error);
		res.status(500).json({ message: 'Failed to add expense' });
	}
});

router.put('/income_opex/:id', async (req, res) => {
	try {
		const id = parseId(req.params.id);
		const description = String(req.body.txtDescription || '').trim();
		const amount = parseAmount(req.body.txtAmount);
		if (!id || !description || amount === null) {
			return res.status(400).json({ message: 'Invalid payload' });
		}

		await pool.execute(
			`UPDATE income_statement_opex SET DESCRIPTION = ?, AMOUNT = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ? AND ACTIVE = 1`,
			[description, amount, req.session.user_id, new Date(), id]
		);

		res.json({ message: 'Expense updated successfully' });
	} catch (error) {
		console.error('Error updating opex:', error);
		res.status(500).json({ message: 'Failed to update expense' });
	}
});

router.put('/income_opex/remove/:id', async (req, res) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'Invalid ID' });

		await pool.execute(
			`UPDATE income_statement_opex SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`,
			[req.session.user_id, new Date(), id]
		);

		res.json({ message: 'Expense removed successfully' });
	} catch (error) {
		console.error('Error removing opex:', error);
		res.status(500).json({ message: 'Failed to remove expense' });
	}
});

// ----- Balance Sheet (sample logic) -----

router.get('/balance_sheet_summary', async (req, res) => {
	try {
		const range = parseDateRange(req);
		const assetParams = [];
		let assetSql = `
			SELECT IDNo, ASSET_NAME, ASSET_TYPE, CATEGORY, PURCHASE_COST, CURRENT_VALUE
			FROM company_asset WHERE ACTIVE = 1`;
		assetSql = appendDateFilter(assetSql, 'ENCODED_DT', range, assetParams);
		assetSql += ` ORDER BY ASSET_TYPE ASC, ASSET_NAME ASC`;
		const [assetRows] = await pool.execute(assetSql, assetParams);

		const currentAssets = assetRows.filter((r) => r.ASSET_TYPE === 'Current Asset');
		const fixedAssets = assetRows.filter((r) => r.ASSET_TYPE === 'Fixed Asset');
		const otherAssets = assetRows.filter((r) => r.ASSET_TYPE === 'Other Asset');

		const sumValue = (rows) => rows.reduce((s, r) => s + num(r.CURRENT_VALUE), 0);
		const sumPurchaseCost = (rows) => rows.reduce((s, r) => s + num(r.PURCHASE_COST), 0);
		const currentSubtotal = sumValue(currentAssets);
		const fixedSubtotal = sumValue(fixedAssets);
		const otherSubtotal = sumValue(otherAssets);
		const fixedPurchases = sumPurchaseCost(fixedAssets);

		const capital = await getCapitalAmount(range);

		const stmt = await getOrCreateIncomeStatement(req.session?.user_id);
		const netIncome = await computeNetIncome(stmt, range);

		const { cashFromCapital, cashFromNetIncome } = computeCashAfterFixedPurchases(
			capital,
			netIncome,
			fixedPurchases
		);

		const totalAssets = currentSubtotal + fixedSubtotal + otherSubtotal + cashFromCapital + cashFromNetIncome;

		const capitalParams = [];
		let capitalSql = `SELECT IDNo, DESCRIPTION, AMOUNT FROM company_capital WHERE ACTIVE = 1`;
		capitalSql = appendDateFilter(capitalSql, 'ENCODED_DT', range, capitalParams);
		capitalSql += ` ORDER BY ENCODED_DT DESC`;
		const [capitalRows] = await pool.execute(capitalSql, capitalParams);

		const debtParams = [];
		let debtSql = `
			SELECT IDNo, DESCRIPTION, LIABILITY_TYPE, CATEGORY,
				AMOUNT, AMOUNT_PAID, (AMOUNT - AMOUNT_PAID) AS BALANCE
			FROM company_liability WHERE ACTIVE = 1`;
		debtSql = appendDateFilter(debtSql, 'ENCODED_DT', range, debtParams);
		debtSql += ` ORDER BY LIABILITY_TYPE ASC, DESCRIPTION ASC`;
		const [debtRows] = await pool.execute(debtSql, debtParams);

		const debtsTotal = debtRows.reduce((s, r) => s + num(r.BALANCE), 0);
		const totalLiabilitySide = capital + netIncome + debtsTotal;

		const sales = num(stmt.SALES);
		const costOfSales = num(stmt.COST_OF_SALES);
		let filteredSales = sales;
		let filteredCogs = costOfSales;
		if (range.active) {
			const [stmtRows] = await pool.execute(
				`SELECT SALES, COST_OF_SALES FROM income_statement
				 WHERE IDNo = ? AND ACTIVE = 1 AND DATE(COALESCE(EDITED_DT, ENCODED_DT)) BETWEEN ? AND ?`,
				[stmt.IDNo, range.dateFrom, range.dateTo]
			);
			filteredSales = stmtRows.length ? num(stmtRows[0].SALES) : 0;
			filteredCogs = stmtRows.length ? num(stmtRows[0].COST_OF_SALES) : 0;
		}
		const grossProfit = filteredSales - filteredCogs;

		const opexParams = [stmt.IDNo];
		let opexSql = `SELECT IDNo, DESCRIPTION, AMOUNT FROM income_statement_opex WHERE INCOME_STATEMENT_ID = ? AND ACTIVE = 1`;
		opexSql = appendDateFilter(opexSql, 'ENCODED_DT', range, opexParams);
		opexSql += ` ORDER BY SORT_ORDER ASC, IDNo ASC`;
		const [opex] = await pool.execute(opexSql, opexParams);
		const opexTotal = opex.reduce((s, r) => s + num(r.AMOUNT), 0);

		res.json({
			assets: {
				cashFromCapital,
				cashFromNetIncome,
				fixedPurchases,
				current: currentAssets,
				currentSubtotal,
				fixed: fixedAssets,
				fixedSubtotal,
				other: otherAssets,
				otherSubtotal,
				total: totalAssets
			},
			liabilities: {
				capital,
				capitalItems: capitalRows,
				netIncome,
				debts: debtRows,
				debtsTotal,
				total: totalLiabilitySide
			},
			incomeStatement: {
				id: stmt.IDNo,
				sales: filteredSales,
				costOfSales: filteredCogs,
				grossProfit,
				opex,
				opexTotal,
				netIncome
			},
			dateFrom: range.dateFrom,
			dateTo: range.dateTo,
			balanced: Math.abs(totalAssets - totalLiabilitySide) < 0.01,
			difference: totalAssets - totalLiabilitySide
		});
	} catch (error) {
		console.error('Error fetching balance sheet summary:', error);
		res.status(500).json({ message: 'Failed to fetch balance sheet summary' });
	}
});

module.exports = router;
