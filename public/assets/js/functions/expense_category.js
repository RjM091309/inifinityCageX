
var expense_category_id;

$(document).ready(function () {
    if ($.fn.DataTable.isDataTable('#expense-category-tbl')) {
        $('#expense-category-tbl').DataTable().destroy();
    }

    var dataTable = $('#expense-category-tbl').DataTable({
        columnDefs: [
            {
              createdCell: function(cell, cellData, rowData, rowIndex, colIndex) {
                  $(cell).addClass('text-center');
              }
            }
        ],
        language: {
            search: (window.expenseCategoryTranslations?.search || "Search:"),
            info: (window.expenseCategoryTranslations?.showing_entries || "Showing _START_ to _END_ of _TOTAL_ entries"),
            paginate: {
                previous: (window.expenseCategoryTranslations?.previous || "Previous"),
                next: (window.expenseCategoryTranslations?.next || "Next")
            }
        }
    });

    function reloadData() {
        $.ajax({
            url: '/expense_category_data',
            method: 'GET',
            success: function (data) {
                dataTable.clear();
                data.forEach(function (row) {
                    var status = '';
                    var activeText = window.expenseCategoryTranslations?.active || 'ACTIVE';
                    var inactiveText = window.expenseCategoryTranslations?.inactive || 'INACTIVE';
                    if (row.ACTIVE == 1) {
                        status = '<span class="css-blue">' + activeText + '</span>';
                    } else {
                        status = '<span class="css-red">' + inactiveText + '</span>';
                    }
                    var btn = `<div class="btn-group">
                        <button type="button" onclick="editCreditStatus(${row.IDNo}, '${row.CATEGORY}')" class="btn btn-sm btn-alt-secondary js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Edit" data-bs-original-title="Edit">
                        <i class="fa fa-pencil-alt"></i>
                        </button>
                        <button type="button" onclick="archive_category(${row.IDNo})" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled"
                        data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">
                        <i class="fa fa-trash-alt"></i>
                        </button>
                    </div>`;

                    dataTable.row.add([row.CATEGORY, status, btn]).draw();
                });
            },
            error: function (xhr, status, error) {
                console.error('Error fetching data:', error);
            }
        });
    }

    reloadData();

    $('#edit_expense_category').submit(function(event) {
        event.preventDefault(); 
  
        var formData = $(this).serialize();
        $.ajax({
            url: '/expense_category/' + expense_category_id,
            type: 'PUT',
            data: formData,
            success: function(response) {
                reloadData();
                $('#modal-edit-expense-category').modal('hide');
            },
            error: function(error) {
                console.error('Error updating user role:', error);
            }
        });
    });
});


function addExpenseCategory() {
    $('#modal-new-expense-category').modal('show');
}

function editCreditStatus(id, category ) {
    $('#modal-edit-expense-category').modal('show');
    $('#txtCategory').val(category);
  
    expense_category_id = id;
}

function archive_category(id){
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
          url: '/expense_category/remove/' + id,
          type: 'PUT',
          success: function(response) {
            window.location.reload();
          },
          error: function(error) {
              console.error('Error deleting category:', error);
          }
      });
      }
  })
}
  
