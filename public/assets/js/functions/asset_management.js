let assetTable;
let liabilityTable;
let capitalTable;
let incomeTable;
let incomeData = null;
let amDateFrom = '';
let amDateTo = '';

const ASSET_CATEGORIES = {
	'Current Asset': ['Cash on Hand', 'Bank Balance', 'Accounts Receivable', 'Chips Inventory', 'Prepaid Expenses', 'Inventory'],
	'Fixed Asset': ['Vehicle', 'Equipment', 'Furniture & Fixtures', 'Leasehold Improvement', 'Appliances'],
	'Other Asset': ['Deposit', 'Investment', 'Other']
};

const LIABILITY_CATEGORIES = {
	'Current Liability': ['Accounts Payable', 'Guest Deposit', 'Accrued Expenses', 'Short-term Loan', 'Commission Payable', 'Taxes Payable'],
	'Long-term Liability': ['Bank Loan', 'Lease Obligation', 'Other Long-term Debt']
};

function parseAmountValue(value) {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(String(value).replace(/,/g, ''));
	if (!Number.isFinite(n)) return null;
	return Math.round(n);
}

function sanitizeAmountInput(value) {
	const n = parseAmountValue(value);
	return n === null ? '' : String(n);
}

function formatAmountInput(value) {
	const n = parseAmountValue(value);
	if (n === null) return '';
	return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatMoney(n) {
	return Math.round(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatDateYmd(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return y + '-' + m + '-' + day;
}

function amApiUrl(path) {
	if (!amDateFrom || !amDateTo) return path;
	const sep = path.indexOf('?') >= 0 ? '&' : '?';
	return path + sep + 'dateFrom=' + encodeURIComponent(amDateFrom) + '&dateTo=' + encodeURIComponent(amDateTo);
}

function reloadAllAmData() {
	fetchAssets();
	fetchLiabilities();
	fetchCapital();
	fetchIncomeStatement();
	fetchBalanceSheet();
}

function populateCategorySelect($select, type, categoriesMap, selected) {
	$select.empty().append('<option value="">—</option>');
	(categoriesMap[type] || []).forEach(function (cat) {
		$select.append('<option value="' + cat + '">' + cat + '</option>');
	});
	if (selected) $select.val(selected);
}

function actionButtons(editClass, removeClass, id) {
	return '<div class="am-actions">' +
		'<button type="button" class="btn btn-sm btn-alt-secondary me-1 ' + editClass + '" data-id="' + id + '">' +
		'<i class="fa fa-pencil-alt"></i></button>' +
		'<button type="button" class="btn btn-sm btn-alt-secondary ' + removeClass + '" data-id="' + id + '">' +
		'<i class="fa fa-trash-alt"></i></button>' +
		'</div>';
}

function incomeActionButtons(row) {
	const key = row.ENTRY_KEY || '';
	const id = row.IDNo || '';
	return '<div class="am-actions">' +
		'<button type="button" class="btn btn-sm btn-alt-secondary me-1 btn-income-edit" data-entry-key="' + key + '" data-id="' + id + '">' +
		'<i class="fa fa-pencil-alt"></i></button>' +
		'<button type="button" class="btn btn-sm btn-alt-secondary btn-income-remove" data-entry-key="' + key + '" data-id="' + id + '">' +
		'<i class="fa fa-trash-alt"></i></button>' +
		'</div>';
}

function getAmDtLanguage() {
	const translations = window.translations?.asset_management_page || {};
	return {
		search: translations.search || 'Search:',
		info: translations.showing_entries || 'Showing _START_ to _END_ of _TOTAL_ entries',
		emptyTable: translations.empty_table || 'No entries yet',
		paginate: {
			previous: translations.previous || 'Previous',
			next: translations.next || 'Next'
		}
	};
}

function initAmDataTable(selector, columns, options) {
	if ($.fn.DataTable.isDataTable(selector)) {
		$(selector).DataTable().destroy();
	}
	const numericTargets = options.numericTargets || [];
	const actionTarget = options.actionTarget;
	const columnDefs = [{ targets: '_all', className: 'align-middle' }]
		.concat(numericTargets.map(function (target) {
			return { targets: target, className: 'text-end' };
		}));
	if (actionTarget != null) {
		columnDefs.push({
			targets: actionTarget,
			className: 'text-center',
			orderable: false,
			searchable: false
		});
	}
	return $(selector).DataTable({
		pageLength: 25,
		language: getAmDtLanguage(),
		columnDefs: columnDefs,
		order: options.order || [],
		columns: columns
	});
}

function refreshAll() {
	reloadAllAmData();
}

// ----- Balance Sheet -----

function assetTypeBadge(type) {
	const t = String(type || '');
	if (t === 'Current Asset') return '<span class="am-bs-badge am-bs-badge-current">' + t + '</span>';
	if (t === 'Fixed Asset') return '<span class="am-bs-badge am-bs-badge-fixed">' + t + '</span>';
	return '<span class="am-bs-badge am-bs-badge-other">' + (t || '—') + '</span>';
}

function liabilityTypeBadge(type) {
	const t = String(type || '');
	if (t === 'Current Liability') return '<span class="am-bs-badge am-bs-badge-debt">' + t + '</span>';
	if (t === 'Long-term Liability') return '<span class="am-bs-badge am-bs-badge-fixed">' + t + '</span>';
	return '<span class="am-bs-badge am-bs-badge-other">' + (t || '—') + '</span>';
}

function appendBsSectionRow($tbody, label, colspan) {
	$tbody.append('<tr class="am-bs-section-row"><td colspan="' + colspan + '">' + label + '</td></tr>');
}

function appendBsEmptyRow($tbody, colspan, message) {
	$tbody.append('<tr class="am-bs-empty"><td colspan="' + colspan + '">' + message + '</td></tr>');
}

function overviewCell(value) {
	const text = String(value || '').trim();
	return text || '—';
}

function fetchBalanceSheet() {
	const emptyMsg = $('#tab-summary').data('empty-msg') || 'No entries yet';
	$.get(amApiUrl('/balance_sheet_summary'), function (data) {
		$('#summary-total-assets').text(formatMoney(data.assets.total));
		$('#summary-total-liabilities').text(formatMoney(data.liabilities.debtsTotal));
		$('#summary-capital-net-income').text(formatMoney((Number(data.liabilities.capital) || 0) + (Number(data.liabilities.netIncome) || 0)));
		$('#summary-assets-foot').text(formatMoney(data.assets.total));
		$('#summary-liabilities-foot').text(formatMoney(data.liabilities.debtsTotal));
		$('#summary-capital-foot').text(formatMoney((Number(data.liabilities.capital) || 0) + (Number(data.liabilities.netIncome) || 0)));

		const $assetBody = $('#summary-assets-tbl tbody').empty();
		let assetCount = 0;
		if ((Number(data.assets.cashFromCapital) || 0) > 0) {
			$assetBody.append(
				'<tr><td>' + assetTypeBadge('Current Asset') + '</td>' +
				'<td>Cash on Hand</td>' +
				'<td><strong>Cash (Capital)</strong></td>' +
				'<td class="text-end am-amount">' + formatMoney(data.assets.cashFromCapital) + '</td></tr>'
			);
			assetCount++;
		}
		if ((Number(data.assets.cashFromNetIncome) || 0) > 0) {
			$assetBody.append(
				'<tr><td>' + assetTypeBadge('Current Asset') + '</td>' +
				'<td>Cash on Hand</td>' +
				'<td><strong>Cash (Net Income)</strong></td>' +
				'<td class="text-end am-amount">' + formatMoney(data.assets.cashFromNetIncome) + '</td></tr>'
			);
			assetCount++;
		}
		const allAssets = []
			.concat(data.assets.current || [])
			.concat(data.assets.fixed || [])
			.concat(data.assets.other || []);
		allAssets.forEach(function (row) {
			$assetBody.append(
				'<tr><td>' + assetTypeBadge(row.ASSET_TYPE) + '</td>' +
				'<td>' + overviewCell(row.CATEGORY) + '</td>' +
				'<td>' + (row.ASSET_NAME || '—') + '</td>' +
				'<td class="text-end am-amount">' + formatMoney(row.CURRENT_VALUE) + '</td></tr>'
			);
			assetCount++;
		});
		if (!assetCount) {
			appendBsEmptyRow($assetBody, 4, emptyMsg);
		}

		const $liabBody = $('#summary-liabilities-tbl tbody').empty();
		const $capitalBody = $('#summary-capital-tbl tbody').empty();
		const capitalItems = data.liabilities.capitalItems || [];
		const debts = data.liabilities.debts || [];
		let equityCount = 0;

		if (debts.length) {
			debts.forEach(function (row) {
				$liabBody.append(
					'<tr><td>' + liabilityTypeBadge(row.LIABILITY_TYPE) + '</td>' +
					'<td>' + overviewCell(row.CATEGORY) + '</td>' +
					'<td>' + (row.DESCRIPTION || '—') + '</td>' +
					'<td class="text-end am-amount">' + formatMoney(row.BALANCE) + '</td></tr>'
				);
			});
		} else {
			appendBsEmptyRow($liabBody, 4, emptyMsg);
		}

		if (capitalItems.length) {
			appendBsSectionRow($capitalBody, 'Capital', 2);
			capitalItems.forEach(function (row) {
				$capitalBody.append(
					'<tr><td>' + (row.DESCRIPTION || '—') + '</td>' +
					'<td class="text-end am-amount">' + formatMoney(row.AMOUNT) + '</td></tr>'
				);
				equityCount++;
			});
		}

		appendBsSectionRow($capitalBody, 'Net Income', 2);
		$capitalBody.append(
			'<tr><td>Net Income</td>' +
			'<td class="text-end am-amount">' + formatMoney(data.liabilities.netIncome) + '</td></tr>'
		);
		equityCount++;

		if (!equityCount) {
			appendBsEmptyRow($capitalBody, 2, emptyMsg);
		}
	}).fail(function () {
		Swal.fire('Error', 'Failed to load balance sheet.', 'error');
	});
}

// ----- Income Statement -----

function buildIncomeRows(data) {
	const rows = [];
	rows.push({
		ENTRY_KEY: 'sales',
		ENTRY_TYPE: 'Sales',
		DESCRIPTION: 'Sales',
		AMOUNT: data.sales || 0,
		IDNo: null
	});
	rows.push({
		ENTRY_KEY: 'cogs',
		ENTRY_TYPE: 'Cost of Sales',
		DESCRIPTION: 'Cost of Sales',
		AMOUNT: data.costOfSales || 0,
		IDNo: null
	});
	(data.opex || []).forEach(function (row) {
		rows.push({
			ENTRY_KEY: 'opex',
			ENTRY_TYPE: 'Operation Expense',
			DESCRIPTION: row.DESCRIPTION,
			AMOUNT: row.AMOUNT,
			IDNo: row.IDNo
		});
	});
	return rows;
}

function renderIncomeSummary(data) {
	incomeData = data;
	$('#is-sales-total').text(formatMoney(data.sales || 0));
	$('#is-cogs-total').text(formatMoney(data.costOfSales || 0));
	$('#is-opex-total').text(formatMoney(data.opexTotal || 0));
	$('#is-net-income').text(formatMoney(data.netIncome || 0));
	if (incomeTable) {
		incomeTable.clear().rows.add(buildIncomeRows(data)).draw();
	}
}

function fetchIncomeStatement() {
	$.get(amApiUrl('/income_statement_data'), function (data) {
		renderIncomeSummary(data);
	}).fail(function () {
		Swal.fire('Error', 'Failed to load income statement.', 'error');
	});
}

function toggleIncomeDescField(type) {
	const isOpex = type === 'opex';
	const $wrap = $('#income-entry-desc-wrap');
	const $desc = $('#income-entry-description');
	if (isOpex) {
		$wrap.show();
		$desc.prop('required', true);
	} else {
		$wrap.hide();
		$desc.prop('required', false);
		if (type === 'sales') $desc.val('Sales');
		if (type === 'cogs') $desc.val('Cost of Sales');
	}
}

function openIncomeEntryModal(data) {
	const entryKey = data ? data.ENTRY_KEY : '';
	const id = data && data.IDNo ? data.IDNo : '';
	$('#income-entry-id').val(id);
	$('#income-entry-key').val(entryKey);
	$('#income-entry-type').val(entryKey || 'opex');
	$('#income-entry-description').val(data ? (data.DESCRIPTION || '') : '');
	$('#income-entry-amount').val(data ? formatAmountInput(data.AMOUNT || '') : '');
	toggleIncomeDescField(entryKey || 'opex');
	if (entryKey === 'sales' || entryKey === 'cogs') {
		$('#income-entry-type').prop('disabled', true);
	} else {
		$('#income-entry-type').prop('disabled', false);
	}
	const isEdit = !!(id || entryKey === 'sales' || entryKey === 'cogs');
	$('#income-entry-modal-title').text(isEdit ? 'Edit Entry' : 'Add Entry');
	$('#modal-income-entry').modal('show');
}

function closeIncomeEntryModal() {
	$('#income-entry-form')[0].reset();
	$('#income-entry-id').val('');
	$('#income-entry-key').val('');
	$('#income-entry-type').prop('disabled', false);
	$('#modal-income-entry').modal('hide');
}

function removeIncomeEntry(row) {
	const title = row.ENTRY_KEY === 'opex'
		? 'Archive this expense?'
		: 'Clear this amount?';
	Swal.fire({ title: title, icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes' })
		.then(function (result) {
			if (!result.isConfirmed) return;

			if (row.ENTRY_KEY === 'opex') {
				$.ajax({
					url: '/income_opex/remove/' + row.IDNo,
					method: 'PUT',
					success: function () {
						fetchIncomeStatement();
						fetchBalanceSheet();
						Swal.fire('Success', 'Entry archived successfully.', 'success');
					},
					error: function () { Swal.fire('Error', 'Failed to archive entry.', 'error'); }
				});
				return;
			}

			const sales = row.ENTRY_KEY === 'sales' ? '0' : sanitizeAmountInput(String(incomeData.sales || 0));
			const cogs = row.ENTRY_KEY === 'cogs' ? '0' : sanitizeAmountInput(String(incomeData.costOfSales || 0));
			$.ajax({
				url: '/save_income_statement',
				method: 'POST',
				data: { txtSales: sales, txtCostOfSales: cogs },
				success: function () {
					fetchIncomeStatement();
					fetchBalanceSheet();
					Swal.fire('Success', 'Entry cleared successfully.', 'success');
				},
				error: function () { Swal.fire('Error', 'Failed to clear entry.', 'error'); }
			});
		});
}

// ----- Capital -----

function openCapitalModal(data) {
	const id = data && data.IDNo ? data.IDNo : '';
	$('#capital-id').val(id);
	$('#capital-description').val(data ? (data.DESCRIPTION || '') : '');
	$('#capital-amount').val(data ? formatAmountInput(data.AMOUNT || '') : '');
	$('#capital-remarks').val(data ? (data.REMARKS || '') : '');
	$('#capital-modal-title').text(id ? 'Edit Capital' : 'Add Capital');
	$('#modal-capital').modal('show');
}

function closeCapitalModal() {
	$('#capital-form')[0].reset();
	$('#capital-id').val('');
	$('#modal-capital').modal('hide');
}

function fetchCapital() {
	$.get(amApiUrl('/company_capital_data'), function (rows) {
		capitalTable.clear().rows.add(rows || []).draw();
	}).fail(function () {
		Swal.fire('Error', 'Failed to load capital.', 'error');
	});
}

function removeCapital(id) {
	Swal.fire({ title: 'Archive this capital entry?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes' })
		.then(function (result) {
			if (!result.isConfirmed) return;
			$.ajax({
				url: '/company_capital/remove/' + id,
				method: 'PUT',
				success: function () {
					fetchCapital();
					refreshAll();
					Swal.fire('Success', 'Capital archived successfully.', 'success');
				},
				error: function () { Swal.fire('Error', 'Failed to archive capital.', 'error'); }
			});
		});
}

// ----- Assets -----

function openAssetModal(data) {
	const id = data && data.IDNo ? data.IDNo : '';
	$('#asset-id').val(id);
	$('#asset-name').val(data ? (data.ASSET_NAME || '') : '');
	$('#asset-type').val(data ? (data.ASSET_TYPE || 'Current Asset') : 'Current Asset');
	populateCategorySelect($('#asset-category'), $('#asset-type').val(), ASSET_CATEGORIES, data ? data.CATEGORY : '');
	$('#asset-purchase-date').val(data && data.PURCHASE_DATE ? String(data.PURCHASE_DATE).slice(0, 10) : '');
	$('#asset-purchase-cost').val(data ? formatAmountInput(data.PURCHASE_COST || '') : '');
	$('#asset-current-value').val(data ? formatAmountInput(data.CURRENT_VALUE || '') : '');
	$('#asset-depreciation').val(data && data.DEPRECIATION_RATE != null ? data.DEPRECIATION_RATE : '');
	$('#asset-in-charge').val(data ? (data.IN_CHARGE || '') : '');
	$('#asset-status').val(data ? (data.STATUS || 'Active') : 'Active');
	$('#asset-remarks').val(data ? (data.REMARKS || '') : '');
	$('#asset-modal-title').text(id ? 'Edit Asset' : 'Add Asset');
	$('#modal-asset').modal('show');
}

function closeAssetModal() {
	$('#asset-form')[0].reset();
	$('#asset-id').val('');
	$('#modal-asset').modal('hide');
}

function fetchAssets() {
	$.get(amApiUrl('/company_asset_data'), function (rows) {
		assetTable.clear().rows.add(rows || []).draw();
	}).fail(function () {
		Swal.fire('Error', 'Failed to load assets.', 'error');
	});
}

function removeAsset(id) {
	Swal.fire({ title: 'Archive this asset?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes' })
		.then(function (result) {
			if (!result.isConfirmed) return;
			$.ajax({
				url: '/company_asset/remove/' + id,
				method: 'PUT',
				success: function () {
					fetchAssets();
					refreshAll();
					Swal.fire('Success', 'Asset archived successfully.', 'success');
				},
				error: function () { Swal.fire('Error', 'Failed to archive asset.', 'error'); }
			});
		});
}

// ----- Liabilities -----

function openLiabilityModal(data) {
	const id = data && data.IDNo ? data.IDNo : '';
	$('#liability-id').val(id);
	$('#liability-description').val(data ? (data.DESCRIPTION || '') : '');
	$('#liability-creditor').val(data ? (data.CREDITOR || '') : '');
	$('#liability-type').val(data ? (data.LIABILITY_TYPE || 'Current Liability') : 'Current Liability');
	populateCategorySelect($('#liability-category'), $('#liability-type').val(), LIABILITY_CATEGORIES, data ? data.CATEGORY : '');
	$('#liability-amount').val(data ? formatAmountInput(data.AMOUNT || '') : '');
	$('#liability-amount-paid').val(data ? formatAmountInput(data.AMOUNT_PAID || '0') : '0');
	$('#liability-interest').val(data && data.INTEREST_RATE != null ? data.INTEREST_RATE : '');
	$('#liability-remarks').val(data ? (data.REMARKS || '') : '');
	$('#liability-modal-title').text(id ? 'Edit Liability' : 'Add Liability');
	$('#modal-liability').modal('show');
}

function closeLiabilityModal() {
	$('#liability-form')[0].reset();
	$('#liability-id').val('');
	$('#modal-liability').modal('hide');
}

function fetchLiabilities() {
	$.get(amApiUrl('/company_liability_data'), function (rows) {
		liabilityTable.clear().rows.add(rows || []).draw();
	}).fail(function () {
		Swal.fire('Error', 'Failed to load liabilities.', 'error');
	});
}

function removeLiability(id) {
	Swal.fire({ title: 'Archive this liability?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes' })
		.then(function (result) {
			if (!result.isConfirmed) return;
			$.ajax({
				url: '/company_liability/remove/' + id,
				method: 'PUT',
				success: function () {
					fetchLiabilities();
					refreshAll();
					Swal.fire('Success', 'Liability archived successfully.', 'success');
				},
				error: function () { Swal.fire('Error', 'Failed to archive liability.', 'error'); }
			});
		});
}

// ----- Init -----

$(document).ready(function () {
	assetTable = initAmDataTable('#asset-tbl', [
		{ data: 'ASSET_NAME' },
		{ data: 'ASSET_TYPE' },
		{ data: 'CATEGORY', defaultContent: '—' },
		{ data: 'PURCHASE_DATE', render: function (d, t) { return !d ? '—' : (t === 'sort' ? d : moment(d).format('DD MMM YYYY')); } },
		{ data: 'PURCHASE_COST', render: formatMoney },
		{ data: 'CURRENT_VALUE', render: formatMoney },
		{ data: 'IN_CHARGE', defaultContent: '—' },
		{ data: 'STATUS' },
		{ data: null, orderable: false, searchable: false, render: function (r) { return actionButtons('btn-asset-edit', 'btn-asset-remove', r.IDNo); } }
	], { numericTargets: [4, 5], actionTarget: 8, order: [[3, 'desc']] });

	liabilityTable = initAmDataTable('#liability-tbl', [
		{ data: 'DESCRIPTION' },
		{ data: 'CREDITOR', defaultContent: '—' },
		{ data: 'LIABILITY_TYPE' },
		{ data: 'CATEGORY', defaultContent: '—' },
		{ data: 'AMOUNT', render: formatMoney },
		{ data: 'AMOUNT_PAID', render: formatMoney },
		{ data: null, render: function (r) { return formatMoney((Number(r.AMOUNT) || 0) - (Number(r.AMOUNT_PAID) || 0)); } },
		{ data: null, orderable: false, searchable: false, render: function (r) { return actionButtons('btn-liability-edit', 'btn-liability-remove', r.IDNo); } }
	], { numericTargets: [4, 5, 6], actionTarget: 7 });

	capitalTable = initAmDataTable('#capital-tbl', [
		{ data: 'DESCRIPTION' },
		{ data: 'AMOUNT', render: formatMoney },
		{ data: 'REMARKS', defaultContent: '—' },
		{ data: 'ENCODED_DT', render: function (d, t) { return !d ? '—' : (t === 'sort' ? d : moment(d).format('DD MMM YYYY HH:mm')); } },
		{ data: null, orderable: false, searchable: false, render: function (r) { return actionButtons('btn-capital-edit', 'btn-capital-remove', r.IDNo); } }
	], { numericTargets: [1], actionTarget: 4 });

	incomeTable = initAmDataTable('#income-tbl', [
		{ data: 'ENTRY_TYPE' },
		{ data: 'DESCRIPTION' },
		{ data: 'AMOUNT', render: formatMoney },
		{ data: null, orderable: false, searchable: false, render: function (r) { return incomeActionButtons(r); } }
	], { numericTargets: [2], actionTarget: 3 });

	const now = new Date();
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const calendarVisibleStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 2, 1);
	amDateFrom = formatDateYmd(monthStart);
	amDateTo = formatDateYmd(now);

	flatpickr('#am-daterange-picker', {
		mode: 'range',
		dateFormat: 'Y-m-d',
		altInput: true,
		altFormat: 'M d, Y',
		showMonths: 3,
		defaultMonth: calendarVisibleStart,
		defaultDate: [monthStart, now],
		maxDate: now,
		onReady: function (selectedDates, dateStr, instance) {
			instance.changeMonth(-2, true);
			if (typeof bindFlatpickrMonthNameRangeSelect === 'function') {
				bindFlatpickrMonthNameRangeSelect(instance);
			}
		},
		onOpen: function (selectedDates, dateStr, instance) {
			const anchor = new Date();
			instance.jumpToDate(new Date(anchor.getFullYear(), anchor.getMonth() - 2, 1), false);
			if (typeof bindFlatpickrMonthNameRangeSelect === 'function') {
				bindFlatpickrMonthNameRangeSelect(instance);
			}
		},
		onChange: function (selectedDates) {
			if (!selectedDates || selectedDates.length !== 2) return;
			amDateFrom = formatDateYmd(selectedDates[0]);
			amDateTo = formatDateYmd(selectedDates[1]);
			reloadAllAmData();
		}
	});

	reloadAllAmData();

	$('#tab-summary-btn').on('shown.bs.tab', fetchBalanceSheet);
	$('#tab-income-btn').on('shown.bs.tab', fetchIncomeStatement);
	$('#tab-capital-btn').on('shown.bs.tab', fetchCapital);

	$('#btn-add-asset').on('click', function () { openAssetModal(null); });
	$('#btn-add-liability').on('click', function () { openLiabilityModal(null); });
	$('#btn-add-capital').on('click', function () { openCapitalModal(null); });
	$('#btn-add-income-entry').on('click', function () { openIncomeEntryModal(null); });

	$('#income-entry-type').on('change', function () { toggleIncomeDescField($(this).val()); });

	$('#asset-type').on('change', function () { populateCategorySelect($('#asset-category'), $(this).val(), ASSET_CATEGORIES); });
	$('#liability-type').on('change', function () { populateCategorySelect($('#liability-category'), $(this).val(), LIABILITY_CATEGORIES); });

	$('#asset-purchase-cost, #asset-current-value, #liability-amount, #liability-amount-paid, #capital-amount, #income-entry-amount').on('input', function () {
		$(this).val(formatAmountInput($(this).val()));
	});

	$('#income-entry-form').on('submit', function (e) {
		e.preventDefault();
		const id = $('#income-entry-id').val();
		const entryKey = $('#income-entry-key').val();
		const type = $('#income-entry-type').val();
		const amount = sanitizeAmountInput($('#income-entry-amount').val());
		if (!amount) {
			Swal.fire('Validation', 'Please fill in all required fields.', 'warning');
			return;
		}

		if (type === 'opex') {
			const description = $('#income-entry-description').val().trim();
			if (!description) {
				Swal.fire('Validation', 'Please fill in all required fields.', 'warning');
				return;
			}
			$.ajax({
				url: id ? '/income_opex/' + id : '/add_income_opex',
				method: id ? 'PUT' : 'POST',
				data: { txtDescription: description, txtAmount: amount },
				success: function () {
					closeIncomeEntryModal();
					fetchIncomeStatement();
					fetchBalanceSheet();
					Swal.fire('Success', 'Entry saved successfully.', 'success');
				},
				error: function () { Swal.fire('Error', 'Failed to save entry.', 'error'); }
			});
			return;
		}

		const sales = type === 'sales'
			? amount
			: sanitizeAmountInput(String((incomeData && incomeData.sales) || 0));
		const cogs = type === 'cogs'
			? amount
			: sanitizeAmountInput(String((incomeData && incomeData.costOfSales) || 0));
		$.ajax({
			url: '/save_income_statement',
			method: 'POST',
			data: { txtSales: sales, txtCostOfSales: cogs },
			success: function () {
				closeIncomeEntryModal();
				fetchIncomeStatement();
				fetchBalanceSheet();
				Swal.fire('Success', 'Entry saved successfully.', 'success');
			},
			error: function () { Swal.fire('Error', 'Failed to save entry.', 'error'); }
		});
	});

	$('#capital-form').on('submit', function (e) {
		e.preventDefault();
		const id = $('#capital-id').val();
		const payload = {
			txtDescription: $('#capital-description').val().trim(),
			txtAmount: sanitizeAmountInput($('#capital-amount').val()),
			txtRemarks: $('#capital-remarks').val().trim()
		};
		if (!payload.txtDescription || !payload.txtAmount) {
			Swal.fire('Validation', 'Please fill in all required fields.', 'warning');
			return;
		}
		$.ajax({
			url: id ? '/company_capital/' + id : '/add_company_capital',
			method: id ? 'PUT' : 'POST',
			data: payload,
			success: function () {
				closeCapitalModal();
				fetchCapital();
				refreshAll();
				Swal.fire('Success', 'Capital saved successfully.', 'success');
			},
			error: function () { Swal.fire('Error', 'Failed to save capital.', 'error'); }
		});
	});

	$('#asset-form').on('submit', function (e) {
		e.preventDefault();
		const id = $('#asset-id').val();
		const payload = {
			txtAssetName: $('#asset-name').val().trim(),
			txtAssetType: $('#asset-type').val(),
			txtCategory: $('#asset-category').val(),
			txtPurchaseDate: $('#asset-purchase-date').val(),
			txtPurchaseCost: sanitizeAmountInput($('#asset-purchase-cost').val()),
			txtCurrentValue: sanitizeAmountInput($('#asset-current-value').val()),
			txtDepreciationRate: $('#asset-depreciation').val(),
			txtInCharge: $('#asset-in-charge').val().trim(),
			txtStatus: $('#asset-status').val(),
			txtRemarks: $('#asset-remarks').val().trim()
		};
		if (!payload.txtAssetName || !payload.txtPurchaseCost || !payload.txtCurrentValue) {
			Swal.fire('Validation', 'Please fill in all required fields.', 'warning');
			return;
		}
		$.ajax({
			url: id ? '/company_asset/' + id : '/add_company_asset',
			method: id ? 'PUT' : 'POST',
			data: payload,
			success: function () {
				closeAssetModal();
				fetchAssets();
				refreshAll();
				Swal.fire('Success', 'Asset saved successfully.', 'success');
			},
			error: function () { Swal.fire('Error', 'Failed to save asset.', 'error'); }
		});
	});

	$('#liability-form').on('submit', function (e) {
		e.preventDefault();
		const id = $('#liability-id').val();
		const payload = {
			txtDescription: $('#liability-description').val().trim(),
			txtCreditor: $('#liability-creditor').val().trim(),
			txtLiabilityType: $('#liability-type').val(),
			txtCategory: $('#liability-category').val(),
			txtAmount: sanitizeAmountInput($('#liability-amount').val()),
			txtAmountPaid: sanitizeAmountInput($('#liability-amount-paid').val()) || '0',
			txtInterestRate: $('#liability-interest').val(),
			txtRemarks: $('#liability-remarks').val().trim()
		};
		if (!payload.txtDescription || !payload.txtAmount) {
			Swal.fire('Validation', 'Please fill in all required fields.', 'warning');
			return;
		}
		$.ajax({
			url: id ? '/company_liability/' + id : '/add_company_liability',
			method: id ? 'PUT' : 'POST',
			data: payload,
			success: function () {
				closeLiabilityModal();
				fetchLiabilities();
				refreshAll();
				Swal.fire('Success', 'Liability saved successfully.', 'success');
			},
			error: function () { Swal.fire('Error', 'Failed to save liability.', 'error'); }
		});
	});

	$('#asset-tbl').on('click', '.btn-asset-edit', function () {
		const row = assetTable.row($(this).closest('tr')).data();
		openAssetModal(row || null);
	});
	$('#asset-tbl').on('click', '.btn-asset-remove', function () { removeAsset($(this).data('id')); });

	$('#liability-tbl').on('click', '.btn-liability-edit', function () {
		const row = liabilityTable.row($(this).closest('tr')).data();
		openLiabilityModal(row || null);
	});
	$('#liability-tbl').on('click', '.btn-liability-remove', function () { removeLiability($(this).data('id')); });

	$('#capital-tbl').on('click', '.btn-capital-edit', function () {
		const row = capitalTable.row($(this).closest('tr')).data();
		openCapitalModal(row || null);
	});
	$('#capital-tbl').on('click', '.btn-capital-remove', function () { removeCapital($(this).data('id')); });

	$('#income-tbl').on('click', '.btn-income-edit', function () {
		const row = incomeTable.row($(this).closest('tr')).data();
		openIncomeEntryModal(row || null);
	});
	$('#income-tbl').on('click', '.btn-income-remove', function () {
		const row = incomeTable.row($(this).closest('tr')).data();
		if (row) removeIncomeEntry(row);
	});
});
