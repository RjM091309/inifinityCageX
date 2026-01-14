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
					LIVE: { totalAmount: 0, winloss: 0, totalRollingChips: 0, formattedNet: 0, houseShare: 0, ngr: 0, rtp: 0, rm: 0, expense: 0, profit: 0 },
					TELEBET: { totalAmount: 0, winloss: 0, totalRollingChips: 0, formattedNet: 0, houseShare: 0, ngr: 0, rtp: 0, rm: 0, expense: 0, profit: 0 }
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
	
							var houseShareValue = localStorage.getItem('houseShare_' + row.GAME_TYPE) || '60';
	
							var houseShare = `<div class="btn-group">
								<input type="text" class="form-control text-center house-share-input" data-rowindex="${rowIndex}" value="${houseShareValue}"/>
							</div>`;
	
							var houseSharePercentage = parseFloat(houseShareValue / 100); // Convert houseShare to number
	
							// Calculate NGR: (winloss * (houseShare / 100)) - formattedNet
							var ngr = (WinLoss * houseSharePercentage) - net;

						  
							var rtp = total_rolling_chips > 0 ? WinLoss / total_rolling_chips : 0;
						

							var rm = total_rolling_chips / total_amount;

							// // Convert back to string with specific formatting
							// 	rtp = rtp % 1 === 0 ? rtp.toString() : rtp.toFixed(2);
							// 	rm = rm % 1 === 0 ? rm.toString() : rm.toFixed(2);

							// var expense = parseFloat(row.EXPENSE);

							// var profit = ngr - expense;
	
							if (row.GAME_TYPE === 'LIVE' || row.GAME_TYPE === 'TELEBET') {
								// Ensure initialization
								if (!aggregatedData[row.GAME_TYPE]) {
									aggregatedData[row.GAME_TYPE] = {
										totalAmount: 0,
										winloss: 0,
										totalRollingChips: 0,
										formattedNet: 0,
										houseShare: 0,
										ngr: 0,
										rtp: 0,
										rm: 0,
										expense: 0,
										profit: 0
									};
								}
							
							
								// Safely parse expense and handle invalid values
								var expense = parseFloat(row.EXPENSE) || 0;
								var profit = ngr - expense;
							
								// Aggregate data
								aggregatedData[row.GAME_TYPE].totalAmount += total_amount;
								aggregatedData[row.GAME_TYPE].winloss += WinLoss;
								aggregatedData[row.GAME_TYPE].totalRollingChips += total_rolling_chips;
								aggregatedData[row.GAME_TYPE].formattedNet += net;
								aggregatedData[row.GAME_TYPE].houseShare = houseShareValue;
								aggregatedData[row.GAME_TYPE].ngr += ngr;
								aggregatedData[row.GAME_TYPE].rtp += rtp;
								aggregatedData[row.GAME_TYPE].rm += rm;
								aggregatedData[row.GAME_TYPE].expense += expense;
								aggregatedData[row.GAME_TYPE].profit += profit;
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
													
							dataTable.row.add([
								`<a href="/${gameType.toLowerCase()}_statistic">${gameType}</a>`,
								totalValues.totalAmount.toLocaleString(),
								totalValues.winloss.toLocaleString(),
								parseFloat(totalValues.totalRollingChips).toLocaleString(),
								totalValues.formattedNet.toLocaleString(),
								`<div class="btn-group">
									<input type="text" class="form-control text-center house-share-input" value="${(totalValues.houseShare)}"/>
								</div>`,
								Math.round(totalValues.ngr).toLocaleString(),
								`${totalValues.rtp.toFixed(2)}%`,
								totalValues.rm.toFixed(2),
								totalValues.expense.toLocaleString(),
								totalValues.profit.toLocaleString()
							]).draw();
						}
					}
					
					calculateTotalNGR();
				});
			},
			error: function (xhr, status, error) {
				console.error('Error fetching data:', error);
			}
		});
	}
	
	// START Event listener for houseShare input change
	$('#game_statistic-tbl').on('change', '.house-share-input', function () {
		var rowIndex = $(this).data('rowindex');
		var newValue = $(this).val();
		var gameType = $(this).closest('tr').find('td:first').text();

		// Store the value in local storage using gameType as the key
		localStorage.setItem('houseShare_' + gameType, newValue);

		// Recalculate NGR
		var rowData = dataTable.row(rowIndex).data();
		var houseSharePercentage = parseFloat(newValue) / 100; // Convert new houseShare to number
		var winLoss = parseFloat(rowData[2].replace(/,/g, '')); // Get winloss value from row
		var net = parseFloat(rowData[4].replace(/,/g, '')); // Get formatted net value from row
		var ngr = (winLoss * houseSharePercentage) - net; // Recalculate NGR

		// Update the NGR column in the DataTable
		dataTable.cell(rowIndex, 6).data(parseFloat(ngr).toLocaleString()).draw(); // Assuming NGR is in the 6th column

		calculateTotalNGR();
		
	});
	//END

	window.globalTotalNgr = 0; // Set as a property on window object

	function calculateTotalNGR() {
		let totalNGR = 0;
	
		dataTable.rows().every(function (rowIdx, tableLoop, rowLoop) {
			var rowData = this.data();
			totalNGR += parseFloat(rowData[6].replace(/,/g, '')) || 0; // Assuming NGR is in the 6th column
		});
	
		window.globalTotalNgr = totalNGR; // Store it globally
		localStorage.setItem('globalTotalNgr', totalNGR); // Store in localStorage
	
		console.log("Total NGR calculated:", totalNGR); // Debug log
	
		$('#total-ngr-value').text(totalNGR.toLocaleString());
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

