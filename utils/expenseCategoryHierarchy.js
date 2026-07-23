/** SQL helpers for expense_category main/sub hierarchy (PARENT_ID). */

const EXPENSE_CATEGORY_PARENT_JOIN = `
JOIN expense_category ec ON ec.IDNo = e.CATEGORY_ID
LEFT JOIN expense_category ec_parent ON ec_parent.IDNo = ec.PARENT_ID`;

const EXPENSE_ROW_CATEGORY_FIELDS = `
ec.IDNo AS expense_category_id,
COALESCE(ec_parent.IDNo, ec.IDNo) AS expense_main_category_id,
ec.PARENT_ID AS expense_parent_id,
COALESCE(ec_parent.CATEGORY, ec.CATEGORY) COLLATE utf8mb4_unicode_ci AS expense_main_category,
CASE WHEN ec.PARENT_ID IS NOT NULL THEN ec.CATEGORY ELSE NULL END COLLATE utf8mb4_unicode_ci AS expense_sub_category,
CASE
	WHEN ec.PARENT_ID IS NOT NULL THEN CONCAT(ec_parent.CATEGORY, ' \u203A ', ec.CATEGORY)
	ELSE ec.CATEGORY
END COLLATE utf8mb4_unicode_ci AS expense_category,
ec.TYPE AS expense_type`;

const RETURN_MONEY_CATEGORY_FIELDS = `
NULL AS expense_category_id,
NULL AS expense_main_category_id,
NULL AS expense_parent_id,
'Return Money' COLLATE utf8mb4_unicode_ci AS expense_main_category,
NULL AS expense_sub_category,
'Return Money' COLLATE utf8mb4_unicode_ci AS expense_category,
0 AS expense_type`;

let parentIdColumnReady = false;

async function ensureExpenseCategoryParentIdColumn(pool) {
	if (parentIdColumnReady) return true;
	try {
		const [cols] = await pool.execute(
			`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
			 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_category' AND COLUMN_NAME = 'PARENT_ID'`
		);
		if (!cols.length) {
			await pool.execute(
				'ALTER TABLE expense_category ADD COLUMN PARENT_ID INT NULL DEFAULT NULL AFTER CATEGORY'
			);
			try {
				await pool.execute(
					'ALTER TABLE expense_category ADD INDEX idx_expense_category_parent (PARENT_ID)'
				);
			} catch (e) {
				// index may already exist
			}
			console.log('✅ Added expense_category.PARENT_ID column');
		}
		parentIdColumnReady = true;
		return true;
	} catch (err) {
		console.error('ensureExpenseCategoryParentIdColumn:', err.message);
		return false;
	}
}

function normalizeExpenseCategoryRows(rows) {
	return (rows || []).map((row) => {
		const parentId = row.PARENT_ID != null ? Number(row.PARENT_ID) : null;
		const isSub = parentId != null && !Number.isNaN(parentId);
		return {
			...row,
			PARENT_ID: isSub ? parentId : null,
			is_main: !isSub,
			is_sub: isSub
		};
	});
}

function buildExpenseCategoryTree(rows) {
	const normalized = normalizeExpenseCategoryRows(rows);
	const mains = normalized
		.filter((r) => r.is_main)
		.sort((a, b) => String(a.CATEGORY).localeCompare(String(b.CATEGORY), undefined, { sensitivity: 'base' }));
	const subsByParent = {};
	normalized
		.filter((r) => r.is_sub)
		.forEach((r) => {
			const pid = r.PARENT_ID;
			if (!subsByParent[pid]) subsByParent[pid] = [];
			subsByParent[pid].push(r);
		});
	Object.keys(subsByParent).forEach((pid) => {
		subsByParent[pid].sort((a, b) =>
			String(a.CATEGORY).localeCompare(String(b.CATEGORY), undefined, { sensitivity: 'base' })
		);
	});
	return mains.map((main) => ({
		...main,
		children: subsByParent[main.IDNo] || []
	}));
}

module.exports = {
	EXPENSE_CATEGORY_PARENT_JOIN,
	EXPENSE_ROW_CATEGORY_FIELDS,
	RETURN_MONEY_CATEGORY_FIELDS,
	ensureExpenseCategoryParentIdColumn,
	normalizeExpenseCategoryRows,
	buildExpenseCategoryTree
};
