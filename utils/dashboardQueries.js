const pool = require('../config/db');

// Function para kunin ang NN Chips Buyin
async function getNNChipsBuyin() {
  const sql = 'SELECT SUM(NN_CHIPS) AS NNChipsBuyin FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=1';
  const [rows] = await pool.execute(sql);
  return rows;
}

// Function para kunin ang NN Chips Cashout
async function getNNChipsCashout() {
  const sql = 'SELECT SUM(NN_CHIPS) AS NNChipsCashout FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2';
  const [rows] = await pool.execute(sql);
  return rows;
}

// Function para kunin ang Account NN Chips
async function getAccountNNChips() {
  const sql = 'SELECT SUM(NN_CHIPS) AS TOTAL_NN FROM game_record WHERE ACTIVE=1 AND CAGE_TYPE = 1';
  const [rows] = await pool.execute(sql);
  return rows;
}

// Function para kunin ang Total Cash Out Rolling
async function getTotalCashOutRolling() {
  const sql = 'SELECT SUM(NN_CHIPS) AS TOTAL_CASHOUT FROM game_record WHERE ACTIVE=1 AND CAGE_TYPE = 2';
  const [rows] = await pool.execute(sql);
  return rows;
}

// Function para kunin ang Total Real Rolling
async function getTotalRealRolling() {
  const sql = 'SELECT SUM(CC_CHIPS) AS TOTAL_REAL_ROLLING FROM game_record WHERE ACTIVE=1 AND CAGE_TYPE = 4';
  const [rows] = await pool.execute(sql);
  return rows;
}

// Function para kunin ang CC Chips Buyin
async function getCCChipsBuyin() {
  const sql = 'SELECT SUM(CC_CHIPS) AS CCChipsBuyin FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=1';
  const [rows] = await pool.execute(sql);
  return rows;
}

// Function para kunin ang CC Chips Cashout
async function getCCChipsCashout() {
  const sql = 'SELECT SUM(CC_CHIPS) AS CCChipsCashout FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2';
  const [rows] = await pool.execute(sql);
  return rows;
}

// Function para kunin ang NN Chips Rolling
async function getNNChipsRolling() {
  const sql = 'SELECT SUM(NN_CHIPS) AS NNChipsRolling FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=3';
  const [rows] = await pool.execute(sql);
  return rows;
}

// Function para kunin ang CC Chips Rolling
async function getCCChipsRolling() {
  const sql = 'SELECT SUM(CC_CHIPS) AS CCChipsRolling FROM junket_total_chips WHERE ACTIVE=1 AND TRANSACTION_ID=3';
  const [rows] = await pool.execute(sql);
  return rows;
}

// ROLLER CHIPS queries for CAGE_TYPE = 5
async function getRollerNNSubtract() {
  const sql = 'SELECT SUM(ROLLER_NN_CHIPS) AS ROLLER_NN_SUBTRACT FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 5 AND ROLLER_TRANSACTION = 1';
  const [rows] = await pool.execute(sql);
  return rows;
}

async function getRollerNNAdd() {
  const sql = 'SELECT SUM(ROLLER_NN_CHIPS) AS ROLLER_NN_ADD FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 5 AND ROLLER_TRANSACTION = 2';
  const [rows] = await pool.execute(sql);
  return rows;
}

async function getRollerCCSubtract() {
  const sql = 'SELECT SUM(ROLLER_CC_CHIPS) AS ROLLER_CC_SUBTRACT FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 5 AND ROLLER_TRANSACTION = 1';
  const [rows] = await pool.execute(sql);
  return rows;
}

async function getRollerCCAdd() {
  const sql = 'SELECT SUM(ROLLER_CC_CHIPS) AS ROLLER_CC_ADD FROM game_record WHERE ACTIVE = 1 AND CAGE_TYPE = 5 AND ROLLER_TRANSACTION = 2';
  const [rows] = await pool.execute(sql);
  return rows;
}
// Function para kunin ang NN Buyin
async function getNNBuyin() {
  const sql = 'SELECT SUM(NN_CHIPS) AS NNBuyin FROM junket_chips WHERE ACTIVE=1 AND TRANSACTION_ID=1';
  const [rows] = await pool.execute(sql);
  return rows;
}

// Function para kunin ang NN Return
async function getNNReturn() {
  const sql = 'SELECT SUM(NN_CHIPS) AS NNReturn FROM junket_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2';
  const [rows] = await pool.execute(sql);
  return rows;
}

// ✅ CC-specific additional queries:
async function getAccountCCChipsReturn() {
  const sql = 'SELECT SUM(CC_CHIPS) AS CC_CHIPS_RETURN FROM game_record WHERE ACTIVE=1 AND CAGE_TYPE = 2';
  const [rows] = await pool.execute(sql);
  return rows;
}

async function getCCChipsBuyinGame() {
  const sql = 'SELECT SUM(CC_CHIPS) AS TOTAL_CC FROM game_record WHERE ACTIVE=1 AND CAGE_TYPE = 1 AND TRANSACTION IN (1, 2, 3)';
  const [rows] = await pool.execute(sql);
  return rows;
}

async function getCCBuyin() {
  const sql = 'SELECT SUM(CC_CHIPS) AS CCBuyin FROM junket_chips WHERE ACTIVE=1 AND TRANSACTION_ID=1';
  const [rows] = await pool.execute(sql);
  return rows;
}

async function getCCReturn() {
  const sql = 'SELECT SUM(CC_CHIPS) AS CCReturn FROM junket_chips WHERE ACTIVE=1 AND TRANSACTION_ID=2';
  const [rows] = await pool.execute(sql);
  return rows;
}

module.exports = {
  getNNChipsBuyin,
  getNNChipsCashout,
  getAccountNNChips,
  getTotalCashOutRolling,
  getTotalRealRolling,
  getCCChipsBuyin,
  getCCChipsCashout,
  getNNChipsRolling,
  getCCChipsRolling,
  getRollerNNSubtract,
  getRollerNNAdd,
  getRollerCCSubtract,
  getRollerCCAdd,
  getNNBuyin,
  getNNReturn,
  getAccountCCChipsReturn,
  getCCChipsBuyinGame,
  getCCBuyin,
  getCCReturn
};
