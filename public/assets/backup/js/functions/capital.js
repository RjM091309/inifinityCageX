function reloadData() {

   
    // Get the date range value from Flatpickr
    const dateRange = $('#daterange').val();

    // Validate if a date range is present
    if (!dateRange) {
        console.error('Date range is required.');
        alert('Please select a date range.');
  
        return;
    }

    // Split the date range into start_date and end_date
    const [startDate, endDate] = dateRange.split(" to ");
    $('#modal-new-capital .loading-overlay').show();
    $('#modal-new-capital .progress-bar').css('width', '0%');

     // Simulate progress (useful if you can't track real progress)
     let progress = 0;
    const interval = setInterval(() => {
        if (progress < 90) {
            progress += 5; // Increment progress smoothly
            $('#modal-new-capital .progress-bar').css('width', `${progress}%`);
        } else {
            clearInterval(interval); // Stop at 90% and let AJAX complete control
        }
    }, 100); // Adjust interval time for smoother effect (100ms = smoother)
   
    $.ajax({
        url: `/junket_capital_data?start_date=${startDate}&end_date=${endDate}&` + new Date().getTime(), // Prevent caching
        method: 'GET',
        success: function (data) {
            
            var dataTable = $('#capital-tbl').DataTable(); // Ensure you have the DataTable reference
            dataTable.clear();
            var total_in = 0;
            var total_out = 0;

            data.forEach(function (row) {
                total_in += row.capital_amount || 0; // Ensure AMOUNT is handled even if null
                var combinedDescription = [];
                var combinedChipsText = ''; // Declare combinedChipsText here

                // Ensure FULLNAME is not null, default to 'N/A' if it is
                var fullName = row.ENCODED_BY_NAME !== null ? row.ENCODED_BY_NAME : 'N/A';

                // Check TRANSACTION_ID to assign the appropriate label with spans
                if (row.TRANSACTION_ID === 5) {
                    combinedDescription.push(`<span class="css-violet">Commission</span> ${row.comms_description || ''}`);
                } else if (row.TRANSACTION_ID === 11) {
                    combinedDescription.push(`<span class="css-violet">Credit Payment</span> ${row.comms_description || ''}`);
                }

                // Add capital description logic
                if (row.capital_description) {
                    if (row.capital_description == 1) {
                        combinedDescription.push(`<span class="css-blue1">PURCHASE OF BUSINESS SUPPLIES</span>`);
                    } else if (row.capital_description == 2) {
                        combinedDescription.push(`<span class="css-blue1">Hotel</span>`);
                    } else if (row.capital_description == 3) {
                        combinedDescription.push(`<span class="css-blue1">Guest</span>`);
                    } else if (row.capital_description == 4) {
                        combinedDescription.push(`<span class="css-blue1">FnB</span>`);
                    } else if (row.capital_description == 5) {
                        combinedDescription.push(`<span class="css-blue1">Car</span>`);
                    } else if (row.capital_description == 6) {
                        combinedDescription.push(`<span class="css-blue1">Employee</span>`);
                    } else if (row.capital_description == 7) {
                        combinedDescription.push(`<span class="css-blue1">Etc</span>`);
                    } else {
                        combinedDescription.push(row.capital_description);
                    }
                }

                // Check for TRANSACTION_ID to add CASH and DEPOSIT descriptions
                if (row.TRANSACTION_ID == 1 && row.CAGE_TYPE == 1) {
                    combinedDescription.push(`<span class="css-violet">CASH</span>`); // Badge for CASH
                } else if (row.TRANSACTION_ID == 2 && row.CAGE_TYPE == 1) {
                    combinedDescription.push(`<span class="css-violet">DEPOSIT</span>`); // Badge for DEPOSIT
                }

                if (row.chips_description) {
                    combinedDescription.push(row.chips_description);
                }

                // Join the descriptions with a separator
                combinedDescription = combinedDescription.filter(Boolean).join(' | ');

                const permissions = parseInt($('#user-role').data('permissions'));
                if (permissions !== 2) {
                    btn = `<button type="button" onclick="archive_capital(${row.IDNo})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
                                    data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
                                    <i class="fa fa-trash-alt"></i>
                              </button>`;
                } else {
                    btn = `<button type="button" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled" disabled
                                    data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
                                    <i class="fa fa-trash-alt"></i>
                              </button>`;
                }

                var formattedDate = moment.utc(row.ENCODED_DT).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');

                // Prepare REMARKS with GAME_ID if applicable
                var remarks = row.REMARKS || '';
                if ((row.TRANSACTION_ID == 1 || row.TRANSACTION_ID == 2) && row.GAME_ID) {
                    remarks += ` GAME-${row.GAME_ID}`;
                }

                // Check NN_CHIPS, PAYMENT, IOU, or AMOUNT with labels for combinedChipsText
                var nnChips = row.NN_CHIPS !== null ? row.NN_CHIPS : 0;
                var comms = row.TRANSACTION_ID === 5 ? (row.ledger_amount !== null ? row.ledger_amount : 0) : 0; // Payment for TRANSACTION_ID 5
                var IOU = row.TRANSACTION_ID === 11 ? (row.ledger_amount !== null ? row.ledger_amount : 0) : 0;  // Cash IOU for TRANSACTION_ID 11
                var cbal = row.capital_amount !== null ? row.capital_amount : 0; // Cash Balance

                // Determine which value to display in combinedChipsText with labels
                if (nnChips > 0 && row.capital_description == '<span class="css-red">Chips Buy-in</span>') { // Show NN-Chips if it's greater than 0
                    combinedChipsText = `NN-Chips : <span style="color: red;">-${parseFloat(nnChips).toLocaleString()}</span>`; // Red font for NN-Chips
                } else if (nnChips > 0) { // Show NN-Chips if it's greater than 0
                    combinedChipsText = `NN-Chips : <span style="color: red;">-${parseFloat(nnChips).toLocaleString()}</span>`; // Red font for NN-Chips
                } else if (comms > 0) { // Show PAYMENT if it's greater than 0
                    combinedChipsText = `Cash Out :<span style="color: red;">-${parseFloat(comms).toLocaleString()}</span>`;
                } else if (IOU > 0) { // Show IOU only if it's greater than 0
                    combinedChipsText = `Credit Cash :\n${IOU.toLocaleString()}`;
                } else if (row.CATEGORY_ID > 0 && cbal > 0) { // Show junket Expense if CATEGORY_ID is greater than 0
                    combinedChipsText = `Junket Expense :<span style="color: red;">-${parseFloat(cbal).toLocaleString()}</span>`;
                } else if (cbal > 0 && row.capital_description == '<span class="css-blue">Cash-in</span>') {
                    combinedChipsText = `Cash Balance :\n<span style="color: green;">+${parseFloat(cbal).toLocaleString()}</span>`;
                } else if (cbal > 0 && row.capital_description == '<span class="css-blue">Cash-out</span>') {
                    combinedChipsText = `Cash Balance :\n<span style="color: red;">-${parseFloat(cbal).toLocaleString()}</span>`;
                } else {
                    combinedChipsText = ''; // Empty string if no valid data to display
                }

                // Add row to DataTable only if combinedChipsText is not empty
                if (combinedChipsText) {
                    dataTable.row.add([
                        `${fullName}`,
                        `${combinedChipsText}`,
                        combinedDescription,
                        remarks,  // Use the updated REMARKS with GAME_ID
                        formattedDate,
                        btn
                    ]).draw();
                }
            });

            $('.total_balance').text('P' + (total_in - total_out).toLocaleString());
        },
        error: function (xhr, status, error) {
            console.error('Error fetching data:', error);
            // Add more robust error handling here
        },
        complete: function () {
            // Ensure progress reaches 100% before hiding the overlay
            clearInterval(interval); // Clear simulated progress interval
            $('#modal-new-capital .progress-bar').css('width', '100%'); // Jump to 100%
            setTimeout(() => {
                $('#modal-new-capital .loading-overlay').fadeOut();
            }, 300); // Short delay for user to notice 100% before hiding
        }
       
    });
}

$(document).ready(function () {
        // Calculate the start and end dates for this month
        const startOfMonth = moment().startOf('month').format('YYYY-MM-DD'); // Start of the current month
        const currentDate = moment().format('YYYY-MM-DD'); // Current date
    // Initialize Flatpickr for Date Range
    flatpickr("#daterange", {
        mode: "range", // Enable range mode
        altInput: true, // Show a user-friendly date format in the input
        altFormat: "M d, Y", // User-friendly format: e.g., Jan 01, 2025
        dateFormat: "Y-m-d", // Format used in the backend: YYYY-MM-DD
        defaultDate: [startOfMonth, currentDate], // Default range: start of the current month to today
        showMonths: 2, // Display two months side-by-side
        onReady: function (selectedDates, dateStr, instance) {
            // Automatically navigate the calendar to show previous and current month side by side
            const today = new Date();
            instance.changeMonth(-1, true); // Go to the previous month programmatically
        },
    });
    // Ensure DataTable remains initialized with the required configuration
    if ($.fn.DataTable.isDataTable('#capital-tbl')) {
        $('#capital-tbl').DataTable().destroy();
    }

    $('#capital-tbl').DataTable({
        "order": [[4, 'desc']], // Sort by the date column (index 4)
        "columnDefs": [
            {
                "targets": 4, // Column index for the ENCODED_DT
                "render": function (data, type, row) {
                    if (type === 'sort') {
                        return moment.utc(data, 'MMMM DD, YYYY HH:mm:ss').format('YYYY-MM-DD HH:mm:ss'); // Raw date for sorting
                    }
                    const dateMoment = moment(data, 'MMMM DD, YYYY HH:mm:ss');
                    if (dateMoment.isValid()) {
                        return dateMoment.local().format('DD MMM, YYYY HH:mm:ss'); // Display formatted date
                    } else {
                        return 'Invalid Date';
                    }
                },
                "createdCell": function (cell, cellData, rowData, rowIndex, colIndex) {
                    $(cell).addClass('text-center');
                }
            }
        ]
    });

    // Add event listener to trigger reloadData on date range change
    $('#daterange').on('change', function () {
        reloadData();
    });

    // Initial data load
    reloadData();
});


// Archive capital function
function archive_capital(id) {
    console.log(`Attempting to deleted capital and total chips with ID: ${id}`); // Log ID

    Swal.fire({
        title: 'Are you sure you want to deleted this?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: `/junket_capital/remove/${id}`, // Backend route handling both updates
                type: 'PUT',
                success: function (response) {
                    console.log('Success response:', response);
                    Swal.fire('Deleted Successfully', '', 'success').then(() => {
                        // Redirect to the dashboard and force a page reload
                        window.location.href = '/dashboard'; // Redirect to the dashboard
                    });
                },
                error: function (xhr, status, error) {
                    console.error('AJAX Error:', xhr.responseText);
                    Swal.fire('Error!', 'There was an error deleted the capital and total chips.', 'error');
                }
            });
        }
    });
}

function addCapital() {
    $('#modal-new-capital').modal('show');
    $('#txtTrans').val('');
    $('#txtCategory').val('');
    $('#txtDescription').val('');
    $('#txtAmount').val('');
    $('#Remarks').val('');
    transaction_type();
    capital_category();
}

function edit_capital(capital_id, fullname, amount, remarks) {
    $('#modal-edit-capital').modal('show');
    $('#id').val(capital_id);
    $('#txtFullname').val(fullname);
    $('#txtAmount').val(amount);
    $('#Remarks').val(remarks);
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

function capital_category() {
    $.ajax({
        url: '/capital_category_data',
        method: 'GET',
        success: function (response) {
            var selectOptions = $('#txtCategory');
            selectOptions.empty();
            selectOptions.append($('<option>', {
                value: '',
                text: '--SELECT CAPITAL CATEGORY--'
            }));
            response.forEach(function (option) {
                selectOptions.append($('<option>', {
                    value: option.IDNo,
                    text: option.CATEGORY
                }));
            });
        },
        error: function (xhr, status, error) {
            console.error('Error fetching options:', error);
        }
    });
}
