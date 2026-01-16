var agent_id;

$(document).ready(function () {
	if ($.fn.DataTable.isDataTable('#agent-tbl')) {
		$('#agent-tbl').DataTable().destroy();
	}

	const permissions = parseInt($('#user-role').data('permissions'));

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
							onclick="account_details(${row.account_id}, '${row.agent_code}', '${row.agent_name}')">
							${row.agent_name}
						</a>
					`;
				}
			},
			{ data: 'agent_code' },
			{ data: 'agency_name' },
			{ data: 'agent_contact' },
			{ data: 'agent_telegram' },
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
				data: 'active',
				render: function (data) {
					var val = Number(data);
					var isActive = val === 1 || data === true || data === 'true' || data === '1';
					return isActive
						? '<span class="css-blue">' + activeText + '</span>'
						: '<span class="css-red">' + inactiveText + '</span>';
				}
			},
			{
				data: null,
				render: function (data, type, row) {
					if (type !== 'display') return '';

					if (permissions === 2) {
						return `
							<div class="btn-group">
								<button type="button" class="btn btn-sm btn-alt-secondary js-bs-tooltip-enabled" disabled>
									<i class="fa fa-pencil-alt"></i>
								</button>
								<button type="button" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled" disabled>
									<i class="fa fa-trash-alt"></i>
								</button>
							</div>
						`;
					}

					return `
						<div class="btn-group">
							<button type="button" class="btn btn-sm btn-alt-secondary js-bs-tooltip-enabled"
								onclick="edit_agent(${row.agent_id}, '${row.agent_code}', '${row.agent_name}', '${row.agent_contact}', '${row.agent_telegram}', '${row.agent_remarks}')">
								<i class="fa fa-pencil-alt"></i>
							</button>
							<button type="button" 
								onclick="checkPermissionToDeleteAgent(${row.agent_id})" 
								class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled">
								<i class="fa fa-trash-alt"></i>
							</button>
						</div>
					`;
				}
			}
		],
		drawCallback: function () {
			// Hook available if totals need to be recalculated on draw/search
		}
	});

	window.reloadAgentTable = function () {
		dataTable.ajax.reload(null, false);
	};

	$('#add_new_agent').on('submit', function(event) {
		event.preventDefault(); // Prevent default form submission
	
		var formData = new FormData(this); // FormData for file upload
		var $btn = $('#submit-new-agent-btn'); // Reference to the button
	
		// Show spinner loading
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
			success: function(response) {
				Swal.fire({
					title: 'Success!',
					text: response.message,
					icon: 'success',
					confirmButtonText: 'OK'
				}).then((result) => {
					if (result.isConfirmed) {
						window.location.href = '/agency'; // Redirect
					}
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
				// Reset button on complete
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
				Swal.fire({
					title: 'Updated Successfully!',
					text: 'The agent details have been updated.',
					icon: 'success',
					confirmButtonText: 'OK'
				}).then((result) => {
					if (result.isConfirmed) {
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
		$('#modal-account-ledger').modal('hide');
		$('#modal-new-agent').modal('show');
	}

	// Make globally accessible if needed
	window.addAgent = addAgent;

	// Auto re-open ledger modal when closing new-agent modal
	$('#modal-new-agent').on('hidden.bs.modal', function () {
		$('#modal-account-ledger').modal('show');
	});

		// Auto re-open ledger modal when closing new-agent modal
		$('#modal-edit-agent').on('hidden.bs.modal', function () {
			$('#modal-account-ledger').modal('show');
		});


});



function edit_agent(id, agent_code, agentName, contact, telegram, remarks) {
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

