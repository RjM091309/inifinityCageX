/** Special permission levels stored in user_info.PERMISSIONS */
const VIEW_ONLY = 2;
const EXPENSE_HANDLER = -1;

/** Routes the expense handler role may read and write */
const EXPENSE_ROUTE_PREFIXES = [
	'/house_expense',
	'/expense_category',
	'/add_expense_category',
	'/expense_category/',
	'/add_junket_house_expense',
	'/junket_house_expense',
	'/add_return_money',
	'/edit_return_money',
	'/remove_return_money',
	'/expense_settlement_info',
	'/expense_daily_settlement'
];

function isExpenseRoute(path) {
	const normalized = String(path || '').split('?')[0];
	return EXPENSE_ROUTE_PREFIXES.some((prefix) => {
		return normalized === prefix || normalized.startsWith(prefix);
	});
}

/**
 * True when user should not add/edit/delete on the given request path.
 * Permission 2 = view-only everywhere.
 * Permission -1 = view-only except expense routes.
 */
function isViewOnlyUser(permissions, reqPath) {
	const perms = Number(permissions);
	if (perms === VIEW_ONLY) return true;
	if (perms === EXPENSE_HANDLER) return !isExpenseRoute(reqPath);
	return false;
}

function blockViewOnlyWrites(req, res, next) {
	const method = String(req.method || 'GET').toUpperCase();
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();

	const path = req.originalUrl || req.path || '';
	const exemptPrefixes = ['/login', '/logout', '/change-lang', '/check-permission'];
	if (exemptPrefixes.some((prefix) => path === prefix || path.startsWith(prefix + '?'))) {
		return next();
	}

	const perms = req.session?.permissions;
	if (!isViewOnlyUser(perms, path)) return next();

	if (req.xhr || req.headers.accept?.includes('application/json')) {
		return res.status(403).json({ error: 'View only access' });
	}
	return res.status(403).send('View only access');
}

function roleDisplayName(permissions) {
	const perms = Number(permissions);
	if (perms === EXPENSE_HANDLER) return 'Expense Handler';
	if (perms === 0) return 'Super Admin';
	return 'Super Admin';
}

/** Only Expense Handler may create main/sub expense categories. */
function canAddExpenseCategory(permissions) {
	return Number(permissions) === EXPENSE_HANDLER;
}

module.exports = {
	VIEW_ONLY,
	EXPENSE_HANDLER,
	EXPENSE_ROUTE_PREFIXES,
	isExpenseRoute,
	isViewOnlyUser,
	blockViewOnlyWrites,
	roleDisplayName,
	canAddExpenseCategory
};
