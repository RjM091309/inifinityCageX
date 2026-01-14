$(document).ready(function () {
	if ($.fn.DataTable.isDataTable('#game_statistic-tbl')) {
		$('#game_statistic-tbl').DataTable().destroy();
	}
	
	var dataTable = $('#game_statistic-tbl').DataTable({
		"paging": false,        // Tanggalin ang pagination
		"searching": false,     // Tanggalin ang search
		"info": false,          // Tanggalin ang info (total rows)
		"columnDefs": [{
			createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
				$(cell).addClass('text-center');
			}
		}],
	});
	

	function reloadData() {
		$.ajax({
			url: '/game_statistics_data', // Endpoint to fetch data
			method: 'GET',
			success: function (data) {
				dataTable.clear();
	
				let totalInitialBuyIn = 0;
				let totalAdditionalBuyIn = 0;
				let totalAmount = 0;
				let totalRolling = 0;
				let totalChipsReturn = 0;
				let totalWinLoss = 0;
	
				// Create an object to hold aggregated values
				const aggregatedData = {
					LIVE: { totalAmount: 0, winloss: 0, totalRollingChips: 0, formattedNet: 0, houseShare: 0, houseshare: 0, houseshareCount :0, ngr: 0, rtp: 0, rm: 0, expense: 0, profit: 0 },
					TELEBET: { totalAmount: 0, winloss: 0, totalRollingChips: 0, formattedNet: 0, houseShare: 0, houseshare: 0, houseshareCount :0, ngr: 0, rtp: 0, rm: 0, expense: 0, profit: 0 }
				};
	
				let requests = data.map((row, rowIndex) => {
					return $.ajax({
						url: '/game_statistics/' + row.game_list_id + '/record',
						method: 'GET',
						success: function (response) {
							// Retrieve the houseShare value from local storage
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
									total_buy_in += res.AMOUNT;
									total_nn += res.NN_CHIPS;
									total_cc += res.CC_CHIPS;
								}
	
								if ((total_nn_init == 0 && total_cc_init == 0) && res.CAGE_TYPE == 1) {
									initial_buy_in = res.AMOUNT;
									total_nn_init += res.NN_CHIPS;
									total_cc_init += res.CC_CHIPS;
								}
	
								if (res.CAGE_TYPE == 2) {
									total_cash_out += res.AMOUNT;
									total_cash_out_nn += res.NN_CHIPS;
									total_cash_out_cc += res.CC_CHIPS;
								}
	
								if (res.CAGE_TYPE == 3) {
									total_rolling += res.AMOUNT;
									total_rolling_nn += res.NN_CHIPS;
									total_rolling_cc += res.CC_CHIPS;
								}
	
								if (res.CAGE_TYPE == 4) {
									total_rolling_real += res.AMOUNT;
									total_rolling_nn_real += res.NN_CHIPS;
									total_rolling_cc_real += res.CC_CHIPS;
								}
							});
	
							var total_initial = total_nn_init + total_cc_init;
							var total_buy_in_chips = total_nn + total_cc;
							var total_cash_out_chips = total_cash_out_nn + total_cash_out_cc;
							var total_rolling_chips = total_rolling_nn + total_rolling_cc + total_rolling + total_rolling_real + total_rolling_nn_real + total_rolling_cc_real - total_cash_out_nn;
	
							var gross = total_buy_in - total_cash_out;
	
							var total_amount = total_buy_in_chips + total_initial;
	
							var winloss = parseFloat(total_amount - total_cash_out_chips).toLocaleString();
							
							var WinLoss = total_amount - total_cash_out_chips;
	
							var net = 0;
							if (row.COMMISSION_TYPE == 1 || row.COMMISSION_TYPE == 3) {
								net = Math.round(total_rolling_chips * (row.COMMISSION_PERCENTAGE / 100));
							} else if (row.COMMISSION_TYPE == 2) {
								net = Math.round(WinLoss * (row.COMMISSION_PERCENTAGE / 100));
							}
	
							totalInitialBuyIn += total_initial;
							totalAdditionalBuyIn += total_buy_in_chips;
							totalAmount += total_amount;
							totalRolling += total_rolling_chips;
							totalChipsReturn += total_cash_out_chips;
							totalWinLoss += parseFloat(winloss.replace(/,/g, ''));
	
							var formattedNet = net.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });	
							
							var rtp = total_rolling_chips > 0 ? WinLoss / total_rolling_chips : 0;
							var rm = total_rolling_chips / total_amount;
	
							if (row.GAME_TYPE === 'LIVE' || row.GAME_TYPE === 'TELEBET') {
								// Ensure initialization
								if (!aggregatedData[row.GAME_TYPE]) {
									aggregatedData[row.GAME_TYPE] = {
										totalAmount: 0,
										winloss: 0,
										totalRollingChips: 0,
										formattedNet: 0,
										houseShare: 0,
										houseshare :0,
										houseshareCount: 0, // Separate count for houseshare
										ngr: 0,
										rtp: 0,
										rm: 0,
										expense: 0,
										profit: 0
									};
								}
							
								// Safely parse expense and handle invalid values
								var expense = parseFloat(row.EXPENSE) || 0;
						
								var houseshare = row.HOUSE_SHARE || 0;
								// Aggregate data
								aggregatedData[row.GAME_TYPE].totalAmount += total_amount;
								aggregatedData[row.GAME_TYPE].winloss += WinLoss;
								aggregatedData[row.GAME_TYPE].totalRollingChips += total_rolling_chips;
								aggregatedData[row.GAME_TYPE].formattedNet += net;
								aggregatedData[row.GAME_TYPE].rtp += rtp;
								aggregatedData[row.GAME_TYPE].rm += rm;
								aggregatedData[row.GAME_TYPE].expense += expense;
								// aggregatedData[row.GAME_TYPE].profit += profit;
								// Handle houseshare average
								aggregatedData[row.GAME_TYPE].houseshare += houseshare;
								aggregatedData[row.GAME_TYPE].houseshareCount += 1; // Increment count for houseshare

							}
							
						},
						error: function (xhr, status, error) {
							console.error('Error fetching options:', error);
						}
					});
				});
	
				// Wait for all AJAX requests to complete
				$.when.apply($, requests).then(function() {
					// After all data has been processed, add aggregated rows to the DataTable
					for (const gameType in aggregatedData) {
						if (Object.hasOwnProperty.call(aggregatedData, gameType)) {
							const totalValues = aggregatedData[gameType];

							// Calculate the average houseshare
							let averageHouseShare = totalValues.houseshare / totalValues.houseshareCount || 0;

							// Create the button for averageHouseShare
							var averageHouseShareButton = '<button class="btn btn-link" style="font-size:13px;text-decoration: underline;" ' +
							'onclick="updateHouseShare(\'' + gameType + '\', ' + averageHouseShare + ')">' +
							averageHouseShare.toLocaleString() + '</button>';

							// Calculate houseSharePercentage using averageHouseShare
							var houseSharePercentage = parseFloat(averageHouseShare / 100); // Convert averageHouseShare to number

							// Calculate NGR using averageHouseShare
							let ngr = (totalValues.winloss * houseSharePercentage) - totalValues.formattedNet;
							let profit = ngr - totalValues.expense;

							// Update the aggregated NGR
							aggregatedData[gameType].ngr += ngr; 
			
							dataTable.row.add([
								`<a href="/${gameType.toLowerCase()}_statistic">${gameType}</a>`,
								totalValues.totalAmount.toLocaleString(),
								totalValues.winloss.toLocaleString(),
								parseFloat(totalValues.totalRollingChips).toLocaleString(),
								totalValues.formattedNet.toLocaleString(),
								averageHouseShareButton.toLocaleString(),
								Math.round(totalValues.ngr).toLocaleString(),
								`${totalValues.rtp.toFixed(2)}%`,
								totalValues.rm.toFixed(2),
								totalValues.expense.toLocaleString(),
								profit.toLocaleString()
							]).draw();
						}
					}
				});
			},
			error: function (xhr, status, error) {
				console.error('Error fetching data:', error);
			}
		});
	}
	
		reloadData();
});


$(document).ready(function () {
    // Check if DataTable is already initialized and destroy it
    if ($.fn.DataTable.isDataTable('#game_stats-tbl')) {
        $('#game_stats-tbl').DataTable().destroy();
    }

    // Initialize the DataTable
    var statsTable = $('#game_stats-tbl').DataTable({
        ajax: {
            url: '/get_stats_data', // Your new GET endpoint
            method: 'GET',
            dataSrc: function (json) {
                return json; // Return the data directly
            },
            error: function (xhr, status, error) {
                console.error('Error fetching data:', error);
            }
        },
        columns: [
            { 
                data: 'gameType', 
                render: function(data) {
					return data.toLocaleString();
                }
            },
            { 
                data: 'BUY_IN_STATS', 
                render: function(data) {
                    return data.toLocaleString();
                }
            },
            { 
                data: 'WIN_LOSS_STATS', 
                render: function(data) {
                    return data.toLocaleString();
                }
            },
            { 
                data: 'ROLLING_STATS', 
                render: function(data) {
                    return data.toLocaleString();
                }
            },
            { 
                data: 'COMMISSION_STATS', 
                render: function(data) {
                    return data.toLocaleString();
                }
            },
            { 
                data: 'HOUSE_SHARE_STATS', 
                render: function(data) {
                    return `<div class="btn-group">
                                <input type="text" class="form-control text-center house-share-input" value="${data}"/>
                            </div>`;
                }
            },
            { 
                data: 'NGR_STATS', 
                render: function(data) {
                    return Math.round(data).toLocaleString();
                }
            },
            { 
                data: 'RTP_STATS', 
                render: function(data) {
                    return `${data.toFixed(2)}%`;
                }
            },
            { 
                data: 'RM_STATS', 
                render: function(data) {
                    return data.toFixed(2);
                }
            },
            { 
                data: 'EXPENSE_STATS', 
                render: function(data) {
                    return `<div class="btn-group">
                                <input type="text" class="form-control text-center house-share-input" value="${data}"/>
                            </div>`;
                }
            },
            { 
                data: 'PROFIT_STATS', 
                render: function(data) {
                    return data.toLocaleString();
                }
            }
        ],
        paging: true,        // Tanggalin ang pagination
        searching: true,     // Tanggalin ang search
        info: false,          // Tanggalin ang info (total rows)
        columnDefs: [{
            createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
                $(cell).addClass('text-center');
            }
        }],
    });

    // Handle the form submission
    $('#add_stats').submit(function(event) {
        event.preventDefault(); // Prevent form from submitting the default way

        $.ajax({
            url: '/add_stats',
            type: 'POST',
            data: $(this).serialize(),
            success: function(response) {
                if (response.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Success',
                        text: response.message,
                        showConfirmButton: true
                    }).then(() => {
                        statsTable.ajax.reload(); // Reload the DataTable after successful insertion
                        $('#add_stats')[0].reset(); // Optionally reset the form
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Failed to insert data.',
                    });
                }
            },
            error: function() {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'An error occurred while inserting data.',
                });
            }
        });
    });
});

function updateHouseShare(gameType, averageHouseShare) { 
    $('#modal-update-houseshare').modal('show');

    // Set the averageHouseShare value to the input field
    $('#txtHouseShare').val(averageHouseShare); // Update the input with the average house share value
    $('#game_type').val(gameType); // Set the game type value
}

$('#update_house_share').on('submit', function(e) {
    e.preventDefault();  // Prevent the default form submission

    const data = {
        game_type: $('#game_type').val(),
        txtHouseShare: $('#txtHouseShare').val(),
    };

    console.log(data);  // Debugging: Check the data being sent

    $.ajax({
        url: '/update_house_share',
        type: 'PUT',
        data: data,
        success: function(response) {
			// Replace alert with SweetAlert2
            Swal.fire({
                title: 'Success!',
                text: response.message,
                icon: 'success',
                confirmButtonText: 'OK'
            }).then((result) => {
                if (result.isConfirmed) {
					$('#modal-update-houseshare').modal('hide');
					 // If you prefer a full page reload:
                     location.reload(); // Uncomment this if you want to reload the entire page
                }
            });
        },
        error: function(xhr) {
            console.error('Failed to update expense:', xhr.responseText);
            // Use SweetAlert2 for error messages too
            Swal.fire({
                title: 'Error!',
                text: 'Failed to update expense: ' + xhr.responseText,
                icon: 'error',
                confirmButtonText: 'OK'
            });
        }
    });
});

