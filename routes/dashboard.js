const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const { checkSession, sessions } = require('./auth');
const { sendTelegramMessage } = require('../utils/telegram');
const ExcelJS = require('exceljs');



router.get("/dashboard", checkSession, async (req, res) => {
	console.log("Session Data:", req.session);

	const permissions = req.session.permissions;
	if (permissions === undefined) {
		console.error("Permissions are undefined");
		return res.status(500).send("Permissions are undefined");
	}

	let sqlWinlossManual = 'SELECT SUM(AMOUNT) AS WINLOSS FROM winloss WHERE RESET=1';
	let sqlTotalRollingManual = 'SELECT SUM(AMOUNT) AS TOTAL_ROLLING FROM total_rolling WHERE RESET=1';

	let sqlJunketExpenseReset = 'SELECT SUM(AMOUNT) AS RESET_EXPENSE FROM junket_house_expense WHERE ACTIVE =1 AND RESET=1';
	let sqlCCChipsCashoutReset = 'SELECT  SUM(CC_CHIPS) AS CCResetCashout FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2 AND RESET=1';

	let sqlTotalRollingReset = 'SELECT SUM(NN_CHIPS + CC_CHIPS) AS RESET_ROLLING FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE IN (3,4) AND RESET=1';
	let sqlTotalCashOutRollingReset = 'SELECT SUM(NN_CHIPS) AS RESET_CASHOUT FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 2 AND RESET=1';

	let sqlTotalCashOutReset = 'SELECT SUM(NN_CHIPS + CC_CHIPS) AS CASHOUT_RESET FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 2 AND RESET=1';
	let sqlWinLossReset = 'SELECT SUM(NN_CHIPS + CC_CHIPS) AS RESET_CASHIN FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND RESET=1';

	let sqlWinLossLive = `SELECT 
    winloss.GAMEId,
    winloss.CASHIN_LIVE,
    winloss.houseshare,
    IFNULL(cashout.CASHOUT_LIVE, 0) AS CASHOUT_LIVE
FROM 
    (SELECT 
        game_record.GAME_ID AS GAMEId, 
        SUM(game_record.NN_CHIPS + game_record.CC_CHIPS) AS CASHIN_LIVE, 
        game_list.HOUSE_SHARE AS houseshare 
     FROM 
        game_record  
     LEFT JOIN 
        game_list ON game_list.IDNo = game_record.GAME_ID
     WHERE 
        game_list.ACTIVE IN (1, 2)
        AND game_list.GAME_TYPE = "LIVE"
        AND game_record.CAGE_TYPE = 1
        AND game_record.RESET = 1
        AND game_record.ACTIVE = 1 
     GROUP BY 
        game_record.GAME_ID) AS winloss
LEFT JOIN 
    (SELECT 
        game_record.GAME_ID,
        SUM(game_record.NN_CHIPS + game_record.CC_CHIPS) AS CASHOUT_LIVE
     FROM 
        game_record
     WHERE 
        game_record.ACTIVE = 1 
        AND game_record.CAGE_TYPE = 2 
        AND game_record.RESET = 1
     GROUP BY 
        game_record.GAME_ID) AS cashout 
ON 
    winloss.GAMEId = cashout.GAME_ID`;

	let sqlWinLossTelebet = `SELECT 
    winloss.GAMEId,
    winloss.CASHIN_TELEBET,
    winloss.houseshare,
    IFNULL(cashout.CASHOUT_TELEBET, 0) AS CASHOUT_TELEBET
FROM 
    (SELECT 
        game_record.GAME_ID AS GAMEId, 
        SUM(game_record.NN_CHIPS + game_record.CC_CHIPS) AS CASHIN_TELEBET, 
        game_list.HOUSE_SHARE AS houseshare 
     FROM 
        game_record  
     LEFT JOIN 
        game_list ON game_list.IDNo = game_record.GAME_ID
     WHERE 
        game_list.ACTIVE IN (1, 2)
        AND game_list.GAME_TYPE = "TELEBET"
        AND game_record.CAGE_TYPE = 1
        AND game_record.RESET = 1
        AND game_record.ACTIVE = 1 
     GROUP BY 
        game_record.GAME_ID) AS winloss
LEFT JOIN 
    (SELECT 
        game_record.GAME_ID,
        SUM(game_record.NN_CHIPS + game_record.CC_CHIPS) AS CASHOUT_TELEBET
     FROM 
        game_record
     WHERE 
        game_record.ACTIVE = 1 
        AND game_record.CAGE_TYPE = 2 
        AND game_record.RESET = 1
     GROUP BY 
        game_record.GAME_ID) AS cashout 
ON 
    winloss.GAMEId = cashout.GAME_ID`;

	let sqlCommissionReset = `SELECT 
		rolling.GAME_ID,
		rolling.TOTAL_ROLLING,
		rolling.percentage,
		IFNULL(cashout.TOTAL_CASHOUT, 0) AS TOTAL_CASHOUT
	FROM
		(SELECT 
			game_record.GAME_ID,
			SUM(
				CASE 
					WHEN game_record.CAGE_TYPE IN (3, 4) THEN game_record.NN_CHIPS + game_record.CC_CHIPS
					WHEN game_record.CAGE_TYPE = 5 AND game_record.ROLLER_TRANSACTION = 2 THEN game_record.ROLLER_CC_CHIPS
					ELSE 0
				END
			) AS TOTAL_ROLLING,
			game_list.COMMISSION_PERCENTAGE AS percentage
		 FROM game_record
		 LEFT JOIN game_list ON game_list.IDNo = game_record.GAME_ID
		 WHERE game_list.ACTIVE IN (1, 2) 
		   AND game_list.COMMISSION_TYPE = 1 
		   AND game_list.SETTLED = 1 
		   AND game_record.RESET = 1 
		   AND game_record.ACTIVE = 1
		 GROUP BY game_record.GAME_ID) AS rolling
	LEFT JOIN
		(SELECT 
			game_record.GAME_ID,
			SUM(game_record.NN_CHIPS) AS TOTAL_CASHOUT
		 FROM game_record
		 WHERE game_record.CAGE_TYPE = 2 
       AND game_record.RESET = 1 
	   AND game_record.ACTIVE = 1
		 GROUP BY game_record.GAME_ID) AS cashout
	ON rolling.GAME_ID = cashout.GAME_ID`;

	let sqlSharedRollingReset = `SELECT SUM(game_record.NN_CHIPS + game_record.CC_CHIPS) AS TOTAL_ROLLING, game_list.COMMISSION_PERCENTAGE AS percentage 
		FROM game_record 
		LEFT JOIN game_list ON game_list.IDNo = game_record.GAME_ID
		WHERE game_list.ACTIVE IN (1,2) AND game_list.COMMISSION_TYPE = 2 AND game_record.CAGE_TYPE = 1 AND SETTLED = 1 AND RESET = 1 AND game_record.ACTIVE = 1
		GROUP BY game_record.GAME_ID`;

	let sqlSharedCashoutReset = `SELECT SUM(game_record.NN_CHIPS) AS TOTAL_CASHOUT 
		FROM game_record 
		LEFT JOIN game_list ON game_list.IDNo = game_record.GAME_ID
		WHERE game_list.ACTIVE IN (1,2) AND game_list.COMMISSION_TYPE = 2 AND game_record.CAGE_TYPE = 2 AND SETTLED = 1 AND RESET = 1 AND game_record.ACTIVE = 1
		GROUP BY game_record.GAME_ID`;

	let sqlSharedCashoutCCReset = `SELECT SUM(game_record.CC_CHIPS) AS TOTAL_CASHOUT_CC 
		FROM game_record 
		LEFT JOIN game_list ON game_list.IDNo = game_record.GAME_ID
		WHERE game_list.ACTIVE IN (1,2) AND game_list.COMMISSION_TYPE = 2 AND game_record.CAGE_TYPE = 2 AND SETTLED = 1 AND RESET = 1 and game_record.ACTIVE = 1
		GROUP BY game_record.GAME_ID`;


	let sqlAgentCount = 'SELECT COUNT(*) AS TOTAL_AGENT FROM agent WHERE ACTIVE =1';
	let sqlJunketCredit = 'SELECT SUM(AMOUNT) AS JUNKET_CREDIT FROM junket_credit WHERE ACTIVE =1';
	let sqlJunketExpense = 'SELECT SUM(AMOUNT) AS JUNKET_EXPENSE FROM junket_house_expense WHERE ACTIVE =1';
	let sqlJunketExpenseGoods = `
		SELECT SUM(jhe.AMOUNT) AS JUNKET_EXPENSE_GOODS
		FROM junket_house_expense jhe
		JOIN expense_category ec ON ec.IDNo = jhe.CATEGORY_ID
		WHERE jhe.ACTIVE = 1
			AND ec.TYPE = 1
	`;
	let sqlJunketExpenseNonGoods = `
		SELECT SUM(jhe.AMOUNT) AS JUNKET_EXPENSE_NON_GOODS
		FROM junket_house_expense jhe
		JOIN expense_category ec ON ec.IDNo = jhe.CATEGORY_ID
		WHERE jhe.ACTIVE = 1
			AND ec.TYPE = 2
	`;
	let sqlNNChipsReturnDeposit = 'SELECT SUM(NN_CHIPS) AS NN_DEPOSIT FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 2 AND TRANSACTION = 2';
	let sqlCageRolling = 'SELECT SUM(ROLLING_AMOUNT) AS ROLLING_AMOUNT FROM cage_rolling WHERE ACTIVE =1';
	let sqlNNChipsAccountMarker = 'SELECT SUM(NN_CHIPS) AS TOTAL_NN_MARKER FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 2 AND TRANSACTION = 3';
	let sqlCCChipsBuyinGame = 'SELECT SUM(CC_CHIPS) AS TOTAL_CC FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION IN (1 , 2, 3)';
	let sqlNNChipsAccountCash = 'SELECT SUM(NN_CHIPS) AS TOTAL_NN_CASH FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION = 1';
	let sqlCCChipsAccountCash = 'SELECT SUM(CC_CHIPS) AS TOTAL_CC_CASH FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION = 1';
	let sqlNNChipsAccountDeposit = 'SELECT SUM(NN_CHIPS) AS TOTAL_NN_DEPOSIT FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION = 2';
	let sqlCCChipsCashout = 'SELECT  SUM(CC_CHIPS) AS CCChipsCashout FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2';
	let sqlCCReturn = 'SELECT  SUM(CC_CHIPS) AS CCReturn FROM junket_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2';
	let sqlNNChipsCashout = 'SELECT  SUM(NN_CHIPS) AS NNChipsCashout FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2';
	let sqlNNReturn = 'SELECT  SUM(NN_CHIPS) AS NNReturn FROM junket_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2';
	let sqlTotalChipsCashout = 'SELECT  SUM(TOTAL_CHIPS) AS TotalChipsCashout FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2';
	let sqlCCChipsRolling = 'SELECT  SUM(CC_CHIPS) AS CCChipsRolling FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=3';
	let sqlNNChipsRolling = 'SELECT  SUM(NN_CHIPS) AS NNChipsRolling FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=3';
	let sqlTotalChipsRolling = 'SELECT  SUM(TOTAL_CHIPS) AS TotalChipsRolling FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=3';
	let sqlCCChipsBuyin = 'SELECT  SUM(CC_CHIPS) AS CCChipsBuyin FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=1';
	let sqlCCBuyin = 'SELECT  SUM(CC_CHIPS) AS CCBuyin FROM junket_chips WHERE ACTIVE=1 AND TRANSACTION_ID=1';
	let sqlNNChipsBuyin = 'SELECT  SUM(NN_CHIPS) AS NNChipsBuyin FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=1';
	let sqlNNBuyin = 'SELECT  SUM(NN_CHIPS) AS NNBuyin FROM junket_chips WHERE ACTIVE=1 AND TRANSACTION_ID=1';
	let sqlAccountTransfer = `
	  SELECT 
		SUM(account_ledger.AMOUNT) AS ACCOUNT_TRANSFER
	  FROM 
		account_ledger
	  JOIN 
		account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN 
		agent ON agent.IDNo = account.AGENT_ID
	  WHERE 
		account_ledger.ACTIVE = 1 AND 
		account_ledger.TRANSACTION_ID = 1 AND 
		account_ledger.TRANSFER = 1 AND 
		account.ACTIVE = 1 AND 
		agent.ACTIVE = 1
	`;

	let sqlTotalChipsBuyin = 'SELECT  SUM(TOTAL_CHIPS) AS TotalChipsBuyin FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=1';
	let sqlCashDeposit = 'SELECT  SUM(AMOUNT) AS CASH_DEPOSIT FROM junket_capital WHERE ACTIVE=1 AND TRANSACTION_ID=1';
	let sqlCashWithdraw = 'SELECT  SUM(AMOUNT) AS CASH_WITHDRAW FROM junket_capital WHERE ACTIVE=1 AND TRANSACTION_ID=2';
	let sqlAccountDeposit = `
	  SELECT SUM(account_ledger.AMOUNT) AS ACCOUNT_DEPOSIT
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_TYPE = 2 
		AND account_ledger.TRANSACTION_ID = 1 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlAccountDeduct = `
	  SELECT SUM(account_ledger.AMOUNT) AS ACCOUNT_DEDUCT
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_ID = 2 
		 AND account_ledger.TRANSACTION_DESC NOT IN ('ACCOUNT DETAILS', 'SERVICES')
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlAccountWithdraw = `
	  SELECT SUM(account_ledger.AMOUNT) AS ACCOUNT_WITHDRAW
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_ID = 2 
		AND account_ledger.TRANSACTION_DESC = "ACCOUNT DETAILS" 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlAccountServicesDeduct = `
	  SELECT SUM(account_ledger.AMOUNT) AS ACCOUNT_DEDUCT_SERVICES
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_ID = 2 
		AND account_ledger.TRANSACTION_DESC = "SERVICES" 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlAccountSettlement = `
	  SELECT SUM(account_ledger.AMOUNT) AS ACCOUNT_SETTLEMENT
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_TYPE = 5 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlSettlementDepositAmount = `
	  SELECT SUM(account_ledger.AMOUNT) AS SETTLEMENT_DEPOSIT
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_TYPE = 5 
		AND account_ledger.TRANSACTION_ID = 1 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlSettlementCashOutAmount = `
	  SELECT SUM(account_ledger.AMOUNT) AS SETTLEMENT_CASHOUT
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_TYPE = 5 
		AND account_ledger.TRANSACTION_ID = 5 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlMArkerReturnCash = `
	  SELECT SUM(account_ledger.AMOUNT) AS MARKER_RETURN_CASH
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_TYPE = 3 
		AND account_ledger.TRANSACTION_ID = 11 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlMArkerReturnDeposit = `
	  SELECT SUM(account_ledger.AMOUNT) AS MARKER_RETURN_DEPOSIT
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_TYPE = 3 
		AND account_ledger.TRANSACTION_ID = 12 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlChipsReturnMarker = `
	  SELECT SUM(NN_CHIPS + CC_CHIPS) AS CHIPS_RETURN_MARKER
	  FROM game_record 
	  WHERE CAGE_TYPE = 2 AND TRANSACTION = 4
	  -- No JOIN needed unless you also need agent/account details
	`;

	let sqlAccountMarkerReturn = `
	  SELECT SUM(account_ledger.AMOUNT) AS MARKER_RETURN
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_TYPE = 4 
		AND account_ledger.TRANSACTION_ID = 1 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlAccountCCChips = 'SELECT SUM(CC_CHIPS) AS TOTAL_CC FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1';
	let sqlAccountNNChips = 'SELECT SUM(NN_CHIPS) AS TOTAL_NN FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1';

	let sqlMarkerIssueGame = 'SELECT SUM(NN_CHIPS + CC_CHIPS) AS TOTAL_ISSUE_GAME FROM game_record WHERE ACTIVE =1 AND TRANSACTION = 3 AND CAGE_TYPE = 1';
	let sqlMarkerIssueAccount = `
	  SELECT SUM(account_ledger.AMOUNT) AS TOTAL_ISSUE_RECORD
	  FROM account_ledger
	  JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID
	  JOIN agent ON agent.IDNo = account.AGENT_ID
	  WHERE account_ledger.ACTIVE = 1 
		AND account_ledger.TRANSACTION_ID = 3 
		AND account.ACTIVE = 1 
		AND agent.ACTIVE = 1
	`;

	let sqlTotalRealRolling = 'SELECT SUM(CC_CHIPS) AS TOTAL_REAL_ROLLING FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 4';
	let sqlTotalRolling = 'SELECT SUM(NN_CHIPS + CC_CHIPS) AS TOTAL_ROLLING FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE IN (3,4)';
	let sqlAccountCCChipsReturn = 'SELECT SUM(CC_CHIPS) AS CC_CHIPS_RETURN FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 2';
	let sqlTotalCashOutRolling = 'SELECT SUM(NN_CHIPS) AS TOTAL_CASHOUT FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 2';
	let sqlTotalCashOut = 'SELECT SUM(NN_CHIPS + CC_CHIPS) AS TOTAL_CASHOUT FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 2';

	let sqlWinLoss = 'SELECT SUM(NN_CHIPS + CC_CHIPS) AS TOTAL_CASHIN FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1';
	
let sqlServiceCashGuest = `
	SELECT SERVICE_TYPE, SUM(AMOUNT) AS TOTAL
	FROM game_services
	WHERE ACTIVE = 1 AND TRANSACTION_ID = 1 AND SOURCE_TYPE = 'GUEST'
	
`;
let sqlServiceDepositGuest = `
	SELECT SERVICE_TYPE, SUM(AMOUNT) AS TOTAL
	FROM game_services
	WHERE ACTIVE = 1 AND TRANSACTION_ID = 2 AND SOURCE_TYPE = 'GUEST'
	
`;
let sqlServiceCashJunket = `
	SELECT SERVICE_TYPE, SUM(AMOUNT) AS TOTAL
	FROM game_services
	WHERE ACTIVE = 1 AND TRANSACTION_ID = 1 AND SOURCE_TYPE = 'JUNKET'
	
`;
let sqlServiceDepositJunket = `
	SELECT SERVICE_TYPE, SUM(AMOUNT) AS TOTAL
	FROM game_services
	WHERE ACTIVE = 1 AND TRANSACTION_ID = 2 AND SOURCE_TYPE = 'JUNKET'
	
`;
let sqlServiceCommission = `
	SELECT SERVICE_TYPE, SUM(AMOUNT) AS TOTAL
	FROM game_services
	WHERE ACTIVE = 1 AND TRANSACTION_ID = 3
	
`;

	let sqlCommisionRolling = `SELECT 
			game_record.GAME_ID,
			SUM(
				CASE 
					WHEN game_record.CAGE_TYPE IN (3, 4) THEN game_record.NN_CHIPS + game_record.CC_CHIPS
					WHEN game_record.CAGE_TYPE = 5 AND game_record.ROLLER_TRANSACTION = 2 THEN game_record.ROLLER_CC_CHIPS
					ELSE 0
				END
			) AS TOTAL_ROLLING,
			game_list.COMMISSION_PERCENTAGE AS percentage
		FROM game_record
			LEFT JOIN game_list ON game_list.IDNo = game_record.GAME_ID
		WHERE game_list.ACTIVE IN (1,2)
			AND game_list.COMMISSION_TYPE = 1
			AND SETTLED = 1
		GROUP BY game_record.GAME_ID`;

	let sqlCommisionCashout = `SELECT SUM(game_record.NN_CHIPS + game_record.CC_CHIPS) AS TOTAL_CASHOUT FROM game_record 
			LEFT JOIN game_list ON game_list.IDNo = game_record.GAME_ID
			WHERE game_list.ACTIVE IN (1,2) AND game_list.COMMISSION_TYPE = 1 AND game_record.CAGE_TYPE = 2 AND SETTLED = 1 AND game_record.ACTIVE = 1 GROUP BY game_record.GAME_ID`;

	let sqlSharedRolling = `SELECT SUM(game_record.NN_CHIPS) AS TOTAL_ROLLING, game_list.COMMISSION_PERCENTAGE AS percentage FROM game_record 
			LEFT JOIN game_list ON game_list.IDNo = game_record.GAME_ID
			WHERE game_list.ACTIVE IN (1,2) AND game_list.COMMISSION_TYPE = 2 AND game_record.CAGE_TYPE IN (3,4) AND SETTLED = 1 GROUP BY game_record.GAME_ID`;

	let sqlSharedCashout = `SELECT SUM(game_record.NN_CHIPS) AS TOTAL_CASHOUT FROM game_record 
			LEFT JOIN game_list ON game_list.IDNo = game_record.GAME_ID
			WHERE game_list.ACTIVE IN (1,2) AND game_list.COMMISSION_TYPE = 2 AND game_record.CAGE_TYPE = 2 AND SETTLED = 1 GROUP BY game_record.GAME_ID`;

	let sqlSharedCashoutCC = `SELECT SUM(game_record.CC_CHIPS) AS TOTAL_CASHOUT_CC FROM game_record 
		LEFT JOIN game_list ON game_list.IDNo = game_record.GAME_ID
		WHERE game_list.ACTIVE IN (1,2) AND game_list.COMMISSION_TYPE = 2 AND game_record.CAGE_TYPE = 2 AND SETTLED = 1 GROUP BY game_record.GAME_ID`;

	let sqlNNChipsBuyinCashDeposit = `SELECT SUM(NN_CHIPS) AS NN_CHIPS_BUYIN_CASH_DEPOSIT FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION IN (1,2)`;

	let sqlCCChipsBuyinCashDeposit = `SELECT SUM(CC_CHIPS) AS CC_CHIPS_BUYIN_CASH_DEPOSIT FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION IN (1,2) `;

	// Cash-only buyins (TRANSACTION = 1 only) - excludes guest account buyins (TRANSACTION = 2)
	// These are used for Cash Balance calculation to avoid double-counting guest deposits
	let sqlNNChipsBuyinCashOnly = `SELECT SUM(NN_CHIPS) AS NN_CHIPS_BUYIN_CASH_ONLY FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION = 1`;

	let sqlCCChipsBuyinCashOnly = `SELECT SUM(CC_CHIPS) AS CC_CHIPS_BUYIN_CASH_ONLY FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION = 1`;

	// Guest account buyins (TRANSACTION = 2 only) - buyins using guest deposited money
	// These should NOT be counted in balance because the money is already counted in ACCOUNT_DEPOSIT
	let sqlNNChipsBuyinGuestAccount = `SELECT SUM(NN_CHIPS) AS NN_CHIPS_BUYIN_GUEST_ACCOUNT FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION = 2`;

	let sqlCCChipsBuyinGuestAccount = `SELECT SUM(CC_CHIPS) AS CC_CHIPS_BUYIN_GUEST_ACCOUNT FROM game_record WHERE ACTIVE =1 AND CAGE_TYPE = 1 AND TRANSACTION = 2`;

	// ROLLER CHIPS queries for CAGE_TYPE = 5
	// ROLLER_TRANSACTION = 1: Subtract (LESS) from balance
	// ROLLER_TRANSACTION = 2: Add to balance
	let sqlRollerNNSubtract = 'SELECT SUM(ROLLER_NN_CHIPS) AS ROLLER_NN_SUBTRACT FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 5 AND ROLLER_TRANSACTION = 1';
	let sqlRollerNNAdd = 'SELECT SUM(ROLLER_NN_CHIPS) AS ROLLER_NN_ADD FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 5 AND ROLLER_TRANSACTION = 2';
	let sqlRollerCCSubtract = 'SELECT SUM(ROLLER_CC_CHIPS) AS ROLLER_CC_SUBTRACT FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 5 AND ROLLER_TRANSACTION = 1';
	let sqlRollerCCAdd = 'SELECT SUM(ROLLER_CC_CHIPS) AS ROLLER_CC_ADD FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 5 AND ROLLER_TRANSACTION = 2';

	try {


		const [WinlossManualResult] = await pool.execute(sqlWinlossManual);
		const [TotalRollingManualResult] = await pool.execute(sqlTotalRollingManual);
		const [AccountTransferResult] = await pool.execute(sqlAccountTransfer);
		const [CChipsBuyinGameResult] = await pool.execute(sqlCCChipsBuyinGame);
		const [JunketCreditResult] = await pool.execute(sqlJunketCredit);
		const [JunketExpenseResult] = await pool.execute(sqlJunketExpense);
		const [JunketExpenseGoodsResult] = await pool.execute(sqlJunketExpenseGoods);
		const [JunketExpenseNonGoodsResult] = await pool.execute(sqlJunketExpenseNonGoods);
		const [ResetExpenseResult] = await pool.execute(sqlJunketExpenseReset);
		const [CCResetBuyinCashoutResult] = await pool.execute(sqlCCChipsCashoutReset);
		const [TotalRollingResetResult] = await pool.execute(sqlTotalRollingReset);
		const [TotalCashOutResetResult] = await pool.execute(sqlTotalCashOutReset);
		const [TotalCashOutRollingResetResult] = await pool.execute(sqlTotalCashOutRollingReset);
		const [WinLossResetResult] = await pool.execute(sqlWinLossReset);
		const [AccountMarkerReturnResult] = await pool.execute(sqlAccountMarkerReturn);
		const [ChipsReturnMarkerResult] = await pool.execute(sqlChipsReturnMarker);
		const [MArkerReturnDepositResult] = await pool.execute(sqlMArkerReturnDeposit);
		const [MArkerReturnCashResult] = await pool.execute(sqlMArkerReturnCash);
		const [SettlementDepositAmountResult] = await pool.execute(sqlSettlementDepositAmount);
		const [SettlementCashOutAmountResult] = await pool.execute(sqlSettlementCashOutAmount);
		const [AccountSettlementResult] = await pool.execute(sqlAccountSettlement);
		const [NNChipsReturnDepositResult] = await pool.execute(sqlNNChipsReturnDeposit);
		const [CageRollingResult] = await pool.execute(sqlCageRolling);
		const [AccountCCChipsReturnResult] = await pool.execute(sqlAccountCCChipsReturn);
		const [NNChipsAccountMarkerResult] = await pool.execute(sqlNNChipsAccountMarker);
		const [accountDeductResult] = await pool.execute(sqlAccountDeduct);
		const [accountWithdrawResult] = await pool.execute(sqlAccountWithdraw);
		const [accountServicesDeductResult] = await pool.execute(sqlAccountServicesDeduct);
		const [NNChipsAccountCashResult] = await pool.execute(sqlNNChipsAccountCash);
		const [CCChipsAccountCashResult] = await pool.execute(sqlCCChipsAccountCash);
		const [NNChipsAccountDepositResult] = await pool.execute(sqlNNChipsAccountDeposit);
		const [CCChipsBuyinCashoutResult] = await pool.execute(sqlCCChipsCashout);
		const [CCBuyinReturnResult] = await pool.execute(sqlCCReturn);
		const [NNChipsBuyinCashoutResult] = await pool.execute(sqlNNChipsCashout);
		const [NNBuyinReturnResult] = await pool.execute(sqlNNReturn);
		const [TotalChipsBuyinCashoutResult] = await pool.execute(sqlTotalChipsCashout);
		const [CCChipsRollingResult] = await pool.execute(sqlCCChipsRolling);
		const [NNChipsRollingResult] = await pool.execute(sqlNNChipsRolling);
		const [TotalChipsRollingResult] = await pool.execute(sqlTotalChipsRolling);
		const [CCChipsBuyinResult] = await pool.execute(sqlCCChipsBuyin);
		const [CCBuyinResult] = await pool.execute(sqlCCBuyin);
		const [NNChipsBuyinResult] = await pool.execute(sqlNNChipsBuyin);
		const [NNBuyinResult] = await pool.execute(sqlNNBuyin);
		const [TotalChipsBuyinResult] = await pool.execute(sqlTotalChipsBuyin);
		const [cashDepositResult] = await pool.execute(sqlCashDeposit);
		const [cashWithdrawResult] = await pool.execute(sqlCashWithdraw);
		const [accountDepositResult] = await pool.execute(sqlAccountDeposit);
		const [accountCCChips] = await pool.execute(sqlAccountCCChips);
		const [accountNNChips] = await pool.execute(sqlAccountNNChips);
		const [markerIssueGame] = await pool.execute(sqlMarkerIssueGame);
		const [markerIssueAccount] = await pool.execute(sqlMarkerIssueAccount);
		const [totalRealRolling] = await pool.execute(sqlTotalRealRolling);
		const [totalRolling] = await pool.execute(sqlTotalRolling);

		const [totalCashOutRolling] = await pool.execute(sqlTotalCashOutRolling);
		const [totalCashOut] = await pool.execute(sqlTotalCashOut);
		const [totalWinLoss] = await pool.execute(sqlWinLoss);
		const [serviceCashGuestResults] = await pool.execute(sqlServiceCashGuest);
		const [serviceDepositGuestResults] = await pool.execute(sqlServiceDepositGuest);
		const [serviceCashJunketResults] = await pool.execute(sqlServiceCashJunket);
		const [serviceDepositJunketResults] = await pool.execute(sqlServiceDepositJunket);
		const [serviceCommissionResults] = await pool.execute(sqlServiceCommission);
		const [totalCommisionRolling] = await pool.execute(sqlCommisionRolling);

		const [totalCommisionCashout] = await pool.execute(sqlCommisionCashout);
		// totalCommisionRolling ay inasume nang nakuha na (mula sa query ng sqlCommisionRolling)
		let totalCommission = 0;
		for (let i = 0; i < totalCommisionRolling.length; i++) {
			let cashout = 0;
			if (totalCommisionCashout[i]) {
				cashout = totalCommisionCashout[i].TOTAL_CASHOUT;
			}
			totalCommission += (totalCommisionRolling[i].TOTAL_ROLLING - cashout) * (totalCommisionRolling[i].percentage / 100);
		}

		// Kunin ang CommissionResetResult:
		const [CommissionResetResult] = await pool.execute(sqlCommissionReset);
		let totalCommissionReset = 0;
		for (let i = 0; i < CommissionResetResult.length; i++) {
			const { TOTAL_ROLLING, percentage, TOTAL_CASHOUT } = CommissionResetResult[i];
			totalCommissionReset += (TOTAL_ROLLING - TOTAL_CASHOUT) * (percentage / 100);
		}

		// Kunin ang mga resulta para sa shared rolling at cashout:
		const [totalSharedRolling] = await pool.execute(sqlSharedRolling);
		const [totalSharedCashoutCC] = await pool.execute(sqlSharedCashoutCC);
		const [totalSharedCashout] = await pool.execute(sqlSharedCashout);

		let totalShared = 0;
		for (let j = 0; j < totalSharedRolling.length; j++) {
			let cashout_shared = 0;
			let cashout_cc_shared = 0;
			if (totalSharedCashout[j]) {
				cashout_shared = totalSharedCashout[j].TOTAL_CASHOUT;
			}
			if (totalSharedCashoutCC[j]) {
				cashout_cc_shared = totalSharedCashoutCC[j].TOTAL_CASHOUT_CC;
			}
			totalShared += (totalSharedRolling[j].TOTAL_ROLLING - cashout_shared - cashout_cc_shared) *
				(totalSharedRolling[j].percentage / 100);
		}

		// Para sa shared reset:
		const [totalSharedRollingReset] = await pool.execute(sqlSharedRollingReset);
		const [totalSharedCashoutCCReset] = await pool.execute(sqlSharedCashoutCCReset);
		const [totalSharedCashoutReset] = await pool.execute(sqlSharedCashoutReset);

		let totalSharedReset = 0;
		for (let j = 0; j < totalSharedRollingReset.length; j++) {
			let cashout_shared = 0;
			let cashout_cc_shared = 0;
			if (totalSharedCashoutReset[j]) {
				cashout_shared = totalSharedCashoutReset[j].TOTAL_CASHOUT;
			}
			if (totalSharedCashoutCCReset[j]) {
				cashout_cc_shared = totalSharedCashoutCCReset[j].TOTAL_CASHOUT_CC;
			}
			totalSharedReset += (totalSharedRollingReset[j].TOTAL_ROLLING - cashout_shared - cashout_cc_shared) *
				(totalSharedRollingReset[j].percentage / 100);
		}

		// Kunin ang resulta ng win-loss queries:
		const [winLossLiveResults] = await pool.execute(sqlWinLossLive);
		let totalWinLossLiveCalc = 0;
		winLossLiveResults.forEach(row => {
			const cashinLive = row.CASHIN_LIVE || 0;
			const cashoutLive = row.CASHOUT_LIVE || 0;
			const houseShare = row.houseshare || 0;
			totalWinLossLiveCalc += (cashinLive - cashoutLive) * (houseShare / 100);
		});

		const [winLossTelebetResults] = await pool.execute(sqlWinLossTelebet);
		let totalWinLossTelebetCalc = 0;
		winLossTelebetResults.forEach(row => {
			const cashinLive = row.CASHIN_TELEBET || 0;
			const cashoutLive = row.CASHOUT_TELEBET || 0;
			const houseShare = row.houseshare || 0;
			totalWinLossTelebetCalc += (cashinLive - cashoutLive) * (houseShare / 100);
		});

		// Kunin ang iba pang mga query results:
		const [NNChipsBuyinCashDepositResult] = await pool.execute(sqlNNChipsBuyinCashDeposit);
		const [CCChipsBuyinCashDepositResult] = await pool.execute(sqlCCChipsBuyinCashDeposit);
		const [NNChipsBuyinCashOnlyResult] = await pool.execute(sqlNNChipsBuyinCashOnly);
		const [CCChipsBuyinCashOnlyResult] = await pool.execute(sqlCCChipsBuyinCashOnly);
		const [NNChipsBuyinGuestAccountResult] = await pool.execute(sqlNNChipsBuyinGuestAccount);
		const [CCChipsBuyinGuestAccountResult] = await pool.execute(sqlCCChipsBuyinGuestAccount);
		const [RollerNNSubtractResult] = await pool.execute(sqlRollerNNSubtract);
		const [RollerNNAddResult] = await pool.execute(sqlRollerNNAdd);
		const [RollerCCSubtractResult] = await pool.execute(sqlRollerCCSubtract);
		const [RollerCCAddResult] = await pool.execute(sqlRollerCCAdd);
		const [AgentCountResult] = await pool.execute(sqlAgentCount);

		res.render('dashboard', {

			username: req.session.username,
			firstname: req.session.firstname,
			lastname: req.session.lastname,
			user_id: req.session.user_id,
			currentPage: 'dashboard',
			permissions: permissions, // Pass permissions to the view

			sqlWinlossManual: WinlossManualResult,
			sqlTotalRollingManual: TotalRollingManualResult,

			sqlCCChipsBuyinGame: CChipsBuyinGameResult,
			sqlJunketCredit: JunketCreditResult,
			sqlJunketExpense: JunketExpenseResult,
			sqlJunketExpenseGoods: JunketExpenseGoodsResult,
			sqlJunketExpenseNonGoods: JunketExpenseNonGoodsResult,
			sqlJunketExpenseReset: ResetExpenseResult,

			sqlAccountTransfer: AccountTransferResult,

			sqlAccountMarkerReturn: AccountMarkerReturnResult,
			sqlChipsReturnMarker: ChipsReturnMarkerResult,
			sqlMArkerReturnDeposit: MArkerReturnDepositResult,
			sqlMArkerReturnCash: MArkerReturnCashResult,
			sqlSettlementDepositAmount: SettlementDepositAmountResult,
			sqlSettlementCashOutAmount: SettlementCashOutAmountResult,
			sqlAccountSettlement: AccountSettlementResult,
			sqlNNChipsReturnDeposit: NNChipsReturnDepositResult,
			sqlCageRolling: CageRollingResult,
			sqlAccountCCChipsReturn: AccountCCChipsReturnResult,
			sqlNNChipsAccountMarker: NNChipsAccountMarkerResult,
			sqlNNChipsAccountCash: NNChipsAccountCashResult,
			sqlCCChipsAccountCash: CCChipsAccountCashResult,
			sqlNNChipsAccountDeposit: NNChipsAccountDepositResult,
			sqlCCChipsCashout: CCChipsBuyinCashoutResult,
			sqlCCChipsCashoutReset: CCResetBuyinCashoutResult,
			sqlCCReturn: CCBuyinReturnResult,
			sqlNNChipsCashout: NNChipsBuyinCashoutResult,
			sqlNNReturn: NNBuyinReturnResult,
			sqlTotalChipsCashout: TotalChipsBuyinCashoutResult,
			sqlCCChipsRolling: CCChipsRollingResult,
			sqlNNChipsRolling: NNChipsRollingResult,
			sqlTotalChipsRolling: TotalChipsRollingResult,
			sqlCCChipsBuyin: CCChipsBuyinResult,
			sqlCCBuyin: CCBuyinResult,
			sqlNNChipsBuyin: NNChipsBuyinResult,
			sqlNNBuyin: NNBuyinResult,
			sqlTotalChipsBuyin: TotalChipsBuyinResult,
			sqlCashDeposit: cashDepositResult,
			sqlCashWithdraw: cashWithdrawResult,
			sqlAccountDeposit: accountDepositResult,
			sqlAccountWithdraw: accountWithdrawResult,
			sqlAccountDeduct: accountDeductResult,
			sqlAccountServicesDeduct: accountServicesDeductResult,
			sqlAccountCCChips: accountCCChips,
			sqlAccountNNChips: accountNNChips,
			sqlMarkerIssueGame: markerIssueGame,
			sqlMarkerIssueAccount: markerIssueAccount,
			sqlTotalRealRolling: totalRealRolling,
			sqlTotalRolling: totalRolling,
			sqlTotalRollingReset: TotalRollingResetResult,
			sqlTotalCashOut: totalCashOut,
			sqlTotalCashOutReset: TotalCashOutResetResult,
			sqlTotalCashOutRolling: totalCashOutRolling,
			sqlTotalCashOutRollingReset: TotalCashOutRollingResetResult,
			sqlWinLoss: totalWinLoss,
			sqlWinLossReset: WinLossResetResult,
			sqlCommision: totalCommission,
			sqlCommissionReset: totalCommissionReset,
			sqlShared: totalShared,
			sqlSharedReset: totalSharedReset,
			sqlWinLossLive: totalWinLossLiveCalc,
			sqlWinLossTelebet: totalWinLossTelebetCalc,
			sqlNNChipsBuyinCashDeposit: NNChipsBuyinCashDepositResult,
			sqlCCChipsBuyinCashDeposit: CCChipsBuyinCashDepositResult,
			sqlNNChipsBuyinCashOnly: NNChipsBuyinCashOnlyResult,
			sqlCCChipsBuyinCashOnly: CCChipsBuyinCashOnlyResult,
			sqlNNChipsBuyinGuestAccount: NNChipsBuyinGuestAccountResult,
			sqlCCChipsBuyinGuestAccount: CCChipsBuyinGuestAccountResult,
			sqlRollerNNSubtract: RollerNNSubtractResult,
			sqlRollerNNAdd: RollerNNAddResult,
			sqlRollerCCSubtract: RollerCCSubtractResult,
			sqlRollerCCAdd: RollerCCAddResult,
			sqlAgentCount: AgentCountResult,
			sqlServiceCashGuest: serviceCashGuestResults,
			sqlServiceDepositGuest: serviceDepositGuestResults,
			sqlServiceCashJunket: serviceCashJunketResults,
			sqlServiceDepositJunket: serviceDepositJunketResults,
			sqlServiceCommission: serviceCommissionResults

		});

	} catch (err) {
		console.error(err);
		res.status(500).send(err.message);
	}
});


router.get('/account_dashboard', async (req, res) => {
	const agencyId = req.query.agencyId;
	console.log('Agency ID from query param:', agencyId);

	let baseQuery = `
		SELECT 
			account.*, 
			agency.AGENCY AS agency_name, 
			account.IDNo AS account_id, 
			agent.AGENT_CODE AS agent_code, 
			account.ACTIVE AS active, 
			agent.NAME AS agent_name, 
			agent.CONTACTNo AS agent_contact,
			agent.TELEGRAM_ID AS agent_telegram,
			agent.REMARKS AS agent_remarks,
			agent.IDNo AS agent_id,
			IFNULL(SUM(account_ledger.AMOUNT), 0) AS total_balance
		FROM 
			account 
		JOIN 
			agent ON agent.IDNo = account.AGENT_ID 
		JOIN 
			agency ON agency.IDNo = agent.AGENCY
		LEFT JOIN 
			account_ledger ON account.IDNo = account_ledger.ACCOUNT_ID
		WHERE 
			account.ACTIVE = 1 
			AND agent.ACTIVE = 1
	`;

	if (agencyId) {
		baseQuery += ` AND agency.IDNo = ${pool.escape(agencyId)}`;
	}

	baseQuery += `
		GROUP BY 
			account.IDNo, 
			agency.AGENCY, 
			agent.AGENT_CODE, 
			agent.NAME, 
			account.ACTIVE
	`;

	try {
		const [results] = await pool.execute(baseQuery);
		res.json(results);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});


// ADD JUNKET CAPITAL
router.post('/add_junket_capital', async (req, res) => {
	try {
		const {
			txtFullname = null,
			txtAmount = "0",
			Remarks = null,
			optWithdrawDeposit = null,
			description = null
		} = req.body;

		let date_now = new Date();
		let txtAmount2 = parseFloat(txtAmount.replace(/,/g, '')) || 0;

		const query = `
			INSERT INTO junket_capital(
				TRANSACTION_ID, FULLNAME, DESCRIPTION, AMOUNT, 
				REMARKS, ENCODED_BY, ENCODED_DT
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`;

		const [insertResult] = await pool.execute(query, [
			optWithdrawDeposit,
			txtFullname,
			description,
			txtAmount2,
			Remarks,
			req.session?.user_id ?? null,
			date_now
		]);

		const transactionConfig = {
			1: { category: 'Capital In', type: 1 },
			2: { category: 'Capital Out', type: 2 }
		}[parseInt(optWithdrawDeposit, 10)];

		if (transactionConfig) {
			const cashTransactionQuery = `
				INSERT INTO cash_transaction (
					TRANSACTION_ID,
					AMOUNT,
					CATEGORY,
					TYPE,
					REMARKS,
					ENCODED_BY,
					ENCODED_DT
				) VALUES (?, ?, ?, ?, ?, ?, ?)
			`;

			await pool.execute(cashTransactionQuery, [
				insertResult.insertId,
				txtAmount2.toString(),
				transactionConfig.category,
				transactionConfig.type,
				Remarks,
				req.session?.user_id ?? null,
				date_now
			]);
		}

		res.redirect('/dashboard');
	} catch (err) {
		console.error('Error inserting junket:', err);
		res.status(500).send('Error inserting junket');
	}
});




router.get('/junket_capital_data', async (req, res) => {
	try {
		const { start_date, end_date } = req.query;

		if (!start_date || !end_date) {
			return res.status(400).json({ error: 'start_date and end_date are required' });
		}

		// Define the query
		const query = `
        SELECT * FROM (
            SELECT 
                j.IDNo, 
                j.TRANSACTION_ID, 
                j.NN_CHIPS, 
				(j.NN_CHIPS + j.CC_CHIPS) AS TOTAL_CHIPS,  
                j.ACTIVE, 
                j.ENCODED_BY, 
                j.ENCODED_DT, 
                j.EDITED_BY, 
                j.EDITED_DT, 
                NULL AS CATEGORY_ID, 
                NULL AS CATEGORY,  
                COALESCE(u.FIRSTNAME, 'N/A') AS ENCODED_BY_NAME,  
                j.DESCRIPTION COLLATE utf8mb4_general_ci AS capital_description,   
                NULL AS capital_amount, 
                NULL AS ledger_amount, 
                NULL AS REMARKS, 
                NULL AS CAGE_TYPE,  
                NULL AS GAME_ID
            FROM junket_total_chips j
            LEFT JOIN user_info u ON j.ENCODED_BY = u.IDNo 
            WHERE j.ACTIVE = 1 AND DATE(j.ENCODED_DT) BETWEEN ? AND ?

            UNION ALL 

            SELECT 
                k.IDNo, 
                k.TRANSACTION_ID, 
                NULL AS NN_CHIPS, 
                NULL AS TOTAL_CHIPS, 
                k.ACTIVE, 
                k.ENCODED_BY, 
                k.ENCODED_DT, 
                NULL AS EDITED_BY, 
                NULL AS EDITED_DT, 
                NULL AS CATEGORY_ID, 
                k.CATEGORY_ID AS CATEGORY,  
                COALESCE(u.FIRSTNAME, 'N/A') AS ENCODED_BY_NAME,  
                k.DESCRIPTION COLLATE utf8mb4_general_ci AS chips_description,   
                k.AMOUNT AS capital_amount, 
                NULL AS ledger_amount, 
                k.REMARKS, 
                NULL AS CAGE_TYPE,  
                NULL AS GAME_ID
            FROM junket_capital k
            LEFT JOIN user_info u ON k.ENCODED_BY = u.IDNo 
            WHERE k.ACTIVE = 1 AND DATE(k.ENCODED_DT) BETWEEN ? AND ?

            UNION ALL 

            SELECT 
                al.IDNo, 
                al.TRANSACTION_ID, 
                NULL AS NN_CHIPS, 
                NULL AS TOTAL_CHIPS, 
                al.ACTIVE, 
                al.ENCODED_BY, 
                al.ENCODED_DT, 
                NULL AS EDITED_BY, 
                NULL AS EDITED_DT, 
                NULL AS CATEGORY_ID, 
                NULL AS CATEGORY,  
                COALESCE(u.FIRSTNAME, 'N/A') AS ENCODED_BY_NAME,  
                al.TRANSACTION_DESC COLLATE utf8mb4_general_ci AS comms_description,   
                NULL AS capital_amount, 
                al.AMOUNT AS ledger_amount, 
                NULL AS REMARKS, 
                NULL AS CAGE_TYPE,  
                NULL AS GAME_ID
            FROM account_ledger al
            LEFT JOIN user_info u ON al.ENCODED_BY = u.IDNo 
            WHERE al.ACTIVE = 1 AND DATE(al.ENCODED_DT) BETWEEN ? AND ?

            UNION ALL

            SELECT 
                je.IDNo, 
                NULL AS TRANSACTION_ID, 
                NULL AS NN_CHIPS, 
                NULL AS TOTAL_CHIPS, 
                je.ACTIVE, 
                je.ENCODED_BY, 
                je.ENCODED_DT, 
                NULL AS EDITED_BY, 
                NULL AS EDITED_DT, 
                je.CATEGORY_ID AS CATEGORY_ID, 
                CE.CATEGORY AS CATEGORY, 
                COALESCE(u.FIRSTNAME, 'N/A') AS ENCODED_BY_NAME,  
                je.CATEGORY_ID AS expense_description,  
                je.AMOUNT AS capital_amount,  
                NULL AS ledger_amount, 
                je.DESCRIPTION AS REMARKS, 
                NULL AS CAGE_TYPE,  
                NULL AS GAME_ID
            FROM junket_house_expense je
            LEFT JOIN expense_category CE ON CE.IDNo = je.CATEGORY_ID
            LEFT JOIN user_info u ON je.ENCODED_BY = u.IDNo 
            WHERE je.ACTIVE = 1 AND DATE(je.ENCODED_DT) BETWEEN ? AND ?

            UNION ALL

            SELECT 
                gr.IDNo, 
                gr.TRANSACTION AS TRANSACTION_ID, 
                gr.NN_CHIPS, 
                gr.CC_CHIPS AS TOTAL_CHIPS, 
                gr.ACTIVE, 
                gr.ENCODED_BY, 
                gr.ENCODED_DT, 
                NULL AS EDITED_BY, 
                NULL AS EDITED_DT, 
                NULL AS CATEGORY_ID, 
                NULL AS CATEGORY, 
                COALESCE(u.FIRSTNAME, 'N/A') AS ENCODED_BY_NAME,  
                NULL AS capital_description, 
                (gr.NN_CHIPS + gr.CC_CHIPS) AS capital_amount,  
                NULL AS ledger_amount, 
                gr.REMARKS, 
                gr.CAGE_TYPE,  
                gr.GAME_ID
            FROM game_record gr
            LEFT JOIN user_info u ON gr.ENCODED_BY = u.IDNo 
            WHERE gr.ACTIVE = 1 AND gr.CAGE_TYPE = 1 AND gr.TRANSACTION IN (1, 2) AND DATE(gr.ENCODED_DT) BETWEEN ? AND ?
        ) AS full_result;
    `;

		const [results] = await pool.execute(query, [
			start_date, end_date,
			start_date, end_date,
			start_date, end_date,
			start_date, end_date,
			start_date, end_date
		]);

		res.json(results);
	} catch (err) {
		console.error('Error executing query:', err);
		res.status(500).json({ error: 'Database error' });
	}
});

// FETCH CASH TRANSACTIONS (TYPE 1 = Cash-in, TYPE 2 = Cash-out)
router.get('/cash_transaction_data', async (req, res) => {
	try {
		const { start_date, end_date, type, category } = req.query;

		if (!start_date || !end_date) {
			return res.status(400).json({ error: 'start_date and end_date are required' });
		}

		const conditions = ['DATE(ct.ENCODED_DT) BETWEEN ? AND ?'];
		const params = [start_date, end_date];

		if (type) {
			const typeValue = parseInt(type, 10);
			if (!Number.isNaN(typeValue)) {
				conditions.push('ct.TYPE = ?');
				params.push(typeValue);
			}
		}

		if (category) {
			conditions.push('ct.CATEGORY = ?');
			params.push(category);
		}

		const query = `
			SELECT
				ct.IDNo,
				ct.AMOUNT,
				ct.CATEGORY,
				ct.TYPE,
				ct.REMARKS,
				ct.ENCODED_BY,
				ct.ENCODED_DT,
				COALESCE(u.FIRSTNAME, 'N/A') AS ENCODED_BY_NAME,
				COALESCE(agent.NAME, '-') AS AGENT_NAME
			FROM cash_transaction ct
			LEFT JOIN user_info u ON ct.ENCODED_BY = u.IDNo
			LEFT JOIN agent ON ct.AGENT_ID = agent.IDNo
			WHERE ${conditions.join(' AND ')}
			ORDER BY ct.ENCODED_DT DESC
		`;
		const [results] = await pool.execute(query, params);

		res.json(results);
	} catch (error) {
		console.error('Error fetching cash transactions:', error);
		res.status(500).json({ error: 'Database error' });
	}
});

// GET CC CHIPS HISTORY
router.get('/cc_chips_history', async (req, res) => {
	try {
		const { start_date, end_date } = req.query;

		if (!start_date || !end_date) {
			return res.status(400).json({ error: 'start_date and end_date are required' });
		}

		// Query specifically for CC chips buy-in, cashout, and rolling from junket_total_chips
		const query = `
			SELECT 
				j.IDNo,
				j.TRANSACTION_ID,
				j.CC_CHIPS,
				j.DESCRIPTION AS capital_description,
				j.ENCODED_DT,
				COALESCE(u.FIRSTNAME, 'N/A') AS ENCODED_BY_NAME
			FROM junket_total_chips j
			LEFT JOIN user_info u ON j.ENCODED_BY = u.IDNo
			WHERE j.ACTIVE = 1 
				AND j.TRANSACTION_ID IN (1, 2, 3)
				AND j.CC_CHIPS > 0
				AND DATE(j.ENCODED_DT) BETWEEN ? AND ?
			ORDER BY j.ENCODED_DT DESC
		`;

		const [results] = await pool.execute(query, [start_date, end_date]);

		res.json(results);
	} catch (err) {
		console.error('Error executing CC chips history query:', err);
		res.status(500).json({ error: 'Database error' });
	}
});



// EDIT JUNKET CAPITAL
router.put('/junket_capital/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const {
			txtFullname,
			txtAmount,
			Remarks
		} = req.body;

		let date_now = new Date();

		const query = `
			UPDATE junket_capital 
			SET FULLNAME = ?, AMOUNT = ?, REMARKS = ?, EDITED_BY = ?, EDITED_DT = ? 
			WHERE IDNo = ?
		`;

		await pool.execute(query, [
			txtFullname,
			txtAmount,
			Remarks,
			req.session.user_id,
			date_now,
			id
		]);

		res.send('Junket updated successfully');
	} catch (err) {
		console.error('Error updating Junket:', err);
		res.status(500).send('Error updating Junket');
	}
});

// DELETE JUNKET CAPITAL AND TOTAL CHIPS
router.put('/junket_capital/remove/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		let date_now = new Date();

		const query1 = `UPDATE junket_capital SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;
		await pool.execute(query1, [0, req.session.user_id, date_now, id]);

		const query2 = `UPDATE junket_total_chips SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;
		await pool.execute(query2, [0, req.session.user_id, date_now, id]);

		await pool.execute('DELETE FROM cash_transaction WHERE TRANSACTION_ID = ?', [id]);

		res.send('Junket updated successfully');
	} catch (err) {
		console.error('Error updating Junket:', err);
		res.status(500).send('Error updating Junket');
	}
});



// ON GAME LIST
router.get('/on_game_list_data', async (req, res) => {
	try {
		const query = `SELECT *, game_list.IDNo AS game_list_id, game_list.ACTIVE AS game_status, account.IDNo AS account_no, agent.AGENT_CODE AS agent_code, agent.NAME AS agent_name 
			FROM game_list 
			JOIN account ON game_list.ACCOUNT_ID = account.IDNo
			JOIN agent ON agent.IDNo = account.AGENT_ID
			JOIN agency ON agency.IDNo = agent.AGENCY
			WHERE game_list.ACTIVE NOT IN (0, 1)
			ORDER BY game_list.IDNo ASC`;

		const [result] = await pool.execute(query);

		res.json(result);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});


// ADD JUNKET TOTAL CHIPS
router.post('/add_junket_total_chips', async (req, res) => {
	const { txtNNChips, txtCCChips, optBuyinReturn, typedescription } = req.body;
	let date_now = new Date();

	const nnChipsStr = txtNNChips.replace(/,/g, ''); // Remove commas
	const ccChipsStr = txtCCChips.replace(/,/g, ''); // Remove commas

	const nnChips = isNaN(parseFloat(nnChipsStr)) ? 0 : parseFloat(nnChipsStr);
	const ccChips = isNaN(parseFloat(ccChipsStr)) ? 0 : parseFloat(ccChipsStr);

	// Calculate the total chips by summing nnChips and ccChips
	const totalChips = nnChips + ccChips;

	const query = `INSERT INTO junket_total_chips(TRANSACTION_ID, DESCRIPTION, NN_CHIPS, CC_CHIPS, TOTAL_CHIPS, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?, ?, ?, ?, ?)`;
	try {
		const [insertResult] = await pool.execute(query, [optBuyinReturn, typedescription, nnChips, ccChips, totalChips, req.session.user_id, date_now]);

		const cashConfig = {
			'1': { category: 'Chips Buy-in', type: 2 },
			'2': { category: 'Chips Cash-out to Casino', type: 1 }
		}[String(optBuyinReturn)];

		if (cashConfig) {
			const cashTransactionQuery = `
				INSERT INTO cash_transaction (
					TRANSACTION_ID,
					AMOUNT,
					CATEGORY,
					TYPE,
					REMARKS,
					ENCODED_BY,
					ENCODED_DT
				) VALUES (?, ?, ?, ?, ?, ?, ?)
			`;

			await pool.execute(cashTransactionQuery, [
				insertResult.insertId,
				totalChips.toString(),
				cashConfig.category,
				cashConfig.type,
				null,
				req.session.user_id,
				date_now
			]);
		}

		res.redirect('/dashboard');
	} catch (err) {
		console.error('Error inserting junket total chips', err);
		res.status(500).send('Error inserting junket total chips');
	}
});



// END JUNKET TOTAL CHIPS


// START MARKER
// GET MARKER DATA CASHOUT
router.get('/marker_data_cashout/:id', async (req, res) => {
	const id = parseInt(req.params.id);
	const query = `
		SELECT account.IDNo AS ACCOUNT_ID,
			SUM(CASE WHEN account_ledger.TRANSACTION_ID IN (3, 10) THEN account_ledger.AMOUNT ELSE 0 END) - 
			SUM(CASE WHEN account_ledger.TRANSACTION_ID IN (11, 12, 1) THEN account_ledger.AMOUNT ELSE 0 END) AS TOTAL_AMOUNT, 
			agent.AGENT_CODE AS AGENT_CODE, agent.NAME AS AGENT_NAME 
		FROM agent 
		JOIN account ON agent.IDNo = account.AGENT_ID 
		JOIN account_ledger ON account.IDNo = account_ledger.ACCOUNT_ID 
		WHERE account_ledger.TRANSACTION_TYPE IN (3, 4) 
		AND agent.ACTIVE = 1 AND account_ledger.ACCOUNT_ID = ? 
		GROUP BY account.IDNo, agent.AGENT_CODE, agent.NAME 
		HAVING TOTAL_AMOUNT <> 0`;

	try {
		const [results] = await pool.execute(query, [id]);
		res.json(results);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});

// GET MARKER DATA
router.get('/marker_data', async (req, res) => {
	const query = `
		SELECT account.IDNo AS ACCOUNT_ID,
			SUM(CASE WHEN account_ledger.TRANSACTION_ID IN (3, 10) THEN account_ledger.AMOUNT ELSE 0 END) - 
			SUM(CASE WHEN account_ledger.TRANSACTION_ID IN (11, 12, 1) THEN account_ledger.AMOUNT ELSE 0 END) AS TOTAL_AMOUNT, 
			agent.AGENT_CODE AS AGENT_CODE, agent.NAME AS AGENT_NAME 
		FROM agent 
		JOIN account ON agent.IDNo = account.AGENT_ID 
		JOIN account_ledger ON account.IDNo = account_ledger.ACCOUNT_ID 
		WHERE account_ledger.TRANSACTION_TYPE IN (3, 4) 
		AND agent.ACTIVE = 1 
		GROUP BY account.IDNo, agent.AGENT_CODE, agent.NAME 
		HAVING TOTAL_AMOUNT <> 0`;

	try {
		const [results] = await pool.execute(query);
		res.json(results);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});

// ADD MARKER RETURN
router.post('/add_marker_settlement', async (req, res) => {
	const { txtAccountMarker, txtMarkerReturn, optTransType, AgentBalance } = req.body;

	let date_now = new Date();
	let time_now = new Date();
	time_now.setHours(time_now.getHours());
	let updated_time = time_now.toLocaleTimeString();
	let date_nowTG = date_now.toLocaleDateString();
	let markerReturn = parseFloat(txtMarkerReturn.replace(/,/g, '')) || 0;

	try {
		if (optTransType === '12') {
			const checkBalanceQuery = `
                SELECT SUM(
                    CASE 
                        WHEN TRANSACTION_ID = 1 THEN AMOUNT   
                        WHEN TRANSACTION_ID = 3 THEN AMOUNT        
                        WHEN TRANSACTION_ID = 2 THEN -AMOUNT         
                        WHEN TRANSACTION_ID = 12 THEN -AMOUNT        
                        ELSE 0 
                    END
                ) AS balance 
                FROM account_ledger 
                WHERE ACCOUNT_ID = ?`;

			const [balanceResults] = await pool.execute(checkBalanceQuery, [txtAccountMarker]);
			const balance = balanceResults[0]?.balance || 0;

			if (balance < markerReturn) {
				return res.status(400).json({ error: 'Insufficient balance for this deposit transaction.' });
			}
		} else {
			if (markerReturn <= 0) {
				return res.status(400).json({ error: 'Marker return must be greater than zero for non-deposit transactions.' });
			}
		}

		await insertSettlementRecord();

		const agentQuery = `
            SELECT agent.AGENT_CODE, agent.NAME, agent.TELEGRAM_ID
            FROM agent
            JOIN account ON account.AGENT_ID = agent.IDNo
            WHERE account.ACTIVE = 1 AND account.IDNo = ?`;

		const [agentResults] = await pool.execute(agentQuery, [txtAccountMarker]);

		if (agentResults.length > 0) {
			const { AGENT_CODE: agentCode, NAME: agentName, TELEGRAM_ID: telegramId } = agentResults[0];
			let text;

			// Safely parse AgentBalance
			const currentBalance = parseFloat(AgentBalance.replace(/,/g, '')) - markerReturn;

			if (optTransType === '12') {
				text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nTransaction: IOU RETURN\nAmount: ${parseFloat(markerReturn).toLocaleString()}\nAccount Balance: ${parseFloat(currentBalance).toLocaleString()}`;
			} else {
				text = `Demo Cage\n\nAccount: ${agentCode} - ${agentName}\nDate: ${date_nowTG}\nTime: ${updated_time}\n\nTransaction: IOU RETURN\nAmount: ${parseFloat(markerReturn).toLocaleString()}`;
			}

			// Fetch additional CHAT_ID from telegram_api table
			const chatIdQuery = `SELECT CHAT_ID FROM telegram_api WHERE ACTIVE = 1 LIMIT 1`;
			const [chatIdResults] = await pool.execute(chatIdQuery);
			const additionalChatId = chatIdResults.length > 0 ? chatIdResults[0].CHAT_ID : null;

			if (telegramId) {
				await sendTelegramMessage(text, telegramId);

				if (additionalChatId) {
					await sendTelegramMessage(text, additionalChatId);
				}
			} else {
				console.error("No TELEGRAM_ID found for Account ID:", txtAccountMarker);
			}
		} else {
			console.error("No AGENT_CODE or NAME found for Account ID:", txtAccountMarker);
		}

		res.json({ success: true, message: 'Marker Return saved successfully' });
	} catch (err) {
		console.error('Error:', err);
		res.status(500).json({ success: false, message: 'Error processing the transaction' });
	}

	async function insertSettlementRecord() {
		const insertQuery = `
            INSERT INTO account_ledger (ACCOUNT_ID, TRANSACTION_ID, TRANSACTION_TYPE, AMOUNT, ENCODED_BY, ENCODED_DT) 
            VALUES (?, ?, ?, ?, ?, ?)`;

		await pool.execute(insertQuery, [txtAccountMarker, optTransType, 3, markerReturn, req.session.user_id, date_now]);
	}
});

// GET MARKER HISTORY
router.get('/marker_history', async (req, res) => {
	const query = `
        SELECT account_ledger.*, 
       agent.NAME AS AGENT_NAME, 
       agent.AGENT_CODE AS AGENT_CODE,
       CONCAT(account_ledger.TRANSACTION_ID, '-', account_ledger.TRANSACTION_TYPE) AS TRANSACTION_INFO
		FROM account_ledger 
		JOIN account ON account.IDNo = account_ledger.ACCOUNT_ID 
		JOIN agent ON agent.IDNo = account.AGENT_ID 
		WHERE account_ledger.TRANSACTION_ID IN (3, 10, 11, 12) 
		OR account_ledger.TRANSACTION_TYPE = 4`;

	try {
		const [results] = await pool.execute(query);
		res.json(results);
	} catch (err) {
		console.error('Error fetching marker history:', err);
		return res.status(500).json({ success: false, message: 'Error fetching marker history' });
	}
});



//START DASHBOARD RESET AND HISTORY

router.get("/dashboard_history", function (req, res) {
	res.render("dashboard/dashboard_history", sessions(req, 'dashboard_history'));
});


// Reset Main Cage Balances
router.post('/reset-main-cage-balance', async (req, res) => {
	try {
		await pool.execute(`UPDATE junket_house_expense SET RESET = 0`);
		await pool.execute(`UPDATE game_record SET RESET = 0`);
		await pool.execute(`UPDATE junket_total_chips SET RESET = 0`);
		await pool.execute(`UPDATE winloss SET RESET = 0`);
		await pool.execute(`UPDATE total_rolling SET RESET = 0`);

		res.json({ success: true });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to reset main cage balance' });
	}
});

// Insert Dashboard History
router.post('/insert-dash-history', async (req, res) => {
	const {
		EXPENSE_HISTORY,
		TOTAL_ROLLING_HISTORY,
		HOUSE_ROLLING_HISTORY,
		WINLOSS_HISTORY,
		COMMISSION_HISTORY,
	} = req.body;

	let date_now = new Date();
	const normalizeNumber = (value) => {
		if (value === undefined || value === null || value === '') {
			return 0;
		}
		const num = Number(value);
		return Number.isFinite(num) ? num : 0;
	};

	try {
		const query = `
			INSERT INTO dash_history 
			(EXPENSE_HISTORY, TOTAL_ROLLING_HISTORY, HOUSE_ROLLING_HISTORY, WINLOSS_HISTORY, COMMISSION_HISTORY, ENCODED_BY, ENCODED_DT) 
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`;

		await pool.execute(query, [
			normalizeNumber(EXPENSE_HISTORY),
			normalizeNumber(TOTAL_ROLLING_HISTORY),
			normalizeNumber(HOUSE_ROLLING_HISTORY),
			normalizeNumber(WINLOSS_HISTORY),
			normalizeNumber(COMMISSION_HISTORY),
			req.session.user_id,
			date_now
		]);

		res.json({ success: true });
	} catch (err) {
		console.error('Error inserting data into dash_history', err);
		res.status(500).json({ success: false, message: 'Error inserting data into dash_history' });
	}
});



// Get Dashboard History
router.get('/get-dashboard-history', async (req, res) => {
	const query = `
		SELECT dash_history.*, user_info.FIRSTNAME AS FIRSTNAME, dash_history.ACTIVE 
		FROM dash_history 
		JOIN user_info ON user_info.IDNo = dash_history.ENCODED_BY 
		WHERE dash_history.ACTIVE = 1 
		ORDER BY ENCODED_DT DESC
	`;

	try {
		const [results] = await pool.execute(query);
		res.json(results);
	} catch (err) {
		console.error('Error fetching dashboard history data', err);
		res.status(500).json({ error: 'Error fetching data' });
	}
});



// 	ACTIVITY LOGS

// GET Activity Logs for Agents, Guests, Transactions, Junket Expenses, Users, User Roles, and Bookings
router.get('/activity_logs', async (req, res) => {
	const query = `
	  SELECT * FROM (
		-- AGENT
		(SELECT a.IDNo AS related_id, CONCAT('Agent ', a.AGENCY) AS name, 'added' AS action_type, a.ENCODED_DT AS action_time,
		  NULL AS guest_name, NULL AS account_name
		  FROM agency a WHERE a.ENCODED_DT IS NOT NULL)
  
		UNION ALL
		(SELECT a.IDNo AS related_id, CONCAT('Agent ', a.AGENCY) AS name, 'edited' AS action_type, a.EDITED_DT AS action_time,
		  NULL AS guest_name, NULL AS account_name
		  FROM agency a WHERE a.EDITED_DT IS NOT NULL AND a.ACTIVE = 1)
  
		UNION ALL
		(SELECT a.IDNo AS related_id, CONCAT('Agent ', a.AGENCY) AS name, 'deleted' AS action_type, a.EDITED_DT AS action_time,
		  NULL AS guest_name, NULL AS account_name
		  FROM agency a WHERE a.ACTIVE = 0 AND a.EDITED_DT IS NOT NULL)
  
		-- GUEST
		UNION ALL
		(SELECT ag.IDNo AS related_id, CONCAT('Guest ', ag.NAME) AS name, 'added' AS action_type, ag.ENCODED_DT AS action_time,
		  NULL AS guest_name, NULL AS account_name
		  FROM agent ag WHERE ag.ENCODED_DT IS NOT NULL)
  
		UNION ALL
		(SELECT ag.IDNo AS related_id, CONCAT('Guest ', ag.NAME) AS name, 'edited' AS action_type, ag.EDITED_DT AS action_time,
		  NULL AS guest_name, NULL AS account_name
		  FROM agent ag WHERE ag.EDITED_DT IS NOT NULL AND ag.ACTIVE = 1)
  
		UNION ALL
		(SELECT ag.IDNo AS related_id, CONCAT('Guest ', ag.NAME) AS name, 'deleted' AS action_type, ag.EDITED_DT AS action_time,
		  NULL AS guest_name, NULL AS account_name
		  FROM agent ag WHERE ag.ACTIVE = 0 AND ag.EDITED_DT IS NOT NULL)
  
		-- TRANSACTION
		UNION ALL
		(
		  SELECT 
			al.IDNo AS related_id,
			CONCAT(
			  'Transaction: ', 
			  CASE 
				WHEN al.TRANSACTION_ID = 1 THEN 'Deposit'
				WHEN al.TRANSACTION_ID = 2 THEN 'Withdraw'
				WHEN al.TRANSACTION_ID = 3 THEN 'IOU'
				ELSE 'Unknown Transaction'
			  END, 
			  ' - ', 
			  COALESCE(ag.NAME, 'Unknown Guest'), 
			  ' (₱', FORMAT(al.AMOUNT, 0), ') was Successful!'
			) AS name,
			'transaction' AS action_type,
			al.ENCODED_DT AS action_time,
			COALESCE(ag.NAME, '') AS guest_name,
			COALESCE(ag.AGENT_CODE, '') AS account_name
		  FROM account_ledger al
		  JOIN account acc ON al.ACCOUNT_ID = acc.IDNo
		  LEFT JOIN agent ag ON acc.AGENT_ID = ag.IDNo
		  WHERE al.ACTIVE = 1 AND al.TRANSACTION_ID IN (1, 2, 3)
		)
  
		-- JUNKET EXPENSE
		UNION ALL
		(
		  SELECT 
			IDNo AS related_id,
			CONCAT('Junket Expense: ', DESCRIPTION, ' (₱', FORMAT(AMOUNT, 0), ') was added.') AS name,
			'expense_added' AS action_type,
			ENCODED_DT AS action_time,
			NULL AS guest_name,
			NULL AS account_name
		  FROM junket_house_expense
		  WHERE ACTIVE = 1 AND ENCODED_DT IS NOT NULL
		)
  
		UNION ALL
		(
		  SELECT 
			IDNo AS related_id,
			CONCAT('Junket Expense: ', DESCRIPTION, ' (₱', FORMAT(AMOUNT, 0), ') was edited.') AS name,
			'expense_edited' AS action_type,
			EDITED_DT AS action_time,
			NULL AS guest_name,
			NULL AS account_name
		  FROM junket_house_expense
		  WHERE ACTIVE = 1 AND EDITED_DT IS NOT NULL
		)
  
		-- USER
		UNION ALL
		(
		  SELECT 
			IDNo AS related_id,
			CONCAT('New User Account: ', FIRSTNAME, ' ', LASTNAME, ', (Username: ', USERNAME, ') has been added.') AS name,
			'user_added' AS action_type,
			ENCODED_DT AS action_time,
			NULL AS guest_name,
			NULL AS account_name
		  FROM user_info
		  WHERE ENCODED_DT IS NOT NULL
		)
  
		UNION ALL
		(
		  SELECT 
			IDNo AS related_id,
			CONCAT('User ', FIRSTNAME, ' ', LASTNAME, ' (Username: ', USERNAME, ') was edited.') AS name,
			'user_edited' AS action_type,
			EDITED_DT AS action_time,
			NULL AS guest_name,
			NULL AS account_name
		  FROM user_info
		  WHERE EDITED_DT IS NOT NULL
		)
  
		-- ROLE
		UNION ALL
		(
		  SELECT 
			IDNo AS related_id,
			CONCAT('New Role Added: ', ROLE) AS name,
			'role_added' AS action_type,
			ENCODED_DT AS action_time,
			NULL AS guest_name,
			NULL AS account_name
		  FROM user_role
		  WHERE ENCODED_DT IS NOT NULL
		)
  
		UNION ALL
		(
		  SELECT 
			IDNo AS related_id,
			CONCAT('User Role: ', ROLE, ' was edited.') AS name,
			'role_edited' AS action_type,
			EDITED_DT AS action_time,
			NULL AS guest_name,
			NULL AS account_name
		  FROM user_role
		  WHERE EDITED_DT IS NOT NULL
		)
  
		-- BOOKING
		UNION ALL
		(
		  SELECT
			b.IDNo AS related_id,
			CONCAT(
			  'New Booking:<br>',
			  'Confirmation #', b.CONFIRM_NUM,
			  ' (Guest: ', b.GUEST_NAME, ') - Check In: ',
			  DATE_FORMAT(b.CHECK_IN, '%b %d, %Y'),
			  ' /<br>',
			  '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Check Out: ',
			  DATE_FORMAT(b.CHECK_OUT, '%b %d, %Y'),
			  ' was added.'
			) AS name,
			'booking_added' AS action_type,
			b.BOOKING_DATE AS action_time,
			NULL AS guest_name,
			NULL AS account_name
		  FROM booking b
		  WHERE b.BOOKING_DATE IS NOT NULL
		)
	  ) AS logs
	  ORDER BY logs.action_time DESC
	  LIMIT 5;
	`;
  
	try {
	  const [results] = await pool.query(query);
	  res.json(results);
	} catch (error) {
	  console.error("🔥 ERROR fetching activity logs:", error);
	  if (!res.headersSent) {
		res.status(500).json({ message: "Server Error", error: error.sqlMessage || error.message });
	  }
	}
  });
  


  


router.get('/get_winloss', async (req, res) => {
	const range = req.query.range;
	const weekOffset = req.query.weekOffset || 0; // Add support for week offset

	let totalCondition = '';
	let groupCondition = '';
	let groupBy = '';
	let labels = [];
	let groupKeys = [];
	
	// For comparison with previous period
	let prevTotalCondition = '';

	const currentYear = new Date().getFullYear();
	const currentMonth = new Date().getMonth(); // 0-based

	const offset = parseInt(req.query.offset) || 0;

if (range === 'week') {
   const targetDate = new Date();
   targetDate.setDate(targetDate.getDate() + (offset * 7));
   const isoDate = targetDate.toISOString().slice(0, 10);
   const targetYearWeek = `YEARWEEK('${isoDate}', 1)`;
   
   // Previous week
   const prevDate = new Date(targetDate);
   prevDate.setDate(prevDate.getDate() - 7);
   const prevIsoDate = prevDate.toISOString().slice(0, 10);
   const prevYearWeek = `YEARWEEK('${prevIsoDate}', 1)`;

   totalCondition = `AND YEARWEEK(ENCODED_DT, 1) = ${targetYearWeek}`;
   groupCondition = totalCondition;
   prevTotalCondition = `AND YEARWEEK(ENCODED_DT, 1) = ${prevYearWeek}`;
   prevGroupCondition = prevTotalCondition;
   groupBy = "DAYOFWEEK(ENCODED_DT)";
   labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
   groupKeys = [2, 3, 4, 5, 6, 7, 1];
}
 else if (range === 'month') {
		totalCondition = `AND MONTH(ENCODED_DT) = ${currentMonth + 1} AND YEAR(ENCODED_DT) = ${currentYear}`;
		groupCondition = `AND YEAR(ENCODED_DT) = ${currentYear}`;
		prevTotalCondition = `AND MONTH(ENCODED_DT) = ${currentMonth} AND YEAR(ENCODED_DT) = ${currentYear}`;
		prevGroupCondition = `AND YEAR(ENCODED_DT) = ${currentYear}`;
		groupBy = "MONTH(ENCODED_DT)";
		labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		groupKeys = Array.from({ length: 12 }, (_, i) => i + 1);
	} else if (range === 'year') {
		const startYear = currentYear - 5;
		const endYear = currentYear;
		totalCondition = `AND YEAR(ENCODED_DT) = ${currentYear}`;
		groupCondition = `AND YEAR(ENCODED_DT) BETWEEN ${startYear} AND ${endYear}`;
		prevTotalCondition = `AND YEAR(ENCODED_DT) = ${currentYear - 1}`;
		prevGroupCondition = `AND YEAR(ENCODED_DT) BETWEEN ${startYear - 1} AND ${endYear - 1}`;
		groupBy = "YEAR(ENCODED_DT)";
		labels = Array.from({ length: 6 }, (_, i) => `${startYear + i}`);
		groupKeys = labels.map(Number);
	} else {
		return res.status(400).json({ message: 'Invalid range' });
	}

	const totalQuery = `
		SELECT
			SUM(CASE WHEN CAGE_TYPE = 1 THEN (NN_CHIPS + CC_CHIPS) ELSE 0 END) AS cashin,
			SUM(CASE WHEN CAGE_TYPE = 2 THEN (NN_CHIPS + CC_CHIPS) ELSE 0 END) AS cashout
		FROM game_record
		WHERE ACTIVE = 1 ${totalCondition}
	`;
	
	const prevTotalQuery = `
		SELECT
			SUM(CASE WHEN CAGE_TYPE = 1 THEN (NN_CHIPS + CC_CHIPS) ELSE 0 END) AS cashin,
			SUM(CASE WHEN CAGE_TYPE = 2 THEN (NN_CHIPS + CC_CHIPS) ELSE 0 END) AS cashout
		FROM game_record
		WHERE ACTIVE = 1 ${prevTotalCondition}
	`;

	const chartQuery = `
		SELECT 
			${groupBy} AS label,
			SUM(CASE WHEN CAGE_TYPE = 1 THEN (NN_CHIPS + CC_CHIPS) ELSE 0 END) AS cashin,
			SUM(CASE WHEN CAGE_TYPE = 2 THEN (NN_CHIPS + CC_CHIPS) ELSE 0 END) AS cashout
		FROM game_record
		WHERE ACTIVE = 1 ${groupCondition}
		GROUP BY ${groupBy}
		ORDER BY ${groupBy}
	`;

	try {
		const [totalResult] = await pool.execute(totalQuery);
		const totalCashin = totalResult[0]?.cashin || 0;
		const totalCashout = totalResult[0]?.cashout || 0;
		const totalWinloss = totalCashin - totalCashout;
		
		// Get previous period data
		const [prevTotalResult] = await pool.execute(prevTotalQuery);
		const prevTotalCashin = prevTotalResult[0]?.cashin || 0;
		const prevTotalCashout = prevTotalResult[0]?.cashout || 0;
		const prevTotalWinloss = prevTotalCashin - prevTotalCashout;
		
		// Calculate percentage change
		const percentChange = prevTotalWinloss !== 0 
			? ((totalWinloss - prevTotalWinloss) / Math.abs(prevTotalWinloss)) * 100 
			: 0;

		const [chartResult] = await pool.execute(chartQuery);
		const dataMap = {};
		chartResult.forEach(row => {
			dataMap[row.label] = {
				cashin: row.cashin || 0,
				cashout: row.cashout || 0
			};
		});

		const net = groupKeys.map(key => {
			const record = dataMap[key] || { cashin: 0, cashout: 0 };
			return record.cashin - record.cashout;
		});

		res.json({
			winloss: totalWinloss,
			prevWinloss: prevTotalWinloss,
			percentChange: percentChange,
			chart: {
				data: net,
				labels
			}
		});
	} catch (err) {
		console.error("Error in get_winloss route:", err);
		res.status(500).json({ error: 'Internal Server Error' });
	}
});

	router.get("/fnb-hotel", checkSession, async function (req, res) {
	const permissions = req.session.permissions;

	try {
		const [gameServices] = await pool.query(`
			SELECT 
				gs.IDNo,
				agent.NAME AS agent_name,
				gs.GAME_ID,
				gs.SERVICE_TYPE,
				gs.SOURCE_TYPE,
				gs.AMOUNT,
				gs.REMARKS,
				gs.ENCODED_BY,
				user_info.FIRSTNAME AS encoded_by_name,
				gs.ENCODED_DT
			FROM game_services gs
			LEFT JOIN agent ON agent.IDNo = gs.AGENT_ID
			LEFT JOIN user_info ON user_info.IDNo = gs.ENCODED_BY
			WHERE gs.ACTIVE = 1
			ORDER BY gs.ENCODED_DT DESC
		`);

		res.render("junket/fnb_hotel", {
			...sessions(req, 'fnb-hotel'),
			permissions: permissions,
			gameServices: gameServices
		});
	} catch (err) {
		console.error("Error loading F&B / Hotel data:", err);
		res.status(500).send("Internal Server Error");
	}
});

module.exports = router;