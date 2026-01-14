const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const argon2 = require('argon2');
const crypto = require('crypto');

function isArgonHash(hash) {
    return typeof hash === 'string' && hash.startsWith('$argon2');
  }
  
  // Fallback MD5 for legacy support
  function generateMD5(input) {
    return crypto.createHash('md5').update(input).digest('hex');
  }
// Middleware to check session
const checkSession = (req, res, next) => {
    if (!req.session || !req.session.username) {
        res.redirect('/login');
    } else {
        next();
    }
};
function sessions(req, page) {
	return {
		username: req.session.username,
		firstname: req.session.firstname,
			lastname: req.session.lastname,
		user_id: req.session.user_id,
		currentPage: page
	};
}





router.get(["/", "/login"], (req, res) => res.render("login"));

router.get("/user_roles", checkSession, function (req, res) {
	res.render("user_accounts/user_roles", sessions(req, 'user_roles'));
});

router.get("/manage_users", checkSession, function (req, res) {
	res.render("user_accounts/manage_users", sessions(req, 'manage_users'));
});

// Login route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const query = 'SELECT * FROM user_info WHERE USERNAME = ? AND ACTIVE = 1';
  
    try {
      const [results] = await pool.execute(query, [username]);
  
      if (results.length > 0) {
        const user = results[0];
        const storedPassword = user.PASSWORD;
        const salt = user.SALT;
  
        let isValid = false;
        let isLegacy = false;
  
        if (isArgonHash(storedPassword)) {
          // ✅ Argon2 login
          isValid = await argon2.verify(storedPassword, password);
        } else {
          // 🔁 MD5 fallback
          const hashedMD5 = generateMD5(salt + password);
          isValid = (hashedMD5 === storedPassword);
          isLegacy = true;
        }
  
        if (isValid) {
          // Optional: auto-upgrade legacy MD5 password to Argon2
          if (isLegacy) {
            const newHash = await argon2.hash(password);
            await pool.execute(`UPDATE user_info SET PASSWORD = ?, SALT = NULL WHERE IDNo = ?`, [newHash, user.IDNo]);
          }
  
          req.session.username = username;
          req.session.firstname = user.FIRSTNAME;
          req.session.lastname = user.LASTNAME;
          req.session.user_id = user.IDNo;
          req.session.permissions = user.PERMISSIONS;
  
          req.session.save(err => {
            if (err) {
              req.flash('error', 'Session error, please try again.');
              return res.redirect('/login');
            }
            return res.redirect('/dashboard');
          });
        } else {
          req.flash('error', 'Incorrect password');
          return res.redirect('/login');
        }
      } else {
        req.flash('error', 'User not found or inactive');
        return res.redirect('/login');
      }
    } catch (error) {
      console.error('Login error:', error);
      req.flash('error', 'Internal server error');
      return res.redirect('/login');
    }
  });
  
// Verify Password route using async/await
router.post('/verify-password', async (req, res) => {
    try {
      const { password } = req.body;
      const query = 'SELECT * FROM user_info WHERE PERMISSIONS = 11 AND ACTIVE = 1';
      const [results] = await pool.execute(query);
      
      if (results.length > 0) {
        const manager = results[0]; // Assume there's only one manager
        const salt = manager.SALT;
        const hashedPassword = generateMD5(salt + password);
        
        // Verify if the password matches the manager's password
        if (hashedPassword === manager.PASSWORD) {
          return res.json({ permissions: manager.PERMISSIONS });
        } else {
          return res.status(403).json({ message: 'Incorrect password' });
        }
      } else {
        return res.status(404).json({ message: 'Manager not found' });
      }
    } catch (error) {
      console.error('Error executing MySQL query: ' + error.stack);
      return res.status(500).json({ message: 'Error during password verification' });
    }
  });

// Check Permission route
router.post('/check-permission', (req, res) => {
    if (!req.session.permissions) {
        return res.status(401).json({ message: 'Not logged in' });
    }
    if (req.session.permissions === 11) {
        return res.json({ permissions: 11 });
    } else {
        return res.json({ permissions: req.session.permissions });
    }
});

// Logout route
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Add user route
router.post('/add_user', async (req, res) => {
    try {
      const {
        txtFirstName,
        txtLastName,
        txtUserName,
        txtPassword,
        txtPassword2,
        user_role
      } = req.body;
  
      let date_now = new Date();
  
      if (txtPassword !== txtPassword2) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }
  
      const hashedPassword = await argon2.hash(txtPassword); // ✅ Secure password
  
      const query = `
        INSERT INTO user_info 
        (FIRSTNAME, LASTNAME, USERNAME, PASSWORD, PERMISSIONS, LAST_LOGIN, ENCODED_BY, ENCODED_DT) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
  
      await pool.execute(query, [
        txtFirstName,
        txtLastName,
        txtUserName,
        hashedPassword,
        user_role,
        date_now,
        req.session.user_id,
        date_now
      ]);
  
      res.redirect('/users');
    } catch (err) {
      console.error('Error inserting user:', err);
      res.status(500).send('Error inserting user');
    }
  });
  

/// ADD USER ROLE
router.post('/add_user_role', async (req, res) => {
	try {
		const { role } = req.body;
		const date_now = new Date();
		const query = `INSERT INTO user_role (ROLE, ENCODED_BY, ENCODED_DT) VALUES (?, ?, ?)`;

		await pool.execute(query, [role, req.session.user_id, date_now]);
		res.redirect('/user_roles');
	} catch (err) {
		console.error('Error inserting user role:', err);
		res.status(500).send('Error inserting user');
	}
});

// GET USER ROLE
router.get('/user_role_data', async (req, res) => {
	try {
		const [results] = await pool.execute('SELECT * FROM user_role WHERE ACTIVE = 1');
		res.json(results);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});

// UPDATE USER ROLE
router.put('/user_role/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { role } = req.body;
		const date_now = new Date();
		const query = `UPDATE user_role SET ROLE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;

		await pool.execute(query, [role, req.session.user_id, date_now, id]);
		res.send('User role updated successfully');
	} catch (err) {
		console.error('Error updating user role:', err);
		res.status(500).send('Error updating user role');
	}
});

// ARCHIVE USER ROLE
router.put('/user_role/remove/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const date_now = new Date();
		const query = `UPDATE user_role SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;

		await pool.execute(query, [0, req.session.user_id, date_now, id]);
		res.send('User role updated successfully');
	} catch (err) {
		console.error('Error archiving user role:', err);
		res.status(500).send('Error updating user role');
	}
});


// GET USERS
router.get('/users', async (req, res) => {
	try {
		const query = `
			SELECT *, user_role.ROLE AS role, user_info.IDNo AS user_id 
			FROM user_info 
			JOIN user_role ON user_role.IDno = user_info.PERMISSIONS 
			WHERE user_info.ACTIVE = 1
		`;
		const [results] = await pool.execute(query);
		res.json(results);
	} catch (error) {
		console.error('Error fetching data:', error);
		res.status(500).send('Error fetching data');
	}
});

// ADD USER
router.post('/add_user', async (req, res) => {
	try {
		const {
			txtFirstName,
			txtLastName,
			txtUserName,
			txtPassword,
			txtPassword2,
			user_role,
			salt
		} = req.body;

		let date_now = new Date();

		if (txtPassword !== txtPassword2) {
			return res.status(500).json({ error: 'password' });
		}

		const generated_pw = await argon2.hash(txtPassword);
		const query = `
			INSERT INTO user_info 
			(FIRSTNAME, LASTNAME, USERNAME, PASSWORD, SALT, PERMISSIONS, LAST_LOGIN, ENCODED_BY, ENCODED_DT) 
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;

		await pool.execute(query, [
			txtFirstName,
			txtLastName,
			txtUserName,
			generated_pw,
			salt,
			user_role,
			date_now,
			req.session.user_id,
			date_now
		]);

		res.redirect('/users');
	} catch (err) {
		console.error('Error inserting user:', err);
		res.status(500).send('Error inserting user');
	}
});

// UPDATE USER
router.put('/user/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const {
			txtFirstName,
			txtLastName,
			txtUserName,
			user_role
		} = req.body;

		const date_now = new Date();

		const query = `
			UPDATE user_info 
			SET FIRSTNAME = ?, LASTNAME = ?, USERNAME = ?, PERMISSIONS = ?, EDITED_BY = ?, EDITED_DT = ? 
			WHERE IDNo = ?
		`;

		await pool.execute(query, [
			txtFirstName,
			txtLastName,
			txtUserName,
			user_role,
			req.session.user_id,
			date_now,
			id
		]);

		res.send('User role updated successfully');
	} catch (err) {
		console.error('Error updating user role:', err);
		res.status(500).send('Error updating user role');
	}
});

// ARCHIVE USER
router.put('/user/remove/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const date_now = new Date();

		const query = `
			UPDATE user_info 
			SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? 
			WHERE IDNo = ?
		`;

		await pool.execute(query, [0, req.session.user_id, date_now, id]);

		res.send('User role removed successfully');
	} catch (err) {
		console.error('Error updating user:', err);
		res.status(500).send('Error updating user');
	}
});

module.exports = {
    router,
    checkSession,
    sessions
  };
  