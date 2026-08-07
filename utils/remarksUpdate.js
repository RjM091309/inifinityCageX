const pool = require('../config/db');

const REMARKS_TABLES = {
	guest: {
		table: 'guest',
		column: 'REMARKS',
		activeCol: 'ACTIVE',
		activeValue: 1
	},
	agent: {
		table: 'agent',
		column: 'REMARKS',
		activeCol: 'ACTIVE',
		activeValue: 1
	},
	game_list: {
		table: 'game_list',
		column: 'REMARKS',
		activeCol: 'ACTIVE',
		activeNotZero: true
	}
};

function normalizeRemarks(raw, maxLen) {
	let remarks = raw != null ? String(raw).trim() : '';
	const limit = maxLen || 500;
	if (remarks.length > limit) remarks = remarks.slice(0, limit);
	return remarks;
}

async function updateRemarks(source, id, rawRemarks, userId) {
	const config = REMARKS_TABLES[source];
	if (!config) {
		const err = new Error('Invalid remarks source.');
		err.status = 400;
		throw err;
	}

	const recordId = parseInt(id, 10);
	if (!recordId || Number.isNaN(recordId)) {
		const err = new Error('Invalid record id.');
		err.status = 400;
		throw err;
	}

	const remarks = normalizeRemarks(rawRemarks);
	const dateNow = new Date();

	let activeClause = '';
	const params = [];
	if (config.activeCol) {
		if (config.activeNotZero) {
			activeClause = ` AND ${config.activeCol} != 0`;
		} else {
			activeClause = ` AND ${config.activeCol} = ?`;
			params.push(config.activeValue);
		}
	}

	const [rows] = await pool.execute(
		`SELECT IDNo FROM ${config.table} WHERE IDNo = ?${activeClause}`,
		[recordId, ...params]
	);

	if (!rows.length) {
		const err = new Error('Record not found.');
		err.status = 404;
		throw err;
	}

	const editedByCol = config.editedByCol || 'EDITED_BY';
	const editedDtCol = config.editedDtCol || 'EDITED_DT';
	await pool.execute(
		`UPDATE ${config.table} SET ${config.column} = ?, ${editedByCol} = ?, ${editedDtCol} = ? WHERE IDNo = ?`,
		[remarks || null, userId, dateNow, recordId]
	);

	return remarks;
}

module.exports = {
	REMARKS_TABLES,
	normalizeRemarks,
	updateRemarks
};
