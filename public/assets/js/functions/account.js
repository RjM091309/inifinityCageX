var account_id;

var totalAmount = 0;
var accountDetailsDataTable = null;
var currentAccountDetailsId = null;
var currentAccountBalance = 0;
var accountDetailsDataTable = null;
var currentAccountDetailsId = null;

$(document).ready(function () {
    if ($.fn.DataTable.isDataTable('#modal-account-tbl')) {
        $('#modal-account-tbl').DataTable().destroy();
    }

	var dataTable = $('#modal-account-tbl').DataTable({
        pageLength: 10, // Default page length
        lengthMenu: [ [10, 25, 50, 100], [10, 25, 50, 100] ], // Page length options
        columnDefs: [{
            createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
                $(cell).addClass('text-center');
            }
        }],
		drawCallback: function () {
			const table = this.api();
			const pageRows = table.rows({ page: 'current' }).data();
			let pageTotal = 0;
		
			pageRows.each(function(row) {
				const balanceText = row[5]; // column index ng TOTAL BALANCE
				const numeric = parseFloat(balanceText.replace(/[₱,]/g, '')) || 0;
				pageTotal += numeric;
			});
		
			if (table.page.info().pages > 1) {
				$('#SUB_TOTAL_SUM_VALUE').closest('tr').show();
				$('#SUB_TOTAL_SUM_VALUE').text('₱' + pageTotal.toLocaleString(undefined, {
					minimumFractionDigits: 0,
					maximumFractionDigits: 0
				}));
			} else {
				$('#SUB_TOTAL_SUM_VALUE').closest('tr').hide();
			}
		}
    });
	
	
		
	function reloadData(agencyId) {
		console.log("✅ reloadData CALLED with:", agencyId);
	
		if (typeof dataTable === 'undefined') {
			console.error("❌ dataTable is undefined!");
			return;
		}
	
		$.ajax({
			url: '/account_data?agencyId=' + agencyId,
			method: 'GET',
			success: function (data) {
				console.log("Data from /account_data:", data);
				dataTable.clear();
				let grandTotal = 0;
	
				if (!Array.isArray(data) || data.length === 0) {
					dataTable.draw();
					$('#TOTAL_SUM_VALUE').text('₱0.00');
					return;
				}

				const permissions = parseInt($('#user-role').data('permissions'));

				data.forEach(function (row) {
					const totalAmount = Number(row.total_balance ?? row.total_ledger_amount ?? 0);
					grandTotal += totalAmount;

					const btn = `
						<button type="button" class="btn btn-sm btn-alt-secondary js-bs-tooltip-enabled"
							data-bs-toggle="tooltip" aria-label="Edit" data-bs-original-title="Edit"
							onclick="edit_agent(${row.agent_id}, '${row.agent_code}', '${row.agent_name}', '${row.agent_contact}', '${row.agent_telegram}', '${row.agent_remarks}')">
							<i class="fa fa-pencil-alt"></i>
						</button>
						<div class="btn-group">
							<button type="button" onclick="archive_account(${row.agent_id})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
								data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
								<i class="fa fa-trash-alt"></i>
							</button>
						</div>
					`;

					const account_no = permissions !== 2
						? `<a href="#" onclick="account_details(${row.account_id}, '${row.agent_code}', '${row.agent_name}')">${row.agent_code}</a>`
						: `<span>${row.agent_code}</span>`;

					dataTable.row.add([
						`${row.agent_name}`,
						account_no,
						`${row.agent_telegram}`,
						`${row.agent_contact}`,
						`${row.agent_remarks}`,
						`₱${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
						btn
					]);
				});

				dataTable.draw();
				$('#TOTAL_SUM_VALUE').text(`₱${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
			},
			error: function (xhr, status, error) {
				console.error('Error fetching data:', error);
			}
		});
	}
	

 // Move openAccountLedgerModal inside ready block
 function openAccountLedgerModal(agencyId) {
	console.log("Front-end sees Agency ID:", agencyId);

	// Set agency name for the modal title
	get_agency_name(agencyId);

	// Store agency ID for hidden input
	$('#txtAgencyLine').val(agencyId);

	// Show the modal first
	$('#modal-account-ledger').modal('show');
	reloadData(agencyId);
	// Remove previous modal shown event to avoid duplicate triggers
	$('#modal-account-ledger').off('shown.bs.modal').on('shown.bs.modal', function () {
		// Show the table only after it's properly initialized
		$('#modal-account-tbl').show();
	});
}
	

    // If you want it callable globally (optional):
    window.openAccountLedgerModal = openAccountLedgerModal;


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


function archive_account(id) {
    Swal.fire({
        title: 'Are you sure?',
        text: 'This will delete the account.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: '/agent/remove/' + id,
                type: 'PUT',
                success: function (response) {
                    Swal.fire({
                        title: 'Deleted!',
                        text: 'Account deleted successfully.',
                        icon: 'success',
                        confirmButtonText: 'OK'
                    }).then(() => {
                        window.location.reload(); // or reloadData(); kung naka-DT ka
                    });
                },
                error: function (xhr) {
                    Swal.fire({
                        title: 'Error!',
                        text: 'Something went wrong while archiving.',
                        icon: 'error',
                        confirmButtonText: 'OK'
                    });
                    console.error('❌ Error archiving agent:', xhr.responseText);
                }
            });
        }
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


function get_agency_name(id) {
	$.ajax({
		url: '/agency_data/' + id,
		method: 'GET',
		success: function (response) {
			if (response.length > 0) {
				const agencyName = response[0].agency_name;
				$('#agency_name_modal').text(agencyName);
			} else {
				$('#agency_name_modal').text('Unknown');
			}
		},
		error: function (xhr, status, error) {
			console.error('Error fetching agency:', error);
			$('#agency_name_modal').text('Unknown');
		}
	});
}


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
                document.getElementById('account_photo').src = '/PassportUpload/DEFAULT.png';
            }
        } else {
            console.log('No data found for this account');
        }
    })
    .catch(error => {
        console.error('Error fetching account details:', error);
    });


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
					// Define the expected format of your date strings.
					var inputFormat = "MMMM DD, YYYY HH:mm:ss";
					
					// For sorting, return a standardized UTC format
					if (type === 'sort') {
						return moment.utc(data, inputFormat, true).format('YYYY-MM-DD HH:mm:ss');
					}
	
					// Parse the date using the explicit input format and strict mode
					const dateMoment = moment(data, inputFormat, true);
					
					if (dateMoment.isValid()) {
						// Convert to local time for display and format accordingly
						return dateMoment.local().format('DD MMM, YYYY HH:mm:ss');
					} else {
						// Return a placeholder for invalid dates
						return 'Invalid Date';
					}
				},
				"createdCell": function (cell, cellData, rowData, rowIndex, colIndex) {
					$(cell).addClass('text-center');
				}
			}
		]
	});
	

	accountDetailsDataTable = dataTableDetails;
	currentAccountDetailsId = account_id_data;

	reloadDataDetails();
}

function reloadDataDetails() {
	if (!accountDetailsDataTable || !currentAccountDetailsId) return;

	$.ajax({
		url: '/account_details_data_deposit/' + currentAccountDetailsId,
		method: 'GET',
		success: function (data) {
			accountDetailsDataTable.clear();

			let deposit_amount = 0;
			let withdraw_amount = 0;
			let marker_issue_amount = 0;
			let marker_deposit_amount = 0;
			let marker_return_deposit = 0;

			let rowsToAdd = [];

			const requests = data.map(row => {
				return new Promise((resolve) => {
					const amount = parseFloat(String(row.AMOUNT).replace(/,/g, '')) || 0;

					if (row.TRANSACTION === 'DEPOSIT') deposit_amount += amount;
					if (row.TRANSACTION === 'WITHDRAW') withdraw_amount += amount;
					if (row.TRANSACTION === 'IOU CASH') marker_issue_amount += amount;
					if (row.TRANSACTION === 'MARKER REDEEM') marker_deposit_amount += amount;
					if (row.TRANSACTION === 'IOU RETURN DEPOSIT') marker_return_deposit += amount;

					const transactionDesc = row.TRANSACTION_DESC || '';
					const dateFormat = moment(row.encoded_date).format('MMMM DD, YYYY HH:mm:ss');

					if (row.TRANSFER === 1) {
						$.ajax({
							url: '/get-transfer-agent-name',
							type: 'GET',
							data: { transferAgentId: row.TRANSFER_AGENT },
							success: function (response) {
								const transferAgentName = response.transfer_agent_name?.trim() || 'Unknown';
								const agentCode = response.agent_code?.trim() || 'N/A';
								const trans = row.TRANSACTION === 'DEPOSIT'
									? `DEPOSIT ( <strong>Received from ${agentCode} - ${transferAgentName} </strong> )`
									: `WITHDRAW ( <strong>Transferred to ${agentCode} - ${transferAgentName} </strong> )`;

								rowsToAdd.push([
									dateFormat,
									`${trans} - <strong>${transactionDesc}</strong>`,
									`₱${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`,
									row.REMARKS
								]);
								resolve();
							},
							error: function () {
								const trans = row.TRANSACTION === 'DEPOSIT'
									? `DEPOSIT ( <strong>Received from Error fetching name</strong> )`
									: `WITHDRAW ( <strong>Transferred to Error fetching name</strong> )`;

								rowsToAdd.push([
									dateFormat,
									`${trans} - <strong>${transactionDesc}</strong>`,
									`₱${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`,
									row.REMARKS
								]);
								resolve();
							}
						});
					} else {
						rowsToAdd.push([
							dateFormat,
							`${row.TRANSACTION} - <strong>${transactionDesc}</strong>`,
							`₱${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`,
							row.REMARKS
						]);
						resolve();
					}
				});
			});

			Promise.all(requests).then(() => {
				accountDetailsDataTable.rows.add(rowsToAdd).draw();

				const totalAmount = deposit_amount + marker_issue_amount - withdraw_amount - marker_return_deposit;

				$('.total_deposit').text(`₱${deposit_amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`);
				$('.total_withdraw').text(`₱${withdraw_amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`);
				$('.total_balance').text(`₱${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`);
				$('#total_balanceGuest').val(totalAmount);
				currentAccountBalance = totalAmount;
			});
		},
		error: function (xhr, status, error) {
			console.error('Error fetching data:', error);
		}
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// account_details_v2: tawagin mula sa Activity Logs
// ─────────────────────────────────────────────────────────────────────────────
async function account_details_v2(ledgerId, guestName, acctName) {
	console.log("Loading v2 for ledger", ledgerId);
  
	// 0) Kunin ang ACCOUNT_ID mula sa ledger
	let accountId;
	try {
	  const resp = await fetch(`/ledger/${ledgerId}`);
	  const json = await resp.json();
	  accountId = json.account_id;
	} catch (err) {
	  return console.error("Cannot resolve accountId:", err);
	}
  
	// 1) Fetch account info (photo, code, name)
	try {
	  const r = await fetch(`/account_passportphoto_data/${accountId}`);
	  const [acct] = await r.json();
	  if (acct) {
		document.getElementById('agent_code_alt').textContent   = acct.agent_code   || 'N/A';
		document.getElementById('account_name_alt').textContent = acct.account_name || 'N/A';
		document.getElementById('account_photo_alt').src =
		  (acct.PASSPORTPHOTO && acct.PASSPORTPHOTO!=='DEFAULT.jpg')
			? `/PassportUpload/${acct.PASSPORTPHOTO}`
			: '/PassportUpload/DEFAULT.png';
	  }
	} catch (err) {
	  console.error("Error fetching passport/photo:", err);
	}
  
	// 2) Reset form fields
	$('#account_id_alt').val(accountId);
	$('#account_id_add_alt').val(accountId);
	$('.txtAmount_alt').val('');
	$('.remarks_alt').val('');
	$('input[name="txtTrans"]').prop('checked', false);
  
	// 3) (Re)initialize DataTable
	if ($.fn.DataTable.isDataTable('#accountDetailsAlt')) {
	  $('#accountDetailsAlt').DataTable().destroy();
	}
	const dt = $('#accountDetailsAlt').DataTable({
	  order: [[0,'desc']],
	  columnDefs: [{
		targets: 0,
		render(data,type) {
		  const fmt="MMMM DD, YYYY HH:mm:ss";
		  if (type==='sort') {
			return moment.utc(data,fmt,true).format('YYYY-MM-DD HH:mm:ss');
		  }
		  const m = moment(data,fmt,true);
		  return m.isValid() ? m.local().format('DD MMM, YYYY HH:mm:ss') : 'Invalid Date';
		},
		createdCell: c => $(c).addClass('text-center')
	  }]
	});
  
	// 4) Load buong ledger rows at inline‑highlight
	function reloadV2(){
	  $.ajax({
		url: `/account_details_data/${accountId}`,
		method: 'GET',
		success(rows) {
		  console.log("Received v2 rows:", rows);
		  dt.clear();
  
		  rows.forEach(r=>{
			const amt = parseFloat(r.AMOUNT)||0;
			const rowApi = dt.row.add([
			  moment(r.encoded_date).format('MMMM DD, YYYY HH:mm:ss'),
			  `${r.TRANSACTION} - <strong>${r.TRANSACTION_DESC||''}</strong>`,
			  `₱${amt.toLocaleString()}`,
			  r.REMARKS||''
			]).draw(false);
  
			const node = rowApi.node();
			// inline highlight light‑blue
			if (r.account_details_id == ledgerId) {
			  $(node).css('background-color', '#cce5ff');
			  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		  });
		},
		error(xhr,s,e){ console.error("Error loading v2 data:", s, e); }
	  });
	}
  
	// 5) Show modal & load
	$('#modal-account-details-alt').modal('show');
	reloadV2();
  
	// Auto‑refresh page kapag sinara ang modal
	$('#modal-account-details-alt')
	  .off('hidden.bs.modal')
	  .on('hidden.bs.modal', () => window.location.reload());
  }
  window.account_details_v2 = account_details_v2;
  
	
function bindAccountDetailsForm({ formSelector, amountSelector, remarksSelector, totalBalanceSelector, modalSelector }) {
	$(formSelector).submit(function (event) {
		event.preventDefault();

		const $form = $(this);
		const submitButton = $form.find('button[type="submit"]');
		if (submitButton.prop('disabled')) return;

		const originalHtml = submitButton.data('original-html') || submitButton.html();
		submitButton.data('original-html', originalHtml);
		submitButton.prop('disabled', true).html(`
			<span class="spinner-border spinner-border-sm me-1 text-white" role="status" aria-hidden="true"></span>
			<span class="text-white">Loading...</span>
		`);

		const restoreButton = () => submitButton.prop('disabled', false).html(originalHtml);

		const selectedTrans = $form.find('input[name="txtTrans"]:checked').val();
		const amountField = $form.find(amountSelector);
		const enteredAmountValue = amountField.val() ? amountField.val().replace(/,/g, '') : '0';
		const enteredAmount = parseFloat(enteredAmountValue) || 0;

		let totalBalanceValue = '0';
		const totalBalanceElement = $(totalBalanceSelector);
		if (totalBalanceElement.length) {
			totalBalanceValue = totalBalanceElement.val() || '0';
		}
		const totalBalanceGuest = parseFloat(totalBalanceValue.replace(/,/g, '').trim()) || 0;
		const availableBalance = (typeof currentAccountBalance === 'number' && currentAccountBalance > 0)
			? currentAccountBalance
			: totalBalanceGuest;

		const modalElement = $(modalSelector);

		const formatNumberWithCommas = number => number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

		if (!selectedTrans) {
			Swal.fire({
				icon: 'error',
				title: 'Transaction Type Required',
				text: 'Please select a transaction type (Deposit or Withdraw).',
				confirmButtonText: 'OK'
			});
			restoreButton();
			return;
		}

		if (selectedTrans === '2' && enteredAmount > availableBalance) {
			Swal.fire({
				icon: 'error',
				title: 'Insufficient Balance',
				text: 'The amount exceeds the available total balance of P' + formatNumberWithCommas(totalBalanceGuest),
				confirmButtonText: 'OK'
			}).then(() => {
				if (modalElement.length) {
					modalElement.modal('hide');
				}
				reloadDataDetails();
				window.location.reload();
			});
			restoreButton();
			return;
		}

		const formData = $form.serialize();

		$.ajax({
			url: '/add_account_details',
			type: 'POST',
			data: formData,
			success: function () {
				Swal.fire({
					title: 'Success!!!',
					icon: 'success',
					confirmButtonText: 'OK'
				}).then(() => {
					reloadDataDetails();
					if (modalElement.length) {
						modalElement.modal('show');
					}

					$form.find(amountSelector).val('');
					$form.find(remarksSelector).val('');
					$form.find('input[name="txtTrans"]').prop('checked', false);

					if (modalElement.length) {
						modalElement.off('hidden.bs.modal').on('hidden.bs.modal', function () {
							window.location.reload();
						});
					}
				});
			},
			error: function (xhr, status, error) {
				var errorMessage = xhr.responseJSON?.error || 'An error occurred.';
				console.error('Error updating user role:', errorMessage);
				Swal.fire({
					icon: 'error',
					title: 'Error',
					text: errorMessage,
					confirmButtonText: 'OK'
				});
			},
			complete: restoreButton
		});
	});
}

bindAccountDetailsForm({
	formSelector: '#add_new_account_details',
	amountSelector: '.txtAmount',
	remarksSelector: '.remarks',
	totalBalanceSelector: '#total_balanceGuest',
	modalSelector: '#modal-account-details'
});

bindAccountDetailsForm({
	formSelector: '#add_new_account_details_alt',
	amountSelector: '.txtAmount_alt',
	remarksSelector: '.remarks_alt',
	totalBalanceSelector: '#total_balanceGuest_alt',
	modalSelector: '#modal-account-details-alt'
});


function add_account_details() {
	$('#modal-account-details').modal('hide');
	$('#modal-add-account-details').modal('show');
	$('.txtAmount').val('');

}


function transfer_account() {
	$('#modal-account-details').modal('hide');
	$('#modal-transfer_account').modal('show');
	$('.txtAmount').val('');

	// Set modal title to current account name if available
	const accountName = $('#account_name').text();
	if (accountName) {
		$('#account_name_transfer').text(accountName);
	}

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
                } else if (row.TRANSACTION === 'IOU RETURN DEPOSIT') {
                    marker_return += row.AMOUNT;
                }
				else if (row.TRANSACTION === 'IOU CASH') {
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
                    } else if (row.TRANSACTION === 'IOU CASH') {
                        marker_issue_amount += row.AMOUNT;
                    } else if (row.TRANSACTION === 'MARKER REDEEM') {
                        marker_deposit_amount += row.AMOUNT;
                    } else if (row.TRANSACTION === 'IOU RETURN DEPOSIT') {
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

document.addEventListener('DOMContentLoaded', function () {
	const balanceBtn = document.getElementById('balanceCheckBtn');

	if (balanceBtn) {
		balanceBtn.addEventListener('click', async function () {
			const accountId = document.getElementById('account_id').value;

			// Save original content
			const originalHtml = balanceBtn.innerHTML;

			// Show loading spinner on button
			balanceBtn.disabled = true;
			balanceBtn.innerHTML = `
				<span class="spinner-border spinner-border-sm me-1 text-white" role="status" aria-hidden="true"></span>
<span class="text-white">Loading...</span>
			`;

			try {
				const response = await fetch(`/check_balance/${accountId}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					}
				});

				const result = await response.json();

				if (result.success) {
					await Swal.fire({
						icon: 'success',
						title: '✅ Balance Sent',
						text: 'Balance was successfully sent to Telegram!',
						confirmButtonColor: '#3085d6'
					});
				} else {
					await Swal.fire({
						icon: 'error',
						title: '⚠️ Failed',
						text: 'Unable to send balance to Telegram.',
						confirmButtonColor: '#d33'
					});
				}
			} catch (err) {
				console.error(err);
				await Swal.fire({
					icon: 'error',
					title: '❌ Error',
					text: 'An error occurred while checking balance.',
					confirmButtonColor: '#d33'
				});
			} finally {
				// Re-enable button and reset original HTML
				balanceBtn.disabled = false;
				balanceBtn.innerHTML = originalHtml;
			}
		});
	}
});


