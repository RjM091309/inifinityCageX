const ACTIVITY_LOG_MAX_ROWS = 3000;

/** Tables that start a UNION branch (alias must match SQL). */
const BRANCH_FROM = [
	'agency a',
	'agent ag',
	'account acc',
	'account_ledger al',
	'junket_house_expense j',
	'expense_category cat',
	'junket_loss jl',
	'money_exchange_transaction t',
	'user_info ui',
	'user_role ur',
	'telegram_api ta',
	'game_number_logs gnl',
	'booking b',
	'game_list gl',
	'game_record gr',
	'game_services gs',
	'junket_total_chips j',
	'junket_return_money rm',
	'junket_capital jc',
	'daily_settlement ds',
	'daily_settlement_games dsg',
	'expense_daily_settlement eds',
];

function injectCrossJoin(sql) {
	let out = sql;
	for (const from of BRANCH_FROM) {
		const needle = `FROM ${from}`;
		const replacement = `FROM ${from} CROSS JOIN date_range dr`;
		out = out.split(needle).join(replacement);
	}
	return out;
}

function injectEncodedDt(sql) {
	return sql.replace(
		/(\b[a-z][a-z0-9_]*)\.ENCODED_DT IS NOT NULL/gi,
		'$1.ENCODED_DT IS NOT NULL AND $1.ENCODED_DT >= dr.dt_from AND $1.ENCODED_DT <= dr.dt_to'
	);
}

function injectEditedDt(sql) {
	return sql.replace(
		/(\b[a-z][a-z0-9_]*)\.EDITED_DT IS NOT NULL/gi,
		'$1.EDITED_DT IS NOT NULL AND $1.EDITED_DT >= dr.dt_from AND $1.EDITED_DT <= dr.dt_to'
	);
}

function injectUpdatedDt(sql) {
	return sql.replace(
		/(\b[a-z][a-z0-9_]*)\.UPDATED_DT IS NOT NULL/gi,
		'$1.UPDATED_DT IS NOT NULL AND $1.UPDATED_DT >= dr.dt_from AND $1.UPDATED_DT <= dr.dt_to'
	);
}

function injectLedgerEncoded(sql) {
	// account_ledger branches without "ENCODED_DT IS NOT NULL"
	return sql.replace(
		/(FROM account_ledger al CROSS JOIN date_range dr[\s\S]*?WHERE al\.ACTIVE = 1)/g,
		'$1 AND al.ENCODED_DT >= dr.dt_from AND al.ENCODED_DT <= dr.dt_to'
	);
}

function injectBookingDate(sql) {
	return sql.replace(
		/\bb\.BOOKING_DATE IS NOT NULL/g,
		'b.BOOKING_DATE IS NOT NULL AND b.BOOKING_DATE >= dr.dt_from AND b.BOOKING_DATE <= dr.dt_to'
	);
}

function injectRunAt(sql) {
	return sql.replace(
		/\bds\.RUN_AT IS NOT NULL/g,
		'ds.RUN_AT IS NOT NULL AND ds.RUN_AT >= dr.dt_from AND ds.RUN_AT <= dr.dt_to'
	);
}

function injectAddedAt(sql) {
	return sql.replace(
		/\bdsg\.ADDED_AT IS NOT NULL/g,
		'dsg.ADDED_AT IS NOT NULL AND dsg.ADDED_AT >= dr.dt_from AND dsg.ADDED_AT <= dr.dt_to'
	);
}

function injectExpenseSettlementRunAt(sql) {
	return sql.replace(
		/\beds\.RUN_AT IS NOT NULL/g,
		'eds.RUN_AT IS NOT NULL AND eds.RUN_AT >= dr.dt_from AND eds.RUN_AT <= dr.dt_to'
	);
}

/**
 * @param {string} sql - inner UNION query (without outer wrapper)
 * @param {boolean} hasDateFilter
 */
function optimizeActivityLogSql(sql, hasDateFilter) {
	if (!hasDateFilter) return sql;
	let out = injectCrossJoin(sql);
	out = injectEncodedDt(out);
	out = injectEditedDt(out);
	out = injectUpdatedDt(out);
	out = injectBookingDate(out);
	out = injectRunAt(out);
	out = injectExpenseSettlementRunAt(out);
	out = injectAddedAt(out);
	out = injectLedgerEncoded(out);
	return out;
}

function wrapActivityLogQuery(innerSql, hasDateFilter, limitClause) {
	const body = optimizeActivityLogSql(innerSql, hasDateFilter);
	if (hasDateFilter) {
		return `WITH date_range AS (SELECT ? AS dt_from, ? AS dt_to)
SELECT * FROM (
${body}
) AS logs
ORDER BY logs.action_time DESC
${limitClause}`;
	}
	return `SELECT * FROM (
${body}
) AS logs
ORDER BY logs.action_time DESC
${limitClause}`;
}

function dedupeActivityLogRows(rows) {
	const seen = new Set();
	return rows.filter((row) => {
		const actionTime = row.action_time instanceof Date
			? row.action_time.toISOString()
			: String(row.action_time ?? '');
		const key = [
			row.action_type,
			row.related_id,
			actionTime,
			row.name,
			row.source_table,
			row.amount,
			row.nn_amount,
			row.cc_amount,
			row.encoded_by_name,
		].join('\0');
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function fetchActivityLogRows(pool, innerSql, hasDateFilter, limitClause, queryParams) {
	const sql = wrapActivityLogQuery(innerSql, hasDateFilter, limitClause);
	const [rows] = await pool.query(sql, queryParams);
	return dedupeActivityLogRows(rows);
}

module.exports = {
	ACTIVITY_LOG_MAX_ROWS,
	dedupeActivityLogRows,
	optimizeActivityLogSql,
	wrapActivityLogQuery,
	fetchActivityLogRows,
};
