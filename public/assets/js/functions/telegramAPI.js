var telegramAPI_id;

$(document).ready(function () {
    const $botDetails = $('#bot-details');
    const $botStatus = $('#bot-status');

    function setBotStatus(label, badgeClass) {
        $botStatus
            .removeClass('bg-secondary bg-success bg-danger')
            .addClass(badgeClass)
            .text(label);
    }

    function setBotDetails(html, alertClass) {
        $botDetails
            .removeClass('alert-secondary alert-success alert-danger')
            .addClass(alertClass)
            .html(html);
    }

    function loadBotDetails() {
        setBotStatus('Checking...', 'bg-secondary');
        setBotDetails('<div class="text-muted">Loading bot details...</div>', 'alert-secondary');

        $.ajax({
            url: '/telegramAPI/details',
            method: 'GET',
            success: function (data) {
                if (data && data.bot) {
                    const bot = data.bot;
                    const botLink = bot.username ? `https://t.me/${bot.username}` : null;
                    const rows = [
                        `<div><span class="fw-semibold">Bot name:</span> ${bot.first_name || '—'}</div>`,
                        `<div><span class="fw-semibold">Username:</span> ${bot.username ? `<a href="${botLink}" target="_blank" rel="noopener">@${bot.username}</a>` : '—'}</div>`,
                        botLink ? `<div class="mt-2"><a class="btn btn-sm btn-outline-primary" href="${botLink}" target="_blank" rel="noopener">Open bot</a></div>` : ''
                    ];

                    setBotStatus('Active', 'bg-success');
                    setBotDetails(rows.join(''), 'alert-success');
                } else {
                    setBotStatus('Unavailable', 'bg-secondary');
                    setBotDetails('<div class="text-muted">No bot details found. Save a valid token to load details.</div>', 'alert-secondary');
                }
            },
            error: function () {
                setBotStatus('Error', 'bg-danger');
                setBotDetails('<div class="text-danger">Could not load bot details. Please verify the token.</div>', 'alert-danger');
            }
        });
    }

    function reloadData() {
        $.ajax({
            url: '/telegramAPI_data',
            method: 'GET',
            success: function (data) {
                // Load the first row's TELEGRAM_API into the input field
                if (data && data.length > 0) {
                    const row = data[0];
                    update_telegramAPI(row.IDNo, row.TELEGRAM_API);
                }
                loadBotDetails();
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
                Swal.fire({
                    title: 'Success!',
                    text: 'Telegram API updated successfully',
                    icon: 'success',
                    confirmButtonText: 'OK'
                }).then(() => {
                    reloadData();
                });
            },
            error: function (error) {
                Swal.fire({
                    title: 'Error!',
                    text: 'Failed to update Telegram API. Please try again.',
                    icon: 'error',
                    confirmButtonText: 'OK'
                });
                console.error('Error updating Telegram API:', error);
            }
        });
    });

    // Load data on page load
    reloadData();
    loadBotDetails();
});
