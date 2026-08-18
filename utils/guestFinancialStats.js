/**
 * Fast guest winloss / rolling / commission stats.
 * Uses a two-step query (games, then game_record by game id) plus short TTL cache.
 */

const CACHE_TTL_MS = 60_000;
const statsCache = new Map();

function getCacheKey(guestIds) {
	return guestIds
		.slice()
		.sort((a, b) => a - b)
		.join(',');
}

function emptyGuestStats(guestId) {
	return {
		guest_id: guestId,
		total_games: 0,
		total_rolling: 0,
		total_winloss: 0,
		total_commission: 0
	};
}

function computeGameFinancials(recordRow, commissionType, commissionRate) {
	const totalRollingChips =
		(Number(recordRow.total_rolling_nn) || 0) +
		(Number(recordRow.total_roller_return_cc) || 0) +
		(Number(recordRow.total_rolling_amount) || 0) +
		(Number(recordRow.total_rolling_real) || 0) +
		(Number(recordRow.total_rolling_nn_real) || 0) +
		(Number(recordRow.total_rolling_cc_real) || 0) -
		(Number(recordRow.total_cash_out_nn) || 0);
	const winloss =
		(Number(recordRow.total_amount) || 0) -
		(Number(recordRow.total_cash_out_chips) || 0);

	let commission = 0;
	if (commissionType === 1 || commissionType === 3) {
		commission = Math.round((totalRollingChips * commissionRate) / 100);
	} else if (commissionType === 2) {
		commission = Math.round((winloss * commissionRate) / 100);
	}

	return { totalRollingChips, winloss, commission };
}

async function fetchGuestFinancialStats(pool, guestIds) {
	const normalizedGuestIds = (guestIds || [])
		.map((id) => parseInt(id, 10))
		.filter(Boolean);
	if (!normalizedGuestIds.length) {
		return [];
	}

	const cacheKey = getCacheKey(normalizedGuestIds);
	const cached = statsCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.data;
	}

	const guestPlaceholders = normalizedGuestIds.map(() => '?').join(',');
	const statsByGuest = {};
	normalizedGuestIds.forEach((guestId) => {
		statsByGuest[String(guestId)] = emptyGuestStats(guestId);
	});

	const [gameRows] = await pool.execute(
		`SELECT gl.IDNo AS game_id,
			gl.GUEST_ID AS guest_id,
			COALESCE(gl.COMMISSION_TYPE, 0) AS commission_type,
			COALESCE(gl.COMMISSION_PERCENTAGE, 0) AS commission_percentage
		 FROM game_list gl
		 WHERE gl.ACTIVE IN (1, 2)
		   AND gl.GUEST_ID IN (${guestPlaceholders})`,
		normalizedGuestIds
	);

	if (!Array.isArray(gameRows) || gameRows.length === 0) {
		const emptyData = Object.values(statsByGuest);
		statsCache.set(cacheKey, { data: emptyData, expiresAt: Date.now() + CACHE_TTL_MS });
		return emptyData;
	}

	const gameIds = [...new Set(gameRows.map((row) => row.game_id).filter(Boolean))];
	const gamePlaceholders = gameIds.map(() => '?').join(',');
	const [recordRows] = await pool.execute(
		`SELECT
			gr.GAME_ID AS game_id,
			COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 1 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0) AS total_amount,
			COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS + gr.CC_CHIPS ELSE 0 END), 0) AS total_cash_out_chips,
			COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 2 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_cash_out_nn,
			COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.AMOUNT ELSE 0 END), 0) AS total_rolling_amount,
			COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 3 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_rolling_nn,
			COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.AMOUNT ELSE 0 END), 0) AS total_rolling_real,
			COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.NN_CHIPS ELSE 0 END), 0) AS total_rolling_nn_real,
			COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 4 THEN gr.CC_CHIPS ELSE 0 END), 0) AS total_rolling_cc_real,
			COALESCE(SUM(CASE WHEN gr.CAGE_TYPE = 5 AND COALESCE(gr.ROLLER_TRANSACTION, 1) = 2 THEN gr.ROLLER_CC_CHIPS ELSE 0 END), 0) AS total_roller_return_cc
		 FROM game_record gr
		 WHERE gr.ACTIVE = 1
		   AND gr.GAME_ID IN (${gamePlaceholders})
		 GROUP BY gr.GAME_ID`,
		gameIds
	);

	const recordMap = {};
	(recordRows || []).forEach((row) => {
		recordMap[String(row.game_id)] = row;
	});

	gameRows.forEach((game) => {
		const guestKey = String(game.guest_id);
		const bucket = statsByGuest[guestKey];
		if (!bucket) return;

		const recordRow = recordMap[String(game.game_id)] || {};
		const commissionType = Number(game.commission_type) || 0;
		const commissionRate = Number(game.commission_percentage) || 0;
		const metrics = computeGameFinancials(recordRow, commissionType, commissionRate);

		bucket.total_games += 1;
		bucket.total_rolling += metrics.totalRollingChips;
		bucket.total_winloss += metrics.winloss;
		bucket.total_commission += metrics.commission;
	});

	const data = Object.values(statsByGuest);
	statsCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });

	if (statsCache.size > 200) {
		const now = Date.now();
		for (const [key, value] of statsCache) {
			if (value.expiresAt <= now) {
				statsCache.delete(key);
			}
		}
	}

	return data;
}

function invalidateGuestFinancialStatsCache() {
	statsCache.clear();
}

module.exports = {
	fetchGuestFinancialStats,
	invalidateGuestFinancialStatsCache
};
