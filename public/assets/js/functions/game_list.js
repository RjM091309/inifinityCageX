var account_id;
var record_id;
var game_id;
var _servicesSettled = 0;
// Cache accounts so Select2 doesn't flash "No results found" while AJAX is still loading
var _accountOptionsCache = null;
var _accountOptionsPromise = null;
	

function addGameList(id) {
	var $select = $('#txtTrans');
	
	// Helper to populate select options and refresh Select2
	function populateOptions() {
		if (!$select.length) return;
		
		// Destroy Select2 first to ensure clean state
		if ($select.data('select2')) {
			$select.select2('destroy');
		}
		
		// Populate options
		$select.empty();
		$select.append($('<option>', { value: '', text: '--SELECT ACCOUNT--' }));
		
		if (Array.isArray(_accountOptionsCache) && _accountOptionsCache.length > 0) {
			_accountOptionsCache.forEach(function (option) {
				$select.append($('<option>', {
					value: option.account_id,
					text: option.agent_name + ' (' + option.agent_code + ')'
				}));
			});
		}
		
		// Reinitialize Select2 with fresh options
		$select.select2({
			placeholder: 'Select an option',
			dropdownParent: '#modal-new-game-list',
		});
	}
	
	// Show modal IMMEDIATELY for smooth UX (don't wait for data)
	$('#modal-new-game-list').modal('show');
	
	// Populate dropdown based on data availability
	if (Array.isArray(_accountOptionsCache)) {
		// Data is ready - populate immediately
		populateOptions();
	} else if (_accountOptionsPromise) {
		// Data is loading - populate when ready
		_accountOptionsPromise.then(function() {
			populateOptions();
		}).catch(function() {
			populateOptions(); // Show empty if error
		});
	} else {
		// No data yet - fetch and populate when ready
		preloadAccounts().then(function() {
			populateOptions();
		}).catch(function() {
			populateOptions();
		});
	}
}

function getQueryParam(param) {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get(param);
}
$(document).ready(function () {


	  


	const highlightId = getQueryParam('id');
	
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
		responsive: false,
		paging: true,
		lengthChange: true,
		searching: true,
		ordering: true,
		info: true,
		autoWidth: false,
		order: [[0, 'desc']],
		pageLength: 10,
	
		columnDefs: [
			{ targets: 4, className: 'text-center col-buyin' },          // BUY-IN (Blue)
			{ targets: 7, className: 'text-center col-total-rolling' }, // TOTAL ROLLING (Green)
			{ targets: 10, className: 'text-center col-winloss' },      // WIN/LOSS (Orange)
			{ targets: '_all', className: 'text-center' }               // center all columns
		],
		

		
	
		language: {
			info: "Showing _START_ to _END_ of _TOTAL_ entries",
		},
	
		createdRow: function (row, data, index) {
			// 🔴 Color red if WIN/LOSS is negative
			if (parseInt(data[10].split(',').join('')) < 0) {
				$('td:eq(10)', row).css({
					'background-color': '#fff',
					'color': 'red'
				});
			}
	
			// ✅ HIGHLIGHTING logic
			// Step 1: Remove HTML from Game # column to extract pure ID
			const gameListIdText = $('<div>').html(data[2]).text(); // assuming column 2 is GAME #
			const gameListId = parseInt(gameListIdText);
	
			// Step 2: Compare with highlightId from URL
			const isHighlighted = highlightId && gameListId === parseInt(highlightId);
	
			if (isHighlighted) {
				console.log("✅ Highlighting row:", gameListId);
				$(row).addClass('highlight-row');
			}
		}
	});
	

    function reloadData() {
		const dateRange = $('#daterange').val();

		// Build params; if highlightId exists, pass it to bypass date filtering on backend
		const params = {};
		if (highlightId) {
			params.id = highlightId;
		}

		// If there is a date range, include it; otherwise, only require it when no highlightId
		if (dateRange) {
			if (dateRange.indexOf(" to ") > -1) {
				const [start, end] = dateRange.split(' to ');
				params.start = start;
				params.end = end;
			} else {
				params.start = dateRange;
				params.end = dateRange;
			}
		} else if (!highlightId) {
			alert('Please select a date range.');
			return;
		}
      

        $.ajax({
            url: '/game_list_data', // Endpoint to fetch data
            method: 'GET',
            data: params,
            success: function (data) {
                dataTable.clear();

				  // ✅ Show only the highlighted record if an ID is specified
				  if (highlightId) {
					data = data.filter(row => row.game_list_id === parseInt(highlightId));
				}

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

// 					let isHighlighted = highlightId && parseInt(highlightId) === row.game_list_id;
// let rowClass = isHighlighted ? 'highlight-row' : '';


                    var btn = `<div class="btn-group">
                        <button type="button" onclick="viewRecord(${row.game_list_id})" class="btn btn-sm btn-info-subtle action-btn-square js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Details">
                        <i class="fa fa-file-alt"></i>
                        </button>
                        <button type="button" onclick="changeStatus(${row.game_list_id})" class="btn btn-sm btn-alt-warning action-btn-square js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Status">
                        <i class="fa fa-exchange-alt"></i>
                        </button>
                        <button type="button" onclick="archive_game_list(${row.game_list_id})" class="btn btn-sm btn-alt-danger action-btn-square js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
                        <i class="fa fa-trash-alt"></i>
                        </button>
                    </div>`;

                    var btn_his = `<div class="btn-group" role="group">
                        <button type="button" onclick="showHistory(${row.game_list_id})" class="btn btn-sm btn-info-subtle action-btn-square js-bs-tooltip-enabled"
                            data-bs-toggle="tooltip" aria-label="History" data-bs-original-title="History" title="History"
                            style="font-size:8px !important; margin-right: 5px;">
                            <i class="fa fa-history"></i>
                        </button>
                    </div>`;
                    var btn_services = `<div class="btn-group" role="group">
                        <button type="button" onclick="openServices(${row.game_list_id}, '${encodeURIComponent(row.agent_name || '')}', ${row.game_status}, ${row.SETTLED || 0})" class="btn btn-sm btn-primary-subtle action-btn-square js-bs-tooltip-enabled"
                            data-bs-toggle="tooltip" aria-label="Services" data-bs-original-title="Services" title="Services"
                            style="font-size:8px !important; margin-right: 5px;">
                            <i class="fa fa-concierge-bell"></i>
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
								status = `<button type="button" onclick="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID } , ${total_amount} , ${total_cash_out_chips} , ${total_rolling_chips} , ${WinLoss})" class="btn btn-sm btn-primary-subtle js-bs-tooltip-enabled"
									data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Status"  style="font-size:8px !important;">ON GAME</button>`;
								} else {
									// Show SweetAlert for cashier or other users
									status = `<button type="button" 
												class="btn btn-sm btn-primary-subtle btn-on-game" 
												style="font-size:8px !important;"
												onclick="showSweetAlert()">
											ON GAME
										</button>`;
								}

								buyin_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addBuyin(' + row.game_list_id + ', ' + row.ACCOUNT_ID + ')">' + parseFloat(total_amount).toLocaleString() + '</button>';
								rolling_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addRolling(' + row.game_list_id + ')">' + parseFloat(total_rolling_real_chips).toLocaleString() + '</button>';
								cashout_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addCashout(' + row.game_list_id + ', ' + row.ACCOUNT_ID + ', ' + total_rolling_chips + ')">' + parseFloat(total_cash_out_chips).toLocaleString() + '</button>';
								
									// Format net value as an integer
									var formattedNet = net.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
								var game_start = moment.utc(row.GAME_DATE_START).utcOffset(8).format('MMMM DD, HH:mm');
								
								// Get commission type badge (R/S/L)
								var commissionTypeBadge = '';
								if (row.COMMISSION_TYPE == 1) {
									commissionTypeBadge = '<span class="badge commission-badge commission-badge-r" title="Rolling Game">R</span>';
								} else if (row.COMMISSION_TYPE == 2) {
									commissionTypeBadge = '<span class="badge commission-badge commission-badge-s" title="Shared Game">S</span>';
								} else if (row.COMMISSION_TYPE == 3) {
									commissionTypeBadge = '<span class="badge commission-badge commission-badge-l" title="Loosing Game">L</span>';
								}
								
								// const highlightId = getQueryParam('highlight_id');
								// const gameListIdText = $('<div>').html(row.game_list_id).text();
								// const isHighlighted = highlightId && parseInt(highlightId) === parseInt(gameListIdText);
								// const rowClass = isHighlighted ? 'highlight-row' : '';
								// let gameIdDisplay = row.game_list_id;

								// if (rowClass !== '') {
								// 	gameIdDisplay = `⭐ ${row.game_list_id}`;
								// }

                                var actionButtons = btn_services;
                                if (userPermissions === 11 || userPermissions === 1) {
                                    actionButtons += btn_his;
                                }
                                actionButtons += btn_settle;

                                let rowNode = dataTable.row.add([
                                    game_start,
                                    `${row.GAME_TYPE}`,
                                    `${row.game_list_id}`,
                                    `${row.agent_code} (${row.agent_name})`,
                                    buyin_td,
                                    cashout_td,
                                    rolling_td,
                                    parseFloat(total_rolling_chips).toLocaleString(),
                                    `${row.COMMISSION_PERCENTAGE}% ${commissionTypeBadge}`,
                                    formattedNet,
                                    winloss,
                                    `${row.INITIAL_MOP}`,
                                    status,
                                    actionButtons
                                ]).draw().node();
								

								// if (rowClass !== '') {
								// 	console.log('✅ Highlighting row:', gameListIdText);
								// 	$(rowNode).addClass(rowClass);

								// 	setTimeout(() => {
								// 		$('html, body').animate({
								// 			scrollTop: $(rowNode).offset().top - 100
								// 		}, 600);
								// 	}, 300);
								// }


								
							} else {
							
								if (userPermissions === 11 || userPermissions === 1) { // If manager
									// END GAME STATUS EDITABLE(ON GAME & END GAME)
								status = `<a href="#" onclick="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID })">${moment(row.GAME_ENDED).format('MMMM DD, HH:mm')}</a>`;
	
								} else {
									
								// //END GAME STATUS NOT EDITABLE
								status = `<a href="#" onclick="showEndGameAlert()">${moment(row.GAME_ENDED).format('MMMM DD, HH:mm')}</a>`;

									
								}
	
								buyin_td = parseFloat(total_amount).toLocaleString();
								rolling_td = parseFloat(total_rolling_real_chips).toLocaleString();
								cashout_td = '<span style="font-size:11px;text-decoration: none;" >' + parseFloat(total_cash_out_chips).toLocaleString() + '</span>';
	
								var settleLabel = row.SETTLED === 1 ? 'Settled' : 'Settlement';
								var settleClass = row.SETTLED === 1 ? 'btn-success-subtle' : 'btn-danger-subtle';
								var settleTitle = settleLabel;
								var btn_settle = `<div class="btn-group" role="group">
								<button type="button" onclick="showHistory(${row.game_list_id})" class="btn btn-sm btn-info-subtle action-btn-square js-bs-tooltip-enabled"
										data-bs-toggle="tooltip" aria-label="History" data-bs-original-title="History" title="History"
										style="font-size:8px !important; margin-right: 5px;">
										<i class="fa fa-history"></i>
								</button>
								<button type="button" onclick="settlement_history(${row.game_list_id}, ${row.ACCOUNT_ID })" class="btn btn-sm ${settleClass} action-btn-square js-bs-tooltip-enabled"
										data-bs-toggle="tooltip" aria-label="${settleTitle}" data-bs-original-title="${settleTitle}" title="${settleTitle}"
										style="font-size:10px !important;">
										 <i class="fa fa-clipboard-check"></i>
								</button>
						   </div>`;
						   // Format net value as an integer
						   var formattedNet = net.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
						   
						   // Get commission type badge (R/S/L)
						   var commissionTypeBadge = '';
						   if (row.COMMISSION_TYPE == 1) {
							   commissionTypeBadge = '<span class="badge commission-badge commission-badge-r" title="Commission Type: Rolling">R</span>';
						   } else if (row.COMMISSION_TYPE == 2) {
							   commissionTypeBadge = '<span class="badge commission-badge commission-badge-s" title="Commission Type: Share">S</span>';
						   } else if (row.COMMISSION_TYPE == 3) {
							   commissionTypeBadge = '<span class="badge commission-badge commission-badge-l" title="Commission Type: Loss">L</span>';
						   }
						   
						   var game_start = moment.utc(row.GAME_DATE_START).utcOffset(8).format('MMMM DD, HH:mm');
						   var actionButtons = btn_services + btn_settle;
						   dataTable.row.add([game_start,`${row.GAME_TYPE}`, `${row.game_list_id}`, `${row.agent_code} (${row.agent_name})`, buyin_td, cashout_td, rolling_td, parseFloat(total_rolling_chips).toLocaleString(), `${row.COMMISSION_PERCENTAGE}% ${commissionTypeBadge}`, formattedNet, winloss,`${row.INITIAL_MOP}`, status, actionButtons]).draw();
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
    $btn.prop('disabled', true).html(`
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        Loading...
    `); // Disable button immediately

    // Retrieve values and trim them
    var nnChips = $('#txtNN').val().trim();
    var ccChips = $('#txtCC').val().trim();
    var transType = $('input[name="txtTransType"]:checked').val(); // Get the selected transaction type
    var commissionTypeSelected = $('#commissionType').val() !== ''; // Check if commission type is selected
    var txtNNamount = parseFloat(nnChips.replace(/,/g, '')) || 0; // Convert NN Chips to number
    var txtCCamount = parseFloat(ccChips.replace(/,/g, '')) || 0; // Convert CC Chips to number
    var totalBalanceGuest1 = $('#total_balanceGuest1').val().replace(/,/g, '').trim();
   

    // Check if the required fields are filled
    if ((nnChips === '' && ccChips === '') || !transType || !commissionTypeSelected) {
        // Build the warning message based on what's missing
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
            text: 'The amount exceeds the available total balance of ₱' + formatNumberWithCommas(totalBalanceGuest1),
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

	const $btn = $('#submit-buyin-btn'); // Reference to the submit button
	$btn.prop('disabled', true).html(`
		<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
		Loading...
	`);

	const nnChips = $('.txtNN').val().trim();
	const ccChips = $('.txtCC').val().trim();
	const transType = $('input[name="txtTransType"]:checked').val(); // Get selected type
	const transTypeSelected = !!transType;

	const totalBalanceGuest2 = $('#total_balanceGuest2').val().replace(/,/g, '').trim();
	
	const txtNNamount = parseFloat(nnChips.replace(/,/g, '')) || 0;
	const txtCCamount = parseFloat(ccChips.replace(/,/g, '')) || 0;
	const totalEnteredAmount = txtNNamount + txtCCamount;

	// Validation
	if (!nnChips && !ccChips && !transTypeSelected) {
		Swal.fire({
			title: 'Warning',
			text: 'Please fill in at least one field: NN Chips or CC Chips, and select a Transaction Type!',
			icon: 'warning',
			confirmButtonText: 'OK'
		});
	} else if (!nnChips && !ccChips) {
		Swal.fire({
			title: 'Warning',
			text: 'Please fill in at least one field: NN Chips or CC Chips!',
			icon: 'warning',
			confirmButtonText: 'OK'
		});
	} else if (!transTypeSelected) {
		Swal.fire({
			title: 'Warning',
			text: 'Please select a Transaction Type!',
			icon: 'warning',
			confirmButtonText: 'OK'
		});
	} else if (transType == '2' && totalEnteredAmount > totalBalanceGuest2) { // Deposit type
		Swal.fire({
			title: 'Insufficient Balance',
			text: 'The amount exceeds the available total balance of ₱' + formatNumberWithCommas(totalBalanceGuest2),
			icon: 'error',
			confirmButtonText: 'OK'
		});
	} else {
		// Proceed with AJAX if all validations pass
		const formData = $(this).serialize();

		$.ajax({
			url: '/game_list/add/buyin',
			type: 'POST',
			data: formData,
			success: function (response) {
				Swal.fire({
					icon: 'success',
					title: 'Success!',
					text: 'Additional Buy-in successfully added.',
					confirmButtonText: 'OK',
					allowOutsideClick: false,
					allowEscapeKey: false
				}).then(() => {
					reloadData();
					$('#modal-add-buyin').modal('hide');
					$('#add_buyin')[0].reset();
					$btn.prop('disabled', false).text('Submit');
				});
			},
			error: function (xhr) {
				const errorMessage = xhr.responseJSON?.error || 'An error occurred.';
				console.error('Error adding buy-in transaction:', errorMessage);
				Swal.fire({
					icon: 'error',
					title: 'Error',
					text: errorMessage,
					confirmButtonText: 'OK'
				});
				$btn.prop('disabled', false).text('Submit');
			}
		});
	}

	// Re-enable button if we exited early
	if (!$btn.is(':disabled')) $btn.text('Save');
});


	$('#add_cashout').submit(function (event) {
		event.preventDefault();
	
		// 🔥 ADD: Reference to Save button
		var $btn = $('#submit-cashout-btn');
		$btn.prop('disabled', true).html(`
			<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
			Loading...
		`);
	
		// Get the values of txtNN and txtTotalRolling
		var txtTotalRolling = parseFloat($('#TotalRollingCashout').val()); 
		var txtNN = parseFloat(($('#txtNNCashout').val() || '0').replace(/,/g, '')); 
		var txtCC = parseFloat(($('#txtCCCashout').val() || '0').replace(/,/g, '')); 
		var markerChipsReturn = parseFloat(($('#MarkerChipsReturn').val() || '0').replace(/,/g, '')); 
		var txtTransType = $('input[name="txtTransType"]:checked').val(); 
	
		if (txtNN > txtTotalRolling) {
			Swal.fire({
				icon: 'warning',
				title: 'Invalid Input',
				text: 'NN Chips returned cannot exceed Total Rolling: '+ formatNumberWithCommas(txtTotalRolling),
			});
			$btn.prop('disabled', false).html('Save'); // 🔥 RESET BUTTON
			return;
		}
	
		if (txtTransType == 4) {
			if (txtCC > markerChipsReturn || txtNN > markerChipsReturn) {
				Swal.fire({
					icon: 'warning',
					title: 'Invalid Input',
					text: 'Marker Chips Return cannot exceed Marker Balance: ' + formatNumberWithCommas(markerChipsReturn),
				});
				$btn.prop('disabled', false).html('Save'); // 🔥 RESET BUTTON
				return;
			}
	
			var totalChips = txtCC + txtNN;
			if (totalChips > markerChipsReturn) {
				Swal.fire({
					icon: 'warning',
					title: 'Invalid Input',
					text: 'Marker Chips Return cannot exceed Marker Balance: ' + formatNumberWithCommas(markerChipsReturn),
				});
				$btn.prop('disabled', false).html('Save'); // 🔥 RESET BUTTON
				return;
			}
		}
	
		var formData = $(this).serialize();
	
		$.ajax({
			url: '/game_list/add/cashout',
			type: 'POST',
			data: formData,
			success: function (response) {
				Swal.fire({
					icon: 'success',
					title: 'Success!',
					text: 'Chips return process completed!'
				}).then(() => {
					reloadData();
					$('#modal-add-cashout').modal('hide');
					$btn.prop('disabled', false).html('Save'); // 🔥 RESET BUTTON
				});
			},
			error: function (xhr, status, error) {
				var errorMessage = xhr.responseJSON?.error || 'Something went wrong. Please try again.';
				Swal.fire({
					icon: 'error',
					title: 'Error!',
					text: errorMessage
				});
				$btn.prop('disabled', false).html('Save'); // 🔥 RESET BUTTON
			}
		});
	});
	

	$('#add_rolling').submit(function (event) {
		event.preventDefault();
	
		var $btn = $('#submit-rolling-btn'); // Reference to the submit button
		$btn.prop('disabled', true).html(`
			<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
			Loading...
		  `);
		  
	
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

	var $btn = $('#submit-status-btn'); // ✅ reference to button
	$btn.prop('disabled', true).html(`
		<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
		Loading...
	`);

	// Get the value of the status select
	var status = $('#status').val();

	// Validate that the user has selected either "ON GAME" or "END GAME"
	if (status === null) {
		Swal.fire({
			icon: 'error',
			title: 'Choose Game Status',
			text: '',
			confirmButtonText: 'OK'
		}).then((result) => {
			if (result.isConfirmed) {
				$('#modal-change_status').modal('show');
			}
		});

		$btn.prop('disabled', false).html('Save');
		return;
	}

	// Serialize form data
	var formData = $(this).serialize();

	// Submit the form via AJAX
	$.ajax({
		url: '/game_list/change_status/' + game_id,
		type: 'PUT',
		data: formData,
		success: function (response) {
			Swal.fire({
				icon: 'success',
				title: 'Status updated successfully!',
				showConfirmButton: false,
				timer: 1500
			});

			reloadData();
			$('#modal-change_status').modal('hide');
		},
		error: function (error) {
			Swal.fire({
				icon: 'error',
				title: 'Error!',
				text: 'Failed to update status. Please try again.',
			});
			console.error('Error updating status:', error);
		},
		complete: function () {
			$btn.prop('disabled', false).html('Save');

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
		url: '/account_details_data_deposit/' + account,
		method: 'GET',
		success: function (data) {
			let deposit_amount = 0;
			let withdraw_amount = 0;
			let marker_return = 0;
			let marker_issue_amount = 0;
	
			data.forEach(function (row) {
				const amount = parseFloat(row.AMOUNT) || 0; // Ensure numeric
	
				if (row.TRANSACTION === 'DEPOSIT') {
                    deposit_amount += amount;
                } else if (row.TRANSACTION === 'WITHDRAW') {
                    withdraw_amount += amount;
                } else if (row.TRANSACTION === 'IOU RETURN DEPOSIT') {
                    marker_return += amount;
                } else if (row.TRANSACTION === 'IOU CASH') {
					marker_issue_amount += amount;
				}
			});
	
			const totalBalance = deposit_amount - withdraw_amount - marker_return + marker_issue_amount;
	
			// Set raw numeric value safely
			$('#total_balanceGuest2').val(totalBalance);
			$('#total_balanceGuest2GameList').val(totalBalance.toLocaleString());
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
		url: '/account_details_data_deposit/' + account,
		method: 'GET',
		success: function (data) {
			let deposit_amount = 0;
			let withdraw_amount = 0;
			let marker_return = 0;
			let marker_issue_amount = 0;
	
			data.forEach(function (row) {
				const amount = parseFloat(row.AMOUNT) || 0; // ✅ Ensure it's numeric
	
				if (row.TRANSACTION === 'DEPOSIT') {
                    deposit_amount += amount;
                } else if (row.TRANSACTION === 'WITHDRAW') {
                    withdraw_amount += amount;
                } else if (row.TRANSACTION === 'IOU RETURN DEPOSIT') {
                    marker_return += amount;
                } else if (row.TRANSACTION === 'IOU CASH') {
					marker_issue_amount += amount;
				}
			});
	
			const totalBalance = deposit_amount - withdraw_amount - marker_return + marker_issue_amount;

	
			// ✅ Set it safely
			$('#total_balance_cashout').val(!isNaN(totalBalance) ? totalBalance : 0);
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

	// Custom sort to keep TOTAL row at top
	$.fn.dataTable.ext.order['total-first'] = function(settings, col) {
		return this.api().column(col, {order:'index'}).nodes().map(function(td, i) {
			var text = $(td).text().trim();
			// If it's TOTAL, return empty string (sorts first), otherwise return the text
			return text === 'TOTAL' ? '' : text;
		});
	};

	var dataTable = $('#game_record-tbl').DataTable({
		order: [[0, 'asc']], // Sort by first column ascending
		columnDefs: [
			{
				type: 'total-first',
				targets: 0, // Apply custom sort to first column
				createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
					$(cell).addClass('text-center');
				}
			},
			{
				createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
					$(cell).addClass('text-center');
				}
			}
		]
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
            // Set game number and agent name in modal header
            if (data.length > 0) {
                if (data[0].game_list_id) {
                    $('#game_number').text(data[0].game_list_id);
                }
                if (data[0].agent_name) {
                    $('#agent_name').text(data[0].agent_name);
                }
            }
            
            // Calculate totals using the SAME formula as game list (line 304)
            let total_nn_init = 0;
            let total_cc_init = 0;
            let total_nn = 0;
            let total_cc = 0;
            let total_cash_out_nn = 0;
            let total_cash_out_cc = 0;
            let total_rolling_nn = 0;
            let total_rolling_cc = 0;
            let total_rolling = 0;
            let total_rolling_real = 0;
            let total_rolling_nn_real = 0;
            let total_rolling_cc_real = 0;
            let hasInitialBuyIn = false;

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
                        <button type="button" onclick="archive_game_record(${row.game_record_id})" class="btn btn-sm btn-alt-danger"
                            data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
                            <i class="fa fa-trash-alt"></i>
                        </button>
                    </div>`;
                }

                const dateKey = moment(row.record_date).format('MMM DD, YYYY HH:mm:ss');

                if (!mergedData[dateKey]) {
                    mergedData[dateKey] = {
                        buy_in: 0,
                        additional_buyin: 0,
                        cash_out: 0,
                        real_rolling: 0,
                        total_rolling: 0,
                        nn: 0,
                        cc: 0,
                        remarks: row.REMARKS || '',
                        action: row.game_record_id,
                        button: btn  
                    };
                }

                // Process the row based on CAGE_TYPE - same logic as game list
                if (row.CAGE_TYPE == 1) { // BUY IN
                    const buyInAmount = (row.CC_CHIPS || 0) + (row.NN_CHIPS || 0);
                    if (hasInitialBuyIn) {
                        // This is an additional buy-in
                        mergedData[dateKey].additional_buyin += buyInAmount;
                        total_nn += (row.NN_CHIPS || 0);
                        total_cc += (row.CC_CHIPS || 0);
                    } else {
                        // This is the initial buy-in
                        mergedData[dateKey].buy_in += buyInAmount;
                        total_nn_init += (row.NN_CHIPS || 0);
                        total_cc_init += (row.CC_CHIPS || 0);
                        hasInitialBuyIn = true;
                    }
                }
                if (row.CAGE_TYPE == 2) { // CASH OUT
                    const cashOutAmount = (row.CC_CHIPS || 0) + (row.NN_CHIPS || 0);
                    mergedData[dateKey].cash_out += cashOutAmount;
                    total_cash_out_nn += (row.NN_CHIPS || 0);
                    total_cash_out_cc += (row.CC_CHIPS || 0);
                    // Track NN and CC chips for CASH OUT transactions
                    mergedData[dateKey].nn += (row.NN_CHIPS || 0);
                    mergedData[dateKey].cc += (row.CC_CHIPS || 0);
                }
                if (row.CAGE_TYPE == 3) { // TOTAL ROLLING
                    const rollingAmount = (row.AMOUNT || 0) + (row.NN_CHIPS || 0) + (row.CC_CHIPS || 0);
                    mergedData[dateKey].total_rolling += rollingAmount;
                    total_rolling += (row.AMOUNT || 0);
                    total_rolling_nn += (row.NN_CHIPS || 0);
                    total_rolling_cc += (row.CC_CHIPS || 0);
                    // Track NN and CC chips for TOTAL ROLLING transactions only
                    mergedData[dateKey].nn += (row.NN_CHIPS || 0);
                    mergedData[dateKey].cc += (row.CC_CHIPS || 0);
                }
                if (row.CAGE_TYPE == 4) { // REAL ROLLING
                    const realRollingAmount = (row.AMOUNT || 0) + (row.NN_CHIPS || 0) + (row.CC_CHIPS || 0);
                    mergedData[dateKey].real_rolling += realRollingAmount;
                    // Add to total_rolling to match game list calculation (CAGE_TYPE 3 + CAGE_TYPE 4)
                    mergedData[dateKey].total_rolling += realRollingAmount;
                    total_rolling_real += (row.AMOUNT || 0);
                    total_rolling_nn_real += (row.NN_CHIPS || 0);
                    total_rolling_cc_real += (row.CC_CHIPS || 0);
                    // Track NN and CC chips for REAL ROLLING transactions only
                    mergedData[dateKey].nn += (row.NN_CHIPS || 0);
                    mergedData[dateKey].cc += (row.CC_CHIPS || 0);
                }
            });

            // I-clear ang DataTable
            dataTable.clear();

            // Calculate totals from merged data for display
            let totalBuyIn = 0;
            let totalAdditionalBuyIn = 0;
            let totalCashOut = 0;
            let totalRealRolling = 0;
            let totalRolling = 0;
            let totalNN = 0;
            let totalCC = 0;

            for (const date in mergedData) {
                const rowData = mergedData[date];
                totalBuyIn += rowData.buy_in;
                totalAdditionalBuyIn += rowData.additional_buyin;
                totalCashOut += rowData.cash_out;
                totalRealRolling += rowData.real_rolling;
                totalRolling += rowData.total_rolling; // Sum of CAGE_TYPE 3 + CAGE_TYPE 4 from individual rows
                totalNN += rowData.nn;
                totalCC += rowData.cc;
            }
            
            // Apply game list formula: CAGE_TYPE 3 + CAGE_TYPE 4 - cash_out_nn
            // total_cash_out_nn is already calculated in the forEach loop above (line 1299)
            totalRolling = totalRolling - total_cash_out_nn;

            // Prepare all rows data
            const allRows = [];
            
            // Add total row first
            allRows.push([
                '<strong>TOTAL</strong>',
                '<strong>' + totalBuyIn.toLocaleString() + '</strong>',
                '<strong>' + totalAdditionalBuyIn.toLocaleString() + '</strong>',
                '<strong>' + totalCashOut.toLocaleString() + '</strong>',
                '<strong>' + totalRealRolling.toLocaleString() + '</strong>',
                '<strong>' + totalRolling.toLocaleString() + '</strong>',
                '<strong>' + totalNN.toLocaleString() + '</strong>',
                '<strong>' + totalCC.toLocaleString() + '</strong>',
                ''  // Empty for action column
            ]);

            // Add individual records
            for (const date in mergedData) {
                const rowData = mergedData[date];
                allRows.push([
                    date,
                    rowData.buy_in.toLocaleString(),
                    rowData.additional_buyin.toLocaleString(),
                    rowData.cash_out.toLocaleString(),
                    rowData.real_rolling.toLocaleString(),
                    rowData.total_rolling.toLocaleString(),
                    rowData.nn.toLocaleString(),
                    rowData.cc.toLocaleString(),
                    rowData.button  
                ]);
            }

            // Add all rows at once to maintain order
            dataTable.rows.add(allRows).draw();
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

function openServices(id, guestName, gameStatus, settled) {
	// Track settled state
	_servicesSettled = parseInt(settled || 0, 10);

	// Show Services modal and populate selected game id and guest name
	const decodedGuest = decodeURIComponent(guestName || '');
	$('#modal-services').modal('show');
	const title = decodedGuest ? `Services - Game ${id} | ${decodedGuest}` : `Services - Game ${id}`;
	$('#modal-services-label').text(title);
	const $gameInput = $('#services-game-id-input');
	if ($gameInput.length) $gameInput.val(id);
	const $guestInput = $('#services-guest-name-input');
	if ($guestInput.length) $guestInput.val(decodedGuest || '');

	// Hide save form only when already settled
	const showActions = parseInt(settled || 0, 10) !== 1;
	$('#services-save-btn').toggle(showActions);
	$('#services-add-wrap').toggle(showActions);

	// Load existing services
	loadServicesList(id);

	// Clear inputs
	$('#services-type').val('');
	$('#services-amount').val('');
	$('#services-remarks').val('');
}

function loadServicesList(gameId) {
	$.ajax({
		url: `/game_services/${gameId}`,
		method: 'GET',
		success: function (list) {
			renderServicesList(list || []);
		},
		error: function () {
			renderServicesList([]);
		}
	});
}

function renderServicesList(list) {
	const $tbody = $('#services-list-body');
	const $table = $('#services-list-tbl');
	const $total = $('#services-total');
	if (!$tbody.length) return;

	const data = Array.isArray(list) ? list : [];
	const isSettled = parseInt(_servicesSettled || 0, 10) === 1;

	if ($.fn.DataTable.isDataTable($table)) {
		$table.DataTable().clear().destroy();
	}

	if (data.length === 0) {
		if ($total.length) $total.text('0');
		// Let DataTables render its own empty-table row to avoid column-count warnings
		$tbody.empty();
		$table.DataTable({
			paging: false,
			lengthChange: false,
			searching: false,
			ordering: false,
			info: false,
			autoWidth: false,
			language: { emptyTable: 'No services availed.' }
		});
		return;
	}

	const rows = data.map(item => {
		const id = item.IDNo || item.id || '';
		const service = item.SERVICE_TYPE || item.service_type || '';
		const amount = item.AMOUNT || item.amount || 0;
		const remarks = item.REMARKS || item.remarks || '';
		const processed = item.PROCESSED_BY || item.processed_by || item.ENCODED_BY || '';
		const dtRaw = item.DATE || item.ENCODED_DT || item.encoded_dt || item.date || '';
		const formattedDt = dtRaw ? moment(dtRaw).format('MMM DD, HH:mm') : '';
		return `<tr>
			<td>${service}</td>
			<td class="text-end">${parseFloat(amount).toLocaleString()}</td>
			<td>${remarks || ''}</td>
			<td>${processed || ''}</td>
			<td>${formattedDt}</td>
			<td class="text-center">
				<button type="button"
					class="btn btn-sm btn-info-subtle action-btn-square me-1 service-edit-btn"
					title="Edit"
					${isSettled ? 'disabled aria-disabled="true"' : ''}
					data-id="${id}"
					data-service="${service}"
					data-amount="${amount}"
					data-remarks="${encodeURIComponent(remarks || '')}">
					<i class="fa fa-edit"></i>
				</button>
				<button type="button"
					class="btn btn-sm btn-alt-danger action-btn-square service-delete-btn"
					title="Delete"
					${isSettled ? 'disabled aria-disabled="true"' : ''}
					data-id="${id}">
					<i class="fa fa-trash-alt"></i>
				</button>
			</td>
		</tr>`;
	});

	// Total amount of all services
	const totalAmt = data.reduce((sum, item) => {
		const amt = parseFloat(item.AMOUNT || item.amount || 0);
		return sum + (isNaN(amt) ? 0 : amt);
	}, 0);
	if ($total.length) $total.text(totalAmt.toLocaleString());

	$tbody.html(rows.join(''));
	$table.DataTable({
		paging: true,
		pageLength: 5,
		lengthChange: false,
		searching: false,
		ordering: false,
		info: true,
		autoWidth: false
	});
}

// Save service
$(document).on('click', '#services-save-btn', function (e) {
	e.preventDefault();
	const gameId = $('#services-game-id-input').val();
	const type = $('#services-type').val();
	const amountRaw = $('#services-amount').val().replace(/,/g, '').trim();
	const amount = parseFloat(amountRaw) || 0;
	const remarks = $('#services-remarks').val().trim();
	const editId = $('#services-edit-id-input').val();

	if (!gameId || !type) {
		Swal.fire({ icon: 'warning', title: 'Missing fields', text: 'Select service type and enter amount.' });
		return;
	}

	const $btn = $('#services-save-btn');
	$btn.prop('disabled', true).text('Saving...');

	const isEdit = !!editId;
	const url = isEdit ? `/game_services/${editId}` : '/add_game_services';
	const method = isEdit ? 'PUT' : 'POST';

	$.ajax({
		url,
		method,
		data: { game_id: gameId, service_type: type, amount, remarks },
		success: function (list) {
			renderServicesList(list || []);
			$('#services-amount').val('');
			$('#services-remarks').val('');
			$('#services-type').val('');
			$('#services-edit-id-input').val('');
			$('#services-save-btn').text('Save');
		},
		error: function (xhr) {
			const msg = xhr.responseJSON?.error || 'Failed to save service.';
			Swal.fire({ icon: 'error', title: 'Error', text: msg });
		},
		complete: function () {
			$btn.prop('disabled', false).text('Save');
		}
	});
});

// Edit button handler (delegated)
$(document).on('click', '.service-edit-btn', function () {
	const $btn = $(this);
	if ($btn.prop('disabled')) return;
	const id = $btn.data('id');
	const service = $btn.data('service');
	const amount = $btn.data('amount');
	const remarks = decodeURIComponent($btn.attr('data-remarks') || '');
	editService(id, service, amount, remarks);
});

// Delete button handler (delegated)
$(document).on('click', '.service-delete-btn', function () {
	const $btn = $(this);
	if ($btn.prop('disabled')) return;
	const id = $btn.data('id');
	deleteService(id);
});

// Save edit service
$(document).on('click', '#services-edit-save-btn', function (e) {
	e.preventDefault();
	const serviceId = $('#services-edit-id').val();
	const gameId = $('#services-game-id-input').val();
	const type = $('#services-edit-type').val();
	const amountRaw = $('#services-edit-amount').val().replace(/,/g, '').trim();
	const amount = parseFloat(amountRaw) || 0;
	const remarks = $('#services-edit-remarks').val().trim();

	if (!serviceId || !gameId || !type) {
		Swal.fire({ icon: 'warning', title: 'Missing fields', text: 'Select service type and enter amount.' });
		return;
	}

	const $btn = $('#services-edit-save-btn');
	$btn.prop('disabled', true).text('Saving...');

	$.ajax({
		url: `/game_services/${serviceId}`,
		method: 'PUT',
		data: { game_id: gameId, service_type: type, amount, remarks },
		success: function (list) {
			renderServicesList(list || []);
			$('#modal-services-edit').modal('hide');
			$('#services-edit-id').val('');
			$('#services-edit-type').val('');
			$('#services-edit-amount').val('');
			$('#services-edit-remarks').val('');
		},
		error: function (xhr) {
			const msg = xhr.responseJSON?.error || 'Failed to save service.';
			Swal.fire({ icon: 'error', title: 'Error', text: msg });
		},
		complete: function () {
			$btn.prop('disabled', false).text('Save');
		}
	});
});

// Preload account data silently in the background (no DOM manipulation)
function preloadAccounts() {
	// If already cached or loading, skip
	if (Array.isArray(_accountOptionsCache) || _accountOptionsPromise) {
		return _accountOptionsPromise || Promise.resolve(_accountOptionsCache);
	}

	// Fetch data silently without touching DOM
	_accountOptionsPromise = new Promise(function (resolve, reject) {
		$.ajax({
			url: '/account_data',
			method: 'GET',
			success: function (response) {
				_accountOptionsCache = Array.isArray(response) ? response : [];
				resolve(_accountOptionsCache);
			},
			error: function (xhr, status, error) {
				console.error('Error fetching account options:', error);
				_accountOptionsCache = [];
				reject(error);
			},
			complete: function () {
				_accountOptionsPromise = null;
			}
		});
	});

	return _accountOptionsPromise;
}

function get_account() {
	var $select = $('#txtTrans');
	if (!$select.length) return; // Select doesn't exist yet

	// Helper to populate select from cached data
	function populateSelect(options) {
		// Destroy Select2 first
		if ($select.data('select2')) {
			$select.select2('destroy');
		}
		
		$select.empty();
		$select.append($('<option>', { value: '', text: '--SELECT ACCOUNT--' }));

		if (Array.isArray(options) && options.length > 0) {
			options.forEach(function (option) {
				$select.append($('<option>', {
					value: option.account_id,
					text: option.agent_name + ' (' + option.agent_code + ')'
				}));
			});
		}

		// Reinitialize Select2 with fresh options
		$select.select2({
			placeholder: 'Select an option',
			dropdownParent: '#modal-new-game-list',
		});
	}

	// If data is already cached, populate immediately (no delay, no disabled state)
	if (Array.isArray(_accountOptionsCache)) {
		populateSelect(_accountOptionsCache);
		return;
	}

	// If still loading, wait for it and populate when ready
	if (_accountOptionsPromise) {
		_accountOptionsPromise.then(function(options) {
			populateSelect(options);
		}).catch(function() {
			populateSelect([]);
		});
		return;
	}

	// Shouldn't happen if preload works, but fallback just in case
	preloadAccounts().then(populateSelect).catch(function() {
		populateSelect([]);
	});
}

// Preload accounts IMMEDIATELY - start fetching as soon as script loads (before DOM ready)
// This ensures data is ready when user clicks "New Game"
preloadAccounts();

// Also ensure it's ready when DOM is ready
$(document).ready(function () {
	// If not already cached, start preload
	if (!Array.isArray(_accountOptionsCache) && !_accountOptionsPromise) {
		preloadAccounts();
	}
});



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
	$("input[data-type='number']").on('input', function (event) {
		// skip formatting for arrow keys
		if (event.which >= 37 && event.which <= 40) {
			event.preventDefault();
			return;
		}
		const $this = $(this);
		let raw = $this.val() || '';

		// allow digits and a single decimal point; strip letters/symbols
		raw = raw.replace(/[^\d.]/g, '');
		const parts = raw.split('.');
		if (parts.length > 2) {
			raw = parts[0] + '.' + parts.slice(1).join('');
		}

		const [intPart, decPart] = raw.split('.');
		const formattedInt = (intPart || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		const formatted = decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
		$this.val(formatted);
	});
})

function editService(id, service, amount, remarks) {
	const safeAmount = parseFloat(amount || 0);
	$('#services-edit-id').val(id || '');
	$('#services-edit-type').val(service || '');
	$('#services-edit-amount').val(isNaN(safeAmount) ? '' : safeAmount.toLocaleString());
	$('#services-edit-remarks').val(remarks || '');

	$('#modal-services-edit').modal('show');
}

function deleteService(id) {
	const gameId = $('#services-game-id-input').val();
	if (!id || !gameId) return;
	Swal.fire({
		title: 'Delete this service?',
		icon: 'warning',
		showCancelButton: true,
		confirmButtonText: 'Yes, delete',
		cancelButtonText: 'Cancel'
	}).then((result) => {
		if (!result.isConfirmed) return;

		$.ajax({
			url: `/game_services/${id}`,
			method: 'DELETE',
			data: { game_id: gameId },
			success: function (list) {
				renderServicesList(list || []);
				$('#services-edit-id-input').val('');
				$('#services-save-btn').text('Save');
				$('#services-type').val('');
				$('#services-amount').val('');
				$('#services-remarks').val('');
			},
			error: function (xhr) {
				const msg = xhr.responseJSON?.error || 'Failed to delete service.';
				Swal.fire({ icon: 'error', title: 'Error', text: msg });
			}
		});
	});
}

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
						<button type="button" onclick="viewRecord(${row.game_list_id})" class="btn btn-sm btn-alt-info action-btn-square js-bs-tooltip-enabled"
						data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Details">
						<i class="fa fa-file-alt"></i>
						</button>
						<button type="button" onclick="changeStatus(${row.game_list_id})" class="btn btn-sm btn-alt-warning action-btn-square js-bs-tooltip-enabled"
						data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Status">
						<i class="fa fa-exchange-alt"></i>
						</button>
						<button type="button" onclick="archive_game_list(${row.game_list_id})" class="btn btn-sm btn-alt-danger action-btn-square js-bs-tooltip-enabled"
						data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
						<i class="fa fa-trash-alt"></i>
						</button>
					</div>`;

                    var btn_his = `<div class="btn-group" role="group">
                    <button type="button" onclick="showHistory(${row.game_list_id})" class="btn btn-sm btn-info-subtle action-btn-square js-bs-tooltip-enabled"
                            data-bs-toggle="tooltip" aria-label="History" data-bs-original-title="History" title="History"
                            style="font-size:8px !important; margin-right: 5px;">
                            <i class="fa fa-history"></i>
                    </button>
               </div>`;
                    var btn_services = `<div class="btn-group" role="group">
                        <button type="button" onclick="openServices(${row.game_list_id}, '${encodeURIComponent(row.agent_name || '')}', ${row.game_status}, ${row.SETTLED || 0})" class="btn btn-sm btn-primary-subtle action-btn-square js-bs-tooltip-enabled"
                            data-bs-toggle="tooltip" aria-label="Services" data-bs-original-title="Services" title="Services"
                            style="font-size:8px !important; margin-right: 5px;">
                            <i class="fa fa-concierge-bell"></i>
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
								status = `<button type="button" onclick="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID } , ${total_amount} , ${total_cash_out_chips} , ${total_rolling_chips} , ${WinLoss})" class="btn btn-sm btn-info-subtle js-bs-tooltip-enabled"
									data-bs-toggle="tooltip" aria-label="Details" data-bs-original-title="Status"  style="font-size:8px !important;">ON GAME</button>`;

								buyin_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addBuyin(' + row.game_list_id + ', ' + row.ACCOUNT_ID + ')">' + parseFloat(total_amount).toLocaleString() + '</button>';
								rolling_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addRolling(' + row.game_list_id + ')">' + parseFloat(total_rolling_real_chips).toLocaleString() + '</button>';
								cashout_td = '<button class="btn btn-link" style="font-size:11px;text-decoration: underline;" onclick="addCashout(' + row.game_list_id + ', ' + row.ACCOUNT_ID + ', ' + total_rolling_chips + ')">' + parseFloat(total_cash_out_chips).toLocaleString() + '</button>';
                                var actionButtons = btn_services + btn_his;
                                dataTable.row.add([`GAME-${row.game_list_id}`, `${row.agent_code} (${row.agent_name})`, buyin_td, cashout_td, rolling_td, parseFloat(total_rolling_chips).toLocaleString(), `${row.COMMISSION_PERCENTAGE}%`, net, winloss, status, actionButtons]).draw();
							} else {
								
								//END GAME STATUS EDITABLE(ON GAME & END GAME)
								//status = `<a href="#" onclick="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID })">${moment(row.GAME_ENDED).format('MMMM DD, YYYY HH:mm:ss')}</a>`;

								//END GAME STATUS NOT EDITABLE
								status = `<a href="#" value="changeStatus(${row.game_list_id}, ${net}, ${row.ACCOUNT_ID })">${moment(row.GAME_ENDED).format('MMMM DD, YYYY HH:mm:ss')}</a>`;

								buyin_td = parseFloat(total_amount).toLocaleString();
								rolling_td = parseFloat(total_rolling_real_chips).toLocaleString();
								cashout_td = '<span style="font-size:11px;text-decoration: none;" >' + parseFloat(total_cash_out_chips).toLocaleString() + '</span>';
								
								var settleLabel = row.SETTLED === 1 ? 'Settled' : 'Settlement';
								var settleClass = row.SETTLED === 1 ? 'btn-success-subtle' : 'btn-danger-subtle';
								var settleTitle = settleLabel;
								var btn_settle = `<div class="btn-group" role="group">
								<button type="button" onclick="showHistory(${row.game_list_id})" class="btn btn-sm btn-info-subtle action-btn-square js-bs-tooltip-enabled"
										data-bs-toggle="tooltip" aria-label="History" data-bs-original-title="History" title="History"
										style="font-size:8px !important; margin-right: 5px;">
										<i class="fa fa-history"></i>
								</button>
								<button type="button" onclick="settlement_history(${row.game_list_id}, ${row.ACCOUNT_ID })" class="btn btn-sm ${settleClass} action-btn-square js-bs-tooltip-enabled"
										data-bs-toggle="tooltip" aria-label="${settleTitle}" data-bs-original-title="${settleTitle}" title="${settleTitle}"
										style="font-size:10px !important;">
										<i class="fa fa-clipboard-check"></i>
								</button>
						   </div>`;
						   var actionButtons = btn_services + btn_settle;
						   dataTable.row.add([`GAME-${row.game_list_id}`, `${row.agent_code} (${row.agent_name})`, buyin_td, cashout_td, rolling_td, parseFloat(total_rolling_chips).toLocaleString(), `${row.COMMISSION_PERCENTAGE}%`, net, winloss, status, actionButtons]).draw();

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

    // Fetch services total and populate FB
    function loadServicesTotal() {
        $.ajax({
            url: `/game_services/${record_id}`,
            method: 'GET',
            success: function (list) {
                const total = Array.isArray(list)
                    ? list.reduce((sum, item) => {
                        const amt = parseFloat(item.AMOUNT || item.amount || 0);
                        return sum + (isNaN(amt) ? 0 : amt);
                    }, 0)
                    : 0;
                $('#fb').val(total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                // trigger recalculation of payment
                $('#fb').trigger('input');
            },
            error: function () {
                // fallback to 0
                $('#fb').val('0');
                $('#fb').trigger('input');
            }
        });
    }

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

                // After handlers are ready, load services total into FB
                loadServicesTotal();
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
					const amount = parseFloat(row.AMOUNT) || 0; // Safely parse AMOUNT to ensure it is a number
		
					if (row.TRANSACTION === 'DEPOSIT') {
						deposit_amount += amount;
					} else if (row.TRANSACTION === 'WITHDRAW') {
						withdraw_amount += amount;
					} else if (row.TRANSACTION === 'IOU RETURN DEPOSIT') {
						marker_return += amount;
					} else if (row.TRANSACTION === 'IOU CASH') {
						marker_issue_amount += amount;
					}
				});
	
				 // Calculate total balance
				 const totalBalance = deposit_amount - withdraw_amount - marker_return + marker_issue_amount;


				 // Set total balance value
				 $('#SettlementBalance').val(!isNaN(totalBalance) ? totalBalance : 0); // Safely set the value or default to 0 if invalid
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
		$btn.prop('disabled', true).html(`
			<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
			Loading...
		  `);

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
					const amount = parseFloat(row.AMOUNT) || 0; // Ensure numeric
		
					if (row.TRANSACTION === 'DEPOSIT') {
                        deposit_amount += amount;
                    } else if (row.TRANSACTION === 'WITHDRAW') {
                        withdraw_amount += amount;
                    } else if (row.TRANSACTION === 'IOU CASH') {
                        marker_issue_amount += amount;
                    } else if (row.TRANSACTION === 'MARKER REDEEM') {
                        marker_deposit_amount += amount;
                    } else if (row.TRANSACTION === 'IOU RETURN DEPOSIT') {
                    marker_return += amount;
               		}
				});
		
				const totalBalance = deposit_amount - withdraw_amount - marker_return + marker_issue_amount;
		
					// Set raw numeric value safely
					$('#total_balanceGuest1').val(totalBalance);
					$('#total_balanceGuestGameList').val(totalBalance.toLocaleString());
            },
            error: function (xhr, status, error) {
                console.error('Error fetching account details:', error);
            }
        });
    }
});


