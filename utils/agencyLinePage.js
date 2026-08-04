/**
 * Line page (agency) — stats, guest rows (guest table), Excel exports.
 */

const ExcelJS = require('exceljs');
const { applyCommaThousandsToNumericCells, autoFitExcelWorksheetColumns } = require('./excelAmountFormat');

const GUEST_DATA_GAME_QUERY = `
	SELECT
		gl.GUEST_ID AS guest_id,
		gl.IDNo AS game_id,
		COALESCE(gl.COMMISSION_TYPE, 0) AS commission_type,
		COALESCE(gl.COMMISSION_PERCENTAGE, 0) AS commission_percentage,
		COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 1 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0) AS total_amount,
		COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0) AS total_cash_out_chips,
		COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_cash_out_nn,
		COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.AMOUNT ELSE 0 END), 0) AS total_rolling_amount,
		COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_rolling_nn,
		COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.AMOUNT ELSE 0 END), 0) AS total_rolling_real,
		COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_rolling_nn_real,
		COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.CC_CHIPS ELSE 0 END), 0) AS total_rolling_cc_real,
		COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 5 AND COALESCE(gr.ROLLER_TRANSACTION, 1) = 2 THEN gr.ROLLER_CC_CHIPS ELSE 0 END), 0) AS total_roller_return_cc
	FROM game_list gl
	INNER JOIN account acc ON acc.IDNo = gl.ACCOUNT_ID
	INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID
	LEFT JOIN game_record gr ON gr.GAME_ID = gl.IDNo AND gr.ACTIVE = 1
	WHERE ag.ACTIVE = 1
	  AND acc.ACTIVE = 1
	  AND gl.ACTIVE IN (1, 2)
	  AND {{SCOPE_FILTER}}
	GROUP BY
		gl.GUEST_ID,
		gl.IDNo,
		gl.COMMISSION_TYPE,
		gl.COMMISSION_PERCENTAGE
`;

function aggregateGuestDataRows(guestRows, gameRows, balanceCreditMap) {
	const resultMap = {};
	(guestRows || []).forEach((g) => {
		const key = String(g.guest_id);
		const balanceCredit = (balanceCreditMap && balanceCreditMap[key]) || {};
		resultMap[key] = {
			guest_id: g.guest_id,
			agent_id: g.agent_id,
			guest_name: g.guest_name,
			membership_no: g.membership_no,
			guest_telegram: g.guest_telegram || null,
			telegram_enabled: g.telegram_enabled,
			guest_remarks: g.guest_remarks,
			agent_code: g.agent_code || null,
			agent_name: g.agent_name || null,
			agency_id: g.agency_id || null,
			agency_name: g.agency_name || null,
			total_balance: Number(balanceCredit.total_balance) || 0,
			total_credit: Number(balanceCredit.total_credit) || 0,
			total_games: 0,
			total_rolling: 0,
			total_winloss: 0,
			total_commission: 0
		};
	});

	(gameRows || []).forEach((row) => {
		const guestKey = String(row.guest_id || '').trim();
		const bucket = resultMap[guestKey];
		if (!bucket) return;

		const totalRollingChips =
			(Number(row.total_rolling_nn) || 0) +
			(Number(row.total_roller_return_cc) || 0) +
			(Number(row.total_rolling_amount) || 0) +
			(Number(row.total_rolling_real) || 0) +
			(Number(row.total_rolling_nn_real) || 0) +
			(Number(row.total_rolling_cc_real) || 0) -
			(Number(row.total_cash_out_nn) || 0);

		const winLoss = (Number(row.total_amount) || 0) - (Number(row.total_cash_out_chips) || 0);
		const commissionRate = Number(row.commission_percentage) || 0;
		const commissionType = Number(row.commission_type) || 0;
		let net = 0;

		if (commissionType === 1 || commissionType === 3) {
			net = Math.round((totalRollingChips * commissionRate) / 100);
		} else if (commissionType === 2) {
			net = Math.round((winLoss * commissionRate) / 100);
		}

		bucket.total_games += 1;
		bucket.total_rolling += totalRollingChips;
		bucket.total_winloss += winLoss;
		bucket.total_commission += net;
	});

	return Object.values(resultMap);
}

function emptyFinancialStats() {
	return {
		total_balance: 0,
		total_credit: 0,
		total_rolling: 0,
		total_winloss: 0,
		total_commission: 0
	};
}

function sumGameRowMetrics(gameRows) {
	const totals = emptyFinancialStats();
	for (const row of gameRows || []) {
		const totalRollingChips =
			(Number(row.total_rolling_nn) || 0) +
			(Number(row.total_roller_return_cc) || 0) +
			(Number(row.total_rolling_amount) || 0) +
			(Number(row.total_rolling_real) || 0) +
			(Number(row.total_rolling_nn_real) || 0) +
			(Number(row.total_rolling_cc_real) || 0) -
			(Number(row.total_cash_out_nn) || 0);

		const winLoss = (Number(row.total_amount) || 0) - (Number(row.total_cash_out_chips) || 0);
		const commissionRate = Number(row.commission_percentage) || 0;
		const commissionType = Number(row.commission_type) || 0;
		let net = 0;

		if (commissionType === 1 || commissionType === 3) {
			net = Math.round((totalRollingChips * commissionRate) / 100);
		} else if (commissionType === 2) {
			net = Math.round((winLoss * commissionRate) / 100);
		}

		totals.total_rolling += totalRollingChips;
		totals.total_winloss += winLoss;
		totals.total_commission += net;
	}
	return totals;
}

const GAME_SCOPED_JOIN_WHERE = `
	FROM game_list gl
	INNER JOIN account acc ON acc.IDNo = gl.ACCOUNT_ID AND acc.ACTIVE = 1
	INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID AND ag.ACTIVE = 1
	LEFT JOIN game_record gr ON gr.GAME_ID = gl.IDNo AND gr.ACTIVE = 1
	WHERE gl.ACTIVE IN (1, 2)
`;

async function fetchScopedGameFinancialTotals(pool, scopeSql, params) {
	const query = `
		SELECT
			COALESCE(SUM(per_game.total_rolling_chips), 0) AS total_rolling,
			COALESCE(SUM(per_game.winloss), 0) AS total_winloss,
			COALESCE(SUM(
				CASE
					WHEN per_game.commission_type IN (1, 3) THEN ROUND((per_game.total_rolling_chips * per_game.commission_percentage) / 100)
					WHEN per_game.commission_type = 2 THEN ROUND((per_game.winloss * per_game.commission_percentage) / 100)
					ELSE 0
				END
			), 0) AS total_commission
		FROM (
			SELECT
				gl.IDNo,
				COALESCE(gl.COMMISSION_TYPE, 0) AS commission_type,
				COALESCE(gl.COMMISSION_PERCENTAGE, 0) AS commission_percentage,
				(
					COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.NN_CHIPS ELSE 0 END), 0) +
					COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 5 AND COALESCE(gr.ROLLER_TRANSACTION, 1) = 2 THEN gr.ROLLER_CC_CHIPS ELSE 0 END), 0) +
					COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.AMOUNT ELSE 0 END), 0) +
					COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.AMOUNT ELSE 0 END), 0) +
					COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.NN_CHIPS ELSE 0 END), 0) +
					COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.CC_CHIPS ELSE 0 END), 0) -
					COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS ELSE 0 END), 0)
				) AS total_rolling_chips,
				(
					COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 1 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0) -
					COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0)
				) AS winloss
			${GAME_SCOPED_JOIN_WHERE}
			AND (${scopeSql})
			GROUP BY gl.IDNo, gl.COMMISSION_TYPE, gl.COMMISSION_PERCENTAGE
		) per_game
	`;
	const [[row]] = await pool.execute(query, params);
	return {
		total_rolling: Number(row?.total_rolling ?? 0),
		total_winloss: Number(row?.total_winloss ?? 0),
		total_commission: Number(row?.total_commission ?? 0)
	};
}

async function fetchScopedLedgerBalance(pool, agencyFilter, agentFilter, params) {
	const [[row]] = await pool.execute(
		`SELECT COALESCE(SUM(
			CASE
				WHEN tt.TRANSACTION IN ('DEPOSIT', 'MARKER REDEEM') THEN al.AMOUNT
				WHEN tt.TRANSACTION IN ('WITHDRAW', 'IOU RETURN DEPOSIT') THEN -al.AMOUNT
				ELSE 0
			END
		), 0) AS total_balance
		 FROM account_ledger al
		 INNER JOIN transaction_type tt ON tt.IDNo = al.TRANSACTION_ID
		 INNER JOIN account acc ON acc.IDNo = al.ACCOUNT_ID AND acc.ACTIVE = 1
		 INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID AND ag.ACTIVE = 1
		 WHERE al.ACTIVE = 1 AND al.TRANSACTION_TYPE IN (2, 5, 3)
		 ${agencyFilter} ${agentFilter}`,
		params
	);
	return Number(row?.total_balance ?? 0);
}

async function fetchScopedLedgerCredit(pool, agencyFilter, agentFilter, params) {
	const [[row]] = await pool.execute(
		`SELECT COALESCE(SUM(
			CASE
				WHEN al.TRANSACTION_ID IN (3, 10) THEN al.AMOUNT
				WHEN al.TRANSACTION_ID IN (11, 12, 1) THEN -al.AMOUNT
				ELSE 0
			END
		), 0) AS total_credit
		 FROM account_ledger al
		 INNER JOIN account acc ON acc.IDNo = al.ACCOUNT_ID AND acc.ACTIVE = 1
		 INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID AND ag.ACTIVE = 1
		 WHERE al.ACTIVE = 1 AND al.TRANSACTION_TYPE IN (3, 4)
		 ${agencyFilter} ${agentFilter}`,
		params
	);
	return Number(row?.total_credit ?? 0);
}

async function fetchGuestBalanceCreditMap(pool, guestIds) {
	const map = {};
	if (!Array.isArray(guestIds) || guestIds.length === 0) {
		return map;
	}

	const placeholders = guestIds.map(() => '?').join(',');
	const params = guestIds;

	const [balanceRows] = await pool.execute(
		`SELECT gl.GUEST_ID AS guest_id,
			COALESCE(SUM(
				CASE
					WHEN tt.TRANSACTION IN ('DEPOSIT', 'MARKER REDEEM') THEN al.AMOUNT
					WHEN tt.TRANSACTION IN ('WITHDRAW', 'IOU RETURN DEPOSIT') THEN -al.AMOUNT
					ELSE 0
				END
			), 0) AS total_balance
		 FROM game_list gl
		 INNER JOIN account_ledger al ON al.GAME_ID = gl.IDNo
		   AND al.ACCOUNT_ID = gl.ACCOUNT_ID
		   AND al.ACTIVE = 1
		 INNER JOIN transaction_type tt ON tt.IDNo = al.TRANSACTION_ID
		 WHERE gl.GUEST_ID IN (${placeholders})
		   AND al.TRANSACTION_TYPE IN (2, 3, 5)
		 GROUP BY gl.GUEST_ID`,
		params
	);

	const [creditRows] = await pool.execute(
		`SELECT guest_id,
			COALESCE(SUM(game_credit_balance), 0) AS total_credit
		 FROM (
			SELECT gl.GUEST_ID AS guest_id,
				GREATEST(
					0,
					COALESCE(SUM(CASE WHEN al.TRANSACTION_ID IN (3, 10) THEN al.AMOUNT ELSE 0 END), 0) -
					COALESCE(SUM(CASE WHEN al.TRANSACTION_ID IN (11, 12, 1) THEN al.AMOUNT ELSE 0 END), 0)
				) AS game_credit_balance
			FROM game_list gl
			LEFT JOIN account_ledger al ON al.GAME_ID = gl.IDNo
			  AND al.ACCOUNT_ID = gl.ACCOUNT_ID
			  AND al.ACTIVE = 1
			  AND al.TRANSACTION_TYPE IN (3, 4)
			  AND (al.TRANSACTION_ID IN (3, 10, 11, 12, 1) OR al.TRANSACTION_TYPE = 4)
			WHERE gl.GUEST_ID IN (${placeholders})
			GROUP BY gl.IDNo, gl.GUEST_ID
		 ) AS game_credit
		 GROUP BY guest_id`,
		params
	);

	(balanceRows || []).forEach((row) => {
		const key = String(row.guest_id);
		if (!map[key]) map[key] = { total_balance: 0, total_credit: 0 };
		map[key].total_balance = Number(row.total_balance) || 0;
	});

	(creditRows || []).forEach((row) => {
		const key = String(row.guest_id);
		if (!map[key]) map[key] = { total_balance: 0, total_credit: 0 };
		map[key].total_credit = Number(row.total_credit) || 0;
	});

	return map;
}

async function fetchAgentFinancialStats(pool, agentId) {
	const [gameTotals, totalBalance, totalCredit] = await Promise.all([
		fetchScopedGameFinancialTotals(pool, 'ag.IDNo = ?', [agentId]),
		fetchScopedLedgerBalance(pool, ' AND ag.IDNo = ? ', '', [agentId]),
		fetchScopedLedgerCredit(pool, ' AND ag.IDNo = ? ', '', [agentId])
	]);

	return {
		total_balance: totalBalance,
		total_credit: totalCredit,
		...gameTotals
	};
}

async function fetchAllLinesOverviewStats(pool) {
	const [[lineRow]] = await pool.execute(
		`SELECT COUNT(*) AS total_line FROM agency a WHERE a.ACTIVE = 1`
	);

	const [gameRows] = await pool.execute(
		`SELECT
				gl.IDNo AS game_id,
				COALESCE(gl.COMMISSION_TYPE, 0) AS commission_type,
				COALESCE(gl.COMMISSION_PERCENTAGE, 0) AS commission_percentage,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 1 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0) AS total_amount,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0) AS total_cash_out_chips,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_cash_out_nn,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.AMOUNT ELSE 0 END), 0) AS total_rolling_amount,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_rolling_nn,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.AMOUNT ELSE 0 END), 0) AS total_rolling_real,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_rolling_nn_real,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.CC_CHIPS ELSE 0 END), 0) AS total_rolling_cc_real,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 5 AND COALESCE(gr.ROLLER_TRANSACTION, 1) = 2 THEN gr.ROLLER_CC_CHIPS ELSE 0 END), 0) AS total_roller_return_cc
		 FROM game_list gl
		 INNER JOIN account acc ON acc.IDNo = gl.ACCOUNT_ID
		 INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID
		 LEFT JOIN game_record gr ON gr.GAME_ID = gl.IDNo AND gr.ACTIVE = 1
		 WHERE gl.ACTIVE IN (1, 2) AND acc.ACTIVE = 1 AND ag.ACTIVE = 1
		 GROUP BY gl.IDNo, gl.COMMISSION_TYPE, gl.COMMISSION_PERCENTAGE`
	);

	const [[balanceRow]] = await pool.execute(
		`SELECT COALESCE(SUM(led.total_balance), 0) AS total_balance
		 FROM account acc
		 INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID
		 LEFT JOIN (
			SELECT al.ACCOUNT_ID,
				SUM(CASE WHEN tt.TRANSACTION = 'DEPOSIT' THEN al.AMOUNT ELSE 0 END) +
				SUM(CASE WHEN tt.TRANSACTION = 'MARKER REDEEM' THEN al.AMOUNT ELSE 0 END) -
				SUM(CASE WHEN tt.TRANSACTION = 'WITHDRAW' THEN al.AMOUNT ELSE 0 END) -
				SUM(CASE WHEN tt.TRANSACTION = 'IOU RETURN DEPOSIT' THEN al.AMOUNT ELSE 0 END) AS total_balance
			FROM account_ledger al
			INNER JOIN transaction_type tt ON tt.IDNo = al.TRANSACTION_ID
			WHERE al.ACTIVE = 1 AND al.TRANSACTION_TYPE IN (2, 5, 3)
			GROUP BY ACCOUNT_ID
		 ) AS led ON led.ACCOUNT_ID = acc.IDNo
		 WHERE acc.ACTIVE = 1 AND ag.ACTIVE = 1`
	);

	const [[creditRow]] = await pool.execute(
		`SELECT COALESCE(SUM(cred.credit_balance), 0) AS total_credit
		 FROM account acc
		 INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID
		 LEFT JOIN (
			SELECT al.ACCOUNT_ID,
				SUM(CASE WHEN al.TRANSACTION_ID IN (3, 10) THEN al.AMOUNT ELSE 0 END) -
				SUM(CASE WHEN al.TRANSACTION_ID IN (11, 12, 1) THEN al.AMOUNT ELSE 0 END) AS credit_balance
			FROM account_ledger al
			WHERE al.ACTIVE = 1 AND al.TRANSACTION_TYPE IN (3, 4)
			GROUP BY al.ACCOUNT_ID
		 ) AS cred ON cred.ACCOUNT_ID = acc.IDNo
		 WHERE acc.ACTIVE = 1 AND ag.ACTIVE = 1`
	);

	const gameTotals = sumGameRowMetrics(gameRows);
	return {
		total_line: Number(lineRow?.total_line ?? 0),
		total_balance: Number(balanceRow?.total_balance ?? 0),
		total_credit: Number(creditRow?.total_credit ?? 0),
		total_rolling: gameTotals.total_rolling,
		total_winloss: gameTotals.total_winloss,
		total_commission: gameTotals.total_commission
	};
}

async function buildLineAgentMatrixWorkbook(pool, agencyId) {
	const numericAgencyId = agencyId ? parseInt(agencyId, 10) : null;
	const hasAgencyFilter = numericAgencyId && !Number.isNaN(numericAgencyId);

	let lineName = 'LINE';
	const agentQuery = hasAgencyFilter
		? `SELECT ag.IDNo AS agent_id, ag.AGENT_CODE AS agent_code, ag.NAME AS agent_name
		   FROM agent ag WHERE ag.AGENCY = ? AND ag.ACTIVE = 1
		   ORDER BY ag.AGENT_CODE ASC, ag.NAME ASC, ag.IDNo ASC`
		: `SELECT ag.IDNo AS agent_id, ag.AGENT_CODE AS agent_code, ag.NAME AS agent_name
		   FROM agent ag
		   INNER JOIN agency a ON a.IDNo = ag.AGENCY AND a.ACTIVE = 1
		   WHERE ag.ACTIVE = 1
		   ORDER BY a.AGENCY ASC, ag.AGENT_CODE ASC, ag.IDNo ASC`;

	const [agentRows] = await pool.execute(agentQuery, hasAgencyFilter ? [numericAgencyId] : []);

	if (hasAgencyFilter) {
		const [agencyNameRows] = await pool.execute(
			`SELECT AGENCY FROM agency WHERE IDNo = ? AND ACTIVE = 1`,
			[numericAgencyId]
		);
		lineName = String(agencyNameRows[0]?.AGENCY ?? '').trim() || ('LINE ' + numericAgencyId);
	}

	const agentOrder = [];
	const agentMap = new Map();
	for (const r of agentRows || []) {
		const id = Number(r.agent_id);
		if (agentMap.has(id)) continue;
		const code = String(r.agent_code ?? '').trim();
		const name = String(r.agent_name ?? '').trim();
		const headerLabel = code && name
			? code.toUpperCase() + ' · ' + name.toUpperCase()
			: String(code || name || '').toUpperCase();
		agentMap.set(id, { headerLabel, guests: [] });
		agentOrder.push(id);
	}

	const guestQuery = `
		SELECT g.NAME AS guest_name
		FROM guest g
		WHERE g.AGENT_ID = ? AND g.ACTIVE = 1
		ORDER BY g.IDNo DESC
	`;
	for (const aid of agentOrder) {
		const [gRows] = await pool.execute(guestQuery, [aid]);
		const bucket = agentMap.get(aid);
		for (const g of gRows || []) {
			const gn = String(g.guest_name ?? '').trim();
			if (gn) bucket.guests.push(gn);
		}
	}

	let overviewStats;
	if (hasAgencyFilter) {
		const [[balanceRow]] = await pool.execute(
			`SELECT COALESCE(SUM(led.total_balance), 0) AS total_balance
			 FROM account acc INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID
			 LEFT JOIN (
				SELECT al.ACCOUNT_ID,
					SUM(CASE WHEN tt.TRANSACTION = 'DEPOSIT' THEN al.AMOUNT ELSE 0 END) +
					SUM(CASE WHEN tt.TRANSACTION = 'MARKER REDEEM' THEN al.AMOUNT ELSE 0 END) -
					SUM(CASE WHEN tt.TRANSACTION = 'WITHDRAW' THEN al.AMOUNT ELSE 0 END) -
					SUM(CASE WHEN tt.TRANSACTION = 'IOU RETURN DEPOSIT' THEN al.AMOUNT ELSE 0 END) AS total_balance
				FROM account_ledger al
				INNER JOIN transaction_type tt ON tt.IDNo = al.TRANSACTION_ID
				WHERE al.ACTIVE = 1 AND al.TRANSACTION_TYPE IN (2, 5, 3)
				GROUP BY ACCOUNT_ID
			 ) AS led ON led.ACCOUNT_ID = acc.IDNo
			 WHERE acc.ACTIVE = 1 AND ag.ACTIVE = 1 AND ag.AGENCY = ?`,
			[numericAgencyId]
		);
		const [[creditRow]] = await pool.execute(
			`SELECT COALESCE(SUM(cred.credit_balance), 0) AS total_credit
			 FROM account acc INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID
			 LEFT JOIN (
				SELECT al.ACCOUNT_ID,
					SUM(CASE WHEN al.TRANSACTION_ID IN (3, 10) THEN al.AMOUNT ELSE 0 END) -
					SUM(CASE WHEN al.TRANSACTION_ID IN (11, 12, 1) THEN al.AMOUNT ELSE 0 END) AS credit_balance
				FROM account_ledger al
				WHERE al.ACTIVE = 1 AND al.TRANSACTION_TYPE IN (3, 4)
				GROUP BY al.ACCOUNT_ID
			 ) AS cred ON cred.ACCOUNT_ID = acc.IDNo
			 WHERE acc.ACTIVE = 1 AND ag.ACTIVE = 1 AND ag.AGENCY = ?`,
			[numericAgencyId]
		);
		const [gameRows] = await pool.execute(
			`SELECT gl.IDNo AS game_id,
				COALESCE(gl.COMMISSION_TYPE, 0) AS commission_type,
				COALESCE(gl.COMMISSION_PERCENTAGE, 0) AS commission_percentage,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 1 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0) AS total_amount,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0) AS total_cash_out_chips,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_cash_out_nn,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.AMOUNT ELSE 0 END), 0) AS total_rolling_amount,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_rolling_nn,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.AMOUNT ELSE 0 END), 0) AS total_rolling_real,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_rolling_nn_real,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.CC_CHIPS ELSE 0 END), 0) AS total_rolling_cc_real,
				COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 5 AND COALESCE(gr.ROLLER_TRANSACTION, 1) = 2 THEN gr.ROLLER_CC_CHIPS ELSE 0 END), 0) AS total_roller_return_cc
			 FROM game_list gl
			 INNER JOIN account acc ON acc.IDNo = gl.ACCOUNT_ID
			 INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID
			 LEFT JOIN game_record gr ON gr.GAME_ID = gl.IDNo AND gr.ACTIVE = 1
			 WHERE gl.ACTIVE IN (1, 2) AND acc.ACTIVE = 1 AND ag.ACTIVE = 1 AND ag.AGENCY = ?
			 GROUP BY gl.IDNo, gl.COMMISSION_TYPE, gl.COMMISSION_PERCENTAGE`,
			[numericAgencyId]
		);
		const gameTotals = sumGameRowMetrics(gameRows);
		overviewStats = {
			total_line: agentOrder.length,
			total_balance: Number(balanceRow?.total_balance ?? 0),
			total_credit: Number(creditRow?.total_credit ?? 0),
			...gameTotals
		};
	} else {
		overviewStats = await fetchAllLinesOverviewStats(pool);
	}

	const workbook = new ExcelJS.Workbook();
	const ws = workbook.addWorksheet('LINE');
	const thinBorder = {
		top: { style: 'thin', color: { argb: 'FF666666' } },
		left: { style: 'thin', color: { argb: 'FF666666' } },
		bottom: { style: 'thin', color: { argb: 'FF666666' } },
		right: { style: 'thin', color: { argb: 'FF666666' } }
	};
	const summaryFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
	const alignCenter = { vertical: 'middle', horizontal: 'center', wrapText: false };
	const alignLeft = { vertical: 'middle', horizontal: 'left', wrapText: false, indent: 1 };
	const alignRight = { vertical: 'middle', horizontal: 'right', wrapText: false };

	const scopeLabel = hasAgencyFilter ? 'Total Agent' : 'TOTAL LINE';
	const scopeValue = hasAgencyFilter ? agentOrder.length : overviewStats.total_line;

	const summaryHeaderRow = ws.addRow([
		scopeLabel, 'TOTAL BALANCE', 'Total Credit', 'Total Winloss', 'Total Rolling', 'Total Commission'
	]);
	summaryHeaderRow.eachCell((cell) => {
		cell.font = { bold: true };
		cell.alignment = alignCenter;
		cell.border = thinBorder;
		cell.fill = summaryFill;
	});

	const summaryValueRow = ws.addRow([
		scopeValue,
		overviewStats.total_balance,
		overviewStats.total_credit,
		overviewStats.total_winloss,
		overviewStats.total_rolling,
		overviewStats.total_commission
	]);
	summaryValueRow.eachCell((cell, colNumber) => {
		cell.font = { bold: true };
		cell.border = thinBorder;
		cell.alignment = colNumber === 1 ? alignCenter : alignRight;
	});

	ws.addRow([]);

	if (agentOrder.length === 0) {
		const hr = ws.addRow([hasAgencyFilter ? 'No agents for this LINE.' : 'No active agents.']);
		hr.getCell(1).alignment = alignCenter;
		hr.getCell(1).border = thinBorder;
	} else {
		const headers = agentOrder.map((id) => agentMap.get(id).headerLabel);
		const maxRows = Math.max(0, ...agentOrder.map((id) => agentMap.get(id).guests.length));

		const headerRow = ws.addRow(headers);
		headerRow.eachCell({ includeEmpty: true }, (cell) => {
			cell.font = { bold: true };
			cell.alignment = alignLeft;
			cell.border = thinBorder;
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
		});

		for (let i = 0; i < maxRows; i++) {
			const rowVals = agentOrder.map((id) => agentMap.get(id).guests[i] || '');
			const dataRow = ws.addRow(rowVals);
			dataRow.eachCell({ includeEmpty: true }, (cell) => {
				cell.border = thinBorder;
				cell.alignment = alignLeft;
			});
		}
	}

	applyCommaThousandsToNumericCells(ws, { headerRows: 1 });
	autoFitExcelWorksheetColumns(ws, { minWidth: 10, maxWidth: 80, padding: 4 });

	const now = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	const dateSuffix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	let outName = `Line-${dateSuffix}.xlsx`;
	if (hasAgencyFilter) {
		const safeLine = String(lineName).replace(/[<>:"/\\|?*]+/g, '').trim() || 'LINE';
		outName = `${safeLine}-${dateSuffix}.xlsx`;
	}

	return { workbook, outName };
}

function registerAgencyLineRoutes(router, pool, checkSession) {
	router.get('/agency_line_stats', async (req, res) => {
		try {
			const agencyIdParam = req.query.agencyId;
			const agencyId = agencyIdParam !== undefined && agencyIdParam !== '' ? Number(agencyIdParam) : null;
			const hasAgencyFilter = agencyId !== null && !Number.isNaN(agencyId);
			const agencyFilter = hasAgencyFilter ? ' AND ag.AGENCY = ? ' : '';
			const agencyOnlyFilter = hasAgencyFilter ? ' AND a.IDNo = ? ' : '';

			const agentIds = String(req.query.agentIds || '')
				.split(',')
				.map((value) => parseInt(value, 10))
				.filter((value) => Number.isFinite(value) && value > 0);
			const hasAgentFilter = agentIds.length > 0;
			const agentFilter = hasAgentFilter ? ` AND ag.IDNo IN (${agentIds.map(() => '?').join(',')}) ` : '';

			const filterParams = hasAgencyFilter ? [agencyId] : [];
			const agentFilterParams = hasAgentFilter ? agentIds : [];
			const combinedParams = [...filterParams, ...agentFilterParams];

			let gameScopeSql = '1=1';
			if (hasAgentFilter) {
				gameScopeSql = `ag.IDNo IN (${agentIds.map(() => '?').join(',')})`;
			} else if (hasAgencyFilter) {
				gameScopeSql = 'ag.AGENCY = ?';
			}

			const [
				[[agentRow]],
				[[lineRow]],
				[[guestRow]],
				gameTotals,
				totalBalance,
				totalCredit
			] = await Promise.all([
				pool.execute(
					`SELECT COUNT(*) AS total_agent FROM agent ag WHERE ag.ACTIVE = 1
					 ${hasAgencyFilter ? 'AND ag.AGENCY = ?' : ''} ${agentFilter}`,
					combinedParams
				),
				pool.execute(
					hasAgentFilter
						? `SELECT COUNT(DISTINCT ag.AGENCY) AS total_line FROM agent ag WHERE ag.ACTIVE = 1
						   ${hasAgencyFilter ? 'AND ag.AGENCY = ?' : ''} ${agentFilter}`
						: `SELECT COUNT(*) AS total_line FROM agency a WHERE a.ACTIVE = 1 ${agencyOnlyFilter}`,
					combinedParams
				),
				pool.execute(
					`SELECT COUNT(*) AS total_guest FROM guest g
					 INNER JOIN agent ag ON ag.IDNo = g.AGENT_ID
					 WHERE g.ACTIVE = 1 AND ag.ACTIVE = 1 ${agencyFilter} ${agentFilter}`,
					combinedParams
				),
				fetchScopedGameFinancialTotals(pool, gameScopeSql, combinedParams),
				fetchScopedLedgerBalance(pool, agencyFilter, agentFilter, combinedParams),
				fetchScopedLedgerCredit(pool, agencyFilter, agentFilter, combinedParams)
			]);

			res.json({
				total_line: Number(lineRow?.total_line ?? 0),
				total_agent: Number(agentRow?.total_agent ?? 0),
				total_guest: Number(guestRow?.total_guest ?? 0),
				total_rolling: gameTotals.total_rolling,
				total_winloss: gameTotals.total_winloss,
				total_commission: gameTotals.total_commission,
				total_balance: totalBalance,
				total_credit: totalCredit
			});
		} catch (err) {
			console.error('Error in /agency_line_stats:', err);
			res.status(500).json({ error: 'Failed to load line statistics.' });
		}
	});

	router.get('/agency_agent_stats', async (req, res) => {
		try {
			const agentId = Number(req.query.agentId);
			if (!agentId || Number.isNaN(agentId)) {
				return res.status(400).json({ error: 'Invalid agent id.' });
			}

			const [[guestRow]] = await pool.execute(
				`SELECT COUNT(*) AS total_guest FROM guest WHERE ACTIVE = 1 AND AGENT_ID = ?`,
				[agentId]
			);

			const [[gamesRow]] = await pool.execute(
				`SELECT COUNT(*) AS total_games FROM game_list gl
				 INNER JOIN account acc ON acc.IDNo = gl.ACCOUNT_ID
				 INNER JOIN agent ag ON ag.IDNo = acc.AGENT_ID
				 WHERE gl.ACTIVE IN (1, 2) AND acc.ACTIVE = 1 AND ag.ACTIVE = 1 AND ag.IDNo = ?`,
				[agentId]
			);

			const agentStats = await fetchAgentFinancialStats(pool, agentId);
			return res.json({
				total_guest: Number(guestRow?.total_guest ?? 0),
				total_games: Number(gamesRow?.total_games ?? 0),
				...agentStats
			});
		} catch (err) {
			console.error('Error in /agency_agent_stats:', err);
			return res.status(500).json({ error: 'Failed to load agent statistics.' });
		}
	});

	router.get('/agency_transfer_options', async (req, res) => {
		try {
			const excludeAgencyId = Number(req.query.excludeAgencyId);
			if (!excludeAgencyId || Number.isNaN(excludeAgencyId)) {
				return res.status(400).json({ error: 'Invalid source agency id.' });
			}

			const [agencies] = await pool.execute(
				`SELECT IDNo AS agency_id, AGENCY AS agency_name FROM agency
				 WHERE ACTIVE = 1 AND IDNo <> ? ORDER BY AGENCY ASC`,
				[excludeAgencyId]
			);

			const [[countRow]] = await pool.execute(
				`SELECT COUNT(acc.IDNo) AS account_count FROM account acc
				 JOIN agent ag ON ag.IDNo = acc.AGENT_ID
				 WHERE acc.ACTIVE = 1 AND ag.ACTIVE = 1 AND ag.AGENCY = ?`,
				[excludeAgencyId]
			);

			return res.json({
				agencies,
				accountCount: Number(countRow?.account_count ?? 0)
			});
		} catch (error) {
			console.error('Error loading transfer agency options:', error);
			return res.status(500).json({ error: 'Error loading transfer options.' });
		}
	});

	router.get('/guest_data', async (req, res) => {
		try {
			const agentId = parseInt(req.query.agentId, 10);
			const agencyId = parseInt(req.query.agencyId, 10);
			const allGuests = String(req.query.all || '') === '1';
			const lite = String(req.query.lite || '') === '1';

			if (!agentId && !agencyId && !allGuests) {
				return res.json([]);
			}

			const guestSelect = `
				g.IDNo AS guest_id,
				g.AGENT_ID AS agent_id,
				g.NAME AS guest_name,
				g.MEMBERSHIP_NO AS membership_no,
				g.TELEGRAM_ID AS guest_telegram,
				COALESCE(g.TELEGRAM_ENABLED, 1) AS telegram_enabled,
				g.REMARKS AS guest_remarks,
				ag.AGENT_CODE AS agent_code,
				ag.NAME AS agent_name,
				ag.AGENCY AS agency_id,
				ay.AGENCY AS agency_name
			`;

			let guestQuery;
			let guestParams;
			let gameQuery;
			let gameParams;

			if (allGuests) {
				guestQuery = `
					SELECT ${guestSelect}
					FROM guest g
					INNER JOIN agent ag ON ag.IDNo = g.AGENT_ID AND ag.ACTIVE = 1
					INNER JOIN agency ay ON ay.IDNo = ag.AGENCY AND ay.ACTIVE = 1
					WHERE g.ACTIVE = 1
					ORDER BY g.IDNo DESC
				`;
				guestParams = [];
				gameQuery = GUEST_DATA_GAME_QUERY.replace('{{SCOPE_FILTER}}', '1=1');
				gameParams = [];
			} else if (agencyId) {
				guestQuery = `
					SELECT ${guestSelect}
					FROM guest g
					INNER JOIN agent ag ON ag.IDNo = g.AGENT_ID AND ag.ACTIVE = 1
					INNER JOIN agency ay ON ay.IDNo = ag.AGENCY AND ay.ACTIVE = 1
					WHERE ag.AGENCY = ? AND g.ACTIVE = 1
					ORDER BY g.IDNo DESC
				`;
				guestParams = [agencyId];
				gameQuery = GUEST_DATA_GAME_QUERY.replace('{{SCOPE_FILTER}}', 'ag.AGENCY = ?');
				gameParams = [agencyId];
			} else {
				guestQuery = `
					SELECT ${guestSelect}
					FROM guest g
					INNER JOIN agent ag ON ag.IDNo = g.AGENT_ID AND ag.ACTIVE = 1
					INNER JOIN agency ay ON ay.IDNo = ag.AGENCY AND ay.ACTIVE = 1
					WHERE g.AGENT_ID = ? AND g.ACTIVE = 1
					ORDER BY g.IDNo DESC
				`;
				guestParams = [agentId];
				gameQuery = GUEST_DATA_GAME_QUERY.replace('{{SCOPE_FILTER}}', 'ag.IDNo = ?');
				gameParams = [agentId];
			}

			const [guestRows] = await pool.execute(guestQuery, guestParams);

			if (!Array.isArray(guestRows) || guestRows.length === 0) {
				return res.json([]);
			}

			if (lite) {
				return res.json(aggregateGuestDataRows(guestRows, [], {}));
			}

			const [gameRows] = await pool.execute(gameQuery, gameParams);
			const guestIds = guestRows.map((row) => row.guest_id).filter(Boolean);
			const balanceCreditMap = await fetchGuestBalanceCreditMap(pool, guestIds);

			return res.json(aggregateGuestDataRows(guestRows, gameRows, balanceCreditMap));
		} catch (err) {
			console.error('Error fetching guest_data:', err);
			return res.status(500).json({ error: 'Failed to load guest data.' });
		}
	});

	router.post('/add_guest', async (req, res) => {
		const membershipRaw = String(req.body.txtMembershipNo || '').trim();
		const membershipNo = membershipRaw || null;
		try {
			const agentId = parseInt(req.body.txtAgentId, 10);
			const guestName = String(req.body.txtGuestName || '').trim();
			const remarks = String(req.body.txtRemarks || '').trim();
			const telegramId = String(req.body.txtTelegram || '').trim();
			const encodedBy = req.session?.user_id || 1;
			const now = new Date();

			if (!agentId) {
				return res.status(400).json({ error: 'Agent is required.' });
			}
			if (membershipRaw && !/^\d+$/.test(membershipRaw)) {
				return res.status(400).json({ error: 'Membership No must contain digits only.' });
			}
			if (!guestName) {
				return res.status(400).json({ error: 'Guest name is required.' });
			}
			if (telegramId && !/^\d+$/.test(telegramId)) {
				return res.status(400).json({ error: 'Telegram Chat ID must contain digits only.' });
			}

			const [result] = await pool.execute(
				`INSERT INTO guest (AGENT_ID, NAME, MEMBERSHIP_NO, TELEGRAM_ID, REMARKS, ACTIVE, ENCODED_BY, ENCODED_DT)
				 VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
				[agentId, guestName, membershipNo, telegramId || null, remarks || null, encodedBy, now]
			);
			return res.json({ success: true, guest_id: result.insertId });
		} catch (err) {
			console.error('Error adding guest:', err);
			return res.status(500).json({ error: 'Failed to add guest.' });
		}
	});

	router.patch('/guest/:id/remarks', async (req, res) => {
		try {
			if (req.session?.permissions === 2) {
				return res.status(403).json({ success: false, message: 'Not authorized to edit remarks.' });
			}
			const guestId = parseInt(req.params.id, 10);
			if (!guestId) {
				return res.status(400).json({ success: false, message: 'Guest is required.' });
			}
			const { updateRemarks } = require('./remarksUpdate');
			const remarks = await updateRemarks('guest', guestId, req.body && req.body.remarks, req.session?.user_id);
			return res.json({ success: true, remarks });
		} catch (err) {
			const status = err.status || 500;
			if (status >= 500) console.error('Error updating guest remarks:', err);
			return res.status(status).json({ success: false, message: err.message || 'Failed to update remarks.' });
		}
	});

	router.put('/guest/:id/telegram-enabled', checkSession, async (req, res) => {
		try {
			const guestId = parseInt(req.params.id, 10);
			if (!Number.isFinite(guestId) || guestId <= 0) {
				return res.status(400).json({ error: 'Invalid guest id' });
			}
			const enabled = req.body.enabled === true || req.body.enabled === 1 || req.body.enabled === '1';
			const [result] = await pool.execute(
				'UPDATE guest SET TELEGRAM_ENABLED = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ? AND ACTIVE = 1',
				[enabled ? 1 : 0, req.session?.user_id || 1, new Date(), guestId]
			);
			if (!result.affectedRows) {
				return res.status(404).json({ error: 'Guest not found.' });
			}
			return res.json({ success: true, guest_id: guestId, enabled });
		} catch (err) {
			console.error('Error updating guest telegram enabled:', err);
			return res.status(500).json({ error: 'Failed to update Telegram notification status' });
		}
	});

	router.put('/guest/:id', async (req, res) => {
		try {
			const guestId = parseInt(req.params.id, 10);
			const guestName = String(req.body.txtGuestName || '').trim();
			const membershipRaw = String(req.body.txtMembershipNo || '').trim();
			const membershipNo = membershipRaw || null;
			const remarks = String(req.body.txtRemarks || '').trim();
			const telegramId = String(req.body.txtTelegram || '').trim();
			const editedBy = req.session?.user_id || 1;
			const now = new Date();

			if (!guestId) {
				return res.status(400).json({ error: 'Guest is required.' });
			}
			if (!guestName) {
				return res.status(400).json({ error: 'Guest name is required.' });
			}
			if (membershipRaw && !/^\d+$/.test(membershipRaw)) {
				return res.status(400).json({ error: 'Membership No must contain digits only.' });
			}
			if (telegramId && !/^\d+$/.test(telegramId)) {
				return res.status(400).json({ error: 'Telegram Chat ID must contain digits only.' });
			}

			const [result] = await pool.execute(
				`UPDATE guest
				 SET NAME = ?, MEMBERSHIP_NO = ?, TELEGRAM_ID = ?, REMARKS = ?, EDITED_BY = ?, EDITED_DT = ?
				 WHERE IDNo = ? AND ACTIVE = 1`,
				[guestName, membershipNo, telegramId || null, remarks || null, editedBy, now, guestId]
			);

			if (!result.affectedRows) {
				return res.status(404).json({ error: 'Guest not found.' });
			}
			return res.json({ success: true });
		} catch (err) {
			console.error('Error updating guest:', err);
			return res.status(500).json({ error: 'Failed to update guest.' });
		}
	});

	router.put('/guest/:id/transfer', async (req, res) => {
		try {
			if (req.session?.permissions === 2) {
				return res.status(403).json({ error: 'Not authorized to transfer guests.' });
			}

			const guestId = parseInt(req.params.id, 10);
			const targetAgentId = parseInt(req.body.targetAgentId, 10);
			const editedBy = req.session?.user_id || 1;
			const now = new Date();

			if (!guestId) {
				return res.status(400).json({ error: 'Guest is required.' });
			}
			if (!targetAgentId) {
				return res.status(400).json({ error: 'Target agent is required.' });
			}

			const [guestRows] = await pool.execute(
				`SELECT
					g.IDNo AS guest_id,
					g.AGENT_ID AS agent_id,
					g.NAME AS guest_name,
					g.MEMBERSHIP_NO AS membership_no,
					ag.AGENCY AS agency_id,
					src_agency.AGENCY AS agency_name,
					ag.AGENT_CODE AS agent_code,
					ag.NAME AS agent_name
				FROM guest g
				INNER JOIN agent ag ON ag.IDNo = g.AGENT_ID AND ag.ACTIVE = 1
				INNER JOIN agency src_agency ON src_agency.IDNo = ag.AGENCY AND src_agency.ACTIVE = 1
				WHERE g.IDNo = ? AND g.ACTIVE = 1
				LIMIT 1`,
				[guestId]
			);

			if (!guestRows.length) {
				return res.status(404).json({ error: 'Guest not found.' });
			}

			const guest = guestRows[0];
			if (Number(guest.agent_id) === targetAgentId) {
				return res.status(400).json({ error: 'Guest is already under this agent.' });
			}

			const [targetRows] = await pool.execute(
				`SELECT
					ag.IDNo AS agent_id,
					ag.AGENCY AS agency_id,
					ag.AGENT_CODE AS agent_code,
					ag.NAME AS agent_name,
					ay.AGENCY AS agency_name
				FROM agent ag
				INNER JOIN agency ay ON ay.IDNo = ag.AGENCY AND ay.ACTIVE = 1
				WHERE ag.IDNo = ? AND ag.ACTIVE = 1
				LIMIT 1`,
				[targetAgentId]
			);

			if (!targetRows.length) {
				return res.status(404).json({ error: 'Target agent not found.' });
			}

			const target = targetRows[0];
			const [updateResult] = await pool.execute(
				`UPDATE guest
				 SET AGENT_ID = ?, EDITED_BY = ?, EDITED_DT = ?
				 WHERE IDNo = ? AND ACTIVE = 1`,
				[targetAgentId, editedBy, now, guestId]
			);

			if (!updateResult.affectedRows) {
				return res.status(404).json({ error: 'Guest not found.' });
			}

			return res.json({
				success: true,
				guest_id: guestId,
				from: {
					agency_id: guest.agency_id,
					agency_name: guest.agency_name,
					agent_id: guest.agent_id,
					agent_code: guest.agent_code,
					agent_name: guest.agent_name
				},
				to: {
					agency_id: target.agency_id,
					agency_name: target.agency_name,
					agent_id: target.agent_id,
					agent_code: target.agent_code,
					agent_name: target.agent_name
				}
			});
		} catch (err) {
			console.error('Error transferring guest:', err);
			return res.status(500).json({ error: 'Failed to transfer guest.' });
		}
	});

	router.put('/agent/:id/transfer-guests', async (req, res) => {
		try {
			if (req.session?.permissions === 2) {
				return res.status(403).json({ error: 'Not authorized to transfer guests.' });
			}

			const sourceAgentId = parseInt(req.params.id, 10);
			const targetAgentId = parseInt(req.body.targetAgentId, 10);
			const editedBy = req.session?.user_id || 1;
			const now = new Date();

			if (!sourceAgentId) {
				return res.status(400).json({ error: 'Source agent is required.' });
			}
			if (!targetAgentId) {
				return res.status(400).json({ error: 'Target agent is required.' });
			}
			if (sourceAgentId === targetAgentId) {
				return res.status(400).json({ error: 'Source and target agent must be different.' });
			}

			const [sourceRows] = await pool.execute(
				`SELECT
					ag.IDNo AS agent_id,
					ag.AGENCY AS agency_id,
					ag.AGENT_CODE AS agent_code,
					ag.NAME AS agent_name,
					ay.AGENCY AS agency_name
				FROM agent ag
				INNER JOIN agency ay ON ay.IDNo = ag.AGENCY AND ay.ACTIVE = 1
				WHERE ag.IDNo = ? AND ag.ACTIVE = 1
				LIMIT 1`,
				[sourceAgentId]
			);
			if (!sourceRows.length) {
				return res.status(404).json({ error: 'Source agent not found.' });
			}

			const [targetRows] = await pool.execute(
				`SELECT
					ag.IDNo AS agent_id,
					ag.AGENCY AS agency_id,
					ag.AGENT_CODE AS agent_code,
					ag.NAME AS agent_name,
					ay.AGENCY AS agency_name
				FROM agent ag
				INNER JOIN agency ay ON ay.IDNo = ag.AGENCY AND ay.ACTIVE = 1
				WHERE ag.IDNo = ? AND ag.ACTIVE = 1
				LIMIT 1`,
				[targetAgentId]
			);
			if (!targetRows.length) {
				return res.status(404).json({ error: 'Target agent not found.' });
			}

			const source = sourceRows[0];
			const target = targetRows[0];

			const rawGuestIds = Array.isArray(req.body.guestIds) ? req.body.guestIds : [];
			const guestIds = [...new Set(
				rawGuestIds
					.map((id) => parseInt(id, 10))
					.filter((id) => Number.isInteger(id) && id > 0)
			)];

			if (!guestIds.length) {
				return res.status(400).json({ error: 'Select at least one guest to transfer.' });
			}

			const placeholders = guestIds.map(() => '?').join(',');
			const [guestRows] = await pool.execute(
				`SELECT IDNo AS guest_id, NAME AS guest_name, MEMBERSHIP_NO AS membership_no
				 FROM guest
				 WHERE AGENT_ID = ? AND ACTIVE = 1 AND IDNo IN (${placeholders})
				 ORDER BY IDNo DESC`,
				[sourceAgentId, ...guestIds]
			);

			if (!guestRows.length) {
				return res.status(404).json({ error: 'No matching guests found under this agent.' });
			}

			const validGuestIds = guestRows.map((row) => row.guest_id);
			const updatePlaceholders = validGuestIds.map(() => '?').join(',');
			const [updateResult] = await pool.execute(
				`UPDATE guest
				 SET AGENT_ID = ?, EDITED_BY = ?, EDITED_DT = ?
				 WHERE AGENT_ID = ? AND ACTIVE = 1 AND IDNo IN (${updatePlaceholders})`,
				[targetAgentId, editedBy, now, sourceAgentId, ...validGuestIds]
			);

			return res.json({
				success: true,
				moved: updateResult.affectedRows || 0,
				from: {
					agency_id: source.agency_id,
					agency_name: source.agency_name,
					agent_id: source.agent_id,
					agent_code: source.agent_code,
					agent_name: source.agent_name
				},
				to: {
					agency_id: target.agency_id,
					agency_name: target.agency_name,
					agent_id: target.agent_id,
					agent_code: target.agent_code,
					agent_name: target.agent_name
				}
			});
		} catch (err) {
			console.error('Error transferring agent guests:', err);
			return res.status(500).json({ error: 'Failed to transfer agent guests.' });
		}
	});

	router.put('/guest/remove/:id', async (req, res) => {
		try {
			const permissions = req.session?.permissions;
			if (permissions !== 0) {
				return res.status(403).json({ success: false, message: 'Only Super Admin can delete guests.' });
			}

			const id = parseInt(req.params.id, 10);
			if (!id) {
				return res.status(400).json({ success: false, message: 'Guest is required.' });
			}

			const date_now = new Date();
			const [result] = await pool.execute(
				`UPDATE guest SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ? AND ACTIVE = 1`,
				[0, req.session.user_id, date_now, id]
			);

			if (!result.affectedRows) {
				return res.status(404).json({ success: false, message: 'Guest not found.' });
			}

			return res.json({ success: true });
		} catch (error) {
			console.error('Error removing guest:', error);
			return res.status(500).json({ success: false, message: 'Error removing guest' });
		}
	});

	router.post('/account/transfer-agency', async (req, res) => {
		let connection;
		try {
			const fromAgencyId = Number(req.body.fromAgencyId);
			const toAgencyId = Number(req.body.toAgencyId);
			const accountIdsInput = req.body.accountIds;
			const accountIdsRaw = Array.isArray(accountIdsInput) ? accountIdsInput : (accountIdsInput ? [accountIdsInput] : []);
			const accountIds = accountIdsRaw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);

			if (!fromAgencyId || !toAgencyId || Number.isNaN(fromAgencyId) || Number.isNaN(toAgencyId)) {
				return res.status(400).json({ error: 'Invalid agency selection.' });
			}
			if (fromAgencyId === toAgencyId) {
				return res.status(400).json({ error: 'Source and target agency must be different.' });
			}
			if (accountIds.length === 0) {
				return res.status(400).json({ error: 'Please select at least one account.' });
			}

			const [agencyRows] = await pool.execute(
				`SELECT IDNo FROM agency WHERE ACTIVE = 1 AND IDNo IN (?, ?)`,
				[fromAgencyId, toAgencyId]
			);
			if (agencyRows.length !== 2) {
				return res.status(404).json({ error: 'Source or target agency not found.' });
			}

			const placeholders = accountIds.map(() => '?').join(', ');
			const [[countRow]] = await pool.execute(
				`SELECT COUNT(acc.IDNo) AS account_count FROM account acc
				 JOIN agent ag ON ag.IDNo = acc.AGENT_ID
				 WHERE acc.ACTIVE = 1 AND ag.ACTIVE = 1 AND ag.AGENCY = ? AND acc.IDNo IN (${placeholders})`,
				[fromAgencyId, ...accountIds]
			);
			const accountCount = Number(countRow?.account_count || 0);
			if (accountCount <= 0) {
				return res.status(400).json({ error: 'Selected accounts are not valid for this agency.' });
			}

			connection = await pool.getConnection();
			await connection.beginTransaction();
			const dateNow = new Date();
			await connection.execute(
				`UPDATE agent ag SET ag.AGENCY = ?, ag.EDITED_BY = ?, ag.EDITED_DT = ?
				 WHERE ag.ACTIVE = 1 AND ag.AGENCY = ?
				   AND EXISTS (
					   SELECT 1 FROM account acc
					   WHERE acc.AGENT_ID = ag.IDNo AND acc.ACTIVE = 1 AND acc.IDNo IN (${placeholders})
				   )`,
				[toAgencyId, req.session.user_id, dateNow, fromAgencyId, ...accountIds]
			);
			await connection.commit();

			return res.json({
				success: true,
				message: `${accountCount} account(s) transferred successfully.`
			});
		} catch (error) {
			if (connection) {
				try { await connection.rollback(); } catch (e) { /* ignore */ }
			}
			console.error('Error transferring accounts between agencies:', error);
			return res.status(500).json({ error: 'Failed to transfer accounts.' });
		} finally {
			if (connection) connection.release();
		}
	});

	router.post('/agency/export_line_agent_matrix_xlsx', checkSession, async (req, res) => {
		try {
			const { workbook, outName } = await buildLineAgentMatrixWorkbook(pool, req.body?.agencyId);
			const buffer = await workbook.xlsx.writeBuffer();
			res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			res.setHeader('Content-Disposition', 'attachment; filename="' + outName.replace(/"/g, '') + '"');
			return res.send(Buffer.from(buffer));
		} catch (err) {
			console.error('agency/export_line_agent_matrix_xlsx:', err);
			return res.status(500).json({ error: 'Export failed' });
		}
	});

	router.post('/agency/export_agent_guest_matrix_xlsx', checkSession, async (req, res) => {
		try {
			const agencyId = parseInt(req.body.agencyId, 10);
			if (!agencyId) return res.status(400).json({ error: 'Select a LINE first.' });
			const { workbook, outName } = await buildLineAgentMatrixWorkbook(pool, agencyId);
			const buffer = await workbook.xlsx.writeBuffer();
			res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			res.setHeader('Content-Disposition', 'attachment; filename="' + outName.replace(/"/g, '') + '"');
			return res.send(Buffer.from(buffer));
		} catch (err) {
			console.error('agency/export_agent_guest_matrix_xlsx:', err);
			return res.status(500).json({ error: 'Export failed' });
		}
	});

	router.post('/agency/export_line_stats_xlsx', checkSession, async (req, res) => {
		try {
			const agencyId = parseInt(req.body.agencyId, 10);
			if (!agencyId) return res.status(400).json({ error: 'Select a LINE first.' });
			const { workbook, outName } = await buildLineAgentMatrixWorkbook(pool, agencyId);
			const buffer = await workbook.xlsx.writeBuffer();
			res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			res.setHeader('Content-Disposition', 'attachment; filename="' + outName.replace(/"/g, '') + '"');
			return res.send(Buffer.from(buffer));
		} catch (err) {
			console.error('agency/export_line_stats_xlsx:', err);
			return res.status(500).json({ error: 'Export failed' });
		}
	});
}

module.exports = {
	registerAgencyLineRoutes,
	fetchAgentFinancialStats,
	sumGameRowMetrics
};
