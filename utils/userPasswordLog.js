const pool = require('../config/db');

let tableEnsured = false;
let ensurePromise = null;

async function ensureUserPasswordLogTable() {
	if (tableEnsured) return;
	if (!ensurePromise) {
		ensurePromise = pool
			.query(
				`CREATE TABLE IF NOT EXISTS user_password_logs (
					IDNo INT NOT NULL AUTO_INCREMENT,
					USER_ID INT NOT NULL,
					USERNAME VARCHAR(255) DEFAULT NULL,
					ENCODED_BY INT DEFAULT NULL,
					ENCODED_DT DATETIME NOT NULL,
					PRIMARY KEY (IDNo),
					KEY idx_user_password_logs_user (USER_ID),
					KEY idx_user_password_logs_dt (ENCODED_DT)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
			)
			.then(() => {
				tableEnsured = true;
			})
			.catch((err) => {
				ensurePromise = null;
				throw err;
			});
	}
	await ensurePromise;
}

async function logUserPasswordChange({ userId, username, encodedBy, encodedDt }) {
	await ensureUserPasswordLogTable();
	await pool.execute(
		`INSERT INTO user_password_logs (USER_ID, USERNAME, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?)`,
		[userId, username || null, encodedBy || null, encodedDt || new Date()]
	);
}

module.exports = {
	ensureUserPasswordLogTable,
	logUserPasswordChange,
};
