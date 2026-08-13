/**
 * Shared marker (credits) logic for modal and marker history page.
 * Usage: MarkerCommon.init({ tableSelector: '#marker-tbl', ... });
 */
(function (window) {
    'use strict';

    var $ = window.jQuery;
    if (!$) return;

    function formatWithCommas(value) {
        if (value === '' || value === null || value === undefined) return value;
        var num = Number(value);
        if (isNaN(num)) return value;
        return num.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    }

    /** Marker history table: no trailing .00 for whole amounts */
    function formatMarkerHistoryAmount(value) {
        var n = value != null ? Number(value) : 0;
        if (isNaN(n)) return '0';
        var rounded = Math.round(n * 100) / 100;
        if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
            return Math.round(rounded).toLocaleString('en-US');
        }
        return rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    var MARKER_HISTORY_DATE_PARSE_FORMATS = [
        'MMMM DD, YYYY HH:mm:ss',
        'MMMM DD, YYYY HH:mm',
        'DD MMM, YYYY HH:mm:ss',
        'DD MMM, YYYY HH:mm'
    ];

    function parseMarkerHistoryDateString(value) {
        if (!value || !window.moment) return null;
        var m = moment(value, MARKER_HISTORY_DATE_PARSE_FORMATS, true);
        if (m.isValid()) return m;
        m = moment(value);
        return m.isValid() ? m : null;
    }

    function escapeHtml(s) {
        if (s == null || s === '') return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getTransactionLabel(transactionId) {
        switch (parseInt(transactionId, 10)) {
            case 11: return 'Marker Returned Cash';
            case 12: return 'Marker Returned Deposit';
            case 10: return 'Buy-in thru Marker';
            case 3: return 'Junket Credit';
            default: return 'Chips Return thru Credit';
        }
    }

    function renderTransactionType(data, type, row) {
        if (!data) return '';
        var parts = String(data).split('-');
        var transactionId = parseInt(parts[0], 10);
        var transactionType = parseInt(parts[1], 10);
        var desc = row && row.TRANSACTION_DESC != null ? String(row.TRANSACTION_DESC) : '';
        switch (transactionId) {
            case 3: return 'Junket Credit';
            case 11:
                if (desc === 'RETURN_SOURCE:BUYIN_COIN_VALUE') return 'Game Credit Returned thru Coin';
                if (desc === 'RETURN_SOURCE:BUYIN_COIN') return 'Game Credit (Coin) Returned thru Cash';
                return 'Credit Returned thru Cash';
            case 12:
                if (desc === 'RETURN_SOURCE:BUYIN_COIN') return 'Game Credit (Coin) Returned thru Deposit';
                return 'Credit Returned thru Deposit';
            case 10:
                return desc === 'BUYIN_SOURCE:COIN' ? 'Buy-in thru Coin' : 'Buy-in thru Credit';
            default:
                return transactionType === 4 ? 'Chips Return thru Credit' : 'Unknown Transaction';
        }
    }

    function initHistoryTable(selector, options) {
        options = options || {};
        var $table = $(selector);
        if (!$table.length) return null;

        if ($.fn.DataTable.isDataTable(selector)) {
            $(selector).DataTable().destroy();
            $table.find('tbody').empty();
        }

        var orderCol = options.orderCol != null ? options.orderCol : 3;
        var orderDir = options.orderDir || 'desc';

        var perms = parseInt($('#user-role').data('permissions'), 10);
        var isSuperAdmin = $('#user-role').length && perms === 0;

        // Get translations from window object
        var translations = window.markerTranslations || {};

        var table = $table.DataTable({
            order: [[orderCol, orderDir]],
            language: {
                info: translations.showing_entries || "Showing _START_ to _END_ of _TOTAL_ entries",
                infoEmpty: translations.info_empty || "Showing 0 to 0 of 0 entries",
                infoFiltered: translations.info_filtered || "(filtered from _MAX_ total entries)",
                lengthMenu: translations.length_menu || "Show _MENU_ entries",
                search: translations.search || "Search:",
                paginate: {
                    first: translations.first || "First",
                    last: translations.last || "Last",
                    previous: translations.previous || "Previous",
                    next: translations.next || "Next"
                },
                emptyTable: translations.no_data_available || "No data available in table",
                zeroRecords: translations.no_data_available || "No matching records found"
            },
            dom: '<"row g-0 gy-2 mb-2 align-items-center gap-3"<"col-12 col-md-auto"l><"col-12 col-md d-flex justify-content-end align-items-center"f>>rt<"row g-2 mt-2"<"col-12 col-md-6"i><"col-12 col-md-6"p>>',
            autoWidth: false,
            ajax: {
                url: options.ajaxUrl || '/marker_history',
                dataSrc: function (json) {
                    var data = Array.isArray(json) ? json : (json && json.data && Array.isArray(json.data) ? json.data : []);
                    if (!data.length) return data;
                    if (window.moment) {
                        try {
                            return data.map(function (row) {
                                if (row.ENCODED_DT) {
                                    row.ENCODED_DT = moment.utc(row.ENCODED_DT).utcOffset(8).format('MMMM DD, YYYY HH:mm');
                                }
                                return row;
                            });
                        } catch (e) {
                            return data;
                        }
                    }
                    return data;
                },
                error: function (xhr, err, msg) {
                    console.error('Marker history AJAX error:', xhr.status, msg, xhr.responseText);
                }
            },
            columns: [
                {
                    data: null,
                    render: function (row) {
                        return (row.AGENT_CODE || '') + ' (' + (row.AGENT_NAME || '') + ')';
                    }
                },
                {
                    data: 'AMOUNT',
                    className: 'text-center marker-history-col-amount',
                    render: function (data) {
                        return formatMarkerHistoryAmount(data);
                    }
                },
                { data: 'TRANSACTION_INFO', render: function (data, type, row) { return renderTransactionType(data, type, row); } },
                { data: 'ENCODED_DT' },
                { data: 'REMARKS', defaultContent: '' }
            ],
            columnDefs: [
                {
                    targets: 3,
                    className: 'text-center',
                    render: function (data, type, row) {
                        if (type === 'sort') {
                            if (!window.moment) return data;
                            var mSort = parseMarkerHistoryDateString(data);
                            return mSort ? mSort.format('YYYY-MM-DD HH:mm:ss') : data;
                        }
                        if (!window.moment) return data;
                        var dateMoment = parseMarkerHistoryDateString(data);
                        return dateMoment ? dateMoment.local().format('DD MMM, YYYY HH:mm') : (data || '');
                    }
                },
                {
                    targets: 4,
                    className: 'marker-history-col-remarks',
                    render: function (data, type, row) {
                        var raw = data != null ? String(data) : '';
                        if (type === 'sort' || type === 'filter') {
                            return raw;
                        }
                        if (type !== 'display') {
                            return raw;
                        }
                        // Friendly coin tags + thousand separators (hide internal SETTLE_LEDGER_ID)
                        var displayRaw = raw
                            .replace(/\s*\|\s*SETTLE_LEDGER_ID\s*:\s*\d+/gi, '')
                            .replace(/\b(COIN_AMOUNT|DEPOSIT_CREDIT|COIN_VALUE|DEBT_SETTLED)\s*:\s*([\d,]+(?:\.\d+)?)/gi, function (_m, key, num) {
                                var n = parseFloat(String(num).replace(/,/g, ''));
                                if (isNaN(n)) return _m;
                                var labelMap = {
                                    COIN_AMOUNT: 'Coin Amount',
                                    DEPOSIT_CREDIT: 'Deposit Credit',
                                    COIN_VALUE: 'Coin Value',
                                    DEBT_SETTLED: 'Credit Settled'
                                };
                                var label = labelMap[String(key).toUpperCase()] || key;
                                return label + ' = ' + Number(n).toLocaleString('en-US');
                            });
                        var safe = escapeHtml(displayRaw);
                        var textHtml = safe ? safe : '<span class="text-muted">—</span>';
                        if (!isSuperAdmin) {
                            return textHtml;
                        }
                        var id = row.IDNo != null ? String(row.IDNo) : '';
                        var enc = encodeURIComponent(raw);
                        var t = translations;
                        var editTitle = (t.edit_remarks || 'Edit remarks').replace(/"/g, '&quot;');
                        var delTitle = (t.delete || 'Delete').replace(/"/g, '&quot;');
                        return (
                            '<div class="marker-history-remarks-cell d-flex align-items-start gap-2 justify-content-between">' +
                            '<span class="marker-history-remarks-text flex-grow-1 text-break">' + textHtml + '</span>' +
                            '<span class="marker-history-remarks-actions flex-shrink-0 d-flex gap-1">' +
                            '<button type="button" class="btn btn-sm btn-light border btn-edit-marker-remarks" data-id="' + id + '" data-remarks="' + enc + '" title="' + editTitle + '"><i class="fa fa-pen"></i></button>' +
                            '<button type="button" class="btn btn-sm btn-danger-subtle btn-delete-marker" data-id="' + id + '" title="' + delTitle + '"><i class="fa fa-trash-alt"></i></button>' +
                            '</span></div>'
                        );
                    }
                }
            ]
        });

        // Edit remarks (Super Admin)
        $table.off('click.markerEditRemarks').on('click.markerEditRemarks', '.btn-edit-marker-remarks', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var btn = $(this);
            var id = btn.data('id');
            if (!id) return;
            var perms = parseInt($('#user-role').data('permissions'), 10);
            if ($('#user-role').length && perms !== 0) return;

            var rawRemarks = '';
            try {
                rawRemarks = decodeURIComponent(String(btn.attr('data-remarks') || ''));
            } catch (err) {
                rawRemarks = '';
            }

            var t = window.markerTranslations || {};
            var title = t.edit_remarks || 'Edit remarks';
            var saveLabel = t.save || 'Save';
            var okMsg = t.remarks_updated || 'Remarks updated.';
            var errMsg = t.error_update_remarks || 'Could not update remarks.';

            function doPatch(newVal) {
                btn.prop('disabled', true);
                $.ajax({
                    url: '/marker_record/' + id + '/remarks',
                    method: 'PATCH',
                    contentType: 'application/json',
                    data: JSON.stringify({ remarks: newVal != null ? String(newVal) : '' }),
                    success: function (res) {
                        if (res.success) {
                            if (table && table.ajax) table.ajax.reload();
                            if (window.Swal) window.Swal.fire({ icon: 'success', title: 'Success', text: res.message || okMsg });
                        } else {
                            if (window.Swal) window.Swal.fire({ icon: 'error', title: 'Error', text: res.message || errMsg });
                        }
                    },
                    error: function (xhr) {
                        var msg = (xhr.responseJSON && xhr.responseJSON.message) || errMsg;
                        if (window.Swal) window.Swal.fire({ icon: 'error', title: 'Error', text: msg });
                    },
                    complete: function () { btn.prop('disabled', false); }
                });
            }

            if (window.Swal) {
                // Bootstrap modal focus trap steals focus from SweetAlert2 inputs; allow focus inside Swal
                function allowSwalFocus(e) {
                    if (e.target && e.target.closest && e.target.closest('.swal2-container')) {
                        e.stopImmediatePropagation();
                    }
                }
                window.addEventListener('focusin', allowSwalFocus, true);
                window.Swal.fire({
                    title: title,
                    input: 'textarea',
                    inputValue: rawRemarks,
                    inputAttributes: { maxlength: 500, 'aria-label': title },
                    showCancelButton: true,
                    confirmButtonText: saveLabel,
                    cancelButtonColor: '#6c757d',
                    focusConfirm: false,
                    heightAuto: false,
                    didOpen: function () {
                        var inp = window.Swal.getInput();
                        if (inp) {
                            inp.removeAttribute('readonly');
                            inp.removeAttribute('disabled');
                            setTimeout(function () {
                                inp.focus();
                            }, 50);
                        }
                    },
                    willClose: function () {
                        window.removeEventListener('focusin', allowSwalFocus, true);
                    }
                }).then(function (result) {
                    window.removeEventListener('focusin', allowSwalFocus, true);
                    if (result.isConfirmed) {
                        doPatch(result.value);
                    }
                });
            } else {
                var p = window.prompt(title, rawRemarks);
                if (p !== null) doPatch(p);
            }
        });

        // Delete button click (delegated)
        $table.off('click.markerDelete').on('click.markerDelete', '.btn-delete-marker', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var btn = $(this);
            var id = btn.data('id');
            if (!id) return;
            var perms = parseInt($('#user-role').data('permissions'), 10);
            if ($('#user-role').length && perms !== 0) return; // Super Admin only

            var confirmMsg = (window.markerTranslations && window.markerTranslations.confirm_delete) || 'Are you sure you want to delete this record?';
            var confirmTitle = (window.markerTranslations && window.markerTranslations.delete) || 'Delete';

            if (window.Swal) {
                window.Swal.fire({
                    icon: 'warning',
                    title: confirmTitle,
                    text: confirmMsg,
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#6c757d',
                    confirmButtonText: (window.markerTranslations && window.markerTranslations.yes_delete) || 'Yes, delete'
                }).then(function (result) {
                    if (result.isConfirmed) {
                        btn.prop('disabled', true);
                        $.ajax({
                            url: '/marker_record/' + id,
                            method: 'DELETE',
                            success: function (res) {
                                if (res.success) {
                                    if (table && table.ajax) table.ajax.reload();
                                    $.getJSON('/marker_total_credits_issue', function (data) {
                                        var total = (data && data.total != null) ? data.total : 0;
                                        var numStr = Number(total).toLocaleString();
                                        $('#txtTotalMarkerIssue').val(numStr);
                                        $('#dashboard-credit-value').html('₱ ' + numStr);
                                    });
                                    var formApi = $table.data('markerFormApi');
                                    if (formApi && formApi.populateAccounts) formApi.populateAccounts();
                                }
                                if (window.Swal) window.Swal.fire({ icon: 'success', title: 'Success', text: res.message || 'Record deleted.' });
                                if (typeof window.reloadData === 'function') window.reloadData();
                            },
                            error: function (xhr) {
                                var msg = (xhr.responseJSON && xhr.responseJSON.message) || 'Error deleting record.';
                                if (window.Swal) window.Swal.fire({ icon: 'error', title: 'Error', text: msg });
                            },
                            complete: function () { btn.prop('disabled', false); }
                        });
                    }
                });
            } else {
                if (confirm(confirmMsg)) {
                    btn.prop('disabled', true);
                    $.ajax({
                        url: '/marker_record/' + id,
                        method: 'DELETE',
                        success: function (res) {
                            if (res.success) {
                                if (table && table.ajax) table.ajax.reload();
                                $.getJSON('/marker_total_credits_issue', function (data) {
                                    var total = (data && data.total != null) ? data.total : 0;
                                    var numStr = Number(total).toLocaleString();
                                    $('#txtTotalMarkerIssue').val(numStr);
                                    $('#dashboard-credit-value').html('₱ ' + numStr);
                                });
                                var formApi = $table.data('markerFormApi');
                                if (formApi && formApi.populateAccounts) formApi.populateAccounts();
                            }
                            if (typeof window.reloadData === 'function') window.reloadData();
                        },
                        complete: function () { btn.prop('disabled', false); }
                    });
                }
            }
        });

        return table;
    }

    function initExport(table, exportBtnSelector, options) {
        options = options || {};
        if (!table || !exportBtnSelector) return;
        var $btn = $(exportBtnSelector);
        if (!$btn.length) return;

        $btn.off('click.markerExport').on('click.markerExport', function () {
            var fileName = options.fileName || 'CreditData.xlsx';
            var data = table.rows({ search: 'applied' }).data().toArray();
            var headers = ['ACCOUNT NAME', 'AMOUNT', 'TRANSACTION TYPE', 'DATE', 'REMARKS'];
            var rows = [];
            data.forEach(function (row) {
                var dateCell = row.ENCODED_DT || '';
                if (dateCell && window.moment) {
                    var md = parseMarkerHistoryDateString(dateCell);
                    if (md) dateCell = md.format('DD MMM, YYYY HH:mm');
                }
                rows.push([
                    (row.AGENT_CODE || '') + ' (' + (row.AGENT_NAME || '') + ')',
                    Number(row.AMOUNT) || 0,
                    getTransactionLabel(row.TRANSACTION_ID),
                    dateCell,
                    row.REMARKS || ''
                ]);
            });

            // Prefer ExcelJS (styled export). Fallback to SheetJS (unstyled) if ExcelJS not present.
            if (typeof ExcelJS !== 'undefined') {
                function cellBorder() {
                    var edge = { style: 'thin', color: { argb: 'FF000000' } };
                    return { top: edge, left: edge, bottom: edge, right: edge };
                }
                var wb = new ExcelJS.Workbook();
                var ws = wb.addWorksheet('Credit Data', { views: [{ state: 'frozen', ySplit: 1 }] });
                ws.addRow(headers);
                rows.forEach(function (r) { ws.addRow(r); });

                // Auto-fit with caps
                var minW = [24, 12, 18, 20, 28];
                var maxW = [42, 18, 22, 26, 56];
                var maxLens = headers.map(function (h) { return String(h || '').length; });
                rows.forEach(function (r) {
                    r.forEach(function (v, i) {
                        var t = (typeof v === 'number') ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(v || '');
                        if (t.length > maxLens[i]) maxLens[i] = t.length;
                    });
                });
                for (var c = 1; c <= headers.length; c++) {
                    var idx = c - 1;
                    ws.getColumn(c).width = Math.min(maxW[idx], Math.max(minW[idx], maxLens[idx] + 2));
                }

                var hdr = ws.getRow(1);
                hdr.height = 22;
                hdr.eachCell({ includeEmpty: true }, function (cell, colNumber) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
                    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                    cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'right' : 'center', wrapText: true };
                    cell.border = cellBorder();
                });

                ws.eachRow(function (row, rowNumber) {
                    if (rowNumber === 1) return;
                    row.height = 18;
                    row.eachCell({ includeEmpty: true }, function (cell, colNumber) {
                        if (colNumber === 2 && typeof cell.value === 'number') cell.numFmt = '#,##0';
                        cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'right' : 'center', wrapText: false };
                        cell.border = cellBorder();
                    });
                });

                wb.xlsx.writeBuffer().then(function (buffer) {
                    var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                });
                return;
            }

            if (typeof XLSX === 'undefined') {
                console.error('Excel export library not loaded');
                return;
            }
            // Fallback: SheetJS without styling
            var wsData = [headers].concat(rows.map(function (r) {
                return [r[0], String(r[1]), r[2], r[3], r[4]];
            }));
            var wb2 = XLSX.utils.book_new();
            var ws2 = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb2, ws2, 'Credit Data');
            XLSX.writeFile(wb2, fileName);
        });
    }

    function initForm(table, opts) {
        opts = opts || {};
        var formSelector = opts.formSelector || '#add_marker_settlement';
        var accountSelectSelector = opts.accountSelectSelector || '#txtAccountMarker';
        var markerIssueSelector = opts.markerIssueSelector || '#txtMarkerIssue';
        var markerReturnSelector = opts.markerReturnSelector || '#txtMarkerReturn';
        var markerBalanceSelector = opts.markerBalanceSelector || '#txtMarkerBalance';
        var remarksSelector = opts.remarksSelector || '#txtRemarks';
        var submitBtnSelector = opts.submitBtnSelector || '#submit_marker_settlement';
        var agentBalanceSelector = opts.agentBalanceSelector || '#AgentBalance';
        var optTransTypeName = opts.optTransTypeName || 'optTransType';
        var optReturnSourceName = opts.optReturnSourceName || 'optReturnSource';
        var selectPlaceholder = opts.selectPlaceholder || 'Select account';
        var dropdownParent = opts.dropdownParent || 'body';
        var isSubmitting = false;
        var markerData = [];
        var markerBreakdownData = [];

        var $form = $(formSelector);
        var $accountSelect = $(accountSelectSelector);
        var $submitBtn = $(submitBtnSelector);
        if (!$form.length || !$accountSelect.length) return;

        function initAccountSelect2() {
            if (typeof $accountSelect.select2 !== 'function') return;
            if ($accountSelect.data('select2')) {
                try { $accountSelect.select2('destroy'); } catch (e) {}
            }
            var $parent = typeof dropdownParent === 'string' ? $(dropdownParent) : dropdownParent;
            if (!$parent || !$parent.length) $parent = $form.length ? $form : $('body');
            $accountSelect.select2({
                placeholder: selectPlaceholder,
                allowClear: false,
                width: '100%',
                dropdownParent: $parent
            });
        }

        function getSelectedReturnSource() {
            return $('input[name="' + optReturnSourceName + '"]:checked').val();
        }

        function findBreakdownAccount(accountId) {
            return (markerBreakdownData || []).filter(function (a) { return String(a.ACCOUNT_ID) === String(accountId); })[0];
        }

        function getSourceAmountByRow(row, source) {
            if (!row) return 0;
            if (source === 'credit') return row.BALANCE_CREDIT != null ? Number(row.BALANCE_CREDIT) : 0;
            if (source === 'buyin_coin') return row.BALANCE_BUYIN_COIN != null ? Number(row.BALANCE_BUYIN_COIN) : 0;
            if (source === 'buyin') {
                if (row.BALANCE_BUYIN_CASH != null) return Number(row.BALANCE_BUYIN_CASH);
                return row.BALANCE_BUYIN != null ? Number(row.BALANCE_BUYIN) : 0;
            }
            return row.TOTAL_AMOUNT != null ? Number(row.TOTAL_AMOUNT) : 0;
        }

        function getSelectedCoinPayMode() {
            var $mode = $form.find('input[name="optCoinPayMode"]:checked');
            return $mode.length ? $mode.val() : 'coin_value';
        }

        function syncCoinReturnUi() {
            var selectedSource = getSelectedReturnSource();
            var isCoinSource = selectedSource === 'buyin_coin';
            var coinMode = isCoinSource ? getSelectedCoinPayMode() : null;
            var isCoinSettle = isCoinSource && coinMode === 'coin_value';
            var isPayRemaining = isCoinSource && coinMode === 'pay_remaining';
            var t = window.markerTranslations || {};

            $form.find('.marker-coin-pay-mode-row').toggleClass('d-none', !isCoinSource);
            // Cash/Deposit only when not coin-source, or when paying remaining with cash/deposit
            // Use d-none (!important) so Bootstrap d-flex cannot keep them visible
            var showCashDeposit = !isCoinSource || isPayRemaining;
            $form.find('.marker-cash-deposit-heading').toggleClass('d-none', !showCashDeposit);
            $form.find('.marker-cash-deposit-row').toggleClass('d-none', !showCashDeposit);
            // Entire cash/deposit actions row (page): hide when settle so only left Save shows
            $form.find('.marker-page-actions').toggleClass('d-none', isCoinSettle);
            $form.find('.marker-coin-amount-row').toggleClass('d-none', !isCoinSettle);
            if (!isCoinSettle) {
                $form.find('input[name="txtCoinAmount"]').val('');
            }

            // Credit History page only: move Save to left under remarks when Settle Coin Value
            var $settleSaveRow = $form.find('.marker-settle-save-row');
            var $settleSaveSlot = $form.find('.marker-settle-save-slot');
            var $saveGap = $form.find('.marker-save-gap');
            var $saveBtn = $form.find(submitBtnSelector);
            if ($settleSaveRow.length && $settleSaveSlot.length && $saveBtn.length) {
                if (isCoinSettle) {
                    $settleSaveRow.removeClass('d-none');
                    $settleSaveSlot.append($saveBtn);
                    $saveGap.addClass('d-none');
                } else {
                    $settleSaveRow.addClass('d-none');
                    $saveGap.removeClass('d-none');
                    $saveGap.after($saveBtn);
                }
            }

            var $coinOpt = $form.find('input[name="' + optTransTypeName + '"][value="coin"]');
            var $cashOpt = $form.find('input[name="' + optTransTypeName + '"][value="11"]');
            var $depositOpt = $form.find('input[name="' + optTransTypeName + '"][value="12"]');

            if (isCoinSettle) {
                $cashOpt.prop('checked', false);
                $depositOpt.prop('checked', false);
                $coinOpt.prop('checked', true);
            } else if (isPayRemaining) {
                $coinOpt.prop('checked', false);
                if (!$cashOpt.is(':checked') && !$depositOpt.is(':checked')) {
                    $cashOpt.prop('checked', true);
                }
            } else {
                $coinOpt.prop('checked', false);
            }

            var coinValueLabel = t.coin_value_peso || 'Coin Value (₱)';
            var creditsReturnLabel = t.credits_return || 'Credits Return';

            var $returnLabel = $(markerReturnSelector).closest('.col-sm-6').find('.form-label').first();
            if ($returnLabel.length) {
                if (!$returnLabel.data('defaultLabel')) {
                    $returnLabel.data('defaultLabel', $returnLabel.text() || creditsReturnLabel);
                }
                $returnLabel.text(isCoinSettle ? coinValueLabel : $returnLabel.data('defaultLabel'));
            }

            var $returnInput = $(markerReturnSelector);
            if ($returnInput.length && $returnInput.attr('placeholder') != null) {
                if (!$returnInput.data('defaultPlaceholder')) {
                    $returnInput.data('defaultPlaceholder', $returnInput.attr('placeholder') || creditsReturnLabel);
                }
                $returnInput.attr('placeholder', isCoinSettle ? coinValueLabel : $returnInput.data('defaultPlaceholder'));
            }

            if (isCoinSettle) {
                autofillOutstandingCoinAmount();
            }
        }

        function autofillOutstandingCoinAmount() {
            var $coinAmountInput = $form.find('input[name="txtCoinAmount"]');
            if (!$coinAmountInput.length) return;
            if (getSelectedReturnSource() !== 'buyin_coin' || getSelectedCoinPayMode() !== 'coin_value') {
                return;
            }
            var selectedAccountId = $accountSelect.val();
            if (!selectedAccountId) {
                $coinAmountInput.val('');
                return;
            }
            var breakdownAcc = findBreakdownAccount(selectedAccountId);
            var outstanding = breakdownAcc && breakdownAcc.OUTSTANDING_COIN_AMOUNT != null
                ? Number(breakdownAcc.OUTSTANDING_COIN_AMOUNT)
                : 0;
            if (outstanding > 0) {
                $coinAmountInput.val(formatWithCommas(outstanding));
            } else {
                // Buy-in coins already fully recorded on prior settles — leave blank for new coins
                $coinAmountInput.val('');
                var debtLeft = breakdownAcc ? getSourceAmountByRow(breakdownAcc, 'buyin_coin') : 0;
                if (debtLeft > 0) {
                    var tCoin = window.markerTranslations || {};
                    $coinAmountInput.attr('placeholder', tCoin.coin_amount_new || 'New coins received');
                }
            }
        }

        function refreshAccountOptionsBySource() {
            var selectedSource = getSelectedReturnSource();
            if ($accountSelect.data('select2')) {
                try { $accountSelect.select2('destroy'); } catch (e) {}
            }
            $accountSelect.empty().append('<option value="">' + selectPlaceholder + '</option>');

            var sourceList = [];
            if (selectedSource) {
                sourceList = (markerBreakdownData || []).filter(function (row) {
                    return getSourceAmountByRow(row, selectedSource) > 0;
                }).map(function (row) {
                    return {
                        ACCOUNT_ID: row.ACCOUNT_ID,
                        AGENT_CODE: row.AGENT_CODE,
                        AGENT_NAME: row.AGENT_NAME
                    };
                });
            } else {
                sourceList = [];
            }

            sourceList.forEach(function (account) {
                $accountSelect.append(
                    $('<option></option>').val(account.ACCOUNT_ID).text((account.AGENT_CODE || '') + ' - ' + (account.AGENT_NAME || ''))
                );
            });
            initAccountSelect2();
        }

        function updateIssueAndBalanceBySelectedAccount() {
            var selectedAccountId = $accountSelect.val();
            if (!selectedAccountId) {
                $(markerIssueSelector).val('');
                $(markerBalanceSelector).val('');
                $form.find('input[name="txtCoinAmount"]').val('');
                return;
            }
            var selectedSource = getSelectedReturnSource();
            if (selectedSource) {
                var breakdownAcc = findBreakdownAccount(selectedAccountId);
                var sourceAmount = getSourceAmountByRow(breakdownAcc, selectedSource);
                $(markerIssueSelector).val(formatWithCommas(sourceAmount));
                $(markerBalanceSelector).val(formatWithCommas(sourceAmount));
                if (selectedSource === 'buyin_coin' && getSelectedCoinPayMode() === 'coin_value') {
                    autofillOutstandingCoinAmount();
                }
                return;
            }
            var selectedAccount = (markerData || []).filter(function (a) { return String(a.ACCOUNT_ID) === String(selectedAccountId); })[0];
            var totalIssue = selectedAccount ? (selectedAccount.TOTAL_AMOUNT || 0) : 0;
            $(markerIssueSelector).val(formatWithCommas(totalIssue));
            $(markerBalanceSelector).val(formatWithCommas(totalIssue));
        }

        // Populate accounts (call this on modal show or page load). Optional callback(accounts) runs after data is loaded.
        function populateAccounts(callback) {
            $.when(
                $.ajax({ url: '/marker_data', method: 'GET' }),
                $.ajax({ url: '/marker_data_breakdown', method: 'GET' })
            ).done(function (markerRes, breakdownRes) {
                markerData = markerRes && markerRes[0] ? markerRes[0] : [];
                markerBreakdownData = breakdownRes && breakdownRes[0] ? breakdownRes[0] : [];
                refreshAccountOptionsBySource();
                updateIssueAndBalanceBySelectedAccount();
                if (typeof callback === 'function') callback(markerData);
            }).fail(function (err) {
                console.error('Error fetching marker data:', err);
                markerData = [];
                markerBreakdownData = [];
                refreshAccountOptionsBySource();
                if (typeof callback === 'function') callback([]);
            });
        }

        if (opts.populateAccountsOnInit) {
            populateAccounts();
        }

        $accountSelect.off('change.markerForm').on('change.markerForm', function () {
            updateIssueAndBalanceBySelectedAccount();
        });

        $(document).off('change.markerReturnSource', 'input[name="' + optReturnSourceName + '"]').on('change.markerReturnSource', 'input[name="' + optReturnSourceName + '"]', function () {
            var currentAccount = $accountSelect.val();
            if (getSelectedReturnSource() === 'buyin_coin') {
                var $settleMode = $form.find('input[name="optCoinPayMode"][value="coin_value"]');
                if ($settleMode.length) $settleMode.prop('checked', true);
            }
            refreshAccountOptionsBySource();
            syncCoinReturnUi();
            if (currentAccount && $accountSelect.find('option[value="' + currentAccount + '"]').length) {
                $accountSelect.val(currentAccount).trigger('change');
            } else {
                $accountSelect.val('').trigger('change');
                $(markerIssueSelector).val('');
                $(markerBalanceSelector).val('');
            }
        });
        $(document).off('change.markerCoinPayMode', 'input[name="optCoinPayMode"]').on('change.markerCoinPayMode', 'input[name="optCoinPayMode"]', function () {
            syncCoinReturnUi();
        });
        $(document).off('change.markerTransType', 'input[name="' + optTransTypeName + '"]').on('change.markerTransType', 'input[name="' + optTransTypeName + '"]', function () {
            syncCoinReturnUi();
        });
        syncCoinReturnUi();

        // Agent balance for deposit check (account_details_data_deposit)
        $accountSelect.off('change.markerBalance').on('change.markerBalance', function () {
            var accountId = $(this).val();
            if (!accountId) return;
            $.ajax({
                url: '/account_details_data_deposit/' + accountId,
                method: 'GET',
                success: function (data) {
                    var deposit_amount = 0, withdraw_amount = 0, marker_deposit_amount = 0, marker_return = 0;
                    (data || []).forEach(function (row) {
                        var amount = parseFloat(row.AMOUNT) || 0;
                        if (row.TRANSACTION === 'DEPOSIT') deposit_amount += amount;
                        else if (row.TRANSACTION === 'WITHDRAW') withdraw_amount += amount;
                        else if (row.TRANSACTION === 'MARKER REDEEM') marker_deposit_amount += amount;
                        else if (row.TRANSACTION === 'IOU RETURN DEPOSIT') marker_return += amount;
                    });
                    var totalBalance = deposit_amount + marker_deposit_amount - withdraw_amount - marker_return;
                    $(agentBalanceSelector).val(totalBalance);
                }
            });
        });

        // Format marker return input and balance
        $(markerReturnSelector).off('input.markerForm focusout.markerForm').on('input.markerForm', function () {
            var markerIssue = parseFloat($(markerIssueSelector).val().replace(/,/g, '')) || 0;
            var raw = $(this).val().replace(/,/g, '');
            var markerReturn = parseFloat(raw) || 0;
            var allowOverage = getSelectedReturnSource() === 'buyin_coin' && getSelectedCoinPayMode() === 'coin_value';
            if (!allowOverage && markerReturn > markerIssue) {
                $(this).val(formatWithCommas(markerIssue));
                $(markerBalanceSelector).val(formatWithCommas(0));
            } else if (allowOverage && markerReturn > markerIssue) {
                $(markerBalanceSelector).val(formatWithCommas(0));
            } else {
                $(markerBalanceSelector).val(formatWithCommas(Math.max(0, markerIssue - markerReturn)));
            }
            $(this).val(formatWithCommas(raw));
        }).on('focusout.markerForm', function () {
            var raw = $(this).val().replace(/,/g, '');
            $(this).val(formatWithCommas(raw));
        });

        $form.off('submit.markerForm').on('submit.markerForm', function (e) {
            e.preventDefault();
            if (isSubmitting) return;

            var selectedAccount = $(accountSelectSelector).val();
            var selectedTransType = $('input[name="' + optTransTypeName + '"]:checked').val();
            var markerIssue = parseFloat($(markerIssueSelector).val().replace(/,/g, '')) || 0;
            var markerReturnRaw = $(markerReturnSelector).val().replace(/,/g, '');
            var markerReturn = parseFloat(markerReturnRaw) || 0;
            var selectedReturnSource = $('input[name="' + optReturnSourceName + '"]:checked').val();

            if (!selectedAccount) {
                if (window.Swal) Swal.fire({ icon: 'error', title: 'Missing Information', text: 'Please select an account.' });
                return;
            }
            if (!selectedReturnSource) {
                if (window.Swal) Swal.fire({ icon: 'error', title: 'Missing Information', text: 'Please select where to deduct the return (Cash Credit, Game Credit Cash, or Game Credit Coin).' });
                return;
            }
            if (selectedReturnSource === 'buyin_coin') {
                var coinPayMode = getSelectedCoinPayMode();
                if (coinPayMode === 'coin_value') {
                    $form.find('input[name="' + optTransTypeName + '"][value="coin"]').prop('checked', true);
                    selectedTransType = 'coin';
                    var coinAmountRaw = ($form.find('input[name="txtCoinAmount"]').val() || '').toString().replace(/,/g, '').trim();
                    var coinAmountVal = parseFloat(coinAmountRaw) || 0;
                    if (!coinAmountRaw || coinAmountVal <= 0) {
                        if (window.Swal) Swal.fire({ icon: 'error', title: 'Missing Information', text: 'Please enter the Coin Amount (physical coins received).' });
                        return;
                    }
                } else if (!selectedTransType || selectedTransType === 'coin') {
                    if (window.Swal) Swal.fire({ icon: 'error', title: 'Missing Information', text: 'Please select Cash or Deposit to pay the remaining Game Credit (Coin).' });
                    return;
                }
            } else if (!selectedTransType || selectedTransType === 'coin') {
                if (window.Swal) Swal.fire({ icon: 'error', title: 'Missing Information', text: 'Please select a transaction type (Cash or Deposit).' });
                return;
            }
            if (!markerReturnRaw || markerReturn <= 0) {
                var amountMsg = (selectedReturnSource === 'buyin_coin' && getSelectedCoinPayMode() === 'coin_value')
                    ? 'Coin Value must be greater than zero.'
                    : 'Credit Return must be greater than zero.';
                if (window.Swal) Swal.fire({ icon: 'error', title: 'Invalid Amount', text: amountMsg });
                return;
            }
            if (markerReturn > markerIssue) {
                var allowOverageSubmit = selectedReturnSource === 'buyin_coin' && getSelectedCoinPayMode() === 'coin_value';
                if (!allowOverageSubmit) {
                    if (window.Swal) Swal.fire({ icon: 'error', title: 'Invalid Return', text: 'Amount cannot be greater than Credit Issue!' });
                    return;
                }
            }

            var accountMarker = $accountSelect.find('option:selected').text();
            var markerReturnFormatted = $(markerReturnSelector).val();
            var tSubmit = window.markerTranslations || {};
            var transTypeLabel;
            if (selectedTransType === 'coin') {
                transTypeLabel = tSubmit.coin_mode_settle || 'Settle Coin Value';
            } else {
                transTypeLabel = $('input[name="' + optTransTypeName + '"]:checked').next('label').text();
            }
            var returnSourceLabel = $('input[name="' + optReturnSourceName + '"]:checked').next('label').text();
            var coinAmountFormatted = '';
            if (selectedTransType === 'coin') {
                var coinAmtRawConfirm = ($form.find('input[name="txtCoinAmount"]').val() || '').toString().replace(/,/g, '').trim();
                coinAmountFormatted = formatWithCommas(coinAmtRawConfirm);
            }
            var depositOverage = 0;
            if (selectedTransType === 'coin' && markerReturn > markerIssue) {
                depositOverage = Math.round((markerReturn - markerIssue) * 100) / 100;
            }
            var confirmExtraCoinRow = coinAmountFormatted
                ? '<tr><td style="padding:8px 4px 8px 0;font-weight:bold">Coin Amount:</td><td style="padding:8px 0 8px 4px">' + coinAmountFormatted + '</td></tr>'
                : '';
            var confirmOverageRow = depositOverage > 0
                ? '<tr><td style="padding:8px 4px 8px 0;font-weight:bold">To Deposit:</td><td style="padding:8px 0 8px 4px">' + formatWithCommas(depositOverage) + '</td></tr>'
                : '';
            var confirmTableHtml = '<div style="text-align:center;margin-bottom:20px">' +
                '<table style="margin:0 auto"><tr><td style="padding:8px 4px 8px 0;font-weight:bold">Account:</td><td style="padding:8px 0 8px 4px">' + (accountMarker || 'N/A') + '</td></tr>' +
                '<tr><td style="padding:8px 4px 8px 0;font-weight:bold">' + (selectedTransType === 'coin' ? 'Coin Value:' : 'Amount:') + '</td><td style="padding:8px 0 8px 4px">' + (markerReturnFormatted || '0') + '</td></tr>' +
                confirmExtraCoinRow +
                confirmOverageRow +
                '<tr><td style="padding:8px 4px 8px 0;font-weight:bold">Transaction:</td><td style="padding:8px 0 8px 4px">' + (transTypeLabel || 'N/A') + '</td></tr>' +
                '<tr><td style="padding:8px 4px 8px 0;font-weight:bold">Deduct From:</td><td style="padding:8px 0 8px 4px">' + (returnSourceLabel || 'N/A') + '</td></tr></table>' +
                (depositOverage > 0
                    ? '<p style="margin-top:15px">Excess coin value will be credited to Deposit. Proceed?</p></div>'
                    : '<p style="margin-top:15px">Are you sure you want to proceed with this marker return?</p></div>');

            var proceedSubmitFlow = function () {
                var showConfirmAndSubmit = function () {
                    var savedAccountId = $accountSelect.val();
                    isSubmitting = true;
                    var origHtml = $submitBtn.html();
                    $submitBtn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm" role="status"></span> Loading...');
                    $.ajax({
                        url: '/add_marker_settlement',
                        method: 'POST',
                        data: $form.serialize(),
                        success: function (response) {
                            if (response.success) {
                                $form[0].reset();
                                syncCoinReturnUi();
                                if (table && table.ajax) table.ajax.reload();
                                $.getJSON('/marker_total_credits_issue', function (data) {
                                    var total = (data && data.total != null) ? data.total : 0;
                                    var numStr = Number(total).toLocaleString();
                                    $('#txtTotalMarkerIssue').val(numStr);
                                    $('#dashboard-credit-value').html('₱ ' + numStr);
                                });
                                // Reload account list and refresh balance for current account so UI updates without page refresh
                                populateAccounts(function (accounts) {
                                    if (savedAccountId) {
                                        $accountSelect.val(savedAccountId).trigger('change');
                                        updateIssueAndBalanceBySelectedAccount();
                                    }
                                });
                                if (window.Swal) {
                                    Swal.fire({ icon: 'success', title: 'Success', text: 'Marker Return Successfully!' });
                                }
                                if (opts.onSuccess) opts.onSuccess();
                            } else if (response.error === 'Insufficient balance for this deposit transaction.') {
                                if (window.Swal) Swal.fire({ icon: 'error', title: 'Insufficient Balance', text: response.error });
                            } else {
                                if (window.Swal) Swal.fire({ icon: 'error', title: 'Error', text: response.message || 'Error processing your request.' });
                            }
                        },
                        error: function () {
                            if (window.Swal) Swal.fire({ icon: 'error', title: 'Insufficient Balance', text: 'Insufficient balance for this deposit transaction.' });
                        },
                        complete: function () {
                            isSubmitting = false;
                            $submitBtn.prop('disabled', false).html(origHtml);
                        }
                    });
                };

                // Deposit (12): check balance BEFORE showing confirm; insufficient = show error immediately
                // Coin value settle skips deposit check
                if (selectedTransType === '12') {
                    $.ajax({
                        url: '/account_details_data_deposit/' + selectedAccount,
                        method: 'GET',
                        success: function (data) {
                            var deposit_amount = 0, withdraw_amount = 0, marker_deposit_amount = 0, marker_return = 0;
                            (data || []).forEach(function (row) {
                                var amount = parseFloat(row.AMOUNT) || 0;
                                if (row.TRANSACTION === 'DEPOSIT') deposit_amount += amount;
                                else if (row.TRANSACTION === 'WITHDRAW') withdraw_amount += amount;
                                else if (row.TRANSACTION === 'MARKER REDEEM') marker_deposit_amount += amount;
                                else if (row.TRANSACTION === 'IOU RETURN DEPOSIT') marker_return += amount;
                            });
                            var totalBalance = deposit_amount + marker_deposit_amount - withdraw_amount - marker_return;
                            if (totalBalance < markerReturn) {
                                if (window.Swal) Swal.fire({ icon: 'error', title: 'Insufficient Balance', text: 'Insufficient balance for this deposit transaction.' });
                                return;
                            }
                            if (window.Swal) {
                                Swal.fire({
                                    icon: 'question',
                                    title: 'Confirm Marker Return',
                                    html: confirmTableHtml,
                                    showCancelButton: true,
                                    confirmButtonColor: '#3085d6',
                                    cancelButtonColor: '#d33',
                                    confirmButtonText: 'Yes, Save',
                                    cancelButtonText: 'Cancel'
                                }).then(function (result) {
                                    if (result.isConfirmed) showConfirmAndSubmit();
                                });
                            } else {
                                showConfirmAndSubmit();
                            }
                        },
                        error: function () {
                            if (window.Swal) Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to check balance.' });
                        }
                    });
                } else {
                    if (window.Swal) {
                        Swal.fire({
                            icon: 'question',
                            title: 'Confirm Credit Return',
                            html: confirmTableHtml,
                            showCancelButton: true,
                            confirmButtonColor: '#3085d6',
                            cancelButtonColor: '#d33',
                            confirmButtonText: 'Yes, Save',
                            cancelButtonText: 'Cancel'
                        }).then(function (result) {
                            if (result.isConfirmed) showConfirmAndSubmit();
                        });
                    } else {
                        showConfirmAndSubmit();
                    }
                }
            };

            $.ajax({
                url: '/marker_data_breakdown',
                method: 'GET',
                success: function (rows) {
                    var list = Array.isArray(rows) ? rows : [];
                    var sourceRow = list.filter(function (r) { return String(r.ACCOUNT_ID) === String(selectedAccount); })[0];
                    var sourceBalance = 0;
                    if (sourceRow) {
                        sourceBalance = getSourceAmountByRow(sourceRow, selectedReturnSource);
                    }
                    if (markerReturn > sourceBalance) {
                        var allowOverageValidate = selectedReturnSource === 'buyin_coin' && getSelectedCoinPayMode() === 'coin_value';
                        if (!allowOverageValidate) {
                            var sourceBalanceLabel = selectedReturnSource === 'credit'
                                ? 'Cash Credit Balance'
                                : (selectedReturnSource === 'buyin_coin' ? 'Game Credit (Coin) Balance' : 'Game Credit (Cash) Balance');
                            var sourceBalanceMsg = 'Return amount exceeded the ' + sourceBalanceLabel + '.';
                            if (window.Swal) Swal.fire({ icon: 'error', title: 'Invalid Amount', text: sourceBalanceMsg });
                            else alert(sourceBalanceMsg);
                            return;
                        }
                    }
                    proceedSubmitFlow();
                },
                error: function () {
                    if (window.Swal) Swal.fire({ icon: 'error', title: 'Error', text: 'Unable to validate source balance.' });
                }
            });
        });

        return {
            populateAccounts: populateAccounts
        };
    }

    function applyPermissions(disableSaveExport, submitBtnSelector, exportBtnSelector) {
        if (!disableSaveExport) return;
        var isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly();
        if (isViewOnly) {
            $(submitBtnSelector || '#submit_marker_settlement').prop('disabled', true);
            $(exportBtnSelector || '#export-excel').prop('disabled', true);
        }
    }

    /**
     * Full init for marker UI.
     * @param {Object} options
     * @param {string} [options.tableSelector] - e.g. '#marker-tbl' or '#marker-history-tbl'
     * @param {string} [options.exportBtnSelector] - e.g. '#export-excel'
     * @param {boolean} [options.withForm] - whether to init form (account, return, save)
     * @param {Object} [options.formOptions] - passed to initForm (formSelector, populateAccountsOnInit, onSuccess, etc.)
     * @param {boolean} [options.disableSaveExportByPermission] - if true, disable save/export when permissions === 2
     * @param {string} [options.modalSelector] - if set, populate accounts on modal show and optional reload on modal hidden
     */
    function init(options) {
        options = options || {};
        var tableSelector = options.tableSelector || '#marker-tbl';
        var exportBtnSelector = options.exportBtnSelector || '#export-excel';
        var table = initHistoryTable(tableSelector, options.tableOptions || {});
        if (!table) return null;

        function adjustHistoryTableLayout() {
            if (!table || typeof table.columns !== 'function') return;
            try {
                table.columns.adjust();
            } catch (e) { /* noop */ }
        }

        var markerResizeTimer;
        $(window).off('resize.markerHistoryDt').on('resize.markerHistoryDt', function () {
            clearTimeout(markerResizeTimer);
            markerResizeTimer = setTimeout(function () {
                if ($.fn.DataTable.isDataTable(tableSelector)) adjustHistoryTableLayout();
            }, 150);
        });

        if (options.modalSelector) {
            $(options.modalSelector)
                .off('shown.bs.modal.markerDtCols')
                .on('shown.bs.modal.markerDtCols', function () {
                    adjustHistoryTableLayout();
                });
        }

        function destroyBalanceDataTable(selector) {
            if (!$.fn.DataTable.isDataTable(selector)) return;
            $(selector).DataTable().destroy();
            var $tbl = $(selector);
            $tbl.find('tbody').empty();
            $tbl.find('tfoot th').each(function () { $(this).text(''); });
        }

        function updateAccountsBalanceTable() {
            var $creditTbl = $('#marker-accounts-credit-tbl');
            var $buyinTbl = $('#marker-accounts-buyin-tbl');
            var $buyinCoinTbl = $('#marker-accounts-buyin-coin-tbl');
            var $totalTbl = $('#marker-accounts-total-tbl');
            if (!$creditTbl.length || !$buyinTbl.length) return;
            destroyBalanceDataTable('#marker-accounts-credit-tbl');
            destroyBalanceDataTable('#marker-accounts-buyin-tbl');
            if ($buyinCoinTbl.length) destroyBalanceDataTable('#marker-accounts-buyin-coin-tbl');
            if ($totalTbl.length) destroyBalanceDataTable('#marker-accounts-total-tbl');
            var $creditTbody = $creditTbl.find('tbody');
            var $buyinTbody = $buyinTbl.find('tbody');
            var $buyinCoinTbody = $buyinCoinTbl.length ? $buyinCoinTbl.find('tbody') : $();
            var $totalTbody = $totalTbl.length ? $totalTbl.find('tbody') : $();
            $creditTbody.empty();
            $buyinTbody.empty();
            if ($buyinCoinTbody.length) $buyinCoinTbody.empty();
            if ($totalTbody.length) $totalTbody.empty();
            $.ajax({
                url: '/marker_data_breakdown',
                method: 'GET',
                success: function (data) {
                    var list = Array.isArray(data) ? data : [];
                    var creditRows = [];
                    var buyinCashRows = [];
                    var buyinCoinRows = [];
                    var totalRows = [];
                    var totalCredit = 0;
                    var totalBuyin = 0;
                    var totalBuyinCash = 0;
                    var totalBuyinCoin = 0;
                    var grandTotal = 0;
                    list.forEach(function (row) {
                        var name = (row.AGENT_CODE || '') + ' (' + (row.AGENT_NAME || '') + ')';
                        var credit = row.BALANCE_CREDIT != null ? Number(row.BALANCE_CREDIT) : 0;
                        var buyinCash = row.BALANCE_BUYIN_CASH != null ? Number(row.BALANCE_BUYIN_CASH) : (row.BALANCE_BUYIN != null ? Number(row.BALANCE_BUYIN) : 0);
                        var buyinCoin = row.BALANCE_BUYIN_COIN != null ? Number(row.BALANCE_BUYIN_COIN) : 0;
                        var buyin = buyinCash + buyinCoin;
                        var accountTotal = row.TOTAL_AMOUNT != null ? Number(row.TOTAL_AMOUNT) : (credit + buyin);
                        if (credit !== 0) { creditRows.push({ name: name, amount: credit }); totalCredit += credit; }
                        if (buyinCash !== 0) { buyinCashRows.push({ name: name, amount: buyinCash }); totalBuyinCash += buyinCash; }
                        if (buyinCoin !== 0) { buyinCoinRows.push({ name: name, amount: buyinCoin }); totalBuyinCoin += buyinCoin; }
                        totalBuyin = totalBuyinCash + totalBuyinCoin;
                        if (accountTotal !== 0) {
                            totalRows.push({ name: name, credit: credit, buyin: buyin, buyinCash: buyinCash, buyinCoin: buyinCoin, total: accountTotal });
                            grandTotal += accountTotal;
                        }
                    });
                    var t = window.markerTranslations || {};
                    var totalLabel = t.total || 'Total';
                    creditRows.forEach(function (r) {
                        $creditTbody.append('<tr><td>' + r.name + '</td><td class="text-end marker-balance-col-amount">' + formatMarkerHistoryAmount(r.amount) + '</td></tr>');
                    });
                    if (creditRows.length > 0) {
                        $creditTbl.find('tfoot th').first().addClass('fw-semibold').text(totalLabel);
                        $creditTbl.find('tfoot th').last().addClass('fw-semibold text-end marker-balance-col-amount').text(formatMarkerHistoryAmount(totalCredit));
                        $creditTbl.find('tfoot').show();
                    } else {
                        $creditTbl.find('tfoot').hide();
                    }
                    buyinCashRows.forEach(function (r) {
                        $buyinTbody.append('<tr><td>' + r.name + '</td><td class="text-end marker-balance-col-amount">' + formatMarkerHistoryAmount(r.amount) + '</td></tr>');
                    });
                    if (buyinCashRows.length > 0) {
                        $buyinTbl.find('tfoot th').first().addClass('fw-semibold').text(totalLabel);
                        $buyinTbl.find('tfoot th').last().addClass('fw-semibold text-end marker-balance-col-amount').text(formatMarkerHistoryAmount(totalBuyinCash));
                        $buyinTbl.find('tfoot').show();
                    } else {
                        $buyinTbl.find('tfoot').hide();
                    }
                    if ($buyinCoinTbl.length) {
                        buyinCoinRows.forEach(function (r) {
                            $buyinCoinTbody.append('<tr><td>' + r.name + '</td><td class="text-end marker-balance-col-amount">' + formatMarkerHistoryAmount(r.amount) + '</td></tr>');
                        });
                        if (buyinCoinRows.length > 0) {
                            $buyinCoinTbl.find('tfoot th').first().addClass('fw-semibold').text(totalLabel);
                            $buyinCoinTbl.find('tfoot th').last().addClass('fw-semibold text-end marker-balance-col-amount').text(formatMarkerHistoryAmount(totalBuyinCoin));
                            $buyinCoinTbl.find('tfoot').show();
                        } else {
                            $buyinCoinTbl.find('tfoot').hide();
                        }
                    }
                    if ($totalTbl.length) {
                        totalRows.forEach(function (r) {
                            $totalTbody.append(
                                '<tr><td class="marker-total-col-account">' + r.name + '</td>' +
                                '<td class="text-end marker-balance-col-amount marker-total-col-junket">' + formatMarkerHistoryAmount(r.credit) + '</td>' +
                                '<td class="text-end marker-balance-col-amount marker-total-col-game">' + formatMarkerHistoryAmount(r.buyinCash) + '</td>' +
                                '<td class="text-end marker-balance-col-amount marker-total-col-game-coin">' + formatMarkerHistoryAmount(r.buyinCoin) + '</td>' +
                                '<td class="text-end marker-balance-col-amount marker-total-col-sum">' + formatMarkerHistoryAmount(r.total) + '</td></tr>'
                            );
                        });
                        if (totalRows.length > 0) {
                            $totalTbl.find('tfoot th').eq(0).addClass('fw-semibold').text(totalLabel);
                            $totalTbl.find('tfoot th').eq(1).addClass('fw-semibold text-end marker-balance-col-amount marker-total-col-junket').text(formatMarkerHistoryAmount(totalCredit));
                            $totalTbl.find('tfoot th').eq(2).addClass('fw-semibold text-end marker-balance-col-amount marker-total-col-game').text(formatMarkerHistoryAmount(totalBuyinCash));
                            $totalTbl.find('tfoot th').eq(3).addClass('fw-semibold text-end marker-balance-col-amount marker-total-col-game-coin').text(formatMarkerHistoryAmount(totalBuyinCoin));
                            $totalTbl.find('tfoot th').eq(4).addClass('fw-semibold text-end marker-balance-col-amount marker-total-col-sum').text(formatMarkerHistoryAmount(grandTotal));
                            $totalTbl.find('tfoot').show();
                        } else {
                            $totalTbl.find('tfoot').hide();
                        }
                    }
                    $('#txtTotalJunketCredit').val(formatMarkerHistoryAmount(totalCredit));
                    $('#txtTotalGameCredit').val(formatMarkerHistoryAmount(totalBuyin));
                    if ($('#txtTotalGameCreditCash').length) {
                        $('#txtTotalGameCreditCash').val(formatMarkerHistoryAmount(totalBuyinCash));
                    }
                    if ($('#txtTotalGameCreditCoin').length) {
                        $('#txtTotalGameCreditCoin').val(formatMarkerHistoryAmount(totalBuyinCoin));
                    }
                    if (typeof $.fn.DataTable !== 'undefined') initBalanceDataTables();
                },
                error: function () {
                    $creditTbody.append('<tr><td class="text-danger text-center">Error loading data</td><td class="text-center">—</td></tr>');
                    $buyinTbody.append('<tr><td class="text-danger text-center">Error loading data</td><td class="text-center">—</td></tr>');
                    if ($buyinCoinTbody.length) {
                        $buyinCoinTbody.append('<tr><td class="text-danger text-center">Error loading data</td><td class="text-center">—</td></tr>');
                    }
                    if ($totalTbody.length) {
                        $totalTbody.append('<tr><td class="text-danger text-center" colspan="5">Error loading data</td></tr>');
                    }
                    $('#txtTotalJunketCredit').val('0');
                    $('#txtTotalGameCredit').val('0');
                    $('#txtTotalGameCreditCash').val('0');
                    $('#txtTotalGameCreditCoin').val('0');
                    if (typeof $.fn.DataTable !== 'undefined') initBalanceDataTables();
                }
            });
        }

        function initBalanceDataTables() {
            if (typeof $.fn.DataTable === 'undefined') return;
            var t = window.markerTranslations || {};
            var baseLang = {
                info: t.showing_entries || 'Showing _START_ to _END_ of _TOTAL_ entries',
                infoEmpty: t.info_empty || 'Showing 0 to 0 of 0 entries',
                infoFiltered: t.info_filtered || '(filtered from _MAX_ total entries)',
                lengthMenu: t.length_menu || 'Show _MENU_ entries',
                search: t.search || 'Search:',
                paginate: { first: t.first || 'First', last: t.last || 'Last', previous: t.previous || 'Previous', next: t.next || 'Next' },
                zeroRecords: t.no_data_available || 'No matching records found'
            };
            var creditLang = Object.assign({}, baseLang, { emptyTable: 'No accounts with credit.' });
            var buyinLang = Object.assign({}, baseLang, { emptyTable: 'No accounts with credit.' });
            var buyinCoinLang = Object.assign({}, baseLang, { emptyTable: 'No accounts with coin credit.' });
            var dtOpts = {
                pageLength: 10,
                lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
                order: [[1, 'desc']],
                searching: true,
                paging: true,
                info: true,
                autoWidth: false,
                dom: '<"row g-0 gy-2 mb-2 align-items-center gap-3"<"col-12 col-md-auto"l><"col-12 col-md d-flex justify-content-end align-items-center"f>>rt<"row g-2 mt-2"<"col-12 col-md-6"i><"col-12 col-md-6"p>>',
                columnDefs: [
                    { targets: 1, className: 'text-end marker-balance-col-amount' }
                ]
            };
            $('#marker-accounts-credit-tbl').DataTable(Object.assign({}, dtOpts, { language: creditLang }));
            $('#marker-accounts-buyin-tbl').DataTable(Object.assign({}, dtOpts, { language: buyinLang }));
            if ($('#marker-accounts-buyin-coin-tbl').length) {
                $('#marker-accounts-buyin-coin-tbl').DataTable(Object.assign({}, dtOpts, { language: buyinCoinLang }));
            }
            if ($('#marker-accounts-total-tbl').length && !$.fn.DataTable.isDataTable('#marker-accounts-total-tbl')) {
                var totalLang = Object.assign({}, baseLang, { emptyTable: 'No accounts with credit.' });
                var totalDtOpts = Object.assign({}, dtOpts, {
                    order: [[4, 'desc']],
                    language: totalLang,
                    columnDefs: [
                        { targets: 0, className: 'marker-total-col-account' },
                        { targets: 1, className: 'text-end marker-balance-col-amount marker-total-col-junket' },
                        { targets: 2, className: 'text-end marker-balance-col-amount marker-total-col-game' },
                        { targets: 3, className: 'text-end marker-balance-col-amount marker-total-col-game-coin' },
                        { targets: 4, className: 'text-end marker-balance-col-amount marker-total-col-sum' }
                    ]
                });
                $('#marker-accounts-total-tbl').DataTable(totalDtOpts);
            }
        }

        function getMarkerTabPanelSelector(tab) {
            if (tab === 'marker-history') return '#marker-history-wrapper';
            if (tab === 'total') return '#marker-accounts-total-wrapper';
            if (tab === 'buyin_coin') return '#marker-accounts-buyin-coin-wrapper';
            return '#marker-accounts-' + tab + '-wrapper';
        }

        $(document).off('click.markerBalanceTabs', '#marker-balance-tabs .nav-link').on('click.markerBalanceTabs', '#marker-balance-tabs .nav-link', function () {
            var tab = $(this).data('tab');
            if (!tab) return;
            $('#marker-balance-tabs .nav-link').removeClass('active');
            $(this).addClass('active');
            $('.marker-tab-panel').hide();
            var $target = $(getMarkerTabPanelSelector(tab));
            if ($target.length) {
                $target.show();
                if (tab === 'marker-history' && table && typeof table.columns === 'function') {
                    try { table.columns.adjust(); } catch (e) { /* noop */ }
                }
            }
        });

        updateAccountsBalanceTable();

        initExport(table, exportBtnSelector, options.exportOptions || {});

        var formApi = null;
        if (options.withForm !== false) {
            var formOpts = options.formOptions || {};
            formOpts.populateAccountsOnInit = !options.modalSelector;
            var origOnSuccess = formOpts.onSuccess;
            formOpts.onSuccess = function () {
                if (typeof origOnSuccess === 'function') origOnSuccess();
                updateAccountsBalanceTable();
            };
            formApi = initForm(table, formOpts);
            $(tableSelector).data('markerFormApi', formApi);
        }

        if (options.disableSaveExportByPermission) {
            applyPermissions(true, (options.formOptions || {}).submitBtnSelector || '#submit_marker_settlement', exportBtnSelector);
        }

        if (options.modalSelector && formApi && formApi.populateAccounts) {
            $(options.modalSelector).off('show.bs.modal.markerCommon').on('show.bs.modal.markerCommon', function () {
                formApi.populateAccounts();
                updateAccountsBalanceTable();
            });
        }

        if (options.modalSelector && options.reloadOnModalHidden) {
            $(options.modalSelector).off('hidden.bs.modal.markerCommon').on('hidden.bs.modal.markerCommon', function () {
                if (typeof window.reloadData === 'function') window.reloadData();
                window.location.reload();
            });
        }

        return {
            table: table,
            formApi: formApi
        };
    }

    window.MarkerCommon = {
        init: init,
        initHistoryTable: initHistoryTable,
        initExport: initExport,
        initForm: initForm,
        formatWithCommas: formatWithCommas,
        getTransactionLabel: getTransactionLabel
    };
})(window);
