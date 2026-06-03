$(document).ready(function () {
    var COMM_PANEL_EXPORT_COLS = 8;
    var COMM_PANEL_EXPORT_RIGHT_COLS_1BASED = [3, 4, 5, 6, 7, 8];
    var COMM_PANEL_EXPORT_MIN_WIDTHS = [10, 24, 14, 18, 14, 18, 14, 14];
    var COMM_PANEL_EXPORT_MAX_WIDTHS = [12, 40, 18, 22, 18, 22, 18, 18];

    function commPanelExportCellBorder() {
        var edge = { style: 'thin', color: { argb: 'FF000000' } };
        return { top: edge, left: edge, bottom: edge, right: edge };
    }

    function commPanelSanitizeFilePart(s) {
        return String(s || '')
            .replace(/\s+/g, '_')
            .replace(/[^\w\-]/g, '')
            .trim();
    }

    function commPanelExportFileName() {
        var raw = ($('#commission-panel-daterange').val() || '').trim();
        if (raw) return 'Analytics_' + commPanelSanitizeFilePart(raw) + '.xlsx';
        var now = new Date();
        var pad = function (n) { return String(n).padStart(2, '0'); };
        var d = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        return 'Analytics_' + d + '.xlsx';
    }

    function commPanelParseNumber(text) {
        var s = String(text == null ? '' : text).trim();
        if (!s || s === '-') return null;
        s = s.replace(/,/g, '').replace(/\s/g, '');
        var n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    function commPanelAutoFit(sheet, headers, rows) {
        var maxLens = [];
        for (var i = 0; i < COMM_PANEL_EXPORT_COLS; i++) {
            maxLens[i] = String(headers[i] == null ? '' : headers[i]).length;
        }
        (rows || []).forEach(function (r) {
            for (var c = 0; c < COMM_PANEL_EXPORT_COLS; c++) {
                var v = r[c];
                var txt = (typeof v === 'number') ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(v == null ? '' : v);
                if (txt.length > maxLens[c]) maxLens[c] = txt.length;
            }
        });
        for (var col = 1; col <= COMM_PANEL_EXPORT_COLS; col++) {
            var idx = col - 1;
            var minW = COMM_PANEL_EXPORT_MIN_WIDTHS[idx] || 10;
            var maxW = COMM_PANEL_EXPORT_MAX_WIDTHS[idx] || 30;
            sheet.getColumn(col).width = Math.min(maxW, Math.max(minW, maxLens[idx] + 2));
        }
    }

    function exportCommissionPanelToXlsx() {
        if (typeof ExcelJS === 'undefined') {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Export', text: 'Excel library failed to load. Refresh the page and try again.' });
            }
            return Promise.resolve();
        }
        if (!$.fn.DataTable || !$.fn.DataTable.isDataTable('#commission-panel-tbl')) return Promise.resolve();

        var dt = $('#commission-panel-tbl').DataTable();
        var headers = [];
        $('#commission-panel-tbl thead th').each(function (idx) {
            if (idx >= COMM_PANEL_EXPORT_COLS) return false;
            headers.push($(this).text().replace(/\s+/g, ' ').trim());
        });

        var rows = [];
        dt.rows({ search: 'applied' }).every(function () {
            var data = this.data();
            if (!data || data.length < COMM_PANEL_EXPORT_COLS) return;
            var row = [];
            for (var c = 0; c < COMM_PANEL_EXPORT_COLS; c++) {
                var raw = data[c];
                if (raw === undefined || raw === null) raw = '';
                else if (typeof raw !== 'string') raw = String(raw);
                var text = $('<div>').html(raw).text().replace(/\s+/g, ' ').trim();
                if (c === 0 || c >= 2) {
                    var n = commPanelParseNumber(text);
                    row.push(n !== null ? n : text);
                } else {
                    row.push(text);
                }
            }
            rows.push(row);
        });

        var workbook = new ExcelJS.Workbook();
        var sheet = workbook.addWorksheet('Analytics', { views: [{ state: 'frozen', ySplit: 1 }] });
        sheet.addRow(headers);
        rows.forEach(function (r) { sheet.addRow(r); });
        commPanelAutoFit(sheet, headers, rows);

        var hdr = sheet.getRow(1);
        hdr.height = 22;
        hdr.eachCell({ includeEmpty: true }, function (cell, colNumber) {
            if (colNumber > COMM_PANEL_EXPORT_COLS) return;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            var hdrAlign = COMM_PANEL_EXPORT_RIGHT_COLS_1BASED.indexOf(colNumber) >= 0 ? 'right' : 'center';
            cell.alignment = { vertical: 'middle', horizontal: hdrAlign, wrapText: true };
            cell.border = commPanelExportCellBorder();
        });

        sheet.eachRow(function (row, rowNumber) {
            if (rowNumber === 1) return;
            row.height = 18;
            row.eachCell({ includeEmpty: true }, function (cell, colNumber) {
                if (colNumber > COMM_PANEL_EXPORT_COLS) return;
                if (typeof cell.value === 'number') {
                    if (colNumber === 1) cell.numFmt = '0'; // Ranking #
                    else cell.numFmt = '#,##0';
                }
                var bodyAlign = COMM_PANEL_EXPORT_RIGHT_COLS_1BASED.indexOf(colNumber) >= 0 ? 'right' : 'center';
                cell.alignment = { vertical: 'middle', horizontal: bodyAlign, wrapText: false };
                cell.border = commPanelExportCellBorder();
            });
        });

        return workbook.xlsx.writeBuffer().then(function (buffer) {
            var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = commPanelExportFileName();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    function formatNumber(v) {
        return (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    function formatRate(v) {
        var n = Number(v) || 0;
        return n.toFixed(8).replace(/\.?0+$/, '') + '%';
    }

    function signedColorStyle(v) {
        var n = Number(v) || 0;
        if (n > 0) return 'color:#16a34a;font-weight:600;';
        if (n < 0) return 'color:#dc2626;font-weight:600;';
        return '';
    }

    function parseSortDate(v) {
        var m = moment(v, ['MMMM DD, YYYY HH:mm:ss', moment.ISO_8601], true);
        return m.isValid() ? m.valueOf() : 0;
    }

    function computeGameTotals(records) {
        var totalBuyIn = 0;
        var totalCashOut = 0;
        var totalRollingAmount = 0;
        var initialBuyIn = 0;
        var totalNNInit = 0;
        var totalCCInit = 0;
        var totalNN = 0;
        var totalCC = 0;
        var totalCashOutNN = 0;
        var totalCashOutCC = 0;
        var totalRollingNN = 0;
        var totalRollingCC = 0;
        var totalRollingReal = 0;
        var totalRollingNNReal = 0;
        var totalRollingCCReal = 0;
        var totalRollerReturnCC = 0;

        (records || []).forEach(function (res) {
            if (res.CAGE_TYPE == 1 && (totalNNInit !== 0 || totalCCInit !== 0)) {
                totalBuyIn += Number(res.AMOUNT) || 0;
                totalNN += Number(res.NN_CHIPS) || 0;
                totalCC += Number(res.CC_CHIPS) || 0;
            }
            if (totalNNInit === 0 && totalCCInit === 0 && res.CAGE_TYPE == 1) {
                initialBuyIn = Number(res.AMOUNT) || 0;
                totalNNInit += Number(res.NN_CHIPS) || 0;
                totalCCInit += Number(res.CC_CHIPS) || 0;
            }
            if (res.CAGE_TYPE == 2) {
                totalCashOut += Number(res.AMOUNT) || 0;
                totalCashOutNN += Number(res.NN_CHIPS) || 0;
                totalCashOutCC += Number(res.CC_CHIPS) || 0;
            }
            if (res.CAGE_TYPE == 3) {
                totalRollingAmount += Number(res.AMOUNT) || 0;
                totalRollingNN += Number(res.NN_CHIPS) || 0;
                totalRollingCC += Number(res.CC_CHIPS) || 0;
            }
            if (res.CAGE_TYPE == 4) {
                totalRollingReal += Number(res.AMOUNT) || 0;
                totalRollingNNReal += Number(res.NN_CHIPS) || 0;
                totalRollingCCReal += Number(res.CC_CHIPS) || 0;
            }
            if (res.CAGE_TYPE == 5) {
                var rollerTransaction = parseInt(res.ROLLER_TRANSACTION, 10) || 1;
                if (rollerTransaction === 2) {
                    totalRollerReturnCC += Number(res.ROLLER_CC_CHIPS) || 0;
                }
            }
        });

        var totalInitial = totalNNInit + totalCCInit;
        var totalBuyInChips = totalNN + totalCC;
        var totalCashOutChips = totalCashOutNN + totalCashOutCC;
        var totalRollingChips = totalRollingNN + totalRollerReturnCC + totalRollingAmount + totalRollingReal + totalRollingNNReal + totalRollingCCReal - totalCashOutNN;
        var totalAmount = totalBuyInChips + totalInitial;
        var winLoss = totalAmount - totalCashOutChips;

        return {
            totalAmount: totalAmount,
            chipsReturn: totalCashOutChips,
            winLoss: winLoss,
            totalRolling: totalRollingChips
        };
    }

    function createSettlement(commissionType, rollingRate, totals) {
        if (commissionType == 1 || commissionType == 3) {
            return Math.round((Number(totals.totalRolling) || 0) * (rollingRate / 100));
        }
        if (commissionType == 2) {
            return Math.round((Number(totals.winLoss) || 0) * (rollingRate / 100));
        }
        return 0;
    }

    var rankTable = $('#commission-panel-tbl').DataTable({
        ordering: false,
        pageLength: 25,
        columnDefs: [
            { targets: 0, className: 'text-center' },
            { targets: [2, 3, 4, 5, 6, 7], className: 'text-end' }
        ],
        language: {
            search: 'Search:',
            info: 'Showing _START_ to _END_ of _TOTAL_ entries',
            paginate: { previous: 'Previous', next: 'Next' },
            emptyTable: 'No data available in table'
        }
    });

    $(document).on('click', '#btn-export-commission-panel', function (e) {
        e.preventDefault();
        var $btn = $('#btn-export-commission-panel');
        $btn.prop('disabled', true);
        exportCommissionPanelToXlsx()
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

    var drilldownState = {
        agents: {},
        rankingSortKey: 'commission',
        rankingSortDir: 'desc',
        panelTxnSortKey: 'dateTime',
        panelTxnSortDir: 'desc',
        panelModalAgentKey: null
    };

    var RANKING_METRIC_KEYS = ['totalBuyIn', 'totalChipsReturn', 'winLoss', 'totalRolling', 'commission', 'ngr'];
    var RANKING_METRIC_LABELS = {
        totalBuyIn: 'Total Buy-In',
        totalChipsReturn: 'Total Chips Return',
        winLoss: 'Win/Loss',
        totalRolling: 'Total Rolling',
        commission: 'Commission',
        ngr: 'NGR'
    };

    function getRankingMetricColumnOrder() {
        var active = drilldownState.rankingSortKey || 'commission';
        return [active].concat(RANKING_METRIC_KEYS.filter(function (k) { return k !== active; }));
    }

    function getAgentRankingSortValue(row, key) {
        if (!row) return 0;
        if (key === 'totalBuyIn') return Number(row.totalBuyIn) || 0;
        if (key === 'totalChipsReturn') return Number(row.totalChipsReturn) || 0;
        if (key === 'winLoss') return Number(row.winLoss) || 0;
        if (key === 'totalRolling') return Number(row.totalRolling) || 0;
        if (key === 'commission') return Number(row.commission) || 0;
        if (key === 'ngr') return Number(row.ngr) || 0;
        return Number(row.commission) || 0;
    }

    function sortAgentRowsForRanking(rows) {
        var key = drilldownState.rankingSortKey || 'commission';
        var dir = drilldownState.rankingSortDir === 'asc' ? 'asc' : 'desc';
        return (rows || []).slice().sort(function (a, b) {
            var av = getAgentRankingSortValue(a, key);
            var bv = getAgentRankingSortValue(b, key);
            if (av < bv) return dir === 'asc' ? -1 : 1;
            if (av > bv) return dir === 'asc' ? 1 : -1;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
    }

    function renderRankingSortIndicators() {
        var key = drilldownState.rankingSortKey || 'commission';
        var dir = drilldownState.rankingSortDir === 'asc' ? 'asc' : 'desc';
        var colOrder = getRankingMetricColumnOrder();
        $('#commission-panel-tbl thead th.commission-rank-sortable').each(function (idx) {
            var $th = $(this);
            var thKey = colOrder[idx];
            var indicator = '-';
            if (thKey === key) indicator = dir === 'asc' ? '▲' : '▼';
            $th.attr('data-rank-key', thKey);
            $th.html((RANKING_METRIC_LABELS[thKey] || thKey) + ' <span class="commission-rank-sort-indicator">' + indicator + '</span>');
            $th.toggleClass('is-active', thKey === key);
        });
    }

    function applyRankingMetricCellClasses() {
        var colOrder = getRankingMetricColumnOrder();
        $('#commission-panel-tbl tbody tr').each(function () {
            var $cells = $(this).find('td');
            for (var i = 0; i < colOrder.length; i++) {
                var $cell = $cells.eq(2 + i);
                if (!$cell.length) continue;
                var dropClasses = ($cell.attr('class') || '')
                    .split(/\s+/)
                    .filter(function (c) { return c.indexOf('commission-rank-col-') === 0; })
                    .join(' ');
                if (dropClasses) $cell.removeClass(dropClasses);
                $cell.addClass('commission-rank-metric-cell commission-rank-col-' + colOrder[i]);
            }
        });
    }

    function applyRankingColumnHighlight() {
        var key = drilldownState.rankingSortKey || 'commission';
        $('#commission-panel-tbl tbody td.commission-rank-metric-cell').removeClass('is-active');
        $('#commission-panel-tbl tbody td.commission-rank-col-' + key).addClass('is-active');
    }

    function buildSortedAgentRowsFromState() {
        var rows = Object.keys(drilldownState.agents || {}).map(function (k) {
            var item = drilldownState.agents[k];
            item.ngr = (Number(item.winLoss) || 0) - (Number(item.commission) || 0);
            return item;
        });
        return sortAgentRowsForRanking(rows);
    }

    function getPanelTxnSortValue(row, key) {
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
        if (key === 'dateTime') return parseSortDate(row.dateTime);
        return '';
    }

    function renderPanelTxnSortIndicators() {
        var key = drilldownState.panelTxnSortKey || 'dateTime';
        var dir = drilldownState.panelTxnSortDir === 'asc' ? 'asc' : 'desc';
        $('#commission-panel-modal-head-table thead th.commission-sortable-col').each(function () {
            var $th = $(this);
            var thKey = $th.attr('data-sort-key');
            var indicator = '-';
            if (thKey === key) indicator = dir === 'asc' ? '▲' : '▼';
            $th.find('.commission-sort-indicator').text(indicator);
        });
    }

    function applyPanelTxnColumnHighlight() {
        var key = drilldownState.panelTxnSortKey || 'dateTime';
        var colByKey = {
            gameNo: 1,
            totalBuyIn: 2,
            chipsReturn: 3,
            winLoss: 4,
            totalRolling: 5,
            rollingRate: 6,
            settlement: 7,
            fnb: 8,
            payment: 9,
            dateTime: 10
        };
        var col = colByKey[key] || 10;
        $('#commission-panel-modal-head-table th, #commission-panel-modal-body-table td, #commission-panel-modal-foot-table th')
            .removeClass('commission-panel-modal-col-active commission-panel-modal-col-active-header');
        $('#commission-panel-modal-head-table th:nth-child(' + col + ')')
            .addClass('commission-panel-modal-col-active commission-panel-modal-col-active-header');
        $('#commission-panel-modal-body-table td:nth-child(' + col + '), #commission-panel-modal-foot-table th:nth-child(' + col + ')')
            .addClass('commission-panel-modal-col-active');
    }

    function syncPanelModalTableGutter() {
        var $wrap = $('#modal-commission-panel-transactions .commission-guest-table-wrap');
        if (!$wrap.length) return;
        var el = $wrap.get(0);
        var gutter = Math.max(0, el.offsetWidth - el.clientWidth);
        $('#commission-panel-modal-head-table, #commission-panel-modal-foot-table').css('margin-right', gutter + 'px');
    }

    function renderRankTable(agentRows) {
        var metricOrder = getRankingMetricColumnOrder();
        rankTable.clear();
        (agentRows || []).forEach(function (row, idx) {
            var key = encodeURIComponent(row.key);
            var nameLink = '<a href="#" class="js-open-agent-modal" data-agent-key="' + key + '">' + row.name + '</a>';
            var rowData = [
                idx + 1,
                nameLink
            ];
            metricOrder.forEach(function (metricKey) {
                var value = getAgentRankingSortValue(row, metricKey);
                if (metricKey === 'ngr') {
                    rowData.push('<span style="' + signedColorStyle(value) + '">' + formatNumber(value) + '</span>');
                } else {
                    rowData.push(formatNumber(value));
                }
            });
            rankTable.row.add(rowData);
        });
        rankTable.draw();
        renderRankingSortIndicators();
        applyRankingMetricCellClasses();
        applyRankingColumnHighlight();
    }

    function renderModal(agent) {
        drilldownState.panelModalAgentKey = agent && agent.key != null ? String(agent.key) : null;
        var sortKey = drilldownState.panelTxnSortKey || 'dateTime';
        var sortDir = drilldownState.panelTxnSortDir === 'asc' ? 'asc' : 'desc';
        var txns = (agent.transactions || []).slice().sort(function (a, b) {
            var av = getPanelTxnSortValue(a, sortKey);
            var bv = getPanelTxnSortValue(b, sortKey);
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        var totals = {
            buyIn: 0,
            chipsReturn: 0,
            winLoss: 0,
            rolling: 0,
            settlement: 0,
            fnb: 0,
            payment: 0
        };

        var body = txns.length === 0
            ? '<tr><td colspan="10" class="text-center text-muted">No transactions found.</td></tr>'
            : txns.map(function (t) {
                totals.buyIn += Number(t.totalBuyIn) || 0;
                totals.chipsReturn += Number(t.chipsReturn) || 0;
                totals.winLoss += Number(t.winLoss) || 0;
                totals.rolling += Number(t.totalRolling) || 0;
                totals.settlement += Number(t.settlement) || 0;
                totals.fnb += Number(t.fnb) || 0;
                totals.payment += Number(t.payment) || 0;
                return [
                    '<tr>',
                    '<td>' + t.gameNo + '</td>',
                    '<td class="text-end">' + formatNumber(t.totalBuyIn) + '</td>',
                    '<td class="text-end">' + formatNumber(t.chipsReturn) + '</td>',
                    '<td class="text-end">' + formatNumber(t.winLoss) + '</td>',
                    '<td class="text-end">' + formatNumber(t.totalRolling) + '</td>',
                    '<td class="text-end">' + formatRate(t.rollingRate) + '</td>',
                    '<td class="text-end">' + formatNumber(t.settlement) + '</td>',
                    '<td class="text-end">' + formatNumber(t.fnb) + '</td>',
                    '<td class="text-end">' + formatNumber(t.payment) + '</td>',
                    '<td>' + t.dateTime + '</td>',
                    '</tr>'
                ].join('');
            }).join('');

        $('#commission-panel-modal-body').html(body);
        $('#commission-panel-modal-subtitle').text(agent.name);
        $('#commission-panel-modal-count').text(txns.length + ' transaction(s)');
        $('#commission-panel-total-buyin').text(formatNumber(totals.buyIn));
        $('#commission-panel-total-return').text(formatNumber(totals.chipsReturn));
        $('#commission-panel-total-winloss')
            .text(formatNumber(totals.winLoss))
            .attr('style', signedColorStyle(totals.winLoss));
        $('#commission-panel-total-rolling').text(formatNumber(totals.rolling));
        $('#commission-panel-total-settlement').text(formatNumber(totals.settlement));
        $('#commission-panel-total-fnb').text(formatNumber(totals.fnb));
        $('#commission-panel-total-payment').text(formatNumber(totals.payment));
        syncPanelModalTableGutter();
        renderPanelTxnSortIndicators();
        applyPanelTxnColumnHighlight();
        $('#modal-commission-panel-transactions').modal('show');
    }

    $('#modal-commission-panel-transactions').on('shown.bs.modal', function () {
        syncPanelModalTableGutter();
        applyPanelTxnColumnHighlight();
    });

    $(window).on('resize', function () {
        if ($('#modal-commission-panel-transactions').hasClass('show')) {
            syncPanelModalTableGutter();
            applyPanelTxnColumnHighlight();
        }
    });

    function loadRankingData() {
        var dateRange = $('#commission-panel-daterange').val();
        if (!dateRange) return;

        var start;
        var end;
        if (dateRange.includes(' to ')) {
            var parts = dateRange.split(' to ');
            start = parts[0];
            end = parts[1];
        } else {
            start = dateRange;
            end = dateRange;
        }

        $.ajax({
            url: '/commission_data',
            method: 'GET',
            data: { start: start, end: end }
        }).done(function (games) {
            var settledGames = (games || []).filter(function (g) { return Number(g.SETTLED) === 1; });
            if (settledGames.length === 0) {
                drilldownState.agents = {};
                renderRankTable([]);
                return;
            }

            var requests = settledGames.map(function (game) {
                return $.ajax({
                    url: '/game_list/' + game.game_list_id + '/record',
                    method: 'GET'
                }).then(function (records) {
                    var totals = computeGameTotals(records);
                    var rollingRate = Number(game.COMMISSION_PERCENTAGE) || 0;
                    var settlement = createSettlement(Number(game.COMMISSION_TYPE), rollingRate, totals);
                    var fnb = Number(game.fnb) || 0;
                    var payment = Math.round(settlement - fnb);
                    var agentCode = game.agent_code || '-';
                    var agentName = game.agent_name || '-';
                    return {
                        key: String(game.agent_id || game.ACCOUNT_ID || agentCode + '-' + agentName),
                        name: agentCode + ' - ' + agentName,
                        txn: {
                            gameNo: game.game_list_id,
                            totalBuyIn: totals.totalAmount,
                            chipsReturn: totals.chipsReturn,
                            winLoss: totals.winLoss,
                            totalRolling: totals.totalRolling,
                            rollingRate: rollingRate,
                            settlement: settlement,
                            fnb: fnb,
                            payment: payment,
                            dateTime: moment.utc(game.GAME_ENDED).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss')
                        }
                    };
                });
            });

            Promise.all(requests).then(function (rows) {
                var agentMap = {};
                rows.forEach(function (r) {
                    if (!agentMap[r.key]) {
                        agentMap[r.key] = {
                            key: r.key,
                            name: r.name,
                            totalBuyIn: 0,
                            totalChipsReturn: 0,
                            winLoss: 0,
                            totalRolling: 0,
                            commission: 0,
                            ngr: 0,
                            transactions: []
                        };
                    }
                    var a = agentMap[r.key];
                    a.totalBuyIn += Number(r.txn.totalBuyIn) || 0;
                    a.totalChipsReturn += Number(r.txn.chipsReturn) || 0;
                    a.winLoss += Number(r.txn.winLoss) || 0;
                    a.totalRolling += Number(r.txn.totalRolling) || 0;
                    a.commission += Number(r.txn.settlement) || 0;
                    a.transactions.push(r.txn);
                });

                drilldownState.agents = agentMap;
                renderRankTable(buildSortedAgentRowsFromState());
            });
        }).fail(function () {
            drilldownState.agents = {};
            renderRankTable([]);
        });
    }

    $(document).on('click', '#commission-panel-tbl thead th.commission-rank-sortable', function () {
        var key = $(this).attr('data-rank-key') || 'commission';
        if (drilldownState.rankingSortKey === key) {
            drilldownState.rankingSortDir = drilldownState.rankingSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            drilldownState.rankingSortKey = key;
            drilldownState.rankingSortDir = 'desc';
        }
        renderRankTable(buildSortedAgentRowsFromState());
    });

    $(document).on('click', '.js-open-agent-modal', function (e) {
        e.preventDefault();
        var key = decodeURIComponent($(this).attr('data-agent-key') || '');
        var agent = drilldownState.agents[key];
        if (!agent) return;
        drilldownState.panelTxnSortKey = 'dateTime';
        drilldownState.panelTxnSortDir = 'desc';
        renderModal(agent);
    });

    $(document).on('click', '#commission-panel-modal-head-table thead th.commission-sortable-col', function () {
        var key = $(this).attr('data-sort-key') || 'dateTime';
        if (drilldownState.panelTxnSortKey === key) {
            drilldownState.panelTxnSortDir = drilldownState.panelTxnSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            drilldownState.panelTxnSortKey = key;
            drilldownState.panelTxnSortDir = key === 'dateTime' ? 'desc' : 'asc';
        }
        var agentKey = drilldownState.panelModalAgentKey;
        if (!agentKey) {
            renderPanelTxnSortIndicators();
            return;
        }
        var agent = drilldownState.agents[agentKey];
        if (!agent) return;
        renderModal(agent);
    });

    flatpickr('#commission-panel-daterange', {
        mode: 'range',
        altInput: true,
        altFormat: 'M d, Y',
        dateFormat: 'Y-m-d',
        defaultDate: [
            moment().startOf('month').format('YYYY-MM-DD'),
            moment().endOf('month').format('YYYY-MM-DD')
        ],
        showMonths: 3,
        onReady: function (selectedDates, dateStr, instance) {
            instance.changeMonth(-2, true);
            if (typeof bindFlatpickrMonthNameRangeSelect === 'function') {
                bindFlatpickrMonthNameRangeSelect(instance);
            }
        },
        onOpen: function (selectedDates, dateStr, instance) {
            var n = new Date();
            instance.jumpToDate(new Date(n.getFullYear(), n.getMonth() - 2, 1), false);
            if (typeof bindFlatpickrMonthNameRangeSelect === 'function') {
                bindFlatpickrMonthNameRangeSelect(instance);
            }
        },
        onChange: function (selectedDates) {
            if (selectedDates.length === 2) {
                loadRankingData();
            }
        }
    });

    loadRankingData();
});
