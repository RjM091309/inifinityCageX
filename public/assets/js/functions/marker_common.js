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

    function getTransactionLabel(transactionId) {
        switch (parseInt(transactionId, 10)) {
            case 11: return 'Marker Returned Cash';
            case 12: return 'Marker Returned Deposit';
            case 10: return 'Buy-in thru Marker';
            case 3: return 'Credit Cash';
            default: return 'Chips Return thru Credit';
        }
    }

    function renderTransactionType(data) {
        if (!data) return '';
        var parts = String(data).split('-');
        var transactionId = parseInt(parts[0], 10);
        var transactionType = parseInt(parts[1], 10);
        switch (transactionId) {
            case 3: return 'Credit Cash';
            case 11: return 'Credit Returned thru Cash';
            case 12: return 'Credit Returned thru Deposit';
            case 10: return 'Buy-in thru Credit';
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
            ajax: {
                url: options.ajaxUrl || '/marker_history',
                dataSrc: function (json) {
                    var data = Array.isArray(json) ? json : (json && Array.isArray(json.data) ? json.data : []);
                    if (!data.length) return data;
                    if (window.moment) {
                        try {
                            return data.map(function (row) {
                                if (row.ENCODED_DT) {
                                    row.ENCODED_DT = moment.utc(row.ENCODED_DT).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
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
                    render: function (data) {
                        return (data != null ? String(data) : '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                    }
                },
                { data: 'TRANSACTION_INFO', render: renderTransactionType },
                { data: 'ENCODED_DT' },
                { data: 'REMARKS', defaultContent: '' }
            ],
            columnDefs: [
                {
                    targets: 3,
                    render: function (data, type, row) {
                        if (type === 'sort') {
                            return window.moment && moment.utc(data, 'MMMM DD, YYYY HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
                        }
                        if (!window.moment) return data;
                        var dateMoment = moment(data, 'MMMM DD, YYYY HH:mm:ss');
                        return dateMoment.isValid() ? dateMoment.local().format('DD MMM, YYYY HH:mm:ss') : (data || '');
                    },
                    createdCell: function (cell) {
                        $(cell).addClass('text-center');
                    }
                },
                {
                    targets: 4,
                    render: function (data) {
                        return data || '';
                    }
                }
            ]
        });

        return table;
    }

    function initExport(table, exportBtnSelector, options) {
        options = options || {};
        if (!table || !exportBtnSelector) return;
        var $btn = $(exportBtnSelector);
        if (!$btn.length) return;

        $btn.off('click.markerExport').on('click.markerExport', function () {
            if (typeof XLSX === 'undefined') {
                console.error('XLSX library not loaded');
                return;
            }
            var data = table.rows().data().toArray();
            var wsData = [];
            wsData.push(['ACCOUNT NAME', 'AMOUNT', 'TRANSACTION TYPE', 'DATE', 'REMARKS']);
            data.forEach(function (row) {
                wsData.push([
                    (row.AGENT_CODE || '') + ' (' + (row.AGENT_NAME || '') + ')',
                    (row.AMOUNT != null ? row.AMOUNT : 0).toLocaleString(),
                    getTransactionLabel(row.TRANSACTION_ID),
                    row.ENCODED_DT || '',
                    row.REMARKS || ''
                ]);
            });
            var wb = XLSX.utils.book_new();
            var ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, 'Marker Data');
            XLSX.writeFile(wb, options.fileName || 'Marker_Data.xlsx');
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
        var selectPlaceholder = opts.selectPlaceholder || 'Select account';
        var dropdownParent = opts.dropdownParent || 'body';
        var isSubmitting = false;
        var markerData = [];

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
            $accountSelect.select2({
                placeholder: selectPlaceholder,
                allowClear: false,
                dropdownParent: $parent.length ? $parent : $('body')
            });
        }

        // Populate accounts (call this on modal show or page load). Optional callback(accounts) runs after data is loaded.
        function populateAccounts(callback) {
            if ($accountSelect.data('select2')) {
                try { $accountSelect.select2('destroy'); } catch (e) {}
            }
            $accountSelect.empty().append('<option value="">' + selectPlaceholder + '</option>');
            $.ajax({
                url: '/marker_data',
                method: 'GET',
                success: function (data) {
                    markerData = data || [];
                    markerData.forEach(function (account) {
                        $accountSelect.append(
                            $('<option></option>').val(account.ACCOUNT_ID).text((account.AGENT_CODE || '') + ' - ' + (account.AGENT_NAME || ''))
                        );
                    });
                    initAccountSelect2();
                    if (typeof callback === 'function') callback(markerData);
                },
                error: function (err) {
                    console.error('Error fetching marker data:', err);
                    initAccountSelect2();
                    if (typeof callback === 'function') callback([]);
                }
            });
        }

        if (opts.populateAccountsOnInit) {
            populateAccounts();
        }

        $accountSelect.off('change.markerForm').on('change.markerForm', function () {
            var selectedAccountId = $(this).val();
            var selectedAccount = markerData.filter(function (a) { return a.ACCOUNT_ID == selectedAccountId; })[0];
            if (selectedAccount) {
                var totalIssue = selectedAccount.TOTAL_AMOUNT || 0;
                $(markerIssueSelector).val(formatWithCommas(totalIssue));
                $(markerBalanceSelector).val(formatWithCommas(totalIssue));
            }
        });

        // Agent balance for deposit check (account_details_data_deposit)
        $accountSelect.off('change.markerBalance').on('change.markerBalance', function () {
            var accountId = $(this).val();
            if (!accountId) return;
            $.ajax({
                url: '/account_details_data_deposit/' + accountId,
                method: 'GET',
                success: function (data) {
                    var deposit_amount = 0, withdraw_amount = 0, marker_issue_amount = 0, marker_return = 0;
                    (data || []).forEach(function (row) {
                        var amount = parseFloat(row.AMOUNT) || 0;
                        if (row.TRANSACTION === 'DEPOSIT') deposit_amount += amount;
                        else if (row.TRANSACTION === 'WITHDRAW') withdraw_amount += amount;
                        else if (row.TRANSACTION === 'IOU CASH') marker_issue_amount += amount;
                        else if (row.TRANSACTION === 'IOU RETURN DEPOSIT') marker_return += amount;
                    });
                    var totalBalance = deposit_amount - withdraw_amount + marker_issue_amount - marker_return;
                    $(agentBalanceSelector).val(totalBalance);
                }
            });
        });

        // Format marker return input and balance
        $(markerReturnSelector).off('input.markerForm focusout.markerForm').on('input.markerForm', function () {
            var markerIssue = parseFloat($(markerIssueSelector).val().replace(/,/g, '')) || 0;
            var raw = $(this).val().replace(/,/g, '');
            var markerReturn = parseFloat(raw) || 0;
            if (markerReturn > markerIssue) {
                $(this).val(formatWithCommas(markerIssue));
                $(markerBalanceSelector).val(formatWithCommas(0));
            } else {
                $(markerBalanceSelector).val(formatWithCommas(markerIssue - markerReturn));
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

            if (!selectedAccount) {
                if (window.Swal) Swal.fire({ icon: 'error', title: 'Missing Information', text: 'Please select an account.' });
                return;
            }
            if (!selectedTransType) {
                if (window.Swal) Swal.fire({ icon: 'error', title: 'Missing Information', text: 'Please select a transaction type (Cash or Deposit).' });
                return;
            }
            if (!markerReturnRaw || markerReturn <= 0) {
                if (window.Swal) Swal.fire({ icon: 'error', title: 'Invalid Amount', text: 'Marker Return must be greater than zero.' });
                return;
            }
            if (markerReturn > markerIssue) {
                if (window.Swal) Swal.fire({ icon: 'error', title: 'Invalid Return', text: 'Marker Return cannot be greater than Marker Issue!' });
                return;
            }

            var accountMarker = $accountSelect.find('option:selected').text();
            var markerReturnFormatted = $(markerReturnSelector).val();
            var transTypeLabel = $('input[name="' + optTransTypeName + '"]:checked').next('label').text();

            var doSubmit = function () {
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
                            if (table && table.ajax) table.ajax.reload();
                            // Reload account list and refresh balance for current account so UI updates without page refresh
                            populateAccounts(function (accounts) {
                                if (savedAccountId) {
                                    $accountSelect.val(savedAccountId).trigger('change');
                                    var acc = (accounts || []).filter(function (a) { return a.ACCOUNT_ID == savedAccountId; })[0];
                                    if (acc) {
                                        var totalIssue = acc.TOTAL_AMOUNT || 0;
                                        $(markerIssueSelector).val(formatWithCommas(totalIssue));
                                        $(markerBalanceSelector).val(formatWithCommas(totalIssue));
                                    }
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

            if (window.Swal) {
                Swal.fire({
                    icon: 'question',
                    title: 'Confirm Marker Return',
                    html: '<div style="text-align:center;margin-bottom:20px">' +
                        '<table style="margin:0 auto"><tr><td style="padding:8px 4px 8px 0;font-weight:bold">Account:</td><td style="padding:8px 0 8px 4px">' + (accountMarker || 'N/A') + '</td></tr>' +
                        '<tr><td style="padding:8px 4px 8px 0;font-weight:bold">Amount:</td><td style="padding:8px 0 8px 4px">' + (markerReturnFormatted || '0') + '</td></tr>' +
                        '<tr><td style="padding:8px 4px 8px 0;font-weight:bold">Transaction:</td><td style="padding:8px 0 8px 4px">' + (transTypeLabel || 'N/A') + '</td></tr></table>' +
                        '<p style="margin-top:15px">Are you sure you want to proceed with this marker return?</p></div>',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Yes, Save',
                    cancelButtonText: 'Cancel'
                }).then(function (result) {
                    if (result.isConfirmed) doSubmit();
                });
            } else {
                doSubmit();
            }
        });

        return {
            populateAccounts: populateAccounts
        };
    }

    function applyPermissions(disableSaveExport, submitBtnSelector, exportBtnSelector) {
        if (!disableSaveExport) return;
        var perms = parseInt($('#user-role').data('permissions'), 10);
        if (perms === 2) {
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

        initExport(table, exportBtnSelector, options.exportOptions || {});

        var formApi = null;
        if (options.withForm !== false) {
            var formOpts = options.formOptions || {};
            formOpts.populateAccountsOnInit = !options.modalSelector;
            formApi = initForm(table, formOpts);
        }

        if (options.disableSaveExportByPermission) {
            applyPermissions(true, (options.formOptions || {}).submitBtnSelector || '#submit_marker_settlement', exportBtnSelector);
        }

        if (options.modalSelector && formApi && formApi.populateAccounts) {
            $(options.modalSelector).off('show.bs.modal.markerCommon').on('show.bs.modal.markerCommon', function () {
                formApi.populateAccounts();
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
