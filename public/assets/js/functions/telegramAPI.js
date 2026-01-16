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
        const translations = window.telegramAPITranslations || {};
        const checking = translations.checking || 'Checking...';
        const loadingBotDetails = translations.loading_bot_details || 'Loading bot details...';
        const botName = translations.bot_name || 'Bot name:';
        const username = translations.username || 'Username:';
        const openBot = translations.open_bot || 'Open bot';
        const active = translations.active || 'Active';
        const unavailable = translations.unavailable || 'Unavailable';
        const noBotDetails = translations.no_bot_details || 'No bot details found. Save a valid token to load details.';
        const error = translations.error || 'Error';
        const couldNotLoad = translations.could_not_load || 'Could not load bot details. Please verify the token.';

        setBotStatus(checking, 'bg-secondary');
        setBotDetails(`<div class="text-muted">${loadingBotDetails}</div>`, 'alert-secondary');

        $.ajax({
            url: '/telegramAPI/details',
            method: 'GET',
            success: function (data) {
                if (data && data.bot) {
                    const bot = data.bot;
                    const botLink = bot.username ? `https://t.me/${bot.username}` : null;
                    const rows = [
                        `<div><span class="fw-semibold">${botName}</span> ${bot.first_name || '—'}</div>`,
                        `<div><span class="fw-semibold">${username}</span> ${bot.username ? `<a href="${botLink}" target="_blank" rel="noopener">@${bot.username}</a>` : '—'}</div>`,
                        botLink ? `<div class="mt-2"><a class="btn btn-sm btn-outline-primary" href="${botLink}" target="_blank" rel="noopener">${openBot}</a></div>` : ''
                    ];

                    setBotStatus(active, 'bg-success');
                    setBotDetails(rows.join(''), 'alert-success');
                } else {
                    setBotStatus(unavailable, 'bg-secondary');
                    setBotDetails(`<div class="text-muted">${noBotDetails}</div>`, 'alert-secondary');
                }
            },
            error: function () {
                setBotStatus(error, 'bg-danger');
                setBotDetails(`<div class="text-danger">${couldNotLoad}</div>`, 'alert-danger');
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
                const translations = window.telegramAPITranslations || {};
                Swal.fire({
                    title: translations.success || 'Success!',
                    text: translations.updated_successfully || 'Telegram API updated successfully',
                    icon: 'success',
                    confirmButtonText: translations.ok || 'OK'
                }).then(() => {
                    reloadData();
                });
            },
            error: function (error) {
                const translations = window.telegramAPITranslations || {};
                Swal.fire({
                    title: translations.error_title || 'Error!',
                    text: translations.failed_to_update || 'Failed to update Telegram API. Please try again.',
                    icon: 'error',
                    confirmButtonText: translations.ok || 'OK'
                });
                console.error('Error updating Telegram API:', error);
            }
        });
    });

    // Load data on page load
    reloadData();
    loadBotDetails();
});
