/**
 * Idempotent DB setup: guest table, game_list.GUEST_ID.
 * Guests exist only when added to the guest table — never auto-created from agent.
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

async function indexExists(pool, tableName, indexName) {
	const [rows] = await pool.execute(
		`SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
		[tableName, indexName]
	);
	return Number(rows[0]?.cnt || 0) > 0;
}

/** One-time: remove guests that were auto-copied from agent name/code during migration. */
async function cleanupMigrationPlaceholderGuests(pool) {
	if (!(await tableExists(pool, 'guest'))) return;

	if (!(await tableExists(pool, 'app_schema_flags'))) {
		await pool.execute(`
			CREATE TABLE IF NOT EXISTS app_schema_flags (
				flag_key VARCHAR(64) NOT NULL,
				applied_at DATETIME NOT NULL,
				PRIMARY KEY (flag_key)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
		`);
	}

	const flagKey = 'guest_placeholder_cleanup_v1';
	const [flagRows] = await pool.execute(
		`SELECT flag_key FROM app_schema_flags WHERE flag_key = ? LIMIT 1`,
		[flagKey]
	);
	if (flagRows.length) return;

	const [placeholderRows] = await pool.execute(
		`SELECT g.IDNo AS guest_id
		 FROM guest g
		 INNER JOIN agent ag ON ag.IDNo = g.AGENT_ID
		 WHERE g.ACTIVE = 1
		   AND (
		     TRIM(UPPER(g.NAME)) = TRIM(UPPER(ag.NAME))
		     OR TRIM(UPPER(g.NAME)) = TRIM(UPPER(ag.AGENT_CODE))
		   )`
	);

	if (placeholderRows.length) {
		const guestIds = placeholderRows.map((row) => row.guest_id);
		const placeholders = guestIds.map(() => '?').join(',');

		if (await columnExists(pool, 'game_list', 'GUEST_ID')) {
			const [gameResult] = await pool.execute(
				`UPDATE game_list SET GUEST_ID = NULL WHERE GUEST_ID IN (${placeholders})`,
				guestIds
			);
			if (gameResult.affectedRows > 0) {
				console.log(`[guest] Cleared GUEST_ID on ${gameResult.affectedRows} game(s) linked to migration placeholders`);
			}
		}

		const [guestResult] = await pool.execute(
			`UPDATE guest SET ACTIVE = 0, EDITED_DT = NOW() WHERE IDNo IN (${placeholders}) AND ACTIVE = 1`,
			guestIds
		);
		if (guestResult.affectedRows > 0) {
			console.log(`[guest] Deactivated ${guestResult.affectedRows} migration placeholder guest(s)`);
		}
	}

	await pool.execute(
		`INSERT INTO app_schema_flags (flag_key, applied_at) VALUES (?, NOW())`,
		[flagKey]
	);
}

async function ensureGuestSchema(pool) {
	if (!(await tableExists(pool, 'guest'))) {
		await pool.execute(`
			CREATE TABLE IF NOT EXISTS guest (
				IDNo INT NOT NULL AUTO_INCREMENT,
				AGENT_ID INT NOT NULL COMMENT 'agent.IDNo',
				NAME VARCHAR(150) NOT NULL,
				MEMBERSHIP_NO VARCHAR(50) NULL DEFAULT NULL,
				REMARKS VARCHAR(500) NULL DEFAULT NULL,
				TELEGRAM_ID VARCHAR(50) NULL DEFAULT NULL,
				ACTIVE TINYINT NOT NULL DEFAULT 1,
				ENCODED_BY INT NULL DEFAULT NULL,
				ENCODED_DT DATETIME NOT NULL,
				EDITED_BY INT NULL DEFAULT NULL,
				EDITED_DT DATETIME NULL DEFAULT NULL,
				PRIMARY KEY (IDNo),
				KEY idx_guest_agent_id (AGENT_ID, ACTIVE),
				KEY idx_guest_active (ACTIVE)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
		`);
		console.log('[guest] Created table guest');
	}

	if (await tableExists(pool, 'guest') && !(await columnExists(pool, 'guest', 'TELEGRAM_ID'))) {
		await pool.execute(
			`ALTER TABLE guest
			 ADD COLUMN TELEGRAM_ID VARCHAR(50) NULL DEFAULT NULL AFTER REMARKS`
		);
		console.log('[guest] Added column TELEGRAM_ID');
	}

	if (await tableExists(pool, 'guest') && !(await columnExists(pool, 'guest', 'TELEGRAM_ENABLED'))) {
		await pool.execute(
			`ALTER TABLE guest
			 ADD COLUMN TELEGRAM_ENABLED TINYINT NOT NULL DEFAULT 1 AFTER TELEGRAM_ID`
		);
		console.log('[guest] Added column TELEGRAM_ENABLED');
	}

	if (await tableExists(pool, 'game_list') && !(await columnExists(pool, 'game_list', 'GUEST_ID'))) {
		await pool.execute(
			`ALTER TABLE game_list
			 ADD COLUMN GUEST_ID INT NULL DEFAULT NULL COMMENT 'guest.IDNo' AFTER ACCOUNT_ID`
		);
		if (!(await indexExists(pool, 'game_list', 'idx_game_list_guest_id'))) {
			await pool.execute(`ALTER TABLE game_list ADD KEY idx_game_list_guest_id (GUEST_ID)`);
		}
		console.log('[game_list] Added column GUEST_ID');
	}

	if (await tableExists(pool, 'account_ledger') && !(await columnExists(pool, 'account_ledger', 'GUEST_ID'))) {
		await pool.execute(
			`ALTER TABLE account_ledger
			 ADD COLUMN GUEST_ID INT NULL DEFAULT NULL COMMENT 'guest.IDNo' AFTER GAME_ID`
		);
		if (!(await indexExists(pool, 'account_ledger', 'idx_account_ledger_guest_id'))) {
			await pool.execute(`ALTER TABLE account_ledger ADD KEY idx_account_ledger_guest_id (GUEST_ID)`);
		}
		console.log('[account_ledger] Added column GUEST_ID');
	}

	await cleanupMigrationPlaceholderGuests(pool);

	if (!(await tableExists(pool, 'game_guest_history'))) {
		await pool.execute(`
			CREATE TABLE IF NOT EXISTS game_guest_history (
				IDNo INT NOT NULL AUTO_INCREMENT,
				GAME_ID INT NOT NULL,
				PREV_GUEST_ID INT NULL DEFAULT NULL,
				NEW_GUEST_ID INT NULL DEFAULT NULL,
				ENCODED_BY INT NULL DEFAULT NULL,
				ENCODED_DT DATETIME NOT NULL,
				PRIMARY KEY (IDNo),
				KEY idx_ggh_game_dt (GAME_ID, ENCODED_DT)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
		`);
		console.log('[guest] Created table game_guest_history');
	}

	return false;
}

module.exports = { ensureGuestSchema };
