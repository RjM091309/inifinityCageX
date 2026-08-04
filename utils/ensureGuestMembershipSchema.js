/**
 * Idempotent DB setup for guest.MEMBERSHIP_NO (manual entry, digits only).
 */

async function tableExists(pool, tableName) {
	const [rows] = await pool.execute(
		`SELECT COUNT(*) AS cnt FROM information_schema.TABLES
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
		[tableName]
	);
	return Number(rows[0]?.cnt || 0) > 0;
}

async function columnExists(pool, tableName, columnName) {
	const [rows] = await pool.execute(
		`SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
		[tableName, columnName]
	);
	return Number(rows[0]?.cnt || 0) > 0;
}

async function ensureGuestMembershipSchema(pool) {
	if (!(await tableExists(pool, 'guest'))) return false;

	if (!(await columnExists(pool, 'guest', 'MEMBERSHIP_NO'))) {
		await pool.execute(
			`ALTER TABLE guest ADD COLUMN MEMBERSHIP_NO VARCHAR(50) NULL DEFAULT NULL AFTER NAME`
		);
		console.log('[guest] Added column MEMBERSHIP_NO');
	}

	return false;
}

module.exports = { ensureGuestMembershipSchema };
