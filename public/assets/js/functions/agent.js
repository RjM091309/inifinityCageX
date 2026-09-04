var agent_id;

// Escape string for safe use inside JavaScript single-quoted string (prevents syntax error when name/remarks have apostrophes, newlines, etc.)
function escapeJsString(str) {
	if (str == null || str === undefined) return '';
	return String(str)
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n');
}

// Cache for Telegram usernames
var telegramUsernameCache = {};

function escapeHtml(s) {
	const div = document.createElement('div');
	div.textContent = s == null ? '' : String(s);
	return div.innerHTML;
}

function isAgentTelegramEnabledFlag(row) {
	const v = row && row.telegram_enabled;
	return v === 1 || v === true || v === '1' || v === undefined || v === null;
}

function showAgentTelegramToggleSwal(enabled) {
	const tr = window.translations?.agent || {};
	Swal.fire({
		title: tr.success || 'Success',
		text: enabled
			? (tr.chat_id_enabled || 'Notifications enabled for this account.')
			: (tr.chat_id_disabled || 'Notifications disabled for this account.'),
		icon: 'success',
		confirmButtonText: tr.ok || 'OK'
	});
}

function renderAgentTelegramToggle(row, readOnly) {
	if (!row || !row.agent_telegram) return '';
	const enabled = isAgentTelegramEnabledFlag(row);
	const tr = window.translations?.agent || {};
	return (
		'<div class="form-check form-switch d-inline-flex mb-0 align-items-center justify-content-center">' +
		'<input class="form-check-input notify-toggle-switch btn-toggle-agent-telegram" type="checkbox" role="switch"' +
		' data-agent-id="' + row.agent_id + '" data-chat-id="' + escapeHtml(String(row.agent_telegram)) + '"' +
		(readOnly ? ' disabled' : '') +
		(enabled ? ' checked' : '') +
		' title="' + escapeHtml(tr.toggle_notifications || 'Enable / disable notifications') + '">' +
		'</div>'
	);
}

function renderAgentActionCell(row, readOnly) {
	const toggleSlot = row.agent_telegram ? renderAgentTelegramToggle(row, readOnly) : '';
	const editAttrs = readOnly
		? ' disabled'
		: ' onclick="edit_agent(' +
			row.agent_id +
			", '" +
			escapeJsString(row.agent_code) +
			"', '" +
			escapeJsString(row.agent_name) +
			"', '" +
			escapeJsString(row.agent_contact) +
			"', '" +
			escapeJsString(row.agent_telegram) +
			"', '" +
			escapeJsString(row.agent_remarks) +
			"')\"";
	return (
		'<div class="agent-action-wrap">' +
		'<span class="agent-action-toggle-slot">' +
		toggleSlot +
		'</span>' +
		'<span class="agent-action-edit-slot">' +
		'<button type="button" class="btn btn-link text-primary p-0 border-0 shadow-none btn-edit-agent-icon js-bs-tooltip-enabled"' +
		editAttrs +
		' aria-label="Edit"><i class="fa fa-pencil-alt"></i></button>' +
		'</span>' +
		'</div>'
	);
}

// Function to fetch Telegram username from chat ID
function fetchTelegramUsername(chatId, userType) {
	if (!chatId || chatId === '' || chatId === null) {
		return Promise.resolve(null);
	}

	// Return cached value if available
	if (telegramUsernameCache[chatId]) {
		return Promise.resolve(telegramUsernameCache[chatId]);
	}

	return new Promise(function(resolve) {
		$.ajax({
			url: '/telegramAPI/chat-info/' + (userType || 'GUEST') + '/' + encodeURIComponent(chatId),
			method: 'GET',
			success: function(data) {
				if (data && data.chat && data.chat.username) {
					telegramUsernameCache[chatId] = data.chat.username;
					resolve(data.chat.username);
				} else {
					telegramUsernameCache[chatId] = null;
					resolve(null);
				}
			},
			error: function() {
				telegramUsernameCache[chatId] = null;
				resolve(null);
			}
		});
	});
}

$(document).ready(function () {
	if ($.fn.DataTable.isDataTable('#agent-tbl')) {
		$('#agent-tbl').DataTable().destroy();
	}

	const permissions = parseInt($('#user-role').data('permissions'));
	const isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly();

	// Get translations or use defaults
	const translations = window.translations?.agent || {};
	const activeText = translations.active || 'ACTIVE';
	const inactiveText = translations.inactive || 'INACTIVE';
	const searchText = translations.search || 'Search:';
	const showingEntriesText = translations.showing_entries || 'Showing _START_ to _END_ of _TOTAL_ entries';
	const previousText = translations.previous || 'Previous';
	const nextText = translations.next || 'Next';

	const dataTable = $('#agent-tbl').DataTable({
		ajax: {
			url: '/account_data',
			dataSrc: function (json) {
				return json;
			}
		},
		language: {
			search: searchText,
			info: showingEntriesText,
			paginate: {
				previous: previousText,
				next: nextText
			}
		},
		order: [[6, 'desc']], // Latest Game column
		columnDefs: [
			{ targets: 6, className: 'text-center' },
			{ targets: 7, className: 'text-center' },
			{ targets: 8, className: 'text-center', orderable: false, searchable: false }
		],
		columns: [
			{
				data: 'agent_name',
				render: function (data, type, row) {
					if (type !== 'display') {
						return data;
					}
					return `
						<a href="#"
							onclick="account_details(${row.account_id}, '${escapeJsString(row.agent_code)}', '${escapeJsString(row.agent_name)}')">
							${row.agent_name}
						</a>
					`;
				}
			},
			{ data: 'agent_code' },
			{ data: 'agency_name' },
			{ data: 'agent_contact' },
			{
				data: 'agent_telegram',
				render: function (data, type, row) {
					if (type !== 'display') {
						return data || '';
					}
					
					if (!data || data === '' || data === null) {
						return '';
					}

					const cellId = 'telegram-' + row.agent_id + '-' + row.account_id;
					const rowClass = isAgentTelegramEnabledFlag(row) ? '' : 'text-muted opacity-75';
					return '<span id="' + cellId + '" class="' + rowClass + '"><code>' + escapeHtml(String(data)) + '</code></span>';
				}
			},
			{ data: 'agent_remarks' },
			{
				data: 'LATEST_GAME_DATE',
				render: function (data, type) {
					if (type === 'sort' || type === 'type') {
						return data ? new Date(data).getTime() : 0;
					}
					if (!data) return '';
					return moment(data).isValid()
						? moment(data).format('MMMM D, HH:mm')
						: '';
				}
			},
			{
				data: 'agent_created_dt',
				render: function (data, type) {
					if (type === 'sort' || type === 'type') {
						return data ? new Date(data).getTime() : 0;
					}
					if (!data) return '';
					return moment(data).isValid()
						? moment(data).format('MMMM D, YYYY')
						: '';
				}
			},
			{
				data: null,
				render: function (data, type, row) {
					if (type !== 'display') return '';
					return renderAgentActionCell(row, isViewOnly);
				}
			}
		],
		drawCallback: function () {
			// Fetch Telegram usernames for all visible rows after table draw
			const api = this.api();
			const rows = api.rows({ page: 'current' }).nodes();
			
			$(rows).each(function() {
				const row = api.row(this).data();
				if (row && row.agent_telegram) {
					const cellId = 'telegram-' + row.agent_id + '-' + row.account_id;
					const $cell = $('#' + cellId);
					
					if ($cell.length && !$cell.data('username-fetched')) {
						$cell.data('username-fetched', true);
						fetchTelegramUsername(row.agent_telegram, 'GUEST').then(function(username) {
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

	window.reloadAgentTable = function () {
		dataTable.ajax.reload(null, false);
	};

	// --- ACCOUNT NO. range search (e.g. "399-450" or "INF399-INF450") ---
	// Matches "399-450", "INF399-450", "inf399 - inf450", etc. Letters optional on each side.
	var accountNoRangeRe = /^\s*[A-Za-z]{0,6}(\d+)\s*-\s*[A-Za-z]{0,6}(\d+)\s*$/;
	var $agentSearch = $('#agent-tbl_filter input');

	// The range currently typed in the box (kept in JS so it survives DataTables'
	// redraws — on sort/paging DataTables re-runs ext.search AND syncs the box back
	// to its own empty search value, which would otherwise wipe the range text).
	var activeRangeText = '';

	function parseAccountNoRange(text) {
		var m = String(text || '').match(accountNoRangeRe);
		if (!m) return null;
		var a = parseInt(m[1], 10);
		var b = parseInt(m[2], 10);
		// Only a genuine ascending range. This keeps sub-account codes like
		// "INF305-1" / "INF305-2" as a normal (literal) search instead of
		// being read as the range 1–305.
		if (!(b > a)) return null;
		return { min: a, max: b };
	}

	$.fn.dataTable.ext.search.push(function (settings, data) {
		if (settings.nTable.id !== 'agent-tbl') return true;
		var range = parseAccountNoRange(activeRangeText);
		if (!range) return true;
		// data[1] = ACCOUNT NO. column, e.g. "INF399" or "INF305-1" — use the
		// first number group so a sub-account suffix doesn't distort the value.
		var m = String(data[1] || '').match(/(\d+)/);
		if (!m) return false;
		var num = parseInt(m[1], 10);
		return num >= range.min && num <= range.max;
	});

	// Keep the range text visible in the box after every redraw (DataTables clears it
	// during draw because our built-in search value is empty).
	dataTable.on('draw.dt', function () {
		if (activeRangeText && $agentSearch.val() !== activeRangeText) {
			$agentSearch.val(activeRangeText);
		}
	});

	// Take full control of the search input so range terms are not passed to the
	// built-in (literal) filter, which would otherwise hide every row.
	$agentSearch.attr('title', 'Search text, or an ACCOUNT NO. range like 399-450');
	$agentSearch.off();
	$agentSearch.on('keyup cut paste input search', function () {
		var val = this.value;

		if (parseAccountNoRange(val)) {
			activeRangeText = val;
			if (dataTable.search() !== '') {
				dataTable.search('');
			}
			dataTable.draw();
		} else {
			activeRangeText = '';
			if (dataTable.search() !== val) {
				dataTable.search(val);
			}
			dataTable.draw();
		}
	});

	$(document).on('change', '.btn-toggle-agent-telegram', function () {
		if (isViewOnly) return;

		const $toggle = $(this);
		const agentId = parseInt($toggle.data('agent-id'), 10);
		const enabled = $toggle.prop('checked');

		if (!Number.isFinite(agentId) || agentId <= 0) return;

		$toggle.prop('disabled', true);
		$.ajax({
			url: '/agent/' + agentId + '/telegram-enabled',
			type: 'PUT',
			contentType: 'application/json',
			data: JSON.stringify({ enabled: enabled }),
			success: function () {
				showAgentTelegramToggleSwal(enabled);
				window.reloadAgentTable();
			},
			error: function () {
				$toggle.prop('checked', !enabled);
				const tr = window.translations?.agent || {};
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

	$('#add_new_agent').on('submit', function(event) {
		event.preventDefault();

		var formData = new FormData(this);
		var $btn = $('#submit-new-agent-btn');
		var $form = $(this);
		var savedAgencyLine = Number(formData.get('txtAgencyLine') || $('#txtAgencyLine').val() || 0);
		var onAgencyPage = $('#agency-grid').length > 0;

		$btn.prop('disabled', true).html(`
			<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
			Loading...
		`);

		$.ajax({
			url: '/add_agent',
			type: 'POST',
			data: formData,
			processData: false,
			contentType: false,
			dataType: 'json',
			headers: { Accept: 'application/json' },
			success: function(response) {
				window.__suppressLedgerReopen = true;

				var m = document.getElementById('modal-new-agent');
				var Modal = typeof bootstrap !== 'undefined' ? bootstrap.Modal : (typeof Bootstrap !== 'undefined' ? Bootstrap.Modal : null);
				if (m) {
					if (Modal) {
						var inst = Modal.getInstance(m) || Modal.getOrCreateInstance(m);
						inst.hide();
					} else {
						$(m).modal('hide');
					}
				}

				$form[0].reset();

				var newAgentId = response && response.agent_id ? parseInt(response.agent_id, 10) : null;
				var agentCode = formData.get('txtAgenctCode') || (response && response.agent_code) || '';
				var agentName = formData.get('txtName') || (response && response.agent_name) || '';

				if (onAgencyPage) {
					$(document).trigger('guest:created', [{
						agencyId: savedAgencyLine,
						agentId: newAgentId,
						agentCode: agentCode,
						agentName: agentName
					}]);
				} else if (typeof window.reloadAgentTable === 'function') {
					window.reloadAgentTable();
				}

				Swal.fire({
					title: 'Success!',
					text: (response && response.message) ? response.message : 'Agent added successfully.',
					icon: 'success',
					confirmButtonText: 'OK'
				});
			},
			error: function(xhr) {
				console.error('Error:', xhr.responseJSON ? xhr.responseJSON.error : 'Unknown error occurred');
				Swal.fire({
					title: 'Error!',
					text: xhr.responseJSON ? xhr.responseJSON.error : 'Unknown error',
					icon: 'error',
					confirmButtonText: 'OK'
				});
			},
			complete: function() {
				$btn.prop('disabled', false).html('Save');
			}
		});
	});
	
	
	$('#edit_agent').submit(function (event) {
		event.preventDefault();
	
		var $btn = $('#submit-edit-agent-btn'); // button reference
		var formData = new FormData(this);
	
		// Show spinner while processing
		$btn.prop('disabled', true).html(`
			<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
			Loading...
		`);
	
		$.ajax({
			url: '/agent/' + agent_id,
			type: 'PUT',
			data: formData,
			processData: false,
			contentType: false,
			success: function (response) {
				const onAgencyPage = $('#agency-grid').length > 0;
				const editedAgentId = agent_id;
				$('#modal-edit-agent').modal('hide');
				if (onAgencyPage && typeof window.refreshAgencyPageAfterAgentEdit === 'function') {
					window.refreshAgencyPageAfterAgentEdit(editedAgentId, {
						agent_code: $('#txtAgent_code').val(),
						agent_name: $('#agentName').val(),
						agent_contact: $('#contact').val(),
						agent_telegram: $('#telegram').val(),
						agent_remarks: $('#remarks').val()
					});
				}
				Swal.fire({
					title: 'Updated Successfully!',
					text: 'The agent details have been updated.',
					icon: 'success',
					confirmButtonText: 'OK'
				}).then((result) => {
					if (!onAgencyPage && result.isConfirmed) {
						window.location.href = '/agent';
					}
				});
			},
			error: function (error) {
				console.error('Error updating agent:', error);
				Swal.fire({
					title: 'Error!',
					text: 'There was an error updating the agent.',
					icon: 'error',
					confirmButtonText: 'OK'
				});
			},
			complete: function () {
				// Reset the button text after submission
				$btn.prop('disabled', false).html('Save');
			}
		});
	});
	
	// Function when clicking 'Add Guest'
	function addAgent() {
		window.__returnToLedgerOnClose = true;
		$('#modal-account-ledger').modal('hide');
		$('#modal-new-agent').modal('show');
	}

	// Make globally accessible if needed
	window.addAgent = addAgent;

	$('#modal-new-agent').on('show.bs.modal', function () {
		// Reopen Records only when New Agent was launched from Records modal.
		window.__returnToLedgerOnClose = $('#modal-account-ledger').hasClass('show');
	});

	$('#modal-new-agent').on('hidden.bs.modal', function () {
		if (window.__suppressLedgerReopen) {
			window.__suppressLedgerReopen = false;
			window.__returnToLedgerOnClose = false;
			return;
		}
		if (window.__returnToLedgerOnClose) {
			$('#modal-account-ledger').modal('show');
		}
		window.__returnToLedgerOnClose = false;
	});

	$('#modal-edit-agent').on('hidden.bs.modal', function () {
		if (window.__suppressLedgerReopen) {
			window.__suppressLedgerReopen = false;
			return;
		}
		if (window.__returnToLedgerOnEditClose) {
			$('#modal-account-ledger').modal('show');
		}
		window.__returnToLedgerOnEditClose = false;
	});


});



function edit_agent(id, agent_code, agentName, contact, telegram, remarks) {
	window.__returnToLedgerOnEditClose = $('#modal-account-ledger').hasClass('show');
	$('#modal-edit-agent').modal('show');
	$('#modal-account-ledger').modal('hide');
	$('#txtAgent_code').val(agent_code);
	$('#agentName').val(agentName);
	$('#contact').val(contact);
	$('#telegram').val(telegram);
	$('#remarks').val(remarks);

	agent_id = id;

	// Remove this part:
	// edit_get_agency(agency_id);

	// Keep input sanitization
	const contactInput = document.querySelector('#contact');
	const telegramInput = document.querySelector('#telegram');

	contactInput.addEventListener('input', function () {
		this.value = this.value.replace(/\D/g, '');
	});
	telegramInput.addEventListener('input', function () {
		this.value = this.value.replace(/\D/g, '');
	});
}


function checkPermissionToDeleteAgent(id) {
    // Check if the user has the necessary permission before proceeding
    $.ajax({
        url: '/check-permission',
        type: 'POST',
        success: function (response) {
            if (response.permissions === 11) {
                // Proceed with deletion if permission is valid
                archive_agent(id);
            } else {
                // Show an error SweetAlert if permission is not sufficient
                Swal.fire({
                    title: 'Access Denied',
                    text: 'Not allowed to delete this data.',
                    icon: 'error',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#6f9c40'
                });
            }
        },
        error: function () {
            Swal.fire({
                title: 'Error',
                text: 'Unable to check permissions at this time.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#6f9c40'
            });
        }
    });
}


function archive_agent(id) {
	Swal.fire({
		title: 'Are you sure you want to delete this?',
		icon: 'warning',
		showCancelButton: true,
		confirmButtonColor: '#3085d6',
		cancelButtonColor: '#d33',
		confirmButtonText: 'Yes'
	}).then((result) => {
		if (result.isConfirmed) {
			$.ajax({
				url: '/agent/remove/' + id,
				type: 'PUT',
				success: function (response) {
					window.location.reload();
				},
				error: function (error) {
					console.error('Error deleting user role:', error);
				}
			});
		}
	})
}

function get_agency() {
	$.ajax({
		url: '/agency_data',
		method: 'GET',
		success: function (response) {
			var selectOptions = $('#agency');
			selectOptions.empty();
			response.forEach(function (option) {
				var selected = false;
				if (option.IDNo == 1) {
					selected = true;
				}
				selectOptions.append($('<option></option>'));
				selectOptions.append($('<option>', {
					selected: selected,
					value: option.IDNo,
					text: option.AGENCY
				}));
			});
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

