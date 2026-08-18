/**
 * Idempotent DB setup for asset management tables.
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

async function ensureAssetManagementSchema(pool) {
	if (!(await tableExists(pool, 'company_asset'))) {
		await pool.execute(`
			CREATE TABLE IF NOT EXISTS company_asset (
				IDNo INT NOT NULL AUTO_INCREMENT,
				ASSET_NAME VARCHAR(200) NOT NULL,
				ASSET_TYPE VARCHAR(50) NOT NULL DEFAULT 'Current Asset',
				CATEGORY VARCHAR(100) NULL DEFAULT NULL,
				SERIAL_NO VARCHAR(100) NULL DEFAULT NULL,
				PURCHASE_DATE DATE NULL DEFAULT NULL,
				PURCHASE_COST DECIMAL(15,2) NOT NULL DEFAULT 0,
				CURRENT_VALUE DECIMAL(15,2) NOT NULL DEFAULT 0,
				DEPRECIATION_RATE DECIMAL(5,2) NULL DEFAULT NULL,
				LOCATION VARCHAR(150) NULL DEFAULT NULL,
				IN_CHARGE VARCHAR(150) NULL DEFAULT NULL,
				STATUS VARCHAR(50) NOT NULL DEFAULT 'Active',
				REMARKS VARCHAR(500) NULL DEFAULT NULL,
				ACTIVE TINYINT NOT NULL DEFAULT 1,
				ENCODED_BY INT NULL DEFAULT NULL,
				ENCODED_DT DATETIME NOT NULL,
				EDITED_BY INT NULL DEFAULT NULL,
				EDITED_DT DATETIME NULL DEFAULT NULL,
				PRIMARY KEY (IDNo),
				KEY idx_company_asset_active (ACTIVE),
				KEY idx_company_asset_type (ASSET_TYPE, ACTIVE)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
		`);
		console.log('[asset_management] company_asset table ready');
	}

	if (!(await tableExists(pool, 'company_liability'))) {
		await pool.execute(`
			CREATE TABLE IF NOT EXISTS company_liability (
				IDNo INT NOT NULL AUTO_INCREMENT,
				DESCRIPTION VARCHAR(500) NOT NULL,
				CREDITOR VARCHAR(150) NULL DEFAULT NULL,
				LIABILITY_TYPE VARCHAR(50) NOT NULL DEFAULT 'Current Liability',
				CATEGORY VARCHAR(100) NULL DEFAULT NULL,
				AMOUNT DECIMAL(15,2) NOT NULL DEFAULT 0,
				AMOUNT_PAID DECIMAL(15,2) NOT NULL DEFAULT 0,
				DUE_DATE DATE NULL DEFAULT NULL,
				INTEREST_RATE DECIMAL(5,2) NULL DEFAULT NULL,
				STATUS VARCHAR(50) NOT NULL DEFAULT 'Outstanding',
				REMARKS VARCHAR(500) NULL DEFAULT NULL,
				ACTIVE TINYINT NOT NULL DEFAULT 1,
				ENCODED_BY INT NULL DEFAULT NULL,
				ENCODED_DT DATETIME NOT NULL,
				EDITED_BY INT NULL DEFAULT NULL,
				EDITED_DT DATETIME NULL DEFAULT NULL,
				PRIMARY KEY (IDNo),
				KEY idx_company_liability_active (ACTIVE),
				KEY idx_company_liability_type (LIABILITY_TYPE, ACTIVE)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
		`);
		console.log('[asset_management] company_liability table ready');
	}

	if (!(await tableExists(pool, 'company_capital'))) {
		await pool.execute(`
			CREATE TABLE IF NOT EXISTS company_capital (
				IDNo INT NOT NULL AUTO_INCREMENT,
				DESCRIPTION VARCHAR(200) NOT NULL DEFAULT 'Capital',
				AMOUNT DECIMAL(15,2) NOT NULL DEFAULT 0,
				REMARKS VARCHAR(500) NULL DEFAULT NULL,
				ACTIVE TINYINT NOT NULL DEFAULT 1,
				ENCODED_BY INT NULL DEFAULT NULL,
				ENCODED_DT DATETIME NOT NULL,
				EDITED_BY INT NULL DEFAULT NULL,
				EDITED_DT DATETIME NULL DEFAULT NULL,
				PRIMARY KEY (IDNo),
				KEY idx_company_capital_active (ACTIVE)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
		`);
		console.log('[asset_management] company_capital table ready');
	} else if (!(await columnExists(pool, 'company_capital', 'DESCRIPTION'))) {
		await pool.execute(`ALTER TABLE company_capital ADD COLUMN DESCRIPTION VARCHAR(200) NOT NULL DEFAULT 'Capital' AFTER IDNo`);
	}

	if (!(await tableExists(pool, 'income_statement'))) {
		await pool.execute(`
			CREATE TABLE IF NOT EXISTS income_statement (
				IDNo INT NOT NULL AUTO_INCREMENT,
				SALES DECIMAL(15,2) NOT NULL DEFAULT 0,
				COST_OF_SALES DECIMAL(15,2) NOT NULL DEFAULT 0,
				ACTIVE TINYINT NOT NULL DEFAULT 1,
				ENCODED_BY INT NULL DEFAULT NULL,
				ENCODED_DT DATETIME NOT NULL,
				EDITED_BY INT NULL DEFAULT NULL,
				EDITED_DT DATETIME NULL DEFAULT NULL,
				PRIMARY KEY (IDNo),
				KEY idx_income_statement_active (ACTIVE)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
		`);
		console.log('[asset_management] income_statement table ready');
	}

	if (!(await tableExists(pool, 'income_statement_opex'))) {
		await pool.execute(`
			CREATE TABLE IF NOT EXISTS income_statement_opex (
				IDNo INT NOT NULL AUTO_INCREMENT,
				INCOME_STATEMENT_ID INT NOT NULL,
				DESCRIPTION VARCHAR(200) NOT NULL,
				AMOUNT DECIMAL(15,2) NOT NULL DEFAULT 0,
				SORT_ORDER INT NOT NULL DEFAULT 0,
				ACTIVE TINYINT NOT NULL DEFAULT 1,
				ENCODED_BY INT NULL DEFAULT NULL,
				ENCODED_DT DATETIME NOT NULL,
				EDITED_BY INT NULL DEFAULT NULL,
				EDITED_DT DATETIME NULL DEFAULT NULL,
				PRIMARY KEY (IDNo),
				KEY idx_income_opex_stmt (INCOME_STATEMENT_ID, ACTIVE)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
		`);
		console.log('[asset_management] income_statement_opex table ready');
	}
}

module.exports = { ensureAssetManagementSchema };
