const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkSession, sessions } = require('./auth');

router.get("/Change_Game_No", checkSession, function (req, res) {

	const permissions = req.session.permissions;

	res.render("popups/Change_Game_No", {
		...sessions(req, 'Change_Game_No'),
		permissions: permissions
	});

});

// POST: Update game number (set AUTO_INCREMENT)
router.post('/game_list/update_game_number', async (req, res) => {
	try {
	  console.log("Received request body:", req.body);
	  const { newGameNo } = req.body;
	  const encodedBy = req.session.user_id;
  
	  if (!newGameNo || isNaN(newGameNo)) {
		return res.json({ success: false, message: 'Invalid Game Number. Please enter a valid number.' });
	  }
  
	  if (!encodedBy) {
		return res.json({ success: false, message: 'User session expired. Please log in again.' });
	  }
  
	  // Get the latest game number
	  const fetchQuery = `SELECT IDNo FROM game_list ORDER BY IDNo DESC LIMIT 1`;
	  const [result] = await pool.execute(fetchQuery);
  
	  if (result.length === 0) {
		return res.json({ success: false, message: 'No game number available' });
	  }
  
	  const latestGameNo = result[0].IDNo;
	  console.log("Latest game number:", latestGameNo);
  
	  if (parseInt(newGameNo) <= latestGameNo) {
		return res.json({
		  success: false,
		  message: `Invalid input! You cannot enter a game number lower than ${latestGameNo}.`
		});
	  }
  
	  // ✅ Use string interpolation for AUTO_INCREMENT (no ? allowed)
	  const nextAutoIncrementValue = parseInt(newGameNo, 10);
	  const autoIncrementQuery = `ALTER TABLE game_list AUTO_INCREMENT = ${nextAutoIncrementValue}`;
	  await pool.execute(autoIncrementQuery); // No placeholders here
  
	  // ✅ Log the change
	  const logQuery = `
		INSERT INTO game_number_logs (PREVIOUS_GAME_NUMBER, NEW_GAME_NUMBER, ENCODED_BY) 
		VALUES (?, ?, ?)
	  `;
	  await pool.execute(logQuery, [latestGameNo, newGameNo, encodedBy]);
  
	  res.json({
		success: true,
		message: `AUTO_INCREMENT updated to ${nextAutoIncrementValue}. Next game number will start from this.`
	  });
  
	} catch (error) {
	  console.error('Error updating game number:', error);
	  res.status(500).json({ success: false, message: 'Database error while updating game number' });
	}
  });
  
// GET: Retrieve game number logs
router.get('/game_list/logs', async (req, res) => {
	try {
	  const query = `
		SELECT game_number_logs.*, user_info.FIRSTNAME 
		FROM game_number_logs 
		JOIN user_info ON game_number_logs.ENCODED_BY = user_info.IDNo
		ORDER BY game_number_logs.ENCODED_DT DESC
	  `;
	  const [results] = await pool.execute(query);
	  res.json(results);
	} catch (error) {
	  console.error('Error fetching game number logs:', error);
	  res.status(500).json({ success: false, message: 'Database error' });
	}
  });
  
  // GET: Retrieve the latest game number
  router.get('/game_list/latest/game_number', async (req, res) => {
	try {
	  const query = `SELECT MAX(IDNo) AS currentGameNo FROM game_list`;
	  const [result] = await pool.execute(query);
  
	  if (result.length === 0 || !result[0].currentGameNo) {
		return res.json({ success: false, message: 'No game number available' });
	  }
  
	  res.json({ success: true, gameNumber: result[0].currentGameNo });
	} catch (error) {
	  console.error('Error fetching game number:', error);
	  res.status(500).json({ success: false, message: 'Database error' });
	}
  });
// Export the router
module.exports = router; 