$(document).ready(function() {
	let dataTable;
	let currentFilter = 'all';

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

	// Initialize DataTable
	function initializeDataTable() {
		if ($.fn.DataTable.isDataTable('#fnb-hotel-table')) {
			$('#fnb-hotel-table').DataTable().destroy();
		}

		const translations = window.fnbHotelTranslations || {};

		dataTable = $('#fnb-hotel-table').DataTable({
			pageLength: 10,
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

	// Initialize DataTable (this will also call reloadData)
	initializeDataTable();

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
