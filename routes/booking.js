const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { checkSession, sessions } = require('./auth');

// BOOKING
router.get("/booking",checkSession, function (req, res) {

	const permissions = req.session.permissions;

	res.render("junket/booking", {
		...sessions(req, 'booking'),
		permissions: permissions
	});
});

// ADD BOOKING
router.post('/add_junket_booking', async (req, res) => {
	const {
		txtConfirmationNumber,
		txtCheckInDate,
		txtCheckOutDate,
		txtAccountNumber,
		txtGuestName,
		txtHotelFee,
		txtAddFee,
		txtTotalAmount,
		txtRemarks
	} = req.body;

	const hotelFee = txtHotelFee.replace(/,/g, '');
	const addFee = txtAddFee.replace(/,/g, '');
	const totalAmount = txtTotalAmount.replace(/,/g, '');
	const date_now = new Date();

	try {
		const query = `
			INSERT INTO booking (CONFIRM_NUM, CHECK_IN, CHECK_OUT, ACCT_NUM, GUEST_NAME, HOTEL_FEE, ADDT_FEE, TOTAL_AMOUNT, REMARKS, BOOKED_BY, BOOKING_DATE)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`;

		await pool.execute(query, [
			txtConfirmationNumber, txtCheckInDate, txtCheckOutDate, txtAccountNumber,
			txtGuestName, hotelFee, addFee, totalAmount, txtRemarks, req.session.user_id, date_now
		]);

		res.redirect('/booking');
	} catch (err) {
		console.error('Error inserting booking', err);
		res.status(500).send('Error inserting booking');
	}
});

// GET Booking Data
router.get('/junket_booking_data', async (req, res) => {
	try {
		const query = `
			SELECT booking.*, user_info.FIRSTNAME AS FIRSTNAME 
			FROM user_info 
			JOIN booking ON booking.BOOKED_BY = user_info.IDNo
			WHERE booking.ACTIVE = 1
		`;
		const [results] = await pool.execute(query);
		res.status(200).json(results);
	} catch (err) {
		console.error('Error fetching booking data:', err);
		res.status(500).json({ error: 'Error fetching booking data' });
	}
});

// CHECK-IN
router.put('/check_in/:id', async (req, res) => {
	const bookingId = req.params.id;
	const checkInDate = req.body.checkInDate;

	try {
		await pool.execute('UPDATE booking SET CHECK_IN = ? WHERE IDNo = ?', [checkInDate, bookingId]);
		res.status(200).json({ message: 'Check-in successful' });
	} catch (err) {
		console.error('Error during check-in:', err);
		res.status(500).json({ error: 'Error during check-in' });
	}
});

// CHECK-OUT
router.put('/check_out/:id', async (req, res) => {
	const bookingId = req.params.id;
	const checkOutDate = req.body.checkOutDate;

	try {
		await pool.execute('UPDATE booking SET CHECK_OUT = ? WHERE IDNo = ?', [checkOutDate, bookingId]);
		res.status(200).json({ message: 'Check-out successful' });
	} catch (err) {
		console.error('Error during check-out:', err);
		res.status(500).json({ error: 'Error during check-out' });
	}
});

// UPDATE PAYMENT STATUS
router.put('/booking_payment_status_update/:id', async (req, res) => {
	const bookingId = req.params.id;
	const paymentStatus = req.body.paymentStatus;

	try {
		await pool.execute('UPDATE booking SET PAYMENT_STATUS = ? WHERE IDNo = ?', [paymentStatus, bookingId]);
		res.status(200).json({ message: 'Payment status updated successfully' });
	} catch (err) {
		console.error('Error updating payment status:', err);
		res.status(500).json({ error: 'Error updating payment status' });
	}
});

// UPDATE BOOKING
router.post('/update_junket_booking', async (req, res) => {
	const { booking_id, confirm_num, check_in, check_out, guest_name, hotel_fee, add_fee, total_amount, remarks } = req.body;

	const hotelFee = hotel_fee.replace(/,/g, '');
	const addFee = add_fee.replace(/,/g, '');
	const totalAmount = total_amount.replace(/,/g, '');

	try {
		const sql = `
			UPDATE booking SET 
				CONFIRM_NUM = ?, CHECK_IN = ?, CHECK_OUT = ?, 
				GUEST_NAME = ?, HOTEL_FEE = ?, ADDT_FEE = ?, 
				TOTAL_AMOUNT = ?, REMARKS = ?, EDITED_DT = NOW(), EDITED_BY = ?
			WHERE IDNo = ?
		`;

		await pool.execute(sql, [
			confirm_num, check_in, check_out, guest_name, hotelFee, addFee,
			totalAmount, remarks, req.session.user_id, booking_id
		]);

		res.json({ message: 'Booking updated successfully' });
	} catch (err) {
		console.error('Database Error:', err);
		res.status(500).json({ error: 'Database update failed', details: err.message });
	}
});

// ARCHIVE BOOKING
router.put('/remove_booking/:id', async (req, res) => {
	const id = parseInt(req.params.id);
	const date_now = new Date();

	try {
		const query = `UPDATE booking SET ACTIVE = ?, EDITED_BY = ?, EDITED_DT = ? WHERE IDNo = ?`;
		await pool.execute(query, [0, req.session.user_id, date_now, id]);
		res.send('Booking archived successfully');
	} catch (err) {
		console.error('Error updating booking:', err);
		res.status(500).send('Error updating booking');
	}
});

// Export the router
module.exports = router; 