var user_id;

$(document).ready(function () {
	if ($.fn.DataTable.isDataTable('#usersTable')) {
		$('#usersTable').DataTable().destroy();
	}

	var dataTable = $('#usersTable').DataTable({
		columnDefs: [{
			createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
				$(cell).addClass('text-center');
			}
		}],
		language: {
			search: (window.manageUsersTranslations?.search || "Search:"),
			info: (window.manageUsersTranslations?.showing_entries || "Showing _START_ to _END_ of _TOTAL_ entries"),
			paginate: {
				previous: (window.manageUsersTranslations?.previous || "Previous"),
				next: (window.manageUsersTranslations?.next || "Next")
			}
		}
	});

	function reloadData() {
		$.ajax({
			url: '/users', // Endpoint to fetch data
			method: 'GET',
			success: function (data) {
				dataTable.clear();
				data.forEach(function (row) {

					var status = '';
					var activeText = window.manageUsersTranslations?.active || 'ACTIVE';
					var inactiveText = window.manageUsersTranslations?.inactive || 'INACTIVE';
					if (row.ACTIVE.data[0] == 1) {
						status = '<span class="css-blue">' + activeText + '</span>';
					} else {
						status = '<span class="css-red">' + inactiveText + '</span>';
					}

					var btn = `<div class="btn-group">
        
              <button type="button" class="btn btn-sm bg-danger-subtle js-bs-tooltip-enabled" onclick="archive_user(${row.user_id})"
              data-bs-toggle="tooltip" aria-label="Edit" data-bs-original-title="Edit">
              <i class="fa fa-trash"></i>
            </button>
           
            
            <button type="button" class="btn btn-sm bg-info-subtle js-bs-tooltip-enabled" onclick="edit_user(${row.user_id}, '${row.FIRSTNAME}', '${row.LASTNAME}', '${row.USERNAME}', ${row.PERMISSIONS})"
              data-bs-toggle="tooltip" aria-label="Edit" data-bs-original-title="Edit">
              <i class="fa fa-pencil-alt"></i>
            </button>
          </div>`;

					dataTable.row.add([row.LASTNAME, row.FIRSTNAME, row.USERNAME, row.role, status, btn]).draw();
				});
			},
			error: function (xhr, status, error) {
				console.error('Error fetching data:', error);
			}
		});
	}

	reloadData();


	$('#edit_user').submit(function (event) {
		event.preventDefault();

		var formData = $(this).serialize();
		$.ajax({
			url: '/user/' + user_id,
			type: 'PUT',
			data: formData,
			success: function (response) {
				reloadData();
				$('#modal-edit_user').modal('hide');
			},
			error: function (error) {
				console.error('Error updating user:', error);
			}
		});
	});

	$('#add_new_user').submit(function (event) {
		event.preventDefault();

		const salt = generateSalt(50);
		var formData = $(this).serialize();
		formData += '&salt=' + salt;

		$.ajax({
			url: '/add_user',
			type: 'POST',
			data: formData,
			// processData: false, 
			// contentType: false,
			success: function (response) {
				reloadData();
				$('#modal-new_user').modal('hide');
				Swal.fire({
					icon: "success",
					title: "Successfully",
					text: "User added successfully."
				});
			},
			error: function (xhr, status, error) {
				var errorMessage = xhr.responseJSON.error;
				if (errorMessage == 'password') {
					Swal.fire({
						icon: "error",
						title: "Oops...",
						text: "Password not match!",
					});
				} else {
					console.error('Error updating user role:', error);
				}
			}
		});
		// }
	});

});

function generateSalt(length) {
	const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let salt = '';
	for (let i = 0; i < length; i++) {
		salt += charset.charAt(Math.floor(Math.random() * charset.length));
	}

	return salt;
}

function edit_user(id, firstname, lastname, username, role) {
	$('#modal-edit_user').modal('show');

	get_user_role_edit(role);

	$('#firstname').val(firstname);
	$('#lastname').val(lastname);
	$('#username').val(username);
	user_id = id;

}

function archive_user(id) {
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
				url: '/user/remove/' + id,
				type: 'PUT',
				success: function (response) {
					window.location.reload();
				},
				error: function (error) {
					console.error('Error deleting user role:', error);
				}
			});
		}
	});
}

function get_user_role() {
	$.ajax({
		url: '/user_role_data',
		method: 'GET',
		success: function (response) {
			var selectOptions = $('#user_role');
			selectOptions.empty();
			response.forEach(function (option) {
				selectOptions.append($('<option>', {
					value: option.IDNo,
					text: option.ROLE
				}));
			});
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

function get_user_role_edit(id) {
	$.ajax({
		url: '/user_role_data',
		method: 'GET',
		success: function (response) {
			var selectOptionsEdit = $('.edit_user_role');
			selectOptionsEdit.empty();
			response.forEach(function (option) {
				var selected = false;
				if (option.IDNo == id) {
					selected = true;
				}
				selectOptionsEdit.append($('<option>', {
					selected: selected,
					value: option.IDNo,
					text: option.ROLE
				}));
			});
		},
		error: function (xhr, status, error) {
			console.error('Error fetching options:', error);
		}
	});
}

function add_user_modal() {
	$('#modal-new_user').modal('show');
	get_user_role();
}