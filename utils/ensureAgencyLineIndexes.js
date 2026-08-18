/**
 * Idempotent indexes for Line page queries (agency stats, guest list).
 */

async function indexExists(pool, tableName, indexName) {
	const [rows] = await pool.execute(
		`SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
		[tableName, indexName]
	);
	return Number(rows[0]?.cnt || 0) > 0;
}

async function ensureIndex(pool, tableName, indexName, ddl) {
	if (await indexExists(pool, tableName, indexName)) return;
	await pool.execute(ddl);
	console.log(`[indexes] Added ${tableName}.${indexName}`);
}

async function ensureAgencyLineIndexes(pool) {
	await ensureIndex(
		pool,
		'game_record',
		'idx_game_record_game_active',
		'ALTER TABLE game_record ADD INDEX idx_game_record_game_active (GAME_ID, ACTIVE)'
	);
	await ensureIndex(
		pool,
		'game_record',
		'idx_game_record_game_active_cage',
		'ALTER TABLE game_record ADD INDEX idx_game_record_game_active_cage (GAME_ID, ACTIVE, CAGE_TYPE)'
	);
	await ensureIndex(
		pool,
		'agent',
		'idx_agent_agency_active',
		'ALTER TABLE agent ADD INDEX idx_agent_agency_active (AGENCY, ACTIVE)'
	);
	await ensureIndex(
		pool,
		'account',
		'idx_account_agent_active',
		'ALTER TABLE account ADD INDEX idx_account_agent_active (AGENT_ID, ACTIVE)'
	);
	await ensureIndex(
		pool,
		'game_list',
		'idx_game_list_account_active',
		'ALTER TABLE game_list ADD INDEX idx_game_list_account_active (ACCOUNT_ID, ACTIVE)'
	);
	await ensureIndex(
		pool,
		'game_list',
		'idx_game_list_guest_active',
		'ALTER TABLE game_list ADD INDEX idx_game_list_guest_active (GUEST_ID, ACTIVE)'
	);
	await ensureIndex(
		pool,
		'account_ledger',
		'idx_account_ledger_account_active_type',
		'ALTER TABLE account_ledger ADD INDEX idx_account_ledger_account_active_type (ACCOUNT_ID, ACTIVE, TRANSACTION_TYPE)'
	);
	return false;
}

module.exports = { ensureAgencyLineIndexes };
