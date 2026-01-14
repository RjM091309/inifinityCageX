var account_id;

var totalAmount = 0; 

$(document).ready(function () {
    if ($.fn.DataTable.isDataTable('#account-tbl')) {
        $('#account-tbl').DataTable().destroy();
    }

    var dataTable = $('#account-tbl').DataTable({
        pageLength: 50, // Default page length
        lengthMenu: [ [50, 100, 150, 200], [50, 100, 150, 200] ], // Page length options
        columnDefs: [{
            createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
                $(cell).addClass('text-center');
            }
        }]
    });



	function reloadData() {
		$.ajax({
			url: '/account_data', // Endpoint to fetch data
			method: 'GET',
			success: function (data) {
				dataTable.clear();
				data.forEach(function (row) {

					var status = '';
					if (row.active.data == 1) {
						status = '<span class="badge bg-info" style="font-size:10px !important;">ACTIVE</span>';
					} else {
						status = '<span class="badge bg-danger style="font-size:10px !important;">INACTIVE</span>';
					}

					var btn = `
						<button type="button" onclick="archive_account(${row.account_id})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
						data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive"  style="font-size:10px !important;">
						<i class="fa fa-trash-alt"></i>
						</button>
					`;
					
					$.ajax({
						url: '/account_details_data_deposit/' + row.account_id, // Endpoint to fetch data
						method: 'GET',
						success: function (data_amount) {
							var deposit_amount = 0;
							var withdraw_amount = 0;
							var marker_return_deposit = 0;
							var marker_issue_amount = 0;


							data_amount.forEach(function (row1) {
								if (row1.TRANSACTION == 'DEPOSIT') {
									deposit_amount = deposit_amount + row1.AMOUNT;
								}
			
								if (row1.TRANSACTION == 'WITHDRAW') {
									withdraw_amount = withdraw_amount + row1.AMOUNT;
								}
								if (row1.TRANSACTION == 'Credit Returned thru Deposit') {
									marker_return_deposit = marker_return_deposit + row1.AMOUNT;
								} 
								if (row1.TRANSACTION === 'Credit Cash') {
									marker_issue_amount += row1.AMOUNT;
								}
								
							});

							totalAmount = deposit_amount + marker_issue_amount - withdraw_amount - marker_return_deposit;
							
							
                       // Update the photo outside the DataTable
					   if (row.PASSPORTPHOTO && row.PASSPORTPHOTO !== 'DEFAULT.jpg') {
					    	console.log(`Account ID: ${row.account_id}, Passport Photo: ${row.PASSPORTPHOTO}`);
					    	document.getElementById('account_photo').src = `/PassportUpload/${row.PASSPORTPHOTO}?t=${new Date().getTime()}`;
				    	} else {
						document.getElementById('account_photo').src = '/PassportUpload/DEFAULT.jpg';
					    }
					
						const permissions = parseInt($('#user-role').data('permissions'));

						var account_no = '';
						if (permissions !== 2) { // Allow clickable link for permissions other than 2
							account_no = `<a href="#" onclick="account_details(${row.account_id}, '${row.agent_name}', '${row.PASSPORTPHOTO}')">${row.agent_code}</a>`;
						} else { // Disable the link for permissions = 2
							account_no = `<span>${row.agent_code}</span>`;
						}
						
							

				

							dataTable.row.add([`${row.agency_name}`,account_no, `${row.agent_name}`, `₱${totalAmount.toLocaleString()}`,status, btn]).draw();
						}
					});
			

					
				});
			},
			error: function (xhr, status, error) {
				console.error('Error fetching data:', error);
			}
		});
	}

	reloadData();

	$('#add_new_account').submit(function (event) {
		event.preventDefault();

		var formData = $(this).serialize();

		$.ajax({
			url: '/add_account',
			type: 'POST',
			data: formData,
			// processData: false, 
			// contentType: false,
			success: function (response) {
				reloadData();
			   
				$('#modal-new-account').modal('hide');
			},
			error: function (xhr, status, error) {
				var errorMessage = xhr.responseJSON.error;
				// if(errorMessage == 'password') {
				//   Swal.fire({
				//     icon: "error",
				//     title: "Oops...",
				//     text: "Password not match!",
				//   });
				// } else {
				console.error('Error updating user role:', error);
				// }
			}
		});
		// }
	});


	$('#edit_account').submit(function (event) {
		event.preventDefault();

		var formData = $(this).serialize();
		$.ajax({
			url: '/account/' + account_id,
			type: 'PUT',
			data: formData,
			success: function (response) {
				reloadData();
				$('#modal-edit-account').modal('hide');
			},
			error: function (error) {
				console.error('Error updating user role:', error);
			}
		});
	});



});

$(document).ready(function () {
    $('#add_transfer_account').submit(function (event) {
        event.preventDefault();

        var form = $(this);
        var submitButton = form.find('button[type="submit"]');
        
        // Disable submit button to prevent multiple submissions
        submitButton.prop('disabled', true).text('Processing...');

        var formData = form.serialize();

        $.ajax({
            url: '/add_account_details/transfer',
            type: 'POST',
            data: formData,
            success: function (response) {
                Swal.fire({
                    title: 'Success!',
                    text: 'Transfer was successful.',
                    icon: 'success',
                    confirmButtonText: 'OK'
                }).then(() => {
                    $('#modal-transfer_account').modal('hide');
                    window.location.reload();
                });
            },
            error: function (xhr, status, error) {
                var errorMessage = xhr.responseJSON ? xhr.responseJSON.error : 'Something went wrong!';
                Swal.fire({
                    title: 'Error!',
                    text: errorMessage,
                    icon: 'error',
                    confirmButtonText: 'OK'
                });
                console.error('Error updating user role:', error);
            },
            complete: function () {
                // Re-enable submit button after request completes
                submitButton.prop('disabled', false).text('Save');
            }
        });
    });
});

function addAccount() {
	$('#modal-new-account').modal('show');
	get_agent();
}



function edit_account(id, agent_id, agent_name, agency_name, guest_no, membership_no) {
	$('#modal-edit-account').modal('show');
	$('#edit_agent_name').val(agent_name);
	$('#edit_agency_name').val(agency_name);
	$('#guest_no').val(guest_no);
	$('#membership_no').val(membership_no);

	edit_get_agent(agent_id);
	account_id = id;
}

function archive_account(id) {
    // Show SweetAlert that informs the user they cannot delete the account
    Swal.fire({
        title: 'Action Restricted',
        text: 'Go to the Guest Section to delete this account.',
        icon: 'info',
        confirmButtonText: 'OK',
        confirmButtonColor: '#6f9c40'  // Custom button color
    });
}

function get_agent() {
	$.ajax({
		url: '/agent_data',
		method: 'GET',
		success: function (response) {
			var selectOptions = $('#agent_id');
			selectOptions.empty();
			selectOptions.append($('<option>', {
				value: '',
				text: '--SELECT AGENT--'
			}));
			response.forEach(function (option) {
				selectOptions.append($('<option>', {
					value: option.agent_id,
					text: option.agency_code + '-' + option.agent_code
				}));
			});
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

function edit_get_agent(id) {
	$.ajax({
		url: '/agent_data',
		method: 'GET',
		success: function (response) {
			var selectOptions = $('.agent_id');
			selectOptions.empty();
			selectOptions.append($('<option>', {
				selected: false,
				value: '',
				text: '--SELECT AGENT--'
			}));
			response.forEach(function (option) {
				var selected = false;
				if (option.agent_id == id) {
					selected = true;
				}
				selectOptions.append($('<option>', {
					selected: selected,
					value: option.agent_id,
					text: option.agency_code + '-' + option.agent_code
				}));
			});
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

$('#agent_id').on('change', function () {
	var agent = $(this).val().split();

	get_agent_name(agent[0]);
});

$('.agent_id').on('change', function () {
	var agent = $(this).val();

	edit_get_agent_name(agent);
})

function get_agent_name(id) {
	$.ajax({
		url: '/agent_data/' + id,
		method: 'GET',
		success: function (response) {
			$('#agent_name').val(response[0].agent_name);
			$('#agency_name').val(response[0].agency);
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

function edit_get_agent_name(id) {
	$.ajax({
		url: '/agent_data/' + id,
		method: 'GET',
		success: function (response) {
			$('#edit_agent_name').val(response[0].agent_name);
			$('#edit_agency_name').val(response[0].agency);
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

function account_details(account_id_data, agent_code, account_name) {
    
    
    fetch(`/account_passportphoto_data/${account_id_data}`)
    .then(response => {
        // console.log(`Response for account ID ${account_id_data}:`, response);
        return response.json();
    })
    .then(data => {
        // console.log(`Fetched account data:`, JSON.stringify(data, null, 2));  // Log the entire data
        if (data.length > 0) {
            const account = data[0];
            // console.log(`Fetched account details:`, account);
            
            // Check if agent_code is present
            const agentCode = account.agent_code || 'N/A';  // Default to 'N/A' if agent_code is not present
            document.getElementById('agent_code').textContent = agentCode;
            // console.log(`Agent Code: ${agentCode}`);  // Log the agent code
            
            document.getElementById('account_name').textContent = account.account_name || 'N/A';
         //   document.getElementById('account_id').value = account.ACCOUNT_ID || '';

            // Check for passport photo
            if (account.PASSPORTPHOTO && account.PASSPORTPHOTO !== 'DEFAULT.jpg') {
                document.getElementById('account_photo').src = `/PassportUpload/${account.PASSPORTPHOTO}`;
            } else {
                document.getElementById('account_photo').src = '/PassportUpload/DEFAULT.jpg';
            }
        } else {
            console.log('No data found for this account');
        }
    })
    .catch(error => {
        console.error('Error fetching account details:', error);
    });


	reloadDataDetails();

	$('#modal-account-details').modal('show');
    
    $('#agent_code').text(agent_code);
	$('#account_name').text(account_name);
	$('#account_id').val(account_id_data);

	$('.txtAmount').val('');
	$('.remarks').val('');
	$('input[name="txtTrans"]').prop('checked', false);
	
	$('#account_id_add').val(account_id_data);

	account_id = account_id_data;

	if ($.fn.DataTable.isDataTable('#accountDetails')) {
		$('#accountDetails').DataTable().destroy();
	}
	
	var dataTableDetails = $('#accountDetails').DataTable({
		"order": [[0, 'desc']], // Set the first column (index 0) to be sorted in descending order
		"columnDefs": [
            {
                "targets": 0, // Column index for the ENCODED_DT
                "render": function (data, type, row) {
                    // For sorting, return the raw date data
                    if (type === 'sort') {
                        return moment.utc(data).format('YYYY-MM-DD HH:mm:ss'); // Raw date for sorting
                    }

                    // Determine if the date is already in UTC
                    const dateMoment = moment(data); // Parse without assuming UTC

                    if (dateMoment.isValid()) {
                        // For display, convert to local time and return the formatted date
                        return dateMoment.local().format('DD MMM, YYYY HH:mm:ss');
                    } else {
                        // If the date is invalid, return an error message or a placeholder
                        return 'Invalid Date';
                    }
                },
                "createdCell": function (cell, cellData, rowData, rowIndex, colIndex) {
                    $(cell).addClass('text-center');
                }
            }
        ]
	});

	

	function reloadDataDetails() {
		

		$.ajax({
			//url: '/account_details_data/' + account_id_data, // Endpoint to fetch data
			url: '/account_details_data_deposit/' + account_id_data, // Endpoint to fetch data
			method: 'GET',
			success: function (data) {
				dataTableDetails.clear().draw();
				var deposit_amount = 0;
				var withdraw_amount = 0;
				var marker_issue_amount = 0;
				var marker_deposit_amount = 0;
				var marker_return_deposit = 0;
				data.forEach(function (row) {
					if (row.TRANSACTION == 'DEPOSIT') {
						deposit_amount = deposit_amount + row.AMOUNT;
					}

					if (row.TRANSACTION == 'WITHDRAW') {
						withdraw_amount = withdraw_amount + row.AMOUNT;
					}

					if (row.TRANSACTION == 'Credit Cash') {
						marker_issue_amount = marker_issue_amount + row.AMOUNT;
					}

					if (row.TRANSACTION == 'MARKER REDEEM') {
						marker_deposit_amount = marker_deposit_amount + row.AMOUNT;
					}
					if (row.TRANSACTION == 'Credit Returned thru Deposit') {
						marker_return_deposit = marker_return_deposit + row.AMOUNT;
					}



					var btn = `<div class="btn-group">
          <button type="button" onclick="archive_account_details(${row.account_details_id})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
            data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
            <i class="fa fa-trash-alt"></i>
          </button>
        </div>`;

					// var dateFormat = moment(row.DATE).format('MMMM DD, YYYY');

				
					var trans = '';

					// Kumuha ng transfer agent name gamit ang AJAX
					$.ajax({
						url: '/get-transfer-agent-name', // Siguraduhing tama ang path
						type: 'GET',
						data: { transferAgentId: row.TRANSFER_AGENT },
						success: function(response) {
							var dateFormat = moment(row.encoded_date).format('MMMM DD, YYYY HH:mm:ss');
							var transactionDesc = row.TRANSACTION_DESC || '';
					
							// Suriin ang response para sa transfer agent name at agent code
							var transferAgentName = response.transfer_agent_name ? response.transfer_agent_name.trim() : 'Unknown';
							var agentCode = response.agent_code ? response.agent_code.trim() : 'N/A'; // Kung walang agent code, itakda ito sa 'N/A'
					
							// Tukuyin ang transaksyon batay sa uri
							if (row.TRANSACTION === 'DEPOSIT' && row.TRANSFER === 1) {
								trans = `DEPOSIT ( <strong>Received from ${agentCode} - ${transferAgentName} </strong> )`;
							} else if (row.TRANSACTION === 'WITHDRAW' && row.TRANSFER === 1) {
								trans = `WITHDRAW ( <strong>Transferred to ${agentCode} - ${transferAgentName} </strong> )`;
							} else {
								trans = row.TRANSACTION;
							}
					
							// Idagdag ang row sa DataTable
							dataTableDetails.row.add([dateFormat, `${trans} - <strong>${transactionDesc}</strong>`, `P${row.AMOUNT.toLocaleString()}`, row.REMARKS]).draw();
						},
						error: function() {
							var dateFormat = moment(row.encoded_date).format('MMMM DD, YYYY HH:mm:ss');
							var transactionDesc = row.TRANSACTION_DESC || '';
					
							// Kung may error, itakda ang trans value na may error message
							if (row.TRANSACTION === 'DEPOSIT' && row.TRANSFER === 1) {
								trans = `DEPOSIT ( <strong>Received from Error fetching name</strong> )`;
							} else if (row.TRANSACTION === 'WITHDRAW' && row.TRANSFER === 1) {
								trans = `WITHDRAW ( <strong>Transferred to Error fetching name</strong> )`;
							} else {
								trans = row.TRANSACTION;
							}
					
							// Idagdag ang row sa DataTable kahit na may error
							dataTableDetails.row.add([dateFormat, `${trans} - <strong>${transactionDesc}</strong>`, `P${row.AMOUNT.toLocaleString()}`, row.REMARKS]).draw();
						}
					});
				});

				totalAmount = deposit_amount + marker_issue_amount - withdraw_amount - marker_return_deposit; // Store total amount


				$('.total_deposit').text(`P${deposit_amount.toLocaleString()}`);
				$('.total_withdraw').text(`P${withdraw_amount.toLocaleString()}`);
				$('.total_balance').text('P' + totalAmount.toLocaleString());

				$('#total_balanceGuest').val(totalAmount);
			},

			error: function (xhr, status, error) {
				console.error('Error fetching data:', error);
			}
		});

	}
	
	$('#add_new_account_details').submit(function (event) {
		event.preventDefault(); // Prevent form submission by default
	
		// Disable the submit button immediately to prevent multiple clicks
		const submitButton = $(this).find('button[type="submit"]');
		if (submitButton.prop('disabled')) {
			return; // If the button is already disabled, exit early
		}
	
		submitButton.prop('disabled', true).text('Processing...'); // Disable and change button text quickly
	
		var formData = $(this).serialize();
		var selectedTrans = $('input[name="txtTrans"]:checked').val();
		var enteredAmount = parseFloat($('.txtAmount').val().replace(/,/g, ''));
	
		// Get the total balance from the hidden input
		var totalBalanceGuest = parseFloat($('#total_balanceGuest').val().replace(/,/g, '').trim());
	
		// Function to format numbers with commas
		function formatNumberWithCommas(number) {
			return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		}
	
		// Debugging output to check values
		console.log("Selected Transaction Type: " + selectedTrans);
		console.log("Entered Amount: " + enteredAmount);
		console.log("Total Balance (Guest): " + totalBalanceGuest);
	
		// Check if a transaction type is selected
		if (!selectedTrans) {
			Swal.fire({
				icon: 'error',
				title: 'Transaction Type Required',
				text: 'Please select a transaction type (Deposit or Withdraw).',
				confirmButtonText: 'OK'
			});
			submitButton.prop('disabled', false).text('ADD'); // Re-enable button and reset text
			return; // Stop form submission
		}
	
		// Check if the selected transaction is Withdraw (value = 2)
		if (selectedTrans === '2') { // Withdrawal
			if (enteredAmount > totalBalanceGuest) {
				Swal.fire({
					icon: 'error',
					title: 'Insufficient Balance',
					text: 'The amount exceeds the available total balance of P' + formatNumberWithCommas(totalBalanceGuest),
					confirmButtonText: 'OK'
				}).then(() => {
					$('#modal-account-details').modal('hide');
					reloadDataDetails();
					window.location.reload();
				});
				submitButton.prop('disabled', false).text('ADD'); // Re-enable button and reset text
				return; // Stop form submission
			}
		}
	
		// Proceed to submit the form via AJAX only if validation passes
		$.ajax({
			url: '/add_account_details',
			type: 'POST',
			data: formData,
			success: function (response) {
				Swal.fire({
					title: 'Success!!!',
					icon: 'success',
					confirmButtonText: 'OK'
				}).then(() => {
					reloadDataDetails();
					$('#modal-account-details').modal('show');
	
					// Clear form fields
					$('.txtAmount').val('');
					$('.remarks').val('');
					$('input[name="txtTrans"]').prop('checked', false);
	
					// Add an event listener to reload the page when the modal is closed
					$('#modal-account-details').on('hidden.bs.modal', function () {
						window.location.reload();
					});
				});
			},
			error: function (xhr, status, error) {
				var errorMessage = xhr.responseJSON.error;
				console.error('Error updating user role:', errorMessage);
			},
			complete: function () {
				// Re-enable the button after the AJAX call completes
				submitButton.prop('disabled', false).text('ADD'); // Reset text after completion
			}
		});
	});
	
	

//    $('#add_new_account_details').submit(function (event) {
// 		event.preventDefault();

// 		var formData = $(this).serialize();
// 		// Get the selected transaction type
// 		var selectedTrans = $('input[name="txtTrans"]:checked').val();

// 		// Get the entered amount
// 		var enteredAmount = parseFloat($('.txtAmount').val().replace(/,/g, ''));
		
// 		// Get the total balance (remove the 'P' and commas, then convert to a number)
// 		var totalBalance = parseFloat($('.total_balance').text().replace(/P|,/g, ''));
	
// 		// Debugging output to check values
// 		console.log("Selected Transaction Type: " + selectedTrans);
// 		console.log("Entered Amount: " + enteredAmount);
// 		console.log("Total Balance: " + totalBalance);
	
// 		// Check if the selected transaction is Withdraw (value = 2)
// 		if (selectedTrans == '2') { // Withdrawal
// 			if (enteredAmount > totalBalance) {
// 				Swal.fire({
// 					icon: 'error',
// 					title: 'Insufficient Balance',
// 					confirmButtonText: 'OK'
// 				}).then(() => {
// 					$('#modal-account-details').modal('hide');
// 					reloadDataDetails();
// 					window.location.reload();
		
// 				  });
// 				return; // Prevent form submission
// 			}
// 		}

// 		$.ajax({
// 			url: '/add_account_details',
// 			type: 'POST',
// 			data: formData,
// 			success: function (response) {
// 			// Show SweetAlert2 popup
// 			Swal.fire({
// 				title: 'Success',
// 				//text: 'Account details have been added successfully.',
// 				icon: 'success',
// 				confirmButtonText: 'OK'
// 			  }).then(() => {
// 				// Show the modal
// 				reloadDataDetails();
// 				$('#modal-account-details').modal('hide');
				
				
				
// 				// Clear form fields
// 				$('.txtAmount').val('');
// 				$('.remarks').val('');
// 				$('input[name="txtTrans"]').prop('checked', false);
		
// 				// Add an event listener to reload the page when the modal is closed
// 				$('#modal-account-details').on('hidden.bs.modal', function () {
// 				  window.location.reload();
// 				});
// 			  });

// 			},
// 			error: function (xhr, status, error) {
// 				var errorMessage = xhr.responseJSON.error;
// 				console.error('Error updating user role:', error);
// 			}
// 		});
// 	});
}


function add_account_details() {
	$('#modal-account-details').modal('hide');
	$('#modal-add-account-details').modal('show');
	$('.txtAmount').val('');

	var account_id_val = $('#account_id').val();

	account_id = account_id_val;

	$('#account_id_add').val(account_id_val);

	transaction_type();
}


function transfer_account() {
	$('#modal-account-details').modal('hide');
	$('#modal-transfer_account').modal('show');
	$('.txtAmount').val('');

	var account_id_val = $('#account_id').val();
	account_id = account_id_val;
	$('#account_id_add_trans').val(account_id_val);
	

	get_account();

	 // Fetch account details to calculate balance
	 $.ajax({
        url: '/account_details_data_deposit/' + account_id, // Use the account parameter
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
                }
				else if (row.TRANSACTION === 'Credit Cash') {
					marker_issue_amount += row.AMOUNT;
				}
            });

            // Calculate and show the total balance
            var totalBalance = deposit_amount + marker_issue_amount - withdraw_amount - marker_return;
            $('#TransferFromBalance').val(totalBalance); // Display formatted balance
            
            // Optionally, display the account name if you have it in the data
            if (data.length > 0) {
                $('#account_name_transfer').text(data[0].NAME); // Assuming NAME is in the first row
            }
        },
        error: function (xhr, status, error) {
            console.error('Error fetching account details:', error);
        }
    });
}

function export_data() {
	var account_id_val = $('#account_id').val();

	window.location.href = '/export?id='+account_id_val;
	// $.ajax({
	// 	url: '/export?id='+account_id_val,
	// 	type: 'GET',
	// 	success: function (response) {
	// 		;
	// 	},
	// 	error: function (xhr, status, error) {
	// 		var errorMessage = xhr.responseJSON.error;
	// 		console.error('Error updating user role:', error);
	// 	}
	// });
}


function transaction_type() {
	$.ajax({
		url: '/transaction_type_data',
		method: 'GET',
		success: function (response) {
			var selectOptions = $('#txtTrans');
			selectOptions.empty();
			selectOptions.append($('<option>', {
				value: ''
			}));
			response.forEach(function (option) {
				selectOptions.append($('<option>', {
					value: option.IDNo,
					text: option.TRANSACTION
				}));
			});
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

function transaction_type() {
	$.ajax({
		url: '/transaction_type_data',
		method: 'GET',
		success: function (response) {
			var selectOptions = $('#txtTrans');
			selectOptions.empty();
			selectOptions.append($('<option>', {
				value: '',
				text: '--SELECT TRANSACTION TYPE--'
			}));
			response.forEach(function (option) {
				selectOptions.append($('<option>', {
					value: option.IDNo,
					text: option.TRANSACTION
				}));
			});
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

function get_account() {
	$.ajax({
		url: '/account_data',
		method: 'GET',
		success: function (response) {
			var selectOptions = $('#txtAccount');
			selectOptions.empty();
			selectOptions.append($('<option>', {
				value: ''
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

	$('.js-select2').select2({
		placeholder: 'Select an option',
		dropdownParent: '#modal-transfer_account'
	});
}


function archive_account_details(id) {
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
				url: '/account_details/remove/' + id,
				type: 'PUT',
				success: function (response) {
					window.location.reload();
				},
				error: function (error) {
					console.error('Error deleting user role:', error);
				}
			});
		}
	})
}


$(document).ready(function(){
	$("input[data-type='number']").keyup(function(event){
		// skip for arrow keys
		if(event.which >= 37 && event.which <= 40){
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

// Trigger when account is selected from dropdown
$('#txtAccount').on('change', function () {
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
                var totalBalance = deposit_amount + marker_issue_amount - withdraw_amount - marker_return;
                $('#TransferToBalance').val(totalBalance);
            },
            error: function (xhr, status, error) {
                console.error('Error fetching account details:', error);
            }
        });
    }
});

