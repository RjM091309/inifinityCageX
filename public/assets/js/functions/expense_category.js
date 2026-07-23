
var expense_category_id;
var expenseCategoryRowsCache = [];

function escapeForInline(value) {
    if (value === undefined || value === null) return '';
    return value.toString().replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isExpenseCategorySub(row) {
    var pid = row.PARENT_ID != null ? row.PARENT_ID : row.parent_id;
    return pid != null && String(pid).trim() !== '' && Number(pid) > 0;
}

function getExpenseCategoryMainRows(rows) {
    return (rows || []).filter(function (row) {
        return !isExpenseCategorySub(row);
    });
}

function populateExpenseCategoryParentSelect($select, rows, selectedId, excludeId) {
    if (!$select || !$select.length) return;
    $select.empty();
    $select.append($('<option>', { value: '', text: '-- Select main category --' }));
    getExpenseCategoryMainRows(rows).forEach(function (row) {
        if (excludeId && Number(row.IDNo) === Number(excludeId)) return;
        $select.append(
            $('<option>', {
                value: row.IDNo,
                text: row.CATEGORY,
                selected: selectedId != null && Number(selectedId) === Number(row.IDNo)
            })
        );
    });
}

function toggleNewExpenseCategoryParentField() {
    var isSub = $('input[name="categoryLevel"]:checked').val() === 'sub';
    var $wrap = $('#new-expense-cat-parent-wrap');
    var $parent = $('#new-expense-cat-parent');
    if (isSub) {
        $wrap.removeClass('d-none');
        $parent.prop('required', true);
    } else {
        $wrap.addClass('d-none');
        $parent.prop('required', false).val('');
    }
}

function toggleEditExpenseCategoryParentField() {
    var isSub = $('input[name="editCategoryLevel"]:checked').val() === 'sub';
    var $wrap = $('#edit-expense-cat-parent-wrap');
    var $parent = $('#edit-expense-cat-parent');
    if (isSub) {
        $wrap.removeClass('d-none');
        $parent.prop('required', true);
    } else {
        $wrap.addClass('d-none');
        $parent.prop('required', false).val('');
    }
}

function canAddExpenseCategory() {
    return window.PermissionViewOnly && window.PermissionViewOnly.isExpenseHandler();
}

$(document).ready(function () {
    if (!canAddExpenseCategory()) {
        $('#btn-expense-category-add').addClass('d-none');
    }

    if ($.fn.DataTable.isDataTable('#expense-category-tbl')) {
        $('#expense-category-tbl').DataTable().destroy();
    }

    var dataTable = $('#expense-category-tbl').DataTable({
        columnDefs: [
            {
                createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
                    if (colIndex >= 3) {
                        $(cell).addClass('text-center');
                    }
                }
            }
        ],
        language: {
            search: window.expenseCategoryTranslations?.search || 'Search:',
            info: window.expenseCategoryTranslations?.showing_entries || 'Showing _START_ to _END_ of _TOTAL_ entries',
            paginate: {
                previous: window.expenseCategoryTranslations?.previous || 'Previous',
                next: window.expenseCategoryTranslations?.next || 'Next'
            }
        }
    });

    function reloadData() {
        $.ajax({
            url: '/expense_category_data',
            method: 'GET',
            success: function (data) {
                expenseCategoryRowsCache = data || [];
                populateExpenseCategoryParentSelect($('#new-expense-cat-parent'), expenseCategoryRowsCache);
                dataTable.clear();
                expenseCategoryRowsCache.forEach(function (row) {
                    var activeText = window.expenseCategoryTranslations?.active || 'ACTIVE';
                    var inactiveText = window.expenseCategoryTranslations?.inactive || 'INACTIVE';
                    var status =
                        row.ACTIVE == 1
                            ? '<span class="css-blue">' + activeText + '</span>'
                            : '<span class="css-red">' + inactiveText + '</span>';
                    var isSub = isExpenseCategorySub(row);
                    var levelLabel = isSub ? 'Sub' : 'Main';
                    var parentLabel = isSub ? row.PARENT_CATEGORY || '—' : '—';
                    var displayName = isSub ? '↳ ' + row.CATEGORY : row.CATEGORY;
                    var escapedCategory = escapeForInline(row.CATEGORY);
                    var parentId = row.PARENT_ID != null ? row.PARENT_ID : '';
                    var btn =
                        '<div class="btn-group">' +
                        '<button type="button" onclick="editCreditStatus(' +
                        row.IDNo +
                        ", '" +
                        escapedCategory +
                        "', " +
                        (parentId || 'null') +
                        ')" class="btn btn-sm btn-alt-secondary js-bs-tooltip-enabled" data-bs-toggle="tooltip" aria-label="Edit" data-bs-original-title="Edit">' +
                        '<i class="fa fa-pencil-alt"></i></button>' +
                        '<button type="button" onclick="archive_category(' +
                        row.IDNo +
                        ')" class="btn btn-sm btn-alt-danger js-bs-tooltip-enabled" data-bs-toggle="tooltip" aria-label="Archive" data-bs-original-title="Archive">' +
                        '<i class="fa fa-trash-alt"></i></button>' +
                        '</div>';

                    dataTable.row.add([displayName, levelLabel, parentLabel, status, btn]).draw();
                });
                if (window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly()) {
                    window.PermissionViewOnly.disableForViewOnly('#expense-category-tbl .btn-alt-danger');
                    window.PermissionViewOnly.disableForViewOnly('#expense-category-tbl .btn-alt-secondary');
                }
            },
            error: function (xhr, status, error) {
                console.error('Error fetching data:', error);
            }
        });
    }

    reloadData();

    $(document).on('change', '.js-new-cat-level', toggleNewExpenseCategoryParentField);
    $(document).on('change', '.js-edit-cat-level', toggleEditExpenseCategoryParentField);

    $('#form-new-expense-category').on('submit', function (e) {
        if (!canAddExpenseCategory()) {
            e.preventDefault();
            return;
        }
        if ($('input[name="categoryLevel"]:checked').val() === 'sub' && !$('#new-expense-cat-parent').val()) {
            e.preventDefault();
            alert('Please select a main category for the sub category.');
        }
    });

    $('#edit_expense_category').submit(function (event) {
        event.preventDefault();

        if ($('input[name="editCategoryLevel"]:checked').val() === 'sub' && !$('#edit-expense-cat-parent').val()) {
            alert('Please select a main category for the sub category.');
            return;
        }

        var formData = $(this).serialize();
        $.ajax({
            url: '/expense_category/' + expense_category_id,
            type: 'PUT',
            data: formData,
            success: function () {
                reloadData();
                $('#modal-edit-expense-category').modal('hide');
            },
            error: function (error) {
                console.error('Error updating expense category:', error);
            }
        });
    });
});

function addExpenseCategory() {
    if (!canAddExpenseCategory()) return;
    $('input[name="categoryLevel"][value="main"]').prop('checked', true);
    toggleNewExpenseCategoryParentField();
    populateExpenseCategoryParentSelect($('#new-expense-cat-parent'), expenseCategoryRowsCache);
    $('#form-new-expense-category')[0].reset();
    $('input[name="categoryLevel"][value="main"]').prop('checked', true);
    toggleNewExpenseCategoryParentField();
    $('#modal-new-expense-category').modal('show');
}

function editCreditStatus(id, category, parentId) {
    expense_category_id = id;
    populateExpenseCategoryParentSelect($('#edit-expense-cat-parent'), expenseCategoryRowsCache, parentId, id);
    $('#txtCategory').val(category);
    if (parentId != null && parentId !== '' && Number(parentId) > 0) {
        $('input[name="editCategoryLevel"][value="sub"]').prop('checked', true);
        $('#edit-expense-cat-parent').val(String(parentId));
    } else {
        $('input[name="editCategoryLevel"][value="main"]').prop('checked', true);
        $('#edit-expense-cat-parent').val('');
    }
    toggleEditExpenseCategoryParentField();
    $('#modal-edit-expense-category').modal('show');
}

function archive_category(id) {
    Swal.fire({
        title: 'Are you sure you want to delete this?',
        text: 'Deleting a main category will also archive its sub categories.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes'
    }).then(function (result) {
        if (result.isConfirmed) {
            $.ajax({
                url: '/expense_category/remove/' + id,
                type: 'PUT',
                success: function () {
                    window.location.reload();
                },
                error: function (error) {
                    console.error('Error deleting category:', error);
                }
            });
        }
    });
}
