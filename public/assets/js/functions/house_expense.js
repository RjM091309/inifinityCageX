// ============== FRONTEND (house_expense.js) =======================
var expense_id;

$(document).ready(function () {

    function initializeExpenseTable() {

        // 1. Set up Flatpickr
        const defaultDates = [
            moment().startOf('month').format('YYYY-MM-DD'),
            moment().format('YYYY-MM-DD')
        ];
        const fp = flatpickr("#daterange", {
            mode: "range",
            altInput: true,
            altFormat: "M d, Y",
            dateFormat: "Y-m-d",
            defaultDate: defaultDates,
            showMonths: 2,
            onReady: function (selectedDates, dateStr, instance) {
                instance.setDate(defaultDates, true);
                instance.changeMonth(-1, true);
                if (typeof reloadData === 'function') {
                    reloadData();
                }
            },
            onChange: function (selectedDates, dateStr, instance) {
                if (typeof reloadData === 'function') {
                    reloadData();
                }
            },
        });

        // 2. Initialize DataTable
        if ($.fn.DataTable.isDataTable('#expense-tbl')) {
            $('#expense-tbl').DataTable().destroy();
        }

        const goodsTypeLabel = window.houseExpenseTranslations?.type_goods || 'Goods / Consumables';
        const nonGoodsTypeLabel = window.houseExpenseTranslations?.type_non_goods || 'Non-goods / Services';
        var dataTable = $('#expense-tbl').DataTable({
            "order": [[6, 'desc']],
            "columnDefs": [
                {
                    "targets": 6,
                    "render": function (data, type, row) {
                        if (type === 'sort') {
                            return moment.utc(data, 'MMMM DD, YYYY HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
                        }
                        const dateMoment = moment(data, 'MMMM DD, YYYY HH:mm:ss');
                        return dateMoment.isValid() ? dateMoment.local().format('DD MMM, YYYY HH:mm:ss') : (window.houseExpenseTranslations?.invalid_date || 'Invalid Date');
                    },
                    "createdCell": function (cell, cellData, rowData, rowIndex, colIndex) {
                        $(cell).addClass('text-center');
                    }
                }
            ],
            "info": true,
            "language": {
                "search": (window.houseExpenseTranslations?.search || "Search:"),
                "info": (window.houseExpenseTranslations?.showing_entries || "Showing _START_ to _END_ of _TOTAL_ entries"),
                "paginate": {
                    "previous": (window.houseExpenseTranslations?.previous || "Previous"),
                    "next": (window.houseExpenseTranslations?.next || "Next")
                },
                "emptyTable": (window.houseExpenseTranslations?.no_data_found || "No data found")
            }
        });

        // 3. reloadData function
        function reloadData() {
            const dateRange = $('#daterange').val();

		if (!dateRange) {
			alert(window.houseExpenseTranslations?.please_select_date_range || 'Please select a date range.');
			return;
		}
	
		// Kung may " to " ang dateRange, hatiin ito, kung wala, ituring itong single date
		let start, end;
		if (dateRange.indexOf(" to ") > -1) {
			[start, end] = dateRange.split(' to ');
		} else {
			start = dateRange;
			end = dateRange;
		}

            console.log('Client side dateRange => start:', start, 'end:', end);

            $.ajax({
                url: '/junket_house_expense_data',
                method: 'GET',
                data: { fromDate: start, toDate: end },
                success: function (data) {
                    console.log("Returned data:", data);
                    dataTable.clear();
                    var total_expense = 0;

                    if (data.length === 0) {
                        // Put "No data found" in the first column to avoid "Invalid Date"
                        const noDataText = window.houseExpenseTranslations?.no_data_found || 'No data found';
                        dataTable.row.add([
                            noDataText, '', '', '', '', '', '', ''
                        ]).draw();
                        $('#GRAND_TOTAL_AMOUNT').text(`₱0.00`);
                        return;
                    }

                    data.forEach(function (row) {
                        const amount = parseFloat(row.AMOUNT) || 0; // 🛡️ Ensure valid number
                        total_expense += amount;
                    
                        const permissions = parseInt($('#user-role').data('permissions'));
                        let btn = '';
                        if (permissions !== 2) {
                            btn = `
                                <div class="btn-group">
                                    <button type="button" class="btn btn-sm btn-alt-secondary"
                                            onclick="viewReceipt('${row.photoUrl}')"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-secondary"
                                            onclick="edit_expense(${row.expense_id}, '${row.expense_category_id}', '${row.RECEIPT_NO}', '${row.DATE_TIME || row.ENCODED_DT}', '${row.DESCRIPTION}', '${amount}', '${row.OIC}')"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                        <i class="fa fa-pencil-alt"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-secondary"
                                            onclick="downloadReceipt('${row.photoUrl}')"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                        <i class="fa fa-download"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-danger"
                                            onclick="archive_expense(${row.expense_id})"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                        <i class="fa fa-trash-alt"></i>
                                    </button>
                                </div>`;
                        } else {
                            btn = `
                                <div class="btn-group">
                                    <button type="button" class="btn btn-sm btn-primary"
                                            onclick="viewReceipt('${row.photoUrl}')"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-secondary" disabled
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                        <i class="fa fa-pencil-alt"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-secondary"
                                            onclick="downloadReceipt('${row.photoUrl}')"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                        <i class="fa fa-download"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-danger" disabled
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                        <i class="fa fa-trash-alt"></i>
                                    </button>
                                </div>`;
                        }
                    
                    const formattedDate = moment.utc(row.ENCODED_DT).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
                    const typeValue = parseInt(row.expense_type, 10);
                    const expenseTypeLabel = (typeValue === 2)
                        ? nonGoodsTypeLabel
                        : goodsTypeLabel;
                        dataTable.row.add([
                            row.expense_category,
                        expenseTypeLabel,
                            row.RECEIPT_NO,
                            row.DESCRIPTION,
                            amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
                            row.FIRSTNAME,
                            formattedDate,
                            btn
                        ]).draw();
                    });
                    
                    $('#GRAND_TOTAL_AMOUNT').text(`₱${total_expense.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
                    

                },
                error: function (xhr, status, error) {
                    console.error('Error fetching data:', error);
                }
            });
        }

        // Expose reloadData if needed
        window.reloadData = reloadData;

        // 4. Initial load
        reloadData();
    }

    // 5. Initialize DataTable and load initial data
    initializeExpenseTable();


    // Utility functions for receipt actions
    window.viewReceipt = function (photoUrl) {
        if (!photoUrl || photoUrl.trim() === "" || photoUrl === "null") {
        Swal.fire({
            icon: 'warning',
            title: window.houseExpenseTranslations?.no_receipt_uploaded || 'No Receipt Uploaded',
            text: window.houseExpenseTranslations?.no_receipt_available || 'There is no receipt available to view.',
            confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
        });
            return;
        }
        Swal.fire({
            title: '',
            imageUrl: photoUrl,
            imageAlt: window.houseExpenseTranslations?.receipt_image || 'Receipt Image',
            showCloseButton: true,
            showConfirmButton: false,
            width: 'auto',
            padding: '1rem',
            background: '#fff'
        });
    };

    window.downloadReceipt = function (photoUrl) {
        var a = document.createElement('a');
        a.href = photoUrl;
        a.download = photoUrl.substring(photoUrl.lastIndexOf('/') + 1);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };


    // Kapag sine-submit ang form para sa pag-edit
    $('#edit_junket_house_expense').submit(function (event) {
        event.preventDefault();

        const $btn = $('#btn-save-edit-expense');
        const originalHtml = $btn.html();

        // Show loading spinner on button
        $btn.prop('disabled', true).html(`
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        ${window.houseExpenseTranslations?.saving || 'Saving'}...
    `);

        const formData = new FormData(this);

        $.ajax({
            url: '/junket_house_expense/' + expense_id,
            type: 'PUT',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                Swal.fire({
                    icon: 'success',
                    title: window.houseExpenseTranslations?.updated_successfully || 'Updated successfully!',
                    text: window.houseExpenseTranslations?.expense_updated || 'House expense has been updated.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK',
                    allowOutsideClick: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        $('#modal-edit-house-expense').modal('hide');
                        window.location.reload(); // 🔁 Full page refresh after confirm
                    }
                });
            },
            error: function (error) {
                console.error('Error updating house expense:', error);
                Swal.fire({
                    icon: 'error',
                    title: window.houseExpenseTranslations?.error || 'Error!',
                    text: window.houseExpenseTranslations?.error_updating_expense || 'There was an error updating the expense.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
                });
            },
            complete: function () {
                // Reset button after request finishes
                $btn.prop('disabled', false).html(originalHtml);
            }
        });
    });
});


function addHouseExpense() {
    $('#modal-new-house-expense').modal('show');

    expense_category();
    get_agent();
}


function edit_expense(id, category_id, receipt_no, datetimeval, description, amount, oic) {
    $('#modal-edit-house-expense').modal('show');
    $('#txtCategory').val(category_id);
    $('#txtReceiptNo').val(receipt_no);

    // ✅ Sanitize and format datetime properly
    let formattedDate = '';
    if (datetimeval) {
        const parsedDate = moment(datetimeval, ['YYYY-MM-DD HH:mm:ss', 'MMMM DD, YYYY HH:mm:ss', moment.ISO_8601], true);
        if (parsedDate.isValid()) {
            formattedDate = parsedDate.format('YYYY-MM-DD');
        } else {
            console.warn("Invalid datetime value:", datetimeval);
            formattedDate = '';
        }
    } else {
        console.warn("datetimeval is null or empty.");
    }

    $('#txtDateandTime').val(formattedDate);
    $('#txtDescription').val(description);
    $('#txtAmount').val(amount);
    // $('#txtOfficerInCharge').val(oic);

    expense_id = id;

    edit_expense_category(category_id);
    // edit_get_agent(oic);
}


function archive_expense(id) {
    Swal.fire({
        title: window.houseExpenseTranslations?.delete_confirmation || 'Are you sure you want to delete this?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: window.houseExpenseTranslations?.yes || 'Yes'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: '/junket_house_expense/remove/' + id,
                type: 'PUT',
                success: function (response) {
                    window.location.reload();
                },
                error: function (error) {
                    console.error('Error deleting junket:', error);
                }
            });
        }
    })
}

function expense_category() {
    $.ajax({
        url: '/expense_category_data',
        method: 'GET',
        success: function (response) {
            var selectOptions = $('#txtCategory');
            selectOptions.empty();
            selectOptions.append($('<option>', {
                value: '',
                text: window.houseExpenseTranslations?.select_expense_category || '--SELECT EXPENSE CATEGORY--'
            }));
            response.forEach(function (option) {
                selectOptions.append($('<option>', {
                    value: option.IDNo,
                    text: option.CATEGORY
                }));
            });
        },
        error: function (xhr, status, error) {
            console.error('Error fetching options:', error);
        }
    });
}

function get_agent() {
    $.ajax({
        url: '/users',
        method: 'GET',
        success: function (response) {
            var selectOptions = $('#oic');
            selectOptions.empty();
            selectOptions.append($('<option>', {
                value: '',
                text: window.houseExpenseTranslations?.select_officer_in_charge || '--SELECT OFFICER IN CHARGE--'
            }));
            response.forEach(function (option) {
                selectOptions.append($('<option>', {
                    value: option.user_id,
                    text: option.FIRSTNAME + ' ' + option.LASTNAME
                }));
            });
        },
        error: function (xhr, status, error) {
            console.error('Error fetching options:', error);
        }
    });
}

function edit_expense_category(id) {
    $.ajax({
        url: '/expense_category_data',
        method: 'GET',
        success: function (response) {
            var selectOptions = $('.txtCategory');
            selectOptions.empty();
            selectOptions.append($('<option>', {
                selected: false,
                value: '',
                text: window.houseExpenseTranslations?.select_expense_category || '--SELECT EXPENSE CATEGORY--',
                disabled: true // Disable the default option
            }));
            response.forEach(function (option) {
                var selected = false;
                if (option.IDNo == id) {
                    selected = true;
                }
                selectOptions.append($('<option>', {
                    selected: selected,
                    value: option.IDNo,
                    text: option.CATEGORY
                }));
            });
        },
        error: function (xhr, status, error) {
            console.error('Error fetching options:', error);
        }
    });
}

$(document).ready(function () {
    $("input[data-type='number']").keyup(function (event) {
        // skip for arrow keys
        if (event.which >= 37 && event.which <= 40) {
            event.preventDefault();
        }
        var $this = $(this);
        var num = $this.val().replace(/,/gi, "");
        var num2 = num.split(/(?=(?:\d{3})+$)/).join(",");
        $this.val(num2);
    });
})

function onlyNumberKey(evt) {

    let ASCIICode = (evt.which) ? evt.which : evt.keyCode
    if (ASCIICode > 31 && (ASCIICode < 48 || ASCIICode > 57))
        return false;
    return true;
}