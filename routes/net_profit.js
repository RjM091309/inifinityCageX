/**
 * Business net profit — **per settlement date** (one table row per day).
 * - Games: daily_settlement.SETTLEMENT_DATE (via daily_settlement_games.DAILY_SETTLEMENT_ID)
 * - Expenses: expense_daily_settlement.SETTLEMENT_DATE (items → junket_house_expense).
 * - House expenses not yet in expense_daily_settlement_items are rolled into **server today** when today falls in the selected range.
 * Chip / commission formulas match public/assets/js/functions/game_list.js.
 * Share uses a saved percentage per settlement date, defaulting to DEFAULT_NET_PROFIT_SHARE_PCT.
 *
 * computeGameMetrics, loadSharePercentagesByDay, normalizeSharePercentage, fetchRecordsForGames,
 * loadGamesInDateRange, loadDistinctSettlementDatesInRange, loadExpenseTotalsByDay,
 * loadUnsettledHouseExpenseTotal, loadUnsettledGamesForLive, monthKeyFromYmd, formatMonthLabel,
 * aggregateRowsByMonth and computeNetProfitRows now live in utils/netProfitCalc.js — shared with
 * routes/api.js GET /api/dashboard-summary and GET /api/monthly-statistics (the Flutter app's
 * dashboard). A fix or formula change there automatically applies to both without a second edit.
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkSession, sessions } = require('./auth');

/** Super Admin only — same as elsewhere (`permissions === 0`). */
function requireSuperAdmin(req, res, next) {
	const p = req.session.permissions;
	if (p !== 0 && p !== '0') {
		if (req.xhr || (req.headers.accept && String(req.headers.accept).includes('application/json'))) {
			return res.status(403).json({ success: false, error: 'Forbidden' });
		}
		return res.status(403).send('Forbidden');
	}
	next();
}

const superAdminOnly = [checkSession, requireSuperAdmin];

const path = require('path');
const ExcelJS = require('exceljs');
const { applyCommaThousandsToNumericCells } = require('../utils/excelAmountFormat');
const {
	DEFAULT_NET_PROFIT_SHARE_PCT,
	NET_PROFIT_SHARE_TABLE,
	pad2,
	ceilAmount,
	serverTodayStr,
	isValidYmd,
	normalizeSharePercentage,
	computeNetProfitRows,
	aggregateRowsByMonth,
} = require('../utils/netProfitCalc');

const MAX_RANGE_DAYS = 400;

function currentMonthRangeStr() {
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const start = `${year}-${pad2(month + 1)}-01`;
	const lastDay = new Date(year, month + 1, 0).getDate();
	const end = `${year}-${pad2(month + 1)}-${pad2(lastDay)}`;
	return { start, end };
}

function isValidMonthKey(mk) {
	if (typeof mk !== 'string' || !/^\d{4}-\d{2}$/.test(mk)) return false;
	const m = Number(mk.slice(5, 7));
	return Number.isFinite(m) && m >= 1 && m <= 12;
}

function calendarDatesInMonth(monthKey) {
	const y = Number(monthKey.slice(0, 4));
	const m = Number(monthKey.slice(5, 7));
	const dim = new Date(y, m, 0).getDate();
	const out = [];
	for (let d = 1; d <= dim; d += 1) {
		out.push(`${y}-${pad2(m)}-${pad2(d)}`);
	}
	return out;
}

async function upsertSharePercentage(settlementDate, sharePercentage, userId) {
	await pool.execute(
		`INSERT INTO \`${NET_PROFIT_SHARE_TABLE}\`
			(SETTLEMENT_DATE, SHARE_PERCENTAGE, ACTIVE, ENCODED_BY, ENCODED_DT)
		 VALUES (?, ?, 1, ?, NOW())
		 ON DUPLICATE KEY UPDATE
			SHARE_PERCENTAGE = VALUES(SHARE_PERCENTAGE),
			ACTIVE = 1,
			EDITED_BY = VALUES(ENCODED_BY),
			EDITED_DT = VALUES(ENCODED_DT)`,
		[settlementDate, sharePercentage, userId]
	);
}

function daySpanInclusive(startStr, endStr) {
	const a = new Date(`${startStr}T12:00:00`);
	const b = new Date(`${endStr}T12:00:00`);
	if (a > b) return 0;
	return Math.floor((b - a) / 86400000) + 1;
}

router.get('/net_profit', superAdminOnly, async (req, res) => {
	try {
		const todayStr = serverTodayStr();
		const defaultRange = currentMonthRangeStr();
		const data = sessions(req, 'net_profit');
		data.permissions = req.session.permissions || 0;
		data.todayStr = todayStr;
		data.defaultRangeStart = defaultRange.start;
		data.defaultRangeEnd = defaultRange.end;
		data.netProfitHouseSharePct = DEFAULT_NET_PROFIT_SHARE_PCT;
		res.render('junket/net_profit', data);
	} catch (err) {
		console.error('net_profit page:', err);
		res.status(500).send('Error loading page');
	}
});

router.get('/net_profit_data', superAdminOnly, async (req, res) => {
	try {
		const todayStr = serverTodayStr();

		let start = String(req.query.start || '').trim();
		let end = String(req.query.end || '').trim();
		const viewRaw = String(req.query.view || 'monthly').trim().toLowerCase();
		const view = viewRaw === 'daily' ? 'daily' : 'monthly';
		if (!isValidYmd(start) || !isValidYmd(end)) {
			const defaultRange = currentMonthRangeStr();
			start = defaultRange.start;
			end = defaultRange.end;
		}
		if (start > end) {
			const t = start;
			start = end;
			end = t;
		}
		const spanDays = daySpanInclusive(start, end);
		if (spanDays > MAX_RANGE_DAYS) {
			return res.status(400).json({
				success: false,
				error: `Ang range ay hanggang ${MAX_RANGE_DAYS} araw lang.`,
			});
		}

		// Shared with routes/api.js GET /api/dashboard-summary and GET /api/monthly-statistics —
		// see utils/netProfitCalc.js.
		const rowsAsc = await computeNetProfitRows(start, end);

		const displayRowsAsc = view === 'monthly' ? aggregateRowsByMonth(rowsAsc) : rowsAsc;
		const rows = displayRowsAsc.slice().reverse();

		const range_totals = rowsAsc.reduce(
			(acc, r) => {
				acc.game_count += r.game_count;
				acc.win_loss += r.win_loss;
				acc.casino_share += r.casino_share;
				acc.commission += r.commission;
				acc.house_expenses_settled += r.house_expenses_settled;
				acc.grand_net_profit += r.grand_net_profit;
				return acc;
			},
			{
				game_count: 0,
				win_loss: 0,
				casino_share: 0,
				commission: 0,
				house_expenses_settled: 0,
				grand_net_profit: 0,
			}
		);
		range_totals.win_loss = ceilAmount(range_totals.win_loss);
		range_totals.casino_share = ceilAmount(range_totals.casino_share);
		range_totals.house_expenses_settled = ceilAmount(range_totals.house_expenses_settled);
		range_totals.grand_net_profit = ceilAmount(range_totals.grand_net_profit);
		range_totals.commission = ceilAmount(range_totals.commission);
		const sharePercentages = rowsAsc.map((r) => Number(r.share_percentage)).filter(Number.isFinite);
		const firstSharePercentage = sharePercentages[0];
		range_totals.share_percentage =
			sharePercentages.length > 0 && sharePercentages.every((pct) => pct === firstSharePercentage)
				? firstSharePercentage
				: null;

		res.json({
			success: true,
			mode: 'range',
			view,
			start,
			end,
			server_today: todayStr,
			house_share_pct: DEFAULT_NET_PROFIT_SHARE_PCT,
			rows,
			range_totals,
		});
	} catch (err) {
		console.error('net_profit_data:', err);
		res.status(500).json({ success: false, error: 'Error computing net profit' });
	}
});

router.post('/net_profit/share_percentage', superAdminOnly, async (req, res) => {
	try {
		const settlementDate = String(req.body?.settlement_date || '').trim();
		const sharePercentage = normalizeSharePercentage(req.body?.share_percentage);

		if (!isValidYmd(settlementDate)) {
			return res.status(400).json({ success: false, error: 'Invalid settlement date' });
		}
		if (sharePercentage == null) {
			return res.status(400).json({ success: false, error: 'Share percentage must be between 0 and 100' });
		}

		const userId = req.session.user_id || null;
		await upsertSharePercentage(settlementDate, sharePercentage, userId);

		res.json({ success: true, settlement_date: settlementDate, share_percentage: sharePercentage });
	} catch (err) {
		console.error('net_profit/share_percentage:', err);
		res.status(500).json({ success: false, error: 'Error saving share percentage' });
	}
});

router.post('/net_profit/share_percentage/month', superAdminOnly, async (req, res) => {
	try {
		const monthKey = String(req.body?.month || req.body?.month_key || '').trim();
		const sharePercentage = normalizeSharePercentage(req.body?.share_percentage);

		if (!isValidMonthKey(monthKey)) {
			return res.status(400).json({ success: false, error: 'Invalid month' });
		}
		if (sharePercentage == null) {
			return res.status(400).json({ success: false, error: 'Share percentage must be between 0 and 100' });
		}

		const userId = req.session.user_id || null;
		const dates = calendarDatesInMonth(monthKey);
		for (const settlementDate of dates) {
			await upsertSharePercentage(settlementDate, sharePercentage, userId);
		}

		res.json({
			success: true,
			month: monthKey,
			days_updated: dates.length,
			share_percentage: sharePercentage,
		});
	} catch (err) {
		console.error('net_profit/share_percentage/month:', err);
		res.status(500).json({ success: false, error: 'Error saving share percentage for month' });
	}
});

function coerceNetProfitExportCell(raw) {
	if (raw == null || raw === '') return '';
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	let s = String(raw).trim();
	s = s.replace(/^₱\s*/, '').replace(/^PHP\s*/i, '').trim();
	if (/[a-zA-Z]/.test(s)) return s;
	if (/%/.test(s)) return s;
	const normalized = s.replace(/,/g, '');
	if (normalized === '' || normalized === '-' || normalized === '+') return s;
	if (!/^[-+]?(?:\d+\.\d+|\d+\.?|\.\d+)(?:[eE][-+]?\d+)?$/.test(normalized)) return s;
	const n = Number(normalized);
	return Number.isFinite(n) ? n : s;
}

function sanitizeNetProfitSheetName(raw) {
	if (raw == null || typeof raw !== 'string') return '';
	let s = raw.trim().replace(/[\]\[\\\/\?\*:]/g, '');
	if (s.length > 31) s = s.slice(0, 31);
	return s;
}

router.post('/net_profit/export_xlsx', superAdminOnly, async function (req, res) {
	try {
		const { headers, rows, filename, sheetName } = req.body || {};
		if (!Array.isArray(headers) || headers.length === 0) {
			return res.status(400).json({ error: 'Invalid headers' });
		}
		if (!Array.isArray(rows)) {
			return res.status(400).json({ error: 'Invalid rows' });
		}
		const MAX_ROWS = 2000;
		if (rows.length > MAX_ROWS) {
			return res.status(400).json({ error: 'Too many rows' });
		}
		const ncol = headers.length;
		const thinBorder = {
			top: { style: 'thin', color: { argb: 'FF666666' } },
			left: { style: 'thin', color: { argb: 'FF666666' } },
			bottom: { style: 'thin', color: { argb: 'FF666666' } },
			right: { style: 'thin', color: { argb: 'FF666666' } }
		};
		const fillHeader = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFD9E1F2' }
		};
		const fillTotalRow = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFFFF3CD' }
		};
		const fillZebra = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFF5F5F5' }
		};

		const workbook = new ExcelJS.Workbook();
		const sheetTitle = sanitizeNetProfitSheetName(sheetName) || 'Net profit';
		const ws = workbook.addWorksheet(sheetTitle, {
			views: [{ state: 'frozen', ySplit: 1 }]
		});

		const headerRow = ws.addRow(headers.map((h) => (h == null ? '' : String(h))));
		headerRow.height = 22;
		headerRow.eachCell((cell, colNumber) => {
			cell.font = { bold: true };
			cell.border = thinBorder;
			cell.fill = fillHeader;
			const colIdx = colNumber - 1;
			cell.alignment =
				colIdx === 0
					? { vertical: 'middle', horizontal: 'left', wrapText: true }
					: { vertical: 'middle', horizontal: 'right', wrapText: true };
		});

		rows.forEach((r, rowIdx) => {
			const arr = Array.isArray(r) ? r : [];
			const padded = Array.from({ length: ncol }, (_, i) => {
				const v = arr[i];
				if (v == null || v === '') return '';
				return coerceNetProfitExportCell(v);
			});
			const firstCell = arr[0];
			const isTotal = firstCell != null && String(firstCell).trim().toUpperCase() === 'TOTAL';
			const dataRow = ws.addRow(padded);
			dataRow.eachCell((cell, colNumber) => {
				cell.border = thinBorder;
				const colIdx = colNumber - 1;
				if (colIdx === 0) {
					cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
				} else {
					cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
				}
				if (isTotal) {
					cell.fill = fillTotalRow;
					cell.font = { bold: true };
					return;
				}
				if (rowIdx % 2 === 1) {
					cell.fill = fillZebra;
				}
			});
		});

		const colMaxLens = headers.map((h, c) => {
			let m = String(h == null ? '' : h).length;
			for (let ri = 0; ri < rows.length; ri++) {
				const row = rows[ri];
				if (!Array.isArray(row) || row[c] == null) continue;
				const L = String(row[c]).length;
				if (L > m) m = L;
			}
			return Math.min(48, Math.max(10, m + 2));
		});
		for (let i = 1; i <= ncol; i++) {
			ws.getColumn(i).width = colMaxLens[i - 1];
		}

		applyCommaThousandsToNumericCells(ws);

		const buffer = await workbook.xlsx.writeBuffer();
		let outName = 'NetProfit-export.xlsx';
		if (filename && typeof filename === 'string') {
			const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
			if (base && /\.xlsx$/i.test(base)) outName = base.slice(0, 180);
			else if (base) outName = base.replace(/\.+$/g, '').slice(0, 160) + '.xlsx';
		}
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', 'attachment; filename="' + outName.replace(/"/g, '') + '"');
		return res.send(Buffer.from(buffer));
	} catch (err) {
		console.error('net_profit/export_xlsx:', err);
		return res.status(500).json({ error: 'Export failed' });
	}
});

router.get('/business_net_profit', superAdminOnly, (req, res) => {
	res.redirect(301, '/net_profit');
});

router.get('/business_net_profit_data', superAdminOnly, (req, res) => {
	const i = req.url.indexOf('?');
	res.redirect(301, '/net_profit_data' + (i >= 0 ? req.url.slice(i) : ''));
});

module.exports = router;
