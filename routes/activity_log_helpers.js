const ACTIVITY_LOG_MAX_ROWS = 3000;

/** Tables that start a UNION branch (alias must match SQL). */
const BRANCH_FROM = [
	'agency a',
	'agent ag',
	'account_ledger al',
	'junket_house_expense j',
	'junket_loss jl',
	'money_exchange_transaction t',
	'user_info ui',
	'booking b',
	'game_list gl',
	'game_record gr',
	'game_services gs',
	'junket_total_chips j',
	'junket_return_money rm',
	'junket_capital jc',
	'daily_settlement ds',
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

async function fetchActivityLogRows(pool, innerSql, hasDateFilter, limitClause, queryParams) {
	const sql = wrapActivityLogQuery(innerSql, hasDateFilter, limitClause);
	const [rows] = await pool.query(sql, queryParams);
	return rows;
}

module.exports = {
	ACTIVITY_LOG_MAX_ROWS,
	optimizeActivityLogSql,
	wrapActivityLogQuery,
	fetchActivityLogRows,
};
