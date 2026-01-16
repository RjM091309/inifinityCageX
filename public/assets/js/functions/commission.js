$(document).ready(function() {

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

    // Destroy existing DataTable if already initialized
    if ($.fn.DataTable.isDataTable('#commission-tbl')) {
        $('#commission-tbl').DataTable().destroy();
    }

    // Initialize DataTable
    var dataTable = $('#commission-tbl').DataTable({
    "order": [[10, 'desc']], // Set column 10 to be sorted in descending order
    "columnDefs": [
      {
        "targets": 10, // Column index for the ENCODED_DT
        "render": function (data, type, row) {
          // For sorting, return the raw date data
          if (type === 'sort') {
            return moment.utc(data, 'MMMM DD, YYYY HH:mm:ss').format('YYYY-MM-DD HH:mm:ss'); // Raw date for sorting
          }

          // Determine if the date is already in UTC
          const dateMoment = moment(data, 'MMMM DD, YYYY HH:mm:ss'); // Parse with format specification

          if (dateMoment.isValid()) {
            // For display, convert to local time and return the formatted date
            return dateMoment.local().format('DD MMM, YYYY HH:mm:ss');
          } else {
            // If the date is invalid, return an error message or a placeholder
            return window.commissionTranslations?.invalid_date || 'Invalid Date';
          }
        },
        
        "createdCell": function (cell, cellData, rowData, rowIndex, colIndex) {
          $(cell).addClass('text-center');
        }
      }
    ],
    "language": {
        "search": (window.commissionTranslations?.search || "Search:"),
        "info": (window.commissionTranslations?.showing_entries || "Showing _START_ to _END_ of _TOTAL_ entries"),
        "paginate": {
            "previous": (window.commissionTranslations?.previous || "Previous"),
            "next": (window.commissionTranslations?.next || "Next")
        },
        "emptyTable": (window.commissionTranslations?.no_data_found || "No data available in table")
    },
});


    function reloadData() {

        const dateRange = $('#daterange').val();

        if (!dateRange) {
            alert(window.commissionTranslations?.please_select_date_range || 'Please select a date range.');
            return;
        }

        const [start, end] = dateRange.split(' to ');

        $.ajax({
            url: '/commission_data', // Endpoint to fetch commission data
            method: 'GET',
            data: { start, end },
            success: function(data) {
                dataTable.clear(); // Clear existing table rows

                var ajaxCalls = [];
                var totalInitialBuyIn = 0;
                var totalAdditionalBuyIn = 0;
                var totalAmount = 0;
                var totalRolling = 0;
                var totalChipsReturn = 0;
                var totalWinLoss = 0;

                var totalRollingSettlement = 0;
                var totalFNB = 0;
                var totalPayment = 0;
               // let CommissionType = data[0].COMMISSION_TYPE; 

                data.forEach(function(row) {
                    // Only process records that are settled
                    if (row.SETTLED === 1) {
                        var RollingRate = row.COMMISSION_PERCENTAGE; // Ensure the RollingRate is correct
                        var fb = row.fnb || 0; // Use the FNB value from the row
                        var payment = row.payment || 0; // Use the PAYMENT value from the row

                        ajaxCalls.push(
                            $.ajax({
                                url: '/game_list/' + row.game_list_id + '/record',
                                method: 'GET',
                                success: function(response) {
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

                                    // Loop through the response and calculate totals
                                    response.forEach(function(res) {
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

                                    // Calculate the net commission
                                   // var netValue = total_rolling_chips * (RollingRate / 100); // Calculate the net value
                                  //  var net = netValue.toLocaleString(); // Format net value
                                    var winlossValue = total_amount - total_cash_out_chips; // Calculate win/loss
                                    var winloss = winlossValue.toLocaleString(); // Format win/loss

                                  //  var WinLoss = total_amount - total_cash_out_chips;
							
							        var net;
							
								if (row.COMMISSION_TYPE == 1 || row.COMMISSION_TYPE == 3) {
									// Kung ang COMMISSION_TYPE ay 1, ang net ay computed gamit ang total rolling chips
									net = (total_rolling_chips * (RollingRate / 100));
								} else if (row.COMMISSION_TYPE == 2) {
									// Kung ang COMMISSION_TYPE ay 2, ang net ay computed gamit ang winloss
									net = (winlossValue * (RollingRate / 100));
								}

                                    // Payment calculation based on RollingSettlement and fb
                                    var RollingSettlement = total_rolling_chips * (RollingRate / 100);
                                    var paymentValue = net - fb;


                                    // Add to grand totals
                                    totalInitialBuyIn += total_initial;
                                    totalAdditionalBuyIn += total_buy_in_chips;
                                    totalAmount += total_amount;
                                    totalRolling += total_rolling_chips;
                                    totalChipsReturn += total_cash_out_chips;
                                    totalWinLoss += winlossValue; // Ensure unformatted value for calculation
                                    totalRollingSettlement += net;
                                    totalFNB += fb;
                                    totalPayment += paymentValue;
                                    
                                    
                         var formattedDate = moment.utc(row.GAME_ENDED).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
                                    // Add row to table with total_amount in a separate column
                                    dataTable.row.add([
                                        row.game_list_id,
                                        `${row.agent_code} - ${row.agent_name}`,
                                        total_amount.toLocaleString(),
                                        total_cash_out_chips.toLocaleString(),
                                        winloss.toLocaleString(),
                                        parseFloat(total_rolling_chips).toLocaleString(),
                                        `${row.COMMISSION_PERCENTAGE}%`,
                                        net.toLocaleString(),
                                        fb.toLocaleString(),
                                        paymentValue.toLocaleString(),
                                        formattedDate
                                    ]).draw();
                                },
                                error: function(xhr, status, error) {
                                    console.error('Error fetching options:', error);
                                }
                            })
                        );
                    }
                });

               
            },
            error: function(xhr, status, error) {
                console.error('Error fetching data:', error);
            }
        });
    }

    reloadData();

    $('#daterange').on('change', function () {
        reloadData();
    });
});