// ============== FRONTEND (house_expense.js) =======================
var expense_id;
var return_money_id;

// Helper: encode string for safe use in HTML data attributes (handles newlines, quotes, etc.)
function attrEncode(str) {
    if (str == null || str === '') return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n|\r|\n/g, '&#10;');
}

$(document).ready(function () {

    function initializeExpenseTable() {

        // 1. Initialize DataTable (date range picker removed - using settlement date picker instead)
        if ($.fn.DataTable.isDataTable('#expense-tbl')) {
            $('#expense-tbl').DataTable().destroy();
        }

        const goodsTypeLabel = window.houseExpenseTranslations?.type_goods || 'Goods / Consumables';
        const nonGoodsTypeLabel = window.houseExpenseTranslations?.type_non_goods || 'Non-goods / Services';
        var dataTable = $('#expense-tbl').DataTable({
            "order": [[5, 'desc']],
            "pageLength": 100,
            "lengthMenu": [[100, 50, 25, 10, -1], [100, 50, 25, 10, "All"]],
            "columnDefs": [
                {
                    "targets": 5,
                    "render": function (data, type, row) {
                        // Check if this is a "no data" row - return empty string
                        if (!data || data === '' || (row && Array.isArray(row) && row.length > 0 && (row[0] === (window.houseExpenseTranslations?.no_data_found || 'No data found')))) {
                            return '';
                        }
                        if (type === 'sort') {
                            if (!data) return '';
                            return moment.utc(data, 'MMMM DD, YYYY HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
                        }
                        if (!data) return '';
                        const dateMoment = moment(data, 'MMMM DD, YYYY HH:mm:ss');
                        return dateMoment.isValid() ? dateMoment.local().format('DD MMM, YYYY HH:mm:ss') : '';
                    },
                    "createdCell": function (cell, cellData, rowData, rowIndex, colIndex) {
                        $(cell).addClass('text-center');
                    }
                }
            ],
            "info": true,
            "language": {
                "search": (window.houseExpenseTranslations?.search || "Search:"),
                "info": (window.houseExpenseTranslations?.showing_entries || "Showing _START_ to _END_ of _TOTAL_ entries"),
                "paginate": {
                    "previous": (window.houseExpenseTranslations?.previous || "Previous"),
                    "next": (window.houseExpenseTranslations?.next || "Next")
                },
                "emptyTable": (window.houseExpenseTranslations?.no_data_found || "No data found")
            }
        });

        // 2. reloadData function - Supports both settlement date and date range modes
        function reloadData() {
            var filterMode = $('input[name="filter-mode"]:checked').val() || 'settlement';
            var requestData = {};
            
            if (filterMode === 'settlement') {
                // Settlement date mode
                var settlementDate = window.selectedSettlementDate || 'current';
                requestData.date = settlementDate;
            } else {
                // Date range mode
                var dateRangePicker = document.getElementById('daterange-picker');
                var fromDate = null;
                var toDate = null;
                
                if (dateRangePicker && dateRangePicker._flatpickr) {
                    var selectedDates = dateRangePicker._flatpickr.selectedDates;
                    if (selectedDates && selectedDates.length === 2) {
                        var pad = function(n) { return String(n).padStart(2, '0'); };
                        fromDate = selectedDates[0].getFullYear() + '-' + pad(selectedDates[0].getMonth() + 1) + '-' + pad(selectedDates[0].getDate());
                        toDate = selectedDates[1].getFullYear() + '-' + pad(selectedDates[1].getMonth() + 1) + '-' + pad(selectedDates[1].getDate());
                    }
                }
                
                if (!fromDate || !toDate) {
                    // Default to current month if not set
                    var now = new Date();
                    var firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    var pad = function(n) { return String(n).padStart(2, '0'); };
                    fromDate = firstOfMonth.getFullYear() + '-' + pad(firstOfMonth.getMonth() + 1) + '-' + pad(firstOfMonth.getDate());
                    toDate = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
                }
                
                requestData.fromDate = fromDate;
                requestData.toDate = toDate;
            }
            
            $.ajax({
                url: '/junket_house_expense_data',
                method: 'GET',
                data: requestData,
                success: function (data) {
                    dataTable.clear();
                    var total_expense = 0;
                    var total_return_money = 0;

                    if (data.length === 0) {
                        // Add centered "No data found" message
                        const noDataText = window.houseExpenseTranslations?.no_data_found || 'No data found';
                        var tbody = dataTable.table().body();
                        $(tbody).html('<tr><td colspan="7" class="text-center" style="padding: 20px;">' + noDataText + '</td></tr>');
                        $('#TOTAL_EXPENSE_AMOUNT').text(`₱0.00`);
                        $('#TOTAL_RETURN_MONEY_AMOUNT').text(`₱0.00`);
                        return;
                    }

                    data.forEach(function (row) {
                        const amount = parseFloat(row.AMOUNT) || 0; // 🛡️ Ensure valid number
                        
                        // Calculate totals separately
                        if (row.record_type === 'return_money') {
                            total_return_money += amount;
                        } else {
                            total_expense += amount;
                        }
                    
                        const permissions = parseInt($('#user-role').data('permissions'));
                        let btn = '';
                        if (permissions !== 2) {
                            btn = `
                                <div class="btn-group">
                                    <button type="button" class="btn btn-sm btn-alt-secondary"
                                            onclick="viewReceipt('${row.photoUrl}')"
                                            ${row.record_type === 'return_money' ? 'disabled' : ''}
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-secondary btn-edit-row"
                                            data-record-type="${row.record_type || 'expense'}"
                                            data-expense-id="${row.expense_id}"
                                            data-category-id="${attrEncode(row.expense_category_id || '')}"
                                            data-receipt-no="${attrEncode(row.RECEIPT_NO || '')}"
                                            data-date-time="${attrEncode(row.DATE_TIME || row.ENCODED_DT || '')}"
                                            data-description="${attrEncode(row.DESCRIPTION || '')}"
                                            data-amount="${amount}"
                                            data-oic="${attrEncode(row.OIC || '')}"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                        <i class="fa fa-pencil-alt"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-secondary"
                                            onclick="downloadReceipt('${row.photoUrl}')"
                                            ${row.record_type === 'return_money' ? 'disabled' : ''}
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                        <i class="fa fa-download"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-danger"
                                            onclick="${row.record_type === 'return_money' ? `archive_return_money(${row.expense_id})` : `archive_expense(${row.expense_id})`}"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                        <i class="fa fa-trash-alt"></i>
                                    </button>
                                </div>`;
                        } else {
                            btn = `
                                <div class="btn-group">
                                    <button type="button" class="btn btn-sm btn-primary"
                                            onclick="viewReceipt('${row.photoUrl}')"
                                            ${row.record_type === 'return_money' ? 'disabled' : ''}
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-secondary" disabled
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                        <i class="fa fa-pencil-alt"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-secondary"
                                            onclick="downloadReceipt('${row.photoUrl}')"
                                            ${row.record_type === 'return_money' ? 'disabled' : ''}
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                        <i class="fa fa-download"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-danger" disabled
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                        <i class="fa fa-trash-alt"></i>
                                    </button>
                                </div>`;
                        }
                    
                    const formattedDate = moment.utc(row.ENCODED_DT).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
                    
                    // For return money records, show "-" for Type, otherwise use expense_type
                    let expenseTypeLabel = '-';
                    if (row.record_type !== 'return_money') {
                        const typeValue = parseInt(row.expense_type, 10);
                        expenseTypeLabel = (typeValue === 2)
                            ? nonGoodsTypeLabel
                            : goodsTypeLabel;
                    }
                    
                    // Format amount - green color for return money records
                    const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                    const amountDisplay = row.record_type === 'return_money' 
                        ? `<span style="color: green;">${formattedAmount}</span>`
                        : formattedAmount;
                    
                    // For Return Money: description goes in second column (DESCRIPTION); RECEIPT NO column shows '-'
                    dataTable.row.add([
                        row.expense_category || 'N/A',
                        // expenseTypeLabel, // Type column hidden per request
                        row.record_type === 'return_money' ? (row.DESCRIPTION || '-') : (row.RECEIPT_NO || '-'),
                        row.record_type === 'return_money' ? '-' : (row.DESCRIPTION || '-'),
                        amountDisplay,
                        row.FIRSTNAME || 'N/A',
                        formattedDate,
                        btn
                    ]).draw();
                    });
                    
                    // Update separate totals
                    $('#TOTAL_EXPENSE_AMOUNT').text(`₱${total_expense.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
                    $('#TOTAL_RETURN_MONEY_AMOUNT').text(`₱${total_return_money.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
                    

                },
                error: function (xhr, status, error) {
                    // Error fetching data
                }
            });
        }

        // Expose reloadData if needed
        window.reloadData = reloadData;
        
        // Don't load data here - wait for settlement initialization
    }

    // 3. Initialize DataTable
    initializeExpenseTable();

    // ======================= EXPENSE SETTLEMENT FUNCTIONALITY ==================
    
    // Filter mode toggle handler
    $('input[name="filter-mode"]').on('change', function() {
        var mode = $(this).val();
        if (mode === 'settlement') {
            $('#settlement-date-wrapper').show();
            $('#daterange-wrapper').hide();
            // Reload data with settlement date
            if (typeof window.reloadData === 'function') {
                window.reloadData();
            }
        } else {
            $('#settlement-date-wrapper').hide();
            $('#daterange-wrapper').show();
            
            // Update date range picker to default range (earliest settlement to next settlement)
            var daterangePickerEl = document.getElementById('daterange-picker');
            if (daterangePickerEl && daterangePickerEl._flatpickr) {
                var wrapper = document.querySelector('#settlement-date-wrapper .input-group');
                var defaultSettlementDate = null;
                var settledDates = window.settledDatesForMonth || [];
                
                if (wrapper) {
                    defaultSettlementDate = wrapper.getAttribute('data-default-settlement-date');
                }
                
                // Get earliest settlement date
                var earliestSettlementDate = null;
                if (settledDates.length > 0) {
                    var sortedDates = settledDates.slice().sort();
                    earliestSettlementDate = sortedDates[0];
                } else {
                    var now = new Date();
                    var pad = function(n) { return String(n).padStart(2, '0'); };
                    var firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    earliestSettlementDate = firstOfMonth.getFullYear() + '-' + pad(firstOfMonth.getMonth() + 1) + '-' + pad(firstOfMonth.getDate());
                }
                
                // Set default range and max date
                var defaultToDate = defaultSettlementDate || new Date().toISOString().slice(0, 10);
                daterangePickerEl._flatpickr.set('maxDate', defaultToDate);
                daterangePickerEl._flatpickr.setDate([earliestSettlementDate, defaultToDate], false);
            }
            
            // Reload data with date range
            if (typeof window.reloadData === 'function') {
                window.reloadData();
            }
        }
    });
    
    // Initialize date range picker (single input with range mode)
    var dateRangePicker = null;
    if (document.getElementById('daterange-picker')) {
        var now = new Date();
        var pad = function(n) { return String(n).padStart(2, '0'); };
        
        // Get default settlement date (next settlement date) from wrapper
        var wrapper = document.querySelector('#settlement-date-wrapper .input-group');
        var defaultSettlementDate = null;
        var settledDates = [];
        if (wrapper) {
            defaultSettlementDate = wrapper.getAttribute('data-default-settlement-date');
            var settledDatesRaw = wrapper.getAttribute('data-settled-dates');
            try {
                var parsedDates = settledDatesRaw ? JSON.parse(settledDatesRaw) : [];
                // Make sure window.settledDatesForMonth is set if not already set
                if (!window.settledDatesForMonth || window.settledDatesForMonth.length === 0) {
                    window.settledDatesForMonth = parsedDates;
                }
                settledDates = window.settledDatesForMonth || parsedDates;
            } catch (e) {
                // Error parsing settled dates
            }
        }
        
        // Get earliest settlement date (start of settlement period)
        var earliestSettlementDate = null;
        if (settledDates.length > 0) {
            var sortedDates = settledDates.slice().sort();
            earliestSettlementDate = sortedDates[0];
        } else {
            // If no settled dates, use first of month
            var firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            earliestSettlementDate = firstOfMonth.getFullYear() + '-' + pad(firstOfMonth.getMonth() + 1) + '-' + pad(firstOfMonth.getDate());
        }
        
        // Default date range: From earliest settlement date to next settlement date
        var defaultFromDate = earliestSettlementDate;
        var defaultToDate = defaultSettlementDate || now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        
        dateRangePicker = flatpickr("#daterange-picker", {
            mode: 'range',
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'M d, Y',
            defaultDate: [defaultFromDate, defaultToDate],
            maxDate: defaultToDate,
            onDayCreate: function (dayElem) {
                if (!dayElem || !dayElem.dateObj) return;
                var d = dayElem.dateObj;
                var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                var settledDates = window.settledDatesForMonth || [];
                if (dStr && settledDates.indexOf(dStr) !== -1) {
                    dayElem.classList.add('settled-day');
                }
            },
            onReady: function (selectedDates, dateStr, instance) {
                // Highlight settled dates when calendar is ready (initial render)
                setTimeout(function () {
                    if (!instance.calendarContainer) return;
                    var settledDates = window.settledDatesForMonth || [];
                    var days = instance.calendarContainer.querySelectorAll('.flatpickr-day');
                    days.forEach(function (el) {
                        el.classList.remove('settled-day');
                        if (!el.dateObj) return;
                        var d = el.dateObj;
                        var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                        if (dStr && settledDates.indexOf(dStr) !== -1) {
                            el.classList.add('settled-day');
                        }
                    });
                }, 100);
            },
            onOpen: function (selectedDates, dateStr, instance) {
                setTimeout(function () {
                    if (!instance.calendarContainer) return;
                    var settledDates = window.settledDatesForMonth || [];
                    var days = instance.calendarContainer.querySelectorAll('.flatpickr-day');
                    days.forEach(function (el) {
                        el.classList.remove('settled-day');
                        if (!el.dateObj) return;
                        var d = el.dateObj;
                        var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                        if (dStr && settledDates.indexOf(dStr) !== -1) {
                            el.classList.add('settled-day');
                        }
                    });
                }, 0);
            },
            onMonthChange: function (selectedDates, dateStr, instance) {
                setTimeout(function () {
                    if (!instance.calendarContainer) return;
                    var settledDates = window.settledDatesForMonth || [];
                    var days = instance.calendarContainer.querySelectorAll('.flatpickr-day');
                    days.forEach(function (el) {
                        el.classList.remove('settled-day');
                        if (!el.dateObj) return;
                        var d = el.dateObj;
                        var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                        if (dStr && settledDates.indexOf(dStr) !== -1) {
                            el.classList.add('settled-day');
                        }
                    });
                }, 0);
            },
            onChange: function(selectedDates, dateStr, instance) {
                // Also highlight settled dates when date selection changes
                setTimeout(function () {
                    if (!instance.calendarContainer) return;
                    var settledDates = window.settledDatesForMonth || [];
                    var days = instance.calendarContainer.querySelectorAll('.flatpickr-day');
                    days.forEach(function (el) {
                        el.classList.remove('settled-day');
                        if (!el.dateObj) return;
                        var d = el.dateObj;
                        var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                        if (dStr && settledDates.indexOf(dStr) !== -1) {
                            el.classList.add('settled-day');
                        }
                    });
                }, 0);
                if (selectedDates.length === 2 && typeof window.reloadData === 'function') {
                    window.reloadData();
                }
            }
        });
    }
    
    // Initialize settlement date picker
    var settlementDatePicker = null;
    if (document.getElementById('settlement-date-picker')) {
        var wrapper = document.querySelector('#settlement-date-wrapper .input-group');
        if (wrapper) {
            var defaultDate = wrapper.getAttribute('data-default-settlement-date') || new Date().toISOString().slice(0, 10);
            var settledDatesRaw = wrapper.getAttribute('data-settled-dates');
            try {
                window.settledDatesForMonth = settledDatesRaw ? JSON.parse(settledDatesRaw) : [];
            } catch (e) {
                window.settledDatesForMonth = [];
            }
            
            window.selectedSettlementDate = defaultDate;
            
            // Initialize Flatpickr for settlement date picker (same as game_list)
            var earliestSettlementDate = null;
            var settledDates = window.settledDatesForMonth || [];
            if (settledDates.length > 0) {
                var sortedDates = settledDates.slice().sort();
                earliestSettlementDate = sortedDates[0];
            } else {
                var now = new Date();
                var pad = function(n) { return String(n).padStart(2, '0'); };
                var firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                earliestSettlementDate = firstOfMonth.getFullYear() + '-' + pad(firstOfMonth.getMonth() + 1) + '-' + pad(firstOfMonth.getDate());
            }
            
            settlementDatePicker = flatpickr("#settlement-date-picker", {
                dateFormat: 'Y-m-d',
                altInput: true,
                altFormat: 'F d, Y',
                defaultDate: defaultDate,
                minDate: earliestSettlementDate,
                maxDate: defaultDate, // Allow up to default settlement date (can be future date like Feb 13)
                allowInput: false,
                onDayCreate: function (dayElem) {
                    if (!dayElem || !dayElem.dateObj) return;
                    var d = dayElem.dateObj;
                    var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                    if (dStr && settledDates.indexOf(dStr) !== -1) dayElem.classList.add('settled-day');
                },
                onOpen: function (selectedDates, dateStr, instance) {
                    setTimeout(function () {
                        if (!instance.calendarContainer) return;
                        var days = instance.calendarContainer.querySelectorAll('.flatpickr-day');
                        days.forEach(function (el) {
                            el.classList.remove('settled-day');
                            if (!el.dateObj) return;
                            var d = el.dateObj;
                            var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                            if (dStr && settledDates.indexOf(dStr) !== -1) el.classList.add('settled-day');
                        });
                    }, 0);
                },
                onChange: function (selectedDates, dateStr, instance) {
                    window.selectedSettlementDate = dateStr || '';
                    if (typeof window.updateNavigationButtons === 'function') window.updateNavigationButtons();
                    if (typeof window.updateSettleButtonState === 'function') window.updateSettleButtonState();
                    if (typeof window.reloadExpenseBySettlementDate === 'function') window.reloadExpenseBySettlementDate();
                },
                onMonthChange: function (selectedDates, dateStr, instance) {
                    setTimeout(function () {
                        if (!instance.calendarContainer) return;
                        var days = instance.calendarContainer.querySelectorAll('.flatpickr-day');
                        days.forEach(function (el) {
                            el.classList.remove('settled-day');
                            if (!el.dateObj) return;
                            var d = el.dateObj;
                            var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                            if (dStr && settledDates.indexOf(dStr) !== -1) el.classList.add('settled-day');
                        });
                    }, 0);
                }
            });
        }
    }

    // Settlement button state management
    var settleBtnLabel = (window.houseExpenseTranslations && window.houseExpenseTranslations.settle) || 'Settle';
    var settledBtnLabel = (window.houseExpenseTranslations && window.houseExpenseTranslations.settled) || 'Settled';
    
    window.updateSettleButtonState = function (recordCount) {
        // Only update if in settlement mode
        var filterMode = $('input[name="filter-mode"]:checked').val() || 'settlement';
        if (filterMode !== 'settlement') {
            // Hide settle button in date range mode
            $('#btn-daily-settle').addClass('disabled').css('pointer-events', 'none').css('opacity', '0.5');
            return;
        }
        
        var date = window.selectedSettlementDate;
        var todayStr = $('#settlement-date-wrapper .input-group').attr('data-today') || new Date().toISOString().slice(0, 10);
        if (!date) {
            $('#btn-daily-settle').addClass('disabled').text(settleBtnLabel).css('pointer-events', 'none').css('opacity', '0.5');
            return;
        }
        var settled = (window.settledDatesForMonth || []).indexOf(date) !== -1;
        var isPastDate = date < todayStr;
        var noRecordsForPastDate = (recordCount !== undefined && recordCount === 0 && isPastDate);
        var $btn = $('#btn-daily-settle');
        if (settled) {
            $btn.addClass('disabled').text(settledBtnLabel).css('pointer-events', 'none').css('opacity', '0.5');
        } else if (noRecordsForPastDate) {
            $btn.addClass('disabled').text(settleBtnLabel).css('pointer-events', 'none').css('opacity', '0.5');
        } else {
            $btn.removeClass('disabled').text(settleBtnLabel).css('pointer-events', 'auto').css('opacity', '1');
        }
    };

    // Previous/Next Date Navigation Functions
    function getEarliestSettlementDate() {
        var settledDates = window.settledDatesForMonth || [];
        if (settledDates.length === 0) {
            var now = new Date();
            var pad = function(n) { return String(n).padStart(2, '0'); };
            var firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            return firstOfMonth.getFullYear() + '-' + pad(firstOfMonth.getMonth() + 1) + '-' + pad(firstOfMonth.getDate());
        }
        var sortedDates = settledDates.slice().sort();
        return sortedDates[0];
    }
    
    function getPreviousDate(currentDate) {
        if (!currentDate) return null;
        var current = new Date(currentDate + 'T12:00:00');
        var previous = new Date(current);
        previous.setDate(previous.getDate() - 1);
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var previousDateStr = previous.getFullYear() + '-' + pad(previous.getMonth() + 1) + '-' + pad(previous.getDate());
        var earliestSettlementDate = getEarliestSettlementDate();
        if (previousDateStr < earliestSettlementDate) {
            return null;
        }
        return previousDateStr;
    }
    
    function getNextDate(currentDate) {
        if (!currentDate) return null;
        
        var current = new Date(currentDate + 'T12:00:00');
        var next = new Date(current);
        next.setDate(next.getDate() + 1);
        
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var nextDateStr = next.getFullYear() + '-' + pad(next.getMonth() + 1) + '-' + pad(next.getDate());
        
        // Don't go beyond today OR default settlement date (whichever is later)
        // This allows navigation to default settlement date even if it's tomorrow
        var todayStr = $('#settlement-date-wrapper .input-group').attr('data-today') || new Date().toISOString().slice(0, 10);
        var defaultSettlementDate = $('#settlement-date-wrapper .input-group').attr('data-default-settlement-date') || todayStr;
        var maxAllowedDate = defaultSettlementDate > todayStr ? defaultSettlementDate : todayStr;
        
        if (nextDateStr > maxAllowedDate) {
            return null;
        }
        
        return nextDateStr;
    }
    
    // Expose updateNavigationButtons globally so it can be called from flatpickr onChange
    window.updateNavigationButtons = function() {
        var currentDate = window.selectedSettlementDate || $('#settlement-date-wrapper .input-group').attr('data-default-settlement-date');
        var previousDate = getPreviousDate(currentDate);
        var nextDate = getNextDate(currentDate);
        
        // Update previous button state
        if (previousDate) {
            $('#btn-settlement-prev').prop('disabled', false);
        } else {
            $('#btn-settlement-prev').prop('disabled', true);
        }
        
        // Update next button state
        if (nextDate) {
            $('#btn-settlement-next').prop('disabled', false);
        } else {
            $('#btn-settlement-next').prop('disabled', true);
        }
    };
    
    function navigateToDate(targetDate) {
        if (!targetDate) return;
        
        // Update global selected date
        window.selectedSettlementDate = targetDate;
        
        // Update flatpickr date picker
        var pickerEl = document.getElementById('settlement-date-picker');
        if (pickerEl && pickerEl._flatpickr) {
            pickerEl._flatpickr.setDate(targetDate, false);
        }
        
        // Update navigation button states
        updateNavigationButtons();
        
        // Update settle button state
        if (typeof window.updateSettleButtonState === 'function') {
            window.updateSettleButtonState();
        }
        
        // Reload data
        if (typeof window.reloadExpenseBySettlementDate === 'function') {
            window.reloadExpenseBySettlementDate();
        }
    }
    
    // Previous button click handler
    $('#btn-settlement-prev').on('click', function() {
        var currentDate = window.selectedSettlementDate || $('.day-selector-wrapper').attr('data-default-settlement-date');
        var previousDate = getPreviousDate(currentDate);
        
        if (previousDate) {
            navigateToDate(previousDate);
        } else {
            var earliestDate = getEarliestSettlementDate();
            var formattedEarliest = earliestDate ? new Date(earliestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'earliest settlement date';
            Swal.fire({
                icon: 'info',
                title: 'No Previous Date',
                text: 'You are already at the earliest settlement date (' + formattedEarliest + ').',
                confirmButtonText: 'OK',
                timer: 2000,
                showConfirmButton: false
            });
        }
    });
    
    // Next button click handler
    $('#btn-settlement-next').on('click', function() {
        var currentDate = window.selectedSettlementDate || $('#settlement-date-wrapper .input-group').attr('data-default-settlement-date');
        var nextDate = getNextDate(currentDate);
        
        if (nextDate) {
            navigateToDate(nextDate);
        } else {
            Swal.fire({
                icon: 'info',
                title: 'No Next Date',
                text: 'You are already at the latest available date.',
                confirmButtonText: 'OK',
                timer: 2000,
                showConfirmButton: false
            });
        }
    });

    // Update reloadData to support settlement date
    window.reloadExpenseBySettlementDate = function() {
        // Get fresh date each time function is called
        var date = window.selectedSettlementDate || 'current';
        $.ajax({
            url: '/junket_house_expense_data',
            method: 'GET',
            data: { date: date },
                    success: function (data) {
                        var dataTable = $('#expense-tbl').DataTable();
                        dataTable.clear();
                        var total_expense = 0;
                        var total_return_money = 0;

                        if (data.length === 0) {
                            const noDataText = window.houseExpenseTranslations?.no_data_found || 'No data found';
                            var tbody = dataTable.table().body();
                            $(tbody).html('<tr><td colspan="7" class="text-center" style="padding: 20px;">' + noDataText + '</td></tr>');
                            $('#TOTAL_EXPENSE_AMOUNT').text(`₱0.00`);
                            $('#TOTAL_RETURN_MONEY_AMOUNT').text(`₱0.00`);
                            if (typeof window.updateSettleButtonState === 'function') {
                                window.updateSettleButtonState(0);
                            }
                            return;
                        }

                        const goodsTypeLabel = window.houseExpenseTranslations?.type_goods || 'Goods / Consumables';
                        const nonGoodsTypeLabel = window.houseExpenseTranslations?.type_non_goods || 'Non-goods / Services';

                        data.forEach(function (row) {
                            const amount = parseFloat(row.AMOUNT) || 0;
                            
                            if (row.record_type === 'return_money') {
                                total_return_money += amount;
                            } else {
                                total_expense += amount;
                            }
                        
                            const permissions = parseInt($('#user-role').data('permissions'));
                            let btn = '';
                            if (permissions !== 2) {
                                btn = `
                                    <div class="btn-group">
                                        <button type="button" class="btn btn-sm btn-alt-secondary"
                                                onclick="viewReceipt('${row.photoUrl}')"
                                                ${row.record_type === 'return_money' ? 'disabled' : ''}
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                            <i class="fa fa-eye"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-alt-secondary btn-edit-row"
                                                data-record-type="${row.record_type || 'expense'}"
                                                data-expense-id="${row.expense_id}"
                                                data-category-id="${attrEncode(row.expense_category_id || '')}"
                                                data-receipt-no="${attrEncode(row.RECEIPT_NO || '')}"
                                                data-date-time="${attrEncode(row.DATE_TIME || row.ENCODED_DT || '')}"
                                                data-description="${attrEncode(row.DESCRIPTION || '')}"
                                                data-amount="${amount}"
                                                data-oic="${attrEncode(row.OIC || '')}"
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                            <i class="fa fa-pencil-alt"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-alt-secondary"
                                                onclick="downloadReceipt('${row.photoUrl}')"
                                                ${row.record_type === 'return_money' ? 'disabled' : ''}
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                            <i class="fa fa-download"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-alt-danger"
                                                onclick="${row.record_type === 'return_money' ? `archive_return_money(${row.expense_id})` : `archive_expense(${row.expense_id})`}"
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                            <i class="fa fa-trash-alt"></i>
                                        </button>
                                    </div>`;
                            } else {
                                btn = `
                                    <div class="btn-group">
                                        <button type="button" class="btn btn-sm btn-primary"
                                                onclick="viewReceipt('${row.photoUrl}')"
                                                ${row.record_type === 'return_money' ? 'disabled' : ''}
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                            <i class="fa fa-eye"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-alt-secondary" disabled
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                            <i class="fa fa-pencil-alt"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-secondary"
                                                onclick="downloadReceipt('${row.photoUrl}')"
                                                ${row.record_type === 'return_money' ? 'disabled' : ''}
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                            <i class="fa fa-download"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-alt-danger" disabled
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                            <i class="fa fa-trash-alt"></i>
                                        </button>
                                    </div>`;
                            }
                        
                            const formattedDate = moment.utc(row.ENCODED_DT).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
                            
                            let expenseTypeLabel = '-';
                            if (row.record_type !== 'return_money') {
                                const typeValue = parseInt(row.expense_type, 10);
                                expenseTypeLabel = (typeValue === 2)
                                    ? nonGoodsTypeLabel
                                    : goodsTypeLabel;
                            }
                            
                            const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                            const amountDisplay = row.record_type === 'return_money' 
                                ? `<span style="color: green;">${formattedAmount}</span>`
                                : formattedAmount;
                            
                            // For Return Money: description goes in second column (DESCRIPTION); RECEIPT NO column shows '-'
                            dataTable.row.add([
                                row.expense_category || 'N/A',
                                // expenseTypeLabel, // Type column hidden per request
                                row.record_type === 'return_money' ? (row.DESCRIPTION || '-') : (row.RECEIPT_NO || '-'),
                                row.record_type === 'return_money' ? '-' : (row.DESCRIPTION || '-'),
                                amountDisplay,
                                row.FIRSTNAME || 'N/A',
                                formattedDate,
                                btn
                            ]).draw();
                        });
                        
                        $('#TOTAL_EXPENSE_AMOUNT').text(`₱${total_expense.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
                        $('#TOTAL_RETURN_MONEY_AMOUNT').text(`₱${total_return_money.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
                        
                        if (typeof window.updateSettleButtonState === 'function') {
                            window.updateSettleButtonState(data.length);
                        }
                    },
            error: function (xhr, status, error) {
                // Error fetching data
            }
        });
    };

    // Settlement button click handler
    $('#btn-daily-settle').on('click', function (e) {
        e.preventDefault();
        if ($(this).hasClass('disabled') || $(this).prop('disabled')) return;
        var settlementDate = window.selectedSettlementDate || new Date().toISOString().slice(0, 10);
        var formattedDate = settlementDate ? new Date(settlementDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : settlementDate;
        var $btn = $(this);
        
        Swal.fire({
            title: 'Confirm Settlement',
            text: 'Settle all expenses for ' + formattedDate + '?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Settle',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#0d6efd',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            $btn.addClass('disabled').css('pointer-events', 'none').css('opacity', '0.5');
            $.ajax({
                url: '/expense_daily_settlement/run',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ settlement_date: settlementDate }),
                success: function (res) {
                    var settledDate = (res && res.settlement_date) ? res.settlement_date : $('.day-selector-wrapper').attr('data-today');
                    window.selectedSettlementDate = settledDate || '';
                    
                    // Update settled dates array to include the newly settled date
                    if (settledDate && window.settledDatesForMonth) {
                        if (window.settledDatesForMonth.indexOf(settledDate) === -1) {
                            window.settledDatesForMonth.push(settledDate);
                            window.settledDatesForMonth.sort();
                        }
                    }
                    
                    var pickerEl = document.getElementById('settlement-date-picker');
                    if (pickerEl && pickerEl._flatpickr) pickerEl._flatpickr.setDate(settledDate || '', false);
                    
                    // Refresh date range picker highlighting if it exists
                    var dateRangePickerEl = document.getElementById('daterange-picker');
                    if (dateRangePickerEl && dateRangePickerEl._flatpickr && dateRangePickerEl._flatpickr.isOpen) {
                        var instance = dateRangePickerEl._flatpickr;
                        setTimeout(function () {
                            if (!instance.calendarContainer) return;
                            var currentSettledDates = window.settledDatesForMonth || [];
                            var days = instance.calendarContainer.querySelectorAll('.flatpickr-day');
                            days.forEach(function (el) {
                                el.classList.remove('settled-day');
                                if (!el.dateObj) return;
                                var d = el.dateObj;
                                var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                                if (dStr && currentSettledDates.indexOf(dStr) !== -1) el.classList.add('settled-day');
                            });
                        }, 0);
                    }
                    
                    var settledFormatted = (settledDate || settlementDate) ? new Date((settledDate || settlementDate) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : (settledDate || settlementDate);
                    Swal.fire({
                        title: 'Settled',
                        text: 'Settlement for ' + settledFormatted + ' completed. Expenses: ' + (res.expense_count || 0) + ', Return Money: ' + (res.return_money_count || 0),
                        icon: 'success',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#0d6efd'
                    }).then(function () {
                        window.location.reload();
                    });
                },
                error: function (xhr) {
                    var err = (xhr.responseJSON && xhr.responseJSON.error) || 'Failed to run settlement';
                    Swal.fire({
                        title: 'Error',
                        text: err,
                        icon: 'error',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#0d6efd'
                    });
                },
                complete: function () {
                    if (typeof window.updateSettleButtonState === 'function') window.updateSettleButtonState();
                }
            });
        });
    });

    // Initialize settlement UI state
    if (typeof window.updateSettleButtonState === 'function') window.updateSettleButtonState();
    if (typeof window.updateNavigationButtons === 'function') window.updateNavigationButtons();

    // Initial load with settlement date
    if (typeof window.reloadData === 'function') {
        window.reloadData();
    }

    // Event delegation for Edit button (avoids inline onclick issues with special chars: newlines, quotes, etc.)
    $(document).on('click', '.btn-edit-row', function () {
        var $btn = $(this);
        var recordType = $btn.attr('data-record-type') || 'expense';
        var id = $btn.attr('data-expense-id');
        var description = $btn.attr('data-description') || '';
        var amount = $btn.attr('data-amount') || '0';
        if (recordType === 'return_money') {
            edit_return_money(id, description, amount);
        } else {
            var categoryId = $btn.attr('data-category-id') || '';
            var receiptNo = $btn.attr('data-receipt-no') || '';
            var dateTime = $btn.attr('data-date-time') || '';
            var oic = $btn.attr('data-oic') || '';
            edit_expense(id, categoryId, receiptNo, dateTime, description, amount, oic);
        }
    });

    // Utility functions for receipt actions
    window.viewReceipt = function (photoUrl) {
        if (!photoUrl || photoUrl.trim() === "" || photoUrl === "null") {
        Swal.fire({
            icon: 'warning',
            title: window.houseExpenseTranslations?.no_receipt_uploaded || 'No Receipt Uploaded',
            text: window.houseExpenseTranslations?.no_receipt_available || 'There is no receipt available to view.',
            confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
        });
            return;
        }
        Swal.fire({
            title: '',
            imageUrl: photoUrl,
            imageAlt: window.houseExpenseTranslations?.receipt_image || 'Receipt Image',
            showCloseButton: true,
            showConfirmButton: false,
            width: 'auto',
            padding: '1rem',
            background: '#fff'
        });
    };

    window.downloadReceipt = function (photoUrl) {
        var a = document.createElement('a');
        a.href = photoUrl;
        a.download = photoUrl.substring(photoUrl.lastIndexOf('/') + 1);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };


    // Kapag sine-submit ang form para sa pag-edit
    $('#edit_junket_house_expense').submit(function (event) {
        event.preventDefault();

        const $btn = $('#btn-save-edit-expense');
        const originalHtml = $btn.html();

        // Show loading spinner on button
        $btn.prop('disabled', true).html(`
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        ${window.houseExpenseTranslations?.saving || 'Saving'}...
    `);

        const formData = new FormData(this);

        $.ajax({
            url: '/junket_house_expense/' + expense_id,
            type: 'PUT',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                Swal.fire({
                    icon: 'success',
                    title: window.houseExpenseTranslations?.updated_successfully || 'Updated successfully!',
                    text: window.houseExpenseTranslations?.expense_updated || 'House expense has been updated.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK',
                    allowOutsideClick: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        $('#modal-edit-house-expense').modal('hide');
                        window.location.reload(); // 🔁 Full page refresh after confirm
                    }
                });
            },
            error: function (error) {
                Swal.fire({
                    icon: 'error',
                    title: window.houseExpenseTranslations?.error || 'Error!',
                    text: window.houseExpenseTranslations?.error_updating_expense || 'There was an error updating the expense.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
                });
            },
            complete: function () {
                // Reset button after request finishes
                $btn.prop('disabled', false).html(originalHtml);
            }
        });
    });
});


function addHouseExpense() {
    $('#modal-new-house-expense').modal('show');

    expense_category();
    get_agent();
}

function returnMoney() {
    $('#modal-new-return-money').modal('show');
}

function edit_expense(id, category_id, receipt_no, datetimeval, description, amount, oic) {
    $('#modal-edit-house-expense').modal('show');
    $('#txtCategory').val(category_id);
    $('#txtReceiptNo').val(receipt_no);

    // ✅ Sanitize and format datetime properly
    let formattedDate = '';
    if (datetimeval) {
        const parsedDate = moment(datetimeval, ['YYYY-MM-DD HH:mm:ss', 'MMMM DD, YYYY HH:mm:ss', moment.ISO_8601], true);
        if (parsedDate.isValid()) {
            formattedDate = parsedDate.format('YYYY-MM-DD');
        } else {
            formattedDate = '';
        }
    }

    $('#txtDateandTime').val(formattedDate);
    $('#txtDescription').val(description);
    $('#txtAmount').val(amount);
    // $('#txtOfficerInCharge').val(oic);

    expense_id = id;

    edit_expense_category(category_id);
    // edit_get_agent(oic);
}


function archive_expense(id) {
    Swal.fire({
        title: window.houseExpenseTranslations?.delete_confirmation || 'Are you sure you want to delete this?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: window.houseExpenseTranslations?.yes || 'Yes'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: '/junket_house_expense/remove/' + id,
                type: 'PUT',
                success: function (response) {
                    Swal.fire({
                        icon: 'success',
                        title: window.houseExpenseTranslations?.updated_successfully || 'Deleted successfully!',
                        text: window.houseExpenseTranslations?.expense_deleted || 'House expense has been deleted.',
                        confirmButtonText: window.houseExpenseTranslations?.ok || 'OK',
                        allowOutsideClick: false
                    }).then((result) => {
                        if (result.isConfirmed) {
                            window.location.reload();
                        }
                    });
                },
                error: function (error) {
                    Swal.fire({
                        icon: 'error',
                        title: window.houseExpenseTranslations?.error || 'Error!',
                        text: window.houseExpenseTranslations?.error_deleting_expense || 'Failed to delete expense. Please try again.',
                        confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
                    });
                }
            });
        }
    })
}

function edit_return_money(id, description, amount) {
    $('#modal-edit-return-money').modal('show');
    $('#txtReturnMoneyDescription').val(description);
    
    // Format amount with commas
    const amountNum = parseFloat(amount) || 0;
    const formattedAmount = amountNum.toLocaleString('en-US', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    });
    $('#txtReturnMoneyAmount').val(formattedAmount);
    
    return_money_id = id;
}

function archive_return_money(id) {
    Swal.fire({
        title: window.houseExpenseTranslations?.delete_confirmation || 'Are you sure you want to delete this?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: window.houseExpenseTranslations?.yes || 'Yes'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: '/remove_return_money/' + id,
                type: 'PUT',
                success: function (response) {
                    Swal.fire({
                        icon: 'success',
                        title: window.houseExpenseTranslations?.updated_successfully || 'Deleted successfully!',
                        text: window.houseExpenseTranslations?.return_deleted || 'Return money has been deleted.',
                        confirmButtonText: window.houseExpenseTranslations?.ok || 'OK',
                        allowOutsideClick: false
                    }).then((result) => {
                        if (result.isConfirmed) {
                            window.location.reload();
                        }
                    });
                },
                error: function (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Failed to delete return money. Please try again.'
                    });
                }
            });
        }
    })
}

// Form submission handler for edit return money
$(document).ready(function() {
    $('#edit_return_money').submit(function (event) {
        event.preventDefault();

        const $btn = $('#btn-save-edit-return-money');
        const originalHtml = $btn.html();

        // Show loading spinner on button
        $btn.prop('disabled', true).html(`
            <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            ${window.houseExpenseTranslations?.saving || 'Saving'}...
        `);

        const formData = {
            txtDescription: $('#txtReturnMoneyDescription').val(),
            txtAmount: $('#txtReturnMoneyAmount').val()
        };

        $.ajax({
            url: '/edit_return_money/' + return_money_id,
            type: 'PUT',
            data: formData,
            success: function (response) {
                Swal.fire({
                    icon: 'success',
                    title: window.houseExpenseTranslations?.updated_successfully || 'Updated successfully!',
                    text: 'Return money has been updated.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK',
                    allowOutsideClick: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        $('#modal-edit-return-money').modal('hide');
                        window.location.reload();
                    }
                });
            },
            error: function (error) {
                Swal.fire({
                    icon: 'error',
                    title: window.houseExpenseTranslations?.error || 'Error!',
                    text: 'There was an error updating the return money.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
                });
            },
            complete: function () {
                // Reset button after request finishes
                $btn.prop('disabled', false).html(originalHtml);
            }
        });
    });
});

function expense_category() {
    $.ajax({
        url: '/expense_category_data',
        method: 'GET',
        success: function (response) {
            var selectOptions = $('#expense-category-select');
            if (!selectOptions.length) return;
            selectOptions.empty();
            selectOptions.append($('<option>', {
                value: '',
                text: window.houseExpenseTranslations?.select_expense_category || '--SELECT EXPENSE CATEGORY--'
            }));
            response.forEach(function (option) {
                selectOptions.append($('<option>', {
                    value: option.IDNo,
                    text: option.CATEGORY
                }));
            });
        },
        error: function (xhr, status, error) {
            // Error fetching options
        }
    });
}

function get_agent() {
    $.ajax({
        url: '/users',
        method: 'GET',
        success: function (response) {
            var selectOptions = $('#oic');
            selectOptions.empty();
            selectOptions.append($('<option>', {
                value: '',
                text: window.houseExpenseTranslations?.select_officer_in_charge || '--SELECT OFFICER IN CHARGE--'
            }));
            response.forEach(function (option) {
                selectOptions.append($('<option>', {
                    value: option.user_id,
                    text: option.FIRSTNAME + ' ' + option.LASTNAME
                }));
            });
        },
        error: function (xhr, status, error) {
            // Error fetching options
        }
    });
}

function edit_expense_category(id) {
    $.ajax({
        url: '/expense_category_data',
        method: 'GET',
        success: function (response) {
            var selectOptions = $('.txtCategory');
            selectOptions.empty();
            selectOptions.append($('<option>', {
                selected: false,
                value: '',
                text: window.houseExpenseTranslations?.select_expense_category || '--SELECT EXPENSE CATEGORY--',
                disabled: true // Disable the default option
            }));
            response.forEach(function (option) {
                var selected = false;
                if (option.IDNo == id) {
                    selected = true;
                }
                selectOptions.append($('<option>', {
                    selected: selected,
                    value: option.IDNo,
                    text: option.CATEGORY
                }));
            });
        },
        error: function (xhr, status, error) {
            // Error fetching options
        }
    });
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

    // New house expense modal: bind only when jQuery and DOM are ready (fixes "$ is not defined")
    var isSubmittingNewExpense = false;
    $('#modal-new-house-expense').on('shown.bs.modal', function () {
        expense_category();
        isSubmittingNewExpense = false;
        var $btn = $('#btn-save-new-expense');
        var originalText = $btn.data('original-text') || $btn.html();
        var isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly && window.PermissionViewOnly.isViewOnly();
        if (!isViewOnly) $btn.prop('disabled', false).html(originalText);
        var $form = $('#add_junket_house_expense');
        if ($form.length) $form[0].reset();
    });
    $('#modal-new-house-expense').on('hidden.bs.modal', function () {
        isSubmittingNewExpense = false;
        var $btn = $('#btn-save-new-expense');
        var originalText = $btn.data('original-text') || $btn.html();
        var isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly && window.PermissionViewOnly.isViewOnly();
        if (!isViewOnly) $btn.prop('disabled', false).html(originalText);
    });
    $('#add_junket_house_expense').on('submit', function (event) {
        event.preventDefault();
        if (isSubmittingNewExpense) return false;
        var isValid = true;
        $(this).find(':input[required]').each(function () {
            if ($(this).val() === '') {
                isValid = false;
                $(this).addClass('is-invalid');
            } else {
                $(this).removeClass('is-invalid');
            }
        });
        if (!isValid) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Inserting Error', text: 'Please fill in all required fields.' });
            }
            return false;
        }
        isSubmittingNewExpense = true;
        var $submitBtn = $('#btn-save-new-expense');
        var originalText = $submitBtn.html();
        $submitBtn.prop('disabled', true).html('Saving...');
        var formData = new FormData(this);
        var $form = $(this);
        $.ajax({
            url: '/add_junket_house_expense',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'success', title: 'Added successfully', confirmButtonText: 'OK', showConfirmButton: true }).then(function () {
                        if (typeof reloadData === 'function') reloadData();
                        $('#modal-new-house-expense').modal('hide');
                        window.location.reload();
                    });
                } else {
                    if (typeof reloadData === 'function') reloadData();
                    $('#modal-new-house-expense').modal('hide');
                    window.location.reload();
                }
            },
            error: function (xhr, status, error) {
                isSubmittingNewExpense = false;
                $submitBtn.prop('disabled', false).html(originalText);
                var errorMessage = (xhr.responseJSON && xhr.responseJSON.error) ? xhr.responseJSON.error : 'An error occurred';
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Error', text: errorMessage || 'Failed to save expense. Please try again.' });
                }
                console.error('Error saving house expense:', error);
            }
        });
        return false;
    });

    // New return money modal: bind after jQuery is ready (fixes "$ is not defined" on house_expense page)
    var isSubmittingReturnMoney = false;
    $('#modal-new-return-money').on('shown.bs.modal', function () {
        isSubmittingReturnMoney = false;
        var $btn = $('#btn-save-new-return-money');
        var originalText = $btn.data('original-text') || $btn.html();
        var isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly && window.PermissionViewOnly.isViewOnly();
        if (!isViewOnly) $btn.prop('disabled', false).html(originalText);
        var $formEl = document.getElementById('add_return_money');
        if ($formEl) $formEl.reset();
    });
    $('#modal-new-return-money').on('hidden.bs.modal', function () {
        isSubmittingReturnMoney = false;
        var $btn = $('#btn-save-new-return-money');
        var originalText = $btn.data('original-text') || $btn.html();
        var isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly && window.PermissionViewOnly.isViewOnly();
        if (!isViewOnly) $btn.prop('disabled', false).html(originalText);
    });
    $('#add_return_money').on('submit', function (event) {
        event.preventDefault();
        if (isSubmittingReturnMoney) return false;
        var $form = $(this);
        var isValid = true;
        $form.find(':input[required]').each(function () {
            if ($(this).val() === '' || $(this).val().trim() === '') {
                isValid = false;
                $(this).addClass('is-invalid');
            } else {
                $(this).removeClass('is-invalid');
            }
        });
        if (!isValid) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Please fill in all required fields.' });
            }
            return false;
        }
        isSubmittingReturnMoney = true;
        var $submitBtn = $('#btn-save-new-return-money');
        var originalText = $submitBtn.html();
        $submitBtn.prop('disabled', true).html('Saving...');
        var descriptionValue = $form.find('textarea[name="txtDescription"]').val() || '';
        var amountValue = $form.find('input[name="txtAmount"]').val() || '';
        if (amountValue) amountValue = amountValue.toString().replace(/,/g, '').trim();
        var formData = { txtDescription: descriptionValue.trim(), txtAmount: amountValue };
        if (!amountValue || amountValue === '' || parseFloat(amountValue) <= 0) {
            isSubmittingReturnMoney = false;
            $submitBtn.prop('disabled', false).html(originalText);
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Please enter a valid amount.' });
            }
            return false;
        }
        $.ajax({
            url: '/add_return_money',
            type: 'POST',
            data: formData,
            success: function (response) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'success', title: 'Added successfully', confirmButtonText: 'OK', showConfirmButton: true }).then(function () {
                        if (typeof reloadData === 'function') reloadData();
                        $('#modal-new-return-money').modal('hide');
                        window.location.reload();
                    });
                } else {
                    if (typeof reloadData === 'function') reloadData();
                    $('#modal-new-return-money').modal('hide');
                    window.location.reload();
                }
            },
            error: function (xhr, status, error) {
                isSubmittingReturnMoney = false;
                $submitBtn.prop('disabled', false).html(originalText);
                var errorMessage = (xhr.responseJSON && xhr.responseJSON.error) ? xhr.responseJSON.error : 'An error occurred';
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Error', text: errorMessage || 'Failed to save return money. Please try again.' });
                }
                console.error('Error adding return money:', error);
            }
        });
        return false;
    });
})

function onlyNumberKey(evt) {

    let ASCIICode = (evt.which) ? evt.which : evt.keyCode
    if (ASCIICode > 31 && (ASCIICode < 48 || ASCIICode > 57))
        return false;
    return true;
}