const pool = require('../config/db');

(async () => {
	const [cols] = await pool.query(
		`SELECT COLUMN_NAME
		 FROM INFORMATION_SCHEMA.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE()
		   AND TABLE_NAME = 'game_list'
		   AND COLUMN_NAME IN ('CUTOFF_PARENT_GAME_ID', 'CUTOFF_CONTINUED_GAME_ID')`
	);
	const existing = new Set(cols.map((r) => r.COLUMN_NAME));

	if (!existing.has('CUTOFF_PARENT_GAME_ID')) {
		await pool.query(
			`ALTER TABLE game_list
			 ADD COLUMN CUTOFF_PARENT_GAME_ID INT NULL DEFAULT NULL
			 COMMENT 'Previous game ID (cut off source)'`
		);
		console.log('Added CUTOFF_PARENT_GAME_ID');
	}

	if (!existing.has('CUTOFF_CONTINUED_GAME_ID')) {
		await pool.query(
			`ALTER TABLE game_list
			 ADD COLUMN CUTOFF_CONTINUED_GAME_ID INT NULL DEFAULT NULL
			 COMMENT 'Next game ID (cut off continuation)'`
		);
		console.log('Added CUTOFF_CONTINUED_GAME_ID');
	}

	if (existing.has('CUTOFF_PARENT_GAME_ID') && existing.has('CUTOFF_CONTINUED_GAME_ID')) {
		console.log('Columns already exist');
	}

	await pool.end();
})().catch(async (err) => {
	console.error(err.message);
	try { await pool.end(); } catch (_) { /* ignore */ }
	process.exit(1);
});
