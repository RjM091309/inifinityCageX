/**
 * KPI formulas copied from the web dashboard (routes/dashboard.js + views/dashboard.ejs)
 * so /api/dashboard-summary matches Commission, Total Rolling (cage), and House Rolling.
 */
const pool = require('../config/db');

function num(v) {
  return Number(v) || 0;
}

/**
 * Dashboard Commission card: settlement NET (no F&B deduction).
 * Settled games ACTIVE IN (1,2), records ACTIVE != 0 AND RESET = 1, Math.round.
 */
async function computeDashboardCommissionSettlement() {
  const [games] = await pool.query(
    `SELECT game_list.IDNo AS game_list_id,
            game_list.COMMISSION_PERCENTAGE,
            game_list.COMMISSION_TYPE
     FROM game_list
     WHERE game_list.ACTIVE IN (1, 2)
       AND game_list.SETTLED = 1
     ORDER BY game_list.IDNo ASC`
  );

  if (!games || games.length === 0) return 0;

  const gameIds = games
    .filter((g) => g.game_list_id && Number(g.COMMISSION_PERCENTAGE))
    .map((g) => g.game_list_id);
  if (gameIds.length === 0) return 0;

  const placeholders = gameIds.map(() => '?').join(',');
  const [allRecords] = await pool.query(
    `SELECT GAME_ID, AMOUNT, NN_CHIPS, CC_CHIPS, CAGE_TYPE, ROLLER_TRANSACTION, ROLLER_CC_CHIPS
     FROM game_record
     WHERE ACTIVE != 0 AND RESET = 1 AND GAME_ID IN (${placeholders})
     ORDER BY GAME_ID, IDNo ASC`,
    gameIds
  );

  const recordsByGameId = new Map();
  for (const rec of allRecords) {
    const gid = rec.GAME_ID;
    if (!recordsByGameId.has(gid)) recordsByGameId.set(gid, []);
    recordsByGameId.get(gid).push(rec);
  }

  let total = 0;
  for (const row of games) {
    const gameId = row.game_list_id;
    const rollingRate = Number(row.COMMISSION_PERCENTAGE) || 0;
    const commissionType = Number(row.COMMISSION_TYPE);
    if (!gameId || !rollingRate) continue;

    const records = recordsByGameId.get(gameId) || [];
    if (!records.length) continue;

    let total_nn_init = 0;
    let total_cc_init = 0;
    let total_nn = 0;
    let total_cc = 0;
    let total_cash_out_nn = 0;
    let total_cash_out_cc = 0;
    let total_rolling_nn = 0;
    let total_rolling = 0;
    let total_rolling_real = 0;
    let total_rolling_nn_real = 0;
    let total_rolling_cc_real = 0;
    let total_roller_return_cc = 0;

    for (const rec of records) {
      const cageType = Number(rec.CAGE_TYPE);
      if (cageType === 1 && (total_nn_init !== 0 || total_cc_init !== 0)) {
        total_nn += num(rec.NN_CHIPS);
        total_cc += num(rec.CC_CHIPS);
      }
      if (cageType === 1 && total_nn_init === 0 && total_cc_init === 0) {
        total_nn_init += num(rec.NN_CHIPS);
        total_cc_init += num(rec.CC_CHIPS);
      }
      if (cageType === 2) {
        total_cash_out_nn += num(rec.NN_CHIPS);
        total_cash_out_cc += num(rec.CC_CHIPS);
      }
      if (cageType === 3) {
        total_rolling += num(rec.AMOUNT);
        total_rolling_nn += num(rec.NN_CHIPS);
      }
      if (cageType === 4) {
        total_rolling_real += num(rec.AMOUNT);
        total_rolling_nn_real += num(rec.NN_CHIPS);
        total_rolling_cc_real += num(rec.CC_CHIPS);
      }
      if (cageType === 5) {
        const rollerTx = parseInt(rec.ROLLER_TRANSACTION, 10) || 1;
        if (rollerTx === 2) total_roller_return_cc += num(rec.ROLLER_CC_CHIPS);
      }
    }

    const total_rolling_chips =
      total_rolling_nn +
      total_roller_return_cc +
      total_rolling +
      total_rolling_real +
      total_rolling_nn_real +
      total_rolling_cc_real -
      total_cash_out_nn;
    const winlossValue = total_nn_init + total_cc_init + total_nn + total_cc - (total_cash_out_nn + total_cash_out_cc);

    let net = 0;
    if (commissionType === 1 || commissionType === 3) {
      net = Math.round((total_rolling_chips * rollingRate) / 100);
    } else if (commissionType === 2) {
      net = Math.round((winlossValue * rollingRate) / 100);
    }
    total += net;
  }
  return Math.round(total);
}

/**
 * Dashboard Rolling chart:
 * Total Rolling (cage) = RESET rolling CAGE_TYPE 3+4 − cash-out NN + manual + roller return CC − CC buy-in (RESET=1)
 * House Rolling = junket_total_chips NN buy-in + rolling − cash-out (RESET=1)
 */
async function computeDashboardRollingKpis() {
  const [
    [rollingRows],
    [cashoutRows],
    [manualRows],
    [returnRows],
    [ccBuyinRows],
    [houseRows],
  ] = await Promise.all([
    pool.query(
      'SELECT SUM(NN_CHIPS + CC_CHIPS) AS RESET_ROLLING FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE IN (3, 4) AND RESET = 1'
    ),
    pool.query(
      'SELECT SUM(NN_CHIPS) AS RESET_CASHOUT FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 2 AND RESET = 1'
    ),
    pool.query('SELECT SUM(AMOUNT) AS TOTAL_ROLLING FROM total_rolling WHERE RESET = 1'),
    pool.query(
      'SELECT SUM(ROLLER_CC_CHIPS) AS RETURN_ROLLER_CC FROM game_record WHERE ACTIVE = 1 AND ROLLER_TRANSACTION = 2 AND RESET = 1'
    ),
    pool.query(
      'SELECT SUM(CC_CHIPS) AS TOTAL_CC FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 1 AND TRANSACTION IN (1, 2, 3) AND RESET = 1'
    ),
    pool.query(`SELECT
        (SUM(CASE WHEN TRANSACTION_ID = 1 AND RESET = 1 THEN NN_CHIPS ELSE 0 END) +
         SUM(CASE WHEN TRANSACTION_ID = 3 AND RESET = 1 THEN NN_CHIPS ELSE 0 END) -
         SUM(CASE WHEN TRANSACTION_ID = 2 AND RESET = 1 THEN NN_CHIPS ELSE 0 END))
        AS HouseRollingChips
      FROM junket_total_chips WHERE ACTIVE = 1`),
  ]);

  const cageRolling = Math.round(
    num(rollingRows[0]?.RESET_ROLLING) -
      num(cashoutRows[0]?.RESET_CASHOUT) +
      num(manualRows[0]?.TOTAL_ROLLING) +
      num(returnRows[0]?.RETURN_ROLLER_CC) -
      num(ccBuyinRows[0]?.TOTAL_CC)
  );
  const houseRolling = Math.round(num(houseRows[0]?.HouseRollingChips));
  return { cageRolling, houseRolling };
}

module.exports = {
  computeDashboardCommissionSettlement,
  computeDashboardRollingKpis,
};
