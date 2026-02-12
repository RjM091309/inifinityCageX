// Store data per userType
var botData = {
    GUEST: {
        id: null,
        chatIds: [],
        chatIdEditIndex: null,
        chatDetailsCache: {}
    },
    EMPLOYEE: {
        id: null,
        chatIds: [],
        chatIdEditIndex: null,
        chatDetailsCache: {}
    },
    MANAGEMENT: {
        id: null,
        chatIds: [],
        chatIdEditIndex: null,
        chatDetailsCache: {}
    }
};

var currentModalUserType = null;

$(document).ready(function () {
    const userTypes = ['GUEST', 'EMPLOYEE', 'MANAGEMENT'];

    function setBotStatus(userType, label, badgeClass) {
        const $botStatus = $(`.bot-status[data-user-type="${userType}"]`);
        if ($botStatus.length) {
            $botStatus.removeClass('bg-secondary bg-success bg-danger').addClass(badgeClass).text(label);
        }
    }

    function setBotDetails(userType, html, alertClass) {
        const $botDetails = $(`.bot-details[data-user-type="${userType}"]`);
        if ($botDetails.length) {
            $botDetails.removeClass('alert-secondary alert-success alert-danger').addClass(alertClass).html(html);
        }
    }

    function loadBotDetails(userType) {
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

        setBotStatus(userType, checking, 'bg-secondary');
        setBotDetails(userType, `<div class="text-muted">${loadingBotDetails}</div>`, 'alert-secondary');

        $.ajax({
            url: '/telegramAPI/details/' + userType,
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

                    setBotStatus(userType, active, 'bg-success');
                    setBotDetails(userType, rows.join(''), 'alert-success');
                } else {
                    setBotStatus(userType, unavailable, 'bg-secondary');
                    setBotDetails(userType, `<div class="text-muted">${noBotDetails}</div>`, 'alert-secondary');
                }
            },
            error: function () {
                setBotStatus(userType, error, 'bg-danger');
                setBotDetails(userType, `<div class="text-danger">${couldNotLoad}</div>`, 'alert-danger');
            }
        });
    }

    function loadChatIds(userType) {
        $.ajax({
            url: '/telegramAPI/chat-ids/' + userType,
            method: 'GET',
            success: function (data) {
                botData[userType].chatIds = Array.isArray(data.chatIds) ? data.chatIds : [];
                fetchAllChatDetails(userType, botData[userType].chatIds, botData[userType].chatDetailsCache).then(function() {
                    renderChatIdsTable(userType);
                });
            },
            error: function () {
                botData[userType].chatIds = [];
                renderChatIdsTable(userType);
            }
        });
    }

    function fetchAllChatDetails(userType, chatIds, cache) {
        const promises = chatIds.map(function(chatId) {
            return fetchChatInfo(userType, chatId, cache);
        });
        return Promise.all(promises);
    }

    function renderChatIdsTable(userType) {
        const tbody = $(`.chat-ids-tbody[data-user-type="${userType}"]`);
        const emptyEl = $(`.chat-ids-empty[data-user-type="${userType}"]`);
        const tr = translations();
        const chatIds = botData[userType].chatIds;
        const cache = botData[userType].chatDetailsCache;
        
        if (!chatIds.length) {
            tbody.html('');
            emptyEl.show();
            return;
        }
        emptyEl.hide();
        tbody.html(chatIds.map(function (id, i) {
            const chatInfo = cache[id] || { title: 'Loading...', username: null };
            return '<tr><td class="text-center">' + (i + 1) + '</td><td><code>' + escapeHtml(String(id)) + '</code></td><td>' + formatChatDisplay(chatInfo) + '</td><td class="text-center">' +
                '<button type="button" class="btn btn-sm btn-alt-secondary me-1 btn-edit-chat-id" data-user-type="' + userType + '" data-index="' + i + '" title="' + (tr.edit || 'Edit') + '"><i class="fa fa-pencil-alt"></i></button>' +
                '<button type="button" class="btn btn-sm btn-alt-danger btn-delete-chat-id" data-user-type="' + userType + '" data-index="' + i + '" title="' + (tr.delete || 'Delete') + '"><i class="fa fa-trash"></i></button>' +
                '</td></tr>';
        }).join(''));
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function translations() {
        return window.telegramAPITranslations || {};
    }

    function fetchChatInfo(userType, chatId, cache) {
        return new Promise(function(resolve) {
            if (cache[chatId]) {
                resolve(cache[chatId]);
                return;
            }
            $.ajax({
                url: '/telegramAPI/chat-info/' + userType + '/' + encodeURIComponent(chatId),
                method: 'GET',
                success: function(data) {
                    if (data && data.chat) {
                        const chat = data.chat;
                        const chatInfo = {
                            title: chat.title || chat.first_name || chat.username || '—',
                            username: chat.username || null,
                            type: chat.type || 'unknown'
                        };
                        cache[chatId] = chatInfo;
                        resolve(chatInfo);
                    } else {
                        cache[chatId] = { title: '—', username: null, type: 'unknown' };
                        resolve(cache[chatId]);
                    }
                },
                error: function() {
                    cache[chatId] = { title: '—', username: null, type: 'unknown' };
                    resolve(cache[chatId]);
                }
            });
        });
    }

    function formatChatDisplay(chatInfo) {
        if (!chatInfo) return '<span class="text-muted">—</span>';
        let display = escapeHtml(chatInfo.title || '—');
        if (chatInfo.username) {
            const link = 'https://t.me/' + chatInfo.username;
            display += ' <span class="text-muted">(<a href="' + link + '" target="_blank" rel="noopener">@' + escapeHtml(chatInfo.username) + '</a>)</span>';
        }
        return display;
    }

    function reloadData() {
        $.ajax({
            url: '/telegramAPI_data',
            method: 'GET',
            success: function (data) {
                console.log('Telegram API data loaded:', data);
                if (data && Array.isArray(data)) {
                    data.forEach(function(row) {
                        // Normalize userType to uppercase to match botData keys
                        const userType = (row.USER || 'GUEST').toUpperCase();
                        const inputId = '#telegramAPI-' + userType.toLowerCase();
                        const botIdInputId = '#botId-' + userType.toLowerCase();
                        
                        // Set values regardless of botData check (but still update botData if it exists)
                        if (row.TELEGRAM_API) {
                            $(inputId).val(row.TELEGRAM_API);
                            console.log('Set token for', userType, ':', row.TELEGRAM_API.substring(0, 20) + '...');
                        }
                        
                        if (row.IDNo) {
                            $(botIdInputId).val(row.IDNo);
                        }
                        
                        // Update botData if userType exists
                        if (botData[userType]) {
                            botData[userType].id = row.IDNo;
                        } else {
                            console.warn('Unknown userType:', userType, 'Expected one of:', Object.keys(botData));
                        }
                    });
                } else {
                    console.warn('Invalid data format received:', data);
                }
                // Load bot details and chat IDs for all user types
                userTypes.forEach(function(userType) {
                    loadBotDetails(userType);
                    loadChatIds(userType);
                });
            },
            error: function (xhr, status, error) {
                console.error('Error fetching Telegram API data:', error, xhr);
            }
        });
    }

    // Form submission handlers for each bot
    $('.update-telegram-api-form').submit(function (event) {
        event.preventDefault();
        const userType = $(this).data('user-type') || 'GUEST';
        const txtTelegramAPI = $(this).find('[name="txtTelegramAPI"]').val();
        const botId = $('#botId-' + userType.toLowerCase()).val();

        $.ajax({
            url: '/telegramAPI/' + userType,
            type: 'PUT',
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            data: {
                txtTelegramAPI: txtTelegramAPI ? txtTelegramAPI.trim() : ''
            },
            success: function (response) {
                const translations = window.telegramAPITranslations || {};
                Swal.fire({
                    title: translations.success || 'Success!',
                    text: translations.updated_successfully || 'Telegram API updated successfully',
                    icon: 'success',
                    confirmButtonText: translations.ok || 'OK'
                }).then(() => {
                    // Reload all data to ensure UI is in sync with database
                    reloadData();
                });
            },
            error: function (xhr) {
                const translations = window.telegramAPITranslations || {};
                let errorMessage = translations.failed_to_update || 'Failed to update Telegram API. Please try again.';
                
                // Try to get more specific error message from response
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMessage = xhr.responseJSON.error;
                } else if (xhr.responseText) {
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        if (errorData.error) {
                            errorMessage = errorData.error;
                        }
                    } catch (e) {
                        // If not JSON, use responseText as is
                        if (xhr.responseText) {
                            errorMessage = xhr.responseText;
                        }
                    }
                }
                
                Swal.fire({
                    title: translations.error_title || 'Error!',
                    text: errorMessage,
                    icon: 'error',
                    confirmButtonText: translations.ok || 'OK'
                });
                console.error('Error updating Telegram API:', xhr);
            }
        });
    });

    // Chat IDs: Add button handlers
    $('.btn-add-chat-id').on('click', function () {
        const userType = $(this).data('user-type') || 'GUEST';
        botData[userType].chatIdEditIndex = null;
        currentModalUserType = userType;
        $('#modal-chat-id-label').text(translations().add_chat_id || 'Add Chat ID');
        $('#input-chat-id').val('');
        $('#modal-chat-id-user-type').val(userType);
        var modalEl = document.getElementById('modal-chat-id');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            new bootstrap.Modal(modalEl).show();
        } else {
            $(modalEl).modal('show');
        }
    });

    $('#btn-save-chat-id').on('click', function () {
        const userType = $('#modal-chat-id-user-type').val() || 'GUEST';
        const val = ($('#input-chat-id').val() || '').trim();
        if (!val) {
            Swal.fire({ title: translations().error_title || 'Error', text: translations().enter_chat_id || 'Enter a Chat ID.', icon: 'warning' });
            return;
        }
        
        const data = botData[userType];
        if (data.chatIdEditIndex === null) {
            data.chatIds.push(val);
        } else {
            const oldChatId = data.chatIds[data.chatIdEditIndex];
            data.chatIds[data.chatIdEditIndex] = val;
            if (oldChatId !== val) {
                delete data.chatDetailsCache[oldChatId];
            }
            delete data.chatDetailsCache[val];
        }
        
        $.ajax({
            url: '/telegramAPI/chat-ids/' + userType,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ chatIds: data.chatIds }),
            success: function () {
                var modalEl = document.getElementById('modal-chat-id');
                if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    bootstrap.Modal.getInstance(modalEl).hide();
                } else {
                    $(modalEl).modal('hide');
                }
                Swal.fire({ title: translations().success || 'Success', text: translations().saved || 'Saved.', icon: 'success' });
                loadChatIds(userType);
            },
            error: function () {
                Swal.fire({ title: translations().error_title || 'Error', text: translations().failed_to_update || 'Failed to save.', icon: 'error' });
            }
        });
    });

    // Chat IDs: Edit / Delete (delegate)
    $(document).on('click', '.btn-edit-chat-id', function () {
        const userType = $(this).data('user-type') || 'GUEST';
        const i = parseInt($(this).data('index'), 10);
        const data = botData[userType];
        if (isNaN(i) || i < 0 || i >= data.chatIds.length) return;
        
        data.chatIdEditIndex = i;
        currentModalUserType = userType;
        $('#modal-chat-id-label').text(translations().edit_chat_id || 'Edit Chat ID');
        $('#input-chat-id').val(data.chatIds[i]);
        $('#modal-chat-id-user-type').val(userType);
        var modalEl = document.getElementById('modal-chat-id');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            new bootstrap.Modal(modalEl).show();
        } else {
            $(modalEl).modal('show');
        }
    });

    $(document).on('click', '.btn-delete-chat-id', function () {
        const userType = $(this).data('user-type') || 'GUEST';
        const i = parseInt($(this).data('index'), 10);
        const data = botData[userType];
        if (isNaN(i) || i < 0 || i >= data.chatIds.length) return;
        
        const tr = translations();
        Swal.fire({
            title: tr.delete_chat_id || 'Delete Chat ID?',
            text: tr.delete_chat_id_confirm || 'This chat will no longer receive notifications.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: tr.delete || 'Delete',
            cancelButtonText: tr.cancel || 'Cancel'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            data.chatIds.splice(i, 1);
            $.ajax({
                url: '/telegramAPI/chat-ids/' + userType,
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ chatIds: data.chatIds }),
                success: function () {
                    Swal.fire({ title: tr.success || 'Success', text: tr.deleted || 'Deleted.', icon: 'success' });
                    loadChatIds(userType);
                },
                error: function () {
                    Swal.fire({ title: tr.error_title || 'Error', text: tr.failed_to_update || 'Failed to delete.', icon: 'error' });
                }
            });
        });
    });

    // Load data on page load
    reloadData();
});
