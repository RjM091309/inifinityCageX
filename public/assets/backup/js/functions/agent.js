var agent_id;

$(document).ready(function () {
	if ($.fn.DataTable.isDataTable('#agent-tbl')) {
		$('#agent-tbl').DataTable().destroy();
	}

	var dataTable = $('#agent-tbl').DataTable({
		columnDefs: [{
			createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
				$(cell).addClass('text-center');
			}
		}],
		
	});

	function reloadData() {
		$.ajax({
			url: '/agent_data', // Endpoint to fetch data
			method: 'GET',
			success: function (data) {
				dataTable.clear();
				data.forEach(function (row) {

					var status = '';
					if (row.active.data == 1) {
						status = '<span class="badge bg-info" style="font-size:10px !important;">ACTIVE</span>';
					} else {
						status = '<span class="badge bg-danger" style="font-size:10px !important;">INACTIVE</span>';
					}

					

					const permissions = parseInt($('#user-role').data('permissions'));  // Get the permissions from the DOM

var btn = '';  // Initialize button variable

// Check if permissions are not 2 (to enable the buttons)
if (permissions !== 2) {
    btn = `<div class="btn-group">
                <button type="button" class="btn btn-sm btn-alt-secondary js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Edit" data-bs-original-title="Edit"
                        style="font-size:10px !important;" 
                        onclick="edit_agent(${row.agent_id}, ${row.agency_id}, '${row.AGENT_CODE}', '${row.NAME}', '${row.CONTACTNo}', '${row.TELEGRAM_ID}')">
                    <i class="fa fa-pencil-alt"></i>
                </button>

                <button style="font-size:10px !important;" type="button" 
                        onclick="checkPermissionToDeleteAgent(${row.agent_id})" 
                        class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
                    <i class="fa fa-trash-alt"></i>
                </button>
            </div>`;
} else {
    // If permissions are 2, disable both buttons
    btn = `<div class="btn-group">
                <button type="button" class="btn btn-sm btn-alt-secondary js-bs-tooltip-enabled" disabled
                        data-bs-toggle="tooltip" aria-label="Edit" data-bs-original-title="Edit"
                        style="font-size:10px !important;">
                    <i class="fa fa-pencil-alt"></i>
                </button>

                <button style="font-size:10px !important;" type="button" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled" disabled
                        data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
                    <i class="fa fa-trash-alt"></i>
                </button>
            </div>`;
}


					var agency_name = `<a href="#" onclick="(${row.agent_id}, ${row.agency_id}, '${row.AGENT_CODE}', '${row.NAME}', '${row.CONTACTNo}', '${row.TELEGRAM_ID}')">${row.agency_name}</a>`
					//var acct_no = `<a href="#" onclick="edit_agent(${row.agent_id}, ${row.agency_id}, '${row.AGENT_CODE}', '${row.NAME}', '${row.CONTACTNo}', '${row.TELEGRAM_ID}')">${row.AGENT_CODE}</a>`

					dataTable.row.add([agency_name, row.AGENT_CODE, row.NAME, row.CONTACTNo, row.TELEGRAM_ID, row.REMARKS, status, btn]).draw();
				});
			},
			error: function (xhr, status, error) {
				console.error('Error fetching data:', error);
			}
		});
	}

	reloadData();

	$('#add_new_agent').on('submit', function(event) {
		event.preventDefault(); // Prevent the default form submission
	
		var formData = new FormData(this); // Use FormData to include files
	
		// Check if the file input exists and if it's required
		// If you have a specific input for file, you can check like this:
		// var fileInput = $('#fileInputId').get(0); // Replace with your file input ID
		// if (fileInput && fileInput.files.length === 0) {
		//     // Handle the case when no file is uploaded but it's optional
		// }
	
		$.ajax({
			url: '/add_agent',
			type: 'POST',
			data: formData,
			processData: false,
			contentType: false,
			success: function(response) {
				// Use SweetAlert to show a success message
				Swal.fire({
					title: 'Success!',
					text: response.message,
					icon: 'success',
					confirmButtonText: 'OK'
				}).then((result) => {
					if (result.isConfirmed) {
						window.location.href = '/agent'; // Redirect to the agent page
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
			}
		});
	});
	
	$('#edit_agent').submit(function (event) {
		event.preventDefault();
	
		// Create a FormData object
		var formData = new FormData(this);
	
		$.ajax({
			url: '/agent/' + agent_id,
			type: 'PUT',
			data: formData,
			processData: false, // Prevent jQuery from processing the data
			contentType: false, // Prevent jQuery from setting the content type
			success: function (response) {
				// Show success message using SweetAlert
				Swal.fire({
					title: 'Updated Successfully!',
					text: 'The agent details have been updated.',
					icon: 'success',
					confirmButtonText: 'OK'
				}).then((result) => {
					if (result.isConfirmed) {
						reloadData(); // Reload data
						$('#modal-edit-agent').modal('hide'); // Hide modal
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
			}
		});
	});

});

function addAgent() {
	$('#modal-new-agent').modal('show');
	get_agency();
}


function edit_agent(id, agency_id, agent_code, agentName, contact, telegram) {
	$('#modal-edit-agent').modal('show');
	$('#agent_code').val(agent_code);
	$('#agentName').val(agentName);
	$('#contact').val(contact);
	$('#telegram').val(telegram);

	edit_get_agency(agency_id)
	agent_id = id;
	
	const contactInput = document.querySelector('#contact');
    const telegramInput = document.querySelector('#telegram');
    
    // Ensure only numbers are allowed
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

function edit_get_agency(id) {
	$.ajax({
		url: '/agency_data',
		method: 'GET',
		success: function (response) {
			var selectOptions = $('.edit_agency');
			selectOptions.empty();
			response.forEach(function (option) {
				var selected = false;
				if (option.IDNo == id) {
					selected = true;
				}
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