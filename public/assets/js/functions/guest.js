const HIERARCHY_LEVEL_1_LABEL = 'Level 1';
const HIERARCHY_LEVEL_2_LABEL = 'Level 2 (Agent)';
const HIERARCHY_LEVEL_3_LABEL = 'Level 3 (Guest)';

let guestPageRows = [];
let guestPageAgencies = [];
let guestPageDataTable = null;

function escapeHtml(s) {
	const div = document.createElement('div');
	div.textContent = s == null ? '' : String(s);
	return div.innerHTML;
}

function escapeJsString(str) {
	if (str == null || str === undefined) return '';
	return String(str)
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n');
}

function formatGuestStatNumber(value) {
	const num = Number(value) || 0;
	return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function getGuestRowById(guestId) {
	const numericId = parseInt(guestId, 10);
	if (!numericId) return null;
	return guestPageRows.find(function (row) {
		return String(row.guest_id) === String(numericId);
	}) || null;
}

function buildGuestLineLabel(agencyName, agentCode, agentName) {
	const agency = String(agencyName || '').trim().toUpperCase();
	const code = String(agentCode || '').trim().toUpperCase();
	const name = String(agentName || '').trim().toUpperCase();
	const line = code && name ? (code + ' · ' + name) : (code || name || '');
	if (agency && line) return agency + ' · ' + line;
	return agency || line || '-';
}

function buildAgentLabel(row) {
	const code = String(row.agent_code || '').trim().toUpperCase();
	const name = String(row.agent_name || '').trim().toUpperCase();
	return code && name ? (code + ' · ' + name) : (code || name || '-');
}

function isGuestTelegramEnabledFlag(row) {
	const v = row && row.telegram_enabled;
	return v === 1 || v === true || v === '1' || v === undefined || v === null;
}

function showGuestTelegramToggleSwal(enabled) {
	const tr = window.translations?.guest_page || {};
	Swal.fire({
		title: tr.success || 'Success',
		text: enabled
			? (tr.chat_id_enabled || 'Notifications enabled for this account.')
			: (tr.chat_id_disabled || 'Notifications disabled for this account.'),
		icon: 'success',
		confirmButtonText: tr.ok || 'OK'
	});
}

function renderGuestTelegramToggle(row, readOnly) {
	if (!row || !row.guest_telegram) return '';
	const enabled = isGuestTelegramEnabledFlag(row);
	const tr = window.translations?.guest_page || {};
	return (
		'<div class="form-check form-switch d-inline-flex mb-0 align-items-center justify-content-center">' +
		'<input class="form-check-input notify-toggle-switch btn-toggle-guest-telegram" type="checkbox" role="switch"' +
		' data-guest-id="' + row.guest_id + '" data-chat-id="' + escapeHtml(String(row.guest_telegram)) + '"' +
		(readOnly ? ' disabled' : '') +
		(enabled ? ' checked' : '') +
		' title="' + escapeHtml(tr.toggle_notifications || 'Enable / disable notifications') + '">' +
		'</div>'
	);
}

function promptManagerPasswordThen(actionText, onConfirmed) {
	Swal.fire({
		icon: 'warning',
		title: 'Password required',
		text: 'Enter the Super Admin password to ' + actionText,
		input: 'password',
		inputPlaceholder: 'Password',
		inputAttributes: {
			autocomplete: 'new-password',
			name: 'guest-delete-override'
		},
		showCancelButton: true,
		confirmButtonText: 'Continue',
		confirmButtonColor: '#d33',
		cancelButtonText: 'Cancel',
		allowOutsideClick: function () {
			return !Swal.isLoading();
		},
		preConfirm: function (password) {
			if (!password) {
				Swal.showValidationMessage('Password is required.');
				return false;
			}
			return new Promise(function (resolve) {
				$.ajax({
					url: '/verify-superadmin-password',
					type: 'POST',
					data: { password: password },
					success: function (response) {
						if (response && Number(response.permissions) === 0) {
							resolve();
							return;
						}
						Swal.showValidationMessage('Incorrect password.');
						resolve(false);
					},
					error: function (xhr) {
						Swal.showValidationMessage(
							(xhr && xhr.status === 403)
								? 'Incorrect password.'
								: 'Error during password verification.'
						);
						resolve(false);
					}
				});
			});
		}
	}).then(function (result) {
		if (result.isConfirmed && typeof onConfirmed === 'function') {
			onConfirmed();
		}
	});
}

function populateAgencySelect($select, selectedId) {
	$select.html('<option value="">Select ' + HIERARCHY_LEVEL_1_LABEL + '</option>');
	guestPageAgencies.forEach(function (row) {
		const id = row.IDNo;
		const name = String(row.AGENCY || '').trim();
		if (!id || !name) return;
		$select.append($('<option></option>').val(id).text(name.toUpperCase()));
	});
	if (selectedId) {
		$select.val(String(selectedId));
	}
}

function compareGuestPageAgents(a, b) {
	const codeA = String(a.agent_code || '').trim();
	const codeB = String(b.agent_code || '').trim();
	const byCode = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
	if (byCode !== 0) return byCode;
	return String(a.agent_name || a.NAME || '').trim().localeCompare(
		String(b.agent_name || b.NAME || '').trim(),
		undefined,
		{ sensitivity: 'base' }
	);
}

function sortGuestPageAgents(agents) {
	return (agents || []).slice().sort(compareGuestPageAgents);
}

function destroyGuestPageSelect2($select) {
	if (!$select || !$select.length || typeof $select.select2 !== 'function') return;
	if ($select.data('select2')) {
		try { $select.select2('destroy'); } catch (e) {}
	}
}

function initGuestPageSelect2($select, placeholder) {
	if (!$select || !$select.length || typeof $select.select2 !== 'function') return;
	destroyGuestPageSelect2($select);
	$select.select2({
		placeholder: placeholder || $select.data('placeholder') || 'Select an option',
		allowClear: false,
		width: '100%',
		dropdownParent: $('#modal-guest-page-add')
	});
}

function initTransferGuestAgentSelect2($agentSelect) {
	if (typeof $agentSelect.select2 !== 'function') return;
	if ($agentSelect.data('select2')) {
		try { $agentSelect.select2('destroy'); } catch (e) {}
	}
	$agentSelect.select2({
		placeholder: 'Select 2',
		allowClear: false,
		dropdownParent: $('#modal-transfer-guest-table')
	});
}

function loadAllTransferAgentOptions($agentSelect, currentAgentId) {
	if ($agentSelect.data('select2')) {
		try { $agentSelect.select2('destroy'); } catch (e) {}
	}
	$agentSelect.prop('disabled', true).html('<option value="">Loading...</option>');

	$.ajax({
		url: '/agent_data',
		method: 'GET',
		success: function (rows) {
			const agents = sortGuestPageAgents((rows || []).filter(function (row) {
				return String(row.agent_id) !== String(currentAgentId);
			}));
			if (!agents.length) {
				$agentSelect.html('<option value="">No agents available</option>').prop('disabled', true);
				initTransferGuestAgentSelect2($agentSelect);
				return;
			}
			let html = '<option value="">Select 2</option>';
			agents.forEach(function (agent) {
				const code = String(agent.agent_code || '').trim().toUpperCase();
				const name = String(agent.NAME || agent.agent_name || '').trim().toUpperCase();
				const label = code && name ? (code + ' - ' + name) : (code || name || '');
				html += '<option value="' + agent.agent_id + '">' + escapeHtml(label) + '</option>';
			});
			$agentSelect.html(html).prop('disabled', false);
			initTransferGuestAgentSelect2($agentSelect);
		},
		error: function () {
			$agentSelect.html('<option value="">Failed to load agent list</option>').prop('disabled', true);
			initTransferGuestAgentSelect2($agentSelect);
		}
	});
}

function loadTransferAgentOptions($agentSelect, agencyId, selectedAgentId) {
	const isGuestPageSelect = $agentSelect.hasClass('js-guest-page-select2');
	const placeholder = 'Select ' + HIERARCHY_LEVEL_2_LABEL;

	if (isGuestPageSelect) {
		destroyGuestPageSelect2($agentSelect);
	}

	if (!agencyId) {
		$agentSelect.html('<option value="">' + placeholder + '</option>').prop('disabled', true);
		if (isGuestPageSelect) {
			initGuestPageSelect2($agentSelect, placeholder);
		}
		return;
	}

	if (isGuestPageSelect) {
		$agentSelect.prop('disabled', true).html('<option value="">Loading...</option>');
	}

	$.ajax({
		url: '/account_data?agencyId=' + encodeURIComponent(agencyId),
		method: 'GET',
		success: function (rows) {
			const agents = sortGuestPageAgents(rows || []);
			if (!agents.length) {
				$agentSelect.html('<option value="">No ' + HIERARCHY_LEVEL_2_LABEL + ' under this ' + HIERARCHY_LEVEL_1_LABEL + '</option>').prop('disabled', true);
				if (isGuestPageSelect) {
					initGuestPageSelect2($agentSelect, placeholder);
				}
				return;
			}
			let html = '<option value="">' + placeholder + '</option>';
			agents.forEach(function (agent) {
				const id = agent.agent_id;
				const code = String(agent.agent_code || '').trim().toUpperCase();
				const name = String(agent.agent_name || '').trim().toUpperCase();
				const label = code && name ? (code + ' · ' + name) : (code || name || (HIERARCHY_LEVEL_2_LABEL + ' ' + id));
				html += '<option value="' + id + '">' + escapeHtml(label) + '</option>';
			});
			$agentSelect.html(html).prop('disabled', false);
			if (selectedAgentId) {
				$agentSelect.val(String(selectedAgentId));
			}
			if (isGuestPageSelect) {
				initGuestPageSelect2($agentSelect, placeholder);
			}
		},
		error: function () {
			$agentSelect.html('<option value="">Failed to load agent list</option>').prop('disabled', true);
			if (isGuestPageSelect) {
				initGuestPageSelect2($agentSelect, placeholder);
			}
		}
	});
}

function resolveAccountForGuest(guestId, callback) {
	const guest = getGuestRowById(guestId);
	if (!guest) {
		callback(null, HIERARCHY_LEVEL_3_LABEL + ' record is not available.');
		return;
	}

	const agentId = guest.agent_id;
	if (!agentId) {
		callback(null, HIERARCHY_LEVEL_3_LABEL + ' is not linked to a ' + HIERARCHY_LEVEL_1_LABEL + '.');
		return;
	}

	$.ajax({
		url: '/account_data?agencyId=' + encodeURIComponent(guest.agency_id),
		method: 'GET',
		success: function (rows) {
			const match = (rows || []).find(function (row) {
				return String(row.agent_id) === String(agentId) && row.account_id;
			});
			if (!match) {
				callback(null, 'No account is linked to this ' + HIERARCHY_LEVEL_1_LABEL + ' yet.');
				return;
			}
			callback(match, null, guest);
		},
		error: function () {
			callback(null, 'Failed to load account for this guest.');
		}
	});
}

function openGuestRemarks(guestId) {
	const target = getGuestRowById(guestId);
	if (!target) return;

	const remarks = String(target.guest_remarks || '').trim();
	const guestName = String(target.guest_name || '').trim();

	if (window.RemarksEditor && window.RemarksEditor.canEdit()) {
		window.RemarksEditor.openEditor(remarks, function (newVal) {
			window.RemarksEditor.patchRemarks('guest', guestId, newVal, {
				onSuccess: function () {
					target.guest_remarks = newVal;
					if (typeof window.reloadGuestTable === 'function') {
						window.reloadGuestTable();
					}
				},
				onError: function (err) {
					Swal.fire({
						icon: 'error',
						title: 'Error',
						text: (err && err.message) || 'Could not update remarks.'
					});
				}
			});
		});
		return;
	}

	Swal.fire({
		icon: 'info',
		title: guestName || 'Remarks',
		text: remarks || 'No remarks.',
		confirmButtonText: 'OK'
	});
}

function openEditGuestModal(guestId) {
	const target = getGuestRowById(guestId);
	if (!target) {
		Swal.fire({
			icon: 'warning',
			title: 'Not found',
			text: HIERARCHY_LEVEL_3_LABEL + ' record is not available.',
			confirmButtonText: 'OK'
		});
		return;
	}

	$('#edit_guest_id').val(target.guest_id || '');
	$('#edit_guest_membership_input').val(target.membership_no || '');
	$('#edit_guest_name_input').val(target.guest_name || '');
	$('#edit_guest_telegram_input').val(target.guest_telegram || '');
	$('#edit_guest_remarks_input').val(target.guest_remarks || '');
	$('#modal-edit-guest-table').modal('show');
}

function openTransferGuestModal(guestId) {
	const permissions = parseInt($('#user-role').data('permissions'), 10);
	if (permissions === 2) {
		Swal.fire({
			icon: 'warning',
			title: 'Not allowed',
			text: 'You cannot transfer guests.',
			confirmButtonText: 'OK'
		});
		return;
	}

	const target = getGuestRowById(guestId);
	if (!target) {
		Swal.fire({
			icon: 'warning',
			title: 'Not found',
			text: HIERARCHY_LEVEL_3_LABEL + ' record is not available.',
			confirmButtonText: 'OK'
		});
		return;
	}

	$('#transfer_guest_id').val(target.guest_id || '');
	loadAllTransferAgentOptions($('#transfer_guest_agent_id'), target.agent_id || null);
	$('#modal-transfer-guest-table').modal('show');
}

function openAddGameForGuest(guestId) {
	const numericGuestId = parseInt(guestId, 10);
	if (!numericGuestId) return;

	resolveAccountForGuest(numericGuestId, function (accountRow, errorMessage) {
		if (!accountRow) {
			Swal.fire({
				icon: 'warning',
				title: errorMessage && errorMessage.indexOf('No account') !== -1 ? 'No account found' : 'Unavailable',
				text: errorMessage || 'Unable to open Add Game.',
				confirmButtonText: 'OK'
			});
			return;
		}

		if (typeof window.addGameList !== 'function') {
			Swal.fire({
				icon: 'error',
				title: 'Unavailable',
				text: 'Add Game modal is not available right now.',
				confirmButtonText: 'OK'
			});
			return;
		}

		window._pendingNewGameGuestId = numericGuestId;
		window.addGameList(accountRow.account_id);

		const openingBalance = Number(accountRow.total_balance || accountRow.total_ledger_amount || 0);
		setTimeout(function () {
			$('#total_balanceGuest1').val(openingBalance);
		}, 120);
	});
}

function openGuestGameHistory(guestId) {
	const numericGuestId = parseInt(guestId, 10);
	if (!numericGuestId) return;

	resolveAccountForGuest(numericGuestId, function (accountRow, errorMessage) {
		if (!accountRow) {
			Swal.fire({
				icon: 'warning',
				title: errorMessage && errorMessage.indexOf('No account') !== -1 ? 'No account found' : 'Unavailable',
				text: errorMessage || 'Unable to open game history.',
				confirmButtonText: 'OK'
			});
			return;
		}

		if (typeof window.game_history !== 'function') {
			Swal.fire({
				icon: 'error',
				title: 'Unavailable',
				text: 'Game History modal is not available right now.',
				confirmButtonText: 'OK'
			});
			return;
		}

		window.game_history(accountRow.account_id, numericGuestId);
	});
}

function checkPermissionToDeleteGuest(id) {
	const permissions = parseInt($('#user-role').data('permissions'), 10);
	if (permissions !== 0) {
		Swal.fire({
			title: 'Access Denied',
			text: 'Not allowed to delete this data.',
			icon: 'error',
			confirmButtonText: 'OK'
		});
		return;
	}

	const numericId = parseInt(id, 10);
	if (!numericId) return;

	SwalConfirm.fire({
		title: 'Are you sure you want to delete this guest?',
		message: 'This will archive the guest record.',
		confirmButtonText: 'Delete now',
		confirmButtonColor: '#d33'
	}).then(function (result) {
		if (!result.isConfirmed) return;
		setTimeout(function () {
			promptManagerPasswordThen('delete this guest.', function () {
				performGuestArchiveRemove(numericId);
			});
		}, 200);
	});
}

function performGuestArchiveRemove(id) {
	$.ajax({
		url: '/guest/remove/' + id,
		type: 'PUT',
		success: function () {
			if (typeof window.reloadGuestTable === 'function') {
				window.reloadGuestTable();
			}
			Swal.fire({
				icon: 'success',
				title: 'Deleted',
				text: HIERARCHY_LEVEL_3_LABEL + ' has been archived.',
				confirmButtonText: 'OK'
			});
		},
		error: function (xhr) {
			Swal.fire({
				title: 'Error',
				text: xhr.responseJSON?.message || HIERARCHY_LEVEL_3_LABEL + ' could not be archived. Please try again.',
				icon: 'error',
				confirmButtonText: 'OK'
			});
		}
	});
}

function renderGuestActionCell(row, readOnly) {
	const permissions = parseInt($('#user-role').data('permissions'), 10);
	const guestId = row.guest_id || 0;
	const toggleSlot = row.guest_telegram ? renderGuestTelegramToggle(row, readOnly) : '';
	let html = '<div class="guest-action-wrap">';

	if (toggleSlot) {
		html += '<span class="guest-action-toggle-slot">' + toggleSlot + '</span>';
	}

	if (!readOnly) {
		html += '<button type="button" class="btn btn-link p-0 me-1" title="Edit" onclick="openEditGuestModal(' + guestId + ')"><i class="fa fa-pen"></i></button>';
		html += '<button type="button" class="btn btn-link p-0 me-1" title="Transfer" onclick="openTransferGuestModal(' + guestId + ')"><i class="fa fa-exchange-alt"></i></button>';
	}

	if (permissions === 0) {
		html += '<button type="button" class="btn btn-link p-0 me-1 text-danger" title="Delete" onclick="checkPermissionToDeleteGuest(' + guestId + ')"><i class="fa fa-trash"></i></button>';
	}

	html += '<button type="button" class="btn btn-link p-0" title="Game History" onclick="openGuestGameHistory(' + guestId + ')"><i class="fa fa-history"></i></button>';

	html += '</div>';
	return html;
}

function loadGuestPageStats(guestIds) {
	if (!Array.isArray(guestIds) || !guestIds.length || !guestPageDataTable) return;

	$.ajax({
		url: '/guest_data?statsOnly=1&guestIds=' + guestIds.map(encodeURIComponent).join(','),
		method: 'GET',
		success: function (statsRows) {
			const statsMap = {};
			(statsRows || []).forEach(function (row) {
				statsMap[String(row.guest_id)] = row;
			});

			let changed = false;
			guestPageRows.forEach(function (row) {
				const stats = statsMap[String(row.guest_id)];
				if (!stats) return;
				row.total_games = Number(stats.total_games) || 0;
				row.total_rolling = Number(stats.total_rolling) || 0;
				row.total_winloss = Number(stats.total_winloss) || 0;
				row.total_commission = Number(stats.total_commission) || 0;
				row._statsPending = false;
				changed = true;
			});

			if (changed) {
				guestPageDataTable.rows().invalidate('data').draw(false);
			}
		}
	});
}

function loadGuestPageAgencies(done) {
	$.ajax({
		url: '/agency_data',
		method: 'GET',
		success: function (rows) {
			guestPageAgencies = Array.isArray(rows) ? rows : [];
			if (typeof done === 'function') done();
		},
		error: function () {
			guestPageAgencies = [];
			if (typeof done === 'function') done();
		}
	});
}

$(document).ready(function () {
	if ($.fn.DataTable.isDataTable('#guest-tbl')) {
		$('#guest-tbl').DataTable().destroy();
	}

	const permissions = parseInt($('#user-role').data('permissions'), 10);
	const isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly();
	const translations = window.translations?.guest_page || {};

	const dataTable = $('#guest-tbl').DataTable({
		ajax: function (_data, callback, _settings) {
			$.ajax({
				url: '/guest_data?all=1&lite=1',
				method: 'GET',
				success: function (json) {
					guestPageRows = Array.isArray(json) ? json : [];
					guestPageRows.forEach(function (row) {
						row._statsPending = true;
					});
					callback({ data: guestPageRows });
					loadGuestPageStats(guestPageRows.map(function (row) { return row.guest_id; }));
				},
				error: function () {
					guestPageRows = [];
					callback({ data: [] });
				}
			});
		},
		language: {
			search: translations.search || 'Search:',
			info: translations.showing_entries || 'Showing _START_ to _END_ of _TOTAL_ entries',
			paginate: {
				previous: translations.previous || 'Previous',
				next: translations.next || 'Next'
			}
		},
		order: [[0, 'asc']],
		columnDefs: [
			{ targets: [6, 7, 8], className: 'text-center' },
			{ targets: 9, className: 'text-center', orderable: false, searchable: false }
		],
		columns: [
			{
				data: 'guest_name',
				render: function (data, type) {
					if (type !== 'display') return data || '';
					const name = String(data || '').trim().toUpperCase() || '-';
					return escapeHtml(name);
				}
			},
			{
				data: 'membership_no',
				render: function (data) {
					const value = String(data || '').trim();
					return value || '-';
				}
			},
			{
				data: 'agency_name',
				render: function (data) {
					return escapeHtml(String(data || '').trim().toUpperCase() || '-');
				}
			},
			{
				data: null,
				render: function (_data, type, row) {
					const label = buildAgentLabel(row);
					if (type !== 'display') return label;
					return escapeHtml(label);
				}
			},
			{
				data: 'guest_telegram',
				render: function (data, type, row) {
					if (type !== 'display') {
						return data || '';
					}

					if (!data || data === '' || data === null) {
						return '';
					}

					const cellId = 'telegram-guest-' + row.guest_id;
					const rowClass = isGuestTelegramEnabledFlag(row) ? '' : 'text-muted opacity-75';
					return '<span id="' + cellId + '" class="' + rowClass + '"><code>' + escapeHtml(String(data)) + '</code></span>';
				}
			},
			{
				data: 'guest_remarks',
				render: function (data) {
					const value = String(data || '').trim();
					return value ? escapeHtml(value) : '';
				}
			},
			{
				data: 'total_winloss',
				render: function (data, type, row) {
					if (type === 'display' && row._statsPending) return '—';
					if (type === 'sort' || type === 'type') return Number(data) || 0;
					return formatGuestStatNumber(data);
				}
			},
			{
				data: 'total_rolling',
				render: function (data, type, row) {
					if (type === 'display' && row._statsPending) return '—';
					if (type === 'sort' || type === 'type') return Number(data) || 0;
					return formatGuestStatNumber(data);
				}
			},
			{
				data: 'total_commission',
				render: function (data, type, row) {
					if (type === 'display' && row._statsPending) return '—';
					if (type === 'sort' || type === 'type') return Number(data) || 0;
					return formatGuestStatNumber(data);
				}
			},
			{
				data: null,
				render: function (_data, type, row) {
					if (type !== 'display') return '';
					return renderGuestActionCell(row, isViewOnly);
				}
			}
		],
		drawCallback: function () {
			const api = this.api();
			const rows = api.rows({ page: 'current' }).nodes();

			$(rows).each(function () {
				const row = api.row(this).data();
				if (row && row.guest_telegram) {
					const cellId = 'telegram-guest-' + row.guest_id;
					const $cell = $('#' + cellId);

					if ($cell.length && !$cell.data('username-fetched')) {
						$cell.data('username-fetched', true);
						fetchTelegramUsername(row.guest_telegram, 'GUEST').then(function (username) {
							if (username) {
								const currentText = $cell.text().trim();
								if (currentText && !currentText.includes('@')) {
									$cell.html('<code>' + escapeHtml(currentText) + '</code> <span class="text-muted">(@' + escapeHtml(username) + ')</span>');
								}
							}
						});
					}
				}
			});
		}
	});

	guestPageDataTable = dataTable;

	window.reloadGuestTable = function () {
		dataTable.ajax.reload(null, false);
	};

	$(document).on('change', '.btn-toggle-guest-telegram', function () {
		if (isViewOnly) return;

		const $toggle = $(this);
		const guestId = parseInt($toggle.data('guest-id'), 10);
		const enabled = $toggle.prop('checked');

		if (!Number.isFinite(guestId) || guestId <= 0) return;

		$toggle.prop('disabled', true);
		$.ajax({
			url: '/guest/' + guestId + '/telegram-enabled',
			type: 'PUT',
			contentType: 'application/json',
			data: JSON.stringify({ enabled: enabled }),
			success: function () {
				showGuestTelegramToggleSwal(enabled);
				window.reloadGuestTable();
			},
			error: function () {
				$toggle.prop('checked', !enabled);
				const tr = window.translations?.guest_page || {};
				Swal.fire({
					title: tr.error_title || 'Error',
					text: tr.failed_to_update || 'Failed to save.',
					icon: 'error',
					confirmButtonText: tr.ok || 'OK'
				});
			},
			complete: function () {
				$toggle.prop('disabled', false);
			}
		});
	});

	loadGuestPageAgencies();

	$('#btn-guest-page-add').on('click', function () {
		const $agencySelect = $('#guest_page_agency_id');
		const $agentSelect = $('#guest_page_agent_id');
		$('#guest_page_add_form')[0].reset();
		destroyGuestPageSelect2($agencySelect);
		destroyGuestPageSelect2($agentSelect);
		populateAgencySelect($agencySelect, '');
		$agentSelect.html('<option value="">Select ' + HIERARCHY_LEVEL_2_LABEL + '</option>').prop('disabled', true);
		initGuestPageSelect2($agencySelect, 'Select ' + HIERARCHY_LEVEL_1_LABEL);
		initGuestPageSelect2($agentSelect, 'Select ' + HIERARCHY_LEVEL_2_LABEL);
		$('#modal-guest-page-add').modal('show');
	});

	$('#guest_page_agency_id').on('change', function () {
		const agencyId = parseInt($(this).val(), 10);
		loadTransferAgentOptions($('#guest_page_agent_id'), agencyId, null);
	});

	$('#guest_page_add_form').on('submit', function (e) {
		e.preventDefault();
		const membershipError = typeof window.validateGuestMembershipNo === 'function'
			? window.validateGuestMembershipNo($('#guest_page_membership_input').val())
			: '';
		if (membershipError) {
			Swal.fire({
				icon: 'warning',
				title: 'Invalid Membership No',
				text: membershipError,
				confirmButtonText: 'OK'
			});
			return;
		}

		const $btn = $('#btn-guest-page-save');
		$btn.prop('disabled', true).text('Saving...');
		$.ajax({
			url: '/add_guest',
			type: 'POST',
			data: $(this).serialize(),
			success: function () {
				$('#modal-guest-page-add').modal('hide');
				Swal.fire({
					icon: 'success',
					title: 'Success',
					text: HIERARCHY_LEVEL_3_LABEL + ' has been added.',
					confirmButtonText: 'OK'
				});
				window.reloadGuestTable();
			},
			error: function (xhr) {
				Swal.fire({
					icon: 'error',
					title: 'Error',
					text: xhr.responseJSON?.error || 'Failed to add guest.',
					confirmButtonText: 'OK'
				});
			},
			complete: function () {
				$btn.prop('disabled', false).text('Save');
			}
		});
	});

	$('#edit_guest_form').on('submit', function (e) {
		e.preventDefault();
		const guestId = parseInt($('#edit_guest_id').val(), 10);
		const membershipError = typeof window.validateGuestMembershipNo === 'function'
			? window.validateGuestMembershipNo($('#edit_guest_membership_input').val())
			: '';
		const $btn = $('#btn-update-guest-table');

		if (!guestId) return;
		if (membershipError) {
			Swal.fire({
				icon: 'warning',
				title: 'Invalid Membership No',
				text: membershipError,
				confirmButtonText: 'OK'
			});
			return;
		}

		$btn.prop('disabled', true).text('Updating...');
		$.ajax({
			url: '/guest/' + encodeURIComponent(guestId),
			type: 'PUT',
			data: $(this).serialize(),
			success: function () {
				$('#modal-edit-guest-table').modal('hide');
				Swal.fire({
					icon: 'success',
					title: 'Success',
					text: HIERARCHY_LEVEL_3_LABEL + ' has been updated.',
					confirmButtonText: 'OK'
				});
				window.reloadGuestTable();
			},
			error: function (xhr) {
				Swal.fire({
					icon: 'error',
					title: 'Error',
					text: xhr.responseJSON?.error || 'Failed to update guest.',
					confirmButtonText: 'OK'
				});
			},
			complete: function () {
				$btn.prop('disabled', false).text('Update');
			}
		});
	});

	$('#transfer_guest_form').on('submit', function (e) {
		e.preventDefault();
		const guestId = parseInt($('#transfer_guest_id').val(), 10);
		const targetAgentId = parseInt($('#transfer_guest_agent_id').val(), 10);
		const $btn = $('#btn-transfer-guest-table');

		if (!guestId || !targetAgentId) {
			Swal.fire({
				icon: 'warning',
				title: 'Selection required',
				text: 'Select a target agent.',
				confirmButtonText: 'OK'
			});
			return;
		}

		$btn.prop('disabled', true).text('Transferring...');
		$.ajax({
			url: '/guest/' + encodeURIComponent(guestId) + '/transfer',
			type: 'PUT',
			contentType: 'application/json',
			data: JSON.stringify({ targetAgentId: targetAgentId }),
			success: function (res) {
				$('#modal-transfer-guest-table').modal('hide');
				const toAgency = res?.to?.agency_name || '';
				const toLine = [res?.to?.agent_code, res?.to?.agent_name].filter(Boolean).join(' · ');
				Swal.fire({
					icon: 'success',
					title: 'Transferred',
					text: HIERARCHY_LEVEL_3_LABEL + ' moved to ' + [toAgency, toLine].filter(Boolean).join(' · ') + '.',
					confirmButtonText: 'OK'
				});
				window.reloadGuestTable();
			},
			error: function (xhr) {
				Swal.fire({
					icon: 'error',
					title: 'Error',
					text: xhr.responseJSON?.error || 'Failed to transfer guest.',
					confirmButtonText: 'OK'
				});
			},
			complete: function () {
				$btn.prop('disabled', false).text('Transfer');
			}
		});
	});

	$(document).on('agency:new-game-saved', function () {
		window.reloadGuestTable();
	});
});
