$(document).ready(function() {
	let dataTable;
	let currentFilter = 'all';
	let dateRangeMin = null;
	let dateRangeMax = null;
	let fnbDateFilterRegistered = false;
	// Export: exclude ENCODED BY + ACTION
	const FNB_EXPORT_COL_INDEXES = [0, 1, 2, 3, 4, 5, 6, 8];
	const FNB_EXPORT_DATA_COLS = FNB_EXPORT_COL_INDEXES.length;
	const FNB_EXPORT_COL_WIDTHS = [12, 24, 10, 14, 12, 12, 28, 22];

	// Helpers (mirror the EJS helpers)
	function formatDateForDisplay(value) {
		if (!value) return '-';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '-';
		const pad = (n) => String(n).padStart(2, '0');
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function paymentLabel(transactionId) {
		switch (parseInt(transactionId, 10)) {
			case 1:
				return 'Cash';
			case 2:
				return 'Deposit';
			case 3:
				return 'Settle';
			default:
				return '-';
		}
	}

	function fnbExportCellBorder() {
		const edge = { style: 'thin', color: { argb: 'FF000000' } };
		return { top: edge, left: edge, bottom: edge, right: edge };
	}

	function fnbSanitizeFilePart(s) {
		return String(s || '')
			.replace(/\s+/g, '_')
			.replace(/[^\w\-]/g, '')
			.trim();
	}

	function fnbExportFileName() {
		const raw = ($('#fnb-hotel-daterange').val() || '').trim();
		if (raw) return `FnbHotel_${fnbSanitizeFilePart(raw)}.xlsx`;
		const now = new Date();
		const pad = (n) => String(n).padStart(2, '0');
		const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		return `FnbHotel_${ts}.xlsx`;
	}

	function getRowEncodedTimestamp(settings, dataIndex) {
		const rowData = settings.aoData[dataIndex];
		if (!rowData) return 0;

		const rowNode = rowData.nTr;
		if (rowNode) {
			const order = $(rowNode).find('td').eq(8).attr('data-order');
			if (order) return parseInt(order, 10) || 0;
		}

		const cell = rowData._aData && rowData._aData[8];
		if (cell && typeof cell === 'object' && cell['@data-order'] != null) {
			return parseInt(cell['@data-order'], 10) || 0;
		}

		return 0;
	}

	function setDateRangeFromFlatpickr(selectedDates) {
		if (!selectedDates || selectedDates.length < 1) {
			dateRangeMin = null;
			dateRangeMax = null;
			return;
		}

		const start = new Date(selectedDates[0]);
		start.setHours(0, 0, 0, 0);
		const endDate = selectedDates.length >= 2 ? selectedDates[1] : selectedDates[0];
		const end = new Date(endDate);
		end.setHours(23, 59, 59, 999);
		dateRangeMin = start.getTime();
		dateRangeMax = end.getTime();
	}

	function registerDateFilter() {
		if (fnbDateFilterRegistered) return;
		fnbDateFilterRegistered = true;

		$.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
			if (settings.nTable.id !== 'fnb-hotel-table') return true;
			if (dateRangeMin === null && dateRangeMax === null) return true;

			const ts = getRowEncodedTimestamp(settings, dataIndex);
			if (!ts) return false;
			if (dateRangeMin !== null && ts < dateRangeMin) return false;
			if (dateRangeMax !== null && ts > dateRangeMax) return false;
			return true;
		});
	}

	function applyDateFilterDraw() {
		if (dataTable) dataTable.draw();
	}

	function mountDateFilterInToolbar() {
		const $length = $('#fnb-hotel-table_wrapper .dataTables_length');
		const $wrap = $('.fnb-hotel-date-filter-wrap');
		if (!$length.length || !$wrap.length || $wrap.data('mounted')) return;
		$wrap.detach().insertAfter($length);
		$wrap.data('mounted', true);
	}

	function resizeFnbDateInput(instance) {
		if (!instance || !instance.altInput) return;
		const text = (instance.altInput.value || instance.input.value || '').trim();
		const ch = Math.max(28, text.length + 1);
		instance.altInput.style.width = ch + 'ch';
	}

	let fnbDateFilterBackup = null;

	function setFnbDateInputDisplay(instance, text) {
		if (!instance) return;
		if (instance.altInput) {
			instance.altInput.value = text;
		} else if (instance.input) {
			instance.input.value = text;
		}
		resizeFnbDateInput(instance);
	}

	function backupFnbDateFilter(instance) {
		fnbDateFilterBackup = {
			display: instance.altInput ? instance.altInput.value : instance.input.value,
			min: dateRangeMin,
			max: dateRangeMax,
			selectedDates: (instance.selectedDates || []).map(function (d) {
				return new Date(d.getTime());
			})
		};
	}

	function restoreFnbDateFilter(instance) {
		if (!fnbDateFilterBackup || !instance) return;
		dateRangeMin = fnbDateFilterBackup.min;
		dateRangeMax = fnbDateFilterBackup.max;
		setFnbDateInputDisplay(instance, fnbDateFilterBackup.display);
		if (fnbDateFilterBackup.selectedDates.length) {
			instance.setDate(fnbDateFilterBackup.selectedDates, false);
		} else {
			instance.clear(false);
			setFnbDateInputDisplay(instance, fnbDateFilterBackup.display);
		}
		applyDateFilterDraw();
	}

	function parseFnbAmountCell(rawCellText) {
		const txt = String(rawCellText == null ? '' : rawCellText)
			.replace(/\u20B1/g, '')
			.replace(/,/g, '')
			.trim();
		if (!txt || txt === '-') return null;
		const n = parseFloat(txt);
		return Number.isNaN(n) ? null : n;
	}

	function parseFnbGameIdCell(rawCellText) {
		const txt = String(rawCellText == null ? '' : rawCellText).replace(/,/g, '').trim();
		if (!txt || txt === '-') return null;
		const n = parseInt(txt, 10);
		return Number.isNaN(n) ? null : n;
	}

	function exportFnbHotelToXlsx() {
		if (typeof ExcelJS === 'undefined') {
			if (typeof Swal !== 'undefined') {
				Swal.fire({ icon: 'error', title: 'Export', text: 'Excel library failed to load. Refresh and try again.' });
			}
			return Promise.resolve();
		}
		if (!$.fn.DataTable.isDataTable('#fnb-hotel-table')) return Promise.resolve();
		const dt = $('#fnb-hotel-table').DataTable();
		const headers = [];
		FNB_EXPORT_COL_INDEXES.forEach(function (tableIdx, exportIdx) {
			let h = $('#fnb-hotel-table thead th').eq(tableIdx).text().replace(/\s+/g, ' ').trim();
			// Requested rename: Game ID -> GAME #
			if (exportIdx === 2) h = 'GAME #';
			// Keep header text for others
			headers.push(h);
		});
		const rows = [];
		dt.rows({ search: 'applied' }).every(function () {
			const data = this.data();
			if (!data || data.length < 9) return;
			const row = [];
			for (let c = 0; c < FNB_EXPORT_DATA_COLS; c++) {
				const raw = data[FNB_EXPORT_COL_INDEXES[c]];
				let text = '';
				if (raw && typeof raw === 'object' && raw.display !== undefined) {
					text = String(raw.display);
				} else {
					text = $('<div>').html(raw == null ? '' : String(raw)).text().replace(/\s+/g, ' ').trim();
				}
				// Export col 2 = GAME #, col 4 = AMOUNT
				if (c === 2) {
					const gameNo = parseFnbGameIdCell(text);
					row.push(gameNo !== null ? gameNo : text);
				} else if (c === 4) {
					const amount = parseFnbAmountCell(text);
					row.push(amount !== null ? amount : text);
				} else {
					row.push(text);
				}
			}
			rows.push(row);
		});
		const workbook = new ExcelJS.Workbook();
		// Excel forbids these in sheet names: * ? : \ / [ ]
		const sheet = workbook.addWorksheet('Services', { views: [{ state: 'frozen', ySplit: 1 }] });
		sheet.addRow(headers);
		rows.forEach((r) => sheet.addRow(r));
		for (let i = 1; i <= FNB_EXPORT_DATA_COLS; i++) {
			sheet.getColumn(i).width = FNB_EXPORT_COL_WIDTHS[i - 1] || 14;
		}
		const headerRow = sheet.getRow(1);
		headerRow.height = 22;
		headerRow.eachCell({ includeEmpty: true }, function (cell, colNumber) {
			if (colNumber > FNB_EXPORT_DATA_COLS) return;
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
			// AMOUNT column is export col 5 (1-based)
			cell.alignment = { vertical: 'middle', horizontal: colNumber === 5 ? 'right' : 'center', wrapText: true };
			cell.border = fnbExportCellBorder();
		});
		sheet.eachRow(function (row, rowNumber) {
			if (rowNumber === 1) return;
			row.height = 18;
			row.eachCell({ includeEmpty: true }, function (cell, colNumber) {
				if (colNumber > FNB_EXPORT_DATA_COLS) return;
				if (colNumber === 3 && typeof cell.value === 'number') cell.numFmt = '0'; // GAME #
				if (colNumber === 5 && typeof cell.value === 'number') cell.numFmt = '#,##0'; // AMOUNT
				cell.alignment = { vertical: 'middle', horizontal: colNumber === 5 ? 'right' : 'center', wrapText: false };
				cell.border = fnbExportCellBorder();
			});
		});
		return workbook.xlsx.writeBuffer().then(function (buffer) {
			const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = fnbExportFileName();
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		});
	}

	// Initialize DataTable
	function initializeDataTable() {
		if ($.fn.DataTable.isDataTable('#fnb-hotel-table')) {
			$('#fnb-hotel-table').DataTable().destroy();
		}

		const translations = window.fnbHotelTranslations || {};

		dataTable = $('#fnb-hotel-table').DataTable({
			pageLength: 25,
			lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
			searching: true,
			ordering: true,
			info: true,
			paging: true,
			order: [[8, 'desc']], // Sort by Date column (descending)
			columnDefs: [
				{
					createdCell: function (cell) {
						$(cell).addClass('text-center');
					}
				},
				{
					targets: [8], // Date column: sort by data-order / @data-order (timestamp)
					render: function (data) {
						if (typeof data === 'object' && data && data.display !== undefined) return data.display;
						return data;
					}
				},
				{
					targets: [9], // Action column
					orderable: false,
					searchable: false
				}
			],
			language: {
				search: translations.search || "Search:",
				lengthMenu: translations.lengthMenu || "Show _MENU_ entries",
				info: translations.showing_entries || "Showing _START_ to _END_ of _TOTAL_ entries",
				infoEmpty: translations.infoEmpty || "Showing 0 to 0 of 0 entries",
				infoFiltered: translations.infoFiltered || "(filtered from _MAX_ total entries)",
				paginate: {
					previous: translations.previous || "Previous",
					next: translations.next || "Next"
				},
				emptyTable: translations.no_data_found || "No data available in table"
			},
			initComplete: function () {
				mountDateFilterInToolbar();
			}
		});

		// Apply initial filter to already-rendered rows
		updateFilter(currentFilter);
	}

	// Filter functionality (use DataTables column search on Service Type column)
	const filterLinks = document.querySelectorAll('#fnb-hotel-filter .filter-link');

	function updateFilter(filter) {
		if (!dataTable) return;

		currentFilter = filter;

		const serviceTypeColumnIndex = 3; // 0-based index for \"Service Type\"

		if (filter === 'all') {
			// Clear column filter
			dataTable.column(serviceTypeColumnIndex).search('').draw();
		} else {
			// Exact match on service type text (fnb, hotel, delivery)
			const regex = '^' + filter + '$';
			dataTable
				.column(serviceTypeColumnIndex)
				.search(regex, true, false) // regex = true, smart = false
				.draw();
		}
	}

	// Filter link click handlers
	filterLinks.forEach((link) => {
		link.addEventListener('click', (event) => {
			event.preventDefault();
			const selectedFilter = link.dataset.filter;
			if (!selectedFilter) return;

			filterLinks.forEach((otherLink) => otherLink.classList.remove('active'));
			link.classList.add('active');
			updateFilter(selectedFilter);
		});
	});

	// Reload data (similar pattern to manage_user.js)
	function reloadData() {
		if (!dataTable) return;

		$.ajax({
			url: '/fnb-hotel/data',
			method: 'GET',
			success: function(services) {
				dataTable.clear();

				services.forEach(function(service) {
					const amt = Number(service.AMOUNT) || 0;
					const hasDecimals = amt % 1 !== 0;
					const formattedAmt = hasDecimals
						? amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
						: amt.toLocaleString('en-US');
					const isJunketSource = service.SOURCE_TYPE === 'JUNKET';
					const isSettle = parseInt(service.TRANSACTION_ID, 10) === 3;
					const displayAmt = (isJunketSource ? '-' : '') + formattedAmt;
					const hasGameId = !!service.GAME_ID;
					const isGameSettled = hasGameId && service.game_settled === 1;
					const canEdit = !hasGameId;
					const canDelete = !hasGameId;

					const sourceClass = isSettle ? 'text-primary' : '';
					const amountClass = isJunketSource ? 'text-danger' : (isSettle ? 'text-primary' : '');

					const sourceHtml = `<span class="${sourceClass}">${service.SOURCE_TYPE || '-'}</span>`;
					const agentHtml = service.SOURCE_TYPE === 'JUNKET'
						? '-'
						: (service.agent_name || 'Unknown');
					const gameIdHtml = service.GAME_ID ? service.GAME_ID : '-';
					const serviceTypeHtml = service.SERVICE_TYPE || '';
					const amountHtml = `<span class="${amountClass}">${displayAmt}</span>`;
					const paymentHtml = paymentLabel(service.TRANSACTION_ID);
					const remarksHtml = service.REMARKS || '-';
					const encodedByHtml = service.encoded_by_name || '-';
					const rawDate = service.ENCODED_DT ? new Date(service.ENCODED_DT).getTime() : 0;
					const dateDisplay = formatDateForDisplay(service.ENCODED_DT);
					// Orthogonal data: display text for show, @data-order for correct date sort
					const dateCellData = { display: dateDisplay, '@data-order': String(rawDate) };

					const safeRemarks = (service.REMARKS || '').replace(/"/g, '&quot;');

					let actionHtml = '';
					if (canEdit && canDelete) {
						actionHtml = `
							<div class="btn-group">
								<button type="button"
									class="btn btn-sm bg-info-subtle edit-service-btn"
									data-id="${service.IDNo}"
									data-source="${service.SOURCE_TYPE}"
									data-agent="${service.AGENT_ID || ''}"
									data-service="${service.SERVICE_TYPE}"
									data-amount="${service.AMOUNT}"
									data-remarks="${safeRemarks}"
									data-transaction="${service.TRANSACTION_ID}"
									title="Edit">
									<i class="fa fa-pencil-alt"></i>
								</button>
								<button type="button"
									class="btn btn-sm bg-danger-subtle delete-service-btn"
									data-id="${service.IDNo}"
									title="Delete">
									<i class="fa fa-trash"></i>
								</button>
							</div>`;
					} else if (hasGameId && isGameSettled) {
						actionHtml = `
							<span class="badge bg-success-subtle text-success fw-semibold px-3 py-2">
								Settled
							</span>`;
					} else if (hasGameId && !isGameSettled) {
						actionHtml = `
							<button type="button"
								class="btn btn-sm bg-warning-subtle text-warning gamebook-notice-btn"
								title="Edit in Gamebook">
								<i class="fa fa-info-circle"></i>
							</button>`;
					}

					dataTable.row.add([
						sourceHtml,
						agentHtml,
						gameIdHtml,
						serviceTypeHtml,
						amountHtml,
						paymentHtml,
						remarksHtml,
						encodedByHtml,
						dateCellData,
						actionHtml
					]);
				});

				dataTable.draw();
				// Re-apply current filter
				updateFilter(currentFilter);
			},
			error: function(xhr, status, error) {
				console.error('Error loading F&B / Hotel data:', error);
			}
		});
	}

	// Expose reload for other scripts (new/edit modals)
	window.reloadFnbHotelData = reloadData;

	registerDateFilter();
	dateRangeMin = moment().startOf('day').valueOf();
	dateRangeMax = moment().endOf('day').valueOf();
	initializeDataTable();

	flatpickr('#fnb-hotel-daterange', {
		mode: 'range',
		altInput: true,
		altFormat: 'M d, Y',
		dateFormat: 'Y-m-d',
		showMonths: 3,
		onReady: function (selectedDates, dateStr, instance) {
			instance.changeMonth(-2, true);
			if (typeof bindFlatpickrMonthNameRangeSelect === 'function') {
				bindFlatpickrMonthNameRangeSelect(instance);
			}
			setFnbDateInputDisplay(instance, moment().format('MMM D, Y'));
		},
		onOpen: function (selectedDates, dateStr, instance) {
			backupFnbDateFilter(instance);
			instance.clear(false);
			setFnbDateInputDisplay(instance, fnbDateFilterBackup.display);

			const n = new Date();
			instance.jumpToDate(new Date(n.getFullYear(), n.getMonth() - 2, 1), false);
			if (typeof bindFlatpickrMonthNameRangeSelect === 'function') {
				bindFlatpickrMonthNameRangeSelect(instance);
			}
		},
		onClose: function (selectedDates, dateStr, instance) {
			if (!selectedDates.length) {
				restoreFnbDateFilter(instance);
			}
		},
		onChange: function (selectedDates, dateStr, instance) {
			resizeFnbDateInput(instance);
			if (selectedDates.length >= 1) {
				setDateRangeFromFlatpickr(selectedDates);
				applyDateFilterDraw();
			}
		}
	});

	$(document).on('click', '#btn-export-fnb-hotel', function (e) {
		e.preventDefault();
		const $btn = $('#btn-export-fnb-hotel');
		$btn.prop('disabled', true);
		exportFnbHotelToXlsx()
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

	// Edit service button handlers
	$(document).on('click', '.edit-service-btn', function() {
		const $btn = $(this);
		const id = $btn.data('id');
		const sourceType = $btn.data('source');
		const agentId = $btn.data('agent');
		const serviceType = $btn.data('service');
		const amount = parseFloat($btn.data('amount')) || 0;
		const remarks = $btn.data('remarks') || '';
		const transactionId = $btn.data('transaction');

		$('#edit-services-id').val(id);
		$('#edit-transaction-type').val(sourceType).trigger('change');
		$('#edit-services-type').val(serviceType);
		$('#edit-services-amount').val(amount.toLocaleString('en-US'));
		$('#edit-services-remarks').val(remarks);
		if (transactionId) {
			$(`input[name="edit-services-transaction"][value="${transactionId}"]`).prop('checked', true);
		}
		
		// Store agentId for later use after accounts are loaded
		if (sourceType === 'GUEST' && agentId) {
			$('#modal-services-edit-record').data('pendingAgentId', agentId);
		}
		
		$('#modal-services-edit-record').modal('show');
	});

	// Delete service button handlers
	$(document).on('click', '.delete-service-btn', function() {
		const id = $(this).data('id');
		Swal.fire({
			title: 'Delete Service Record?',
			text: 'This action cannot be undone.',
			icon: 'warning',
			showCancelButton: true,
			confirmButtonText: 'Yes, delete',
			cancelButtonText: 'Cancel',
			confirmButtonColor: '#d33'
		}).then((result) => {
			if (result.isConfirmed) {
				$.ajax({
					url: `/fnb-hotel/service/${id}`,
					method: 'DELETE',
					success: function() {
						Swal.fire({
							icon: 'success',
							title: 'Deleted',
							text: 'Service record has been deleted.',
							timer: 1500,
							showConfirmButton: false
						}).then(() => {
							reloadData();
						});
					},
					error: function(xhr) {
						const errorMsg = xhr.responseJSON?.error || 'Failed to delete service record.';
						Swal.fire({
							icon: 'error',
							title: 'Error',
							text: errorMsg
						});
					}
				});
			}
		});
	});

	// Gamebook notice button handler
	$(document).on('click', '.gamebook-notice-btn', function() {
		const $row = $(this).closest('tr');
		const agentName = $row.find('td').eq(1).text().trim() || '-';
		const gameId = $row.find('td').eq(2).text().trim() || '-';

		const detailsHtml = `
			<p>This service is linked to a game. Please proceed to <strong>Gamebook</strong> to edit this record.</p>
			<hr>
			<p class="mb-1"><strong>Agent:</strong> ${agentName}</p>
			<p class="mb-0"><strong>Game ID:</strong> ${gameId}</p>
		`;

		Swal.fire({
			icon: 'info',
			title: 'Edit from Gamebook',
			html: detailsHtml,
			confirmButtonText: 'OK'
		});
	});
});
