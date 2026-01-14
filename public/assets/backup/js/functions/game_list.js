var account_id;
var record_id;
var game_id;

function addGameList(id) {
	$('#modal-new-game-list').modal('show');

	get_account();
}


$(document).ready(function () {
    // Initialize Flatpickr for date range
    flatpickr("#daterange", {
        mode: "range",
        altInput: true,
        altFormat: "M d, Y",
        dateFormat: "Y-m-d",
        defaultDate: [
            moment().startOf('month').format('YYYY-MM-DD'),
            moment().format('YYYY-MM-DD')
        ],
        showMonths: 2, // Display two months side-by-side
        onReady: function (selectedDates, dateStr, instance) {
            // Automatically navigate the calendar to show previous and current month side by side
            const today = new Date();
            instance.changeMonth(-1, true); // Go to the previous month programmatically
        },
    });

    if ($.fn.DataTable.isDataTable('#game_list-tbl')) {
        $('#game_list-tbl').DataTable().destroy();
    }

    var dataTable = $('#game_list-tbl').DataTable({
        "order": [[0, 'desc']], // Set the first column (index 0) to be sorted in descending order
        "pageLength": 10, // Set the page length to 100
        "columnDefs": [{
            createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
                $(cell).addClass('text-center');
            }
        }],

		"language": {
        "info": "Showing _START_ to _END_ of _TOTAL_ entries", // Custom text
       
       
    },

        createdRow: function (row, data, index) {
            if (parseInt(data[12].split(',').join('')) < 0) {
                $('td:eq(12)', row).css({
                    'background-color': '#fff',
                    'color': 'red'
                });
            }
        }
    });

    function reloadData() {
        const dateRange = $('#daterange').val();

        if (!dateRange) {
            alert('Please select a date range.');
            return;
        }

        const [start, end] = dateRange.split(' to ');

      

        $.ajax({
            url: '/game_list_data', // Endpoint to fetch data
            method: 'GET',
            data: { start, end },
            success: function (data) {
                dataTable.clear();

                // Assume you have the user's permissions stored in a variable `userPermissions`
                var userPermissions = parseInt(document.getElementById('user-role').getAttribute('data-permissions'));

                // Initialize totals
                let totalInitialBuyIn = 0;
                let totalAdditionalBuyIn = 0;
                let totalAmount = 0;
                let totalRolling = 0;
                let totalChipsReturn = 0;
                let totalWinLoss = 0;

                data.forEach(function (row) {
                    var btn = `<div class="btn-group">
                        <button type="button" onclick="viewRecord(${row.game_list_id})" class="btn btn-sm btn-alt-info js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Details">
                        GAME RECORD
                        </button>
                        <button type="button" onclick="changeStatus(${row.game_list_id})" class="btn btn-sm btn-alt-warning js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Status">
                        CHANGE STATUS
                        </button>
                        <button type="button" onclick="archive_game_list(${row.game_list_id})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
                        <i class="fa fa-trash-alt"></i>
                        </button>
                    </div>`;

                    var btn_his = `<div class="btn-group" role="group">
                        <button type="button" onclick="showHistory(${row.game_list_id})" class="btn btn-sm btn-alt-info js-bs-tooltip-enabled"
                            data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Details" 
                            style="font-size:8px !important; margin-right: 5px;"> <!-- Add margin-right for spacing -->
                            History
                        </button>
                    </div>`;

                    var ref = '';
                    var acct_code = '';

                    if (row.GUESTNo) {
                        ref = `${row.CODE}-${row.AGENT_CODE}-${row.GUESTNo}-${row.GAME_NO}`;
                        acct_code = `${row.CODE}-${row.AGENT_CODE}-${row.GUESTNo}`;
                    } else {
                        ref = `${row.CODE}-${row.AGENT_CODE}-${row.GAME_NO}`;
                        acct_code = `${row.CODE}-${row.AGENT_CODE}`;
                    }

                    var dateFormat = moment(row.GAME_DATE).format('MMMM DD, YYYY');

                    $.ajax({
                        url: '/game_list/' + row.game_list_id + '/record',
                        method: 'GET',
                        success: function (response) {
                            var total_buy_in = 0;
                            var total_cash_out = 0;
                            var total_rolling = 0;
                            var initial_buy_in = 0;

                            var total_nn_init = 0;
                            var total_cc_init = 0;
                            var total_nn = 0;
                            var total_cc = 0;
                            var total_cash_out_nn = 0;
                            var total_cash_out_cc = 0;
                            var total_rolling_nn = 0;
                            var total_rolling_cc = 0;

                            var total_rolling_real = 0;
                            var total_rolling_nn_real = 0;
                            var total_rolling_cc_real = 0;

                            response.forEach(function (res) {
                                if (res.CAGE_TYPE == 1 && (total_nn_init != 0 || total_cc_init != 0)) {
                                    total_buy_in = total_buy_in + res.AMOUNT;
                                    total_nn = total_nn + res.NN_CHIPS;
                                    total_cc = total_cc + res.CC_CHIPS;
                                }

                                if ((total_nn_init == 0 && total_cc_init == 0) && res.CAGE_TYPE == 1) {
                                    initial_buy_in = res.AMOUNT;
                                    total_nn_init = total_nn_init + res.NN_CHIPS;
                                    total_cc_init = total_cc_init + res.CC_CHIPS;
                                }

                                if (res.CAGE_TYPE == 2) {
                                    total_cash_out = total_cash_out + res.AMOUNT;
                                    total_cash_out_nn = total_cash_out_nn + res.NN_CHIPS;
                                    total_cash_out_cc = total_cash_out_cc + res.CC_CHIPS;
                                }

                                if (res.CAGE_TYPE == 3) {
                                    total_rolling = total_rolling + res.AMOUNT;
                                    total_rolling_nn = total_rolling_nn + res.NN_CHIPS;
                                    total_rolling_cc = total_rolling_cc + res.CC_CHIPS;
                                }

                                if (res.CAGE_TYPE == 4) {
                                    total_rolling_real = total_rolling_real + res.AMOUNT;
                                    total_rolling_nn_real = total_rolling_nn_real + res.NN_CHIPS;
                                    total_rolling_cc_real = total_rolling_cc_real + res.CC_CHIPS;
                                }
                            });
	
							var total_initial = total_nn_init + total_cc_init;
							var total_buy_in_chips = total_nn + total_cc;
							var total_cash_out_chips = total_cash_out_nn + total_cash_out_cc;
							var total_rolling_chips = total_rolling_nn + total_rolling_cc + total_rolling + total_rolling_real + total_rolling_nn_real + total_rolling_cc_real - total_cash_out_nn;
	
							var total_rolling_real_chips = total_rolling_real + total_rolling_nn_real + total_rolling_cc_real;
	
							var gross = total_buy_in - total_cash_out;
	
							var total_amount = total_buy_in_chips + total_initial;
	
					
	
							var winloss = parseFloat(total_amount - total_cash_out_chips).toLocaleString();
							
							var WinLoss = total_amount - total_cash_out_chips;
							
							
							 // Calculate net and format as an integer
							 var net = 0;
							 if (row.COMMISSION_TYPE == 1 || row.COMMISSION_TYPE == 3) {
								 // If COMMISSION_TYPE is 1 or 3, compute net using total rolling chips
								 net = Math.round(total_rolling_chips * (row.COMMISSION_PERCENTAGE / 100));
							 } else if (row.COMMISSION_TYPE == 2) {
								 // If COMMISSION_TYPE is 2, compute net using winloss
								 net = Math.round(WinLoss * (row.COMMISSION_PERCENTAGE / 100));
							 }
	
							// Add to grand totals
							totalInitialBuyIn += total_initial;
							totalAdditionalBuyIn += total_buy_in_chips;
							totalAmount += total_amount;
							totalRolling += total_rolling_chips;
							totalChipsReturn += total_cash_out_chips;
							totalWinLoss += parseFloat(winloss.replace(/,/g, ''));
	
							var btn_settle = '';
							var status = '';
	
							var buyin_td = '';
							var rolling_td = '';
							var cashout_td = '';
	
							if (row.game_status == 2) {
								if (userPermissions === 11 || userPermissions === 1) { // If manager
								status = `<button type="button" onclick="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID } , ${total_amount} , ${total_cash_out_chips} , ${total_rolling_chips} , ${WinLoss})" class="btn btn-sm btn-alt-info js-bs-tooltip-enabled"
									data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Status"  style="font-size:8px !important;">ON GAME</button>`;
								} else {
									// Show SweetAlert for cashier or other users
									status = `<button type="button" 
												class="btn btn-sm btn-alt-info btn-on-game" 
												style="font-size:8px !important;"
												onclick="showSweetAlert()">
											ON GAME
										</button>`;
								}
	
								buyin_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addBuyin(' + row.game_list_id + ', ' + row.ACCOUNT_ID + ')">'
								buyin_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addBuyin(' + row.game_list_id + ', ' + row.ACCOUNT_ID + ')">' + parseFloat(total_buy_in_chips).toLocaleString() + '</button>';
								rolling_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addRolling(' + row.game_list_id + ')">' + parseFloat(total_rolling_real_chips).toLocaleString() + '</button>';
								cashout_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addCashout(' + row.game_list_id + ', ' + row.ACCOUNT_ID + ', ' + total_rolling_chips + ')">' + parseFloat(total_cash_out_chips).toLocaleString() + '</button>';
								
									// Format net value as an integer
									var formattedNet = net.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
								var game_start = moment.utc(row.GAME_DATE_START).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
								dataTable.row.add([game_start,`${row.GAME_TYPE}`, `GAME-${row.game_list_id}`, `${row.agent_code} (${row.agent_name})`, total_initial.toLocaleString(), buyin_td, total_amount.toLocaleString(), rolling_td, parseFloat(total_rolling_chips).toLocaleString(), cashout_td, `${row.COMMISSION_PERCENTAGE}%`, formattedNet, winloss,`${row.INITIAL_MOP}`, status, btn_his]).draw();
							} else {
							
								if (userPermissions === 11 || userPermissions === 1) { // If manager
									// END GAME STATUS EDITABLE(ON GAME & END GAME)
								status = `<a href="#" onclick="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID })">${moment(row.GAME_ENDED).format('MMMM DD, YYYY HH:mm:ss')}</a>`;
	
								} else {
									
								// //END GAME STATUS NOT EDITABLE
								status = `<a href="#" onclick="showEndGameAlert()">${moment(row.GAME_ENDED).format('MMMM DD, YYYY HH:mm:ss')}</a>`;

									
								}
	
								buyin_td = parseFloat(total_buy_in_chips).toLocaleString();
								rolling_td = parseFloat(total_rolling_real_chips).toLocaleString();
								cashout_td = '<span style="font-size:11px;text-decoration: none;" >' + parseFloat(total_cash_out_chips).toLocaleString() + '</span>';
	
								var btn_settle = `<div class="btn-group" role="group">
								<button type="button" onclick="showHistory(${row.game_list_id})" class="btn btn-sm btn-alt-info js-bs-tooltip-enabled"
										data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Details" 
										style="font-size:8px !important; margin-right: 5px;"> <!-- Add margin-right for spacing -->
										History
								</button>
								<button type="button" onclick="settlement_history(${row.game_list_id}, ${row.ACCOUNT_ID })" class="btn btn-sm btn-alt-success js-bs-tooltip-enabled"
										data-bs-toggle="tooltip" aria-label="Settle" data-bs-original-title="Settle" 
										style="font-size:10px !important;">
										 ${row.SETTLED === 1 ? 'Settled' : 'Settlement'}
								</button>
						   </div>`;
						   // Format net value as an integer
						   var formattedNet = net.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
						   
						   var game_start = moment.utc(row.GAME_DATE_START).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
						   dataTable.row.add([game_start,`${row.GAME_TYPE}`, `GAME-${row.game_list_id}`, `${row.agent_code} (${row.agent_name})`, total_initial.toLocaleString(), buyin_td, total_amount.toLocaleString(), rolling_td, parseFloat(total_rolling_chips).toLocaleString(), cashout_td, `${row.COMMISSION_PERCENTAGE}%`, formattedNet, winloss,`${row.INITIAL_MOP}`, status, btn_settle]).draw();
							}
	
						},
						error: function (xhr, status, error) {
                            console.error('Error fetching options:', error);
                        }
                    });
                });
            },
            error: function (xhr, status, error) {
                console.error('Error fetching data:', error);
            }
        });
    }

    reloadData(); // Load data initially

    $('#daterange').on('change', function () {
        reloadData(); // Reload data when date range changes
    });

// Function to format numbers with commas
function formatNumberWithCommas(number) {
	return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
$('#add_game_list').submit(function (event) {
    event.preventDefault(); // Prevent the default form submission

    var $btn = $('#submit-game-list-btn'); // Reference to the submit button
    $btn.prop('disabled', true).text('Processing...'); // Disable button immediately

    // Retrieve values and trim them
    var nnChips = $('#txtNN').val().trim();
    var ccChips = $('#txtCC').val().trim();
    var transType = $('input[name="txtTransType"]:checked').val(); // Get the selected transaction type
    var commissionTypeSelected = $('#commissionType').val() !== ''; // Check if commission type is selected
    var txtNNamount = parseFloat(nnChips.split(',').join('')) || 0; // Convert NN Chips to number
    var txtCCamount = parseFloat(ccChips.split(',').join('')) || 0; // Convert CC Chips to number
    var totalBalanceGuest1 = parseFloat($('#total_balanceGuest1').val().replace(/,/g, '')) || 0; // Get the total balance

    // Check if the required fields are filled
    if ((nnChips === '' && ccChips === '') || !transType || !commissionTypeSelected) {
        // Build the warning message based on what’s missing
        let message = 'Please fill in the required fields: ';
        if (nnChips === '' && ccChips === '') {
            message += 'NN Chips or CC Chips, ';
        }
        if (!transType) {
            message += 'Transaction Type, ';
        }
        if (!commissionTypeSelected) {
            message += 'Commission Type.';
        }

        // Show SweetAlert for missing fields
        Swal.fire({
            title: 'Warning',
            text: message.slice(0, -2) + '!', // Remove the last comma and space
            icon: 'warning',
            confirmButtonText: 'OK'
        });

        $btn.prop('disabled', false).text('Submit'); // Re-enable button
    } else if (transType == 2 && (txtNNamount + txtCCamount) > totalBalanceGuest1) {
        // If Transaction Type is 2, check if the sum of NN and CC exceeds the total balance
        Swal.fire({
            title: 'Insufficient Balance',
            text: 'The amount exceeds the available total balance of ' + formatNumberWithCommas(totalBalanceGuest1),
            icon: 'error',
            confirmButtonText: 'OK'
        });

        $btn.prop('disabled', false).text('Submit'); // Re-enable button
    } else {
        // If validation passes, proceed with AJAX submission
        var formData = $(this).serialize();

        $.ajax({
            url: '/add_game_list',
            type: 'POST',
            data: formData,
            success: function (response) {
                // Show success message
                Swal.fire({
                    icon: 'success',
                    title: 'Success!',
                    text: 'New game successfully added.',
                    confirmButtonText: 'OK',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        reloadData(); // Reload data after confirmation
                        $('#modal-new-game-list').modal('hide'); // Close modal
                        window.location.reload(); // Refresh page
                    }
                });
            },
            error: function (xhr, status, error) {
                var errorMessage = xhr.responseJSON?.error || "An error occurred.";
                console.error('Error adding game list:', errorMessage);

                // Show error message
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: errorMessage,
                    confirmButtonText: 'OK'
                });

                $btn.prop('disabled', false).text('Submit'); // Re-enable button after error
            }
        });
    }
});
	
	$('#add_buyin').submit(function (event) {
		event.preventDefault(); // Prevent the default form submission
	
		var $btn = $('#submit-buyin-btn'); // Reference to the submit button
		$btn.prop('disabled', true).text('Processing...'); // Disable button immediately
	
		var nnChips = $('.txtNN').val().trim();
		var ccChips = $('.txtCC').val().trim();
		var transTypeSelected = $('input[name="txtTransType"]:checked').length > 0; // Check if any radio button is selected
		var totalBalanceGuest2 = parseFloat($('#total_balanceGuest2').val().replace(/,/g, '')) || 0; // Get the total balance
		var txtNNamount = parseFloat(nnChips.split(',').join('')) || 0; // Convert NN Chips to number
		var txtCCamount = parseFloat(ccChips.split(',').join('')) || 0; // Convert CC Chips to number
	
		// Check if both NN Chips and CC Chips are empty and no radio button is selected
		if (nnChips === '' && ccChips === '' && !transTypeSelected) {
			Swal.fire({
				title: 'Warning',
				text: 'Please fill in at least one field: NN Chips or CC Chips, and select a Transaction Type!',
				icon: 'warning',
				confirmButtonText: 'OK'
			});
			$btn.prop('disabled', false).text('Save'); // Re-enable button
		} else if (nnChips === '' && ccChips === '') {
			Swal.fire({
				title: 'Warning',
				text: 'Please fill in at least one field: NN Chips or CC Chips!',
				icon: 'warning',
				confirmButtonText: 'OK'
			});
			$btn.prop('disabled', false).text('Save'); // Re-enable button
		} else if (!transTypeSelected) {
			Swal.fire({
				title: 'Warning',
				text: 'Please select a Transaction Type!',
				icon: 'warning',
				confirmButtonText: 'OK'
			});
			$btn.prop('disabled', false).text('Save'); // Re-enable button
		} else if (transTypeSelected && $('input[name="txtTransType"]:checked').val() == 2 && (txtNNamount + txtCCamount) > totalBalanceGuest2) {
			Swal.fire({
				title: 'Insufficient Balance',
				text: 'The amount exceeds the available total balance of ' + formatNumberWithCommas(totalBalanceGuest2),
				icon: 'error',
				confirmButtonText: 'OK'
			});
			$btn.prop('disabled', false).text('Save'); // Re-enable button
		} else {
			// If validation passes, proceed with AJAX submission
			var formData = $(this).serialize();
	
			$.ajax({
				url: '/game_list/add/buyin',
				type: 'POST',
				data: formData,
				success: function (response) {
					// Show success message
					Swal.fire({
						icon: 'success',
						title: 'Success!',
						text: 'Additional Buy-in successfully added.',
						confirmButtonText: 'OK',
						allowOutsideClick: false,
						allowEscapeKey: false
					}).then((result) => {
						if (result.isConfirmed) {
							reloadData(); // Reload data after confirmation
							$('#modal-add-buyin').modal('hide'); // Close modal
							$('#add_buyin')[0].reset(); // Reset form
							$btn.prop('disabled', false).text('Submit'); // Re-enable button
						}
					});
				},
				error: function (xhr, status, error) {
					var errorMessage = xhr.responseJSON?.error || "An error occurred.";
					console.error('Error adding buy-in transaction:', errorMessage);
	
					// Show error message
					Swal.fire({
						icon: 'error',
						title: 'Error',
						text: errorMessage,
						confirmButtonText: 'OK'
					});
	
					$btn.prop('disabled', false).text('Submit'); // Re-enable button after error
				}
			});
		}
	});

	$('#add_cashout').submit(function (event) {
		event.preventDefault();

	// Get the values of txtNN and txtTotalRolling
		
		var txtTotalRolling = parseFloat($('#TotalRollingCashout').val()); // Ensure we have a number, default to 0 if invalid
		var txtNN = parseFloat(($('#txtNNCashout').val() || '0').replace(/,/g, '')); // Default to '0' if value is empty or invalid
		var txtCC = parseFloat(($('#txtCCCashout').val() || '0').replace(/,/g, '')); // Default to '0' if value is empty or invalid
		var markerChipsReturn = parseFloat(($('#MarkerChipsReturn').val() || '0').replace(/,/g, '')); // Ensure we have a number, default to 0 if invalid
		var txtTransType = $('input[name="txtTransType"]:checked').val(); // Get the selected transaction type

		

		// Validate if txtNN is greater than txtTotalRolling
		if (txtNN > txtTotalRolling) {
			// Trigger SweetAlert if validation fails
			Swal.fire({
				icon: 'warning',
				title: 'Invalid Input',
				text: 'NN Chips returned cannot exceed Total Rolling: '+ formatNumberWithCommas(txtTotalRolling),
			});
			return; // Prevent form submission
		}

		// Check if the selected transaction type is "Marker" (txtTransType == 4)
		if (txtTransType == 4) {
			// Validate if txtCC or txtNN is greater than MarkerChipsReturn
			if (txtCC > markerChipsReturn || txtNN > markerChipsReturn) {
				// Trigger SweetAlert if validation fails
				Swal.fire({
					icon: 'warning',
					title: 'Invalid Input',
					text: 'Marker Chips Return cannot exceed Marker Balance: ' + formatNumberWithCommas(markerChipsReturn),
				});
				return; // Prevent form submission
			}

			// Validate if the total of txtCC and txtNN is greater than MarkerChipsReturn
			var totalChips = txtCC + txtNN;
			if (totalChips > markerChipsReturn) {
				// Trigger SweetAlert if validation fails
				Swal.fire({
					icon: 'warning',
					title: 'Invalid Input',
					text: 'Marker Chips Return cannot exceed Marker Balance: ' + formatNumberWithCommas(markerChipsReturn),
				});
				return; // Prevent form submission
			}
			
		}
	
		var formData = $(this).serialize();
	
		$.ajax({
			url: '/game_list/add/cashout',
			type: 'POST',
			data: formData,
			success: function (response) {
				// Trigger SweetAlert on success
				Swal.fire({
					icon: 'success',
					title: 'Success!',
					text: 'Chips return process completed!'
				}).then(() => {
					reloadData(); // Reload your data or table
					$('#modal-add-cashout').modal('hide'); // Hide the modal
				});
			},
			error: function (xhr, status, error) {
				var errorMessage = xhr.responseJSON?.error || 'Something went wrong. Please try again.';
				// Trigger SweetAlert on error
				Swal.fire({
					icon: 'error',
					title: 'Error!',
					text: errorMessage
				});
			}
		});
	});

	$('#add_rolling').submit(function (event) {
		event.preventDefault();
	
		var $btn = $('#submit-rolling-btn'); // Reference to the submit button
		$btn.prop('disabled', true).text('Processing...'); // Disable button and change text
	
		var formData = $(this).serialize();
	
		$.ajax({
			url: '/game_list/add/rolling',
			type: 'POST',
			data: formData,
			success: function (response) {
				// Show success message
				Swal.fire({
					icon: 'success',
					title: 'Success!',
					text: 'Rolling transaction successfully added.',
					confirmButtonText: 'OK',
					allowOutsideClick: false,
					allowEscapeKey: false
				}).then((result) => {
					if (result.isConfirmed) {
						reloadData(); // Reload data after confirmation
						$('#modal-add-rolling').modal('hide'); // Close modal
						$('#add_rolling')[0].reset(); // Reset form
						$btn.prop('disabled', false).text('Save'); // Re-enable button
					}
				});
			},
			error: function (xhr, status, error) {
				var errorMessage = xhr.responseJSON?.error || "An error occurred while processing.";
				console.error('Error adding rolling transaction:', errorMessage);
				
				// Show error message
				Swal.fire({
					icon: 'error',
					title: 'Error',
					text: errorMessage,
					confirmButtonText: 'OK'
				});
	
				$btn.prop('disabled', false).text('Save'); // Re-enable button after error
			}
		});
	});


// 	$('#edit_status').submit(function (event) {
// 		event.preventDefault();

// 		var formData = $(this).serialize();
// 		$.ajax({
// 			url: '/game_list/change_status/' + game_id,
// 			type: 'PUT',
// 			data: formData,
// 			success: function (response) {
// 				reloadData();
// 				$('#modal-change_status').modal('hide');
// 				window.location.reload();
// 			},
// 			error: function (error) {
// 				console.error('Error updating agent:', error);
// 			}
// 		});
// 	});
// 	// }

$('#edit_status').submit(function (event) {
    event.preventDefault();

    // Get the value of the status select
    var status = $('#status').val();

    // Validate that the user has selected either "ON GAME" or "END GAME"
    if (status === null) {
        // Show SweetAlert if no status is selected
        Swal.fire({
            icon: 'error',
            title: 'Choose Game Status',
            text: '',
            confirmButtonText: 'OK'
        }).then((result) => {
            if (result.isConfirmed) {
                // Keep the modal open if validation fails (do nothing here as modal stays open)
                $('#modal-change_status').modal('show'); // Ensure the modal stays open
            }
        });
        return; // Stop form submission
    }

    // Serialize form data
    var formData = $(this).serialize();

    // Submit the form via AJAX
    $.ajax({
        url: '/game_list/change_status/' + game_id,
        type: 'PUT',
        data: formData,
        success: function (response) {
            // Show success notification with SweetAlert
            Swal.fire({
                icon: 'success',
                title: 'Status updated successfully!',
                showConfirmButton: false,
                timer: 1500
            });

            // Reload data and hide modal
            reloadData();
            $('#modal-change_status').modal('hide');
        },
        error: function (error) {
            // Show error notification with SweetAlert
            Swal.fire({
                icon: 'error',
                title: 'Error!',
                text: 'Failed to update status. Please try again.',
            });
            console.error('Error updating status:', error);
        }
    });
});

	

});

function addBuyin(id, account) {
	$('#modal-add-buyin').modal('show');

	$('.txtAmount').val('');
	$('.txtNN').val('');
	$('.txtCC').val('');
	$('.form-check-input').prop('checked', false);

	$('.game_list_id').val(id);
	$('.txtAccountCode').val(account);
	

	 // Fetch account details to calculate balance
	 $.ajax({
        url: '/account_details_data_deposit/' + account, // Use the account parameter
        method: 'GET',
        success: function (data) {
            var deposit_amount = 0;
            var withdraw_amount = 0;
            var marker_return = 0;
			var marker_issue_amount = 0;

            data.forEach(function (row) {
                if (row.TRANSACTION === 'DEPOSIT') {
                    deposit_amount += row.AMOUNT;
                } else if (row.TRANSACTION === 'WITHDRAW') {
                    withdraw_amount += row.AMOUNT;
                } else if (row.TRANSACTION === 'Credit Returned thru Deposit') {
                    marker_return += row.AMOUNT;
                } else if (row.TRANSACTION === 'Credit Cash') {
					marker_issue_amount += row.AMOUNT;
				}
            });

            // Calculate and show the total balance
            var totalBalance = deposit_amount - withdraw_amount - marker_return + marker_issue_amount;
            $('#total_balanceGuest2').val(totalBalance); // Display formatted balance
        },
        error: function (xhr, status, error) {
            console.error('Error fetching account details:', error);
        }
    });

	// Initialize totals
		let totalInitialBuyIn = 0;
		let totalAdditionalBuyIn = 0;
		let totalAmount = 0;

	$.ajax({
		url: '/game_list/' + id + '/record',
		method: 'GET',
		success: function (response) {
			var total_buy_in = 0;
			var total_cash_out = 0;
			var total_rolling = 0;
			var initial_buy_in = 0;

			var total_nn_init = 0;
			var total_cc_init = 0;
			var total_nn = 0;
			var total_cc = 0;
			var total_cash_out_nn = 0;
			var total_cash_out_cc = 0;
			var total_rolling_nn = 0;
			var total_rolling_cc = 0;

			var total_rolling_real = 0;
			var total_rolling_nn_real = 0;
			var total_rolling_cc_real = 0;

			response.forEach(function (res) {
				if (res.CAGE_TYPE == 1 && (total_nn_init != 0 || total_cc_init != 0)) {
					total_buy_in = total_buy_in + res.AMOUNT;
					total_nn = total_nn + res.NN_CHIPS;
					total_cc = total_cc + res.CC_CHIPS;
				}

				if ((total_nn_init == 0 && total_cc_init == 0) && res.CAGE_TYPE == 1) {
					initial_buy_in = res.AMOUNT;
					total_nn_init = total_nn_init + res.NN_CHIPS;
					total_cc_init = total_cc_init + res.CC_CHIPS;
				}

				if (res.CAGE_TYPE == 2) {
					total_cash_out = total_cash_out + res.AMOUNT;
					total_cash_out_nn = total_cash_out_nn + res.NN_CHIPS;
					total_cash_out_cc = total_cash_out_cc + res.CC_CHIPS;
				}

				if (res.CAGE_TYPE == 3) {
					total_rolling = total_rolling + res.AMOUNT;
					total_rolling_nn = total_rolling_nn + res.NN_CHIPS;
					total_rolling_cc = total_rolling_cc + res.CC_CHIPS;
				}

				if (res.CAGE_TYPE == 4) {
					total_rolling_real = total_rolling_real + res.AMOUNT;
					total_rolling_nn_real = total_rolling_nn_real + res.NN_CHIPS;
					total_rolling_cc_real = total_rolling_cc_real + res.CC_CHIPS;
				}
			});

			var total_initial = total_nn_init + total_cc_init;
			var total_buy_in_chips = total_nn + total_cc;

			var total_amount = total_buy_in_chips + total_initial;

			// Add to grand totals
			totalInitialBuyIn += total_initial;
			totalAdditionalBuyIn += total_buy_in_chips;
			totalAmount += total_amount;

			$('#total_amount_addbuyin').val(totalAmount); // Display formatted balance
			
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

function addRolling(id) {
	$('#modal-add-rolling').modal('show');

	$('.txtAmount').val('');
	$('.txtNN').val('');
	$('.txtCC').val('');

	$('.game_list_id').val(id);
}

function addCashout(id, account, total_rolling_chips) {
	$('#modal-add-cashout').modal('show');

	$('.txtAmount').val('');
	$('.txtNN').val('');
	$('.txtCC').val('');

	$('.form-check-input').prop('checked', false);

	$('.game_list_id').val(id);
	$('.txtAccountCode').val(account);
	$('#TotalRollingCashout').val(total_rolling_chips);
	
	$.ajax({
        url: '/account_details_data_deposit/' + account, // Use the account parameter
        method: 'GET',
        success: function (data) {
            var deposit_amount = 0;
            var withdraw_amount = 0;
            var marker_return = 0;
			var marker_issue_amount = 0;

            data.forEach(function (row) {
                if (row.TRANSACTION === 'DEPOSIT') {
                    deposit_amount += row.AMOUNT;
                } else if (row.TRANSACTION === 'WITHDRAW') {
                    withdraw_amount += row.AMOUNT;
                } else if (row.TRANSACTION === 'Credit Returned thru Deposit') {
                    marker_return += row.AMOUNT;
                }  else if (row.TRANSACTION === 'Credit Cash') {
					marker_issue_amount += row.AMOUNT;
				}
            });

            // Calculate and show the total balance
            var totalBalance = deposit_amount - withdraw_amount - marker_return + marker_issue_amount;
            $('#total_balance_cashout').val(totalBalance); // Display formatted balance
        },
        error: function (xhr, status, error) {
            console.error('Error fetching account details:', error);
        }
    });
    
    $.ajax({
		url: '/marker_data_cashout/' + account,
		method: 'GET',
		success: function(data) {
			var amount = 0; // Initialize amount to 0
			if (data.length > 0) {
				data.forEach(function(row) {
					amount = row.TOTAL_AMOUNT;
				});
			}
			$('#MarkerChipsReturn').val(amount); // Update value outside the loop
		},
		error: function(err) {
			console.error('Error fetching marker data:', err);
		}
	});

}



function showHistory(record_id) {
	$('#modal-show-history').modal('show');

	

	if ($.fn.DataTable.isDataTable('#game_record-tbl')) {
		$('#game_record-tbl').DataTable().destroy();
	}

	var dataTable = $('#game_record-tbl').DataTable({
		columnDefs: [{
			createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
				$(cell).addClass('text-center');
			}
		}]
	});

// 	function reloadDataRecord() {
// 		$.ajax({
// 			url: '/game_record_data/' + record_id, // Endpoint to fetch data
// 			method: 'GET',
// 			success: function (data) {
// 				dataTable.clear();
// 				data.forEach(function (row) {

//                         //DEFAULT
// // 					var btn = `<div class="btn-group">
// // 			<button type="button" onclick="checkPermissionToDeleteHistory(${row.game_record_id})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
// // 			data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
// // 			<i class="fa fa-trash-alt"></i>
// // 			</button>
// // 		</div>`;
		
		
//                         	var btn;
//             		if (row.game_status == 1) {
//             			// Game has ended, disable the button
//             			btn = `<div class="btn-group">
//             				<button type="button" class="btn btn-sm btn-alt-danger" disabled aria-label="Game Ended">
//             					<i class="fa fa-trash-alt"></i>
//             				</button>
//             			</div>`;
//             		} else {
//             			// Game is ongoing, show the button
//             			btn = `<div class="btn-group">
//             				<button type="button" onclick="archive_game_record(${row.game_record_id})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
//             					data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
//             					<i class="fa fa-trash-alt"></i>
//             				</button>
//             			</div>`;
//             		}


// 					var trading = moment(row.record_date).format('MMMM DD, YYYY HH:mm:ss');
// 					// var record_date = moment(row.RECORD_DATE).format('MMMM DD, YYYY');

// 					var buy_in = 0;
// 					var cash_out = 0;
// 					var rolling = 0;
// 					var real_rolling = 0;

// 					if (row.CAGE_TYPE == 1) {
// 						buy_in = row.CC_CHIPS + row.NN_CHIPS;
// 					}

// 					if (row.CAGE_TYPE == 2) {
// 						cash_out = row.CC_CHIPS + row.NN_CHIPS;
// 					}

// 					if (row.CAGE_TYPE == 3) {
// 						rolling = row.AMOUNT + row.CC_CHIPS + row.NN_CHIPS;
// 					}

// 					if (row.CAGE_TYPE == 4) {
// 						real_rolling = row.AMOUNT + row.CC_CHIPS + row.NN_CHIPS;
// 					}

// 					dataTable.row.add([trading, buy_in.toLocaleString(), cash_out.toLocaleString(), real_rolling.toLocaleString(), rolling.toLocaleString(), row.NN_CHIPS.toLocaleString(), row.CC_CHIPS.toLocaleString(), btn]).draw();
// 				});
// 			},
// 			error: function (xhr, status, error) {
// 				console.error('Error fetching data:', error);
// 			}
// 		});
// 	}
function reloadDataRecord() {
    $.ajax({
        url: '/game_record_data/' + record_id, // Endpoint to fetch data
        method: 'GET',
        success: function (data) {
            const mergedData = {};

            // Pagsamahin ang data
            data.forEach(function (row) {
                let btn;
                if (row.game_status == 1) {
                    // Game has ended, disable the button
                    btn = `<div class="btn-group">
                        <button type="button" class="btn btn-sm btn-alt-danger" disabled aria-label="Game Ended">
                            <i class="fa fa-trash-alt"></i>
                        </button>
                    </div>`;
                } else {
                    // Game is ongoing, show the button
                    btn = `<div class="btn-group">
                        <button type="button" onclick="archive_game_record(${row.game_record_id})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
                            data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
                            <i class="fa fa-trash-alt"></i>
                        </button>
                    </div>`;
                }

                const dateKey = moment(row.record_date).format('MMMM DD, YYYY HH:mm:ss');

                if (!mergedData[dateKey]) {
                    mergedData[dateKey] = {
                        buy_in: 0,
                        cash_out: 0,
                        real_rolling: 0,
                        total_rolling: 0,
                        nn: row.NN_CHIPS || 0,
                        cc: row.CC_CHIPS || 0,
                        remarks: row.REMARKS || '',
                        action: row.game_record_id,
                        button: btn  
                    };
                }

                // Process the row based on CAGE_TYPE
                if (row.CAGE_TYPE == 1) { // BUY IN
                    mergedData[dateKey].buy_in += (row.CC_CHIPS || 0) + (row.NN_CHIPS || 0);
                }
                if (row.CAGE_TYPE == 2) { // CASH OUT
                    mergedData[dateKey].cash_out += (row.CC_CHIPS || 0) + (row.NN_CHIPS || 0);
                }
                if (row.CAGE_TYPE == 3) { // TOTAL ROLLING
                    mergedData[dateKey].total_rolling += (row.NN_CHIPS || 0);
                }
                if (row.CAGE_TYPE == 4) { // REAL ROLLING
                    mergedData[dateKey].real_rolling += (row.CC_CHIPS || 0);
                }
            });

            // I-clear ang DataTable
            dataTable.clear();

            // Idagdag ang na-merge na data sa DataTable
            for (const date in mergedData) {
                const rowData = mergedData[date];
                dataTable.row.add([
                    date,
                    rowData.buy_in.toLocaleString(),
                    rowData.cash_out.toLocaleString(),
                    rowData.real_rolling.toLocaleString(),
                    rowData.total_rolling.toLocaleString(),
                    rowData.nn.toLocaleString(),
                    rowData.cc.toLocaleString(),
                    rowData.button  
                ]).draw();
            }
        },
        error: function (xhr, status, error) {
            console.error('Error fetching data:', error);
        }
    });
}

	reloadDataRecord()
}

function checkPermissionToDeleteHistory(id) {
    // Check if the user has the necessary permission before proceeding
    $.ajax({
        url: '/check-permission',
        type: 'POST',
        success: function (response) {
            if (response.permissions === 11) {
                // Proceed with deletion if permission is valid
                archive_game_record(id);
            } else {
                // Show an error SweetAlert if permission is not sufficient
                Swal.fire({
                    title: 'Access Denied',
                    text: 'Not allowed to delete this data.',
                    icon: 'error',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#6f9c40'
                });
            }
        },
        error: function () {
            Swal.fire({
                title: 'Error',
                text: 'Unable to check permissions at this time.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#6f9c40'
            });
        }
    });
}

	function showEndGameAlert() {
		Swal.fire({
			title: 'Access Denied',
			text: 'You do not have permission to change the game status.',
			icon: 'warning',
			confirmButtonText: 'OK',
			confirmButtonColor: '#6f9c40'
		});
	}

	// SweetAlert function
	function showSweetAlert() {
		Swal.fire({
			title: 'Access Denied',
			text: 'You do not have permission to change the game status.',
			icon: 'warning',
			confirmButtonText: 'OK',
			confirmButtonColor: '#6f9c40'
		});
	}


function changeStatus(id, net, account, total_amount, total_cash_out_chips, total_rolling_chips, WinLoss) {
	$('#modal-change_status').modal('show');

	$('.txtGameId').val(id);
	$('.txtAccountCode').val(account);
	$('.txtCapital').val(total_amount);
	$('.txtFinalChips').val(total_cash_out_chips);
	$('.txtTotalRolling').val(total_rolling_chips);
	$('.txtWinloss').val(WinLoss);

	game_id = id;
}

function get_account() {
	$.ajax({
		url: '/account_data',
		method: 'GET',
		success: function (response) {
			var selectOptions = $('#txtTrans');
			selectOptions.empty();
			selectOptions.append($('<option>', {
				value: '',
				text: '--SELECT ACCOUNT--'
			}));
			response.forEach(function (option) {

				selectOptions.append($('<option>', {
					value: option.account_id,
					text: option.agent_name + ' (' + option.agent_code + ')'
				}));
			});
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}



function archive_game_list(id) {
	Swal.fire({
		title: 'Are you sure you want to delete this?',
		icon: 'warning',
		showCancelButton: true,
		confirmButtonColor: '#3085d6',
		cancelButtonColor: '#d33',
		confirmButtonText: 'Yes'
	}).then((result) => {
		if (result.isConfirmed) {
			$.ajax({
				url: '/game_list/remove/' + id,
				type: 'PUT',
				success: function (response) {
					window.location.reload();
				},
				error: function (error) {
					console.error('Error deleting game list:', error);
				}
			});
		}
	})
}

function archive_game_record(id) {
	Swal.fire({
		title: 'Are you sure you want to delete this?',
		icon: 'warning',
		showCancelButton: true,
		confirmButtonColor: '#3085d6',
		cancelButtonColor: '#d33',
		confirmButtonText: 'Yes'
	}).then((result) => {
		if (result.isConfirmed) {
			$.ajax({
				url: '/game_record/remove/' + id,
				type: 'PUT',
				success: function (response) {
					window.location.reload();
				},
				error: function (error) {
					console.error('Error deleting game list:', error);
				}
			});
		}
	})
}


function viewRecord(id) {
	record_id = id;
	window.location.href = '/game_record/' + id;
}

$(document).ready(function () {
	$("input[data-type='number']").keyup(function (event) {
		// skip for arrow keys
		if (event.which >= 37 && event.which <= 40) {
			event.preventDefault();
		}
		var $this = $(this);
		var num = $this.val().replace(/,/gi, "");
		var num2 = num.split(/(?=(?:\d{3})+$)/).join(",");
		$this.val(num2);
	});
})

function onlyNumberKey(evt) {

	let ASCIICode = (evt.which) ? evt.which : evt.keyCode
	if (ASCIICode > 31 && (ASCIICode < 48 || ASCIICode > 57))
		return false;
	return true;
}



//ON GAME LIST
$(document).ready(function () {
	if ($.fn.DataTable.isDataTable('#on-game-list-tbl')) {
		$('#on-game-list-tbl').DataTable().destroy();
	}

	var dataTable = $('#on-game-list-tbl').DataTable({
		columnDefs: [{
			createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
				$(cell).addClass('text-center');
			}
		}],
		createdRow: function (row, data, index) {

			if (parseInt(data[10].split(',').join('')) < 0) {
				$('td:eq(10)', row).css({
					'background-color': '#fff',
					'color': 'red'
				});
			}
		},
	});

	function reloadData_on_game() {

		$.ajax({
			url: '/on_game_list_data', // Endpoint to fetch data
			method: 'GET',
			success: function (data) {
				dataTable.clear();

				data.forEach(function (row) {

					var btn = `<div class="btn-group">
						<button type="button" onclick="viewRecord(${row.game_list_id})" class="btn btn-sm btn-alt-info js-bs-tooltip-enabled"
						data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Details">
						GAME RECORD
						</button>
						<button type="button" onclick="changeStatus(${row.game_list_id})" class="btn btn-sm btn-alt-warning js-bs-tooltip-enabled"
						data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Status">
						CHANGE STATUS
						</button>
						<button type="button" onclick="archive_game_list(${row.game_list_id})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
						data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
						<i class="fa fa-trash-alt"></i>
						</button>
					</div>`;

					var btn_his = `<div class="btn-group" role="group">
					<button type="button" onclick="showHistory(${row.game_list_id})" class="btn btn-sm btn-alt-info js-bs-tooltip-enabled"
							data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Details" 
							style="font-size:8px !important; margin-right: 5px;"> <!-- Add margin-right for spacing -->
							History
					</button>
			   </div>`;


						

					var ref = '';
					var acct_code = '';

					if (row.GUESTNo) {
						ref = `${row.CODE}-${row.AGENT_CODE}-${row.GUESTNo}-${row.GAME_NO}`;
						acct_code = `${row.CODE}-${row.AGENT_CODE}-${row.GUESTNo}`;
					} else {
						ref = `${row.CODE}-${row.AGENT_CODE}-${row.GAME_NO}`;
						acct_code = `${row.CODE}-${row.AGENT_CODE}`;
					}

					var dateFormat = moment(row.GAME_DATE).format('MMMM DD, YYYY');

					$.ajax({
						url: '/game_list/' + row.game_list_id + '/record',
						method: 'GET',
						success: function (response) {
							var total_buy_in = 0;
							var total_cash_out = 0;
							var total_rolling = 0;
							var initial_buy_in = 0;

							var total_nn_init = 0;
							var total_cc_init = 0;
							var total_nn = 0;
							var total_cc = 0;
							var total_cash_out_nn = 0;
							var total_cash_out_cc = 0;
							var total_rolling_nn = 0;
							var total_rolling_cc = 0;

							var total_rolling_real = 0;
							var total_rolling_nn_real = 0;
							var total_rolling_cc_real = 0;


							response.forEach(function (res) {

								if (res.CAGE_TYPE == 1 && (total_nn_init != 0 || total_cc_init != 0)) {
									total_buy_in = total_buy_in + res.AMOUNT;
									total_nn = total_nn + res.NN_CHIPS;
									total_cc = total_cc + res.CC_CHIPS;
								}

								if ((total_nn_init == 0 && total_cc_init == 0) && res.CAGE_TYPE == 1) {
									initial_buy_in = res.AMOUNT;
									total_nn_init = total_nn_init + res.NN_CHIPS;
									total_cc_init = total_cc_init + res.CC_CHIPS;
								}

								if (res.CAGE_TYPE == 2) {
									total_cash_out = total_cash_out + res.AMOUNT;
									total_cash_out_nn = total_cash_out_nn + res.NN_CHIPS;
									total_cash_out_cc = total_cash_out_cc + res.CC_CHIPS;
								}

								if (res.CAGE_TYPE == 3) {
									total_rolling = total_rolling + res.AMOUNT;
									total_rolling_nn = total_rolling_nn + res.NN_CHIPS;
									total_rolling_cc = total_rolling_cc + res.CC_CHIPS;
								}

								if (res.CAGE_TYPE == 4) {
									total_rolling_real = total_rolling_real + res.AMOUNT;
									total_rolling_nn_real = total_rolling_nn_real + res.NN_CHIPS;
									total_rolling_cc_real = total_rolling_cc_real + res.CC_CHIPS;
								}

							});

							var total_initial = total_nn_init + total_cc_init;
							var total_buy_in_chips = total_nn + total_cc;
							var total_cash_out_chips = total_cash_out_nn + total_cash_out_cc;
							var total_rolling_chips = total_rolling_nn + total_rolling_cc + total_rolling + total_rolling_real + total_rolling_nn_real + total_rolling_cc_real - total_cash_out_nn;

							var total_rolling_real_chips = total_rolling_real + total_rolling_nn_real + total_rolling_cc_real;

							var gross = total_buy_in - total_cash_out;

							var total_amount = total_buy_in_chips + total_initial;

							var net = (total_rolling_chips * (row.COMMISSION_PERCENTAGE / 100)).toLocaleString();

							var winloss = parseFloat(total_amount - total_cash_out_chips).toLocaleString();
							
								var WinLoss = total_amount - total_cash_out_chips;
								
								


							var btn_settle = '';
							var status = '';

							var buyin_td = '';
							var rolling_td = '';
							var cashout_td = '';
							if (row.game_status == 2) {
								status = `<button type="button" onclick="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID } , ${total_amount} , ${total_cash_out_chips} , ${total_rolling_chips} , ${WinLoss})" class="btn btn-sm btn-alt-info js-bs-tooltip-enabled"
									data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Status"  style="font-size:8px !important;">ON GAME</button>`;

								buyin_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addBuyin(' + row.game_list_id + ', ' + row.ACCOUNT_ID + ')">' + parseFloat(total_buy_in_chips).toLocaleString() + '</button>';
								rolling_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addRolling(' + row.game_list_id + ')">' + parseFloat(total_rolling_real_chips).toLocaleString() + '</button>';
								cashout_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addCashout(' + row.game_list_id + ', ' + row.ACCOUNT_ID + ', ' + total_rolling_chips + ')">' + parseFloat(total_cash_out_chips).toLocaleString() + '</button>';
								dataTable.row.add([`GAME-${row.game_list_id}`, `${row.agent_code} (${row.agent_name})`, total_initial.toLocaleString(), buyin_td, total_amount.toLocaleString(), rolling_td, parseFloat(total_rolling_chips).toLocaleString(), cashout_td, `${row.COMMISSION_PERCENTAGE}%`, net, winloss, status, btn_his]).draw();
							} else {
								
								//END GAME STATUS EDITABLE(ON GAME & END GAME)
								//status = `<a href="#" onclick="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID })">${moment(row.GAME_ENDED).format('MMMM DD, YYYY HH:mm:ss')}</a>`;

								//END GAME STATUS NOT EDITABLE
								status = `<a href="#" value="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID })">${moment(row.GAME_ENDED).format('MMMM DD, YYYY HH:mm:ss')}</a>`;

								buyin_td = parseFloat(total_buy_in_chips).toLocaleString();
								rolling_td = parseFloat(total_rolling_real_chips).toLocaleString();
								cashout_td = '<span style="font-size:11px;text-decoration: none;" >' + parseFloat(total_cash_out_chips).toLocaleString() + '</span>';
								
								var btn_settle = `<div class="btn-group" role="group">
								<button type="button" onclick="showHistory(${row.game_list_id})" class="btn btn-sm btn-alt-info js-bs-tooltip-enabled"
										data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Details" 
										style="font-size:8px !important; margin-right: 5px;"> <!-- Add margin-right for spacing -->
										History
								</button>
								<button type="button" onclick="settlement_history(${row.game_list_id}, ${row.ACCOUNT_ID })" class="btn btn-sm btn-alt-success js-bs-tooltip-enabled"
										data-bs-toggle="tooltip" aria-label="Settle" data-bs-original-title="Settle" 
										style="font-size:10px !important;">
										Settlement
								</button>
						   </div>`;
						   dataTable.row.add([`GAME-${row.game_list_id}`, `${row.agent_code} (${row.agent_name})`, total_initial.toLocaleString(), buyin_td, total_amount.toLocaleString(), rolling_td, parseFloat(total_rolling_chips).toLocaleString(), cashout_td, `${row.COMMISSION_PERCENTAGE}%`, net, winloss, status, btn_settle]).draw();

							}

							// dataTable.row.add([`${row.GAME_NO}`, `${row.game_list_id} (${row.agent_name})`, parseFloat(total_buy_in).toLocaleString(), parseFloat(total_cash_out).toLocaleString(), parseFloat(total_rolling).toLocaleString(), parseFloat(gross).toLocaleString(), parseFloat(net).toLocaleString(), status, btn]).draw();
							
						},
						error: function (xhr, status, error) {
							console.error('Error fetching options:', error);
						}
					});

				});
			},
			error: function (xhr, status, error) {
				console.error('Error fetching data:', error);
			}
		});
	}

	function computation(id) {
		$.ajax({
			url: '/game_list/' + id + '/record',
			method: 'GET',
			success: function (response) {
				var arr = [];

				arr.push(response);
				return arr;
			},
			error: function (xhr, status, error) {
				console.error('Error fetching options:', error);
			}
		});
	}

	reloadData_on_game();

// $('#add_buyin').submit(function (event) {
// 		event.preventDefault();

// 		var formData = $(this).serialize();

// 		$.ajax({
// 			url: '/game_list/add/buyin',
// 			type: 'POST',
// 			data: formData,
// 			// processData: false, 
// 			// contentType: false,
// 			success: function (response) {
// 				reloadData_on_game();
// 				$('#modal-add-buyin').modal('hide');
// 			},
// 			error: function (xhr, status, error) {
// 				var errorMessage = xhr.responseJSON.error;
// 				// if(errorMessage == 'password') {
// 				//   Swal.fire({
// 				//     icon: "error",
// 				//     title: "Oops...",
// 				//     text: "Password not match!",
// 				//   });
// 				// } else {
// 				console.error('Error updating user role:', error);
// 				// }
// 			}
// 		});
// 	});

// 	$('#add_cashout').submit(function (event) {
// 		event.preventDefault();

// 		var formData = $(this).serialize();

// 		$.ajax({
// 			url: '/game_list/add/cashout',
// 			type: 'POST',
// 			data: formData,
// 			// processData: false, 
// 			// contentType: false,
// 			success: function (response) {
// 				reloadData_on_game();
// 				$('#modal-add-cashout').modal('hide');
// 			},
// 			error: function (xhr, status, error) {
// 				var errorMessage = xhr.responseJSON.error;
// 				// if(errorMessage == 'password') {
// 				//   Swal.fire({
// 				//     icon: "error",
// 				//     title: "Oops...",
// 				//     text: "Password not match!",
// 				//   });
// 				// } else {
// 				console.error('Error updating user role:', error);
// 				// }
// 			}
// 		});
// 	});

// 	$('#add_rolling').submit(function (event) {
// 		event.preventDefault();

// 		var formData = $(this).serialize();

// 		$.ajax({
// 			url: '/game_list/add/rolling',
// 			type: 'POST',
// 			data: formData,
// 			// processData: false, 
// 			// contentType: false,
// 			success: function (response) {
// 				reloadData_on_game();
// 				$('#modal-add-rolling').modal('hide');
// 			},
// 			error: function (xhr, status, error) {
// 				var errorMessage = xhr.responseJSON.error;
// 				// if(errorMessage == 'password') {
// 				//   Swal.fire({
// 				//     icon: "error",
// 				//     title: "Oops...",
// 				//     text: "Password not match!",
// 				//   });
// 				// } else {
// 				console.error('Error updating user role:', error);
// 				// }
// 			}
// 		});
// 	});


	// $('#edit_status').submit(function (event) {
	// 	event.preventDefault();

	// 	var formData = $(this).serialize();
	// 	$.ajax({
	// 		url: '/game_list/change_status/' + game_id,
	// 		type: 'PUT',
	// 		data: formData,
	// 		success: function (response) {
	// 			reloadData_on_game();
	// 			$('#modal-change_status').modal('hide');
	// 			window.location.reload();
	// 		},
	// 		error: function (error) {
	// 			console.error('Error updating agent:', error);
	// 		}
	// 	});
	// });
	

});



function settlement_history(record_id, acc_id) {
    $('#modal-settlement').modal('show');

    // Destroy existing DataTable if it exists
    if ($.fn.DataTable.isDataTable('#game_record-tbl')) {
        $('#game_record-tbl').DataTable().destroy();
    }

    // Initialize DataTable
    var dataTable = $('#game_record-tbl').DataTable({
        columnDefs: [{
            createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
                $(cell).addClass('text-center');
            }
        }]
    });

    // Initialize flag for settlement processing
    var isSettled = false;

    // Function to fetch game record data and populate the modal
    function reloadDataRecord() {
        $.ajax({
            url: '/game_record_data/' + record_id, // Endpoint to fetch data
            method: 'GET',
            success: function (data) {
                dataTable.clear(); // Clear existing table rows

                var total_buy_in = 0;
				var total_cash_out = 0;
				var total_rolling = 0;
				var initial_buy_in = 0;

				var total_nn_init = 0;
				var total_cc_init = 0;
				var total_nn = 0;
				var total_cc = 0;
				var total_cash_out_nn = 0;
				var total_cash_out_cc = 0;
				var total_rolling_nn = 0;
				var total_rolling_cc = 0;

				var total_rolling_real = 0;
				var total_rolling_nn_real = 0;
				var total_rolling_cc_real = 0;

                let RollingRate = data[0].COMMISSION_PERCENTAGE;
                 let CommissionType = data[0].COMMISSION_TYPE;

               

                // Populate data if available
                if (data.length > 0) {
                    
                     // Generate current date and time from the first item
					   let currentDateTime = moment(data[0].GAME_ENDED); // Changed item to data[0]
					   let currentDate = currentDateTime.format('YYYY-MM-DD');
					   let currentTime = currentDateTime.format('HH:mm:ss');
	   
					   // Populate the current date and time
					   $('#date').text(currentDate);
					   $('#time').text(currentTime);
                    
                    
                    let accNo = (data[0].agent_code || '') + ' - ' + (data[0].agent_name || '');
                    let gameNo = data[0].GAME_ID;
                    let account_id = data[0].ACCOUNT_ID;

                    // Populate the modal with data
                    $('#accNo').text(accNo || 'N/A');
                    $('#gameNo').text(gameNo || 'N/A');
                    $('input[name="game_id_settle"]').val(gameNo);
                    $('input[name="txtAccountIDSettle"]').val(account_id);

                    // Check if settled and disable button if necessary
                    if (data[0].SETTLED === 1) {
                        $('#submit-settlement-btn').prop('disabled', true).hide();
                        $('#settledImage-modal').show(); // Ensure the settled image is shown
                        isSettled = true; // Set the flag to true
                    } else {
                        $('#submit-settlement-btn').prop('disabled', false).show();
                        $('#settledImage-modal').hide(); // Hide the settled image if not settled
                        isSettled = false; // Set the flag to false
                    }

                    // Debug: Check FNB value
                    console.log('Setting FNB value:', data[0].FNB);

                    // Populate FNB value
                    // $('#fb').val(data[0].FNB || 0); // Ensure FNB value is set correctly
                    let fbValue = data[0].FNB || 0;
					$('#fb').val(parseFloat(fbValue).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                }

              
                data.forEach(function (row) {

					if (row.CAGE_TYPE == 1 && (total_nn_init != 0 || total_cc_init != 0)) {
						total_buy_in = total_buy_in + row.AMOUNT;
						total_nn = total_nn + row.NN_CHIPS;
						total_cc = total_cc + row.CC_CHIPS;
					}

					if ((total_nn_init == 0 && total_cc_init == 0) && row.CAGE_TYPE == 1) {
						initial_buy_in = row.AMOUNT;
						total_nn_init = total_nn_init + row.NN_CHIPS;
						total_cc_init = total_cc_init + row.CC_CHIPS;
					}

					if (row.CAGE_TYPE == 2) {
						total_cash_out = total_cash_out + row.AMOUNT;
						total_cash_out_nn = total_cash_out_nn + row.NN_CHIPS;
						total_cash_out_cc = total_cash_out_cc + row.CC_CHIPS;
					}

					if (row.CAGE_TYPE == 3) {
						total_rolling = total_rolling + row.AMOUNT;
						total_rolling_nn = total_rolling_nn + row.NN_CHIPS;
						total_rolling_cc = total_rolling_cc + row.CC_CHIPS;
					}

					if (row.CAGE_TYPE == 4) {
						total_rolling_real = total_rolling_real + row.AMOUNT;
						total_rolling_nn_real = total_rolling_nn_real + row.NN_CHIPS;
						total_rolling_cc_real = total_rolling_cc_real + row.CC_CHIPS;
					}

				});

				buyin_td = parseFloat(total_buy_in_chips).toLocaleString();
							rolling_td = parseFloat(total_rolling_real_chips).toLocaleString();
							var total_initial = total_nn_init + total_cc_init;
							var total_buy_in_chips = total_nn + total_cc;
							var total_cash_out_chips = total_cash_out_nn + total_cash_out_cc;
							var total_rolling_chips = total_rolling_nn + total_rolling_cc + total_rolling + total_rolling_real + total_rolling_nn_real + total_rolling_cc_real - total_cash_out_nn;
					
							var total_rolling_real_chips = total_rolling_real + total_rolling_nn_real + total_rolling_cc_real;
					
							var gross = total_buy_in - total_cash_out;
					
							var total_amount = total_buy_in_chips + total_initial;
					
							var cashout_td = total_cash_out_chips;
					
							//var net = (total_rolling_chips * (RollingRate / 100)).toLocaleString();
					
							var winloss = parseFloat(total_amount - total_cash_out_chips) * -1;
							
							var WinLoss = total_amount - total_cash_out_chips;
							
							// var net;
							
							// 	if (CommissionType == 1 || CommissionType == 3) {
							// 		// Kung ang COMMISSION_TYPE ay 1, ang net ay computed gamit ang total rolling chips
							// 		net = (total_rolling_chips * (RollingRate / 100)).toLocaleString();
							// 	} else if (CommissionType == 2) {
							// 		// Kung ang COMMISSION_TYPE ay 2, ang net ay computed gamit ang winloss
							// 		net = (WinLoss * (RollingRate / 100)).toLocaleString();
							// 	}
							
							var net = 0;
                            
							if (CommissionType == 1 || CommissionType == 3) {
								// Kung ang COMMISSION_TYPE ay 1, ang net ay computed gamit ang total rolling chips
								net = Math.round(total_rolling_chips * (RollingRate / 100));
							} else if (CommissionType == 2) {
								// Kung ang COMMISSION_TYPE ay 2, ang net ay computed gamit ang winloss
								net = Math.round(WinLoss * (RollingRate / 100));
							}
							
							// Format net value as an integer
							var formattedNet = net.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

                // Populate calculated fields
                $('#buyIn').val(total_amount.toLocaleString());
                $('#chipsReturn').val(cashout_td.toLocaleString());
                $('#winLoss').val(winloss.toLocaleString());
                $('#rolling').val(total_rolling_chips.toLocaleString());
                $('#rollingRate').val(RollingRate);
                $('#rollingSettlement').val(formattedNet);

                // Set initial payment value
                updatePayment(); // Update payment based on initial data
                // $('#fb').val(data[0].FNB || 0); // Ensure FNB value is set correctly

                // Update payment when fb changes
                $('#fb').on('input', function () {
                    updatePayment();
                });

                // Update payment when rollingRate changes
                $('#rollingRate').on('input', function () {
                    updateRollingSettlement();
                    updatePayment();
                });

                function updatePayment() {
                    let fb = parseFloat($('#fb').val().replace(/,/g, '')) || 0;
                    let net = parseFloat($('#rollingSettlement').val().replace(/,/g, '')) || 0;
                    let payment = net - fb;
                    $('#payment').val(payment.toLocaleString());
                }

                function updateRollingSettlement() {
                    let updatedRollingRate = parseFloat($('#rollingRate').val()) || 0;
                    let updatedRollingSettlement = total_rolling_chips * (updatedRollingRate / 100);
                    $('#rollingSettlement').val(updatedRollingSettlement.toLocaleString());
                }
            },
            error: function (xhr, status, error) {
                console.error('Error fetching data:', error);
            }
        });
         // Fetch account details to calculate balance
		 $.ajax({
			url: '/account_details_data_deposit/' + acc_id, // Use the account parameter
			method: 'GET',
			success: function (data) {
				var deposit_amount = 0;
				var withdraw_amount = 0;
				var marker_return = 0;
				var marker_issue_amount = 0;
	
				data.forEach(function (row) {
					if (row.TRANSACTION === 'DEPOSIT') {
						deposit_amount += row.AMOUNT;
					} else if (row.TRANSACTION === 'WITHDRAW') {
						withdraw_amount += row.AMOUNT;
					} else if (row.TRANSACTION === 'Credit Returned thru Deposit') {
                    marker_return += row.AMOUNT;
					} else if (row.TRANSACTION === 'Credit Cash') {
						marker_issue_amount += row.AMOUNT;
					}
				});
	
				// Calculate and show the total balance
				var totalBalance = deposit_amount - withdraw_amount - marker_return + marker_issue_amount;
				$('#SettlementBalance').val(totalBalance); // Display formatted balance
			},
			error: function (xhr, status, error) {
				console.error('Error fetching account details:', error);
			}
		})
    }

    // Handle form submission for settlement
    console.log('Initial isSettled:', isSettled);

    $('#submit-settlement-btn').off('click').on('click', function (e) {
        e.preventDefault(); // Prevent any default behavior

        console.log('Button clicked. isSettled:', isSettled);
        if (isSettled) {
            console.log('Settlement already processed. Exiting.');
            return; // Exit if already settled
        }

        var formData = $('#add_settlement').serialize(); // Serialize form data
		var $btn = $('#submit-settlement-btn');

		$btn.prop('disabled', true);
	
		$btn.text('Processing..'); 

        $.ajax({
            type: 'POST',
            url: '/add_settlement',
            data: formData,
            success: function (response) {
                Swal.fire({
                    icon: 'success',
                    title: 'The settlement has been successfully settled.',
                    text: '',
                    confirmButtonText: 'OK',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    customClass: {
                        confirmButton: 'custom-ok-btn'
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        // Set the flag to true
                        isSettled = true;
                        console.log('Settlement processed. Setting isSettled to true.');
                        // Disable and hide the 'Save' button
                        $('#submit-settlement-btn').prop('disabled', true).hide();
                        // Hide modal only after SweetAlert confirmation
                        $('#modal-settlement').modal('hide');
						window.location.reload();
                        // Reset the form
                        $('#add_settlement')[0].reset();
                        // Show the settled image
                        $('#settledImage-modal').show();
                    }
                });
            },
            error: function (xhr, status, error) {
                // Display SweetAlert error message
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'There was an error saving the settlement.',
                    confirmButtonText: 'OK',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    customClass: {
                        confirmButton: 'custom-ok-btn'
                    }
                });
            },
			complete: function () {
			
				$btn.prop('disabled', false).text('Save'); // Re-enable button and reset text
			}
        });
    });

    reloadDataRecord(); // Call data loading function
}

// Trigger when account is selected from dropdown
$('#txtTrans').on('change', function () {
    var account_id = $(this).val();  // Get the selected account ID

    if (account_id) {
        // Make an AJAX call to fetch account details
        $.ajax({
            url: '/account_details_data_deposit/' + account_id,  // Pass the selected account ID
            method: 'GET',
            success: function (data) {
                // Initialize amounts
                var deposit_amount = 0;
                var withdraw_amount = 0;
                var marker_issue_amount = 0;
                var marker_deposit_amount = 0;
                var marker_return = 0;

                // Iterate through data and calculate totals
                data.forEach(function (row) {
                    if (row.TRANSACTION === 'DEPOSIT') {
                        deposit_amount += row.AMOUNT;
                    } else if (row.TRANSACTION === 'WITHDRAW') {
                        withdraw_amount += row.AMOUNT;
                    } else if (row.TRANSACTION === 'Credit Cash') {
                        marker_issue_amount += row.AMOUNT;
                    } else if (row.TRANSACTION === 'MARKER REDEEM') {
                        marker_deposit_amount += row.AMOUNT;
                    } else if (row.TRANSACTION === 'Credit Returned thru Deposit') {
                    marker_return += row.AMOUNT;
                }
                });

                // Optionally set the total balance to a hidden input field
                var totalBalance = deposit_amount - withdraw_amount - marker_return + marker_issue_amount;
                $('#total_balanceGuest1').val(totalBalance);
            },
            error: function (xhr, status, error) {
                console.error('Error fetching account details:', error);
            }
        });
    }
});


