$(document).ready(function() {
    var COMMISSION_EXPORT_COLS = 11;
    var COMMISSION_EXPORT_AMOUNT_COLS_1BASED = [1, 3, 4, 5, 6, 8, 9, 10]; // game no + numeric amounts
    var COMMISSION_EXPORT_RIGHT_AMOUNT_COLS_1BASED = [3, 4, 5, 6, 8, 9, 10]; // exclude game no, keep numbers right-aligned
    var COMMISSION_EXPORT_COL_MIN_WIDTHS = [8, 24, 12, 12, 12, 14, 12, 12, 10, 12, 22];
    var COMMISSION_EXPORT_COL_MAX_WIDTHS = [10, 40, 18, 18, 18, 20, 16, 18, 16, 18, 26];

    function commissionExportCellBorder() {
        var edge = { style: 'thin', color: { argb: 'FF000000' } };
        return { top: edge, left: edge, bottom: edge, right: edge };
    }

    function commissionSanitizeFilePart(s) {
        return String(s || '')
            .replace(/\s+/g, '_')
            .replace(/[^\w\-]/g, '')
            .trim();
    }

    function commissionExportFileName() {
        var raw = ($('#daterange').val() || '').trim();
        if (raw) {
            return 'Commission_' + commissionSanitizeFilePart(raw) + '.xlsx';
        }
        var now = new Date();
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var d = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        return 'Commission_' + d + '.xlsx';
    }

    function commissionParseNumber(text) {
        var s = String(text == null ? '' : text).trim();
        if (s === '' || s === '-') return null;
        var cleaned = s.replace(/,/g, '').replace(/\s/g, '');
        var n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
    }

    function commissionParsePercent(text) {
        var s = String(text == null ? '' : text).trim();
        if (!s || s === '-') return null;
        // Accept "1.45%", "1.45", "0.0145"
        var hasPct = s.indexOf('%') >= 0;
        s = s.replace('%', '').replace(/,/g, '').replace(/\s/g, '');
        var n = parseFloat(s);
        if (isNaN(n)) return null;
        // If it had % sign, convert to fraction. If not, assume already percent-like (1.45 => 1.45%)
        if (hasPct) return n / 100;
        // If value looks like a fraction already (<= 1), keep as-is; else treat as percent
        return n <= 1 ? n : (n / 100);
    }

    function commissionAutoFitColumns(sheet, headers, rows) {
        var maxLens = [];
        for (var i = 0; i < COMMISSION_EXPORT_COLS; i++) {
            maxLens[i] = String(headers[i] == null ? '' : headers[i]).length;
        }
        (rows || []).forEach(function (r) {
            for (var c = 0; c < COMMISSION_EXPORT_COLS; c++) {
                var v = r[c];
                var txt = (typeof v === 'number')
                    ? v.toLocaleString('en-US', { maximumFractionDigits: 2 })
                    : String(v == null ? '' : v);
                if (txt.length > maxLens[c]) maxLens[c] = txt.length;
            }
        });
        for (var col = 1; col <= COMMISSION_EXPORT_COLS; col++) {
            var idx = col - 1;
            var minW = COMMISSION_EXPORT_COL_MIN_WIDTHS[idx] || 10;
            var maxW = COMMISSION_EXPORT_COL_MAX_WIDTHS[idx] || 30;
            var autoW = Math.min(maxW, Math.max(minW, maxLens[idx] + 2));
            sheet.getColumn(col).width = autoW;
        }
    }

    function exportCommissionTableToXlsx() {
        if (typeof ExcelJS === 'undefined') {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Export', text: 'Excel library failed to load. Refresh the page and try again.' });
            }
            return Promise.resolve();
        }
        if (!$.fn.DataTable || !$.fn.DataTable.isDataTable('#commission-tbl')) return Promise.resolve();

        var dt = $('#commission-tbl').DataTable();
        var headers = [];
        $('#commission-tbl thead th').each(function (idx) {
            if (idx >= COMMISSION_EXPORT_COLS) return false;
            headers.push($(this).text().replace(/\s+/g, ' ').trim());
        });

        var rows = [];
        dt.rows({ search: 'applied' }).every(function () {
            var data = this.data();
            if (!data || data.length < COMMISSION_EXPORT_COLS) return;
            var row = [];
            for (var c = 0; c < COMMISSION_EXPORT_COLS; c++) {
                var raw = data[c];
                if (raw === undefined || raw === null) raw = '';
                else if (typeof raw !== 'string') raw = String(raw);
                var text = $('<div>').html(raw).text().replace(/\s+/g, ' ').trim();
                // Coerce numeric columns to numbers to avoid green triangles in Excel
                if (c === 6) {
                    var p = commissionParsePercent(text);
                    row.push(p !== null ? p : text);
                } else if (c === 0 || c === 2 || c === 3 || c === 4 || c === 5 || c === 7 || c === 8 || c === 9) {
                    var n = commissionParseNumber(text);
                    row.push(n !== null ? n : text);
                } else {
                    row.push(text);
                }
            }
            rows.push(row);
        });

        var workbook = new ExcelJS.Workbook();
        var sheet = workbook.addWorksheet('Commission', { views: [{ state: 'frozen', ySplit: 1 }] });
        sheet.addRow(headers);
        rows.forEach(function (r) { sheet.addRow(r); });
        commissionAutoFitColumns(sheet, headers, rows);

        var hdr = sheet.getRow(1);
        hdr.height = 22;
        hdr.eachCell({ includeEmpty: true }, function (cell, colNumber) {
            if (colNumber > COMMISSION_EXPORT_COLS) return;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            var hdrAlign = COMMISSION_EXPORT_RIGHT_AMOUNT_COLS_1BASED.indexOf(colNumber) >= 0 ? 'right' : 'center';
            cell.alignment = { vertical: 'middle', horizontal: hdrAlign, wrapText: true };
            cell.border = commissionExportCellBorder();
        });

        sheet.eachRow(function (row, rowNumber) {
            if (rowNumber === 1) return;
            row.height = 18;
            row.eachCell({ includeEmpty: true }, function (cell, colNumber) {
                if (colNumber > COMMISSION_EXPORT_COLS) return;
                if (typeof cell.value === 'number') {
                    if (colNumber === 1) cell.numFmt = '0'; // GAME NO
                    else if (colNumber === 7) cell.numFmt = '0.##%'; // ROLLING RATE
                    else cell.numFmt = '#,##0';
                }
                var bodyAlign = COMMISSION_EXPORT_RIGHT_AMOUNT_COLS_1BASED.indexOf(colNumber) >= 0 ? 'right' : 'center';
                cell.alignment = { vertical: 'middle', horizontal: bodyAlign, wrapText: false };
                cell.border = commissionExportCellBorder();
            });
        });

        return workbook.xlsx.writeBuffer().then(function (buffer) {
            var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = commissionExportFileName();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    $(document).on('click', '#btn-export-commission', function (e) {
        e.preventDefault();
        var $btn = $('#btn-export-commission');
        $btn.prop('disabled', true);
        exportCommissionTableToXlsx()
            .catch(function (err) {
                console.error(err);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Export failed', text: err && err.message ? err.message : 'Could not create file.' });
                }
            })
            .finally(function () {
                $btn.prop('disabled', false);
            });
    });

    function formatCommissionNumber(n) {
        var v = Number(n) || 0;
        return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function formatCommissionRate(value) {
        var n = Number(value);
        if (!isFinite(n)) return '0';
        // Remove trailing zeros (e.g., 1.45000000 -> 1.45)
        return n.toFixed(8).replace(/\.?0+$/, '');
    }

    function applyCommissionSignedColor($el, value) {
        var n = Number(value) || 0;
        $el.css('color', '');
        if (n > 0) {
            $el.css('color', '#16a34a');
        } else if (n < 0) {
            $el.css('color', '#dc2626');
        }
    }

    function parseCommissionDateForSort(v) {
        var m = moment(v, ['MMMM DD, YYYY HH:mm:ss', moment.ISO_8601], true);
        return m.isValid() ? m.valueOf() : 0;
    }

    function escapeCommissionHtml(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    var commissionDrillState = {
        agencyMap: {},
        guestPageSize: 20,
        currentAgencyKey: null,
        currentGuests: [],
        currentGuestPage: 1,
        currentGuestKey: null,
        currentTxnSortKey: 'dateTime',
        currentTxnSortDir: 'desc'
    };

    function getCommissionTxnSortValue(row, key) {
        if (!row) return '';
        if (key === 'gameNo') return Number(row.gameNo) || 0;
        if (key === 'totalBuyIn') return Number(row.totalBuyIn) || 0;
        if (key === 'chipsReturn') return Number(row.chipsReturn) || 0;
        if (key === 'winLoss') return Number(row.winLoss) || 0;
        if (key === 'totalRolling') return Number(row.totalRolling) || 0;
        if (key === 'rollingRate') return Number(row.rollingRate) || 0;
        if (key === 'settlement') return Number(row.settlement) || 0;
        if (key === 'fnb') return Number(row.fnb) || 0;
        if (key === 'payment') return Number(row.payment) || 0;
        if (key === 'dateTime') return parseCommissionDateForSort(row.dateTime);
        return '';
    }

    function renderCommissionTxnSortIndicators() {
        var key = commissionDrillState.currentTxnSortKey || 'dateTime';
        var dir = commissionDrillState.currentTxnSortDir === 'asc' ? 'asc' : 'desc';
        $('#commission-guest-head-table thead th.commission-sortable-col').each(function () {
            var $th = $(this);
            var thKey = $th.attr('data-sort-key');
            var indicator = '-';
            if (thKey === key) indicator = dir === 'asc' ? '▲' : '▼';
            $th.find('.commission-sort-indicator').text(indicator);
        });
    }

    function renderCommissionAgencyList(agencyMap) {
        var entries = Object.keys(agencyMap || {}).map(function (key) {
            return agencyMap[key];
        });
        entries.sort(function (a, b) {
            return (Number(b.settlement) || 0) - (Number(a.settlement) || 0);
        });

        $('#commission-drill-title').text('Top Agents by Settlement');

        if (entries.length === 0) {
            $('#commission-top-agents-list').html('<div class="commission-top-agent-empty">No data yet.</div>');
            return;
        }

        var maxSettlement = Number(entries[0].settlement) || 0;
        var html = entries.map(function (item) {
            var settlement = Number(item.settlement) || 0;
            var width = maxSettlement > 0 ? (settlement / maxSettlement) * 100 : 0;
            var safeName = escapeCommissionHtml(item.name);
            var encodedKey = encodeURIComponent(item.key);
            return (
                '<div class="commission-top-agent-row is-clickable js-commission-agency-row" data-agency-key="' + encodedKey + '">' +
                    '<div class="commission-top-agent-name" title="' + safeName + '">' + safeName + '</div>' +
                    '<div class="commission-top-agent-bar"><div class="commission-top-agent-fill" style="width:' + width.toFixed(2) + '%"></div></div>' +
                    '<div class="commission-top-agent-value">' + formatCommissionNumber(settlement) + '</div>' +
                '</div>'
            );
        }).join('');
        $('#commission-top-agents-list').html(html);
    }

    function renderCommissionAgencyGuestsPage() {
        var guests = commissionDrillState.currentGuests || [];
        var pageSize = commissionDrillState.guestPageSize || 20;
        var totalPages = Math.max(1, Math.ceil(guests.length / pageSize));
        var page = commissionDrillState.currentGuestPage || 1;
        if (page > totalPages) page = totalPages;
        if (page < 1) page = 1;
        commissionDrillState.currentGuestPage = page;

        if (guests.length === 0) {
            $('#commission-agency-guests-list').html('<div class="commission-top-agent-empty">No guest data yet.</div>');
            $('#commission-agency-guests-pagination').html('');
            return;
        }

        var startIndex = (page - 1) * pageSize;
        var endIndex = Math.min(startIndex + pageSize, guests.length);
        var pageGuests = guests.slice(startIndex, endIndex);
        var maxSettlement = Number(guests[0].settlement) || 0;
        var encodedAgencyKey = encodeURIComponent(commissionDrillState.currentAgencyKey || '');

        var html = pageGuests.map(function (item) {
            var settlement = Number(item.settlement) || 0;
            var width = maxSettlement > 0 ? (settlement / maxSettlement) * 100 : 0;
            var safeName = escapeCommissionHtml(item.name);
            var encodedGuestKey = encodeURIComponent(item.key);
            return (
                '<div class="commission-top-agent-row is-clickable js-commission-guest-row" data-agency-key="' + encodedAgencyKey + '" data-guest-key="' + encodedGuestKey + '">' +
                    '<div class="commission-top-agent-name" title="' + safeName + '">' + safeName + '</div>' +
                    '<div class="commission-top-agent-bar"><div class="commission-top-agent-fill" style="width:' + width.toFixed(2) + '%"></div></div>' +
                    '<div class="commission-top-agent-value">' + formatCommissionNumber(settlement) + '</div>' +
                '</div>'
            );
        }).join('');
        $('#commission-agency-guests-list').html(html);

        var prevDisabled = page <= 1 ? 'disabled' : '';
        var nextDisabled = page >= totalPages ? 'disabled' : '';
        var pagerHtml =
            '<button type="button" class="btn btn-sm btn-outline-secondary js-commission-guests-prev" ' + prevDisabled + '>Prev</button>' +
            '<span class="commission-guests-page-info">Page ' + page + ' of ' + totalPages + ' (' + guests.length + ' guests)</span>' +
            '<button type="button" class="btn btn-sm btn-primary js-commission-guests-next" ' + nextDisabled + '>Next</button>';
        $('#commission-agency-guests-pagination').html(pagerHtml);
    }

    function showCommissionAgencyGuestsModal(agencyKey) {
        var agency = commissionDrillState.agencyMap[agencyKey];
        if (!agency) {
            return;
        }

        var guests = Object.keys(agency.guests || {}).map(function (k) {
            return agency.guests[k];
        });
        guests.sort(function (a, b) {
            return (Number(b.settlement) || 0) - (Number(a.settlement) || 0);
        });

        $('#commission-agency-modal-subtitle').text(agency.name + '  •  ' + guests.length + ' guest(s)');

        commissionDrillState.currentAgencyKey = agencyKey;
        commissionDrillState.currentGuests = guests;
        commissionDrillState.currentGuestPage = 1;
        renderCommissionAgencyGuestsPage();
        $('#modal-commission-agency-guests').modal('show');
    }

    function showCommissionGuestTransactionsModal(agencyKey, guestKey, keepCurrentModal) {
        var agency = commissionDrillState.agencyMap[agencyKey];
        var guest = agency && agency.guests ? agency.guests[guestKey] : null;
        if (!guest) return;

        commissionDrillState.currentAgencyKey = agencyKey;
        commissionDrillState.currentGuestKey = guestKey;

        var sortKey = commissionDrillState.currentTxnSortKey || 'dateTime';
        var sortDir = commissionDrillState.currentTxnSortDir === 'asc' ? 'asc' : 'desc';
        var rows = (guest.transactions || []).slice().sort(function (a, b) {
            var av = getCommissionTxnSortValue(a, sortKey);
            var bv = getCommissionTxnSortValue(b, sortKey);
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        var totals = {
            buyin: 0,
            chipsReturn: 0,
            winloss: 0,
            rolling: 0,
            settlement: 0,
            fnb: 0,
            payment: 0
        };
        var bodyHtml = rows.length === 0
            ? '<tr><td colspan="10" class="text-center text-muted">No transactions found.</td></tr>'
            : rows.map(function (t) {
                totals.buyin += Number(t.totalBuyIn) || 0;
                totals.chipsReturn += Number(t.chipsReturn) || 0;
                totals.winloss += Number(t.winLoss) || 0;
                totals.rolling += Number(t.totalRolling) || 0;
                totals.settlement += Number(t.settlement) || 0;
                totals.fnb += Number(t.fnb) || 0;
                totals.payment += Number(t.payment) || 0;
                return (
                    '<tr>' +
                        '<td>' + escapeCommissionHtml(t.gameNo) + '</td>' +
                        '<td class="text-end">' + formatCommissionNumber(t.totalBuyIn) + '</td>' +
                        '<td class="text-end">' + formatCommissionNumber(t.chipsReturn) + '</td>' +
                        '<td class="text-end">' + formatCommissionNumber(t.winLoss) + '</td>' +
                        '<td class="text-end">' + formatCommissionNumber(t.totalRolling) + '</td>' +
                        '<td class="text-end">' + escapeCommissionHtml(formatCommissionRate(t.rollingRate)) + '%</td>' +
                        '<td class="text-end">' + formatCommissionNumber(t.settlement) + '</td>' +
                        '<td class="text-end">' + formatCommissionNumber(t.fnb) + '</td>' +
                        '<td class="text-end">' + formatCommissionNumber(t.payment) + '</td>' +
                        '<td>' + escapeCommissionHtml(t.dateTime) + '</td>' +
                    '</tr>'
                );
            }).join('');
        $('#commission-guest-transactions-body').html(bodyHtml);
        $('#commission-guest-total-buyin').text(formatCommissionNumber(totals.buyin));
        $('#commission-guest-total-return').text(formatCommissionNumber(totals.chipsReturn));
        $('#commission-guest-total-winloss').text(formatCommissionNumber(totals.winloss));
        $('#commission-guest-total-rolling').text(formatCommissionNumber(totals.rolling));
        $('#commission-guest-total-settlement').text(formatCommissionNumber(totals.settlement));
        $('#commission-guest-total-fnb').text(formatCommissionNumber(totals.fnb));
        $('#commission-guest-total-payment').text(formatCommissionNumber(totals.payment));
        applyCommissionSignedColor($('#commission-guest-total-winloss'), totals.winloss);
        renderCommissionTxnSortIndicators();
        $('#commission-guest-modal-subtitle').text(agency.name + '  •  ' + guest.name);
        $('#commission-guest-modal-count').text(rows.length + ' transaction(s)');
        if (keepCurrentModal) {
            return;
        }
        // Hide guests modal first to avoid two stacked Bootstrap modals/backdrops.
        $('#modal-commission-agency-guests')
            .one('hidden.bs.modal', function () {
                $('#modal-commission-guest-transactions').modal('show');
            })
            .modal('hide');
    }

    function renderCommissionAnalytics(metrics) {
        var rolling = Number(metrics.totalRolling) || 0;
        var settlement = Number(metrics.totalSettlement) || 0;

        $('#commission-kpi-games').text(formatCommissionNumber(metrics.settledCount || 0));
        $('#commission-kpi-rolling').text(formatCommissionNumber(rolling));
        $('#commission-kpi-winloss').text(formatCommissionNumber(metrics.totalWinLoss || 0));
        $('#commission-kpi-settlement').text(formatCommissionNumber(settlement));
        $('#commission-kpi-payment').text(formatCommissionNumber(metrics.totalPayment || 0));
        applyCommissionSignedColor($('#commission-kpi-winloss'), metrics.totalWinLoss || 0);
    }

    function updateCommissionFooterTotals(metrics) {
        $('#GRAND_TOTAL_AMOUNT').text(formatCommissionNumber(metrics.totalAmount || 0));
        $('#GRAND_CHIPS_RETURN').text(formatCommissionNumber(metrics.totalChipsReturn || 0));
        $('#GRAND_WIN_LOSS').text(formatCommissionNumber(metrics.totalWinLoss || 0));
        $('#GRAND_TOTAL_ROLLING').text(formatCommissionNumber(metrics.totalRolling || 0));
        $('#GRAND_ROLLING_SETTLEMENT').text(formatCommissionNumber(metrics.totalSettlement || 0));
        $('#GRAND_FNB').text(formatCommissionNumber(metrics.totalFnb || 0));
        $('#GRAND_PAYMENT').text(formatCommissionNumber(metrics.totalPayment || 0));
        applyCommissionSignedColor($('#GRAND_WIN_LOSS'), metrics.totalWinLoss || 0);
    }

    $(document).on('click', '.js-commission-agency-row', function () {
        var agencyKey = decodeURIComponent($(this).attr('data-agency-key') || '');
        if (!agencyKey) return;
        showCommissionAgencyGuestsModal(agencyKey);
    });

    $(document).on('click', '.js-commission-guest-row', function () {
        var agencyKey = decodeURIComponent($(this).attr('data-agency-key') || '');
        var guestKey = decodeURIComponent($(this).attr('data-guest-key') || '');
        if (!agencyKey || !guestKey) return;
        commissionDrillState.currentTxnSortKey = 'dateTime';
        commissionDrillState.currentTxnSortDir = 'desc';
        showCommissionGuestTransactionsModal(agencyKey, guestKey);
    });

    $(document).on('click', '#commission-guest-head-table thead th.commission-sortable-col', function () {
        var key = $(this).attr('data-sort-key') || 'dateTime';
        if (commissionDrillState.currentTxnSortKey === key) {
            commissionDrillState.currentTxnSortDir = commissionDrillState.currentTxnSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            commissionDrillState.currentTxnSortKey = key;
            commissionDrillState.currentTxnSortDir = key === 'dateTime' ? 'desc' : 'asc';
        }
        if (!commissionDrillState.currentAgencyKey || !commissionDrillState.currentGuestKey) {
            renderCommissionTxnSortIndicators();
            return;
        }
        showCommissionGuestTransactionsModal(
            commissionDrillState.currentAgencyKey,
            commissionDrillState.currentGuestKey,
            true
        );
    });

    $(document).on('click', '.js-commission-guests-prev', function () {
        if (commissionDrillState.currentGuestPage <= 1) return;
        commissionDrillState.currentGuestPage -= 1;
        renderCommissionAgencyGuestsPage();
    });

    $(document).on('click', '.js-commission-guests-next', function () {
        commissionDrillState.currentGuestPage += 1;
        renderCommissionAgencyGuestsPage();
    });


    var commissionSkipMonthRange = false;

    function applyCommissionFullMonthRangeForVisibleLeft(instance) {
        if (!instance || instance.config.mode !== 'range') return;
        var y = instance.currentYear;
        var m = instance.currentMonth;
        var dim = instance.utils.getDaysInMonth(m, y);
        var start = new Date(y, m, 1);
        var end = new Date(y, m, dim);
        instance.setDate([start, end], false);
        reloadData();
    }

    // Initialize Flatpickr for date range
    var flatpickrInstance = flatpickr("#daterange", {
        mode: "range",
        altInput: true,
        altFormat: "M d, Y",
        dateFormat: "Y-m-d",
        defaultDate: [
            moment().startOf('month').format('YYYY-MM-DD'),
            moment().endOf('month').format('YYYY-MM-DD')
        ],
        showMonths: 3,
        onReady: function (selectedDates, dateStr, instance) {
            commissionSkipMonthRange = true;
            instance.changeMonth(-2, true);
            commissionSkipMonthRange = false;
        },
        onMonthChange: function (selectedDates, dateStr, instance) {
            if (commissionSkipMonthRange) return;
            applyCommissionFullMonthRangeForVisibleLeft(instance);
        }
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

        // Split by ' to ' (with spaces)
        let start, end;
        if (dateRange.includes(' to ')) {
            [start, end] = dateRange.split(' to ');
        } else {
            // If only one date, use it for both start and end
            start = dateRange;
            end = dateRange;
        }
        
        // Ensure both dates are valid
        if (!start || !end) {
            alert('Invalid date range. Please select a valid range.');
            return;
        }

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
                var settledCount = 0;
                var agencyStatsMap = {};
               // let CommissionType = data[0].COMMISSION_TYPE; 

                data.forEach(function(row) {
                    // Only process records that are settled
                    if (row.SETTLED === 1) {
                        settledCount += 1;
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
                                    var total_roller_return_cc = 0;

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

                                        if (res.CAGE_TYPE == 5) {
                                            var rollerTransaction = parseInt(res.ROLLER_TRANSACTION) || 1;
                                            if (rollerTransaction === 2) {
                                                total_roller_return_cc += parseFloat(res.ROLLER_CC_CHIPS) || 0;
                                            }
                                        }
                                    });

                                    var total_initial = total_nn_init + total_cc_init;
                                    var total_buy_in_chips = total_nn + total_cc;
                                    var total_cash_out_chips = total_cash_out_nn + total_cash_out_cc;
                                    // TOTAL ROLLING: Follow same logic as game_list_data (reloadData function)
                                    // Formula: total_rolling_nn + totalRollingCCWithReturns + total_rolling + total_rolling_real + total_rolling_nn_real + total_rolling_cc_real - total_cash_out_nn
                                    // Note: CC chips from CAGE_TYPE == 3 (TOTAL ROLLING) should NOT be included
                                    // Note: CC chips from CAGE_TYPE == 4 (REAL ROLLING) SHOULD be included
                                    // Note: Buy-in amounts are NOT included here - they are separate from rolling transactions
                                    var totalRollingCCWithReturns = total_roller_return_cc;  // Only include roller return CC, exclude CC from CAGE_TYPE == 3
                                    var total_rolling_chips = total_rolling_nn + totalRollingCCWithReturns + total_rolling + total_rolling_real + total_rolling_nn_real + total_rolling_cc_real - total_cash_out_nn;

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
									net = Math.round((total_rolling_chips * RollingRate) / 100);
								} else if (row.COMMISSION_TYPE == 2) {
									// Kung ang COMMISSION_TYPE ay 2, ang net ay computed gamit ang winloss
									net = Math.round((winlossValue * RollingRate) / 100);
								}

                                    // Payment calculation based on RollingSettlement and fb
                                    var RollingSettlement = (total_rolling_chips * RollingRate) / 100;
                                    var paymentValue = Math.round(net - fb);


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

                                    var agencyName = String(row.agency_name || 'Unassigned Agency');
                                    var agencyId = String(row.agency_id || agencyName);
                                    var agencyKey = agencyId + '|' + agencyName;
                                    var guestName = (row.agent_code || '-') + ' - ' + (row.agent_name || '-');
                                    var guestId = String(row.account_no || row.ACCOUNT_ID || row.account_id || row.agent_id || guestName);
                                    var guestKey = guestId + '|' + guestName;

                                    if (!agencyStatsMap[agencyKey]) {
                                        agencyStatsMap[agencyKey] = {
                                            key: agencyKey,
                                            name: agencyName,
                                            settlement: 0,
                                            guests: {}
                                        };
                                    }
                                    agencyStatsMap[agencyKey].settlement += net;
                                    if (!agencyStatsMap[agencyKey].guests[guestKey]) {
                                        agencyStatsMap[agencyKey].guests[guestKey] = {
                                            key: guestKey,
                                            name: guestName,
                                            settlement: 0,
                                            transactions: []
                                        };
                                    }
                                    agencyStatsMap[agencyKey].guests[guestKey].settlement += net;
                                    var formattedDate = moment.utc(row.GAME_ENDED).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
                                    agencyStatsMap[agencyKey].guests[guestKey].transactions.push({
                                        gameNo: row.game_list_id,
                                        totalBuyIn: total_amount,
                                        chipsReturn: total_cash_out_chips,
                                        winLoss: winlossValue,
                                        totalRolling: total_rolling_chips,
                                        rollingRate: RollingRate,
                                        settlement: net,
                                        fnb: fb,
                                        payment: paymentValue,
                                        dateTime: formattedDate
                                    });
                                    
                                    
                                    // Add row to table with total_amount in a separate column (without drawing yet)
                                    dataTable.row.add([
                                        row.game_list_id,
                                        `${row.agent_code} - ${row.agent_name}`,
                                        total_amount.toLocaleString(),
                                        total_cash_out_chips.toLocaleString(),
                                        winloss.toLocaleString(),
                                        parseFloat(total_rolling_chips).toLocaleString(),
                                        `${formatCommissionRate(row.COMMISSION_PERCENTAGE)}%`,
                                        net.toLocaleString(),
                                        fb.toLocaleString(),
                                        paymentValue.toLocaleString(),
                                        formattedDate
                                    ]);
                                },
                                error: function(xhr, status, error) {
                                    console.error('Error fetching options:', error);
                                }
                            })
                        );
                    }
                });
                
                // Wait for all AJAX calls to complete before drawing the table once
                $.when.apply($, ajaxCalls).done(function() {
                    dataTable.draw();
                    var metrics = {
                        settledCount: settledCount,
                        totalAmount: totalAmount,
                        totalChipsReturn: totalChipsReturn,
                        totalWinLoss: totalWinLoss,
                        totalRolling: totalRolling,
                        totalSettlement: totalRollingSettlement,
                        totalFnb: totalFNB,
                        totalPayment: totalPayment
                    };
                    renderCommissionAnalytics(metrics);
                    updateCommissionFooterTotals(metrics);
                    commissionDrillState.agencyMap = agencyStatsMap;
                    renderCommissionAgencyList(commissionDrillState.agencyMap);
                });

                if (ajaxCalls.length === 0) {
                    var emptyMetrics = {
                        settledCount: 0,
                        totalAmount: 0,
                        totalChipsReturn: 0,
                        totalWinLoss: 0,
                        totalRolling: 0,
                        totalSettlement: 0,
                        totalFnb: 0,
                        totalPayment: 0
                    };
                    renderCommissionAnalytics(emptyMetrics);
                    updateCommissionFooterTotals(emptyMetrics);
                    commissionDrillState.agencyMap = {};
                    renderCommissionAgencyList(commissionDrillState.agencyMap);
                }

               
            },
            error: function(xhr, status, error) {
                console.error('Error fetching data:', error);
            }
        });
    }

    // Load data initially
    reloadData();

    // Reload data when date range changes (use 'close' event instead of 'change' to avoid multiple triggers)
    flatpickrInstance.config.onClose.push(function(selectedDates, dateStr, instance) {
        if (selectedDates.length === 2) {
            reloadData();
        }
    });
});