var telegramAPI_id;

$(document).ready(function () {
    if ($.fn.DataTable.isDataTable('#dataTable')) {
        $('#dataTable').DataTable().destroy();
    }

    var dataTable = $('#dataTable').DataTable({
        columnDefs: [{
            createdCell: function (cell, cellData, rowData, rowIndex, colIndex) {
                $(cell).addClass('text-center');
            }
        }]
    });

    function reloadData() {
        $.ajax({
            url: '/telegramAPI_data',
            method: 'GET',
            success: function (data) {
                dataTable.clear();
                data.forEach(function (row) {
                    // Assuming you have only one row in the result
                    var status = '';
                    if (row.ACTIVE === 1) {
                        status = '<span class="badge bg-info" style="font-size:10px !important;">ACTIVE</span>';
                    } else {
                        status = '<span class="badge bg-danger" style="font-size:10px !important;">INACTIVE</span>';
                    }

                    // Assuming you want to load the first row's TELEGRAM_API into the input field
                    if (data.length > 0) {
                        update_telegramAPI(row.IDNo, row.TELEGRAM_API);
                    }
                });
            },
            error: function (xhr, status, error) {
                console.error('Error fetching data:', error);
            }
        });
    }

    function update_telegramAPI(id, telegramAPI) {
        telegramAPI_id = id;
        $('#telegramAPI').val(telegramAPI);
    }

    $('#update_telegramAPI').submit(function (event) {
        event.preventDefault();

        var formData = $(this).serialize();
        $.ajax({
            url: '/telegramAPI/' + telegramAPI_id,
            type: 'PUT',
            data: formData,
            success: function (response) {
                alert('Telegram API updated successfully');
                reloadData();
            },
            error: function (error) {
                console.error('Error updating Telegram API:', error);
            }
        });
    });

    // Load data on page load
    reloadData();
});
