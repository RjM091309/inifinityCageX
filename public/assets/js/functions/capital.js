function reloadData() {
    // Kunin ang value ng date range mula sa Flatpickr
    const dateRange = $('#main-daterange').val();

    if (!dateRange) {
        alert('Please select a date range.');
        return;
    }

    // Kung walang " to ", ibig sabihin iisang petsa lang ang napili
    let startDate, endDate;
    if (dateRange.indexOf(" to ") > -1) {
        [startDate, endDate] = dateRange.split(" to ");
    } else {
        // Kung walang end date, gagamitin natin ang start date para sa parehong filter
        startDate = dateRange;
        endDate = dateRange;
    }

    // Ipakita ang loading overlay at simulate progress...
    $('#modal-new-capital .loading-overlay').show();
    $('#modal-new-capital .progress-bar').css('width', '0%');

    let progress = 0;
    const interval = setInterval(() => {
        if (progress < 90) {
            progress += 5;
            $('#modal-new-capital .progress-bar').css('width', `${progress}%`);
        } else {
            clearInterval(interval);
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
                    combinedDescription.push(`<span class="css-violet">IOU Payment</span> ${row.comms_description || ''}`);
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
                     const gameId = row.GAME_ID;
                     remarks += ` <a href="/game_list?id=${gameId}"  title="Go to Game" target="_blank">Game-${gameId}</a>`;
                 }

                // Check NN_CHIPS, PAYMENT, IOU, or AMOUNT with labels for combinedChipsText
                var nnChips = row.NN_CHIPS !== null ? row.NN_CHIPS : 0;
                var comms = row.TRANSACTION_ID === 5 ? (row.ledger_amount !== null ? row.ledger_amount : 0) : 0; // Payment for TRANSACTION_ID 5
                var IOU = row.TRANSACTION_ID === 11 ? (row.ledger_amount !== null ? row.ledger_amount : 0) : 0;  // Cash IOU for TRANSACTION_ID 11
                var cbal = row.capital_amount !== null ? row.capital_amount : 0; // Cash Balance

                // Determine which value to display in combinedChipsText with labels
                if (nnChips > 0 && row.capital_description == '<span class="css-red">Chips Buy-in</span>') { // Show NN-Chips if it's greater than 0
                    combinedChipsText = `NN-Chips : <span style="color: red;">-${parseFloat(nnChips).toLocaleString()}</span>`; // Red font for NN-Chips
                } 
                else if (nnChips > 0 && row.capital_description == '<span class="css-red">Chips Return</span>') { // Show NN-Chips if it's greater than 0
                    combinedChipsText = `NN-Chips : <span style="color: green;">+${parseFloat(nnChips).toLocaleString()}</span>`; // Red font for NN-Chips
                }else if (nnChips > 0) { // Show NN-Chips if it's greater than 0
                    combinedChipsText = `NN-Chips : <span style="color: red;">-${parseFloat(nnChips).toLocaleString()}</span>`; // Red font for NN-Chips
                } else if (comms > 0) { // Show PAYMENT if it's greater than 0
                    combinedChipsText = `Cash Out :<span style="color: red;">-${parseFloat(comms).toLocaleString()}</span>`;
                } else if (IOU > 0) { // Show IOU only if it's greater than 0
                    combinedChipsText = `IOU Cash :\n${IOU.toLocaleString()}`;
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
    flatpickr("#main-daterange", {
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
    $('#main-daterange').on('change', function () {
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

function computeTotalCashIn() {
    // Use current month as the default date range
    const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
    const currentDate  = moment().format('YYYY-MM-DD');

    $.ajax({
        url: `/junket_capital_data?start_date=${startOfMonth}&end_date=${currentDate}&` + new Date().getTime(),
        type: "GET",
        success: function (data) {
            let totalCashIn = 0;
            
            data.forEach(row => {
                // CASH-IN: TRANSACTION_ID must equal 1 and capital_description must be exactly "<span class="css-blue">Cash-in</span>"
                const isCashIn = row.TRANSACTION_ID == 1 && row.capital_description === '<span class="css-blue">Cash-in</span>';
                
                if (isCashIn) {
                    totalCashIn += parseFloat(row.capital_amount || 0);
                }
            });
            
            $('#cash-in-total').text(`₱${totalCashIn.toLocaleString()}`);
            console.log('Updated total cash-in:', totalCashIn);
        },
        error: function(xhr, status, error) {
            console.error('Error fetching total cash:', error);
            $('#cash-in-total').text('₱0');
        }
    });
}



/**
 * Function para sa pag-load ng DataTable ng mga cash transactions.
 * Dito lang nakatuon ang pag-filter at pag-display ng mga transaction sa table.
 */
function loadCashInData() {
    const dateRange = $('#daterange').val();
    console.log('Date Range:', dateRange);

    if (!dateRange) {
        alert('Please select a date range.');
        return;
    }

    let startDate, endDate;
    if (dateRange.indexOf(" to ") > -1) {
        [startDate, endDate] = dateRange.split(" to ");
    } else {
        startDate = dateRange;
        endDate = dateRange;
    }
    console.log('Start Date:', startDate, 'End Date:', endDate);

    // I-destroy ang DataTable kung ito ay naka-instantiate na
    if ($.fn.DataTable.isDataTable('#cash-in-tbl')) {
        $('#cash-in-tbl').DataTable().destroy();
    }

    $('#cash-in-tbl').DataTable({
        "processing": true,
        "serverSide": false,
        "order": [[4, 'desc']],
       "ajax": {
        "url": `/junket_capital_data?start_date=${startDate}&end_date=${endDate}&` + new Date().getTime(),
        "type": "GET",
        "dataSrc": function(json) {
            console.log('Raw Data:', json);

            if (!Array.isArray(json)) {
                console.error('Expected array but got:', json);
                return [];
            }
            
            // Filter only rows that are Cash-In transactions
            const filteredData = json.filter(row => {
                const isCashIn = row.TRANSACTION_ID == 1 && row.capital_description === '<span class="css-blue">Cash-in</span>';
                return isCashIn;
            }).map(function(row) {
                // Since we only expect Cash-In transactions, we can directly set the type and amount
                const isCashIn = row.TRANSACTION_ID == 1 && row.capital_description === '<span class="css-blue">Cash-in</span>';
                
                let amount = parseFloat(row.capital_amount || 0).toLocaleString();
                let type   = '<span class="css-blue">CASH-IN</span>';

                return [
                    row.ENCODED_BY_NAME || 'N/A',
                    amount,
                    type,
                    row.REMARKS ? row.REMARKS + (row.GAME_ID ? ` GAME-${row.GAME_ID}` : '') : '',
                    moment.utc(row.ENCODED_DT).utcOffset(8).format('DD MMM, YYYY HH:mm:ss'),
                    getActionButton(row.IDNo)
                ];
            });

            console.log('Filtered Data:', filteredData);
            return filteredData;
        }
    },
        "columns": [
            { "className": "text-center" },
            { "className": "text-end" },
            { "className": "text-center" },
            { "className": "text-center" },
            { "className": "text-center" },
            { "className": "text-center", "orderable": false }
        ],
        "responsive": true,
        "language": {
            "emptyTable": "No cash transactions found",
            "processing": "Loading cash transactions..."
        },
        "drawCallback": function(settings) {
            $('[data-bs-toggle="tooltip"]').tooltip();
        }
    });
}

function chipsTransactionComputation() {
    // Use current month as the default date range
    const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
    const currentDate  = moment().format('YYYY-MM-DD');

    $.ajax({
        url: `/junket_capital_data?start_date=${startOfMonth}&end_date=${currentDate}&` + new Date().getTime(),
        type: "GET",
        success: function (data) {
            let totalChipsBuyIn  = 0;
            let totalChipsReturn = 0;
            
            data.forEach(row => {
                // Chips Buy-in: TRANSACTION_ID must equal 1 and capital_description must exactly match "<span class="css-red">Chips Buy-in</span>"
                const isChipsBuyIn = row.TRANSACTION_ID == 1 && row.capital_description === '<span class="css-red">Chips Buy-in</span>';
                // Chips Return: TRANSACTION_ID must equal 2 and capital_description must exactly match "<span class="css-red">Chips Return</span>"
                const isChipsReturn = row.TRANSACTION_ID == 2 && row.capital_description === '<span class="css-red">Chips Return</span>';
                
                // Use row.NN_CHIPS exclusively.
                if (isChipsBuyIn) {
                    totalChipsBuyIn += parseFloat(row.NN_CHIPS || 0);
                }
                if (isChipsReturn) {
                    totalChipsReturn += parseFloat(row.NN_CHIPS || 0);
                }
            });
            
            // Net chips = totalChipsBuyIn - totalChipsReturn
            const netChips = totalChipsBuyIn - totalChipsReturn;
            $('#chips-transaction-total').text(`₱${netChips.toLocaleString()}`);
            console.log('Updated net chips (Buy-in minus Return):', netChips);
        },
        error: function(xhr, status, error) {
            console.error('Error fetching chips transaction total:', error);
            $('#chips-transaction-total').text('₱0');
        }
    });
}


// CHIPS TRANSACTION START
function loadChipsTransaction() {
    const dateRange = $('#transaction-daterange').val();
    console.log('Date Range:', dateRange);

    if (!dateRange) {
        alert('Please select a date range.');
        return;
    }

    let startDate, endDate;
    if (dateRange.indexOf(" to ") > -1) {
        [startDate, endDate] = dateRange.split(" to ");
    } else {
        startDate = dateRange;
        endDate = dateRange;
    }
    console.log('Start Date:', startDate, 'End Date:', endDate);

    // Destroy existing DataTable instance if it exists.
    if ($.fn.DataTable.isDataTable('#chips_transaction-tbl')) {
        $('#chips_transaction-tbl').DataTable().destroy();
    }

    // Initialize DataTable on the chips transaction table.
    $('#chips_transaction-tbl').DataTable({
        processing: true,
        serverSide: false, // Adjust if server-side processing is needed.
        ajax: {
            url: `/junket_capital_data?start_date=${startDate}&end_date=${endDate}&` + new Date().getTime(),
            type: "GET",
            dataSrc: function(json) {
                console.log('Raw Chips Data:', json);
                
                // Ensure the data is an array.
                if (!Array.isArray(json)) {
                    console.error('Expected array but got:', json);
                    return [];
                }
                
                // Filter for Chips Buy-in or Chips Return and only those with NN_CHIPS > 0.
                const filteredData = json.filter(row => {
                    const chipsBuyIn = row.TRANSACTION_ID == 1 &&
                        row.capital_description === '<span class="css-red">Chips Buy-in</span>';
                    const chipsReturn = row.TRANSACTION_ID == 2 &&
                        row.capital_description === '<span class="css-red">Chips Return</span>';
                    
                    // Use only NN_CHIPS value. Exclude if NN_CHIPS is not greater than 0.
                    const nnChips = parseFloat(row.NN_CHIPS) || 0;
                    return (chipsBuyIn || chipsReturn) && nnChips > 0;
                }).map(function(row) {
                    const isChipsBuyIn = row.TRANSACTION_ID == 1 &&
                        row.capital_description === '<span class="css-red">Chips Buy-in</span>';

                    // Use NN_CHIPS exclusively.
                    const nnChips = parseFloat(row.NN_CHIPS) || 0;
                    const amount = nnChips.toLocaleString();
                    const type = isChipsBuyIn
                        ? '<span class="css-red">Chips Buy-in</span>'
                        : '<span class="css-blue">Chips Return</span>';

                    return [
                        row.ENCODED_BY_NAME || 'N/A',
                        amount,
                        type,
                        row.REMARKS ? row.REMARKS + (row.GAME_ID ? ` GAME-${row.GAME_ID}` : '') : '',
                        moment.utc(row.ENCODED_DT).utcOffset(8).format('DD MMM, YYYY HH:mm:ss'),
                        getActionButton(row.IDNo)
                    ];
                });

                console.log('Filtered Chips Data:', filteredData);
                return filteredData;
            }
        },
        columns: [
            { title: "Encoded By" },
            { title: "Amount" },
            { title: "Type" },
            { title: "Remarks" },
            { title: "Date" },
            { title: "Action" }
        ]
    });
}


$(document).ready(function() {
    $('#modal-Transaction').on('shown.bs.modal', function () {
        console.log('Modal shown'); // Debug log
        
        // Set default dates using moment.js
        const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
        const currentDate  = moment().format('YYYY-MM-DD');
        
        // Check if the transaction-daterange element exists
        if ($('#transaction-daterange').length > 0) {
            // Initialize Flatpickr for the transaction-daterange input
            const picker = flatpickr("#transaction-daterange", {
                mode: "range",
                altInput: true,
                altFormat: "M d, Y",
                dateFormat: "Y-m-d",
                defaultDate: [startOfMonth, currentDate],
                showMonths: 2,
                onChange: function(selectedDates, dateStr) {
                    console.log('Date changed:', dateStr); // Debug log
                    if (selectedDates.length === 2) {
                        loadChipsTransaction();
                    }
                }
            });
            
            // Initial load of chips transaction data
            loadChipsTransaction();
        } else {
            console.error('transaction-daterange element not found'); // Debug log
        }
    });
});
// CHIPS TRANSACTION END


// Update the modal initialization
$(document).ready(function() {
    $('#modal-Cash-In').on('shown.bs.modal', function () {
        console.log('Modal shown'); // Debug log
        
        // Initialize Flatpickr
        const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
        const currentDate = moment().format('YYYY-MM-DD');
        
        if ($('#daterange').length > 0) {
            const picker = flatpickr("#daterange", {
                mode: "range",
                altInput: true,
                altFormat: "M d, Y",
                dateFormat: "Y-m-d",
                defaultDate: [startOfMonth, currentDate],
                showMonths: 2,
                onChange: function(selectedDates, dateStr) {
                    console.log('Date changed:', dateStr); // Debug log
                    if (selectedDates.length === 2) {
                        loadCashInData();
                    }
                }
            });
            
            // Initial load of data
            loadCashInData();
        } else {
            console.error('daterange element not found'); // Debug log
        }
    });
});


function loadJunketExpenseData() {
    const dateRange = $('#junket-daterange').val();
    console.log('Junket Expense Date Range:', dateRange);

    if (!dateRange) {
        alert('Please select a date range.');
        return;
    }

    let startDate, endDate;
    if (dateRange.indexOf(" to ") > -1) {
        [startDate, endDate] = dateRange.split(" to ");
    } else {
        startDate = dateRange;
        endDate = dateRange;
    }
    console.log('Junket Expense Start Date:', startDate, 'End Date:', endDate);

    // Show loading state
    if ($.fn.DataTable.isDataTable('#junket-expense-tbl')) {
        $('#junket-expense-tbl').DataTable().destroy();
    }

    $('#junket-expense-tbl').DataTable({
        "processing": true,
        "serverSide": false,
        "order": [[4, 'desc']],
        "ajax": {
            "url": `/junket_capital_data?start_date=${startDate}&end_date=${endDate}&` + new Date().getTime(),
            "type": "GET",
            "dataSrc": function(json) {
                console.log('Raw Junket Expense Data:', json);

                if (!Array.isArray(json)) {
                    console.error('Expected array but got:', json);
                    return [];
                }
                
                // Filter junket expense transactions
                const filteredData = json.filter(row => {
                    // Filter only rows with CATEGORY_ID > 0 and capital_amount > 0
                    return row.CATEGORY_ID > 0 && row.capital_amount > 0;
                }).map(function(row) {
                    let amount = parseFloat(row.capital_amount || 0).toLocaleString();
                    let description = '';
                    
                    // Map category descriptions
                    switch(parseInt(row.capital_description)) {
                        case 1:
                            description = '<span class="css-blue1">PURCHASE OF BUSINESS SUPPLIES</span>';
                            break;
                        case 2:
                            description = '<span class="css-blue1">Hotel</span>';
                            break;
                        case 3:
                            description = '<span class="css-blue1">Guest</span>';
                            break;
                        case 4:
                            description = '<span class="css-blue1">FnB</span>';
                            break;
                        case 5:
                            description = '<span class="css-blue1">Car</span>';
                            break;
                        case 6:
                            description = '<span class="css-blue1">Employee</span>';
                            break;
                        case 7:
                            description = '<span class="css-blue1">Etc</span>';
                            break;
                        default:
                            description = row.capital_description || '';
                    }
                    
                    return [
                        row.ENCODED_BY_NAME || 'N/A',
                        `<span style="color: red;">-${amount}</span>`,
                        description,
                        row.REMARKS || '',
                        moment.utc(row.ENCODED_DT).utcOffset(8).format('DD MMM, YYYY HH:mm:ss'),
                        getActionButton(row.IDNo)
                    ];
                });

                console.log('Filtered Junket Expense Data:', filteredData);
                return filteredData;
            }
        },
        "columns": [
            { "className": "text-center" },
            { "className": "text-end" },
            { "className": "text-center" },
            { "className": "text-center" },
            { "className": "text-center" },
            { "className": "text-center", "orderable": false }
        ],
        "responsive": true,
        "language": {
            "emptyTable": "No junket expenses found",
            "processing": "Loading junket expenses..."
        },
        "drawCallback": function(settings) {
            $('[data-bs-toggle="tooltip"]').tooltip();
        }
    });
}

// Initialize Flatpickr and load data when document is ready
$(document).ready(function() {
    // Initialize Flatpickr for Junket Expense
    const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
    const currentDate = moment().format('YYYY-MM-DD');
    
    if ($('#junket-daterange').length > 0) {
        flatpickr("#junket-daterange", {
            mode: "range",
            altInput: true,
            altFormat: "M d, Y",
            dateFormat: "Y-m-d",
            defaultDate: [startOfMonth, currentDate],
            showMonths: 2,
            onChange: function(selectedDates, dateStr) {
                console.log('Junket Expense Date changed:', dateStr);
                if (selectedDates.length === 2) {
                    loadJunketExpenseData();
                }
            }
        });
        
        // Initial load of data
        setTimeout(() => {
            loadJunketExpenseData();
        }, 500);
    }

    // Add event listener for modal show on Expenses
    $('#modal-Expenses').on('shown.bs.modal', function () {
        console.log('Expenses Modal shown');
        if (!$('#junket-daterange').val()) {
            $('#junket-daterange').val(`${startOfMonth} to ${currentDate}`);
        }
        loadJunketExpenseData();
    });

    // Call computeTotalCashIn initially
    computeTotalCashIn();

    // Set up an interval to refresh the total cash-in every minute
    setInterval(computeTotalCashIn, 60000);

    // Add event listener for when the cash-in modal is hidden
    $('#modal-Cash-In').on('hidden.bs.modal', function () {
        computeTotalCashIn(); // Refresh the total when modal is closed
    });

    // Add event listener for when the cash-in modal is shown
    $('#modal-Cash-In').on('shown.bs.modal', function () {
        computeTotalCashIn(); // Refresh the total when modal is opened
    });

    // Call fetchTotalJunketExpense initially
    fetchTotalJunketExpense();

    // Set up an interval to refresh the totals every minute
    setInterval(function() {
        computeTotalCashIn();
        fetchTotalJunketExpense();
    }, 60000);

    // Add event listener for when the expenses modal is hidden
    $('#modal-Expenses').on('hidden.bs.modal', function () {
        fetchTotalJunketExpense(); // Refresh the total when modal is closed
    });

    // Add event listener for when the expenses modal is shown
    $('#modal-Expenses').on('shown.bs.modal', function () {
        fetchTotalJunketExpense(); // Refresh the total when modal is opened
    });

    // -----------------------------
    // Chips Transaction Computation
    // -----------------------------
    // Call chipsTransactionComputation initially
    chipsTransactionComputation();

    // Set up an interval to refresh the chips transaction computation every minute
    setInterval(chipsTransactionComputation, 60000);

    // Add event listener for when the chips transaction modal is hidden
    $('#modal-Transaction').on('hidden.bs.modal', function () {
        chipsTransactionComputation(); // Refresh the chips transaction total when modal is closed
    });

    // Add event listener for when the chips transaction modal is shown
    $('#modal-Transaction').on('shown.bs.modal', function () {
        chipsTransactionComputation(); // Refresh the chips transaction total when modal is opened
    });
});



function fetchTotalJunketExpense() {
    const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
    const currentDate = moment().format('YYYY-MM-DD');

    $.ajax({
        url: `/junket_capital_data?start_date=${startOfMonth}&end_date=${currentDate}&` + new Date().getTime(),
        type: "GET",
        success: function (data) {
            let totalJunketExpense = 0;

            data.forEach(row => {
                // Check for junket expense transactions (where CATEGORY_ID > 0 and capital_amount > 0)
                if (row.CATEGORY_ID > 0 && row.capital_amount > 0) {
                    totalJunketExpense += parseFloat(row.capital_amount || 0);
                }
            });

            $('#junket-expense-total').text(`₱${totalJunketExpense.toLocaleString()}`);
            console.log('Updated total junket expense:', totalJunketExpense);
        },
        error: function(xhr, status, error) {
            console.error('Error fetching total junket expense:', error);
            $('#junket-expense-total').text('₱0');
        }
    });
}


function getActionButton(id) {
    const permissions = parseInt($('#user-role').data('permissions'));
    if (permissions !== 2) {
        return `<button type="button" onclick="archive_capital(${id})" 
                class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
                data-bs-toggle="tooltip" 
                aria-label="Archive" 
                data-bs-original-title="Archive">
                <i class="fa fa-trash-alt"></i>
                </button>`;
    } else {
        return `<button type="button" 
                class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled" 
                disabled
                data-bs-toggle="tooltip" 
                aria-label="Archive" 
                data-bs-original-title="Archive">
                <i class="fa fa-trash-alt"></i>
                </button>`;
    }
}



