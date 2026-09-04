var account_id;
var totalAmountBalance = 0;
var totalAmountAll = 0;

/** Parse displayed balance (₱1,234,567) for numeric DataTables sort */
function parseBalanceSortValue(value) {
    if (value == null || value === '') return 0;
    var n = parseFloat(String(value).replace(/[₱,\s\u00a0]/g, ''));
    return isNaN(n) ? 0 : n;
}

function formatBalanceDisplay(amount) {
    return '₱' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** DataTables render: display formatted ₱; sort uses raw number in row data */
function renderBalanceColumn(data, type) {
    var num = typeof data === 'number' ? data : parseBalanceSortValue(data);
    if (type === 'display') {
        return formatBalanceDisplay(num);
    }
    if (type === 'sort' || type === 'type' || type === 'filter') {
        return num;
    }
    return data;
}

// --- ACCOUNT NO. range search (e.g. "399-450" or "INF399-INF450") ---
var accountNoRangeRe = /^\s*[A-Za-z]{0,6}(\d+)\s*-\s*[A-Za-z]{0,6}(\d+)\s*$/;

function parseAccountNoRange(text) {
    var m = String(text || '').match(accountNoRangeRe);
    if (!m) return null;
    var a = parseInt(m[1], 10);
    var b = parseInt(m[2], 10);
    // Only a genuine ascending range. Keeps sub-account codes like "INF305-1"
    // as a normal (literal) search instead of the range 1–305.
    if (!(b > a)) return null;
    return { min: a, max: b };
}

/**
 * Let the DataTables search box accept an ACCOUNT NO. range like "399-450".
 * The range is kept in JS (not the box / built-in search) so it survives
 * sort & paging redraws; the box text is re-applied after every draw.
 */
function setupAccountNoRangeSearch(dt, tableId, resetModalSelector) {
    var $box = $('#' + tableId + '_filter input');
    if (!$box.length) return;
    var activeRangeText = '';

    $.fn.dataTable.ext.search.push(function (settings, data) {
        if (settings.nTable.id !== tableId) return true;
        var range = parseAccountNoRange(activeRangeText);
        if (!range) return true;
        // data[1] = ACCOUNT NO. cell (may be an <a>…INF399</a> link) — take the
        // first number after stripping tags so the onclick args are ignored.
        var m = String(data[1] || '').replace(/<[^>]*>/g, ' ').match(/(\d+)/);
        if (!m) return false;
        var num = parseInt(m[1], 10);
        return num >= range.min && num <= range.max;
    });

    dt.on('draw.dt', function () {
        if (activeRangeText && $box.val() !== activeRangeText) {
            $box.val(activeRangeText);
        }
    });

    $box.attr('title', 'Search text, or an ACCOUNT NO. range like 399-450');
    $box.off();
    $box.on('keyup cut paste input search', function () {
        var val = this.value;
        if (parseAccountNoRange(val)) {
            activeRangeText = val;
            if (dt.search() !== '') dt.search('');
            dt.draw();
        } else {
            activeRangeText = '';
            if (dt.search() !== val) dt.search(val);
            dt.draw();
        }
    });

    if (resetModalSelector) {
        $(resetModalSelector).on('hidden.bs.modal', function () {
            activeRangeText = '';
            $box.val('');
        });
    }
}

var guestAccountBalanceColumnDefs = [
    {
        targets: 5,
        className: 'text-end',
        render: renderBalanceColumn
    }
];

$(document).ready(function () {
    // Initialize both DataTables
    if ($.fn.DataTable.isDataTable('#guestAccount-tbl-with-balance')) {
        $('#guestAccount-tbl-with-balance').DataTable().destroy();
    }
    if ($.fn.DataTable.isDataTable('#guestAccount-tbl-all')) {
        $('#guestAccount-tbl-all').DataTable().destroy();
    }

    var guestTableBalance = $('#guestAccount-tbl-with-balance').DataTable({
        paging: true,
        searching: true,
        ordering: true,
        info: true,
        deferRender: true,
        processing: true,
        pageLength: 100,
        columnDefs: guestAccountBalanceColumnDefs,
        order: [[5, 'desc']],
        drawCallback: function () {
            const table = this.api();
            const pageRows = table.rows({ page: 'current' }).data();
            let pageTotal = 0;
        
            pageRows.each(function (row) {
                var v = row[5];
                pageTotal += typeof v === 'number' ? v : parseBalanceSortValue(v);
            });
        
            if (table.page.info().pages > 1) {
                $('#SUB_TOTAL_VALUE_BALANCE').closest('tr').show();
                $('#SUB_TOTAL_VALUE_BALANCE').text('₱' + pageTotal.toLocaleString());
            } else {
                $('#SUB_TOTAL_VALUE_BALANCE').closest('tr').hide();
            }
        }
    });

    var guestTableAll = $('#guestAccount-tbl-all').DataTable({
        paging: true,
        searching: true,
        ordering: true,
        info: true,
        deferRender: true,
        processing: true,
        pageLength: 100,
        columnDefs: guestAccountBalanceColumnDefs,
        order: [[5, 'desc']],
        drawCallback: function () {
            const table = this.api();
            const pageRows = table.rows({ page: 'current' }).data();
            let pageTotal = 0;
        
            pageRows.each(function (row) {
                var v = row[5];
                pageTotal += typeof v === 'number' ? v : parseBalanceSortValue(v);
            });
        
            if (table.page.info().pages > 1) {
                $('#SUB_TOTAL_SUM_VALUE_ALL').closest('tr').show();
                $('#SUB_TOTAL_SUM_VALUE_ALL').text('₱' + pageTotal.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }));
            } else {
                $('#SUB_TOTAL_SUM_VALUE_ALL').closest('tr').hide();
            }
        }
    });

    setupAccountNoRangeSearch(guestTableBalance, 'guestAccount-tbl-with-balance', '#modal-guestAccount');
    setupAccountNoRangeSearch(guestTableAll, 'guestAccount-tbl-all', '#modal-guestAccount');

    function loadGuestAccounts() {
        guestTableBalance.clear();
        guestTableAll.clear();
        totalAmountBalance = 0;
        totalAmountAll = 0;
    
        $.ajax({
            url: '/account_data',
            method: 'GET',
            success: function (accounts) {
                const balanceRows = [];
                const allRows = [];
                const permissions = parseInt($('#user-role').data('permissions'));
                const isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly();

                (accounts || []).forEach(row => {
                    const totalAmount = Number(row.total_balance ?? row.total_ledger_amount ?? 0);
                    totalAmountAll += totalAmount;

                    const account_no = !isViewOnly
                        ? `<a href="#" onclick="account_details(${row.account_id}, '${row.agent_code}', '${row.agent_name}')">${row.agent_code}</a>`
                        : `<span>${row.agent_code}</span>`;

                    if (totalAmount > 0) {
                        balanceRows.push([
                            row.agent_name,
                            account_no,
                            row.agency_name,
                            row.agent_telegram,
                            row.agent_contact,
                            totalAmount
                        ]);
                        totalAmountBalance += totalAmount;
                    }

                    allRows.push([
                        row.agent_name,
                        account_no,
                        row.agency_name || '—',
                        row.agent_telegram || '—',
                        row.agent_contact || '—',
                        totalAmount
                    ]);
                });

                guestTableBalance.rows.add(balanceRows).invalidate().order([[5, 'desc']]).draw(false);
                guestTableAll.rows.add(allRows).invalidate().order([[5, 'desc']]).draw(false);

                const formattedGrand = formatBalanceDisplay(totalAmountAll);
                $('#TOTAL_SUM_VALUE_BALANCE').text(formattedGrand);
                $('#TOTAL_SUM_VALUE_ALL').text(formattedGrand);
            },
            error: function (xhr, status, err) {
                console.error('Error loading guest data:', err);
            }
        });
    }
    

    $('#modal-guestAccount').off('shown.bs.modal').on('shown.bs.modal', function () {
        loadGuestAccounts();
    });

    $('#modal-guestAccount').on('hidden.bs.modal', function () {
        guestTableBalance.clear().draw();
        guestTableAll.clear().draw();
        $('#TOTAL_SUM_VALUE_BALANCE').text('₱0');
        $('#TOTAL_SUM_VALUE_ALL').text('₱0');
    });

    let openedFromGuestAccount = false;

// When account details modal opens
$('#modal-account-details').on('show.bs.modal', function () {
    $('#modal-guestAccount').css('z-index', 1050); // Move guest account behind
    $('#modal-account-details').css('z-index', 1060); // Account details on top

    if ($('#modal-guestAccount').is(':visible')) {
        openedFromGuestAccount = true;
    }
});

// When account details modal closes
$('#modal-account-details').on('hidden.bs.modal', function () {
    if (!$('#modal-transfer_account').is(':visible') && openedFromGuestAccount) {
        $('#modal-guestAccount').modal('show');
        $('#modal-guestAccount').css('z-index', 1050); // Reset to original z-index
    }
});

// When transfer account modal opens
$('#modal-transfer_account').on('show.bs.modal', function () {
    // Prevent closing guestAccount modal
    if ($('#modal-guestAccount').is(':visible')) {
        $('#modal-guestAccount').css('z-index', 1050); // Keep guestAccount in background
    }
    $('#modal-account-details').modal('hide');
    $('#modal-guestAccount').modal('hide');
});

// When transfer account modal closes
$('#modal-transfer_account').on('hidden.bs.modal', function () {
    $('#modal-account-details').modal('show');
});

});
