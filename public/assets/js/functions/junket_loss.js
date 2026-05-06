let junketLossTable;
let junketLossFromDate = null;
let junketLossToDate = null;

function junketLossExportCellBorder() {
    const edge = { style: 'thin', color: { argb: 'FF000000' } };
    return { top: edge, left: edge, bottom: edge, right: edge };
}

function junketLossExportFileName() {
    const from = (junketLossFromDate || '').replace(/[^\d\-]/g, '');
    const to = (junketLossToDate || '').replace(/[^\d\-]/g, '');
    if (from && to) return `JunketLoss_${from}_to_${to}.xlsx`;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return `JunketLoss_${d}.xlsx`;
}

function junketLossParseNumber(text) {
    const s = String(text == null ? '' : text).trim();
    if (!s || s === '-') return null;
    const cleaned = s.replace(/,/g, '').replace(/\s/g, '');
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? null : n;
}

function exportJunketLossToXlsx() {
    if (typeof ExcelJS === 'undefined') {
        if (typeof Swal !== 'undefined') Swal.fire('Export', 'Excel library failed to load. Refresh and try again.', 'error');
        return Promise.resolve();
    }
    if (!$.fn.DataTable || !$.fn.DataTable.isDataTable('#junket-loss-tbl')) return Promise.resolve();

    const dt = $('#junket-loss-tbl').DataTable();
    const exportCols = 5; // exclude Action
    const headers = [];
    $('#junket-loss-tbl thead th').each(function (idx) {
        if (idx >= exportCols) return false;
        headers.push($(this).text().replace(/\s+/g, ' ').trim());
    });

    const rows = [];
    dt.rows({ search: 'applied' }).every(function () {
        const data = this.data();
        if (!data) return;
        // DataTables here is object rows; use columns config to read rendered values from the table for consistency.
        // Pull from DOM row to preserve formatted date/amount exactly as displayed.
        const node = this.node();
        if (!node) return;
        const $tds = $(node).find('td');
        if ($tds.length < exportCols) return;
        const row = [];
        for (let c = 0; c < exportCols; c++) {
            const text = $tds.eq(c).text().replace(/\s+/g, ' ').trim();
            if (c === 1) {
                const n = junketLossParseNumber(text);
                row.push(n !== null ? n : text);
            } else if (c === 2) {
                // In-charge is usually text, but if it's purely numeric (e.g. "2"),
                // export as number to avoid Excel "number stored as text" warning.
                const n = junketLossParseNumber(text);
                row.push(n !== null ? n : text);
            } else {
                row.push(text);
            }
        }
        rows.push(row);
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Junket Loss', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(headers);
    rows.forEach((r) => sheet.addRow(r));

    // Simple auto widths with caps
    const minW = [24, 12, 18, 16, 22];
    const maxW = [56, 18, 28, 22, 28];
    const maxLens = headers.map((h) => String(h || '').length);
    rows.forEach((r) => {
        r.forEach((v, i) => {
            const t = (typeof v === 'number') ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(v || '');
            if (t.length > maxLens[i]) maxLens[i] = t.length;
        });
    });
    for (let i = 1; i <= exportCols; i++) {
        const idx = i - 1;
        const w = Math.min(maxW[idx] || 30, Math.max(minW[idx] || 10, (maxLens[idx] || 10) + 2));
        sheet.getColumn(i).width = w;
    }

    const hdr = sheet.getRow(1);
    hdr.height = 22;
    hdr.eachCell({ includeEmpty: true }, function (cell, colNumber) {
        if (colNumber > exportCols) return;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'right' : 'center', wrapText: true };
        cell.border = junketLossExportCellBorder();
    });

    sheet.eachRow(function (row, rowNumber) {
        if (rowNumber === 1) return;
        row.height = 18;
        row.eachCell({ includeEmpty: true }, function (cell, colNumber) {
            if (colNumber > exportCols) return;
            if (colNumber === 2 && typeof cell.value === 'number') cell.numFmt = '#,##0';
            if (colNumber === 3 && typeof cell.value === 'number') cell.numFmt = '0';
            cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'right' : 'center', wrapText: false };
            cell.border = junketLossExportCellBorder();
        });
    });

    return workbook.xlsx.writeBuffer().then(function (buffer) {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = junketLossExportFileName();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

function sanitizeAmountInput(value) {
    return String(value || '').replace(/[^\d.]/g, '');
}

function formatAmountInput(value) {
    const cleaned = sanitizeAmountInput(value);
    if (!cleaned) return '';
    const parts = cleaned.split('.');
    const integerPart = parts[0] || '0';
    const decimalPart = parts.length > 1 ? parts[1].slice(0, 2) : '';
    const formattedInteger = Number(integerPart).toLocaleString('en-US');
    return decimalPart !== '' ? formattedInteger + '.' + decimalPart : formattedInteger;
}

function openJunketLossModal(data) {
    const id = data && data.IDNo ? data.IDNo : '';
    $('#junket-loss-id').val(id);
    $('#junket-loss-description').val(data ? (data.DESCRIPTION || '') : '');
    $('#junket-loss-amount').val(data ? formatAmountInput(data.AMOUNT || '') : '');
    $('#junket-loss-incharge').val(data ? (data.IN_CHARGE || '') : '');
    $('#junket-loss-modal-title').text(id ? 'Edit Junket Expense' : 'Add Junket Expense');
    $('#modal-junket-loss').modal('show');
}

function closeJunketLossModal() {
    $('#junket-loss-form')[0].reset();
    $('#junket-loss-id').val('');
    $('#modal-junket-loss').modal('hide');
}

function formatYmd(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

function getFirstAndLastOfMonth() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { first, last };
}

function fetchJunketLossData() {
    $.get('/junket_loss_data', {
        fromDate: junketLossFromDate,
        toDate: junketLossToDate
    }, function (rows) {
        junketLossTable.clear().rows.add(rows || []).draw();
    }).fail(function () {
        Swal.fire('Error', 'Failed to load junket expenses.', 'error');
    });
}

function removeJunketLoss(id) {
    Swal.fire({
        title: 'Archive this record?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes',
        cancelButtonText: 'No'
    }).then(function (result) {
        if (!result.isConfirmed) return;

        $.ajax({
            url: '/junket_loss/remove/' + id,
            method: 'PUT',
            success: function () {
                fetchJunketLossData();
                Swal.fire('Success', 'Record archived successfully.', 'success');
            },
            error: function () {
                Swal.fire('Error', 'Failed to archive record.', 'error');
            }
        });
    });
}

$(document).ready(function () {
    const monthRange = getFirstAndLastOfMonth();
    junketLossFromDate = formatYmd(monthRange.first);
    junketLossToDate = formatYmd(monthRange.last);

    if (typeof flatpickr === 'function') {
        flatpickr('#junket-loss-daterange', {
            mode: 'range',
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'M d, Y',
            defaultDate: [monthRange.first, monthRange.last],
            onClose: function (selectedDates) {
                if (!selectedDates || selectedDates.length !== 2) return;
                junketLossFromDate = formatYmd(selectedDates[0]);
                junketLossToDate = formatYmd(selectedDates[1]);
                fetchJunketLossData();
            }
        });
    }

    junketLossTable = $('#junket-loss-tbl').DataTable({
        pageLength: 25,
        order: [[4, 'desc']],
        columns: [
            { data: 'DESCRIPTION', defaultContent: '' },
            {
                data: 'AMOUNT',
                render: function (data) {
                    return (Number(data) || 0).toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    });
                }
            },
            { data: 'IN_CHARGE', defaultContent: '' },
            { data: 'ENCODED_BY_NAME', defaultContent: '' },
            {
                data: 'ENCODED_DT',
                render: function (data, type) {
                    if (!data) return '';
                    if (type === 'sort') return data;
                    return moment(data).format('DD MMM YYYY HH:mm:ss');
                }
            },
            {
                data: null,
                orderable: false,
                searchable: false,
                render: function (row) {
                    return '' +
                        '<button type="button" class="btn btn-sm btn-alt-secondary me-1 btn-junket-loss-edit" data-id="' + row.IDNo + '">' +
                        '<i class="fa fa-pencil-alt"></i></button>' +
                        '<button type="button" class="btn btn-sm btn-alt-secondary btn-junket-loss-remove" data-id="' + row.IDNo + '">' +
                        '<i class="fa fa-trash-alt"></i></button>';
                }
            }
        ]
    });

    fetchJunketLossData();

    $('#btn-add-junket-loss').on('click', function () {
        openJunketLossModal(null);
    });

    $(document).on('click', '#btn-export-junket-loss', function (e) {
        e.preventDefault();
        const $btn = $('#btn-export-junket-loss');
        $btn.prop('disabled', true);
        exportJunketLossToXlsx()
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

    $('#junket-loss-tbl').on('click', '.btn-junket-loss-edit', function () {
        const id = $(this).data('id');
        const row = junketLossTable.rows().data().toArray().find(function (r) { return r.IDNo === id; });
        openJunketLossModal(row || null);
    });

    $('#junket-loss-tbl').on('click', '.btn-junket-loss-remove', function () {
        removeJunketLoss($(this).data('id'));
    });

    $('#junket-loss-amount').on('input', function () {
        $(this).val(formatAmountInput($(this).val()));
    });

    $('#junket-loss-form').on('submit', function (e) {
        e.preventDefault();

        const rawAmount = sanitizeAmountInput($('#junket-loss-amount').val());
        const id = $('#junket-loss-id').val();
        const payload = {
            txtDescription: $('#junket-loss-description').val().trim(),
            txtAmount: rawAmount,
            txtInCharge: $('#junket-loss-incharge').val().trim()
        };

        if (!payload.txtDescription || !payload.txtAmount || !payload.txtInCharge) {
            Swal.fire('Validation', 'Please fill in all required fields.', 'warning');
            return;
        }

        const method = id ? 'PUT' : 'POST';
        const url = id ? '/junket_loss/' + id : '/add_junket_loss';

        $.ajax({
            url: url,
            method: method,
            data: payload,
            success: function () {
                closeJunketLossModal();
                fetchJunketLossData();
                Swal.fire('Success', 'Record saved successfully.', 'success');
            },
            error: function () {
                Swal.fire('Error', 'Failed to save record.', 'error');
            }
        });
    });
});
