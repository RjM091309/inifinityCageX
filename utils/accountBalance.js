const pool = require('../config/db');

/** Cash/deposit balance from ledger — excludes Credit/IOU. Matches Guest Portal total balance. */
async function getCurrentBalance(accountId) {
	const [rows] = await pool.query(
		`
			SELECT transaction_type.TRANSACTION, account_ledger.AMOUNT
			FROM account_ledger
			JOIN transaction_type ON transaction_type.IDNo = account_ledger.TRANSACTION_ID
			WHERE account_ledger.TRANSACTION_TYPE IN (2, 5, 3)
			  AND account_ledger.ACCOUNT_ID = ?
			  AND account_ledger.ACTIVE = 1
		`,
		[accountId]
	);

	let deposit_amount = 0;
	let withdraw_amount = 0;
	let marker_redeem_amount = 0;
	let marker_return_deposit = 0;

	rows.forEach((row) => {
		const amount = parseFloat(row.AMOUNT) || 0;
		if (row.TRANSACTION === 'DEPOSIT') deposit_amount += amount;
		if (row.TRANSACTION === 'WITHDRAW') withdraw_amount += amount;
		if (row.TRANSACTION === 'MARKER REDEEM') marker_redeem_amount += amount;
		if (row.TRANSACTION === 'IOU RETURN DEPOSIT') marker_return_deposit += amount;
	});

	return deposit_amount + marker_redeem_amount - withdraw_amount - marker_return_deposit;
}

/**
 * Resolve the guest account for a Telegram chat id.
 * When an agent has multiple accounts, prefer the active account with the latest ledger activity.
 */
async function resolveGuestAccountByTelegramId(telegramId) {
	const chatId = String(telegramId ?? '').trim();
	if (!chatId) return null;

	const [rows] = await pool.query(
		`
			SELECT
				agent.AGENT_CODE,
				agent.NAME,
				account.IDNo AS ACCOUNT_ID
			FROM agent
			INNER JOIN account ON account.AGENT_ID = agent.IDNo AND account.ACTIVE = 1
			WHERE TRIM(CAST(agent.TELEGRAM_ID AS CHAR)) = ?
			  AND agent.ACTIVE = 1
			ORDER BY (
				SELECT COALESCE(MAX(account_ledger.ENCODED_DT), account.ENCODED_DT)
				FROM account_ledger
				WHERE account_ledger.ACCOUNT_ID = account.IDNo
				  AND account_ledger.ACTIVE = 1
			) DESC,
			account.IDNo DESC
			LIMIT 1
		`,
		[chatId]
	);

	return rows[0] || null;
}

module.exports = {
	getCurrentBalance,
	resolveGuestAccountByTelegramId
};
